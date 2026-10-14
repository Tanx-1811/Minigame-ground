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

  function applyLocks() {
    A.applyEditLock(panel, eventLockNote);
  }


  let eventStartAt = null;
  let countdownTimer = null;

  function isoToLocalInputValue(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function renderCountdown() {
    if (!eventStartAt) {
      eventCountdownChip.innerHTML = `${A.icon('zap')} Đang mở ngay, không hẹn giờ`;
      eventCountdownChip.className = 'admin-chip is-ok';
      return;
    }

    const left = new Date(eventStartAt).getTime() - Date.now();
    if (left <= 0) {
      eventCountdownChip.innerHTML = `${A.icon('circle-check')} Đã tới giờ mở`;
      eventCountdownChip.className = 'admin-chip is-ok';
      return;
    }

    const s = Math.floor(left / 1000);
    const parts = [];
    if (s >= 86400) parts.push(`${Math.floor(s / 86400)} ngày`);
    if (s >= 3600) parts.push(`${Math.floor((s % 86400) / 3600)} giờ`);
    parts.push(`${Math.floor((s % 3600) / 60)} phút`);
    if (s < 3600) parts.push(`${s % 60} giây`);

    eventCountdownChip.innerHTML = `${A.icon('hourglass')} Còn ${parts.join(' ')}`;
    eventCountdownChip.className = 'admin-chip is-warn';
  }

  async function loadEventTime() {
    try {
      const data = await fetch('/api/config').then((r) => r.json());
      eventStartAt = data.eventStartAt || null;
      eventTimeInput.value = eventStartAt ? isoToLocalInputValue(eventStartAt) : '';

      renderCountdown();
      clearInterval(countdownTimer);
      countdownTimer = setInterval(renderCountdown, 1000);
    } catch (err) {
      console.error(err);
    }
    applyLocks();
  }

  async function saveEventTime(value) {
    const data = await A.run(saveTimeBtn, timeMsg, 'Đang lưu...', () =>
      A.request('POST', '/api/admin/event-time', { eventStartAt: value })
    );
    if (!data) return;

    A.done(timeMsg, value ? 'Đã lưu giờ mở bốc thăm!' : 'Đã mở bốc thăm ngay lập tức!');
    loadEventTime();
  }

  saveTimeBtn.addEventListener('click', () => {
    if (!eventTimeInput.value) {
      A.setMsg(timeMsg, 'Vui lòng chọn ngày giờ', 'err');
      return;
    }
    saveEventTime(new Date(eventTimeInput.value).toISOString());
  });

  clearTimeBtn.addEventListener('click', () => {
    eventTimeInput.value = '';
    saveEventTime(null);
  });

  if (A.socket) {
    A.socket.on('config:updated', loadEventTime);
  }

  A.onTab('event', loadEventTime);
  A.onSecretChange(applyLocks);
})();
