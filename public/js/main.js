const socket = io();
window.socket = socket;

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
const startBtnIcon = document.getElementById('startBtnIcon');
const introHint = document.getElementById('introHint');
const eventSteps = document.getElementById('eventSteps');

const memberSelect = document.getElementById('memberSelect');
const randomBtn = document.getElementById('randomBtn');
const randomBtnText = document.getElementById('randomBtnText');
const notMeBtn = document.getElementById('notMeBtn');
const lockNotice = document.getElementById('lockNotice');
const leaderNotice = document.getElementById('leaderNotice');
const leaderNoticeText = document.getElementById('leaderNoticeText');
const resultBox = document.getElementById('resultBox');
const resultIcon = document.getElementById('resultIcon');
const resultGroup = document.getElementById('resultGroup');
const resultName = document.getElementById('resultName');
const resultMotto = document.getElementById('resultMotto');
const resultMatesWrap = document.getElementById('resultMatesWrap');
const resultMates = document.getElementById('resultMates');
const resultMatesCount = document.getElementById('resultMatesCount');
const shareBtn = document.getElementById('shareBtn');
const shareCanvas = document.getElementById('shareCanvas');
const copyResultBtn = document.getElementById('copyResultBtn');
const nativeShareBtn = document.getElementById('nativeShareBtn');
const errorText = document.getElementById('errorText');
const groupsGrid = document.getElementById('groupsGrid');
const groupsPreview = document.getElementById('groupsPreview');
const progressText = document.getElementById('progressText');
const progressPct = document.getElementById('progressPct');
const progressBar = document.getElementById('progressBar');
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
const srLive = document.getElementById('srLive');

const soundToggleBtn = document.getElementById('soundToggleBtn');
const fxToggleBtn = document.getElementById('fxToggleBtn');
const onlineCount = document.getElementById('onlineCount');
const backToTopBtn = document.getElementById('backToTopBtn');
const memberSearch = document.getElementById('memberSearch');

const STORAGE_KEY = 'randomTeam_myName';
const QUIZ_NAME_KEY = 'randomTeam_quizName';
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
// false cho toi khi doc xong /api/config: truoc day mac dinh true nen nut "Bat dau"
// bam duoc truoc khi biet gio mo, va vao nham man quiz/random.
let countdownReady = false;
let countdownTimer = null;
let pendingRandomName = null;
let currentPhase = 'quiz';
let randomLocked = false;
let leaders = [];
let lastConfig = null;
// Tang len moi lan admin reset / dua ve man hinh cho. Moi tac vu bat dong bo (quay
// random ~3.4s) ghi lai epoch luc bat dau; xong ma epoch da doi thi bo ket qua,
// khong de phao giay + "Chuc mung" no ra tren man hinh cho.
let epoch = 0;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Escape ca dau nhay: ten co dau " dat vao value="..." truoc day bi cat cut
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function announce(text) {
  if (!srLive) return;
  srLive.textContent = '';
  // Doi 1 nhip de trinh doc man hinh nhan ra noi dung moi ke ca khi trung chu cu
  setTimeout(() => {
    srLive.textContent = text;
  }, 60);
}

function slugify(str) {
  return (
    str
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'ket-qua'
  );
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

// Mau admin dat cho nhom (tab Chia nhom) duoc uu tien o MOI noi: the nhom, xem
// truoc, slot machine, anh ket qua. Truoc day the nhom va xem truoc bo qua mau nay.
function themeForGroup(group) {
  const idx = groups.findIndex((g) => g.id === group.id);
  const base = themeForIndex(idx === -1 ? 0 : idx);
  return group && group.color ? { ...base, color: group.color } : base;
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
  errorTimer = setTimeout(() => errorText.classList.add('hidden'), 5000);
  playError();
}

function hideError() {
  clearTimeout(errorTimer);
  errorText.classList.add('hidden');
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }
  if (!res.ok) {
    const error = new Error((data && data.error) || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

/* ---------- am thanh (Web Audio, khong can file ngoai) ---------- */

let audioCtx = null;
// Nguoi dung tu bat/tat thi nho lua chon do; chua tung chon thi theo mac dinh admin dat
function storedSoundChoice() {
  try {
    return localStorage.getItem(SOUND_KEY);
  } catch (err) {
    return null;
  }
}
let soundMuted = storedSoundChoice() === '1';

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
    /* trinh duyet khong ho tro am thanh, bo qua */
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

function playTick() {
  beep({ freq: 880, duration: 0.04, type: 'square', gain: 0.025 });
}

function updateSoundBtn() {
  soundToggleBtn.innerHTML = `<i data-lucide="${soundMuted ? 'volume-x' : 'volume-2'}"></i>`;
  soundToggleBtn.setAttribute('aria-pressed', soundMuted ? 'false' : 'true');
}

soundToggleBtn.addEventListener('click', () => {
  soundMuted = !soundMuted;
  try {
    localStorage.setItem(SOUND_KEY, soundMuted ? '1' : '0');
  } catch (err) {
    /* localStorage bi chan */
  }
  updateSoundBtn();
  if (!soundMuted) playClick();
});

updateSoundBtn();

/* ---------- toast ---------- */
/* Toan bo logic nam trong js/toast.js (nap truoc file nay). */

function showToast(message, type, duration, opts) {
  return window.Toast.show(message, type, duration, opts);
}

/* ---------- hieu ung con tro ---------- */

let fxEnabled = (() => {
  try {
    return localStorage.getItem(FX_KEY) !== '0';
  } catch (err) {
    return true;
  }
})();
const SPARK_EMOJIS = ['✨', '⭐', '💫'];
let lastSparkAt = 0;

function updateFxBtn() {
  fxToggleBtn.setAttribute('aria-pressed', fxEnabled ? 'true' : 'false');
}

fxToggleBtn.addEventListener('click', () => {
  fxEnabled = !fxEnabled;
  try {
    localStorage.setItem(FX_KEY, fxEnabled ? '1' : '0');
  } catch (err) {
    /* localStorage bi chan */
  }
  updateFxBtn();
  playClick();
});

updateFxBtn();

document.addEventListener('pointermove', (e) => {
  if (!fxEnabled || e.pointerType === 'touch' || reducedMotion()) return;
  const now = performance.now();
  if (now - lastSparkAt < 70 || Math.random() > 0.25) return;
  lastSparkAt = now;
  const span = document.createElement('span');
  span.className = 'cursor-spark';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = SPARK_EMOJIS[Math.floor(Math.random() * SPARK_EMOJIS.length)];
  span.style.left = `${e.clientX}px`;
  span.style.top = `${e.clientY}px`;
  document.body.appendChild(span);
  setTimeout(() => span.remove(), 700);
});

/* ---------- so nguoi dang xem ---------- */

socket.on('online:count', (count) => {
  onlineCount.textContent = String(count);
});

/* ---------- len dau trang ---------- */

window.addEventListener(
  'scroll',
  () => {
    backToTopBtn.classList.toggle('hidden', window.scrollY < 400);
  },
  { passive: true }
);

backToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  playClick();
});

/* ---------- easter egg konami ---------- */

const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const expected = KONAMI_CODE[konamiIndex];
  if (key === expected) {
    konamiIndex++;
    if (konamiIndex === KONAMI_CODE.length) {
      konamiIndex = 0;
      fireConfetti(undefined, undefined, { force: true });
      fireFireworks(4500, { force: true });
      playWin();
      showToast('🥳 Bạn vừa tìm thấy Easter Egg bí mật!', 'success', 5000);
    }
  } else {
    konamiIndex = key === KONAMI_CODE[0] ? 1 : 0;
  }
});

