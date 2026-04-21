/* ======== Глобальные переменные ======== */
let gridItems = [];
let totalColumns = 0;



function isMobileDevice() {
  return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
}


function isSteamDeckDevice() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const gpuRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    const isSteamDeckGPU = /Custom GPU/i.test(gpuRenderer);
    return isSteamDeckGPU;
}


function identifyPlatform() {
    if (isMobileDevice()) return 'mobile';
    if (isSteamDeckDevice()) return 'steamdeck';
    return 'desktop';
}


const platform = identifyPlatform();
document.documentElement.classList.add(`platform-${platform}`);

// Глобальные флаги инверсии для осей движения
const AXIS_IDS = ['linX', 'linY', 'linZ', 'angX', 'angY', 'angZ'];
window.axisInversion = window.axisInversion || {};
AXIS_IDS.forEach(axis => {
  if (typeof window.axisInversion[axis] === 'undefined') {
    window.axisInversion[axis] = (localStorage.getItem(`axis-invert-${axis}`) === 'true');
  }
});

/* ======== Класс для элементов сетки ======== */
class GridItem {
  constructor(gridContainer, row, col, rowSpan = 1, colSpan = 1, contentElement = null, isInteractable = false, name = null) {
    this.element = document.createElement('div');
    if (!isInteractable)
        this.element.className = 'grid-item';
    else
        this.element.className = 'grid-item grid-item-interactive';
    
    // Если передан элемент, добавляем его в контейнер
    if (contentElement instanceof HTMLElement) {
      this.element.appendChild(contentElement);
    } else if (contentElement !== null) {
      // Если передан не элемент, можно вывести предупреждение или обработать иначе
      console.warn('Content should be a DOM element. Using empty container.');
    }
    
    this.element.style.gridRow = `${row} / span ${rowSpan}`;
    this.element.style.gridColumn = `${col} / span ${colSpan}`;
    
    gridContainer.appendChild(this.element);
    
    this.row = row;
    this.col = col;
    this.name = name
  }
 moveGridItems(row, col , rowSpan, colSpan) {
    this.rowSpan = rowSpan;
    this.colSpan = colSpan;

    this.element.style.gridRow = `${row} / span ${rowSpan}`;
    this.element.style.gridColumn = `${col} / span ${colSpan}`;
}
}

/* ======== Расчет и обновление сетки ======== */
function updateGridLayout() {
  const grid = document.getElementById('grid');
  const cellSize = Math.min(
    (window.innerHeight - 32 - 13 * 16) / 14,
    (window.innerWidth - 32 - 13 * 16) / 14
  );
  
  grid.style.setProperty('--cell-size', `${cellSize}px`);
  calculateColumns();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
/* ======== Единый обработчик изменения размера окна ======== */
let resizeTimer = null;
function onWindowResize() {
  // 1. Пересчитываем размер ячейки и количество колонок
  updateGridLayout();
  // 2. Перемещаем кнопки по новым позициям
  resizeButtons();
  // 3. Проверяем ориентацию (портрет/ландшафт)
  checkOrientation();
}

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(onWindowResize, 50);
});

window.screen.orientation.addEventListener('change', () => {
  onWindowResize();
});

/* ======== Расчет количества колонок ======== */
function calculateColumns() {
  const grid = document.getElementById('grid');
  const cellSize = parseFloat(getComputedStyle(grid).getPropertyValue('--cell-size'));
  totalColumns = Math.floor((window.innerWidth - 32) / (cellSize + 16));
  
  // Обновляем grid-template-columns
  grid.style.gridTemplateColumns = `repeat(${totalColumns}, var(--cell-size))`;
}


/* ======== Текущий лимит оси (с учётом профилей скорости) ======== */
function getAxisLimitValue(axisId) {
  const input = document.getElementById(`${axisId}-limit`);
  if (input) {
    const val = parseFloat(input.value);
    if (!Number.isNaN(val)) {
      return val;
    }
  }

  const stored = localStorage.getItem(`${axisId}-limit`);
  const num = parseFloat(stored);
  if (!Number.isNaN(num)) {
    return num;
  }

  return 1.0;
}

