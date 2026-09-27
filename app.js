const API_URL = 'http://localhost:5000/api';
const state = {
  page: 'dashboard',
  trips: [],
  selected: null,
  editing: null,
  preview: null,
  filters: { origin: '', destination: '', sort: '' },
  busy: false,
};

const view = document.querySelector('#view');
const notice = document.querySelector('#notice');
const noticeText = document.querySelector('#notice-text');
const pageTitle = document.querySelector('#page-title');
const titles = {
  dashboard: 'Seu mapa começa aqui.',
  new: 'Nova viagem',
  history: 'Histórico de viagens',
  edit: 'Editar planejamento',
  details: 'Detalhes da viagem',
};

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function number(value, suffix = '') {
  return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${suffix}`;
}
function date(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
function showNotice(message, type = 'success') {
  notice.hidden = false;
  notice.className = `notice ${type}`;
  noticeText.textContent = message;
}
function hideNotice() { notice.hidden = true; }
function setBusy(value) { state.busy = value; render(); }

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? null : response.json();
}
function getTrips(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return request(`/trips${params.toString() ? `?${params}` : ''}`);
}
function getTrip(id) { return request(`/trips/${id}`); }
function calculateTrip(data) { return request('/trips/calculate', { method: 'POST', body: JSON.stringify(data) }); }
function createTrip(data) { return request('/trips', { method: 'POST', body: JSON.stringify(data) }); }
function updateTrip(id, data) { return request(`/trips/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
function deleteTrip(id) { return request(`/trips/${id}`, { method: 'DELETE' }); }

function formMarkup(trip = {}, editing = false) {
  const fields = [
    ['origin', 'Origem', 'text', 'São Paulo, SP'],
    ['destination', 'Destino', 'text', 'Rio de Janeiro, RJ'],
    ['travel_date', 'Data da viagem', 'date', ''],
    ['fuel_consumption', 'Consumo (km/l)', 'number', ''],
    ['fuel_price', 'Preço do combustível (R$/l)', 'number', ''],
    ['tolls', 'Pedágios (R$)', 'number', ''],
  ];
  const visible = editing ? fields.slice(2) : fields;
  return `<form id="trip-form" class="trip-form" data-editing="${editing}">
    <div class="form-grid">${visible.slice(0, 2).map((field) => inputMarkup(field, trip)).join('')}</div>
    <div class="form-grid">${visible.slice(2, 4).map((field) => inputMarkup(field, trip)).join('')}</div>
    <div class="form-grid">${visible.slice(4).map((field) => inputMarkup(field, trip)).join('')}</div>
    <div class="form-actions">
      <button type="button" class="button ghost" data-action="cancel">Cancelar</button>
      ${!editing ? '<button type="button" class="button secondary" data-action="calculate">Calcular viagem</button>' : ''}
      <button class="button primary" type="submit">${editing ? 'Salvar alterações' : 'Salvar viagem'}</button>
    </div>
  </form>`;
}
function inputMarkup([name, label, type, placeholder], trip) {
  const value = escapeHtml(trip[name] ?? '');
  const constraints = type === 'number' ? `min="${name === 'tolls' ? '0' : '0.01'}" step="0.01"` : '';
  return `<label>${label}<input name="${name}" type="${type}" value="${value}" placeholder="${placeholder}" ${constraints} required></label>`;
}
function readForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.fuel_consumption = Number(data.fuel_consumption);
  data.fuel_price = Number(data.fuel_price);
  data.tolls = Number(data.tolls);
  return data;
}
function metric(label, value, highlight = false) {
  return `<div class="metric-card ${highlight ? 'highlight' : ''}"><span class="metric-label">${label}</span><strong class="metric-value">${value}</strong></div>`;
}
function resultMarkup(trip) {
  if (!trip) return '';
  return `<section class="result-panel"><div class="section-kicker">Estimativa calculada</div><h2>${escapeHtml(trip.origin)} <span>→</span> ${escapeHtml(trip.destination)}</h2><div class="result-grid">
    ${metric('Distância', number(trip.distance_km, ' km'))}
    ${metric('Duração', `${trip.duration_minutes} min`)}
    ${metric('Combustível', number(trip.fuel_needed, ' L'))}
    ${metric('Custo combustível', money(trip.fuel_cost))}
    ${metric('Pedágios', money(trip.tolls))}
    ${metric('Custo total', money(trip.total_cost), true)}
    ${metric('Clima', trip.weather || 'Indisponível')}
    ${metric('Temperatura', trip.temperature == null ? 'Indisponível' : number(trip.temperature, ' °C'))}
  </div></section>`;
}
function tableMarkup(trips, emptyText) {
  if (!trips.length) return `<p class="empty-state">${emptyText}</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Rota</th><th>Data</th><th>Distância</th><th>Total</th><th></th></tr></thead><tbody>${trips.map((trip) => `<tr>
    <td><strong>${escapeHtml(trip.origin)}</strong><small>${escapeHtml(trip.destination)}</small></td>
    <td>${date(trip.travel_date)}</td><td>${number(trip.distance_km, ' km')}</td><td><strong>${money(trip.total_cost)}</strong></td>
    <td><button class="table-action" data-action="details" data-id="${trip.id}">Abrir →</button></td>
  </tr>`).join('')}</tbody></table></div>`;
}

