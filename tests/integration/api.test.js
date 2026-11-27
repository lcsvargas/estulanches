'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPool } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { seed } = require('../../src/db/seed');
const { createApp } = require('../../src/app');

const databaseUrl = process.env.TEST_DATABASE_URL;

test('integracao: health, cardapio, pedidos e operacoes administrativas', { skip: !databaseUrl }, async (t) => {
  const pool = createPool(databaseUrl);
  const jwtSecret = process.env.JWT_SECRET || 'test-secret-that-is-long-enough-for-automated-tests';
  let server;
  try {
    await migrate(pool);
    await pool.query('TRUNCATE order_items, orders, products, admins RESTART IDENTITY CASCADE');
    await seed(pool, {
      adminName: 'Admin Teste',
      adminEmail: process.env.ADMIN_EMAIL || 'admin@test.local',
      adminPassword: process.env.ADMIN_PASSWORD || 'Teste_Seguro_123',
    });

    const app = createApp({ pool, jwtSecret });
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResponse.status, 200);
    assert.equal((await healthResponse.json()).database, 'connected');

    const menuResponse = await fetch(`${baseUrl}/api/menu`);
    assert.equal(menuResponse.status, 200);
    const menu = await menuResponse.json();
    assert.ok(menu.products.length >= 1);
    const product = menu.products[0];

    const blockedResponse = await fetch(`${baseUrl}/api/admin/products`);
    assert.equal(blockedResponse.status, 401);

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL || 'admin@test.local', password: process.env.ADMIN_PASSWORD || 'Teste_Seguro_123' }),
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();
    assert.ok(login.token);
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };

    const newProductResponse = await fetch(`${baseUrl}/api/admin/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Cookie de teste', description: 'Produto criado pelo teste.', category: 'Doces', priceCents: 525, emoji: '🍪' }),
    });
    assert.equal(newProductResponse.status, 201);

    const orderResponse = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Estudante de Teste',
        classroom: '2o ADS',
        notes: 'Teste automatizado',
        items: [{ productId: product.id, quantity: 2 }],
      }),
    });
    assert.equal(orderResponse.status, 201);
    const createdOrder = (await orderResponse.json()).order;
    assert.equal(createdOrder.totalCents, product.priceCents * 2);
    assert.match(createdOrder.code, /^[A-F0-9]{8}$/);

    const ordersResponse = await fetch(`${baseUrl}/api/admin/orders`, { headers: authHeaders });
    assert.equal(ordersResponse.status, 200);
    const orders = await ordersResponse.json();
    assert.equal(orders.orders.length, 1);
    assert.equal(orders.orders[0].items[0].quantity, 2);

    const updateStatusResponse = await fetch(`${baseUrl}/api/admin/orders/${orders.orders[0].id}/status`, {
      method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'preparando' }),
    });
    assert.equal(updateStatusResponse.status, 200);
    assert.equal((await updateStatusResponse.json()).order.status, 'preparando');

    await t.test('a rota administrativa exige token valido', async () => {
      const invalid = await fetch(`${baseUrl}/api/admin/dashboard`, { headers: { Authorization: 'Bearer token-invalido' } });
      assert.equal(invalid.status, 401);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
