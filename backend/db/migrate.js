require('dotenv').config();
const path        = require('path');
const pool        = require('../config/db');
const runSQLFiles = require('./run-sql-files');

runSQLFiles(pool, path.join(__dirname, 'migrations'), 'migrate')
  .then(() => pool.end())
  .catch(err => {
    console.error('[migrate] FAILED:', err.message);
    pool.end().finally(() => process.exit(1));
  });
