// Глобальные переменные для хранения состояния
let s = null
let keyboardHandlers = {
    keydown: null,
    keyup: null
};
let buttons = null;
// const buttons = getButtonsData();
function initButtons() {
      buttons = getButtonsData();
      window.buttonsData = buttons;
      window.extraKeysConfig = extraKeys;
      createButtons(buttons)

      if (typeof window.updateButtonLabelsFromBindings === 'function') {
          window.updateButtonLabelsFromBindings();
      }

    if (platform==="mobile")
      {createJoysticks()}
}

/**
 * Вычисляет колонку для кнопки с индексом index,
 * чтобы группа из count кнопок шириной sizeX была отцентрирована.
 */
function centeredCol(index, sizeX, count) {
    const totalWidth = count * sizeX;
    const startCol = Math.floor(totalColumns / 2 + 1) - Math.floor(totalWidth / 2);
    return startCol + index * sizeX;
}

// Привязки клавиш и действий интерфейса (по умолчанию и из localStorage).
// key — отображаемый символ/подпись, code — физическая клавиша (KeyboardEvent.code).
const defaultInterfaceBindings = {
    manipulator_open:  { key: '1', code: 'Digit1',  joyButton: 4 },
    manipulator_close: { key: '2', code: 'Digit2',  joyButton: 5 },
    flashlight:        { key: '3', code: 'Digit3',  joyButton: 3 },
    photo:             { key: '4', code: 'Digit4',  joyButton: null },
    video:             { key: '5', code: 'Digit5',  joyButton: null },
    settings:          { key: '6', code: 'Digit6',  joyButton: 9 },
    depth_hold:        { key: '7', code: 'Digit7',  joyButton: null },
    arm:               { key: '`', code: 'Backquote', joyButton: null },
    camera_up:         { key: 'i', code: 'KeyI',    joyButton: null },
    camera_down:       { key: 'k', code: 'KeyK',    joyButton: null },
    // Профиль управления: один бинд (переключение 1↔2)
    control_profile_toggle: { key: 'm', code: 'KeyM', joyButton: null },
    // Профили скорости: по умолчанию только инкремент/декремент
    // клавиатурой и горизонтальными стрелками D-Pad
    speed_profile_1:   { key: '',      code: '',       joyButton: null },
    speed_profile_2:   { key: '',      code: '',       joyButton: null },
    speed_profile_3:   { key: '',      code: '',       joyButton: null },
    speed_profile_4:   { key: '',      code: '',       joyButton: null },
    speed_profile_5:   { key: '',      code: '',       joyButton: null },
    // End — повысить, Home — понизить
    speed_profile_next:{ key: 'End',   code: 'End',    joyButton: 15 }, // D-Pad →
    speed_profile_prev:{ key: 'Home',  code: 'Home',   joyButton: 14 }, // D-Pad ←
};

window.defaultInterfaceBindings = defaultInterfaceBindings;

try {
    const savedBindings = JSON.parse(localStorage.getItem('interface-bindings') || 'null');
    window.interfaceBindings = savedBindings
        ? { ...defaultInterfaceBindings, ...savedBindings }
        : { ...defaultInterfaceBindings };
} catch (e) {
    window.interfaceBindings = { ...defaultInterfaceBindings };
}

// Синхронизация биндов джойстика с текущими interfaceBindings
window.applyJoystickBindingsFromInterface = function () {
    if (!window.joystick || typeof window.joystick.setupKeyboard !== 'function') return;

    const bindings = window.interfaceBindings || defaultInterfaceBindings;
    const mapping = {};

    Object.keys(bindings).forEach(actionId => {
        const bind = bindings[actionId];
        if (bind && typeof bind.joyButton === 'number' && bind.key) {
            mapping[bind.joyButton] = {
                key: bind.key,
                code: bind.code || null,
            };
        }
    });

    // Добавляем бинды кнопок джойстика для управления движением робота
    const moveBindings = window.movementBindings;
    if (moveBindings) {
        Object.keys(moveBindings).forEach(actionId => {
            const bind = moveBindings[actionId];
            if (bind && typeof bind.joyButton === 'number' && bind.key) {
                mapping[bind.joyButton] = {
                    key: bind.key,
                    code: bind.code || null,
                };
            }
        });
    }

    window.joystick.setupKeyboard(mapping);
};

