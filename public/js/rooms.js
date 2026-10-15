// Trang ghep phong ngu: moi nguoi tu quay 1 lan, he thong chi xep vao phong dung
// gioi tinh, khong bi khoa va con cho. Chay doc lap voi main.js (trang nay khong co
// cac phan tu cua trang chu) nen tu khai bao vai helper nho rieng.
//
// Nguon du lieu:
//   - rooms[]   : danh sach phong kem nguoi o (GET /api/rooms hoac socket rooms:updated)
//   - members[] : nguoi DUOC PHEP ghep phong (GET /api/members?scope=room)
// "Ai da co phong" luon suy ra tu rooms[].members, KHONG dung members[].roomId vi
// truong do chi tai lai khi reload -> sau moi luot quay se bi cu.

const socket = io();

// Khoa rieng cho trang ghep phong. KHONG dung chung 'randomTeam_myName' cua trang
// chia nhom: dung chung thi vao trang chu se tu boc tham nhom cho ten chon o day.
const NAME_KEY = 'randomTeam_roomName';
const REEL_ITEM_HEIGHT = 88; // dong bo voi --reel-h trong rooms.css
const REEL_LENGTH = 16;
const RELOAD_DEBOUNCE_MS = 150;
const PENDING_PREVIEW = 8; // dien thoai: so nguoi chua ghep hien san truoc khi bam "Xem them"

const memberSelect = document.getElementById('roomsMemberSelect');
const drawBtn = document.getElementById('roomsDrawBtn');
const meLine = document.getElementById('roomsMyGender');
const noticeBox = document.getElementById('roomsNotice');
const errorBox = document.getElementById('roomsError');
const reel = document.getElementById('roomsReel');
const reelStrip = document.getElementById('roomsReelStrip');
const resultBox = document.getElementById('roomsResult');
const roundChip = document.getElementById('roomsRoundChip');
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

const GENDER_SECTIONS = [
  // icon: emoji dung trong noi dung vui (vong quay, toast)
  // lucide: ky hieu net dung trong phan giao dien
  { gender: 'FEMALE', icon: '👩', lucide: 'venus', label: 'Nữ', tone: 'female' },
  { gender: 'MALE', icon: '👨', lucide: 'mars', label: 'Nam', tone: 'male' },
];
const UNKNOWN_GENDER = { gender: null, icon: '❔', lucide: 'circle-help', label: 'Chưa đặt', tone: 'none' };

let members = [];
let membersLoaded = false;
let rooms = [];
let roomsLoaded = false;
let serverStats = null;
let locked = false;
let pageOpen = true;
let isSpinning = false;
let renderDeferred = false;
let booted = false;

// Chong du lieu cu de len du lieu moi: moi lan lay du lieu (fetch hoac socket)
// nhan 1 so thu tu; fetch tra ve muon ma co ban moi hon da ap dung thi bo.
let dataSeq = 0;
let roomsAppliedSeq = 0;
let membersAppliedSeq = 0;
let lockedSeq = 0;
// Cac ban va 1 phong (tu luot quay) - ap lai len snapshot fetch cu hon chung
let recentPatches = [];

let reloadTimer = null;
let mineToastTimer = null;
let lastResetAt = 0;
let lastResultKey = '';
let drawLabelKey = '';
let pendingExpanded = false;

const reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

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
// danh sach phong (ke ca ngay sau 1 luot quay, khi chua co rooms:updated).
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

/* ---------- render ---------- */

function statTile({ icon, label, value, sub, variant }) {
  return `
    <div class="rooms-stat ${variant ? `is-${variant}` : ''}">
      <span class="rooms-stat-label">${icon ? ic(icon) : ''} ${label}</span>
      <span class="rooms-stat-value num">${value}</span>
      ${sub ? `<span class="rooms-stat-sub">${sub}</span>` : ''}
    </div>`;
}

