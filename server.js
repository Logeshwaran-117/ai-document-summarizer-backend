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
      family: 4, // Use IPv4
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

// CORS Configuration
app.use(cors({
    origin: NODE_ENV === "production" 
      ? process.env.FRONTEND_URL 
      : ["http://localhost:5173", "http://localhost:5174"],
    credentials: true
}));

app.use(express.json());

app.use(session({ 
    secret: process.env.SESSION_SECRET || "a-very-long-random-string", 
    resave: false, 
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { 
      maxAge: 1000 * 60 * 60 * 24,
      secure: NODE_ENV === "production", // HTTPS only in production
      httpOnly: true,
      sameSite: "lax"
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", summarizeRoutes);
app.use('/auth', settingsRoutes);

app.get("/auth/status", (req, res) => {
    if (req.isAuthenticated()) {
        res.status(200).json({ user: req.user });
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

app.get("/", (req, res) => res.send("Backend is Running!"));

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback", 
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect(`${FRONTEND_URL}/`);
  }
);

app.get("/auth/logout", (req, res) => {
  req.logout(() => {
    res.json({ message: "Logged out" });
  });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT} (${NODE_ENV} mode)`);
});
