// speed-menu.js

class SpeedMenu {
    constructor() {
        this.isVisible = false;
        this.activeTab = 'general';
        this.totalProfiles = 5;
        this.totalControlProfiles = 2;
        const storedProfile = parseInt(localStorage.getItem('speed-profile-active') || '1', 10);
        this.activeProfile = Number.isNaN(storedProfile) ? 1 : Math.min(Math.max(storedProfile, 1), this.totalProfiles);

        const storedControlProfile = parseInt(localStorage.getItem('control-profile-active') || '1', 10);
        this.activeControlProfile = Number.isNaN(storedControlProfile) ? 1 : Math.min(Math.max(storedControlProfile, 1), this.totalControlProfiles);
        this.init();
    }

    init() {
        this.createMenu();
        this.bindEvents();
        this.showTab('general');
    }

    createMenu() {
        // Создаем главный контейнер меню
        this.menu = document.createElement('div');
        this.menu.id = 'speed-menu';

        // Создаем заголовок с вкладками и кнопкой закрытия
        const header = this.createHeader();
        const closeBtn = this.createCloseButton();
        header.appendChild(closeBtn);
        this.menu.appendChild(header);

        // Создаем контейнер для содержимого вкладок
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content-container';

        // Создаем вкладку Основное
        const generalTab = this.createGeneralTab();
        tabContent.appendChild(generalTab);

        // Создаем вкладку Limits
        const limitsTab = this.createLimitsTab();
        tabContent.appendChild(limitsTab);

        // Создаем вкладку Switches
        const switchesTab = this.createSwitchesTab();
        tabContent.appendChild(switchesTab);

        // Создаем вкладку управления раскладками
        const controlTab = this.createControlTab();
        tabContent.appendChild(controlTab);

        const videoTab = this.createVideoTab();
        tabContent.appendChild(videoTab);

        const bagTab = this.createBagTab();
        tabContent.appendChild(bagTab);

        this.menu.appendChild(tabContent);

        document.body.appendChild(this.menu);
    }

    createHeader() {
        const header = document.createElement('div');
        header.className = 'speed-menu-header';

        const tabButtons = document.createElement('div');
        tabButtons.className = 'tab-buttons';

        // Кнопка вкладки Основное
        const generalBtn = document.createElement('button');
        generalBtn.className = 'tab-btn active';
        generalBtn.setAttribute('data-tab', 'general');
        generalBtn.textContent = 'Основное';

        // Кнопка вкладки Limits
        const limitsBtn = document.createElement('button');
        limitsBtn.className = 'tab-btn';
        limitsBtn.setAttribute('data-tab', 'limits');
        limitsBtn.textContent = 'Ограничения скорости';

        // Кнопка вкладки Switches
        const switchesBtn = document.createElement('button');
        switchesBtn.className = 'tab-btn';
        switchesBtn.setAttribute('data-tab', 'switches');
        switchesBtn.textContent = 'Инвертирование осей';

        // Кнопка вкладки Control
        const controlBtn = document.createElement('button');
        controlBtn.className = 'tab-btn';
        controlBtn.setAttribute('data-tab', 'control');
        controlBtn.textContent = 'Управление';

        // Кнопка вкладки Video
        const videoBtn = document.createElement('button');
        videoBtn.className = 'tab-btn';
        videoBtn.setAttribute('data-tab', 'video');
        videoBtn.textContent = 'Видео';

        // Кнопка вкладки Bag
        const bagBtn = document.createElement('button');
        bagBtn.className = 'tab-btn';
        bagBtn.setAttribute('data-tab', 'bag');
        bagBtn.textContent = 'Записи (Bag)';

        tabButtons.appendChild(generalBtn);
        tabButtons.appendChild(limitsBtn);
        tabButtons.appendChild(switchesBtn);
        tabButtons.appendChild(controlBtn);
        tabButtons.appendChild(videoBtn);
        tabButtons.appendChild(bagBtn);
        header.appendChild(tabButtons);

        return header;
    }

    createCloseButton() {
        const closeBtn = document.createElement('button');
        closeBtn.id = 'speed-menu-close';
        closeBtn.className = 'menu-close-btn';
        closeBtn.setAttribute('aria-label', 'Close');
        // closeBtn.textContent = '×';
        return closeBtn;
    }

    createGeneralTab() {
        const tab = document.createElement('div');
        tab.id = 'general-tab';
        tab.className = 'tab-content active';

        // --- Выбор аппарата ---
        const vehicleGroup = document.createElement('div');
        vehicleGroup.className = 'general-field-group';

        const vehicleLabel = document.createElement('div');
        vehicleLabel.className = 'general-field-title';
        vehicleLabel.textContent = 'Аппарат';
        vehicleGroup.appendChild(vehicleLabel);

        const savedVehicle = localStorage.getItem('vehicle-type') || 'jackass';

        const vehicles = [
            { value: 'variola', label: 'Variola' },
            { value: 'jackass', label: 'Jackass' },
        ];

        for (const v of vehicles) {
            const option = document.createElement('label');
            option.className = 'vehicle-radio-option';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'vehicle-type';
            radio.value = v.value;
            radio.checked = v.value === savedVehicle;

            radio.addEventListener('change', () => {
                localStorage.setItem('vehicle-type', v.value);
                this.applyVehicleType(v.value);
            });

            const text = document.createElement('span');
            text.textContent = v.label;

            option.appendChild(radio);
            option.appendChild(text);
            vehicleGroup.appendChild(option);
        }

        tab.appendChild(vehicleGroup);

        // Применяем сохранённый выбор при инициализации
        this.applyVehicleType(savedVehicle);

        // Группа для depth info
        const depthGroup = document.createElement('div');
        depthGroup.className = 'general-field-group';

        const depthLabel = document.createElement('label');
        depthLabel.setAttribute('for', 'depth-info-input');
        depthLabel.textContent = 'Depth Info';
        depthGroup.appendChild(depthLabel);

        const depthInput = document.createElement('input');
        depthInput.type = 'number';
        depthInput.id = 'depth-info-input';
        depthInput.className = 'general-input';
        depthInput.step = '0.01';
        depthInput.placeholder = '0.00';
        depthInput.value = localStorage.getItem('depth-info-value') || '';

        depthInput.addEventListener('input', () => {
            const raw = depthInput.value;
            // Ограничиваем до двух знаков после запятой
            const dotIdx = raw.indexOf('.');
            if (dotIdx !== -1 && raw.length - dotIdx - 1 > 2) {
                depthInput.value = parseFloat(raw).toFixed(2);
            }
            const val = depthInput.value !== '' ? parseFloat(depthInput.value) : null;
            localStorage.setItem('depth-info-value', depthInput.value);
            window.depthInfoValue = val;
            // Сразу обновляем отображение глубины
            set_text_info_value('depth-value', depthValue);
        });

        // Инициализация глобального значения
        const stored = localStorage.getItem('depth-info-value');
        window.depthInfoValue = stored !== null && stored !== '' ? parseFloat(stored) : null;

        depthGroup.appendChild(depthInput);
        tab.appendChild(depthGroup);

        // --- Ping IP (IP Monitor) ---
        const pingGroup = document.createElement('div');
        pingGroup.className = 'general-field-group ping-host-group';

        const pingTitle = document.createElement('div');
        pingTitle.className = 'general-field-title';
        pingTitle.textContent = 'IP Monitor';
        pingGroup.appendChild(pingTitle);

        const pingLabel = document.createElement('label');
        pingLabel.setAttribute('for', 'ping-host-input');
        pingLabel.textContent = 'IP-адрес устройства:';
        pingGroup.appendChild(pingLabel);

        const pingInput = document.createElement('input');
        pingInput.type = 'text';
        pingInput.id = 'ping-host-input';
        pingInput.className = 'general-input';
        pingInput.placeholder = 'например 192.168.1.10';
        pingInput.value = localStorage.getItem('ping-host') || '';
        pingGroup.appendChild(pingInput);

        const pingApplyBtn = document.createElement('button');
        pingApplyBtn.className = 'video-apply-btn';
        pingApplyBtn.textContent = 'Применить Ping IP';
        pingApplyBtn.addEventListener('click', () => {
            const host = pingInput.value.trim();
            localStorage.setItem('ping-host', host);
            if (window.PingMonitor) {
                if (host) {
                    PingMonitor.start(host);
                } else {
                    PingMonitor.start();
                }
            }
        });
        pingGroup.appendChild(pingApplyBtn);

        // --- Switch виньетки потери связи ---
        const vignetteControl = document.createElement('div');
        vignetteControl.className = 'switch-control';

        const vignetteCheck = document.createElement('input');
        vignetteCheck.type = 'checkbox';
        vignetteCheck.id = 'ping-vignette-toggle';
        vignetteCheck.className = 'switch-checkbox';
        vignetteCheck.checked = localStorage.getItem('ping-vignette-enabled') !== 'false';

        vignetteCheck.addEventListener('change', () => {
            localStorage.setItem('ping-vignette-enabled', vignetteCheck.checked);
            window.pingVignetteEnabled = vignetteCheck.checked;
            if (typeof updatePingVignette === 'function') updatePingVignette();
        });

        const vignetteLabel = document.createElement('label');
        vignetteLabel.setAttribute('for', 'ping-vignette-toggle');
        vignetteLabel.className = 'switch-label';
        vignetteLabel.textContent = 'Индикатор потери связи';

        vignetteControl.appendChild(vignetteCheck);
        vignetteControl.appendChild(vignetteLabel);
        pingGroup.appendChild(vignetteControl);

        tab.appendChild(pingGroup);

        // --- Плавный старт ---
        const smoothGroup = document.createElement('div');
        smoothGroup.className = 'general-field-group';

        const smoothTitle = document.createElement('div');
        smoothTitle.className = 'general-field-title';
        smoothTitle.textContent = 'Управление';
        smoothGroup.appendChild(smoothTitle);

        const smoothControl = document.createElement('div');
        smoothControl.className = 'switch-control';

        const smoothCheck = document.createElement('input');
        smoothCheck.type = 'checkbox';
        smoothCheck.id = 'twist-smooth-toggle';
        smoothCheck.className = 'switch-checkbox';
        smoothCheck.checked = localStorage.getItem('twist-smooth-enabled') !== 'false';

        smoothCheck.addEventListener('change', () => {
            localStorage.setItem('twist-smooth-enabled', smoothCheck.checked);
            twistSmoothEnabled = smoothCheck.checked;
        });

        const smoothLabel = document.createElement('label');
        smoothLabel.setAttribute('for', 'twist-smooth-toggle');
        smoothLabel.className = 'switch-label';
        smoothLabel.textContent = 'Плавный старт';

        smoothControl.appendChild(smoothCheck);
        smoothControl.appendChild(smoothLabel);
        smoothGroup.appendChild(smoothControl);

        tab.appendChild(smoothGroup);

        return tab;
    }

