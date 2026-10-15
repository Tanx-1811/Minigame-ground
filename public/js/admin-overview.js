// Tab "Tong quan": so lieu tong hop cua ca su kien + tien trinh 3 buoc
// (Quiz -> Chia nhom -> Ghep phong) va 10 hoat dong gan nhat.
// Day cung la noi cap nhat so dem canh ten cac tab o sidebar.
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="overview"]');
  const flowBox = document.getElementById('overviewFlow');
  const flowMsg = document.getElementById('overviewFlowMsg');
  const memberStats = document.getElementById('overviewMemberStats');
  const groupStats = document.getElementById('overviewGroupStats');
  const roomStats = document.getElementById('overviewRoomStats');
  const activityBox = document.getElementById('overviewActivity');
  const refreshBtn = document.getElementById('overviewRefreshBtn');
  const randomLockBtn = document.getElementById('flowRandomLockBtn');
  const roomsLockBtn = document.getElementById('flowRoomsLockBtn');

  let data = null;

  function renderFlow() {
    const { flow, quiz, groups, rooms } = data;
    const quizDone = flow.phase === 'random';

    const steps = [
      {
        icon: 'brain',
        title: 'Vòng Quiz',
        desc: quiz.questions
          ? `${quiz.questions} câu hỏi · ${quiz.finished} người đã làm bài`
          : 'Chưa có câu hỏi nào — hệ thống bỏ qua bước này',
        state: quizDone ? 'done' : 'active',
        badge: quizDone ? 'Đã chốt Nhóm Trưởng' : quiz.status === 'active' ? 'Đang làm bài' : 'Đang chờ',
      },
      {
        icon: 'dices',
        title: 'Chia nhóm',
        desc: `${groups.assigned}/${groups.eligible} người đã có nhóm · ${groups.totalGroups} nhóm`,
        state: !quizDone ? 'wait' : groups.pending === 0 && groups.eligible > 0 ? 'done' : 'active',
        badge: flow.randomLocked ? 'Đang khóa' : !quizDone ? 'Chưa mở' : 'Đang mở',
      },
      {
        icon: 'bed-double',
        title: 'Ghép phòng ngủ',
        desc: `${rooms.assigned}/${rooms.eligible} người đã có phòng · ${rooms.byGender.MALE.rooms + rooms.byGender.FEMALE.rooms} phòng`,
        state: rooms.eligible > 0 && rooms.assigned >= rooms.eligible - rooms.noGender ? 'done' : 'active',
        badge: flow.roomsLocked ? 'Đang khóa' : 'Đang mở',
      },
    ];

    flowBox.innerHTML = steps
      .map(
        (s) => `
        <div class="admin-flow-step ${s.state === 'done' ? 'is-done' : s.state === 'active' ? 'is-active' : ''}">
          <h4>${A.icon(s.icon)} ${A.escapeHtml(s.title)}</h4>
          <p>${A.escapeHtml(s.desc)}</p>
          <span class="admin-flow-badge">${A.escapeHtml(s.badge)}</span>
        </div>`
      )
      .join('');

    syncLockButton(randomLockBtn, flow.randomLocked, 'vòng chia nhóm');
    syncLockButton(roomsLockBtn, flow.roomsLocked, 'vòng ghép phòng');
  }

  function syncLockButton(btn, locked, label) {
    if (!btn) return;
    btn.dataset.locked = locked ? '1' : '0';
    btn.innerHTML = `${A.icon(locked ? 'lock-open' : 'lock')} ${locked ? 'Mở' : 'Khóa'} ${label}`;
    btn.classList.toggle('admin-btn-warn', !locked);
    btn.classList.toggle('admin-btn-secondary', locked);
  }

  function roomGaps(r) {
    return ['FEMALE', 'MALE']
      .map((gender) => ({
        label: gender === 'FEMALE' ? 'nữ' : 'nam',
        missing: r.byGender[gender].members - r.byGender[gender].capacity,
      }))
      .filter((x) => x.missing > 0);
  }

  function renderStats() {
    const m = data.members;
    const g = data.groups;
    const r = data.rooms;

    memberStats.innerHTML = [
      A.statTile({ icon: 'users', label: 'Tổng thành viên', value: m.total, variant: 'accent' }),
      A.statTile({ icon: 'venus', label: 'Nữ', value: m.female, variant: 'female' }),
      A.statTile({ icon: 'mars', label: 'Nam', value: m.male, variant: 'male' }),
      A.statTile({ icon: 'crown', label: 'Nhóm trưởng', value: m.leaders, variant: 'gold' }),
      m.noGender
        ? A.statTile({
            icon: 'circle-alert',
            label: 'Chưa đặt giới tính',
            value: m.noGender,
            sub: 'Chưa ghép phòng được',
            variant: 'warn',
          })
        : '',
      m.excludedRandom || m.excludedRoom || m.excludedQuiz
        ? A.statTile({
            icon: 'user-round-x',
            label: 'Bị loại khỏi vòng',
            value: `${m.excludedRandom}/${m.excludedRoom}/${m.excludedQuiz}`,
            sub: 'Chia nhóm / Phòng / Quiz',
            variant: 'danger',
          })
        : '',
    ]
      .filter(Boolean)
      .join('');

    groupStats.innerHTML = [
      A.statTile({
        icon: 'user-round-check',
        label: 'Đã có nhóm',
        value: `${g.assigned}/${g.eligible}`,
        variant: g.pending ? 'warn' : 'ok',
        meter: { value: g.assigned, total: g.eligible, variant: g.pending ? 'warn' : 'ok' },
      }),
      A.statTile({ icon: 'users-round', label: 'Số nhóm', value: g.totalGroups }),
      A.statTile({ icon: 'hourglass', label: 'Chưa chia', value: g.pending, variant: g.pending ? 'warn' : '' }),
      g.lockedGroups ? A.statTile({ icon: 'lock', label: 'Nhóm đang khóa', value: g.lockedGroups, variant: 'warn' }) : '',
    ]
      .filter(Boolean)
      .join('');

    roomStats.innerHTML = [
      A.statTile({
        icon: 'bed-double',
        label: 'Đã có phòng',
        value: `${r.assigned}/${r.eligible}`,
        variant: r.pending ? 'warn' : 'ok',
        meter: { value: r.assigned, total: r.eligible, variant: r.pending ? 'warn' : 'ok' },
      }),
      A.statTile({
        icon: 'venus',
        label: 'Phòng nữ',
        value: `${r.byGender.FEMALE.rooms}`,
        sub: `${r.byGender.FEMALE.assigned}/${r.byGender.FEMALE.members} người · ${r.byGender.FEMALE.capacity} chỗ`,
        variant: 'female',
      }),
      A.statTile({
        icon: 'mars',
        label: 'Phòng nam',
        value: `${r.byGender.MALE.rooms}`,
        sub: `${r.byGender.MALE.assigned}/${r.byGender.MALE.members} người · ${r.byGender.MALE.capacity} chỗ`,
        variant: 'male',
      }),
      A.statTile({
        icon: 'door-open',
        label: 'Tổng sức chứa',
        value: r.totalCapacity,
        // Phong chia theo gioi nen phai doi chieu tung ben, khong nhin con so tong
        sub: roomGaps(r).length
          ? `Thiếu ${roomGaps(r).map((g) => `${g.missing} chỗ ${g.label}`).join(', ')}`
          : 'Đủ chỗ cho mọi người',
        variant: roomGaps(r).length ? 'danger' : 'ok',
      }),
    ].join('');

    A.setBadge('members', data.members.total);
    A.setBadge('groups', data.groups.totalGroups);
    A.setBadge('rooms', data.rooms.byGender.MALE.rooms + data.rooms.byGender.FEMALE.rooms);
    A.setBadge('questions', data.quiz.questions);
  }

  async function loadActivity() {
    try {
      const rows = await fetch('/api/activity?limit=10').then((r) => r.json());
      activityBox.innerHTML = rows.length
        ? rows.map(itemHtml).join('')
        : `<div class="admin-empty-rich">${A.icon('inbox')}<strong>Chưa có hoạt động nào</strong>
             <p>Khi có người bốc thăm hoặc bạn thao tác gì đó, việc đó sẽ hiện ở đây.</p></div>`;
    } catch (err) {
      activityBox.innerHTML = '';
    }
  }

  function itemHtml(row) {
    return `
      <div class="admin-log-item is-${A.escapeHtml(row.type)}">
        <span class="admin-log-icon">${A.icon(row.icon || 'circle')}</span>
        <div class="admin-log-main">
          <div class="admin-log-msg">${A.escapeHtml(row.message)}</div>
          <div class="admin-log-time">${A.escapeHtml(A.timeAgo(row.at))}</div>
        </div>
      </div>`;
  }

  async function load() {
    // Tong quan can ma bi mat (so lieu day du); chua co thi hien huong dan.
    if (!A.canEdit()) {
      flowBox.innerHTML = `<div class="admin-empty-rich">${A.icon('key-round')}<strong>Cần mã bí mật admin</strong>
        <p>Nhập mã bí mật ở đầu trang để xem toàn cảnh sự kiện và thao tác.</p></div>`;
      memberStats.innerHTML = '';
      groupStats.innerHTML = '';
      roomStats.innerHTML = '';
      loadActivity();
      A.applyEditLock(panel, null);
      refreshBtn.disabled = false;
      return;
    }

    try {
      data = await A.request('GET', '/api/admin/overview');
      renderFlow();
      renderStats();
    } catch (err) {
      A.setMsg(flowMsg, err.message, 'err');
    }
    loadActivity();
    A.applyEditLock(panel, null);
    refreshBtn.disabled = false;
  }

  /* ---------- thao tac ---------- */

  refreshBtn.addEventListener('click', load);

  randomLockBtn.addEventListener('click', async () => {
    const locked = randomLockBtn.dataset.locked === '1';
    const result = await A.run(randomLockBtn, flowMsg, 'Đang cập nhật...', () =>
      A.request('POST', '/api/admin/settings/lock', { locked: !locked })
    );
    if (!result) return;
    A.done(flowMsg, result.locked ? 'Đã khóa vòng chia nhóm.' : 'Đã mở vòng chia nhóm.');
    load();
  });

  roomsLockBtn.addEventListener('click', async () => {
    const locked = roomsLockBtn.dataset.locked === '1';
    const result = await A.run(roomsLockBtn, flowMsg, 'Đang cập nhật...', () =>
      A.request('POST', '/api/admin/rooms/lock', { locked: !locked })
    );
    if (!result) return;
    A.done(flowMsg, result.locked ? 'Đã khóa vòng ghép phòng.' : 'Đã mở vòng ghép phòng.');
    load();
  });

  /* ---------- realtime ---------- */

  if (A.socket) {
    const refreshIfVisible = () => {
      if (A.activeTab() === 'overview') load();
    };
    ['members:updated', 'groups:updated', 'rooms:updated', 'groups:reset', 'rooms:reset', 'phase:updated',
      'member:randomized', 'member:room-randomized', 'questions:updated', 'activity:new'].forEach((evt) => {
      A.socket.on(evt, refreshIfVisible);
    });
  }

  A.onSecretChange(() => {
    if (A.activeTab() === 'overview') load();
  });

  A.onTab('overview', load);
})();
