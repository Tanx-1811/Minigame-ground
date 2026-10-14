// Tab "Nhat ky": lich su thao tac luu trong DB (con nguyen sau khi restart server).
// Loc theo loai, xuat CSV, xoa nhat ky.
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="activity"]');
  const listBox = document.getElementById('activityList');
  const chipBox = document.getElementById('activityFilterChips');
  const msg = document.getElementById('activityMsg');
  const lockNote = document.getElementById('activityLockNote');
  const refreshBtn = document.getElementById('activityRefreshBtn');
  const exportBtn = document.getElementById('activityExportBtn');
  const clearBtn = document.getElementById('activityClearBtn');

  const FILTERS = [
    { key: 'all', label: 'Tất cả', icon: 'layers' },
    { key: 'random', label: 'Chia nhóm', icon: 'dices' },
    { key: 'room', label: 'Ghép phòng', icon: 'bed-double' },
    { key: 'quiz', label: 'Quiz', icon: 'brain' },
    { key: 'admin', label: 'Thao tác admin', icon: 'sliders-horizontal' },
  ];

  let rows = [];
  let activeFilter = 'all';

  function renderChips() {
    chipBox.innerHTML = FILTERS.map(
      (f) => `
      <button type="button" class="admin-filter-chip ${f.key === activeFilter ? 'is-active' : ''}"
        data-filter="${f.key}" data-always-enabled="1">
        ${A.icon(f.icon)} ${f.label}
      </button>`
    ).join('');
  }

  function render() {
    renderChips();

    listBox.innerHTML = rows.length
      ? rows
          .map(
            (row) => `
        <div class="admin-log-item is-${A.escapeHtml(row.type)}">
          <span class="admin-log-icon">${A.icon(row.icon || 'circle')}</span>
          <div class="admin-log-main">
            <div class="admin-log-msg">${A.escapeHtml(row.message)}</div>
            <div class="admin-log-time">${A.escapeHtml(A.timeAgo(row.at))}</div>
          </div>
        </div>`
          )
          .join('')
      : `<div class="admin-empty-rich">${A.icon('inbox')}<strong>Chưa có hoạt động nào</strong>
          <p>Mọi lượt bốc thăm, ghép phòng và thao tác admin sẽ được ghi lại ở đây.</p></div>`;

    A.applyEditLock(panel, lockNote);
    refreshBtn.disabled = false;
    exportBtn.disabled = false;
  }

  async function load() {
    try {
      // Co ma bi mat thi lay ban day du (200 dong), khong thi dung feed cong khai
      rows = A.canEdit()
        ? await A.request('GET', `/api/admin/activity?limit=200&type=${encodeURIComponent(activeFilter)}`)
        : await fetch(`/api/activity?limit=50&type=${encodeURIComponent(activeFilter)}`).then((r) => r.json());
      render();
    } catch (err) {
      A.setMsg(msg, err.message, 'err');
    }
  }

  chipBox.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    load();
  });

  refreshBtn.addEventListener('click', load);

  exportBtn.addEventListener('click', () => {
    const out = [['Thời điểm', 'Loại', 'Nội dung', 'Người thực hiện']];
    rows.forEach((row) => {
      out.push([new Date(row.at).toLocaleString('vi-VN', { hour12: false }), row.type, row.message, row.actor || '']);
    });
    A.downloadCsv('nhat-ky-su-kien.csv', out);
    A.done(msg, `Đã xuất ${rows.length} dòng ra file CSV.`);
  });

  clearBtn.addEventListener('click', async () => {
    const scope = activeFilter === 'all' ? 'toàn bộ nhật ký' : `nhật ký mục "${FILTERS.find((f) => f.key === activeFilter).label}"`;
    const ok = await A.confirmAction({
      title: 'Xóa nhật ký',
      message: `Xóa ${scope}? Lịch sử đã xóa không lấy lại được.`,
      okText: 'Xóa nhật ký',
    });
    if (!ok) return;

    const data = await A.run(clearBtn, msg, 'Đang xóa...', () =>
      A.request('POST', '/api/admin/activity/clear', { type: activeFilter })
    );
    if (!data) return;

    A.done(msg, `Đã xóa ${data.cleared} dòng nhật ký.`);
    load();
  });

  if (A.socket) {
    A.socket.on('activity:new', () => {
      if (A.activeTab() === 'activity') load();
    });
    A.socket.on('activity:cleared', () => {
      if (A.activeTab() === 'activity') load();
    });
  }

  A.onSecretChange(() => {
    if (A.activeTab() === 'activity') load();
  });

  A.onTab('activity', load);
})();
