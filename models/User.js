const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const subscriptionSchema = new mongoose.Schema({
  plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  status: { type: String, enum: ['active', 'cancelled', 'expired', 'trial'], default: 'active' },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  startDate: { type: Date, default: Date.now },
  currentPeriodStart: { type: Date, default: Date.now },
  currentPeriodEnd: { type: Date },
  cancelledAt: { type: Date },
  // usage tracking (resets each billing period)
  summarizeCount: { type: Number, default: 0 },
  tableCount: { type: Number, default: 0 },
  usageResetAt: { type: Date, default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  googleId: String,
  name: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  // keep top-level plan for quick admin queries
  plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  subscription: { type: subscriptionSchema, default: () => ({}) },
  tokensUsed: { type: Number, default: 0 },
  tokenLimit: { type: Number, default: 1000000 }, // e.g., 1 Million free tokens
  tokenResetDate: { type: Date },
  resetToken:    { type: String },
  resetTokenExp: { type: Date },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  suspendedReason: { type: String, default: '' },
}, { timestamps: false });

userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
