// Nhac tai lai trang khi may chu da co ban moi.
//
// Vi sao can: giua su kien ma sua code roi khoi dong lai server, nhung tab dang
// mo van chay JS cu da nap vao bo nho. Luc do HTML moi + JS cu lech nhau, trieu
// chung rat kho doan: bam nut khong an gi, mot khu vuc trong tron, giao dien vo.
// Server gui "van tay" cua thu muc public ngay khi socket ket noi; lech voi ban
// trang dang chay la hien thanh nhac - nguoi dung bam mot cai la xong.
//
// Nap tren CA 3 trang. Khong tu mo socket rieng (moi ket noi deu bi tinh vao so
// nguoi dang online) - trang goi VersionGuard.bind(socket) voi socket san co.

window.VersionGuard = (function () {
  let known = null;
  let shown = false;

  function showBanner() {
    if (shown) return;
    shown = true;

    const bar = document.createElement('div');
    bar.className = 'version-banner';
    bar.setAttribute('role', 'alert');
    bar.innerHTML = `
      <span class="version-banner-text">
        <i data-lucide="rotate-cw"></i>
        Trang đã được cập nhật. Tải lại để dùng bản mới nhất.
      </span>
      <button type="button" class="version-banner-btn">Tải lại ngay</button>
      <button type="button" class="version-banner-close" aria-label="Để sau">
        <i data-lucide="x"></i>
      </button>`;

    bar.querySelector('.version-banner-btn').addEventListener('click', () => window.location.reload());
    bar.querySelector('.version-banner-close').addEventListener('click', () => bar.remove());

    document.body.appendChild(bar);
    if (window.Icons) window.Icons.refresh();
  }

  function check(build) {
    if (!build) return;
    if (known === null) {
      known = build;
      return;
    }
    if (build !== known) showBanner();
  }

  function bind(socket) {
    if (!socket) return;
    socket.on('app:version', (payload) => check(payload && payload.build));
    // Mat mang roi noi lai cung la luc hay gap ban moi (server vua khoi dong lai)
    socket.on('connect', () => {
      fetch('/api/version')
        .then((r) => r.json())
        .then((d) => check(d.build))
        .catch(() => {});
    });
  }

  fetch('/api/version')
    .then((r) => r.json())
    .then((d) => check(d.build))
    .catch(() => {});

  return { bind, check };
})();
