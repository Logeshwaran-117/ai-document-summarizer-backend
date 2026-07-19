/**
 * bankingAnalytics.js
 * Pure computation — no AI, no DB. Takes an array of transactions
 * (already categorised + anomaly-flagged) and returns a full analytics object.
 */

function computeAnalytics(transactions, metadata = {}) {
  if (!transactions || transactions.length === 0) {
    return {
      totalCredits: 0, totalDebits: 0, netCashFlow: 0,
      openingBalance: null, closingBalance: null,
      transactionCount: 0, avgTransactionAmount: 0,
      largestCredit: 0, largestDebit: 0,
      categoryBreakdown: {}, monthlyFlow: [],
      anomalyCount: 0, anomalies: [],
      currency: metadata.currency || 'USD',
    };
  }

  let totalCredits = 0;
  let totalDebits = 0;
  let largestCredit = 0;
  let largestDebit = 0;
  const categoryMap = {};
  const monthlyMap = {};
  const anomalies = [];

  for (const t of transactions) {
    const credit = parseFloat(t.credit) || 0;
    const debit = parseFloat(t.debit) || 0;

    totalCredits += credit;
    totalDebits += debit;
    if (credit > largestCredit) largestCredit = credit;
    if (debit > largestDebit) largestDebit = debit;

    // Category breakdown (by debit spend)
    if (debit > 0) {
      const cat = t.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + debit;
    }

    // Monthly flow
    const monthKey = extractMonthKey(t.date);
    if (monthKey) {
      if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { credits: 0, debits: 0 };
      monthlyMap[monthKey].credits += credit;
      monthlyMap[monthKey].debits += debit;
    }

    if (t.isAnomaly) {
      anomalies.push({
        date: t.date,
        description: t.description,
        amount: debit || credit,
        reason: t.anomalyReason,
      });
    }
  }

  const netCashFlow = totalCredits - totalDebits;
  const allAmounts = transactions.map(t => (parseFloat(t.debit) || 0) + (parseFloat(t.credit) || 0)).filter(v => v > 0);
  const avgTransactionAmount = allAmounts.length > 0
    ? allAmounts.reduce((a, b) => a + b, 0) / allAmounts.length
    : 0;

  // Sort monthly keys chronologically
  const monthlyFlow = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      credits: round2(data.credits),
      debits: round2(data.debits),
      net: round2(data.credits - data.debits),
    }));

  // Round category values
  const categoryBreakdown = Object.fromEntries(
    Object.entries(categoryMap).map(([k, v]) => [k, round2(v)])
  );

  return {
    totalCredits: round2(totalCredits),
    totalDebits: round2(totalDebits),
    netCashFlow: round2(netCashFlow),
    openingBalance: metadata.openingBalance ?? null,
    closingBalance: metadata.closingBalance ?? null,
    transactionCount: transactions.length,
    avgTransactionAmount: round2(avgTransactionAmount),
    largestCredit: round2(largestCredit),
    largestDebit: round2(largestDebit),
    categoryBreakdown,
    monthlyFlow,
    anomalyCount: anomalies.length,
    anomalies,
    currency: metadata.currency || 'USD',
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const MONTH_NAMES = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
  jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
};

function extractMonthKey(dateStr) {
  if (!dateStr) return null;

  // "27 Jun 2026" or "27 Jun 2026" — Indian bank format
  const indianMatch = dateStr.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (indianMatch) {
    const mo = MONTH_NAMES[indianMatch[2].toLowerCase().slice(0, 3)];
    if (mo) return `${indianMatch[3]}-${String(mo).padStart(2, '0')}`;
  }

  // ISO: 2024-01-15
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-\d{2}/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  // DD/MM/YYYY
  const dmyMatch = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}`;

  // Fallback to Date constructor
  try {
    const d = new Date(dateStr);
    if (!isNaN(d)) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  } catch { /* skip */ }

  return null;
}

module.exports = { computeAnalytics };