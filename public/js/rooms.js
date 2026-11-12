// Trang ghep phong ngu: moi nguoi nhan phong 1 lan, he thong chi xep vao phong dung
// gioi tinh, khong bi khoa va con cho. Chay doc lap voi main.js (trang nay khong co
// cac phan tu cua trang chu) nen tu khai bao vai helper nho rieng.
//
// Hai cach nhan phong (admin chon o trang Su kien / Phong ngu):
//   - 'random': bam "Quay ghep phong", vong quay dung o phong he thong boc ngau nhien
//   - 'choose': bam "Chon phong nay" tren the phong con cho (dung gioi tinh), hoac
//               bam "Xep ngau nhien giup toi" neu o dau cung duoc
//
// Nguon du lieu:
//   - rooms[]   : danh sach phong kem nguoi o (GET /api/rooms hoac socket rooms:updated)
//   - members[] : nguoi DUOC PHEP ghep phong (GET /api/members?scope=room)
// "Ai da co phong" luon suy ra tu rooms[].members, KHONG dung members[].roomId vi
// truong do chi tai lai khi reload -> sau moi luot nhan phong se bi cu.

const socket = io();

// Khoa rieng cho trang ghep phong. KHONG dung chung 'randomTeam_myName' cua trang
// chia nhom: dung chung thi vao trang chu se tu boc tham nhom cho ten chon o day.
const NAME_KEY = 'randomTeam_roomName';
const REEL_ITEM_HEIGHT = 88; // dong bo voi --reel-h trong rooms.css
const REEL_LENGTH = 16;
const RELOAD_DEBOUNCE_MS = 150;
const PENDING_PREVIEW = 8; // dien thoai: so nguoi chua ghep hien san truoc khi bam "Xem them"
const RESYNC_AFTER_HIDDEN_MS = 20000;

const memberSelect = document.getElementById('roomsMemberSelect');
const drawBtn = document.getElementById('roomsDrawBtn');
const meLine = document.getElementById('roomsMyGender');
const noticeBox = document.getElementById('roomsNotice');
const errorBox = document.getElementById('roomsError');
const jumpBtn = document.getElementById('roomsJumpBtn');
const reel = document.getElementById('roomsReel');
const reelStrip = document.getElementById('roomsReelStrip');
const resultBox = document.getElementById('roomsResult');
const roundChip = document.getElementById('roomsRoundChip');
const spinIcon = document.getElementById('roomsSpinIcon');
const spinTitle = document.getElementById('roomsSpinTitle');
const spinDesc = document.getElementById('roomsSpinDesc');
const roomsList = document.getElementById('roomsList');
const roomsStats = document.getElementById('roomsStats');
const noGenderLine = document.getElementById('roomsNoGender');
const pendingCard = document.getElementById('roomsPendingCard');
const pendingCount = document.getElementById('roomsPendingCount');
const pendingList = document.getElementById('roomsPendingList');
const progressText = document.getElementById('roomsProgressText');
const progressPct = document.getElementById('roomsProgressPct');
const progressBar = document.getElementById('roomsProgressBar');
const progressFill = document.getElementById('roomsProgressFill');
const onlineCount = document.getElementById('onlineCount');
const mainBlock = document.getElementById('roomsMain');
const closedCard = document.getElementById('roomsClosed');
const loadErrorBox = document.getElementById('roomsLoadError');
const loadErrorText = document.getElementById('roomsLoadErrorText');
const retryBtn = document.getElementById('roomsRetryBtn');
const brandLink = document.getElementById('roomsBrandLink');
const confettiCanvas = document.getElementById('roomsConfetti');
const confirmDialog = document.getElementById('roomsConfirm');
const confirmBody = document.getElementById('roomsConfirmBody');
const confirmTitle = document.getElementById('roomsConfirmTitle');
const confirmCancel = document.getElementById('roomsConfirmCancel');

const GENDER_SECTIONS = [
  // icon: emoji dung trong noi dung vui (vong quay, toast)
  // lucide: ky hieu net dung trong phan giao dien
  { gender: 'FEMALE', icon: '👩', lucide: 'venus', label: 'Nữ', tone: 'female' },
  { gender: 'MALE', icon: '👨', lucide: 'mars', label: 'Nam', tone: 'male' },
];
const UNKNOWN_GENDER = { gender: null, icon: '❔', lucide: 'circle-help', label: 'Chưa đặt', tone: 'none' };

const PICK_COPY = {
  random: {
    icon: 'dices',
    title: 'Quay phòng của bạn',
    desc: 'Mỗi người chỉ quay một lần — tải lại trang vẫn giữ đúng phòng đã quay.',
  },
  choose: {
    icon: 'door-open',
    title: 'Chọn phòng của bạn',
    desc: 'Chọn tên, rồi bấm “Chọn phòng này” ở phòng bạn muốn. Mỗi người chọn một lần — muốn đổi thì nhờ admin.',
  },
};

let members = [];
let membersLoaded = false;
let rooms = [];
let roomsLoaded = false;
let serverStats = null;
let locked = false;
let pageOpen = true;
let pickMode = 'random';
let eventMode = 'full';
// Dang quay / dang gui yeu cau chon phong: khoa nut va hoan ve lai cho toi khi xong
let isBusy = false;
let renderDeferred = false;
let booted = false;
let firstRoomsPaint = true;

// Chong du lieu cu de len du lieu moi: moi lan lay du lieu (fetch hoac socket)
// nhan 1 so thu tu; fetch tra ve muon ma co ban moi hon da ap dung thi bo.
let dataSeq = 0;
let roomsAppliedSeq = 0;
let membersAppliedSeq = 0;
let lockedSeq = 0;
// Cac ban va 1 phong (tu luot nhan phong) - ap lai len snapshot fetch cu hon chung
let recentPatches = [];

let reloadTimer = null;
let mineToastTimer = null;
let lastResetAt = 0;
let lastResultKey = '';
let drawLabelKey = '';
let pendingExpanded = false;
let confettiRaf = 0;

const reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const collator = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('vi', { sensitivity: 'base' }) : null;

/* ---------- helper ---------- */

function ic(name, className) {
  return `<i data-lucide="${name}"${className ? ` class="${className}"` : ''}></i>`;
}

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(str) {
  return (str === null || str === undefined ? '' : String(str)).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0] ? parts[0][0] : '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Nguoi Viet tim ten minh theo TEN GOI (chu cuoi), khong theo ho: xep "Nguyễn Minh
// Cường" canh "Huỳnh Quang Thắng" theo C/T thay vi ca chuc nguoi ho Nguyễn dinh nhau.
function givenName(name) {
  const parts = String(name).trim().split(/\s+/);
  return parts[parts.length - 1] || '';
}

function compareNames(a, b) {
  if (!collator) return String(a).localeCompare(String(b));
  return collator.compare(givenName(a), givenName(b)) || collator.compare(a, b);
}

function genderMeta(gender) {
  return GENDER_SECTIONS.find((s) => s.gender === gender) || UNKNOWN_GENDER;
}

function genderChip(gender) {
  const meta = genderMeta(gender);
  const cls = meta.tone === 'none' ? 'is-muted' : `is-${meta.tone}`;
  return `<span class="chip ${cls}">${ic(meta.lucide)} ${meta.label}</span>`;
}

