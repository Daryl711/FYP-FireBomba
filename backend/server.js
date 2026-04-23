require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const app = express();

// ============================================================
// SECURITY MIDDLEWARE (order matters!)
// ============================================================

// 1. Helmet: sets secure HTTP headers (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet());

// 2. CORS: restrict which origins can call the API
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:8081', 'http://localhost:19006']; // Expo defaults

app.use(cors({
    origin: (origin, callback) => {
        // Allow mobile apps (no origin header) and whitelisted web origins
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

// 3. Body parser with size limit (prevent DoS via huge payloads)
app.use(express.json({ limit: '10kb' }));

// 4. Global rate limit (anti-DoS baseline)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 200,                    // 200 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// 5. Stricter rate limit for auth endpoints (anti-brute-force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 10,                     // 10 login/signup attempts per IP
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // don't count successful logins
    message: { error: 'Too many attempts, please try again in 15 minutes.' },
});

// ============================================================
// DATABASE (connection pool, not single connection)
// ============================================================

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'firebomba_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Test connection on startup
(async () => {
    try {
        const conn = await db.getConnection();
        console.log('Connected to FireBomba Database!');
        conn.release();
    } catch (err) {
        console.error('Database connection FAILED:', err.message);
        process.exit(1);
    }
})();

// ============================================================
// CONSTANTS & HELPERS
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be set and at least 32 characters.');
    process.exit(1);
}

// Precomputed dummy hash for timing-attack protection.
// Used when the email doesn't exist so response time stays consistent.
const DUMMY_HASH = bcrypt.hashSync('dummy_password_for_timing', 10);

// Generic auth error — never reveals whether email exists
const GENERIC_AUTH_ERROR = 'Invalid email or password';

// Validation result handler
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Return generic message — don't leak which specific field failed to attackers
        return res.status(400).json({ error: 'Invalid input' });
    }
    next();
};

// JWT auth middleware (for protected routes)
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
};

// ============================================================
// ROUTES
// ============================================================

// --- SIGN UP ---
app.post('/api/signup',
    authLimiter,
    [
        body('fullName')
            .trim()
            .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
            .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name contains invalid characters'),
        body('email')
            .trim()
            .isEmail().withMessage('Invalid email')
            .normalizeEmail()
            .isLength({ max: 254 }),
        body('password')
            .isLength({ min: 8, max: 72 }).withMessage('Password must be 8-72 characters')
            .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
            .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
            .matches(/[0-9]/).withMessage('Password must contain a number'),
    ],
    handleValidation,
    async (req, res) => {
        const { fullName, email, password } = req.body;

        try {
            // Check if user already exists
            const [existing] = await db.query(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (existing.length > 0) {
                // Generic message — don't confirm the email is registered
                return res.status(400).json({ error: 'Registration failed' });
            }

            // Hash the password (cost 12 is current industry standard, 2024+)
            const hashedPassword = await bcrypt.hash(password, 12);

            // Insert new user
            const [result] = await db.query(
                'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)',
                [fullName, email, hashedPassword]
            );

            // Don't auto-login on signup — force explicit login flow
            return res.status(201).json({
                message: 'Account created successfully',
                userId: result.insertId,
            });
        } catch (err) {
            console.error('Signup error:', err); // log server-side only
            return res.status(500).json({ error: 'Server error' });
        }
    }
);

// --- LOGIN ---
app.post('/api/login',
    authLimiter,
    [
        body('email').trim().isEmail().normalizeEmail().isLength({ max: 254 }),
        body('password').isString().isLength({ min: 1, max: 72 }),
    ],
    handleValidation,
    async (req, res) => {
        const { email, password } = req.body;

        try {
            const [results] = await db.query(
                'SELECT id, full_name, email, password FROM users WHERE email = ?',
                [email]
            );

            let user = null;
            let hashToCompare = DUMMY_HASH;

            if (results.length > 0) {
                user = results[0];
                hashToCompare = user.password;
            }

            // Always run bcrypt.compare to equalize timing (prevents user enumeration)
            const passwordMatch = await bcrypt.compare(password, hashToCompare);

            if (!user || !passwordMatch) {
                return res.status(401).json({ error: GENERIC_AUTH_ERROR });
            }

            // Issue JWT (short-lived access token)
            const token = jwt.sign(
                { sub: user.id, email: user.email },
                JWT_SECRET,
                { expiresIn: '1h', issuer: 'fireguard-api' }
            );

            return res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    fullName: user.full_name,
                    email: user.email,
                },
            });
        } catch (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Server error' });
        }
    }
);

// --- EXAMPLE PROTECTED ROUTE ---
app.get('/api/me', requireAuth, async (req, res) => {
    try {
        const [results] = await db.query(
            'SELECT id, full_name, email FROM users WHERE id = ?',
            [req.user.sub]
        );
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const u = results[0];
        return res.json({
            user: { id: u.id, fullName: u.full_name, email: u.email },
        });
    } catch (err) {
        console.error('Me error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// --- HEALTH CHECK (public) ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ============================================================
// ERROR HANDLING (must be LAST)
// ============================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Global error handler — never leak stack traces to client
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Server error' });
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
