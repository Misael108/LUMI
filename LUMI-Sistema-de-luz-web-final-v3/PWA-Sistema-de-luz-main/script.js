/* ============================================================
   LUMI — Frontend Demo
   - Persistencia local con localStorage (simula BD para la etapa web)
   - Arquitectura preparada para migrar a API/Node.js/MySQL/Supabase
   - ESP32: estado simulado en esta etapa; las acciones quedan registradas
   ============================================================ */

const STORAGE_KEY = 'lumi_ui_v3';
const APP_VERSION = 'v3-final';
const API_BASE = 'http://192.168.0.33:3000/api';
let apiOnline = false;

const DEFAULT_DB = {
  auth: { loggedIn: false },
  user: { name: 'Usuario LUMI', email: 'demo@lumi.local' },
  device: {
    name: 'ESP32 Principal', ip: '192.168.1.85', connected: true, simulated: true,
    latency: 28, rssi: -62, uptimeMinutes: 192, lastSync: '19:42:18'
  },
  settings: { notifications: true, animations: true },
  lights: [
    { id: 'sala', name: 'Sala', icon: '🛋️', on: true, brightness: 75, mode: 'automatico' },
    { id: 'recamara', name: 'Recámara', icon: '🛏️', on: false, brightness: 0, mode: 'manual' },
    { id: 'cocina', name: 'Cocina', icon: '🍴', on: true, brightness: 60, mode: 'automatico' },
    { id: 'exterior', name: 'Exterior', icon: '🌲', on: false, brightness: 0, mode: 'manual' }
  ],
  activeMode: 'automatico',
  schedulesEnabled: true,
  schedules: [
    { id: 1, roomId: 'sala', action: 'Encender', time: '19:00', days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'], active: true },
    { id: 2, roomId: 'sala', action: 'Apagar', time: '23:30', days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'], active: true },
    { id: 3, roomId: 'exterior', action: 'Encender', time: '08:00', days: ['Sáb', 'Dom'], active: false }
  ],
  activity: [
    { type: 'green', time: '19:42', text: 'Luz encendida', detail: 'Sala · 75%' },
    { type: 'green', time: '19:40', text: 'Intensidad cambiada', detail: 'Sala · 75%' },
    { type: 'green', time: '19:15', text: 'Modo automático activado', detail: 'Sistema' },
    { type: 'red', time: '18:30', text: 'Luz apagada', detail: 'Recámara' },
    { type: '', time: '17:05', text: 'Programación guardada', detail: 'Horario principal' },
    { type: 'green', time: '12:22', text: 'Conexión ESP32 establecida', detail: '192.168.1.85' }
  ],
  stats: { values: [2.1, 2.5, 4.1, 2.6, 2.2, 2.9, 4.3], totalKwh: 2.4, saving: 18, avgMinutes: 332 }
};

let db = loadDB();
let currentView = 'inicio';
let currentChartTab = 'consumo';
let mobileNavOpen = false;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function loadDB() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return clone(DEFAULT_DB);
    const merged = deepMerge(clone(DEFAULT_DB), saved);
    // La base de datos es la fuente de verdad para luces, horarios, historial y estadísticas.
    // Solo conservamos sesión y preferencias locales.
    merged.lights = clone(DEFAULT_DB.lights);
    merged.schedules = [];
    merged.activity = [];
    merged.stats = clone(DEFAULT_DB.stats);
    return merged;
  } catch { return clone(DEFAULT_DB); }
}
function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  Object.entries(patch).forEach(([key, value]) => {
    if (Array.isArray(value)) base[key] = value;
    else if (value && typeof value === 'object') base[key] = deepMerge(base[key] || {}, value);
    else base[key] = value;
  });
  return base;
}
function persist() {
  const localOnly = {
    auth: db.auth,
    user: db.user,
    settings: db.settings,
    activeMode: db.activeMode,
    schedulesEnabled: db.schedulesEnabled,
    device: { ...db.device }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localOnly));
}
function clearSystemState() {
  db.lights = [];
  db.schedules = [];
  db.activity = [];
  db.stats = { values: [0,0,0,0,0,0,0], totalKwh: 0, saving: 0, avgMinutes: 0 };
}
function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
  db = clone(DEFAULT_DB);
  db.auth.loggedIn = false;
  apiOnline = false;
  initApp();
  showToast('Sesión restablecida', 'LUMI volverá a cargar los datos desde MySQL al iniciar sesión.', 'success');
}