// Пробуем сразу применить бинды к джойстику, если он уже инициализирован
try {
    window.applyJoystickBindingsFromInterface();

    // Если меню скоростей уже создано, обновляем в нём отображение привязок
    if (typeof speedMenu !== 'undefined' && speedMenu && typeof speedMenu.refreshBindingsFromInterface === 'function') {
        speedMenu.refreshBindingsFromInterface();
    }
} catch (e) {
    console.warn('Не удалось применить бинды джойстика при инициализации', e);
}

function getButtonsData() {
    const b = window.interfaceBindings || defaultInterfaceBindings;

    const common = [
        // управление периферией
        { name: 'manipulator_open',  icon: '/static/img/cl_manipul.svg',   mode: 'click',  key: b.manipulator_open.key,  code: b.manipulator_open.code,  active: false },
        { name: 'manipulator_close', icon: '/static/img/on_manipul.svg',   mode: 'click',  key: b.manipulator_close.key, code: b.manipulator_close.code, active: false },
        { name: 'flashlight',        icon: '/static/img/flashlight.svg',   mode: 'click',  key: b.flashlight.key,        code: b.flashlight.code,        active: false },
        // фото видео
        { name: 'photo',             icon: '/static/img/camera.svg',      mode: 'click',  key: b.photo.key,             code: b.photo.code,             active: false },
        { name: 'video',             icon: '/static/img/video-camera.svg', mode: 'toggle', key: b.video.key,             code: b.video.code,             active: false },
        { name: 'bag_record',        icon: '/static/img/bag-record.svg',    mode: 'toggle', key: '',                      code: '',                       active: false },
        // настройки аппарата
        { name: 'settings',          icon: '/static/img/settings.svg',     mode: 'click',  key: b.settings.key,          code: b.settings.code,          active: false },
    ];
    const count = common.length;

    switch (platform) {
        case 'mobile':
            return [
                { ...common[0], label: "", row: -8, col: -5, sizeX: 2, sizeY: 2 },
                { ...common[1], label: "", row: -8, col: -3, sizeX: 2, sizeY: 2 },
                { ...common[2], label: "", row: -10, col: -4, sizeX: 2, sizeY: 2 },
                { ...common[3], label: "", row: 1, col: -3, sizeX: 2, sizeY: 2 },
                { ...common[4], label: "", row: 1, col: -5, sizeX: 2, sizeY: 2 },
                { ...common[5], label: "", row: -3, col: 5, sizeX: 2, sizeY: 2 },
                // управление всплытием
                { name: 'vechicle_up',   icon: '/static/img/arrow-up.svg',   mode: 'click', key: '↑',        code: 'ArrowUp',   label: "", active: false, row: -11, col: 1, sizeX: 2, sizeY: 2 },
                { name: 'vechicle_down', icon: '/static/img/arrow-down.svg', mode: 'click', key: '↓',        code: 'ArrowDown', label: "", active: false, row: -9,  col: 1, sizeX: 2, sizeY: 2 },
            ];
        case "desktop":
            return common.map((btn, i) => ({
                ...btn,
                // Метка по фактическому бинду клавиши (если есть)
                label: btn.key ? String(btn.key).toLowerCase() : "",
                row: -2, sizeX: 1, sizeY: 1,
                col: centeredCol(i, 1, count),
            }));
        case "steamdeck":
            return common.map((btn, i) => ({
                ...btn, label: "",
                row: -3, sizeX: 2, sizeY: 2,
                col: centeredCol(i, 2, count),
            }));
        default:
            return [];
    }
}

