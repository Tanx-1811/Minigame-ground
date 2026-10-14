// Tab "Thanh vien": danh sach day du + them/sua/xoa, loc, sap xep, chon nhieu
// de sua hang loat, dan danh sach them 1 luot, xuat CSV.
// Chua nhap ma bi mat thi van xem duoc danh sach (doc tu API cong khai),
// chi cac o sua bi khoa lai.
(function () {
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

  const newMemberName = document.getElementById('newMemberName');
  const newMemberGender = document.getElementById('newMemberGender');
  const newMemberGroup = document.getElementById('newMemberGroup');
  const addMemberBtn = document.getElementById('addMemberBtn');
  const addMemberMsg = document.getElementById('addMemberMsg');

  const importText = document.getElementById('memberImportText');
  const importBtn = document.getElementById('memberImportBtn');
  const importMsg = document.getElementById('memberImportMsg');
  const exportBtn = document.getElementById('memberExportBtn');

  const FILTERS = [
    { key: 'all', label: 'Tất cả', test: () => true },
    { key: 'female', label: '👩 Nữ', test: (m) => m.gender === 'FEMALE' },
    { key: 'male', label: '👨 Nam', test: (m) => m.gender === 'MALE' },
    { key: 'nogender', label: '❔ Chưa đặt giới tính', test: (m) => !m.gender },
    { key: 'noroom', label: '🛏️ Chưa có phòng', test: (m) => !m.roomId },
    { key: 'nogroup', label: '🏷️ Chưa có nhóm', test: (m) => !m.groupId },
    { key: 'leader', label: '👑 Nhóm trưởng', test: (m) => m.isLeader },
  ];

  let members = [];
  let groups = [];
  let rooms = [];
  let activeFilter = 'all';
  let sortKey = 'name';
  let sortDir = 'asc';
  const selected = new Set();

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
    const male = members.filter((m) => m.gender === 'MALE').length;
    const female = members.filter((m) => m.gender === 'FEMALE').length;
    const noGender = members.filter((m) => !m.gender).length;
    const inRoom = members.filter((m) => m.roomId).length;
    const inGroup = members.filter((m) => m.groupId).length;

    const tiles = [
      statTile({ label: '👥 Tổng thành viên', value: members.length }),
      statTile({ label: '👩 Nữ', value: female, variant: 'female' }),
      statTile({ label: '👨 Nam', value: male, variant: 'male' }),
      statTile({ label: '🛏️ Đã có phòng', value: `${inRoom}/${members.length}` }),
      statTile({ label: '🏷️ Đã có nhóm', value: `${inGroup}/${members.length}` }),
    ];
    if (noGender) {
      tiles.push(
        statTile({
          label: '⚠️ Chưa đặt giới tính',
          value: noGender,
          sub: 'Chưa ghép phòng được',
          variant: 'warn',
        })
      );
    }
    memberStats.innerHTML = tiles.join('');
  }

  function renderFilterChips() {
    filterChips.innerHTML = FILTERS.map((f) => {
      const count = members.filter(f.test).length;
      return `
        <button type="button" class="admin-filter-chip ${f.key === activeFilter ? 'is-active' : ''}"
          data-filter="${f.key}" data-always-enabled="1">
          ${f.label}<span class="admin-filter-count">${count}</span>
        </button>`;
    }).join('');
  }

  /* ---------- dong trong bang ---------- */

  function groupOptions(selectedId) {
    return (
      '<option value="">-- Chưa có nhóm --</option>' +
      groups
        .map(
          (g) => `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${A.escapeHtml(g.name)}</option>`
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
          return `<option value="${r.id}" ${isCurrent ? 'selected' : ''} ${isFull ? 'disabled' : ''}>${A.escapeHtml(r.name)} (${r.occupancy}/${r.capacity})${isFull ? ' - đã kín' : ''}</option>`;
        })
        .join('')
    );
  }

  function rowHtml(member, index) {
    const answered = member._count && member._count.answers ? ` · ${member._count.answers} câu` : '';
    return `
      <tr data-member-id="${member.id}" class="${selected.has(member.id) ? 'is-selected' : ''} ${member.gender ? '' : 'is-warn'}">
        <td class="admin-cell-check">
          <input type="checkbox" data-select="${member.id}" ${selected.has(member.id) ? 'checked' : ''} data-always-enabled="1" />
        </td>
        <td class="admin-cell-index">${index + 1}</td>
        <td class="admin-cell-name"><input type="text" data-field="name" value="${A.escapeHtml(member.name)}" /></td>
        <td>
          <select data-field="gender">
            <option value="" ${!member.gender ? 'selected' : ''}>-- Chưa đặt --</option>
            <option value="MALE" ${member.gender === 'MALE' ? 'selected' : ''}>👨 Nam</option>
            <option value="FEMALE" ${member.gender === 'FEMALE' ? 'selected' : ''}>👩 Nữ</option>
          </select>
        </td>
        <td><select data-field="groupId">${groupOptions(member.groupId)}</select></td>
        <td><select data-field="roomId" ${member.gender ? '' : 'disabled'}>${roomOptions(member)}</select></td>
        <td class="admin-cell-center">
          <input type="checkbox" data-field="isLeader" ${member.isLeader ? 'checked' : ''} title="Đánh dấu là Nhóm Trưởng" />
        </td>
        <td class="admin-cell-muted">${member.quizScore} điểm${answered}</td>
        <td class="admin-cell-actions">
          <button type="button" class="admin-row-btn danger" data-action="delete-member">🗑️</button>
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
      default:
        return member.name;
    }
  }

  function visibleMembers() {
    const keyword = memberFilter.value.trim().toLowerCase();
    const filter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];

    const list = members
      .filter(filter.test)
      .filter((m) => !keyword || m.name.toLowerCase().includes(keyword));

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
    bulkCount.textContent = `Đã chọn ${count} người`;
    bulkGroupSelect.innerHTML =
      '<option value="">Xếp vào nhóm...</option>' +
      groups.map((g) => `<option value="${g.id}">${A.escapeHtml(g.name)}</option>`).join('');
  }

  function syncSortHeaders() {
    panel.querySelectorAll('th[data-sort]').forEach((th) => {
      th.classList.toggle('is-asc', th.dataset.sort === sortKey && sortDir === 'asc');
      th.classList.toggle('is-desc', th.dataset.sort === sortKey && sortDir === 'desc');
    });
  }

  function render() {
    if (memberTableBody.contains(document.activeElement)) return;

    renderStats();
    renderFilterChips();
    renderBulkBar();
    syncSortHeaders();

    const list = visibleMembers();
    memberTableBody.innerHTML = list.length
      ? list.map(rowHtml).join('')
      : `<tr><td colspan="9" class="admin-empty">${members.length ? 'Không có ai khớp bộ lọc hiện tại' : 'Chưa có thành viên nào'}</td></tr>`;

    selectAll.checked = list.length > 0 && list.every((m) => selected.has(m.id));
    newMemberGroup.innerHTML = groupOptions(null);

    A.applyEditLock(panel, lockNote);
  }

  /* ---------- tai du lieu ---------- */

  async function loadAll() {
    try {
      const [groupRes, roomRes] = await Promise.all([
        fetch('/api/groups').then((r) => r.json()),
        fetch('/api/rooms').then((r) => r.json()),
      ]);
      groups = groupRes;
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
      A.setMsg(memberMsg, '');
    } catch (err) {
      memberTableBody.innerHTML = `<tr><td colspan="9" class="admin-empty">${A.escapeHtml(err.message)}</td></tr>`;
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
    const value = field === 'isLeader' ? e.target.checked : e.target.value;

    const data = await A.run(null, memberMsg, 'Đang lưu...', () =>
      A.request('PUT', `/api/admin/members/${memberId}`, { [field]: value })
    );
    if (!data) {
      loadAll();
      return;
    }

    const extra = data.movedOutOfRoom ? ' (đã đưa ra khỏi phòng cũ vì khác giới tính)' : '';
    A.setMsg(memberMsg, `Đã cập nhật ${data.member.name}.${extra}`, 'ok');
    loadAll();
  });

  memberTableBody.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!memberTableBody.contains(document.activeElement)) render();
    }, 0);
  });

  memberTableBody.addEventListener('click', async (e) => {
    if (e.target.dataset.action !== 'delete-member') return;

    const row = e.target.closest('tr');
    const memberId = Number(row.dataset.memberId);
    const name = row.querySelector('[data-field="name"]').value;

    if (!confirm(`Xóa thành viên "${name}"? Điểm quiz và câu trả lời của họ cũng bị xóa. Không thể hoàn tác.`)) return;

    const data = await A.run(null, memberMsg, 'Đang xóa...', () =>
      A.request('DELETE', `/api/admin/members/${memberId}`)
    );
    if (!data) return;

    selected.delete(memberId);
    A.setMsg(memberMsg, `Đã xóa "${data.name}".`, 'ok');
    loadAll();
  });

  /* ---------- thao tac hang loat ---------- */

  async function runBulk(body, pendingText, describe) {
    const data = await A.run(null, memberMsg, pendingText, () =>
      A.request('POST', '/api/admin/members/bulk', { ids: [...selected], ...body })
    );
    if (!data) return;

    A.setMsg(memberMsg, describe(data), 'ok');
    if (body.action === 'delete') selected.clear();
    loadAll();
  }

  bulkBar.addEventListener('click', (e) => {
    const action = e.target.dataset.bulk;
    if (!action) return;

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

    if (action === 'clear-room') {
      runBulk({ action: 'clear-room' }, 'Đang bỏ phòng...', (data) => `Đã bỏ phòng của ${data.affected} người.`);
      return;
    }

    if (action === 'delete') {
      if (!confirm(`Xóa ${selected.size} thành viên đã chọn? Điểm quiz của họ cũng bị xóa. Không thể hoàn tác.`)) return;
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

    A.setMsg(addMemberMsg, `Đã thêm "${data.member.name}".`, 'ok');
    newMemberName.value = '';
    loadAll();
  });

  // Moi dong: "Ten" hoac "Ten, Nam" / "Ten, Nu" (chap nhan ca dau phay va tab)
  function parseImportLines(text) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        const name = parts[0];
        const rawGender = (parts[1] || '').toLowerCase();
        let gender = '';
        if (['nam', 'male', 'm', 'nam.'].includes(rawGender)) gender = 'MALE';
        else if (['nữ', 'nu', 'female', 'f'].includes(rawGender)) gender = 'FEMALE';
        return { name, gender };
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
    A.setMsg(importMsg, parts.join(' '), data.skipped.length ? 'err' : 'ok');
    if (data.created.length) importText.value = '';
    loadAll();
  });

  /* ---------- xuat CSV ---------- */

  exportBtn.addEventListener('click', () => {
    const rows = [['STT', 'Họ tên', 'Giới tính', 'Nhóm', 'Phòng ngủ', 'Nhóm trưởng', 'Điểm quiz']];
    visibleMembers().forEach((m, i) => {
      rows.push([
        i + 1,
        m.name,
        A.genderLabel(m.gender),
        m.group ? m.group.name : '',
        m.room ? m.room.name : '',
        m.isLeader ? 'x' : '',
        m.quizScore,
      ]);
    });
    A.downloadCsv('danh-sach-thanh-vien.csv', rows);
    A.setMsg(memberMsg, `Đã xuất ${rows.length - 1} dòng ra file CSV.`, 'ok');
  });

  /* ---------- realtime ---------- */

  if (A.socket) {
    const refreshIfVisible = () => {
      if (A.activeTab() === 'members') loadAll();
    };
    A.socket.on('members:updated', refreshIfVisible);
    A.socket.on('rooms:updated', refreshIfVisible);
    A.socket.on('groups:updated', refreshIfVisible);
    A.socket.on('groups:reset', refreshIfVisible);
    A.socket.on('member:room-randomized', refreshIfVisible);
    A.socket.on('member:randomized', refreshIfVisible);
  }

  A.onSecretChange(() => {
    if (A.activeTab() === 'members') loadAll();
  });

  A.onTab('members', loadAll);
})();
