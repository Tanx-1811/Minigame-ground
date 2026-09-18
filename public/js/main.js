const socket = io();
window.socket = socket;

let hasConnectedOnce = false;
socket.on('connect', () => {
  if (hasConnectedOnce) {
    // Ket noi lai sau khi mat mang: dong bo lai toan bo de tranh lech du lieu
    // do bo lo cac su kien phat trong luc mat ket noi.
    loadGroups();
    loadMembers();
    loadActivity();
  }
  hasConnectedOnce = true;
});

const introScreen = document.getElementById('introScreen');
const quizScreen = document.getElementById('quizScreen');
const appScreen = document.getElementById('appScreen');
const countdownBlock = document.getElementById('countdownBlock');
const cdDays = document.getElementById('cdDays');
const cdHours = document.getElementById('cdHours');
const cdMinutes = document.getElementById('cdMinutes');
const cdSeconds = document.getElementById('cdSeconds');
const startBtn = document.getElementById('startBtn');
const startBtnText = document.getElementById('startBtnText');

const memberSelect = document.getElementById('memberSelect');
const randomBtn = document.getElementById('randomBtn');
const resultBox = document.getElementById('resultBox');
const resultText = document.getElementById('resultText');
const shareBtn = document.getElementById('shareBtn');
const shareCanvas = document.getElementById('shareCanvas');
const errorText = document.getElementById('errorText');
const groupsGrid = document.getElementById('groupsGrid');
const groupsPreview = document.getElementById('groupsPreview');
const progressText = document.getElementById('progressText');
const progressPct = document.getElementById('progressPct');
const progressFill = document.getElementById('progressFill');
const remainingText = document.getElementById('remainingText');
const confettiCanvas = document.getElementById('confettiCanvas');
const fireworksCanvas = document.getElementById('fireworksCanvas');
const leaderboardList = document.getElementById('leaderboardList');
const activityList = document.getElementById('activityList');
const slotMachine = document.getElementById('slotMachine');
const reelStripEls = [0, 1, 2].map((i) => document.getElementById(`reelStrip${i}`));
const rulesBtn = document.getElementById('rulesBtn');
const rulesModal = document.getElementById('rulesModal');
const rulesCloseBtn = document.getElementById('rulesCloseBtn');

const soundToggleBtn = document.getElementById('soundToggleBtn');
const fxToggleBtn = document.getElementById('fxToggleBtn');
const onlineBadge = document.getElementById('onlineBadge');
const backToTopBtn = document.getElementById('backToTopBtn');
const toastContainer = document.getElementById('toastContainer');
const memberSearch = document.getElementById('memberSearch');
const resultMotto = document.getElementById('resultMotto');
const copyResultBtn = document.getElementById('copyResultBtn');
const nativeShareBtn = document.getElementById('nativeShareBtn');

const STORAGE_KEY = 'randomTeam_myName';
const SOUND_KEY = 'randomTeam_soundMuted';
const FX_KEY = 'randomTeam_fxEnabled';
const MAX_ACTIVITY = 20;
const MAX_ACTIVITY_SHOWN = 8;
const REEL_ITEM_HEIGHT = 96;
const REEL_STRIP_LENGTH = 20;
const REEL_DURATIONS = [2200, 2800, 3400];

const GROUP_THEMES = [
  { icon: '😇', color: '#2563eb' },
  { icon: '🥇', color: '#d97706' },
  { icon: '🍒', color: '#dc2626' },
  { icon: '🏋️', color: '#16a34a' },
  { icon: '🚀', color: '#7c3aed' },
  { icon: '⭐', color: '#0891b2' },
];

let groups = [];
let totalMembersCount = 0;
let activityData = [];
let errorTimer = null;
let isSpinning = false;
let lastResult = null;
let dataReady = false;
let countdownReady = true;
let countdownTimer = null;
let pendingRandomName = null;
let currentPhase = 'quiz';
const QUIZ_NAME_KEY = 'randomTeam_quizName';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'ket-qua';
}

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = 200 + (Math.abs(hash) % 40);
  const light = 38 + (Math.abs(hash >> 3) % 14);
  return `hsl(${hue}, 65%, ${light}%)`;
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function themeForIndex(idx) {
  return GROUP_THEMES[idx % GROUP_THEMES.length];
}

