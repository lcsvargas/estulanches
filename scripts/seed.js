'use strict';

// Permite executar os scripts localmente usando as variaveis de .env.
require('dotenv').config({ path: require('node:path').resolve(__dirname, '..', '.env') });
const { createPool } = require('../src/db/pool');
const { seed } = require('../src/db/seed');

(async () => {
  const pool = createPool();
  try {
    await seed(pool);
    console.log('[seed] Administrador e cardapio inicial conferidos.');
  } catch (error) {
    console.error('[seed] Falha ao preparar dados iniciais:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
