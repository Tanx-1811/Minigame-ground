// Tab "Nhom": them/sua/xoa nhom dung cho vong random chia nhom.
(function () {
  const A = window.AdminCommon;

  const groupTableBody = document.getElementById('groupTableBody');
  const groupMsg = document.getElementById('groupMsg');
  const newGroupName = document.getElementById('newGroupName');
  const newGroupDesc = document.getElementById('newGroupDesc');
  const addGroupBtn = document.getElementById('addGroupBtn');
  const addGroupMsg = document.getElementById('addGroupMsg');

  let groups = [];

  function render() {
    if (groupTableBody.contains(document.activeElement)) return;

    groupTableBody.innerHTML = groups.length
      ? groups
          .map(
            (group) => `
            <tr data-group-id="${group.id}">
              <td class="admin-cell-name"><input type="text" data-field="name" value="${A.escapeHtml(group.name)}" /></td>
              <td><input type="text" data-field="description" value="${A.escapeHtml(group.description || '')}" placeholder="Không có" /></td>
              <td style="white-space:nowrap;">${(group.members || []).length} người</td>
              <td class="admin-cell-actions">
                <button type="button" class="admin-row-btn danger" data-action="delete-group">🗑️</button>
              </td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="4" class="admin-empty">Chưa có nhóm nào</td></tr>';
  }

  async function loadGroups() {
    try {
      const res = await fetch('/api/groups');
      groups = await res.json();
      render();
    } catch (err) {
      A.setMsg(groupMsg, 'Không thể tải danh sách nhóm', 'err');
    }
  }

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
    if (e.target.dataset.action !== 'delete-group') return;

    const row = e.target.closest('tr');
    const groupId = Number(row.dataset.groupId);
    const name = row.querySelector('[data-field="name"]').value;

    if (!confirm(`Xóa nhóm "${name}"? Thành viên trong nhóm sẽ trở về trạng thái chưa random (không ai bị xóa).`)) return;

    const data = await A.run(null, groupMsg, 'Đang xóa nhóm...', () =>
      A.request('DELETE', `/api/admin/groups/${groupId}`)
    );
    if (!data) return;

    A.setMsg(
      groupMsg,
      data.releasedMembers ? `Đã xóa nhóm và bỏ random của ${data.releasedMembers} người.` : 'Đã xóa nhóm.',
      'ok'
    );
    loadGroups();
  });

  if (A.socket) {
    const refreshIfVisible = () => {
      if (A.activeTab() === 'groups') loadGroups();
    };
    A.socket.on('groups:updated', refreshIfVisible);
    A.socket.on('groups:reset', refreshIfVisible);
    A.socket.on('member:randomized', refreshIfVisible);
  }

  A.onTab('groups', loadGroups);
})();
