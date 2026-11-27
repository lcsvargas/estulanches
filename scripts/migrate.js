'use strict';

// Permite executar os scripts localmente usando as variaveis de .env.
require('dotenv').config({ path: require('node:path').resolve(__dirname, '..', '.env') });
const { createPool } = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');

(async () => {
  const pool = createPool();
  try {
    await migrate(pool);
    console.log('[migrate] Banco de dados atualizado.');
  } catch (error) {
    console.error('[migrate] Falha na migracao:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
