require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const app = express();

// ── Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── Routes ────────────────────────────────────────────────
app.use('/api/health', require('./routes/health'));

// Phase 2 — Auth
app.use('/api/auth', require('./routes/auth'));

// Phase 3 — Core CRUD
app.use('/api/tenants',   require('./routes/tenants'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/campaigns', require('./routes/campaigns'));

// Phase 4 — WhatsApp
app.use('/api/whatsapp', require('./routes/whatsapp'));

// Phase 5 — AI Analysis
app.use('/api/ai', require('./routes/ai'));

// Phase 6 — BI Analytics
app.use('/api/bi', require('./routes/bi'));

// Phase 7 — n8n Webhooks
app.use('/api/webhooks', require('./routes/webhooks'));

// Phase 8 — Multi-tenant Settings & Team Management
app.use('/api/tenant-settings', require('./routes/tenantSettings'));
app.use('/api/team', require('./routes/team'));

// Phase 9 — Dynamic Roles & Permissions
app.use('/api/roles', require('./routes/roles').router);

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error handler ─────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Auto-migrate on startup ──────────────────────────────
const fs   = require('fs');
const path = require('path');
const pool = require('./config/db');

async function runMigrations() {
  const migDir = path.join(__dirname, 'db', 'migrations');
  if (!fs.existsSync(migDir)) return;
  const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    try {
      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      await pool.query(sql);
      console.log(`[migrate] ${file} ✓`);
    } catch (err) {
      // Ignore "already exists" errors, log others
      if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
        console.error(`[migrate] ${file} — ${err.message}`);
      }
    }
  }
}

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] GeniSearch backend running on http://localhost:${PORT}`);
    console.log(`[server] ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[server] Health: http://localhost:${PORT}/api/health`);
  });
});

module.exports = app;
