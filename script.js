/* ── Konstanta ── */
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

const COBALT_INSTANCES = [
  'https://cobalt.canine.tools',
  'https://cobalt.drgns.space',
  'https://cob.froth.zone',
  'https://cobalt.lunar.icu',
  'https://cobalt.api.benny.fun',
];

const DEFAULT = { speed: 2.5, gainDb: -6, maxDur: 400 };
const LIMITS  = { speed: { min: 0.5, max: 4 }, gainDb: { min: -20, max: 6 }, maxDur: { min: 60, max: 1200 } };

/* ── State ── */
let sourceMode       = null;
let audioFile        = null;
let ytAudioUrl       = null;
let ytVideoTitle     = '';
let settingsMode     = 'default';
let previewAudioCtx  = null;
let previewSource    = null;
let previewBuffer    = null;
let isPreviewPlaying = false;
let previewStartTime = 0;
let previewOffset    = 0;
let previewAnimId    = null;
let ffmpegReady      = false;
let ffmpegObj        = null;

/* ── DOM ── */
const audioInput       = document.getElementById('audioInput');
const dropArea         = document.getElementById('dropArea');
const fileInfo         = document.getElementById('fileInfo');
const ytUrlInput       = document.getElementById('ytUrl');
const ytLoadBtn        = document.getElementById('ytLoadBtn');
const ytPreview        = document.getElementById('ytPreview');
const ytStatus         = document.getElementById('ytStatus');
const instanceInfo     = document.getElementById('instanceInfo');
const instanceInfoText = document.getElementById('instanceInfoText');
const btnDefault       = document.getElementById('btnDefault');
const btnCustom        = document.getElementById('btnCustom');
const defaultSettings  = document.getElementById('defaultSettings');
const customSettings   = document.getElementById('customSettings');
const defaultSpeedNote = document.getElementById('defaultSpeedNote');
const slSpeed          = document.getElementById('slSpeed');
const slGain           = document.getElementById('slGain');
const slDur            = document.getElementById('slDur');
const numSpeed         = document.getElementById('numSpeed');
const numGain          = document.getElementById('numGain');
const numDur           = document.getElementById('numDur');
const convertBtn       = document.getElementById('convertBtn');
const progressWrap     = document.getElementById('progressWrap');
const progressFill     = document.getElementById('progressFill');
const progressLabel    = document.getElementById('progressLabel');
const downloadSection  = document.getElementById('downloadSection');
const dlOgg            = document.getElementById('dlOgg');
const dlMp3            = document.getElementById('dlMp3');
const dlNote           = document.getElementById('dlNote');
const dlSize           = document.getElementById('dlSize');
const globalStatus     = document.getElementById('globalStatus');
const ffmpegStatus     = document.getElementById('ffmpegStatus');
const ffmpegStatusText = document.getElementById('ffmpegStatusText');

/* ── Helpers ── */
function setProgress(pct, label) {
  progressFill.style.width = Math.min(100, pct) + '%';
  progressLabel.textContent = label;
}
function showStatus(msg, isError) {
  globalStatus.textContent = msg;
  globalStatus.style.color = isError ? '#b91c1c' : '#6b7280';
}
function clearStatus() { globalStatus.textContent = ''; }
function readyToConvert() { convertBtn.disabled = (sourceMode === null); }
function formatBytes(b) {
  return b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / 1024 / 1024).toFixed(2) + ' MB';
}
function clamp(v, mn, mx) { return Math.min(mx, Math.max(mn, v)); }
function fmtTime(s) {
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}
function sanitizeName(str) {
  return str.replace(/[^a-zA-Z0-9\-_\u00C0-\u024F\u0400-\u04FF]/g, '_').slice(0, 60);
}
function round6(v) { return Math.round(v * 1e6) / 1e6; }

function buildAudioFilter(speed, gainDb) {
  const targetRate = round6(44100 * speed);
  return `asetrate=${targetRate},aresample=44100,volume=${gainDb}dB`;
}

/* ── Hitung speed normal Roblox (1/speed, dibulatkan 2 desimal) ── */
function calcRobloxSpeed(speed) {
  return Math.round((1 / speed) * 100) / 100;
}

/* ── Settings toggle ── */

