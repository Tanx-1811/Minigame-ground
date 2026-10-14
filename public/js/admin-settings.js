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

  function statTile({ label, value, sub, variant }) {
    return `
      <div class="admin-stat ${variant ? `is-${variant}` : ''}">
        <span class="admin-stat-label">${label}</span>
        <span class="admin-stat-value">${value}</span>
        ${sub ? `<span class="admin-stat-sub">${sub}</span>` : ''}
      </div>`;
  }

  function renderStats(settings) {
    const c = settings.counts;
    systemStats.innerHTML = [
      statTile({ label: '👥 Thành viên', value: c.members }),
      statTile({ label: '🏷️ Nhóm', value: c.groups }),
      statTile({ label: '🛏️ Phòng ngủ', value: c.rooms }),
      statTile({ label: '❓ Câu hỏi', value: c.questions }),
      statTile({
        label: '🎬 Giai đoạn',
        value: PHASE_LABEL[settings.phase] || settings.phase,
        sub: settings.quizStatus === 'active' ? 'Quiz đang chạy' : 'Quiz đang chờ',
      }),
      statTile({
        label: '🛏️ Vòng ghép phòng',
        value: settings.roomsLocked ? '🔒 Đang khóa' : '🔓 Đang mở',
        variant: settings.roomsLocked ? 'warn' : 'ok',
      }),
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
