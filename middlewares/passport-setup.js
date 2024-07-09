import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from '../db.js';
import dotenv from 'dotenv';

dotenv.config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const [rows] = await pool.query('SELECT * FROM usuarios WHERE google_id = ?', [profile.id]);
      let user;
      if (rows.length > 0) {
        user = rows[0];
      } else {
        const newUser = {
          user: profile.displayName,
          email: profile.emails[0].value,
          google_id: profile.id,
          role: "user"
        };
        const [result] = await pool.query('INSERT INTO usuarios (user, email, google_id, role) VALUES (?, ?, ?, ?)', [newUser.user, newUser.email, newUser.google_id, newUser.role]);
        newUser.id = result.insertId;
        user = newUser;
      }
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [id]);
    done(null, rows[0]);
  } catch (err) {
    done(err, null);
  }
});