function createButtons(buttons) {
    // Создаем кнопки
    buttons.forEach((config, index) => {

        const buttonElement = document.createElement('div');
        buttonElement.className = 'grid-button';

        // Создаем элементы кнопок только если есть соответствующая кнопка в массиве buttons
        const btn = document.createElement('button');
        btn.className = platform === 'mobile' ? 'grid-button mobile' : 'grid-button pc';
        btn.dataset.name = config.name;
        btn.dataset.mode = config.mode;
        btn.dataset.active = config.active;

        const img = document.createElement('img');
        img.src = config.icon;
        img.alt = config.name;
        btn.appendChild(img);

        if (platform !== 'mobile' && config.label) {
            const labelElement = document.createElement('div');
            labelElement.className = 'button-label';
            labelElement.textContent = config.label;
            btn.appendChild(labelElement);
        }

        function handlePointerDown(e) {
            const btn = e.currentTarget;
            const mode = btn.dataset.mode;
            const name = btn.dataset.name;
            
            btn.setPointerCapture(e.pointerId);
            if (mode === 'click') btn.classList.add('active');
            
            window.dispatchEvent(new CustomEvent('buttonpress', { detail: { name } }));
        }

        function handlePointerEnd(e) {
            const btn = e.currentTarget;
            const name = btn.dataset.name;
            const mode = btn.dataset.mode;

            btn.releasePointerCapture?.(e.pointerId);

            if (mode === 'click') {
                btn.classList.remove('active');
                window.dispatchEvent(new CustomEvent('buttonrelease', { detail: { name } }));
                window.dispatchEvent(new CustomEvent('buttonclick', { detail: { name } }));
            } else if (mode === 'toggle') {
                config.active = !config.active;
                active = config.active;
                window.dispatchEvent(new CustomEvent('buttontoggle', {
                    detail: { name, active }
                }));
            }
        }

        btn.addEventListener('pointerdown', handlePointerDown);
        btn.addEventListener('pointerup', handlePointerEnd);
        btn.addEventListener('pointercancel', handlePointerEnd);

        buttonElement.style.position = 'relative';
        buttonElement.appendChild(btn);

        s = new GridItem(grid, config.row, config.col, config.sizeX, config.sizeY, buttonElement, true, config.name)

        gridItems.push(s)
       
    });
}

function updateButtonLabelsFromBindings() {
    if (platform === 'mobile') return;
    if (!window.buttonsData || !Array.isArray(window.buttonsData)) return;

    const bindings = window.interfaceBindings || defaultInterfaceBindings;

    // Синхронизируем key/code в buttonsData с актуальным профилем
    window.buttonsData.forEach(cfg => {
        const bind = bindings[cfg.name];
        if (bind) {
            cfg.key = bind.key;
            cfg.code = bind.code;
        }
    });

    window.buttonsData.forEach(cfg => {
        const btnEl = document.querySelector(`button.grid-button.pc[data-name="${cfg.name}"]`);
        if (!btnEl) return;

        const labelText = cfg.key ? String(cfg.key).toLowerCase() : "";
        let labelEl = btnEl.querySelector('.button-label');

        if (!labelText) {
            if (labelEl) {
                labelEl.textContent = '';
            }
            return;
        }

        if (!labelEl) {
            labelEl = document.createElement('div');
            labelEl.className = 'button-label';
            btnEl.appendChild(labelEl);
        }

        labelEl.textContent = labelText;
    });
}

window.updateButtonLabelsFromBindings = updateButtonLabelsFromBindings;

keyboardHandlers.keydown = (e) => {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (!buttons) return;
        // Игнорируем авто-повтор нажатий клавиши, чтобы команды (в т.ч. манипулятора)
        // отправлялись только один раз за фактическое нажатие
        if (e.repeat) return;
        const button =
            buttons.find(b =>
                (b.code && b.code === e.code) ||
                (!b.code && b.key === e.key)
            ) ||
            extraKeys.find(b =>
                (b.code && b.code === e.code) ||
                (!b.code && b.key === e.key)
            );
        if (button) {
            e.preventDefault();

            const eventType = button.mode === 'toggle' ? 'buttontoggle' : 'buttonpress';
            button.active = !button.active;
            const active = button.active

            window.dispatchEvent(new CustomEvent(eventType, { 
                detail: { 
                    name: button.name,
                    active 
                } 
            }));
        }
    };

