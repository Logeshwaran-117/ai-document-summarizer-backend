const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const User     = require('../models/User');
const Payment  = require('../models/Payment');
const { PLANS, checkLimit } = require('../config/plans');
const { sendPaymentConfirmationEmail } = require('../services/emailService');

// ── Cashfree instance ─────────────────────────────────────────────────────────
Cashfree.XClientId     = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment  = process.env.CASHFREE_ENV === 'PRODUCTION'
  ? CFEnvironment.PRODUCTION
  : CFEnvironment.SANDBOX;
const cf = new Cashfree(); 

// ── Auth guard ────────────────────────────────────────────────────────────────
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

    if (summarizeResult.needsReset || tableResult.needsReset) {
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'subscription.usageResetAt':   new Date(),
          'subscription.summarizeCount': 0,
          'subscription.tableCount':     0,
        },
      });
    }

    let periodEnd = sub.currentPeriodEnd;
    if (!periodEnd) {
      const base = sub.usageResetAt || user.createdAt || new Date();
      periodEnd  = new Date(base);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const lastPayment = await Payment.findOne({ userId: user._id, status: 'paid' })
      .sort({ paidAt: -1 });

    const tomorrowMidnight = new Date();
    tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);
    tomorrowMidnight.setHours(0, 0, 0, 0);

    res.json({
      plan,
      planName:           planConfig.name,
      billingCycle:       sub.billingCycle || 'monthly',
      subscriptionStatus: sub.status || 'active',
      currentPeriodStart: sub.currentPeriodStart || user.createdAt,
      currentPeriodEnd:   periodEnd,
      dailyResetAt:       tomorrowMidnight,
      usage: {
        summarize: { used: summarizeResult.used, limit: summarizeResult.limit, remaining: summarizeResult.remaining, resetDate: tomorrowMidnight },
        tables:    { used: tableResult.used,     limit: tableResult.limit,     remaining: tableResult.remaining,     resetDate: tomorrowMidnight },
        banking:   { used: sub.bankingCount || 0, limit: -1, remaining: Infinity, resetDate: tomorrowMidnight },
      },
      price:       planConfig.price,
      features:    planConfig.features,
      lastInvoice: lastPayment ? {
        invoiceNumber:     lastPayment.invoiceNumber,
        amount:            lastPayment.amount,
        paidAt:            lastPayment.paidAt,
        plan:              lastPayment.plan,
        billingCycle:      lastPayment.billingCycle,
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
      id:                  p._id,
      invoiceNumber:       p.invoiceNumber,
      plan:                p.plan,
      billingCycle:        p.billingCycle,
      amount:              p.amount,           // already in rupees
      currency:            p.currency,
      status:              p.status,
      paidAt:              p.paidAt,
      cashfreePaymentId:   p.cashfreePaymentId,
      cashfreeOrderId:     p.cashfreeOrderId,
    })));
  } catch(err) {
    res.status(500).json({ message: 'Failed to fetch invoices' });
  }
});