function formatTime(isoLike = new Date()) {
  const d = isoLike instanceof Date ? isoLike : new Date(isoLike);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function formatDate() {
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).replace('.', '');
}
function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}
function getRoom(id) { return db.lights.find(l => l.id === String(id)) || db.lights.find(l => slugBase(l.name) === String(id)) || db.lights[0]; }
function slugBase(value) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function addHistory(text, detail, type = 'green', roomId = null) {
  db.activity.unshift({ type, time: formatTime(), text, detail });
  db.activity = db.activity.slice(0, 50);
  persist();
  saveHistoryApi(text, detail, type, roomId);
}
function showToast(title, message, type = 'success') {
  const region = $('#toastRegion');
  const item = document.createElement('div'); item.className = `toast ${type}`;
  item.innerHTML = `<div class="toast-icon">${type === 'error' ? '⚠' : '✓'}</div><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  region.appendChild(item);
  setTimeout(() => item.remove(), 2800);
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.mensaje || data.error || `Error HTTP ${response.status}`);
  return data;
}

async function ensureApiOnline() {
  try {
    await apiRequest('/health');
    apiOnline = true;
    return true;
  } catch (error) {
    apiOnline = false;
    return false;
  }
}

function mapDashboard(data) {
  const device = data.dispositivos?.[0];
  db.user = {
    id: data.usuario.id,
    name: data.usuario.nombre,
    email: data.usuario.email
  };
  if (device) {
    db.device = {
      ...db.device,
      id: device.id,
      name: device.nombre,
      ip: device.ip || db.device.ip,
      connected: device.estado === 'conectado',
      simulated: false,
      latency: device.latencia_ms ?? db.device.latency,
      rssi: device.rssi_dbm ?? db.device.rssi,
      uptimeMinutes: Math.floor((device.uptime_segundos || 0) / 60),
      lastSync: device.ultima_sincronizacion ? formatTime(device.ultima_sincronizacion) : db.device.lastSync
    };
  }
  db.lights = (data.habitaciones || []).map(h => ({
    id: String(h.id),
    dbId: h.id,
    name: h.nombre,
    icon: h.icono || '💡',
    on: Boolean(h.encendida),
    brightness: Number(h.intensidad || 0),
    mode: h.modo || 'manual',
    lightId: h.luz_id,
    consumo: Number(h.consumo_actual_w || 0)
  }));
  db.schedules = (data.programaciones || []).map(p => ({
    id: p.id,
    roomId: String(p.habitacion_id),
    action: p.accion,
    time: String(p.hora).slice(0,5),
    days: String(p.dias || 'Todos').split(',').map(x => x.trim()),
    active: Boolean(p.activa)
  }));
  db.activity = (data.historial || []).map(h => ({
    type: h.tipo === 'success' ? 'green' : h.tipo === 'error' ? 'red' : '',
    time: formatTime(h.fecha_hora),
    text: h.evento,
    detail: h.detalle || ''
  }));
  const readings = data.lecturas || [];
  if (readings.length) {
    const byDay = new Map();
    readings.forEach(r => {
      const d = new Date(r.fecha_hora);
      const key = d.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');
      byDay.set(key, (byDay.get(key) || 0) + Number(r.energia_kwh || 0));
    });
    const labels = ['lun','mar','mié','jue','vie','sáb','dom'];
    db.stats.values = labels.map(l => Number((byDay.get(l) || 0).toFixed(2)));
    db.stats.totalKwh = Number(readings.reduce((a,r)=>a+Number(r.energia_kwh||0),0).toFixed(2));
  }
  apiOnline = true;
  persist();
}

async function refreshFromApi({showError = false} = {}) {
  if (!db.user?.id) return false;
  try {
    const data = await apiRequest(`/dashboard/${db.user.id}`);
    mapDashboard(data);
    apiOnline = true;
    renderAll();
    return true;
  } catch (error) {
    apiOnline = false;
    clearSystemState();
    renderAll();
    if (showError) showToast('No se pudo cargar MySQL', error.message, 'error');
    console.warn('No se pudo actualizar desde LUMI API:', error.message);
    return false;
  }
}

async function saveHistoryApi(text, detail, type='success', roomId=null) {
  if (!db.user?.id || !apiOnline) return;
  try {
    await apiRequest('/historial', { method:'POST', body: JSON.stringify({ usuario_id: db.user.id, habitacion_id: roomId ? Number(roomId) : null, tipo: type === 'green' ? 'success' : type === 'red' ? 'error' : 'info', evento: text, detalle: detail }) });
  } catch (e) { console.warn(e.message); }
}

async function updateLightApi(room, options = {}) {
  if (!room?.lightId) {
    showToast('No se pudo guardar', 'Esta zona todavía no tiene una luz asociada en la base de datos.', 'error');
    return false;
  }

  if (!apiOnline && !(await ensureApiOnline())) {
    showToast('Sin conexión con la API', 'No se pudo conectar con Node.js. El cambio no se guardó en MySQL.', 'error');
    await refreshFromApi();
    return false;
  }

  try {
    const data = await apiRequest(`/luces/${room.lightId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        encendida: Boolean(room.on),
        intensidad: Number(room.brightness) || 0,
        modo: room.mode || 'manual'
      })
    });

    if (data.ok && data.luz) {
      room.on = Boolean(data.luz.encendida);
      room.brightness = Number(data.luz.intensidad || 0);
      room.mode = data.luz.modo || room.mode;
      apiOnline = true;
      if (!options.silent) {
        showToast('Guardado en MySQL', `${room.name}: ${room.brightness}%`);
      }
      return true;
    }
    throw new Error('La API no confirmó el cambio.');
  } catch (e) {
    apiOnline = false;
    showToast('No se guardó el cambio', e.message, 'error');
    await refreshFromApi();
    return false;
  }
}

