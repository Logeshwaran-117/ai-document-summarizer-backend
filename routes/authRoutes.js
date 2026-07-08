const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
    
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

module.exports = router;