/* ======== Вспомогательная настройка ROSBridge-панели на мобильных (iOS) ======== */
function setupRosbridgeInputsMobile() {
  if (platform !== 'mobile') return;

  const hostInput = document.getElementById('rosbridge-host');
  const portInput = document.getElementById('rosbridge-port');
  const inputs = [hostInput, portInput].filter(Boolean);

  if (!inputs.length) return;

  inputs.forEach((input) => {
    // После закрытия клавиатуры возвращаем страницу в исходное положение,
    // чтобы "фиксированные" элементы не оставались сдвинутыми вверх.
    input.addEventListener('blur', () => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 100);
    });
  });
}

/* ======== Расширенные настройки выбора ROSBridge host/port ======== */
function setupRosbridgeSelectors() {
  const hostHidden = document.getElementById('rosbridge-host');
  const portHidden = document.getElementById('rosbridge-port');
  const hostSelect = document.getElementById('rosbridge-host-select');
  const portSelect = document.getElementById('rosbridge-port-select');
  const hostCustom = document.getElementById('rosbridge-host-custom');
  const portCustom = document.getElementById('rosbridge-port-custom');

  if (!hostHidden || !portHidden || !hostSelect || !portSelect) {
    return;
  }

  const initialHost =
    (typeof ROSBRIDGE_HOST !== 'undefined' && ROSBRIDGE_HOST !== '')
      ? ROSBRIDGE_HOST
      : window.location.hostname;

  const initialPort =
    (typeof ROSBRIDGE_PORT !== 'undefined' && ROSBRIDGE_PORT !== '')
      ? ROSBRIDGE_PORT
      : '9090';

  hostHidden.value = initialHost;
  portHidden.value = initialPort;

  hostSelect.innerHTML = '';

  const optionCurrent = document.createElement('option');
  optionCurrent.value = initialHost;
  optionCurrent.textContent = initialHost;
  hostSelect.appendChild(optionCurrent);

  if (initialHost !== '127.0.0.1') {
    const optionLocalhost = document.createElement('option');
    optionLocalhost.value = '127.0.0.1';
    optionLocalhost.textContent = '127.0.0.1';
    hostSelect.appendChild(optionLocalhost);
  }

  const storedHostsRaw = localStorage.getItem('rosbridge-hosts');
  let storedHosts = [];
  try {
    storedHosts = storedHostsRaw ? JSON.parse(storedHostsRaw) : [];
  } catch (e) {
    storedHosts = [];
  }
  storedHosts
    .filter(h => h && h !== initialHost && h !== '127.0.0.1')
    .forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      hostSelect.appendChild(opt);
    });

  const optionCustomHost = document.createElement('option');
  optionCustomHost.value = 'custom';
  optionCustomHost.textContent = 'свой хост';
  hostSelect.appendChild(optionCustomHost);

  hostSelect.value = initialHost;

  if (hostCustom) {
    hostCustom.classList.remove('active');
    hostCustom.value = '';
  }

  const normalizePort = (p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n > 0 && n <= 65535 ? String(n) : '9090';
  };

  const normalizedInitialPort = normalizePort(initialPort);
  portSelect.value = normalizedInitialPort;
  if (portSelect.value === '') {
    portSelect.value = '9090';
  }

  hostSelect.addEventListener('change', () => {
    if (hostSelect.value === 'custom') {
      if (hostCustom) {
        hostCustom.classList.add('active');
        hostCustom.focus();
      }
      hostHidden.value = hostCustom && hostCustom.value ? hostCustom.value : '';
    } else {
      if (hostCustom) {
        hostCustom.classList.remove('active');
      }
      hostHidden.value = hostSelect.value;
    }
  });

  if (hostCustom) {
    hostCustom.addEventListener('input', () => {
      if (hostSelect.value === 'custom') {
        hostHidden.value = hostCustom.value.trim();
      }
    });
  }

  portSelect.addEventListener('change', () => {
    if (portSelect.value === 'custom') {
      if (portCustom) {
        portCustom.classList.add('active');
        portCustom.focus();
      }
      portHidden.value = portCustom && portCustom.value ? normalizePort(portCustom.value) : '';
    } else {
      if (portCustom) {
        portCustom.classList.remove('active');
      }
      portHidden.value = normalizePort(portSelect.value);
    }
  });

  if (portCustom) {
    portCustom.addEventListener('input', () => {
      if (portSelect.value === 'custom') {
        portHidden.value = normalizePort(portCustom.value);
      }
    });
  }
}

