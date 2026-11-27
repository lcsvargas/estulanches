'use strict';

const ALLOWED_ORDER_STATUSES = ['recebido', 'preparando', 'pronto', 'entregue', 'cancelado'];

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

function cleanText(value, field, min, max, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string') throw new ValidationError(`${field} invalido.`);
  const result = value.trim();
  if ((!optional && result.length < min) || result.length > max) {
    throw new ValidationError(`${field} deve ter ${min} a ${max} caracteres.`);
  }
  return result;
}

function validateOrderPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Dados do pedido invalidos.');
  }

  const customerName = cleanText(body.customerName, 'Nome', 2, 100);
  const classroom = cleanText(body.classroom, 'Turma', 1, 40);
  const notes = cleanText(body.notes, 'Observacoes', 0, 300, true);

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    throw new ValidationError('Adicione de 1 a 20 produtos ao pedido.');
  }

  const seen = new Set();
  const items = body.items.map((item) => {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(productId) || productId < 1) {
      throw new ValidationError('Produto invalido no pedido.');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new ValidationError('A quantidade deve ficar entre 1 e 20.');
    }
    if (seen.has(productId)) throw new ValidationError('Um produto aparece mais de uma vez no pedido.');
    seen.add(productId);
    return { productId, quantity };
  });

  return { customerName, classroom, notes, items };
}

function validateProductPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Dados do produto invalidos.');
  }

  const name = cleanText(body.name, 'Nome do produto', 2, 100);
  const description = cleanText(body.description ?? '', 'Descricao', 0, 280, true);
  const category = cleanText(body.category, 'Categoria', 2, 50);
  const emoji = cleanText(body.emoji ?? '🥪', 'Icone', 1, 12);
  const priceCents = Number(body.priceCents);
  const active = body.active === undefined ? true : body.active;
  if (typeof active !== 'boolean') throw new ValidationError('Disponibilidade invalida.');

  if (!Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 1000000) {
    throw new ValidationError('Informe um preco valido (ate R$ 10.000,00).');
  }

  return { name, description, category, emoji, priceCents, active };
}

function validateOrderStatus(body) {
  const status = body?.status;
  if (!ALLOWED_ORDER_STATUSES.includes(status)) {
    throw new ValidationError('Status de pedido invalido.');
  }
  return status;
}

module.exports = {
  ALLOWED_ORDER_STATUSES,
  ValidationError,
  validateOrderPayload,
  validateProductPayload,
  validateOrderStatus,
};
