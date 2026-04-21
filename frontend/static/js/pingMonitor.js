'use strict';

const PingMonitor = (() => {
  const POLL_MS = 333;
  let timerId = null;
  let currentHost = null;

  const dot  = () => document.getElementById('ping-dot');
  const text = () => document.getElementById('ping-text');
  const root = () => document.getElementById('ping-indicator');

  function resolveHost() {
    const saved = localStorage.getItem('ping-host');
    if (saved && saved.trim()) return saved.trim();
    const input = document.getElementById('rosbridge-host');
    if (input && input.value) return input.value;
    if (typeof ROSBRIDGE_HOST !== 'undefined' && ROSBRIDGE_HOST !== '') return ROSBRIDGE_HOST;
    return window.location.hostname;
  }

  function render(data) {
    const d = dot();
    const t = text();
    if (!d || !t) return;

    d.className = 'ping-dot ' + (data.status || 'idle');

    if (data.status === 'online' && data.latency != null) {
      t.textContent = data.latency + ' ms';
    } else if (data.status === 'offline') {
      t.textContent = '--';
    } else {
      t.textContent = '...';
    }

    window.pingOffline = (data.status === 'offline');
    if (typeof updatePingVignette === 'function') updatePingVignette();
  }

  function poll() {
    fetch('/api/ping')
      .then(r => r.json())
      .then(render)
      .catch(() => render({ status: 'idle' }));
  }

  function start(host) {
    host = host || resolveHost();
    if (!host) return;

    if (host === currentHost && timerId) return;
    currentHost = host;

    fetch('/api/ping/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host }),
    }).catch(() => {});

    const indicator = root();
    if (indicator) indicator.classList.add('show');

    if (!timerId) {
      poll();
      timerId = setInterval(poll, POLL_MS);
    }
  }

  function stop() {
    currentHost = null;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    const indicator = root();
    if (indicator) indicator.classList.remove('show');
    fetch('/api/ping/stop', { method: 'POST' }).catch(() => {});
    render({ status: 'idle' });
  }

  function _onHostChange() {
    const host = resolveHost();
    if (host && host !== currentHost) {
      start(host);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    start();

    const hostSelect = document.getElementById('rosbridge-host-select');
    const hostCustom = document.getElementById('rosbridge-host-custom');
    const hostHidden = document.getElementById('rosbridge-host');

    if (hostSelect) hostSelect.addEventListener('change', _onHostChange);
    if (hostCustom) hostCustom.addEventListener('input', _onHostChange);
    if (hostHidden) {
      new MutationObserver(_onHostChange)
        .observe(hostHidden, { attributes: true, attributeFilter: ['value'] });
    }
  });

  return { start, stop };
})();

window.PingMonitor = PingMonitor;
