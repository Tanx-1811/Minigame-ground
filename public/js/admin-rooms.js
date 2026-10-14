// Tab "Phong ngu": tao phong, ghep nguoi, sua/khoa/xoa tung phong, doi cho 2 nguoi.
//
// Nguyen tac: nam o voi nam, nu o voi nu - moi o chon phong chi liet ke phong
// dung gioi tinh va con cho. Phong bi KHOA van giu nguoi dang o nhung khong
// nhan them ai khi random.
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="rooms"]');
  const statsBox = document.getElementById('roomStats');

  const autoCapacity = document.getElementById('roomAutoCapacity');
  const autoPrefix = document.getElementById('roomAutoPrefix');
  const autoCreateBtn = document.getElementById('roomAutoCreateBtn');
  const randomAllBtn = document.getElementById('roomRandomAllBtn');
  const reshuffleBtn = document.getElementById('roomReshuffleBtn');
  const lockBtn = document.getElementById('roomLockBtn');
  const resetBtn = document.getElementById('roomResetBtn');
  const keepPinned = document.getElementById('roomKeepPinned');
  const actionMsg = document.getElementById('roomActionMsg');

  const newName = document.getElementById('newRoomName');
  const newGender = document.getElementById('newRoomGender');
  const newCapacity = document.getElementById('newRoomCapacity');
  const newNote = document.getElementById('newRoomNote');
  const addBtn = document.getElementById('addRoomBtn');
  const addMsg = document.getElementById('addRoomMsg');

  const pendingCount = document.getElementById('pendingCount');
  const pendingList = document.getElementById('pendingList');
  const pendingMsg = document.getElementById('pendingMsg');

  const swapA = document.getElementById('swapMemberA');
  const swapB = document.getElementById('swapMemberB');
  const swapBtn = document.getElementById('swapBtn');
  const swapMsg = document.getElementById('swapMsg');

  const roomFilter = document.getElementById('roomFilter');
  const filterChips = document.getElementById('roomFilterChips');
  const deleteEmptyBtn = document.getElementById('roomDeleteEmptyBtn');
  const lockFullBtn = document.getElementById('roomLockEmptyBtn');
  const roomList = document.getElementById('roomList');
  const roomListMsg = document.getElementById('roomListMsg');
  const lockNote = document.getElementById('roomLockNote');
  const exportBtn = document.getElementById('roomExportBtn');

  const FILTERS = [
    { key: 'all', label: 'Tất cả', icon: 'layers', test: () => true },
    { key: 'female', label: 'Phòng nữ', icon: 'venus', test: (r) => r.gender === 'FEMALE' },
    { key: 'male', label: 'Phòng nam', icon: 'mars', test: (r) => r.gender === 'MALE' },
    { key: 'free', label: 'Còn chỗ', icon: 'door-open', test: (r) => r.occupancy < r.capacity },
    { key: 'full', label: 'Đã kín', icon: 'door-closed', test: (r) => r.occupancy >= r.capacity },
    { key: 'empty', label: 'Đang trống', icon: 'ghost', test: (r) => r.occupancy === 0 },
    { key: 'locked', label: 'Đang khóa', icon: 'lock', test: (r) => r.locked },
  ];

  let activeFilter = 'all';
  let rooms = [];
  let stats = null;
  let members = [];
  let roundLocked = false;
  const expanded = new Set();

  /* ---------- hien thi ---------- */

  // Phong chia theo gioi nen tong suc chua du van co the thieu cho cho 1 ben.
  // Tra ve danh sach gioi dang thieu kem so cho con thieu.
  function shortage(st) {
    return ['FEMALE', 'MALE']
      .map((gender) => ({
        label: gender === 'FEMALE' ? 'nữ' : 'nam',
        missing: st.byGender[gender].members - st.byGender[gender].capacity,
      }))
      .filter((x) => x.missing > 0);
  }

  function shortageText(st) {
    const gaps = shortage(st);
    return gaps.length ? `Thiếu ${gaps.map((g) => `${g.missing} chỗ ${g.label}`).join(', ')}` : 'Đủ chỗ cho mọi người';
  }

  function renderStats() {
    if (!stats) {
      statsBox.innerHTML = '';
      return;
    }
    const f = stats.byGender.FEMALE;
    const m = stats.byGender.MALE;

    statsBox.innerHTML = [
      A.statTile({
        icon: 'bed-double',
        label: 'Đã có phòng',
        value: `${stats.assigned}/${stats.eligible}`,
        variant: stats.pending ? 'warn' : 'ok',
        meter: { value: stats.assigned, total: stats.eligible, variant: stats.pending ? 'warn' : 'ok' },
      }),
      A.statTile({
        icon: 'venus',
        label: 'Phòng nữ',
        value: f.rooms,
        sub: `${f.assigned}/${f.members} người · ${f.capacity} chỗ`,
        variant: 'female',
      }),
      A.statTile({
        icon: 'mars',
        label: 'Phòng nam',
        value: m.rooms,
        sub: `${m.assigned}/${m.members} người · ${m.capacity} chỗ`,
        variant: 'male',
      }),
      A.statTile({
        icon: 'door-open',
        label: 'Tổng sức chứa',
        value: stats.totalCapacity,
        sub: shortageText(stats),
        variant: shortage(stats).length ? 'danger' : 'ok',
      }),
      stats.noGender
        ? A.statTile({
            icon: 'circle-alert',
            label: 'Chưa đặt giới tính',
            value: stats.noGender,
            sub: 'Không ghép phòng được',
            variant: 'warn',
          })
        : '',
      stats.excluded
        ? A.statTile({ icon: 'user-round-x', label: 'Không tham gia', value: stats.excluded, variant: 'danger' })
        : '',
      stats.lockedRooms ? A.statTile({ icon: 'lock', label: 'Phòng đang khóa', value: stats.lockedRooms, variant: 'warn' }) : '',
    ]
      .filter(Boolean)
      .join('');

    A.setBadge('rooms', rooms.length);
  }

  function renderFilterChips() {
    filterChips.innerHTML = FILTERS.map((f) => {
      const count = rooms.filter(f.test).length;
      return `
        <button type="button" class="admin-filter-chip ${f.key === activeFilter ? 'is-active' : ''}"
          data-filter="${f.key}" data-always-enabled="1">
          ${A.icon(f.icon)} ${f.label}<span class="admin-filter-count">${count}</span>
        </button>`;
    }).join('');
  }

  function visibleRooms() {
    const keyword = roomFilter.value.trim().toLowerCase();
    const filter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];
    return rooms
      .filter(filter.test)
      .filter(
        (r) =>
          !keyword ||
          r.name.toLowerCase().includes(keyword) ||
          (r.note || '').toLowerCase().includes(keyword) ||
          r.members.some((m) => m.name.toLowerCase().includes(keyword))
      );
  }

  function occupantHtml(member, room) {
    return `
      <div class="admin-occupant">
        ${A.icon(member.isLeader ? 'crown' : A.genderIcon(member.gender), 'ic-sm')}
        <span class="admin-occupant-name">${A.escapeHtml(member.name)}</span>
        ${member.pinnedRoom ? A.icon('pin', 'ic-sm') : ''}
        <button type="button" data-action="remove-member" data-member-id="${member.id}" title="Đưa ra khỏi ${A.escapeHtml(
          room.name
        )}">${A.icon('x', 'ic-sm')}</button>
      </div>`;
  }

  function roomCardHtml(room) {
    const pct = room.capacity ? Math.min(100, Math.round((room.occupancy / room.capacity) * 100)) : 0;
    const classes = [
      A.genderClass(room.gender),
      room.isFull ? 'is-full' : '',
      room.locked ? 'is-locked' : '',
      room.occupancy === 0 ? 'is-empty' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return `
      <div class="admin-room ${classes}" data-room-id="${room.id}">
        <div class="admin-room-top">
          <div class="admin-room-name">
            <span>${A.icon(A.genderIcon(room.gender))} ${A.escapeHtml(room.name)}</span>
            ${room.locked ? `<span class="admin-tag is-locked">${A.icon('lock', 'ic-sm')} Đang khóa</span>` : ''}
          </div>
          <span class="admin-room-count">${room.occupancy}/${room.capacity}</span>
        </div>

        <div class="admin-room-meter"><span style="width:${pct}%"></span></div>

        <div class="admin-room-body">
          ${room.note ? `<p class="admin-room-note">${A.icon('sticky-note', 'ic-sm')} ${A.escapeHtml(room.note)}</p>` : ''}
          <div class="admin-occupants">
            ${
              room.members.length
                ? room.members.map((m) => occupantHtml(m, room)).join('')
                : `<div class="admin-occupants-empty">${A.icon('ghost', 'ic-sm')} Chưa có ai ở phòng này</div>`
            }
          </div>
        </div>

        <div class="admin-room-actions">
          <button type="button" class="admin-row-btn" data-action="toggle-edit">${A.icon('pencil')} Sửa phòng</button>
          <button type="button" class="admin-row-btn ${room.locked ? 'is-on' : ''}" data-action="toggle-lock">
            ${A.icon(room.locked ? 'lock-open' : 'lock')} ${room.locked ? 'Mở khóa' : 'Khóa'}
          </button>
          <button type="button" class="admin-row-btn" data-action="clear">${A.icon('user-round-minus')} Dọn phòng</button>
        </div>

        <div class="admin-room-edit" ${expanded.has(room.id) ? '' : 'hidden'}>
          <div class="admin-room-fields">
            <div class="admin-field">
              <label>Tên phòng</label>
              <input type="text" data-edit="name" value="${A.escapeHtml(room.name)}" />
            </div>
            <div class="admin-field">
              <label>Dành cho</label>
              <select data-edit="gender">
                <option value="FEMALE" ${room.gender === 'FEMALE' ? 'selected' : ''}>Nữ</option>
                <option value="MALE" ${room.gender === 'MALE' ? 'selected' : ''}>Nam</option>
              </select>
            </div>
            <div class="admin-field">
              <label>Sức chứa</label>
              <input type="number" min="1" max="50" data-edit="capacity" value="${room.capacity}" />
            </div>
            <div class="admin-field">
              <label>Ghi chú</label>
              <input type="text" data-edit="note" value="${A.escapeHtml(room.note || '')}" />
            </div>
          </div>
          <div class="admin-btn-row">
            <button type="button" class="admin-row-btn" data-action="save">${A.icon('save')} Lưu phòng</button>
            <button type="button" class="admin-row-btn danger" data-action="delete">${A.icon('trash-2')} Xóa phòng</button>
          </div>
        </div>
      </div>`;
  }

  function renderRooms() {
    const list = visibleRooms();

    if (!list.length) {
      roomList.innerHTML = `<div class="admin-empty-rich">${A.icon(rooms.length ? 'search-x' : 'door-closed')}
        <strong>${rooms.length ? 'Không có phòng nào khớp bộ lọc' : 'Chưa có phòng nào'}</strong>
        <p>${
          rooms.length
            ? 'Thử đổi bộ lọc hoặc xóa từ khóa tìm kiếm.'
            : 'Dùng "Tạo phòng tự động" ở trên để hệ thống tạo đủ phòng cho cả nam và nữ.'
        }</p></div>`;
      return;
    }

    // Tach 2 cot nam / nu cho de nhin
    const sections = [
      { gender: 'FEMALE', label: 'Phòng nữ', icon: 'venus' },
      { gender: 'MALE', label: 'Phòng nam', icon: 'mars' },
    ]
      .map((section) => {
        const ofGender = list.filter((r) => r.gender === section.gender);
        if (!ofGender.length) return '';
        const people = ofGender.reduce((sum, r) => sum + r.occupancy, 0);
        const slots = ofGender.reduce((sum, r) => sum + r.capacity, 0);

        return `
          <div>
            <div class="admin-room-group-head ${A.genderClass(section.gender)}">
              ${A.icon(section.icon)} ${section.label}
              <span class="admin-chip">${ofGender.length} phòng · ${people}/${slots} chỗ</span>
            </div>
            <div class="admin-room-group">${ofGender.map(roomCardHtml).join('')}</div>
          </div>`;
      })
      .join('');

    roomList.innerHTML = `<div class="admin-room-list">${sections}</div>`;
  }

  function renderPending() {
    const pending = members.filter((m) => m.joinRoom !== false && !m.roomId);
    pendingCount.innerHTML = `${A.icon('user-round-search')} ${pending.length} người`;

    pendingList.innerHTML = pending.length
      ? `<div class="admin-pending-list">${pending
          .map((member) => {
            const options = member.gender
              ? '<option value="">-- Chọn phòng --</option>' +
                rooms
                  .filter((r) => r.gender === member.gender)
                  .map((r) => {
                    const full = r.occupancy >= r.capacity;
                    return `<option value="${r.id}" ${full ? 'disabled' : ''}>${A.escapeHtml(r.name)} (${r.occupancy}/${
                      r.capacity
                    })${full ? ' - kín' : ''}${r.locked ? ' 🔒' : ''}</option>`;
                  })
                  .join('')
              : '<option value="">-- Cần đặt giới tính --</option>';

            return `
              <div class="admin-pending" data-member-id="${member.id}">
                <span class="admin-pending-name">
                  ${A.icon(A.genderIcon(member.gender), 'ic-sm')} ${A.escapeHtml(member.name)}
                </span>
                <select data-action="assign" ${member.gender ? '' : 'disabled data-keep-disabled="1"'}>${options}</select>
              </div>`;
          })
          .join('')}</div>`
      : `<div class="admin-empty-rich">${A.icon('party-popper')}<strong>Mọi người đều đã có phòng</strong>
          <p>Không còn ai chờ ghép phòng nữa.</p></div>`;
  }

  function renderSwapSelects() {
    const inRoom = members.filter((m) => m.roomId);
    const byId = new Map(rooms.map((r) => [r.id, r.name]));

    const options = (current) =>
      '<option value="">-- Chọn người --</option>' +
      inRoom
        .map(
          (m) =>
            `<option value="${m.id}" ${String(m.id) === current ? 'selected' : ''}>${A.escapeHtml(m.name)} · ${A.escapeHtml(
              byId.get(m.roomId) || ''
            )}</option>`
        )
        .join('');

    swapA.innerHTML = options(swapA.value);
    swapB.innerHTML = options(swapB.value);
  }

  function syncLockBtn() {
    lockBtn.innerHTML = `${A.icon(roundLocked ? 'lock-open' : 'lock')} ${
      roundLocked ? 'Mở vòng ghép phòng' : 'Khóa vòng ghép phòng'
    }`;
    lockBtn.classList.toggle('admin-btn-danger', !roundLocked);
    lockBtn.classList.toggle('admin-btn-secondary', roundLocked);
  }

  function render() {
    if (roomList.contains(document.activeElement) || pendingList.contains(document.activeElement)) return;

    renderStats();
    renderFilterChips();
    renderRooms();
    renderPending();
    renderSwapSelects();
    syncLockBtn();

    A.applyEditLock(panel, lockNote);
  }

  /* ---------- tai du lieu ---------- */

  async function load() {
    try {
      const [roomRes, memberRes] = await Promise.all([
        fetch('/api/rooms').then((r) => r.json()),
        fetch('/api/members').then((r) => r.json()),
      ]);
      rooms = roomRes.rooms || [];
      stats = roomRes.stats || null;
      roundLocked = !!roomRes.locked;
      members = memberRes;

      if (roomRes.defaultCapacity && !autoCapacity.dataset.touched) {
        autoCapacity.value = roomRes.defaultCapacity;
        newCapacity.value = roomRes.defaultCapacity;
      }

      render();
      A.setMsg(roomListMsg, '');
    } catch (err) {
      A.setMsg(roomListMsg, err.message, 'err');
    }
  }

  autoCapacity.addEventListener('input', () => {
    autoCapacity.dataset.touched = '1';
  });

  /* ---------- loc ---------- */

  roomFilter.addEventListener('input', render);

  filterChips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    render();
  });

  /* ---------- thao tac tren tung phong ---------- */

  roomList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const card = btn.closest('.admin-room');
    const roomId = Number(card.dataset.roomId);
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    const action = btn.dataset.action;

    if (action === 'toggle-edit') {
      const box = card.querySelector('.admin-room-edit');
      box.hidden = !box.hidden;
      if (box.hidden) expanded.delete(roomId);
      else expanded.add(roomId);
      return;
    }

    if (action === 'remove-member') {
      const memberId = Number(btn.dataset.memberId);
      const data = await A.run(null, roomListMsg, 'Đang cập nhật...', () =>
        A.request('POST', '/api/admin/rooms/move', { memberId, roomId: '' })
      );
      if (!data) return;
      A.setMsg(roomListMsg, 'Đã đưa ra khỏi phòng.', 'ok');
      load();
      return;
    }

    if (action === 'toggle-lock') {
      const data = await A.run(btn, roomListMsg, 'Đang cập nhật...', () =>
        A.request('PUT', `/api/admin/rooms/${roomId}`, { locked: !room.locked })
      );
      if (!data) return;
      A.done(roomListMsg, room.locked ? `Đã mở khóa ${room.name}.` : `Đã khóa ${room.name}.`);
      load();
      return;
    }

    if (action === 'clear') {
      if (!room.members.length) {
        A.setMsg(roomListMsg, 'Phòng này đang trống', 'warn');
        return;
      }
      const ok = await A.confirmAction({
        title: 'Dọn phòng',
        message: `Đưa <strong>${room.members.length} người</strong> ra khỏi ${A.escapeHtml(
          room.name
        )}?<br />Người đã ghim vẫn được giữ lại.`,
        okText: 'Dọn phòng',
      });
      if (!ok) return;

      const data = await A.run(btn, roomListMsg, 'Đang dọn...', () =>
        A.request('POST', '/api/admin/rooms/bulk', { ids: [roomId], action: 'clear' })
      );
      if (!data) return;
      A.done(roomListMsg, `Đã đưa ${data.affected} người ra khỏi phòng.`);
      load();
      return;
    }

    if (action === 'save') {
      const read = (field) => card.querySelector(`[data-edit="${field}"]`).value;
      const data = await A.run(btn, roomListMsg, 'Đang lưu...', () =>
        A.request('PUT', `/api/admin/rooms/${roomId}`, {
          name: read('name'),
          gender: read('gender'),
          capacity: read('capacity'),
          note: read('note'),
        })
      );
      if (!data) return;
      A.done(roomListMsg, `Đã lưu ${data.room.name}.`);
      load();
      return;
    }

    if (action === 'delete') {
      const ok = await A.confirmAction({
        title: 'Xóa phòng',
        message: `Xóa phòng <strong>${A.escapeHtml(room.name)}</strong>?<br />${
          room.members.length ? `${room.members.length} người đang ở sẽ quay về trạng thái chưa có phòng.` : 'Phòng đang trống.'
        }`,
        okText: 'Xóa phòng',
      });
      if (!ok) return;

      const data = await A.run(btn, roomListMsg, 'Đang xóa...', () => A.request('DELETE', `/api/admin/rooms/${roomId}`));
      if (!data) return;
      expanded.delete(roomId);
      A.done(roomListMsg, `Đã xóa phòng (${data.releasedMembers} người quay về chưa có phòng).`);
      load();
    }
  });

  /* ---------- xep tay nguoi chua co phong ---------- */

  pendingList.addEventListener('change', async (e) => {
    const select = e.target.closest('[data-action="assign"]');
    if (!select || !select.value) return;

    const memberId = Number(select.closest('.admin-pending').dataset.memberId);
    const data = await A.run(null, pendingMsg, 'Đang xếp phòng...', () =>
      A.request('POST', '/api/admin/rooms/move', { memberId, roomId: select.value })
    );
    if (!data) {
      load();
      return;
    }
    A.setMsg(pendingMsg, 'Đã xếp phòng.', 'ok');
    load();
  });

  /* ---------- doi cho 2 nguoi ---------- */

  swapBtn.addEventListener('click', async () => {
    if (!swapA.value || !swapB.value) {
      A.setMsg(swapMsg, 'Cần chọn đủ 2 người', 'err');
      return;
    }

    const data = await A.run(swapBtn, swapMsg, 'Đang đổi chỗ...', () =>
      A.request('POST', '/api/admin/rooms/swap', { memberAId: swapA.value, memberBId: swapB.value })
    );
    if (!data) return;

    A.done(swapMsg, 'Đã đổi chỗ hai người.');
    swapA.value = '';
    swapB.value = '';
    load();
  });

  /* ---------- them phong ---------- */

  addBtn.addEventListener('click', async () => {
    const data = await A.run(addBtn, addMsg, 'Đang thêm...', () =>
      A.request('POST', '/api/admin/rooms', {
        name: newName.value,
        gender: newGender.value,
        capacity: newCapacity.value,
        note: newNote.value,
      })
    );
    if (!data) return;

    A.done(addMsg, `Đã thêm phòng "${data.room.name}".`);
    newName.value = '';
    newNote.value = '';
    load();
  });

  /* ---------- thao tac hang loat ---------- */

  autoCreateBtn.addEventListener('click', async () => {
    const data = await A.run(autoCreateBtn, actionMsg, 'Đang tạo phòng...', () =>
      A.request('POST', '/api/admin/rooms/auto-create', {
        capacity: autoCapacity.value,
        prefix: autoPrefix.value,
      })
    );
    if (!data) return;

    A.done(
      actionMsg,
      data.created.length ? `Đã tạo thêm ${data.created.length} phòng.` : 'Số phòng hiện tại đã đủ chỗ cho mọi người.'
    );
    load();
  });

  function reportAssign(data, verb) {
    const parts = [`${verb} cho ${data.assigned.length} người.`];
    if (data.skipped.length) {
      parts.push(`Bỏ qua ${data.skipped.length}: ${data.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`);
    }
    A.setMsg(actionMsg, parts.join(' '), data.skipped.length ? 'warn' : 'ok');
    A.toast(`${verb} cho ${data.assigned.length} người.`, data.skipped.length ? 'warn' : 'ok');
  }

  randomAllBtn.addEventListener('click', async () => {
    const data = await A.run(randomAllBtn, actionMsg, 'Đang ghép phòng...', () =>
      A.request('POST', '/api/admin/rooms/random-all', {})
    );
    if (!data) return;
    reportAssign(data, 'Đã ghép phòng');
    load();
  });

  reshuffleBtn.addEventListener('click', async () => {
    const ok = await A.confirmAction({
      title: 'Xáo lại toàn bộ',
      message: `Bốc tất cả mọi người ra khỏi phòng rồi ghép lại từ đầu?<br />${
        keepPinned.checked ? 'Người đã ghim vẫn giữ nguyên phòng.' : '<strong>Kể cả người đã ghim</strong> cũng bị xáo lại.'
      }`,
      okText: 'Xáo lại',
    });
    if (!ok) return;

    const data = await A.run(reshuffleBtn, actionMsg, 'Đang xáo lại...', () =>
      A.request('POST', '/api/admin/rooms/random-all', { reshuffle: true })
    );
    if (!data) return;
    reportAssign(data, 'Đã xáo lại');
    load();
  });

  lockBtn.addEventListener('click', async () => {
    const data = await A.run(lockBtn, actionMsg, 'Đang cập nhật...', () =>
      A.request('POST', '/api/admin/rooms/lock', { locked: !roundLocked })
    );
    if (!data) return;
    roundLocked = data.locked;
    A.done(actionMsg, roundLocked ? 'Đã khóa vòng ghép phòng.' : 'Đã mở vòng ghép phòng.');
    render();
  });

  resetBtn.addEventListener('click', async () => {
    const ok = await A.confirmAction({
      title: 'Reset ghép phòng',
      message: `Đưa tất cả mọi người ra khỏi phòng?<br />${
        keepPinned.checked ? 'Người đã ghim vẫn giữ nguyên phòng.' : 'Kể cả người đã ghim.'
      } Danh sách phòng vẫn được giữ.`,
      okText: 'Reset',
    });
    if (!ok) return;

    const data = await A.run(resetBtn, actionMsg, 'Đang reset...', () =>
      A.request('POST', '/api/admin/rooms/reset', { keepPinned: keepPinned.checked })
    );
    if (!data) return;
    A.done(actionMsg, `Đã bỏ phòng của ${data.cleared} người.`);
    load();
  });

  deleteEmptyBtn.addEventListener('click', async () => {
    const empty = rooms.filter((r) => r.occupancy === 0);
    if (!empty.length) {
      A.setMsg(roomListMsg, 'Không có phòng nào đang trống', 'warn');
      return;
    }

    const ok = await A.confirmAction({
      title: 'Xóa phòng trống',
      message: `Xóa <strong>${empty.length} phòng</strong> đang không có ai ở?`,
      okText: 'Xóa phòng trống',
    });
    if (!ok) return;

    const data = await A.run(deleteEmptyBtn, roomListMsg, 'Đang xóa...', () =>
      A.request('POST', '/api/admin/rooms/bulk', { ids: empty.map((r) => r.id), action: 'delete' })
    );
    if (!data) return;
    A.done(roomListMsg, `Đã xóa ${data.affected} phòng trống.`);
    load();
  });

  lockFullBtn.addEventListener('click', async () => {
    const full = rooms.filter((r) => r.isFull && !r.locked);
    if (!full.length) {
      A.setMsg(roomListMsg, 'Không có phòng nào đã đầy mà chưa khóa', 'warn');
      return;
    }

    const data = await A.run(lockFullBtn, roomListMsg, 'Đang khóa...', () =>
      A.request('POST', '/api/admin/rooms/bulk', { ids: full.map((r) => r.id), action: 'lock' })
    );
    if (!data) return;
    A.done(roomListMsg, `Đã khóa ${data.affected} phòng đã đầy.`);
    load();
  });

  /* ---------- xuat CSV ---------- */

  exportBtn.addEventListener('click', () => {
    const rows = [['Phòng', 'Dành cho', 'Sức chứa', 'Số người', 'Trạng thái', 'Ghi chú', 'Thành viên']];
    visibleRooms().forEach((r) => {
      rows.push([
        r.name,
        A.genderLabel(r.gender),
        r.capacity,
        r.occupancy,
        r.locked ? 'Đang khóa' : r.isFull ? 'Đã kín' : 'Còn chỗ',
        r.note || '',
        r.members.map((m) => m.name).join(' | '),
      ]);
    });
    A.downloadCsv('danh-sach-phong-ngu.csv', rows);
    A.done(roomListMsg, `Đã xuất ${rows.length - 1} phòng ra file CSV.`);
  });

  /* ---------- realtime ---------- */

  if (A.socket) {
    const refreshIfVisible = () => {
      if (A.activeTab() === 'rooms') load();
    };
    ['rooms:updated', 'rooms:reset', 'rooms:config', 'members:updated', 'member:room-randomized',
      'rooms:bulk-randomized'].forEach((evt) => A.socket.on(evt, refreshIfVisible));
  }

  A.onSecretChange(() => {
    if (A.activeTab() === 'rooms') load();
  });

  A.onTab('rooms', load);
})();
