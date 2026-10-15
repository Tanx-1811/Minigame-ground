// Trang "Giao dien & noi dung": sua chu hien tren 2 trang cong khai va bat/tat
// tung khoi giao dien. Danh sach o nhap do server mo ta trong settings.schema,
// nen them key moi ben server la tu co o nhap, khong phai sua HTML.
//
// Khoa vong (roomsLocked / randomLocked) KHONG nam o day - co nut rieng o trang
// Tong quan / Chia nhom / Phong ngu. Khi luu chi gui nhung o DA DOI, de 2 admin
// cung mo trang khong de len thay doi cua nhau.
(function () {
  const A = window.AdminCommon;

  const appearancePanel = document.querySelector('.admin-panel[data-panel="appearance"]');
  if (!appearancePanel) return;

  const appearanceLockNote = document.getElementById('appearanceLockNote');
  const uiTextFields = document.getElementById('uiTextFields');
  const uiFlagFields = document.getElementById('uiFlagFields');
  const saveUiBtn = document.getElementById('saveUiBtn');
  const resetUiBtn = document.getElementById('resetUiBtn');
  const previewUiBtn = document.getElementById('previewUiBtn');
  const uiMsg = document.getElementById('uiMsg');

  let settings = null;
  // Gia tri dang luu tren may chu cua tung o (chuoi cho o chu, boolean cho cong tac)
  const baseline = {};

  function valueOf(el) {
    return el.type === 'checkbox' ? el.checked : el.value;
  }

  function fields() {
    return [...appearancePanel.querySelectorAll('[data-ui-text], [data-ui-flag]')];
  }

  function keyOf(el) {
    return el.dataset.uiText || el.dataset.uiFlag;
  }

  function changedFields() {
    return fields().filter((el) => baseline[keyOf(el)] !== undefined && valueOf(el) !== baseline[keyOf(el)]);
  }

  function syncDirty() {
    const changed = new Set(changedFields());
    fields().forEach((el) => {
      const box = el.closest('.admin-field, .admin-switch');
      if (box) box.classList.toggle('is-dirty', changed.has(el));
    });
    A.setAllowed(saveUiBtn, changed.size > 0);
    A.setAllowed(resetUiBtn, changed.size > 0);
  }

  function textFieldHtml(field, value) {
    const isColor = field.key.toLowerCase().includes('color');
    const long = (value.length > 60 || field.fallback.length > 60) && !isColor;
    const id = `ui_${field.key}`;
    const hint = field.fallback.length > 70 ? `${field.fallback.slice(0, 70)}…` : field.fallback;

    return `
      <div class="admin-field ${long ? 'is-wide' : ''}">
        <label for="${id}">${A.escapeHtml(field.label)}</label>
        ${
          isColor
            ? `<span class="admin-color-field"><input id="${id}" type="color" data-ui-text="${field.key}" value="${A.escapeHtml(
                value || field.fallback
              )}" aria-describedby="${id}_hint" /><code data-color-code>${A.escapeHtml(value || field.fallback)}</code></span>`
            : long
            ? `<textarea id="${id}" data-ui-text="${field.key}" rows="2" aria-describedby="${id}_hint">${A.escapeHtml(value)}</textarea>`
            : `<input id="${id}" type="text" data-ui-text="${field.key}" value="${A.escapeHtml(value)}" aria-describedby="${id}_hint" />`
        }
        <span class="admin-field-hint" id="${id}_hint">Mặc định: ${A.escapeHtml(hint)}</span>
      </div>`;
  }

  function renderAppearance() {
    if (!settings || !settings.schema) {
      uiTextFields.innerHTML = `<div class="admin-empty-rich is-wide">${A.icon('key-round')}
        <strong>Cần mã bí mật admin</strong>
        <p>Nhập mã bí mật ở đầu trang để sửa nội dung hiển thị trên các trang công khai.</p></div>`;
      uiFlagFields.innerHTML = '';
      Object.keys(baseline).forEach((key) => delete baseline[key]);
      A.applyEditLock(appearancePanel, appearanceLockNote);
      syncDirty();
      return;
    }

    // Lan dau: dung form. Cac lan sau (do realtime): chi cap nhat o chua bi sua.
    const firstPaint = !uiTextFields.querySelector('[data-ui-text]');
    if (firstPaint) {
      uiTextFields.innerHTML = settings.schema.text.map((field) => textFieldHtml(field, settings.ui[field.key] || '')).join('');
      uiFlagFields.innerHTML = settings.schema.flags
        .map(
          (field) => `
          <label class="admin-switch" for="ui_${field.key}">
            <span>${A.escapeHtml(field.label)}</span>
            <input id="ui_${field.key}" type="checkbox" role="switch" data-ui-flag="${field.key}" ${
            settings.ui[field.key] ? 'checked' : ''
          } />
            <span class="admin-switch-track" aria-hidden="true"></span>
          </label>`
        )
        .join('');
    }

    fields().forEach((el) => {
      const key = keyOf(el);
      const server = el.type === 'checkbox' ? !!settings.ui[key] : String(settings.ui[key] || '');
      const clean = baseline[key] === undefined || valueOf(el) === baseline[key];
      if (clean && valueOf(el) !== server) {
        if (el.type === 'checkbox') el.checked = server;
        else el.value = server;
      }
      baseline[key] = server;
    });
    syncColorCodes();

    A.applyEditLock(appearancePanel, appearanceLockNote);
    syncDirty();
  }

  function syncColorCodes() {
    appearancePanel.querySelectorAll('.admin-color-field').forEach((box) => {
      box.querySelector('[data-color-code]').textContent = box.querySelector('input').value;
    });
  }

  const load = A.serial(async () => {
    if (!A.canEdit()) {
      settings = null;
      renderAppearance();
      return;
    }
    try {
      settings = await A.request('GET', '/api/admin/settings');
      renderAppearance();
    } catch (err) {
      A.setMsg(uiMsg, err.message, 'err');
    }
  });

  appearancePanel.addEventListener('input', (e) => {
    if (!e.target.matches('[data-ui-text], [data-ui-flag]')) return;
    if (e.target.type === 'color') syncColorCodes();
    syncDirty();
  });
  appearancePanel.addEventListener('change', (e) => {
    if (e.target.matches('[data-ui-text], [data-ui-flag]')) syncDirty();
  });

  resetUiBtn.addEventListener('click', () => {
    fields().forEach((el) => {
      const key = keyOf(el);
      if (baseline[key] === undefined) return;
      if (el.type === 'checkbox') el.checked = baseline[key];
      else el.value = baseline[key];
    });
    syncColorCodes();
    syncDirty();
    A.setMsg(uiMsg, 'Đã trả các ô về nội dung đang lưu.', '');
  });

  saveUiBtn.addEventListener('click', async () => {
    const changed = changedFields();
    if (!changed.length) {
      A.setMsg(uiMsg, 'Không có thay đổi nào để lưu.', 'warn');
      return;
    }

    const ui = {};
    changed.forEach((el) => {
      ui[keyOf(el)] = valueOf(el);
    });

    const data = await A.run(saveUiBtn, uiMsg, 'Đang lưu...', () => A.request('POST', '/api/admin/settings', { ui }));
    if (!data) {
      syncDirty();
      return;
    }

    // Server tra ve noi dung da ap dung (o de trong -> quay ve mac dinh)
    if (data.ui) settings = { ...settings, ui: data.ui };
    changed.forEach((el) => {
      const key = keyOf(el);
      baseline[key] = el.type === 'checkbox' ? !!data.ui[key] : String(data.ui[key] || '');
      if (el.type !== 'checkbox' && el.value !== baseline[key]) el.value = baseline[key];
    });
    syncColorCodes();
    syncDirty();
    A.done(uiMsg, `Đã lưu ${changed.length} mục — mọi người đang mở trang sẽ thấy ngay.`);
  });

  previewUiBtn.addEventListener('click', () => {
    window.open('/', '_blank', 'noopener');
  });

  A.onLive(['settings:updated'], load);

  A.onTab('appearance', load);
})();