function avatarHtml(name) {
  return `<span class="rm-avatar" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}

function locationHtml(room, className) {
  return room.location
    ? `<span class="${className || 'room-card-loc'}">${ic('map-pin')} ${escapeHtml(room.location)}</span>`
    : '';
}

function prefersReducedMotion() {
  return !!(reduceMotionQuery && reduceMotionQuery.matches);
}

function readStoredName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch (err) {
    return '';
  }
}

function storeName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch (err) {
    /* che do rieng tu: bo qua, chi mat tinh nang nho ten */
  }
}

// Logic toast nam trong js/toast.js (load truoc file nay): gioi han so toast
// hien cung luc, gop toast trung noi dung, gop su kien realtime.
function showToast(message, type, duration, opts) {
  return window.Toast.show(message, type, duration, opts);
}

function showError(message) {
  errorBox.textContent = message;
}

function clearError() {
  errorBox.textContent = '';
}

function showLoadError(message) {
  loadErrorText.textContent = message;
  loadErrorBox.hidden = false;
}

function clearLoadError() {
  loadErrorBox.hidden = true;
}

function myName() {
  return memberSelect.value;
}

function findMember(name) {
  return members.find((m) => m.name === name) || null;
}

function roomOf(name) {
  if (!name) return null;
  return rooms.find((room) => room.members.some((m) => m.name === name)) || null;
}

// Tap id nhung nguoi dang co phong - suy tu rooms[].members
function roomedIds() {
  const ids = new Set();
  rooms.forEach((room) => room.members.forEach((m) => ids.add(m.id)));
  return ids;
}

// Giong pickRoom() phia server: dung gioi tinh, khong khoa, con cho
function isAvailable(room) {
  return !room.locked && room.occupancy < room.capacity;
}

function normalizeRoom(room) {
  const list = Array.isArray(room.members) ? room.members : [];
  return {
    ...room,
    location: room.location || null,
    members: list,
    occupancy: list.length,
    freeSlots: Math.max(0, room.capacity - list.length),
    isFull: list.length >= room.capacity,
  };
}

/* ---------- so lieu ---------- */

function emptyGenderStats() {
  return { members: 0, assigned: 0, rooms: 0, capacity: 0, free: 0, lockedRooms: 0 };
}

// Tinh lai so lieu tu members + rooms dang hien thi de moi con so luon khop voi
// danh sach phong (ke ca ngay sau 1 luot nhan phong, khi chua co rooms:updated).
// Chua tai duoc members thi dung so lieu server gui kem.
function computeStats() {
  const byGender = { MALE: emptyGenderStats(), FEMALE: emptyGenderStats() };

  rooms.forEach((room) => {
    const g = byGender[room.gender];
    if (!g) return;
    g.rooms += 1;
    g.capacity += room.capacity;
    if (room.locked) g.lockedRooms += 1;
    else g.free += Math.max(0, room.capacity - room.occupancy);
  });

  if (!membersLoaded && serverStats) {
    Object.keys(byGender).forEach((key) => {
      const s = (serverStats.byGender || {})[key] || {};
      byGender[key].members = s.members || 0;
      byGender[key].assigned = s.assigned || 0;
    });
    return {
      eligible: serverStats.eligible !== undefined ? serverStats.eligible : serverStats.totalMembers || 0,
      assigned: serverStats.assigned || 0,
      pending: serverStats.pending || 0,
      noGender: serverStats.noGender || 0,
      byGender,
    };
  }

  const roomed = roomedIds();
  let assigned = 0;
  let pending = 0;
  let noGender = 0;
  members.forEach((m) => {
    const has = roomed.has(m.id);
    if (has) assigned += 1;
    else if (m.gender) pending += 1;
    else noGender += 1;

    const g = byGender[m.gender];
    if (g) {
      g.members += 1;
      if (has) g.assigned += 1;
    }
  });

  return { eligible: members.length, assigned, pending, noGender, byGender };
}

/* ---------- ve lai theo khoa (muot, khong nhay) ---------- */

// Chi thay nhung phan tu co noi dung doi; phan tu giu nguyen thi khong dung toi.
// Truoc day moi luot nhan phong la ve lai CA danh sach bang innerHTML: the nhay,
// thanh tien do khong chay, nut dang focus mat focus.
// items: [{ key, html, onCreate(el, oldEl) }]
function patchKeyed(container, items) {
  const existing = new Map();
  [...container.children].forEach((child) => {
    if (child.dataset.key) existing.set(child.dataset.key, child);
  });

  const active = document.activeElement;
  let refocus = null;

  const tpl = document.createElement('template');
  const nodes = items.map((item) => {
    const key = String(item.key);
    const old = existing.get(key);
    if (old && old.dataset.sig === item.html) return old;

    tpl.innerHTML = item.html.trim();
    const el = tpl.content.firstElementChild;
    el.dataset.key = key;
    el.dataset.sig = item.html;
    if (old && active && old.contains(active) && active.dataset && active.dataset.pick) {
      refocus = { key, pick: active.dataset.pick };
    }
    if (item.onCreate) item.onCreate(el, old || null);
    return el;
  });

  nodes.forEach((node, i) => {
    const at = container.children[i];
    if (at !== node) container.insertBefore(node, at || null);
  });
  while (container.children.length > nodes.length) container.lastElementChild.remove();

  if (refocus) {
    const target = container.querySelector(`[data-key="${CSS.escape(refocus.key)}"] [data-pick="${CSS.escape(refocus.pick)}"]`);
    if (target && !target.disabled) target.focus({ preventScroll: true });
  }
}

// The vua duoc ve lai: cho thanh tien do chay tu muc cu sang muc moi, va lam noi
// nguoi vua vao phong.
function animateRoomCard(el, old) {
  if (!old) return;
  const bar = el.querySelector('.meter > span');
  const oldBar = old.querySelector('.meter > span');
  if (bar && oldBar && bar.style.width !== oldBar.style.width && !prefersReducedMotion()) {
    const target = bar.style.width;
    bar.style.width = oldBar.style.width;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        bar.style.width = target;
      })
    );
  }

  const before = new Set([...old.querySelectorAll('[data-mid]')].map((li) => li.dataset.mid));
  el.querySelectorAll('[data-mid]').forEach((li) => {
    if (!before.has(li.dataset.mid)) li.classList.add('is-new');
  });
}

/* ---------- render ---------- */

function statTile({ icon, label, value, sub, variant }) {
  return `
    <div class="rooms-stat ${variant ? `is-${variant}` : ''}">
      <span class="rooms-stat-label">${icon ? ic(icon) : ''} ${label}</span>
      <span class="rooms-stat-value num">${value}</span>
      ${sub ? `<span class="rooms-stat-sub">${sub}</span>` : ''}
    </div>`;
}

let statsKey = '';

function renderStats() {
  if (!roomsLoaded && !membersLoaded) return;

  const s = computeStats();
  const female = s.byGender.FEMALE;
  const male = s.byGender.MALE;
  const allDone = s.eligible > 0 && s.assigned >= s.eligible;
  const freeTotal = female.free + male.free;
  const lockedRooms = female.lockedRooms + male.lockedRooms;
  const verb = pickMode === 'choose' ? 'chọn' : 'quay';

  let assignedSub;
  if (!s.eligible) assignedSub = 'Chưa có ai trong danh sách';
  else if (allDone) assignedSub = 'Cả đoàn đã có phòng 🎉';
  else if (s.pending) assignedSub = `Còn ${s.pending} người chưa ${verb}`;
  else assignedSub = 'Chờ admin đặt giới tính';

  const genderSub = (g) => (g.rooms ? `${g.rooms} phòng · còn ${g.free} chỗ` : 'Chưa có phòng');

  const html = [
    statTile({
      icon: 'users',
      label: 'Đã có phòng',
      value: `${s.assigned}/${s.eligible}`,
      sub: assignedSub,
      variant: allDone ? 'ok' : 'accent',
    }),
    statTile({ icon: 'venus', label: 'Nữ', value: `${female.assigned}/${female.members}`, sub: genderSub(female), variant: 'female' }),
    statTile({ icon: 'mars', label: 'Nam', value: `${male.assigned}/${male.members}`, sub: genderSub(male), variant: 'male' }),
    statTile({
      icon: 'door-open',
      label: 'Chỗ trống',
      value: `${freeTotal}`,
      sub: lockedRooms ? `${lockedRooms} phòng đang khóa` : `${rooms.length} phòng`,
      variant: lockedRooms ? 'warn' : '',
    }),
  ].join('');
  if (html !== statsKey) {
    statsKey = html;
    roomsStats.innerHTML = html;
  }

  const pct = s.eligible ? Math.round((s.assigned / s.eligible) * 100) : 0;
  progressText.textContent = `Đã nhận phòng ${s.assigned}/${s.eligible} người`;
  progressPct.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
  progressBar.classList.toggle('is-ok', allDone);
  progressBar.setAttribute('aria-valuemax', String(s.eligible));
  progressBar.setAttribute('aria-valuenow', String(s.assigned));
  progressBar.setAttribute('aria-valuetext', `Đã nhận phòng ${s.assigned} trên ${s.eligible} người (${pct}%)`);

  if (s.noGender > 0) {
    const text = `${s.noGender} người chưa được admin đặt giới tính nên chưa thể nhận phòng.`;
    if (noGenderLine.dataset.key !== text) {
      noGenderLine.dataset.key = text;
      noGenderLine.innerHTML = `${ic('circle-alert')} <span>${escapeHtml(text)}</span>`;
    }
    noGenderLine.hidden = false;
  } else {
    noGenderLine.hidden = true;
  }
}

// Ngu canh cua nguoi dang chon ten - quyet dinh nut "Chon phong nay" tren tung the
function pickContext() {
  const me = myName();
  const member = findMember(me);
  const myRoom = roomOf(me);
  return {
    me,
    gender: member ? member.gender : null,
    myRoomId: myRoom ? myRoom.id : null,
    canChoose: pickMode === 'choose' && pageOpen && !!me && !!member && !!member.gender && !myRoom,
  };
}

function pickButtonHtml(room, ctx) {
  if (!ctx.canChoose || room.gender !== ctx.gender) return '';
  if (room.occupancy >= room.capacity) return '';
  if (room.locked) {
    return `<button type="button" class="room-pick-btn" disabled>${ic('lock')} <span>Phòng đang khóa</span></button>`;
  }
  if (locked) {
    return `<button type="button" class="room-pick-btn" disabled>${ic('lock')} <span>Vòng đang tạm khóa</span></button>`;
  }
  const free = room.capacity - room.occupancy;
  return `<button type="button" class="room-pick-btn is-ready" data-pick="${room.id}" ${isBusy ? 'disabled' : ''}
    aria-label="Chọn phòng ${escapeHtml(room.name)} (còn ${free} chỗ)">${ic('hand')} <span>Chọn phòng này</span></button>`;
}

function roomCardHtml(room, meta, ctx) {
  const isMine = ctx.myRoomId === room.id;
  const isFull = room.occupancy >= room.capacity;
  const fillPct = room.capacity ? Math.min(100, Math.round((room.occupancy / room.capacity) * 100)) : 0;
  const pickBtn = pickButtonHtml(room, ctx);

  const beds = room.members
    .map((m) => {
      const isMe = m.name === ctx.me;
      return `
      <li class="room-bed ${isMe ? 'is-me' : ''}" data-mid="${m.id}">
        ${avatarHtml(m.name)}
        <span class="room-bed-name">${escapeHtml(m.name)}</span>
        ${isMe ? '<span class="rm-me-tag">Bạn</span>' : ''}
      </li>`;
    })
    .join('');

  const emptyBeds = Array.from(
    { length: Math.max(0, room.capacity - room.occupancy) },
    () => `<li class="room-bed is-empty">${room.locked ? ic('lock') : ic('bed-double')} <span>${room.locked ? 'Đang khóa' : 'Còn trống'}</span></li>`
  ).join('');

  // Khong in chip gioi tinh trong the: tieu de khu "Phong nu / Phong nam" va mau
  // vien the da noi ro, them chip chi lam roi hang nhan trang thai.
  const classes = ['room-card', `is-${meta.tone}`];
  if (isMine) classes.push('is-mine');
  if (isFull) classes.push('is-full');
  if (room.locked) classes.push('is-locked');
  if (pickBtn.includes('is-ready')) classes.push('is-pickable');

  return `
    <article class="${classes.join(' ')}" aria-label="${escapeHtml(room.name)}">
      <div class="room-card-head">
        <div class="room-card-title">
          <h3>${escapeHtml(room.name)}</h3>
          ${locationHtml(room)}
        </div>
        <span class="room-card-count num" title="Số người / sức chứa">${room.occupancy}/${room.capacity}</span>
      </div>
      <div class="room-card-tags">
        ${room.locked ? `<span class="chip is-warn">${ic('lock')} Đã khóa</span>` : ''}
        ${isFull ? `<span class="chip is-ok">${ic('check')} Đủ người</span>` : ''}
        ${isMine ? `<span class="chip room-mine-chip">${ic('star')} Phòng của bạn</span>` : ''}
      </div>
      <div class="meter ${isFull ? 'is-ok' : ''}" role="img" aria-label="Đã có ${room.occupancy} trên ${room.capacity} chỗ">
        <span style="width:${fillPct}%"></span>
      </div>
      ${room.note ? `<p class="room-card-note">${escapeHtml(room.note)}</p>` : ''}
      <ul class="room-beds">${beds}${emptyBeds}</ul>
      ${pickBtn}
    </article>`;
}

function ensureSectionShells() {
  if (roomsList.dataset.ready === '1') return;
  roomsList.dataset.ready = '1';
  roomsList.innerHTML = `${GENDER_SECTIONS.map(
    (meta) => `
      <section class="rooms-section is-${meta.tone}" data-gender="${meta.gender}" aria-label="Phòng ${meta.label.toLowerCase()}" hidden>
        <div class="rooms-section-head" data-head></div>
        <div class="rooms-grid" data-grid></div>
      </section>`
  ).join('')}
    <div class="rooms-empty" data-empty hidden>
      <span class="rooms-empty-icon" aria-hidden="true">${ic('bed-double')}</span>
      <strong>Chưa có phòng nào được tạo</strong>
      <span>Chờ admin thiết lập danh sách phòng nhé!</span>
    </div>`;
}

function sectionHeadHtml(meta, sectionRooms, ctx) {
  const people = sectionRooms.reduce((sum, r) => sum + r.occupancy, 0);
  const capacity = sectionRooms.reduce((sum, r) => sum + r.capacity, 0);
  const lockedCount = sectionRooms.filter((r) => r.locked).length;
  const freeSlots = sectionRooms.filter((r) => !r.locked).reduce((sum, r) => sum + Math.max(0, r.capacity - r.occupancy), 0);
  const allFull = people >= capacity;
  const forMe = ctx.gender === meta.gender && !ctx.myRoomId && !!ctx.me;

  return `
    <span class="rooms-section-icon" aria-hidden="true">${ic(meta.lucide)}</span>
    <div class="rooms-section-titles">
      <h2>Phòng ${meta.label.toLowerCase()}${forMe ? ' <span class="rooms-section-forme">dành cho bạn</span>' : ''}</h2>
      <p><span class="num">${sectionRooms.length}</span> phòng · <span class="num">${people}/${capacity}</span> chỗ đã có người</p>
    </div>
    <div class="rooms-section-meta">
      ${
        allFull
          ? `<span class="chip is-ok">${ic('check-check')} Đã kín chỗ</span>`
          : `<span class="chip">${ic('door-open')} Còn ${freeSlots} chỗ trống</span>`
      }
      ${lockedCount ? `<span class="chip is-warn">${ic('lock')} ${lockedCount} phòng khóa</span>` : ''}
    </div>`;
}

function renderRooms() {
  if (!roomsLoaded) return; // giu nguyen khung "dang tai" / du lieu cu

  ensureSectionShells();
  const ctx = pickContext();
  const emptyBox = roomsList.querySelector('[data-empty]');
  emptyBox.hidden = rooms.length > 0;

  if (firstRoomsPaint && rooms.length && !prefersReducedMotion()) {
    roomsList.classList.add('is-entering');
    setTimeout(() => roomsList.classList.remove('is-entering'), 1400);
  }
  firstRoomsPaint = false;

  GENDER_SECTIONS.forEach((meta) => {
    const section = roomsList.querySelector(`[data-gender="${meta.gender}"]`);
    const sectionRooms = rooms.filter((r) => r.gender === meta.gender);
    section.hidden = !sectionRooms.length;
    // Khu cua dung gioi tinh nguoi dang chon dua len dau, khong phai cuon tim
    section.style.order = ctx.gender === meta.gender ? '-1' : '0';
    if (!sectionRooms.length) return;

    const head = section.querySelector('[data-head]');
    const headHtml = sectionHeadHtml(meta, sectionRooms, ctx);
    if (head.dataset.sig !== headHtml) {
      head.dataset.sig = headHtml;
      head.innerHTML = headHtml;
    }

    patchKeyed(
      section.querySelector('[data-grid]'),
      sectionRooms.map((room, i) => ({
        key: room.id,
        html: roomCardHtml(room, meta, ctx).replace('<article ', `<article style="--i:${i}" `),
        onCreate: animateRoomCard,
      }))
    );
  });
}

function resultShareText(name, room) {
  const mates = room.members.filter((m) => m.name !== name).map((m) => m.name);
  return `🛏️ ${name} ở phòng "${room.name}"${room.location ? ` (${room.location})` : ''}${
    mates.length ? ` cùng ${mates.join(', ')}` : ''
  }`;
}

// Khung ket qua: ten phong to, vi tri, ban cung phong (avatar), "Ban" noi bat.
// Chi ve lai khi noi dung thuc su doi de vung aria-live khong doc lap lai.
function renderResult(name) {
  const room = roomOf(name);
  if (!room) {
    if (lastResultKey) {
      resultBox.innerHTML = '';
      lastResultKey = '';
    }
    return false;
  }

  const key = JSON.stringify([
    name,
    room.id,
    room.name,
    room.location,
    room.capacity,
    room.locked,
    room.note,
    room.members.map((m) => m.name),
  ]);
  if (key === lastResultKey) return true;
  lastResultKey = key;

  const meta = genderMeta(room.gender);
  const mates = room.members.filter((m) => m.name !== name);
  const free = Math.max(0, room.capacity - room.occupancy);

  let summary;
  if (mates.length) summary = `Cùng phòng với <strong>${escapeHtml(mates.map((m) => m.name).join(', '))}</strong>`;
  else if (room.capacity > 1) summary = 'Hiện chỉ có bạn trong phòng — chờ thêm người nhận phòng nhé!';
  else summary = 'Phòng riêng chỉ có bạn 🎉';

  const people = [
    `<li class="rooms-result-person is-me">${avatarHtml(name)}<span class="room-bed-name">${escapeHtml(name)}</span><span class="rm-me-tag">Bạn</span></li>`,
    ...mates.map((m) => `<li class="rooms-result-person">${avatarHtml(m.name)}<span class="room-bed-name">${escapeHtml(m.name)}</span></li>`),
    ...Array.from({ length: free }, () => `<li class="rooms-result-person is-empty">${ic('bed-double')} <span>Chờ người vào</span></li>`),
  ].join('');

  resultBox.innerHTML = `
    <div class="rooms-result is-${meta.tone}">
      <div class="rooms-result-top">
        <span class="rooms-result-kicker">${ic('party-popper')} Phòng của bạn</span>
        ${genderChip(room.gender)}
      </div>
      <p class="rooms-result-room">${escapeHtml(room.name)}</p>
      ${locationHtml(room, 'rooms-result-loc')}
      <p class="rooms-result-mates">${summary}</p>
      <ul class="rooms-result-people">${people}</ul>
      ${room.note ? `<p class="room-card-note">${escapeHtml(room.note)}</p>` : ''}
      <div class="rooms-result-actions">
        <button type="button" class="rooms-result-btn" data-result-action="copy">${ic('copy')} <span>Sao chép kết quả</span></button>
        <button type="button" class="rooms-result-btn" data-result-action="locate">${ic('search')} <span>Xem trong danh sách</span></button>
      </div>
    </div>`;
  return true;
}

function popResult() {
  const card = resultBox.querySelector('.rooms-result');
  if (!card) return;
  card.classList.remove('pop');
  void card.offsetWidth;
  card.classList.add('pop');
}

// Nhan nut chinh = icon + chu (khong gan textContent vi se xoa mat icon)
function setDrawLabel(icon, text, spinning) {
  const key = `${icon}|${text}|${spinning ? 1 : 0}`;
  if (key === drawLabelKey) return;
  drawLabelKey = key;
  drawBtn.classList.toggle('is-spinning', !!spinning);
  drawBtn.innerHTML = `${ic(icon)}<span>${escapeHtml(text)}</span>`;
}

function setNotice(message) {
  if (noticeBox.textContent !== message) noticeBox.textContent = message;
}

// So sanh theo khoa thay vi innerHTML (icon da duoc ve thanh <svg> nen innerHTML luon khac)
function setMeLine(html) {
  if (meLine.dataset.key === html) return;
  meLine.dataset.key = html;
  meLine.innerHTML = html;
}

function renderRoundChip() {
  const key = locked ? 'locked' : 'open';
  if (roundChip.dataset.key === key) return;
  roundChip.dataset.key = key;
  if (locked) {
    roundChip.className = 'chip is-warn rooms-round-chip';
    roundChip.innerHTML = `${ic('lock')} Tạm khóa`;
  } else {
    roundChip.className = 'chip is-ok rooms-round-chip';
    roundChip.innerHTML = '<span class="dot"></span> Đang mở';
  }
}

// Tieu de khu nhan phong doi theo cach nhan phong admin chon
function renderPickCopy() {
  const copy = PICK_COPY[pickMode] || PICK_COPY.random;
  if (spinTitle.dataset.mode === pickMode) return;
  spinTitle.dataset.mode = pickMode;
  spinTitle.textContent = copy.title;
  spinDesc.textContent = copy.desc;
  spinIcon.innerHTML = ic(copy.icon);
  drawBtn.classList.toggle('is-secondary', pickMode === 'choose');
}

function setJump(visible) {
  if (jumpBtn.hidden === !visible) return;
  jumpBtn.hidden = !visible;
}

// Trang thai nut chinh + dong ghi chu theo nguoi dang chon
function updateDrawState() {
  renderRoundChip();
  renderPickCopy();
  const name = myName();
  const member = findMember(name);
  const choose = pickMode === 'choose';
  const idleLabel = choose ? ['shuffle', 'Xếp ngẫu nhiên giúp tôi'] : ['dices', 'Quay ghép phòng'];

  if (isBusy) {
    drawBtn.disabled = true;
    setDrawLabel(choose ? 'hourglass' : 'dices', choose ? 'Đang xếp phòng…' : 'Đang quay…', true);
    setJump(false);
    return;
  }

  if (!pageOpen) {
    drawBtn.disabled = true;
    setDrawLabel('lock', 'Đang tạm đóng');
    setJump(false);
    return;
  }

  if (!name) {
    drawBtn.disabled = true;
    setDrawLabel(idleLabel[0], idleLabel[1]);
    setMeLine(`👋 <span>Chọn tên của bạn trong danh sách để bắt đầu.</span>`);
    setNotice('');
    setJump(false);
    renderResult('');
    return;
  }

  const meta = genderMeta(member ? member.gender : null);
  const myRoom = roomOf(name);

  if (myRoom) {
    drawBtn.disabled = true;
    setDrawLabel('check-check', 'Bạn đã có phòng');
    setMeLine(''); // khung ket qua ngay ben duoi da noi du
    setNotice('');
    setJump(false);
    renderResult(name);
    return;
  }

  renderResult('');
  setDrawLabel(idleLabel[0], idleLabel[1]);

  if (!member || !member.gender) {
    drawBtn.disabled = true;
    setMeLine(`${genderChip(null)} <span>Giới tính của bạn chưa được đặt.</span>`);
    setNotice('Admin chưa đặt giới tính (Nam/Nữ) cho bạn — nhờ admin cập nhật rồi quay lại nhé.');
    setJump(false);
    return;
  }

  if (!roomsLoaded) {
    drawBtn.disabled = true;
    setMeLine(`${genderChip(member.gender)} <span>Đang tải danh sách phòng…</span>`);
    setNotice('');
    setJump(false);
    return;
  }

  const myRooms = rooms.filter((r) => r.gender === member.gender);
  const freeRooms = myRooms.filter(isAvailable);
  const freeSlots = freeRooms.reduce((sum, r) => sum + (r.capacity - r.occupancy), 0);
  const label = meta.label.toLowerCase();

  setMeLine(
    `${genderChip(member.gender)} <span>Còn <strong class="num">${freeRooms.length}</strong> phòng ${label} · <strong class="num">${freeSlots}</strong> chỗ trống cho bạn</span>`
  );

  if (locked) {
    drawBtn.disabled = true;
    setNotice('Vòng ghép phòng đang tạm khóa — chờ admin mở.');
    setJump(false);
    return;
  }

  if (!myRooms.length) {
    drawBtn.disabled = true;
    setNotice(`Chưa có phòng nào dành cho ${label} — nhờ admin tạo thêm phòng.`);
    setJump(false);
    return;
  }

  if (!freeRooms.length) {
    drawBtn.disabled = true;
    const lockedWithSpace = myRooms.some((r) => r.locked && r.occupancy < r.capacity);
    setNotice(
      lockedWithSpace
        ? `Các phòng ${label} còn chỗ đều đang bị khóa — chờ admin mở khóa nhé.`
        : `Các phòng ${label} đã kín chỗ — nhờ admin mở thêm phòng.`
    );
    setJump(false);
    return;
  }

  drawBtn.disabled = false;
  // Che do tu chon: nut "Xem cac phong con cho" da du chi dan, khong dung khung vang (trong nhu bao loi)
  setNotice('');
  setJump(choose);
}

// Nhung ai chua co phong - de moi nguoi biet con cho ai
function renderPending() {
  if (!membersLoaded || !roomsLoaded) {
    pendingCard.hidden = true;
    return;
  }

  const roomed = roomedIds();
  const pending = members.filter((m) => !roomed.has(m.id));
  const me = myName();

  pendingCard.hidden = pending.length === 0;
  if (!pending.length) return;

  // Ban dang chon dung dau, roi den nguoi da co gioi tinh (nhan phong duoc ngay), chua dat gioi tinh xep sau
  const others = pending.filter((m) => m.name !== me);
  const ordered = [
    ...pending.filter((m) => m.name === me),
    ...others.filter((m) => m.gender),
    ...others.filter((m) => !m.gender),
  ];
  const extra = ordered.length - PENDING_PREVIEW;

  const html = `<ul class="rooms-pending-list ${pendingExpanded ? '' : 'is-collapsed'}">${ordered
    .map((m, i) => {
      const meta = genderMeta(m.gender);
      const isMe = m.name === me;
      const cls = ['rooms-pending', `is-${meta.tone}`];
      if (isMe) cls.push('is-me');
      if (i >= PENDING_PREVIEW) cls.push('is-extra');
      return `
        <li class="${cls.join(' ')}">
          ${avatarHtml(m.name)}
          <span class="room-bed-name">${escapeHtml(m.name)}</span>
          ${isMe ? '<span class="rm-me-tag">Bạn</span>' : ''}
          <span class="rooms-pending-tag">${ic(meta.lucide)} ${meta.label}</span>
        </li>`;
    })
    .join('')}</ul>${
    extra > 0
      ? `<button type="button" class="rooms-pending-more" aria-expanded="${pendingExpanded}">${ic(pendingExpanded ? 'chevron-up' : 'chevron-down')} <span>${pendingExpanded ? 'Thu gọn' : `Xem thêm ${extra} người`}</span></button>`
      : ''
  }`;

  pendingCount.textContent = `${pending.length} người`;
  if (pendingList.dataset.sig !== html) {
    pendingList.dataset.sig = html;
    pendingList.innerHTML = html;
  }
}

function renderAll() {
  renderDeferred = false;
  renderStats();
  renderRooms();
  renderPending();
  updateDrawState();
  guardPickDialog();
}

// Dang quay thi chua ve (tranh lo ket qua truoc khi vong quay dung) - ve bu khi xong
function requestRender() {
  if (isBusy) {
    renderDeferred = true;
    return;
  }
  renderAll();
}

/* ---------- ap du lieu ---------- */

// Admin xoa phong / chuyen phong / don nguoi ra -> bao cho nguoi do biet
function noticeMyRoomChange(name, before) {
  const after = roomOf(name);
  if (after && after.id === before.id) return;

  clearTimeout(mineToastTimer);
  mineToastTimer = setTimeout(() => {
    if (myName() !== name) return;
    // Admin reset ca vong -> da co toast reset rieng, khong bao them
    if (Date.now() - lastResetAt < 2000) return;
    const now = roomOf(name);
    if (now && now.id === before.id) return;

    let message;
    if (now) message = `🔀 Admin đã chuyển bạn sang ${now.name}`;
    else if (!rooms.some((r) => r.id === before.id)) message = `🗑️ ${before.name} vừa bị admin xóa — bạn có thể nhận phòng mới.`;
    else message = `Admin đã đưa bạn ra khỏi ${before.name} — bạn có thể nhận phòng lại.`;
    showToast(message, 'info', 6000, { key: 'rooms-mine', priority: 2 });
  }, 300);
}

function applyRoomsSnapshot(seq, nextRooms, nextStats) {
  if (seq < roomsAppliedSeq) return false; // ban cu hon ban dang hien -> bo
  roomsAppliedSeq = seq;

  const me = myName();
  const before = me ? roomOf(me) : null;

  rooms = nextRooms.map(normalizeRoom);
  if (nextStats) serverStats = nextStats;
  roomsLoaded = true;

  // Luot nhan phong den sau khi fetch nay bat dau -> ap lai de khong bi mat
  recentPatches = recentPatches.filter((p) => p.seq > seq);
  recentPatches.forEach((p) => patchRoom(p.room, p.memberId));

  if (me && before && !isBusy) noticeMyRoomChange(me, before);
  return true;
}

// Thay 1 phong theo id bang du lieu moi (tu member:room-randomized hoac ket qua nhan phong)
function patchRoom(room, memberId) {
  const next = normalizeRoom(room);
  const idx = rooms.findIndex((r) => r.id === next.id);
  if (idx === -1) return false;

  // 1 nguoi chi o 1 phong: go khoi phong khac neu con sot (du lieu cu)
  if (memberId) {
    rooms = rooms.map((r) =>
      r.id !== next.id && r.members.some((m) => m.id === memberId)
        ? normalizeRoom({ ...r, members: r.members.filter((m) => m.id !== memberId) })
        : r
    );
  }
  rooms[idx] = { ...rooms[idx], ...next };
  return true;
}

function applyRoomPatch(room, member) {
  if (!room || !room.id) return;
  const ok = patchRoom(room, member && member.id);
  if (!ok) {
    // Phong chua co trong danh sach (vua tao) -> tai lai cho chac
    scheduleReload();
    return;
  }
  recentPatches.push({ seq: ++dataSeq, room, memberId: member && member.id });
  if (recentPatches.length > 50) recentPatches = recentPatches.slice(-50);
}

/* ---------- tai du lieu ---------- */

// O chon ten chia 2 nhom Nu / Nam (moi nhom xep theo ten goi) - 20 nguoi van tim nhanh
function rebuildOptions() {
  const stored = memberSelect.value || readStoredName();
  const signature = members.map((m) => `${m.name}|${m.gender || ''}`).join('\n');
  if (memberSelect.dataset.signature !== signature) {
    memberSelect.dataset.signature = signature;
    memberSelect.innerHTML = '';
    memberSelect.add(new Option('-- Chọn tên của bạn --', ''));

    const groups = [...GENDER_SECTIONS, UNKNOWN_GENDER]
      .map((meta) => ({ meta, list: members.filter((m) => (m.gender || null) === meta.gender) }))
      .filter((g) => g.list.length);

    if (groups.length > 1) {
      groups.forEach(({ meta, list }) => {
        const group = document.createElement('optgroup');
        group.label = `${meta.label} (${list.length})`;
        list.forEach((m) => group.appendChild(new Option(m.name, m.name)));
        memberSelect.appendChild(group);
      });
    } else {
      members.forEach((m) => memberSelect.add(new Option(m.name, m.name)));
    }
  }
  memberSelect.value = stored && members.some((m) => m.name === stored) ? stored : '';
}

async function loadMembers() {
  const seq = ++dataSeq;
  // scope=room: server loc san, ai bi admin tat quyen ghep phong se khong thay ten minh
  const res = await fetch('/api/members?scope=room', { cache: 'no-store' });
  if (!res.ok) throw new Error(`members HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('members: du lieu khong hop le');
  if (seq < membersAppliedSeq) return;
  membersAppliedSeq = seq;

  members = data.slice().sort((a, b) => compareNames(a.name, b.name));
  membersLoaded = true;
  rebuildOptions();
}