async function login(name, email, password) {
  try {
    const data = await apiRequest('/auth/login', { method:'POST', body: JSON.stringify({ email, password }) });
    db.auth.loggedIn = true;
    db.user = { id: data.usuario.id, name: data.usuario.nombre, email: data.usuario.email };
    clearSystemState();
    persist();
    const ok = await refreshFromApi({showError:true});
    if (!ok) throw new Error('La sesión inició, pero no se pudo cargar el dashboard desde MySQL.');
    initApp();
    showToast('Bienvenido a LUMI', `Sesión iniciada como ${email}.`);
  } catch (error) {
    db.auth.loggedIn = false;
    persist();
    showToast('No se pudo iniciar sesión', error.message, 'error');
  }
}

function logout() { db.auth.loggedIn = false; apiOnline = false; persist(); location.reload(); }
async function initApp() {
  if (db.auth.loggedIn && !db.user?.id) { db.auth.loggedIn = false; persist(); }
  $('#authScreen').classList.toggle('hidden', db.auth.loggedIn);
  $('#appShell').classList.toggle('hidden', !db.auth.loggedIn);
  if (db.auth.loggedIn) {
    $('#profileInitial').textContent = (db.user.name || 'U').trim().charAt(0).toUpperCase();
    startClock();
    clearSystemState();
    renderAll();
    await refreshFromApi({showError:true});
  }
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  await login(email.split('@')[0] || 'Usuario LUMI', email, password);
});
$('#googleDemoBtn').addEventListener('click', () => {
  showToast('Google', 'La autenticación con Google se implementará en la siguiente etapa.', 'success');
});
$('#logoutBtn').addEventListener('click', logout);

