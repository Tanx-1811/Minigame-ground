// Trang ghep phong ngu: moi nguoi tu quay 1 lan, he thong chi xep vao phong dung
// gioi tinh va con cho. Chay doc lap voi main.js (trang nay khong co cac phan tu
// cua trang chu) nen tu khai bao vai helper nho rieng.

const socket = io();

const NAME_KEY = 'randomTeam_myName';
const REEL_ITEM_HEIGHT = 88; // dong bo voi .rooms-reel-item trong rooms.css
const REEL_LENGTH = 16;

const memberSelect = document.getElementById('roomsMemberSelect');
const drawBtn = document.getElementById('roomsDrawBtn');
const myGenderText = document.getElementById('roomsMyGender');
const noticeBox = document.getElementById('roomsNotice');
const errorBox = document.getElementById('roomsError');
const reel = document.getElementById('roomsReel');
const reelStrip = document.getElementById('roomsReelStrip');
const resultBox = document.getElementById('roomsResult');
const resultRoom = document.getElementById('roomsResultRoom');
const resultMates = document.getElementById('roomsResultMates');
const roomsList = document.getElementById('roomsList');
const roomsStats = document.getElementById('roomsStats');
const progressText = document.getElementById('roomsProgressText');
const progressPct = document.getElementById('roomsProgressPct');
const progressFill = document.getElementById('roomsProgressFill');
const toastContainer = document.getElementById('toastContainer');
const onlineBadge = document.getElementById('onlineBadge');

const GENDER_SECTIONS = [
  { gender: 'FEMALE', icon: '👩', label: 'Nữ', accent: '#ec4899' },
  { gender: 'MALE', icon: '👨', label: 'Nam', accent: '#3b82f6' },
];

let members = [];
let rooms = [];
let stats = { totalMembers: 0, assigned: 0, noGender: 0, byGender: {} };
let locked = false;
let isSpinning = false;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0] ? parts[0][0] : '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = 200 + (Math.abs(hash) % 120);
  const light = 38 + (Math.abs(hash >> 3) % 14);
  return `hsl(${hue}, 60%, ${light}%)`;
}

function genderMeta(gender) {
  return GENDER_SECTIONS.find((s) => s.gender === gender) || { icon: '❔', label: 'Chưa đặt', accent: '#94a3b8' };
}

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

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function clearError() {
  errorBox.classList.add('hidden');
}

function myName() {
  return memberSelect.value;
}

function findMember(name) {
  return members.find((m) => m.name === name) || null;
}

function roomOf(name) {
  return rooms.find((room) => room.members.some((m) => m.name === name)) || null;
}

/* ---------- render ---------- */

function renderStats() {
  const female = stats.byGender.FEMALE || { members: 0, assigned: 0, rooms: 0, capacity: 0 };
  const male = stats.byGender.MALE || { members: 0, assigned: 0, rooms: 0, capacity: 0 };

  const chips = [
    `<span class="rooms-chip female">👩 Nữ <strong>${female.assigned}/${female.members}</strong> · ${female.rooms} phòng</span>`,
    `<span class="rooms-chip male">👨 Nam <strong>${male.assigned}/${male.members}</strong> · ${male.rooms} phòng</span>`,
  ];
  if (locked) {
    chips.push('<span class="rooms-chip warn">🔒 Đang tạm khóa</span>');
  }
  roomsStats.innerHTML = chips.join('');

  const pct = stats.totalMembers ? Math.round((stats.assigned / stats.totalMembers) * 100) : 0;
  progressText.textContent = `Đã ghép ${stats.assigned}/${stats.totalMembers} người`;
  progressPct.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
}

function roomCardHtml(room, meta) {
  const me = myName();
  const isMine = room.members.some((m) => m.name === me);
  const isFull = room.occupancy >= room.capacity;

  const beds = room.members
    .map(
      (m) => `
      <li class="room-bed ${m.name === me ? 'is-me' : ''}">
        <span class="avatar" style="background:${hashColor(m.name)}">${escapeHtml(initials(m.name))}</span>
        <span>${escapeHtml(m.name)}${m.name === me ? ' (bạn)' : ''}</span>
      </li>`
    )
    .join('');

  const emptyBeds = Array.from(
    { length: Math.max(0, room.capacity - room.occupancy) },
    () => '<li class="room-bed is-empty">Còn trống</li>'
  ).join('');

  return `
    <article class="room-card ${isMine ? 'is-mine' : ''} ${isFull ? 'is-full' : ''}" style="--accent:${meta.accent}">
      <div class="room-card-top">
        <h3>${meta.icon} ${escapeHtml(room.name)}</h3>
        <span class="room-card-count">${room.occupancy}/${room.capacity}</span>
      </div>
      ${room.note ? `<p class="room-card-note">${escapeHtml(room.note)}</p>` : ''}
      <ul class="room-beds">${beds}${emptyBeds}</ul>
    </article>`;
}

