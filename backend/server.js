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

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] GeniSearch backend running on http://localhost:${PORT}`);
  console.log(`[server] ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[server] Health: http://localhost:${PORT}/api/health`);
});

module.exports = app;