keyboardHandlers.keyup = (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!buttons) return;
    const button =
        buttons.find(b =>
            (b.code && b.code === e.code) ||
            (!b.code && b.key === e.key)
        ) ||
        extraKeys.find(b =>
            (b.code && b.code === e.code) ||
            (!b.code && b.key === e.key)
        );
    if (button && button.mode !== 'toggle') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('buttonrelease', { 
            detail: { 
                name: button.name 
            } 
        }));
        if (button.mode === 'click') {
            window.dispatchEvent(new CustomEvent('buttonclick', {
                detail: { name: button.name }
            }));
        }
    }
};

document.addEventListener('keydown', keyboardHandlers.keydown);
document.addEventListener('keyup', keyboardHandlers.keyup);

function createJoysticks() {
    // Левый джойстик
    const joyLeft = document.createElement('div');
    joyLeft.className = 'joystick-wrapper';
    const headJoyLeft = document.createElement('div');
    headJoyLeft.className = 'joystick-left';
    headJoyLeft.id = 'left-joystick';
    joyLeft.appendChild(headJoyLeft);
    const leftJoystickItem = new GridItem(grid, -6, 1, 4, 4, joyLeft, true);
    gridItems.push(leftJoystickItem);

    // Правый джойстик
    const joyRight = document.createElement('div');
    joyRight.className = 'joystick-wrapper';
    const headJoyRight = document.createElement('div');
    headJoyRight.className = 'joystick-right';
    headJoyRight.id = 'right-joystick';
    joyRight.appendChild(headJoyRight);
    const rightJoystickItem = new GridItem(grid, -6, -5, 4, 4, joyRight, true);
    gridItems.push(rightJoystickItem);
}

function resizeButtons(){
  if (platform !== "mobile"){
    const count = buttons.length;
    gridItems.forEach((gridcfg) => {
      if (gridcfg === null) return;
      buttons.forEach((bthcfg, index) => {
        if (gridcfg.name === bthcfg.name) {
          const col = centeredCol(index, bthcfg.sizeX, count);
          gridcfg.moveGridItems(bthcfg.row, col, bthcfg.sizeX, bthcfg.sizeY);
        }
      });
    });
  }
}
let light_status = false;
let recording_status = false;
let depth_hold_active = false;
window.isArmed = false;
let flashlightLevel = 0;

// Глобальные настраиваемые параметры управления (фонарь, манипулятор, камера)
const CONTROL_PARAMS_STORAGE_KEY = 'control-params';

function loadControlParams() {
    let stored = null;
    try {
        stored = JSON.parse(localStorage.getItem(CONTROL_PARAMS_STORAGE_KEY) || 'null');
    } catch (e) {
        stored = null;
    }

    const defaults = {
        flashlight_on: 2000,
        flashlight_off: 1000,
        flashlight_steps: 1,
        manipulator_open: 2000,
        manipulator_close: 1000,
        manipulator_neutral: 1500,
        camera_step_deg: 45,
        camera_min_deg: 0,
        camera_max_deg: 180,
    };

    const cfg = stored && typeof stored === 'object' ? stored : {};

    const normalizeNumber = (value, fallback) => {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        return Number.isFinite(num) ? num : fallback;
    };

    const result = {
        flashlight_on: Math.round(normalizeNumber(cfg.flashlight_on, defaults.flashlight_on)),
        flashlight_off: Math.round(normalizeNumber(cfg.flashlight_off, defaults.flashlight_off)),
        flashlight_steps: Math.round(normalizeNumber(cfg.flashlight_steps, defaults.flashlight_steps)),
        manipulator_open: normalizeNumber(cfg.manipulator_open, defaults.manipulator_open),
        manipulator_close: normalizeNumber(cfg.manipulator_close, defaults.manipulator_close),
        manipulator_neutral: normalizeNumber(cfg.manipulator_neutral, defaults.manipulator_neutral),
        camera_step_deg: normalizeNumber(cfg.camera_step_deg, defaults.camera_step_deg),
        camera_min_deg: normalizeNumber(cfg.camera_min_deg, defaults.camera_min_deg),
        camera_max_deg: normalizeNumber(cfg.camera_max_deg, defaults.camera_max_deg),
    };

    try {
        localStorage.setItem(CONTROL_PARAMS_STORAGE_KEY, JSON.stringify(result));
    } catch (e) {
        // ignore
    }

    return result;
}