function renderRooms() {
  if (!rooms.length) {
    roomsList.innerHTML =
      '<p class="rooms-empty">Chưa có phòng nào được tạo. Chờ admin thiết lập danh sách phòng nhé!</p>';
    return;
  }

  roomsList.innerHTML = GENDER_SECTIONS.map((meta) => {
    const sectionRooms = rooms.filter((r) => r.gender === meta.gender);
    if (!sectionRooms.length) return '';
    const people = sectionRooms.reduce((sum, r) => sum + r.occupancy, 0);
    const capacity = sectionRooms.reduce((sum, r) => sum + r.capacity, 0);

    return `
      <section class="rooms-section">
        <div class="rooms-section-head">
          <h2>${meta.icon} Phòng ${meta.label}</h2>
          <span>${sectionRooms.length} phòng · ${people}/${capacity} chỗ đã có người</span>
        </div>
        <div class="rooms-grid">${sectionRooms.map((room) => roomCardHtml(room, meta)).join('')}</div>
      </section>`;
  }).join('');
}

function renderResultFor(name) {
  const room = roomOf(name);
  if (!room) {
    resultBox.classList.add('hidden');
    return;
  }

  const meta = genderMeta(room.gender);
  const mates = room.members.filter((m) => m.name !== name).map((m) => m.name);

  resultRoom.innerHTML = `${meta.icon} Bạn ở <strong>${escapeHtml(room.name)}</strong>`;
  resultMates.innerHTML = mates.length
    ? `Cùng phòng với <strong>${escapeHtml(mates.join(', '))}</strong>`
    : room.capacity > 1
      ? 'Hiện chỉ có bạn trong phòng — chờ thêm người quay nhé!'
      : 'Phòng riêng chỉ có bạn 🎉';
  resultBox.classList.remove('hidden');
}

// Trang thai nut quay + dong ghi chu phia duoi theo nguoi dang chon
function updateDrawState() {
  const name = myName();
  const member = findMember(name);

  if (!name) {
    myGenderText.textContent = 'Chọn tên của bạn để bắt đầu.';
    drawBtn.disabled = true;
    noticeBox.classList.add('hidden');
    resultBox.classList.add('hidden');
    return;
  }

  const meta = genderMeta(member ? member.gender : null);
  const myRoom = roomOf(name);

  myGenderText.textContent = member && member.gender
    ? `Giới tính của bạn: ${meta.icon} ${meta.label}`
    : 'Bạn chưa được đặt giới tính.';

  if (myRoom) {
    drawBtn.disabled = true;
    drawBtn.textContent = '✅ Bạn đã có phòng';
    noticeBox.classList.add('hidden');
    renderResultFor(name);
    return;
  }

  drawBtn.textContent = '🎲 Quay ghép phòng';
  resultBox.classList.add('hidden');

  if (!member || !member.gender) {
    drawBtn.disabled = true;
    noticeBox.textContent = 'Admin chưa đặt giới tính (Nam/Nữ) cho bạn — nhờ admin cập nhật rồi quay lại nhé.';
    noticeBox.classList.remove('hidden');
    return;
  }

  if (locked) {
    drawBtn.disabled = true;
    noticeBox.textContent = 'Vòng ghép phòng đang tạm khóa — chờ admin mở.';
    noticeBox.classList.remove('hidden');
    return;
  }

  const myRooms = rooms.filter((r) => r.gender === member.gender);
  const freeRooms = myRooms.filter((r) => r.occupancy < r.capacity);

  if (!myRooms.length) {
    drawBtn.disabled = true;
    noticeBox.textContent = `Chưa có phòng nào dành cho ${meta.label} — nhờ admin tạo thêm phòng.`;
    noticeBox.classList.remove('hidden');
    return;
  }
  if (!freeRooms.length) {
    drawBtn.disabled = true;
    noticeBox.textContent = `Các phòng ${meta.label} đã kín chỗ — nhờ admin mở thêm phòng.`;
    noticeBox.classList.remove('hidden');
    return;
  }

  drawBtn.disabled = isSpinning;
  noticeBox.classList.add('hidden');
}

function renderAll() {
  renderStats();
  renderRooms();
  updateDrawState();
}

/* ---------- vong quay ket qua ---------- */