async function loadRooms() {
  const seq = ++dataSeq;
  const res = await fetch('/api/rooms', { cache: 'no-store' });
  if (!res.ok) throw new Error(`rooms HTTP ${res.status}`);
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.rooms)) throw new Error('rooms: du lieu khong hop le');
  applyRoomsSnapshot(seq, payload.rooms, payload.stats);
  // rooms:config den sau khi fetch nay bat dau thi giu trang thai khoa cua socket
  if (seq > lockedSeq) {
    lockedSeq = seq;
    locked = !!payload.locked;
  }
  // Chua doc duoc /api/config thi lay tam cach nhan phong tu day
  if (payload.pickMode && !(window.UiConfig && window.UiConfig.current)) {
    pickMode = payload.pickMode === 'choose' ? 'choose' : 'random';
  }
}

async function reloadAll() {
  clearTimeout(reloadTimer);
  reloadTimer = null;
  const results = await Promise.allSettled([loadMembers(), loadRooms()]);
  const failed = results.filter((r) => r.status === 'rejected');

  if (failed.length) {
    failed.forEach((r) => console.error(r.reason));
    showLoadError(
      roomsLoaded || membersLoaded
        ? 'Không cập nhật được dữ liệu mới nhất — đang hiển thị dữ liệu trước đó.'
        : 'Không thể tải dữ liệu phòng — kiểm tra mạng rồi thử lại.'
    );
  } else {
    clearLoadError();
  }
  requestRender();
}

