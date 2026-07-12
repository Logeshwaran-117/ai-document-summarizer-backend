const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Document = require('../models/Document');
const TableExtraction = require('../models/TableExtraction');
const { requireAdmin } = require('../middleware/adminAuth');
const Payment = require('../models/Payment');

router.use(requireAdmin);

// ── Overview Stats ──────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const adminCount = await User.countDocuments({ role: 'admin' });
    const activeUsers = await User.countDocuments({ $or: [{ status: 'active' }, { status: { $exists: false } }] });
    const suspendedUsers = await User.countDocuments({ status: 'suspended' });
    const totalDocuments = await Document.countDocuments();
    const totalTables = await TableExtraction.countDocuments();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });
    const docsThisWeek = await Document.countDocuments({ uploadedAt: { $gte: weekAgo } });

    const freePlan = await User.countDocuments({ $or: [{ plan: 'free' }, { plan: { $exists: false } }] });
    const proPlan = await User.countDocuments({ plan: 'pro' });
    const enterprisePlan = await User.countDocuments({ plan: 'enterprise' });

    // Top uploaders
    const topUploaders = await Document.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { count: 1, name: '$user.name', email: '$user.email' } }
    ]);

    // Daily signups last 7 days
    const dailySignups = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d); start.setHours(0,0,0,0);
      const end = new Date(d); end.setHours(23,59,59,999);
      const count = await User.countDocuments({ createdAt: { $gte: start, $lte: end } });
      dailySignups.push({ day: d.toLocaleDateString('en-US', { weekday: 'short' }), count });
    }

    // Daily docs last 7 days
    const dailyDocs = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d); start.setHours(0,0,0,0);
      const end = new Date(d); end.setHours(23,59,59,999);
      const count = await Document.countDocuments({ uploadedAt: { $gte: start, $lte: end } });
      dailyDocs.push({ day: d.toLocaleDateString('en-US', { weekday: 'short' }), count });
    }

    // Recent signups (last 5)
    const recentSignups = await User.find()
      .sort({ createdAt: -1 }).limit(5)
      .select('name email createdAt role plan');

    // Revenue stats
    const revenueData = await Payment.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
    const totalRevenue = (revenueData[0]?.total || 0) / 100;
    const totalTransactions = revenueData[0]?.count || 0;

    // Revenue this month
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const monthRevData = await Payment.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const revenueThisMonth = (monthRevData[0]?.total || 0) / 100;

    res.json({
      totalUsers, adminCount, activeUsers, suspendedUsers,
      totalDocuments, totalTables, newUsersThisWeek, docsThisWeek,
      plans: { free: freePlan, pro: proPlan, enterprise: enterprisePlan },
      dailySignups, dailyDocs, topUploaders, recentSignups,
      totalRevenue, totalTransactions, revenueThisMonth
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

// ── Users List (paginated, filtered) ───────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 15, 100);
    const search = (req.query.search || '').trim();
    const statusFilter = req.query.status;
    const roleFilter = req.query.role;
    const planFilter = req.query.plan;
    const sort = req.query.sort || 'newest';

    const filter = {};
    if (search) filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } }
    ];
    if (statusFilter && statusFilter !== 'all') filter.status = statusFilter;
    if (roleFilter && roleFilter !== 'all') filter.role = roleFilter;
    if (planFilter && planFilter !== 'all') filter.plan = planFilter;

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name: { name: 1 },
      email: { email: 1 },
      mostdocs: { _id: 1 } // will sort after aggregation
    };

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password -googleId')
      .sort(sortMap[sort] || { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Normalise missing fields to defaults
    users.forEach(u => {
      if (!u.role) u.role = 'user';
      if (!u.status) u.status = 'active';
      if (!u.plan) u.plan = 'free';
    });

    // Attach doc count per user
    const userIds = users.map(u => u._id);
    const docCounts = await Document.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } }
    ]);
    const docMap = {};
    docCounts.forEach(d => { docMap[d._id.toString()] = d.count; });
    users.forEach(u => { u.docCount = docMap[u._id.toString()] || 0; });

    res.json({ users, total, page, pages: Math.ceil(total / limit), limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// ── Get Single User ─────────────────────────────────────────────────────────
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -googleId').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.role) user.role = 'user';
    if (!user.status) user.status = 'active';
    if (!user.plan) user.plan = 'free';

    const docCount = await Document.countDocuments({ userId: user._id });
    const tableCount = await TableExtraction.countDocuments({ userId: user._id });

    // Enterprise users have document privacy — admins can see counts but not content
    const isEnterprisePrivate = user.plan === 'enterprise';
    const recentDocs = isEnterprisePrivate
      ? []
      : await Document.find({ userId: user._id })
          .sort({ uploadedAt: -1 }).limit(5)
          .select('filename summary uploadedAt stats');

    res.json({ ...user, docCount, tableCount, recentDocs, documentsPrivate: isEnterprisePrivate });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// ── ALL documents for a user (paginated) ────────────────────────────────────
router.get('/users/:id/documents', async (req, res) => {
  try {
    // Enterprise users have document privacy — block content access entirely
    const targetUser = await User.findById(req.params.id).select('plan').lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (targetUser.plan === 'enterprise') {
      return res.status(403).json({
        message: 'Documents of enterprise users are private and cannot be viewed by administrators.',
        documentsPrivate: true
      });
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const total = await Document.countDocuments({ userId: req.params.id });
    const docs = await Document.find({ userId: req.params.id })
      .sort({ uploadedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('filename summary uploadedAt stats');
    res.json({ docs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch documents' });
  }
});

// ── Update User ─────────────────────────────────────────────────────────────
router.put('/users/:id', async (req, res) => {
  try {
    const { role, plan, status, name, suspendedReason } = req.body;
    if (req.params.id === req.user._id.toString() && role === 'user') {
      return res.status(400).json({ message: 'Cannot remove your own admin role' });
    }
    const update = {};
    if (role) update.role = role;
    if (plan) update.plan = plan;
    if (status) update.status = status;
    if (name !== undefined) update.name = name;
    if (suspendedReason !== undefined) update.suspendedReason = suspendedReason;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-password -googleId');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User updated', user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// ── Suspend / Unsuspend ─────────────────────────────────────────────────────
router.post('/users/:id/suspend', async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ message: 'Cannot suspend yourself' });
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id,
      { status: 'suspended', suspendedReason: reason || '' }, { new: true }
    ).select('-password');
    res.json({ message: 'User suspended', user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to suspend user' });
  }
});

router.post('/users/:id/unsuspend', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id,
      { status: 'active', suspendedReason: '' }, { new: true }
    ).select('-password');
    res.json({ message: 'User unsuspended', user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to unsuspend user' });
  }
});

// ── Reset Password ──────────────────────────────────────────────────────────
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.params.id, { password: hashed });
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// ── Delete User ─────────────────────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ message: 'Cannot delete yourself' });
    await Document.deleteMany({ userId: req.params.id });
    await TableExtraction.deleteMany({ userId: req.params.id });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User and all associated data deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// ── Delete a document (admin) ───────────────────────────────────────────────
router.delete('/documents/:id', async (req, res) => {
  try {
    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete document' });
  }
});

// ── Create / Promote Admin ──────────────────────────────────────────────────
router.post('/create-admin', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const exists = await User.findOne({ email });
    if (exists) {
      const updated = await User.findByIdAndUpdate(exists._id, { role: 'admin' }, { new: true }).select('-password');
      return res.json({ message: 'Existing user promoted to admin', user: updated });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed, name: name || email, role: 'admin' });
    res.json({ message: 'Admin created', user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create admin' });
  }
});

// ── Bulk update plan for all users without a plan ───────────────────────────
router.post('/migrate-defaults', async (req, res) => {
  try {
    const r1 = await User.updateMany({ role: { $exists: false } }, { $set: { role: 'user' } });
    const r2 = await User.updateMany({ status: { $exists: false } }, { $set: { status: 'active' } });
    const r3 = await User.updateMany({ plan: { $exists: false } }, { $set: { plan: 'free' } });
    res.json({ message: 'Migration done', r1: r1.modifiedCount, r2: r2.modifiedCount, r3: r3.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: 'Migration failed' });
  }
});

module.exports = router;