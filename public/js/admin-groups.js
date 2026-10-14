// Tab "Nhom": them/sua/xoa nhom, xem va go thanh vien khoi nhom, xoa nhieu
// nhom cung luc, xuat CSV. Chua nhap ma bi mat van xem duoc danh sach.
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="groups"]');
  const groupTableBody = document.getElementById('groupTableBody');
  const groupMsg = document.getElementById('groupMsg');
  const lockNote = document.getElementById('groupLockNote');

  const selectAll = document.getElementById('groupSelectAll');
  const bulkBar = document.getElementById('groupBulkBar');
  const bulkCount = document.getElementById('groupBulkCount');

  const newGroupName = document.getElementById('newGroupName');
  const newGroupDesc = document.getElementById('newGroupDesc');
  const addGroupBtn = document.getElementById('addGroupBtn');
  const addGroupMsg = document.getElementById('addGroupMsg');
  const exportBtn = document.getElementById('groupExportBtn');

  let groups = [];
  let sortKey = 'name';
  let sortDir = 'asc';
  const selected = new Set();

  function memberCount(group) {
    return (group.members || []).length;
  }

  function sortedGroups() {
    const list = [...groups];
    list.sort((a, b) => {
      const cmp =
        sortKey === 'count' ? memberCount(a) - memberCount(b) : String(a.name).localeCompare(String(b.name), 'vi');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }

  function memberChips(group) {
    const list = group.members || [];
    if (!list.length) return '<span class="admin-member-chips-empty">Chưa có ai</span>';

    return `<div class="admin-member-chips">${list
      .map(
        (m) => `
        <span class="admin-member-chip">
          ${m.isLeader ? '👑 ' : ''}${A.escapeHtml(m.name)}
          <button type="button" data-action="remove-member" data-member-id="${m.id}" title="Đưa ra khỏi nhóm">✕</button>
        </span>`
      )
      .join('')}</div>`;
  }

  function rowHtml(group) {
    return `
      <tr data-group-id="${group.id}" class="${selected.has(group.id) ? 'is-selected' : ''}">
        <td class="admin-cell-check">
          <input type="checkbox" data-select="${group.id}" ${selected.has(group.id) ? 'checked' : ''} data-always-enabled="1" />
        </td>
        <td class="admin-cell-name"><input type="text" data-field="name" value="${A.escapeHtml(group.name)}" /></td>
        <td><input type="text" data-field="description" value="${A.escapeHtml(group.description || '')}" placeholder="Không có" /></td>
        <td class="admin-cell-muted">${memberCount(group)} người</td>
        <td>${memberChips(group)}</td>
        <td class="admin-cell-actions">
          <button type="button" class="admin-row-btn danger" data-action="delete-group">🗑️</button>
        </td>
      </tr>`;
  }

  function renderBulkBar() {
    bulkBar.hidden = selected.size === 0;
    bulkCount.textContent = `Đã chọn ${selected.size} nhóm`;
  }

  function syncSortHeaders() {
    panel.querySelectorAll('th[data-sort]').forEach((th) => {
      th.classList.toggle('is-asc', th.dataset.sort === sortKey && sortDir === 'asc');
      th.classList.toggle('is-desc', th.dataset.sort === sortKey && sortDir === 'desc');
    });
  }

  function render() {
    if (groupTableBody.contains(document.activeElement)) return;

    renderBulkBar();
    syncSortHeaders();

    const list = sortedGroups();
    groupTableBody.innerHTML = list.length
      ? list.map(rowHtml).join('')
      : '<tr><td colspan="6" class="admin-empty">Chưa có nhóm nào</td></tr>';

    selectAll.checked = list.length > 0 && list.every((g) => selected.has(g.id));
    A.applyEditLock(panel, lockNote);
  }

  async function loadGroups() {
    try {
      groups = await fetch('/api/groups').then((r) => r.json());

      const ids = new Set(groups.map((g) => g.id));
      [...selected].forEach((id) => {
        if (!ids.has(id)) selected.delete(id);
      });

      render();
      A.setMsg(groupMsg, '');
    } catch (err) {
      A.setMsg(groupMsg, 'Không thể tải danh sách nhóm', 'err');
    }
  }

  panel.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      if (sortKey === th.dataset.sort) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else {
        sortKey = th.dataset.sort;
        sortDir = 'asc';
      }
      render();
    });
  });

  selectAll.addEventListener('change', () => {
    if (selectAll.checked) groups.forEach((g) => selected.add(g.id));
    else selected.clear();
    render();
  });

  groupTableBody.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!groupTableBody.contains(document.activeElement)) render();
    }, 0);
  });

  addGroupBtn.addEventListener('click', async () => {
    const data = await A.run(addGroupBtn, addGroupMsg, 'Đang thêm nhóm...', () =>
      A.request('POST', '/api/admin/groups', { name: newGroupName.value, description: newGroupDesc.value })
    );
    if (!data) return;

    A.setMsg(addGroupMsg, `Đã thêm nhóm "${data.group.name}".`, 'ok');
    newGroupName.value = '';
    newGroupDesc.value = '';
    loadGroups();
  });

  groupTableBody.addEventListener('change', async (e) => {
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

    const groupId = Number(e.target.closest('tr').dataset.groupId);
    const data = await A.run(null, groupMsg, 'Đang lưu...', () =>
      A.request('PUT', `/api/admin/groups/${groupId}`, { [field]: e.target.value })
    );
    if (!data) {
      loadGroups();
      return;
    }

    A.setMsg(groupMsg, `Đã cập nhật nhóm "${data.group.name}".`, 'ok');
    loadGroups();
  });

  groupTableBody.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const row = e.target.closest('tr');
    const groupId = Number(row.dataset.groupId);

    if (action === 'remove-member') {
      const memberId = Number(e.target.dataset.memberId);
      const data = await A.run(null, groupMsg, 'Đang đưa ra khỏi nhóm...', () =>
        A.request('PUT', `/api/admin/members/${memberId}`, { groupId: null })
      );
      if (!data) return;
      A.setMsg(groupMsg, `Đã đưa ${data.member.name} ra khỏi nhóm.`, 'ok');
      loadGroups();
      return;
    }

    if (action === 'delete-group') {
      const name = row.querySelector('[data-field="name"]').value;
      if (!confirm(`Xóa nhóm "${name}"? Thành viên trong nhóm sẽ trở về trạng thái chưa random (không ai bị xóa).`)) return;

      const data = await A.run(null, groupMsg, 'Đang xóa nhóm...', () =>
        A.request('DELETE', `/api/admin/groups/${groupId}`)
      );
      if (!data) return;

      selected.delete(groupId);
      A.setMsg(
        groupMsg,
        data.releasedMembers ? `Đã xóa nhóm và bỏ random của ${data.releasedMembers} người.` : 'Đã xóa nhóm.',
        'ok'
      );
      loadGroups();
    }
  });

  bulkBar.addEventListener('click', async (e) => {
    const action = e.target.dataset.bulk;
    if (!action) return;

    if (action === 'clear-selection') {
      selected.clear();
      render();
      return;
    }

    if (action === 'delete') {
      if (!selected.size) {
        A.setMsg(groupMsg, 'Chưa chọn nhóm nào', 'err');
        return;
      }
      if (!confirm(`Xóa ${selected.size} nhóm đã chọn? Thành viên trong các nhóm đó sẽ trở về trạng thái chưa random.`)) {
        return;
      }

      const data = await A.run(null, groupMsg, 'Đang xóa...', () =>
        A.request('POST', '/api/admin/groups/bulk', { ids: [...selected], action: 'delete' })
      );
      if (!data) return;

      selected.clear();
      A.setMsg(
        groupMsg,
        `Đã xóa ${data.affected} nhóm${data.releasedMembers ? ` và bỏ random của ${data.releasedMembers} người` : ''}.`,
        'ok'
      );
      loadGroups();
    }
  });

  exportBtn.addEventListener('click', () => {
    const rows = [['Nhóm', 'Slogan', 'Số người', 'Thành viên']];
    sortedGroups().forEach((g) => {
      rows.push([
        g.name,
        g.description || '',
        memberCount(g),
        (g.members || []).map((m) => m.name).join(' | '),
      ]);
    });
    A.downloadCsv('danh-sach-nhom.csv', rows);
    A.setMsg(groupMsg, `Đã xuất ${rows.length - 1} nhóm ra file CSV.`, 'ok');
  });

  if (A.socket) {
    const refreshIfVisible = () => {
      if (A.activeTab() === 'groups') loadGroups();
    };
    A.socket.on('groups:updated', refreshIfVisible);
    A.socket.on('groups:reset', refreshIfVisible);
    A.socket.on('members:updated', refreshIfVisible);
    A.socket.on('member:randomized', refreshIfVisible);
  }

  A.onSecretChange(() => {
    if (A.activeTab() === 'groups') loadGroups();
  });

  A.onTab('groups', loadGroups);
})();