// ── POST /api/billing/create-order ───────────────────────────────────────────
// Step 1: create Cashfree order, return payment_session_id to frontend
router.post('/create-order', auth, async (req, res) => {
  try {
    const { plan, billingCycle } = req.body;
    if (!PLANS[plan] || plan === 'free')
      return res.status(400).json({ message: 'Invalid plan' });
    if (!['monthly', 'yearly'].includes(billingCycle))
      return res.status(400).json({ message: 'Invalid billing cycle' });

    const user       = await User.findById(req.user._id);
    const priceINR   = PLANS[plan].price[billingCycle];  // e.g. 499
    const orderId    = `order_${Date.now()}_${user._id.toString().slice(-6)}`;

    const orderRequest = {
      order_id:       orderId,
      order_amount:   priceINR,           // Cashfree uses rupees directly
      order_currency: 'INR',
      order_note:     `${PLANS[plan].name} - ${billingCycle}`,
      customer_details: {
        customer_id:    user._id.toString(),
        customer_name:  user.name  || 'User',
        customer_email: user.email || '',
        customer_phone: user.phone || '9999999999',  // Cashfree requires phone
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/pricing?order_id={order_id}`,
        notify_url: `${process.env.BACKEND_URL}/api/billing/webhook`,
      },
      order_tags: {
        userId:       user._id.toString(),
        plan,
        billingCycle,
      },
    };

    const response = await cf.PGCreateOrder(orderRequest);;
    const cfOrder  = response.data;

    // Save pending payment record
    const payment = await Payment.create({
      userId:            user._id,
      cashfreeOrderId:   cfOrder.order_id,
      paymentSessionId:  cfOrder.payment_session_id,
      plan,
      billingCycle,
      amount:            priceINR,   // rupees
      status:            'created',
      notes:             { plan, billingCycle, userEmail: user.email },
    });

    res.json({
      orderId:          cfOrder.order_id,
      paymentSessionId: cfOrder.payment_session_id,
      amount:           priceINR,
      currency:         'INR',
      planName:         PLANS[plan].name,
      billingCycle,
      userName:         user.name  || '',
      userEmail:        user.email || '',
    });
  } catch(err) {
    console.error('Cashfree order error:', err?.response?.data || err);
    res.status(500).json({ message: 'Failed to create payment order', detail: err.message });
  }
});

// ── POST /api/billing/verify-payment ─────────────────────────────────────────
// Step 2: after Cashfree payment, verify order status and activate plan
router.post('/verify-payment', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId required' });

    // Fetch order status from Cashfree
    const response = await cf.PGCreateOrder(orderRequest);
    const cfOrder   = response.data;

    if (cfOrder.order_status !== 'PAID') {
      return res.status(400).json({
        success: false,
        message: `Payment not completed. Status: ${cfOrder.order_status}`,
      });
    }

    // Get payment details
    const paymentsResp = await cf.PGOrderFetchPayments(orderId);
    const payments     = paymentsResp.data;
    const successPay   = payments.find(p => p.payment_status === 'SUCCESS');

    const payment = await Payment.findOne({ cashfreeOrderId: orderId });
    if (!payment) return res.status(404).json({ success: false, message: 'Order not found' });

    if (payment.status === 'paid') {
      // Already processed (duplicate callback)
      return res.json({ success: true, message: 'Payment already processed', plan: payment.plan });
    }

    // Mark payment as paid
    payment.cashfreePaymentId = successPay?.cf_payment_id?.toString() || null;
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

    const user = await User.findById(payment.userId);
    sendPaymentConfirmationEmail(user, payment).catch(console.error);

    res.json({
      success: true,
      message: `Payment successful! Welcome to ${PLANS[payment.plan].name}.`,
      plan:    payment.plan,
      invoiceNumber: payment.invoiceNumber,
      periodEnd,
    });
  } catch(err) {
    console.error('Verify payment error:', err?.response?.data || err);
    res.status(500).json({ success: false, message: 'Verification failed', detail: err.message });
  }
});

// ── POST /api/billing/webhook ─────────────────────────────────────────────────
// Cashfree webhook for async events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;

    if (webhookSecret) {
      // Cashfree webhook signature: HMAC-SHA256 of (timestamp + rawBody)
      const timestamp = req.headers['x-webhook-timestamp'];
      const signature = req.headers['x-webhook-signature'];
      const rawBody   = req.body.toString();

      const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(timestamp + rawBody)
        .digest('base64');

      if (expected !== signature) {
        console.warn('Cashfree webhook signature mismatch');
        return res.status(400).json({ message: 'Invalid webhook signature' });
      }
    }

    const event = JSON.parse(req.body.toString());
    const type  = event.type;
    const data  = event.data;

    if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const orderId   = data.order?.order_id;
      const paymentId = data.payment?.cf_payment_id?.toString();

      if (orderId) {
        const payment = await Payment.findOne({ cashfreeOrderId: orderId });
        if (payment && payment.status !== 'paid') {
          payment.cashfreePaymentId = paymentId;
          payment.status = 'paid';
          await payment.save();

          // Activate plan
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
          });
        }
      }
    }

    if (type === 'PAYMENT_FAILED_WEBHOOK') {
      const orderId = data.order?.order_id;
      if (orderId) {
        await Payment.findOneAndUpdate(
          { cashfreeOrderId: orderId },
          { status: 'failed' }
        );
      }
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

// ── GET /api/billing/invoice/:id ──────────────────────────────────────────────
router.get('/invoice/:id', auth, async (req, res) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, userId: req.user._id, status: 'paid' });
    if (!payment) return res.status(404).json({ message: 'Invoice not found' });

    const user = await User.findById(req.user._id).select('name email');
    const plan = PLANS[payment.plan];

    res.json({
      invoiceNumber:       payment.invoiceNumber,
      issuedTo:            { name: user.name, email: user.email },
      issuedAt:            payment.paidAt,
      plan:                plan.name,
      billingCycle:        payment.billingCycle,
      amount:              payment.amount,           // rupees
      currency:            payment.currency,
      cashfreePaymentId:   payment.cashfreePaymentId,
      cashfreeOrderId:     payment.cashfreeOrderId,
      items: [{
        description: `${plan.name} Plan — ${payment.billingCycle === 'monthly' ? '1 Month' : '1 Year'}`,
        quantity:    1,
        unitPrice:   payment.amount,
        total:       payment.amount,
      }],
      subtotal: payment.amount,
      gst:      Math.round(payment.amount * 0.18 * 100) / 100,
      total:    Math.round(payment.amount * 1.18 * 100) / 100,
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
        id:                  p._id,
        invoiceNumber:       p.invoiceNumber,
        user:                p.userId,
        plan:                p.plan,
        billingCycle:        p.billingCycle,
        amount:              p.amount,
        paidAt:              p.paidAt,
        cashfreePaymentId:   p.cashfreePaymentId,
      })),
      totalRevenue: total[0]?.total || 0,
    });
  } catch(err) {
    res.status(500).json({ message: 'Failed' });
  }
});

module.exports = router;