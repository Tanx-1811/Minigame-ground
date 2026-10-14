// Tien ich dung chung cho moi module admin: ma bi mat, goi API, doi tab,
// thong bao (toast), hop thoai xac nhan, che do sang/toi.
// Khai bao TRUOC cac file admin-*.js khac trong admin-reset.html.

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
            <button type="button" id="navToggle" class="admin-icon-btn admin-nav-toggle" aria-label="Mở menu">
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
            <span id="authDot" class="admin-auth-dot"><i data-lucide="shield-off"></i><span>Chỉ xem</span></span>
            <div class="admin-secret">
              <div class="admin-secret-field">
                <label class="visually-hidden" for="secretInput">Mã bí mật admin</label>
                <i data-lucide="key-round"></i>
                <input id="secretInput" type="password" placeholder="Mã bí mật admin" autocomplete="off" />
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
              <a class="admin-tab ${item.page === PAGE ? 'is-active' : ''}" href="${item.href}" data-tab="${item.page}">
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
    scrim.setAttribute('aria-label', 'Đóng menu');

    const shell = document.querySelector('.admin-shell');
    shell.insertBefore(sidebar, shell.firstChild);
    shell.insertBefore(scrim, shell.firstChild);

    // Vung thong bao + hop thoai xac nhan dung chung moi trang
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div id="adminToasts" class="admin-toasts" aria-live="polite"></div>
      <dialog id="confirmDialog" class="admin-dialog">
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

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    if (themeToggle) {
      themeToggle.innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
      themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* localStorage bi chan, bo qua */
    }
  }

  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem(THEME_KEY);
  } catch (err) {
    /* localStorage bi chan, bo qua */
  }
  applyTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light');

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
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

  // Chua nhap ma bi mat -> cac tab van hien danh sach (doc tu API cong khai),
  // chi khoa cac o sua/nut thao tac lai.
  function canEdit() {
    return getSecret().length > 0;
  }

  function syncAuthDot() {
    if (!authDot) return;
    const on = canEdit();
    authDot.classList.toggle('is-on', on);
    authDot.innerHTML = on
      ? '<i data-lucide="shield-check"></i><span>Toàn quyền</span>'
      : '<i data-lucide="shield-off"></i><span>Chỉ xem</span>';
  }

  const secretWatchers = new Set();

  function onSecretChange(handler) {
    secretWatchers.add(handler);
  }

  let secretDebounce = null;
  secretInput.addEventListener('input', () => {
    try {
      sessionStorage.setItem(SECRET_KEY, secretInput.value.trim());
    } catch (err) {
      /* sessionStorage bi chan, bo qua */
    }
    syncAuthDot();

    // Vua nhap xong ma bi mat thi tai lai du lieu cua tab dang mo va mo khoa
    // cac o sua (truoc do dang o che do chi xem)
    clearTimeout(secretDebounce);
    secretDebounce = setTimeout(() => {
      secretWatchers.forEach((handler) => {
        try {
          handler(canEdit());
        } catch (err) {
          console.error(err);
        }
      });
      const handler = tabHandlers.get(activeTab());
      if (handler) handler();
    }, 700);
  });

  if (secretToggle) {
    secretToggle.addEventListener('click', () => {
      const show = secretInput.type === 'password';
      secretInput.type = show ? 'text' : 'password';
      secretToggle.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}"></i>`;
    });
  }

  /* ================= khoa che do chi xem ================= */

  // Khoa/mo toan bo o nhap + nut trong 1 vung, va hien dong nhac nhap ma bi mat.
  // data-always-enabled: khong bao gio khoa (tim kiem, xuat CSV...).
  // data-keep-disabled: luon khoa du da co ma (vd nut "len" o cau hoi dau tien).
  function applyEditLock(scope, noteEl) {
    const locked = !canEdit();
    scope.querySelectorAll('input, select, textarea, button').forEach((el) => {
      if (el.dataset.alwaysEnabled === '1') return;
      el.disabled = locked || el.dataset.keepDisabled === '1';
    });
    if (noteEl) {
      setMsg(noteEl, locked ? 'Đang ở chế độ chỉ xem — nhập mã bí mật admin ở đầu trang để thêm/sửa/xóa.' : '', locked ? 'warn' : '');
    }
    return !locked;
  }

  /* ================= toast ================= */

  const TOAST_ICON = { ok: 'circle-check', err: 'circle-alert', warn: 'triangle-alert', info: 'info' };

  function toast(text, kind) {
    if (!toastHost || !text) return;
    const type = TOAST_ICON[kind] ? kind : 'info';

    const el = document.createElement('div');
    el.className = `admin-toast is-${type}`;
    el.innerHTML = `<i data-lucide="${TOAST_ICON[type]}"></i><span></span>`;
    el.querySelector('span').textContent = text;
    toastHost.appendChild(el);

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
      if (window.Icons) window.Icons.refresh();
    });
  }

  /* ================= tien ich ================= */

  // Tai file CSV tu du lieu dang bang (co BOM de Excel doc dung tieng Viet)
  function downloadCsv(filename, rows) {
    const escapeCell = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str === null || str === undefined ? '' : String(str);
    return div.innerHTML;
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
        <span class="admin-stat-label">${iconName ? icon(iconName) : ''}${label}</span>
        <span class="admin-stat-value">${value}</span>
        ${sub ? `<span class="admin-stat-sub">${sub}</span>` : ''}
        ${bar}
      </div>`;
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

    if (!res.ok) {
      throw new Error(data.error || 'Có lỗi xảy ra');
    }
    return data;
  }

  // Bao boc 1 thao tac: tu khoa nut, hien trang thai, bat loi va hien message.
  async function run(button, msgEl, pendingText, task) {
    const originalDisabled = button ? button.disabled : false;
    if (button) button.disabled = true;
    setMsg(msgEl, pendingText);

    try {
      return await task();
    } catch (err) {
      const text = err.message || 'Có lỗi xảy ra';
      setMsg(msgEl, text, 'err');
      toast(text, 'err');
      return null;
    } finally {
      if (button) button.disabled = originalDisabled;
    }
  }

  // Thao tac xong thi bao ca o message lan toast cho de thay
  function done(msgEl, text) {
    setMsg(msgEl, text, 'ok');
    toast(text, 'ok');
  }

  /* ================= dieu huong ================= */

  function closeNav() {
    if (sidebarEl) sidebarEl.classList.remove('is-open');
    if (navScrim) navScrim.hidden = true;
  }

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const open = sidebarEl.classList.toggle('is-open');
      if (navScrim) navScrim.hidden = !open;
    });
  }
  if (navScrim) navScrim.addEventListener('click', closeNav);

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
    if (el) el.textContent = text;
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

  syncAuthDot();

  // Chay ham tai du lieu cua trang sau khi cac module phia sau da dang ky xong
  window.addEventListener('DOMContentLoaded', reloadActive);

  return {
    socket,
    getSecret,
    canEdit,
    onSecretChange,
    applyEditLock,
    downloadCsv,
    downloadBlob,
    escapeHtml,
    icon,
    genderLabel,
    genderIcon,
    genderClass,
    timeAgo,
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
  };
})();
