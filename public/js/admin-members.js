// Tab "Thanh vien": danh sach day du + them/sua/xoa, loc, sap xep, chon nhieu
// de sua hang loat, dan danh sach them 1 luot, xuat CSV.
//
// Diem moi: cot "Tham gia" - 3 o tick quyet dinh ai duoc vao tung vong
// (chia nhom / ghep phong / quiz) va 1 o ghim de khong bi xao lai.
// Tat 1 vong thi server tu go ket qua cu cua vong do.
//
// Chua nhap ma bi mat thi van xem duoc danh sach (doc tu API cong khai),
// chi cac o sua bi khoa lai.
(function () {
// Chi hoan ve lai khi nguoi dung dang GO trong 1 o chu/so - ve lai luc do se
// cuop mat con tro. Con tick checkbox hay chon trong dropdown thi da xong thao tac,
// phai ve lai ngay de bang hien dung trang thai moi.
function isTyping(scope) {
  const el = document.activeElement;
  if (!el || !scope.contains(el)) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return ['text', 'search', 'number', 'password', 'date', 'datetime-local'].includes(el.type);
}
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="members"]');
  const memberStats = document.getElementById('memberStats');
  const memberTableBody = document.getElementById('memberTableBody');
  const memberFilter = document.getElementById('memberFilter');
  const filterChips = document.getElementById('memberFilterChips');
  const memberMsg = document.getElementById('memberMsg');
  const lockNote = document.getElementById('memberLockNote');

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

  const COLSPAN = 10;

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
    { key: 'pinned', label: 'Đã ghim', icon: 'pin', test: (m) => m.pinnedGroup || m.pinnedRoom },
  ];

  let members = [];
  let groups = [];
  let rooms = [];
  let activeFilter = 'all';
  let sortKey = 'name';
  let sortDir = 'asc';
  const selected = new Set();

  /* ---------- thong ke ---------- */

  function renderStats() {
    const male = members.filter((m) => m.gender === 'MALE').length;
    const female = members.filter((m) => m.gender === 'FEMALE').length;
    const noGender = members.filter((m) => !m.gender).length;
    const inRoom = members.filter((m) => m.roomId).length;
    const inGroup = members.filter((m) => m.groupId).length;
    const excluded = members.filter((m) => !m.joinRandom || !m.joinRoom || !m.joinQuiz).length;

    const tiles = [
      A.statTile({ icon: 'users', label: 'Tổng thành viên', value: members.length, variant: 'accent' }),
      A.statTile({ icon: 'venus', label: 'Nữ', value: female, variant: 'female' }),
      A.statTile({ icon: 'mars', label: 'Nam', value: male, variant: 'male' }),
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
    ];

    if (noGender) {
      tiles.push(
        A.statTile({
          icon: 'circle-alert',
          label: 'Chưa đặt giới tính',
          value: noGender,
          sub: 'Chưa ghép phòng được',
          variant: 'warn',
        })
      );
    }
    if (excluded) {
      tiles.push(
        A.statTile({
          icon: 'user-round-x',
          label: 'Bị loại khỏi vòng nào đó',
          value: excluded,
          variant: 'danger',
        })
      );
    }

    memberStats.innerHTML = tiles.join('');
    A.setBadge('members', members.length);
  }

  function renderFilterChips() {
    filterChips.innerHTML = FILTERS.map((f) => {
      const count = members.filter(f.test).length;
      return `
        <button type="button" class="admin-filter-chip ${f.key === activeFilter ? 'is-active' : ''}"
          data-filter="${f.key}" data-always-enabled="1">
          ${A.icon(f.icon)} ${f.label}<span class="admin-filter-count">${count}</span>
        </button>`;
    }).join('');
  }

  /* ---------- dong trong bang ---------- */

  function groupOptions(selectedId) {
    return (
      '<option value="">-- Chưa có nhóm --</option>' +
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
    if (!member.gender) return '<option value="">-- Cần đặt giới tính --</option>';

    return (
      '<option value="">-- Chưa có phòng --</option>' +
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
    const toggles = FLAGS.map(
      (f) => `
      <label class="admin-flag ${member[f.key] ? 'is-on' : ''}" title="${f.title}">
        ${A.icon(f.icon)}
        <input type="checkbox" data-field="${f.key}" ${member[f.key] ? 'checked' : ''} />
      </label>`
    ).join('');

    // Ghim: 1 o duy nhat, bat ca pinnedGroup lan pinnedRoom cho gon
    const pinned = member.pinnedGroup && member.pinnedRoom;
    const pin = `
      <label class="admin-flag is-pin ${pinned ? 'is-on' : ''}" title="Ghim kết quả — không bị xáo lại khi admin chia lại">
        ${A.icon('pin')}
        <input type="checkbox" data-field="pinned" ${pinned ? 'checked' : ''} />
      </label>`;

    return `<td class="admin-cell-flags"><div class="admin-flag-group">${toggles}${pin}</div></td>`;
  }

  function rowHtml(member, index) {
    const answered = member._count && member._count.answers ? ` · ${member._count.answers} câu` : '';
    const excluded = !member.joinRandom || !member.joinRoom || !member.joinQuiz;

    const classes = [
      selected.has(member.id) ? 'is-selected' : '',
      member.gender ? '' : 'is-warn',
      excluded ? 'is-excluded' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return `
      <tr data-member-id="${member.id}" class="${classes}">
        <td class="admin-cell-check">
          <input type="checkbox" data-select="${member.id}" ${selected.has(member.id) ? 'checked' : ''} data-always-enabled="1" />
        </td>
        <td class="admin-cell-index">${index + 1}</td>
        <td class="admin-cell-name"><input type="text" data-field="name" value="${A.escapeHtml(member.name)}" /></td>
        <td class="admin-cell-pick is-narrow">
          <select data-field="gender">
            <option value="" ${!member.gender ? 'selected' : ''}>-- Chưa đặt --</option>
            <option value="MALE" ${member.gender === 'MALE' ? 'selected' : ''}>Nam</option>
            <option value="FEMALE" ${member.gender === 'FEMALE' ? 'selected' : ''}>Nữ</option>
          </select>
        </td>
        ${flagCell(member)}
        <td class="admin-cell-pick"><select data-field="groupId" ${member.joinRandom ? '' : 'disabled data-keep-disabled="1"'}>${groupOptions(
          member.groupId
        )}</select></td>
        <td class="admin-cell-pick"><select data-field="roomId" ${
          member.gender && member.joinRoom ? '' : 'disabled data-keep-disabled="1"'
        }>${roomOptions(member)}</select></td>
        <td class="admin-cell-center">
          <input type="checkbox" data-field="isLeader" ${member.isLeader ? 'checked' : ''} title="Đánh dấu là Nhóm Trưởng" />
        </td>
        <td class="admin-cell-muted">${member.quizScore} điểm${answered}</td>
        <td class="admin-cell-actions">
          <button type="button" class="admin-row-btn danger icon-only" data-action="delete-member" title="Xóa thành viên">
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
        return member.isLeader ? '1' : '0';
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

  function renderBulkBar() {
    const count = selected.size;
    bulkBar.hidden = count === 0;
    bulkCount.innerHTML = `${A.icon('check-check')} Đã chọn ${count} người`;

    bulkGroupSelect.innerHTML =
      '<option value="">Xếp vào nhóm...</option>' +
      groups.map((g) => `<option value="${g.id}">${A.escapeHtml(g.name)}</option>`).join('');

    bulkRoomSelect.innerHTML =
      '<option value="">Xếp vào phòng...</option>' +
      rooms
        .map(
          (r) =>
            `<option value="${r.id}">${A.escapeHtml(r.name)} · ${A.genderLabel(r.gender)} (${r.occupancy}/${
              r.capacity
            })</option>`
        )
        .join('');
  }

  function syncSortHeaders() {
    panel.querySelectorAll('th[data-sort]').forEach((th) => {
      th.classList.toggle('is-asc', th.dataset.sort === sortKey && sortDir === 'asc');
      th.classList.toggle('is-desc', th.dataset.sort === sortKey && sortDir === 'desc');
    });
  }

  function render() {
    // Dang go trong o nao do thi khoan ve lai keo mat con tro
    if (isTyping(memberTableBody)) return;

    renderStats();
    renderFilterChips();
    renderBulkBar();
    syncSortHeaders();

    const list = visibleMembers();
    memberTableBody.innerHTML = list.length
      ? list.map(rowHtml).join('')
      : `<tr><td colspan="${COLSPAN}" class="admin-empty">${
          members.length ? 'Không có ai khớp bộ lọc hiện tại' : 'Chưa có thành viên nào'
        }</td></tr>`;

    selectAll.checked = list.length > 0 && list.every((m) => selected.has(m.id));
    newMemberGroup.innerHTML = groupOptions(null);

    A.applyEditLock(panel, lockNote);
  }

  /* ---------- tai du lieu ---------- */

  async function loadAll() {
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

      // Bo chon nhung ai da bi xoa
      const ids = new Set(members.map((m) => m.id));
      [...selected].forEach((id) => {
        if (!ids.has(id)) selected.delete(id);
      });

      render();
    } catch (err) {
      memberTableBody.innerHTML = `<tr><td colspan="${COLSPAN}" class="admin-empty">${A.escapeHtml(
        err.message
      )}</td></tr>`;
      A.setMsg(memberMsg, err.message, 'err');
    }
  }

  /* ---------- loc / sap xep / chon ---------- */

  memberFilter.addEventListener('input', render);

  filterChips.addEventListener('click', (e) => {
    const key = e.target.closest('[data-filter]');
    if (!key) return;
    activeFilter = key.dataset.filter;
    render();
  });

  panel.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      if (sortKey === th.dataset.sort) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = th.dataset.sort;
        sortDir = 'asc';
      }
      render();
    });
  });

  selectAll.addEventListener('change', () => {
    const list = visibleMembers();
    if (selectAll.checked) list.forEach((m) => selected.add(m.id));
    else list.forEach((m) => selected.delete(m.id));
    render();
  });

  memberTableBody.addEventListener('change', async (e) => {
    const selectId = e.target.dataset.select;
    if (selectId) {
      const id = Number(selectId);
      if (e.target.checked) selected.add(id);
      else selected.delete(id);
      e.target.closest('tr').classList.toggle('is-selected', e.target.checked);
      renderBulkBar();
      return;
    }

    const field = e.target.dataset.field;
    if (!field) return;

    const row = e.target.closest('tr');
    const memberId = Number(row.dataset.memberId);

    // O ghim gom ca 2 co pinnedGroup + pinnedRoom
    let body;
    if (field === 'pinned') {
      body = { pinnedGroup: e.target.checked, pinnedRoom: e.target.checked };
    } else if (e.target.type === 'checkbox') {
      body = { [field]: e.target.checked };
    } else {
      body = { [field]: e.target.value };
    }

    const data = await A.run(null, memberMsg, 'Đang lưu...', () =>
      A.request('PUT', `/api/admin/members/${memberId}`, body)
    );
    if (!data) {
      loadAll();
      return;
    }

    const extra = data.movedOutOfRoom ? ' (đã đưa ra khỏi phòng cũ vì khác giới tính)' : '';
    A.done(memberMsg, `Đã cập nhật ${data.member.name}.${extra}`);
    loadAll();
  });

  memberTableBody.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!isTyping(memberTableBody)) render();
    }, 0);
  });

  memberTableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="delete-member"]');
    if (!btn) return;

    const row = btn.closest('tr');
    const memberId = Number(row.dataset.memberId);
    const name = row.querySelector('[data-field="name"]').value;

    const ok = await A.confirmAction({
      title: 'Xóa thành viên',
      message: `Xóa thành viên <strong>${A.escapeHtml(name)}</strong>?<br />Điểm quiz và câu trả lời của họ cũng bị xóa. Không thể hoàn tác.`,
      okText: 'Xóa',
    });
    if (!ok) return;

    const data = await A.run(null, memberMsg, 'Đang xóa...', () => A.request('DELETE', `/api/admin/members/${memberId}`));
    if (!data) return;

    selected.delete(memberId);
    A.done(memberMsg, `Đã xóa "${data.name}".`);
    loadAll();
  });

  /* ---------- thao tac hang loat ---------- */

  async function runBulk(body, pendingText, describe) {
    const data = await A.run(null, memberMsg, pendingText, () =>
      A.request('POST', '/api/admin/members/bulk', { ids: [...selected], ...body })
    );
    if (!data) return;

    A.done(memberMsg, describe(data));
    if (body.action === 'delete') selected.clear();
    loadAll();
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
      runBulk({ action: 'gender', gender }, 'Đang đặt giới tính...', (data) => {
        const moved = data.movedOutOfRoom ? ` (${data.movedOutOfRoom} người bị đưa ra khỏi phòng khác giới)` : '';
        return `Đã đặt ${gender === 'FEMALE' ? 'Nữ' : 'Nam'} cho ${data.affected} người.${moved}`;
      });
      return;
    }

    // Bat/tat ca 3 vong cung luc cho nhanh
    if (action === 'join-on' || action === 'join-off') {
      const value = action === 'join-on';
      if (!value) {
        const ok = await A.confirmAction({
          title: 'Loại khỏi tất cả các vòng',
          message: `Loại <strong>${selected.size} người</strong> khỏi cả 3 vòng (chia nhóm, ghép phòng, quiz)?<br />Kết quả chia nhóm và phòng hiện tại của họ sẽ bị gỡ.`,
          okText: 'Loại khỏi vòng',
        });
        if (!ok) return;
      }

      for (const flag of ['joinRandom', 'joinRoom', 'joinQuiz']) {
        // eslint-disable-next-line no-await-in-loop
        await A.request('POST', '/api/admin/members/bulk', { ids: [...selected], action: 'flag', flag, value }).catch(
          (err) => A.setMsg(memberMsg, err.message, 'err')
        );
      }
      A.done(memberMsg, value ? `Đã cho ${selected.size} người tham gia mọi vòng.` : `Đã loại ${selected.size} người khỏi mọi vòng.`);
      loadAll();
      return;
    }

    if (action === 'clear-room') {
      runBulk({ action: 'clear-room' }, 'Đang bỏ phòng...', (data) => `Đã bỏ phòng của ${data.affected} người.`);
      return;
    }

    if (action === 'clear-group') {
      runBulk({ action: 'clear-group' }, 'Đang bỏ nhóm...', (data) => `Đã bỏ nhóm của ${data.affected} người.`);
      return;
    }

    if (action === 'delete') {
      const ok = await A.confirmAction({
        title: 'Xóa thành viên',
        message: `Xóa <strong>${selected.size} thành viên</strong> đã chọn?<br />Điểm quiz của họ cũng bị xóa. Không thể hoàn tác.`,
        okText: 'Xóa tất cả',
      });
      if (!ok) return;
      runBulk({ action: 'delete' }, 'Đang xóa...', (data) => `Đã xóa ${data.affected} thành viên.`);
    }
  });

  bulkGroupSelect.addEventListener('change', () => {
    if (!bulkGroupSelect.value) return;
    if (!selected.size) {
      A.setMsg(memberMsg, 'Chưa chọn ai cả', 'err');
      bulkGroupSelect.value = '';
      return;
    }

    const groupName = bulkGroupSelect.options[bulkGroupSelect.selectedIndex].textContent;
    runBulk({ action: 'group', groupId: bulkGroupSelect.value }, 'Đang xếp nhóm...', (data) => {
      bulkGroupSelect.value = '';
      return `Đã xếp ${data.affected} người vào "${groupName}".`;
    });
  });

  bulkRoomSelect.addEventListener('change', () => {
    if (!bulkRoomSelect.value) return;
    if (!selected.size) {
      A.setMsg(memberMsg, 'Chưa chọn ai cả', 'err');
      bulkRoomSelect.value = '';
      return;
    }

    runBulk({ action: 'room', roomId: bulkRoomSelect.value }, 'Đang xếp phòng...', (data) => {
      bulkRoomSelect.value = '';
      return `Đã xếp ${data.affected} người vào "${data.roomName}".`;
    });
  });

  bulkFlagSelect.addEventListener('change', () => {
    if (!bulkFlagSelect.value) return;
    if (!selected.size) {
      A.setMsg(memberMsg, 'Chưa chọn ai cả', 'err');
      bulkFlagSelect.value = '';
      return;
    }

    const label = bulkFlagSelect.options[bulkFlagSelect.selectedIndex].textContent;
    const [flag, raw] = bulkFlagSelect.value.split(':');
    runBulk({ action: 'flag', flag, value: raw === '1' }, 'Đang cập nhật quyền...', (data) => {
      bulkFlagSelect.value = '';
      return `${label}: đã áp dụng cho ${data.affected} người.`;
    });
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
    loadAll();
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
      ['STT', 'Họ tên', 'Giới tính', 'Nhóm', 'Phòng ngủ', 'Nhóm trưởng', 'Điểm quiz', 'Chia nhóm', 'Ghép phòng', 'Quiz', 'Ghim'],
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
        m.pinnedGroup || m.pinnedRoom ? 'x' : '',
      ]);
    });
    A.downloadCsv('danh-sach-thanh-vien.csv', rows);
    A.done(memberMsg, `Đã xuất ${rows.length - 1} dòng ra file CSV.`);
  });

  /* ---------- realtime ---------- */

  if (A.socket) {
    const refreshIfVisible = () => {
      if (A.activeTab() === 'members') loadAll();
    };
    ['members:updated', 'rooms:updated', 'groups:updated', 'groups:reset', 'rooms:reset',
      'member:room-randomized', 'member:randomized'].forEach((evt) => A.socket.on(evt, refreshIfVisible));
  }

  A.onSecretChange(() => {
    if (A.activeTab() === 'members') loadAll();
  });

  A.onTab('members', loadAll);
})();