function themeForGroup(group) {
  const idx = groups.findIndex((g) => g.id === group.id);
  return themeForIndex(idx === -1 ? 0 : idx);
}

const TEAM_MOTTOS = [
  'Đi đâu cũng nhau, ăn đâu cũng đủ!',
  'Không mạnh nhất, nhưng vui nhất!',
  'Cùng nhóm là cùng chung mâm cơm!',
  'Nhóm nhỏ nhưng có võ!',
  'Chưa thắng nhưng đã lầy trước!',
  'Hôm nay làm việc, mai đi liên hoan!',
  'Đoàn kết là sức mạnh, sức mạnh là... hết đói!',
  'Random ra thì phải thương nhau!',
  'Nhóm này chuyên trị deadline bằng tiếng cười!',
  'Ít người nhưng nhiều drama vui vẻ!',
];

function mottoForGroup(group) {
  let hash = 0;
  const s = String(group.id) + group.name;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TEAM_MOTTOS[Math.abs(hash) % TEAM_MOTTOS.length];
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function showError(msg) {
  errorText.textContent = msg;
  errorText.classList.remove('hidden');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => errorText.classList.add('hidden'), 4000);
  playError();
}

/* ---------- sound fx (Web Audio, no external assets) ---------- */

let audioCtx = null;
let soundMuted = localStorage.getItem(SOUND_KEY) === '1';

function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function beep({ freq = 440, duration = 0.12, type = 'sine', gain = 0.06, delay = 0 } = {}) {
  if (soundMuted) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gainNode).connect(ctx.destination);
    const startAt = ctx.currentTime + delay;
    gainNode.gain.setValueAtTime(gain, startAt);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  } catch (err) {
    /* audio not available, ignore */
  }
}

function playClick() {
  beep({ freq: 640, duration: 0.05, type: 'triangle', gain: 0.045 });
}

function playSpin() {
  beep({ freq: 260, duration: 0.4, type: 'sawtooth', gain: 0.035 });
}

function playWin() {
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
    beep({ freq, duration: 0.17, type: 'sine', gain: 0.06, delay: i * 0.09 })
  );
}

function playError() {
  beep({ freq: 150, duration: 0.22, type: 'square', gain: 0.05 });
}

function updateSoundBtn() {
  soundToggleBtn.textContent = soundMuted ? '🔇' : '🔊';
  soundToggleBtn.classList.toggle('is-off', soundMuted);
}

soundToggleBtn.addEventListener('click', () => {
  soundMuted = !soundMuted;
  localStorage.setItem(SOUND_KEY, soundMuted ? '1' : '0');
  updateSoundBtn();
  if (!soundMuted) playClick();
});

updateSoundBtn();

/* ---------- toast notifications ---------- */

function showToast(message, type = 'info', duration = 3200) {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'success' ? ' toast-success' : type === 'error' ? ' toast-error' : '');
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

/* ---------- cursor sparkle fx toggle ---------- */

let fxEnabled = localStorage.getItem(FX_KEY) !== '0';
const SPARK_EMOJIS = ['✨', '⭐', '💫'];
let lastSparkAt = 0;

function updateFxBtn() {
  fxToggleBtn.classList.toggle('is-off', !fxEnabled);
}

fxToggleBtn.addEventListener('click', () => {
  fxEnabled = !fxEnabled;
  localStorage.setItem(FX_KEY, fxEnabled ? '1' : '0');
  updateFxBtn();
  playClick();
});

updateFxBtn();

document.addEventListener('pointermove', (e) => {
  if (!fxEnabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const now = performance.now();
  if (now - lastSparkAt < 70 || Math.random() > 0.25) return;
  lastSparkAt = now;
  const span = document.createElement('span');
  span.className = 'cursor-spark';
  span.textContent = SPARK_EMOJIS[Math.floor(Math.random() * SPARK_EMOJIS.length)];
  span.style.left = `${e.clientX}px`;
  span.style.top = `${e.clientY}px`;
  document.body.appendChild(span);
  setTimeout(() => span.remove(), 700);
});

/* ---------- online viewer count ---------- */

socket.on('online:count', (count) => {
  onlineBadge.textContent = `🟢 ${count} đang xem`;
});

/* ---------- back to top ---------- */

window.addEventListener('scroll', () => {
  backToTopBtn.classList.toggle('hidden', window.scrollY < 400);
});

backToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  playClick();
});

