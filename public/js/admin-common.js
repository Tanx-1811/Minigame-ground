// Tien ich dung chung cho moi module admin: ma bi mat, goi API, doi tab,
// thong bao (toast), hop thoai xac nhan, che do sang/toi, ve lai danh sach
// ma khong cuop con tro cua nguoi dang sua.
// Khai bao TRUOC cac file admin-*.js khac trong moi trang admin.

window.AdminCommon = (function () {
  const SECRET_KEY = 'randomTeam_adminSecret';
  const THEME_KEY = 'randomTeam_adminTheme';

  /* ================= khung trang (topbar + sidebar) ================= */

  // Moi khu vuc quan ly gio la MOT TRANG RIENG. Danh sach dieu huong khai bao
  // mot cho duy nhat o day roi dung chung cho ca 10 trang, nen khong bao gio
  // lech nhau. Truoc day tat ca nam chung 1 trang voi 10 panel an/hien: 47KB
  // HTML + 137KB JS cua ca 10 module deu phai tai va chay cung luc, tab nao
  // cung dang ky socket - do la ly do trang giat va bam tab khong kip phan hoi.
  const NAV = [
    {
      title: 'Điều hành',
      items: [
        { page: 'overview', href: '/admin/', icon: 'layout-dashboard', label: 'Tổng quan' },
        { page: 'event', href: '/admin/event.html', icon: 'calendar-clock', label: 'Sự kiện' },
        { page: 'quiz', href: '/admin/quiz.html', icon: 'brain', label: 'Vòng Quiz' },
      ],
    },
    {
      title: 'Chia người',
      items: [
        { page: 'groups', href: '/admin/groups.html', icon: 'users-round', label: 'Chia nhóm', badge: 'groups' },
        { page: 'rooms', href: '/admin/rooms.html', icon: 'bed-double', label: 'Phòng ngủ', badge: 'rooms' },
      ],
    },
    {
      title: 'Dữ liệu',
      items: [
        { page: 'members', href: '/admin/members.html', icon: 'contact-round', label: 'Thành viên', badge: 'members' },
        { page: 'questions', href: '/admin/questions.html', icon: 'circle-help', label: 'Câu hỏi', badge: 'questions' },
        { page: 'activity', href: '/admin/activity.html', icon: 'scroll-text', label: 'Nhật ký' },
      ],
    },
    {
      title: 'Hệ thống',
      items: [
        { page: 'appearance', href: '/admin/appearance.html', icon: 'palette', label: 'Giao diện & nội dung' },
        { page: 'settings', href: '/admin/settings.html', icon: 'settings', label: 'Cấu hình & Reset' },
      ],
    },
  ];

  // Trang hien tai, doc tu <body data-admin-page="...">
  const PAGE = document.body.dataset.adminPage || 'overview';

  // So dem canh ten muc o sidebar duoc nho lai, de trang nao cung hien duoc
  // ma khong phai goi them API chi de dien con so cho cac muc khac.
  const BADGE_KEY = 'randomTeam_adminBadges';
  let badges = {};
  try {
    badges = JSON.parse(sessionStorage.getItem(BADGE_KEY) || '{}');
  } catch (err) {
    badges = {};
  }

  function buildShell() {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `
      <header class="admin-topbar">
        <div class="admin-topbar-inner">
          <div class="admin-brand">
            <button type="button" id="navToggle" class="admin-icon-btn admin-nav-toggle" aria-label="Mở menu"
              aria-expanded="false" aria-controls="adminSidebar">
              <i data-lucide="menu"></i>
            </button>
            <a class="admin-brand-mark" href="/admin/" aria-label="Về trang tổng quan">
              <i data-lucide="sliders-horizontal"></i>
            </a>
            <div>
              <h1>Bảng điều khiển sự kiện</h1>
              <p>DIMACO · Chia nhóm &amp; ghép phòng ngủ</p>
            </div>
          </div>

          <div class="admin-topbar-tools">
            <span id="authDot" class="admin-auth-dot" role="status" aria-live="polite"></span>
            <div class="admin-secret">
              <div class="admin-secret-field">
                <label class="visually-hidden" for="secretInput">Mã bí mật admin</label>
                <i data-lucide="key-round"></i>
                <input id="secretInput" type="password" placeholder="Mã bí mật admin" autocomplete="off"
                  enterkeyhint="done" spellcheck="false" />
                <button type="button" id="secretToggle" class="admin-secret-toggle" aria-label="Hiện mã bí mật">
                  <i data-lucide="eye"></i>
                </button>
              </div>
            </div>
            <button type="button" id="themeToggle" class="admin-icon-btn" aria-label="Đổi sáng/tối" title="Đổi giao diện sáng/tối">
              <i data-lucide="moon"></i>
            </button>
          </div>
        </div>
      </header>`
    );

    const nav = NAV.map(
      (group) => `
        <div class="admin-nav-group">
          <p class="admin-nav-title">${group.title}</p>
          <div class="admin-nav-list">
            ${group.items
              .map(
                (item) => `
              <a class="admin-tab ${item.page === PAGE ? 'is-active' : ''}" href="${item.href}" data-tab="${item.page}"
                ${item.page === PAGE ? 'aria-current="page"' : ''}>
                <span class="admin-tab-icon"><i data-lucide="${item.icon}"></i></span> ${item.label}
                ${item.badge ? `<span class="admin-tab-badge" data-badge="${item.badge}">${badges[item.badge] || ''}</span>` : ''}
              </a>`
              )
              .join('')}
          </div>
        </div>`
    ).join('');

    const sidebar = document.createElement('aside');
    sidebar.className = 'admin-sidebar';
    sidebar.id = 'adminSidebar';
    sidebar.innerHTML = `
      <nav class="admin-sidebar-nav" aria-label="Khu vực quản lý">${nav}</nav>
      <div class="admin-nav-foot">
        <a href="/" target="_blank" rel="noopener"><i data-lucide="dices"></i> Trang chia nhóm</a>
        <a href="/rooms.html" target="_blank" rel="noopener"><i data-lucide="bed-double"></i> Trang ghép phòng</a>
      </div>`;

    const scrim = document.createElement('button');
    scrim.type = 'button';
    scrim.className = 'admin-scrim';
    scrim.id = 'navScrim';
    scrim.hidden = true;
    scrim.tabIndex = -1;
    scrim.setAttribute('aria-label', 'Đóng menu');

    const shell = document.querySelector('.admin-shell');
    shell.insertBefore(sidebar, shell.firstChild);
    shell.insertBefore(scrim, shell.firstChild);

    // Vung thong bao + hop thoai xac nhan dung chung moi trang
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div id="adminToasts" class="admin-toasts" aria-live="polite"></div>
      <dialog id="confirmDialog" class="admin-dialog" aria-labelledby="confirmTitle" aria-describedby="confirmBody">
        <div class="admin-dialog-head"><i data-lucide="triangle-alert"></i> <span id="confirmTitle">Xác nhận</span></div>
        <div class="admin-dialog-body" id="confirmBody"></div>
        <div class="admin-dialog-foot">
          <button type="button" id="confirmCancel" class="admin-btn admin-btn-secondary">Hủy</button>
          <button type="button" id="confirmOk" class="admin-btn admin-btn-danger">Đồng ý</button>
        </div>
      </dialog>`
    );
  }

  buildShell();

  const secretInput = document.getElementById('secretInput');
  const secretToggle = document.getElementById('secretToggle');
  const authDot = document.getElementById('authDot');
  const themeToggle = document.getElementById('themeToggle');
  const navToggle = document.getElementById('navToggle');
  const navScrim = document.getElementById('navScrim');
  const sidebarEl = document.getElementById('adminSidebar');
  const toastHost = document.getElementById('adminToasts');

  /* ================= che do sang / toi ================= */

  // Chua tung chon thi theo he dieu hanh. Script nho trong <head> cua moi trang
  // da dat data-theme TRUOC khi ve lan dau (khong bi nhay nen trang), o day chi
  // dong bo lai nut bam va lang nghe he dieu hanh doi che do.
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function savedTheme() {
    try {
      const value = localStorage.getItem(THEME_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (err) {
      return null;
    }
  }

  function applyTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    if (themeToggle) {
      themeToggle.innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
      themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối');
    }
    if (!persist) return;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* localStorage bi chan, bo qua */
    }
  }

  applyTheme(savedTheme() || (systemDark && systemDark.matches ? 'dark' : 'light'), false);

  if (systemDark && systemDark.addEventListener) {
    systemDark.addEventListener('change', (e) => {
      if (!savedTheme()) applyTheme(e.matches ? 'dark' : 'light', false);
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
    });
  }

  /* ================= ma bi mat ================= */

  // Giu ma bi mat trong sessionStorage (mat khi dong trinh duyet) de admin khong
  // phai nhap lai moi lan F5 giua luc su kien dang chay.
  try {
    const saved = sessionStorage.getItem(SECRET_KEY);
    if (saved) secretInput.value = saved;
  } catch (err) {
    /* sessionStorage bi chan, bo qua */
  }

  function getSecret() {
    return secretInput.value.trim();
  }

  // Trang thai ma bi mat:
  //  none     - chua nhap gi (chi xem)
  //  checking - dang hoi may chu
  //  valid    - may chu chap nhan -> mo khoa cac o sua
  //  invalid  - may chu tra 401 -> van chi xem, bao "Sai ma"
  //  offline  - khong ket noi duoc may chu de kiem tra
  // Truoc day cu go 1 ky tu bat ky la hien "Toan quyen" va mo khoa nut bam,
  // bam vao moi bao loi 401.
  let authState = getSecret() ? 'checking' : 'none';
  let checkedSecret = '';

  function canEdit() {
    return authState === 'valid' && getSecret() === checkedSecret;
  }

  const AUTH_VIEW = {
    none: { icon: 'shield-off', text: 'Chỉ xem', cls: '' },
    checking: { icon: 'hourglass', text: 'Đang kiểm tra', cls: 'is-checking' },
    valid: { icon: 'shield-check', text: 'Toàn quyền', cls: 'is-on' },
    invalid: { icon: 'circle-alert', text: 'Sai mã', cls: 'is-err' },
    offline: { icon: 'triangle-alert', text: 'Mất kết nối', cls: 'is-warn' },
  };

  function syncAuthDot() {
    if (!authDot) return;
    const view = AUTH_VIEW[authState] || AUTH_VIEW.none;
    authDot.className = `admin-auth-dot ${view.cls}`;
    authDot.innerHTML = `<i data-lucide="${view.icon}"></i><span>${view.text}</span>`;
    authDot.title = view.text;
    secretInput.setAttribute('aria-invalid', authState === 'invalid' ? 'true' : 'false');
  }

  const secretWatchers = new Set();

  function onSecretChange(handler) {
    secretWatchers.add(handler);
  }

  // Bao cho trang biet quyen sua vua doi: chi 1 lan tai lai du lieu (truoc day
  // vua goi watcher vua goi reloadActive -> moi trang tai 2 lan).
  function notifyAuthChange() {
    const editable = canEdit();
    secretWatchers.forEach((handler) => {
      try {
        handler(editable);
      } catch (err) {
        console.error(err);
      }
    });
    reloadActive();
  }

  let validateSeq = 0;

  async function validateSecret() {
    const secret = getSecret();
    if (!secret) {
      checkedSecret = '';
      return 'none';
    }
    if (secret === checkedSecret && authState !== 'checking' && authState !== 'offline') return authState;

    const seq = ++validateSeq;
    let next;
    try {
      const res = await fetch(`/api/admin/settings?secret=${encodeURIComponent(secret)}`, { cache: 'no-store' });
      next = res.status === 401 || res.status === 403 ? 'invalid' : 'valid';
    } catch (err) {
      next = 'offline';
    }
    // Nguoi dung da go tiep trong luc cho -> ket qua nay da cu
    if (seq !== validateSeq || secret !== getSecret()) return authState;
    checkedSecret = secret;
    return next;
  }

  async function revalidate() {
    const before = authState;
    const beforeEdit = canEdit();
    if (getSecret()) {
      authState = 'checking';
      syncAuthDot();
    }
    const next = await validateSecret();
    if (next === authState && authState !== 'checking') return;
    authState = next;
    syncAuthDot();
    if (beforeEdit !== canEdit() || (before !== next && before !== 'checking')) notifyAuthChange();
  }

  // Lan dau mo trang: kiem tra ma da luu truoc roi moi tai du lieu, de khong
  // phai tai 2 lan (1 lan chi xem, 1 lan day du).
  const authReady = getSecret()
    ? validateSecret().then((state) => {
        authState = state;
        syncAuthDot();
      })
    : Promise.resolve();

  let secretDebounce = null;
  let secretDirty = false;

  function commitSecret() {
    clearTimeout(secretDebounce);
    if (!secretDirty) return;
    secretDirty = false;
    revalidate();
  }

  secretInput.addEventListener('input', () => {
    try {
      sessionStorage.setItem(SECRET_KEY, getSecret());
    } catch (err) {
      /* sessionStorage bi chan, bo qua */
    }
    secretDirty = true;
    const hadEdit = canEdit();
    if (!getSecret()) {
      authState = 'none';
    } else if (getSecret() !== checkedSecret) {
      authState = 'checking';
    }
    syncAuthDot();
    // Vua xoa ma thi khoa ngay, khong cho het thoi gian cho
    if (hadEdit && !canEdit() && !getSecret()) {
      secretDirty = false;
      checkedSecret = '';
      notifyAuthChange();
      return;
    }
    clearTimeout(secretDebounce);
    secretDebounce = setTimeout(commitSecret, 600);
  });

  secretInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitSecret();
  });
  secretInput.addEventListener('blur', commitSecret);

  if (secretToggle) {
    secretToggle.addEventListener('click', () => {
      const show = secretInput.type === 'password';
      secretInput.type = show ? 'text' : 'password';
      secretToggle.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}"></i>`;
      secretToggle.setAttribute('aria-label', show ? 'Ẩn mã bí mật' : 'Hiện mã bí mật');
    });
  }

  /* ================= khoa che do chi xem ================= */

  const LOCK_NOTE = {
    none: 'Đang ở chế độ chỉ xem — nhập mã bí mật admin ở đầu trang để thêm/sửa/xóa.',
    checking: 'Đang kiểm tra mã bí mật…',
    invalid: 'Mã bí mật không đúng — vẫn đang ở chế độ chỉ xem. Kiểm tra lại mã ở đầu trang.',
    offline: 'Không kết nối được máy chủ để kiểm tra mã bí mật.',
  };

  function lockNoteText() {
    return LOCK_NOTE[authState] || LOCK_NOTE.none;
  }

  // Khoa/mo toan bo o nhap + nut trong 1 vung, va hien dong nhac nhap ma bi mat.
  // data-always-enabled: khong bao gio khoa (tim kiem, xuat CSV...).
  // data-keep-disabled: luon khoa du da co ma (vd nut "len" o cau hoi dau tien).
  function applyEditLock(scope, noteEl) {
    const locked = !canEdit();
    scope.querySelectorAll('input, select, textarea, button').forEach((el) => {
      if (el.dataset.alwaysEnabled === '1') return;
      const next = locked || el.dataset.keepDisabled === '1';
      if (el.disabled !== next) el.disabled = next;
    });
    if (noteEl) {
      setMsg(noteEl, locked ? lockNoteText() : '', locked ? (authState === 'invalid' ? 'err' : 'warn') : '');
    }
    return !locked;
  }

  // Bat/tat 1 nut theo dieu kien rieng cua trang (vd "Luu" chi bat khi co thay
  // doi) ma van ton trong che do chi xem va lan applyEditLock sau.
  function setAllowed(el, allowed) {
    if (!el) return;
    if (allowed) delete el.dataset.keepDisabled;
    else el.dataset.keepDisabled = '1';
    el.disabled = !allowed || !canEdit();
  }

  /* ================= toast ================= */

  const TOAST_ICON = { ok: 'circle-check', err: 'circle-alert', warn: 'triangle-alert', info: 'info' };

  function toast(text, kind) {
    if (!toastHost || !text) return;
    const type = TOAST_ICON[kind] ? kind : 'info';

    const el = document.createElement('div');
    el.className = `admin-toast is-${type}`;
    el.setAttribute('role', type === 'err' ? 'alert' : 'status');
    el.innerHTML = `<i data-lucide="${TOAST_ICON[type]}"></i><span></span>`;
    el.querySelector('span').textContent = text;
    toastHost.appendChild(el);

    // Toi da 4 thong bao cung luc - thao tac lien tuc khong lap kin man hinh
    while (toastHost.children.length > 4) toastHost.firstElementChild.remove();

    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 200);
    }, type === 'err' ? 5200 : 3200);
  }

  /* ================= hop thoai xac nhan ================= */

  const dialog = document.getElementById('confirmDialog');
  const dialogTitle = document.getElementById('confirmTitle');
  const dialogBody = document.getElementById('confirmBody');
  const dialogOk = document.getElementById('confirmOk');
  const dialogCancel = document.getElementById('confirmCancel');

  // Thay cho confirm() cua trinh duyet: dong bo voi giao dien va cho phep
  // doi chu tren nut dong y. Tra ve Promise<boolean>.
  // Nut "Huy" luon duoc focus truoc: bam Enter vo tinh khong xoa du lieu.
  function confirmAction({ title = 'Xác nhận', message = '', okText = 'Đồng ý', danger = true } = {}) {
    if (!dialog || typeof dialog.showModal !== 'function') {
      return Promise.resolve(window.confirm(message || title));
    }

    dialogTitle.textContent = title;
    dialogBody.innerHTML = message;
    dialogOk.innerHTML = `<i data-lucide="${danger ? 'triangle-alert' : 'check'}"></i> ${escapeHtml(okText)}`;
    dialogOk.className = `admin-btn ${danger ? 'admin-btn-danger' : ''}`;
    dialog.classList.toggle('is-danger', danger);

    return new Promise((resolve) => {
      const finish = (value) => {
        dialogOk.removeEventListener('click', onOk);
        dialogCancel.removeEventListener('click', onCancel);
        dialog.removeEventListener('close', onClose);
        if (dialog.open) dialog.close();
        resolve(value);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onClose = () => finish(false);

      dialogOk.addEventListener('click', onOk);
      dialogCancel.addEventListener('click', onCancel);
      dialog.addEventListener('close', onClose);
      dialog.showModal();
      dialogCancel.focus();
      if (window.Icons) window.Icons.refresh();
    });
  }

  /* ================= tien ich ================= */

  // Tai file CSV tu du lieu dang bang (co BOM de Excel doc dung tieng Viet).
  // O bat dau bang = + - @ bi Excel hieu la cong thuc (ten ai do dat "=HYPERLINK(...)"
  // la thanh duong link doc) -> them dau ' phia truoc de Excel coi la chu.
  function downloadCsv(filename, rows) {
    const escapeCell = (value) => {
      if (value === null || value === undefined) return '';
      let text = String(value);
      if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
    downloadBlob(filename, new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function escapeHtml(str) {
    return (str === null || str === undefined ? '' : String(str))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, className) {
    return `<i data-lucide="${name}"${className ? ` class="${className}"` : ''}></i>`;
  }

  function genderLabel(gender) {
    if (gender === 'MALE') return 'Nam';
    if (gender === 'FEMALE') return 'Nữ';
    return 'Chưa đặt';
  }

  function genderIcon(gender) {
    if (gender === 'MALE') return 'mars';
    if (gender === 'FEMALE') return 'venus';
    return 'circle-help';
  }

  function genderClass(gender) {
    if (gender === 'MALE') return 'is-male';
    if (gender === 'FEMALE') return 'is-female';
    return '';
  }

  // "2 phút trước", "hôm qua 19:04"... cho nhat ky
  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diff = Math.round((Date.now() - then) / 1000);

    if (diff < 10) return 'vừa xong';
    if (diff < 60) return `${diff} giây trước`;
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return new Date(iso).toLocaleString('vi-VN', { hour12: false });
  }

  // Nhan thoi gian tuong doi (<time data-time="...">) tu cap nhat, khong thi
  // "vua xong" nam yen do ca tieng dong ho.
  function timeHtml(iso) {
    const full = new Date(iso);
    const title = Number.isNaN(full.getTime()) ? '' : full.toLocaleString('vi-VN', { hour12: false });
    return `<time data-time="${escapeHtml(iso)}" datetime="${escapeHtml(iso)}" title="${escapeHtml(title)}">${escapeHtml(
      timeAgo(iso)
    )}</time>`;
  }

  setInterval(() => {
    document.querySelectorAll('time[data-time]').forEach((el) => {
      const text = timeAgo(el.dataset.time);
      if (el.textContent !== text) el.textContent = text;
    });
  }, 30000);

  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-msg' + (kind ? ` ${kind}` : '');
  }

  function statTile({ label, value, sub, variant, icon: iconName, meter }) {
    const bar =
      meter && meter.total > 0
        ? `<div class="meter${meter.variant ? ` is-${meter.variant}` : ''}"><span style="width:${Math.min(
            100,
            Math.round((meter.value / meter.total) * 100)
          )}%"></span></div>`
        : '';

    return `
      <div class="admin-stat ${variant ? `is-${variant}` : ''}">
        <span class="admin-stat-label">${iconName ? icon(iconName) : ''}<span>${label}</span></span>
        <span class="admin-stat-value">${value}</span>
        ${sub ? `<span class="admin-stat-sub">${sub}</span>` : ''}
        ${bar}
      </div>`;
  }

  /* ================= ve lai khong cuop con tro ================= */

  // O dang duoc go / dang mo danh sach chon: ve lai luc nay se mat chu vua go
  // hoac dong dropdown giua chung. Checkbox va nut bam thi khong tinh.
  function isEditingControl(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.tagName !== 'INPUT') return false;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'range'].includes(el.type);
  }

  function isBusy(scope) {
    const el = document.activeElement;
    return !!(el && scope && scope.contains(el) && isEditingControl(el));
  }

  const FOCUS_ATTRS = ['data-field', 'data-option', 'data-correct', 'data-edit', 'data-select', 'data-action', 'data-remove-option'];

  function focusSelector(el) {
    for (const attr of FOCUS_ATTRS) {
      if (el.hasAttribute(attr)) return `[${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
    }
    return el.id ? `#${CSS.escape(el.id)}` : null;
  }

  // Ve lai 1 danh sach theo khoa (data-key) thay vi thay ca khoi bang innerHTML:
  //  - phan tu nao keep(el) tra true (dang sua do, dang focus...) duoc giu NGUYEN,
  //    khong mat chu dang go, khong dong dropdown dang mo
  //  - phan tu con lai duoc thay bang ban moi
  //  - neu o dang focus bi thay, focus lai dung o tuong ung trong ban moi
  // items: [{ key, html }] ; tra ve so phan tu da giu nguyen.
  function patchList(container, items, { keep, empty } = {}) {
    if (!items.length) {
      container.innerHTML = empty || '';
      return 0;
    }

    const active = document.activeElement;
    let focusRef = null;
    if (active && active !== document.body && container.contains(active)) {
      const owner = [...container.children].find((child) => child.contains(active));
      focusRef = {
        el: active,
        key: owner ? owner.dataset.key : null,
        selector: focusSelector(active),
        start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
        end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
      };
    }

    const existing = new Map();
    [...container.children].forEach((child) => {
      if (child.dataset.key) existing.set(child.dataset.key, child);
    });

    const tpl = document.createElement('template');
    let kept = 0;
    const nodes = items.map((item) => {
      const key = String(item.key);
      const old = existing.get(key);
      if (old && keep && keep(old)) {
        kept += 1;
        return old;
      }
      tpl.innerHTML = item.html.trim();
      const el = tpl.content.firstElementChild;
      el.dataset.key = key;
      return el;
    });

    nodes.forEach((node, i) => {
      const at = container.children[i];
      if (at !== node) container.insertBefore(node, at || null);
    });
    while (container.children.length > nodes.length) container.lastElementChild.remove();

    if (focusRef && document.activeElement !== focusRef.el) {
      let target = focusRef.el.isConnected ? focusRef.el : null;
      if (!target && focusRef.key && focusRef.selector) {
        const owner = [...container.children].find((child) => child.dataset.key === focusRef.key);
        target = owner ? owner.querySelector(focusRef.selector) : null;
      }
      if (target && !target.disabled) {
        target.focus({ preventScroll: true });
        if (focusRef.start !== null && typeof target.setSelectionRange === 'function') {
          try {
            target.setSelectionRange(focusRef.start, focusRef.end);
          } catch (err) {
            /* input type number khong ho tro chon vung chu */
          }
        }
      }
    }
    return kept;
  }

  /* ================= hen gio / gop lenh ================= */

  // Gop nhieu lan goi lien tiep thanh 1 (vd 1 lan "chia nhom cho tat ca" phat
  // 4 su kien socket lien nhau -> chi tai lai 1 lan). maxWait: dang co su kien
  // don dap (luot boc tham lien tuc) thi van cap nhat it nhat moi maxWait ms.
  function debounce(fn, wait = 300, maxWait = 1500) {
    let timer = null;
    let first = 0;
    function run() {
      timer = null;
      first = 0;
      fn();
    }
    function schedule() {
      const now = Date.now();
      if (!first) first = now;
      clearTimeout(timer);
      timer = setTimeout(run, Math.max(0, Math.min(wait, first + maxWait - now)));
    }
    schedule.flush = () => {
      if (timer) {
        clearTimeout(timer);
        run();
      }
    };
    schedule.cancel = () => {
      clearTimeout(timer);
      timer = null;
      first = 0;
    };
    return schedule;
  }

  // Ham tai du lieu chi chay 1 ban tai 1 thoi diem: dang tai ma co yeu cau moi
  // thi chay them DUNG 1 lan sau khi xong, ket qua cu khong de len ket qua moi.
  function serial(fn) {
    let running = null;
    let again = false;
    function run() {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        try {
          await fn();
        } finally {
          running = null;
          if (again) {
            again = false;
            run();
          }
        }
      })();
      return running;
    }
    return run;
  }

  // Dang ky nhieu su kien socket cung goi 1 ham (da gop lenh)
  function onLive(events, handler, wait) {
    const fire = debounce(handler, wait === undefined ? 300 : wait);
    if (socket) events.forEach((evt) => socket.on(evt, fire));
    return fire;
  }

  /* ================= goi API ================= */

  // Goi API admin: tu gan secret vao body (POST/PUT/DELETE) hoac query (GET).
  // Nem Error voi message tieng Viet san de call site chi viec hien ra.
  async function request(method, path, body) {
    const secret = getSecret();
    if (!secret) {
      throw new Error('Vui lòng nhập mã bí mật admin ở đầu trang');
    }

    let url = path;
    const options = { method, headers: { 'Content-Type': 'application/json' } };

    if (method === 'GET') {
      url += `${path.includes('?') ? '&' : '?'}secret=${encodeURIComponent(secret)}`;
      options.cache = 'no-store';
    } else {
      options.body = JSON.stringify({ ...(body || {}), secret });
    }

    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw new Error('Không thể kết nối máy chủ');
    }

    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      /* response khong phai JSON (vd 502 tu proxy) */
    }

    if (res.status === 401 && authState === 'valid') {
      // Ma bi mat vua bi doi tren may chu -> khoa lai giao dien
      authState = 'invalid';
      syncAuthDot();
      setTimeout(notifyAuthChange, 0);
    }

    if (!res.ok) {
      throw new Error(data.error || 'Có lỗi xảy ra');
    }
    return data;
  }

  // Bao boc 1 thao tac: tu khoa nut + hien vong xoay, hien trang thai, bat loi
  // va hien message.
  async function run(button, msgEl, pendingText, task) {
    const originalDisabled = button ? button.disabled : false;
    if (button) {
      button.disabled = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
    }
    setMsg(msgEl, pendingText);

    try {
      return await task();
    } catch (err) {
      const text = err.message || 'Có lỗi xảy ra';
      setMsg(msgEl, text, 'err');
      toast(text, 'err');
      return null;
    } finally {
      if (button) {
        button.classList.remove('is-loading');
        button.removeAttribute('aria-busy');
        button.disabled = originalDisabled;
      }
    }
  }

  // Thao tac xong thi bao ca o message lan toast cho de thay
  function done(msgEl, text) {
    setMsg(msgEl, text, 'ok');
    toast(text, 'ok');
  }

  /* ================= dieu huong ================= */

  function setNav(open) {
    if (!sidebarEl) return;
    sidebarEl.classList.toggle('is-open', open);
    if (navScrim) navScrim.hidden = !open;
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
    }
    if (open) {
      const current = sidebarEl.querySelector('.admin-tab.is-active') || sidebarEl.querySelector('a');
      if (current) setTimeout(() => current.focus({ preventScroll: true }), 30);
    }
  }

  function closeNav() {
    if (sidebarEl && sidebarEl.classList.contains('is-open')) setNav(false);
  }

  if (navToggle) {
    navToggle.addEventListener('click', () => setNav(!sidebarEl.classList.contains('is-open')));
  }
  if (navScrim) navScrim.addEventListener('click', closeNav);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !sidebarEl || !sidebarEl.classList.contains('is-open')) return;
    closeNav();
    if (navToggle) navToggle.focus();
  });

  // Phong to cua so khi menu dang mo tren dien thoai -> dong lai, khong de lop
  // phu ket lai tren man hinh rong
  const wideScreen = window.matchMedia ? window.matchMedia('(min-width: 881px)') : null;
  if (wideScreen && wideScreen.addEventListener) {
    wideScreen.addEventListener('change', (e) => {
      if (e.matches) closeNav();
    });
  }

  // Chuyen sang khu vuc khac = sang trang khac
  function showTab(name) {
    const item = NAV.flatMap((g) => g.items).find((i) => i.page === name);
    if (item && name !== PAGE) window.location.href = item.href;
  }

  // So dem canh ten muc o sidebar; nho lai de trang khac cung hien duoc ngay
  function setBadge(name, value) {
    const text = value === null || value === undefined ? '' : String(value);
    badges[name] = text;
    try {
      sessionStorage.setItem(BADGE_KEY, JSON.stringify(badges));
    } catch (err) {
      /* sessionStorage bi chan, bo qua */
    }
    const el = document.querySelector(`[data-badge="${name}"]`);
    if (el && el.textContent !== text) el.textContent = text;
  }

  // Module cua trang dang ky ham tai du lieu cua minh. Giu nguyen ten onTab de
  // cac module khong phai sua gi khi chuyen tu mo hinh 1-trang-nhieu-tab sang
  // moi khu vuc mot trang: chi ham cua DUNG trang nay moi duoc chay.
  const pageHandlers = [];

  function onTab(name, handler) {
    if (name === PAGE) pageHandlers.push(handler);
  }

  function activeTab() {
    return PAGE;
  }

  function reloadActive() {
    pageHandlers.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    });
  }

  // 1 socket dung chung cho ca trang: moi ket noi deu bi tinh vao so nguoi online
  // nen khong mo nhieu socket cho cung 1 tab trinh duyet.
  const socket = window.io ? window.io() : null;

  // Nhac tai lai khi may chu co ban moi (xem js/version-guard.js)
  if (window.VersionGuard) window.VersionGuard.bind(socket);

  // Mat ket noi luc dang kiem tra ma -> noi lai thi kiem tra lai
  if (socket) {
    socket.on('connect', () => {
      if (authState === 'offline') revalidate();
    });
  }

  syncAuthDot();

  // Chay ham tai du lieu cua trang sau khi cac module phia sau da dang ky xong
  // VA ma bi mat da kiem tra xong.
  function start() {
    authReady.then(reloadActive);
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);

  return {
    socket,
    getSecret,
    canEdit,
    authState: () => authState,
    onSecretChange,
    applyEditLock,
    setAllowed,
    downloadCsv,
    downloadBlob,
    escapeHtml,
    icon,
    genderLabel,
    genderIcon,
    genderClass,
    timeAgo,
    timeHtml,
    statTile,
    setMsg,
    done,
    toast,
    confirmAction,
    request,
    run,
    onTab,
    showTab,
    activeTab,
    reloadActive,
    setBadge,
    isBusy,
    isEditingControl,
    patchList,
    debounce,
    serial,
    onLive,
  };
})();