function navigate(view) {
  currentView = view;
  $$('.view').forEach(v => v.classList.toggle('active-view', v.id === `view-${view}`));
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (mobileNavOpen) toggleMobileNav(false);
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#mainNav').addEventListener('click', e => { const btn = e.target.closest('.nav-item'); if (btn) navigate(btn.dataset.view); });
document.addEventListener('click', e => { const target = e.target.closest('[data-view-target]'); if (target) navigate(target.dataset.viewTarget); });

function toggleMobileNav(open = !mobileNavOpen) {
  mobileNavOpen = open;
  $('.sidebar').classList.toggle('open', open);
  $('#mobileOverlay').classList.toggle('hidden', !open);
}
$('#mobileMenuBtn').addEventListener('click', () => toggleMobileNav());
$('#mobileOverlay').addEventListener('click', () => toggleMobileNav(false));

function renderAll() {
  renderTopbar(); renderMainControls(); renderRooms(); renderModes(); renderSchedules(); renderStats(); renderHistory(); renderSettings(); renderConnection();
}
function renderTopbar() {
  $('#currentDate').textContent = formatDate();
  $('#profileInitial').textContent = (db.user.name || 'U').trim().charAt(0).toUpperCase();
  const online = db.device.connected;
  $('#topConnectionText').textContent = online ? 'ESP32 Conectado' : 'ESP32 Desconectado';
  $('#topConnectionIp').textContent = db.device.ip;
  const dot = $('.connection-pill .status-dot'); dot.classList.toggle('offline', !online);
  $('#globalStateChip').classList.toggle('chip-online', online); $('#globalStateChip').innerHTML = `<span class="status-dot ${online ? '' : 'offline'}"></span> ${online ? 'Sistema en línea' : 'Sistema sin conexión'}`;
}
function startClock() {
  clearInterval(window.__lumiClock);
  const tick = () => { $('#currentTime').textContent = formatTime(); };
  tick(); window.__lumiClock = setInterval(tick, 1000);
}

function renderMainControls() {
  const light = getRoom('sala');
  $('#mainBrightness').value = light.brightness;
  $('#mainBrightnessText').textContent = `${light.brightness}%`;
  $('#mainStateText').textContent = light.on ? 'Encendida' : 'Apagada';
  $('#mainPowerText').textContent = light.on ? 'Encendida' : 'Apagada';
  $('#mainOnlineText').textContent = db.device.connected ? 'En línea' : 'Sin conexión';
  $('#mainPowerToggle').classList.toggle('on', light.on);
  $('#mainPowerToggle').setAttribute('aria-checked', String(light.on));
  $('#bulbVisual').classList.toggle('on', light.on);
  $$('#mainQuickValues button').forEach(b => b.classList.toggle('selected', Number(b.dataset.value) === light.brightness));
}

$('#mainPowerToggle').addEventListener('click', async () => {
  const room = getRoom('sala');
  const previous = { on: room.on, brightness: room.brightness };
  room.on = !room.on;
  if (!room.on) room.brightness = 0; else if (!room.brightness) room.brightness = 75;
  renderAll();
  const saved = await updateLightApi(room);
  if (!saved) { room.on = previous.on; room.brightness = previous.brightness; renderAll(); return; }
  addHistory(room.on ? 'Luz encendida' : 'Luz apagada', `Sala · ${room.brightness}%`, room.on ? 'green' : 'red', room.id);
  persist();
});
$('#mainBrightness').addEventListener('input', e => {
  const value = Number(e.target.value), room = getRoom('sala');
  room.brightness = value; room.on = value > 0; renderMainControls(); renderRooms();
});
$('#mainBrightness').addEventListener('change', async () => {
  const room = getRoom('sala');
  const saved = await updateLightApi(room);
  if (saved) {
    addHistory('Intensidad cambiada', `Sala · ${room.brightness}%`, 'green', room.id);
    persist(); renderAll();
  }
});
$('#mainQuickValues').addEventListener('click', async e => {
  const b = e.target.closest('button[data-value]'); if (!b) return;
  const room = getRoom('sala'); const previous = { on: room.on, brightness: room.brightness };
  room.brightness = Number(b.dataset.value); room.on = room.brightness > 0;
  renderAll();
  const saved = await updateLightApi(room);
  if (!saved) { room.on = previous.on; room.brightness = previous.brightness; renderAll(); return; }
  addHistory('Intensidad cambiada', `Sala · ${room.brightness}%`, 'green', room.id); persist();
});

function renderRooms() {
  const html = db.lights.map(l => roomTile(l, false)).join(''); $('#roomGrid').innerHTML = html; $('#roomPageGrid').innerHTML = db.lights.map(l => roomTile(l, true)).join('');
  bindRoomControls();
}
function roomTile(light, page) {
  return `<div class="room-tile ${light.on ? 'active' : ''}" data-room="${light.id}">
    <div class="room-head"><div class="room-icon">${light.icon}</div><button class="toggle room-power ${light.on ? 'on' : ''}" data-action="power"><span></span></button></div>
    <div class="room-name">${escapeHtml(light.name)}</div><div class="room-value">${light.on ? light.brightness : 0}%</div>
    <div class="room-control"><input data-action="brightness" type="range" min="0" max="100" step="5" value="${light.brightness}"></div>
    ${page ? '<div class="room-image"></div>' : ''}
  </div>`;
}
function bindRoomControls() {
  $$('#roomGrid .room-tile, #roomPageGrid .room-tile').forEach(tile => {
    tile.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset.action; if (action) return;
      const id = tile.dataset.room; const room = getRoom(id); openRoomModal(room);
    });
  });
  $$('#roomGrid [data-action="power"], #roomPageGrid [data-action="power"]').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    const room = getRoom(btn.closest('[data-room]').dataset.room);
    const previous = { on: room.on, brightness: room.brightness };
    room.on = !room.on;
    if (!room.on) room.brightness = 0; else if (!room.brightness) room.brightness = 75;
    renderAll();
    const saved = await updateLightApi(room);
    if (!saved) { room.on = previous.on; room.brightness = previous.brightness; renderAll(); return; }
    addHistory(room.on ? 'Luz encendida' : 'Luz apagada', `${room.name} · ${room.brightness}%`, room.on ? 'green' : 'red', room.id);
    persist();
  }));
  $$('#roomGrid [data-action="brightness"], #roomPageGrid [data-action="brightness"]').forEach(slider => slider.addEventListener('input', e => {
    e.stopPropagation();
    const tile = slider.closest('[data-room]');
    const room = getRoom(tile.dataset.room);
    room.brightness = Number(slider.value);
    room.on = room.brightness > 0;
    tile.classList.toggle('active', room.on);
    const value = tile.querySelector('.room-value');
    if (value) value.textContent = `${room.on ? room.brightness : 0}%`;
    const toggle = tile.querySelector('[data-action="power"]');
    if (toggle) toggle.classList.toggle('on', room.on);
  }));
  $$('#roomGrid [data-action="brightness"], #roomPageGrid [data-action="brightness"]').forEach(slider => slider.addEventListener('change', async e => {
    e.stopPropagation();
    const room = getRoom(slider.closest('[data-room]').dataset.room);
    const saved = await updateLightApi(room);
    if (saved) { addHistory('Intensidad cambiada', `${room.name} · ${room.brightness}%`, 'green', room.id); persist(); renderAll(); }
  }));
}