// Инициализируем глобальный объект один раз
window.controlParams = window.controlParams || loadControlParams();

const extraKeys = [
    { name: 'depth_hold', mode: 'toggle',
      key: (window.interfaceBindings || defaultInterfaceBindings).depth_hold.key,
      code: (window.interfaceBindings || defaultInterfaceBindings).depth_hold.code,
      active: false },
    { name: 'arm', mode: 'toggle',
      key: (window.interfaceBindings || defaultInterfaceBindings).arm.key,
      code: (window.interfaceBindings || defaultInterfaceBindings).arm.code,
      active: false },
];

function showGreenNotification(message) {
    const containerId = 'app-toast-container';
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'speed-menu-toast photo-success-toast';
    toast.textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
            if (container.childElementCount === 0 && container.parentNode) {
                container.parentNode.removeChild(container);
            }
        }, 250);
    }, 2000);
}

function updateRecordingIndicator(isRecording) {
    if (isRecording) {
        recordingIndicator.style.display = 'flex';
    } else {
        recordingIndicator.style.display = 'none';
    }
}

const recordingIndicator = document.createElement('div');
recordingIndicator.className = 'recording-indicator';
recordingIndicator.innerHTML = 'REC';
recordingIndicator.style.display = 'none';
document.body.appendChild(recordingIndicator);

const armVignette = document.createElement('div');
armVignette.className = 'arm-vignette';
document.body.appendChild(armVignette);

const armIndicator = document.createElement('div');
armIndicator.className = 'arm-indicator disarmed';
armIndicator.textContent = 'DISARMED';
document.body.appendChild(armIndicator);

if (platform === 'mobile' || platform === 'steamdeck') {
    armIndicator.addEventListener('pointerup', () => {
        window.isArmed = !window.isArmed;
        updateArmIndicator(window.isArmed);
        if (!window.isArmed) {
            updateTwistCommand();
        }
    });
}

function updateArmIndicator(isArmed) {
    if (isArmed) {
        armIndicator.textContent = 'ARMED';
        armIndicator.classList.remove('disarmed');
        armIndicator.classList.add('armed');
    } else {
        armIndicator.textContent = 'DISARMED';
        armIndicator.classList.remove('armed');
        armIndicator.classList.add('disarmed');
    }
    updateArmVignette();
}

function updateArmVignette() {
    armVignette.style.opacity = (isConnect && !window.isArmed) ? '1' : '0';
}

const pingVignette = document.createElement('div');
pingVignette.className = 'ping-vignette';
document.body.appendChild(pingVignette);

window.pingVignetteEnabled = localStorage.getItem('ping-vignette-enabled') !== 'false';

function updatePingVignette() {
    pingVignette.style.opacity = (window.pingVignetteEnabled && isConnect && window.pingOffline) ? '1' : '0';
}

const clickActions = new Map([
  ['settings', () => speedMenu.toggle()],
  ['photo', () => {
    if (typeof window.onPhotoClick === 'function') {
      window.onPhotoClick();
      showGreenNotification('Фотография сделана');
    }
  }],
  ['flashlight', () => {
    const cfg = window.controlParams || loadControlParams();
    const steps = Math.max(1, Math.floor(cfg.flashlight_steps || 1));
    // цикл по уровням 0..steps
    flashlightLevel = (flashlightLevel + 1) % (steps + 1);
    light_status = flashlightLevel > 0;

    if (typeof window.updateLightLevel === 'function') {
      window.updateLightLevel(flashlightLevel);
    } else {
      updateLight(light_status ? cfg.flashlight_on : cfg.flashlight_off);
    }
  }],
]);

const toggleActions = new Map([
  ['video', (e) => {         
    recording_status = e.detail.active;      
    updateRecording(recording_status);
    updateRecordingIndicator(recording_status);   
  }],
  ['depth_hold', (e) => {
    depth_hold_active = e.detail.active;
    updateIsDepthSetpoint(depth_hold_active);
    if (depth_hold_active) {
      updateDepthSetpoint(depthValue ?? 0);
    }
  }],
  ['arm', (e) => {
    window.isArmed = e.detail.active;
    updateArmIndicator(window.isArmed);
    if (!window.isArmed) {
      updateTwistCommand();
    }
  }],
  ['bag_record', async (e) => {
    if (!window.bagManager || typeof window.bagManager.toggleRecording !== 'function') return;
    try {
      await window.bagManager.toggleRecording(Boolean(e.detail.active));
      if (window.bagManager.isRecording !== Boolean(e.detail.active)) {
        updateButtonState('bag_record', window.bagManager.isRecording);
      }
    } catch (err) {
      console.error('Bag record toggle failed', err);
      updateButtonState('bag_record', false);
    }
  }],
]);