// Preset data
var PRESETS = [
  { speed: 2.1, gainDb: -2,  maxDur: 400, label: 'Lambat' },
  { speed: 2.3, gainDb: -4,  maxDur: 400, label: 'Default lama' },
  { speed: 2.5, gainDb: -6,  maxDur: 400, label: 'Cepat' },
  { speed: 2.7, gainDb: -8,  maxDur: 400, label: 'Lebih Cepat' },
  { speed: 2.9, gainDb: -10, maxDur: 400, label: 'Ultra' },
];
var activePreset = PRESETS[2]; // default: Cepat 2.5x

function applyPresetToCards(p) {
  var cs = document.getElementById('defCardSpeed');
  var cg = document.getElementById('defCardGain');
  var cd = document.getElementById('defCardDur');
  if (cs) cs.textContent = p.speed + '×';
  if (cg) cg.textContent = (p.gainDb > 0 ? '+' : '') + p.gainDb + ' dB';
  if (cd) cd.textContent = p.maxDur + ' s';
  // also update default speed note
  var note = document.getElementById('defaultSpeedNote');
  if (note) {
    var lo = Math.round((1 / p.speed) * 100) / 100;
    var hi = Math.round((1 / (p.speed - 0.02)) * 100) / 100;
    note.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Speed Normal (di game): <strong>' + lo + ' - ' + hi + '</strong>';
  }
}

btnDefault.addEventListener('click', function () {
  settingsMode = 'default';
  btnDefault.classList.add('active'); btnCustom.classList.remove('active');
  defaultSettings.classList.remove('hidden'); customSettings.classList.add('hidden');
  defaultSpeedNote.classList.remove('hidden');
});
btnCustom.addEventListener('click', function () {
  settingsMode = 'custom';
  btnCustom.classList.add('active'); btnDefault.classList.remove('active');
  customSettings.classList.remove('hidden'); defaultSettings.classList.add('hidden');
  defaultSpeedNote.classList.add('hidden');
  // restore active preset values to sliders/inputs
  applyPresetToInputs(activePreset);
});

function applyPresetToInputs(p) {
  slSpeed.value = p.speed; if (numSpeed) numSpeed.value = p.speed.toFixed(1);
  slGain.value  = p.gainDb; if (numGain) numGain.value = p.gainDb;
  slDur.value   = p.maxDur; if (numDur) numDur.value = p.maxDur;
  document.querySelectorAll('.preset-pill').forEach(function (b) {
    b.classList.toggle('active', parseFloat(b.dataset.presetSpeed) === p.speed);
  });
}

/* ── Preset pills ── */
document.querySelectorAll('[data-preset-speed]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var spd  = parseFloat(btn.dataset.presetSpeed);
    var gain = parseInt(btn.dataset.presetGain || '-6');
    var dur  = parseInt(btn.dataset.presetDur  || '400');
    // find matching preset
    activePreset = PRESETS.find(function(p){ return p.speed === spd; }) || { speed: spd, gainDb: gain, maxDur: dur };
    // update sliders + inputs
    slSpeed.value = spd; if (numSpeed) numSpeed.value = spd.toFixed(1);
    slGain.value  = gain; if (numGain) numGain.value = gain;
    slDur.value   = dur;  if (numDur) numDur.value = dur;
    // update pill highlight
    document.querySelectorAll('.preset-pill').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    // if in default mode, update cards too
    applyPresetToCards(activePreset);
  });
});

/* ── Sync slider ↔ number ── */
slSpeed.addEventListener('input', function () {
  if (numSpeed) numSpeed.value = parseFloat(slSpeed.value).toFixed(1);
  var v = parseFloat(slSpeed.value).toFixed(1);
  document.querySelectorAll('.preset-pill').forEach(function (b) {
    b.classList.toggle('active', parseFloat(b.dataset.presetSpeed).toFixed(1) === v);
  });
});
if (numSpeed) {
  numSpeed.addEventListener('input', function () { var v = parseFloat(numSpeed.value); if (!isNaN(v)) slSpeed.value = clamp(v, LIMITS.speed.min, LIMITS.speed.max); });
  numSpeed.addEventListener('change', function () { var v = clamp(parseFloat(numSpeed.value) || 1, LIMITS.speed.min, LIMITS.speed.max); numSpeed.value = v.toFixed(1); slSpeed.value = v; });
}
document.getElementById('stepSpeedDown').addEventListener('click', function () { var v = Math.round((clamp(parseFloat(slSpeed.value) - 0.1, LIMITS.speed.min, LIMITS.speed.max)) * 10) / 10; slSpeed.value = v; if (numSpeed) numSpeed.value = v.toFixed(1); });
document.getElementById('stepSpeedUp').addEventListener('click', function () { var v = Math.round((clamp(parseFloat(slSpeed.value) + 0.1, LIMITS.speed.min, LIMITS.speed.max)) * 10) / 10; slSpeed.value = v; if (numSpeed) numSpeed.value = v.toFixed(1); });