$('#addRoomBtn').addEventListener('click', () => openRoomModal(null));
function openRoomModal(room) {
  const isNew = !room; showModal({ title: isNew ? 'Agregar zona' : `Editar ${room.name}`, body: `<div class="form-grid">
    <div class="form-group"><label>Nombre</label><input id="modalRoomName" value="${escapeHtml(room?.name || '')}" placeholder="Ej. Estudio"></div>
    <div class="form-group"><label>Icono</label><input id="modalRoomIcon" value="${escapeHtml(room?.icon || '💡')}" placeholder="💡"></div>
  </div>`, actions: [{ text: 'Cancelar', cls:'btn btn-outline', onClick: closeModal }, { text: isNew ? 'Crear zona' : 'Guardar', cls:'btn btn-primary', onClick: () => {
    const name = $('#modalRoomName').value.trim() || 'Nueva zona'; const icon = $('#modalRoomIcon').value.trim() || '💡';
    if (isNew) db.lights.push({ id: slug(name), name, icon, on:false, brightness:0, mode:'manual' }); else { room.name = name; room.icon = icon; }
    persist(); addHistory(isNew ? 'Zona creada' : 'Zona actualizada', name); closeModal(); renderAll(); showToast('Guardado', `${name} quedó disponible en LUMI.`);
  }}] });
}
function slug(value) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-') + '-' + Date.now().toString(36); }

