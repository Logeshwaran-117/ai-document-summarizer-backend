const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Cashfree fields (replaces Razorpay fields)
  cashfreeOrderId:     { type: String, required: true, unique: true },  // cf_order_id we create
  cashfreePaymentId:   { type: String, default: null },                 // cf_payment_id from Cashfree
  cashfreeSignature:   { type: String, default: null },                 // signature from webhook
  paymentSessionId:    { type: String, default: null },                 // session for JS checkout

  plan:                { type: String, enum: ['pro', 'enterprise'], required: true },
  billingCycle:        { type: String, enum: ['monthly', 'yearly'], required: true },
  amount:              { type: Number, required: true },    // in INR rupees (NOT paise — Cashfree uses rupees)
  currency:            { type: String, default: 'INR' },
  status:              { type: String, enum: ['created', 'paid', 'failed', 'refunded'], default: 'created' },
  invoiceNumber:       { type: String, unique: true, sparse: true },
  paidAt:              { type: Date },
  notes:               { type: Object, default: {} },
}, { timestamps: true });

// Auto-generate invoice number on save when paid
paymentSchema.pre('save', async function(next) {
  if (this.isModified('status') && this.status === 'paid' && !this.invoiceNumber) {
    const count = await mongoose.model('Payment').countDocuments({ status: 'paid' });
    const year  = new Date().getFullYear();
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, '0')}`;
    this.paidAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);