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

const chatRoutes = require('./routes/chatRoutes');   // adjust path if needed


// ── NEW: Usage dashboard routes ───────────────────────────────────────────────
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

app.set('trust proxy', 1);

// CORS Configuration
// Production: ALLOWED_ORIGINS is a comma-separated list of allowed origins,
// e.g. "https://precisqo.com,https://www.precisqo.com,https://staging.precisqo.com"
// Falls back to FRONTEND_URL for single-origin setups.
const buildAllowedOrigins = () => {
  if (process.env.NODE_ENV !== "production") {
    return ["http://localhost:5173", "http://localhost:5174"];
  }
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  }
  return [process.env.FRONTEND_URL].filter(Boolean);
};
const ALLOWED_ORIGINS = buildAllowedOrigins();

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server / curl requests (no Origin header)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Disposition", "X-Presentation-Id", "X-Slide-Count"],
};

app.use(cors(corsOptions));

app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const dbStatus = dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected";
  const status   = dbState === 1 ? "ok" : "degraded";
 
  res.status(dbState === 1 ? 200 : 503).json({
    status,
    db: dbStatus,
    uptime: Math.floor(process.uptime()),
    ts: new Date().toISOString(),
  });
});

app.use(session({
    secret: process.env.SESSION_SECRET || "a-very-long-random-string",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days — prevents daily logouts
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
app.use("/api/ppt", pptRoutes);
app.use('/auth', settingsRoutes);
app.use("/api", tableRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/billing", billingRoutes);
app.use('/api/chat', chatRoutes);
// ── NEW: mount usage dashboard ────────────────────────────────────────────────
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
    res.redirect(`${FRONTEND_URL}/?googleAuth=success`);
  }
);

// NOTE: /auth/logout is handled as POST by authRoutes.js — no GET handler needed here.

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