slGain.addEventListener('input', function () { if (numGain) numGain.value = parseInt(slGain.value); });
if (numGain) {
  numGain.addEventListener('input', function () { var v = parseInt(numGain.value); if (!isNaN(v)) slGain.value = clamp(v, LIMITS.gainDb.min, LIMITS.gainDb.max); });
  numGain.addEventListener('change', function () { var v = clamp(parseInt(numGain.value) || 0, LIMITS.gainDb.min, LIMITS.gainDb.max); numGain.value = v; slGain.value = v; });
}
document.getElementById('stepGainDown').addEventListener('click', function () { var v = clamp(parseInt(slGain.value) - 1, LIMITS.gainDb.min, LIMITS.gainDb.max); slGain.value = v; if (numGain) numGain.value = v; });
document.getElementById('stepGainUp').addEventListener('click', function () { var v = clamp(parseInt(slGain.value) + 1, LIMITS.gainDb.min, LIMITS.gainDb.max); slGain.value = v; if (numGain) numGain.value = v; });

slDur.addEventListener('input', function () { if (numDur) numDur.value = parseInt(slDur.value); });
if (numDur) {
  numDur.addEventListener('input', function () { var v = parseInt(numDur.value); if (!isNaN(v)) slDur.value = clamp(v, LIMITS.maxDur.min, LIMITS.maxDur.max); });
  numDur.addEventListener('change', function () { var v = clamp(parseInt(numDur.value) || 400, LIMITS.maxDur.min, LIMITS.maxDur.max); numDur.value = v; slDur.value = v; });
}
document.getElementById('stepDurDown').addEventListener('click', function () { var v = clamp(parseInt(slDur.value) - 1, LIMITS.maxDur.min, LIMITS.maxDur.max); slDur.value = v; if (numDur) numDur.value = v; });
document.getElementById('stepDurUp').addEventListener('click', function () { var v = clamp(parseInt(slDur.value) + 1, LIMITS.maxDur.min, LIMITS.maxDur.max); slDur.value = v; if (numDur) numDur.value = v; });

