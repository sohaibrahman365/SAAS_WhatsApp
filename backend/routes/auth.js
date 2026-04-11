const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getUserPermissions } = require('./roles');
const { logAudit } = require('../middleware/audit');

const router     = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, roleId: user.role_id || null, tenantId: user.tenant_id },
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

    logAudit({ tenantId: user.tenant_id, userId: user.id, userEmail: user.email, action: 'login', resource: 'auth', details: { method: 'password' }, req });

    res.json({
      token: makeToken(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenant_id },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register — create account and set password
// New tenants: pass businessName to auto-create a tenant and become its admin
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, tenantId, businessName } = req.body;
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

    let effectiveTenantId = tenantId || null;
    let role = isSuperAdmin ? 'super_admin' : tenantId ? 'admin' : 'analyst';

    // Auto-create tenant for new business signups
    if (!isSuperAdmin && !tenantId && businessName) {
      const { rows: tenantRows } = await pool.query(
        `INSERT INTO tenants (name, email, plan, status)
         VALUES ($1, $2, 'starter', 'active')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [businessName.trim(), normalizedEmail]
      );
      effectiveTenantId = tenantRows[0].id;
      role = 'admin';
    }

    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name,
         role = EXCLUDED.role, tenant_id = COALESCE(EXCLUDED.tenant_id, users.tenant_id)
       RETURNING id, email, name, role, tenant_id`,
      [normalizedEmail, name, passwordHash, role, effectiveTenantId]
    );

    res.status(201).json({
      token: makeToken(rows[0]),
      user: rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — returns current user with permissions
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, role, role_id, tenant_id, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    const permResult = await getUserPermissions(user.id);
    user.permissions = permResult.permissions || [];
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
//  Google OAuth helpers
// ---------------------------------------------------------------------------

/**
 * Find or create a user from Google profile data.
 * Returns the full user row ready for JWT signing.
 */
async function findOrCreateGoogleUser({ googleId, email, name }) {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Look up by google_id first (fastest, most reliable)
  const byGoogle = await pool.query(
    'SELECT * FROM users WHERE google_id = $1 AND status = $2',
    [googleId, 'active']
  );
  if (byGoogle.rows[0]) return byGoogle.rows[0];

  // 2. Look up by email — maybe the user registered with password first
  const byEmail = await pool.query(
    'SELECT * FROM users WHERE email = $1 AND status = $2',
    [normalizedEmail, 'active']
  );
  if (byEmail.rows[0]) {
    // Link Google account to existing email-based user
    const linked = await pool.query(
      `UPDATE users
         SET google_id = $1,
             auth_provider = CASE
               WHEN auth_provider = 'local' THEN 'both'
               WHEN auth_provider IS NULL    THEN 'google'
               ELSE auth_provider
             END
       WHERE id = $2
       RETURNING *`,
      [googleId, byEmail.rows[0].id]
    );
    return linked.rows[0];
  }

  // 3. Brand-new user — auto-create tenant + make them admin
  const isSuperAdmin =
    normalizedEmail === (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase();

  if (isSuperAdmin) {
    // Super admin — no tenant, platform-level user
    const created = await pool.query(
      `INSERT INTO users (email, name, google_id, role, auth_provider)
       VALUES ($1, $2, $3, 'super_admin', 'google')
       RETURNING *`,
      [normalizedEmail, name, googleId]
    );
    return created.rows[0];
  }

  // Regular user — auto-create a tenant for them
  const tenantName = name.split(' ')[0] + "'s Business";
  const { rows: tenantRows } = await pool.query(
    `INSERT INTO tenants (name, email, plan, status)
     VALUES ($1, $2, 'starter', 'active')
     RETURNING *`,
    [tenantName, normalizedEmail]
  );
  const tenant = tenantRows[0];

  // Create user as admin of the new tenant
  const created = await pool.query(
    `INSERT INTO users (email, name, google_id, role, tenant_id, auth_provider)
     VALUES ($1, $2, $3, 'admin', $4, 'google')
     RETURNING *`,
    [normalizedEmail, name, googleId, tenant.id]
  );
  return created.rows[0];
}

// GET /api/auth/google/client-id — expose client ID to frontend
router.get('/google/client-id', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || clientId.startsWith('xxx')) {
    return res.status(503).json({ error: 'Google OAuth not configured' });
  }
  res.json({ clientId });
});

// POST /api/auth/google/token — verify Google ID token from frontend (GIS)
router.post('/google/token', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'credential is required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const user = await findOrCreateGoogleUser({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email,
    });

    logAudit({ tenantId: user.tenant_id, userId: user.id, userEmail: user.email, action: 'login', resource: 'auth', details: { method: 'google' }, req });

    res.json({
      token: makeToken(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenant_id },
    });
  } catch (err) {
    if (err.message && err.message.includes('Token used too late')) {
      return res.status(401).json({ error: 'Google token expired — please sign in again' });
    }
    if (err.message && err.message.includes('Invalid token')) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    next(err);
  }
});

// GET /api/auth/google — redirect to Google consent screen (server-side flow)
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || clientId.startsWith('xxx')) {
    return res.status(503).json({
      error: 'Google OAuth not configured',
      hint: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Railway Variables',
    });
  }

  const callbackUrl = process.env.GOOGLE_CALLBACK_URL
    || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /api/auth/google/callback — exchange code for tokens (server-side flow)
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    const callbackUrl = process.env.GOOGLE_CALLBACK_URL
      || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken({
      code,
      redirect_uri: callbackUrl,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    });

    // Verify the ID token we received
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const user = await findOrCreateGoogleUser({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email,
    });

    const jwtToken = makeToken(user);

    // Redirect to frontend with token in URL hash
    const frontendBase = process.env.FRONTEND_URL || 'https://sohaibrahman365.github.io/SAAS_WhatsApp';
    res.redirect(`${frontendBase}/login.html#token=${jwtToken}`);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/onboarding-status — check if tenant needs setup
router.get('/onboarding-status', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.json({ needsOnboarding: false, role: req.user.role });

    const { rows: settings } = await pool.query(
      'SELECT * FROM tenant_settings WHERE tenant_id = $1', [tenantId]
    );
    const { rows: tenant } = await pool.query(
      'SELECT * FROM tenants WHERE id = $1', [tenantId]
    );

    const t = tenant[0] || {};
    const s = settings[0] || {};

    // Check what's been configured
    const steps = {
      business_name: !!(t.name && !t.name.endsWith("'s Business")),
      industry: !!s.ai_industry,
      whatsapp: !!(s.whatsapp_api_token),
      products: false,
      customers: false,
    };

    // Check if they have products/customers
    const [prodCount, custCount] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM products WHERE tenant_id = $1', [tenantId]),
      pool.query('SELECT COUNT(*)::int AS c FROM customers WHERE tenant_id = $1', [tenantId]),
    ]);
    steps.products = prodCount.rows[0].c > 0;
    steps.customers = custCount.rows[0].c > 0;

    const completedSteps = Object.values(steps).filter(Boolean).length;
    const needsOnboarding = completedSteps < 2; // at least business name + industry

    res.json({
      needsOnboarding,
      steps,
      completedSteps,
      totalSteps: Object.keys(steps).length,
      tenantName: t.name,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
