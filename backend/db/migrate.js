require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('../config/db');

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`[migrate] Running ${files.length} migration(s)…`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`[migrate] → ${file}`);
    await pool.query(sql);
    console.log(`[migrate] ✓ ${file} done`);
  }

  console.log('[migrate] All migrations complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});
