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

  A.onTab('event', loadEventTime);
})();
