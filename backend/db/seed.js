require('dotenv').config();
const path        = require('path');
const pool        = require('../config/db');
const runSQLFiles = require('./run-sql-files');

runSQLFiles(pool, path.join(__dirname, 'seeds'), 'seed')
  .then(() => pool.end())
  .catch(err => {
    console.error('[seed] FAILED:', err.message);
    pool.end().finally(() => process.exit(1));
  });
