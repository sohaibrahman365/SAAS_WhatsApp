const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router     = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tenantId: user.tenant_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email.toLowerCase().trim(), 'active']
    );
    const user = rows[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      token: makeToken(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenant_id },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register — create account and set password
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, tenantId } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const normalizedEmail = email.toLowerCase().trim();

    const isSuperAdmin =
      normalizedEmail === (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase();
    const role = isSuperAdmin ? 'super_admin' : tenantId ? 'admin' : 'analyst';

    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, role = EXCLUDED.role
       RETURNING id, email, name, role, tenant_id`,
      [normalizedEmail, name, passwordHash, role, tenantId || null]
    );

    res.status(201).json({
      token: makeToken(rows[0]),
      user: rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — returns current user from JWT
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, role, tenant_id, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/google — placeholder until Google credentials configured
router.get('/google', (req, res) => {
  const configured =
    process.env.GOOGLE_CLIENT_ID &&
    !process.env.GOOGLE_CLIENT_ID.startsWith('xxx');

  if (!configured) {
    return res.status(503).json({
      error: 'Google OAuth not configured',
      hint: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Railway Variables',
    });
  }
  // Full passport-google-oauth20 flow added in Phase 2b
  res.status(501).json({ error: 'Google OAuth coming in Phase 2b' });
});

module.exports = router;
