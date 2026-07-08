// Middleware: must be logged in
const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  next();
};

// Middleware: must be admin
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};

module.exports = { requireAuth, requireAdmin };
