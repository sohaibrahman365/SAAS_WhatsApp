require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('../config/db');

async function seed() {
  const seedsDir = path.join(__dirname, 'seeds');
  const files = fs.readdirSync(seedsDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`[seed] Running ${files.length} seed file(s)…`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
    console.log(`[seed] → ${file}`);
    await pool.query(sql);
    console.log(`[seed] ✓ ${file} done`);
  }

  console.log('[seed] All seeds complete.');
  await pool.end();
}

seed().catch(err => {
  console.error('[seed] FAILED:', err.message);
  process.exit(1);
});
