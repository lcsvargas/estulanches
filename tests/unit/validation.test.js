'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ValidationError,
  validateOrderPayload,
  validateProductPayload,
  validateOrderStatus,
} = require('../../src/utils/validation');

test('validacao de pedido aceita dados corretos e normaliza textos', () => {
  const result = validateOrderPayload({
    customerName: '  Ana Silva ',
    classroom: '  2o ADS  ',
    notes: ' Sem cebola ',
    items: [{ productId: 3, quantity: 2 }],
  });
  assert.equal(result.customerName, 'Ana Silva');
  assert.equal(result.classroom, '2o ADS');
  assert.equal(result.notes, 'Sem cebola');
  assert.deepEqual(result.items, [{ productId: 3, quantity: 2 }]);
});

test('validacao de pedido rejeita quantidade fora do limite', () => {
  assert.throws(
    () => validateOrderPayload({ customerName: 'Ana', classroom: '2A', items: [{ productId: 1, quantity: 21 }] }),
    ValidationError,
  );
});

test('validacao de pedido rejeita produto duplicado', () => {
  assert.throws(
    () => validateOrderPayload({ customerName: 'Ana', classroom: '2A', items: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }] }),
    /mais de uma vez/,
  );
});

test('validacao de produto converte campos e aceita preco em centavos', () => {
  const product = validateProductPayload({
    name: ' Suco natural ', description: ' Feito na hora ', category: 'Bebidas',
    priceCents: 750, emoji: '🍊', active: false,
  });
  assert.equal(product.name, 'Suco natural');
  assert.equal(product.priceCents, 750);
  assert.equal(product.active, false);
});

test('validacao de produto rejeita preco zerado', () => {
  assert.throws(
    () => validateProductPayload({ name: 'Agua', category: 'Bebidas', priceCents: 0 }),
    ValidationError,
  );
});

test('validacao de status permite somente estados conhecidos', () => {
  assert.equal(validateOrderStatus({ status: 'preparando' }), 'preparando');
  assert.throws(() => validateOrderStatus({ status: 'em_transito' }), ValidationError);
});
