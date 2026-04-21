class BagCatalog {
  constructor() {
    this.container = null;
    this.sortColumn = 'start_time';
    this.sortOrder = 'desc';
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
    const sorted = [...items].sort((a, b) => this.compare(a, b));
    const rows = sorted.map((bag) => {
      const statusCls = bag.status === 'recovered' ? 'warn' : '';
      const warning = bag.status === 'recovered'
        ? '<span class="bag-warning" title="Запись была прервана аварийно. Данные частично восстановлены.">⚠</span>'
        : '';
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
            <button data-action="play">Play</button>
            <button data-action="download">ZIP</button>
            <button data-action="delete">Delete</button>
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

  compare(a, b) {
    const key = this.sortColumn;
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), 'ru');
    return this.sortOrder === 'asc' ? cmp : -cmp;
  }
}

window.bagCatalog = new BagCatalog();
