// Tab "Thanh vien": them/sua/xoa nguoi, dat gioi tinh, xep nhom va xep phong tay.
(function () {
  const A = window.AdminCommon;

  const memberStats = document.getElementById('memberStats');
  const memberTableBody = document.getElementById('memberTableBody');
  const memberFilter = document.getElementById('memberFilter');
  const memberMsg = document.getElementById('memberMsg');

  const newMemberName = document.getElementById('newMemberName');
  const newMemberGender = document.getElementById('newMemberGender');
  const newMemberGroup = document.getElementById('newMemberGroup');
  const addMemberBtn = document.getElementById('addMemberBtn');
  const addMemberMsg = document.getElementById('addMemberMsg');

  let members = [];
  let groups = [];
  let rooms = [];

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
          sub: 'Chọn Nam/Nữ ở bảng dưới',
          variant: 'warn',
        })
      );
    }
    memberStats.innerHTML = tiles.join('');
  }

  function groupOptions(selectedId) {
    return (
      '<option value="">-- Chưa có nhóm --</option>' +
      groups
        .map(
          (g) =>
            `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${A.escapeHtml(g.name)}</option>`
        )
        .join('')
    );
  }

  function roomOptions(member) {
    if (!member.gender) {
      return '<option value="">-- Cần đặt giới tính --</option>';
    }

    const matching = rooms.filter((r) => r.gender === member.gender);
    return (
      '<option value="">-- Chưa có phòng --</option>' +
      matching
        .map((r) => {
          const isCurrent = r.id === member.roomId;
          const isFull = r.occupancy >= r.capacity && !isCurrent;
          return `<option value="${r.id}" ${isCurrent ? 'selected' : ''} ${isFull ? 'disabled' : ''}>${A.escapeHtml(r.name)} (${r.occupancy}/${r.capacity})${isFull ? ' - đã kín' : ''}</option>`;
        })
        .join('')
    );
  }

  function rowHtml(member) {
    return `
      <tr data-member-id="${member.id}">
        <td class="admin-cell-name">
          <input type="text" data-field="name" value="${A.escapeHtml(member.name)}" />
        </td>
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
        <td class="admin-cell-muted">${member.quizScore} điểm${member._count && member._count.answers ? ` · ${member._count.answers} câu` : ''}</td>
        <td class="admin-cell-actions">
          <button type="button" class="admin-row-btn danger" data-action="delete-member">🗑️</button>
        </td>
      </tr>`;
  }

  function render() {
    if (memberTableBody.contains(document.activeElement)) return;

    renderStats();

    const keyword = memberFilter.value.trim().toLowerCase();
    const visible = keyword ? members.filter((m) => m.name.toLowerCase().includes(keyword)) : members;

    memberTableBody.innerHTML = visible.length
      ? visible.map(rowHtml).join('')
      : `<tr><td colspan="7" class="admin-empty">${members.length ? 'Không có ai khớp từ khóa' : 'Chưa có thành viên nào'}</td></tr>`;
  }

  async function loadAll() {
    try {
      const [memberData, groupRes, roomRes] = await Promise.all([
        A.request('GET', '/api/admin/members'),
        fetch('/api/groups').then((r) => r.json()),
        fetch('/api/rooms').then((r) => r.json()),
      ]);
      members = memberData;
      groups = groupRes;
      rooms = roomRes.rooms || [];

      newMemberGroup.innerHTML = groupOptions(null);
      render();
      A.setMsg(memberMsg, '');
    } catch (err) {
      memberTableBody.innerHTML = `<tr><td colspan="7" class="admin-empty">${A.escapeHtml(err.message)}</td></tr>`;
      A.setMsg(memberMsg, err.message, 'err');
    }
  }

  memberFilter.addEventListener('input', render);

  memberTableBody.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!memberTableBody.contains(document.activeElement)) render();
    }, 0);
  });

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

  memberTableBody.addEventListener('change', async (e) => {
    const field = e.target.dataset.field;
    if (!field) return;

    const row = e.target.closest('tr');
    const memberId = Number(row.dataset.memberId);
    const value = field === 'isLeader' ? e.target.checked : e.target.value;

    const data = await A.run(null, memberMsg, 'Đang lưu...', () =>
      A.request('PUT', `/api/admin/members/${memberId}`, { [field]: value })
    );
    if (!data) {
      loadAll(); // server tu choi -> tai lai gia tri that
      return;
    }

    const extra = data.movedOutOfRoom ? ' (đã đưa ra khỏi phòng cũ vì khác giới tính)' : '';
    A.setMsg(memberMsg, `Đã cập nhật ${data.member.name}.${extra}`, 'ok');
    loadAll();
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

    A.setMsg(memberMsg, `Đã xóa "${data.name}".`, 'ok');
    loadAll();
  });

  if (A.socket) {
    const refreshIfVisible = () => {
      if (A.activeTab() === 'members') loadAll();
    };
    A.socket.on('members:updated', refreshIfVisible);
    A.socket.on('rooms:updated', refreshIfVisible);
    A.socket.on('groups:reset', refreshIfVisible);
    A.socket.on('member:room-randomized', refreshIfVisible);
  }

  A.onTab('members', loadAll);
})();