/* ---------- man hinh cho: hat bay + dem nguoc + 3 buoc ---------- */

function setupIntroParticles() {
  const container = document.querySelector('.intro-particles');
  if (!container || container.childElementCount) return;
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

function setStartIcon(name) {
  if (startBtnIcon.dataset.icon === name) return;
  startBtnIcon.dataset.icon = name;
  startBtnIcon.innerHTML = `<i data-lucide="${name}"></i>`;
}

// Chu tren nut "Bat dau" phu thuoc giai doan: dang quiz thi nut dan vao quiz,
// truoc day van ghi "Bat dau boc tham" nen nguoi choi tuong la boc tham ngay.
function updateStartBtnState() {
  startBtn.disabled = !(dataReady && countdownReady);
  const ui = window.UiConfig ? window.UiConfig.current : null;

  if (!countdownReady) {
    startBtnText.textContent = dataReady ? 'Sắp bắt đầu...' : 'Đang tải...';
    setStartIcon('hourglass');
  } else if (!dataReady) {
    startBtnText.textContent = 'Đang tải...';
    setStartIcon('hourglass');
  } else if (currentPhase === 'quiz') {
    startBtnText.textContent = 'Vào vòng Quiz';
    setStartIcon('brain');
  } else {
    startBtnText.textContent = (ui && ui.startButtonText) || 'Bắt đầu bốc thăm';
    setStartIcon('dices');
  }

  introHint.textContent =
    currentPhase === 'quiz'
      ? 'Bước 1: trả lời quiz để chọn ra các Nhóm Trưởng, sau đó mới tới bốc thăm.'
      : randomLocked
        ? 'Vòng bốc thăm đang tạm khóa — bạn vẫn có thể vào xem các nhóm.'
        : 'Các nhóm đang chờ bạn tham gia!';
}

function setStep(step, state, status) {
  const li = eventSteps.querySelector(`[data-step="${step}"]`);
  if (!li) return;
  li.classList.remove('is-done', 'is-current', 'is-locked');
  if (state) li.classList.add(`is-${state}`);
  if (state === 'current') li.setAttribute('aria-current', 'step');
  else li.removeAttribute('aria-current');
  li.querySelector('.event-step-status').textContent = status;
}

function renderEventSteps() {
  const config = lastConfig || {};
  if (currentPhase === 'quiz') {
    setStep('quiz', 'current', config.quizStatus === 'active' ? 'Đang diễn ra' : 'Đang mở phòng chờ');
    setStep('random', '', 'Mở sau khi có Nhóm Trưởng');
  } else {
    setStep('quiz', 'done', (leaders.length ? `${leaders.length} Nhóm Trưởng` : 'Đã xong'));
    setStep('random', randomLocked ? 'locked' : 'current', randomLocked ? 'Đang tạm khóa' : 'Đang mở');
  }
  if (config.roomsLocked) setStep('rooms', 'locked', 'Đang tạm khóa');
  else if (!config.roomCount) setStep('rooms', '', 'Chưa có phòng');
  else setStep('rooms', currentPhase === 'random' ? 'current' : '', 'Đang mở');
}

function startCountdown(targetIso) {
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target) || target <= Date.now()) {
    countdownBlock.classList.add('hidden');
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
      countdownTimer = null;
      countdownBlock.classList.add('hidden');
      countdownReady = true;
      updateStartBtnState();
      fireConfetti();
      fireFireworks();
      announce('Sự kiện đã bắt đầu, mời bạn bấm nút bắt đầu.');
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

function applyRandomLock(locked) {
  randomLocked = !!locked;
  lockNotice.classList.toggle('hidden', !randomLocked || !!lastResult);
  updateRandomForm();
  renderEventSteps();
  updateStartBtnState();
}

function renderLeaderNotice() {
  if (currentPhase !== 'random' || !leaders.length) {
    leaderNotice.classList.add('hidden');
    return;
  }
  leaderNoticeText.innerHTML = `<strong>${leaders.length} Nhóm Trưởng:</strong> ${leaders
    .map((l) => escapeHtml(l.name))
    .join(', ')} — mỗi người sẽ dẫn dắt một nhóm khác nhau.`;
  leaderNotice.classList.remove('hidden');
}

// Doc lai /api/config -> cap nhat giai doan, khoa vong, gio mo, Nhom Truong.
// Dung luc khoi dong, sau khi admin reset va moi lan ket noi lai.
async function syncConfig() {
  try {
    const config = await (window.UiConfig ? window.UiConfig.refresh() : fetchJson('/api/config'));
    if (!config) throw new Error('Không tải được cấu hình');
    lastConfig = config;
    currentPhase = config.phase || 'quiz';
    leaders = Array.isArray(config.leaders) ? config.leaders : [];
    randomLocked = !!config.randomLocked;

    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (config.eventStartAt) {
      startCountdown(config.eventStartAt);
    } else {
      countdownBlock.classList.add('hidden');
      countdownReady = true;
    }
    applyRandomLock(randomLocked);
    renderLeaderNotice();
    return config;
  } catch (err) {
    console.error(err);
    // Khong doc duoc cau hinh thi van cho vao, may chu se tu chan neu chua toi luot
    countdownReady = true;
    return null;
  } finally {
    renderEventSteps();
    updateStartBtnState();
  }
}

function currentScreen() {
  if (!appScreen.classList.contains('hidden')) return 'app';
  if (!quizScreen.classList.contains('hidden')) return 'quiz';
  return 'intro';
}

// Dua trang ve MAN HINH CHO (intro): dung sau khi admin reset, hoac khi admin
// chuyen giai doan nguoc tu random ve quiz.
function backToWaitingScreen() {
  epoch += 1;
  if (rulesModal.open) rulesModal.close();
  hideResult();
  slotMachine.classList.add('hidden');
  hideError();
  pendingRandomName = null;
  isSpinning = false;

  memberSelect.value = '';
  memberSearch.value = '';
  randomBtn.classList.remove('spinning');
  updateRandomForm();

  appScreen.classList.add('hidden');
  quizScreen.classList.add('hidden');
  introScreen.style.display = '';
  introScreen.classList.remove('fade-out');

  if (window.QuizUI && typeof window.QuizUI.reset === 'function') {
    window.QuizUI.reset();
  }
  updateStartBtnState();
  window.scrollTo(0, 0);
}

function leaveIntro() {
  introScreen.classList.add('fade-out');
  setTimeout(() => {
    if (introScreen.classList.contains('fade-out')) introScreen.style.display = 'none';
  }, reducedMotion() ? 0 : 450);
  window.scrollTo(0, 0);
}

function enterAppScreen() {
  leaveIntro();
  quizScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  if (window.QuizUI && typeof window.QuizUI.leave === 'function') window.QuizUI.leave();
}

function enterQuizScreen() {
  leaveIntro();
  appScreen.classList.add('hidden');
  quizScreen.classList.remove('hidden');
  if (window.QuizUI && typeof window.QuizUI.enter === 'function') {
    window.QuizUI.enter();
  }
}

function enterNextScreen() {
  if (currentPhase === 'random') {
    enterAppScreen();
    restoreSavedResult();
  } else {
    enterQuizScreen();
  }
}

/* ---------- ket qua ---------- */

function myGroupFromState(name) {
  if (!name) return null;
  for (const g of groups) {
    const m = (g.members || []).find((x) => x.name === name);
    if (m) return { group: g, member: m };
  }
  return null;
}

function renderResultMates(member, group) {
  const fresh = groups.find((g) => g.id === group.id);
  const mates = ((fresh && fresh.members) || []).filter((m) => m.name !== member.name);
  const showNames = !window.UiConfig || window.UiConfig.flag('showMemberNames', true);
  resultMatesWrap.classList.toggle('hidden', !showNames);
  resultMatesCount.textContent = mates.length ? `(${mates.length})` : '';
  resultMates.innerHTML = mates.length
    ? mates
        .map(
          (m) => `
          <li class="mate-chip${m.isLeader ? ' is-leader' : ''}">
            <span class="avatar" style="background:${hashColor(m.name)}">${escapeHtml(initials(m.name))}</span>
            <span class="name">${escapeHtml(m.name)}</span>${m.isLeader ? '<span class="leader-badge" title="Nhóm trưởng">👑</span>' : ''}
          </li>`
        )
        .join('')
    : '<li class="mate-chip is-empty">Bạn là người đầu tiên của nhóm — chờ đồng đội nhé!</li>';
}

function showResult(member, group, celebrate) {
  const theme = themeForGroup(group);
  lastResult = { member, group, theme };

  resultBox.style.setProperty('--group-color', theme.color);
  resultIcon.textContent = theme.icon;
  resultGroup.textContent = group.name;
  resultName.innerHTML = `${escapeHtml(member.name)}${member.isLeader ? ' <span class="leader-tag">👑 Nhóm Trưởng</span>' : ''}`;
  resultMotto.textContent = `“${group.description || mottoForGroup(group)}”`;
  renderResultMates(member, group);

  resultBox.classList.remove('hidden', 'pop');
  void resultBox.offsetWidth;
  resultBox.classList.add('pop');
  lockNotice.classList.add('hidden');
  updateRandomForm();

  if (celebrate) {
    fireConfetti(theme.color);
    fireFireworks();
    playWin();
    if (!reducedMotion()) {
      appScreen.classList.add('shake');
      setTimeout(() => appScreen.classList.remove('shake'), 500);
    }
    showToast(`🎉 Chúc mừng ${member.name} đã vào ${group.name}!`, 'success');
    resultBox.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }
  announce(`${member.name} thuộc về ${group.name}.`);
}

function hideResult() {
  lastResult = null;
  resultBox.classList.add('hidden');
  lockNotice.classList.toggle('hidden', !randomLocked);
}

// Form boc tham: da co ket qua thi khoa lai voi dung ten cua minh, kem nut
// "Chon ten khac" - truoc day xong luot van bam tiep duoc cho ten nguoi khac.
function updateRandomForm() {
  const hasResult = !!lastResult;
  const busy = isSpinning || !!pendingRandomName;
  memberSelect.disabled = hasResult || busy;
  randomBtn.disabled = hasResult || busy || randomLocked;
  randomBtnText.textContent = hasResult
    ? 'Bạn đã có nhóm'
    : busy
      ? 'Đang quay...'
      : randomLocked
        ? 'Đang tạm khóa'
        : 'Random ngay';
  notMeBtn.classList.toggle('hidden', !hasResult || busy);
}

// Sau moi lan tai lai danh sach nhom: doi chieu ket qua dang hien voi du lieu moi.
// Admin chuyen nhom / xao lai / xoa ket qua thi o ket qua cung phai doi theo.
function reconcileResult() {
  if (isSpinning || pendingRandomName) return;
  const myName = localStorage.getItem(STORAGE_KEY);
  if (!myName || currentScreen() !== 'app') return;

  const found = myGroupFromState(myName);
  if (found) {
    const me = { name: myName, isLeader: !!found.member.isLeader, id: found.member.id };
    if (!lastResult) {
      showResult(me, found.group, false);
    } else if (lastResult.group.id !== found.group.id) {
      showToast(`ℹ️ Admin đã chuyển bạn sang ${found.group.name}`, 'info', 5000);
      showResult(me, found.group, false);
    } else {
      // Cung nhom: chi cap nhat danh sach dong doi, khong chay lai hieu ung
      lastResult.member = me;
      lastResult.group = found.group;
      renderResultMates(me, found.group);
    }
    return;
  }

  if (lastResult) {
    hideResult();
    localStorage.removeItem(STORAGE_KEY);
    memberSelect.value = myName;
    updateRandomForm();
    showToast('ℹ️ Kết quả bốc thăm của bạn vừa được Admin xóa — bấm Random để bốc lại nhé.', 'info', 6000);
  }
}

function buildReelIcons(targetIcon) {
  const pool = groups.length ? groups.map((g) => themeForGroup(g).icon) : GROUP_THEMES.map((t) => t.icon);
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
    void stripEl.offsetHeight;

    const finalOffset = (icons.length - 1) * REEL_ITEM_HEIGHT;
    // pha 1: quay nhanh deu tay qua phan lon dai icon; pha 2: cham dan va dung o icon trung
    const phase1Offset = Math.round((finalOffset * 0.55) / REEL_ITEM_HEIGHT) * REEL_ITEM_HEIGHT;
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
    setTimeout(startPhase2, phase1Duration + 300);
  });
}

