const express = require('express');
const pool    = require('../config/db');
const router  = express.Router();

// GET /api/health
router.get('/', async (req, res) => {
  let dbStatus = 'ok';
  let dbLatency = null;

  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    dbLatency = Date.now() - t0;
  } catch {
    dbStatus = 'unreachable';
  }

  const status = dbStatus === 'ok' ? 200 : 503;

  res.status(status).json({
    status:  dbStatus === 'ok' ? 'ok' : 'degraded',
    version: '1.0.0',
    env:     process.env.NODE_ENV || 'development',
    db:      { status: dbStatus, latency_ms: dbLatency },
    uptime_s: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