/* ---------- konami code easter egg ---------- */

const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const expected = KONAMI_CODE[konamiIndex];
  if (key === expected) {
    konamiIndex++;
    if (konamiIndex === KONAMI_CODE.length) {
      konamiIndex = 0;
      fireConfetti();
      fireFireworks(4500);
      playWin();
      showToast('🥳 Bạn vừa tìm thấy Easter Egg bí mật!', 'success', 5000);
    }
  } else {
    konamiIndex = key === KONAMI_CODE[0] ? 1 : 0;
  }
});

/* ---------- intro screen: particles + countdown ---------- */

function setupIntroParticles() {
  const container = document.querySelector('.intro-particles');
  if (!container) return;
  const emojis = ['🎉', '✨', '🎊', '⭐', '💫'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 10; i++) {
    const span = document.createElement('span');
    span.className = 'intro-particle';
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    span.style.left = `${Math.random() * 100}%`;
    span.style.setProperty('--p-size', `${1 + Math.random() * 1.4}rem`);
    span.style.setProperty('--p-duration', `${7 + Math.random() * 6}s`);
    span.style.setProperty('--p-delay', `${Math.random() * 8}s`);
    frag.appendChild(span);
  }
  container.appendChild(frag);
}

function updateStartBtnState() {
  startBtn.disabled = !(dataReady && countdownReady);
  startBtnText.textContent = !countdownReady
    ? 'Sắp bắt đầu...'
    : !dataReady
      ? 'Đang tải...'
      : 'Bắt đầu bốc thăm';
}

function startCountdown(targetIso) {
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target) || target <= Date.now()) {
    countdownReady = true;
    updateStartBtnState();
    return;
  }

  countdownReady = false;
  countdownBlock.classList.remove('hidden');
  updateStartBtnState();

  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      clearInterval(countdownTimer);
      countdownBlock.classList.add('hidden');
      countdownReady = true;
      updateStartBtnState();
      fireConfetti();
      fireFireworks();
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    cdDays.textContent = String(days).padStart(2, '0');
    cdHours.textContent = String(hours).padStart(2, '0');
    cdMinutes.textContent = String(minutes).padStart(2, '0');
    cdSeconds.textContent = String(seconds).padStart(2, '0');
  }

  tick();
  countdownTimer = setInterval(tick, 1000);
}

function enterAppScreen() {
  introScreen.classList.add('fade-out');
  appScreen.classList.remove('hidden');
  setTimeout(() => {
    introScreen.style.display = 'none';
  }, 450);
}

function enterQuizScreen() {
  introScreen.classList.add('fade-out');
  quizScreen.classList.remove('hidden');
  setTimeout(() => {
    introScreen.style.display = 'none';
  }, 450);
  if (window.QuizUI && typeof window.QuizUI.enter === 'function') {
    window.QuizUI.enter();
  }
}

function enterNextScreen() {
  if (currentPhase === 'random') {
    enterAppScreen();
  } else {
    enterQuizScreen();
  }
}

/* ---------- result reveal + confetti ---------- */

function showResult(member, group, celebrate) {
  const theme = themeForGroup(group);
  lastResult = { member, group, theme };

  resultBox.classList.remove('hidden', 'pop');
  const leaderTag = member.isLeader ? ' 👑' : '';
  resultText.innerHTML = `${theme.icon} <strong>${escapeHtml(member.name)}</strong>${leaderTag} thuộc về <strong>${escapeHtml(group.name)}</strong>!`;
  resultMotto.textContent = `"${mottoForGroup(group)}"`;
  shareBtn.classList.remove('hidden');
  copyResultBtn.classList.remove('hidden');
  nativeShareBtn.classList.remove('hidden');
  // force reflow so the pop animation replays on repeated results
  void resultBox.offsetWidth;
  resultBox.classList.add('pop');

  if (celebrate) {
    fireConfetti();
    fireFireworks();
    playWin();
    appScreen.classList.add('shake');
    setTimeout(() => appScreen.classList.remove('shake'), 500);
    showToast(`🎉 Chúc mừng ${member.name} đã vào ${group.name}!`, 'success');
  }
}

