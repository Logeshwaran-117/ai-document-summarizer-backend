// Central plan configuration — single source of truth
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    limits: {
      summarize: 5,    // per day
      tables: 5,       // per day  (both combined = 5+5 = 10 total actions/day)
      fileSize: 10,    // MB
      historyDays: 30, // days to keep history
    },
    features: [
      '5 document summaries / day',
      '5 table extractions / day',
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
      summarize: 15,   // per day
      tables: 15,      // per day
      fileSize: 50,
      historyDays: 365,
    },
    features: [
      '15 document summaries / day',
      '15 table extractions / day',
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

  // Reset usage daily — limits are per calendar day now, independent of the
  // billing cycle (which stays monthly/yearly and only affects price).
  const now = new Date();
  const resetAt = sub.usageResetAt ? new Date(sub.usageResetAt) : new Date(0);

  // "Today" is compared by calendar date (server local time), not a rolling
  // 24h window, so usage resets once at the start of each new day rather
  // than exactly 24h after the user's last action.
  const needsReset = resetAt.toDateString() !== now.toDateString();

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