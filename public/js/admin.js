'use strict';

let authToken = null;
let currentAdmin = null;
let products = [];
let editingProductId = null;

const loginPage = document.querySelector('#login-page');
const adminShell = document.querySelector('#admin-shell');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const productDialog = document.querySelector('#product-dialog');
const productForm = document.querySelector('#product-form');
const toastElement = document.querySelector('#admin-toast');

const STATUS_LABELS = {
  recebido: 'Recebido',
  preparando: 'Preparando',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

function money(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents) / 100);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && authToken) {
    logout();
    throw new Error('Sua sessao expirou. Entre novamente.');
  }
  if (!response.ok) throw new Error(data.error || 'Nao foi possivel concluir a solicitacao.');
  return data;
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toastElement.classList.remove('show'), 2600);
}

function setView(name) {
  const labels = { dashboard: 'Visao geral', orders: 'Pedidos', products: 'Produtos' };
  document.querySelectorAll('.admin-view').forEach((view) => view.classList.add('hidden'));
  document.querySelector(`#view-${name}`).classList.remove('hidden');
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  document.querySelector('#breadcrumb-current').textContent = labels[name];
  if (name === 'dashboard') loadDashboard();
  if (name === 'orders') loadOrders();
  if (name === 'products') loadProducts();
}

function showAdmin(admin) {
  currentAdmin = admin;
  loginPage.classList.add('hidden');
  adminShell.classList.remove('hidden');
  document.querySelector('#admin-name').textContent = admin.name;
  document.querySelector('#admin-avatar').textContent = admin.name.trim().charAt(0).toUpperCase();
  document.querySelector('#current-date').textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date());
  setView('dashboard');
}

function logout() {
  authToken = null;
  currentAdmin = null;
  adminShell.classList.add('hidden');
  loginPage.classList.remove('hidden');
  loginForm.reset();
  loginError.textContent = '';
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const button = document.querySelector('#login-submit');
  button.disabled = true;
  button.textContent = 'Verificando...';
  loginError.textContent = '';
  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: formData.get('email'), password: formData.get('password') }),
    });
    authToken = result.token;
    showAdmin(result.admin);
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Entrar no painel <span>→</span>';
  }
});

document.querySelector('#logout-button').addEventListener('click', logout);
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
document.querySelectorAll('[data-go]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.go));
});

function renderStatus(status) {
  return `<span class="status-pill status-${escapeHTML(status)}">${escapeHTML(STATUS_LABELS[status] || status)}</span>`;
}

function orderRow(order, compact = false) {
  const details = `${escapeHTML(order.customerName)} · ${escapeHTML(order.classroom)}`;
  const items = order.items?.length
    ? `<small>${order.items.map((item) => `${item.quantity}x ${escapeHTML(item.productName)}`).join(', ')}</small>`
    : '';
  return `<div class="order-row">
    <div><div class="order-code">#${escapeHTML(order.code)}</div>${compact ? '' : `<small>${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(order.createdAt))}</small>`}</div>
    <div class="order-person"><strong>${details}</strong>${items}</div>
    <div class="order-value">${money(order.totalCents)}</div>
    ${compact ? renderStatus(order.status) : `<select data-order-status="${order.id}" aria-label="Atualizar status do pedido ${escapeHTML(order.code)}">${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${order.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`}
  </div>`;
}

async function loadDashboard() {
  try {
    const data = await api('/admin/dashboard');
    document.querySelector('#stat-total').textContent = data.stats.total;
    document.querySelector('#stat-received').textContent = data.stats.received;
    document.querySelector('#stat-preparing').textContent = data.stats.preparing;
    document.querySelector('#stat-today').textContent = money(data.stats.today_cents);
    document.querySelector('#recent-orders').innerHTML = data.recentOrders.length
      ? data.recentOrders.map((order) => orderRow(order, true)).join('')
      : '<div class="empty-state"><strong>Nenhum pedido por enquanto.</strong>Quando chegar o primeiro, ele aparece aqui.</div>';
  } catch (error) {
    showToast(error.message);
  }
}

async function loadOrders() {
  const container = document.querySelector('#all-orders');
  container.innerHTML = '<div class="empty-state">Carregando pedidos...</div>';
  try {
    const status = document.querySelector('#order-filter').value;
    const data = await api(`/admin/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`);
    container.innerHTML = data.orders.length
      ? data.orders.map((order) => orderRow(order)).join('')
      : '<div class="empty-state"><strong>Nenhum pedido encontrado.</strong>Os novos pedidos enviados pelos estudantes aparecerao aqui.</div>';
  } catch (error) {
    container.innerHTML = `<div class="empty-state">${escapeHTML(error.message)}</div>`;
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    await api(`/admin/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast('Status do pedido atualizado.');
    loadOrders();
  } catch (error) {
    showToast(error.message);
    loadOrders();
  }
}

document.querySelector('#all-orders').addEventListener('change', (event) => {
  const select = event.target.closest('[data-order-status]');
  if (select) updateOrderStatus(select.dataset.orderStatus, select.value);
});
document.querySelector('#order-filter').addEventListener('change', loadOrders);
document.querySelector('#refresh-orders').addEventListener('click', loadOrders);

async function loadProducts() {
  const tbody = document.querySelector('#products-table');
  tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Carregando produtos...</div></td></tr>';
  try {
    const data = await api('/admin/products');
    products = data.products;
    tbody.innerHTML = products.length ? products.map((product) => `
      <tr>
        <td><div class="table-product"><span class="table-emoji">${escapeHTML(product.emoji)}</span><div><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.description)}</small></div></div></td>
        <td>${escapeHTML(product.category)}</td>
        <td><strong>${money(product.priceCents)}</strong></td>
        <td><span class="availability ${product.active ? '' : 'off'}">${product.active ? 'Disponivel' : 'Indisponivel'}</span></td>
        <td><div class="table-actions"><button class="table-action" type="button" data-edit-product="${product.id}">Editar</button><button class="table-action" type="button" data-toggle-product="${product.id}" data-active="${product.active}">${product.active ? 'Ocultar' : 'Ativar'}</button></div></td>
      </tr>
    `).join('') : '<tr><td colspan="5"><div class="empty-state">Nenhum produto cadastrado.</div></td></tr>';
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">${escapeHTML(error.message)}</div></td></tr>`;
  }
}