function spinTo(room) {
  const pool = rooms.filter((r) => r.gender === room.gender);
  const meta = genderMeta(room.gender);

  const items = [];
  for (let i = 0; i < REEL_LENGTH - 1; i++) {
    const pick = pool[Math.floor(Math.random() * pool.length)] || room;
    items.push(`${meta.icon} ${pick.name}`);
  }
  items.push(`${meta.icon} ${room.name}`);

  reel.classList.remove('hidden');
  reelStrip.style.transition = 'none';
  reelStrip.style.transform = 'translateY(0)';
  reelStrip.innerHTML = items.map((text) => `<div class="rooms-reel-item">${escapeHtml(text)}</div>`).join('');
  void reelStrip.offsetHeight; // ep reflow truoc khi chay transition

  const finalOffset = (items.length - 1) * REEL_ITEM_HEIGHT;
  const fastOffset = Math.round((finalOffset * 0.6) / REEL_ITEM_HEIGHT) * REEL_ITEM_HEIGHT;
  const fastMs = 1100;
  const slowMs = 1500;

  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    requestAnimationFrame(() => {
      reelStrip.style.transition = `transform ${fastMs}ms linear`;
      reelStrip.style.transform = `translateY(-${fastOffset}px)`;
    });

    setTimeout(() => {
      reelStrip.style.transition = `transform ${slowMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
      reelStrip.style.transform = `translateY(-${finalOffset}px)`;
      setTimeout(settle, slowMs + 120);
    }, fastMs);
  });
}

/* ---------- tai du lieu ---------- */

async function loadMembers() {
  const res = await fetch('/api/members');
  members = await res.json();

  const current = memberSelect.value || localStorage.getItem(NAME_KEY) || '';
  memberSelect.innerHTML =
    '<option value="">-- Chọn tên --</option>' +
    members.map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
  if (current && members.some((m) => m.name === current)) {
    memberSelect.value = current;
  }
}

async function loadRooms() {
  const res = await fetch('/api/rooms');
  const payload = await res.json();
  rooms = payload.rooms || [];
  stats = payload.stats || stats;
  locked = !!payload.locked;
}

async function reloadAll() {
  try {
    await Promise.all([loadMembers(), loadRooms()]);
    renderAll();
  } catch (err) {
    console.error(err);
    showError('Không thể tải dữ liệu phòng');
  }
}

/* ---------- quay ---------- */

async function draw() {
  const name = myName();
  if (!name) {
    showError('Vui lòng chọn tên của bạn trước khi quay');
    return;
  }

  clearError();
  isSpinning = true;
  drawBtn.disabled = true;
  memberSelect.disabled = true;
  resultBox.classList.add('hidden');

  try {
    const res = await fetch('/api/room/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();

    if (!res.ok) {
      reel.classList.add('hidden');
      showError(data.error || 'Có lỗi xảy ra');
      return;
    }

    localStorage.setItem(NAME_KEY, name);

    if (!data.alreadyAssigned) {
      await spinTo(data.room);
    }

    await loadRooms();
    renderStats();
    renderRooms();
    renderResultFor(name);
    resultBox.classList.remove('pop');
    void resultBox.offsetWidth;
    resultBox.classList.add('pop');

    const mates = data.room.members.filter((m) => m.name !== name).map((m) => m.name);
    showToast(
      mates.length
        ? `🛏️ Bạn ở ${data.room.name} cùng ${mates.join(', ')}!`
        : `🛏️ Bạn ở ${data.room.name}!`,
      'success',
      4200
    );
  } catch (err) {
    console.error(err);
    reel.classList.add('hidden');
    showError('Không thể kết nối máy chủ');
  } finally {
    isSpinning = false;
    memberSelect.disabled = false;
    updateDrawState();
  }
}

drawBtn.addEventListener('click', draw);

memberSelect.addEventListener('change', () => {
  clearError();
  reel.classList.add('hidden');
  if (memberSelect.value) {
    localStorage.setItem(NAME_KEY, memberSelect.value);
  }
  updateDrawState();
});

/* ---------- realtime ---------- */

socket.on('online:count', (count) => {
  onlineBadge.textContent = `🟢 ${count} đang xem`;
});

socket.on('rooms:updated', (payload) => {
  if (!payload || !payload.rooms) return;
  rooms = payload.rooms;
  stats = payload.stats || stats;
  if (isSpinning) return; // doi quay xong moi ve lai de khong lo ket qua
  renderAll();
  if (myName()) renderResultFor(myName());
});

socket.on('member:room-randomized', (payload) => {
  if (!payload || !payload.member || !payload.room) return;
  if (isSpinning) return;

  loadRooms().then(() => {
    renderAll();
    if (myName()) renderResultFor(myName());
  });

  if (payload.member.name !== myName()) {
    showToast(`🛏️ ${payload.member.name} vừa được ghép vào ${payload.room.name}`, 'info', 2800);
  }
});

socket.on('rooms:reset', () => {
  resultBox.classList.add('hidden');
  reel.classList.add('hidden');
  showToast('♻️ Admin đã reset kết quả ghép phòng, mọi người quay lại nhé!', 'info', 5000);
  reloadAll();
});

socket.on('rooms:config', (payload) => {
  if (payload) locked = !!payload.locked;
  updateDrawState();
  showToast(locked ? '🔒 Vòng ghép phòng đã bị khóa' : '🔓 Vòng ghép phòng đã mở!', 'info', 4000);
});

socket.on('members:updated', reloadAll);

let hasConnectedOnce = false;
socket.on('connect', () => {
  // Mat mang roi vao lai: dong bo lai het de khong lech du lieu
  if (hasConnectedOnce) reloadAll();
  hasConnectedOnce = true;
});

reloadAll();
