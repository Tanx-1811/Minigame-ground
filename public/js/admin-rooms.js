// Tab "Phong ngu": tao/sua/xoa phong, ghep phong hang loat, xep tay tung nguoi,
// danh sach nguoi chua co phong, loc/tim phong, xuat CSV.
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="rooms"]');
  const roomStats = document.getElementById('roomStats');
  const roomList = document.getElementById('roomList');
  const roomListMsg = document.getElementById('roomListMsg');
  const roomActionMsg = document.getElementById('roomActionMsg');
  const roomLockNote = document.getElementById('roomLockNote');
  const roomFilter = document.getElementById('roomFilter');
  const roomFilterChips = document.getElementById('roomFilterChips');
  const roomDeleteEmptyBtn = document.getElementById('roomDeleteEmptyBtn');
  const roomExportBtn = document.getElementById('roomExportBtn');

  const pendingList = document.getElementById('pendingList');
  const pendingCount = document.getElementById('pendingCount');
  const pendingMsg = document.getElementById('pendingMsg');

  const roomAutoCapacity = document.getElementById('roomAutoCapacity');
  const roomAutoPrefix = document.getElementById('roomAutoPrefix');
  const roomAutoCreateBtn = document.getElementById('roomAutoCreateBtn');
  const roomRandomAllBtn = document.getElementById('roomRandomAllBtn');
  const roomLockBtn = document.getElementById('roomLockBtn');
  const roomResetBtn = document.getElementById('roomResetBtn');

  const newRoomName = document.getElementById('newRoomName');
  const newRoomGender = document.getElementById('newRoomGender');
  const newRoomCapacity = document.getElementById('newRoomCapacity');
  const newRoomNote = document.getElementById('newRoomNote');
  const addRoomBtn = document.getElementById('addRoomBtn');
  const addRoomMsg = document.getElementById('addRoomMsg');

  const GENDER_ORDER = ['FEMALE', 'MALE'];

  const ROOM_FILTERS = [
    { key: 'all', label: 'Tất cả', test: () => true },
    { key: 'female', label: '👩 Phòng nữ', test: (r) => r.gender === 'FEMALE' },
    { key: 'male', label: '👨 Phòng nam', test: (r) => r.gender === 'MALE' },
    { key: 'free', label: '🟢 Còn chỗ', test: (r) => r.occupancy < r.capacity },
    { key: 'full', label: '✅ Đã kín', test: (r) => r.occupancy >= r.capacity },
    { key: 'empty', label: '⚪ Đang trống', test: (r) => r.occupancy === 0 },
  ];

  let locked = false;
  let rooms = [];
  let stats = null;
  let members = [];
  let activeFilter = 'all';

  /* ---------- thong ke ---------- */

  function statTile({ label, value, sub, variant }) {
    return `
      <div class="admin-stat ${variant ? `is-${variant}` : ''}">
        <span class="admin-stat-label">${label}</span>
        <span class="admin-stat-value">${value}</span>
        ${sub ? `<span class="admin-stat-sub">${sub}</span>` : ''}
      </div>`;
  }

  function renderStats() {
    if (!stats) return;
    const female = stats.byGender.FEMALE || { members: 0, assigned: 0, rooms: 0, capacity: 0 };
    const male = stats.byGender.MALE || { members: 0, assigned: 0, rooms: 0, capacity: 0 };

    const tiles = [
      statTile({
        label: 'Đã ghép phòng',
        value: `${stats.assigned}/${stats.totalMembers}`,
        sub: `${stats.totalCapacity} chỗ trong ${rooms.length} phòng`,
        variant: stats.totalMembers > 0 && stats.assigned === stats.totalMembers ? 'ok' : '',
      }),
      statTile({
        label: '👩 Nữ',
        value: `${female.assigned}/${female.members}`,
        sub: `${female.rooms} phòng · ${female.capacity} chỗ`,
        variant: 'female',
      }),
      statTile({
        label: '👨 Nam',
        value: `${male.assigned}/${male.members}`,
        sub: `${male.rooms} phòng · ${male.capacity} chỗ`,
        variant: 'male',
      }),
    ];

    if (stats.noGender > 0) {
      tiles.push(
        statTile({
          label: '⚠️ Chưa đặt giới tính',
          value: stats.noGender,
          sub: 'Chưa ghép phòng được',
          variant: 'warn',
        })
      );
    }

    tiles.push(
      statTile({
        label: 'Vòng tự ghép',
        value: locked ? '🔒 Đang khóa' : '🔓 Đang mở',
        sub: locked ? 'Mọi người không tự quay được' : 'Mọi người tự quay ở /rooms.html',
        variant: locked ? 'warn' : 'ok',
      })
    );

    roomStats.innerHTML = tiles.join('');
    roomLockBtn.textContent = locked ? '🔓 Mở vòng ghép phòng' : '🔒 Khóa vòng ghép phòng';
  }

  /* ---------- nguoi chua co phong ---------- */

  function freeRoomOptions(gender) {
    const free = rooms.filter((r) => r.gender === gender && r.occupancy < r.capacity);
    if (!free.length) return '<option value="">Hết phòng trống</option>';
    return (
      '<option value="">Xếp vào phòng...</option>' +
      free
        .map((r) => `<option value="${r.id}">${A.escapeHtml(r.name)} (${r.occupancy}/${r.capacity})</option>`)
        .join('')
    );
  }

  function renderPending() {
    const pending = members.filter((m) => !m.roomId);
    pendingCount.textContent = `${pending.length} người`;
    pendingCount.className = `admin-chip ${pending.length ? 'is-warn' : 'is-ok'}`;

    if (!pending.length) {
      pendingList.innerHTML = '<p class="admin-empty">🎉 Tất cả mọi người đều đã có phòng.</p>';
      return;
    }

    pendingList.innerHTML = `<div class="admin-pending-list">${pending
      .map((m) => {
        if (!m.gender) {
          return `
            <div class="admin-pending is-warn" data-member-id="${m.id}">
              <span class="admin-pending-name">${A.escapeHtml(m.name)}</span>
              <span class="admin-tag is-warn">Chưa đặt giới tính</span>
              <button type="button" class="admin-row-btn" data-action="go-members" data-always-enabled="1">Đặt ngay</button>
            </div>`;
        }
        return `
          <div class="admin-pending" data-member-id="${m.id}">
            <span class="admin-pending-name">${A.escapeHtml(m.name)}</span>
            <span class="admin-tag ${m.gender === 'FEMALE' ? 'is-female' : 'is-male'}">${A.genderIcon(m.gender)} ${A.genderLabel(m.gender)}</span>
            <select data-action="assign-room">${freeRoomOptions(m.gender)}</select>
          </div>`;
      })
      .join('')}</div>`;
  }

  /* ---------- danh sach phong ---------- */

  function renderFilterChips() {
    roomFilterChips.innerHTML = ROOM_FILTERS.map((f) => {
      const count = rooms.filter(f.test).length;
      return `
        <button type="button" class="admin-filter-chip ${f.key === activeFilter ? 'is-active' : ''}"
          data-filter="${f.key}" data-always-enabled="1">
          ${f.label}<span class="admin-filter-count">${count}</span>
        </button>`;
    }).join('');
  }

  function visibleRooms() {
    const keyword = roomFilter.value.trim().toLowerCase();
    const filter = ROOM_FILTERS.find((f) => f.key === activeFilter) || ROOM_FILTERS[0];

    return rooms.filter(filter.test).filter((room) => {
      if (!keyword) return true;
      return (
        room.name.toLowerCase().includes(keyword) ||
        (room.note || '').toLowerCase().includes(keyword) ||
        room.members.some((m) => m.name.toLowerCase().includes(keyword))
      );
    });
  }

  function roomCardHtml(room) {
    const isFull = room.occupancy >= room.capacity;
    const fillPct = room.capacity ? Math.min(100, Math.round((room.occupancy / room.capacity) * 100)) : 0;

    const occupants = room.members.length
      ? room.members
          .map(
            (m) => `
            <li class="admin-occupant">
              <span>${A.escapeHtml(m.name)}</span>
              <button type="button" data-action="remove-member" data-member-id="${m.id}" title="Đưa ra khỏi phòng">✕</button>
            </li>`
          )
          .join('')
      : '<li class="admin-occupants-empty">Phòng đang trống</li>';

    return `
      <div class="admin-room ${room.gender === 'MALE' ? 'is-male' : 'is-female'} ${isFull ? 'is-full' : ''}" data-room-id="${room.id}">
        <div class="admin-room-top">
          <span class="admin-room-name">${A.genderIcon(room.gender)} ${A.escapeHtml(room.name)}</span>
          <span class="admin-room-count">${room.occupancy}/${room.capacity}</span>
        </div>
        <div class="admin-room-meter"><span style="width:${fillPct}%"></span></div>
        <div class="admin-room-body">
          ${room.note ? `<p class="admin-room-note">${A.escapeHtml(room.note)}</p>` : ''}
          <ul class="admin-occupants">${occupants}</ul>
        </div>
        <details class="admin-room-edit">
          <summary>⚙️ Sửa phòng</summary>
          <div class="admin-room-fields">
            <div class="span-2">
              <label>Tên phòng</label>
              <input type="text" data-field="name" value="${A.escapeHtml(room.name)}" />
            </div>
            <div>
              <label>Dành cho</label>
              <select data-field="gender">
                <option value="FEMALE" ${room.gender === 'FEMALE' ? 'selected' : ''}>👩 Nữ</option>
                <option value="MALE" ${room.gender === 'MALE' ? 'selected' : ''}>👨 Nam</option>
              </select>
            </div>
            <div>
              <label>Sức chứa</label>
              <input type="number" min="1" max="50" data-field="capacity" value="${room.capacity}" />
            </div>
            <div class="span-2">
              <label>Ghi chú</label>
              <input type="text" data-field="note" value="${A.escapeHtml(room.note || '')}" placeholder="Không có" />
            </div>
          </div>
          <div class="admin-room-actions admin-btn-row">
            <button type="button" class="admin-row-btn" data-action="clear-room" ${room.occupancy ? '' : 'disabled'}>🧍 Làm trống phòng</button>
            <button type="button" class="admin-row-btn danger" data-action="delete-room">🗑️ Xóa phòng</button>
          </div>
        </details>
      </div>`;
  }

  function render() {
    // Dang sua do giua danh sach thi hoan render lai (tranh mat chu dang nhap)
    if (roomList.contains(document.activeElement) || pendingList.contains(document.activeElement)) return;

    renderStats();
    renderFilterChips();
    renderPending();

    const list = visibleRooms();

    if (!rooms.length) {
      roomList.innerHTML =
        '<p class="admin-empty">Chưa có phòng nào. Dùng "Tạo phòng tự động" hoặc thêm phòng thủ công ở trên.</p>';
    } else if (!list.length) {
      roomList.innerHTML = '<p class="admin-empty">Không có phòng nào khớp bộ lọc hiện tại.</p>';
    } else {
      roomList.innerHTML = GENDER_ORDER.map((gender) => {
        const group = list.filter((r) => r.gender === gender);
        if (!group.length) return '';
        const capacity = group.reduce((sum, r) => sum + r.capacity, 0);
        const people = group.reduce((sum, r) => sum + r.occupancy, 0);
        return `
          <div class="admin-room-group">
            <div class="admin-room-group-head">
              <h4>${A.genderIcon(gender)} Phòng ${A.genderLabel(gender)}</h4>
              <span>${group.length} phòng · ${people}/${capacity} chỗ đã có người</span>
            </div>
            <div class="admin-room-list">${group.map(roomCardHtml).join('')}</div>
          </div>`;
      }).join('');
    }

    A.applyEditLock(panel, roomLockNote);
  }

  async function loadRooms() {
    try {
      const [payload, memberList] = await Promise.all([
        fetch('/api/rooms').then((r) => r.json()),
        fetch('/api/members').then((r) => r.json()),
      ]);

      rooms = payload.rooms || [];
      stats = payload.stats;
      locked = !!payload.locked;
      members = memberList;

      if (payload.defaultCapacity && !roomAutoCapacity.dataset.touched) {
        roomAutoCapacity.value = payload.defaultCapacity;
        newRoomCapacity.value = payload.defaultCapacity;
      }

      render();
    } catch (err) {
      A.setMsg(roomListMsg, 'Không thể tải danh sách phòng', 'err');
    }
  }

  roomAutoCapacity.addEventListener('input', () => {
    roomAutoCapacity.dataset.touched = '1';
  });

  roomFilter.addEventListener('input', render);

  roomFilterChips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    render();
  });

  [roomList, pendingList].forEach((el) => {
    el.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!roomList.contains(document.activeElement) && !pendingList.contains(document.activeElement)) render();
      }, 0);
    });
  });

  /* ---------- thao tac hang loat ---------- */

  roomAutoCreateBtn.addEventListener('click', async () => {
    const data = await A.run(roomAutoCreateBtn, roomActionMsg, 'Đang tạo phòng...', () =>
      A.request('POST', '/api/admin/rooms/auto-create', {
        capacity: roomAutoCapacity.value,
        prefix: roomAutoPrefix.value,
      })
    );
    if (!data) return;

    A.setMsg(
      roomActionMsg,
      data.created.length
        ? `Đã tạo ${data.created.length} phòng mới: ${data.created.map((r) => r.name).join(', ')}`
        : 'Số phòng hiện tại đã đủ chỗ cho tất cả mọi người, không cần tạo thêm.',
      'ok'
    );
    loadRooms();
  });

  roomRandomAllBtn.addEventListener('click', async () => {
    if (!confirm('Ghép phòng ngay cho tất cả những người chưa có phòng? Người đã có phòng sẽ được giữ nguyên.')) return;

    const data = await A.run(roomRandomAllBtn, roomActionMsg, 'Đang ghép phòng...', () =>
      A.request('POST', '/api/admin/rooms/random-all')
    );
    if (!data) return;

    const parts = [`Đã ghép phòng cho ${data.assigned.length} người.`];
    if (data.skipped.length) {
      parts.push(
        `Chưa ghép được ${data.skipped.length} người: ${data.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}`
      );
    }
    A.setMsg(roomActionMsg, parts.join(' '), data.skipped.length ? 'err' : 'ok');
    loadRooms();
  });

  roomLockBtn.addEventListener('click', async () => {
    const data = await A.run(roomLockBtn, roomActionMsg, 'Đang cập nhật...', () =>
      A.request('POST', '/api/admin/rooms/lock', { locked: !locked })
    );
    if (!data) return;

    locked = data.locked;
    A.setMsg(
      roomActionMsg,
      locked ? 'Đã khóa — mọi người không tự ghép phòng được nữa.' : 'Đã mở — mọi người có thể tự quay ghép phòng.',
      'ok'
    );
    loadRooms();
  });

  roomResetBtn.addEventListener('click', async () => {
    if (!confirm('Xóa toàn bộ kết quả ghép phòng để ghép lại từ đầu? Danh sách phòng vẫn được giữ. Không thể hoàn tác.')) {
      return;
    }

    const data = await A.run(roomResetBtn, roomActionMsg, 'Đang reset...', () =>
      A.request('POST', '/api/admin/rooms/reset')
    );
    if (!data) return;

    A.setMsg(roomActionMsg, `Đã bỏ ghép phòng của ${data.cleared} người.`, 'ok');
    loadRooms();
  });

  roomDeleteEmptyBtn.addEventListener('click', async () => {
    const emptyIds = rooms.filter((r) => r.occupancy === 0).map((r) => r.id);
    if (!emptyIds.length) {
      A.setMsg(roomListMsg, 'Không có phòng nào đang trống.', 'err');
      return;
    }
    if (!confirm(`Xóa ${emptyIds.length} phòng đang trống?`)) return;

    const data = await A.run(roomDeleteEmptyBtn, roomListMsg, 'Đang xóa phòng trống...', () =>
      A.request('POST', '/api/admin/rooms/bulk', { ids: emptyIds, action: 'delete' })
    );
    if (!data) return;

    A.setMsg(roomListMsg, `Đã xóa ${data.affected} phòng trống.`, 'ok');
    loadRooms();
  });

  /* ---------- them phong ---------- */

  addRoomBtn.addEventListener('click', async () => {
    const data = await A.run(addRoomBtn, addRoomMsg, 'Đang thêm phòng...', () =>
      A.request('POST', '/api/admin/rooms', {
        name: newRoomName.value,
        gender: newRoomGender.value,
        capacity: newRoomCapacity.value,
        note: newRoomNote.value,
      })
    );
    if (!data) return;

    A.setMsg(addRoomMsg, `Đã thêm phòng "${data.room.name}".`, 'ok');
    newRoomName.value = '';
    newRoomNote.value = '';
    loadRooms();
  });

  /* ---------- xep tay tung nguoi ---------- */

  pendingList.addEventListener('change', async (e) => {
    if (e.target.dataset.action !== 'assign-room' || !e.target.value) return;

    const memberId = Number(e.target.closest('[data-member-id]').dataset.memberId);
    const data = await A.run(null, pendingMsg, 'Đang xếp phòng...', () =>
      A.request('PUT', `/api/admin/members/${memberId}`, { roomId: e.target.value })
    );
    if (!data) {
      loadRooms();
      return;
    }

    A.setMsg(pendingMsg, `Đã xếp ${data.member.name} vào ${data.member.room.name}.`, 'ok');
    loadRooms();
  });

  pendingList.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'go-members') A.showTab('members');
  });

  /* ---------- sua / xoa tung phong ---------- */

  roomList.addEventListener('change', async (e) => {
    const field = e.target.dataset.field;
    if (!field) return;

    const roomId = Number(e.target.closest('.admin-room').dataset.roomId);
    const data = await A.run(null, roomListMsg, 'Đang lưu...', () =>
      A.request('PUT', `/api/admin/rooms/${roomId}`, { [field]: e.target.value })
    );
    if (!data) {
      loadRooms(); // server tu choi -> tra ve gia tri cu
      return;
    }

    A.setMsg(roomListMsg, `Đã cập nhật phòng "${data.room.name}".`, 'ok');
    loadRooms();
  });

  roomList.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const card = e.target.closest('.admin-room');
    const roomId = Number(card.dataset.roomId);
    const roomName = card.querySelector('[data-field="name"]').value;

    if (action === 'remove-member') {
      const memberId = Number(e.target.dataset.memberId);
      const data = await A.run(null, roomListMsg, 'Đang chuyển người ra...', () =>
        A.request('PUT', `/api/admin/members/${memberId}`, { roomId: null })
      );
      if (!data) return;
      A.setMsg(roomListMsg, `Đã đưa ${data.member.name} ra khỏi phòng.`, 'ok');
      loadRooms();
      return;
    }

    if (action === 'clear-room') {
      const room = rooms.find((r) => r.id === roomId);
      if (!room || !room.members.length) return;
      if (!confirm(`Đưa toàn bộ ${room.members.length} người ra khỏi phòng "${roomName}"?`)) return;

      const data = await A.run(null, roomListMsg, 'Đang làm trống phòng...', () =>
        A.request('POST', '/api/admin/members/bulk', {
          ids: room.members.map((m) => m.id),
          action: 'clear-room',
        })
      );
      if (!data) return;
      A.setMsg(roomListMsg, `Đã đưa ${data.affected} người ra khỏi "${roomName}".`, 'ok');
      loadRooms();
      return;
    }

    if (action === 'delete-room') {
      if (!confirm(`Xóa phòng "${roomName}"? Người đang ở trong phòng sẽ trở về trạng thái chưa có phòng.`)) return;

      const data = await A.run(null, roomListMsg, 'Đang xóa phòng...', () =>
        A.request('DELETE', `/api/admin/rooms/${roomId}`)
      );
      if (!data) return;
      A.setMsg(
        roomListMsg,
        data.releasedMembers ? `Đã xóa phòng và đưa ${data.releasedMembers} người ra ngoài.` : 'Đã xóa phòng.',
        'ok'
      );
      loadRooms();
    }
  });

  /* ---------- xuat CSV ---------- */

  roomExportBtn.addEventListener('click', () => {
    const rows = [['Phòng', 'Dành cho', 'Sức chứa', 'Số người', 'Ghi chú', 'Người ở']];
    visibleRooms().forEach((room) => {
      rows.push([
        room.name,
        A.genderLabel(room.gender),
        room.capacity,
        room.occupancy,
        room.note || '',
        room.members.map((m) => m.name).join(' | '),
      ]);
    });

    const pending = members.filter((m) => !m.roomId);
    pending.forEach((m) => {
      rows.push(['(chưa có phòng)', A.genderLabel(m.gender), '', '', '', m.name]);
    });

    A.downloadCsv('ghep-phong-ngu.csv', rows);
    A.setMsg(roomListMsg, `Đã xuất ${rows.length - 1} dòng ra file CSV.`, 'ok');
  });

  /* ---------- realtime ---------- */

  if (A.socket) {
    A.socket.on('rooms:updated', loadRooms);
    A.socket.on('member:room-randomized', loadRooms);
    A.socket.on('rooms:reset', loadRooms);
    A.socket.on('members:updated', loadRooms);
    A.socket.on('rooms:config', (payload) => {
      if (payload) locked = !!payload.locked;
      loadRooms();
    });
  }

  A.onSecretChange(render);

  A.onTab('rooms', loadRooms);
})();
