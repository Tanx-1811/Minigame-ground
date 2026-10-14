// Tab "Phong ngu": tao/sua/xoa phong, ghep phong hang loat, keo nguoi ra khoi phong.
(function () {
  const A = window.AdminCommon;

  const roomStats = document.getElementById('roomStats');
  const roomList = document.getElementById('roomList');
  const roomListMsg = document.getElementById('roomListMsg');
  const roomActionMsg = document.getElementById('roomActionMsg');

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

  let locked = false;
  let latestPayload = null;

  function statTile({ label, value, sub, variant }) {
    return `
      <div class="admin-stat ${variant ? `is-${variant}` : ''}">
        <span class="admin-stat-label">${label}</span>
        <span class="admin-stat-value">${value}</span>
        ${sub ? `<span class="admin-stat-sub">${sub}</span>` : ''}
      </div>`;
  }

  function renderStats(stats) {
    const female = stats.byGender.FEMALE || { members: 0, assigned: 0, rooms: 0, capacity: 0 };
    const male = stats.byGender.MALE || { members: 0, assigned: 0, rooms: 0, capacity: 0 };

    const tiles = [
      statTile({
        label: 'Đã ghép phòng',
        value: `${stats.assigned}/${stats.totalMembers}`,
        sub: `${stats.totalCapacity} chỗ trong ${female.rooms + male.rooms} phòng`,
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
          sub: 'Chưa ghép phòng được — sang tab Thành viên',
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

  function roomCardHtml(room) {
    const isFull = room.occupancy >= room.capacity;
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

    const fillPct = room.capacity ? Math.min(100, Math.round((room.occupancy / room.capacity) * 100)) : 0;

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
          <div class="admin-room-actions">
            <button type="button" class="admin-row-btn danger" data-action="delete-room">🗑️ Xóa phòng</button>
          </div>
        </details>
      </div>`;
  }

  function render(payload) {
    latestPayload = payload;

    // Dang sua do giua danh sach thi hoan render lai (tranh mat chu dang nhap)
    if (roomList.contains(document.activeElement)) return;

    renderStats(payload.stats);

    if (!payload.rooms.length) {
      roomList.innerHTML =
        '<p class="admin-empty">Chưa có phòng nào. Dùng "Tạo phòng tự động" hoặc thêm phòng thủ công ở trên.</p>';
      return;
    }

    roomList.innerHTML = GENDER_ORDER.map((gender) => {
      const rooms = payload.rooms.filter((r) => r.gender === gender);
      if (!rooms.length) return '';
      const capacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
      const people = rooms.reduce((sum, r) => sum + r.occupancy, 0);
      return `
        <div class="admin-room-group">
          <div class="admin-room-group-head">
            <h4>${A.genderIcon(gender)} Phòng ${A.genderLabel(gender)}</h4>
            <span>${rooms.length} phòng · ${people}/${capacity} chỗ đã có người</span>
          </div>
          <div class="admin-room-list">${rooms.map(roomCardHtml).join('')}</div>
        </div>`;
    }).join('');
  }

  async function loadRooms() {
    try {
      const res = await fetch('/api/rooms');
      const payload = await res.json();
      locked = !!payload.locked;
      if (payload.defaultCapacity && !roomAutoCapacity.dataset.touched) {
        roomAutoCapacity.value = payload.defaultCapacity;
        newRoomCapacity.value = payload.defaultCapacity;
      }
      render(payload);
    } catch (err) {
      A.setMsg(roomListMsg, 'Không thể tải danh sách phòng', 'err');
    }
  }

  roomAutoCapacity.addEventListener('input', () => {
    roomAutoCapacity.dataset.touched = '1';
  });

  // Render bi hoan vi dang focus -> thu lai sau khi roi o nhap
  roomList.addEventListener('focusout', () => {
    setTimeout(() => {
      if (latestPayload && !roomList.contains(document.activeElement)) render(latestPayload);
    }, 0);
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
      parts.push(`Chưa ghép được ${data.skipped.length} người: ${data.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}`);
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

  /* ---------- sua / xoa tung phong ---------- */

  roomList.addEventListener('change', async (e) => {
    const field = e.target.dataset.field;
    if (!field) return;

    const card = e.target.closest('.admin-room');
    const roomId = Number(card.dataset.roomId);
    const value = e.target.value;

    const data = await A.run(null, roomListMsg, 'Đang lưu...', () =>
      A.request('PUT', `/api/admin/rooms/${roomId}`, { [field]: value })
    );
    if (!data) {
      loadRooms(); // tra ve gia tri cu khi server tu choi
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

    if (action === 'delete-room') {
      const roomName = card.querySelector('[data-field="name"]').value;
      if (!confirm(`Xóa phòng "${roomName}"? Người đang ở trong phòng sẽ trở về trạng thái chưa có phòng.`)) return;

      const data = await A.run(null, roomListMsg, 'Đang xóa phòng...', () =>
        A.request('DELETE', `/api/admin/rooms/${roomId}`)
      );
      if (!data) return;
      A.setMsg(
        roomListMsg,
        data.releasedMembers
          ? `Đã xóa phòng và đưa ${data.releasedMembers} người ra ngoài.`
          : 'Đã xóa phòng.',
        'ok'
      );
      loadRooms();
    }
  });

  /* ---------- realtime ---------- */

  if (A.socket) {
    A.socket.on('rooms:updated', (payload) => {
      if (payload && payload.rooms) render(payload);
    });
    A.socket.on('member:room-randomized', loadRooms);
    A.socket.on('rooms:reset', loadRooms);
    A.socket.on('rooms:config', (payload) => {
      if (payload) locked = !!payload.locked;
      loadRooms();
    });
  }

  A.onTab('rooms', loadRooms);
})();