// Admin bam 1 nut co the phat lien 2-3 su kien (rooms:reset + members:updated...) -> gop 1 lan tai
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(reloadAll, RELOAD_DEBOUNCE_MS);
}

/* ---------- hieu ung ---------- */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spinTo(room) {
  const meta = genderMeta(room.gender);
  const pool = rooms.filter((r) => r.gender === room.gender && !r.locked);
  if (!pool.length) pool.push(room);

  const item = (r) =>
    `<div class="rooms-reel-item"><span class="rooms-reel-name">${meta.icon} ${escapeHtml(r.name)}</span>${
      r.location ? `<span class="rooms-reel-loc">${escapeHtml(r.location)}</span>` : ''
    }</div>`;

  const items = [];
  for (let i = 0; i < REEL_LENGTH - 1; i++) {
    items.push(item(pool[Math.floor(Math.random() * pool.length)] || room));
  }
  items.push(item(room));

  reel.hidden = false;
  reel.classList.remove('is-done');
  reelStrip.style.transition = 'none';
  reelStrip.style.transform = 'translateY(0)';
  reelStrip.innerHTML = items.join('');
  void reelStrip.offsetHeight; // ep reflow truoc khi chay transition

  const finalOffset = (items.length - 1) * REEL_ITEM_HEIGHT;
  const fastOffset = Math.round((finalOffset * 0.6) / REEL_ITEM_HEIGHT) * REEL_ITEM_HEIGHT;
  // Giam chuyen dong: tong ~300ms thay vi ~2.7s
  const reduced = prefersReducedMotion();
  const fastMs = reduced ? 120 : 1100;
  const slowMs = reduced ? 160 : 1500;
  const holdMs = reduced ? 20 : 120;

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      reelStrip.style.transition = `transform ${fastMs}ms linear`;
      reelStrip.style.transform = `translateY(-${fastOffset}px)`;
    });

    setTimeout(() => {
      reelStrip.style.transition = `transform ${slowMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
      reelStrip.style.transform = `translateY(-${finalOffset}px)`;
      setTimeout(() => {
        reel.classList.add('is-done');
        resolve();
      }, slowMs + holdMs);
    }, fastMs);
  });
}

// Phao giay nhe (canvas), ton trong "giam chuyen dong" va cong tac admin
function fireConfetti() {
  if (prefersReducedMotion()) return;
  if (window.UiConfig && !window.UiConfig.flag('confettiEnabled', true)) return;
  const ctx = confettiCanvas && confettiCanvas.getContext ? confettiCanvas.getContext('2d') : null;
  if (!ctx) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  confettiCanvas.width = Math.round(w * dpr);
  confettiCanvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  confettiCanvas.hidden = false;

  const css = getComputedStyle(document.documentElement);
  const palette = ['--accent', '--female', '--male', '--gold', '--ok']
    .map((v) => css.getPropertyValue(v).trim())
    .filter(Boolean);
  const colors = palette.length ? palette : ['#4f46e5', '#db2777', '#2563eb', '#b78628', '#15803d'];

  const pieces = Array.from({ length: w < 600 ? 90 : 150 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.35,
    y: h * 0.32,
    vx: (Math.random() - 0.5) * 13,
    vy: -Math.random() * 13 - 4,
    size: 6 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.35,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  cancelAnimationFrame(confettiRaf);
  const start = performance.now();
  const DURATION = 2600;

  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - t / DURATION);
    pieces.forEach((p) => {
      p.vy += 0.33;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    if (t < DURATION) {
      confettiRaf = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, w, h);
      confettiCanvas.hidden = true;
    }
  }
  confettiRaf = requestAnimationFrame(frame);
}

// Sau khi nhan phong xong (quay hoac tu chon): kiem lai tren du lieu MOI NHAT vi
// admin co the da reset / xoa phong trong luc quay.
function celebrate(name, fresh) {
  const room = roomOf(name);
  if (!room) {
    // Admin reset ca vong -> toast reset da giai thich, khong bao trung
    if (Date.now() - lastResetAt < 10000) return;
    showToast('Kết quả vừa bị admin thay đổi — kiểm tra lại rồi nhận phòng lại nhé.', 'info', 6000, {
      key: 'rooms-mine',
      priority: 2,
    });
    return;
  }

  popResult();
  if (fresh) fireConfetti();
  const mates = room.members.filter((m) => m.name !== name).map((m) => m.name);
  showToast(
    mates.length ? `🛏️ Bạn ở ${room.name} cùng ${mates.join(', ')}!` : `🛏️ Bạn ở ${room.name}!`,
    'success',
    4200
  );
  const card = resultBox.querySelector('.rooms-result');
  if (card && card.scrollIntoView) {
    card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }
}

/* ---------- nhan phong ---------- */

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }
  return { res, data };
}

function setBusy(value) {
  isBusy = value;
  memberSelect.disabled = value;
}

// Quay ngau nhien (che do "random") / "Xep ngau nhien giup toi" (che do "choose")
async function draw() {
  const name = myName();
  if (isBusy || !pageOpen) return;
  if (!name) {
    showError('Vui lòng chọn tên của bạn trước');
    return;
  }

  clearError();
  setBusy(true);
  reel.hidden = true;
  resultBox.innerHTML = '';
  lastResultKey = '';
  updateDrawState();
  renderRooms(); // khoa nut "Chon phong nay" trong luc cho

  let outcome = null;
  try {
    const { res, data } = await postJson('/api/room/random', { name });

    if (!res.ok || !data || !data.room) {
      showError((data && data.error) || 'Có lỗi xảy ra, vui lòng thử lại');
      // Loi do du lieu dang hien bi cu (het cho, phong vua khoa...) -> dong bo lai
      if (res.status === 409 || res.status === 403) scheduleReload();
    } else {
      storeName(name);
      applyRoomPatch(data.room, data.member);
      if (!data.alreadyAssigned) {
        await spinTo(data.room);
        await wait(prefersReducedMotion() ? 0 : 350);
      }
      outcome = data;
    }
  } catch (err) {
    console.error(err);
    showError('Không thể kết nối máy chủ — kiểm tra mạng rồi thử lại');
  } finally {
    setBusy(false);
    reel.hidden = true;
    renderAll(); // ve bu moi thay doi den trong luc quay
  }

  if (outcome) celebrate(name, !outcome.alreadyAssigned);
}

// Phong dang mo hop thoai xac nhan (null = khong mo)
let pickingRoomId = null;

function fillConfirm(room) {
  const mates = room.members.map((m) => escapeHtml(m.name));
  const free = room.capacity - room.occupancy;
  const html = `
    ${room.location ? `<p class="rooms-dialog-loc">${ic('map-pin')} ${escapeHtml(room.location)}</p>` : ''}
    <p>${mates.length ? `Bạn sẽ ở cùng <strong>${mates.join(', ')}</strong>.` : 'Phòng đang trống — bạn sẽ là người đầu tiên.'}
      Phòng còn <strong>${free}</strong>/${room.capacity} chỗ.</p>
    <p class="rooms-dialog-warn">${ic('info')} Chọn xong là chốt — muốn đổi phòng phải nhờ admin.</p>`;
  if (confirmBody.dataset.sig === html) return;
  confirmBody.dataset.sig = html;
  confirmTitle.textContent = `Chọn phòng “${room.name}”?`;
  confirmBody.innerHTML = html;
}

function closePickDialog(reason) {
  if (pickingRoomId === null) return;
  pickingRoomId = null;
  if (confirmDialog && confirmDialog.open) confirmDialog.close('cancel');
  if (reason) showToast(reason, 'info', 5000, { key: 'rooms-pick', priority: 2 });
}

// Goi sau moi lan du lieu doi: hop thoai dang mo ma phong khong con chon duoc nua
// (vua kin, bi khoa, bi xoa, admin da xep phong khac) thi dong lai va bao ly do -
// khong de nguoi dung bam "Chot" roi moi nhan loi. Con chon duoc thi cap nhat so cho.
function guardPickDialog() {
  if (pickingRoomId === null) return;
  const room = rooms.find((r) => r.id === pickingRoomId);
  const mine = roomOf(myName());
  if (mine) return closePickDialog(`Admin vừa xếp bạn vào ${mine.name}.`);
  if (!room) return closePickDialog('Phòng này vừa bị admin xóa — chọn phòng khác nhé.');
  if (locked) return closePickDialog('Vòng ghép phòng vừa bị khóa — chờ admin mở nhé.');
  if (room.locked) return closePickDialog(`${room.name} vừa bị khóa — chọn phòng khác nhé.`);
  if (room.occupancy >= room.capacity) return closePickDialog(`${room.name} vừa kín chỗ — chọn phòng khác nhé.`);
  return fillConfirm(room);
}

// Hop thoai xac nhan chon phong. Tra ve Promise<boolean>.
function confirmPick(room) {
  fillConfirm(room);

  if (!confirmDialog || typeof confirmDialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(`Chọn phòng "${room.name}"? Chọn xong là chốt.`));
  }

  return new Promise((resolve) => {
    const onClose = () => {
      confirmDialog.removeEventListener('close', onClose);
      pickingRoomId = null;
      resolve(confirmDialog.returnValue === 'ok');
    };
    confirmDialog.returnValue = '';
    confirmDialog.addEventListener('close', onClose);
    pickingRoomId = room.id;
    confirmDialog.showModal();
    if (window.Icons) window.Icons.refresh();
    confirmCancel.focus();
  });
}

// Tu chon phong (che do "choose")
async function choose(roomId) {
  const name = myName();
  const room = rooms.find((r) => r.id === roomId);
  if (isBusy || !pageOpen || !name || !room) return;

  clearError();
  const ok = await confirmPick(room);
  if (!ok) return;
  // Trong luc hop thoai mo, du lieu co the da doi (phong kin, doi nguoi chon)
  if (myName() !== name || isBusy) return;

  setBusy(true);
  updateDrawState();
  renderRooms();

  let outcome = null;
  try {
    const { res, data } = await postJson('/api/room/choose', { name, roomId });
    if (!res.ok || !data || !data.room) {
      const message = (data && data.error) || 'Có lỗi xảy ra, vui lòng thử lại';
      showError(message);
      // Nut chon nam o danh sach phong (xa khung loi tren dau) -> bao them bang toast
      showToast(message, 'error', 5000, { key: 'rooms-pick', priority: 2 });
      if ([403, 404, 409].includes(res.status)) scheduleReload();
      // Trang dang giu che do cu (vd lo su kien doi che do) -> doc lai cau hinh
      if (data && data.code === 'PICK_MODE' && window.UiConfig) window.UiConfig.refresh();
    } else {
      storeName(name);
      applyRoomPatch(data.room, data.member);
      outcome = data;
    }
  } catch (err) {
    console.error(err);
    showError('Không thể kết nối máy chủ — kiểm tra mạng rồi thử lại');
  } finally {
    setBusy(false);
    renderAll();
  }

  if (outcome) celebrate(name, !outcome.alreadyAssigned);
}

/* ---------- sao chep ket qua ---------- */

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    /* roi xuong cach cu ben duoi */
  }
  // Mo qua IP mang noi bo (http) thi khong co navigator.clipboard
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (err) {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

/* ---------- su kien giao dien ---------- */

drawBtn.addEventListener('click', draw);

roomsList.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-pick]');
  if (!btn || btn.disabled) return;
  choose(Number(btn.dataset.pick));
});

resultBox.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-result-action]');
  if (!btn) return;
  const name = myName();
  const room = roomOf(name);
  if (!room) return;

  if (btn.dataset.resultAction === 'copy') {
    const ok = await copyText(resultShareText(name, room));
    showToast(ok ? '📋 Đã sao chép — dán vào nhóm chat thôi!' : 'Trình duyệt không cho sao chép tự động', ok ? 'success' : 'error', 3000);
    return;
  }

  if (btn.dataset.resultAction === 'locate') {
    const card = roomsList.querySelector(`[data-key="${room.id}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    card.classList.remove('is-flash');
    void card.offsetWidth;
    card.classList.add('is-flash');
  }
});

