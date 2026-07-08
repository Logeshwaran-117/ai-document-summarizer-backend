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
      // Reset usage counters
      const resetUpdate = { 'subscription.usageResetAt': new Date() };
      if (action === 'summarize') resetUpdate['subscription.summarizeCount'] = 0;
      else resetUpdate['subscription.tableCount'] = 0;
      await User.findByIdAndUpdate(user._id, { $set: resetUpdate });
      result.allowed = true;
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

module.exports = { limitAction, incrementUsage };
