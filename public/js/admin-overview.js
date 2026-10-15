// Tab "Tong quan": so lieu tong hop cua ca su kien + tien trinh 3 buoc
// (Quiz -> Chia nhom -> Ghep phong) va 10 hoat dong gan nhat.
// Day cung la noi cap nhat so dem canh ten cac tab o sidebar.
//
// Moi buoc co 1 trong 4 trang thai: Chua mo / Dang mo / Dang khoa / Hoan tat.
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

  const STATE = {
    wait: { label: 'Chưa mở', icon: 'circle', cls: 'is-wait' },
    open: { label: 'Đang mở', icon: 'play', cls: 'is-active' },
    locked: { label: 'Đang khóa', icon: 'lock', cls: 'is-locked' },
    done: { label: 'Hoàn tất', icon: 'circle-check', cls: 'is-done' },
  };

  function quizStep(flow, quiz) {
    if (!quiz.questions) {
      return {
        state: 'done',
        desc: 'Chưa có câu hỏi nào — hệ thống bỏ qua vòng Quiz, mở thẳng vòng chia nhóm.',
      };
    }
    if (flow.phase === 'random') {
      return {
        state: 'done',
        desc: `Đã chốt ${data.members.leaders} Nhóm Trưởng · ${quiz.finished} người làm xong ${quiz.questions} câu.`,
      };
    }
    if (quiz.status === 'active') {
      return {
        state: 'open',
        desc: `Đang làm bài: ${quiz.started} người đã bắt đầu, ${quiz.finished} người làm xong ${quiz.questions} câu. Cần ${quiz.leaderCount} Nhóm Trưởng.`,
      };
    }
    return {
      state: 'wait',
      desc: `${quiz.questions} câu hỏi · ${quiz.lobby} người trong phòng chờ. Bấm "Bắt đầu" ở trang Vòng Quiz.`,
    };
  }

  function groupStep(flow, groups) {
    const doneAll = groups.eligible > 0 && groups.assigned >= groups.eligible;
    const count = `${groups.assigned}/${groups.eligible} người đã có nhóm · ${groups.totalGroups} nhóm`;
    if (flow.phase !== 'random') return { state: 'wait', desc: `Mở sau khi chốt Nhóm Trưởng. ${count}.` };
    if (doneAll) return { state: 'done', desc: `${count}${flow.randomLocked ? ' · vòng đang khóa' : ''}.` };
    if (flow.randomLocked) return { state: 'locked', desc: `${count}. Mọi người không tự bốc thăm được.` };
    if (!groups.totalGroups) return { state: 'wait', desc: 'Chưa tạo nhóm nào — thêm nhóm ở trang Chia nhóm.' };
    return { state: 'open', desc: `${count}. Còn ${groups.pending} người chưa bốc thăm.` };
  }

  function roomStep(flow, rooms) {
    const totalRooms = rooms.byGender.MALE.rooms + rooms.byGender.FEMALE.rooms;
    // Ai chua dat gioi tinh thi chua the co phong -> chua the "hoan tat"
    const doneAll = rooms.noGender === 0 && rooms.eligible > 0 && rooms.assigned >= rooms.eligible;
    const parts = [`${rooms.assigned}/${rooms.eligible} người đã có phòng · ${totalRooms} phòng`];
    if (rooms.noGender) parts.push(`${rooms.noGender} người chưa đặt giới tính`);
    const count = parts.join(' · ');

    if (doneAll) return { state: 'done', desc: `${count}${flow.roomsLocked ? ' · vòng đang khóa' : ''}.` };
    if (flow.roomsLocked) return { state: 'locked', desc: `${count}. Mọi người không tự quay phòng được.` };
    if (!totalRooms) return { state: 'wait', desc: `Chưa tạo phòng nào — dùng "Tạo phòng tự động" ở trang Phòng ngủ. ${count}.` };
    return { state: 'open', desc: `${count}.` };
  }

  function renderFlow() {
    const { flow, quiz, groups, rooms } = data;

    const steps = [
      { icon: 'brain', title: 'Vòng Quiz', href: '/admin/quiz.html', ...quizStep(flow, quiz) },
      { icon: 'dices', title: 'Chia nhóm', href: '/admin/groups.html', ...groupStep(flow, groups) },
      { icon: 'bed-double', title: 'Ghép phòng ngủ', href: '/admin/rooms.html', ...roomStep(flow, rooms) },
    ];

    flowBox.innerHTML = steps
      .map((s, i) => {
        const view = STATE[s.state];
        return `
        <a class="admin-flow-step ${view.cls}" href="${s.href}">
          <span class="admin-flow-num" aria-hidden="true">${i + 1}</span>
          <span class="admin-flow-main">
            <span class="admin-flow-title">${A.icon(s.icon)} ${A.escapeHtml(s.title)}</span>
            <span class="admin-flow-desc">${A.escapeHtml(s.desc)}</span>
          </span>
          <span class="admin-flow-badge">${A.icon(view.icon, 'ic-sm')} ${view.label}</span>
        </a>`;
      })
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
    btn.setAttribute('aria-pressed', locked ? 'true' : 'false');
  }

  // Phong chia theo gioi nen tong suc chua du van co the thieu cho 1 ben, va
  // nguoi chua dat gioi tinh cung can 1 cho (chua biet ben nao).
  function capacityTile(r) {
    const gaps = ['FEMALE', 'MALE']
      .map((gender) => ({
        label: gender === 'FEMALE' ? 'nữ' : 'nam',
        missing: r.byGender[gender].members - r.byGender[gender].capacity,
      }))
      .filter((x) => x.missing > 0);

    let sub;
    let variant;
    if (!r.eligible) {
      sub = 'Không ai cần phòng';
      variant = '';
    } else if (gaps.length) {
      sub = `Thiếu ${gaps.map((g) => `${g.missing} chỗ ${g.label}`).join(', ')}`;
      variant = 'danger';
    } else if (r.totalCapacity < r.eligible) {
      sub = `Còn thiếu ${r.eligible - r.totalCapacity} chỗ${r.noGender ? ` (${r.noGender} người chưa đặt giới tính)` : ''}`;
      variant = r.totalCapacity === 0 ? 'danger' : 'warn';
    } else if (r.noGender) {
      sub = `Đủ chỗ cho người đã đặt giới tính · ${r.noGender} người chưa đặt`;
      variant = 'warn';
    } else {
      sub = 'Đủ chỗ cho mọi người';
      variant = 'ok';
    }
    return A.statTile({ icon: 'door-open', label: 'Tổng sức chứa', value: `${r.totalCapacity} chỗ`, sub, variant });
  }

  function renderStats() {
    const m = data.members;
    const g = data.groups;
    const r = data.rooms;

    memberStats.innerHTML = [
      A.statTile({ icon: 'users', label: 'Tổng thành viên', value: m.total, variant: 'accent' }),
      A.statTile({ icon: 'venus', label: 'Nữ', value: m.female, variant: 'female' }),
      A.statTile({ icon: 'mars', label: 'Nam', value: m.male, variant: 'male' }),
      A.statTile({
        icon: 'crown',
        label: 'Nhóm trưởng',
        value: `${m.leaders}/${data.quiz.leaderCount}`,
        variant: 'gold',
      }),
      A.statTile({
        icon: 'circle-alert',
        label: 'Chưa đặt giới tính',
        value: m.noGender,
        sub: m.noGender ? 'Chưa ghép phòng được' : 'Đã đặt đủ',
        variant: m.noGender ? 'warn' : 'ok',
      }),
      A.statTile({
        icon: 'user-round-x',
        label: 'Bị loại khỏi vòng',
        value: `${m.excludedRandom}/${m.excludedRoom}/${m.excludedQuiz}`,
        sub: 'Chia nhóm / Phòng / Quiz',
        variant: m.excludedRandom || m.excludedRoom || m.excludedQuiz ? 'danger' : '',
      }),
    ].join('');

    // 2 the canh nhau, moi the 4 o (luoi 2x2) - khong de le 1 o
    groupStats.innerHTML = [
      A.statTile({
        icon: 'user-round-check',
        label: 'Đã có nhóm',
        value: `${g.assigned}/${g.eligible}`,
        variant: g.pending ? 'warn' : 'ok',
        meter: { value: g.assigned, total: g.eligible, variant: g.pending ? 'warn' : 'ok' },
      }),
      A.statTile({ icon: 'hourglass', label: 'Chưa chia', value: g.pending, variant: g.pending ? 'warn' : '' }),
      A.statTile({
        icon: 'users-round',
        label: 'Số nhóm',
        value: g.totalGroups,
        sub: g.lockedGroups ? `${g.lockedGroups} nhóm đang khóa` : 'Không nhóm nào khóa',
        variant: 'accent',
      }),
      A.statTile({
        icon: 'user-round-x',
        label: 'Không tham gia',
        value: g.excluded,
        sub: 'Đã tắt quyền chia nhóm',
        variant: g.excluded ? 'danger' : '',
      }),
    ].join('');

    const notPlaced = r.pending + r.noGender;
    roomStats.innerHTML = [
      A.statTile({
        icon: 'bed-double',
        label: 'Đã có phòng',
        value: `${r.assigned}/${r.eligible}`,
        sub: notPlaced
          ? `${notPlaced} chưa xếp được${r.noGender ? ` (${r.noGender} chưa đặt giới tính)` : ''}`
          : r.eligible
          ? 'Ai cũng đã có phòng'
          : '',
        variant: notPlaced ? 'warn' : 'ok',
        meter: { value: r.assigned, total: r.eligible, variant: notPlaced ? 'warn' : 'ok' },
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
      capacityTile(r),
    ].join('');

    A.setBadge('members', data.members.total);
    A.setBadge('groups', data.groups.totalGroups);
    A.setBadge('rooms', data.rooms.byGender.MALE.rooms + data.rooms.byGender.FEMALE.rooms);
    A.setBadge('questions', data.quiz.questions);
  }

  function itemHtml(row) {
    return `
      <div class="admin-log-item is-${A.escapeHtml(row.type)}">
        <span class="admin-log-icon">${A.icon(row.icon || 'circle')}</span>
        <div class="admin-log-main">
          <div class="admin-log-msg">${A.escapeHtml(row.message)}</div>
          <div class="admin-log-time">${A.timeHtml(row.at)}</div>
        </div>
      </div>`;
  }

  const loadActivity = A.serial(async () => {
    try {
      const rows = A.canEdit()
        ? await A.request('GET', '/api/admin/activity?limit=10')
        : await fetch('/api/activity?limit=10').then((r) => r.json());
      activityBox.innerHTML = rows.length
        ? rows.map(itemHtml).join('')
        : `<div class="admin-empty-rich">${A.icon('inbox')}<strong>Chưa có hoạt động nào</strong>
             <p>Khi có người bốc thăm hoặc bạn thao tác gì đó, việc đó sẽ hiện ở đây.</p></div>`;
    } catch (err) {
      activityBox.innerHTML = '';
    }
  });

  const load = A.serial(async () => {
    // Tong quan can ma bi mat (so lieu day du); chua co thi hien huong dan.
    if (!A.canEdit()) {
      flowBox.innerHTML = `<div class="admin-empty-rich">${A.icon('key-round')}<strong>Cần mã bí mật admin</strong>
        <p>Nhập mã bí mật ở đầu trang để xem toàn cảnh sự kiện và thao tác.</p></div>`;
      memberStats.innerHTML = '';
      groupStats.innerHTML = '';
      roomStats.innerHTML = '';
      loadActivity();
      A.applyEditLock(panel, null);
      return;
    }

    try {
      data = await A.request('GET', '/api/admin/overview');
      renderFlow();
      renderStats();
      if (flowMsg.classList.contains('err')) A.setMsg(flowMsg, '');
    } catch (err) {
      A.setMsg(flowMsg, err.message, 'err');
    }
    loadActivity();
    A.applyEditLock(panel, null);
  });

  /* ---------- thao tac ---------- */

  refreshBtn.addEventListener('click', () => A.run(refreshBtn, null, '', load));

  async function toggleLock(btn, path, label) {
    const locked = btn.dataset.locked === '1';
    if (!locked) {
      const ok = await A.confirmAction({
        title: `Khóa ${label}`,
        message: `Khóa ${label}? Mọi người sẽ không tự bấm được nữa cho tới khi bạn mở lại. Kết quả hiện có vẫn giữ nguyên.`,
        okText: 'Khóa',
        danger: false,
      });
      if (!ok) return;
    }
    const result = await A.run(btn, flowMsg, 'Đang cập nhật...', () => A.request('POST', path, { locked: !locked }));
    if (!result) return;
    A.done(flowMsg, result.locked ? `Đã khóa ${label}.` : `Đã mở ${label}.`);
    scheduleLoad();
  }

  randomLockBtn.addEventListener('click', () => toggleLock(randomLockBtn, '/api/admin/settings/lock', 'vòng chia nhóm'));
  roomsLockBtn.addEventListener('click', () => toggleLock(roomsLockBtn, '/api/admin/rooms/lock', 'vòng ghép phòng'));

  /* ---------- realtime ---------- */

  // Luot boc tham cong khai cung phat activity:new -> trong luc su kien co the
  // don dap; gop lai (toi da ~1.5s cap nhat 1 lan) thay vi tai lai moi luot.
  const scheduleLoad = A.onLive(
    ['members:updated', 'groups:updated', 'rooms:updated', 'groups:reset', 'rooms:reset', 'phase:updated',
      'member:randomized', 'member:room-randomized', 'questions:updated', 'random:config', 'rooms:config',
      'settings:updated', 'quiz:started', 'quiz:progress', 'quiz:lobby', 'groups:bulk-randomized',
      'rooms:bulk-randomized'],
    load
  );
  A.onLive(['activity:new', 'activity:cleared'], loadActivity);

  A.onTab('overview', load);
})();