/* ── File upload ── */
audioInput.addEventListener('change', function () { var f = audioInput.files[0]; if (f) handleFileSelect(f); });
dropArea.addEventListener('dragover', function (e) { e.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea.addEventListener('dragleave', function () { dropArea.classList.remove('drag-over'); });
dropArea.addEventListener('drop', function (e) {
  e.preventDefault(); dropArea.classList.remove('drag-over');
  var f = e.dataTransfer.files[0];
  if (f && (f.type === 'audio/mpeg' || f.name.endsWith('.mp3'))) handleFileSelect(f);
  else showStatus('Hanya file MP3 yang didukung.', true);
});

function handleFileSelect(f) {
  if (f.size > MAX_FILE_BYTES) { showStatus('File terlalu besar: ' + formatBytes(f.size) + '. Maks 20 MB.', true); audioInput.value = ''; return; }
  setFile(f);
}

async function setFile(f) {
  audioFile = f; sourceMode = 'file'; ytAudioUrl = null;
  ytPreview.classList.add('hidden'); ytStatus.textContent = ''; ytUrlInput.value = '';
  instanceInfo.classList.add('hidden');
  fileInfo.classList.remove('hidden');
  fileInfo.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>' + f.name + ' (' + formatBytes(f.size) + ')</span>';
  downloadSection.classList.add('hidden'); clearStatus(); readyToConvert();
  try { await loadPreview(await f.arrayBuffer()); } catch (e) {}
}

/* ── Audio Preview (browser-side, hanya untuk dengarkan audio asli) ── */
async function loadPreview(arrayBuffer) {
  fullStopPreview();
  if (previewAudioCtx) { try { previewAudioCtx.close(); } catch (e) {} }
  previewAudioCtx = new AudioContext();
  previewBuffer = await previewAudioCtx.decodeAudioData(arrayBuffer.slice(0));
  document.getElementById('previewSection').classList.remove('hidden');
  isPaused = false;
  previewOffset = 0;
  updatePreviewBtn('play');
  updateStopBtn(false);
  drawWaveform(previewBuffer, 0);
  updatePreviewProgress(0);
}

/* ── Preview state ── */
// previewOffset = posisi detik terakhir (untuk resume/seek)
// isPaused = true jika di-pause di tengah (bukan stopped)

var isPaused = false;

function updatePreviewBtn(state) {
  // state: 'play' | 'pause' | 'resume'
  var btn = document.getElementById('previewPlayBtn');
  if (!btn) return;
  if (state === 'pause') {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
  } else if (state === 'resume') {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume';
  } else {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Preview';
  }
}

function updateStopBtn(hasProgress) {
  var btn = document.getElementById('previewStopBtn');
  if (!btn) return;
  btn.disabled = !hasProgress;
}

function _stopSource() {
  // Hentikan source aktif tanpa mengubah state offset/paused
  cancelAnimationFrame(previewAnimId);
  if (previewSource) {
    previewSource.onended = null; // cegah race condition
    try { previewSource.stop(); } catch (e) {}
    previewSource = null;
  }
}

function playFromOffset(offset) {
  if (!previewBuffer || !previewAudioCtx) return;
  _stopSource();
  if (previewAudioCtx.state === 'suspended') previewAudioCtx.resume();
  previewOffset = clamp(offset, 0, previewBuffer.duration);
  previewSource = previewAudioCtx.createBufferSource();
  previewSource.buffer = previewBuffer;
  previewSource.connect(previewAudioCtx.destination);
  previewSource.start(0, previewOffset);
  previewStartTime = previewAudioCtx.currentTime - previewOffset;
  isPreviewPlaying = true;
  isPaused = false;
  updatePreviewBtn('pause');
  updateStopBtn(true);
  previewSource.onended = function () {
    // onended hanya valid jika source ini masih aktif (tidak di-stop manual)
    if (previewSource === null) return; // di-stop manual, abaikan
    isPreviewPlaying = false;
    isPaused = false;
    previewOffset = 0;
    cancelAnimationFrame(previewAnimId);
    updatePreviewBtn('play');
    updatePreviewProgress(0);
    updateStopBtn(false);
  };
  animatePreview();
}

function pausePreview() {
  if (!isPreviewPlaying || !previewAudioCtx) return;
  // Simpan posisi saat ini sebelum stop
  previewOffset = previewAudioCtx.currentTime - previewStartTime;
  previewOffset = clamp(previewOffset, 0, previewBuffer ? previewBuffer.duration : previewOffset);
  _stopSource();
  isPreviewPlaying = false;
  isPaused = true;
  updatePreviewBtn('resume');
  updateStopBtn(true);
}

function resumePreview() {
  if (!previewBuffer || !previewAudioCtx) return;
  playFromOffset(previewOffset);
}

function fullStopPreview() {
  _stopSource();
  isPreviewPlaying = false;
  isPaused = false;
  previewOffset = 0;
  updatePreviewBtn('play');
  updatePreviewProgress(0);
  updateStopBtn(false);
}

// Alias lama agar kode lain tidak error
function playPreview() { playFromOffset(previewOffset); }
function stopPreview() {
  _stopSource();
  isPreviewPlaying = false;
  isPaused = false;
  updatePreviewBtn('play');
}

function animatePreview() {
  previewAnimId = requestAnimationFrame(function () {
    if (!isPreviewPlaying || !previewAudioCtx || !previewBuffer) return;
    var pct = Math.min(1, (previewAudioCtx.currentTime - previewStartTime) / previewBuffer.duration);
    updatePreviewProgress(pct);
    if (pct < 1) animatePreview();
  });
}

function updatePreviewProgress(pct) {
  var bar = document.getElementById('previewProgressBar');
  var time = document.getElementById('previewTime');
  if (bar) bar.style.width = (pct * 100) + '%';
  if (time && previewBuffer) time.textContent = fmtTime(pct * previewBuffer.duration) + ' / ' + fmtTime(previewBuffer.duration);
  drawWaveform(previewBuffer, pct);
}

function drawWaveform(buffer, playPct) {
  var canvas = document.getElementById('waveformCanvas');
  if (!canvas || !buffer) return;
  var ctx = canvas.getContext('2d');
  // Use actual pixel dimensions for crisp rendering
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  var data = buffer.getChannelData(0);
  var step = Math.ceil(data.length / W);
  var mid = H / 2;
  var pct = (typeof playPct === 'number') ? playPct : 0;
  var playX = Math.round(pct * W);

  // Draw background waveform (gray — unplayed portion)
  ctx.beginPath(); ctx.strokeStyle = 'rgba(148,163,184,0.45)'; ctx.lineWidth = 1;
  for (var x = playX; x < W; x++) {
    var mn = 1, mx = -1;
    for (var j = 0; j < step; j++) { var v = data[x * step + j] || 0; if (v < mn) mn = v; if (v > mx) mx = v; }
    ctx.moveTo(x + 0.5, mid + mn * mid * 0.85); ctx.lineTo(x + 0.5, mid + mx * mid * 0.85);
  }
  ctx.stroke();

  // Draw played portion (indigo/purple — like screenshot)
  ctx.beginPath(); ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 1;
  for (var x2 = 0; x2 < playX; x2++) {
    var mn2 = 1, mx2 = -1;
    for (var j2 = 0; j2 < step; j2++) { var v2 = data[x2 * step + j2] || 0; if (v2 < mn2) mn2 = v2; if (v2 > mx2) mx2 = v2; }
    ctx.moveTo(x2 + 0.5, mid + mn2 * mid * 0.85); ctx.lineTo(x2 + 0.5, mid + mx2 * mid * 0.85);
  }
  ctx.stroke();

  // Draw playhead line
  if (playX > 0 && playX < W) {
    ctx.beginPath();
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    ctx.moveTo(playX, 0); ctx.lineTo(playX, H);
    ctx.stroke();
  }
}

document.addEventListener('click', function (e) {
  if (e.target.closest('#previewPlayBtn')) {
    if (isPreviewPlaying) {
      pausePreview();
    } else if (isPaused) {
      resumePreview();
    } else {
      playFromOffset(0);
    }
  }
  if (e.target.closest('#previewStopBtn')) { fullStopPreview(); }
});
document.addEventListener('click', function (e) {
  var track = e.target.closest('#previewTrack');
  if (!track || !previewBuffer) return;
  var rect = track.getBoundingClientRect();
  var seekOffset = clamp((e.clientX - rect.left) / rect.width * previewBuffer.duration, 0, previewBuffer.duration);
  if (isPreviewPlaying) {
    // Sedang main: langsung lompat ke posisi baru
    playFromOffset(seekOffset);
  } else {
    // Paused atau stopped: update posisi dan tampilan saja
    previewOffset = seekOffset;
    isPaused = seekOffset > 0; // jika seek ke posisi > 0 saat stopped, anggap paused
    updatePreviewProgress(seekOffset / previewBuffer.duration);
    updateStopBtn(seekOffset > 0);
    if (isPaused) updatePreviewBtn('resume'); else updatePreviewBtn('play');
  }
});

/* ── YouTube – Cobalt ── */
function extractYtId(url) {
  try {
    var u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    return u.searchParams.get('v') || null;
  } catch (e) { return null; }
}

ytLoadBtn.addEventListener('click', loadYoutube);
ytUrlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadYoutube(); });

