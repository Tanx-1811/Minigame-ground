// Trang "Su kien": hen gio mo boc tham + dong ho dem nguoc.
// Chua nhap ma bi mat van xem duoc gio da dat, chi cac nut bi khoa.
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="event"]');
  if (!panel) return;

  const eventLockNote = document.getElementById('eventLockNote');
  const eventTimeInput = document.getElementById('eventTimeInput');
  const eventCountdownChip = document.getElementById('eventCountdownChip');
  const saveTimeBtn = document.getElementById('saveTimeBtn');
  const clearTimeBtn = document.getElementById('clearTimeBtn');
  const timeMsg = document.getElementById('timeMsg');

  let eventStartAt = null;
  let countdownTimer = null;

  function applyLocks() {
    A.applyEditLock(panel, eventLockNote);
    // "Mo ngay" chi co y nghia khi dang hen gio
    A.setAllowed(clearTimeBtn, !!eventStartAt);
  }

  function isoToLocalInputValue(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Dong ho chay moi giay: chi ghi lai DOM khi chu thuc su doi (icon da ve
  // thanh <svg> nen khong so duoc voi innerHTML)
  let lastChip = '';
  function setChip(html, kind) {
    const key = `${kind}|${html}`;
    if (key === lastChip) return;
    lastChip = key;
    eventCountdownChip.innerHTML = html;
    eventCountdownChip.className = `admin-chip ${kind}`;
  }

  function renderCountdown() {
    if (!eventStartAt) {
      setChip(`${A.icon('zap')} Đang mở ngay, không hẹn giờ`, 'is-ok');
      return;
    }

    const left = new Date(eventStartAt).getTime() - Date.now();
    if (left <= 0) {
      setChip(`${A.icon('circle-check')} Đã tới giờ mở`, 'is-ok');
      return;
    }

    const s = Math.floor(left / 1000);
    const parts = [];
    if (s >= 86400) parts.push(`${Math.floor(s / 86400)} ngày`);
    if (s >= 3600) parts.push(`${Math.floor((s % 86400) / 3600)} giờ`);
    parts.push(`${Math.floor((s % 3600) / 60)} phút`);
    if (s < 3600) parts.push(`${s % 60} giây`);

    setChip(`${A.icon('hourglass')} Còn ${parts.join(' ')}`, 'is-warn');
  }

  const loadEventTime = A.serial(async () => {
    try {
      const data = await fetch('/api/config').then((r) => r.json());
      eventStartAt = data.eventStartAt || null;
      // Dang sua o ngay gio thi khong ghi de len
      if (document.activeElement !== eventTimeInput && eventTimeInput.dataset.dirty !== '1') {
        eventTimeInput.value = eventStartAt ? isoToLocalInputValue(eventStartAt) : '';
      }

      renderCountdown();
      clearInterval(countdownTimer);
      countdownTimer = setInterval(renderCountdown, 1000);
    } catch (err) {
      console.error(err);
    }
    applyLocks();
  });

  eventTimeInput.addEventListener('input', () => {
    eventTimeInput.dataset.dirty = '1';
  });

  async function saveEventTime(btn, value) {
    const data = await A.run(btn, timeMsg, 'Đang lưu...', () =>
      A.request('POST', '/api/admin/event-time', { eventStartAt: value })
    );
    if (!data) return;

    delete eventTimeInput.dataset.dirty;
    eventStartAt = data.eventStartAt || null;
    eventTimeInput.value = eventStartAt ? isoToLocalInputValue(eventStartAt) : '';
    renderCountdown();
    applyLocks();
    A.done(timeMsg, value ? 'Đã lưu giờ mở bốc thăm!' : 'Đã mở bốc thăm ngay lập tức!');
  }

  saveTimeBtn.addEventListener('click', () => {
    if (!eventTimeInput.value) {
      A.setMsg(timeMsg, 'Vui lòng chọn ngày giờ', 'err');
      eventTimeInput.focus();
      return;
    }
    const when = new Date(eventTimeInput.value);
    if (Number.isNaN(when.getTime())) {
      A.setMsg(timeMsg, 'Ngày giờ không hợp lệ', 'err');
      return;
    }
    saveEventTime(saveTimeBtn, when.toISOString());
  });

  clearTimeBtn.addEventListener('click', async () => {
    const ok = await A.confirmAction({
      title: 'Mở bốc thăm ngay',
      message:
        'Xóa giờ hẹn và <strong>mở bốc thăm ngay lập tức</strong>?<br />Mọi người đang xem đếm ngược trên trang chủ sẽ bấm bốc thăm được luôn.',
      okText: 'Mở ngay',
      danger: false,
    });
    if (!ok) return;
    saveEventTime(clearTimeBtn, null);
  });

  A.onLive(['config:updated'], loadEventTime);

  /* ---------- che do su kien + cach nhan phong ---------- */

  const modeChoices = document.getElementById('eventModeChoices');
  const pickChoices = document.getElementById('pickModeChoices');
  const modeMsg = document.getElementById('eventModeMsg');
  const pickMsg = document.getElementById('pickModeMsg');
  const modeChip = document.getElementById('eventModeChip');
  const timeModeNote = document.getElementById('eventTimeModeNote');

  function renderModes() {
    const modes = A.modes();
    modeChoices.querySelectorAll('[data-event-mode]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.eventMode === modes.eventMode));
    });
    pickChoices.querySelectorAll('[data-pick-mode]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.pickMode === modes.roomPickMode));
    });

    const roomsOnly = modes.eventMode === 'rooms';
    modeChip.className = `admin-chip ${roomsOnly ? 'is-ok' : ''}`;
    modeChip.innerHTML = roomsOnly ? `${A.icon('bed-double')} Đang: Chỉ ghép phòng` : `${A.icon('party-popper')} Đang: Đầy đủ 3 vòng`;
    A.setMsg(
      timeModeNote,
      roomsOnly
        ? 'Đang ở chế độ "Chỉ ghép phòng": giờ hẹn chỉ áp dụng cho màn bốc thăm ở trang chủ, trang ghép phòng mở ngay. Muốn chặn trước giờ thì bấm "Khóa vòng ghép phòng" ở trang Phòng ngủ.'
        : '',
      roomsOnly ? 'warn' : ''
    );
  }

  async function saveMode(btn, msgEl, body, text) {
    const data = await A.run(btn, msgEl, 'Đang lưu...', () => A.request('POST', '/api/admin/event-mode', body));
    if (!data) return;
    A.applyModes({ eventMode: data.eventMode, roomPickMode: data.roomPickMode });
    renderModes();
    applyLocks();
    A.done(msgEl, text);
  }

  modeChoices.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-event-mode]');
    if (!btn || btn.disabled) return;
    const next = btn.dataset.eventMode;
    if (next === A.modes().eventMode) return;

    const ok = await A.confirmAction({
      title: next === 'rooms' ? 'Chuyển sang "Chỉ ghép phòng"' : 'Chuyển sang "Đầy đủ 3 vòng"',
      message:
        next === 'rooms'
          ? 'Trang chủ sẽ tự chuyển sang trang ghép phòng, vòng Quiz và bốc thăm bị tắt (dữ liệu cũ vẫn giữ nguyên).<br />Mọi người đang mở trang được chuyển ngay.'
          : 'Trang chủ quay lại màn Quiz / bốc thăm như cũ. Kết quả ghép phòng hiện có vẫn giữ nguyên.',
      okText: 'Chuyển chế độ',
      danger: false,
    });
    if (!ok) return;
    saveMode(btn, modeMsg, { eventMode: next }, next === 'rooms' ? 'Đã chuyển sang chế độ "Chỉ ghép phòng".' : 'Đã chuyển sang chế độ đầy đủ 3 vòng.');
  });

  pickChoices.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-mode]');
    if (!btn || btn.disabled) return;
    const next = btn.dataset.pickMode;
    if (next === A.modes().roomPickMode) return;
    saveMode(btn, pickMsg, { roomPickMode: next }, next === 'choose' ? 'Đã đổi sang "Tự chọn phòng".' : 'Đã đổi sang "Quay ngẫu nhiên".');
  });

  A.onModes(renderModes);
  A.modesReady.then(renderModes);
  A.onTab('event', () => {
    renderModes();
    loadEventTime();
  });
})();
