let stream_url = buildMediaMTXStreamUrl();
const video = document.getElementById('video');
const message = document.getElementById('message');
let defaultControls = false;
let mediaMtxReader = null;
let activeVideoSource = 'mediamtx';

function buildMediaMTXStreamUrl(ip, port, path) {
  const effectiveIp   = ip   || localStorage.getItem('mediamtx-ip')   || window.location.hostname;
  const effectivePort = port || localStorage.getItem('mediamtx-port') || '8889';
  const effectivePath = path || localStorage.getItem('mediamtx-path') || '/cam1/';
  return 'http://' + effectiveIp + ':' + effectivePort + effectivePath;
}

function updateMediaMTXStreamUrl(ip, port, path) {
  stream_url = buildMediaMTXStreamUrl(ip, port, path);
}

const setMessage = (str) => {
  if (str !== '') {
    video.controls = false;
  } else {
    video.controls = defaultControls;
  }
  message.innerText = str;
};

const parseBoolString = (str, defaultVal) => {
  str = (str || '');

  if (['1', 'yes', 'true'].includes(str.toLowerCase())) {
    return true;
  }
  if (['0', 'no', 'false'].includes(str.toLowerCase())) {
    return false;
  }
  return defaultVal;
};

const loadAttributesFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  video.controls = parseBoolString(params.get('controls'), true);
  video.muted = parseBoolString(params.get('muted'), true);
  video.autoplay = parseBoolString(params.get('autoplay'), true);
  video.playsInline = parseBoolString(params.get('playsinline'), true);
  defaultControls = video.controls;
};

function startMediaMTX() {
  stopMediaMTX();
  mediaMtxReader = new MediaMTXWebRTCReader({
    url: new URL('whep', stream_url) + window.location.search,
    onError: (err) => {
      setMessage(err);
    },
    onTrack: (evt) => {
      setMessage('');
      video.srcObject = evt.streams[0];
    },
  });
  video.style.display = '';
}

function stopMediaMTX() {
  if (mediaMtxReader) {
    mediaMtxReader.close();
    mediaMtxReader = null;
  }
  video.srcObject = null;
  setMessage('');
}

function switchVideoSource(source, rosTopic) {
  if (source === activeVideoSource) return;

  if (activeVideoSource === 'mediamtx') {
    stopMediaMTX();
  } else if (activeVideoSource === 'ros' && rosImageReader) {
    rosImageReader.stop();
  }

  activeVideoSource = source;

  if (source === 'mediamtx') {
    startMediaMTX();
  } else if (source === 'ros') {
    if (!rosImageReader) {
      rosImageReader = new RosImageReader('video', rosTopic || '/camera/image_raw/compressed');
    } else if (rosTopic) {
      rosImageReader.setTopic(rosTopic);
    }
    rosImageReader.start();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadAttributesFromQuery();
  startMediaMTX();
});
