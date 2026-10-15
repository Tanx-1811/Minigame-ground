// Tab "Chia nhom": moi nhom la 1 the - doi ten/slogan/mau/gioi han, khoa nhom,
// keo nguoi ra, va cac nut chia nhom hang loat thay cho viec tung nguoi tu bam.
//
// Khoa nhom = nhom do khong nhan them ai khi random, nhung nguoi dang o trong van giu nguyen.
// Gioi han so nguoi de trong = khong gioi han (van chia deu giua cac nhom).
//
// Mau nhom: nhom chua chon mau (color = null) dung mau chu dao cua trang. Chi
// gui mau len khi admin THUC SU cham vao o chon mau - truoc day bam "Luu nhom"
// la nhom nao cung bi gan cung mau #4f46e5.
(function () {
  const A = window.AdminCommon;

  const DEFAULT_SWATCH = '#4f46e5';

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
  const newColorReset = document.getElementById('newGroupColorReset');
  const newColorNote = document.getElementById('newGroupColorNote');
  const addBtn = document.getElementById('addGroupBtn');
  const addMsg = document.getElementById('addGroupMsg');
  const exportBtn = document.getElementById('groupExportBtn');

  let groups = [];
  let stats = null;
  let randomLocked = false;
  let loaded = false;
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
      A.statTile({
        icon: 'user-round-x',
        label: 'Không tham gia',
        value: stats.excluded,
        sub: 'Đã tắt quyền chia nhóm',
        variant: stats.excluded ? 'danger' : '',
      }),
      A.statTile({
        icon: stats.lockedGroups ? 'lock' : 'lock-open',
        label: 'Nhóm đang khóa',
        value: stats.lockedGroups,
        sub: randomLocked ? 'Cả vòng chia nhóm đang khóa' : 'Vòng chia nhóm đang mở',
        variant: stats.lockedGroups || randomLocked ? 'warn' : '',
      }),
    ].join('');

    A.setBadge('groups', stats.totalGroups);
  }

  function visibleGroups() {
    const keyword = filterInput.value.trim().toLowerCase();
    if (!keyword) return groups;
    const busy = new Set(
      [...grid.querySelectorAll('.admin-group-card.is-dirty')].map((c) => Number(c.dataset.groupId))
    );
    return groups.filter(
      (g) =>
        busy.has(g.id) ||
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
        ${member.pinnedGroup ? `<span class="admin-chip-pin" title="Đã ghim">${A.icon('pin', 'ic-sm')}</span>` : ''}
        <button type="button" data-action="remove-member" data-member-id="${member.id}" title="Đưa ra khỏi nhóm"
          aria-label="Đưa ${A.escapeHtml(member.name)} ra khỏi nhóm">
          ${A.icon('x', 'ic-sm')}
        </button>
      </span>`;
  }

  function cardHtml(group) {
    const color = group.color || 'var(--accent)';
    const limit = group.effectiveCapacity;
    const countText = limit ? `${group.occupancy}/${limit}` : `${group.occupancy}`;
    const isOpen = expanded.has(group.id);
    const scope = `g${group.id}`;

    const tags = [
      group.locked ? `<span class="admin-tag is-locked">${A.icon('lock', 'ic-sm')} Đang khóa</span>` : '',
      limit && group.isFull ? `<span class="admin-tag is-ok">${A.icon('check', 'ic-sm')} Đã đầy</span>` : '',
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
          <span class="admin-room-count" title="Số người${limit ? ' / giới hạn' : ''}">${countText}</span>
        </div>

        <div class="admin-group-body">
          ${tags ? `<div class="admin-tag-row">${tags}</div>` : ''}
          ${
            group.members.length
              ? `<div class="admin-member-chips">${group.members.map(memberChip).join('')}</div>`
              : '<p class="admin-member-chips-empty">Chưa có ai trong nhóm này</p>'
          }
        </div>

        <div class="admin-group-foot">
          <button type="button" class="admin-row-btn" data-action="toggle-edit" aria-expanded="${isOpen}"
            aria-controls="${scope}-edit">${A.icon('pencil')} Sửa nhóm</button>
          <button type="button" class="admin-row-btn ${group.locked ? 'is-on' : ''}" data-action="toggle-lock"
            aria-pressed="${group.locked}">
            ${A.icon(group.locked ? 'lock-open' : 'lock')} ${group.locked ? 'Mở khóa' : 'Khóa'}
          </button>
          <button type="button" class="admin-row-btn" data-action="clear-members">${A.icon('user-round-minus')} Bỏ hết người</button>
        </div>

        <div class="admin-group-edit" id="${scope}-edit" ${isOpen ? '' : 'hidden'}>
          <div class="admin-form-grid is-tight">
            <div class="admin-field">
              <label for="${scope}-name">Tên nhóm</label>
              <input id="${scope}-name" type="text" data-edit="name" value="${A.escapeHtml(group.name)}" autocomplete="off" />
            </div>
            <div class="admin-field">
              <label for="${scope}-desc">Slogan / mô tả</label>
              <input id="${scope}-desc" type="text" data-edit="description" value="${A.escapeHtml(group.description || '')}" autocomplete="off" />
            </div>
            <div class="admin-field">
              <label for="${scope}-cap">Giới hạn số người</label>
              <input id="${scope}-cap" type="number" min="1" max="500" inputmode="numeric" data-edit="capacity"
                value="${group.capacity || ''}" placeholder="Trống = không giới hạn" />
            </div>
            <div class="admin-field">
              <label for="${scope}-color">Màu nhận diện</label>
              <span class="admin-color-field">
                <input id="${scope}-color" type="color" data-edit="color" value="${A.escapeHtml(group.color || DEFAULT_SWATCH)}"
                  aria-describedby="${scope}-color-note" />
                <span class="admin-field-hint" id="${scope}-color-note" data-color-note>${
                  group.color ? A.escapeHtml(group.color) : 'Đang dùng màu mặc định'
                }</span>
              </span>
            </div>
          </div>
          <div class="admin-btn-row">
            <button type="button" class="admin-row-btn is-primary" data-action="save" data-keep-disabled="1">${A.icon('save')} Lưu nhóm</button>
            <button type="button" class="admin-row-btn" data-action="clear-color" ${group.color ? '' : 'data-keep-disabled="1"'}
              title="Bỏ màu riêng, dùng màu chủ đạo của trang">${A.icon('paint-bucket')} Dùng màu mặc định</button>
            <button type="button" class="admin-row-btn danger" data-action="delete">${A.icon('trash-2')} Xóa nhóm</button>
          </div>
        </div>
      </div>`;
  }

  function syncLockRoundBtn() {
    lockRoundBtn.innerHTML = `${A.icon(randomLocked ? 'lock-open' : 'lock')} ${
      randomLocked ? 'Mở vòng chia nhóm' : 'Khóa vòng chia nhóm'
    }`;
    lockRoundBtn.classList.toggle('admin-btn-warn', !randomLocked);
    lockRoundBtn.classList.toggle('admin-btn-secondary', randomLocked);
    lockRoundBtn.setAttribute('aria-pressed', randomLocked ? 'true' : 'false');
  }

  /* ---------- sua nhom: theo doi thay doi chua luu ---------- */

  function editChanges(card, group) {
    const read = (field) => card.querySelector(`[data-edit="${field}"]`);
    const body = {};
    const name = read('name').value.trim();
    if (name !== group.name) body.name = name;
    const desc = read('description').value.trim();
    if (desc !== (group.description || '')) body.description = desc;
    const capacity = read('capacity').value.trim();
    if (capacity !== String(group.capacity || '')) body.capacity = capacity;
    const color = read('color');
    if (color.dataset.touched === '1' && color.value.toLowerCase() !== String(group.color || '').toLowerCase()) {
      body.color = color.value;
    }
    return body;
  }

  function updateDirty(card) {
    const group = groups.find((g) => g.id === Number(card.dataset.groupId));
    if (!group) return;
    const dirty = Object.keys(editChanges(card, group)).length > 0;
    card.classList.toggle('is-dirty', dirty);
    A.setAllowed(card.querySelector('[data-action="save"]'), dirty);
  }

  // The dang sua do, hoac dang thao tac trong o sua (ke ca dang mo bang chon
  // mau) thi giu nguyen khi co ban cap nhat realtime.
  function cardIsBusy(card) {
    if (card.classList.contains('is-dirty')) return true;
    const el = document.activeElement;
    if (!el || !card.contains(el) || !el.closest('.admin-group-edit')) return false;
    return A.isEditingControl(el) || el.type === 'color';
  }

  let pendingRender = false;

  function render() {
    renderStats();
    syncLockRoundBtn();
    pendingRender = false;

    A.patchList(
      grid,
      visibleGroups().map((g) => ({ key: g.id, html: cardHtml(g) })),
      {
        keep: (card) => {
          const busy = cardIsBusy(card);
          if (busy && !card.classList.contains('is-dirty')) pendingRender = true;
          return busy;
        },
        empty: `<div class="admin-empty-rich">${A.icon(groups.length ? 'search-x' : 'folder-plus')}
          <strong>${!loaded ? 'Đang tải…' : groups.length ? 'Không có nhóm nào khớp từ khóa' : 'Chưa có nhóm nào'}</strong>
          <p>${
            groups.length
              ? 'Thử xóa bớt từ khóa tìm kiếm.'
              : 'Thêm ít nhất một nhóm ở khối phía trên để vòng chia nhóm hoạt động.'
          }</p></div>`,
      }
    );

    A.applyEditLock(panel, lockNote);
  }

  /* ---------- tai du lieu ---------- */

  const load = A.serial(async () => {
    try {
      const [groupRes, config] = await Promise.all([
        fetch('/api/groups/full').then((r) => r.json()),
        fetch('/api/config').then((r) => r.json()),
      ]);
      groups = groupRes.groups || [];
      stats = groupRes.stats || null;
      randomLocked = !!config.randomLocked;
      loaded = true;

      render();
    } catch (err) {
      A.setMsg(groupMsg, err.message, 'err');
    }
  });

  /* ---------- thao tac tren tung the ---------- */

  filterInput.addEventListener('input', render);

  grid.addEventListener('input', (e) => {
    const card = e.target.closest('.admin-group-card');
    if (!card || !e.target.dataset.edit) return;
    if (e.target.dataset.edit === 'color') {
      e.target.dataset.touched = '1';
      const note = card.querySelector('[data-color-note]');
      if (note) note.textContent = `${e.target.value} (chưa lưu)`;
    }
    updateDirty(card);
  });
  grid.addEventListener('change', (e) => {
    const card = e.target.closest('.admin-group-card');
    if (card && e.target.dataset.edit) updateDirty(card);
  });

  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.dataset.edit || e.target.type === 'color') return;
    const card = e.target.closest('.admin-group-card');
    const save = card && card.querySelector('[data-action="save"]');
    if (save && !save.disabled) {
      e.preventDefault();
      save.click();
    }
  });

  grid.addEventListener('focusout', () => {
    setTimeout(() => {
      if (pendingRender && ![...grid.querySelectorAll('.admin-group-card')].some(cardIsBusy)) render();
    }, 0);
  });

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
      btn.setAttribute('aria-expanded', String(!box.hidden));
      if (box.hidden) {
        expanded.delete(groupId);
        // Dong o sua = bo thay doi chua luu
        if (card.classList.contains('is-dirty')) {
          card.classList.remove('is-dirty');
          render();
        }
      } else {
        expanded.add(groupId);
        const first = box.querySelector('[data-edit="name"]');
        if (first && !first.disabled) first.focus();
      }
      return;
    }

    if (action === 'remove-member') {
      const memberId = Number(btn.dataset.memberId);
      const data = await A.run(btn, groupMsg, 'Đang cập nhật...', () =>
        A.request('POST', '/api/admin/groups/move', { memberId, groupId: '' })
      );
      if (!data) return;
      A.done(groupMsg, 'Đã đưa ra khỏi nhóm.');
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
        A.request('PUT', `/api/admin/groups/${groupId}`, { color: null })
      );
      if (!data) return;
      group.color = null;
      const color = card.querySelector('[data-edit="color"]');
      if (color) delete color.dataset.touched;
      card.classList.remove('is-dirty');
      A.done(groupMsg, `"${group.name}" đã trở về màu mặc định.`);
      render();
      load();
      return;
    }

    if (action === 'save') {
      const body = editChanges(card, group);
      if (!Object.keys(body).length) {
        updateDirty(card);
        return;
      }
      const data = await A.run(btn, groupMsg, 'Đang lưu...', () => A.request('PUT', `/api/admin/groups/${groupId}`, body));
      if (!data) return;
      Object.assign(group, {
        name: data.group.name,
        description: data.group.description,
        color: data.group.color,
        capacity: data.group.capacity,
      });
      card.classList.remove('is-dirty');
      A.done(groupMsg, `Đã lưu "${data.group.name}".`);
      render();
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
      card.classList.remove('is-dirty');
      A.done(groupMsg, `Đã xóa nhóm (${data.releasedMembers} người quay về chưa chia).`);
      load();
    }
  });

  /* ---------- them nhom ---------- */

  function syncNewColorNote() {
    const touched = newColor.dataset.touched === '1';
    newColorNote.textContent = touched ? `Màu riêng: ${newColor.value}` : 'Chưa chọn — dùng màu chủ đạo của trang';
    A.setAllowed(newColorReset, touched);
  }

  newColor.addEventListener('input', () => {
    newColor.dataset.touched = '1';
    syncNewColorNote();
  });

  newColorReset.addEventListener('click', () => {
    delete newColor.dataset.touched;
    newColor.value = DEFAULT_SWATCH;
    syncNewColorNote();
  });

  addBtn.addEventListener('click', async () => {
    const body = {
      name: newName.value,
      description: newDesc.value,
      capacity: newCapacity.value,
    };
    if (newColor.dataset.touched === '1') body.color = newColor.value;

    const data = await A.run(addBtn, addMsg, 'Đang thêm...', () => A.request('POST', '/api/admin/groups', body));
    if (!data) return;

    A.done(addMsg, `Đã thêm nhóm "${data.group.name}".`);
    newName.value = '';
    newDesc.value = '';
    newCapacity.value = '';
    delete newColor.dataset.touched;
    newColor.value = DEFAULT_SWATCH;
    syncNewColorNote();
    newName.focus();
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
      }<br />Ai đang mở trang chia nhóm sẽ thấy kết quả mới ngay.`,
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
    if (!randomLocked) {
      const ok = await A.confirmAction({
        title: 'Khóa vòng chia nhóm',
        message: 'Khóa vòng chia nhóm? Mọi người sẽ không tự bốc thăm được nữa cho tới khi bạn mở lại. Kết quả hiện có vẫn giữ nguyên.',
        okText: 'Khóa',
        danger: false,
      });
      if (!ok) return;
    }
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
      message: `Đưa tất cả mọi người về trạng thái <strong>chưa chia nhóm</strong>?<br />${
        keepPinned.checked ? 'Người đã ghim vẫn giữ nguyên nhóm.' : '<strong>Kể cả người đã ghim.</strong>'
      }<br /><br />Ai đang mở trang chia nhóm sẽ thấy kết quả của mình bị xóa và phải bốc thăm lại. Danh sách nhóm, điểm quiz và Nhóm Trưởng vẫn giữ nguyên — người đang làm quiz không bị ảnh hưởng.`,
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

  // "Chia nhom cho tat ca" phat groups:updated + members:updated + bulk-randomized
  // + activity lien nhau -> gop thanh 1 lan tai.
  A.onLive(
    ['groups:updated', 'groups:reset', 'members:updated', 'member:randomized', 'groups:bulk-randomized',
      'random:config', 'settings:updated'],
    load
  );

  syncNewColorNote();
  A.onTab('groups', load);
})();
