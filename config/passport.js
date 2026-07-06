const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.SERVER_URL || 'http://localhost:5000'}/auth/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;

      // First try to find by googleId
      let user = await User.findOne({ googleId: profile.id });
      
      if (!user) {
        // Try to find by email (user may have signed up with email before)
        user = await User.findOne({ email });
        
        if (user) {
          // Link Google account to existing user
          user.googleId = profile.id;
          user.name = user.name || profile.displayName;
          await user.save();
        } else {
          // Create new user
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email,
          });
        }
      }
      
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});