function openProductDialog(product = null) {
  editingProductId = product?.id ?? null;
  document.querySelector('#product-dialog-title').textContent = product ? 'Editar produto' : 'Novo produto';
  document.querySelector('#product-name').value = product?.name || '';
  document.querySelector('#product-description').value = product?.description || '';
  document.querySelector('#product-category').value = product?.category || '';
  document.querySelector('#product-price').value = product ? (product.priceCents / 100).toFixed(2) : '';
  document.querySelector('#product-emoji').value = product?.emoji || '🥪';
  document.querySelector('#product-availability').value = String(product?.active ?? true);
  document.querySelector('#product-error').textContent = '';
  productDialog.showModal();
}

function closeProductDialog() {
  productDialog.close();
  productForm.reset();
  editingProductId = null;
}

document.querySelector('#add-product').addEventListener('click', () => openProductDialog());
document.querySelector('#close-product-dialog').addEventListener('click', closeProductDialog);
document.querySelector('#cancel-product').addEventListener('click', closeProductDialog);
document.querySelector('#refresh-products').addEventListener('click', loadProducts);

document.querySelector('#products-table').addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-product]');
  const toggleButton = event.target.closest('[data-toggle-product]');
  if (editButton) {
    const product = products.find((item) => Number(item.id) === Number(editButton.dataset.editProduct));
    if (product) openProductDialog(product);
  }
  if (toggleButton) {
    const productId = Number(toggleButton.dataset.toggleProduct);
    const active = toggleButton.dataset.active !== 'true';
    try {
      await api(`/admin/products/${productId}/availability`, { method: 'PATCH', body: JSON.stringify({ active }) });
      showToast(active ? 'Produto ativado no cardapio.' : 'Produto ocultado do cardapio.');
      loadProducts();
    } catch (error) {
      showToast(error.message);
    }
  }
});

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(productForm);
  const price = Number(formData.get('price'));
  const payload = {
    name: formData.get('name'),
    description: formData.get('description'),
    category: formData.get('category'),
    priceCents: Math.round(price * 100),
    emoji: formData.get('emoji') || '🥪',
    active: formData.get('active') === 'true',
  };
  const button = document.querySelector('#save-product');
  const errorElement = document.querySelector('#product-error');
  button.disabled = true;
  button.textContent = 'Salvando...';
  errorElement.textContent = '';
  try {
    const wasEditing = Boolean(editingProductId);
    await api(editingProductId ? `/admin/products/${editingProductId}` : '/admin/products', {
      method: editingProductId ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    closeProductDialog();
    showToast(wasEditing ? 'Produto atualizado.' : 'Produto cadastrado.');
    loadProducts();
    loadDashboard();
  } catch (error) {
    errorElement.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar produto';
  }
});