/* ======== Инициализация сетки ======== */
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('grid');
  
  updateGridLayout();
  initButtons();
  setupRosbridgeInputsMobile();
  setupRosbridgeSelectors();
  
  // Первая проверка ориентации после загрузки
  checkOrientation();
});


/* ======== Fullscreen функции ======== */
function requestFull(){
  const el = document.documentElement;
  const req = el.requestFullscreen      ||
              el.webkitRequestFullscreen||
              el.mozRequestFullScreen   ||
              el.msRequestFullscreen;
  if (!req) return Promise.reject();
  return req.call(el);
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function enterFullscreen(){
  if (isIOS()) {
    return;
  }

  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  requestFull().catch(()=>promptOverlay());
}

function promptOverlay(){
  document.getElementById('fs-prompt').classList.add('show');
}

document.getElementById('fs-prompt').querySelector('button')
  .addEventListener('click', ()=>requestFull().then(()=>{
    document.getElementById('fs-prompt').classList.remove('show');
  }));

['fullscreenchange','webkitfullscreenchange'].forEach(ev=>{
  document.addEventListener(ev, ()=>{
    if (document.fullscreenElement || document.webkitFullscreenElement)
      document.getElementById('fs-prompt').classList.remove('show');
  });
});

window.addEventListener('keydown', e=>{
  if (e.key === 'Tab') e.preventDefault();
});

window.addEventListener('wheel', e=>{
  if (e.ctrlKey) e.preventDefault();
}, {passive:false});

window.addEventListener('gesturestart', e=>{
  if (e.scale > 1) e.preventDefault();
}, {passive:false});

window.addEventListener('touchstart', e=>{
  if (e.touches.length >= 2) enterFullscreen();
}, {passive:true});

let lastTap = 0;
window.addEventListener('pointerdown', e=>{
  const now = Date.now();
  if (now - lastTap < 300) enterFullscreen();
  lastTap = now;
});

/* ======== Проверка ориентации и блокировка страницы в портретном режиме ======== */
function checkOrientation() {
  const overlay = document.getElementById('orientation-overlay');
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  if (isPortrait) {
    overlay.classList.add('show');
    document.body.style.pointerEvents = 'none'; // блокируем взаимодействие
    overlay.style.pointerEvents = 'all';       // но разрешаем клики по сообщению
  } else {
    overlay.classList.remove('show');
    document.body.style.pointerEvents = '';
  }
}

// Слушатель переключения ориентации
window.addEventListener('orientationchange', checkOrientation);

const movementManager = {
  "linX": {
    get: () => linearX,
    set: (value) => {
      const sign = (window.axisInversion && window.axisInversion.linX) ? -1 : 1;
      linearX = (value * getAxisLimitValue('linX') * sign).toFixed(2);
    }
  },
  "linY": {
    get: () => linearY,
    set: (value) => {
      const sign = (window.axisInversion && window.axisInversion.linY) ? -1 : 1;
      linearY = (value * getAxisLimitValue('linY') * sign).toFixed(2);
    }
  },
  "linZ": {
    get: () => linearZ,
    set: (value) => {
      const sign = (window.axisInversion && window.axisInversion.linZ) ? -1 : 1;
      linearZ = (value * getAxisLimitValue('linZ') * sign).toFixed(2);
    }
  },

  "angX": {
    get: () => angularX,
    set: (value) => {
      const sign = (window.axisInversion && window.axisInversion.angX) ? -1 : 1;
      angularX = (value * getAxisLimitValue('angX') * sign).toFixed(2);
    }
  },
  "angY": {
    get: () => angularY,
    set: (value) => {
      const sign = (window.axisInversion && window.axisInversion.angY) ? -1 : 1;
      angularY = (value * getAxisLimitValue('angY') * sign).toFixed(2);
    }
  },
  "angZ": {
    get: () => angularZ,
    set: (value) => {
      const sign = (window.axisInversion && window.axisInversion.angZ) ? -1 : 1;
      angularZ = (value * getAxisLimitValue('angZ') * sign).toFixed(2);
    }
  },
};
