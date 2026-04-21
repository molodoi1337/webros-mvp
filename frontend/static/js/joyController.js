// Настройки привязки осей джойстика к осям движения робота
// По умолчанию:
//  0: левый стик, поворот (angZ)
//  1: левый стик, поступательное движение вперёд/назад (linX)
//  2: правый стик, не используется
//  3: правый стик, тангаж (angY)
const defaultJoystickAxesBindings = {
  0: 'angZ',
  1: 'linX',
  2: null,
  3: 'angY',
};

try {
  const savedAxes = JSON.parse(localStorage.getItem('joystick-axes-bindings') || 'null');
  window.joystickAxesBindings = savedAxes
    ? { ...defaultJoystickAxesBindings, ...savedAxes }
    : { ...defaultJoystickAxesBindings };
} catch (e) {
  window.joystickAxesBindings = { ...defaultJoystickAxesBindings };
}

// Применение (и опциональное сохранение) новых биндов осей джойстика
window.applyJoystickAxesBindings = function (newBindings, { persist = false } = {}) {
  const base = window.joystickAxesBindings || defaultJoystickAxesBindings;
  window.joystickAxesBindings = newBindings
    ? { ...base, ...newBindings }
    : { ...base };

  if (persist) {
    try {
      localStorage.setItem('joystick-axes-bindings', JSON.stringify(window.joystickAxesBindings));
    } catch (e) {
      console.warn('Не удалось сохранить привязки осей джойстика', e);
    }
  }
};

class JoystickController {
  constructor() {
    this.gamepad = null;
    this.buttons = {};
    this.buttonsState = {};
    this.buttonsHoldTime = {};
    this.axes = {
      0: 0, // LEFT_LR
      1: 0, // LEFT_UP
      2: 0, // RIGHT_LR
      3: 0 // RIGHT_UP
      };
    this.is_invert_axes = { 0:  true, 1: true, 2: true, 3: true };
    this.deadZone = 0.30;
    this.holdThreshold = 500;
    this.buttonCallbacks = {};
    this.buttonActions = {};
    this.keyboardEmulation = {};
    this.setupListeners();

    // Пробуем подтянуть бинды джойстика, если они уже загружены из buttons.js
    if (typeof window.applyJoystickBindingsFromInterface === 'function') {
      try {
        window.applyJoystickBindingsFromInterface();
        console.log('Joystick bindings applied from interface on controller init');
      } catch (e) {
        console.warn('Failed to apply joystick bindings on init', e);
      }
    }
  }

