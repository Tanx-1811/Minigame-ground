// Trang "Cau hinh & Reset": luat choi (so nhom truong, suc chua, giai doan)
// va sao luu / phuc hoi toan bo du lieu.
// Khoi "Reset toan bo" nam o file rieng: admin-danger.js
(function () {
  const A = window.AdminCommon;

  const systemPanel = document.querySelector('.admin-panel[data-panel="settings"]');
  if (!systemPanel) return;

  const systemStats = document.getElementById('systemStats');
  const systemLockNote = document.getElementById('systemLockNote');
  const leaderCountInput = document.getElementById('leaderCountInput');
  const roomCapacityInput = document.getElementById('roomCapacityInput');
  const groupCapacityInput = document.getElementById('groupCapacityInput');
  const phaseSelect = document.getElementById('phaseSelect');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsMsg = document.getElementById('settingsMsg');

  const backupExportBtn = document.getElementById('backupExportBtn');
  const backupImportBtn = document.getElementById('backupImportBtn');
  const backupFileInput = document.getElementById('backupFileInput');
  const backupMsg = document.getElementById('backupMsg');

  let settings = null;

  function renderSystem() {
    if (!settings) return;

    systemStats.innerHTML = [
      A.statTile({ icon: 'users', label: 'Thành viên', value: settings.counts.members, variant: 'accent' }),
      A.statTile({ icon: 'users-round', label: 'Nhóm', value: settings.counts.groups }),
      A.statTile({ icon: 'bed-double', label: 'Phòng ngủ', value: settings.counts.rooms }),
      A.statTile({ icon: 'circle-help', label: 'Câu hỏi', value: settings.counts.questions }),
      A.statTile({
        icon: 'git-branch',
        label: 'Giai đoạn',
        value: settings.phase === 'random' ? 'Random' : 'Quiz',
        sub: settings.quizStatus === 'active' ? 'Quiz đang chạy' : 'Quiz đang chờ',
        variant: settings.phase === 'random' ? 'ok' : 'warn',
      }),
      settings.randomLocked || settings.roomsLocked
        ? A.statTile({
            icon: 'lock',
            label: 'Đang khóa',
            value: [settings.randomLocked ? 'Chia nhóm' : '', settings.roomsLocked ? 'Ghép phòng' : '']
              .filter(Boolean)
              .join(' · '),
            variant: 'danger',
          })
        : '',
    ]
      .filter(Boolean)
      .join('');

    leaderCountInput.value = settings.leaderCount;
    roomCapacityInput.value = settings.roomCapacity;
    groupCapacityInput.value = settings.groupCapacity;
    phaseSelect.value = settings.phase;

    A.applyEditLock(systemPanel, systemLockNote);
  }

  async function load() {
    if (!A.canEdit()) {
      settings = null;
      systemStats.innerHTML = '';
      A.applyEditLock(systemPanel, systemLockNote);
      return;
    }
    try {
      settings = await A.request('GET', '/api/admin/settings');
      renderSystem();
    } catch (err) {
      A.setMsg(settingsMsg, err.message, 'err');
    }
  }

  saveSettingsBtn.addEventListener('click', async () => {
    const data = await A.run(saveSettingsBtn, settingsMsg, 'Đang lưu...', () =>
      A.request('POST', '/api/admin/settings', {
        leaderCount: leaderCountInput.value,
        roomCapacity: roomCapacityInput.value,
        groupCapacity: groupCapacityInput.value,
        phase: phaseSelect.value,
      })
    );
    if (!data) return;

    A.done(settingsMsg, `Đã lưu: ${data.changes.join(', ')}.`);
    load();
  });

  backupExportBtn.addEventListener('click', async () => {
    const data = await A.run(backupExportBtn, backupMsg, 'Đang chuẩn bị file...', () =>
      A.request('GET', '/api/admin/export')
    );
    if (!data) return;

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    A.downloadBlob(
      `sao-luu-su-kien-${stamp}.json`,
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    );
    A.done(
      backupMsg,
      `Đã tải file sao lưu: ${data.counts.members} thành viên, ${data.counts.groups} nhóm, ${data.counts.rooms} phòng, ${data.counts.questions} câu hỏi.`
    );
  });

  backupImportBtn.addEventListener('click', () => backupFileInput.click());

  backupFileInput.addEventListener('change', async () => {
    const file = backupFileInput.files && backupFileInput.files[0];
    backupFileInput.value = '';
    if (!file) return;

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (err) {
      A.setMsg(backupMsg, 'File không phải JSON hợp lệ', 'err');
      A.toast('File không phải JSON hợp lệ', 'err');
      return;
    }

    if (!parsed || !Array.isArray(parsed.members)) {
      A.setMsg(backupMsg, 'File không đúng định dạng sao lưu của hệ thống', 'err');
      return;
    }

    const counts = parsed.counts || {};
    const ok = await A.confirmAction({
      title: 'Phục hồi dữ liệu',
      message: `Ghi đè toàn bộ dữ liệu hiện tại bằng file <strong>${A.escapeHtml(file.name)}</strong>?<br /><br />
        File chứa ${counts.members ?? parsed.members.length} thành viên, ${counts.groups ?? 0} nhóm,
        ${counts.rooms ?? 0} phòng, ${counts.questions ?? 0} câu hỏi.<br /><br />
        <strong>Toàn bộ dữ liệu đang có sẽ bị xóa.</strong> Không thể hoàn tác.`,
      okText: 'Ghi đè ngay',
    });
    if (!ok) return;

    const data = await A.run(backupImportBtn, backupMsg, 'Đang phục hồi, vui lòng chờ...', () =>
      A.request('POST', '/api/admin/import', { data: parsed, confirm: 'GHI DE' })
    );
    if (!data) return;

    A.done(
      backupMsg,
      `Đã phục hồi: ${data.members} thành viên, ${data.groups} nhóm, ${data.rooms} phòng, ${data.questions} câu hỏi.`
    );
    load();
  });

  if (A.socket) {
    ['settings:updated', 'phase:updated', 'groups:reset', 'members:updated', 'rooms:updated',
      'questions:updated', 'rooms:config', 'random:config'].forEach((evt) => A.socket.on(evt, load));
  }

  A.onSecretChange(load);
  A.onTab('settings', load);
})();
