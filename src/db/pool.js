'use strict';
const { Pool } = require('pg');

function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL nao foi configurada.');
  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 12),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: 'estulanches-api',
  });
}

module.exports = { createPool };
