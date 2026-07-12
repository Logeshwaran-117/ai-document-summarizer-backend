const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendWelcomeEmail } = require("../services/emailService");
const crypto = require("crypto");
    
// Signup
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed, name: name || email });
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
    req.login(user, err => {
      if (err) return res.status(500).json({ message: 'Login after signup failed' });
      sendWelcomeEmail(user);   // fire-and-forget, don't await
      res.json({ user: { ...user.toObject(), password: undefined } });
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !user.password) 
      return res.status(400).json({ message: 'Invalid email or password' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(400).json({ message: 'Invalid email or password' });

    // Check suspension
    if (user.status === 'suspended') {
      const reason = user.suspendedReason ? ` Reason: ${user.suspendedReason}` : '';
      return res.status(403).json({ message: `Your account has been suspended.${reason}` });
    }

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    req.login(user, err => {
      if (err) return res.status(500).json({ message: 'Login failed' });
      res.json({ user: { ...user.toObject(), password: undefined } });
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ message: 'Logout failed' });
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: 'Session destroy failed' });
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out' });
    });
  });
});

// POST /auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  // Always respond the same way to avoid email enumeration
  if (!user) return res.json({ message: "If that email exists, a reset link was sent." });

  const token    = crypto.randomBytes(32).toString("hex");
  const hashed   = crypto.createHash("sha256").update(token).digest("hex");
  const expiry   = Date.now() + 30 * 60 * 1000; // 30 minutes

  await User.findByIdAndUpdate(user._id, {
    resetToken: hashed,
    resetTokenExp: expiry,
  });

  await sendPasswordResetEmail(user, token, 30);
  res.json({ message: "If that email exists, a reset link was sent." });
});

// POST /auth/reset-password
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  const hashed = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetToken: hashed,
    resetTokenExp: { $gt: Date.now() },
  });
  if (!user) return res.status(400).json({ message: "Token invalid or expired." });

  user.password    = await require("bcryptjs").hash(newPassword, 10);
  user.resetToken  = undefined;
  user.resetTokenExp = undefined;
  await user.save();

  res.json({ message: "Password updated. You can now log in." });
});

module.exports = router;
