const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
});

const otpSlow = slowDown({
  windowMs: 10 * 60 * 1000,
  delayAfter: 5,
  delayMs: 500,
});

module.exports = { signupLimiter, otpLimiter, otpSlow };
