/* Quan ly toast dung chung cho trang chinh va trang ghep phong.
   Chong spam theo 4 lop:
     1. Gioi han so toast hien cung luc (cu nhat bi day ra, uu tien loi > thanh cong > info)
     2. Toast trung noi dung -> cong dồn thanh "xN" thay vi them dong moi
     3. Toast co key -> ghi de tai cho (vd trang thai khoa/mo vong)
     4. Su kien realtime don dap -> gop vao 1 toast duy nhat qua Toast.stream()
   Toast tam dung dem nguoc khi hover hoac khi tab bi an, nen khong bao gio
   "troi" mat trong luc nguoi dung dang doc. */
window.Toast = (function () {
  const MAX_ON_SCREEN = 3;
  const MAX_ON_SCREEN_MOBILE = 2;
  const DEFAULT_DURATION = 3200;
  const MIN_DURATION = 1600;
  const DEDUPE_WINDOW = 6000; // cung noi dung trong khoang nay -> gop "xN"
  const STREAM_MAX_LIFE = 9000; // toast gop khong song qua lau du su kien lien tuc
  const LEAVE_MS = 200;
  const RANK = { info: 0, success: 1, error: 2 };
  const ICONS = { info: 'ℹ️', success: '✅', error: '⚠️' };

  const entries = []; // dang hien thi, cu -> moi
  const byKey = new Map();
  const streams = new Map();

  let container = null;
  let liveRegion = null;
  let hovering = false;
  let reduceMotion = false;

  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = mq.matches;
    if (mq.addEventListener) mq.addEventListener('change', (e) => { reduceMotion = e.matches; });
  } catch (err) {
    /* matchMedia khong co, coi nhu cho phep animation */
  }

  function maxOnScreen() {
    return window.innerWidth <= 560 ? MAX_ON_SCREEN_MOBILE : MAX_ON_SCREEN;
  }

  function ensureContainer() {
    if (container && container.isConnected) return container;

    container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    // Khong de ca stack lam vung aria-live: doc don dap se spam screen reader.
    // Thay vao do chi doc cac thong bao quan trong qua liveRegion ben duoi.
    container.setAttribute('aria-live', 'off');
    container.addEventListener('pointerenter', () => { hovering = true; syncTimers(); });
    container.addEventListener('pointerleave', () => { hovering = false; syncTimers(); });
    return container;
  }

  function ensureLiveRegion() {
    if (liveRegion && liveRegion.isConnected) return liveRegion;
    liveRegion = document.createElement('div');
    liveRegion.className = 'toast-live-region';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    document.body.appendChild(liveRegion);
    return liveRegion;
  }

  function announce(message) {
    const region = ensureLiveRegion();
    region.textContent = '';
    // Gan lai o tick sau de screen reader nhan ra la noi dung moi
    setTimeout(() => { region.textContent = message; }, 40);
  }

  /* ---------- dem nguoc ---------- */

  function shouldPause() {
    return hovering || document.hidden;
  }

  function startTimer(entry) {
    if (entry.leaving || entry.timer || shouldPause()) return;
    entry.startedAt = Date.now();
    entry.timer = setTimeout(() => {
      entry.timer = null;
      dismiss(entry);
    }, Math.max(60, entry.remaining));
    entry.el.classList.remove('is-paused');
  }

  function stopTimer(entry) {
    if (!entry.timer) return;
    clearTimeout(entry.timer);
    entry.timer = null;
    entry.remaining -= Date.now() - entry.startedAt;
    entry.el.classList.add('is-paused');
  }

  function syncTimers() {
    const pause = shouldPause();
    entries.forEach((entry) => {
      if (entry.leaving) return;
      if (pause) stopTimer(entry);
      else startTimer(entry);
    });
  }

  function resetTimer(entry, duration) {
    stopTimer(entry);
    entry.remaining = Math.max(MIN_DURATION, duration || entry.duration);
    entry.duration = entry.remaining;
    entry.el.style.setProperty('--toast-life', `${entry.remaining}ms`);
    restartLifeBar(entry);
    startTimer(entry);
  }

  function restartLifeBar(entry) {
    const bar = entry.lifeEl;
    if (!bar) return;
    bar.style.animation = 'none';
    void bar.offsetWidth; // ep reflow de animation chay lai tu dau
    bar.style.animation = '';
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      syncTimers();
      return;
    }
    // Quay lai tab: bo het toast info cu ky, giu lai thong bao quan trong
    entries.slice().forEach((entry) => {
      if (!entry.leaving && entry.rank <= RANK.info) dismiss(entry, true);
    });
    syncTimers();
  });

  /* ---------- dong / mo ---------- */

  function dismiss(entry, fast) {
    if (entry.leaving) return;
    entry.leaving = true;
    stopTimer(entry);

    const idx = entries.indexOf(entry);
    if (idx !== -1) entries.splice(idx, 1);
    if (entry.key && byKey.get(entry.key) === entry) byKey.delete(entry.key);
    if (entry.stream) streams.delete(entry.stream);

    const el = entry.el;
    el.classList.remove('bump');
    el.classList.add('leaving');
    if (fast) el.classList.add('leaving-fast');

    if (reduceMotion) {
      el.remove();
      return;
    }

    // Khoa chieu cao hien tai roi thu ve 0 de cac toast con lai truot len muot,
    // thay vi nhay giat mot phat khi node bi xoa.
    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.classList.add('collapsing');
    el.style.height = '0px';
    setTimeout(() => el.remove(), fast ? 120 : LEAVE_MS + 40);
  }

  // Don cho toast moi: day bot cac toast cu co do uu tien khong cao hon.
  // Tra ve false neu tren man hinh toan thong bao quan trong hon -> bo qua toast moi.
  function makeRoom(rank) {
    const limit = maxOnScreen();
    let guard = 0;
    while (entries.length >= limit && guard++ < 20) {
      let victim = null;
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].rank <= rank) { victim = entries[i]; break; }
      }
      if (!victim) return false;
      dismiss(victim, true);
    }
    return true;
  }

  function buildEl(message, type) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = ICONS[type] || ICONS.info;

    const msg = document.createElement('span');
    msg.className = 'toast-msg';
    msg.textContent = message;

    const count = document.createElement('span');
    count.className = 'toast-count';
    count.hidden = true;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Đóng thông báo');
    close.textContent = '×';

    const life = document.createElement('span');
    life.className = 'toast-life';
    life.setAttribute('aria-hidden', 'true');

    el.append(icon, msg, count, close, life);
    return { el, iconEl: icon, msgEl: msg, countEl: count, closeEl: close, lifeEl: life };
  }

  function bumpCount(entry) {
    entry.count += 1;
    if (entry.count > 1) {
      entry.countEl.hidden = false;
      entry.countEl.textContent = `×${entry.count}`;
    }
    pulse(entry);
  }

  function pulse(entry) {
    if (reduceMotion) return;
    entry.el.classList.remove('bump');
    void entry.el.offsetWidth;
    entry.el.classList.add('bump');
  }

  function setMessage(entry, message) {
    if (entry.msgEl.textContent === message) return;
    entry.msgEl.textContent = message;
    entry.message = message;
  }

  /* ---------- API ---------- */

  function show(message, type = 'info', duration = DEFAULT_DURATION, opts = {}) {
    const text = String(message == null ? '' : message);
    if (!text) return null;

    const kind = RANK[type] === undefined ? 'info' : type;
    const rank = opts.priority === undefined ? RANK[kind] : opts.priority;
    const life = Math.max(MIN_DURATION, Number(duration) || DEFAULT_DURATION);

    // Tab dang an: thong bao info khong con y nghia khi nguoi dung quay lai
    if (document.hidden && rank === RANK.info) return null;

    // 1. Toast co key -> ghi de tai cho, khong sinh dong moi
    if (opts.key && byKey.has(opts.key)) {
      const existing = byKey.get(opts.key);
      setMessage(existing, text);
      existing.el.className = `toast toast-${kind}`;
      existing.iconEl.textContent = ICONS[kind] || ICONS.info;
      existing.type = kind;
      existing.rank = rank;
      existing.touchedAt = Date.now();
      resetTimer(existing, life);
      pulse(existing);
      return existing;
    }

    // 2. Trung noi dung trong cua so gop -> cong don "xN"
    if (!opts.key && !opts.stream) {
      const now = Date.now();
      const dup = entries.find(
        (e) => !e.leaving && e.message === text && now - e.touchedAt < DEDUPE_WINDOW
      );
      if (dup) {
        if (now - dup.bornAt > STREAM_MAX_LIFE) {
          // Da hien qua lau vi su kien den lien tuc: cho tat roi mo toast moi
          dismiss(dup, true);
        } else {
          dup.touchedAt = now;
          bumpCount(dup);
          resetTimer(dup, life);
          return dup;
        }
      }
    }

    if (!makeRoom(rank)) return null;

    const parent = ensureContainer();
    const parts = buildEl(text, kind);
    const entry = {
      ...parts,
      message: text,
      type: kind,
      key: opts.key || null,
      stream: opts.stream || null,
      count: 1,
      rank,
      duration: life,
      remaining: life,
      bornAt: Date.now(),
      touchedAt: Date.now(),
      startedAt: 0,
      timer: null,
      leaving: false,
    };

    entry.el.style.setProperty('--toast-life', `${life}ms`);
    entry.closeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss(entry, true);
    });
    entry.el.addEventListener('click', () => dismiss(entry));

    parent.appendChild(entry.el);
    entries.push(entry);
    if (entry.key) byKey.set(entry.key, entry);
    startTimer(entry);

    if (rank > RANK.info) announce(text);
    return entry;
  }

  /* Gop su kien realtime cung loai vao 1 toast.
     streamKey: ten luong (vd 'random'); item: du lieu su kien;
     format(items) -> chuoi hien thi. Toast tu cap nhat tai cho khi co them
     su kien, va tu reset danh sach sau khi bien mat. */
  function stream(streamKey, item, format, opts = {}) {
    if (document.hidden) return null;

    const existing = streams.get(streamKey);
    if (existing && !existing.entry.leaving) {
      const entry = existing.entry;
      existing.items.push(item);
      entry.touchedAt = Date.now();
      setMessage(entry, format(existing.items));
      pulse(entry);
      // Su kien den lien tuc khong duoc giu toast song mai: het han tuoi toi da
      // thi cho no bien di, luot su kien sau se mo toast moi.
      const age = Date.now() - entry.bornAt;
      const left = STREAM_MAX_LIFE - age;
      if (left <= 0) {
        dismiss(entry);
      } else {
        resetTimer(entry, Math.min(opts.duration || DEFAULT_DURATION, left));
      }
      return entry;
    }

    const items = [item];
    const entry = show(format(items), opts.type || 'info', opts.duration || DEFAULT_DURATION, {
      stream: streamKey,
    });
    if (!entry) return null;
    streams.set(streamKey, { items, entry });
    return entry;
  }

  function clear(filter) {
    entries.slice().forEach((entry) => {
      if (!filter || filter(entry)) dismiss(entry, true);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && entries.length) clear();
  });

  return { show, stream, clear, dismiss };
})();

// Giu nguyen ten cu cho cac file dang goi showToast(...)
window.showToast = function (message, type, duration, opts) {
  return window.Toast.show(message, type, duration, opts);
};
