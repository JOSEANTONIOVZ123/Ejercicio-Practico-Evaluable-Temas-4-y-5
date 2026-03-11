const state = {
  map: null,
  points: [],
  markersById: new Map(),
  selectedId: null,
  session: {
    loggedIn: false,
    user: window.__INITIAL_USER__ || null
  },
  favorites: []
};

const FAVORITES_KEY = 'malaga_favorites_admin';
const DEFAULT_CENTER = [36.7213, -4.4214];
const DEFAULT_ZOOM = 15;
const FOCUS_ZOOM = 18;

const authBtn = document.getElementById('auth-btn');
const sessionBadge = document.getElementById('session-badge');
const loginForm = document.getElementById('login-form');
const pointsList = document.getElementById('points-list');

const loginModalElement = document.getElementById('loginModal');
const loginModal = new bootstrap.Modal(loginModalElement);

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getPropValue(props, keys) {
  if (!props) return '';

  const normalizedProps = {};

  for (const [key, value] of Object.entries(props)) {
    normalizedProps[key.toLowerCase()] = value;
  }

  for (const key of keys) {
    const value = normalizedProps[key.toLowerCase()];

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return '';
}

function normalizeUrl(url) {
  if (!url) return '';

  const trimmed = String(url).trim();

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:')
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function formatMultilineText(text) {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

function buildPointId(feature, index, title, lat, lng) {
  const rawId =
    feature.id ||
    feature.properties?.ID ||
    feature.properties?.id ||
    `${title}-${lat}-${lng}-${index}`;

  return slugify(rawId);
}

function normalizeFeature(feature, index) {
  if (!feature.geometry || feature.geometry.type !== 'Point') {
    return null;
  }

  if (
    !Array.isArray(feature.geometry.coordinates) ||
    feature.geometry.coordinates.length < 2
  ) {
    return null;
  }

  const lng = Number(feature.geometry.coordinates[0]);
  const lat = Number(feature.geometry.coordinates[1]);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  const props = feature.properties || {};

  const title =
    getPropValue(props, [
      'NOMBRE',
      'name',
      'nombre',
      'title',
      'titulo',
      'título',
      'denominacion',
      'denominación',
      'monumento',
      'poi'
    ]) || `Punto ${index + 1}`;

  const address =
    getPropValue(props, [
      'DIRECCION',
      'address',
      'direccion',
      'dirección',
      'ubicacion',
      'ubicación',
      'via',
      'calle'
    ]) || 'Sin dirección disponible';

  const description = getPropValue(props, [
    'DESCRIPCION',
    'description',
    'descripcion',
    'descripción'
  ]);

  const url = getPropValue(props, ['URL', 'url']);
  const email = getPropValue(props, ['EMAIL', 'email']);
  const contacto = getPropValue(props, ['CONTACTO', 'contacto']);
  const horarios = getPropValue(props, ['HORARIOS', 'horarios']);
  const precios = getPropValue(props, ['PRECIOS', 'precios']);
  const titularidad = getPropValue(props, ['TITULARIDAD', 'titularidad']);
  const tarjetaJoven = getPropValue(props, ['TARJETAJOVEN', 'tarjetajoven']);
  const accesoPMR = getPropValue(props, ['ACCESOPMR', 'accesopmr']);
  const infoEsp = getPropValue(props, ['INFOESP', 'infoesp']);

  return {
    id: buildPointId(feature, index, title, lat, lng),
    title,
    address,
    description,
    url,
    email,
    contacto,
    horarios,
    precios,
    titularidad,
    tarjetaJoven,
    accesoPMR,
    infoEsp,
    lat,
    lng,
    properties: props
  };
}

function getStoredFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(ids) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

function syncFavoritesFromStorage() {
  state.favorites = state.session.loggedIn ? getStoredFavorites() : [];
}

function isFavorite(pointId) {
  return state.favorites.includes(pointId);
}

function updateSessionUi() {
  if (state.session.loggedIn && state.session.user) {
    authBtn.textContent = 'Logout';
    authBtn.classList.remove('btn-secondary');
    authBtn.classList.add('btn-outline-light');
    sessionBadge.textContent = state.session.user.username;
    sessionBadge.classList.remove('d-none');
  } else {
    authBtn.textContent = 'Login';
    authBtn.classList.remove('btn-outline-light');
    authBtn.classList.add('btn-secondary');
    sessionBadge.textContent = '';
    sessionBadge.classList.add('d-none');
  }
}

function buildPopupHtml(point) {
  return `
    <div class="popup-content">
      <strong>${escapeHtml(point.title)}</strong><br>
      <span>${escapeHtml(point.address)}</span>
    </div>
  `;
}

function createMarker(point) {
  const marker = L.marker([point.lat, point.lng]).addTo(state.map);
  marker.bindPopup(buildPopupHtml(point));

  marker.on('click', () => {
    focusPoint(point.id);
  });

  state.markersById.set(point.id, marker);
}

function showPointModal(point) {
  const safeUrl = normalizeUrl(point.url);

  Swal.fire({
    icon: 'info',
    titleText: point.title,
    confirmButtonText: 'OK',
    width: 760,
    customClass: {
      popup: 'poi-swal-popup',
      title: 'poi-swal-title',
      htmlContainer: 'poi-swal-html'
    },
    html: `
      <div class="poi-swal-content">
        <p class="poi-swal-address">
          <strong>Dirección:</strong> ${escapeHtml(point.address)}
        </p>

        ${
          point.description
            ? `<div class="poi-swal-description">${formatMultilineText(point.description)}</div>`
            : ''
        }

        <div class="poi-swal-grid">
          <div class="poi-swal-box">
            <div class="poi-swal-label">Latitud</div>
            <div class="poi-swal-value">${escapeHtml(String(point.lat))}</div>
          </div>

          <div class="poi-swal-box">
            <div class="poi-swal-label">Longitud</div>
            <div class="poi-swal-value">${escapeHtml(String(point.lng))}</div>
          </div>
        </div>

        <div class="poi-swal-details">
          ${
            point.titularidad
              ? `
                <div class="poi-swal-detail-row">
                  <div class="poi-swal-label">Titularidad</div>
                  <div class="poi-swal-value">${escapeHtml(point.titularidad)}</div>
                </div>
              `
              : ''
          }

          ${
            point.accesoPMR
              ? `
                <div class="poi-swal-detail-row">
                  <div class="poi-swal-label">Acceso PMR</div>
                  <div class="poi-swal-value">${escapeHtml(point.accesoPMR)}</div>
                </div>
              `
              : ''
          }

          ${
            point.tarjetaJoven
              ? `
                <div class="poi-swal-detail-row">
                  <div class="poi-swal-label">Tarjeta Joven</div>
                  <div class="poi-swal-value">${escapeHtml(point.tarjetaJoven)}</div>
                </div>
              `
              : ''
          }

          ${
            point.contacto
              ? `
                <div class="poi-swal-detail-row">
                  <div class="poi-swal-label">Contacto</div>
                  <div class="poi-swal-value">${escapeHtml(point.contacto)}</div>
                </div>
              `
              : ''
          }

          ${
            point.horarios
              ? `
                <div class="poi-swal-detail-row">
                  <div class="poi-swal-label">Horarios</div>
                  <div class="poi-swal-value">${formatMultilineText(point.horarios)}</div>
                </div>
              `
              : ''
          }

          ${
            point.precios
              ? `
                <div class="poi-swal-detail-row">
                  <div class="poi-swal-label">Precios</div>
                  <div class="poi-swal-value">${formatMultilineText(point.precios)}</div>
                </div>
              `
              : ''
          }

          ${
            point.infoEsp
              ? `
                <div class="poi-swal-detail-row">
                  <div class="poi-swal-label">Información adicional</div>
                  <div class="poi-swal-value">${formatMultilineText(point.infoEsp)}</div>
                </div>
              `
              : ''
          }

          ${
            point.email
              ? `
                <div class="poi-swal-detail-row">
                  <div class="poi-swal-label">Email</div>
                  <div class="poi-swal-value">
                    <a href="mailto:${escapeHtml(point.email)}">${escapeHtml(point.email)}</a>
                  </div>
                </div>
              `
              : ''
          }

          ${
            safeUrl
              ? `
                <div class="poi-swal-detail-row">
                  <div class="poi-swal-label">Web</div>
                  <div class="poi-swal-value">
                    <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">
                      ${escapeHtml(point.url)}
                    </a>
                  </div>
                </div>
              `
              : ''
          }
        </div>
      </div>
    `
  });
}

function focusPoint(pointId) {
  const point = state.points.find((item) => item.id === pointId);
  if (!point) return;

  state.selectedId = point.id;
  renderList();

  state.map.setView([point.lat, point.lng], FOCUS_ZOOM, {
    animate: true
  });

  const marker = state.markersById.get(point.id);
  if (marker) {
    marker.openPopup();
  }

  showPointModal(point);
}

function renderList() {
  if (!state.points.length) {
    pointsList.innerHTML = `
      <div class="empty-state">
        No hay puntos para mostrar.
      </div>
    `;
    return;
  }

  pointsList.innerHTML = state.points
    .map((point) => {
      const selectedClass = point.id === state.selectedId ? 'is-selected' : '';
      const favoriteActive = isFavorite(point.id);

      return `
        <div class="list-group-item point-item ${selectedClass}" data-point-id="${point.id}">
          <div class="point-item-content">
            <div class="point-text">
              <h3 class="point-title">${escapeHtml(point.title)}</h3>
              <p class="point-address">${escapeHtml(point.address)}</p>
            </div>
            <div class="point-actions">
              <button
                type="button"
                class="btn btn-outline-secondary favorite-btn ${favoriteActive ? 'is-favorite' : ''}"
                data-favorite-id="${point.id}"
                title="${state.session.loggedIn ? 'Favorito' : 'Necesitas iniciar sesión'}"
              >
                ${favoriteActive ? '♥' : '♡'}
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function attachListEvents() {
  pointsList.addEventListener('click', (event) => {
    const favoriteBtn = event.target.closest('[data-favorite-id]');

    if (favoriteBtn) {
      event.stopPropagation();
      toggleFavorite(favoriteBtn.dataset.favoriteId);
      return;
    }

    const pointItem = event.target.closest('[data-point-id]');

    if (pointItem) {
      focusPoint(pointItem.dataset.pointId);
    }
  });
}

function toggleFavorite(pointId) {
  if (!state.session.loggedIn) {
    Swal.fire({
      icon: 'warning',
      title: 'Debes iniciar sesión',
      text: 'Solo los usuarios autenticados pueden gestionar favoritos.'
    });
    return;
  }

  if (isFavorite(pointId)) {
    state.favorites = state.favorites.filter((id) => id !== pointId);
  } else {
    state.favorites.push(pointId);
  }

  saveFavorites(state.favorites);
  renderList();
}

async function fetchSession() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();

    state.session.loggedIn = data.loggedIn;
    state.session.user = data.user;

    syncFavoritesFromStorage();
    updateSessionUi();
  } catch (error) {
    console.error('Error consultando la sesión:', error);
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const username = formData.get('username');
  const password = formData.get('password');

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo iniciar sesión');
    }

    state.session.loggedIn = true;
    state.session.user = data.user;
    syncFavoritesFromStorage();
    updateSessionUi();
    renderList();
    loginModal.hide();

    await Swal.fire({
      icon: 'success',
      title: `Bienvenido, ${data.user.username}!`,
      showConfirmButton: false,
      timer: 1400
    });
  } catch (error) {
    Swal.fire({
      icon: 'error',
      title: 'Login incorrecto',
      text: error.message
    });
  }
}

async function handleAuthButtonClick() {
  if (!state.session.loggedIn) {
    loginModal.show();
    return;
  }

  const result = await Swal.fire({
    icon: 'question',
    title: '¿Cerrar sesión?',
    showCancelButton: true,
    confirmButtonText: 'Sí, salir',
    cancelButtonText: 'Cancelar'
  });

  if (!result.isConfirmed) return;

  try {
    const response = await fetch('/api/logout', {
      method: 'POST'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo cerrar la sesión');
    }

    state.session.loggedIn = false;
    state.session.user = null;
    state.favorites = [];
    updateSessionUi();
    renderList();

    Swal.fire({
      icon: 'success',
      title: 'Sesión cerrada',
      timer: 1200,
      showConfirmButton: false
    });
  } catch (error) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message
    });
  }
}

async function loadGeoJson() {
  try {
    const response = await fetch('/data/monumentos.geojson');

    if (!response.ok) {
      throw new Error('No se pudo cargar el archivo GeoJSON');
    }

    const geojson = await response.json();
    const features = Array.isArray(geojson.features) ? geojson.features : [];

    state.points = features
      .map((feature, index) => normalizeFeature(feature, index))
      .filter(Boolean);

    if (!state.points.length) {
      renderList();
      return;
    }

    state.points.forEach((point) => {
      createMarker(point);
    });

    renderList();

    const bounds = L.latLngBounds(
      state.points.map((point) => [point.lat, point.lng])
    );

    state.map.fitBounds(bounds, { padding: [40, 40] });
  } catch (error) {
    console.error(error);

    pointsList.innerHTML = `
      <div class="empty-state text-danger">
        Error cargando los puntos del mapa.
      </div>
    `;

    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo cargar el archivo monumentos.geojson'
    });
  }
}

function initMap() {
  state.map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);
}

async function initApp() {
  attachListEvents();
  loginForm.addEventListener('submit', handleLoginSubmit);
  authBtn.addEventListener('click', handleAuthButtonClick);

  initMap();
  await fetchSession();
  await loadGeoJson();
}

initApp();