    createLimitsTab() {
        const tab = document.createElement('div');
        tab.id = 'limits-tab';
        tab.className = 'tab-content';

        const profilesContainer = document.createElement('div');
        profilesContainer.className = 'limits-profile-selector';

        const profilesLabel = document.createElement('span');
        profilesLabel.className = 'limits-profile-label';
        profilesLabel.textContent = 'Профиль скорости:';
        profilesContainer.appendChild(profilesLabel);

        this.profileButtons = [];
        for (let i = 1; i <= this.totalProfiles; i++) {
            const btn = document.createElement('button');
            btn.className = 'profile-btn';
            btn.textContent = String(i);
            btn.setAttribute('data-profile', String(i));
            if (i === this.activeProfile) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                this.setActiveProfile(i);
            });
            this.profileButtons.push(btn);
            profilesContainer.appendChild(btn);
        }

        tab.appendChild(profilesContainer);

        this.axisLimits = [
            { id: 'linX-limit', label: 'Linear X',  unit: 'm/s',   min: '0.1', max: '2.0', step: '0.1', value: this.getAxisInitialValue('linX-limit', '1.0') },
            { id: 'linY-limit', label: 'Linear Y',  unit: 'm/s',   min: '0.1', max: '2.0', step: '0.1', value: this.getAxisInitialValue('linY-limit', '1.0') },
            { id: 'linZ-limit', label: 'Linear Z',  unit: 'm/s',   min: '0.1', max: '2.0', step: '0.1', value: this.getAxisInitialValue('linZ-limit', '1.0') },
            { id: 'angX-limit', label: 'Angular X', unit: 'rad/s',  min: '0.1', max: '2.0', step: '0.1', value: this.getAxisInitialValue('angX-limit', '1.0') },
            { id: 'angY-limit', label: 'Angular Y', unit: 'rad/s',  min: '0.1', max: '2.0', step: '0.1', value: this.getAxisInitialValue('angY-limit', '1.0') },
            { id: 'angZ-limit', label: 'Angular Z', unit: 'rad/s',  min: '0.1', max: '2.0', step: '0.1', value: this.getAxisInitialValue('angZ-limit', '1.0') },
        ];

        const grid = document.createElement('div');
        grid.className = 'limits-grid';

        // Header row
        for (const text of ['Axis', 'Limit', 'Value']) {
            const th = document.createElement('div');
            th.className = 'limits-grid-header';
            th.textContent = text;
            grid.appendChild(th);
        }

        for (const axis of this.axisLimits) {
            const label = document.createElement('label');
            label.className = 'limits-grid-label';
            label.setAttribute('for', axis.id);
            label.textContent = axis.label;

            const input = document.createElement('input');
            input.type = 'range';
            input.id = axis.id;
            input.min = axis.min;
            input.max = axis.max;
            input.step = axis.step;
            input.value = axis.value;

            const valueSpan = document.createElement('span');
            valueSpan.className = 'limits-grid-value';
            valueSpan.id = `${axis.id}-value`;
            valueSpan.textContent = `${this.formatAxisValue(axis.value)} ${axis.unit}`;

            grid.appendChild(label);
            grid.appendChild(input);
            grid.appendChild(valueSpan);
        }

        tab.appendChild(grid);

        // --- Параметры плавного старта ---
        const rampTitle = document.createElement('div');
        rampTitle.className = 'limits-profile-label';
        rampTitle.style.marginTop = '16px';
        rampTitle.textContent = 'Плавный старт';
        tab.appendChild(rampTitle);

        this.rampParams = [
            { id: 'twist-accel-rate',    label: 'Ускорение',  unit: 'x/с', min: '0.1', max: '10.0', step: '0.1', default: '1.0' },
            { id: 'twist-decel-rate',    label: 'Торможение', unit: 'x/с', min: '0.1', max: '10.0', step: '0.1', default: '3.5' },
            { id: 'twist-ramp-interval', label: 'Частота',    unit: 'Гц',  min: '10',  max: '100',  step: '5',   default: '33' },
        ];

        const rampGrid = document.createElement('div');
        rampGrid.className = 'limits-grid';

        for (const text of ['Параметр', '', 'Значение']) {
            const th = document.createElement('div');
            th.className = 'limits-grid-header';
            th.textContent = text;
            rampGrid.appendChild(th);
        }

        for (const param of this.rampParams) {
            const label = document.createElement('label');
            label.className = 'limits-grid-label';
            label.setAttribute('for', param.id);
            label.textContent = param.label;

            const input = document.createElement('input');
            input.type = 'range';
            input.id = param.id;
            input.min = param.min;
            input.max = param.max;
            input.step = param.step;
            input.value = this.getAxisInitialValue(param.id, param.default);

            const valueSpan = document.createElement('span');
            valueSpan.className = 'limits-grid-value';
            valueSpan.id = `${param.id}-value`;
            valueSpan.textContent = `${this.formatAxisValue(input.value)} ${param.unit}`;

            rampGrid.appendChild(label);
            rampGrid.appendChild(input);
            rampGrid.appendChild(valueSpan);
        }

        tab.appendChild(rampGrid);

        return tab;
    }

    createSwitchesTab() {
        const tab = document.createElement('div');
        tab.id = 'switches-tab';
        tab.className = 'tab-content';

        const switchesContainer = document.createElement('div');
        switchesContainer.className = 'switches-container';

        const axes = [
            { id: 'linX', label: 'Инвертировать продольное движение (X)' },
            { id: 'linY', label: 'Инвертировать боковое движение (Y)' },
            { id: 'linZ', label: 'Инвертировать вертикальное движение (Z)' },
            { id: 'angX', label: 'Инвертировать крен (угол X)' },
            { id: 'angY', label: 'Инвертировать тангаж (угол Y)' },
            { id: 'angZ', label: 'Инвертировать рыскание (угол Z)' },
        ];

        // Глобальное управление инверсией по каждой оси
        window.axisInversion = window.axisInversion || {};

        axes.forEach(axis => {
            const control = document.createElement('div');
            control.className = 'switch-control';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `invert-${axis.id}`;
            checkbox.className = 'switch-checkbox';

            const stored = localStorage.getItem(`axis-invert-${axis.id}`);
            const initial = stored === 'true' || window.axisInversion[axis.id] === true;
            checkbox.checked = initial;
            window.axisInversion[axis.id] = initial;

            const label = document.createElement('label');
            label.setAttribute('for', `invert-${axis.id}`);
            label.className = 'switch-label';
            label.textContent = axis.label;

            checkbox.addEventListener('change', () => {
                const value = checkbox.checked;
                window.axisInversion[axis.id] = value;
                localStorage.setItem(`axis-invert-${axis.id}`, String(value));
            });

            control.appendChild(checkbox);
            control.appendChild(label);
            switchesContainer.appendChild(control);
        });

        tab.appendChild(switchesContainer);
        return tab;
    }

    createControlTab() {
        const tab = document.createElement('div');
        tab.id = 'control-tab';
        tab.className = 'tab-content';

        const container = document.createElement('div');
        container.className = 'control-profiles-container';

        // Переключатель профилей управления (раскладки/параметры) — по аналогии с профилями скоростей
        const controlProfilesContainer = document.createElement('div');
        controlProfilesContainer.className = 'limits-profile-selector';

        const controlProfilesLabel = document.createElement('span');
        controlProfilesLabel.className = 'limits-profile-label';
        controlProfilesLabel.textContent = 'Профиль управления:';
        controlProfilesContainer.appendChild(controlProfilesLabel);

        this.controlProfileButtons = [];
        for (let i = 1; i <= this.totalControlProfiles; i++) {
            const btn = document.createElement('button');
            btn.className = 'profile-btn';
            btn.textContent = String(i);
            btn.setAttribute('data-control-profile', String(i));
            if (i === this.activeControlProfile) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                this.setActiveControlProfile(i);
            });
            this.controlProfileButtons.push(btn);
            controlProfilesContainer.appendChild(btn);
        }

        container.appendChild(controlProfilesContainer);

        // Блок числовых параметров управления (фонарь, манипулятор, камера)
        const paramsTitle = document.createElement('div');
        paramsTitle.className = 'control-bindings-title';
        paramsTitle.textContent = 'Параметры управления';
        container.appendChild(paramsTitle);

        const paramsGrid = document.createElement('div');
        paramsGrid.className = 'control-bindings-grid';

        const addParamRow = (labelText, key, min, max, step) => {
            const row = document.createElement('div');
            row.className = 'binding-row';

            const labelCell = document.createElement('div');
            labelCell.className = 'binding-cell binding-label-cell';
            labelCell.textContent = labelText;
            row.appendChild(labelCell);

            const inputCell = document.createElement('div');
            inputCell.className = 'binding-cell binding-key-cell';

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'control-param-input';
            input.dataset.paramKey = key;
            if (typeof min !== 'undefined') input.min = String(min);
            if (typeof max !== 'undefined') input.max = String(max);
            if (typeof step !== 'undefined') input.step = String(step);

            const storedRaw = localStorage.getItem(this.getControlParamsStorageKey(this.activeControlProfile || 1));
            let stored = null;
            try {
                stored = storedRaw ? JSON.parse(storedRaw) : null;
            } catch (e) {
                stored = null;
            }
            const globalCfg = window.controlParams || {};
            const value = (stored && typeof stored[key] !== 'undefined')
                ? stored[key]
                : (typeof globalCfg[key] !== 'undefined' ? globalCfg[key] : '');

            if (value !== '') {
                input.value = String(value);
            }

            input.addEventListener('change', () => {
                const raw = input.value;
                const num = parseFloat(raw);
                if (!Number.isFinite(num)) {
                    return;
                }

                // Обновляем глобальный объект
                window.controlParams = window.controlParams || {};
                window.controlParams[key] = num;

                // Обновляем localStorage
                let current = null;
                try {
                    current = JSON.parse(localStorage.getItem(this.getControlParamsStorageKey(this.activeControlProfile || 1)) || 'null');
                } catch (e) {
                    current = null;
                }
                if (!current || typeof current !== 'object') {
                    current = {};
                }
                current[key] = num;
                try {
                    localStorage.setItem(this.getControlParamsStorageKey(this.activeControlProfile || 1), JSON.stringify(current));
                    if ((this.activeControlProfile || 1) === 1) {
                        // обратная совместимость
                        localStorage.setItem('control-params', JSON.stringify(current));
                    }
                } catch (e) {
                    // ignore
                }
            });

            inputCell.appendChild(input);
            row.appendChild(inputCell);

            // Пустая ячейка для выравнивания под сетку (столбец "Джойстик")
            const emptyCell = document.createElement('div');
            emptyCell.className = 'binding-cell binding-joy-cell';
            row.appendChild(emptyCell);

            paramsGrid.appendChild(row);
        };

        // Фонарь
        addParamRow('Фонарь: мощность ВКЛ', 'flashlight_on', 0, 10000, 10);
        addParamRow('Фонарь: мощность ВЫКЛ', 'flashlight_off', 0, 10000, 10);
        addParamRow('Фонарь: количество шагов', 'flashlight_steps', 1, 20, 1);

        // Манипулятор
        addParamRow('Манипулятор: открыть', 'manipulator_open', 0, 3000, 10);
        addParamRow('Манипулятор: закрыть', 'manipulator_close', 0, 3000, 10);
        addParamRow('Манипулятор: нейтраль', 'manipulator_neutral', 0, 3000, 10);

        // Камера
        addParamRow('Камера: шаг поворота (°)', 'camera_step_deg', 1, 180, 1);
        addParamRow('Камера: минимальный угол (°)', 'camera_min_deg', 0, 180, 1);
        addParamRow('Камера: максимальный угол (°)', 'camera_max_deg', 0, 180, 1);

        container.appendChild(paramsGrid);

        // Редактор раскладки интерфейсных кнопок
        const bindingsTitle = document.createElement('div');
        bindingsTitle.className = 'control-bindings-title';
        bindingsTitle.textContent = 'Привязка кнопок интерфейса';
        container.appendChild(bindingsTitle);

        // Описание для привязки кнопок интерфейса убрано по требованию

        // Грид-контейнер для привязок
        const bindingsGrid = document.createElement('div');
        bindingsGrid.className = 'control-bindings-grid';

        // Заголовок грида
        ['Действие', 'Клавиша', 'Джойстик'].forEach(text => {
            const headerCell = document.createElement('div');
            headerCell.className = 'binding-header-cell';
            headerCell.textContent = text;
            bindingsGrid.appendChild(headerCell);
        });

        const actions = [
            { id: 'manipulator_open', label: 'Манипулятор открыть' },
            { id: 'manipulator_close', label: 'Манипулятор закрыть' },
            { id: 'flashlight', label: 'Фонарь' },
            { id: 'photo', label: 'Фото' },
            { id: 'video', label: 'Запись видео' },
            { id: 'settings', label: 'Настройки' },
            { id: 'depth_hold', label: 'Удержание глубины' },
            { id: 'arm', label: 'Armed/Disarmed' },
            { id: 'camera_up', label: 'Камера вверх' },
            { id: 'camera_down', label: 'Камера вниз' },
            // Переключение профилей скорости
            { id: 'speed_profile_1', label: 'Профиль скорости 1' },
            { id: 'speed_profile_2', label: 'Профиль скорости 2' },
            { id: 'speed_profile_3', label: 'Профиль скорости 3' },
            { id: 'speed_profile_4', label: 'Профиль скорости 4' },
            { id: 'speed_profile_5', label: 'Профиль скорости 5' },
            { id: 'speed_profile_next', label: 'Профиль скорости +1' },
            { id: 'speed_profile_prev', label: 'Профиль скорости -1' },
            // Переключение профиля управления (1 input: переключение 1↔2)
            { id: 'control_profile_toggle', label: 'Профиль управления (переключить 1↔2)' },
        ];

        const currentBindings = (window.interfaceBindings) ? { ...window.interfaceBindings } : {};

        actions.forEach(action => {
            const row = document.createElement('div');
            // Отдельный класс для интерфейсных кнопок,
            // чтобы не путать их с движением и осями джойстика
            row.className = 'binding-row interface-binding-row';
            row.dataset.actionId = action.id;

            const labelCell = document.createElement('div');
            labelCell.className = 'binding-cell binding-label-cell';
            labelCell.textContent = action.label;
            row.appendChild(labelCell);

            const keyCell = document.createElement('div');
            keyCell.className = 'binding-cell binding-key-cell';
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.className = 'binding-key-input';
            const existing = currentBindings[action.id] || {};
            keyInput.value = existing.key || '';
            if (existing.code) {
                keyInput.dataset.code = existing.code;
            }

            // Ввод не печатаем вручную, а слушаем нажатие физической клавиши
            keyInput.readOnly = true;
            keyInput.placeholder = 'Нажмите клавишу...';
            keyInput.addEventListener('keydown', (e) => {
                e.preventDefault();
                const code = e.code;
                const key = e.key;

                let label = key;
                if (code.startsWith('Digit')) label = code.replace('Digit', '');
                else if (code.startsWith('Key')) label = key.length === 1 ? key.toLowerCase() : code.replace('Key', '');
                else if (code.startsWith('Arrow')) {
                    const map = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
                    label = map[code] || code;
                } else if (/^F\d+$/.test(key)) {
                    label = key;
                }

                keyInput.value = label;
                keyInput.dataset.code = code;
            });
            keyCell.appendChild(keyInput);
            row.appendChild(keyCell);

            const joyCell = document.createElement('div');
            joyCell.className = 'binding-cell binding-joy-cell';
            const joySelect = document.createElement('select');
            joySelect.className = 'binding-joy-select';

            const joystickButtons = [
                { value: '', label: 'Нет' },
                { value: 0, label: 'X' },
                { value: 1, label: 'O' },
                { value: 2, label: '□' },
                { value: 3, label: '△' },
                { value: 4, label: 'L1' },
                { value: 5, label: 'R1' },
                { value: 6, label: 'L2' },
                { value: 7, label: 'R2' },
                { value: 8, label: 'Share' },
                { value: 9, label: 'Options' },
                { value: 10, label: 'L3' },
                { value: 11, label: 'R3' },
                { value: 12, label: '↑' },
                { value: 13, label: '↓' },
                { value: 14, label: '←' },
                { value: 15, label: '→' },
                { value: 16, label: 'PS' },
                { value: 17, label: 'Touchpad' },
            ];

            joystickButtons.forEach(btn => {
                const opt = document.createElement('option');
                opt.value = btn.value === '' ? '' : String(btn.value);
                opt.textContent = btn.label;
                joySelect.appendChild(opt);
            });

            const joyVal = currentBindings[action.id] ? currentBindings[action.id].joyButton : null;
            joySelect.value = (typeof joyVal === 'number') ? String(joyVal) : '';

            joyCell.appendChild(joySelect);
            row.appendChild(joyCell);

            bindingsGrid.appendChild(row);
        });

        container.appendChild(bindingsGrid);

        // Блок настройки управления движением роботом (клавиатура)
        const moveTitle = document.createElement('div');
        moveTitle.className = 'control-bindings-title';
        moveTitle.textContent = 'Привязка клавиш управления роботом';
        container.appendChild(moveTitle);

        // Описание для привязки клавиш управления движением убрано по требованию

        const moveGrid = document.createElement('div');
        moveGrid.className = 'control-bindings-grid movement-bindings-grid';

        ['Действие', 'Клавиша', 'Джойстик'].forEach(text => {
            const headerCell = document.createElement('div');
            headerCell.className = 'binding-header-cell';
            headerCell.textContent = text;
            moveGrid.appendChild(headerCell);
        });

        const movementActions = [
            { id: 'move_forward',  label: 'Вперёд' },
            { id: 'move_backward', label: 'Назад' },
            { id: 'yaw_left',      label: 'Поворот влево' },
            { id: 'yaw_right',     label: 'Поворот вправо' },
            { id: 'up',            label: 'Всплытие' },
            { id: 'down',          label: 'Погружение' },
            { id: 'pitch_up',      label: 'Дифферент вверх' },
            { id: 'pitch_down',    label: 'Дифферент вниз' },
        ];

        const currentMovementBindings = (window.movementBindings) ? { ...window.movementBindings } : {};

        movementActions.forEach(action => {
            const row = document.createElement('div');
            row.className = 'binding-row movement-binding-row';
            row.dataset.actionId = action.id;

            const labelCell = document.createElement('div');
            labelCell.className = 'binding-cell binding-label-cell';
            labelCell.textContent = action.label;
            row.appendChild(labelCell);

            const keyCell = document.createElement('div');
            keyCell.className = 'binding-cell binding-key-cell';
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.className = 'binding-key-input movement-key-input';
            const existing = currentMovementBindings[action.id] || {};
            keyInput.value = existing.key || '';
            if (existing.code) {
                keyInput.dataset.code = existing.code;
            }

            keyInput.readOnly = true;
            keyInput.placeholder = 'Нажмите клавишу...';
            keyInput.addEventListener('keydown', (e) => {
                e.preventDefault();
                const code = e.code;
                const key = e.key;

                let label = key;
                if (code.startsWith('Digit')) label = code.replace('Digit', '');
                else if (code.startsWith('Key')) label = key.length === 1 ? key.toLowerCase() : code.replace('Key', '');
                else if (code.startsWith('Arrow')) {
                    const map = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
                    label = map[code] || code;
                } else if (/^F\d+$/.test(key)) {
                    label = key;
                }

                keyInput.value = label;
                keyInput.dataset.code = code;
            });
            keyCell.appendChild(keyInput);
            row.appendChild(keyCell);
            
            const joyCell = document.createElement('div');
            joyCell.className = 'binding-cell binding-joy-cell';
            const joySelect = document.createElement('select');
            joySelect.className = 'movement-joy-select';

            const joystickButtons = [
                { value: '', label: 'Нет' },
                { value: 0, label: 'X' },
                { value: 1, label: 'O' },
                { value: 2, label: '□' },
                { value: 3, label: '△' },
                { value: 4, label: 'L1' },
                { value: 5, label: 'R1' },
                { value: 6, label: 'L2' },
                { value: 7, label: 'R2' },
                { value: 8, label: 'Share' },
                { value: 9, label: 'Options' },
                { value: 10, label: 'L3' },
                { value: 11, label: 'R3' },
                { value: 12, label: '↑' },
                { value: 13, label: '↓' },
                { value: 14, label: '←' },
                { value: 15, label: '→' },
                { value: 16, label: 'PS' },
                { value: 17, label: 'Touchpad' },
            ];

            joystickButtons.forEach(btn => {
                const opt = document.createElement('option');
                opt.value = btn.value === '' ? '' : String(btn.value);
                opt.textContent = btn.label;
                joySelect.appendChild(opt);
            });

            const existingJoy = currentMovementBindings[action.id] ? currentMovementBindings[action.id].joyButton : null;
            joySelect.value = (typeof existingJoy === 'number') ? String(existingJoy) : '';

            joyCell.appendChild(joySelect);
            row.appendChild(joyCell);

            moveGrid.appendChild(row);
        });

        container.appendChild(moveGrid);

        // Блок настройки привязки осей джойстика к осям движения робота
        const joyAxesTitle = document.createElement('div');
        joyAxesTitle.className = 'control-bindings-title';
        joyAxesTitle.textContent = 'Привязка осей джойстика';
        container.appendChild(joyAxesTitle);

        // Описание для привязки осей джойстика убрано по требованию

        const joyAxesGrid = document.createElement('div');
        joyAxesGrid.className = 'control-bindings-grid joystick-axes-grid';

        ['Ось джойстика', 'Действие робота'].forEach(text => {
            const headerCell = document.createElement('div');
            headerCell.className = 'binding-header-cell';
            headerCell.textContent = text;
            joyAxesGrid.appendChild(headerCell);
        });

        const joystickAxes = [
            { index: 0, label: 'Левый стик – горизонталь' },
            { index: 1, label: 'Левый стик – вертикаль' },
            { index: 2, label: 'Правый стик – горизонталь' },
            { index: 3, label: 'Правый стик – вертикаль' },
        ];

        const axisOptions = [
            { value: '',      label: 'Нет' },
            { value: 'linX',  label: 'Linear X (продольное движение)' },
            { value: 'linY',  label: 'Linear Y (лаг)' },
            { value: 'linZ',  label: 'Linear Z (глубина)' },
            { value: 'angX',  label: 'Angular X (крен)' },
            { value: 'angY',  label: 'Angular Y (тангаж)' },
            { value: 'angZ',  label: 'Angular Z (рыскание)' },
        ];

        const currentJoystickAxesBindings = (window.joystickAxesBindings) ? { ...window.joystickAxesBindings } : {};

        joystickAxes.forEach(axisCfg => {
            const row = document.createElement('div');
            row.className = 'binding-row joystick-axis-row';
            row.dataset.axisIndex = String(axisCfg.index);

            const labelCell = document.createElement('div');
            labelCell.className = 'binding-cell binding-label-cell';
            labelCell.textContent = axisCfg.label;
            row.appendChild(labelCell);

            const selectCell = document.createElement('div');
            selectCell.className = 'binding-cell binding-key-cell';
            const axisSelect = document.createElement('select');
            axisSelect.className = 'joystick-axis-select';

            axisOptions.forEach(optCfg => {
                const opt = document.createElement('option');
                opt.value = optCfg.value;
                opt.textContent = optCfg.label;
                axisSelect.appendChild(opt);
            });

            const existing = currentJoystickAxesBindings[axisCfg.index];
            axisSelect.value = typeof existing === 'string' ? existing : '';

            selectCell.appendChild(axisSelect);
            row.appendChild(selectCell);

            joyAxesGrid.appendChild(row);
        });

        container.appendChild(joyAxesGrid);

        // Кнопка сохранения раскладки управления (распространяется на весь блок "Управление")
        const bindingsSaveBtn = document.createElement('button');
        bindingsSaveBtn.id = 'control-bindings-save';
        bindingsSaveBtn.className = 'control-bindings-save-btn';
        bindingsSaveBtn.textContent = 'Сохранить раскладку';
        container.appendChild(bindingsSaveBtn);

        tab.appendChild(container);
        return tab;
    }

    createSwitchControl(number, labelText) {
        const control = document.createElement('div');
        control.className = 'switch-control';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `switch-${number}`;
        checkbox.className = 'switch-checkbox';

        const label = document.createElement('label');
        label.setAttribute('for', `switch-${number}`);
        label.className = 'switch-label';
        label.textContent = labelText;

        control.appendChild(checkbox);
        control.appendChild(label);

        return control;
    }

    createVideoTab() {
        const tab = document.createElement('div');
        tab.id = 'video-tab';
        tab.className = 'tab-content';

        const sourceGroup = document.createElement('div');
        sourceGroup.className = 'video-source-group';

        const title = document.createElement('div');
        title.className = 'video-source-title';
        title.textContent = 'Video Source';
        sourceGroup.appendChild(title);

        const mtxOption = this._createRadioOption(
            'video-source', 'mediamtx', 'MediaMTX (WebRTC)', true
        );
        sourceGroup.appendChild(mtxOption);

        const rosOption = this._createRadioOption(
            'video-source', 'ros', 'ROS Topic', false
        );
        sourceGroup.appendChild(rosOption);

        tab.appendChild(sourceGroup);

        const mtxGroup = document.createElement('div');
        mtxGroup.className = 'video-topic-group';
        mtxGroup.id = 'mediamtx-settings-group';

        const mtxIpLabel = document.createElement('label');
        mtxIpLabel.setAttribute('for', 'mediamtx-ip-input');
        mtxIpLabel.textContent = 'MediaMTX IP:';

        const mtxIpInput = document.createElement('input');
        mtxIpInput.type = 'text';
        mtxIpInput.id = 'mediamtx-ip-input';
        mtxIpInput.className = 'video-topic-input';
        mtxIpInput.placeholder = window.location.hostname;
        mtxIpInput.value = localStorage.getItem('mediamtx-ip') || window.location.hostname;

        const mtxPortLabel = document.createElement('label');
        mtxPortLabel.setAttribute('for', 'mediamtx-port-input');
        mtxPortLabel.textContent = 'Port:';

        const mtxPortInput = document.createElement('input');
        mtxPortInput.type = 'number';
        mtxPortInput.id = 'mediamtx-port-input';
        mtxPortInput.className = 'video-topic-input';
        mtxPortInput.placeholder = '8889';
        mtxPortInput.value = localStorage.getItem('mediamtx-port') || '8889';

        const mtxPathLabel = document.createElement('label');
        mtxPathLabel.setAttribute('for', 'mediamtx-path-input');
        mtxPathLabel.textContent = 'Stream path:';

        const mtxPathInput = document.createElement('input');
        mtxPathInput.type = 'text';
        mtxPathInput.id = 'mediamtx-path-input';
        mtxPathInput.className = 'video-topic-input';
        mtxPathInput.placeholder = '/cam1/';
        mtxPathInput.value = localStorage.getItem('mediamtx-path') || '/cam1/';

        mtxGroup.appendChild(mtxIpLabel);
        mtxGroup.appendChild(mtxIpInput);
        mtxGroup.appendChild(mtxPortLabel);
        mtxGroup.appendChild(mtxPortInput);
        mtxGroup.appendChild(mtxPathLabel);
        mtxGroup.appendChild(mtxPathInput);
        tab.appendChild(mtxGroup);

        const topicGroup = document.createElement('div');
        topicGroup.className = 'video-topic-group';
        topicGroup.id = 'ros-topic-group';

        const topicLabel = document.createElement('label');
        topicLabel.setAttribute('for', 'ros-topic-input');
        topicLabel.textContent = 'Topic name:';

        const topicSelect = document.createElement('select');
        topicSelect.id = 'ros-topic-select';
        topicSelect.className = 'video-topic-select';

        const topics = [
            '/variola/camera_front/compressed',
            '/jackass/camera_front/compressed',
        ];
        for (const t of topics) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            topicSelect.appendChild(opt);
        }
        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = 'Другой...';
        topicSelect.appendChild(customOpt);

        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.id = 'ros-topic-custom';
        customInput.className = 'video-topic-input';
        customInput.placeholder = '/my/topic/compressed';
        customInput.style.display = 'none';

        topicSelect.addEventListener('change', () => {
            customInput.style.display = topicSelect.value === '__custom__' ? '' : 'none';
        });

        topicGroup.appendChild(topicLabel);
        topicGroup.appendChild(topicSelect);
        topicGroup.appendChild(customInput);
        tab.appendChild(topicGroup);

        const applyBtn = document.createElement('button');
        applyBtn.className = 'video-apply-btn';
        applyBtn.id = 'video-apply-btn';
        applyBtn.textContent = 'Apply';
        tab.appendChild(applyBtn);

        const status = document.createElement('div');
        status.className = 'video-source-status';
        status.id = 'video-source-status';
        status.textContent = 'Active: MediaMTX';
        tab.appendChild(status);

        return tab;
    }

    _createRadioOption(name, value, labelText, checked) {
        const wrapper = document.createElement('div');
        wrapper.className = 'video-radio-option';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = name;
        radio.id = `video-source-${value}`;
        radio.value = value;
        radio.checked = checked;

        const label = document.createElement('label');
        label.setAttribute('for', `video-source-${value}`);
        label.textContent = labelText;

        wrapper.appendChild(radio);
        wrapper.appendChild(label);
        return wrapper;
    }

    getProfileStorageKey(axisId, profile) {
        return `${axisId}-p${profile}`;
    }

    getAxisInitialValue(axisId, defaultValue) {
        const profileKey = this.getProfileStorageKey(axisId, this.activeProfile || 1);
        const profileVal = localStorage.getItem(profileKey);
        if (profileVal !== null) {
            return profileVal;
        }
        // Для обратной совместимости читаем "старое" значение
        // только для профиля 1, чтобы остальные профили имели
        // свои независимые значения.
        if ((this.activeProfile || 1) === 1) {
            const legacyVal = localStorage.getItem(axisId);
            if (legacyVal !== null) {
                return legacyVal;
            }
        }
        return defaultValue;
    }

    setAxisValue(axisId, value) {
        const profileKey = this.getProfileStorageKey(axisId, this.activeProfile || 1);
        localStorage.setItem(profileKey, value);
        // В общий ключ пишем только для профиля 1,
        // чтобы не перетирать значения других профилей.
        if ((this.activeProfile || 1) === 1) {
            localStorage.setItem(axisId, value);
        }
    }

    setActiveProfile(profileNumber) {
        if (profileNumber < 1 || profileNumber > this.totalProfiles) return;
        if (this.activeProfile === profileNumber) return;

        this.activeProfile = profileNumber;
        localStorage.setItem('speed-profile-active', String(profileNumber));

        if (this.profileButtons && this.profileButtons.length) {
            this.profileButtons.forEach(btn => {
                const p = parseInt(btn.getAttribute('data-profile') || '0', 10);
                if (p === profileNumber) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        this.updateLimitsForProfile();

        this.showProfileNotification(profileNumber);

        // Пересчитать текущие скорости с учётом новых лимитов профиля
        // без сброса направления/факта нажатия
        if (window.kbController && typeof window.kbController.reapplyMovementFromKeys === 'function') {
            window.kbController.reapplyMovementFromKeys();
        }
        if (window.joystick && typeof window.joystick.reapplyMovementFromAxes === 'function') {
            window.joystick.reapplyMovementFromAxes();
        }
    }

    formatAxisValue(value) {
        const num = parseFloat(String(value).replace(',', '.'));
        if (Number.isNaN(num)) return value;
        return num.toFixed(1);
    }

    showProfileNotification(profileNumber) {
        const containerId = 'app-toast-container';
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'speed-menu-toast';
        toast.textContent = `Профиль скорости ${profileNumber} активен`;

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

    showControlProfileNotification(profileNumber) {
        const containerId = 'app-toast-container';
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'speed-menu-toast';
        toast.textContent = `Профиль управления ${profileNumber} активен`;

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

    updateLimitsForProfile() {
        if (!this.axisLimits) return;
        this.axisLimits.forEach(axis => {
            const axisId = axis.id;
            const unit = axis.unit;
            const rawVal = this.getAxisInitialValue(axisId, axis.value || '1.0');
            const val = this.formatAxisValue(rawVal);
            const input = document.getElementById(axisId);
            const valueSpan = document.getElementById(`${axisId}-value`);
            if (input) input.value = val;
            if (valueSpan) valueSpan.textContent = `${val} ${unit}`;
        });

        if (this.rampParams) {
            const rampApply = {
                'twist-accel-rate': (v) => { TWIST_ACCEL_RATE = v; },
                'twist-decel-rate': (v) => { TWIST_DECEL_RATE = v; },
                'twist-ramp-interval': (v) => { TWIST_RAMP_INTERVAL_MS = Math.round(1000 / v); restartTwistRampTimer(); },
            };
            this.rampParams.forEach(param => {
                const rawVal = this.getAxisInitialValue(param.id, param.default);
                const val = this.formatAxisValue(rawVal);
                const input = document.getElementById(param.id);
                const valueSpan = document.getElementById(`${param.id}-value`);
                if (input) input.value = val;
                if (valueSpan) valueSpan.textContent = `${val} ${param.unit}`;
                if (rampApply[param.id]) rampApply[param.id](parseFloat(val));
            });
        }
    }

    createBagTab() {
        const tab = document.createElement('div');
        tab.id = 'bag-tab';
        tab.className = 'tab-content';
        const host = document.createElement('div');
        host.id = 'bag-tab-host';
        host.className = 'bag-tab-host';
        tab.appendChild(host);
        return tab;
    }

    addStyles() {
    }

    bindEvents() {
        // Закрытие меню
        document.getElementById('speed-menu-close').addEventListener('click', () => {
            this.hide();
        });

        // Переключение вкладок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.showTab(tabName);
            });
        });

        for (const axis of this.axisLimits) {
            const unit = axis.unit;
            const axisId = axis.id;
            document.getElementById(axisId).addEventListener('input', (e) => {
                const value = this.formatAxisValue(e.target.value);
                document.getElementById(`${axisId}-value`).textContent = `${value} ${unit}`;
                this.setAxisValue(axisId, value);
                e.target.value = value;
            });
        }

        const rampVarMap = {
            'twist-accel-rate': (v) => { TWIST_ACCEL_RATE = v; },
            'twist-decel-rate': (v) => { TWIST_DECEL_RATE = v; },
            'twist-ramp-interval': (v) => { TWIST_RAMP_INTERVAL_MS = Math.round(1000 / v); restartTwistRampTimer(); },
        };

        for (const param of this.rampParams) {
            const unit = param.unit;
            const paramId = param.id;
            document.getElementById(paramId).addEventListener('input', (e) => {
                const value = this.formatAxisValue(e.target.value);
                document.getElementById(`${paramId}-value`).textContent = `${value} ${unit}`;
                this.setAxisValue(paramId, value);
                e.target.value = value;
                if (rampVarMap[paramId]) rampVarMap[paramId](parseFloat(value));
            });
        }

        document.querySelectorAll('input[name="video-source"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const topicGroup = document.getElementById('ros-topic-group');
                const mtxGroup = document.getElementById('mediamtx-settings-group');
                topicGroup.style.display = radio.value === 'ros' ? '' : 'none';
                mtxGroup.style.display = radio.value === 'mediamtx' ? '' : 'none';
            });
        });
        document.getElementById('ros-topic-group').style.display = 'none';

        document.getElementById('video-apply-btn').addEventListener('click', () => {
            const selected = document.querySelector('input[name="video-source"]:checked').value;
            const topicSelect = document.getElementById('ros-topic-select');
            const customInput = document.getElementById('ros-topic-custom');
            const statusEl = document.getElementById('video-source-status');

            const topic = topicSelect.value === '__custom__'
                ? customInput.value.trim()
                : topicSelect.value;

            if (selected === 'ros' && (typeof ros === 'undefined' || !ros || !isConnect)) {
                statusEl.textContent = 'Connect to ROS first!';
                statusEl.style.color = '#ff4444';
                return;
            }

            const mtxIp = document.getElementById('mediamtx-ip-input').value.trim();
            const mtxPort = document.getElementById('mediamtx-port-input').value.trim() || '8889';
            const mtxPath = document.getElementById('mediamtx-path-input').value.trim() || '/cam1/';
            localStorage.setItem('mediamtx-ip', mtxIp);
            localStorage.setItem('mediamtx-port', mtxPort);
            localStorage.setItem('mediamtx-path', mtxPath);
            updateMediaMTXStreamUrl(mtxIp, mtxPort, mtxPath);

            if (selected === 'mediamtx' && activeVideoSource === 'mediamtx') {
                startMediaMTX();
            } else {
                switchVideoSource(selected, topic);
            }

            const label = selected === 'mediamtx' ? 'MediaMTX' : `ROS: ${topic}`;
            statusEl.textContent = `Active: ${label}`;
            statusEl.style.color = '';
        });

        // Сохранение раскладки управления (интерфейсные кнопки, движение, оси джойстика)
        const bindingsSaveBtn = document.getElementById('control-bindings-save');
        if (bindingsSaveBtn) {
            bindingsSaveBtn.addEventListener('click', () => {
                // Интерфейсные кнопки
                const rows = document.querySelectorAll('.interface-binding-row');
                const newBindings = {};

                rows.forEach(row => {
                    const actionId = row.dataset.actionId;
                    const keyInput = row.querySelector('.binding-key-input');
                    const joySelect = row.querySelector('.binding-joy-select');

                    const key = keyInput.value.trim();
                    const code = keyInput.dataset.code || '';
                    const joyRaw = joySelect.value.trim();
                    const joyButton = joyRaw === '' ? null : parseInt(joyRaw, 10);

                    if (!actionId) return;
                    newBindings[actionId] = {
                        key,
                        code: code || null,
                        joyButton: Number.isNaN(joyButton) ? null : joyButton,
                    };
                });

                window.interfaceBindings = newBindings;
                try {
                    localStorage.setItem(this.getControlBindingsStorageKey('interface-bindings', this.activeControlProfile || 1), JSON.stringify(newBindings));
                    if ((this.activeControlProfile || 1) === 1) {
                        // обратная совместимость
                        localStorage.setItem('interface-bindings', JSON.stringify(newBindings));
                    }
                } catch (e) {
                    console.error('Не удалось сохранить привязки интерфейса', e);
                }

                // Обновляем горячие клавиши кнопок интерфейса
                if (window.buttonsData && Array.isArray(window.buttonsData)) {
                    window.buttonsData.forEach(btnCfg => {
                        const b = newBindings[btnCfg.name];
                        if (b && b.key) {
                            btnCfg.key = b.key;
                            if (b.code) btnCfg.code = b.code;
                        }
                    });
                }
                if (window.extraKeysConfig && Array.isArray(window.extraKeysConfig)) {
                    window.extraKeysConfig.forEach(extra => {
                        const b = newBindings[extra.name];
                        if (b && b.key) {
                            extra.key = b.key;
                            if (b.code) extra.code = b.code;
                        }
                    });
                }

                // Обновляем подписи букв на кнопках интерфейса по новым биндам
                if (typeof window.updateButtonLabelsFromBindings === 'function') {
                    window.updateButtonLabelsFromBindings();
                }

                // Сохраняем и применяем бинды управления движением робота
                const moveRows = document.querySelectorAll('.movement-binding-row');
                const newMovementBindings = {};

                moveRows.forEach(row => {
                    const actionId = row.dataset.actionId;
                    const keyInput = row.querySelector('.movement-key-input');
                    const joySelect = row.querySelector('.movement-joy-select');
                    if (!actionId || !keyInput) return;

                    const key = keyInput.value.trim();
                    const code = keyInput.dataset.code || '';
                    const joyRaw = joySelect ? joySelect.value.trim() : '';
                    const joyButton = joyRaw === '' ? null : parseInt(joyRaw, 10);

                    newMovementBindings[actionId] = {
                        key,
                        code: code || null,
                        joyButton: Number.isNaN(joyButton) ? null : joyButton,
                    };
                });

                window.movementBindings = newMovementBindings;
                try {
                    localStorage.setItem(this.getControlBindingsStorageKey('movement-bindings', this.activeControlProfile || 1), JSON.stringify(newMovementBindings));
                    if ((this.activeControlProfile || 1) === 1) {
                        // обратная совместимость
                        localStorage.setItem('movement-bindings', JSON.stringify(newMovementBindings));
                    }
                } catch (e) {
                    console.error('Не удалось сохранить привязки управления движением', e);
                }

                if (typeof window.applyMovementBindings === 'function') {
                    window.applyMovementBindings();
                }

                // Сохраняем и применяем привязку осей джойстика
                const joyAxisRows = document.querySelectorAll('.joystick-axis-row');
                const newJoystickAxesBindings = {};

                joyAxisRows.forEach(row => {
                    const axisIndexRaw = row.dataset.axisIndex;
                    const select = row.querySelector('.joystick-axis-select');
                    if (typeof axisIndexRaw === 'undefined' || !select) return;

                    const axisIndex = parseInt(axisIndexRaw, 10);
                    const value = select.value.trim();

                    newJoystickAxesBindings[axisIndex] = value === '' ? null : value;
                });

                try {
                    if (typeof window.applyJoystickAxesBindings === 'function') {
                        window.applyJoystickAxesBindings(newJoystickAxesBindings, { persist: false });
                    } else {
                        // если функции нет, просто пишем напрямую
                        window.joystickAxesBindings = newJoystickAxesBindings;
                        localStorage.setItem(this.getControlBindingsStorageKey('joystick-axes-bindings', this.activeControlProfile || 1), JSON.stringify(newJoystickAxesBindings));
                        if ((this.activeControlProfile || 1) === 1) {
                            // обратная совместимость
                            localStorage.setItem('joystick-axes-bindings', JSON.stringify(newJoystickAxesBindings));
                        }
                    }
                } catch (e) {
                    console.error('Не удалось сохранить привязки осей джойстика', e);
                }

                // Всегда сохраняем профильную привязку осей, даже если есть applyJoystickAxesBindings (persist:false)
                try {
                    localStorage.setItem(this.getControlBindingsStorageKey('joystick-axes-bindings', this.activeControlProfile || 1), JSON.stringify(newJoystickAxesBindings));
                    if ((this.activeControlProfile || 1) === 1) {
                        localStorage.setItem('joystick-axes-bindings', JSON.stringify(newJoystickAxesBindings));
                    }
                } catch (e) {
                    // ignore
                }

                // После обновления всех биндов ещё раз пересобираем маппинг джойстика
                if (typeof window.applyJoystickBindingsFromInterface === 'function') {
                    window.applyJoystickBindingsFromInterface();
                }
            });
        }

        // Закрытие по клику вне меню
        document.addEventListener('click', (e) => {
            if (this.isVisible && !this.menu.contains(e.target) && !e.target.closest('.grid-button')) {
                this.hide();
            }
        });

        // Предотвращение закрытия при клике внутри меню
        this.menu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Обработка клавиши Escape
        document.addEventListener('keydown', (e) => {
            if (this.isVisible && e.key === 'Escape') {
                this.hide();
            }
        });

        // Переключение профилей скорости по биндам клавиатуры / джойстика
        document.addEventListener('keydown', (e) => {
            // Не реагируем, если ввод идёт в поле формы
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            const bindings = window.interfaceBindings || {};

            // Профили по прямым биндам (1..5)
            for (let i = 1; i <= this.totalProfiles; i++) {
                const id = `speed_profile_${i}`;
                const bind = bindings[id];
                if (!bind) continue;

                const bindCode = bind.code;
                const bindKey = bind.key;
                let matched = false;

                if (bindCode) {
                    matched = (e.code === bindCode);
                } else if (bindKey) {
                    matched = (String(e.key).toLowerCase() === String(bindKey).toLowerCase());
                }

                if (matched) {
                    e.preventDefault();
                    this.setActiveProfile(i);
                    break;
                }
            }

            // Увеличение / уменьшение номера профиля
            const incBind = bindings.speed_profile_next;
            const decBind = bindings.speed_profile_prev;

            const isMatch = (bind) => {
                if (!bind) return false;
                const bindCode = bind.code;
                const bindKey = bind.key;
                if (bindCode) {
                    return e.code === bindCode;
                }
                if (bindKey) {
                    return String(e.key).toLowerCase() === String(bindKey).toLowerCase();
                }
                return false;
            };

            if (isMatch(incBind)) {
                e.preventDefault();
                const current = this.activeProfile || 1;
                const next = (current % this.totalProfiles) + 1; // после 5 -> 1
                this.setActiveProfile(next);
            } else if (isMatch(decBind)) {
                e.preventDefault();
                const current = this.activeProfile || 1;
                const prev = current === 1 ? this.totalProfiles : current - 1; // после 1 -> 5
                this.setActiveProfile(prev);
            }

            // Профиль управления: один бинд (переключение 1↔2)
            const toggleCtrlBind = bindings.control_profile_toggle;
            if (isMatch(toggleCtrlBind)) {
                e.preventDefault();
                const current = this.activeControlProfile || 1;
                const next = current === 1 ? 2 : 1;
                this.setActiveControlProfile(next);
            }
        });
    }

    showTab(tabName) {
        // Скрываем все вкладки
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        // Убираем активный класс у всех кнопок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Показываем выбранную вкладку
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Активируем соответствующую кнопку и скроллим с запасом, чтобы была видна соседняя
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        activeBtn.classList.add('active');
        const container = activeBtn.parentElement;
        const btnRect = activeBtn.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const peek = btnRect.width * 0.6;

        if (btnRect.right + peek > containerRect.right) {
            container.scrollBy({ left: btnRect.right - containerRect.right + peek, behavior: 'smooth' });
        } else if (btnRect.left - peek < containerRect.left) {
            container.scrollBy({ left: btnRect.left - containerRect.left - peek, behavior: 'smooth' });
        }

        this.activeTab = tabName;
    }

    applyVehicleType(type) {
        // Обновляем изображения аппарата (могут ещё не существовать при инициализации)
        const sideImg = document.getElementById('vehicle-side-img');
        const upImg = document.getElementById('vehicle-up-img');
        if (sideImg) sideImg.src = `/static/img/${type}-side.png`;
        if (upImg) upImg.src = `/static/img/${type}-up.png`;
    }

    show() {
        this.menu.style.display = 'block';
        this.isVisible = true;

        // При открытии меню подтягиваем актуальный профиль управления
        this.loadControlProfile(this.activeControlProfile || 1);

        // При открытии меню обновляем поля привязок из актуальных interfaceBindings
        if (typeof this.refreshBindingsFromInterface === 'function') {
            this.refreshBindingsFromInterface();
        }
    }

    hide() {
        this.menu.style.display = 'none';
        this.isVisible = false;
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    // Обновление значений полей "Клавиша" и "Джойстик" из window.interfaceBindings
    refreshBindingsFromInterface() {
        const bindings = window.interfaceBindings;
        if (bindings) {
            // Только строки интерфейсных кнопок
            const rows = this.menu.querySelectorAll('.interface-binding-row');
            rows.forEach(row => {
                const actionId = row.dataset.actionId;
                if (!actionId) return;

                const bind = bindings[actionId];
                const keyInput = row.querySelector('.binding-key-input');
                const joySelect = row.querySelector('.binding-joy-select');

                if (keyInput) {
                    if (bind && bind.key) {
                        keyInput.value = bind.key;
                        if (bind.code) {
                            keyInput.dataset.code = bind.code;
                        } else {
                            delete keyInput.dataset.code;
                        }
                    } else {
                        keyInput.value = '';
                        delete keyInput.dataset.code;
                    }
                }

                if (joySelect) {
                    if (bind && typeof bind.joyButton === 'number') {
                        joySelect.value = String(bind.joyButton);
                    } else {
                        joySelect.value = '';
                    }
                }
            });
        }

        // Обновляем блок управления движением по window.movementBindings
        const moveBindings = window.movementBindings;
        if (moveBindings) {
            const moveRows = this.menu.querySelectorAll('.movement-binding-row');
            moveRows.forEach(row => {
                const actionId = row.dataset.actionId;
                if (!actionId) return;

                const bind = moveBindings[actionId];
                const keyInput = row.querySelector('.movement-key-input');
                const joySelect = row.querySelector('.movement-joy-select');

                if (keyInput) {
                    if (bind && bind.key) {
                        keyInput.value = bind.key;
                        if (bind.code) {
                            keyInput.dataset.code = bind.code;
                        } else {
                            delete keyInput.dataset.code;
                        }
                    } else {
                        keyInput.value = '';
                        delete keyInput.dataset.code;
                    }
                }

                if (joySelect) {
                    if (bind && typeof bind.joyButton === 'number') {
                        joySelect.value = String(bind.joyButton);
                    } else {
                        joySelect.value = '';
                    }
                }
            });
        }

        // Обновляем блок привязки осей джойстика по window.joystickAxesBindings
        const axesBindings = window.joystickAxesBindings;
        if (axesBindings) {
            const joyAxisRows = this.menu.querySelectorAll('.joystick-axis-row');
            joyAxisRows.forEach(row => {
                const axisIndexRaw = row.dataset.axisIndex;
                const select = row.querySelector('.joystick-axis-select');
                if (!select || typeof axisIndexRaw === 'undefined') return;

                const axisIndex = parseInt(axisIndexRaw, 10);
                const value = axesBindings[axisIndex];
                select.value = typeof value === 'string' ? value : '';
            });
        }
    }

    getControlBindingsStorageKey(baseKey, profile) {
        return `${baseKey}-p${profile}`;
    }

    getControlParamsStorageKey(profile) {
        return `control-params-p${profile}`;
    }

    _safeParseJson(raw) {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    _readProfileJson(profileKey, legacyKey, profile) {
        const raw = localStorage.getItem(profileKey);
        const parsed = this._safeParseJson(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed;
        }
        if (profile === 1 && legacyKey) {
            const legacyRaw = localStorage.getItem(legacyKey);
            const legacyParsed = this._safeParseJson(legacyRaw);
            if (legacyParsed && typeof legacyParsed === 'object') {
                return legacyParsed;
            }
        }
        return null;
    }

    refreshControlParamsInputs() {
        const inputs = this.menu ? this.menu.querySelectorAll('.control-param-input') : [];
        const cfg = window.controlParams || {};
        inputs.forEach(input => {
            const key = input.dataset.paramKey;
            if (!key) return;
            const v = typeof cfg[key] !== 'undefined' ? cfg[key] : '';
            input.value = v === '' ? '' : String(v);
        });
    }

    loadControlProfile(profileNumber) {
        const profile = Math.min(Math.max(parseInt(String(profileNumber), 10) || 1, 1), this.totalControlProfiles);
        this.activeControlProfile = profile;
        localStorage.setItem('control-profile-active', String(profile));

        if (this.controlProfileButtons && this.controlProfileButtons.length) {
            this.controlProfileButtons.forEach(btn => {
                const p = parseInt(btn.getAttribute('data-control-profile') || '0', 10);
                if (p === profile) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        }

        // Параметры управления
        const params = this._readProfileJson(this.getControlParamsStorageKey(profile), 'control-params', profile) || {};
        window.controlParams = params;

        // Привязки интерфейсных кнопок (fallback на дефолтные если профиль пуст)
        const iface = this._readProfileJson(this.getControlBindingsStorageKey('interface-bindings', profile), 'interface-bindings', profile);
        window.interfaceBindings = iface || { ...(window.defaultInterfaceBindings || {}) };

        // Привязки движения (fallback на дефолтные если профиль пуст)
        const move = this._readProfileJson(this.getControlBindingsStorageKey('movement-bindings', profile), 'movement-bindings', profile);
        window.movementBindings = move || { ...(window.defaultMovementBindings || {}) };

        // Привязки осей джойстика
        const axes = this._readProfileJson(this.getControlBindingsStorageKey('joystick-axes-bindings', profile), 'joystick-axes-bindings', profile);
        if (axes) window.joystickAxesBindings = axes;

        // Применяем, если есть функции
        if (typeof window.applyMovementBindings === 'function') {
            try { window.applyMovementBindings(); } catch (e) { /* ignore */ }
        }
        if (typeof window.applyJoystickAxesBindings === 'function' && axes) {
            try { window.applyJoystickAxesBindings(axes, { persist: false }); } catch (e) { /* ignore */ }
        }
        if (typeof window.updateButtonLabelsFromBindings === 'function') {
            try { window.updateButtonLabelsFromBindings(); } catch (e) { /* ignore */ }
        }
        if (typeof window.applyJoystickBindingsFromInterface === 'function') {
            try { window.applyJoystickBindingsFromInterface(); } catch (e) { /* ignore */ }
        }

        // Обновляем UI, если меню уже создано/открыто
        if (this.menu && this.isVisible) {
            this.refreshBindingsFromInterface();
            this.refreshControlParamsInputs();
        }

        this.showControlProfileNotification(profile);
    }

    setActiveControlProfile(profileNumber) {
        if (profileNumber < 1 || profileNumber > this.totalControlProfiles) return;
        if (this.activeControlProfile === profileNumber) return;
        this.loadControlProfile(profileNumber);
    }

    getAxisLimit(axisId) {
        return parseFloat(document.getElementById(`${axisId}-limit`).value);
    }

    setAxisLimit(axisId, value) {
        const input = document.getElementById(`${axisId}-limit`);
        input.value = value;
        document.getElementById(`${axisId}-limit-value`).textContent = value;
    }

    getSwitchState(switchNumber) {
        return document.getElementById(`switch-${switchNumber}`).checked;
    }

    setSwitchState(switchNumber, state) {
        document.getElementById(`switch-${switchNumber}`).checked = state;
    }

    // Метод для удаления меню
    destroy() {
        if (this.menu && this.menu.parentNode) {
            this.menu.parentNode.removeChild(this.menu);
        }
    }
}

// Создаем глобальный экземпляр меню
const speedMenu = new SpeedMenu();

// Экспортируем для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = speedMenu;
}
