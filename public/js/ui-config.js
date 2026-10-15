// Ap dung phan "Giao dien & noi dung" ma admin cau hinh vao 2 trang cong khai.
//
// Trong HTML chi can danh dau:
//   data-ui-text="brandTitle"   -> thay noi dung chu cua the do
//   data-ui-show="showActivity" -> an ca khoi neu admin tat co do
//   <body data-ui-title="roomsTitle"> -> tieu de tab lay theo key nay (mac dinh brandTitle)
//
// Nho vay them 1 o cau hinh moi ben admin la trang cong khai tu hieu, khong phai
// sua JS. File nay tai /api/config dung 1 lan va chia se cho main.js / rooms.js
// (qua UiConfig.ready) de khong goi trung request.

window.UiConfig = (function () {
  let cache = null;
  const listeners = [];

  // Mau chu dat TREN nen mau chu dao: nen sang (vd vang) thi chu toi, nen dam thi chu trang.
  // Khong tinh thi admin chon mau vang la nut bam trang chu tren nen vang, khong doc duoc.
  function onAccentColor(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // So tuong phan voi trang vs voi chu toi #0b1220, chon ben cao hon
    return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.0565) ? '#ffffff' : '#0b1220';
  }

  function apply(ui) {
    if (!ui) return;
    cache = ui;

    document.querySelectorAll('[data-ui-text]').forEach((el) => {
      // Nut dang hien trang thai tam ("Dang tai...", "Sap bat dau...") thi de trang tu quan ly
      if (el.dataset.uiLock === '1') return;
      const value = ui[el.dataset.uiText];
      if (typeof value === 'string' && value.trim()) el.textContent = value;
    });

    document.querySelectorAll('[data-ui-show]').forEach((el) => {
      const flag = ui[el.dataset.uiShow];
      el.hidden = flag === false;
    });

    const root = document.documentElement;
    if (ui.accentColor) {
      // --accent-strong / --accent-soft / --accent-line tu suy ra tu --accent trong theme.css
      root.style.setProperty('--accent', ui.accentColor);
      const onAccent = onAccentColor(ui.accentColor);
      if (onAccent) root.style.setProperty('--on-accent', onAccent);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', ui.accentColor);
    }

    const titleKey = (document.body && document.body.dataset.uiTitle) || 'brandTitle';
    if (ui[titleKey]) document.title = `Dimaco · ${ui[titleKey]}`;
    if (window.Icons) window.Icons.refresh();

    listeners.forEach((fn) => {
      try {
        fn(ui);
      } catch (err) {
        console.error('[ui-config] listener loi:', err);
      }
    });
  }

  // 1 request /api/config duy nhat cho ca trang
  function load() {
    return fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((config) => {
        apply(config.ui);
        return config;
      })
      .catch((err) => {
        console.error('[ui-config] khong tai duoc cau hinh:', err);
        return null;
      });
  }

  const ready = load();

  // Doc lai cau hinh tu dau (vd sau khi admin reset, giai doan va gio mo co the da doi)
  function refresh() {
    return load();
  }

  // Admin luu cau hinh -> ap dung ngay. Trang goi UiConfig.bind(socket) voi socket
  // san co cua no; khong tu mo socket moi vi moi ket noi deu bi tinh la 1 nguoi online.
  function bind(socket) {
    if (!socket) return;
    socket.on('settings:updated', (payload) => {
      if (payload && payload.ui) apply(payload.ui);
    });
  }

  // Trang dang ky de phan ung khi cau hinh doi (vd tat trang ghep phong, tat am thanh)
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  // Doc 1 cong tac, chua tai xong cau hinh thi tra ve gia tri mac dinh
  function flag(key, fallback = true) {
    return cache && typeof cache[key] === 'boolean' ? cache[key] : fallback;
  }

  return {
    apply,
    bind,
    ready,
    refresh,
    onChange,
    flag,
    get current() {
      return cache;
    },
  };
})();
