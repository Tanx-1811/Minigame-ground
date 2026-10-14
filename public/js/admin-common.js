// Tien ich dung chung cho moi module admin: ma bi mat, goi API, doi tab, thong bao.
// Khai bao truoc cac file admin-*.js khac trong admin-reset.html.

window.AdminCommon = (function () {
  const SECRET_KEY = 'randomTeam_adminSecret';
  const TAB_KEY = 'randomTeam_adminTab';

  const secretInput = document.getElementById('secretInput');
  const tabButtons = [...document.querySelectorAll('.admin-tab')];
  const panels = [...document.querySelectorAll('.admin-panel')];
  const tabHandlers = new Map();

  // Giu ma bi mat trong sessionStorage (mat khi dong trinh duyet) de admin khong
  // phai nhap lai moi lan F5 giua luc su kien dang chay.
  try {
    const saved = sessionStorage.getItem(SECRET_KEY);
    if (saved) secretInput.value = saved;
  } catch (err) {
    /* sessionStorage bi chan, bo qua */
  }

  let secretDebounce = null;
  secretInput.addEventListener('input', () => {
    try {
      sessionStorage.setItem(SECRET_KEY, secretInput.value.trim());
    } catch (err) {
      /* sessionStorage bi chan, bo qua */
    }

    // Vua nhap xong ma bi mat thi tai lai du lieu cua tab dang mo (nhieu tab can secret)
    clearTimeout(secretDebounce);
    secretDebounce = setTimeout(() => {
      const handler = tabHandlers.get(activeTab());
      if (secretInput.value.trim() && handler) handler();
    }, 700);
  });

  function getSecret() {
    return secretInput.value.trim();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str === null || str === undefined ? '' : String(str);
    return div.innerHTML;
  }

  function genderLabel(gender) {
    if (gender === 'MALE') return 'Nam';
    if (gender === 'FEMALE') return 'Nữ';
    return 'Chưa đặt';
  }

  function genderIcon(gender) {
    if (gender === 'MALE') return '👨';
    if (gender === 'FEMALE') return '👩';
    return '❔';
  }

  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-msg' + (kind ? ` ${kind}` : '');
  }

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
      const result = await task();
      return result;
    } catch (err) {
      setMsg(msgEl, err.message || 'Có lỗi xảy ra', 'err');
      return null;
    } finally {
      if (button) button.disabled = originalDisabled;
    }
  }

  /* ---------- tabs ---------- */

  function showTab(name) {
    const target = tabButtons.some((btn) => btn.dataset.tab === name) ? name : tabButtons[0].dataset.tab;

    tabButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === target));
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== target;
    });

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

  // Module dang ky ham tai du lieu cho tab cua minh; chay khi tab duoc mo.
  function onTab(name, handler) {
    tabHandlers.set(name, handler);
  }

  function activeTab() {
    const active = tabButtons.find((btn) => btn.classList.contains('is-active'));
    return active ? active.dataset.tab : null;
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

  // Doi cac module dang ky onTab xong (cac script phia sau) roi moi mo tab
  window.addEventListener('DOMContentLoaded', () => showTab(initialTab || tabButtons[0].dataset.tab));

  return {
    socket,
    getSecret,
    escapeHtml,
    genderLabel,
    genderIcon,
    setMsg,
    request,
    run,
    onTab,
    showTab,
    activeTab,
  };
})();