function dashboardView() {
  const upcoming = [...state.trips].filter((trip) => trip.travel_date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.travel_date.localeCompare(b.travel_date))[0];
  const average = state.trips.length ? state.trips.reduce((sum, trip) => sum + trip.total_cost, 0) / state.trips.length : 0;
  const distance = state.trips.reduce((sum, trip) => sum + trip.distance_km, 0);
  return `<section class="content-section"><div class="hero-row"><div><span class="eyebrow">VISÃO GERAL</span><h2>Quanto custa<br><em>chegar lá?</em></h2><p>Centralize seus planos, compare custos e transforme a próxima parada em uma decisão simples.</p><button class="button primary large" data-page="new">+ Planejar viagem</button></div><div class="route-art"><span>ORIGEM</span><strong>São Paulo</strong><b>→</b><span>DESTINO</span><strong>Rio de Janeiro</strong><small>Exemplo de rota</small></div></div>
    <div class="metrics">${metric('Viagens planejadas', state.trips.length)}${metric('Custo médio', money(average))}${metric('Distância total', number(distance, ' km'))}${metric('Próxima viagem', upcoming ? date(upcoming.travel_date) : 'Nenhuma')}</div>
    <div class="section-heading compact"><div><span class="eyebrow">RECENTES</span><h2>Seus últimos planos</h2></div>${state.trips.length ? '<button class="text-button" data-action="details" data-id="' + state.trips[0].id + '">Ver detalhes →</button>' : ''}</div>
    ${tableMarkup(state.trips.slice(0, 4), 'Ainda não há viagens. Seu próximo destino está esperando.')}</section>`;
}
function newView() {
  return `<section class="content-section"><div class="section-heading"><div><span class="eyebrow">ESTIMATIVA</span><h2>Desenhe o percurso.</h2><p>Preencha os dados da viagem para descobrir o custo antes de pegar a estrada.</p></div></div><div class="workspace-grid"><div class="surface">${formMarkup()} </div>${resultMarkup(state.preview)}</div></section>`;
}
function historyView() {
  return `<section class="content-section"><div class="section-heading"><div><span class="eyebrow">ARQUIVO DE ROTAS</span><h2>Todas as viagens.</h2><p>Filtre e encontre rapidamente qualquer planejamento salvo.</p></div></div><form id="filter-form" class="filter-bar"><input name="origin" placeholder="Filtrar por origem" value="${escapeHtml(state.filters.origin)}"><input name="destination" placeholder="Filtrar por destino" value="${escapeHtml(state.filters.destination)}"><select name="sort"><option value="">Mais recentes</option><option value="date" ${state.filters.sort === 'date' ? 'selected' : ''}>Por data</option><option value="total_cost" ${state.filters.sort === 'total_cost' ? 'selected' : ''}>Menor custo</option></select><button class="button primary">Filtrar</button></form>${tableMarkup(state.trips, 'Nenhuma viagem encontrada com esses filtros.')}</section>`;
}
function detailsView() {
  const trip = state.selected;
  if (!trip) return '<p class="loading">Carregando viagem...</p>';
  return `<section class="detail-header"><span class="eyebrow">DETALHES DA VIAGEM</span><h2>${escapeHtml(trip.origin)} <em>→</em> ${escapeHtml(trip.destination)}</h2><p>Viagem prevista para ${date(trip.travel_date)}.</p><div class="detail-actions"><button class="button ghost" data-page="history">Voltar</button><button class="button secondary" data-action="edit">Editar viagem</button><button class="button ghost" data-action="delete" data-id="${trip.id}">Excluir viagem</button></div></section><div class="content-section">${resultMarkup(trip)}</div>`;
}
function editView() {
  return `<section class="content-section"><div class="section-heading"><div><span class="eyebrow">ATUALIZAÇÃO</span><h2>Ajuste seu planejamento.</h2><p>Os custos serão recalculados pela API ao salvar.</p></div></div><div class="surface narrow">${formMarkup(state.editing, true)}</div></section>`;
}
function render() {
  pageTitle.textContent = titles[state.page];
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.page === state.page));
  view.innerHTML = state.page === 'dashboard' ? dashboardView() : state.page === 'new' ? newView() : state.page === 'history' ? historyView() : state.page === 'details' ? detailsView() : editView();
}

