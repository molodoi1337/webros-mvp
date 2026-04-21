class BagTimeline {
  constructor() {
    this.host = null;
    this.bagId = null;
    this.data = null;
    this.cursorIdx = 0;
    this.playbackFraction = 0;
  }

  async render(host, bagId) {
    this.host = host;
    this.bagId = bagId;
    host.innerHTML = '<div class="bag-timeline-loading">Загрузка шкалы…</div>';
    const data = await window.bagManager.request(`/api/bags/${bagId}/timeline?bins=160`);
    this.data = data;
    this.cursorIdx = 0;
    this.playbackFraction = 0;
    this.draw();
  }

  draw() {
    if (!this.host || !this.data) return;
    const { topics = [], bin_count: bins = 0, start_ns = 0, end_ns = 0 } = this.data;
    if (!topics.length || bins <= 0 || end_ns <= start_ns) {
      this.host.innerHTML = '<div class="bag-timeline-empty">Нет временных данных</div>';
      return;
    }
    const maxPerBin = Math.max(1, ...topics.map((t) => Math.max(0, ...t.bins)));
    const rowsHtml = topics.map((t) => {
      const cells = t.bins.map((n) => {
        const intensity = n / maxPerBin;
        return `<span class="bag-timeline-cell" style="opacity:${Math.max(0.06, intensity.toFixed(3))}"></span>`;
      }).join('');
      return `
        <div class="bag-timeline-row">
          <div class="bag-timeline-topic" title="${this.escape(t.topic)} (${t.message_count})">${this.escape(t.topic)}</div>
          <div class="bag-timeline-bars" data-topic="${this.escape(t.topic)}">${cells}</div>
        </div>
      `;
    }).join('');
    this.host.innerHTML = `
      <div class="bag-timeline">
        <div class="bag-timeline-stack">
          ${rowsHtml}
          <div class="bag-timeline-playhead" id="bag-timeline-playhead"></div>
        </div>
        <div class="bag-timeline-scrubber">
          <input type="range" id="bag-timeline-range" min="0" max="${bins - 1}" value="0">
          <span id="bag-timeline-readout">0 / ${this.formatDurationNs(end_ns - start_ns)}</span>
        </div>
        <div id="bag-timeline-values" class="bag-timeline-values"></div>
      </div>
    `;
    const range = this.host.querySelector('#bag-timeline-range');
    const readout = this.host.querySelector('#bag-timeline-readout');
    const values = this.host.querySelector('#bag-timeline-values');
    range.addEventListener('input', () => {
      this.cursorIdx = Number(range.value);
      const totalNs = end_ns - start_ns;
      const cursorNs = Math.round((this.cursorIdx / Math.max(1, bins - 1)) * totalNs);
      readout.textContent = `${this.formatDurationNs(cursorNs)} / ${this.formatDurationNs(totalNs)}`;
      values.innerHTML = this.renderValuesAtCursor();
    });
    values.innerHTML = this.renderValuesAtCursor();
    this.updatePlayheadEl();
  }

  setPlaybackFraction(fraction, bagId) {
    if (bagId != null && this.bagId != null && Number(bagId) !== Number(this.bagId)) return;
    this.playbackFraction = Math.max(0, Math.min(1, Number(fraction) || 0));
    this.updatePlayheadEl();
  }

  updatePlayheadEl() {
    if (!this.host) return;
    const ph = this.host.querySelector('#bag-timeline-playhead');
    const stack = this.host.querySelector('.bag-timeline-stack');
    const firstBars = this.host.querySelector('.bag-timeline-bars');
    if (!ph || !stack || !firstBars) return;
    const stackRect = stack.getBoundingClientRect();
    const barsRect = firstBars.getBoundingClientRect();
    if (stackRect.width <= 0 || barsRect.width <= 0) return;
    const offsetX = (barsRect.left - stackRect.left) + barsRect.width * this.playbackFraction;
    ph.style.left = `${offsetX.toFixed(2)}px`;
    ph.style.display = this.playbackFraction > 0 ? 'block' : 'none';
  }

  renderValuesAtCursor() {
    if (!this.data) return '';
    const topics = this.data.topics || [];
    const rows = topics
      .map((t) => {
        const n = t.bins[this.cursorIdx] || 0;
        if (!n) return null;
        return `<div><b>${this.escape(t.topic)}</b>: ${n} сообщений в бине</div>`;
      })
      .filter(Boolean);
    return rows.join('') || '<div>—</div>';
  }

  formatDurationNs(ns) {
    const totalMs = Math.max(0, Math.round(Number(ns || 0) / 1e6));
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return `${hh}:${mm}:${ss}.${String(ms).padStart(3, '0')}`;
  }

  escape(text) {
    const s = text == null ? '' : String(text);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.bagTimeline = new BagTimeline();
