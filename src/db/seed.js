'use strict';
const bcrypt = require('bcryptjs');

const DEFAULT_PRODUCTS = [
  { slug: 'misto-quente', name: 'Misto quente', description: 'Pao tostado, queijo e presunto.', category: 'Lanches', priceCents: 850, emoji: '🥪' },
  { slug: 'pao-de-queijo', name: 'Pao de queijo', description: 'Assado na hora, por fora douradinho.', category: 'Lanches', priceCents: 500, emoji: '🧀' },
  { slug: 'sanduiche-natural', name: 'Sanduiche natural', description: 'Frango, cenoura e folhas frescas.', category: 'Lanches', priceCents: 950, emoji: '🥙' },
  { slug: 'suco-laranja', name: 'Suco de laranja', description: 'Garrafa individual, 300 ml.', category: 'Bebidas', priceCents: 650, emoji: '🍊' },
  { slug: 'agua-mineral', name: 'Agua mineral', description: 'Agua sem gas, 500 ml.', category: 'Bebidas', priceCents: 400, emoji: '💧' },
  { slug: 'bolo-chocolate', name: 'Bolo de chocolate', description: 'Fatia de bolo caseiro.', category: 'Doces', priceCents: 600, emoji: '🍰' },
];

async function seed(pool, options = {}) {
  const adminName = options.adminName || process.env.ADMIN_NAME || 'Administrador da Cantina';
  const adminEmail = (options.adminEmail || process.env.ADMIN_EMAIL || 'admin@estulanches.local').toLowerCase();
  const adminPassword = options.adminPassword || process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD precisa ter pelo menos 12 caracteres.');
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await pool.query(
    `INSERT INTO admins (name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING`,
    [adminName, adminEmail, passwordHash],
  );

  for (const product of DEFAULT_PRODUCTS) {
    await pool.query(
      `INSERT INTO products (slug, name, description, category, price_cents, emoji)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO NOTHING`,
      [product.slug, product.name, product.description, product.category, product.priceCents, product.emoji],
    );
  }
}

module.exports = { seed, DEFAULT_PRODUCTS };
