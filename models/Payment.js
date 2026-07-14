const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Cashfree fields
  cashfreeOrderId:     { type: String, required: true, unique: true },
  cashfreePaymentId:   { type: String, default: null },
  cashfreeSignature:   { type: String, default: null },
  paymentSessionId:    { type: String, default: null },

  plan:                { type: String, enum: ['pro', 'enterprise'], required: true },
  billingCycle:        { type: String, enum: ['monthly', 'yearly'], required: true },
  amount:              { type: Number, required: true },
  currency:            { type: String, default: 'INR' },
  status:              { type: String, enum: ['created', 'paid', 'failed', 'refunded'], default: 'created' },
  invoiceNumber:       { type: String, unique: true, sparse: true },
  paidAt:              { type: Date },
  notes:               { type: Object, default: {} },
}, { timestamps: true });

// Auto-generate invoice number on save when paid
// Note: async pre-save hooks must NOT use next() — just return
paymentSchema.pre('save', async function() {
  if (this.isModified('status') && this.status === 'paid' && !this.invoiceNumber) {
    const count = await mongoose.model('Payment').countDocuments({ status: 'paid' });
    const year  = new Date().getFullYear();
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, '0')}`;
    this.paidAt = new Date();
  }
});

module.exports = mongoose.model('Payment', paymentSchema);