function buildReelIcons(targetIcon) {
  const pool = groups.length ? groups.map((g, i) => themeForIndex(i).icon) : GROUP_THEMES.map((t) => t.icon);
  const seq = [];
  for (let i = 0; i < REEL_STRIP_LENGTH - 1; i++) {
    seq.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  seq.push(targetIcon);
  return seq;
}

function spinReel(stripEl, targetIcon, totalDurationMs) {
  return new Promise((resolve) => {
    const icons = buildReelIcons(targetIcon);
    const reelBox = stripEl.closest('.slot-reel');

    stripEl.style.transition = 'none';
    stripEl.style.transform = 'translateY(0)';
    stripEl.innerHTML = icons.map((icon) => `<div class="slot-reel-item">${icon}</div>`).join('');
    reelBox.classList.remove('landed');
    // force reflow so the reset above applies before the animated transform kicks in
    void stripEl.offsetHeight;

    const finalOffset = (icons.length - 1) * REEL_ITEM_HEIGHT;
    // phase 1: fast constant-speed scroll through most of the strip (clearly "spinning")
    // phase 2: slow, readable deceleration onto the winning icon
    const phase1Offset = Math.round(finalOffset * 0.55 / REEL_ITEM_HEIGHT) * REEL_ITEM_HEIGHT;
    const phase1Duration = Math.round(totalDurationMs * 0.4);
    const phase2Duration = totalDurationMs - phase1Duration;
    let phase1Done = false;
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      reelBox.classList.add('landed');
      resolve();
    };

    const startPhase2 = () => {
      if (phase1Done) return;
      phase1Done = true;
      stripEl.removeEventListener('transitionend', onPhase1End);

      requestAnimationFrame(() => {
        stripEl.style.transition = `transform ${phase2Duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
        stripEl.style.transform = `translateY(-${finalOffset}px)`;
      });

      stripEl.addEventListener('transitionend', function onPhase2End(e2) {
        if (e2.propertyName !== 'transform') return;
        stripEl.removeEventListener('transitionend', onPhase2End);
        settle();
      });
      // fallback in case transitionend doesn't fire (e.g. reduced-motion 0-duration transition)
      setTimeout(settle, phase2Duration + 300);
    };

    function onPhase1End(e) {
      if (e.propertyName !== 'transform') return;
      startPhase2();
    }

    requestAnimationFrame(() => {
      stripEl.style.transition = `transform ${phase1Duration}ms linear`;
      stripEl.style.transform = `translateY(-${phase1Offset}px)`;
    });
    stripEl.addEventListener('transitionend', onPhase1End);
    // fallback in case phase 1's transitionend doesn't fire
    setTimeout(startPhase2, phase1Duration + 300);
  });
}

function runSlotMachine(theme) {
  slotMachine.classList.remove('hidden');
  return Promise.all(reelStripEls.map((el, i) => spinReel(el, theme.icon, REEL_DURATIONS[i])));
}

function fireConfetti(color1, color2) {
  const ctx = confettiCanvas.getContext('2d');
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  confettiCanvas.classList.remove('hidden');

  const colors = [color1 || '#2563eb', color2 || '#3b82f6', '#1d4ed8', '#60a5fa', '#93c5fd', '#ffffff'];
  const particles = Array.from({ length: 140 }, () => ({
    x: confettiCanvas.width / 2 + (Math.random() - 0.5) * confettiCanvas.width * 0.4,
    y: confettiCanvas.height * 0.25,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -9 - 3,
    size: Math.random() * 7 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    vr: (Math.random() - 0.5) * 12,
    gravity: 0.22 + Math.random() * 0.15,
  }));

  let frame = 0;
  const maxFrames = 140;

  function tick() {
    frame++;
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    particles.forEach((p) => {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      confettiCanvas.classList.add('hidden');
    }
  }

  tick();
}

function fireFireworks(durationMs = 3200) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = fireworksCanvas.getContext('2d');
  const w = window.innerWidth;
  const h = window.innerHeight;
  fireworksCanvas.width = w;
  fireworksCanvas.height = h;
  fireworksCanvas.classList.remove('hidden');

  const colors = ['#f43f5e', '#f59e0b', '#22d3ee', '#a855f7', '#22c55e', '#ffffff', '#2563eb'];
  let rockets = [];
  let particles = [];
  let lastLaunch = 0;
  const launchInterval = 450;
  const startTime = performance.now();

  function spawnRocket() {
    const color = colors[Math.floor(Math.random() * colors.length)];
    rockets.push({
      x: w * (0.15 + Math.random() * 0.7),
      y: h,
      targetY: h * (0.18 + Math.random() * 0.32),
      vy: -(Math.random() * 3 + 10),
      color,
    });
  }

  function explode(rocket) {
    const count = 44 + Math.floor(Math.random() * 20);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      const speed = Math.random() * 4.5 + 2;
      particles.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: rocket.color,
        life: 1,
        decay: 0.012 + Math.random() * 0.012,
        size: Math.random() * 2.4 + 1.4,
      });
    }
  }

  function tick(now) {
    const elapsed = now - startTime;
    ctx.clearRect(0, 0, w, h);

    if (elapsed < durationMs - 600 && now - lastLaunch > launchInterval) {
      spawnRocket();
      lastLaunch = now;
    }

    rockets = rockets.filter((r) => {
      r.y += r.vy;
      r.vy += 0.05;
      ctx.beginPath();
      ctx.fillStyle = r.color;
      ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (r.vy >= 0 || r.y <= r.targetY) {
        explode(r);
        return false;
      }
      return true;
    });

    particles = particles.filter((p) => {
      p.vy += 0.05;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) return false;
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return true;
    });

    if (elapsed < durationMs || rockets.length || particles.length) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, w, h);
      fireworksCanvas.classList.add('hidden');
    }
  }

  requestAnimationFrame(tick);
}

/* ---------- shareable result card ---------- */

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  });
  lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

function drawShareCard({ member, group, theme }) {
  const ctx = shareCanvas.getContext('2d');
  const W = shareCanvas.width;
  const H = shareCanvas.height;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1d4ed8');
  grad.addColorStop(1, theme.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  ctx.font = '160px "Segoe UI Emoji", "Segoe UI", sans-serif';
  ctx.fillText(theme.icon, W / 2, 280);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 30px "Segoe UI", sans-serif';
  ctx.fillText('BẠN THUỘC VỀ', W / 2, 380);

  ctx.font = '800 54px "Segoe UI", sans-serif';
  wrapText(ctx, group.name, W / 2, 460, W - 140, 62);

  ctx.font = '600 34px "Segoe UI", sans-serif';
  ctx.fillText(member.name, W / 2, 630);

  ctx.font = '400 22px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('DIMACO • Random Chia Nhóm', W / 2, H - 60);
}

shareBtn.addEventListener('click', () => {
  if (!lastResult) return;
  drawShareCard(lastResult);
  shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ket-qua-${slugify(lastResult.member.name)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/png');
});

copyResultBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  const text = `${lastResult.member.name} thuộc về ${lastResult.group.name} 🎉 (DIMACO Random Chia Nhóm)`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Đã copy kết quả!', 'success', 2200);
    playClick();
  } catch (err) {
    showToast('Không thể copy, vui lòng thử lại', 'error');
  }
});

nativeShareBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  const text = `${lastResult.member.name} thuộc về ${lastResult.group.name} 🎉`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Kết quả bốc thăm chia nhóm', text, url: window.location.href });
    } catch (err) {
      /* user cancelled share sheet, nothing to do */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text} - ${window.location.href}`);
    showToast('Trình duyệt không hỗ trợ chia sẻ, đã copy link!', 'success');
  } catch (err) {
    showToast('Không thể chia sẻ', 'error');
  }
});

/* ---------- leaderboard + activity feed ---------- */

function renderLeaderboard() {
  const sorted = [...groups].sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0));
  const max = Math.max(1, ...sorted.map((g) => g.members?.length || 0));
  const medals = ['🥇', '🥈', '🥉'];

  leaderboardList.innerHTML = sorted
    .map((g, i) => {
      const count = g.members ? g.members.length : 0;
      const pct = Math.round((count / max) * 100);
      return `
        <li class="leaderboard-row">
          <span class="leaderboard-rank">${medals[i] || i + 1}</span>
          <div class="leaderboard-info">
            <div class="leaderboard-top">
              <span class="leaderboard-name">${escapeHtml(g.name)}</span>
              <span class="leaderboard-count">${count} người</span>
            </div>
            <div class="leaderboard-bar"><div class="leaderboard-bar-fill" style="width:${pct}%"></div></div>
          </div>
        </li>`;
    })
    .join('');
}

