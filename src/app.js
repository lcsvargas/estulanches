'use strict';

const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { createAuthMiddleware } = require('./middleware/auth');
const {
  ValidationError,
  validateOrderPayload,
  validateProductPayload,
  validateOrderStatus,
} = require('./utils/validation');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function slugify(value) {
  const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65);
  return `${base || 'produto'}-${crypto.randomBytes(3).toString('hex')}`;
}

function createApp({ pool, jwtSecret = process.env.JWT_SECRET } = {}) {
  if (!pool) throw new Error('A conexao com o banco precisa ser injetada em createApp().');
  if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '20kb' }));

  const requireAdmin = createAuthMiddleware(jwtSecret);
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
  });
  const orderLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muitos pedidos em pouco tempo. Aguarde um instante.' },
  });

  app.get('/api/health', asyncRoute(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', service: 'estulanches-api' });
  }));

  app.get('/api/menu', asyncRoute(async (_req, res) => {
    const result = await pool.query(
      `SELECT id, name, description, category, price_cents AS "priceCents", emoji
       FROM products WHERE is_active = TRUE ORDER BY category, name`,
    );
    res.json({ products: result.rows });
  }));

  app.post('/api/orders', orderLimiter, asyncRoute(async (req, res) => {
    const payload = validateOrderPayload(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = payload.items.map((item) => item.productId);
      const productResult = await client.query(
        `SELECT id, name, price_cents
         FROM products
         WHERE id = ANY($1::bigint[]) AND is_active = TRUE
         FOR SHARE`,
        [ids],
      );
      if (productResult.rowCount !== ids.length) {
        throw new ValidationError('Um ou mais produtos nao estao mais disponiveis. Atualize o cardapio.');
      }

      const productsById = new Map(productResult.rows.map((product) => [Number(product.id), product]));
      const items = payload.items.map((item) => {
        const product = productsById.get(item.productId);
        return {
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.price_cents),
          quantity: item.quantity,
          lineTotal: Number(product.price_cents) * item.quantity,
        };
      });
      const totalCents = items.reduce((total, item) => total + item.lineTotal, 0);
      if (!Number.isSafeInteger(totalCents) || totalCents < 1) {
        throw new ValidationError('O valor total do pedido e invalido.');
      }

      const publicCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      const orderResult = await client.query(
        `INSERT INTO orders (public_code, customer_name, classroom, notes, total_cents)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, public_code AS "publicCode", status, total_cents AS "totalCents", created_at AS "createdAt"`,
        [publicCode, payload.customerName, payload.classroom, payload.notes, totalCents],
      );
      const order = orderResult.rows[0];

      for (const item of items) {
        await client.query(
          `INSERT INTO order_items
           (order_id, product_id, product_name, unit_price_cents, quantity, line_total_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.productId, item.productName, item.unitPrice, item.quantity, item.lineTotal],
        );
      }
      await client.query('COMMIT');
      res.status(201).json({
        order: {
          code: order.publicCode,
          status: order.status,
          totalCents: Number(order.totalCents),
          createdAt: order.createdAt,
          customerName: payload.customerName,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }));

  app.post('/api/auth/login', authLimiter, asyncRoute(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || email.length > 180 || !password || password.length > 200) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }

    const result = await pool.query(
      'SELECT id, name, email, password_hash FROM admins WHERE email = $1',
      [email],
    );
    const admin = result.rows[0];
    const validPassword = admin ? await bcrypt.compare(password, admin.password_hash) : false;

    if (!admin || !validPassword) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const token = jwt.sign(
      { sub: String(admin.id), name: admin.name },
      jwtSecret,
      { expiresIn: '4h', issuer: 'estulanches', audience: 'estulanches-admin' },
    );
    return res.json({ token, admin: { name: admin.name, email: admin.email } });
  }));

  app.get('/api/admin/dashboard', requireAdmin, asyncRoute(async (_req, res) => {
    const [orders, products, recent] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'recebido')::int AS received,
          COUNT(*) FILTER (WHERE status = 'preparando')::int AS preparing,
          COUNT(*) FILTER (WHERE status = 'pronto')::int AS ready,
          COALESCE(SUM(total_cents) FILTER (WHERE created_at::date = CURRENT_DATE AND status <> 'cancelado'), 0)::int AS today_cents
         FROM orders`,
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM products WHERE is_active = TRUE'),
      pool.query(
        `SELECT id, public_code AS code, customer_name AS "customerName", classroom,
          status, total_cents AS "totalCents", created_at AS "createdAt"
         FROM orders ORDER BY created_at DESC LIMIT 5`,
      ),
    ]);
    res.json({ stats: { ...orders.rows[0], activeProducts: products.rows[0].total }, recentOrders: recent.rows });
  }));

  app.get('/api/admin/products', requireAdmin, asyncRoute(async (_req, res) => {
    const result = await pool.query(
      `SELECT id, name, description, category, price_cents AS "priceCents", emoji,
        is_active AS active, created_at AS "createdAt"
       FROM products ORDER BY is_active DESC, category, name`,
    );
    res.json({ products: result.rows });
  }));

  app.post('/api/admin/products', requireAdmin, asyncRoute(async (req, res) => {
    const product = validateProductPayload(req.body);
    const result = await pool.query(
      `INSERT INTO products (slug, name, description, category, price_cents, emoji, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, category, price_cents AS "priceCents", emoji,
        is_active AS active`,
      [slugify(product.name), product.name, product.description, product.category, product.priceCents, product.emoji, product.active],
    );
    res.status(201).json({ product: result.rows[0] });
  }));

  app.put('/api/admin/products/:id', requireAdmin, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError('Produto invalido.');
    const product = validateProductPayload(req.body);
    const result = await pool.query(
      `UPDATE products SET name = $1, description = $2, category = $3,
        price_cents = $4, emoji = $5, is_active = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, description, category, price_cents AS "priceCents", emoji,
        is_active AS active`,
      [product.name, product.description, product.category, product.priceCents, product.emoji, product.active, id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Produto nao encontrado.' });
    res.json({ product: result.rows[0] });
  }));

  app.patch('/api/admin/products/:id/availability', requireAdmin, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.active !== 'boolean') {
      throw new ValidationError('Informe um produto e a disponibilidade.');
    }
    const result = await pool.query(
      `UPDATE products SET is_active = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, is_active AS active`,
      [req.body.active, id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Produto nao encontrado.' });
    res.json({ product: result.rows[0] });
  }));

  app.get('/api/admin/orders', requireAdmin, asyncRoute(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const allowed = ['recebido', 'preparando', 'pronto', 'entregue', 'cancelado'];
    if (status && !allowed.includes(status)) throw new ValidationError('Filtro de status invalido.');

    const result = await pool.query(
      `SELECT id, public_code AS code, customer_name AS "customerName", classroom,
        notes, status, total_cents AS "totalCents", created_at AS "createdAt"
       FROM orders
       WHERE ($1 = '' OR status = $1)
       ORDER BY created_at DESC LIMIT 100`,
      [status],
    );
    const orderIds = result.rows.map((order) => order.id);
    let itemRows = [];
    if (orderIds.length) {
      const itemsResult = await pool.query(
        `SELECT order_id AS "orderId", product_name AS "productName", quantity,
          unit_price_cents AS "unitPriceCents", line_total_cents AS "lineTotalCents"
         FROM order_items WHERE order_id = ANY($1::bigint[]) ORDER BY id`,
        [orderIds],
      );
      itemRows = itemsResult.rows;
    }
    const byOrder = new Map();
    for (const item of itemRows) {
      const key = String(item.orderId);
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key).push(item);
    }
    res.json({ orders: result.rows.map((order) => ({ ...order, items: byOrder.get(String(order.id)) || [] })) });
  }));

  app.patch('/api/admin/orders/:id/status', requireAdmin, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError('Pedido invalido.');
    const status = validateOrderStatus(req.body);
    const result = await pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, public_code AS code, status, updated_at AS "updatedAt"`,
      [status, id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Pedido nao encontrado.' });
    res.json({ order: result.rows[0] });
  }));

  app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));

  app.use(express.static(path.join(__dirname, '../public'), {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  }));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota nao encontrada.' });
    return res.status(404).sendFile(path.join(__dirname, '../public/404.html'), (error) => {
      if (error && !res.headersSent) res.status(404).send('Pagina nao encontrada.');
    });
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof ValidationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'O corpo da requisicao nao e um JSON valido.' });
    }
    console.error('[api] Erro nao tratado:', error.message);
    return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
  });

  return app;
}

module.exports = { createApp, slugify };
