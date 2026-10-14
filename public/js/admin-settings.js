// Tab "He thong": cau hinh luat choi (so nhom truong, suc chua phong mac dinh, giai doan).
(function () {
  const A = window.AdminCommon;

  const systemStats = document.getElementById('systemStats');
  const leaderCountInput = document.getElementById('leaderCountInput');
  const roomCapacityInput = document.getElementById('roomCapacityInput');
  const phaseSelect = document.getElementById('phaseSelect');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsMsg = document.getElementById('settingsMsg');

  const PHASE_LABEL = { quiz: 'Quiz (chọn nhóm trưởng)', random: 'Random chia nhóm' };

  function renderStats(settings) {
    const c = settings.counts;
    systemStats.innerHTML = [
      `<span class="admin-chip">👥 <strong>${c.members}</strong> thành viên</span>`,
      `<span class="admin-chip">🏷️ <strong>${c.groups}</strong> nhóm</span>`,
      `<span class="admin-chip">🛏️ <strong>${c.rooms}</strong> phòng ngủ</span>`,
      `<span class="admin-chip">❓ <strong>${c.questions}</strong> câu hỏi</span>`,
      `<span class="admin-chip">🎬 Giai đoạn <strong>${PHASE_LABEL[settings.phase] || settings.phase}</strong></span>`,
      `<span class="admin-chip">🧠 Quiz <strong>${settings.quizStatus === 'active' ? 'đang chạy' : 'đang chờ'}</strong></span>`,
      settings.roomsLocked
        ? '<span class="admin-chip warn">🔒 Vòng ghép phòng đang khóa</span>'
        : '<span class="admin-chip">🔓 Vòng ghép phòng đang mở</span>',
    ].join('');
  }

  async function loadSettings() {
    try {
      const settings = await A.request('GET', '/api/admin/settings');
      leaderCountInput.value = settings.leaderCount;
      roomCapacityInput.value = settings.roomCapacity;
      phaseSelect.value = settings.phase === 'random' ? 'random' : 'quiz';
      renderStats(settings);
      A.setMsg(settingsMsg, '');
    } catch (err) {
      systemStats.innerHTML = '';
      A.setMsg(settingsMsg, err.message, 'err');
    }
  }

  saveSettingsBtn.addEventListener('click', async () => {
    if (
      phaseSelect.value === 'random' &&
      !confirm('Chuyển sang giai đoạn Random sẽ mở vòng random chia nhóm cho tất cả mọi người ngay bây giờ. Tiếp tục?')
    ) {
      return;
    }

    const data = await A.run(saveSettingsBtn, settingsMsg, 'Đang lưu cấu hình...', () =>
      A.request('POST', '/api/admin/settings', {
        leaderCount: leaderCountInput.value,
        roomCapacity: roomCapacityInput.value,
        phase: phaseSelect.value,
      })
    );
    if (!data) return;

    A.setMsg(settingsMsg, `Đã lưu: ${data.changes.join(', ')}.`, 'ok');
    loadSettings();
  });

  if (A.socket) {
    A.socket.on('settings:updated', () => {
      if (A.activeTab() === 'system') loadSettings();
    });
  }

  A.onTab('system', loadSettings);
})();