function renderActivity() {
  if (!activityData.length) {
    activityList.innerHTML = '<li class="activity-empty">Chưa có ai bốc thăm...</li>';
    return;
  }

  activityList.innerHTML = activityData
    .slice(0, MAX_ACTIVITY_SHOWN)
    .map(
      (a) => `
        <li class="activity-item">
          <span class="activity-time">${formatTime(a.at)}</span>
          <span>${escapeHtml(a.member.name)}${a.member.isLeader ? ' 👑' : ''} vào <strong>${escapeHtml(a.group.name)}</strong></span>
        </li>`
    )
    .join('');
}

function addActivity(entry) {
  if (!entry || !entry.member || !entry.group) return;
  activityData.unshift(entry);
  if (activityData.length > MAX_ACTIVITY) {
    activityData.length = MAX_ACTIVITY;
  }
  renderActivity();
}

/* ---------- groups + progress ---------- */

function updateProgress() {
  const assigned = groups.reduce((sum, g) => sum + (g.members ? g.members.length : 0), 0);
  const total = totalMembersCount;
  const pct = total ? Math.round((assigned / total) * 100) : 0;
  progressText.textContent = `Đã random ${assigned}/${total} người`;
  progressPct.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;

  const remaining = Math.max(0, total - assigned);
  remainingText.textContent = !total
    ? ''
    : remaining > 0
      ? `⏳ Còn ${remaining}/${total} người chưa bốc thăm`
      : `🎉 Tất cả ${total} người đã bốc thăm xong!`;
}