async function tryCobaltInstance(baseUrl, videoId) {
  var res = await fetch(baseUrl.replace(/\/$/, '') + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=' + videoId, downloadMode: 'audio', audioFormat: 'best', audioBitrate: '128' }),
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var data = await res.json();
  if (data.status === 'redirect' || data.status === 'tunnel' || data.status === 'stream' || data.url)
    return { url: data.url, filename: data.filename || ('yt_' + videoId) };
  if (data.status === 'picker') {
    var item = data.picker && data.picker.find(function (i) { return i.url; });
    if (item) return { url: item.url, filename: data.audioFilename || ('yt_' + videoId) };
  }
  throw new Error(data.error && data.error.code ? data.error.code : (data.status || 'Format tidak didukung'));
}

async function loadYoutube() {
  var url = ytUrlInput.value.trim();
  if (!url) { ytStatus.textContent = 'Masukkan link YouTube terlebih dahulu.'; return; }
  var videoId = extractYtId(url);
  if (!videoId) { ytStatus.textContent = 'Link tidak dikenali. Gunakan format youtube.com/watch?v=... atau youtu.be/...'; return; }
  ytStatus.textContent = ''; ytLoadBtn.disabled = true; ytPreview.classList.add('hidden');
  instanceInfo.classList.remove('hidden'); instanceInfoText.textContent = 'Mencari server Cobalt…';
  var lastError = '';
  for (var i = 0; i < COBALT_INSTANCES.length; i++) {
    var inst = COBALT_INSTANCES[i];
    instanceInfoText.textContent = 'Mencoba ' + (i + 1) + '/' + COBALT_INSTANCES.length + ': ' + inst.replace('https://', '');
    try {
      var result = await tryCobaltInstance(inst, videoId);
      ytAudioUrl = result.url; ytVideoTitle = result.filename;
      sourceMode = 'youtube'; audioFile = null; fileInfo.classList.add('hidden');
      document.getElementById('previewSection').classList.add('hidden');
      instanceInfoText.textContent = '✓ ' + inst.replace('https://', '');
      ytPreview.classList.remove('hidden');
      ytPreview.innerHTML = '<img src="https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg" alt="" onerror="this.style.display=\'none\'"><div class="yt-meta"><div class="yt-title">' + ytVideoTitle + '</div><div class="yt-channel">Siap untuk dikonversi</div></div>';
      ytStatus.textContent = 'Audio berhasil dimuat dari YouTube.'; ytStatus.style.color = '#15803d';
      downloadSection.classList.add('hidden'); clearStatus(); readyToConvert(); ytLoadBtn.disabled = false;
      return;
    } catch (err) { lastError = err.message; }
  }
  instanceInfo.classList.add('hidden');
  ytStatus.textContent = 'Gagal semua server. Error: ' + lastError; ytStatus.style.color = '#b91c1c';
  ytAudioUrl = null; if (sourceMode === 'youtube') { sourceMode = null; readyToConvert(); }
  ytLoadBtn.disabled = false;
}

/* ── Load ffmpeg.wasm 0.11 via CDN ── */
function loadScript(src) {
  return new Promise(function (resolve, reject) {
    if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
    var s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = function () { reject(new Error('Gagal memuat: ' + src)); };
    document.head.appendChild(s);
  });
}

async function loadFFmpeg() {
  if (ffmpegReady) return ffmpegObj;

  /* Cek SharedArrayBuffer — untuk ffmpeg.wasm.
     Jika tidak tersedia, Service Worker (sw.js) belum aktif.
     Solusi: reload sekali setelah SW terdaftar. */
  if (typeof SharedArrayBuffer === 'undefined') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      throw new Error('SharedArrayBuffer belum aktif. Tekan Ctrl+Shift+R (hard refresh) sekali, lalu coba lagi.');
    } else {
      // SW baru terdaftar, perlu reload agar header COOP/COEP aktif
      throw new Error('Halaman perlu di-refresh sekali agar FFmpeg.wasm bisa berjalan. Tekan F5 atau Ctrl+R, lalu coba konversi lagi.');
    }
  }

  if (ffmpegStatus) ffmpegStatus.classList.remove('hidden');
  if (ffmpegStatusText) ffmpegStatusText.textContent = 'Memuat FFmpeg.wasm (~20 MB, sekali saja)…';

  var CDN_MAIN = [
    'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js',
    'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js',
  ];
  var CORE_BASE = [
    'https://unpkg.com/@ffmpeg/core@0.11.0/dist/',
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/',
  ];

  // Load ffmpeg.min.js
  var loaded = false;
  for (var i = 0; i < CDN_MAIN.length; i++) {
    try { await loadScript(CDN_MAIN[i]); loaded = true; break; } catch (e) {}
  }
  if (!loaded) throw new Error('Tidak dapat memuat FFmpeg dari CDN. Periksa koneksi internet.');

  var createFFmpeg = (window.FFmpeg && window.FFmpeg.createFFmpeg) || window.createFFmpeg;
  if (typeof createFFmpeg !== 'function') throw new Error('FFmpeg tidak ditemukan. Coba refresh halaman.');

  // Pilih CDN core tercepat
  var coreBase = CORE_BASE[0];
  for (var j = 0; j < CORE_BASE.length; j++) {
    try {
      var r = await fetch(CORE_BASE[j] + 'ffmpeg-core.js', { method: 'HEAD', signal: AbortSignal.timeout(4000) });
      if (r.ok) { coreBase = CORE_BASE[j]; break; }
    } catch (e) {}
  }

  if (ffmpegStatusText) ffmpegStatusText.textContent = 'Menginisialisasi FFmpeg core…';

  ffmpegObj = createFFmpeg({
    corePath: coreBase + 'ffmpeg-core.js',
    log: false,
    progress: function (p) {
      if (p.ratio > 0) {
        var pct = Math.round(p.ratio * 100);
        setProgress(15 + Math.round(p.ratio * 70), 'Memproses FFmpeg… ' + pct + '%');
      }
    },
  });

  await ffmpegObj.load();
  ffmpegReady = true;
  if (ffmpegStatus) ffmpegStatus.classList.add('hidden');
  return ffmpegObj;
}

