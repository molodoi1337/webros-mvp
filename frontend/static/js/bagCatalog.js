class BagCatalog {
  constructor() {
    this.container = null;
  }

  getContainer() {
    if (!this.container) {
      this.container = document.getElementById('bag-catalog');
    }
    return this.container;
  }

  render(items) {
    const root = this.getContainer();
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '<div class="bag-empty">Записей пока нет</div>';
      return;
    }
    const rows = items.map((bag) => {
      const isRecording = bag.status === 'recording';
      const statusCls = isRecording ? 'recording' : (bag.status === 'recovered' ? 'warn' : '');
      const warning = bag.status === 'recovered'
        ? '<span class="bag-warning" title="Запись была прервана аварийно. Данные частично восстановлены.">⚠</span>'
        : '';
      const actions = isRecording
        ? '<button data-action="stop" class="bag-stop-btn">■ Остановить запись</button>'
        : '<button data-action="play">Play</button><button data-action="download">ZIP</button><button data-action="delete">Delete</button>';
      return `
        <article class="bag-item ${statusCls}" data-id="${bag.id}">
          <div class="bag-item-main">
            <strong>${bag.name} ${warning}</strong>
            <span>${bag.status}</span>
          </div>
          <div class="bag-item-meta">
            <span>Размер: ${this.formatSize(bag.size_bytes)}</span>
            <span>Сообщения: ${bag.message_count || 0}</span>
            <span>Старт: ${this.formatDate(bag.start_time || '-')}</span>
          </div>
          <div class="bag-item-meta">
            <span>Длительность: ${this.formatDurationNs(bag.duration_ns)}</span>
            <span>Теги: ${bag.tags || '-'}</span>
          </div>
          <div class="bag-item-actions">
            ${actions}
          </div>
        </article>
      `;
    }).join('');
    root.innerHTML = rows;
    root.querySelectorAll('.bag-item-actions button').forEach((btn) => {
      btn.addEventListener('click', (e) => this.handleAction(e));
    });
    root.querySelectorAll('.bag-item').forEach((itemEl) => {
      itemEl.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id = Number(itemEl.dataset.id);
        if (window.bagViewer) window.bagViewer.open(id);
      });
    });
  }

  async handleAction(e) {
    const btn = e.currentTarget;
    const card = btn.closest('.bag-item');
    const id = Number(card?.dataset.id);
    const action = btn.dataset.action;
    if (!id || !action || !window.bagManager) return;
    if (action === 'play' && window.bagPlayer) {
      await window.bagPlayer.play(id);
      return;
    }
    if (action === 'download') {
      window.location.href = `/api/bags/${id}/download`;
      return;
    }
    if (action === 'delete') {
      if (!window.confirm('Удалить запись и файлы?')) return;
      await window.bagManager.request(`/api/bags/${id}`, { method: 'DELETE' });
      await window.bagManager.refreshCatalog();
      return;
    }
    if (action === 'stop') {
      await window.bagManager.stopRecordingFromPanel();
    }
  }

  formatSize(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  formatDurationNs(durationNs) {
    const totalSec = Math.max(0, Math.floor(Number(durationNs || 0) / 1e9));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  formatDate(input) {
    if (!input || input === '-') return '-';
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return input;
    return d.toLocaleString();
  }

}

window.bagCatalog = new BagCatalog();