jumpBtn.addEventListener('click', () => {
  const member = findMember(myName());
  const section = member && roomsList.querySelector(`[data-gender="${member.gender}"]`);
  if (!section) return;
  section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const first = section.querySelector('[data-pick]:not(:disabled)');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 450);
});

pendingList.addEventListener('click', (event) => {
  const btn = event.target.closest('.rooms-pending-more');
  if (!btn) return;
  pendingExpanded = !pendingExpanded;
  renderPending();
  const next = pendingList.querySelector('.rooms-pending-more');
  if (next) next.focus();
});
retryBtn.addEventListener('click', reloadAll);

memberSelect.addEventListener('change', () => {
  clearError();
  reel.hidden = true;
  storeName(memberSelect.value);
  // Doi nguoi -> to sang lai the "Phong cua ban", nut chon phong va danh sach cho
  renderAll();
});

/* ---------- dong/mo trang + che do (cau hinh admin) ---------- */

function applyPageOpen(open) {
  const changed = open !== pageOpen;
  pageOpen = open;
  closedCard.hidden = open;
  mainBlock.hidden = !open;
  if (!open) {
    clearError();
    closePickDialog();
  }
  updateDrawState();

  if (changed && booted) {
    showToast(open ? '🔓 Trang ghép phòng đã mở lại!' : '🚪 Admin vừa tạm đóng trang ghép phòng', 'info', 4500, {
      key: 'rooms-page',
      priority: 2,
    });
    if (open) scheduleReload();
  }
}

