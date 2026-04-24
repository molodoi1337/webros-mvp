class BagViewer {
  constructor() {
    this.modal = null;
    this.currentBag = null;
    this.currentTopic = null;
    this.currentPage = 0;
    this.pageSize = 100;
    this.availableFields = [];
    this.selectedField = '';
    this.chart = null;
    this.overlays = [];
    this.overlayColors = ['#4bc0c0', '#ff8f40', '#f6d25b', '#ff6384', '#9966ff', '#36a2eb', '#4bc0a0', '#c9cbcf'];
  }

  ensureModal() {
    if (this.modal) return;
    this.modal = document.createElement('div');
    this.modal.id = 'bag-viewer-modal';
    this.modal.innerHTML = `
      <div class="bag-viewer-content">
        <button class="bag-viewer-close" type="button">x</button>
        <div id="bag-viewer-body">Loading...</div>
      </div>
    `;
    this.modal.querySelector('.bag-viewer-close').addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
    document.body.appendChild(this.modal);
  }

  async open(bagId) {
    this.ensureModal();
    this.modal.classList.add('show');
    const body = this.modal.querySelector('#bag-viewer-body');
    body.textContent = 'Loading...';
    try {
      const bag = await window.bagManager.request(`/api/bags/${bagId}`);
      this.currentBag = bag;
      this.currentTopic = null;
      this.currentPage = 0;
      this.availableFields = [];
      this.selectedField = '';
      this.overlays = [];
      if (this.chart) { try { this.chart.destroy(); } catch (_) {} this.chart = null; }
      const topics = bag.topics || [];
      const durationSec = (Number(bag.duration_ns || 0) / 1e9).toFixed(2);
      body.innerHTML = `
        <h3>${this.escape(bag.name)} <small>#${bag.id}</small></h3>
        <div class="bag-viewer-meta">
          <div><b>Путь:</b> ${this.escape(bag.file_path)}</div>
          <div><b>Статус:</b> ${this.escape(bag.status)} · <b>Формат:</b> ${this.escape(bag.format)}</div>
          <div><b>Длительность:</b> ${durationSec}s · <b>Сообщений:</b> ${bag.message_count || 0}</div>
          <div><b>Старт:</b> ${this.escape(bag.start_time || '')} · <b>Конец:</b> ${this.escape(bag.end_time || '-')}</div>
        </div>
        <div class="bag-viewer-edit">
          <label>Имя</label><input id="bag-edit-name" value="${this.escape(bag.name || '')}">
          <label>Описание</label><input id="bag-edit-description" value="${this.escape(bag.description || '')}">
          <label>Теги</label><input id="bag-edit-tags" value="${this.escape(bag.tags || '')}">
          <div class="bag-viewer-edit-actions">
            <button id="bag-edit-save-btn" type="button">Сохранить</button>
            <button id="bag-download-btn" type="button">Скачать ZIP</button>
            <button id="bag-play-btn" type="button">Воспроизвести</button>
            <button id="bag-delete-btn" type="button" class="bag-danger">Удалить</button>
          </div>
        </div>

        <div id="bag-timeline-host" class="bag-timeline-host"></div>

        <h4>Топики</h4>
        <div class="bag-topic-grid">
          ${topics.map((t) => `
            <button class="bag-topic-pick" data-topic="${encodeURIComponent(t.topic_name)}" data-type="${this.escape(t.message_type)}">
              <strong>${this.escape(t.topic_name)}</strong>
              <small>${this.escape(t.message_type)} · ${t.message_count || 0}</small>
            </button>
          `).join('')}
        </div>
        <div class="bag-topic-panel">
          <div class="bag-topic-panel-header">
            <span id="bag-topic-title">Выберите топик</span>
            <span id="bag-topic-type"></span>
            <button id="bag-topic-prev-btn" type="button" disabled>←</button>
            <span id="bag-topic-page-label">0/0</span>
            <button id="bag-topic-next-btn" type="button" disabled>→</button>
          </div>
          <table class="bag-topic-table" id="bag-topic-table">
            <thead><tr><th>#</th><th>Время (ns)</th><th>Значение</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
          <div class="bag-topic-chart-wrap">
            <div class="bag-chart-controls">
              <label>Поле: <select id="bag-chart-field"></select></label>
              <button id="bag-chart-add-overlay" type="button" title="Добавить текущий топик/поле на общий график">+ overlay</button>
              <button id="bag-chart-reset-zoom" type="button" title="Сбросить масштаб">⟲ zoom</button>
              <button id="bag-chart-clear" type="button" title="Убрать все наложения">Очистить</button>
              <span class="bag-chart-hint">колесо — zoom, перетаскивание — pan</span>
            </div>
            <div id="bag-chart-legend" class="bag-chart-legend"></div>
            <canvas id="bag-topic-chart" height="200"></canvas>
          </div>
        </div>
      `;
      this.bindDetailEvents();
      this.renderTimeline(bag.id);
    } catch (err) {
      body.textContent = err.message;
    }
  }

  bindDetailEvents() {
    const body = this.modal.querySelector('#bag-viewer-body');
    const bag = this.currentBag;
    body.querySelector('#bag-edit-save-btn').addEventListener('click', async () => {
      await window.bagManager.request(`/api/bags/${bag.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: body.querySelector('#bag-edit-name').value.trim(),
          description: body.querySelector('#bag-edit-description').value.trim(),
          tags: body.querySelector('#bag-edit-tags').value.trim(),
        }),
      });
      await window.bagManager.refreshCatalog({ keepPage: true });
    });
    body.querySelector('#bag-download-btn').addEventListener('click', () => {
      window.location.href = `/api/bags/${bag.id}/download`;
    });
    body.querySelector('#bag-play-btn').addEventListener('click', async () => {
      // Close the viewer modal first — otherwise it stays on top of the
      // playback view and blocks interaction (looks like a stuck overlay).
      this.close();
      if (window.bagPlayer) await window.bagPlayer.play(bag.id);
    });
    body.querySelector('#bag-delete-btn').addEventListener('click', async () => {
      if (!window.confirm('Удалить запись и файлы?')) return;
      await window.bagManager.request(`/api/bags/${bag.id}`, { method: 'DELETE' });
      this.close();
      if (window.bagManager) await window.bagManager.refreshCatalog({ keepPage: false });
    });
    body.querySelectorAll('.bag-topic-pick').forEach((el) => {
      el.addEventListener('click', () => {
        const topic = decodeURIComponent(el.dataset.topic);
        const type = el.dataset.type || '';
        this.currentTopic = topic;
        this.currentPage = 0;
        this.availableFields = [];
        this.selectedField = '';
        this.modal.querySelector('#bag-topic-type').textContent = type;
        this.loadTopicPage();
      });
    });
    body.querySelector('#bag-topic-prev-btn').addEventListener('click', () => {
      if (this.currentPage > 0) {
        this.currentPage -= 1;
        this.loadTopicPage();
      }
    });
    body.querySelector('#bag-topic-next-btn').addEventListener('click', () => {
      this.currentPage += 1;
      this.loadTopicPage();
    });
    body.querySelector('#bag-chart-field').addEventListener('change', (e) => {
      this.selectedField = e.target.value || '';
      this.reloadPrimarySeries();
    });
    body.querySelector('#bag-chart-add-overlay').addEventListener('click', () => this.addOverlay());
    body.querySelector('#bag-chart-reset-zoom').addEventListener('click', () => {
      if (this.chart && this.chart.resetZoom) this.chart.resetZoom();
    });
    body.querySelector('#bag-chart-clear').addEventListener('click', () => this.clearOverlays());
  }

  async renderTimeline(bagId) {
    const host = this.modal.querySelector('#bag-timeline-host');
    if (!host || !window.bagTimeline) return;
    try {
      await window.bagTimeline.render(host, bagId);
    } catch (e) {
      host.textContent = `Timeline: ${e.message}`;
    }
  }

  async loadTopicPage() {
    if (!this.currentBag || !this.currentTopic) return;
    const title = this.modal.querySelector('#bag-topic-title');
    title.textContent = this.currentTopic;
    const encoded = encodeURIComponent(this.currentTopic);
    const offset = this.currentPage * this.pageSize;
    const data = await window.bagManager.request(
      `/api/bags/${this.currentBag.id}/topics/${encoded}/messages?offset=${offset}&limit=${this.pageSize}`
    );
    const tbody = this.modal.querySelector('#bag-topic-table tbody');
    const rows = (data.items || []).map((it) => `
      <tr>
        <td>${it.index}</td>
        <td>${it.timestamp ?? ''}</td>
        <td><pre class="bag-value-cell">${this.escape(this.formatValue(it.value))}</pre></td>
        <td><button class="bag-copy-btn" data-val="${this.escape(this.formatValue(it.value))}">Копировать</button></td>
      </tr>
    `).join('');
    tbody.innerHTML = rows || '<tr><td colspan="4">Нет данных</td></tr>';
    tbody.querySelectorAll('.bag-copy-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const value = b.dataset.val || '';
        if (navigator.clipboard) navigator.clipboard.writeText(value).catch(() => {});
      });
    });
    const total = Number(data.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
    const label = this.modal.querySelector('#bag-topic-page-label');
    label.textContent = `${this.currentPage + 1}/${totalPages} (всего ${total})`;
    this.modal.querySelector('#bag-topic-prev-btn').disabled = this.currentPage <= 0;
    this.modal.querySelector('#bag-topic-next-btn').disabled = (this.currentPage + 1) >= totalPages;
    await this.reloadPrimarySeries();
  }

  async fetchSeries(topic, field) {
    const encoded = encodeURIComponent(topic);
    const qs = new URLSearchParams();
    qs.set('downsample', '2000');
    if (field) qs.set('field', field);
    return window.bagManager.request(
      `/api/bags/${this.currentBag.id}/topics/${encoded}/chart?${qs.toString()}`
    );
  }

  async reloadPrimarySeries() {
    if (!this.currentBag || !this.currentTopic) return;
    const chartData = await this.fetchSeries(this.currentTopic, this.selectedField);
    if (Array.isArray(chartData.available_fields) && chartData.available_fields.length && !this.availableFields.length) {
      this.availableFields = chartData.available_fields;
      const select = this.modal.querySelector('#bag-chart-field');
      select.innerHTML = this.availableFields.map((f) => `<option value="${this.escape(f)}">${this.escape(f)}</option>`).join('');
      const effective = chartData.field || this.availableFields[0];
      this.selectedField = effective;
      select.value = effective;
    }
    const primaryLabel = this.formatSeriesLabel(this.currentTopic, this.selectedField);
    this.renderChartAll({ label: primaryLabel, points: chartData.points || [] });
  }

  async addOverlay() {
    if (!this.currentBag || !this.currentTopic || !this.selectedField) return;
    const key = `${this.currentTopic}::${this.selectedField}`;
    if (this.overlays.some((o) => o.key === key)) return;
    const data = await this.fetchSeries(this.currentTopic, this.selectedField);
    this.overlays.push({
      key,
      label: this.formatSeriesLabel(this.currentTopic, this.selectedField),
      points: data.points || [],
    });
    const primary = await this.fetchSeries(this.currentTopic, this.selectedField);
    this.renderChartAll({
      label: this.formatSeriesLabel(this.currentTopic, this.selectedField),
      points: primary.points || [],
    });
  }

  clearOverlays() {
    this.overlays = [];
    this.reloadPrimarySeries();
  }

  formatSeriesLabel(topic, field) {
    const t = (topic || '').split('/').filter(Boolean).pop() || topic;
    return field ? `${t}.${field}` : t;
  }

  renderChartAll(primary) {
    const canvas = this.modal.querySelector('#bag-topic-chart');
    if (!canvas) return;
    const datasets = [];
    const startNs = this.earliestTs([primary, ...this.overlays]);
    const pushSeries = (series, colorIdx) => {
      const color = this.overlayColors[colorIdx % this.overlayColors.length];
      datasets.push({
        label: series.label,
        data: (series.points || []).map((p) => ({ x: (Number(p.t) - startNs) / 1e9, y: Number(p.v) })),
        borderColor: color,
        backgroundColor: color + '33',
        pointRadius: 0,
        borderWidth: 1.4,
        parsing: false,
        tension: 0,
      });
    };
    pushSeries(primary, 0);
    this.overlays.forEach((o, i) => pushSeries(o, i + 1));
    const legend = this.modal.querySelector('#bag-chart-legend');
    if (legend) {
      legend.innerHTML = datasets.map((d, i) => {
        const removeBtn = i > 0 ? `<button class="bag-legend-remove" data-idx="${i - 1}" title="Убрать">×</button>` : '';
        return `<span class="bag-legend-item"><span class="bag-legend-swatch" style="background:${d.borderColor}"></span>${this.escape(d.label)}${removeBtn}</span>`;
      }).join('');
      legend.querySelectorAll('.bag-legend-remove').forEach((b) => {
        b.addEventListener('click', () => {
          const idx = Number(b.dataset.idx);
          this.overlays.splice(idx, 1);
          this.reloadPrimarySeries();
        });
      });
    }
    if (typeof window.Chart !== 'function') {
      this.drawFallback(canvas, datasets);
      return;
    }
    if (this.chart) {
      this.chart.data.datasets = datasets;
      this.chart.update('none');
      return;
    }
    const zoomConfig = {
      pan: { enabled: true, mode: 'x' },
      zoom: {
        wheel: { enabled: true },
        pinch: { enabled: true },
        drag: { enabled: false },
        mode: 'x',
      },
    };
    this.chart = new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 't, s (от начала записи)', color: '#aaa' },
            ticks: { color: '#bbb' },
            grid: { color: 'rgba(255,255,255,0.07)' },
          },
          y: {
            ticks: { color: '#bbb' },
            grid: { color: 'rgba(255,255,255,0.07)' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
          zoom: zoomConfig,
        },
      },
    });
  }

  earliestTs(seriesList) {
    let min = Infinity;
    for (const s of seriesList) {
      for (const p of (s?.points || [])) {
        const t = Number(p.t);
        if (t < min) min = t;
      }
    }
    return Number.isFinite(min) ? min : 0;
  }

  drawFallback(canvas, datasets) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!datasets.length) return;
    const allPts = datasets.flatMap((d) => d.data);
    if (!allPts.length) return;
    const minX = Math.min(...allPts.map((p) => p.x));
    const maxX = Math.max(...allPts.map((p) => p.x));
    const minY = Math.min(...allPts.map((p) => p.y));
    const maxY = Math.max(...allPts.map((p) => p.y));
    const w = canvas.width; const h = canvas.height;
    datasets.forEach((d) => {
      ctx.strokeStyle = d.borderColor;
      ctx.beginPath();
      d.data.forEach((p, i) => {
        const x = ((p.x - minX) / Math.max(1e-6, maxX - minX)) * w;
        const y = h - ((p.y - minY) / Math.max(1e-6, maxY - minY)) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  formatValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }

  escape(text) {
    const s = text == null ? '' : String(text);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  close() {
    if (this.modal) this.modal.classList.remove('show');
  }
}

window.bagViewer = new BagViewer();
