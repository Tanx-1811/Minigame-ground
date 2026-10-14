// Trang "Vong Quiz": phong cho, bat dau lam bai, bang xep hang, chot Nhom Truong.
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="quiz"]');
  if (!panel) return;

  const quizLockNote = document.getElementById('quizLockNote');
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

  function applyLocks() {
    A.applyEditLock(panel, quizLockNote);
  }


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

  if (A.socket) {
    A.socket.on('quiz:lobby', (payload) => {
      if (payload && Array.isArray(payload.members)) renderLobby('waiting', payload.members);
    });
    A.socket.on('quiz:started', loadLobby);
    A.socket.on('quiz:progress', loadQuizLeaderboard);
  }

  A.onTab('quiz', () => {
    loadLobby();
    loadQuizLeaderboard();
    applyLocks();
  });
  A.onSecretChange(applyLocks);
})();
