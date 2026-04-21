// Конфигурация управления движением робота (клавиатура + привязка кнопок джойстика)
const defaultMovementBindings = {
  move_forward:  { key: 'w',          code: 'KeyW',        joyButton: null }, // линейное движение вперёд (X+)
  move_backward: { key: 's',          code: 'KeyS',        joyButton: null }, // линейное движение назад (X-)
  yaw_left:      { key: 'a',          code: 'KeyA',        joyButton: null }, // поворот влево (рыскание Z+)
  yaw_right:     { key: 'd',          code: 'KeyD',        joyButton: null }, // поворот вправо (рыскание Z-)
  up:            { key: 'ArrowUp',    code: 'ArrowUp',     joyButton: 6 },   // всплытие (Z+)
  down:          { key: 'ArrowDown',  code: 'ArrowDown',   joyButton: 7 },   // погружение (Z-)
  pitch_up:      { key: 'PageUp',     code: 'PageUp',      joyButton: null }, // нос вверх (Y+)
  pitch_down:    { key: 'PageDown',   code: 'PageDown',    joyButton: null }, // нос вниз (Y-)
};

window.defaultMovementBindings = defaultMovementBindings;

try {
  const savedMovement = JSON.parse(localStorage.getItem('movement-bindings') || 'null');
  window.movementBindings = savedMovement
    ? { ...defaultMovementBindings, ...savedMovement }
    : { ...defaultMovementBindings };
} catch (e) {
  window.movementBindings = { ...defaultMovementBindings };
}

function buildKeyboardProfileFromBindings(bindings) {
  const keyboardKeysSet = new Set();
  const movementKeysSet = new Set();
  const buttonActionsConfig = {};

  const addMovementKey = (rawKey, pressCb, releaseCb) => {
    if (!rawKey) return;
    const key = rawKey.length > 1 ? rawKey : rawKey.toLowerCase();
    keyboardKeysSet.add(key);
    movementKeysSet.add(key);
    buttonActionsConfig[key] = {
      press: pressCb,
      release: releaseCb,
    };
  };

  const b = bindings || defaultMovementBindings;

  addMovementKey(b.move_forward?.key, () => { movementManager['linX'].set(1.0); },
    () => { movementManager['linX'].set(0.0); updateTwistCommand(); });

  addMovementKey(b.move_backward?.key, () => { movementManager['linX'].set(-1.0); },
    () => { movementManager['linX'].set(0.0); updateTwistCommand(); });

  addMovementKey(b.yaw_left?.key, () => { movementManager['angZ'].set(1.0); },
    () => { movementManager['angZ'].set(0.0); updateTwistCommand(); });

  addMovementKey(b.yaw_right?.key, () => { movementManager['angZ'].set(-1.0); },
    () => { movementManager['angZ'].set(0.0); updateTwistCommand(); });

  addMovementKey(b.up?.key, () => { movementManager['linZ'].set(1.0); },
    () => { movementManager['linZ'].set(0.0); updateTwistCommand(); });

  addMovementKey(b.down?.key, () => { movementManager['linZ'].set(-1.0); },
    () => { movementManager['linZ'].set(0.0); updateTwistCommand(); });

  addMovementKey(b.pitch_up?.key, () => { movementManager['angY'].set(1.0); },
    () => { movementManager['angY'].set(0.0); updateTwistCommand(); });

  addMovementKey(b.pitch_down?.key, () => { movementManager['angY'].set(-1.0); },
    () => { movementManager['angY'].set(0.0); updateTwistCommand(); });

  // Камера остаётся на фиксированных клавишах i/k, но тоже проходит через контроллер
  const addCameraKey = (rawKey, pressCb) => {
    if (!rawKey) return;
    const key = rawKey.length > 1 ? rawKey : rawKey.toLowerCase();
    keyboardKeysSet.add(key);
    if (!buttonActionsConfig[key]) {
      buttonActionsConfig[key] = {};
    }
    buttonActionsConfig[key].press = pressCb;
  };

  addCameraKey('i', () => updateCamera(45));
  addCameraKey('k', () => updateCamera(-45));

  return {
    keyboardKeys: Array.from(keyboardKeysSet),
    movementKeys: Array.from(movementKeysSet),
    buttonActionsConfig,
  };
}

// Профили раскладки клавиатуры на основе биндингов движения
window.keyboardProfiles = window.keyboardProfiles || {
  default: buildKeyboardProfileFromBindings(window.movementBindings),
};

class KeyboardController {
  constructor() {
    this.keyboardKeys = [];
    this.keys = {};
    this.movementKeys = [];
    this.buttonsState = {};
    this.buttonActions = {};
    this.setupListeners();

  }
  normalizeKey(key) {
    if (key.length > 1) {
      return key;
    }
    return key.toLowerCase();
  }

  getKeyIdentifier(e) {
    const physicalToLogical = {
      KeyW: 'w',
      KeyA: 'a',
      KeyS: 's',
      KeyD: 'd',
      KeyI: 'i',
      KeyK: 'k',
    };

    if (physicalToLogical[e.code]) {
      return physicalToLogical[e.code];
    }

    return this.normalizeKey(e.key);
  }

