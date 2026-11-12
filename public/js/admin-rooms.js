// Tab "Phong ngu": tao phong, ghep nguoi, sua/khoa/xoa tung phong, doi cho 2 nguoi.
//
// Nguyen tac: nam o voi nam, nu o voi nu - moi o chon phong chi liet ke phong
// dung gioi tinh va con cho. Phong bi KHOA van giu nguoi dang o nhung khong
// nhan them ai khi random.
//
// The phong dang mo o sua (co thay doi chua luu / dang go) va dong "chua co
// phong" dang mo o chon thi GIU NGUYEN khi co cap nhat realtime.
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
  const newLocation = document.getElementById('newRoomLocation');
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
  const pickSeg = document.getElementById('roomPickSeg');
  const turnSeg = document.getElementById('roomTurnSeg');
  const modeHint = document.getElementById('roomModeHint');

  const FILTERS = [
    { key: 'all', label: 'Tất cả', icon: 'layers', test: () => true },
    { key: 'female', label: 'Phòng nữ', icon: 'venus', test: (r) => r.gender === 'FEMALE' },
    { key: 'male', label: 'Phòng nam', icon: 'mars', test: (r) => r.gender === 'MALE' },
    { key: 'free', label: 'Còn chỗ', icon: 'door-open', test: (r) => r.occupancy < r.capacity },
    { key: 'full', label: 'Đã kín', icon: 'door-closed', test: (r) => r.occupancy >= r.capacity },
    { key: 'empty', label: 'Đang trống', icon: 'ghost', test: (r) => r.occupancy === 0 },
    { key: 'locked', label: 'Đang khóa', icon: 'lock', test: (r) => r.locked },
  ];

  // gender = gioi HIEU LUC (co dinh hoac theo nguoi dang o); null = phong chua co ai
  const SECTIONS = [
    { gender: 'FEMALE', label: 'Phòng nữ', icon: 'venus' },
    { gender: 'MALE', label: 'Phòng nam', icon: 'mars' },
    { gender: null, label: 'Phòng chưa có ai (nam hoặc nữ)', icon: 'door-open' },
  ];
  const TURN_LABEL = { ALL: 'Cả nam và nữ', FEMALE: 'Chỉ Nữ', MALE: 'Chỉ Nam' };

  let activeFilter = 'all';
  let rooms = [];
  let stats = null;
  let members = [];
  let roundLocked = false;
  let turn = 'ALL';
  let loaded = false;
  const expanded = new Set();

  /* ---------- hien thi ---------- */

  // Phong dung chung cho ca 2 gioi (ai vao truoc quyet dinh) nen khong so suc chua
  // tung gioi duoc: may chu tinh san so nguoi se het cho khi chia phong trong toi uu.
  function capacityTile(st) {
    const sf = st.shortfall || { total: 0, FEMALE: 0, MALE: 0 };
    let sub;
    let variant;
    if (!st.eligible) {
      sub = 'Không ai cần phòng';
      variant = '';
    } else if (sf.total) {
      const parts = [sf.FEMALE ? `${sf.FEMALE} chỗ nữ` : '', sf.MALE ? `${sf.MALE} chỗ nam` : ''].filter(Boolean);
      sub = `Thiếu ${parts.join(', ')} — thêm phòng, tăng sức chứa hoặc mở khóa phòng`;
      variant = 'danger';
    } else if (st.noGender) {
      sub = `Đủ chỗ cho người đã đặt giới tính · ${st.noGender} người chưa đặt`;
      variant = 'warn';
    } else {
      sub = 'Đủ chỗ cho mọi người';
      variant = 'ok';
    }
    return A.statTile({ icon: 'door-open', label: 'Tổng sức chứa', value: `${st.totalCapacity} chỗ`, sub, variant });
  }

  function renderStats() {
    if (!stats) {
      statsBox.innerHTML = '';
      return;
    }
    const f = stats.byGender.FEMALE;
    const m = stats.byGender.MALE;
    const notPlaced = stats.pending + stats.noGender;

    // Luon 6 o de luoi 6 / 3 / 2 cot khong le
    statsBox.innerHTML = [
      A.statTile({
        icon: 'bed-double',
        label: 'Đã có phòng',
        value: `${stats.assigned}/${stats.eligible}`,
        sub: stats.excluded ? `${stats.excluded} người không tham gia` : '',
        variant: notPlaced ? 'warn' : 'ok',
        meter: { value: stats.assigned, total: stats.eligible, variant: notPlaced ? 'warn' : 'ok' },
      }),
      A.statTile({
        icon: 'hourglass',
        label: 'Chưa xếp được',
        value: notPlaced,
        sub: stats.noGender ? `${stats.noGender} người chưa đặt giới tính` : notPlaced ? 'Đang chờ ghép' : 'Không còn ai',
        variant: stats.noGender ? 'warn' : '',
      }),
      A.statTile({
        icon: 'venus',
        label: 'Phòng nữ',
        value: f.rooms,
        sub: `${f.assigned}/${f.members} bạn nữ đã có phòng`,
        variant: 'female',
      }),
      A.statTile({
        icon: 'mars',
        label: 'Phòng nam',
        value: m.rooms,
        sub: `${m.assigned}/${m.members} bạn nam đã có phòng`,
        variant: 'male',
      }),
      capacityTile(stats),
      A.statTile({
        icon: 'door-open',
        label: 'Phòng chưa có ai',
        value: stats.openRooms || 0,
        sub: `${stats.openCapacity || 0} chỗ · nam hoặc nữ đều vào được${stats.lockedRooms ? ` · ${stats.lockedRooms} phòng khóa` : ''}`,
        variant: stats.lockedRooms ? 'warn' : 'accent',
      }),
    ].join('');

    A.setBadge('rooms', rooms.length);
  }

  function renderFilterChips() {
    filterChips.innerHTML = FILTERS.map((f) => {
      const count = rooms.filter(f.test).length;
      const active = f.key === activeFilter;
      return `
        <button type="button" class="admin-filter-chip ${active ? 'is-active' : ''}" aria-pressed="${active}"
          data-filter="${f.key}" data-always-enabled="1">
          ${A.icon(f.icon)} ${f.label}<span class="admin-filter-count">${count}</span>
        </button>`;
    }).join('');
  }

  function visibleRooms() {
    const keyword = roomFilter.value.trim().toLowerCase();
    const filter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];
    const dirty = new Set([...roomList.querySelectorAll('.admin-room.is-dirty')].map((c) => Number(c.dataset.roomId)));
    return rooms.filter(
      (r) =>
        dirty.has(r.id) ||
        (filter.test(r) &&
          (!keyword ||
            r.name.toLowerCase().includes(keyword) ||
            (r.location || '').toLowerCase().includes(keyword) ||
            (r.note || '').toLowerCase().includes(keyword) ||
            r.members.some((m) => m.name.toLowerCase().includes(keyword))))
    );
  }

  function occupantHtml(member, room) {
    return `
      <div class="admin-occupant">
        ${A.icon(member.isLeader ? 'crown' : A.genderIcon(member.gender), 'ic-sm')}
        <span class="admin-occupant-name" title="${A.escapeHtml(member.name)}">${A.escapeHtml(member.name)}</span>
        ${member.pinnedRoom ? `<span class="admin-chip-pin" title="Đã ghim phòng">${A.icon('pin', 'ic-sm')}</span>` : ''}
        <button type="button" data-action="remove-member" data-member-id="${member.id}" title="Đưa ra khỏi ${A.escapeHtml(
          room.name
        )}" aria-label="Đưa ${A.escapeHtml(member.name)} ra khỏi ${A.escapeHtml(room.name)}">${A.icon('x', 'ic-sm')}</button>
      </div>`;
  }

  function roomCardHtml(room) {
    const pct = room.capacity ? Math.min(100, Math.round((room.occupancy / room.capacity) * 100)) : 0;
    const scope = `r${room.id}`;
    const isOpen = expanded.has(room.id);
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
            <span>${A.icon(room.gender ? A.genderIcon(room.gender) : 'door-open')} ${A.escapeHtml(room.name)}</span>
            ${room.location ? `<span class="admin-room-loc">${A.icon('map-pin', 'ic-sm')} ${A.escapeHtml(room.location)}</span>` : ''}
            ${room.locked ? `<span class="admin-tag is-locked">${A.icon('lock', 'ic-sm')} Đang khóa</span>` : ''}
          </div>
          <span class="admin-room-count" title="Số người / sức chứa">${room.occupancy}/${room.capacity}</span>
        </div>

        <div class="admin-room-meter" role="presentation"><span style="width:${pct}%"></span></div>

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
          <button type="button" class="admin-row-btn" data-action="toggle-edit" aria-expanded="${isOpen}"
            aria-controls="${scope}-edit">${A.icon('pencil')} Sửa phòng</button>
          <button type="button" class="admin-row-btn ${room.locked ? 'is-on' : ''}" data-action="toggle-lock" aria-pressed="${room.locked}">
            ${A.icon(room.locked ? 'lock-open' : 'lock')} ${room.locked ? 'Mở khóa' : 'Khóa'}
          </button>
          <button type="button" class="admin-row-btn" data-action="clear">${A.icon('user-round-minus')} Dọn phòng</button>
        </div>

        <div class="admin-room-edit" id="${scope}-edit" ${isOpen ? '' : 'hidden'}>
          <div class="admin-room-fields">
            <div class="admin-field">
              <label for="${scope}-name">Tên phòng</label>
              <input id="${scope}-name" type="text" data-edit="name" value="${A.escapeHtml(room.name)}" autocomplete="off" />
            </div>
            <div class="admin-field">
              <label for="${scope}-location">Vị trí / mã phòng</label>
              <input id="${scope}-location" type="text" maxlength="120" data-edit="location" value="${A.escapeHtml(room.location || '')}" autocomplete="off" placeholder="VD: Villa 1 đôi 1" />
            </div>
            <div class="admin-field">
              <label for="${scope}-gender">Dành cho</label>
              <select id="${scope}-gender" data-edit="gender">
                <option value="" ${!room.fixedGender ? 'selected' : ''}>Nam hoặc nữ (ai vào trước)</option>
                <option value="FEMALE" ${room.fixedGender === 'FEMALE' ? 'selected' : ''}>Chỉ nữ</option>
                <option value="MALE" ${room.fixedGender === 'MALE' ? 'selected' : ''}>Chỉ nam</option>
              </select>
            </div>
            <div class="admin-field">
              <label for="${scope}-cap">Sức chứa</label>
              <input id="${scope}-cap" type="number" min="1" max="50" inputmode="numeric" data-edit="capacity" value="${room.capacity}" />
            </div>
            <div class="admin-field">
              <label for="${scope}-note">Ghi chú</label>
              <input id="${scope}-note" type="text" data-edit="note" value="${A.escapeHtml(room.note || '')}" autocomplete="off" />
            </div>
          </div>
          <div class="admin-btn-row">
            <button type="button" class="admin-row-btn is-primary" data-action="save" data-keep-disabled="1">${A.icon('save')} Lưu phòng</button>
            <button type="button" class="admin-row-btn danger" data-action="delete">${A.icon('trash-2')} Xóa phòng</button>
          </div>
        </div>
      </div>`;
  }

  /* ---------- sua phong: theo doi thay doi chua luu ---------- */

  function editChanges(card, room) {
    const read = (field) => card.querySelector(`[data-edit="${field}"]`).value.trim();
    const body = {};
    if (read('name') !== room.name) body.name = read('name');
    if (read('location') !== (room.location || '')) body.location = read('location');
    if (read('gender') !== (room.fixedGender || '')) body.gender = read('gender');
    if (read('capacity') !== String(room.capacity)) body.capacity = read('capacity');
    if (read('note') !== (room.note || '')) body.note = read('note');
    return body;
  }

  function updateDirty(card) {
    const room = rooms.find((r) => r.id === Number(card.dataset.roomId));
    if (!room) return;
    const dirty = Object.keys(editChanges(card, room)).length > 0;
    card.classList.toggle('is-dirty', dirty);
    A.setAllowed(card.querySelector('[data-action="save"]'), dirty);
  }

  function cardIsBusy(card) {
    if (card.classList.contains('is-dirty')) return true;
    const el = document.activeElement;
    return !!(el && card.contains(el) && el.closest('.admin-room-edit') && A.isEditingControl(el));
  }

  let pendingRender = false;

  function renderRooms() {
    const list = visibleRooms();

    if (!list.length) {
      roomList.innerHTML = `<div class="admin-empty-rich">${A.icon(rooms.length ? 'search-x' : 'door-closed')}
        <strong>${!loaded ? 'Đang tải…' : rooms.length ? 'Không có phòng nào khớp bộ lọc' : 'Chưa có phòng nào'}</strong>
        <p>${
          rooms.length
            ? 'Thử đổi bộ lọc hoặc xóa từ khóa tìm kiếm.'
            : 'Dùng "Tạo phòng tự động" ở trên để hệ thống tạo đủ phòng cho cả nam và nữ.'
        }</p></div>`;
      return;
    }

    // Khung 2 khu nam / nu dung 1 lan, sau do chi ve lai tung the trong moi khu
    let wrap = roomList.querySelector(':scope > .admin-room-list');
    if (!wrap) {
      roomList.innerHTML = `<div class="admin-room-list">${SECTIONS.map(
        (section) => `
          <section class="admin-room-section" data-section="${section.gender}" aria-label="${section.label}">
            <div class="admin-room-group-head ${A.genderClass(section.gender)}">
              ${A.icon(section.icon)} ${section.label}
              <span class="admin-chip" data-section-count></span>
            </div>
            <div class="admin-room-group"></div>
          </section>`
      ).join('')}</div>`;
      wrap = roomList.querySelector(':scope > .admin-room-list');
    }

    SECTIONS.forEach((section) => {
      const box = wrap.querySelector(`[data-section="${section.gender}"]`);
      const ofGender = list.filter((r) => r.gender === section.gender);
      box.hidden = !ofGender.length;
      const people = ofGender.reduce((sum, r) => sum + r.occupancy, 0);
      const slots = ofGender.reduce((sum, r) => sum + r.capacity, 0);
      box.querySelector('[data-section-count]').textContent = `${ofGender.length} phòng · ${people}/${slots} chỗ`;

      A.patchList(
        box.querySelector('.admin-room-group'),
        ofGender.map((r) => ({ key: r.id, html: roomCardHtml(r) })),
        {
          keep: (card) => {
            const busy = cardIsBusy(card);
            if (busy && !card.classList.contains('is-dirty')) pendingRender = true;
            return busy;
          },
        }
      );
    });
  }

  function genderChip(gender) {
    return `<span class="admin-tag ${A.genderClass(gender) || 'is-warn'}">${A.icon(A.genderIcon(gender), 'ic-sm')} ${
      gender ? A.genderLabel(gender) : 'Chưa đặt'
    }</span>`;
  }

  function pendingRowHtml(member) {
    const options = member.gender
      ? '<option value="">Chọn phòng…</option>' +
        rooms
          .filter((r) => !r.gender || r.gender === member.gender)
          .map((r) => {
            const full = r.occupancy >= r.capacity;
            return `<option value="${r.id}" ${full ? 'disabled' : ''}>${A.escapeHtml(r.name)}${
              r.location ? ` · ${A.escapeHtml(r.location)}` : ''
            } (${r.occupancy}/${r.capacity})${r.gender ? '' : ' · nam/nữ'}${
              full ? ' - kín' : ''
            }${r.locked ? ' 🔒' : ''}</option>`;
          })
          .join('')
      : '<option value="">Cần đặt giới tính trước</option>';
    const id = `pending-${member.id}`;

    return `
      <div class="admin-pending ${member.gender ? '' : 'is-warn'}" data-member-id="${member.id}">
        <div class="admin-pending-head">
          <label class="admin-pending-name" for="${id}">${A.escapeHtml(member.name)}</label>
          ${genderChip(member.gender)}
        </div>
        <select id="${id}" data-action="assign" ${member.gender ? '' : 'disabled data-keep-disabled="1"'}>${options}</select>
      </div>`;
  }

  function renderPending() {
    const pending = members.filter((m) => m.joinRoom !== false && !m.roomId);
    // Nguoi da dat gioi tinh len truoc (xep duoc ngay), roi theo ten
    pending.sort((a, b) => (a.gender ? 0 : 1) - (b.gender ? 0 : 1) || a.name.localeCompare(b.name, 'vi'));
    const noGender = pending.filter((m) => !m.gender).length;
    pendingCount.innerHTML = `${A.icon('user-round-search')} ${pending.length} người${
      noGender ? ` · ${noGender} chưa đặt giới tính` : ''
    }`;

    let listBox = pendingList.querySelector(':scope > .admin-pending-list');
    if (!pending.length) {
      pendingList.innerHTML = `<div class="admin-empty-rich">${A.icon('party-popper')}<strong>${
        loaded ? 'Mọi người đều đã có phòng' : 'Đang tải…'
      }</strong>
          <p>${loaded ? 'Không còn ai chờ ghép phòng nữa.' : ''}</p></div>`;
      return;
    }
    if (!listBox) {
      pendingList.innerHTML = '<div class="admin-pending-list"></div>';
      listBox = pendingList.firstElementChild;
    }
    A.patchList(
      listBox,
      pending.map((m) => ({ key: m.id, html: pendingRowHtml(m) })),
      {
        keep: (row) => {
          const busy = A.isBusy(row);
          if (busy) pendingRender = true;
          return busy;
        },
      }
    );
  }

  // Chi thay danh sach lua chon khi noi dung doi (khong dong dropdown dang mo)
  function setOptions(select, html) {
    if (select.dataset.optionsHtml === html) return;
    const value = select.value;
    select.innerHTML = html;
    select.dataset.optionsHtml = html;
    select.value = value;
  }

  function renderSwapSelects() {
    const inRoom = members.filter((m) => m.roomId);
    const byId = new Map(rooms.map((r) => [r.id, r.name]));

    const html =
      '<option value="">Chọn người…</option>' +
      inRoom
        .map(
          (m) =>
            `<option value="${m.id}">${A.escapeHtml(m.name)} · ${A.escapeHtml(byId.get(m.roomId) || '')} (${A.genderLabel(
              m.gender
            )})</option>`
        )
        .join('');

    setOptions(swapA, html);
    setOptions(swapB, html);
  }

  function syncLockBtn() {
    lockBtn.innerHTML = `${A.icon(roundLocked ? 'lock-open' : 'lock')} ${
      roundLocked ? 'Mở vòng ghép phòng' : 'Khóa vòng ghép phòng'
    }`;
    lockBtn.classList.toggle('admin-btn-warn', !roundLocked);
    lockBtn.classList.toggle('admin-btn-secondary', roundLocked);
    lockBtn.setAttribute('aria-pressed', roundLocked ? 'true' : 'false');
  }

  function render() {
    pendingRender = false;
    renderStats();
    renderFilterChips();
    renderRooms();
    renderPending();
    renderSwapSelects();
    syncLockBtn();
    renderPickMode();
    renderTurn();

    A.applyEditLock(panel, lockNote);
  }

  /* ---------- tai du lieu ---------- */

  const load = A.serial(async () => {
    try {
      const [roomRes, memberRes] = await Promise.all([
        fetch('/api/rooms').then((r) => r.json()),
        fetch('/api/members').then((r) => r.json()),
      ]);
      rooms = roomRes.rooms || [];
      stats = roomRes.stats || null;
      roundLocked = !!roomRes.locked;
      turn = roomRes.turn || 'ALL';
      members = memberRes;
      loaded = true;

      if (roomRes.defaultCapacity) {
        if (!autoCapacity.dataset.touched) autoCapacity.value = roomRes.defaultCapacity;
        if (!newCapacity.dataset.touched) newCapacity.value = roomRes.defaultCapacity;
      }

      render();
    } catch (err) {
      A.setMsg(roomListMsg, err.message, 'err');
    }
  });

  autoCapacity.addEventListener('input', () => {
    autoCapacity.dataset.touched = '1';
  });
  newCapacity.addEventListener('input', () => {
    newCapacity.dataset.touched = '1';
  });

  /* ---------- loc ---------- */

  roomFilter.addEventListener('input', render);

  filterChips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    render();
  });

  // Roi khoi o dang go / o chon -> ap dung ban cap nhat da hoan
  [roomList, pendingList].forEach((box) =>
    box.addEventListener('focusout', () => {
      setTimeout(() => {
        if (pendingRender && !A.isBusy(roomList) && !A.isBusy(pendingList)) render();
      }, 0);
    })
  );

  /* ---------- thao tac tren tung phong ---------- */

  roomList.addEventListener('input', (e) => {
    const card = e.target.closest('.admin-room');
    if (card && e.target.dataset.edit) updateDirty(card);
  });
  roomList.addEventListener('change', (e) => {
    const card = e.target.closest('.admin-room');
    if (card && e.target.dataset.edit) updateDirty(card);
  });
  roomList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.dataset.edit || e.target.tagName === 'SELECT') return;
    const save = e.target.closest('.admin-room').querySelector('[data-action="save"]');
    if (save && !save.disabled) {
      e.preventDefault();
      save.click();
    }
  });

  roomList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const card = btn.closest('.admin-room');
    if (!card) return;
    const roomId = Number(card.dataset.roomId);
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    const action = btn.dataset.action;

    if (action === 'toggle-edit') {
      const box = card.querySelector('.admin-room-edit');
      box.hidden = !box.hidden;
      btn.setAttribute('aria-expanded', String(!box.hidden));
      if (box.hidden) {
        expanded.delete(roomId);
        if (card.classList.contains('is-dirty')) {
          card.classList.remove('is-dirty');
          render();
        }
      } else {
        expanded.add(roomId);
        const first = box.querySelector('[data-edit="name"]');
        if (first && !first.disabled) first.focus();
      }
      return;
    }

    if (action === 'remove-member') {
      const memberId = Number(btn.dataset.memberId);
      const data = await A.run(btn, roomListMsg, 'Đang cập nhật...', () =>
        A.request('POST', '/api/admin/rooms/move', { memberId, roomId: '' })
      );
      if (!data) return;
      A.done(roomListMsg, 'Đã đưa ra khỏi phòng.');
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
      const body = editChanges(card, room);
      if (!Object.keys(body).length) {
        updateDirty(card);
        return;
      }
      const data = await A.run(btn, roomListMsg, 'Đang lưu...', () => A.request('PUT', `/api/admin/rooms/${roomId}`, body));
      if (!data) return;
      card.classList.remove('is-dirty');
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
      card.classList.remove('is-dirty');
      A.done(roomListMsg, `Đã xóa phòng (${data.releasedMembers} người quay về chưa có phòng).`);
      load();
    }
  });

  /* ---------- xep tay nguoi chua co phong ---------- */

  pendingList.addEventListener('change', async (e) => {
    const select = e.target.closest('[data-action="assign"]');
    if (!select || !select.value) return;

    const row = select.closest('.admin-pending');
    const memberId = Number(row.dataset.memberId);
    row.classList.add('is-saving');
    const data = await A.run(select, pendingMsg, 'Đang xếp phòng...', () =>
      A.request('POST', '/api/admin/rooms/move', { memberId, roomId: select.value })
    );
    row.classList.remove('is-saving');
    if (!data) {
      select.value = '';
      load();
      return;
    }
    const member = members.find((m) => m.id === memberId);
    const roomName = select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent.replace(/ \(.*$/, '') : '';
    A.done(pendingMsg, member ? `Đã xếp ${member.name} vào ${roomName}.` : 'Đã xếp phòng.');
    select.blur();
    load();
  });

  /* ---------- doi cho 2 nguoi ---------- */

  swapBtn.addEventListener('click', async () => {
    if (!swapA.value || !swapB.value) {
      A.setMsg(swapMsg, 'Cần chọn đủ 2 người', 'err');
      return;
    }
    if (swapA.value === swapB.value) {
      A.setMsg(swapMsg, 'Hãy chọn hai người khác nhau', 'err');
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
        location: newLocation.value,
        gender: newGender.value,
        capacity: newCapacity.value,
        note: newNote.value,
      })
    );
    if (!data) return;

    A.done(addMsg, `Đã thêm phòng "${data.room.name}".`);
    newName.value = '';
    newLocation.value = '';
    newNote.value = '';
    newName.focus();
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
    if (!roundLocked) {
      const ok = await A.confirmAction({
        title: 'Khóa vòng ghép phòng',
        message: 'Khóa vòng ghép phòng? Mọi người sẽ không tự quay phòng được nữa cho tới khi bạn mở lại. Kết quả hiện có vẫn giữ nguyên.',
        okText: 'Khóa',
        danger: false,
      });
      if (!ok) return;
    }
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
        keepPinned.checked ? 'Người đã ghim vẫn giữ nguyên phòng.' : '<strong>Kể cả người đã ghim.</strong>'
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
    const rows = [['Phòng', 'Vị trí', 'Dành cho', 'Sức chứa', 'Số người', 'Trạng thái', 'Ghi chú', 'Thành viên']];
    visibleRooms().forEach((r) => {
      rows.push([
        r.name,
        r.location || '',
        r.gender ? A.genderLabel(r.gender) : 'Chưa có ai (nam hoặc nữ)',
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

  /* ---------- luot nhan phong (ca hai / chi nu / chi nam) ---------- */

  function renderTurn() {
    turnSeg.querySelectorAll('[data-turn]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.turn === turn));
    });
  }

  turnSeg.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-turn]');
    if (!btn || btn.disabled || btn.dataset.turn === turn) return;
    const data = await A.run(btn, actionMsg, 'Đang đổi lượt...', () =>
      A.request('POST', '/api/admin/rooms/turn', { turn: btn.dataset.turn })
    );
    if (!data) return;
    turn = data.turn;
    renderTurn();
    A.done(
      actionMsg,
      turn === 'ALL' ? 'Đã mở nhận phòng cho cả nam và nữ.' : `Đã mở lượt: ${TURN_LABEL[turn]} nhận phòng trước.`
    );
  });

  /* ---------- cach nhan phong (quay ngau nhien / tu chon) ---------- */

  function renderPickMode() {
    const modes = A.modes();
    pickSeg.querySelectorAll('[data-pick-mode]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.pickMode === modes.roomPickMode));
    });
    const pickText =
      modes.roomPickMode === 'choose'
        ? 'Mỗi người tự bấm chọn một phòng còn chỗ đúng giới tính.'
        : 'Mỗi người bấm quay, hệ thống bốc phòng ngẫu nhiên đúng giới tính.';
    const modeText =
      modes.eventMode === 'rooms'
        ? ' Sự kiện đang ở chế độ <strong>Chỉ ghép phòng</strong>.'
        : ' Sự kiện đang chạy <strong>đủ 3 vòng</strong> — muốn chỉ ghép phòng thì đổi ở <a href="/admin/event.html">trang Sự kiện</a>.';
    const html = A.escapeHtml(pickText) + modeText;
    if (modeHint.dataset.html !== html) {
      modeHint.dataset.html = html;
      modeHint.innerHTML = html;
    }
  }

  pickSeg.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pick-mode]');
    if (!btn || btn.disabled || btn.dataset.pickMode === A.modes().roomPickMode) return;
    const data = await A.run(btn, actionMsg, 'Đang đổi cách nhận phòng...', () =>
      A.request('POST', '/api/admin/event-mode', { roomPickMode: btn.dataset.pickMode })
    );
    if (!data) return;
    A.applyModes({ eventMode: data.eventMode, roomPickMode: data.roomPickMode });
    renderPickMode();
    A.done(actionMsg, data.roomPickMode === 'choose' ? 'Đã đổi sang "Tự chọn phòng".' : 'Đã đổi sang "Quay ngẫu nhiên".');
  });

  A.onModes(renderPickMode);
  A.modesReady.then(renderPickMode);

  /* ---------- realtime ---------- */

  // 1 lan "ghep phong cho tat ca" phat rooms:updated + members:updated +
  // bulk-randomized lien nhau -> gop thanh 1 lan tai.
  A.onLive(
    ['rooms:updated', 'rooms:reset', 'rooms:config', 'members:updated', 'member:room-randomized',
      'rooms:bulk-randomized', 'groups:reset', 'settings:updated'],
    load
  );

  A.onTab('rooms', load);
})();
