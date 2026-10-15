// Tab "Thanh vien": danh sach day du + them/sua/xoa, loc, sap xep, chon nhieu
// de sua hang loat, dan danh sach them 1 luot, xuat CSV.
//
// Diem moi: cot "Tham gia" - 3 o tick quyet dinh ai duoc vao tung vong
// (chia nhom / ghep phong / quiz) va 1 o ghim de khong bi xao lai.
// Tat 1 vong thi server tu go ket qua cu cua vong do.
//
// Chua nhap ma bi mat thi van xem duoc danh sach (doc tu API cong khai),
// chi cac o sua bi khoa lai.
//
// Ve lai bang: tung dong theo id (A.patchList). Dong nao dang go ten / dang mo
// o chon thi GIU NGUYEN, cac dong khac van cap nhat realtime. Truoc day bang ve
// lai ca khoi moi lan roi focus (focusout -> render) nen Tab tu o nay sang o kia
// bi mat focus, chon trong dropdown bang ban phim khong duoc.
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="members"]');
  const memberStats = document.getElementById('memberStats');
  const memberTableBody = document.getElementById('memberTableBody');
  const memberFilter = document.getElementById('memberFilter');
  const filterChips = document.getElementById('memberFilterChips');
  const memberMsg = document.getElementById('memberMsg');
  const lockNote = document.getElementById('memberLockNote');
  const resultCount = document.getElementById('memberResultCount');

  const selectAll = document.getElementById('memberSelectAll');
  const bulkBar = document.getElementById('memberBulkBar');
  const bulkCount = document.getElementById('memberBulkCount');
  const bulkGroupSelect = document.getElementById('memberBulkGroup');
  const bulkRoomSelect = document.getElementById('memberBulkRoom');
  const bulkFlagSelect = document.getElementById('memberBulkFlag');

  const newMemberName = document.getElementById('newMemberName');
  const newMemberGender = document.getElementById('newMemberGender');
  const newMemberGroup = document.getElementById('newMemberGroup');
  const addMemberBtn = document.getElementById('addMemberBtn');
  const addMemberMsg = document.getElementById('addMemberMsg');

  const importText = document.getElementById('memberImportText');
  const importBtn = document.getElementById('memberImportBtn');
  const importMsg = document.getElementById('memberImportMsg');
  const exportBtn = document.getElementById('memberExportBtn');

  const COLSPAN = 9;

  // Cac o tick trong cot "Tham gia" - thu tu nay cung la thu tu hien tren bang
  const FLAGS = [
    { key: 'joinRandom', icon: 'dices', title: 'Được tham gia vòng chia nhóm' },
    { key: 'joinRoom', icon: 'bed-double', title: 'Được tham gia vòng ghép phòng' },
    { key: 'joinQuiz', icon: 'brain', title: 'Được tham gia vòng Quiz' },
  ];

  const FILTERS = [
    { key: 'all', label: 'Tất cả', icon: 'users', test: () => true },
    { key: 'female', label: 'Nữ', icon: 'venus', test: (m) => m.gender === 'FEMALE' },
    { key: 'male', label: 'Nam', icon: 'mars', test: (m) => m.gender === 'MALE' },
    { key: 'nogender', label: 'Chưa đặt giới tính', icon: 'circle-help', test: (m) => !m.gender },
    { key: 'noroom', label: 'Chưa có phòng', icon: 'bed-double', test: (m) => !m.roomId },
    { key: 'nogroup', label: 'Chưa có nhóm', icon: 'users-round', test: (m) => !m.groupId },
    { key: 'leader', label: 'Nhóm trưởng', icon: 'crown', test: (m) => m.isLeader },
    {
      key: 'excluded',
      label: 'Bị loại khỏi vòng',
      icon: 'user-round-x',
      test: (m) => !m.joinRandom || !m.joinRoom || !m.joinQuiz,
    },
    // Ghim nhom HOAC ghim phong - o ghim tren bang cung hien "ghim mot phan"
    // cho truong hop nay, nen bo loc va o tick khop nhau.
    { key: 'pinned', label: 'Đã ghim', icon: 'pin', test: (m) => m.pinnedGroup || m.pinnedRoom },
  ];

  let members = [];
  let groups = [];
  let rooms = [];
  let activeFilter = 'all';
  let sortKey = 'name';
  let sortDir = 'asc';
  let loaded = false;
  const selected = new Set();

  /* ---------- thong ke ---------- */

  function renderStats() {
    const male = members.filter((m) => m.gender === 'MALE').length;
    const female = members.filter((m) => m.gender === 'FEMALE').length;
    const noGender = members.filter((m) => !m.gender).length;
    const inRoom = members.filter((m) => m.roomId).length;
    const inGroup = members.filter((m) => m.groupId).length;
    const excluded = members.filter((m) => !m.joinRandom || !m.joinRoom || !m.joinQuiz).length;

    // Luon du 6 o (ke ca khi = 0) de luoi 6 / 3 / 2 cot khong bao gio le 1 o
    memberStats.innerHTML = [
      A.statTile({ icon: 'users', label: 'Tổng thành viên', value: members.length, variant: 'accent' }),
      A.statTile({
        icon: 'venus-and-mars',
        label: 'Nữ · Nam',
        value: `${female} · ${male}`,
        sub: noGender ? `${noGender} người chưa đặt` : 'Đã đặt đủ giới tính',
      }),
      A.statTile({
        icon: 'circle-alert',
        label: 'Chưa đặt giới tính',
        value: noGender,
        sub: noGender ? 'Chưa ghép phòng được' : 'Không còn ai',
        variant: noGender ? 'warn' : 'ok',
      }),
      A.statTile({
        icon: 'users-round',
        label: 'Đã có nhóm',
        value: `${inGroup}/${members.length}`,
        meter: { value: inGroup, total: members.length },
      }),
      A.statTile({
        icon: 'bed-double',
        label: 'Đã có phòng',
        value: `${inRoom}/${members.length}`,
        meter: { value: inRoom, total: members.length },
      }),
      A.statTile({
        icon: 'user-round-x',
        label: 'Bị loại khỏi vòng',
        value: excluded,
        sub: excluded ? 'Ít nhất 1 vòng' : 'Ai cũng tham gia đủ',
        variant: excluded ? 'danger' : '',
      }),
    ].join('');

    A.setBadge('members', members.length);
  }

  function renderFilterChips() {
    filterChips.innerHTML = FILTERS.map((f) => {
      const count = members.filter(f.test).length;
      const active = f.key === activeFilter;
      return `
        <button type="button" class="admin-filter-chip ${active ? 'is-active' : ''}" aria-pressed="${active}"
          data-filter="${f.key}" data-always-enabled="1">
          ${A.icon(f.icon)} ${f.label}<span class="admin-filter-count">${count}</span>
        </button>`;
    }).join('');
  }

  /* ---------- dong trong bang ---------- */

  function groupOptions(selectedId) {
    return (
      '<option value="">— Chưa có nhóm</option>' +
      groups
        .map(
          (g) =>
            `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${A.escapeHtml(g.name)}${
              g.isFull && g.id !== selectedId ? ' (đã đầy)' : ''
            }</option>`
        )
        .join('')
    );
  }

  function roomOptions(member) {
    if (!member.gender) return '<option value="">Cần đặt giới tính</option>';

    return (
      '<option value="">— Chưa có phòng</option>' +
      rooms
        .filter((r) => r.gender === member.gender)
        .map((r) => {
          const isCurrent = r.id === member.roomId;
          const isFull = r.occupancy >= r.capacity && !isCurrent;
          return `<option value="${r.id}" ${isCurrent ? 'selected' : ''} ${isFull ? 'disabled' : ''}>${A.escapeHtml(
            r.name
          )} (${r.occupancy}/${r.capacity})${isFull ? ' - đã kín' : ''}${r.locked ? ' 🔒' : ''}</option>`;
        })
        .join('')
    );
  }

  function flagCell(member) {
    const name = A.escapeHtml(member.name);
    const toggles = FLAGS.map(
      (f) => `
      <label class="admin-flag ${member[f.key] ? 'is-on' : ''}" title="${f.title}">
        ${A.icon(f.icon)}
        <input type="checkbox" data-field="${f.key}" ${member[f.key] ? 'checked' : ''} aria-label="${f.title}: ${name}" />
      </label>`
    ).join('');

    // Ghim: 1 o cho ca pinnedGroup lan pinnedRoom cho gon. Chi ghim 1 trong 2
    // (vd sua qua bulk "Ghim nhom") thi hien trang thai "mot phan" thay vi tat.
    const both = member.pinnedGroup && member.pinnedRoom;
    const partial = !both && (member.pinnedGroup || member.pinnedRoom);
    const pinTitle = both
      ? 'Đã ghim nhóm và phòng — bấm để bỏ ghim'
      : partial
      ? `Mới ghim ${member.pinnedGroup ? 'nhóm' : 'phòng'} — bấm để ghim cả hai`
      : 'Ghim kết quả — không bị xáo lại khi admin chia lại';
    const pin = `
      <label class="admin-flag is-pin ${both ? 'is-on' : ''} ${partial ? 'is-partial' : ''}" title="${pinTitle}">
        ${A.icon('pin')}
        <input type="checkbox" data-field="pinned" ${both ? 'checked' : ''} ${partial ? 'data-partial="1"' : ''}
          aria-label="Ghim kết quả: ${name}" />
      </label>`;

    return `<td class="admin-cell-flags"><div class="admin-flag-group">${toggles}${pin}</div></td>`;
  }

  function quizCell(member) {
    const answered = member._count && member._count.answers;
    return `<td class="admin-cell-quiz" title="${member.quizScore} điểm${answered ? ` · đã trả lời ${answered} câu` : ''}">
      <strong>${member.quizScore}</strong> điểm${answered ? `<small>${answered} câu</small>` : ''}
    </td>`;
  }

  function rowHtml(member) {
    const excluded = !member.joinRandom || !member.joinRoom || !member.joinQuiz;
    const name = A.escapeHtml(member.name);

    const classes = [
      selected.has(member.id) ? 'is-selected' : '',
      member.gender ? '' : 'is-warn',
      excluded ? 'is-excluded' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const groupName = member.group ? member.group.name : '';
    const roomName = member.room ? member.room.name : '';

    return `
      <tr data-member-id="${member.id}" class="${classes}">
        <td class="admin-cell-check">
          <input type="checkbox" data-select="${member.id}" ${selected.has(member.id) ? 'checked' : ''} data-always-enabled="1"
            aria-label="Chọn ${name}" />
        </td>
        <td class="admin-cell-name">
          <input type="text" data-field="name" value="${name}" aria-label="Họ tên" autocomplete="off" />
        </td>
        <td class="admin-cell-gender">
          <select data-field="gender" class="admin-gender-select ${A.genderClass(member.gender)}" aria-label="Giới tính của ${name}">
            <option value="" ${!member.gender ? 'selected' : ''}>—</option>
            <option value="MALE" ${member.gender === 'MALE' ? 'selected' : ''}>Nam</option>
            <option value="FEMALE" ${member.gender === 'FEMALE' ? 'selected' : ''}>Nữ</option>
          </select>
        </td>
        ${flagCell(member)}
        <td class="admin-cell-pick"><select data-field="groupId" aria-label="Nhóm của ${name}" title="${A.escapeHtml(
          groupName || 'Chưa có nhóm'
        )}" ${member.joinRandom ? '' : 'disabled data-keep-disabled="1"'}>${groupOptions(member.groupId)}</select></td>
        <td class="admin-cell-pick"><select data-field="roomId" aria-label="Phòng ngủ của ${name}" title="${A.escapeHtml(
          roomName || (member.gender ? 'Chưa có phòng' : 'Cần đặt giới tính trước')
        )}" ${member.gender && member.joinRoom ? '' : 'disabled data-keep-disabled="1"'}>${roomOptions(member)}</select></td>
        <td class="admin-cell-center">
          <input type="checkbox" data-field="isLeader" ${member.isLeader ? 'checked' : ''} title="Đánh dấu là Nhóm Trưởng"
            aria-label="Nhóm Trưởng: ${name}" />
        </td>
        ${quizCell(member)}
        <td class="admin-cell-actions">
          <button type="button" class="admin-row-btn danger icon-only" data-action="delete-member" title="Xóa thành viên"
            aria-label="Xóa ${name}">
            ${A.icon('trash-2')}
          </button>
        </td>
      </tr>`;
  }

  function sortValue(member) {
    switch (sortKey) {
      case 'gender':
        return A.genderLabel(member.gender);
      case 'group':
        return member.group ? member.group.name : '';
      case 'room':
        return member.room ? member.room.name : '';
      case 'leader':
        return member.isLeader ? 1 : 0;
      case 'quiz':
        return member.quizScore;
      case 'join':
        return (member.joinRandom ? 4 : 0) + (member.joinRoom ? 2 : 0) + (member.joinQuiz ? 1 : 0);
      default:
        return member.name;
    }
  }

  function visibleMembers() {
    const keyword = memberFilter.value.trim().toLowerCase();
    const filter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];

    const list = members.filter(filter.test).filter((m) => !keyword || m.name.toLowerCase().includes(keyword));

    list.sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'vi');
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }

  // Chi thay danh sach lua chon khi noi dung doi - neu khong dang mo dropdown
  // hang loat ma co su kien realtime la dropdown tu dong lai.
  function setOptions(select, html) {
    if (select.dataset.optionsHtml === html) return;
    const value = select.value;
    select.innerHTML = html;
    select.dataset.optionsHtml = html;
    select.value = value;
  }

  function renderBulkBar() {
    const count = selected.size;
    bulkBar.hidden = count === 0;
    bulkCount.innerHTML = `${A.icon('check-check')} Đã chọn ${count} người`;

    setOptions(
      bulkGroupSelect,
      '<option value="">Xếp vào nhóm…</option>' +
        groups.map((g) => `<option value="${g.id}">${A.escapeHtml(g.name)}</option>`).join('')
    );

    setOptions(
      bulkRoomSelect,
      '<option value="">Xếp vào phòng…</option>' +
        rooms
          .map(
            (r) =>
              `<option value="${r.id}">${A.escapeHtml(r.name)} · ${A.genderLabel(r.gender)} (${r.occupancy}/${
                r.capacity
              })</option>`
          )
          .join('')
    );
  }

  function syncSortHeaders() {
    panel.querySelectorAll('th[data-sort]').forEach((th) => {
      const active = th.dataset.sort === sortKey;
      th.classList.toggle('is-asc', active && sortDir === 'asc');
      th.classList.toggle('is-desc', active && sortDir === 'desc');
      th.setAttribute('aria-sort', active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  function syncSelectAll(list) {
    const picked = list.filter((m) => selected.has(m.id)).length;
    selectAll.checked = list.length > 0 && picked === list.length;
    selectAll.indeterminate = picked > 0 && picked < list.length;
  }

  // Dong dang duoc thao tac (dang go ten, dang mo o chon) thi khong thay.
  // force=true (sau thao tac cua chinh minh): chi giu dong dang GO chu.
  function rowIsBusy(row, force) {
    const el = document.activeElement;
    if (!el || !row.contains(el)) return false;
    if (force) return el.tagName === 'INPUT' && el.type === 'text';
    return A.isEditingControl(el);
  }

  function render(options) {
    const force = !!(options && options.force);
    renderStats();
    renderFilterChips();
    renderBulkBar();
    syncSortHeaders();

    const list = visibleMembers();
    resultCount.textContent = list.length === members.length ? `${members.length} người` : `${list.length}/${members.length} người`;

    A.patchList(
      memberTableBody,
      list.map((m) => ({ key: m.id, html: rowHtml(m) })),
      {
        keep: (row) => rowIsBusy(row, force),
        empty: `<tr><td colspan="${COLSPAN}" class="admin-empty">${
          !loaded ? 'Đang tải…' : members.length ? 'Không có ai khớp bộ lọc hiện tại' : 'Chưa có thành viên nào'
        }</td></tr>`,
      }
    );

    syncSelectAll(list);
    setOptions(newMemberGroup, groupOptions(null));

    A.applyEditLock(panel, lockNote);
  }

  /* ---------- tai du lieu ---------- */

  const loadAll = A.serial(async () => {
    try {
      const [groupRes, roomRes] = await Promise.all([
        fetch('/api/groups/full').then((r) => r.json()),
        fetch('/api/rooms').then((r) => r.json()),
      ]);
      groups = groupRes.groups || [];
      rooms = roomRes.rooms || [];

      // Co ma bi mat thi lay ban day du (kem so cau da tra loi), khong thi
      // dung API cong khai de van xem duoc danh sach
      members = A.canEdit()
        ? await A.request('GET', '/api/admin/members')
        : await fetch('/api/members').then((r) => r.json());
      loaded = true;

      // Bo chon nhung ai da bi xoa
      const ids = new Set(members.map((m) => m.id));
      [...selected].forEach((id) => {
        if (!ids.has(id)) selected.delete(id);
      });

      render();
    } catch (err) {
      memberTableBody.innerHTML = `<tr><td colspan="${COLSPAN}" class="admin-empty">${A.escapeHtml(err.message)}</td></tr>`;
      A.setMsg(memberMsg, err.message, 'err');
    }
  });

  /* ---------- loc / sap xep / chon ---------- */

  memberFilter.addEventListener('input', () => render());

  filterChips.addEventListener('click', (e) => {
    const key = e.target.closest('[data-filter]');
    if (!key) return;
    activeFilter = key.dataset.filter;
    render();
  });

  panel.querySelectorAll('th[data-sort]').forEach((th) => {
    const toggleSort = () => {
      if (sortKey === th.dataset.sort) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = th.dataset.sort;
        sortDir = 'asc';
      }
      render();
    };
    th.tabIndex = 0;
    th.addEventListener('click', toggleSort);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSort();
      }
    });
  });

  selectAll.addEventListener('change', () => {
    const list = visibleMembers();
    if (selectAll.checked) list.forEach((m) => selected.add(m.id));
    else list.forEach((m) => selected.delete(m.id));
    memberTableBody.querySelectorAll('[data-select]').forEach((box) => {
      box.checked = selected.has(Number(box.dataset.select));
      box.closest('tr').classList.toggle('is-selected', box.checked);
    });
    syncSelectAll(list);
    renderBulkBar();
  });

  // Cap nhat ngay 1 nguoi trong danh sach tu ket qua API (khong cho tai lai ca
  // bang) roi ve lai - thao tac cua chinh minh hien ra tuc thi.
  function applyMemberPatch(updated) {
    const index = members.findIndex((m) => m.id === updated.id);
    if (index === -1) return;
    members[index] = { ...members[index], ...updated, _count: members[index]._count };
  }

  memberTableBody.addEventListener('change', async (e) => {
    const selectId = e.target.dataset.select;
    if (selectId) {
      const id = Number(selectId);
      if (e.target.checked) selected.add(id);
      else selected.delete(id);
      e.target.closest('tr').classList.toggle('is-selected', e.target.checked);
      syncSelectAll(visibleMembers());
      renderBulkBar();
      return;
    }

    const field = e.target.dataset.field;
    if (!field) return;

    const row = e.target.closest('tr');
    const memberId = Number(row.dataset.memberId);
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    // O ghim gom ca 2 co pinnedGroup + pinnedRoom. Dang "mot phan" ma bam -> ghim ca hai.
    let body;
    if (field === 'pinned') {
      const value = e.target.dataset.partial === '1' ? true : e.target.checked;
      body = { pinnedGroup: value, pinnedRoom: value };
    } else if (e.target.type === 'checkbox') {
      body = { [field]: e.target.checked };
    } else {
      const value = field === 'name' ? e.target.value.trim() : e.target.value;
      if (field === 'name' && value === member.name) return;
      body = { [field]: value };
    }

    // Phan hoi ngay tren giao dien trong luc cho may chu
    if (e.target.type === 'checkbox') {
      const label = e.target.closest('.admin-flag');
      if (label) label.classList.toggle('is-on', e.target.checked);
    }
    row.classList.add('is-saving');

    const data = await A.run(null, memberMsg, 'Đang lưu...', () =>
      A.request('PUT', `/api/admin/members/${memberId}`, body)
    );
    row.classList.remove('is-saving');
    if (!data) {
      // Tra o vua sua ve gia tri cu
      render({ force: true });
      scheduleLoad();
      return;
    }

    applyMemberPatch(data.member);
    const extra = data.movedOutOfRoom ? ' (đã đưa ra khỏi phòng cũ vì khác giới tính)' : '';
    A.done(memberMsg, `Đã cập nhật ${data.member.name}.${extra}`);
    render({ force: true });
    scheduleLoad();
  });

  // Enter trong o ten = luu ngay (khong phai bam ra ngoai), Esc = huy sua
  memberTableBody.addEventListener('keydown', (e) => {
    if (e.target.dataset.field !== 'name') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    } else if (e.key === 'Escape') {
      const member = members.find((m) => m.id === Number(e.target.closest('tr').dataset.memberId));
      if (member) e.target.value = member.name;
      e.target.blur();
    }
  });

  // Roi khoi o dang sua -> ap dung ban cap nhat realtime da hoan (neu co)
  memberTableBody.addEventListener('focusout', () => {
    setTimeout(() => {
      if (pendingRender && !A.isBusy(memberTableBody)) {
        pendingRender = false;
        render();
      }
    }, 0);
  });

  memberTableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="delete-member"]');
    if (!btn) return;

    const row = btn.closest('tr');
    const memberId = Number(row.dataset.memberId);
    const member = members.find((m) => m.id === memberId);
    const name = member ? member.name : row.querySelector('[data-field="name"]').value;

    const ok = await A.confirmAction({
      title: 'Xóa thành viên',
      message: `Xóa thành viên <strong>${A.escapeHtml(name)}</strong>?<br />Điểm quiz và câu trả lời của họ cũng bị xóa. Không thể hoàn tác.`,
      okText: 'Xóa',
    });
    if (!ok) return;

    const data = await A.run(btn, memberMsg, 'Đang xóa...', () => A.request('DELETE', `/api/admin/members/${memberId}`));
    if (!data) return;

    selected.delete(memberId);
    members = members.filter((m) => m.id !== memberId);
    A.done(memberMsg, `Đã xóa "${data.name || name}".`);
    render({ force: true });
    scheduleLoad();
  });

  /* ---------- thao tac hang loat ---------- */

  // Khoa ca thanh hang loat trong luc chay: bam 2 nut lien tiep khong gui chong
  async function runBulkTask(btn, pendingText, task) {
    const controls = [...bulkBar.querySelectorAll('button, select')];
    const before = controls.map((el) => el.disabled);
    controls.forEach((el) => {
      el.disabled = true;
    });
    bulkBar.classList.add('is-busy');
    try {
      return await A.run(btn, memberMsg, pendingText, task);
    } finally {
      bulkBar.classList.remove('is-busy');
      controls.forEach((el, i) => {
        el.disabled = before[i];
      });
    }
  }

  async function runBulk(btn, body, pendingText, describe) {
    const data = await runBulkTask(btn, pendingText, () =>
      A.request('POST', '/api/admin/members/bulk', { ids: [...selected], ...body })
    );
    if (!data) return null;

    A.done(memberMsg, describe(data));
    if (body.action === 'delete') selected.clear();
    loadAll();
    return data;
  }

  bulkBar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-bulk]');
    if (!btn) return;
    const action = btn.dataset.bulk;

    if (action === 'clear-selection') {
      selected.clear();
      render();
      return;
    }
    if (!selected.size) {
      A.setMsg(memberMsg, 'Chưa chọn ai cả', 'err');
      return;
    }

    if (action === 'gender-female' || action === 'gender-male') {
      const gender = action === 'gender-female' ? 'FEMALE' : 'MALE';
      runBulk(btn, { action: 'gender', gender }, 'Đang đặt giới tính...', (data) => {
        const moved = data.movedOutOfRoom ? ` (${data.movedOutOfRoom} người bị đưa ra khỏi phòng khác giới)` : '';
        return `Đã đặt ${gender === 'FEMALE' ? 'Nữ' : 'Nam'} cho ${data.affected} người.${moved}`;
      });
      return;
    }

    // Bat/tat ca 3 vong cung luc cho nhanh. Gui lan luot tung co; 1 lan loi thi
    // dung lai va bao loi (truoc day loi bi nuot, van bao "da xong").
    if (action === 'join-on' || action === 'join-off') {
      const value = action === 'join-on';
      const count = selected.size;
      if (!value) {
        const ok = await A.confirmAction({
          title: 'Loại khỏi tất cả các vòng',
          message: `Loại <strong>${count} người</strong> khỏi cả 3 vòng (chia nhóm, ghép phòng, quiz)?<br />Kết quả chia nhóm và phòng hiện tại của họ sẽ bị gỡ.`,
          okText: 'Loại khỏi vòng',
        });
        if (!ok) return;
      }

      const ids = [...selected];
      const data = await runBulkTask(btn, value ? 'Đang cho tham gia...' : 'Đang loại khỏi vòng...', async () => {
        for (const flag of ['joinRandom', 'joinRoom', 'joinQuiz']) {
          // eslint-disable-next-line no-await-in-loop
          await A.request('POST', '/api/admin/members/bulk', { ids, action: 'flag', flag, value });
        }
        return true;
      });
      loadAll();
      if (!data) return;
      A.done(memberMsg, value ? `Đã cho ${count} người tham gia mọi vòng.` : `Đã loại ${count} người khỏi mọi vòng.`);
      return;
    }

    if (action === 'clear-room') {
      runBulk(btn, { action: 'clear-room' }, 'Đang bỏ phòng...', (data) => `Đã bỏ phòng của ${data.affected} người.`);
      return;
    }

    if (action === 'clear-group') {
      runBulk(btn, { action: 'clear-group' }, 'Đang bỏ nhóm...', (data) => `Đã bỏ nhóm của ${data.affected} người.`);
      return;
    }

    if (action === 'delete') {
      const ok = await A.confirmAction({
        title: 'Xóa thành viên',
        message: `Xóa <strong>${selected.size} thành viên</strong> đã chọn?<br />Điểm quiz của họ cũng bị xóa. Không thể hoàn tác.`,
        okText: 'Xóa tất cả',
      });
      if (!ok) return;
      runBulk(btn, { action: 'delete' }, 'Đang xóa...', (data) => `Đã xóa ${data.affected} thành viên.`);
    }
  });

  function bulkSelectGuard(select) {
    if (!select.value) return false;
    if (!selected.size) {
      A.setMsg(memberMsg, 'Chưa chọn ai cả', 'err');
      select.value = '';
      return false;
    }
    return true;
  }

  bulkGroupSelect.addEventListener('change', async () => {
    if (!bulkSelectGuard(bulkGroupSelect)) return;
    const groupName = bulkGroupSelect.options[bulkGroupSelect.selectedIndex].textContent;
    await runBulk(null, { action: 'group', groupId: bulkGroupSelect.value }, 'Đang xếp nhóm...', (data) => `Đã xếp ${data.affected} người vào "${groupName}".`);
    bulkGroupSelect.value = '';
  });

  bulkRoomSelect.addEventListener('change', async () => {
    if (!bulkSelectGuard(bulkRoomSelect)) return;
    await runBulk(null, { action: 'room', roomId: bulkRoomSelect.value }, 'Đang xếp phòng...', (data) => `Đã xếp ${data.affected} người vào "${data.roomName}".`);
    bulkRoomSelect.value = '';
  });

  bulkFlagSelect.addEventListener('change', async () => {
    if (!bulkSelectGuard(bulkFlagSelect)) return;
    const label = bulkFlagSelect.options[bulkFlagSelect.selectedIndex].textContent;
    const [flag, raw] = bulkFlagSelect.value.split(':');
    await runBulk(null, { action: 'flag', flag, value: raw === '1' }, 'Đang cập nhật quyền...', (data) => `${label}: đã áp dụng cho ${data.affected} người.`);
    bulkFlagSelect.value = '';
  });

  /* ---------- them 1 nguoi / nhieu nguoi ---------- */

  addMemberBtn.addEventListener('click', async () => {
    const data = await A.run(addMemberBtn, addMemberMsg, 'Đang thêm...', () =>
      A.request('POST', '/api/admin/members', {
        name: newMemberName.value,
        gender: newMemberGender.value,
        groupId: newMemberGroup.value,
      })
    );
    if (!data) return;

    A.done(addMemberMsg, `Đã thêm "${data.member.name}".`);
    newMemberName.value = '';
    newMemberName.focus();
    loadAll();
  });

  newMemberName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !addMemberBtn.disabled) addMemberBtn.click();
  });

  // Moi dong: "Ten" | "Ten, Nam" | "Ten, Nu, Ten nhom"
  function parseImportLines(text) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        const rawGender = (parts[1] || '').toLowerCase();
        let gender = '';
        if (['nam', 'male', 'm'].includes(rawGender)) gender = 'MALE';
        else if (['nữ', 'nu', 'female', 'f'].includes(rawGender)) gender = 'FEMALE';
        return { name: parts[0], gender, group: parts[2] || '' };
      });
  }

  importBtn.addEventListener('click', async () => {
    const items = parseImportLines(importText.value);
    if (!items.length) {
      A.setMsg(importMsg, 'Chưa nhập dòng nào', 'err');
      return;
    }

    const data = await A.run(importBtn, importMsg, `Đang thêm ${items.length} người...`, () =>
      A.request('POST', '/api/admin/members/import', { items })
    );
    if (!data) return;

    const parts = [`Đã thêm ${data.created.length} người.`];
    if (data.skipped.length) {
      parts.push(`Bỏ qua ${data.skipped.length}: ${data.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`);
    }
    A.setMsg(importMsg, parts.join(' '), data.skipped.length ? 'warn' : 'ok');
    A.toast(`Đã thêm ${data.created.length} người.`, data.skipped.length ? 'warn' : 'ok');
    if (data.created.length) importText.value = '';
    loadAll();
  });

  /* ---------- xuat CSV ---------- */

  exportBtn.addEventListener('click', () => {
    const rows = [
      ['STT', 'Họ tên', 'Giới tính', 'Nhóm', 'Phòng ngủ', 'Nhóm trưởng', 'Điểm quiz', 'Chia nhóm', 'Ghép phòng', 'Quiz', 'Ghim nhóm', 'Ghim phòng'],
    ];
    visibleMembers().forEach((m, i) => {
      rows.push([
        i + 1,
        m.name,
        A.genderLabel(m.gender),
        m.group ? m.group.name : '',
        m.room ? m.room.name : '',
        m.isLeader ? 'x' : '',
        m.quizScore,
        m.joinRandom ? 'x' : '',
        m.joinRoom ? 'x' : '',
        m.joinQuiz ? 'x' : '',
        m.pinnedGroup ? 'x' : '',
        m.pinnedRoom ? 'x' : '',
      ]);
    });
    A.downloadCsv('danh-sach-thanh-vien.csv', rows);
    A.done(memberMsg, `Đã xuất ${rows.length - 1} dòng ra file CSV.`);
  });

  /* ---------- realtime ---------- */

  // 1 lan "chia nhom cho tat ca" phat 3-4 su kien lien nhau -> gop thanh 1 lan tai.
  // Dang go ten / mo o chon trong bang thi cac dong khac van cap nhat, rieng dong
  // do giu nguyen (xem rowIsBusy).
  let pendingRender = false;
  const scheduleLoad = A.onLive(
    ['members:updated', 'rooms:updated', 'groups:updated', 'groups:reset', 'rooms:reset',
      'member:room-randomized', 'member:randomized', 'questions:updated'],
    () => {
      if (A.isBusy(memberTableBody)) pendingRender = true;
      loadAll();
    }
  );

  A.onTab('members', loadAll);
})();