const pressActions = new Map([
  ['manipulator_open', () => {
    const cfg = window.controlParams || loadControlParams();
    updateManipulator(cfg.manipulator_open);
  }],
  ['manipulator_close', () => {
    const cfg = window.controlParams || loadControlParams();
    updateManipulator(cfg.manipulator_close);
  }],

  ['camera_up', (e) => {
    const cfg = window.controlParams || loadControlParams();
    updateCamera(cfg.camera_step_deg);
  }],
  ['camera_down', (e) => {
    const cfg = window.controlParams || loadControlParams();
    updateCamera(-cfg.camera_step_deg);
  }],

  ['vechicle_up', (e) => {
    linearZ = (clamp(1.0, -1.0, 1.0) * linZLimit).toFixed(2);
    updateTwistCommand();
  }],
  ['vechicle_down', (e) => {
    linearZ = (clamp(-1.0, -1.0, 1.0) * linZLimit).toFixed(2);
    updateTwistCommand();
  }],
]);

const releaseActions = new Map([
  ['manipulator_open', () => {
    const cfg = window.controlParams || loadControlParams();
    updateManipulator(cfg.manipulator_neutral);
  }],
  ['manipulator_close', () => {
    const cfg = window.controlParams || loadControlParams();
    updateManipulator(cfg.manipulator_neutral);
  }],

  ['vechicle_up', (e) => {
    linearZ = 0;                
    updateTwistCommand();
  }],
  ['vechicle_down', (e) => {
    linearZ = 0;                
    updateTwistCommand();
  }],
]);

const createHandler = (actionsMap) => (e) => {
  const action = actionsMap.get(e.detail.name);
  if (typeof action === 'function') action(e);     
};

const updateButtonState = (name, isActive) => {
  let btn = document.querySelector(`button[data-name="${name}"]`);
  if (!btn) {
    // console.warn(`Кнопка "${name}" не найдена`);
    return;
  }

  if (isActive) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
  btn.dataset.active = String(isActive);
};

window.updateButtonState = updateButtonState;

window.addEventListener('buttonclick', createHandler(clickActions));
window.addEventListener('buttontoggle', createHandler(toggleActions));
window.addEventListener('buttonpress', createHandler(pressActions));
window.addEventListener('buttonrelease', createHandler(releaseActions));

window.addEventListener('buttonpress', (e) => {
  updateButtonState(e.detail.name, true);
});
window.addEventListener('buttonrelease', (e) => {
  updateButtonState(e.detail.name, false);
});
window.addEventListener('buttontoggle', (e) => {
  updateButtonState(e.detail.name, e.detail.active);
});

function initSpeedMenu() {
  const menu = document.getElementById("speed-menu");

  const axisIds = ['linX', 'linY', 'linZ', 'angX', 'angY', 'angZ'];

  const updateAll = () => {
    for (const axis of axisIds) {
      const range = document.getElementById(`${axis}-limit`);
      const valEl = document.getElementById(`${axis}-limit-value`);
      axisLimitVars[axis](parseFloat(range.value));
      valEl.textContent = `${range.value} ${axisLimitUnits[axis]}`;
    }
  };

  for (const axis of axisIds) {
    document.getElementById(`${axis}-limit`).addEventListener("input", () => {
      updateAll();
      updateTwistCommand();
    });
  }
  updateAll();

  document.addEventListener("pointerdown", (e) => {
    if (speedMenu.isVisible && !menu.contains(e.target) && !e.target.closest(".grid-button")) {
      speedMenu.hide();
    }
  });
}

function toggleSpeedMenu(show) {
  show ? speedMenu.show() : speedMenu.hide();
}
