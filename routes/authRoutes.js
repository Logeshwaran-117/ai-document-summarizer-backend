const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Document = require('../models/Document');
const TableExtraction = require('../models/TableExtraction');

// ── Login ───────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    if (user.status === 'suspended')
      return res.status(403).json({ message: 'Account suspended', reason: user.suspendedReason || '' });

    if (!user.password)
      return res.status(400).json({ message: 'This account uses Google login. Please sign in with Google.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    req.login(user, (err) => {
      if (err) return res.status(500).json({ message: 'Login session error' });
      const { password: _, googleId, ...safe } = user.toObject();
      res.json({ message: 'Logged in', user: safe });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// ── Register / Signup ───────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name: name || email, email, password: hashed });
    req.login(user, (err) => {
      if (err) return res.status(500).json({ message: 'Login after register failed' });
      const { password: _, googleId, ...safe } = user.toObject();
      res.status(201).json({ message: 'Registered successfully', user: safe });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// ── Logout ──────────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ message: 'Logout failed' });
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out' });
    });
  });
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ message: 'Logout failed' });
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out' });
    });
  });
});

// ── Delete Account ──────────────────────────────────────────────────────────
router.delete('/delete-account', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
  try {
    const userId = req.user._id;
    await Document.deleteMany({ userId });
    await TableExtraction.deleteMany({ userId });
    await User.findByIdAndDelete(userId);
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ message: 'Account deleted' });
      });
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

module.exports = router;