function renderGroupsPreview() {
  groupsPreview.innerHTML = groups
    .map((g, idx) => {
      const theme = themeForIndex(idx);
      return `<span class="preview-chip"><span class="preview-dot" style="background:${theme.color}"></span><span>${theme.icon}</span><span>${escapeHtml(g.name)}</span></span>`;
    })
    .join('');
}

function renderGroups() {
  const myName = localStorage.getItem(STORAGE_KEY);
  const flippedIds = new Set(
    [...groupsGrid.querySelectorAll('.group-card.flipped')].map((card) => card.dataset.groupId)
  );

  groupsGrid.innerHTML = groups
    .map((group, idx) => {
      const theme = themeForIndex(idx);
      const members = group.members || [];
      const memberItems = members.length
        ? members
            .map((m) => {
              const isMe = m.name === myName;
              const leaderBadge = m.isLeader ? '<span class="leader-badge" title="Nhóm trưởng">👑</span>' : '';
              return `
                <li class="member-chip ${isMe ? 'me' : ''} ${m.isLeader ? 'is-leader' : ''}">
                  <span class="avatar" style="background:${hashColor(m.name)}">${escapeHtml(initials(m.name))}</span>
                  <span class="name">${escapeHtml(m.name)}${leaderBadge}</span>
                </li>`;
            })
            .join('')
        : '<li class="member-chip empty">Chưa có thành viên</li>';

      return `
        <div class="group-card" style="--accent:${theme.color}" data-group-id="${group.id}">
          <div class="group-card-inner">
            <div class="group-card-face front">
              <div class="group-card-top">
                <span class="group-icon" style="background:${theme.color}1f;border-color:${theme.color}66">${theme.icon}</span>
                <div>
                  <h2>${escapeHtml(group.name)}</h2>
                  ${group.description ? `<p class="group-desc">${escapeHtml(group.description)}</p>` : ''}
                </div>
              </div>
              <span class="member-count-badge">${members.length} thành viên</span>
              <ul class="member-list">${memberItems}</ul>
            </div>
            <div class="group-card-face back">
              <span class="group-card-back-icon">${theme.icon}</span>
              <p class="group-card-motto">"${escapeHtml(mottoForGroup(group))}"</p>
              <p class="group-card-back-hint">Bấm lại để quay về</p>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  groupsGrid.querySelectorAll('.group-card').forEach((card) => {
    if (flippedIds.has(card.dataset.groupId)) {
      card.classList.add('flipped');
    }
    card.addEventListener('click', () => {
      card.classList.toggle('flipped');
      playClick();
    });
  });

  updateProgress();
  renderLeaderboard();
  renderGroupsPreview();
  applySearchFilter();
}

/* ---------- member search / filter ---------- */

function applySearchFilter() {
  const q = memberSearch.value.trim().toLowerCase();
  groupsGrid.querySelectorAll('.group-card').forEach((card) => {
    let hasMatch = false;
    card.querySelectorAll('.member-chip').forEach((chip) => {
      const nameEl = chip.querySelector('.name');
      if (!nameEl) {
        chip.classList.remove('search-match', 'search-dim');
        return;
      }
      if (!q) {
        chip.classList.remove('search-match', 'search-dim');
        return;
      }
      const match = nameEl.textContent.toLowerCase().includes(q);
      chip.classList.toggle('search-match', match);
      chip.classList.toggle('search-dim', !match);
      if (match) hasMatch = true;
    });
    card.classList.toggle('search-has-match', !!q && hasMatch);
  });
}

memberSearch.addEventListener('input', applySearchFilter);

// Cap nhat state cuc bo tu payload realtime thay vi goi lai /api/groups.
// Voi su kien duoc broadcast cho TAT CA client, neu moi client deu fetch lai
// toan bo danh sach nhom + thanh vien thi so request se tang theo binh phuong
// so nguoi dang mo trang (N nguoi random x N client dang xem) -> server/trinh
// duyet deu bi ngop khi co dong nguoi dung cung luc.
function applyMemberRandomized(payload) {
  if (!payload || !payload.member || !payload.group) return false;
  const group = groups.find((g) => g.id === payload.group.id);
  if (!group) return false;

  group.members = group.members || [];
  if (group.members.some((m) => m.id === payload.member.id)) {
    return true; // da co san (vd nhan lai su kien), khong can render lai
  }

  group.members.push({
    id: payload.member.id,
    name: payload.member.name,
    isLeader: !!payload.member.isLeader,
  });
  group.members.sort((a, b) => a.name.localeCompare(b.name));
  renderGroups();
  return true;
}

async function loadGroups() {
  const res = await fetch('/api/groups');
  groups = await res.json();
  renderGroups();
}

async function loadMembers() {
  const res = await fetch('/api/members');
  const members = await res.json();
  totalMembersCount = members.length;

  const myName = localStorage.getItem(STORAGE_KEY);
  memberSelect.innerHTML =
    '<option value="">-- Chọn tên --</option>' +
    members
      .map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`)
      .join('');

  if (myName) {
    memberSelect.value = myName;
  }

  updateProgress();
}

async function loadActivity() {
  try {
    const res = await fetch('/api/activity');
    activityData = await res.json();
    renderActivity();
  } catch (err) {
    console.error(err);
  }
}

/* ---------- random flow ---------- */

async function doRandom(name, { isInit = false } = {}) {
  randomBtn.disabled = true;
  memberSelect.disabled = true;
  if (!isInit) {
    randomBtn.classList.add('spinning');
  }
  errorText.classList.add('hidden');
  pendingRandomName = name;

  try {
    const res = await fetch('/api/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();

    if (!res.ok) {
      resultBox.classList.add('hidden');
      slotMachine.classList.add('hidden');
      showError(data.error || 'Có lỗi xảy ra');
      return;
    }

    if (!isInit) {
      isSpinning = true;
      resultBox.classList.add('hidden');
      shareBtn.classList.add('hidden');
      copyResultBtn.classList.add('hidden');
      nativeShareBtn.classList.add('hidden');
      const theme = themeForGroup(data.group);
      playSpin();
      await runSlotMachine(theme);
    }

    localStorage.setItem(STORAGE_KEY, data.member.name);
    await loadGroups();
    showResult(data.member, data.group, !isInit);
  } catch (err) {
    console.error(err);
    resultBox.classList.add('hidden');
    slotMachine.classList.add('hidden');
    showError('Không thể kết nối máy chủ');
  } finally {
    isSpinning = false;
    pendingRandomName = null;
    randomBtn.disabled = false;
    randomBtn.classList.remove('spinning');
    memberSelect.disabled = false;
  }
}

randomBtn.addEventListener('click', () => {
  const name = memberSelect.value;
  if (!name) {
    showError('Vui lòng chọn tên của bạn trước khi random');
    return;
  }
  playClick();
  doRandom(name);
});

startBtn.addEventListener('click', () => {
  if (startBtn.disabled) return;
  playClick();
  enterNextScreen();
});

rulesBtn.addEventListener('click', () => {
  playClick();
  rulesModal.showModal();
});

rulesCloseBtn.addEventListener('click', () => {
  playClick();
  rulesModal.close();
});

rulesModal.addEventListener('click', (e) => {
  if (e.target === rulesModal) {
    rulesModal.close();
  }
});

socket.on('phase:updated', (payload) => {
  if (!payload) return;
  currentPhase = payload.phase;
  if (currentPhase === 'random' && !quizScreen.classList.contains('hidden')) {
    quizScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    loadGroups();
    loadMembers();
    const savedQuizName = localStorage.getItem(QUIZ_NAME_KEY);
    if (savedQuizName && !localStorage.getItem(STORAGE_KEY)) {
      memberSelect.value = savedQuizName;
    }
    const names = (payload.leaders || []).map((l) => l.name).join(', ');
    fireConfetti();
    fireFireworks();
    playWin();
    showToast(`👑 4 Nhóm Trưởng đã được chốt: ${names}. Mời mọi người bắt đầu Random!`, 'success', 6000);
  }
});

socket.on('config:updated', (payload) => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (payload && payload.eventStartAt) {
    startCountdown(payload.eventStartAt);
  } else {
    countdownBlock.classList.add('hidden');
    countdownReady = true;
    updateStartBtnState();
  }
});

socket.on('member:randomized', (payload) => {
  addActivity(payload);
  if (!isSpinning) {
    if (!applyMemberRandomized(payload)) {
      loadGroups();
    }
  }
  if (!payload || !payload.member) return;
  const myName = localStorage.getItem(STORAGE_KEY);
  const isSelf = payload.member.name === myName || payload.member.name === pendingRandomName;
  if (!isSelf) {
    showToast(`🎲 ${payload.member.name} vừa random vào ${payload.group.name}`, 'info', 2800);
  }
});

socket.on('groups:reset', (payload) => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(QUIZ_NAME_KEY);
  resultBox.classList.add('hidden');
  shareBtn.classList.add('hidden');
  copyResultBtn.classList.add('hidden');
  nativeShareBtn.classList.add('hidden');
  slotMachine.classList.add('hidden');
  lastResult = null;
  memberSelect.value = '';
  memberSearch.value = '';
  loadGroups();
  loadMembers();
  loadActivity();

  if (payload && payload.phase) {
    currentPhase = payload.phase;
  }
  // Dua moi nguoi ve man hinh dau (intro) de bat dau lai tu quiz/random cho dung
  appScreen.classList.add('hidden');
  quizScreen.classList.add('hidden');
  introScreen.style.display = '';
  introScreen.classList.remove('fade-out');
  updateStartBtnState();
});

/* ---------- init ---------- */

(async function init() {
  const myName = localStorage.getItem(STORAGE_KEY);
  const dataPromise = Promise.all([loadGroups(), loadMembers(), loadActivity()]);

  if (myName) {
    introScreen.style.display = 'none';
    appScreen.classList.remove('hidden');
    await dataPromise;
    // Refresh van giu ket qua: goi lai /api/random, server tra ve nhom cu (idempotent)
    doRandom(myName, { isInit: true });
    return;
  }

  setupIntroParticles();
  updateStartBtnState();

  dataPromise.then(() => {
    dataReady = true;
    updateStartBtnState();
  });

  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    currentPhase = config.phase || 'quiz';
    if (config.eventStartAt) {
      startCountdown(config.eventStartAt);
    } else {
      updateStartBtnState();
    }
  } catch (err) {
    console.error(err);
    updateStartBtnState();
  }
})();