function renderStats() {
  if (!roomsLoaded && !membersLoaded) return;

  const s = computeStats();
  const female = s.byGender.FEMALE;
  const male = s.byGender.MALE;
  const allDone = s.eligible > 0 && s.assigned >= s.eligible;
  const freeTotal = female.free + male.free;
  const lockedRooms = female.lockedRooms + male.lockedRooms;

  let assignedSub;
  if (!s.eligible) assignedSub = 'Chưa có ai trong danh sách';
  else if (allDone) assignedSub = 'Cả nhóm đã xong 🎉';
  else if (s.pending) assignedSub = `Còn ${s.pending} người chưa quay`;
  else assignedSub = 'Chờ admin đặt giới tính';

  const genderSub = (g) => (g.rooms ? `${g.rooms} phòng · còn ${g.free} chỗ` : 'Chưa có phòng');

  roomsStats.innerHTML = [
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

  const pct = s.eligible ? Math.round((s.assigned / s.eligible) * 100) : 0;
  progressText.textContent = `Đã ghép ${s.assigned}/${s.eligible} người`;
  progressPct.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
  progressBar.classList.toggle('is-ok', allDone);
  progressBar.setAttribute('aria-valuemax', String(s.eligible));
  progressBar.setAttribute('aria-valuenow', String(s.assigned));
  progressBar.setAttribute('aria-valuetext', `Đã ghép ${s.assigned} trên ${s.eligible} người (${pct}%)`);

  if (s.noGender > 0) {
    noGenderLine.innerHTML = `${ic('circle-alert')} <span>${s.noGender} người chưa được admin đặt giới tính nên chưa thể quay.</span>`;
    noGenderLine.hidden = false;
  } else {
    noGenderLine.hidden = true;
  }
}

function roomCardHtml(room, meta, me) {
  const isMine = !!me && room.members.some((m) => m.name === me);
  const isFull = room.occupancy >= room.capacity;
  const fillPct = room.capacity ? Math.min(100, Math.round((room.occupancy / room.capacity) * 100)) : 0;

  const beds = room.members
    .map((m) => {
      const isMe = m.name === me;
      return `
      <li class="room-bed ${isMe ? 'is-me' : ''}">
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

  const classes = ['room-card', `is-${meta.tone}`];
  if (isMine) classes.push('is-mine');
  if (isFull) classes.push('is-full');
  if (room.locked) classes.push('is-locked');

  return `
    <article class="${classes.join(' ')}">
      <div class="room-card-head">
        <div class="room-card-title">
          <h3>${escapeHtml(room.name)}</h3>
          <div class="room-card-tags">
            ${genderChip(room.gender)}
            ${room.locked ? `<span class="chip is-warn">${ic('lock')} Đã khóa</span>` : ''}
            ${isFull ? `<span class="chip is-ok">${ic('check')} Đủ người</span>` : ''}
          </div>
        </div>
        <span class="room-card-count num" title="Số người / sức chứa">${room.occupancy}/${room.capacity}</span>
      </div>
      <div class="meter ${isFull ? 'is-ok' : ''}" role="img" aria-label="Đã có ${room.occupancy} trên ${room.capacity} chỗ">
        <span style="width:${fillPct}%"></span>
      </div>
      ${isMine ? `<span class="room-mine-flag">${ic('star')} Phòng của bạn</span>` : ''}
      ${room.note ? `<p class="room-card-note">${escapeHtml(room.note)}</p>` : ''}
      <ul class="room-beds">${beds}${emptyBeds}</ul>
    </article>`;
}

function renderRooms() {
  if (!roomsLoaded) return; // giu nguyen noi dung "dang tai" / du lieu cu

  if (!rooms.length) {
    roomsList.innerHTML = `
      <div class="rooms-empty">
        <span class="rooms-empty-icon" aria-hidden="true">${ic('bed-double')}</span>
        <strong>Chưa có phòng nào được tạo</strong>
        <span>Chờ admin thiết lập danh sách phòng nhé!</span>
      </div>`;
    return;
  }

  const me = myName();
  roomsList.innerHTML = GENDER_SECTIONS.map((meta) => {
    const sectionRooms = rooms.filter((r) => r.gender === meta.gender);
    if (!sectionRooms.length) return '';

    const people = sectionRooms.reduce((sum, r) => sum + r.occupancy, 0);
    const capacity = sectionRooms.reduce((sum, r) => sum + r.capacity, 0);
    const lockedCount = sectionRooms.filter((r) => r.locked).length;
    const freeSlots = sectionRooms.filter((r) => !r.locked).reduce((sum, r) => sum + Math.max(0, r.capacity - r.occupancy), 0);
    const allFull = people >= capacity;

    return `
      <section class="rooms-section is-${meta.tone}" aria-label="Phòng ${meta.label.toLowerCase()}">
        <div class="rooms-section-head">
          <span class="rooms-section-icon" aria-hidden="true">${ic(meta.lucide)}</span>
          <div class="rooms-section-titles">
            <h2>Phòng ${meta.label.toLowerCase()}</h2>
            <p><span class="num">${sectionRooms.length}</span> phòng · <span class="num">${people}/${capacity}</span> chỗ đã có người</p>
          </div>
          <div class="rooms-section-meta">
            ${
              allFull
                ? `<span class="chip is-ok">${ic('check-check')} Đã kín chỗ</span>`
                : `<span class="chip">${ic('door-open')} Còn ${freeSlots} chỗ trống</span>`
            }
            ${lockedCount ? `<span class="chip is-warn">${ic('lock')} ${lockedCount} phòng khóa</span>` : ''}
          </div>
        </div>
        <div class="rooms-grid">${sectionRooms.map((room) => roomCardHtml(room, meta, me)).join('')}</div>
      </section>`;
  }).join('');
}

// Khung ket qua: ten phong to, chip gioi tinh, ban cung phong (avatar), "Ban" noi bat.
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

  const key = JSON.stringify([name, room.id, room.name, room.capacity, room.locked, room.note, room.members.map((m) => m.name)]);
  if (key === lastResultKey) return true;
  lastResultKey = key;

  const meta = genderMeta(room.gender);
  const mates = room.members.filter((m) => m.name !== name);
  const free = Math.max(0, room.capacity - room.occupancy);

  let summary;
  if (mates.length) summary = `Cùng phòng với <strong>${escapeHtml(mates.map((m) => m.name).join(', '))}</strong>`;
  else if (room.capacity > 1) summary = 'Hiện chỉ có bạn trong phòng — chờ thêm người quay nhé!';
  else summary = 'Phòng riêng chỉ có bạn 🎉';

  const people = [
    `<li class="rooms-result-person is-me">${avatarHtml(name)}<span class="room-bed-name">${escapeHtml(name)}</span><span class="rm-me-tag">Bạn</span></li>`,
    ...mates.map((m) => `<li class="rooms-result-person">${avatarHtml(m.name)}<span class="room-bed-name">${escapeHtml(m.name)}</span></li>`),
    ...Array.from({ length: free }, () => `<li class="rooms-result-person is-empty">${ic('bed-double')} <span>Chờ người quay</span></li>`),
  ].join('');

  resultBox.innerHTML = `
    <div class="rooms-result is-${meta.tone}">
      <div class="rooms-result-top">
        <span class="rooms-result-kicker">${ic('party-popper')} Phòng của bạn</span>
        ${genderChip(room.gender)}
      </div>
      <p class="rooms-result-room">${meta.icon} ${escapeHtml(room.name)}</p>
      <p class="rooms-result-mates">${summary}</p>
      <ul class="rooms-result-people">${people}</ul>
      ${room.note ? `<p class="room-card-note">${escapeHtml(room.note)}</p>` : ''}
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

// Nhan nut quay = icon + chu (khong gan textContent vi se xoa mat icon)
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

// Trang thai nut quay + dong ghi chu theo nguoi dang chon
function updateDrawState() {
  renderRoundChip();
  const name = myName();
  const member = findMember(name);

  if (isSpinning) {
    drawBtn.disabled = true;
    setDrawLabel('dices', 'Đang quay…', true);
    return;
  }

  if (!pageOpen) {
    drawBtn.disabled = true;
    setDrawLabel('lock', 'Đang tạm đóng');
    return;
  }

  if (!name) {
    drawBtn.disabled = true;
    setDrawLabel('dices', 'Quay ghép phòng');
    setMeLine(`👋 <span>Chọn tên của bạn trong danh sách để bắt đầu.</span>`);
    setNotice('');
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
    renderResult(name);
    return;
  }

  renderResult('');
  setDrawLabel('dices', 'Quay ghép phòng');

  if (!member || !member.gender) {
    drawBtn.disabled = true;
    setMeLine(`${genderChip(null)} <span>Giới tính của bạn chưa được đặt.</span>`);
    setNotice('Admin chưa đặt giới tính (Nam/Nữ) cho bạn — nhờ admin cập nhật rồi quay lại nhé.');
    return;
  }

  if (!roomsLoaded) {
    drawBtn.disabled = true;
    setMeLine(`${genderChip(member.gender)} <span>Đang tải danh sách phòng…</span>`);
    setNotice('');
    return;
  }

  const myRooms = rooms.filter((r) => r.gender === member.gender);
  const freeRooms = myRooms.filter(isAvailable);
  const label = meta.label.toLowerCase();

  setMeLine(
    `${genderChip(member.gender)} <span>Còn <strong class="num">${freeRooms.length}</strong> phòng ${label} trống chỗ</span>`
  );

  if (locked) {
    drawBtn.disabled = true;
    setNotice('Vòng ghép phòng đang tạm khóa — chờ admin mở.');
    return;
  }

  if (!myRooms.length) {
    drawBtn.disabled = true;
    setNotice(`Chưa có phòng nào dành cho ${label} — nhờ admin tạo thêm phòng.`);
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
    return;
  }

  drawBtn.disabled = false;
  setNotice('');
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

  // Ban dang chon dung dau, roi den nguoi da co gioi tinh (quay duoc ngay), chua dat gioi tinh xep sau
  const others = pending.filter((m) => m.name !== me);
  const ordered = [
    ...pending.filter((m) => m.name === me),
    ...others.filter((m) => m.gender),
    ...others.filter((m) => !m.gender),
  ];
  const extra = ordered.length - PENDING_PREVIEW;

  pendingCount.textContent = `${pending.length} người`;
  pendingList.innerHTML = `<ul class="rooms-pending-list ${pendingExpanded ? '' : 'is-collapsed'}">${ordered
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
}

function renderAll() {
  renderDeferred = false;
  renderStats();
  renderRooms();
  renderPending();
  updateDrawState();
}

// Dang quay thi chua ve (tranh lo ket qua truoc khi vong quay dung) - ve bu khi xong
function requestRender() {
  if (isSpinning) {
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
    else if (!rooms.some((r) => r.id === before.id)) message = `🗑️ ${before.name} vừa bị admin xóa — bạn có thể quay lại để nhận phòng mới.`;
    else message = `Admin đã đưa bạn ra khỏi ${before.name} — bạn có thể quay lại.`;
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

  // Luot quay den sau khi fetch nay bat dau -> ap lai de khong bi mat
  recentPatches = recentPatches.filter((p) => p.seq > seq);
  recentPatches.forEach((p) => patchRoom(p.room, p.memberId));

  if (me && before && !isSpinning) noticeMyRoomChange(me, before);
  return true;
}

// Thay 1 phong theo id bang du lieu moi (tu member:room-randomized hoac ket qua quay)
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

function rebuildOptions() {
  const stored = memberSelect.value || readStoredName();
  const signature = members.map((m) => m.name).join('\n');
  if (memberSelect.dataset.signature !== signature) {
    memberSelect.dataset.signature = signature;
    memberSelect.length = 0;
    memberSelect.add(new Option('-- Chọn tên --', ''));
    members.forEach((m) => memberSelect.add(new Option(m.name, m.name)));
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

  members = data;
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

/* ---------- vong quay ket qua ---------- */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spinTo(room) {
  const meta = genderMeta(room.gender);
  const pool = rooms.filter((r) => r.gender === room.gender && !r.locked);
  if (!pool.length) pool.push(room);

  const items = [];
  for (let i = 0; i < REEL_LENGTH - 1; i++) {
    const pick = pool[Math.floor(Math.random() * pool.length)] || room;
    items.push(`${meta.icon} ${pick.name}`);
  }
  items.push(`${meta.icon} ${room.name}`);

  reel.hidden = false;
  reel.classList.remove('is-done');
  reelStrip.style.transition = 'none';
  reelStrip.style.transform = 'translateY(0)';
  reelStrip.innerHTML = items.map((text) => `<div class="rooms-reel-item">${escapeHtml(text)}</div>`).join('');
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

/* ---------- quay ---------- */

async function draw() {
  const name = myName();
  if (isSpinning || !pageOpen) return;
  if (!name) {
    showError('Vui lòng chọn tên của bạn trước khi quay');
    return;
  }

  clearError();
  isSpinning = true;
  memberSelect.disabled = true;
  reel.hidden = true;
  resultBox.innerHTML = '';
  lastResultKey = '';
  updateDrawState();

  let outcome = null;
  try {
    const res = await fetch('/api/room/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }

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
    isSpinning = false;
    memberSelect.disabled = false;
    reel.hidden = true;
    renderAll(); // ve bu moi thay doi den trong luc quay
  }

  if (!outcome) return;

  // Kiem lai tren du lieu MOI NHAT: admin co the da reset/xoa phong trong luc quay
  const room = roomOf(name);
  if (!room) {
    showToast('Kết quả vừa bị admin thay đổi trong lúc quay — kiểm tra lại rồi quay lại nhé.', 'info', 6000, {
      key: 'rooms-mine',
      priority: 2,
    });
    return;
  }

  popResult();
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

drawBtn.addEventListener('click', draw);

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
  // Doi nguoi -> to sang lai the "Phong cua ban" va danh sach cho
  renderAll();
});

/* ---------- dong/mo trang (showRoomsPage) ---------- */

function applyPageOpen(open) {
  const changed = open !== pageOpen;
  pageOpen = open;
  closedCard.hidden = open;
  mainBlock.hidden = !open;
  if (!open) clearError();
  updateDrawState();

  if (changed && booted) {
    showToast(open ? '🔓 Trang ghép phòng đã mở lại!' : '🚪 Admin vừa tạm đóng trang ghép phòng', 'info', 4500, {
      key: 'rooms-page',
      priority: 2,
    });
    if (open) scheduleReload();
  }
}

if (window.UiConfig) {
  applyPageOpen(window.UiConfig.flag('showRoomsPage', true));
  window.UiConfig.onChange((ui) => applyPageOpen(!ui || ui.showRoomsPage !== false));
  window.UiConfig.ready.then((config) => {
    if (config && config.ui) applyPageOpen(config.ui.showRoomsPage !== false);
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
    // Ca phong bam cung luc: gop vao 1 toast cap nhat tai cho
    window.Toast.stream(
      'room-randomized',
      { name: payload.member.name, room: payload.room.name },
      (items) => {
        if (items.length === 1) {
          return `🛏️ ${items[0].name} vừa được ghép vào ${items[0].room}`;
        }
        const recent = items.slice(-3).map((i) => i.name).reverse();
        const rest = items.length - recent.length;
        return `🛏️ ${items.length} người vừa được ghép phòng: ${recent.join(', ')}${rest > 0 ? ` và ${rest} người nữa` : ''}`;
      },
      { duration: 2800 }
    );
  }
});

socket.on('rooms:reset', () => {
  lastResetAt = Date.now();
  clearTimeout(mineToastTimer);
  if (!isSpinning) reel.hidden = true;
  // priority 2: thong bao quan trong, khong bi toast info day ra va khong bi bo
  // qua khi nguoi dung dang o tab khac
  showToast('♻️ Admin đã reset kết quả ghép phòng, mọi người quay lại nhé!', 'info', 5000, {
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
  // Mat mang roi vao lai: dong bo lai het de khong lech du lieu
  if (hasConnectedOnce) scheduleReload();
  hasConnectedOnce = true;
});

updateDrawState();
// Chi bat toast "dong/mo trang" sau khi tai xong ca du lieu lan cau hinh lan dau,
// neu khong vao trang luc dang dong se bi bao "Admin vua tam dong" vo ly
Promise.allSettled([reloadAll(), window.UiConfig ? window.UiConfig.ready : null]).then(() => {
  booted = true;
});