function applyModes(ui) {
  if (!ui) return;
  const nextEvent = ui.eventMode === 'rooms' ? 'rooms' : 'full';
  const nextPick = ui.roomPickMode === 'choose' ? 'choose' : 'random';

  if (nextEvent !== eventMode || !document.body.dataset.eventMode) {
    eventMode = nextEvent;
    document.body.dataset.eventMode = eventMode;
    // Che do chi ghep phong: an duong sang trang chia nhom (khong co vong do)
    document.querySelectorAll('[data-mode-hide]').forEach((el) => {
      el.hidden = el.dataset.modeHide === eventMode;
    });
    brandLink.setAttribute('href', eventMode === 'rooms' ? '/rooms.html' : '/');
  }

  if (nextPick !== pickMode) {
    pickMode = nextPick;
    // Doi sang quay ngau nhien khi ai do dang mo hop thoai chon phong -> dong lai
    if (pickMode !== 'choose') closePickDialog();
    if (booted) {
      showToast(
        pickMode === 'choose'
          ? '🚪 Admin vừa đổi sang tự chọn phòng — chọn phòng bạn thích nhé!'
          : '🎲 Admin vừa đổi sang quay ngẫu nhiên',
        'info',
        5000,
        { key: 'rooms-pick-mode', priority: 2 }
      );
    }
    requestRender();
  }
}

