// Tab "Chia nhom": moi nhom la 1 the - doi ten/slogan/mau/gioi han, khoa nhom,
// keo nguoi ra, va cac nut chia nhom hang loat thay cho viec tung nguoi tu bam.
//
// Khoa nhom = nhom do khong nhan them ai khi random, nhung nguoi dang o trong van giu nguyen.
// Gioi han so nguoi de trong = khong gioi han (van chia deu giua cac nhom).
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="groups"]');
  const statsBox = document.getElementById('groupStats');
  const grid = document.getElementById('groupGrid');
  const filterInput = document.getElementById('groupFilter');
  const groupMsg = document.getElementById('groupMsg');
  const lockNote = document.getElementById('groupLockNote');
  const actionMsg = document.getElementById('groupActionMsg');

  const randomAllBtn = document.getElementById('groupRandomAllBtn');
  const reshuffleBtn = document.getElementById('groupReshuffleBtn');
  const lockRoundBtn = document.getElementById('groupLockRoundBtn');
  const resetBtn = document.getElementById('groupResetBtn');
  const keepPinned = document.getElementById('groupKeepPinned');

  const newName = document.getElementById('newGroupName');
  const newDesc = document.getElementById('newGroupDesc');
  const newCapacity = document.getElementById('newGroupCapacity');
  const newColor = document.getElementById('newGroupColor');
  const addBtn = document.getElementById('addGroupBtn');
  const addMsg = document.getElementById('addGroupMsg');
  const exportBtn = document.getElementById('groupExportBtn');

  let groups = [];
  let stats = null;
  let randomLocked = false;
  const expanded = new Set();

  /* ---------- hien thi ---------- */

  function renderStats() {
    if (!stats) {
      statsBox.innerHTML = '';
      return;
    }

    statsBox.innerHTML = [
      A.statTile({
        icon: 'user-round-check',
        label: 'Đã có nhóm',
        value: `${stats.assigned}/${stats.eligible}`,
        variant: stats.pending ? 'warn' : 'ok',
        meter: { value: stats.assigned, total: stats.eligible, variant: stats.pending ? 'warn' : 'ok' },
      }),
      A.statTile({ icon: 'users-round', label: 'Số nhóm', value: stats.totalGroups, variant: 'accent' }),
      A.statTile({
        icon: 'hourglass',
        label: 'Chưa chia',
        value: stats.pending,
        variant: stats.pending ? 'warn' : '',
      }),
      stats.excluded
        ? A.statTile({
            icon: 'user-round-x',
            label: 'Không tham gia',
            value: stats.excluded,
            sub: 'Đã tắt quyền chia nhóm',
            variant: 'danger',
          })
        : '',
      stats.lockedGroups ? A.statTile({ icon: 'lock', label: 'Nhóm đang khóa', value: stats.lockedGroups, variant: 'warn' }) : '',
    ]
      .filter(Boolean)
      .join('');

    A.setBadge('groups', stats.totalGroups);
  }

  function visibleGroups() {
    const keyword = filterInput.value.trim().toLowerCase();
    if (!keyword) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(keyword) ||
        (g.description || '').toLowerCase().includes(keyword) ||
        g.members.some((m) => m.name.toLowerCase().includes(keyword))
    );
  }

  function memberChip(member) {
    return `
      <span class="admin-member-chip ${member.isLeader ? 'is-leader' : ''}">
        ${member.isLeader ? A.icon('crown', 'ic-sm') : A.icon(A.genderIcon(member.gender), 'ic-sm')}
        <span>${A.escapeHtml(member.name)}</span>
        ${member.pinnedGroup ? A.icon('pin', 'ic-sm') : ''}
        <button type="button" data-action="remove-member" data-member-id="${member.id}" title="Đưa ra khỏi nhóm">
          ${A.icon('x', 'ic-sm')}
        </button>
      </span>`;
  }

  function cardHtml(group) {
    const color = group.color || 'var(--accent)';
    const limit = group.effectiveCapacity;
    const countText = limit ? `${group.occupancy}/${limit}` : `${group.occupancy}`;
    const isOpen = expanded.has(group.id);

    const tags = [
      group.locked ? `<span class="admin-tag is-locked">${A.icon('lock', 'ic-sm')} Đang khóa</span>` : '',
      limit && group.isFull ? `<span class="admin-tag">${A.icon('check', 'ic-sm')} Đã đầy</span>` : '',
      group.capacity ? `<span class="admin-tag">${A.icon('user-round-check', 'ic-sm')} Giới hạn riêng ${group.capacity}</span>` : '',
    ]
      .filter(Boolean)
      .join('');

    return `
      <div class="admin-group-card ${group.locked ? 'is-locked' : ''}" data-group-id="${group.id}" style="--g-color:${A.escapeHtml(
        color
      )}">
        <div class="admin-group-head">
          <div class="admin-group-title">
            <strong>${A.escapeHtml(group.name)}</strong>
            ${group.description ? `<p>${A.escapeHtml(group.description)}</p>` : ''}
          </div>
          <span class="admin-room-count">${countText}</span>
        </div>

        <div class="admin-group-body">
          ${tags ? `<div class="row-tight" style="flex-wrap:wrap;gap:5px">${tags}</div>` : ''}
          ${
            group.members.length
              ? `<div class="admin-member-chips">${group.members.map(memberChip).join('')}</div>`
              : '<p class="admin-member-chips-empty">Chưa có ai trong nhóm này</p>'
          }
        </div>

        <div class="admin-group-foot">
          <button type="button" class="admin-row-btn" data-action="toggle-edit">${A.icon('pencil')} Sửa nhóm</button>
          <button type="button" class="admin-row-btn ${group.locked ? 'is-on' : ''}" data-action="toggle-lock">
            ${A.icon(group.locked ? 'lock-open' : 'lock')} ${group.locked ? 'Mở khóa' : 'Khóa'}
          </button>
          <button type="button" class="admin-row-btn" data-action="clear-members">${A.icon('user-round-minus')} Bỏ hết người</button>
        </div>

        <div class="admin-group-edit" ${isOpen ? '' : 'hidden'}>
          <div class="admin-form-grid is-tight">
            <div class="admin-field">
              <label>Tên nhóm</label>
              <input type="text" data-edit="name" value="${A.escapeHtml(group.name)}" />
            </div>
            <div class="admin-field">
              <label>Slogan / mô tả</label>
              <input type="text" data-edit="description" value="${A.escapeHtml(group.description || '')}" />
            </div>
            <div class="admin-field">
              <label>Giới hạn số người</label>
              <input type="number" min="1" max="500" data-edit="capacity" value="${group.capacity || ''}" placeholder="Trống = không giới hạn" />
            </div>
            <div class="admin-field">
              <label>Màu nhận diện</label>
              <input type="color" data-edit="color" value="${A.escapeHtml(group.color || '#4f46e5')}" />
            </div>
          </div>
          <div class="admin-btn-row">
            <button type="button" class="admin-row-btn" data-action="save">${A.icon('save')} Lưu nhóm</button>
            <button type="button" class="admin-row-btn" data-action="clear-color">${A.icon('paint-bucket')} Dùng màu mặc định</button>
            <button type="button" class="admin-row-btn danger" data-action="delete">${A.icon('trash-2')} Xóa nhóm</button>
          </div>
        </div>
      </div>`;
  }

  function syncLockRoundBtn() {
    lockRoundBtn.innerHTML = `${A.icon(randomLocked ? 'lock-open' : 'lock')} ${
      randomLocked ? 'Mở vòng chia nhóm' : 'Khóa vòng chia nhóm'
    }`;
    lockRoundBtn.classList.toggle('admin-btn-danger', !randomLocked);
    lockRoundBtn.classList.toggle('admin-btn-secondary', randomLocked);
  }

  function render() {
    if (grid.contains(document.activeElement)) return;

    renderStats();
    syncLockRoundBtn();

    const list = visibleGroups();
    grid.innerHTML = list.length
      ? list.map(cardHtml).join('')
      : `<div class="admin-empty-rich">${A.icon(groups.length ? 'search-x' : 'folder-plus')}
          <strong>${groups.length ? 'Không có nhóm nào khớp từ khóa' : 'Chưa có nhóm nào'}</strong>
          <p>${
            groups.length
              ? 'Thử xóa bớt từ khóa tìm kiếm.'
              : 'Thêm ít nhất một nhóm ở khối phía trên để vòng chia nhóm hoạt động.'
          }</p></div>`;

    A.applyEditLock(panel, lockNote);
  }

  /* ---------- tai du lieu ---------- */

  async function load() {
    try {
      const [groupRes, config] = await Promise.all([
        fetch('/api/groups/full').then((r) => r.json()),
        fetch('/api/config').then((r) => r.json()),
      ]);
      groups = groupRes.groups || [];
      stats = groupRes.stats || null;
      randomLocked = !!config.randomLocked;

      render();
      A.setMsg(groupMsg, '');
    } catch (err) {
      A.setMsg(groupMsg, err.message, 'err');
    }
  }

  /* ---------- thao tac tren tung the ---------- */

  filterInput.addEventListener('input', render);

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const card = btn.closest('.admin-group-card');
    const groupId = Number(card.dataset.groupId);
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    const action = btn.dataset.action;

    if (action === 'toggle-edit') {
      const box = card.querySelector('.admin-group-edit');
      box.hidden = !box.hidden;
      if (box.hidden) expanded.delete(groupId);
      else expanded.add(groupId);
      return;
    }

    if (action === 'remove-member') {
      const memberId = Number(btn.dataset.memberId);
      const data = await A.run(null, groupMsg, 'Đang cập nhật...', () =>
        A.request('POST', '/api/admin/groups/move', { memberId, groupId: '' })
      );
      if (!data) return;
      A.setMsg(groupMsg, 'Đã đưa ra khỏi nhóm.', 'ok');
      load();
      return;
    }

    if (action === 'toggle-lock') {
      const data = await A.run(btn, groupMsg, 'Đang cập nhật...', () =>
        A.request('PUT', `/api/admin/groups/${groupId}`, { locked: !group.locked })
      );
      if (!data) return;
      A.done(groupMsg, group.locked ? `Đã mở khóa "${group.name}".` : `Đã khóa "${group.name}".`);
      load();
      return;
    }

    if (action === 'clear-members') {
      if (!group.members.length) {
        A.setMsg(groupMsg, 'Nhóm này đang trống', 'warn');
        return;
      }
      const ok = await A.confirmAction({
        title: 'Bỏ hết người khỏi nhóm',
        message: `Đưa <strong>${group.members.length} người</strong> ra khỏi "${A.escapeHtml(
          group.name
        )}"?<br />Người đã ghim vẫn được giữ lại. Không ai bị xóa khỏi hệ thống.`,
        okText: 'Bỏ hết người',
      });
      if (!ok) return;

      const data = await A.run(btn, groupMsg, 'Đang cập nhật...', () =>
        A.request('POST', '/api/admin/groups/bulk', { ids: [groupId], action: 'clear' })
      );
      if (!data) return;
      A.done(groupMsg, `Đã đưa ${data.affected} người ra khỏi nhóm.`);
      load();
      return;
    }

    if (action === 'clear-color') {
      const data = await A.run(btn, groupMsg, 'Đang cập nhật...', () =>
        A.request('PUT', `/api/admin/groups/${groupId}`, { color: '' })
      );
      if (!data) return;
      A.done(groupMsg, 'Đã trả về màu mặc định.');
      load();
      return;
    }

    if (action === 'save') {
      const read = (field) => card.querySelector(`[data-edit="${field}"]`).value;
      const data = await A.run(btn, groupMsg, 'Đang lưu...', () =>
        A.request('PUT', `/api/admin/groups/${groupId}`, {
          name: read('name'),
          description: read('description'),
          capacity: read('capacity'),
          color: read('color'),
        })
      );
      if (!data) return;
      A.done(groupMsg, `Đã lưu "${data.group.name}".`);
      load();
      return;
    }

    if (action === 'delete') {
      const ok = await A.confirmAction({
        title: 'Xóa nhóm',
        message: `Xóa nhóm <strong>${A.escapeHtml(group.name)}</strong>?<br />${
          group.members.length
            ? `${group.members.length} người trong nhóm sẽ quay về trạng thái chưa chia nhóm.`
            : 'Nhóm này đang trống.'
        }`,
        okText: 'Xóa nhóm',
      });
      if (!ok) return;

      const data = await A.run(btn, groupMsg, 'Đang xóa...', () => A.request('DELETE', `/api/admin/groups/${groupId}`));
      if (!data) return;
      expanded.delete(groupId);
      A.done(groupMsg, `Đã xóa nhóm (${data.releasedMembers} người quay về chưa chia).`);
      load();
    }
  });

  /* ---------- them nhom ---------- */

  addBtn.addEventListener('click', async () => {
    const data = await A.run(addBtn, addMsg, 'Đang thêm...', () =>
      A.request('POST', '/api/admin/groups', {
        name: newName.value,
        description: newDesc.value,
        capacity: newCapacity.value,
        color: newColor.value,
      })
    );
    if (!data) return;

    A.done(addMsg, `Đã thêm nhóm "${data.group.name}".`);
    newName.value = '';
    newDesc.value = '';
    newCapacity.value = '';
    load();
  });

  /* ---------- chia nhom hang loat ---------- */

  randomAllBtn.addEventListener('click', async () => {
    const data = await A.run(randomAllBtn, actionMsg, 'Đang chia nhóm...', () =>
      A.request('POST', '/api/admin/groups/random-all', {})
    );
    if (!data) return;
    reportAssign(data, 'Đã chia nhóm');
    load();
  });

  reshuffleBtn.addEventListener('click', async () => {
    const ok = await A.confirmAction({
      title: 'Xáo lại toàn bộ',
      message: `Bốc tất cả mọi người ra rồi chia lại từ đầu?<br />${
        keepPinned.checked ? 'Người đã ghim vẫn giữ nguyên nhóm.' : '<strong>Kể cả người đã ghim</strong> cũng bị xáo lại.'
      }`,
      okText: 'Xáo lại',
    });
    if (!ok) return;

    const data = await A.run(reshuffleBtn, actionMsg, 'Đang xáo lại...', () =>
      A.request('POST', '/api/admin/groups/random-all', { reshuffle: true })
    );
    if (!data) return;
    reportAssign(data, 'Đã xáo lại');
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

  lockRoundBtn.addEventListener('click', async () => {
    const data = await A.run(lockRoundBtn, actionMsg, 'Đang cập nhật...', () =>
      A.request('POST', '/api/admin/settings/lock', { locked: !randomLocked })
    );
    if (!data) return;
    randomLocked = data.locked;
    A.done(actionMsg, randomLocked ? 'Đã khóa vòng chia nhóm.' : 'Đã mở vòng chia nhóm.');
    render();
  });

  resetBtn.addEventListener('click', async () => {
    const ok = await A.confirmAction({
      title: 'Xóa kết quả chia nhóm',
      message: `Đưa tất cả mọi người về trạng thái chưa chia nhóm?<br />${
        keepPinned.checked ? 'Người đã ghim vẫn giữ nguyên nhóm.' : 'Kể cả người đã ghim.'
      } Danh sách nhóm vẫn được giữ.`,
      okText: 'Xóa kết quả',
    });
    if (!ok) return;

    const data = await A.run(resetBtn, actionMsg, 'Đang reset...', () =>
      A.request('POST', '/api/admin/groups/reset', { keepPinned: keepPinned.checked })
    );
    if (!data) return;
    A.done(actionMsg, `Đã xóa kết quả chia nhóm của ${data.cleared} người.`);
    load();
  });

  /* ---------- xuat CSV ---------- */

  exportBtn.addEventListener('click', () => {
    const rows = [['Nhóm', 'Slogan', 'Giới hạn', 'Số người', 'Trạng thái', 'Thành viên']];
    visibleGroups().forEach((g) => {
      rows.push([
        g.name,
        g.description || '',
        g.effectiveCapacity || 'Không giới hạn',
        g.occupancy,
        g.locked ? 'Đang khóa' : 'Đang mở',
        g.members.map((m) => `${m.name}${m.isLeader ? ' (NT)' : ''}`).join(' | '),
      ]);
    });
    A.downloadCsv('danh-sach-nhom.csv', rows);
    A.done(groupMsg, `Đã xuất ${rows.length - 1} nhóm ra file CSV.`);
  });

  /* ---------- realtime ---------- */

  if (A.socket) {
    const refreshIfVisible = () => {
      if (A.activeTab() === 'groups') load();
    };
    ['groups:updated', 'groups:reset', 'members:updated', 'member:randomized', 'groups:bulk-randomized',
      'random:config'].forEach((evt) => A.socket.on(evt, refreshIfVisible));
  }

  A.onSecretChange(() => {
    if (A.activeTab() === 'groups') load();
  });

  A.onTab('groups', load);
})();
