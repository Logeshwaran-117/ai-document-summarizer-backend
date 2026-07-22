// server/middleware/planLimit.js
// 3.5 — fires usage-warning emails at 80% and 100% of daily plan limit.

const User = require('../models/User');
const { checkLimit, PLANS } = require('../config/plans');
const { sendUsageLimitEmail } = require('../services/emailService');

// Factory: returns middleware for a given action ('summarize' or 'tables')
function limitAction(action) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    // Admins are never rate limited
    if (user.role === 'admin') return next();

    const result = checkLimit(user, action);

    if (result.needsReset) {
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'subscription.usageResetAt':    new Date(),
          'subscription.summarizeCount':  0,
          'subscription.tableCount':      0,
        },
      });
      result.allowed   = true;
      result.remaining = result.limit;
    }

    if (!result.allowed) {
      // ── 3.5: 100% limit email ─────────────────────────────────────────────
      // Only fire once per day — track with a flag on the user doc or just fire
      // every time they hit the wall (idempotent; email service deduplicates via
      // the "email sent" log).  Non-blocking so the 429 returns instantly.
      sendUsageLimitEmail(user, { used: result.used, limit: result.limit, action }, '100').catch(() => {});

      return res.status(429).json({
        success: false,
        limitReached: true,
        message: `You've reached your ${action === 'summarize' ? 'summary' : 'table extraction'} limit for today (${result.limit} on your ${user.plan} plan). Your limit resets tomorrow — or upgrade to continue.`,
        plan: user.plan,
        limit: result.limit,
        used: result.used,
      });
    }

    // ── 3.5: 80% warning email ────────────────────────────────────────────────
    // Fire when this next action will push the user to or past 80%.
    // We check BEFORE incrementing, so result.used is the count before this call.
    const usedAfterThis = result.used + 1;
    const pct = result.limit > 0 ? usedAfterThis / result.limit : 0;
    if (pct >= 0.8 && result.used / result.limit < 0.8) {
      // Just crossed the 80% line — send once
      sendUsageLimitEmail(user, { used: usedAfterThis, limit: result.limit, action }, '80').catch(() => {});
    }

    // Attach to req so the controller can increment after success
    req.planAction = action;
    req.planUser = user;
    next();
  };
}

// Call this after successful action to increment usage
async function incrementUsage(userId, action) {
  const field = action === 'summarize' ? 'subscription.summarizeCount' : 'subscription.tableCount';
  await User.findByIdAndUpdate(userId, { $inc: { [field]: 1 } });
}

async function deductTokens(userId, tokensUsed) {
  try {
    const user = await User.findById(userId);
    if (!user) return null;

    if (user.tokensUsed === undefined) user.tokensUsed = 0;
    if (!user.tokenLimit) {
      const plan = PLANS[user.plan || 'free'];
      user.tokenLimit = plan?.limits?.tokenLimit ?? PLANS.free.limits.tokenLimit ?? 50000;
    }

    if (!user.tokenResetDate || new Date() > user.tokenResetDate) {
      user.tokensUsed = 0;
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      user.tokenResetDate = nextMonth;
    }

    user.tokensUsed += tokensUsed;
    await user.save();

    return {
      used: user.tokensUsed,
      limit: user.tokenLimit,
      remaining: Math.max(0, user.tokenLimit - user.tokensUsed),
      resetDate: user.tokenResetDate
    };
  } catch (error) {
    console.error("Token deduction error:", error);
    return null;
  }
}

module.exports = { limitAction, incrementUsage, deductTokens };