if (window.UiConfig) {
  applyPageOpen(window.UiConfig.flag('showRoomsPage', true));
  window.UiConfig.onChange((ui) => {
    applyModes(ui);
    applyPageOpen(!ui || ui.showRoomsPage !== false);
  });
  window.UiConfig.ready.then((config) => {
    if (config && config.ui) {
      applyModes(config.ui);
      applyPageOpen(config.ui.showRoomsPage !== false);
    }
  });
}

/* ---------- realtime ---------- */

socket.on('online:count', (count) => {
  onlineCount.textContent = String(count);
});

socket.on('rooms:updated', (payload) => {
  // Mot so luong (vd reset toan bo) chi phat {} -> tu tai lai
  if (!payload || !Array.isArray(payload.rooms)) {
    scheduleReload();
    return;
  }
  // Socket mang ban moi nhat -> moi fetch dang chay deu cu hon
  applyRoomsSnapshot(++dataSeq, payload.rooms, payload.stats);
  requestRender();
});

socket.on('member:room-randomized', (payload) => {
  if (!payload || !payload.member || !payload.room) return;

  // Chi va dung 1 phong vua thay doi, khong bat moi nguoi xem goi lai GET /api/rooms
  applyRoomPatch(payload.room, payload.member);
  requestRender();

  if (payload.member.name !== myName()) {
    // Ca doan bam cung luc: gop vao 1 toast cap nhat tai cho
    window.Toast.stream(
      'room-randomized',
      { name: payload.member.name, room: payload.room.name },
      (items) => {
        if (items.length === 1) {
          return `🛏️ ${items[0].name} vừa vào ${items[0].room}`;
        }
        const recent = items.slice(-3).map((i) => i.name).reverse();
        const rest = items.length - recent.length;
        return `🛏️ ${items.length} người vừa nhận phòng: ${recent.join(', ')}${rest > 0 ? ` và ${rest} người nữa` : ''}`;
      },
      { duration: 2800 }
    );
  }
});

