'use strict';
const fs = require('node:fs');
const path = require('node:path');

async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(80) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationDir = path.join(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const alreadyApplied = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (alreadyApplied.rowCount) continue;

    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] ${file} aplicado com sucesso.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { migrate };
