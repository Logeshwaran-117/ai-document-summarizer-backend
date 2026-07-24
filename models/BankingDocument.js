const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  date: String,
  description: String,
  debit: Number,
  credit: Number,
  balance: Number,
  category: String,
  counterparty: String,
  paymentMethod: String,
  reference: String,
  isAnomaly: { type: Boolean, default: false },
  anomalyReason: String,
}, { _id: false });

const bankingDocumentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: String,
  documentType: {
    type: String,
    enum: ['bank_statement', 'loan', 'financial_report', 'investment', 'unknown'],
    default: 'unknown'
  },
  accountName: String,
  accountNumber: String,
  accountType: String,
  bankName: String,
  branchName: String,
  ifscCode: String,
  currency: { type: String, default: 'USD' },
  periodStart: String,
  periodEnd: String,

  // Raw extracted text
  extractedText: String,

  // AI-generated summary
  summary: String,

  // Structured transaction data
  transactions: [transactionSchema],

  // Analytics computed server-side
  analytics: {
    totalCredits: Number,
    totalDebits: Number,
    netCashFlow: Number,
    openingBalance: Number,
    closingBalance: Number,
    transactionCount: Number,
    avgTransactionAmount: Number,
    largestCredit: Number,
    largestDebit: Number,
    categoryBreakdown: { type: Map, of: Number },
    monthlyFlow: [{ month: String, credits: Number, debits: Number, net: Number }],
    anomalyCount: Number,
    anomalies: [{ date: String, description: String, amount: Number, reason: String }],
  },

  // Q&A chat history
  chatHistory: [{
    role: { type: String, enum: ['user', 'assistant'] },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],

  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BankingDocument', bankingDocumentSchema);
