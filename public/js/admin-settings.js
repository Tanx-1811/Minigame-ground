// Trang "Cau hinh & Reset": luat choi (so nhom truong, suc chua, giai doan)
// va sao luu / phuc hoi toan bo du lieu.
// Khoi "Reset toan bo" nam o file rieng: admin-danger.js
//
// Form chi gui nhung o DA DOI so voi luc tai (truoc day luon gui ca phase ->
// moi lan bam Luu la day moi nguoi dang mo trang ve man hinh tuong ung). O nao
// dang sua do thi lan tai lai (do su kien realtime) khong ghi de len.
(function () {
  const A = window.AdminCommon;

  const systemPanel = document.querySelector('.admin-panel[data-panel="settings"]');
  if (!systemPanel) return;

  const systemStats = document.getElementById('systemStats');
  const systemLockNote = document.getElementById('systemLockNote');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const resetFormBtn = document.getElementById('resetSettingsFormBtn');
  const settingsMsg = document.getElementById('settingsMsg');
  const phaseHint = document.getElementById('phaseHint');

  const FIELDS = {
    leaderCount: document.getElementById('leaderCountInput'),
    roomCapacity: document.getElementById('roomCapacityInput'),
    groupCapacity: document.getElementById('groupCapacityInput'),
    phase: document.getElementById('phaseSelect'),
  };

  const backupExportBtn = document.getElementById('backupExportBtn');
  const backupImportBtn = document.getElementById('backupImportBtn');
  const backupFileInput = document.getElementById('backupFileInput');
  const backupMsg = document.getElementById('backupMsg');

  let settings = null;
  // Gia tri may chu dang luu cho tung o (de biet o nao dang bi sua)
  const baseline = {};

  function dirtyKeys() {
    return Object.keys(FIELDS).filter(
      (key) => baseline[key] !== undefined && String(FIELDS[key].value).trim() !== baseline[key]
    );
  }

  function syncDirty() {
    const dirty = dirtyKeys();
    Object.entries(FIELDS).forEach(([key, el]) => {
      el.closest('.admin-field').classList.toggle('is-dirty', dirty.includes(key));
    });
    A.setAllowed(saveSettingsBtn, dirty.length > 0);
    A.setAllowed(resetFormBtn, dirty.length > 0);
  }

  function renderSystem() {
    if (!settings) return;

    const realPhase = settings.phase === 'quiz' && settings.counts.questions === 0 ? 'random' : settings.phase;

    systemStats.innerHTML = [
      A.statTile({ icon: 'users', label: 'Thành viên', value: settings.counts.members, variant: 'accent' }),
      A.statTile({ icon: 'users-round', label: 'Nhóm', value: settings.counts.groups }),
      A.statTile({ icon: 'bed-double', label: 'Phòng ngủ', value: settings.counts.rooms }),
      A.statTile({ icon: 'circle-help', label: 'Câu hỏi', value: settings.counts.questions }),
      A.statTile({
        icon: 'git-branch',
        label: 'Giai đoạn',
        value: realPhase === 'random' ? 'Random' : 'Quiz',
        sub:
          settings.phase === 'quiz' && realPhase === 'random'
            ? 'Bỏ qua Quiz — chưa có câu hỏi'
            : realPhase === 'random'
            ? 'Đã chốt Nhóm Trưởng'
            : settings.quizStatus === 'active'
            ? 'Quiz đang chạy'
            : 'Quiz đang chờ',
        variant: realPhase === 'random' ? 'ok' : 'warn',
      }),
      A.statTile({
        icon: settings.randomLocked || settings.roomsLocked ? 'lock' : 'lock-open',
        label: 'Khóa vòng',
        value:
          settings.randomLocked || settings.roomsLocked
            ? [settings.randomLocked ? 'Chia nhóm' : '', settings.roomsLocked ? 'Ghép phòng' : ''].filter(Boolean).join(' · ')
            : 'Không',
        sub: 'Đổi ở trang Tổng quan',
        variant: settings.randomLocked || settings.roomsLocked ? 'danger' : '',
      }),
    ].join('');

    const server = {
      leaderCount: String(settings.leaderCount),
      roomCapacity: String(settings.roomCapacity),
      groupCapacity: String(settings.groupCapacity),
      phase: settings.phase,
    };

    // O nao chua bi sua thi lay gia tri moi tu may chu; o dang sua thi giu nguyen
    Object.entries(FIELDS).forEach(([key, el]) => {
      const clean = baseline[key] === undefined || String(el.value).trim() === baseline[key];
      if (clean && el.value !== server[key]) el.value = server[key];
      baseline[key] = server[key];
    });

    phaseHint.textContent =
      settings.counts.questions === 0
        ? 'Chưa có câu hỏi nào nên mọi người đang thấy thẳng vòng Random, dù chọn Quiz ở đây.'
        : 'Đổi giai đoạn sẽ chuyển màn hình của mọi người đang mở trang ngay lập tức.';

    A.applyEditLock(systemPanel, systemLockNote);
    syncDirty();
  }

  const load = A.serial(async () => {
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
  });

  Object.values(FIELDS).forEach((el) => {
    el.addEventListener('input', syncDirty);
    el.addEventListener('change', syncDirty);
  });

  resetFormBtn.addEventListener('click', () => {
    Object.entries(FIELDS).forEach(([key, el]) => {
      if (baseline[key] !== undefined) el.value = baseline[key];
    });
    syncDirty();
    A.setMsg(settingsMsg, 'Đã trả các ô về giá trị đang lưu.', '');
  });

  saveSettingsBtn.addEventListener('click', async () => {
    const keys = dirtyKeys();
    if (!keys.length) {
      A.setMsg(settingsMsg, 'Không có thay đổi nào để lưu.', 'warn');
      return;
    }

    if (keys.includes('phase')) {
      const toRandom = FIELDS.phase.value === 'random';
      const ok = await A.confirmAction({
        title: 'Đổi giai đoạn',
        message: toRandom
          ? 'Chuyển sang <strong>Random chia nhóm</strong>?<br />Mọi người đang mở trang sẽ được đưa ngay sang màn bốc thăm chia nhóm, kể cả khi đang làm quiz.'
          : 'Quay lại giai đoạn <strong>Quiz</strong>?<br />Mọi người đang mở trang sẽ được đưa về màn Quiz, vòng chia nhóm tạm đóng.',
        okText: toRandom ? 'Chuyển sang Random' : 'Quay lại Quiz',
        danger: false,
      });
      if (!ok) return;
    }

    const body = {};
    keys.forEach((key) => {
      body[key] = String(FIELDS[key].value).trim();
    });

    const data = await A.run(saveSettingsBtn, settingsMsg, 'Đang lưu...', () => A.request('POST', '/api/admin/settings', body));
    if (!data) {
      syncDirty();
      return;
    }

    // Coi nhu da luu: o vua gui tro thanh gia tri goc moi
    keys.forEach((key) => {
      baseline[key] = body[key];
    });
    syncDirty();
    A.done(settingsMsg, `Đã lưu: ${data.changes.join(', ')}.`);
    scheduleLoad();
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
        ${counts.rooms ?? 0} phòng, ${counts.questions ?? 0} câu hỏi${
          counts.answers ? `, ${counts.answers} câu trả lời quiz` : ''
        }.<br /><br />
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
    scheduleLoad();
  });

  // Mot lan Luu phat 3-4 su kien (settings:updated, phase:updated, activity...)
  // -> gop lai thanh 1 lan tai.
  const scheduleLoad = A.onLive(
    ['settings:updated', 'phase:updated', 'groups:reset', 'members:updated', 'rooms:updated',
      'questions:updated', 'rooms:config', 'random:config', 'groups:updated', 'rooms:reset'],
    load
  );

  A.onTab('settings', load);
})();
