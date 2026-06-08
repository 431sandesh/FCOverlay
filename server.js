const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const multer = require('multer');

// ─── CLOUDINARY CONFIG ───────────────────────────────────────
cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Upload buffer to Cloudinary
async function uploadToCloudinary(buffer, folder, publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, public_id: publicId, overwrite: true, 
              transformation: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }] },
            (error, result) => error ? reject(error) : resolve(result.secure_url)
        );
        stream.end(buffer);
    });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
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
            username VARCHAR(100) UNIQUE,
            organization_name VARCHAR(255),
            initials VARCHAR(5),
            avatar_color VARCHAR(20) DEFAULT '#10b981',
            avatar_data TEXT,
            is_verified BOOLEAN DEFAULT FALSE,
            verification_token VARCHAR(255),
            verification_expires TIMESTAMP,
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

    // Add new columns if upgrading from old schema
    const cols = ['organization_name VARCHAR(255)', 'avatar_data TEXT', 'username VARCHAR(100)'];
    for (const col of cols) {
        const name = col.split(' ')[0];
        try {
            await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col}`);
        } catch(e) {}
    }

    console.log('Database ready');
}

// ─── EMAIL ───────────────────────────────────────────────────
async function sendVerificationEmail(email, fullName, token) {
    try {
        const link = `https://bhakundofx.up.railway.app/api/auth/verify/${token}`;
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: { name: 'BhakundoFX', email: process.env.EMAIL_USER },
                to: [{ email: email, name: fullName }],
                subject: 'Verify your BhakundoFX account',
                htmlContent: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0a0f0d;color:#fff;border-radius:12px;">
                    <h2 style="color:#10b981;">Welcome to BhakundoFX, ${fullName}!</h2>
                    <p style="color:#9ca3af;">Click the button below to verify your email and activate your account.</p>
                    <a href="${link}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#10b981;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;">Verify Email</a>
                    <p style="color:#6b7280;font-size:12px;">Link expires in 24 hours. If you did not sign up, ignore this email.</p>
                </div>`
            })
        });
        if (!response.ok) {
            const err = await response.text();
            console.error('Brevo error:', err);
            return false;
        }
        console.log('Verification email sent to:', email);
        return true;
    } catch (e) {
        console.error('Email send failed:', e.message);
        return false;
    }
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
        const { email, password, fullName, username, organizationName, avatarData } = req.body;

        if (!email || !password || !fullName || !username)
            return res.status(400).json({ error: 'Name, username, email and password are required' });
        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        if (!/^[a-zA-Z0-9_]+$/.test(username))
            return res.status(400).json({ error: 'Username can only contain letters, numbers and underscores' });

        // Check email and username
        const emailExists = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
        if (emailExists.rows.length > 0)
            return res.status(400).json({ error: 'Email already registered' });

        const usernameExists = await pool.query('SELECT id FROM users WHERE LOWER(username)=$1', [username.toLowerCase()]);
        if (usernameExists.rows.length > 0)
            return res.status(400).json({ error: 'Username already taken' });

        const passwordHash = await bcrypt.hash(password, 12);
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

        await pool.query(
            `INSERT INTO users (email, password_hash, full_name, username, organization_name, initials, avatar_data, verification_token, verification_expires)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [email.toLowerCase(), passwordHash, fullName, username, organizationName || null, initials, avatarData || null, verificationToken, verificationExpires]
        );

        // Auto-verify for now — email system will be enabled later
        await pool.query('UPDATE users SET is_verified=TRUE WHERE email=$1', [email.toLowerCase()]);
        sendVerificationEmail(email, fullName, verificationToken); // fire and forget
        res.json({ success: true, message: 'Account created! You can now log in.', autoVerified: true });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Registration failed: ' + e.message });
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
            return res.redirect('/login.html?error=invalid_link');
        res.redirect('/login.html?verified=true');
    } catch (e) {
        res.redirect('/login.html?error=verification_failed');
    }
});

