const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Document = require('../models/Document');

// Update profile name
router.put('/update-profile', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    try {
        const { name } = req.body;
        await User.findByIdAndUpdate(req.user._id, { name });
        res.json({ message: 'Profile updated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Change password
router.put('/change-password', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);

        // If user has existing password, verify it
        if (user.password) {
            const match = await bcrypt.compare(currentPassword, user.password);
            if (!match) return res.status(400).json({ message: 'Current password is incorrect' });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(req.user._id, { password: hashed });
        res.json({ message: 'Password updated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete account
router.delete('/delete-account', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    try {
        await Document.deleteMany({ userId: req.user._id });
        await User.findByIdAndDelete(req.user._id);
        req.logout(() => {
            res.json({ message: 'Account deleted' });
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
