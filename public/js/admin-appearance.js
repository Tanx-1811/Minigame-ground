// Trang "Giao dien & noi dung": sua chu hien tren 2 trang cong khai va bat/tat
// tung khoi giao dien. Danh sach o nhap do server mo ta trong settings.schema,
// nen them key moi ben server la tu co o nhap, khong phai sua HTML.
(function () {
  const A = window.AdminCommon;

  const appearancePanel = document.querySelector('.admin-panel[data-panel="appearance"]');
  if (!appearancePanel) return;

  const appearanceLockNote = document.getElementById('appearanceLockNote');
  const uiTextFields = document.getElementById('uiTextFields');
  const uiFlagFields = document.getElementById('uiFlagFields');
  const saveUiBtn = document.getElementById('saveUiBtn');
  const previewUiBtn = document.getElementById('previewUiBtn');
  const uiMsg = document.getElementById('uiMsg');

  let settings = null;

  function renderAppearance() {
    if (!settings || !settings.schema) {
      uiTextFields.innerHTML = `<div class="admin-empty-rich">${A.icon('key-round')}
        <strong>Cần mã bí mật admin</strong>
        <p>Nhập mã bí mật ở đầu trang để sửa nội dung hiển thị trên các trang công khai.</p></div>`;
      uiFlagFields.innerHTML = '';
      return;
    }

    uiTextFields.innerHTML = settings.schema.text
      .map((field) => {
        const value = settings.ui[field.key] || '';
        const isColor = field.key.toLowerCase().includes('color');
        const long = value.length > 60 && !isColor;

        return `
          <div class="admin-field" ${long ? 'style="grid-column:1/-1"' : ''}>
            <label for="ui_${field.key}">${A.escapeHtml(field.label)}</label>
            ${
              isColor
                ? `<input id="ui_${field.key}" type="color" data-ui-text="${field.key}" value="${A.escapeHtml(value)}" />`
                : long
                ? `<textarea id="ui_${field.key}" data-ui-text="${field.key}" rows="2">${A.escapeHtml(value)}</textarea>`
                : `<input id="ui_${field.key}" type="text" data-ui-text="${field.key}" value="${A.escapeHtml(value)}" />`
            }
            <span class="admin-field-hint">Mặc định: ${A.escapeHtml(
              field.fallback.length > 70 ? `${field.fallback.slice(0, 70)}...` : field.fallback
            )}</span>
          </div>`;
      })
      .join('');

    uiFlagFields.innerHTML = settings.schema.flags
      .map(
        (field) => `
        <label class="admin-switch" for="ui_${field.key}">
          <span>${A.escapeHtml(field.label)}</span>
          <input id="ui_${field.key}" type="checkbox" data-ui-flag="${field.key}" ${settings.ui[field.key] ? 'checked' : ''} />
          <span class="admin-switch-track"></span>
        </label>`
      )
      .join('');

    A.applyEditLock(appearancePanel, appearanceLockNote);
  }

  async function load() {
    if (!A.canEdit()) {
      settings = null;
      renderAppearance();
      A.applyEditLock(appearancePanel, appearanceLockNote);
      return;
    }
    try {
      settings = await A.request('GET', '/api/admin/settings');
      renderAppearance();
    } catch (err) {
      A.setMsg(uiMsg, err.message, 'err');
    }
  }

  saveUiBtn.addEventListener('click', async () => {
    const ui = {};
    appearancePanel.querySelectorAll('[data-ui-text]').forEach((el) => {
      ui[el.dataset.uiText] = el.value;
    });
    appearancePanel.querySelectorAll('[data-ui-flag]').forEach((el) => {
      ui[el.dataset.uiFlag] = el.checked;
    });

    const data = await A.run(saveUiBtn, uiMsg, 'Đang lưu...', () => A.request('POST', '/api/admin/settings', { ui }));
    if (!data) return;

    A.done(uiMsg, 'Đã lưu — mọi người đang mở trang sẽ thấy ngay.');
    load();
  });

  previewUiBtn.addEventListener('click', () => {
    window.open('/', '_blank', 'noopener');
  });

  if (A.socket) {
    A.socket.on('settings:updated', load);
  }

  A.onSecretChange(load);
  A.onTab('appearance', load);
})();