// Login (username or email)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        if (!login || !password)
            return res.status(400).json({ error: 'Please fill in all fields' });

        // Find by email or username
        const result = await pool.query(
            'SELECT * FROM users WHERE email=$1 OR LOWER(username)=$2',
            [login.toLowerCase(), login.toLowerCase()]
        );
        if (result.rows.length === 0)
            return res.status(401).json({ error: 'Invalid username/email or password' });

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword)
            return res.status(401).json({ error: 'Invalid username/email or password' });

        if (!user.is_verified)
            return res.status(403).json({ error: 'Please verify your email before logging in.', needsVerification: true, email: user.email });

        const token = jwt.sign(
            { id: user.id, email: user.email, fullName: user.full_name, username: user.username,
              organizationName: user.organization_name, initials: user.initials,
              avatarColor: user.avatar_color, avatarData: user.avatar_data },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true, token,
            user: { id: user.id, email: user.email, fullName: user.full_name, username: user.username,
                    organizationName: user.organization_name, initials: user.initials,
                    avatarColor: user.avatar_color, avatarData: user.avatar_data }
        });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Login failed: ' + e.message });
    }
});

// Resend verification
app.post('/api/auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Also accept username - find by email or username
        const result = await pool.query(
            'SELECT * FROM users WHERE (email=$1 OR LOWER(username)=$2) AND is_verified=FALSE',
            [email.toLowerCase(), email.toLowerCase()]
        );
        if (result.rows.length === 0)
            return res.status(400).json({ error: 'Account not found or already verified' });

        const user = result.rows[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await pool.query(
            'UPDATE users SET verification_token=$1, verification_expires=$2 WHERE id=$3',
            [token, expires, user.id]
        );
        const sent = await sendVerificationEmail(user.email, user.full_name, token);
        if (sent) {
            res.json({ success: true, message: 'Verification email sent! Check your inbox and spam folder.' });
        } else {
            // If email fails, just auto-verify so user isn't stuck
            await pool.query('UPDATE users SET is_verified=TRUE WHERE id=$1', [user.id]);
            res.json({ success: true, message: 'Email could not be sent. Your account has been auto-verified — you can log in now!', autoVerified: true });
        }
    } catch (e) {
        console.error('Resend error:', e);
        res.status(500).json({ error: 'Failed to resend: ' + e.message });
    }
});

// ─── USER ROUTES ─────────────────────────────────────────────

app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, full_name, username, organization_name, initials, avatar_color, avatar_data, created_at FROM users WHERE id=$1',
            [req.user.id]
        );
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

app.put('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const { fullName, organizationName, avatarColor, avatarData, username } = req.body;
        if (username) {
            const exists = await pool.query('SELECT id FROM users WHERE LOWER(username)=$1 AND id!=$2', [username.toLowerCase(), req.user.id]);
            if (exists.rows.length > 0) return res.status(400).json({ error: 'Username already taken' });
        }
        const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const result = await pool.query(
            `UPDATE users SET full_name=$1, initials=$2, avatar_color=$3, avatar_data=$4, organization_name=$5, username=$6
             WHERE id=$7 RETURNING id, email, full_name, username, organization_name, initials, avatar_color, avatar_data`,
            [fullName, initials, avatarColor || '#10b981', avatarData || null, organizationName || null, username || null, req.user.id]
        );
        const updated = result.rows[0];
        const token = jwt.sign(
            { id: updated.id, email: updated.email, fullName: updated.full_name, username: updated.username,
              organizationName: updated.organization_name, initials: updated.initials,
              avatarColor: updated.avatar_color, avatarData: updated.avatar_data },
            process.env.JWT_SECRET, { expiresIn: '7d' }
        );
        res.json({ success: true, user: updated, token });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ─── DATA ROUTES ─────────────────────────────────────────────

app.get('/api/data/:key', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT data_value FROM user_data WHERE user_id=$1 AND data_key=$2',
            [req.user.id, req.params.key]
        );
        res.json({ data: result.rows.length === 0 ? null : result.rows[0].data_value });
    } catch (e) {
        res.status(500).json({ error: 'Failed to get data' });
    }
});