  isAnyMovementKeyPressed() {
    return this.movementKeys.some(key => this.isPressed(key));
  }

  isPressed(key) {
    const normalizedKey = this.normalizeKey(key);
    return !!this.keys[normalizedKey];
  }

  _isInputFocused(e) {
    const tag = e.target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  setupListeners() {
    document.addEventListener('keydown', (e) => {
      if (this._isInputFocused(e)) return;
      const normalizedKey = this.getKeyIdentifier(e);
      if (this.keyboardKeys.includes(normalizedKey)) {
        this.keys[normalizedKey] = true;
      }
    });

    document.addEventListener('keyup', (e) => {
      if (this._isInputFocused(e)) return;
      const normalizedKey = this.getKeyIdentifier(e);
      if (this.keyboardKeys.includes(normalizedKey)) {
        this.keys[normalizedKey] = false;
      }
    });
  }

  registerButtonAction(buttonId, actionType, callback) {
    buttonId = this.normalizeKey(buttonId);
    if (!this.buttonActions[buttonId]) {
      this.buttonActions[buttonId] = {};
    }
    this.buttonActions[buttonId][actionType] = callback;
  }

  configureButtonActions(config) {
    Object.entries(config).forEach(([buttonId, actions]) => {
      Object.entries(actions).forEach(([actionType, callback]) => {
        this.registerButtonAction(buttonId, actionType, callback);
      });
    });
  }

  executeButtonAction(buttonId, actionType, holdTime = 0) {
    buttonId = this.normalizeKey(buttonId);
    if (this.buttonActions[buttonId] && this.buttonActions[buttonId][actionType]) {
      this.buttonActions[buttonId][actionType]({
        buttonId: buttonId,
        actionType: actionType,
        holdTime: holdTime,
        timestamp: Date.now()
      });
    }
  }

  update() {
    this.keyboardKeys.forEach((btn, i) => {
      const isPressed = this.isPressed(btn);
      const wasPressed = this.buttonsState[i] || false;

      if (isPressed !== wasPressed) {
        this.buttonsState[i] = isPressed;
        if (isPressed) {
          this.executeButtonAction(btn, 'press');
        } else{
          this.executeButtonAction(btn, 'release');
        }
      }
      this.keys[btn] = isPressed;
    });
    if (this.isAnyMovementKeyPressed()) {
      updateTwistCommand();
    }
    return true;
  }

  reapplyMovementFromKeys() {
    // Переустанавливаем значения осей для всех сейчас нажатых клавиш движения,
    // чтобы они пересчитались с новыми лимитами профиля, не меняя направление.
    const bindings = window.movementBindings || defaultMovementBindings;

    const applyIfPressed = (binding, axisId, sign) => {
      const key = binding && binding.key;
      if (!key) return;
      const normalized = this.normalizeKey(key);
      if (this.isPressed(normalized) && movementManager[axisId]) {
        movementManager[axisId].set(1.0 * sign);
      }
    };

    applyIfPressed(bindings.move_forward, 'linX', 1);
    applyIfPressed(bindings.move_backward, 'linX', -1);
    applyIfPressed(bindings.yaw_left, 'angZ', 1);
    applyIfPressed(bindings.yaw_right, 'angZ', -1);
    applyIfPressed(bindings.up, 'linZ', 1);
    applyIfPressed(bindings.down, 'linZ', -1);
    applyIfPressed(bindings.pitch_up, 'angY', 1);
    applyIfPressed(bindings.pitch_down, 'angY', -1);

    updateTwistCommand();
  }

}

// Глобальный контроллер клавиатуры
window.kbController = new KeyboardController();

// Применение профиля клавиатуры
window.applyKeyboardProfile = function(profileKey) {
  const profiles = window.keyboardProfiles || {};
  const profile = profiles[profileKey] || profiles.default;
  if (!profile) return;

  kbController.keyboardKeys = profile.keyboardKeys.slice();
  kbController.movementKeys = profile.movementKeys.slice();
  kbController.buttonActions = {};
  kbController.configureButtonActions(profile.buttonActionsConfig || {});
};

// Обновление профиля клавиатуры при изменении биндов управления движением
window.applyMovementBindings = function () {
  try {
    const profile = buildKeyboardProfileFromBindings(window.movementBindings);
    window.keyboardProfiles.default = profile;
    const storedKeyboardProfile = localStorage.getItem('keyboard-profile') || 'default';
    window.applyKeyboardProfile(storedKeyboardProfile);
  } catch (e) {
    console.warn('Не удалось применить бинды управления движением', e);
  }
};

// Инициализация профиля по умолчанию
window.applyMovementBindings();
function reg(){
  console.log(4335)
}

function keyboardLoop() {
  kbController.update();
  requestAnimationFrame(keyboardLoop);
}

keyboardLoop();
