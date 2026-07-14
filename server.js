require("dotenv").config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const cors = require("cors");
const express = require("express");
const passport = require("passport");
const session = require("express-session");
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo').default;

const summarizeRoutes = require("./routes/summarizeRoutes");
const historyRoutes = require("./routes/historyRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const authRoutes = require('./routes/authRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const pptRoutes = require("./routes/pptRoutes");
const tableRoutes = require("./routes/tableRoutes");
const adminRoutes = require("./routes/adminRoutes");
require('./models/Payment');
const billingRoutes = require("./routes/billingRoutes");

const chatRoutes = require('./routes/chatRoutes');

const usageRoutes = require("./routes/usageRoutes");

require("./config/passport");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const NODE_ENV = process.env.NODE_ENV || "development";

// MongoDB Connection with Retry Logic
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
      tls: true,
      tlsAllowInvalidCertificates: false,
      retryWrites: true,
      w: 'majority'
    });
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('Retrying in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
};

connectDB();

// After connectDB() - permanently safe, silently skips if index already gone
mongoose.connection.once('open', async () => {
  try {
    await mongoose.connection.db.collection('payments').dropIndex('razorpayOrderId_1');
    console.log('✅ Cleaned up old Razorpay index');
  } catch(e) { /* already gone, ignore */ }
});

app.set('trust proxy', 1);

// CORS Configuration
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL
    : ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  exposedHeaders: ["Content-Disposition", "X-Presentation-Id"],
}));

app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || "a-very-long-random-string",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      secure: NODE_ENV === "production",
      httpOnly: true,
      sameSite: NODE_ENV === "production" ? "none" : "lax"
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", summarizeRoutes);
app.use("/api", pptRoutes);
app.use('/auth', settingsRoutes);
app.use("/api", tableRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/billing", billingRoutes);
app.use('/api/chat', chatRoutes);
app.use("/api/usage", usageRoutes);

const { router: progressRoutes } = require("./routes/progressRoutes");
app.use("/api", progressRoutes);

const bankingRoutes = require('./routes/bankingRoutes');
app.use('/api/banking', bankingRoutes);

app.get("/auth/status", (req, res) => {
    if (req.isAuthenticated()) {
        res.status(200).json({ user: req.user });
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

app.get("/", (req, res) => res.send("Backend is Running!"));

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" }));

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: `${FRONTEND_URL}/login` }),
  (req, res) => {
    // ✅ Fixed: redirect to /dashboard instead of / so users land in the app
    res.redirect(`${FRONTEND_URL}/dashboard`);
  }
);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT} (${NODE_ENV} mode)`);
});

app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);

    if (err && err.name === "MulterError") {
        const message =
            err.code === "LIMIT_FILE_SIZE"
                ? "File is too large. Maximum allowed size is 10 MB."
                : `Upload error: ${err.message}`;
        return res.status(400).json({ success: false, message });
    }

    if (err) {
        return res.status(err.status || 500).json({
            success: false,
            message: err.message || "Something went wrong. Please try again.",
        });
    }

    next();
});