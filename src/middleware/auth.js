'use strict';
const jwt = require('jsonwebtoken');

function createAuthMiddleware(jwtSecret) {
  return function requireAdmin(req, res, next) {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Autenticacao necessaria.' });
    }

    try {
      req.admin = jwt.verify(token, jwtSecret, {
        issuer: 'estulanches',
        audience: 'estulanches-admin',
      });
      return next();
    } catch {
      return res.status(401).json({ error: 'Sessao invalida ou expirada.' });
    }
  };
}

module.exports = { createAuthMiddleware };