const MODES = [
  { id:'automatico', name:'Automático', icon:'☀️', desc:'Ajusta según la luz ambiental', detail:'LUMI simula un ajuste progresivo según el sensor de luz ambiental.', brightness:75 },
  { id:'ahorro', name:'Ahorro', icon:'🌿', desc:'Bajo consumo de energía', detail:'Mantiene niveles moderados para reducir el consumo.', brightness:45 },
  { id:'lectura', name:'Lectura', icon:'📖', desc:'Luz brillante y clara', detail:'Ideal para lectura y tareas, con mayor intensidad.', brightness:90 },
  { id:'noche', name:'Noche', icon:'🌙', desc:'Luz tenue y relajante', detail:'Reduce la intensidad para un ambiente nocturno.', brightness:25 },
  { id:'ausente', name:'Ausente', icon:'🏠', desc:'Simula presencia en casa', detail:'Activa escenarios programados para dar apariencia de actividad.', brightness:35 },
  { id:'personalizado', name:'Personalizado', icon:'⚙️', desc:'Configura a tu medida', detail:'Combina intensidades y habitaciones como prefieras.', brightness:65 }
];
function renderModes() {
  $('#modeGridCompact').innerHTML = MODES.map(m => modeTile(m)).join('');
  $('#modePageGrid').innerHTML = MODES.map(m => `<button class="mode-tile ${db.activeMode===m.id?'active':''}" data-mode="${m.id}"><div class="mode-emoji">${m.icon}</div><strong>${m.name}</strong><span>${m.desc}</span></button>`).join('');
  bindModeButtons();
  const current = MODES.find(m => m.id === db.activeMode) || MODES[0];
  $('#modeDetailCard').innerHTML = `<div class="card-header"><div><span class="mini-label">MODO ACTIVO</span><h2>${current.icon} ${current.name}</h2></div><span class="chip chip-online">${current.brightness}% base</span></div><p class="settings-note">${current.detail}</p>`;
}
function modeTile(m) { return `<button class="mode-tile ${db.activeMode===m.id?'active':''}" data-mode="${m.id}"><div class="mode-emoji">${m.icon}</div><strong>${m.name}</strong><span>${m.desc}</span></button>`; }
function bindModeButtons() { $$('[data-mode]').forEach(btn => btn.addEventListener('click', () => applyMode(btn.dataset.mode))); }
async function applyMode(id) {
  const mode = MODES.find(m => m.id === id) || MODES[0];
  const snapshot = clone(db.lights);
  db.activeMode = id;
  if (id !== 'personalizado') {
    for (const l of db.lights) {
      if (l.id === '1' || l.id === 'sala') { l.brightness = mode.brightness; l.on = mode.brightness > 0; }
      l.mode = id;
      if (l.lightId) {
        const saved = await updateLightApi(l, { silent: true });
        if (!saved) {
          db.lights = snapshot;
          renderAll();
          showToast('Modo no guardado', 'No se pudieron actualizar todas las luces en MySQL.', 'error');
          return;
        }
      }
    }
  }
  addHistory(`Modo ${mode.name.toLowerCase()} activado`, `Base ${mode.brightness}%`);
  persist(); renderAll(); showToast(`Modo ${mode.name}`, 'Escenario aplicado y sincronizado con MySQL.');
}

