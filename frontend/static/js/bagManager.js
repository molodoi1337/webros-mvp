class BagManagerClient {
  constructor() {
    this.isRecording = false;
    this.currentRecord = null;
    this.statusEl = null;
    this.storageInfoEl = null;
    this.lastRosTopics = [];
  }

  async init() {
    this.ensurePanel();
    await this.refreshCatalog({ keepPage: false });
    await this.syncRecordStatus();
    this.bindPanelEvents();
    setInterval(() => {
      this.syncRecordStatus().catch(() => {});
    }, 3000);
  }

  ensurePanel() {
    if (document.getElementById('bag-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'bag-panel';
    panel.innerHTML = `
      <div class="bag-panel-header">
        <strong>Записи (Bag)</strong>
        <div class="bag-panel-toolbar">
          <button id="bag-open-record-dialog-btn" type="button">Запись</button>
          <button id="bag-refresh-btn" type="button">Обновить</button>
          <button id="bag-scan-btn" type="button">Скан</button>
        </div>
      </div>
      <div id="bag-status" class="bag-status">BAG: idle</div>
      <div id="bag-storage-info" class="bag-storage-info"></div>
      <div class="bag-filters">
        <input id="bag-search" type="text" placeholder="Поиск по имени/описанию">
        <select id="bag-status-filter">
          <option value="">Все статусы</option>
          <option value="active">active</option>
          <option value="recording">recording</option>
          <option value="recovered">recovered</option>
          <option value="error">error</option>
        </select>
        <input id="bag-tags-filter" type="text" placeholder="Теги">
        <input id="bag-from-filter" type="datetime-local">
        <input id="bag-to-filter" type="datetime-local">
        <select id="bag-sort-filter">
          <option value="start_time">По дате</option>
          <option value="name">По имени</option>
          <option value="size_bytes">По размеру</option>
          <option value="message_count">По сообщениям</option>
          <option value="status">По статусу</option>
        </select>
      </div>
      <div id="bag-catalog" class="bag-catalog"></div>
      <div id="bag-playback-panel" class="bag-playback-panel"></div>
    `;
    const tabHost = document.getElementById('bag-tab-host');
    (tabHost || document.body).appendChild(panel);
    this.statusEl = panel.querySelector('#bag-status');
    this.storageInfoEl = panel.querySelector('#bag-storage-info');
  }

  bindPanelEvents() {
    const panel = document.getElementById('bag-panel');
    if (!panel) return;
    panel.querySelector('#bag-refresh-btn').addEventListener('click', () => this.refreshCatalog({ keepPage: false }));
    panel.querySelector('#bag-scan-btn').addEventListener('click', async () => {
      await this.request('/api/bags/scan', { method: 'POST', body: '{}' });
      await this.refreshCatalog({ keepPage: false });
    });
    panel.querySelector('#bag-open-record-dialog-btn').addEventListener('click', () => {
      if (this.isRecording) {
        this.stopRecordingFromPanel();
      } else {
        this.openRecordDialog();
      }
    });
    ['bag-search', 'bag-status-filter', 'bag-tags-filter', 'bag-from-filter', 'bag-to-filter', 'bag-sort-filter'].forEach((id) => {
      const el = panel.querySelector(`#${id}`);
      if (!el) return;
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        this.refreshCatalog({ keepPage: false }).catch(() => {});
      });
    });
  }

  getFilters() {
    const panel = document.getElementById('bag-panel');
    if (!panel) return {};
    const value = (id) => panel.querySelector(`#${id}`)?.value?.trim() || '';
    return {
      search: value('bag-search'),
      status: value('bag-status-filter'),
      tags: value('bag-tags-filter'),
      from: value('bag-from-filter'),
      to: value('bag-to-filter'),
      sort: value('bag-sort-filter') || 'start_time',
    };
  }

  async request(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || `Request failed: ${path}`);
    }
    return json.data;
  }

  getDefaultRecordPayload() {
    const vehicleType = localStorage.getItem('vehicle-type') || 'vehicle';
    const now = new Date();
    const pad = (v) => String(v).padStart(2, '0');
    const name = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}_${vehicleType}`;
    return {
      name,
      topics: this.getTopicsPreset('all'),
      description: '',
      tags: '',
      vehicle_type: vehicleType,
      max_bag_duration: 300,
      max_bag_size: 200,
    };
  }

  async toggleRecording(wantRecord) {
    if (wantRecord) {
      try {
        const payload = this.getDefaultRecordPayload();
        const data = await this.request('/api/bags/record/start', { method: 'POST', body: JSON.stringify(payload) });
        this.isRecording = true;
        this.currentRecord = data;
        this.renderStatus();
      } catch (err) {
        alert('Не удалось запустить запись:\n' + (err?.message || err));
        throw err;
      }
      return;
    }
    const data = await this.request('/api/bags/record/stop', { method: 'POST', body: '{}' });
    this.isRecording = false;
    this.currentRecord = null;
    this.renderStatus();
    await this.refreshCatalog({ keepPage: false });
    if (data && data.record_failed) {
      alert(
        'Запись завершилась без данных (size=0, duration=0).\n' +
        `rc=${data.returncode}\n\n` +
        'Лог ros2 bag record (хвост):\n' +
        (data.log_tail || '(пусто)')
      );
    }
  }

  async syncRecordStatus() {
    const data = await this.request('/api/bags/record/status');
    this.isRecording = Boolean(data.recording);
    this.currentRecord = data.current || null;
    this.renderStatus();
  }

  renderStatus() {
    if (!this.statusEl) return;
    if (this.isRecording) {
      const rawLabel = this.currentRecord?.name || 'recording';
      const label = String(rawLabel).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
      this.statusEl.innerHTML = `
        <span class="bag-status-text">BAG REC: ${label}</span>
        <button id="bag-status-stop-btn" type="button" class="bag-stop-btn">■ Остановить запись</button>
      `;
      this.statusEl.classList.add('recording');
      const stopBtn = this.statusEl.querySelector('#bag-status-stop-btn');
      if (stopBtn) {
        stopBtn.addEventListener('click', () => this.stopRecordingFromPanel());
      }
    } else {
      this.statusEl.textContent = 'BAG: idle';
      this.statusEl.classList.remove('recording');
    }
    const toolbarBtn = document.getElementById('bag-open-record-dialog-btn');
    if (toolbarBtn) {
      if (this.isRecording) {
        toolbarBtn.textContent = 'Остановить';
        toolbarBtn.classList.add('recording');
      } else {
        toolbarBtn.textContent = 'Запись';
        toolbarBtn.classList.remove('recording');
      }
    }
    if (typeof window.updateButtonState === 'function') {
      window.updateButtonState('bag_record', this.isRecording);
    }
  }

  async stopRecordingFromPanel() {
    if (!confirm('Остановить запись?')) return;
    try {
      await this.toggleRecording(false);
    } catch (err) {
      alert('Не удалось остановить запись:\n' + (err?.message || err));
      return;
    }
    if (typeof window.updateButtonState === 'function') {
      window.updateButtonState('bag_record', false);
    }
  }

  async refreshCatalog({ keepPage = true } = {}) {
    const filters = this.getFilters();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    params.set('per_page', '100');
    params.set('order', 'desc');
    if (!params.get('sort')) params.set('sort', 'start_time');
    const data = await this.request(`/api/bags?${params.toString()}`);
    this.renderStorageInfo(data.items || []);
    if (window.bagCatalog && typeof window.bagCatalog.render === 'function') {
      window.bagCatalog.render(data.items || []);
    }
    return data;
  }

  async renderStorageInfo(items) {
    if (!this.storageInfoEl) return;
    const totalBytes = items.reduce((acc, i) => acc + Number(i.size_bytes || 0), 0);
    const totalCount = items.length;
    const fmt = window.bagCatalog ? window.bagCatalog.formatSize(totalBytes) : `${totalBytes} B`;
    let free = '';
    try {
      const st = await this.request('/api/storage');
      const freeFmt = window.bagCatalog ? window.bagCatalog.formatSize(st.free_bytes) : `${st.free_bytes} B`;
      const totalFmt = window.bagCatalog ? window.bagCatalog.formatSize(st.total_bytes) : `${st.total_bytes} B`;
      const warn = st.low_space ? ' <span class="bag-storage-warn">⚠ &lt; 1 ГБ</span>' : '';
      free = `, свободно: ${freeFmt} из ${totalFmt}${warn}`;
    } catch (_) { /* noop */ }
    this.storageInfoEl.innerHTML = `Всего записей: ${totalCount}, размер: ${fmt}${free}`;
  }

  getTopicsPreset(preset) {
    const telemetry = [
      '/ws/modbus/sensor/heading',
      '/ws/modbus/sensor/pitch',
      '/ws/modbus/sensor/depth',
      '/ws/twist_pilot',
    ];
    const camera = ['/ws/camera/image_raw/compressed'];
    if (preset === 'telemetry') return telemetry;
    if (preset === 'telemetry_camera') return [...telemetry, ...camera];
    return [];
  }

  async openRecordDialog() {
    if (this.isRecording) {
      alert('Запись уже идёт. Остановите её перед запуском новой.');
      return;
    }
    const topics = await this.fetchRosTopics();
    const allNames = topics.map((t) => t.name);
    const current = this.getDefaultRecordPayload();
    const savedTopics = JSON.parse(localStorage.getItem('bag-last-topics') || '[]');
    const selected = savedTopics.length ? savedTopics : allNames;
    const host = document.createElement('div');
    host.className = 'bag-modal-host';
    host.innerHTML = `
      <div class="bag-modal">
        <h3>Запуск записи bag</h3>
        <label>Имя</label><input id="bag-rec-name" value="${current.name}">
        <label>Описание</label><input id="bag-rec-description" value="">
        <label>Теги</label><input id="bag-rec-tags" value="">
        <div class="bag-presets">
          <button data-preset="all" type="button">Все</button>
          <button data-preset="telemetry" type="button">Телеметрия</button>
          <button data-preset="telemetry_camera" type="button">Телеметрия + камера</button>
        </div>
        <label>Сегмент, сек</label><input id="bag-rec-segment" type="number" min="30" value="300">
        <label>Сегмент, МБ</label><input id="bag-rec-segment-size" type="number" min="50" value="200">
        <div id="bag-topic-list" class="bag-topic-list"></div>
        <div class="bag-modal-actions">
          <button id="bag-rec-start-btn" type="button">Начать</button>
          <button id="bag-rec-cancel-btn" type="button">Отмена</button>
        </div>
      </div>
    `;
    document.body.appendChild(host);

    const list = host.querySelector('#bag-topic-list');
    const renderTopics = (selectedNames) => {
      list.innerHTML = topics.map((t) => `
        <label class="bag-topic-row">
          <input type="checkbox" value="${t.name}" ${selectedNames.includes(t.name) ? 'checked' : ''}>
          <span>${t.name}</span>
          <small>${t.type || 'unknown'}</small>
        </label>
      `).join('');
    };
    renderTopics(selected);

    host.querySelectorAll('.bag-presets button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        const chosen = preset === 'all' ? allNames : this.getTopicsPreset(preset);
        renderTopics(chosen);
      });
    });

    host.querySelector('#bag-rec-cancel-btn').addEventListener('click', () => host.remove());
    host.querySelector('#bag-rec-start-btn').addEventListener('click', async () => {
      const selectedTopics = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value);
      localStorage.setItem('bag-last-topics', JSON.stringify(selectedTopics));
      const payload = {
        name: host.querySelector('#bag-rec-name').value.trim(),
        description: host.querySelector('#bag-rec-description').value.trim(),
        tags: host.querySelector('#bag-rec-tags').value.trim(),
        vehicle_type: localStorage.getItem('vehicle-type') || 'vehicle',
        topics: selectedTopics,
        max_bag_duration: Number(host.querySelector('#bag-rec-segment').value || 300),
        max_bag_size: Number(host.querySelector('#bag-rec-segment-size').value || 200),
      };
      try {
        const data = await this.request('/api/bags/record/start', { method: 'POST', body: JSON.stringify(payload) });
        this.isRecording = true;
        this.currentRecord = data;
        this.renderStatus();
        host.remove();
      } catch (e) {
        alert(e.message);
      }
    });
  }

  async fetchRosTopics() {
    try {
      const data = await this.request('/api/ros/topics');
      this.lastRosTopics = data;
      return data;
    } catch (e) {
      return this.lastRosTopics;
    }
  }
}

window.bagManager = new BagManagerClient();
window.addEventListener('DOMContentLoaded', () => {
  window.bagManager.init().catch((e) => console.error('bagManager init failed', e));
});
