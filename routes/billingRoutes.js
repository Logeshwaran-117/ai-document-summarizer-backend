const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const Razorpay = require('razorpay');
const User     = require('../models/User');
const Payment  = require('../models/Payment');
const { PLANS, checkLimit } = require('../config/plans');

// ── Razorpay instance ────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret',
});

// ── Auth guard ───────────────────────────────────────────────────────────────
function auth(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  next();
}

// ── GET /api/billing/plans ────────────────────────────────────────────────────
router.get('/plans', (req, res) => res.json(PLANS));

// ── GET /api/billing/status ───────────────────────────────────────────────────
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const plan = user.plan || 'free';
    const sub  = user.subscription || {};
    const planConfig = PLANS[plan];

    const summarizeResult = checkLimit(user, 'summarize');
    const tableResult     = checkLimit(user, 'tables');

    let periodEnd = sub.currentPeriodEnd;
    if (!periodEnd) {
      const base = sub.usageResetAt || user.createdAt || new Date();
      periodEnd  = new Date(base);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Last invoice
    const lastPayment = await Payment.findOne({ userId: user._id, status: 'paid' })
      .sort({ paidAt: -1 });

    res.json({
      plan,
      planName:           planConfig.name,
      billingCycle:       sub.billingCycle || 'monthly',
      subscriptionStatus: sub.status || 'active',
      currentPeriodStart: sub.currentPeriodStart || user.createdAt,
      currentPeriodEnd:   periodEnd,
      usage: {
        summarize: { used: summarizeResult.used, limit: summarizeResult.limit, remaining: summarizeResult.remaining },
        tables:    { used: tableResult.used,     limit: tableResult.limit,     remaining: tableResult.remaining     },
      },
      price:       planConfig.price,
      features:    planConfig.features,
      lastInvoice: lastPayment ? {
        invoiceNumber: lastPayment.invoiceNumber,
        amount:        lastPayment.amount / 100,
        paidAt:        lastPayment.paidAt,
        plan:          lastPayment.plan,
        billingCycle:  lastPayment.billingCycle,
      } : null,
    });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch billing status' });
  }
});

// ── GET /api/billing/invoices ─────────────────────────────────────────────────
router.get('/invoices', auth, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user._id, status: 'paid' })
      .sort({ paidAt: -1 })
      .limit(20);
    res.json(payments.map(p => ({
      id:            p._id,
      invoiceNumber: p.invoiceNumber,
      plan:          p.plan,
      billingCycle:  p.billingCycle,
      amount:        p.amount / 100,
      currency:      p.currency,
      status:        p.status,
      paidAt:        p.paidAt,
      razorpayPaymentId: p.razorpayPaymentId,
    })));
  } catch(err) {
    res.status(500).json({ message: 'Failed to fetch invoices' });
  }
});

// ── POST /api/billing/create-order ───────────────────────────────────────────
// Step 1: create Razorpay order, return order_id to frontend
router.post('/create-order', auth, async (req, res) => {
  try {
    const { plan, billingCycle } = req.body;
    if (!PLANS[plan] || plan === 'free') return res.status(400).json({ message: 'Invalid plan' });
    if (!['monthly', 'yearly'].includes(billingCycle)) return res.status(400).json({ message: 'Invalid billing cycle' });

    const priceINR  = PLANS[plan].price[billingCycle];
    const amountPaise = priceINR * 100; // Razorpay uses paise

    const user = await User.findById(req.user._id);

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `rcpt_${Date.now()}`,
      notes: {
        userId:       user._id.toString(),
        userEmail:    user.email,
        plan,
        billingCycle,
      },
    });

    // Save pending payment record
    await Payment.create({
      userId:          user._id,
      razorpayOrderId: order.id,
      plan,
      billingCycle,
      amount:          amountPaise,
      status:          'created',
      notes:           order.notes,
    });

    res.json({
      orderId:       order.id,
      amount:        amountPaise,
      currency:      'INR',
      keyId:         process.env.RAZORPAY_KEY_ID,
      userName:      user.name || '',
      userEmail:     user.email || '',
      planName:      PLANS[plan].name,
      billingCycle,
    });
  } catch(err) {
    console.error('Razorpay order error:', err);
    res.status(500).json({ message: 'Failed to create payment order', detail: err.message });
  }
});

