'use strict';

// Carrega variaveis do arquivo .env quando o app roda fora do Docker.
require('dotenv').config({ path: require('node:path').resolve(__dirname, '..', '.env') });
const { createPool } = require('./db/pool');
const { createApp } = require('./app');

const port = Number(process.env.PORT || process.env.APP_PORT || 3000);
const pool = createPool();
const app = createApp({ pool, jwtSecret: process.env.JWT_SECRET });

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[server] EstuLanches iniciado na porta ${port}.`);
});

async function shutdown(signal) {
  console.log(`[server] ${signal} recebido; encerrando conexoes.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
