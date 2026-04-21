class BagPlayer {
  constructor() {
    this.currentBagId = null;
    this.currentBag = null;
    this.pollTimer = null;
    this._videoSwitched = false;
  }

  async play(bagId) {
    const panel = this.ensurePanel();
    const rate = Number(panel.querySelector('#bag-play-rate').value || 1.0);
    const loop = Boolean(panel.querySelector('#bag-play-loop').checked);
    let bag = null;
    try {
      bag = await window.bagManager.request(`/api/bags/${bagId}`);
    } catch (e) {
      alert(e.message);
      return;
    }
    await window.bagManager.request(`/api/bags/${bagId}/play`, {
      method: 'POST',
      body: JSON.stringify({ rate, loop }),
    });
    this.currentBagId = bagId;
    this.currentBag = bag;
    this.setPlaybackActive(true);
    this.maybeSwitchVideoSource(bag, true);
    this.startPolling();
  }

  async pauseToggle() {
    if (!this.currentBagId) return;
    await window.bagManager.request('/api/bags/play/pause', {
      method: 'POST',
      body: JSON.stringify({ action: 'toggle' }),
    });
    await this.refreshStatus();
  }

  async stop() {
    try {
      await window.bagManager.request('/api/bags/play/stop', { method: 'POST', body: '{}' });
    } catch (_) { /* noop */ }
    this.setPlaybackActive(false);
    this.maybeSwitchVideoSource(this.currentBag, false);
    this.stopPolling();
    if (window.bagTimeline) window.bagTimeline.setPlaybackFraction(0, this.currentBagId);
    this.currentBagId = null;
    this.currentBag = null;
  }

  setPlaybackActive(active) {
    window.playbackActive = active;
    let badge = document.getElementById('bag-playback-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'bag-playback-badge';
      badge.textContent = 'PLAYBACK';
      document.body.appendChild(badge);
    }
    badge.style.display = active ? 'flex' : 'none';
    document.body.classList.toggle('bag-playback-on', active);
    const panel = this.ensurePanel();
    panel.querySelector('#bag-play-state').textContent = active
      ? 'PLAYBACK ACTIVE — виджеты телеметрии (COG, SOG) получают данные из bag'
      : 'PLAYBACK STOPPED';
  }

  maybeSwitchVideoSource(bag, enable) {
    if (!bag) return;
    const topics = bag.topics || [];
    const imgTopic = topics.find((t) => t.message_type === 'sensor_msgs/msg/CompressedImage'
      || t.message_type === 'sensor_msgs/CompressedImage');
    if (!imgTopic) return;
    if (enable) {
      if (!window.__rosImageReader) {
        try {
          window.__rosImageReader = new window.RosImageReader('video', imgTopic.topic_name);
        } catch (e) {
          console.warn('RosImageReader init failed', e);
          return;
        }
      } else if (typeof window.__rosImageReader.setTopic === 'function') {
        window.__rosImageReader.setTopic(imgTopic.topic_name);
      }
      try {
        window.__rosImageReader.start();
        this._videoSwitched = true;
      } catch (e) { /* noop */ }
      return;
    }
    if (this._videoSwitched && window.__rosImageReader) {
      try { window.__rosImageReader.stop(); } catch (_) { /* noop */ }
      this._videoSwitched = false;
    }
  }

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.refreshStatus().catch(() => {}), 500);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async refreshStatus() {
    const st = await window.bagManager.request('/api/bags/play/status');
    const panel = this.ensurePanel();
    const bar = panel.querySelector('#bag-play-progress');
    const label = panel.querySelector('#bag-play-progress-label');
    const frameEl = panel.querySelector('#bag-play-frame');
    const pauseBtn = panel.querySelector('#bag-play-pause-btn');
    if (!st.playing) {
      this.setPlaybackActive(false);
      this.maybeSwitchVideoSource(this.currentBag, false);
      this.stopPolling();
      if (window.bagTimeline) window.bagTimeline.setPlaybackFraction(0, this.currentBagId);
      this.currentBagId = null;
      this.currentBag = null;
      if (bar) bar.style.width = '0%';
      if (label) label.textContent = '0.0 / 0.0s';
      if (frameEl) frameEl.textContent = '';
      return;
    }
    this.setPlaybackActive(true);
    const elapsed = Number(st.elapsed_sec || 0);
    const duration = Number(st.duration_sec || 0);
    const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
    if (bar) bar.style.width = `${pct.toFixed(1)}%`;
    if (label) label.textContent = `${elapsed.toFixed(1)} / ${duration.toFixed(1)}s${st.paused ? ' (paused)' : ''}`;
    if (pauseBtn) pauseBtn.textContent = st.paused ? 'Resume' : 'Pause';
    if (window.bagTimeline && duration > 0) {
      window.bagTimeline.setPlaybackFraction(elapsed / duration, this.currentBagId);
    }
    if (frameEl) {
      const reader = window.__rosImageReader;
      if (reader && reader.lastFrameFormatted) {
        frameEl.textContent = `frame: ${reader.lastFrameFormatted}`;
      } else {
        frameEl.textContent = '';
      }
    }
  }

  ensurePanel() {
    const panel = document.getElementById('bag-playback-panel');
    if (!panel.dataset.initialized) {
      panel.innerHTML = `
        <div class="bag-playback-header">Playback</div>
        <div class="bag-playback-controls">
          <select id="bag-play-rate">
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="1" selected>1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>
          <label><input id="bag-play-loop" type="checkbox"> loop</label>
          <button id="bag-play-pause-btn" type="button">Pause</button>
          <button id="bag-play-stop-btn" type="button">Stop</button>
        </div>
        <div class="bag-play-progress-wrap">
          <div class="bag-play-progress-track"><div id="bag-play-progress" class="bag-play-progress-bar"></div></div>
          <div id="bag-play-progress-label">0.0 / 0.0s</div>
        </div>
        <div id="bag-play-frame" class="bag-play-frame"></div>
        <div id="bag-play-state">PLAYBACK STOPPED</div>
      `;
      panel.querySelector('#bag-play-stop-btn').addEventListener('click', () => this.stop());
      panel.querySelector('#bag-play-pause-btn').addEventListener('click', () => this.pauseToggle());
      panel.dataset.initialized = '1';
    }
    return panel;
  }
}

window.bagPlayer = new BagPlayer();
window.playbackActive = false;
