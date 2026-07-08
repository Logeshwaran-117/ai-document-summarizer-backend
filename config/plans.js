// Central plan configuration — single source of truth
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    limits: {
      summarize: 20,   // per billing period
      tables: 20,      // per billing period  (both combined = 20+20 = 40 total actions)
      fileSize: 10,    // MB
      historyDays: 30, // days to keep history
    },
    features: [
      '20 document summaries / month',
      '20 table extractions / month',
      'Up to 10 MB file size',
      'PDF, DOCX, TXT, Images',
      '30-day history',
      'Document Q&A chat',
    ],
    color: 'gray',
    badge: '🆓',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 499, yearly: 4499 }, // INR paise-free (just ₹)
    limits: {
      summarize: 500,
      tables: 500,
      fileSize: 50,
      historyDays: 365,
    },
    features: [
      '500 document summaries / month',
      '500 table extractions / month',
      'Up to 50 MB file size',
      'All file types incl. Excel',
      'Unlimited history',
      'Priority AI models (Gemini, Groq, Cohere)',
      'PPT export',
      'Document Q&A chat',
      'Email support',
    ],
    color: 'blue',
    badge: '⭐',
    popular: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: { monthly: 1999, yearly: 17999 },
    limits: {
      summarize: -1,   // -1 = unlimited
      tables: -1,
      fileSize: 200,
      historyDays: -1,
    },
    features: [
      'Unlimited summaries & tables',
      'Up to 200 MB file size',
      'All file types',
      'Unlimited history',
      'All AI models',
      'PPT export',
      'Bulk processing',
      'Priority support',
      'Admin dashboard access',
      'Custom integrations (on request)',
    ],
    color: 'purple',
    badge: '🏢',
  },
};

// Check if user has exceeded limit for a given action
function checkLimit(user, action) {
  const plan = PLANS[user.plan || 'free'];
  const limit = plan.limits[action]; // -1 = unlimited
  if (limit === -1) return { allowed: true, remaining: Infinity };

  const sub = user.subscription || {};

  // Reset usage if billing period rolled over
  const now = new Date();
  const resetAt = sub.usageResetAt ? new Date(sub.usageResetAt) : new Date(0);
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;

  // If we have a periodEnd and it's passed, usage should be reset by renewal
  // For simplicity: reset monthly if no active subscription tracking
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const needsReset = resetAt < monthAgo;

  const used = needsReset ? 0 : (action === 'summarize' ? (sub.summarizeCount || 0) : (sub.tableCount || 0));
  const remaining = limit - used;

  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    limit,
    used,
    needsReset,
  };
}

module.exports = { PLANS, checkLimit };
