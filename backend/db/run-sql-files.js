const fs   = require('fs');
const path = require('path');

/**
 * Runs all .sql files in a directory sequentially.
 * Files are sorted alphabetically so numbering (001_, 002_…) controls order.
 */
async function runSQLFiles(pool, dir, label) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  console.log(`[${label}] Running ${files.length} file(s)…`);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`[${label}] → ${file}`);
    await pool.query(sql);
    console.log(`[${label}] ✓ ${file} done`);
  }
  console.log(`[${label}] All complete.`);
}

module.exports = runSQLFiles;