/* ── Init default cards ── */
applyPresetToCards(activePreset);

/* ── Konversi utama ── */
convertBtn.addEventListener('click', startConvert);

async function startConvert() {
  clearStatus(); downloadSection.classList.add('hidden');
  convertBtn.disabled = true; progressWrap.classList.remove('hidden');
  setProgress(2, 'Mempersiapkan…');

  var speed, gainDb, maxDur;
  if (settingsMode === 'default') {
    speed = activePreset.speed; gainDb = activePreset.gainDb; maxDur = activePreset.maxDur;
  } else {
    speed  = clamp(parseFloat(numSpeed ? numSpeed.value : slSpeed.value), LIMITS.speed.min, LIMITS.speed.max);
    gainDb = clamp(parseInt(numGain ? numGain.value : slGain.value), LIMITS.gainDb.min, LIMITS.gainDb.max);
    maxDur = clamp(parseInt(numDur ? numDur.value : slDur.value), LIMITS.maxDur.min, LIMITS.maxDur.max);
  }

  try {
    var inputData, baseName;

    if (sourceMode === 'file') {
      inputData = new Uint8Array(await audioFile.arrayBuffer());
      baseName  = audioFile.name.replace(/\.mp3$/i, '');
    } else if (sourceMode === 'youtube') {
      setProgress(5, 'Mengunduh audio dari YouTube…');
      var r = await fetch(ytAudioUrl);
      if (!r.ok) throw new Error('Gagal mengunduh audio YouTube. Coba muat ulang link.');
      var blob = await r.blob();
      if (blob.size > MAX_FILE_BYTES) throw new Error('File terlalu besar: ' + formatBytes(blob.size) + '. Maks 20 MB.');
      inputData = new Uint8Array(await blob.arrayBuffer());
      baseName  = sanitizeName(ytVideoTitle);
    } else {
      throw new Error('Tidak ada sumber audio yang dipilih.');
    }

    setProgress(8, 'Memuat FFmpeg.wasm…');
    var ffmpeg = await loadFFmpeg();

    setProgress(15, 'Menyiapkan file input…');
    ffmpeg.FS('writeFile', 'input.mp3', inputData);

    var af = buildAudioFilter(speed, gainDb);
    var commonArgs = [
      '-i', 'input.mp3',
      '-af', af,
      '-t', String(maxDur),
      '-map_metadata', '-1',
      '-metadata', 'title=',
      '-metadata', 'artist=',
      '-metadata', 'album=',
      '-metadata', 'comment=',
      '-metadata', 'genre=',
      '-metadata', 'date=',
      '-metadata', 'track=',
      '-metadata', 'composer=',
      '-metadata', 'copyright=',
      '-metadata', 'description=',
    ];

    // Konversi ke OGG Vorbis (Roblox-compatible)
    setProgress(15, 'Mengkonversi ke OGG Vorbis (' + speed + 'x, ' + gainDb + 'dB)…');
    await ffmpeg.run.apply(ffmpeg, commonArgs.concat(['-c:a', 'libvorbis', '-ac', '2', '-ar', '44100', '-b:a', '192k', '-f', 'ogg', 'output.ogg']));

    setProgress(60, 'Mengkonversi ke MP3…');
    await ffmpeg.run.apply(ffmpeg, commonArgs.concat(['-c:a', 'libmp3lame', '-ac', '2', '-ar', '44100', '-b:a', '128k', '-f', 'mp3', 'output.mp3']));

    setProgress(90, 'Menyiapkan unduhan…');

    var oggData = ffmpeg.FS('readFile', 'output.ogg');
    var mp3Data = ffmpeg.FS('readFile', 'output.mp3');
    var oggBlob = new Blob([oggData.buffer], { type: 'audio/ogg' });
    var mp3Blob = new Blob([mp3Data.buffer], { type: 'audio/mpeg' });

    // Cleanup FS
    try { ffmpeg.FS('unlink', 'input.mp3'); } catch (e) {}
    try { ffmpeg.FS('unlink', 'output.ogg'); } catch (e) {}
    try { ffmpeg.FS('unlink', 'output.mp3'); } catch (e) {}

    // Hitung durasi output
    var outputDuration = 0;
    try {
      var tmpCtx = new AudioContext();
      var decoded = await tmpCtx.decodeAudioData(oggData.buffer.slice(0));
      outputDuration = decoded.duration;
      tmpCtx.close();
    } catch (e) {}

    setProgress(100, 'Selesai!');
    renderResult({ baseName: baseName, speed: speed, gainDb: gainDb, maxDur: maxDur, oggBlob: oggBlob, mp3Blob: mp3Blob, outputDuration: outputDuration });

  } catch (err) {
    progressWrap.classList.add('hidden');
    showStatus('Error: ' + err.message, true);
    console.error(err);
  } finally {
    convertBtn.disabled = false; readyToConvert();
  }
}