socket.on('rooms:reset', () => {
  lastResetAt = Date.now();
  clearTimeout(mineToastTimer);
  if (!isBusy) reel.hidden = true;
  // priority 2: thong bao quan trong, khong bi toast info day ra va khong bi bo
  // qua khi nguoi dung dang o tab khac
  showToast('♻️ Admin đã reset kết quả ghép phòng, mọi người nhận phòng lại nhé!', 'info', 5000, {
    key: 'rooms-reset',
    priority: 2,
  });
  scheduleReload();
});

socket.on('rooms:config', (payload) => {
  const next = !!(payload && payload.locked);
  const changed = next !== locked;
  locked = next;
  lockedSeq = ++dataSeq;
  clearError(); // loi "dang khoa" cu khong con dung nua
  requestRender();
  if (!changed) return;
  // Admin bat/tat lien tuc -> chi 1 toast duy nhat doi noi dung tai cho
  showToast(locked ? '🔒 Vòng ghép phòng đã bị khóa' : '🔓 Vòng ghép phòng đã mở!', 'info', 4000, {
    key: 'rooms-lock',
  });
});

socket.on('members:updated', scheduleReload);

// Admin doi noi dung hien thi -> ap dung ngay, khong can tai lai trang
if (window.UiConfig) window.UiConfig.bind(socket);
if (window.VersionGuard) window.VersionGuard.bind(socket);

let hasConnectedOnce = false;
socket.on('connect', () => {
  // Mat mang roi vao lai: dong bo lai het (ca cau hinh) de khong lech du lieu
  if (hasConnectedOnce) {
    scheduleReload();
    if (window.UiConfig) window.UiConfig.refresh();
  }
  hasConnectedOnce = true;
});

// Dien thoai khoa man hinh roi mo lai: socket co the van "song" nhung da bo lo su
// kien -> quay lai tab sau mot luc thi dong bo lai nhe nhang
let lastHiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    lastHiddenAt = Date.now();
    return;
  }
  if (!lastHiddenAt || Date.now() - lastHiddenAt < RESYNC_AFTER_HIDDEN_MS) return;
  lastHiddenAt = 0;
  scheduleReload();
  if (window.UiConfig) window.UiConfig.refresh();
});

updateDrawState();
// Chi bat toast "dong/mo trang" sau khi tai xong ca du lieu lan cau hinh lan dau,
// neu khong vao trang luc dang dong se bi bao "Admin vua tam dong" vo ly
Promise.allSettled([reloadAll(), window.UiConfig ? window.UiConfig.ready : null]).then(() => {
  booted = true;
});