function renderSchedules() {
  const active = db.schedules.filter(s => s.active);
  $('#schedulePreview').innerHTML = active.slice(0,3).map(scheduleRow).join('') || '<div class="settings-note">No hay horarios activos.</div>';
  $('#scheduleFullList').innerHTML = db.schedules.map(s => scheduleFullRow(s)).join('') || '<div class="settings-note">Aún no hay horarios.</div>';
  $('#scheduleMasterToggle').checked = db.schedulesEnabled; $('#scheduleMasterToggle2').checked = db.schedulesEnabled;
  bindScheduleControls();
}
function scheduleRow(s) { const room = getRoom(s.roomId); return `<div class="schedule-row"><div><time>${s.time}</time><small>${s.days.join(', ')}</small></div><div class="schedule-meta">${s.action} · ${escapeHtml(room.name)}</div><span class="toggle ${s.active && db.schedulesEnabled ? 'on':''}"><span></span></span></div>`; }
function scheduleFullRow(s) { const room = getRoom(s.roomId); return `<div class="schedule-full-item"><time>${s.time}</time><div><strong>${s.action} · ${escapeHtml(room.name)}</strong><span>${s.days.join(', ')} · ${s.active ? 'Activo':'Pausado'}</span></div><div class="schedule-actions"><button class="toggle ${s.active?'on':''}" data-schedule-toggle="${s.id}"><span></span></button><button class="icon-square" data-schedule-delete="${s.id}">×</button></div></div>`; }
function bindScheduleControls() {
  $$('[data-schedule-toggle]').forEach(btn => btn.addEventListener('click', () => { const s = db.schedules.find(x => x.id == btn.dataset.scheduleToggle); if (!s) return; s.active = !s.active; addHistory(s.active ? 'Horario activado':'Horario pausado', s.time); persist(); renderAll(); }));
  $$('[data-schedule-delete]').forEach(btn => btn.addEventListener('click', () => { db.schedules = db.schedules.filter(s => s.id != btn.dataset.scheduleDelete); addHistory('Horario eliminado', 'Programación'); persist(); renderAll(); showToast('Horario eliminado','La regla fue eliminada.'); }));
}
$('#scheduleMasterToggle').addEventListener('change', e => { db.schedulesEnabled = e.target.checked; persist(); renderAll(); showToast('Programación actualizada', e.target.checked ? 'Automatizaciones activas.':'Automatizaciones pausadas.'); });
$('#scheduleMasterToggle2').addEventListener('change', e => { db.schedulesEnabled = e.target.checked; persist(); renderAll(); });
$('#addScheduleBtn').addEventListener('click', () => openScheduleModal());
function openScheduleModal() {
  const roomOptions = db.lights.map(l=>`<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
  const dayOptions = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>`<label class="check-setting"><input type="checkbox" name="days" value="${d}" ${['Lun','Mar','Mié','Jue','Vie'].includes(d)?'checked':''}><span>${d}</span></label>`).join('');
  showModal({ title:'Nuevo horario', body:`<div class="form-grid"><div class="form-group"><label>Habitación</label><select id="modalScheduleRoom" class="select">${roomOptions}</select></div><div class="form-group"><label>Acción</label><select id="modalScheduleAction" class="select"><option>Encender</option><option>Apagar</option></select></div><div class="form-group"><label>Hora</label><input id="modalScheduleTime" type="time" value="20:00"></div><div class="form-group full"><label>Días</label><div class="form-grid">${dayOptions}</div></div></div>`, actions:[{text:'Cancelar', cls:'btn btn-outline', onClick:closeModal},{text:'Crear horario', cls:'btn btn-primary', onClick:()=>{ const days=$$('[name="days"]:checked').map(i=>i.value); db.schedules.push({id:Date.now(), roomId:$('#modalScheduleRoom').value, action:$('#modalScheduleAction').value, time:$('#modalScheduleTime').value, days:days.length?days:['Todos'], active:true}); addHistory('Horario creado', `${$('#modalScheduleTime').value} · ${$('#modalScheduleAction').value}`); persist(); closeModal(); renderAll(); showToast('Horario creado','La automatización quedó activa.'); }}]});
}

function calcStats() {
  const values = db.stats.values;
  return currentChartTab === 'horas' ? values.map(v => Math.round(v * 1.65)) : currentChartTab === 'comparativa' ? values.map((v,i)=>Math.max(1, v * (i%2?0.78:1.15))) : values;
}
function buildBars(container, values, labels, scale=1) { container.innerHTML = values.map((v,i)=>`<div class="bar" style="height:${Math.max(12, Math.min(95, v/scale*100))}%"><span>${labels[i]||''}</span></div>`).join(''); }
function renderStats() {
  const values = calcStats(); const max = Math.max(...values,1); buildBars($('#miniChart'), values, ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'], max);
  buildBars($('#largeChart'), values, ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'], max);
  $('#totalKwhText').textContent = `${db.stats.totalKwh} kWh`; $('#savingText').textContent = `−${db.stats.saving}%`; $('#avgHoursText').textContent = formatMinutes(db.stats.avgMinutes);
  $('#pageKwh').textContent = `${db.stats.totalKwh} kWh`; $('#pageSaving').textContent = `${db.stats.saving}%`; $('#pageHours').textContent = formatMinutes(38*60+44); $('#pageAvg').textContent = formatMinutes(db.stats.avgMinutes);
  $$('#chartTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentChartTab)); $$('#pageChartTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentChartTab));
  $('#largeChartTitle').textContent = currentChartTab==='horas'?'Horas de uso':currentChartTab==='comparativa'?'Comparativa energética':'Consumo energético';
}
$$('#chartTabs button, #pageChartTabs button').forEach(b=>b.addEventListener('click',()=>{currentChartTab=b.dataset.tab;renderStats();}));
$('#statsRangeSelect').addEventListener('change', ()=>showToast('Periodo actualizado', $('#statsRangeSelect').selectedOptions[0].textContent));
$('#statsRangePage').addEventListener('change', ()=>showToast('Periodo actualizado', $('#statsRangePage').selectedOptions[0].textContent));

function renderHistory() {
  const render = item => `<div class="history-item"><span class="history-dot ${item.type}"></span><div class="history-content"><strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(item.detail)}</span></div><span class="history-time">${escapeHtml(item.time)}</span></div>`;
  $('#historyPreview').innerHTML = db.activity.slice(0,7).map(render).join(''); $('#fullHistoryList').innerHTML = db.activity.map(render).join('') || '<div class="settings-note">No hay eventos registrados.</div>';
}
$('#clearHistoryBtn').addEventListener('click', ()=>{ if (!confirm('¿Borrar todo el historial de LUMI?')) return; db.activity=[]; persist(); renderHistory(); showToast('Historial limpiado','Los eventos fueron eliminados.'); });

function renderConnection() {
  const on = db.device.connected;
  $('#espConnectionBanner').classList.toggle('offline',!on); $('#espStatusText').textContent=on?'Conectado':'Desconectado'; $('#espIpText').textContent=db.device.ip;
  $('#latencyText').textContent=on?`${db.device.latency} ms`:'—'; $('#rssiText').textContent=on?`${db.device.rssi} dBm`:'—'; $('#uptimeText').textContent=on?formatMinutes(db.device.uptimeMinutes):'—'; $('#syncTimeText').textContent=on?db.device.lastSync:'—';
}
$('#testConnectionBtn').addEventListener('click', async ()=>{
  const started=performance.now();
  try {
    await apiRequest('/health');
    await refreshFromApi();
    const latency = Math.round(performance.now()-started);
    addHistory('Conexión con LUMI API comprobada', `${latency} ms`);
    showToast('API disponible', `Servidor LUMI respondió en ${latency} ms.`);
  } catch (error) {
    apiOnline = false;
    showToast('Sin conexión con la API', error.message, 'error');
  }
});
$('#deviceStatusBtn').addEventListener('click', ()=>navigate('configuracion'));
$('#disconnectBtn').addEventListener('click', ()=>{ db.device.connected=false; addHistory('ESP32 desconectado','Prueba local','red'); persist(); renderAll(); showToast('ESP32 desconectado','El panel está ahora en modo sin conexión.','error'); });

$('#saveProfileBtn').addEventListener('click',()=>{db.user.name=$('#settingsName').value.trim()||'Usuario LUMI';db.user.email=$('#settingsEmail').value.trim()||'demo@lumi.local';persist();renderAll();showToast('Perfil actualizado','Tus datos fueron guardados.');});
$('#saveDeviceBtn').addEventListener('click',()=>{db.device.name=$('#deviceNameInput').value.trim()||'ESP32 Principal';db.device.ip=$('#deviceIpInput').value.trim()||'192.168.1.85';db.device.simulated=$('#simulateConnectionToggle').checked;persist();renderAll();showToast('Dispositivo guardado',`${db.device.name} · ${db.device.ip}`);});
$('#notifyToggle').addEventListener('change',e=>{db.settings.notifications=e.target.checked;persist();}); $('#animationsToggle').addEventListener('change',e=>{db.settings.animations=e.target.checked;persist();document.body.classList.toggle('reduce-motion',!e.target.checked);});
$('#resetDemoBtn').addEventListener('click',()=>{if(confirm('¿Restablecer toda la demo?')) resetDemo();});
function renderSettings(){ $('#settingsName').value=db.user.name; $('#settingsEmail').value=db.user.email; $('#deviceNameInput').value=db.device.name; $('#deviceIpInput').value=db.device.ip; $('#simulateConnectionToggle').checked=db.device.simulated; $('#notifyToggle').checked=db.settings.notifications; $('#animationsToggle').checked=db.settings.animations; document.body.classList.toggle('reduce-motion',!db.settings.animations); }

function showModal({title, body, actions=[]}) {
  const root=$('#modalRoot'); root.classList.remove('hidden'); root.innerHTML=`<div class="modal"><div class="modal-header"><div><h3>${title}</h3><p>Configura esta sección de LUMI.</p></div><button class="close-btn" id="modalClose">×</button></div><div>${body}</div><div class="modal-actions">${actions.map((a,i)=>`<button class="${a.cls}" data-modal-action="${i}">${a.text}</button>`).join('')}</div></div>`;
  $('#modalClose').addEventListener('click',closeModal); $$('#modalRoot [data-modal-action]').forEach((btn,i)=>btn.addEventListener('click',actions[i].onClick)); root.addEventListener('click',e=>{if(e.target===root)closeModal();},{once:true});
}
function closeModal(){ $('#modalRoot').classList.add('hidden'); $('#modalRoot').innerHTML=''; }

$('#notificationBtn').addEventListener('click',()=>showToast('Notificaciones',db.activity[0]?.text||'Sin novedades.'));
$('#profileBtn').addEventListener('click',()=>navigate('configuracion'));
$('#homeSelector').addEventListener('click',()=>showToast('Hogar activo','Hogar Inteligente'));
$('#espOptionsBtn').addEventListener('click',()=>navigate('configuracion'));

// Sincronización periódica: MySQL es la fuente de verdad del estado del sistema.
clearInterval(window.__lumiSync);
window.__lumiSync = setInterval(() => {
  if (db.auth.loggedIn && document.visibilityState !== 'hidden') refreshFromApi();
}, 10000);

// Atajos: teclado
window.addEventListener('keydown', e => {
  if (!db.auth.loggedIn) return;
  if (e.key === '1') navigate('inicio'); if (e.key === '2') navigate('habitaciones'); if (e.key === '3') navigate('modos'); if (e.key === '4') navigate('programacion');
});

// Inicialización
initApp();