function renderResult(r) {
  // Revoke URL lama agar tidak leak memory
  if (dlOgg.href && dlOgg.href.startsWith('blob:')) URL.revokeObjectURL(dlOgg.href);
  if (dlMp3.href && dlMp3.href.startsWith('blob:')) URL.revokeObjectURL(dlMp3.href);

  dlOgg.href = URL.createObjectURL(r.oggBlob);
  dlOgg.download = (r.baseName || 'hasil') + '_converted.ogg';
  dlMp3.href = URL.createObjectURL(r.mp3Blob);
  dlMp3.download = (r.baseName || 'hasil') + '_converted.mp3';

  var m   = Math.floor(r.outputDuration / 60);
  var sec = Math.floor(r.outputDuration % 60);
  var durLabel = m > 0 ? (m + ' menit ' + sec + ' detik (' + r.outputDuration.toFixed(1) + 's)') : (r.outputDuration.toFixed(1) + ' detik');

  var robloxSpeed = calcRobloxSpeed(r.speed);
  var warnings = [];
  if (r.oggBlob.size > 19.5 * 1024 * 1024) warnings.push('⚠ File OGG mendekati batas 20 MB Roblox');
  if (r.outputDuration > 420) warnings.push('⚠ Durasi melebihi 7 menit — Roblox mungkin menolak');

  dlNote.innerHTML =
    '<div class="dl-result-block">' +
    '<div class="dl-result-line dl-result-big"><strong>Durasi output: ' + durLabel + '</strong></div>' +
    '<div class="dl-result-line"><strong>Kecepatan ' + r.speed + '× · Amplifikasi ' + r.gainDb + ' dB · Maks ' + r.maxDur + 's</strong></div>' +
    '<div class="dl-result-line"><strong>Speed Normal di Roblox: ' + robloxSpeed + '</strong></div>' +
    '<div class="dl-result-line"><strong>Codec: OGG Vorbis (Roblox-compatible)</strong></div>' +
    (warnings.length ? '<div class="dl-result-warn">' + warnings.join('<br>') + '</div>' : '') +
    '</div>';

  dlSize.innerHTML = '<strong class="dl-result-size">Ukuran — OGG: ' + formatBytes(r.oggBlob.size) + ' · MP3: ' + formatBytes(r.mp3Blob.size) + '</strong>';
  downloadSection.classList.remove('hidden');
  progressWrap.classList.add('hidden');
}
