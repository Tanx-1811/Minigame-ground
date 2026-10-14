// Ap dung phan "Giao dien & noi dung" ma admin cau hinh vao 2 trang cong khai.
//
// Trong HTML chi can danh dau:
//   data-ui-text="brandTitle"   -> thay noi dung chu cua the do
//   data-ui-show="showActivity" -> an ca khoi neu admin tat co do
//
// Nho vay them 1 o cau hinh moi ben admin la trang cong khai tu hieu, khong phai
// sua JS. File nay tai /api/config dung 1 lan va chia se cho main.js / rooms.js
// (qua UiConfig.ready) de khong goi trung request.

window.UiConfig = (function () {
  let cache = null;

  function apply(ui) {
    if (!ui) return;
    cache = ui;

    document.querySelectorAll('[data-ui-text]').forEach((el) => {
      const value = ui[el.dataset.uiText];
      if (typeof value === 'string' && value.trim()) el.textContent = value;
    });

    document.querySelectorAll('[data-ui-show]').forEach((el) => {
      const flag = ui[el.dataset.uiShow];
      el.hidden = flag === false;
    });

    if (ui.accentColor) {
      document.documentElement.style.setProperty('--accent', ui.accentColor);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', ui.accentColor);
    }

    if (ui.brandTitle) document.title = `Dimaco · ${ui.brandTitle}`;
    if (window.Icons) window.Icons.refresh();
  }

  // 1 request /api/config duy nhat cho ca trang
  const ready = fetch('/api/config')
    .then((r) => r.json())
    .then((config) => {
      apply(config.ui);
      return config;
    })
    .catch((err) => {
      console.error('[ui-config] khong tai duoc cau hinh:', err);
      return {};
    });

  // Admin luu cau hinh -> ap dung ngay. Trang goi UiConfig.bind(socket) voi socket
  // san co cua no; khong tu mo socket moi vi moi ket noi deu bi tinh la 1 nguoi online.
  function bind(socket) {
    if (!socket) return;
    socket.on('settings:updated', (payload) => {
      if (payload && payload.ui) apply(payload.ui);
    });
  }

  return {
    apply,
    bind,
    ready,
    get current() {
      return cache;
    },
  };
})();