async function loadTrips(filters = {}) {
  try { state.trips = (await getTrips(filters)).data; render(); } catch (error) { showNotice(error.message, 'error'); }
}
async function run(action, success, after) {
  setBusy(true); hideNotice();
  try { await action(); showNotice(success); if (after) await after(); }
  catch (error) { showNotice(error.message, 'error'); }
  finally { setBusy(false); }
}

view.addEventListener('click', async (event) => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    state.page = pageButton.dataset.page;
    if (state.page === 'new') state.preview = null;
    if (state.page === 'history') await loadTrips(state.filters);
    render();
    return;
  }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  if (action.dataset.action === 'cancel') { state.page = state.editing ? 'history' : 'dashboard'; state.editing = null; render(); return; }
  if (action.dataset.action === 'details') {
    await run(async () => { state.selected = await getTrip(action.dataset.id); }, 'Viagem carregada.', () => { state.page = 'details'; render(); });
  }
  if (action.dataset.action === 'edit') { state.editing = state.selected; state.page = 'edit'; render(); }
  if (action.dataset.action === 'calculate') {
    const form = document.querySelector('#trip-form');
    await run(async () => { state.preview = await calculateTrip(readForm(form)); }, 'Cálculo concluído.', render);
  }
  if (action.dataset.action === 'delete') {
    if (window.confirm('Excluir esta viagem? Essa ação não pode ser desfeita.')) await run(async () => { await deleteTrip(action.dataset.id); }, 'Viagem excluída.', async () => { state.page = 'history'; await loadTrips(state.filters); });
  }
});
view.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (event.target.id === 'filter-form') { state.filters = Object.fromEntries(new FormData(event.target).entries()); await loadTrips(state.filters); return; }
  if (event.target.id !== 'trip-form') return;
  const data = readForm(event.target);
  if (event.target.dataset.editing === 'true') await run(async () => { await updateTrip(state.editing.id, data); }, 'Viagem atualizada com sucesso.', async () => { state.editing = null; state.page = 'history'; await loadTrips(state.filters); });
  else await run(async () => { await createTrip(data); }, 'Viagem salva com sucesso.', async () => { state.preview = null; state.page = 'dashboard'; await loadTrips(); });
});
document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => { state.page = link.dataset.page; if (state.page === 'new') state.preview = null; loadTripsIfNeeded(); }));
async function loadTripsIfNeeded() { if (state.page === 'history') await loadTrips(state.filters); else render(); }
document.querySelector('#close-notice').addEventListener('click', hideNotice);
document.querySelector('#current-date').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
render();
loadTrips();
