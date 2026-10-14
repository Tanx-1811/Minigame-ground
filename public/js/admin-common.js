// Tien ich dung chung cho moi module admin: ma bi mat, goi API, doi tab,
// thong bao (toast), hop thoai xac nhan, che do sang/toi.
// Khai bao TRUOC cac file admin-*.js khac trong admin-reset.html.

window.AdminCommon = (function () {
  const SECRET_KEY = 'randomTeam_adminSecret';
  const TAB_KEY = 'randomTeam_adminTab';
  const THEME_KEY = 'randomTeam_adminTheme';

  const secretInput = document.getElementById('secretInput');
  const secretToggle = document.getElementById('secretToggle');
  const authDot = document.getElementById('authDot');
  const themeToggle = document.getElementById('themeToggle');
  const navToggle = document.getElementById('navToggle');
  const navScrim = document.getElementById('navScrim');
  const sidebar = document.getElementById('adminSidebar');
  const toastHost = document.getElementById('adminToasts');

  const tabButtons = [...document.querySelectorAll('.admin-tab')];
  const panels = [...document.querySelectorAll('.admin-panel')];
  const tabHandlers = new Map();

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

  /* ================= tabs ================= */

  function closeNav() {
    if (sidebar) sidebar.classList.remove('is-open');
    if (navScrim) navScrim.hidden = true;
  }

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const open = sidebar.classList.toggle('is-open');
      if (navScrim) navScrim.hidden = !open;
    });
  }
  if (navScrim) navScrim.addEventListener('click', closeNav);

  function showTab(name) {
    const target = tabButtons.some((btn) => btn.dataset.tab === name) ? name : tabButtons[0].dataset.tab;

    tabButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === target));
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== target;
    });
    closeNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      sessionStorage.setItem(TAB_KEY, target);
    } catch (err) {
      /* sessionStorage bi chan, bo qua */
    }

    const handler = tabHandlers.get(target);
    if (handler) handler();
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  // So dem nho canh ten tab o sidebar (vd so thanh vien, so phong)
  function setBadge(name, value) {
    const el = document.querySelector(`[data-badge="${name}"]`);
    if (el) el.textContent = value === null || value === undefined ? '' : String(value);
  }

  // Module dang ky ham tai du lieu cho tab cua minh; chay khi tab duoc mo.
  function onTab(name, handler) {
    tabHandlers.set(name, handler);
  }

  function activeTab() {
    const active = tabButtons.find((btn) => btn.classList.contains('is-active'));
    return active ? active.dataset.tab : null;
  }

  // Tai lai tab dang mo (dung cho cac su kien realtime)
  function reloadActive() {
    const handler = tabHandlers.get(activeTab());
    if (handler) handler();
  }

  // 1 socket dung chung cho ca trang: moi ket noi deu bi tinh vao so nguoi online
  // nen khong mo nhieu socket cho cung 1 tab trinh duyet.
  const socket = window.io ? window.io() : null;

  // Khoi dong: mo lai dung tab admin xem lan truoc
  let initialTab = null;
  try {
    initialTab = sessionStorage.getItem(TAB_KEY);
  } catch (err) {
    /* sessionStorage bi chan, bo qua */
  }

  syncAuthDot();

  // Doi cac module dang ky onTab xong (cac script phia sau) roi moi mo tab
  window.addEventListener('DOMContentLoaded', () => showTab(initialTab || tabButtons[0].dataset.tab));

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