// ── POST /api/billing/verify-payment ─────────────────────────────────────────
// Step 2: after Razorpay success callback, verify signature and activate plan
router.post('/verify-payment', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Signature verification
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { status: 'failed' }
      );
      return res.status(400).json({ success: false, message: 'Payment verification failed. Signature mismatch.' });
    }

    // Find the payment record
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) return res.status(404).json({ success: false, message: 'Order not found' });

    // Mark payment as paid
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = 'paid';
    await payment.save(); // triggers invoiceNumber generation

    // Activate plan on user
    const now       = new Date();
    const periodEnd = new Date(now);
    if (payment.billingCycle === 'monthly') periodEnd.setMonth(periodEnd.getMonth() + 1);
    else periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    await User.findByIdAndUpdate(payment.userId, {
      plan: payment.plan,
      'subscription.plan':               payment.plan,
      'subscription.billingCycle':       payment.billingCycle,
      'subscription.status':             'active',
      'subscription.startDate':          now,
      'subscription.currentPeriodStart': now,
      'subscription.currentPeriodEnd':   periodEnd,
      'subscription.summarizeCount':     0,
      'subscription.tableCount':         0,
      'subscription.usageResetAt':       now,
      'subscription.cancelledAt':        null,
    });

    res.json({
      success: true,
      message: `Payment successful! Welcome to ${PLANS[payment.plan].name}.`,
      plan:    payment.plan,
      invoiceNumber: payment.invoiceNumber,
      periodEnd,
    });
  } catch(err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ success: false, message: 'Verification failed', detail: err.message });
  }
});

// ── POST /api/billing/webhook ─────────────────────────────────────────────────
// Razorpay webhook for async events (payment.captured, payment.failed, etc.)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-razorpay-signature'];
      const expected  = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.body)
        .digest('hex');
      if (expected !== signature) {
        return res.status(400).json({ message: 'Invalid webhook signature' });
      }
    }

    const event   = JSON.parse(req.body);
    const payload = event.payload?.payment?.entity;

    if (event.event === 'payment.captured' && payload) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: payload.order_id },
        { razorpayPaymentId: payload.id, status: 'paid', paidAt: new Date() }
      );
    }

    if (event.event === 'payment.failed' && payload) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: payload.order_id },
        { status: 'failed' }
      );
    }

    res.json({ received: true });
  } catch(err) {
    console.error('Webhook error:', err);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

// ── POST /api/billing/cancel ──────────────────────────────────────────────────
router.post('/cancel', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      'subscription.status':      'cancelled',
      'subscription.cancelledAt': new Date(),
    });
    res.json({ success: true, message: 'Subscription cancelled. Access continues until period end.' });
  } catch(err) {
    res.status(500).json({ message: 'Cancellation failed' });
  }
});

// ── POST /api/billing/downgrade ───────────────────────────────────────────────
router.post('/downgrade', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      plan: 'free',
      'subscription.plan':             'free',
      'subscription.status':           'active',
      'subscription.billingCycle':     'monthly',
      'subscription.currentPeriodEnd': null,
      'subscription.cancelledAt':      null,
      'subscription.summarizeCount':   0,
      'subscription.tableCount':       0,
      'subscription.usageResetAt':     new Date(),
    });
    res.json({ success: true, message: 'Downgraded to Free plan.' });
  } catch(err) {
    res.status(500).json({ message: 'Downgrade failed' });
  }
});

// ── GET /api/billing/invoice/:id/download ────────────────────────────────────
// Returns invoice data as JSON (frontend renders it as PDF or printable page)
router.get('/invoice/:id', auth, async (req, res) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, userId: req.user._id, status: 'paid' });
    if (!payment) return res.status(404).json({ message: 'Invoice not found' });

    const user = await User.findById(req.user._id).select('name email');
    const plan = PLANS[payment.plan];

    res.json({
      invoiceNumber:     payment.invoiceNumber,
      issuedTo:          { name: user.name, email: user.email },
      issuedAt:          payment.paidAt,
      plan:              plan.name,
      billingCycle:      payment.billingCycle,
      amount:            payment.amount / 100,
      currency:          payment.currency,
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpayOrderId:   payment.razorpayOrderId,
      items: [{
        description: `${plan.name} Plan — ${payment.billingCycle === 'monthly' ? '1 Month' : '1 Year'}`,
        quantity:    1,
        unitPrice:   payment.amount / 100,
        total:       payment.amount / 100,
      }],
      subtotal: payment.amount / 100,
      gst:      Math.round((payment.amount / 100) * 0.18 * 100) / 100,
      total:    Math.round((payment.amount / 100) * 1.18 * 100) / 100,
    });
  } catch(err) {
    res.status(500).json({ message: 'Failed to fetch invoice' });
  }
});

// ── Admin: GET /api/billing/admin/all-payments ────────────────────────────────
router.get('/admin/all-payments', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  try {
    const payments = await Payment.find({ status: 'paid' })
      .populate('userId', 'name email plan')
      .sort({ paidAt: -1 })
      .limit(100);
    const total = await Payment.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    res.json({
      payments: payments.map(p => ({
        id:            p._id,
        invoiceNumber: p.invoiceNumber,
        user:          p.userId,
        plan:          p.plan,
        billingCycle:  p.billingCycle,
        amount:        p.amount / 100,
        paidAt:        p.paidAt,
        razorpayPaymentId: p.razorpayPaymentId,
      })),
      totalRevenue: (total[0]?.total || 0) / 100,
    });
  } catch(err) {
    res.status(500).json({ message: 'Failed' });
  }
});

module.exports = router;