app.post('/api/data/:key', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            `INSERT INTO user_data (user_id, data_key, data_value, updated_at) VALUES ($1,$2,$3,NOW())
             ON CONFLICT (user_id, data_key) DO UPDATE SET data_value=$3, updated_at=NOW()`,
            [req.user.id, req.params.key, req.body.data]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

app.get('/api/data', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT data_key, data_value FROM user_data WHERE user_id=$1', [req.user.id]);
        const data = {};
        result.rows.forEach(row => { data[row.data_key] = row.data_value; });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load data' });
    }
});

// ─── CLOUDINARY UPLOAD ROUTES ────────────────────────────────

// Upload player/team/tournament photo
app.post('/api/upload/:type/:id', authMiddleware, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const folder = `bhakundofx/user_${req.user.id}/${req.params.type}`;
        const publicId = req.params.id + '_' + Date.now();
        const url = await uploadToCloudinary(req.file.buffer, folder, publicId);
        res.json({ success: true, url });
    } catch (e) {
        console.error('Upload error:', e);
        res.status(500).json({ error: 'Upload failed: ' + e.message });
    }
});

// Upload profile avatar
app.post('/api/user/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const url = await uploadToCloudinary(
            req.file.buffer,
            'bhakundofx/avatars',
            'user_' + req.user.id
        );
        await pool.query('UPDATE users SET avatar_data=$1 WHERE id=$2', [url, req.user.id]);
        // Update token
        const userResult = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
        const user = userResult.rows[0];
        const token = jwt.sign(
            { id: user.id, email: user.email, fullName: user.full_name, username: user.username,
              organizationName: user.organization_name, initials: user.initials,
              avatarColor: user.avatar_color, avatarData: url },
            process.env.JWT_SECRET, { expiresIn: '7d' }
        );
        localStorage_user = { ...req.user, avatarData: url };
        res.json({ success: true, url, token });
    } catch (e) {
        console.error('Avatar upload error:', e);
        res.status(500).json({ error: 'Avatar upload failed: ' + e.message });
    }
});

// ─── PUBLIC OVERLAY API (no auth — used by OBS browser source) ──
app.get('/api/public/match/:userId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT data_value FROM user_data WHERE user_id=$1 AND data_key=$2',
            [req.params.userId, 'match_state']
        );
        if (result.rows.length === 0) return res.json({ data: null });
        res.json({ data: result.rows[0].data_value });
    } catch (e) {
        res.status(500).json({ error: 'Failed to get overlay data' });
    }
});

app.get('/api/public/db/:userId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT data_value FROM user_data WHERE user_id=$1 AND data_key=$2',
            [req.params.userId, 'bfx_database']
        );
        if (result.rows.length === 0) return res.json({ data: null });
        res.json({ data: result.rows[0].data_value });
    } catch (e) {
        res.status(500).json({ error: 'Failed to get db data' });
    }
});

// ─── PAGE ROUTES ─────────────────────────────────────────────
app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.get('/login',     (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login.html',(req, res) => res.redirect(301, '/login'));
app.get('/control',   (req, res) => res.sendFile(path.join(__dirname, 'control.html')));
app.get('/setup',     (req, res) => res.sendFile(path.join(__dirname, 'setup.html')));
app.get('/customize', (req, res) => res.sendFile(path.join(__dirname, 'customize.html')));
app.get('/overlay',   (req, res) => res.sendFile(path.join(__dirname, 'overlay.html')));
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── START ───────────────────────────────────────────────────
initDB().then(() => {
    app.listen(PORT, () => console.log(`BhakundoFX running on port ${PORT}`));
}).catch(err => {
    console.error('DB init failed:', err);
    process.exit(1);
});
