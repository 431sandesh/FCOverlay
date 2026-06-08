const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ─── DATABASE ────────────────────────────────────────────────
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            username VARCHAR(100),
            initials VARCHAR(5),
            avatar_color VARCHAR(20) DEFAULT '#10b981',
            is_verified BOOLEAN DEFAULT FALSE,
            verification_token VARCHAR(255),
            verification_expires TIMESTAMP,
            reset_token VARCHAR(255),
            reset_expires TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS user_data (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            data_key VARCHAR(100) NOT NULL,
            data_value JSONB,
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, data_key)
        );
    `);
    console.log('Database ready');
}

// ─── EMAIL ───────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function sendVerificationEmail(email, fullName, token) {
    const link = `https://bhakundofx.up.railway.app/api/auth/verify/${token}`;
    await transporter.sendMail({
        from: `"BhakundoFX" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify your BhakundoFX account',
        html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0a0f0d;color:#fff;border-radius:12px;">
            <h2 style="color:#10b981;">Welcome to BhakundoFX, ${fullName}!</h2>
            <p style="color:#9ca3af;">Click the button below to verify your email and activate your account.</p>
            <a href="${link}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#10b981;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;">Verify Email</a>
            <p style="color:#6b7280;font-size:12px;">Link expires in 24 hours. If you didn't sign up, ignore this email.</p>
        </div>`
    });
}

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No token provided' });
    const token = header.split(' ')[1];
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// ─── AUTH ROUTES ─────────────────────────────────────────────

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, fullName } = req.body;
        if (!email || !password || !fullName)
            return res.status(400).json({ error: 'All fields are required' });
        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
        if (exists.rows.length > 0)
            return res.status(400).json({ error: 'Email already registered' });

        const passwordHash = await bcrypt.hash(password, 12);
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

        const result = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, initials, verification_token, verification_expires)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [email.toLowerCase(), passwordHash, fullName, initials, verificationToken, verificationExpires]
        );

        await sendVerificationEmail(email, fullName, verificationToken);
        res.json({ success: true, message: 'Account created! Check your email to verify.' });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// Verify email
app.get('/api/auth/verify/:token', async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE users SET is_verified=TRUE, verification_token=NULL, verification_expires=NULL
             WHERE verification_token=$1 AND verification_expires > NOW() RETURNING id`,
            [req.params.token]
        );
        if (result.rows.length === 0)
            return res.redirect('/login.html?error=invalid_or_expired_link');
        res.redirect('/login.html?verified=true');
    } catch (e) {
        res.redirect('/login.html?error=verification_failed');
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: 'Email and password are required' });

        const result = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
        if (result.rows.length === 0)
            return res.status(401).json({ error: 'Invalid email or password' });

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword)
            return res.status(401).json({ error: 'Invalid email or password' });

        if (!user.is_verified)
            return res.status(403).json({ error: 'Please verify your email before logging in.', needsVerification: true });

        const token = jwt.sign(
            { id: user.id, email: user.email, fullName: user.full_name, initials: user.initials, avatarColor: user.avatar_color },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: { id: user.id, email: user.email, fullName: user.full_name, initials: user.initials, avatarColor: user.avatar_color }
        });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// Resend verification
app.post('/api/auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email=$1 AND is_verified=FALSE', [email.toLowerCase()]);
        if (result.rows.length === 0)
            return res.status(400).json({ error: 'Email not found or already verified' });

        const user = result.rows[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await pool.query('UPDATE users SET verification_token=$1, verification_expires=$2 WHERE id=$3', [token, expires, user.id]);
        await sendVerificationEmail(email, user.full_name, token);
        res.json({ success: true, message: 'Verification email resent!' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to resend email' });
    }
});

// ─── USER ROUTES ─────────────────────────────────────────────

// Get profile
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, full_name, initials, avatar_color, created_at FROM users WHERE id=$1',
            [req.user.id]
        );
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update profile
app.put('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const { fullName, avatarColor } = req.body;
        const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const result = await pool.query(
            'UPDATE users SET full_name=$1, initials=$2, avatar_color=$3 WHERE id=$4 RETURNING id, email, full_name, initials, avatar_color',
            [fullName, initials, avatarColor || '#10b981', req.user.id]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ─── DATA ROUTES (replaces localStorage) ─────────────────────

// Get data by key
app.get('/api/data/:key', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT data_value FROM user_data WHERE user_id=$1 AND data_key=$2',
            [req.user.id, req.params.key]
        );
        if (result.rows.length === 0) return res.json({ data: null });
        res.json({ data: result.rows[0].data_value });
    } catch (e) {
        res.status(500).json({ error: 'Failed to get data' });
    }
});

// Save data by key
app.post('/api/data/:key', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            `INSERT INTO user_data (user_id, data_key, data_value, updated_at)
             VALUES ($1,$2,$3,NOW())
             ON CONFLICT (user_id, data_key) DO UPDATE SET data_value=$3, updated_at=NOW()`,
            [req.user.id, req.params.key, req.body.data]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// Get all user data at once (for loading on login)
app.get('/api/data', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT data_key, data_value FROM user_data WHERE user_id=$1',
            [req.user.id]
        );
        const data = {};
        result.rows.forEach(row => { data[row.data_key] = row.data_value; });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load data' });
    }
});

// ─── PAGE ROUTES ─────────────────────────────────────────────
app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.get('/control',   (req, res) => res.sendFile(path.join(__dirname, 'control.html')));
app.get('/setup',     (req, res) => res.sendFile(path.join(__dirname, 'setup.html')));
app.get('/customize', (req, res) => res.sendFile(path.join(__dirname, 'customize.html')));
app.get('/overlay',   (req, res) => res.sendFile(path.join(__dirname, 'overlay.html')));
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── START ───────────────────────────────────────────────────
initDB().then(() => {
    app.listen(PORT, () => console.log(`BhakundoFX running on port ${PORT}`));
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
