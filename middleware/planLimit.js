const User = require('../models/User');
const { checkLimit } = require('../config/plans');

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
      // Reset BOTH counters together so a new calendar day always starts clean,
      // regardless of which action triggers the reset first.
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
      return res.status(429).json({
        success: false,
        limitReached: true,
        message: `You've reached your ${action === 'summarize' ? 'summary' : 'table extraction'} limit for this month (${result.limit} on your ${user.plan} plan). Upgrade to continue.`,
        plan: user.plan,
        limit: result.limit,
        used: result.used,
      });
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
    if (!user.tokenLimit) user.tokenLimit = 1000000; 
    
    // Auto-reset if the date has passed
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