  setupListeners() {
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepad = navigator.getGamepads()[e.gamepad.index];
      console.log(`Джойстик подключен: ${this.gamepad.id}`);
      this.axes = { 0: 0, 1: 0, 2: 0, 3: 0 };

      // На всякий случай повторно применяем бинды при подключении геймпада
      if (typeof window.applyJoystickBindingsFromInterface === 'function') {
        try {
          window.applyJoystickBindingsFromInterface();
          console.log('Joystick bindings re-applied on gamepadconnected');
        } catch (err) {
          console.warn('Failed to apply joystick bindings on gamepadconnected', err);
        }
      }
    });

    window.addEventListener('gamepaddisconnected', () => {
      console.log('Джойстик отключен');
      this.gamepad = null;
      this.axes = { 0: 0, 1: 0, 2: 0, 3: 0 };
    });
  }

  // Эмуляция нажатия клавиши
  joyKeyPress(binding, isPressed) {
    const isObject = binding && typeof binding === 'object';
    const key = isObject ? binding.key : binding;
    const codeFromBinding = isObject ? binding.code : null;

    if (!key) return;

    const inferCodeFromKey = (k) => {
      if (/^[0-9]$/.test(k)) return `Digit${k}`;
      if (/^[a-zA-Z]$/.test(k)) return `Key${k.toUpperCase()}`;
      if (k.startsWith('Arrow')) return k;
      return null;
    };

    const code = codeFromBinding || inferCodeFromKey(key) || `Key${String(key).toUpperCase()}`;
    const eventType = isPressed ? 'keydown' : 'keyup';

    // Создаем событие клавиатуры
    const event = new KeyboardEvent(eventType, {
      key: key,
      code: code,
      keyCode: typeof key === 'string' ? key.toUpperCase().charCodeAt(0) : 0,
      which: typeof key === 'string' ? key.toUpperCase().charCodeAt(0) : 0,
    });

    document.dispatchEvent(event);

    const activeElement = document.activeElement;
    if (activeElement && activeElement.dispatchEvent) {
      activeElement.dispatchEvent(new KeyboardEvent(eventType, {
        key: key
      }));
    }

    console.log(`Эмуляция: ${eventType} ${key}`);
  }

  // Эмуляция клавиш для кнопки
  emulateButtonAsKeys(buttonId, isPressed) {
    if (!this.keyboardEmulation || !Object.prototype.hasOwnProperty.call(this.keyboardEmulation, buttonId)) {
      return;
    }

    if (this.keyboardEmulation[buttonId]) {
      const keys = Array.isArray(this.keyboardEmulation[buttonId]) 
        ? this.keyboardEmulation[buttonId] 
        : [this.keyboardEmulation[buttonId]];

      keys.forEach(key => {
        this.joyKeyPress(key, isPressed);
      });
    }
  }

  // Регистрация действия для кнопки
  registerButtonAction(buttonId, actionType, callback) {
    if (!this.buttonActions[buttonId]) {
      this.buttonActions[buttonId] = {};
    }
    this.buttonActions[buttonId][actionType] = callback;
  }

  // Удаление действия для кнопки
  unregisterButtonAction(buttonId, actionType) {
    if (this.buttonActions[buttonId]) {
      delete this.buttonActions[buttonId][actionType];
    }
  }

  // Массовая регистрация действий (удобно для настройки)
  configureButtonActions(config) {
    Object.entries(config).forEach(([buttonId, actions]) => {
      Object.entries(actions).forEach(([actionType, callback]) => {
        this.registerButtonAction(parseInt(buttonId), actionType, callback);
      });
    });
  }

  onButton(buttonId, callback) {
    this.buttonCallbacks[buttonId] = callback;
  }

  offButton(buttonId) {
    delete this.buttonCallbacks[buttonId];
  }

  update() {
    if (!this.gamepad) {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      if (pads && pads.length) {
        for (let i = 0; i < pads.length; i++) {
          if (pads[i]) {
            this.gamepad = pads[i];
            console.log(`Джойстик обнаружен без события gamepadconnected: ${this.gamepad.id}`);
            break;
          }
        }
      }
      if (!this.gamepad) return false;
    }

    const gamepad = navigator.getGamepads()[this.gamepad.index];
    if (!gamepad) return false;

    const currentTime = Date.now();

    // Обновляем состояние кнопок
    gamepad.buttons.forEach((btn, i) => {
      const isPressed = btn.pressed;
      const wasPressed = this.buttonsState[i] || false;

      if (isPressed !== wasPressed) {
        this.buttonsState[i] = isPressed;

        this.emulateButtonAsKeys(i, isPressed);

        if (isPressed) {
          this.buttonsHoldTime[i] = currentTime;
          this.executeButtonAction(i, 'press');
        } else{
            this.executeButtonAction(i, 'release');
            delete this.buttonsHoldTime[i];
        }
      }

      if (isPressed && this.buttonsHoldTime[i]) {
        const holdTime = currentTime - this.buttonsHoldTime[i];
        if (holdTime >= this.holdThreshold) {
          this.executeButtonAction(i, 'hold', holdTime);
        }
      }

      this.buttons[i] = isPressed;
    });

    // Безопасное обновление осей
    gamepad.axes.forEach((axis, i) => {
      if (typeof axis === 'number') {
        const invert_axis = this.is_invert_axes[i] ? -1 : 1;
        this.axes[i] = Math.abs(axis) > this.deadZone ? axis * invert_axis : 0;
      } else {
        this.axes[i] = 0;
      }

      const axesBindings = window.joystickAxesBindings || defaultJoystickAxesBindings;
      const axisKey = axesBindings[i];
      if (axisKey && movementManager[axisKey]) {
        movementManager[axisKey].set(this.axes[i]);
      }
    });
    updateTwistCommand();
    return true;
  }

  reapplyMovementFromAxes() {
    // Переустанавливаем значения осей джойстика,
    // чтобы скорости пересчитались с новыми лимитами профиля.
    const axesBindings = window.joystickAxesBindings || defaultJoystickAxesBindings;
    Object.keys(this.axes).forEach((i) => {
      const axisIndex = parseInt(i, 10);
      const axisKey = axesBindings[axisIndex];
      const value = this.axes[axisIndex];
      // Не затираем движение, если джойстик по этой оси сейчас в "нуле"
      if (axisKey && movementManager[axisKey] && Math.abs(value) > 0) {
        movementManager[axisKey].set(value);
      }
    });
    updateTwistCommand();
  }

  // Выполнение зарегистрированных действий для кнопки
  executeButtonAction(buttonId, actionType, holdTime = 0) {
    if (this.buttonActions[buttonId] && this.buttonActions[buttonId][actionType]) {
      this.buttonActions[buttonId][actionType]({
        buttonId: buttonId,
        actionType: actionType,
        holdTime: holdTime,
        timestamp: Date.now()
      });
    }
  }
  
  setupKeyboard(mapping) {
    this.keyboardEmulation = mapping;
  }

  // triggerButtonEvent(buttonId, eventType, holdTime = 0) {
  //   if (this.buttonCallbacks[buttonId]) {
  //     this.buttonCallbacks[buttonId]({
  //       type: eventType,
  //       buttonId: buttonId,
  //       holdTime: holdTime,
  //       timestamp: Date.now()
  //     });
  //   }

  //   if (this.buttonCallbacks['*']) {
  //     this.buttonCallbacks['*']({
  //       type: eventType,
  //       buttonId: buttonId,
  //       holdTime: holdTime,
  //       timestamp: Date.now()
  //     });
  //   }
  // }
}

// Константы для кнопок
const BUTTONS_MAP = {
  CROSS: 0,
  CIRCLE: 1,
  SQUARE: 2,
  TRIANGLE: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SELECT: 8,
  START: 9,
  HOLDLEFTSTICK: 10,
  HOLDRIGHTSTICK: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  PS: 16,
};

// Глобальный контроллер джойстика
window.joystick = new JoystickController();

function joyLoop() {
  joystick.update();
  requestAnimationFrame(joyLoop);
}

joyLoop();