function runSlotMachine(theme) {
  slotMachine.classList.remove('hidden');
  // Giam chuyen dong: van hien 3 cot nhung dung gan nhu ngay lap tuc
  const durations = reducedMotion() ? [240, 280, 320] : REEL_DURATIONS;
  return Promise.all(reelStripEls.map((el, i) => spinReel(el, theme.icon, durations[i])));
}

function effectsAllowed(opts) {
  if (opts && opts.force) return true;
  if (reducedMotion()) return false;
  return !window.UiConfig || window.UiConfig.flag('confettiEnabled', true);
}

function fireConfetti(color1, color2, opts) {
  if (!effectsAllowed(opts)) return;
  const ctx = confettiCanvas.getContext('2d');
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  confettiCanvas.classList.remove('hidden');

  const colors = [color1 || '#2563eb', color2 || '#f59e0b', '#1d4ed8', '#60a5fa', '#f472b6', '#ffffff'];
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

function fireFireworks(durationMs = 3200, opts) {
  if (!effectsAllowed(opts)) return;
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

// Cho quiz.js dung chung (chuc mung khi xong bai / khi duoc chon lam Nhom Truong)
window.fireConfetti = fireConfetti;
window.fireFireworks = fireFireworks;

/* ---------- anh ket qua de chia se ---------- */

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
  const font = '"Be Vietnam Pro", "Segoe UI", sans-serif';

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1e1b4b');
  grad.addColorStop(1, theme.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  ctx.textAlign = 'center';
  ctx.font = '160px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.fillText(theme.icon, W / 2, 280);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 28px ${font}`;
  ctx.fillText('BẠN THUỘC VỀ', W / 2, 380);

  ctx.font = `800 52px ${font}`;
  wrapText(ctx, group.name, W / 2, 460, W - 160, 62);

  ctx.font = `600 34px ${font}`;
  ctx.fillText(`${member.name}${member.isLeader ? ' 👑' : ''}`, W / 2, 630);

  ctx.font = `400 22px ${font}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('DIMACO • Random Chia Nhóm', W / 2, H - 70);
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
    // Thu hoi ngay sau click() co the huy tai xuong tren Safari/Firefox
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
});

// Clipboard API chi co tren https/localhost. Mo qua IP mang noi bo (http) thi
// dung cach cu: chon chu trong 1 o an roi copy.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('copy failed');
}

copyResultBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  const text = `${lastResult.member.name} thuộc về ${lastResult.group.name} 🎉 (DIMACO Random Chia Nhóm)`;
  try {
    await copyText(text);
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
      /* nguoi dung dong bang chia se */
    }
    return;
  }
  try {
    await copyText(`${text} - ${window.location.href}`);
    showToast('Trình duyệt không hỗ trợ chia sẻ, đã copy link!', 'success');
  } catch (err) {
    showToast('Không thể chia sẻ', 'error');
  }
});

/* ---------- bang xep hang + hoat dong ---------- */

function renderLeaderboard() {
  const sorted = [...groups].sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0));
  const max = Math.max(1, ...sorted.map((g) => g.members?.length || 0));
  const medals = ['🥇', '🥈', '🥉'];

  leaderboardList.innerHTML = sorted
    .map((g, i) => {
      const count = g.members ? g.members.length : 0;
      const pct = Math.round((count / max) * 100);
      const color = themeForGroup(g).color;
      return `
        <li class="leaderboard-row">
          <span class="leaderboard-rank">${count ? medals[i] || i + 1 : i + 1}</span>
          <div class="leaderboard-info">
            <div class="leaderboard-top">
              <span class="leaderboard-name">${escapeHtml(g.name)}</span>
              <span class="leaderboard-count num">${count}${g.effectiveCapacity ? `/${g.effectiveCapacity}` : ''} người</span>
            </div>
            <div class="leaderboard-bar"><div class="leaderboard-bar-fill" style="width:${pct}%;background:${color}"></div></div>
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
          <span class="activity-time num">${formatTime(a.at)}</span>
          <span>${escapeHtml(a.message)}</span>
        </li>`
    )
    .join('');
}

// Socket gui dang {member, group, at}; doi sang dang nhat ky trong DB ({message, at})
function addActivity(entry) {
  if (!entry || !entry.member || !entry.group) return;
  activityData.unshift({
    type: 'random',
    icon: 'dices',
    at: entry.at,
    message: `${entry.member.name}${entry.member.isLeader ? ' 👑' : ''} vào ${entry.group.name}`,
  });
  if (activityData.length > MAX_ACTIVITY) {
    activityData.length = MAX_ACTIVITY;
  }
  renderActivity();
}

/* ---------- nhom + tien do ---------- */

function updateProgress() {
  const assigned = groups.reduce((sum, g) => sum + (g.members ? g.members.length : 0), 0);
  const total = Math.max(totalMembersCount, assigned);
  const pct = total ? Math.round((assigned / total) * 100) : 0;
  progressText.textContent = `Đã bốc thăm ${assigned}/${total} người`;
  progressPct.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', String(pct));

  const remaining = Math.max(0, total - assigned);
  remainingText.textContent = !total
    ? ''
    : remaining > 0
      ? `⏳ Còn ${remaining}/${total} người chưa bốc thăm`
      : `🎉 Tất cả ${total} người đã bốc thăm xong!`;
}

function renderGroupsPreview() {
  groupsPreview.innerHTML = groups
    .map((g) => {
      const theme = themeForGroup(g);
      const full = g.isFull && g.effectiveCapacity;
      return `<span class="preview-chip${g.locked || full ? ' is-closed' : ''}"><span class="preview-dot" style="background:${theme.color}"></span><span aria-hidden="true">${theme.icon}</span><span>${escapeHtml(g.name)}</span>${
        g.locked ? '<span class="preview-flag">khóa</span>' : full ? '<span class="preview-flag">đủ người</span>' : ''
      }</span>`;
    })
    .join('');
}

function renderGroups() {
  const myName = localStorage.getItem(STORAGE_KEY);
  const showNames = !window.UiConfig || window.UiConfig.flag('showMemberNames', true);
  const flippedIds = new Set(
    [...groupsGrid.querySelectorAll('.group-card.flipped')].map((card) => card.dataset.groupId)
  );

  groupsGrid.innerHTML = groups
    .map((group) => {
      const theme = themeForGroup(group);
      const members = group.members || [];
      const capText = group.effectiveCapacity ? `${members.length}/${group.effectiveCapacity}` : `${members.length}`;
      const memberItems = !showNames
        ? '<li class="member-chip empty">Danh sách thành viên đang được ẩn</li>'
        : members.length
          ? members
              .map((m) => {
                const isMe = m.name === myName;
                const leaderBadge = m.isLeader ? '<span class="leader-badge" title="Nhóm trưởng">👑</span>' : '';
                return `
                <li class="member-chip ${isMe ? 'me' : ''} ${m.isLeader ? 'is-leader' : ''}">
                  <span class="avatar" style="background:${hashColor(m.name)}">${escapeHtml(initials(m.name))}</span>
                  <span class="name">${escapeHtml(m.name)}${isMe ? ' <small>(bạn)</small>' : ''}${leaderBadge}</span>
                </li>`;
              })
              .join('')
          : '<li class="member-chip empty">Chưa có thành viên</li>';

      return `
        <article class="group-card${group.locked ? ' is-locked' : ''}" style="--accent:${theme.color}" data-group-id="${group.id}">
          <div class="group-card-inner">
            <div class="group-card-face front">
              <div class="group-card-top">
                <span class="group-icon" aria-hidden="true">${theme.icon}</span>
                <div class="group-card-heading">
                  <h2>${escapeHtml(group.name)}</h2>
                  ${group.description ? `<p class="group-desc">${escapeHtml(group.description)}</p>` : ''}
                </div>
                <button type="button" class="group-flip-btn" aria-pressed="false" aria-label="Xem slogan của ${escapeHtml(group.name)}">
                  <i data-lucide="message-square-quote"></i>
                </button>
              </div>
              <div class="group-card-meta">
                <span class="member-count-badge num">${capText} thành viên</span>
                ${group.locked ? '<span class="group-lock-badge"><i data-lucide="lock"></i> Đang khóa</span>' : ''}
              </div>
              <ul class="member-list">${memberItems}</ul>
            </div>
            <div class="group-card-face back" aria-hidden="true">
              <span class="group-card-back-icon">${theme.icon}</span>
              <p class="group-card-motto">“${escapeHtml(mottoForGroup(group))}”</p>
              <p class="group-card-back-hint">Bấm lại để quay về</p>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  groupsGrid.querySelectorAll('.group-card').forEach((card) => {
    const btn = card.querySelector('.group-flip-btn');
    const back = card.querySelector('.group-card-face.back');
    const setFlipped = (flipped) => {
      card.classList.toggle('flipped', flipped);
      btn.setAttribute('aria-pressed', flipped ? 'true' : 'false');
      back.setAttribute('aria-hidden', flipped ? 'false' : 'true');
    };
    if (flippedIds.has(card.dataset.groupId)) setFlipped(true);
    card.addEventListener('click', () => {
      setFlipped(!card.classList.contains('flipped'));
      playClick();
    });
  });

  updateProgress();
  renderLeaderboard();
  renderGroupsPreview();
  applySearchFilter();
}

/* ---------- tim thanh vien ---------- */

function applySearchFilter() {
  const q = memberSearch.value.trim().toLowerCase();
  groupsGrid.querySelectorAll('.group-card').forEach((card) => {
    let hasMatch = false;
    card.querySelectorAll('.member-chip').forEach((chip) => {
      const nameEl = chip.querySelector('.name');
      if (!nameEl || !q) {
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

// Cap nhat state cuc bo tu payload realtime thay vi goi lai /api/groups:
// N nguoi random x N client cung fetch lai thi server va trinh duyet deu ngop.
function applyMemberRandomized(payload) {
  if (!payload || !payload.member || !payload.group) return false;
  const group = groups.find((g) => g.id === payload.group.id);
  if (!group) return false;

  group.members = group.members || [];
  if (group.members.some((m) => m.id === payload.member.id)) {
    return true;
  }

  group.members.push({
    id: payload.member.id,
    name: payload.member.name,
    isLeader: !!payload.member.isLeader,
  });
  group.members.sort((a, b) => (b.isLeader ? 1 : 0) - (a.isLeader ? 1 : 0) || a.name.localeCompare(b.name));
  if (group.effectiveCapacity) group.isFull = group.members.length >= group.effectiveCapacity;
  renderGroups();
  if (lastResult && lastResult.group.id === group.id) renderResultMates(lastResult.member, lastResult.group);
  return true;
}

// So thu tu request: phan hoi cua request cu ve sau request moi thi bo qua
let groupsSeq = 0;
async function loadGroups() {
  const seq = ++groupsSeq;
  try {
    const data = await fetchJson('/api/groups');
    if (seq !== groupsSeq || !Array.isArray(data)) return;
    groups = data;
    renderGroups();
    reconcileResult();
  } catch (err) {
    console.error(err);
    if (seq === groupsSeq && !groups.length) {
      groupsGrid.innerHTML = '<p class="groups-error">Không tải được danh sách nhóm — đang thử lại khi có kết nối.</p>';
    }
  }
}

let membersSeq = 0;
async function loadMembers() {
  const seq = ++membersSeq;
  try {
    // scope=random: server loc san, ai bi admin tat quyen se khong thay ten minh o day
    const members = await fetchJson('/api/members?scope=random');
    if (seq !== membersSeq || !Array.isArray(members)) return;
    totalMembersCount = members.length;

    // Giu lua chon dang do cua nguoi dung khi danh sach duoc tai lai
    const keep = memberSelect.value || localStorage.getItem(STORAGE_KEY) || '';
    memberSelect.replaceChildren(new Option('-- Chọn tên --', ''), ...members.map((m) => new Option(m.name, m.name)));
    if (keep && members.some((m) => m.name === keep)) memberSelect.value = keep;

    updateProgress();
  } catch (err) {
    console.error(err);
  }
}

async function loadActivity() {
  try {
    const data = await fetchJson('/api/activity?type=random');
    activityData = Array.isArray(data) ? data : [];
    renderActivity();
  } catch (err) {
    console.error(err);
  }
}

function loadAll() {
  return Promise.all([loadGroups(), loadMembers(), loadActivity()]);
}

// Nhieu su kien admin den cung luc (groups:updated + members:updated) -> gop 1 lan tai
let reloadTimer = null;
function scheduleReload({ members = false } = {}) {
  scheduleReload.members = scheduleReload.members || members;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    const withMembers = scheduleReload.members;
    scheduleReload.members = false;
    loadGroups();
    if (withMembers) loadMembers();
  }, 180);
}

/* ---------- luot boc tham ---------- */

async function doRandom(name) {
  const myEpoch = epoch;
  pendingRandomName = name;
  hideError();
  updateRandomForm();
  randomBtn.classList.add('spinning');

  try {
    const data = await fetchJson('/api/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (myEpoch !== epoch) return;

    const celebrate = !data.alreadyRandomized;
    if (celebrate) {
      isSpinning = true;
      hideResult();
      updateRandomForm();
      playSpin();
      await runSlotMachine(themeForGroup(data.group));
      if (myEpoch !== epoch) return; // admin reset giua luc dang quay
    }

    localStorage.setItem(STORAGE_KEY, data.member.name);
    isSpinning = false;
    await loadGroups();
    if (myEpoch !== epoch) return;
    // Doi chieu voi du lieu moi nhat (admin co the vua chuyen nhom trong luc quay);
    // neu da bi xoa thi lan tai nhom ke tiep reconcileResult se an ket qua di.
    const found = myGroupFromState(data.member.name);
    const group = found ? found.group : data.group;
    const member = { ...data.member, isLeader: found ? !!found.member.isLeader : !!data.member.isLeader };
    showResult(member, group, celebrate);
    if (!celebrate) {
      showToast(`Bạn đã bốc thăm trước đó — vẫn là ${group.name} nhé!`, 'info', 4000);
    }
  } catch (err) {
    if (myEpoch !== epoch) return;
    slotMachine.classList.add('hidden');
    if (err.data && err.data.locked) applyRandomLock(true);
    showError(err.status ? err.message : 'Không thể kết nối máy chủ');
  } finally {
    if (myEpoch === epoch) {
      isSpinning = false;
      pendingRandomName = null;
      randomBtn.classList.remove('spinning');
      updateRandomForm();
    }
  }
}

// Mo lai ket qua da boc (ten luu trong localStorage) bang cach TRA CUU danh sach nhom.
// Truoc day goi lai POST /api/random: ai vua bi admin xoa ket qua ma tai lai trang
// thi bi boc tham lai luon, khong can bam gi.
function restoreSavedResult() {
  const myName = localStorage.getItem(STORAGE_KEY);
  if (!myName || currentPhase !== 'random') return false;
  const found = myGroupFromState(myName);
  if (found) {
    memberSelect.value = myName;
    showResult({ id: found.member.id, name: myName, isLeader: !!found.member.isLeader }, found.group, false);
    return true;
  }
  localStorage.removeItem(STORAGE_KEY);
  if ([...memberSelect.options].some((o) => o.value === myName)) memberSelect.value = myName;
  updateRandomForm();
  return false;
}

randomBtn.addEventListener('click', () => {
  const name = memberSelect.value;
  if (!name) {
    showError('Vui lòng chọn tên của bạn trước khi random');
    memberSelect.focus();
    return;
  }
  if (randomLocked) {
    showError('Vòng chia nhóm đang tạm khóa — chờ Admin mở lại nhé');
    return;
  }
  playClick();
  doRandom(name);
});

notMeBtn.addEventListener('click', () => {
  playClick();
  localStorage.removeItem(STORAGE_KEY);
  hideResult();
  slotMachine.classList.add('hidden');
  memberSelect.value = '';
  updateRandomForm();
  renderGroups();
  memberSelect.focus();
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

/* ---------- realtime ---------- */

// Chuyen man hinh theo giai doan moi. Dung cho phase:updated va khi dong bo lai
// sau mat ket noi (luc do co the da bo lo phase:updated).
function followPhase(prevPhase, { fromEvent = false } = {}) {
  const screen = currentScreen();

  if (currentPhase === 'quiz' && screen === 'app') {
    backToWaitingScreen();
    showToast('🔄 Admin đã mở lại vòng Quiz — mời mọi người vào lại từ đầu', 'info', 5000);
    return;
  }

  if (currentPhase === 'random' && screen === 'quiz') {
    const quizName = window.QuizUI && window.QuizUI.currentName ? window.QuizUI.currentName() : '';
    enterAppScreen();
    loadAll().then(() => {
      if (!localStorage.getItem(STORAGE_KEY) && quizName) memberSelect.value = quizName;
      restoreSavedResult();
    });
    if (fromEvent || prevPhase !== currentPhase) {
      const names = leaders.map((l) => l.name);
      const amLeader = quizName && names.includes(quizName);
      fireConfetti();
      fireFireworks();
      playWin();
      showToast(
        amLeader
          ? `👑 Chúc mừng! Bạn là một trong ${names.length} Nhóm Trưởng. Bấm Random để vào nhóm của mình!`
          : names.length
            ? `👑 ${names.length} Nhóm Trưởng đã được chốt: ${names.join(', ')}. Mời mọi người bốc thăm!`
            : '🎲 Vòng bốc thăm đã mở — mời mọi người bấm Random!',
        'success',
        7000
      );
    }
  }
}

socket.on('phase:updated', (payload) => {
  if (!payload) return;
  const prev = currentPhase;
  currentPhase = payload.phase;
  leaders = Array.isArray(payload.leaders) ? payload.leaders : leaders;
  if (lastConfig) lastConfig.phase = currentPhase;
  renderLeaderNotice();
  renderEventSteps();
  updateStartBtnState();
  if (prev !== currentPhase) followPhase(prev, { fromEvent: true });
});

socket.on('config:updated', () => {
  // Doc lai tu server thay vi tin payload, de lay ca giai doan lan gio mo moi nhat
  syncConfig();
});

// Admin khoa / mo vong chia nhom -> nut Random doi ngay, khong doi bam moi biet
socket.on('random:config', (payload) => {
  const locked = !!(payload && payload.locked);
  if (locked === randomLocked) return;
  applyRandomLock(locked);
  if (currentScreen() === 'app' && !lastResult) {
    showToast(locked ? '🔒 Admin vừa tạm khóa vòng chia nhóm' : '🔓 Vòng chia nhóm đã mở lại — bấm Random thôi!', 'info', 4000);
  }
});

socket.on('rooms:config', (payload) => {
  if (lastConfig) lastConfig.roomsLocked = !!(payload && payload.locked);
  renderEventSteps();
});

socket.on('rooms:updated', (payload) => {
  if (lastConfig && payload && Array.isArray(payload.rooms)) {
    lastConfig.roomCount = payload.rooms.length;
    renderEventSteps();
  }
});

socket.on('quiz:started', () => {
  if (lastConfig) lastConfig.quizStatus = 'active';
  renderEventSteps();
});

socket.on('member:randomized', (payload) => {
  addActivity(payload);
  if (!isSpinning) {
    if (!applyMemberRandomized(payload)) {
      scheduleReload();
    }
  }
  if (!payload || !payload.member) return;
  const myName = localStorage.getItem(STORAGE_KEY);
  const isSelf = payload.member.name === myName || payload.member.name === pendingRandomName;
  if (!isSelf && currentScreen() === 'app') {
    // Luc cao diem ca phong random cung luc: gop vao 1 toast cap nhat tai cho
    window.Toast.stream(
      'member-randomized',
      { name: payload.member.name, group: payload.group.name },
      (items) => {
        if (items.length === 1) {
          return `🎲 ${items[0].name} vừa random vào ${items[0].group}`;
        }
        const recent = items.slice(-3).map((i) => i.name).reverse();
        const rest = items.length - recent.length;
        return `🎲 ${items.length} người vừa random: ${recent.join(', ')}${rest > 0 ? ` và ${rest} người nữa` : ''}`;
      },
      { duration: 2800 }
    );
  }
});

// Admin sua danh sach nhom / thanh vien ben trang admin -> cap nhat luon o day
socket.on('groups:updated', () => scheduleReload());
socket.on('members:updated', () => scheduleReload({ members: true }));

socket.on('activity:cleared', () => {
  activityData = [];
  renderActivity();
});

// Admin reset. scope:
//  - 'all'    (Reset toan bo / phuc hoi du lieu): moi nguoi ve man hinh cho
//  - 'quiz'   (Lam lai vong Quiz): ve vong quiz, KHONG mat ket qua chia nhom tren may chu
//  - 'groups' (Xoa ket qua chia nhom): chi nguoi dang xem ket qua bi anh huong
socket.on('groups:reset', async (payload) => {
  const scope = (payload && payload.scope) || 'all';

  if (scope === 'groups') {
    scheduleReload({ members: true });
    return;
  }

  if (scope === 'all') {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(QUIZ_NAME_KEY);
  }
  const wasOnQuiz = currentScreen() === 'quiz';
  backToWaitingScreen();
  if (payload && payload.phase) currentPhase = payload.phase;

  // Tai lai du lieu roi moi mo nut "Bat dau" - tranh bam luc danh sach chua kip ve
  dataReady = false;
  updateStartBtnState();
  await loadAll();
  dataReady = true;
  await syncConfig();

  if (scope === 'quiz' && wasOnQuiz && currentPhase === 'quiz') {
    // Dang lam quiz thi dua thang ve phong cho voi ten cu, khong bat chon lai
    enterQuizScreen();
    showToast('🔄 Admin vừa làm lại vòng Quiz — bạn đã được đưa về phòng chờ', 'info', 5000);
    return;
  }
  showToast(
    scope === 'quiz' ? '🔄 Admin vừa làm lại vòng Quiz — mời mọi người vào lại' : '🔄 Admin vừa reset — mời mọi người bắt đầu lại từ đầu',
    'info',
    5000
  );
});

// Mat ket noi (khoa man hinh dien thoai, rot wifi) thi co the bo lo phase:updated,
// quiz:started... -> ket noi lai la dong bo lai toan bo va di theo giai doan moi.
let hasConnectedOnce = false;
socket.on('connect', async () => {
  if (!hasConnectedOnce) {
    hasConnectedOnce = true;
    return;
  }
  const prev = currentPhase;
  await syncConfig();
  loadAll();
  followPhase(prev);
  if (window.QuizUI && typeof window.QuizUI.resync === 'function') window.QuizUI.resync();
});

// Quay lai tab sau mot luc (vd mo khoa dien thoai): socket co the van "song" nhung
// da bo lo su kien -> dong bo lai nhe nhang, toi da 1 lan moi 20 giay
let lastHiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    lastHiddenAt = Date.now();
    return;
  }
  if (!lastHiddenAt || Date.now() - lastHiddenAt < 20000) return;
  const prev = currentPhase;
  await syncConfig();
  loadAll();
  followPhase(prev);
  if (window.QuizUI && typeof window.QuizUI.resync === 'function') window.QuizUI.resync();
});

/* ---------- cau hinh admin (am thanh mac dinh, an ten thanh vien...) ---------- */

if (window.UiConfig) {
  window.UiConfig.onChange((ui) => {
    // Am thanh: nguoi dung chua tu chon thi theo mac dinh admin dat
    if (storedSoundChoice() === null && typeof ui.soundEnabled === 'boolean') {
      soundMuted = !ui.soundEnabled;
      updateSoundBtn();
    }
    updateStartBtnState();
    if (dataReady) {
      renderGroups();
      if (lastResult) renderResultMates(lastResult.member, lastResult.group);
    }
  });
}

/* ---------- khoi dong ---------- */

(async function init() {
  // Hai co nay quyet dinh nut "Bat dau" bam duoc hay khong, nen phai duoc dat bat
  // ke nguoi dung dang o man nao.
  const dataPromise = loadAll().then(() => {
    dataReady = true;
    updateStartBtnState();
  });

  setupIntroParticles();

  await syncConfig();
  window.UiConfig.bind(socket);
  if (window.VersionGuard) window.VersionGuard.bind(socket);

  const myName = localStorage.getItem(STORAGE_KEY);
  // Chi vao thang ket qua khi DANG o vong random. Dang quiz (vd admin vua reset
  // ve quiz luc minh offline) thi o lai man hinh cho, tranh ket o loi 403.
  if (myName && currentPhase === 'random') {
    introScreen.style.display = 'none';
    appScreen.classList.remove('hidden');
    await dataPromise;
    restoreSavedResult();
    return;
  }

  updateStartBtnState();
})();
