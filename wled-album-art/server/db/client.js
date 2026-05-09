const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;

function isConfigured() {
  return !!(process.env.DB_HOST);
}

function getPool() {
  if (!isConfigured()) return null;
  if (pool) return pool;

  pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('[db] Pool error:', err.message);
  });

  return pool;
}

async function runMigrations() {
  const p = getPool();
  if (!p) return;

  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations/001_initial.sql'),
    'utf8'
  );

  try {
    await p.query(sql);
    console.log('[db] Migrations applied');
  } catch (err) {
    console.error('[db] Migration error:', err.message);
  }
}

async function healthCheck() {
  const p = getPool();
  if (!p) return { connected: false, configured: false };

  try {
    const [countRes, sizeRes] = await Promise.all([
      p.query('SELECT COUNT(*) as count FROM plays'),
      p.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size"),
    ]);
    return {
      connected: true,
      configured: true,
      playCount: parseInt(countRes.rows[0].count, 10),
      dbSize: sizeRes.rows[0].size,
    };
  } catch (err) {
    return { connected: false, configured: true, error: err.message };
  }
}

module.exports = { getPool, isConfigured, runMigrations, healthCheck };
