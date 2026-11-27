'use strict';

const state = {
  products: [],
  category: 'all',
  cart: new Map(),
};

const elements = {
  grid: document.querySelector('#product-grid'),
  filters: document.querySelector('#category-filters'),
  menuStatus: document.querySelector('#menu-status-text'),
  menuError: document.querySelector('#menu-error'),
  cartItems: document.querySelector('#cart-items'),
  cartEmpty: document.querySelector('#cart-empty'),
  cartCount: document.querySelector('#cart-count'),
  cartTotal: document.querySelector('#cart-total'),
  orderForm: document.querySelector('#order-form'),
  submitOrder: document.querySelector('#submit-order'),
  feedback: document.querySelector('#order-feedback'),
  confirmation: document.querySelector('#confirmation-dialog'),
};

function money(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Nao foi possivel concluir a solicitacao.');
  return data;
}

async function loadMenu() {
  elements.menuStatus.textContent = 'Atualizando cardapio...';
  elements.menuError.classList.add('hidden');
  elements.grid.innerHTML = '<div class="loading-card"><span class="loading-spinner"></span><p>Buscando as delicias...</p></div>';
  try {
    const data = await api('/menu');
    state.products = data.products;
    state.category = 'all';
    renderFilters();
    renderProducts();
    elements.menuStatus.textContent = `${state.products.length} opcoes no cardapio`;
  } catch (error) {
    elements.menuStatus.textContent = 'Cardapio indisponivel';
    elements.grid.innerHTML = '';
    elements.menuError.classList.remove('hidden');
    console.error('[menu]', error.message);
  }
}

function renderFilters() {
  const categories = [...new Set(state.products.map((product) => product.category))];
  elements.filters.innerHTML = [
    '<button class="filter-chip active" type="button" data-category="all">Tudo</button>',
    ...categories.map((category) => `<button class="filter-chip" type="button" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`),
  ].join('');
}

function renderProducts() {
  const filtered = state.category === 'all'
    ? state.products
    : state.products.filter((product) => product.category === state.category);

  elements.filters.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.category === state.category);
  });

  if (!filtered.length) {
    elements.grid.innerHTML = '<div class="loading-card"><p>Nenhum produto nesta categoria.</p></div>';
    return;
  }

  elements.grid.innerHTML = filtered.map((product) => `
    <article class="product-card">
      <div class="product-visual" aria-hidden="true">${escapeHTML(product.emoji)}</div>
      <div class="product-info">
        <span class="product-category">${escapeHTML(product.category)}</span>
        <h3>${escapeHTML(product.name)}</h3>
        <p>${escapeHTML(product.description || '')}</p>
        <div class="product-bottom">
          <span class="product-price">${money(product.priceCents)}</span>
          <button class="add-button" type="button" data-add="${product.id}" aria-label="Adicionar ${escapeHTML(product.name)}">+</button>
        </div>
      </div>
    </article>
  `).join('');
}

function renderCart() {
  const items = [...state.cart.values()];
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.product.priceCents * item.quantity, 0);
  elements.cartCount.textContent = `(${quantity})`;
  elements.cartTotal.textContent = money(total);
  elements.cartEmpty.classList.toggle('hidden', items.length > 0);
  elements.cartItems.innerHTML = items.map(({ product, quantity: count }) => `
    <div class="cart-item">
      <span class="cart-item-name">${escapeHTML(product.name)}</span>
      <span class="cart-item-price">${money(product.priceCents * count)}</span>
      <div class="cart-item-controls">
        <button class="quantity-button" type="button" data-decrease="${product.id}" aria-label="Diminuir ${escapeHTML(product.name)}">−</button>
        <span class="cart-quantity">${count}</span>
        <button class="quantity-button" type="button" data-increase="${product.id}" aria-label="Aumentar ${escapeHTML(product.name)}">+</button>
        <button class="cart-remove" type="button" data-remove="${product.id}">Remover</button>
      </div>
    </div>
  `).join('');
  elements.submitOrder.disabled = items.length === 0;
}

function addToCart(productId) {
  const product = state.products.find((item) => Number(item.id) === Number(productId));
  if (!product) return;
  const current = state.cart.get(product.id);
  const quantity = current ? current.quantity : 0;
  if (quantity >= 20) return;
  state.cart.set(product.id, { product, quantity: quantity + 1 });
  elements.feedback.textContent = '';
  renderCart();
}

function changeQuantity(productId, delta) {
  const id = Number(productId);
  const item = state.cart.get(id);
  if (!item) return;
  const next = item.quantity + delta;
  if (next < 1) state.cart.delete(id);
  else if (next <= 20) state.cart.set(id, { ...item, quantity: next });
  renderCart();
}

elements.filters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  state.category = button.dataset.category;
  renderProducts();
});

elements.grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]');
  if (button) addToCart(button.dataset.add);
});

elements.cartItems.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.increase) changeQuantity(button.dataset.increase, 1);
  if (button.dataset.decrease) changeQuantity(button.dataset.decrease, -1);
  if (button.dataset.remove) {
    state.cart.delete(Number(button.dataset.remove));
    renderCart();
  }
});

document.querySelector('#retry-menu').addEventListener('click', loadMenu);
document.querySelector('#close-confirmation').addEventListener('click', () => elements.confirmation.close());

elements.orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.cart.size) return;
  const formData = new FormData(elements.orderForm);
  const payload = {
    customerName: formData.get('customerName'),
    classroom: formData.get('classroom'),
    notes: formData.get('notes'),
    items: [...state.cart.values()].map(({ product, quantity }) => ({ productId: product.id, quantity })),
  };

  elements.submitOrder.disabled = true;
  elements.submitOrder.textContent = 'Enviando pedido...';
  elements.feedback.textContent = '';
  try {
    const result = await api('/orders', { method: 'POST', body: JSON.stringify(payload) });
    document.querySelector('#confirmation-code').textContent = result.order.code;
    document.querySelector('#confirmation-total').textContent = money(result.order.totalCents);
    state.cart.clear();
    elements.orderForm.reset();
    renderCart();
    elements.confirmation.showModal();
  } catch (error) {
    elements.feedback.textContent = error.message;
  } finally {
    elements.submitOrder.textContent = 'Enviar pedido →';
    elements.submitOrder.disabled = state.cart.size === 0;
  }
});

renderCart();
loadMenu();
