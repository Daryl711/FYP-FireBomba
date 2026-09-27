// In-memory fixed-window rate limiter for the auth endpoints.
//
// Counters live in this process only, so they reset on restart and are not
// shared between instances. That is fine for a single backend; move the store
// to Redis if the backend is ever scaled out.
//
// Set RATE_LIMIT_ENABLED=false to switch every limiter off (e.g. load tests).
// Behind a reverse proxy, set TRUST_PROXY so req.ip is the real client and
// not the proxy - otherwise every user shares one bucket.

const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== "false";

const MINUTE_MS = 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * MINUTE_MS;

const stores = [];

// Drop expired windows so the maps do not grow forever.
setInterval(() => {
  const now = Date.now();
  for (const store of stores) {
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }
}, SWEEP_INTERVAL_MS).unref();

const ipKey = (req) => req.ip || req.socket?.remoteAddress || "unknown";

// Same account typed as "Ali@X.com " or "ali@x.com" must share one bucket.
// Phone numbers keep only digits so "012-345 6789" and "0123456789" match.
const identifierKey = (req) => {
  const { identifier, email, phone } = req.body || {};
  const raw = identifier || email || phone;
  if (!raw) return null;

  const value = String(raw).trim().toLowerCase();
  return value.includes("@") ? value : value.replace(/\D/g, "").replace(/^(60|0)/, "");
};

// options:
//   name         - label used in the key and the log line
//   windowMs     - window length
//   max          - requests allowed per window
//   key          - (req) => string | null; null skips limiting for that request
//   failuresOnly - count only responses with status >= 400, so a user who
//                  logs in successfully is never locked out by their own use
//   message      - error text returned with the 429
const createRateLimiter = ({
  name,
  windowMs,
  max,
  key = ipKey,
  failuresOnly = false,
  message = "Too many requests, please try again later",
}) => {
  const store = new Map();
  stores.push(store);

  return (req, res, next) => {
    if (!RATE_LIMIT_ENABLED) return next();

    const keyValue = key(req);
    if (!keyValue) return next();

    const bucketKey = `${name}:${keyValue}`;
    const now = Date.now();

    let entry = store.get(bucketKey);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(bucketKey, entry);
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      console.warn(`Rate limit hit: ${bucketKey} (${max} per ${windowMs / 1000}s)`);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: `${message}. Try again in ${formatWait(retryAfter)}.`,
        code: "RATE_LIMITED",
        retryAfter,
      });
    }

    // Counted up front so a burst of parallel requests cannot all slip past
    // the check. With failuresOnly, a successful answer hands the slot back.
    entry.count += 1;

    if (failuresOnly) {
      res.on("finish", () => {
        if (res.statusCode >= 400) return;
        // Only refund the window this request was counted in.
        if (store.get(bucketKey) === entry && entry.count > 0) entry.count -= 1;
      });
    }
    return next();
  };
};

const formatWait = (seconds) =>
  seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)} min`;

// --- Limits for the auth routes ---

// Per IP: stops one client hammering the login from many accounts.
exports.loginIpLimiter = createRateLimiter({
  name: "login-ip",
  windowMs: 15 * MINUTE_MS,
  max: 20,
  message: "Too many login attempts from this device",
});

// Per account: stops password guessing against one account from many IPs.
// Only failed attempts count.
exports.loginAccountLimiter = createRateLimiter({
  name: "login-account",
  windowMs: 15 * MINUTE_MS,
  max: 5,
  key: identifierKey,
  failuresOnly: true,
  message: "Too many failed login attempts for this account",
});

// Each code already allows only 5 guesses; this caps guessing across codes.
exports.otpVerifyLimiter = createRateLimiter({
  name: "otp-verify",
  windowMs: 15 * MINUTE_MS,
  max: 15,
  failuresOnly: true,
  message: "Too many incorrect codes",
});

// SMS-sending routes cost money per message, so they get the tightest limits.
exports.otpResendLimiter = createRateLimiter({
  name: "otp-resend",
  windowMs: 60 * MINUTE_MS,
  max: 5,
  message: "Too many code requests",
});

exports.forgotPasswordIpLimiter = createRateLimiter({
  name: "forgot-ip",
  windowMs: 60 * MINUTE_MS,
  max: 5,
  message: "Too many password reset requests",
});

exports.forgotPasswordAccountLimiter = createRateLimiter({
  name: "forgot-account",
  windowMs: 60 * MINUTE_MS,
  max: 3,
  key: identifierKey,
  message: "Too many password reset requests",
});

exports.resetPasswordLimiter = createRateLimiter({
  name: "reset-password",
  windowMs: 15 * MINUTE_MS,
  max: 10,
  failuresOnly: true,
  message: "Too many incorrect reset attempts",
});

exports.createRateLimiter = createRateLimiter;
