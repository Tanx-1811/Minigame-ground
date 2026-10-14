// Ba viec dung chung mot file vi cung xoay quanh "dieu hanh buoi choi":
//  - tab "Su kien": hen gio mo boc tham + dem nguoc
//  - tab "Vong Quiz": phong cho, bat dau lam bai, chot Nhom Truong
//  - khoi "Reset toan bo" trong tab Cau hinh
//
// Chua nhap ma bi mat thi 2 tab tren van xem duoc (phong cho, bang diem, gio mo),
// chi cac nut thao tac bi khoa lai.
(function () {
  const A = window.AdminCommon;

  const eventPanel = document.querySelector('.admin-panel[data-panel="event"]');
  const quizPanel = document.querySelector('.admin-panel[data-panel="quiz"]');
  const eventLockNote = document.getElementById('eventLockNote');
  const quizLockNote = document.getElementById('quizLockNote');

  const eventTimeInput = document.getElementById('eventTimeInput');
  const eventCountdownChip = document.getElementById('eventCountdownChip');
  const saveTimeBtn = document.getElementById('saveTimeBtn');
  const clearTimeBtn = document.getElementById('clearTimeBtn');
  const timeMsg = document.getElementById('timeMsg');

  const lobbyStatusText = document.getElementById('lobbyStatusText');
  const lobbyMembersList = document.getElementById('lobbyMembersList');
  const startQuizBtn = document.getElementById('startQuizBtn');
  const lobbyMsg = document.getElementById('lobbyMsg');
  const refreshQuizBtn = document.getElementById('refreshQuizBtn');
  const finishQuizBtn = document.getElementById('finishQuizBtn');
  const forceFinishCheckbox = document.getElementById('forceFinishCheckbox');
  const resetLeadersBtn = document.getElementById('resetLeadersBtn');
  const quizAdminLeaderboard = document.getElementById('quizAdminLeaderboard');
  const quizMsg = document.getElementById('quizMsg');

  const resetBtn = document.getElementById('resetBtn');
  const resetIncludeRooms = document.getElementById('resetIncludeRooms');
  const resetKeepPinned = document.getElementById('resetKeepPinned');
  const resetIncludeActivity = document.getElementById('resetIncludeActivity');
  const msg = document.getElementById('msg');

  function applyLocks() {
    A.applyEditLock(eventPanel, eventLockNote);
    A.applyEditLock(quizPanel, quizLockNote);
  }

  /* ================= su kien: gio mo boc tham ================= */

  let eventStartAt = null;
  let countdownTimer = null;

  function isoToLocalInputValue(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function renderCountdown() {
    if (!eventStartAt) {
      eventCountdownChip.innerHTML = `${A.icon('zap')} Đang mở ngay, không hẹn giờ`;
      eventCountdownChip.className = 'admin-chip is-ok';
      return;
    }

    const left = new Date(eventStartAt).getTime() - Date.now();
    if (left <= 0) {
      eventCountdownChip.innerHTML = `${A.icon('circle-check')} Đã tới giờ mở`;
      eventCountdownChip.className = 'admin-chip is-ok';
      return;
    }

    const s = Math.floor(left / 1000);
    const parts = [];
    if (s >= 86400) parts.push(`${Math.floor(s / 86400)} ngày`);
    if (s >= 3600) parts.push(`${Math.floor((s % 86400) / 3600)} giờ`);
    parts.push(`${Math.floor((s % 3600) / 60)} phút`);
    if (s < 3600) parts.push(`${s % 60} giây`);

    eventCountdownChip.innerHTML = `${A.icon('hourglass')} Còn ${parts.join(' ')}`;
    eventCountdownChip.className = 'admin-chip is-warn';
  }

  async function loadEventTime() {
    try {
      const data = await fetch('/api/config').then((r) => r.json());
      eventStartAt = data.eventStartAt || null;
      eventTimeInput.value = eventStartAt ? isoToLocalInputValue(eventStartAt) : '';

      renderCountdown();
      clearInterval(countdownTimer);
      countdownTimer = setInterval(renderCountdown, 1000);
    } catch (err) {
      console.error(err);
    }
    applyLocks();
  }

  async function saveEventTime(value) {
    const data = await A.run(saveTimeBtn, timeMsg, 'Đang lưu...', () =>
      A.request('POST', '/api/admin/event-time', { eventStartAt: value })
    );
    if (!data) return;

    A.done(timeMsg, value ? 'Đã lưu giờ mở bốc thăm!' : 'Đã mở bốc thăm ngay lập tức!');
    loadEventTime();
  }

  saveTimeBtn.addEventListener('click', () => {
    if (!eventTimeInput.value) {
      A.setMsg(timeMsg, 'Vui lòng chọn ngày giờ', 'err');
      return;
    }
    saveEventTime(new Date(eventTimeInput.value).toISOString());
  });

  clearTimeBtn.addEventListener('click', () => {
    eventTimeInput.value = '';
    saveEventTime(null);
  });

  /* ================= quiz: phong cho ================= */

  function renderLobby(status, members) {
    const list = Array.isArray(members) ? members : [];

    lobbyStatusText.innerHTML =
      status === 'active'
        ? `${A.icon('circle-check')} Quiz đã bắt đầu`
        : `${A.icon('hourglass')} ${list.length} người đã sẵn sàng`;
    lobbyStatusText.className = `admin-chip ${status === 'active' ? 'is-ok' : ''}`;

    lobbyMembersList.innerHTML = list.length
      ? list
          .map(
            (name, i) =>
              `<li><span class="admin-list-rank">${i + 1}</span><span>${A.escapeHtml(
                name
              )}</span><span class="admin-list-value">sẵn sàng</span></li>`
          )
          .join('')
      : `<li class="admin-empty">Chưa có ai vào phòng chờ</li>`;

    applyLocks();
    startQuizBtn.disabled = status === 'active' || !A.canEdit();
  }

  async function loadLobby() {
    try {
      const data = await fetch('/api/quiz/lobby').then((r) => r.json());
      renderLobby(data.status, data.members);
    } catch (err) {
      console.error(err);
    }
  }

  startQuizBtn.addEventListener('click', async () => {
    const ok = await A.confirmAction({
      title: 'Bắt đầu làm bài',
      message: 'Bắt đầu làm bài Quiz cho tất cả mọi người đang chờ trong phòng chờ?',
      okText: 'Bắt đầu',
      danger: false,
    });
    if (!ok) return;

    const data = await A.run(startQuizBtn, lobbyMsg, 'Đang bắt đầu...', () =>
      A.request('POST', '/api/admin/quiz/start', {})
    );
    if (!data) return;

    A.done(
      lobbyMsg,
      data.alreadyStarted
        ? 'Quiz đã được bắt đầu từ trước.'
        : 'Đã bắt đầu! Mọi người trong phòng chờ sẽ thấy đếm ngược 3 giây.'
    );
    loadLobby();
  });

  /* ================= quiz: bang xep hang & chot ================= */

  async function loadQuizLeaderboard() {
    try {
      const rows = await fetch('/api/quiz/leaderboard').then((r) => r.json());
      if (!rows.length) {
        quizAdminLeaderboard.innerHTML = '<li class="admin-empty">Chưa có ai làm quiz</li>';
        return;
      }

      quizAdminLeaderboard.innerHTML = rows
        .map(
          (r, i) => `
          <li class="${i < 3 ? 'is-winner' : ''}">
            <span class="admin-list-rank">${i + 1}</span>
            <span>${A.escapeHtml(r.name)}${r.finished ? '' : ' <em class="muted">(chưa xong)</em>'}</span>
            <span class="admin-list-value">${r.score} điểm · ${(r.timeMs / 1000).toFixed(1)}s</span>
          </li>`
        )
        .join('');
      A.setMsg(quizMsg, '');
    } catch (err) {
      quizAdminLeaderboard.innerHTML = '';
      A.setMsg(quizMsg, 'Không thể tải bảng xếp hạng quiz', 'err');
    }
  }

  refreshQuizBtn.addEventListener('click', loadQuizLeaderboard);

  finishQuizBtn.addEventListener('click', async () => {
    const force = forceFinishCheckbox.checked;
    const ok = await A.confirmAction({
      title: 'Chốt Nhóm Trưởng',
      message: force
        ? 'Chốt Nhóm Trưởng dựa trên điểm quiz hiện tại (<strong>kể cả khi chưa đủ người hoàn thành</strong>) và mở khóa vòng Random cho mọi người?'
        : 'Chốt Nhóm Trưởng dựa trên điểm quiz hiện tại và mở khóa vòng Random cho mọi người?',
      okText: 'Chốt ngay',
      danger: false,
    });
    if (!ok) return;

    const data = await A.run(finishQuizBtn, quizMsg, 'Đang chốt...', () =>
      A.request('POST', '/api/admin/quiz/finish', { force })
    );
    if (!data) return;

    const names = (data.leaders || []).map((l) => l.name).join(', ');
    A.done(
      quizMsg,
      data.alreadyFinished ? `Đã chốt từ trước: ${names}` : `Đã chốt Nhóm Trưởng: ${names}. Vòng Random đã mở!`
    );
    loadQuizLeaderboard();
  });

  resetLeadersBtn.addEventListener('click', async () => {
    const ok = await A.confirmAction({
      title: 'Làm lại vòng Quiz',
      message:
        'Xóa điểm quiz, câu trả lời và bỏ chốt Nhóm Trưởng hiện tại để mọi người làm lại quiz từ đầu?<br />Kết quả chia nhóm không bị ảnh hưởng. Không thể hoàn tác.',
      okText: 'Làm lại từ đầu',
    });
    if (!ok) return;

    const data = await A.run(resetLeadersBtn, quizMsg, 'Đang reset vòng Quiz...', () =>
      A.request('POST', '/api/admin/quiz/reset', {})
    );
    if (!data) return;

    A.done(quizMsg, 'Đã reset vòng chọn Nhóm Trưởng! Mọi người sẽ làm lại quiz từ đầu.');
    loadQuizLeaderboard();
    loadLobby();
  });

  /* ================= reset toan bo ================= */

  resetBtn.addEventListener('click', async () => {
    const includeRooms = resetIncludeRooms.checked;
    const keepPinned = resetKeepPinned.checked;
    const includeActivity = resetIncludeActivity.checked;

    const lines = [
      'Xóa kết quả chia nhóm và toàn bộ tiến độ quiz (điểm số, nhóm trưởng) của tất cả thành viên.',
      includeRooms ? 'Xóa luôn kết quả ghép phòng ngủ.' : 'Giữ nguyên kết quả ghép phòng ngủ.',
      keepPinned ? 'Người đã ghim vẫn giữ nguyên nhóm và phòng.' : 'Kể cả người đã ghim cũng bị xóa kết quả.',
      includeActivity ? 'Xóa luôn nhật ký thao tác.' : '',
    ].filter(Boolean);

    const ok = await A.confirmAction({
      title: 'Reset toàn bộ',
      message: `${lines.map((l) => `• ${l}`).join('<br />')}<br /><br /><strong>Không thể hoàn tác.</strong>`,
      okText: 'Reset toàn bộ',
    });
    if (!ok) return;

    const data = await A.run(resetBtn, msg, 'Đang reset...', () =>
      A.request('POST', '/api/admin/reset', { includeRooms, keepPinned, includeActivity })
    );
    if (!data) return;

    A.done(
      msg,
      data.roomsCleared
        ? 'Đã reset toàn bộ thành công! (kể cả tiến độ quiz và kết quả ghép phòng)'
        : 'Đã reset toàn bộ thành công! (kể cả tiến độ quiz)'
    );
    loadQuizLeaderboard();
    loadLobby();
  });

  /* ================= realtime & khoi dong ================= */

  if (A.socket) {
    A.socket.on('quiz:lobby', (payload) => {
      if (payload && Array.isArray(payload.members)) renderLobby('waiting', payload.members);
    });
    A.socket.on('quiz:started', loadLobby);
    A.socket.on('quiz:progress', () => {
      if (A.activeTab() === 'quiz') loadQuizLeaderboard();
    });
    A.socket.on('config:updated', () => {
      if (A.activeTab() === 'event') loadEventTime();
    });
  }

  A.onTab('event', loadEventTime);
  A.onTab('quiz', () => {
    loadLobby();
    loadQuizLeaderboard();
    applyLocks();
  });
  A.onSecretChange(applyLocks);

  loadEventTime();
  loadLobby();
  loadQuizLeaderboard();
})();
