// Trang "Vong Quiz": phong cho, bat dau lam bai, bang xep hang, chot Nhom Truong.
//
// Nut "Bat dau" chi bat khi dang o giai doan Quiz, co cau hoi va chua bat dau.
// Bang xep hang lay thang tu su kien quiz:progress (kem san leaderboard), khong
// phai tai lai; nguoi duoc to vang = top N (N = so Nhom Truong trong Cau hinh).
(function () {
  const A = window.AdminCommon;

  const panel = document.querySelector('.admin-panel[data-panel="quiz"]');
  if (!panel) return;

  const quizLockNote = document.getElementById('quizLockNote');
  const quizStats = document.getElementById('quizStats');
  const lobbyStatusText = document.getElementById('lobbyStatusText');
  const lobbyMembersList = document.getElementById('lobbyMembersList');
  const startQuizBtn = document.getElementById('startQuizBtn');
  const startHint = document.getElementById('startHint');
  const lobbyMsg = document.getElementById('lobbyMsg');
  const refreshQuizBtn = document.getElementById('refreshQuizBtn');
  const finishQuizBtn = document.getElementById('finishQuizBtn');
  const finishHint = document.getElementById('finishHint');
  const forceFinishCheckbox = document.getElementById('forceFinishCheckbox');
  const resetLeadersBtn = document.getElementById('resetLeadersBtn');
  const quizAdminLeaderboard = document.getElementById('quizAdminLeaderboard');
  const boardLegend = document.getElementById('quizBoardLegend');
  const quizMsg = document.getElementById('quizMsg');

  const state = { phase: 'quiz', status: 'waiting', leaderCount: 4, questions: 0, leaders: [], ready: false };
  let lobby = [];
  let board = [];

  /* ---------- trang thai chung ---------- */

  function renderStats() {
    if (!state.ready) return;
    const finished = board.filter((r) => r.finished).length;
    const phaseView =
      state.phase === 'random'
        ? { value: 'Đã chốt', sub: state.questions ? 'Vòng Random đang mở' : 'Không có câu hỏi — bỏ qua Quiz', variant: 'ok' }
        : state.status === 'active'
        ? { value: 'Đang làm bài', sub: 'Phòng chờ đã đóng', variant: 'accent' }
        : { value: 'Đang chờ', sub: 'Chưa bấm bắt đầu', variant: 'warn' };

    quizStats.innerHTML = [
      A.statTile({ icon: 'git-branch', label: 'Trạng thái', ...phaseView }),
      A.statTile({ icon: 'door-open', label: 'Phòng chờ', value: lobby.length, sub: 'người đã sẵn sàng' }),
      A.statTile({
        icon: 'circle-help',
        label: 'Câu hỏi',
        value: state.questions,
        sub: state.questions ? 'Sửa ở trang Câu hỏi' : 'Chưa có câu nào',
        variant: state.questions ? '' : 'danger',
      }),
      A.statTile({
        icon: 'crown',
        label: 'Làm xong / cần chốt',
        value: `${finished}/${state.leaderCount}`,
        sub: finished >= state.leaderCount ? 'Đủ người để chốt' : `Còn thiếu ${state.leaderCount - finished} người`,
        variant: 'gold',
        meter: { value: Math.min(finished, state.leaderCount), total: state.leaderCount, variant: finished >= state.leaderCount ? 'ok' : 'warn' },
      }),
    ].join('');
  }

  function syncButtons() {
    const noQuestions = state.questions === 0;
    const chosen = state.phase === 'random';
    const active = state.status === 'active';

    let startReason = '';
    if (noQuestions) startReason = 'Chưa có câu hỏi nào — thêm câu hỏi ở trang Câu hỏi trước.';
    else if (chosen) startReason = 'Đã chốt Nhóm Trưởng. Muốn chơi lại thì bấm "Làm lại vòng Quiz từ đầu" ở dưới.';
    else if (active) startReason = 'Quiz đang diễn ra — người vào sau sẽ làm bài ngay, không cần chờ.';
    startHint.textContent = startReason;
    A.setAllowed(startQuizBtn, state.ready && !startReason);

    let finishReason = '';
    if (noQuestions) finishReason = 'Chưa có câu hỏi nào để chấm điểm.';
    else if (chosen) finishReason = 'Đã chốt rồi. Muốn chốt lại thì làm lại vòng Quiz từ đầu.';
    finishHint.textContent = finishReason;
    A.setAllowed(finishQuizBtn, state.ready && !finishReason);
    A.setAllowed(forceFinishCheckbox, state.ready && !finishReason);
  }

  function applyLocks() {
    A.applyEditLock(panel, quizLockNote);
    syncButtons();
  }

  /* ---------- phong cho ---------- */

  function renderLobby() {
    const active = state.status === 'active';
    lobbyStatusText.innerHTML = active
      ? `${A.icon('circle-check')} Quiz đã bắt đầu`
      : `${A.icon('hourglass')} ${lobby.length} người đã sẵn sàng`;
    lobbyStatusText.className = `admin-chip ${active ? 'is-ok' : ''}`;

    lobbyMembersList.innerHTML = lobby.length
      ? lobby
          .map(
            (name, i) =>
              `<li><span class="admin-list-rank">${i + 1}</span><span class="admin-list-name">${A.escapeHtml(
                name
              )}</span><span class="admin-list-value">sẵn sàng</span></li>`
          )
          .join('')
      : `<li class="admin-list-empty">${A.icon('inbox')} Chưa có ai vào phòng chờ</li>`;
  }

  /* ---------- bang xep hang ---------- */

  function renderBoard() {
    const leaderNames = new Set(state.leaders.map((l) => l.name));
    // Truoc khi chot: top N trong so nguoi DA LAM XONG (dung cach server chon)
    const projected =
      state.phase === 'random'
        ? leaderNames
        : new Set(
            board
              .filter((r) => r.finished)
              .slice(0, state.leaderCount)
              .map((r) => r.name)
          );

    boardLegend.textContent =
      state.phase === 'random'
        ? `Tô vàng: ${leaderNames.size} Nhóm Trưởng đã chốt.`
        : `Tô vàng: ${state.leaderCount} người làm xong có điểm cao nhất — sẽ thành Nhóm Trưởng nếu chốt lúc này.`;

    if (!board.length) {
      quizAdminLeaderboard.innerHTML = `<li class="admin-list-empty">${A.icon('trophy')} Chưa có ai làm quiz</li>`;
      return;
    }

    quizAdminLeaderboard.innerHTML = board
      .map((r, i) => {
        const winner = projected.has(r.name);
        return `
          <li class="${winner ? 'is-winner' : ''}">
            <span class="admin-list-rank">${i + 1}</span>
            <span class="admin-list-name">${winner ? A.icon('crown', 'ic-sm') : ''} ${A.escapeHtml(r.name)}${
          r.finished ? '' : ` <em class="admin-list-note">(${r.answered}/${state.questions || '?'} câu)</em>`
        }</span>
            <span class="admin-list-value">${r.score} điểm · ${(r.timeMs / 1000).toFixed(1)}s</span>
          </li>`;
      })
      .join('');
  }

  /* ---------- tai du lieu ---------- */

  const loadAll = A.serial(async () => {
    try {
      const [lobbyRes, boardRes, config, questions] = await Promise.all([
        fetch('/api/quiz/lobby').then((r) => r.json()),
        fetch('/api/quiz/leaderboard').then((r) => r.json()),
        fetch('/api/config').then((r) => r.json()),
        A.canEdit()
          ? A.request('GET', '/api/admin/settings').then((s) => ({ count: s.counts.questions, leaderCount: s.leaderCount }))
          : fetch('/api/quiz/questions').then((r) => r.json()).then((list) => ({ count: list.length })),
      ]);

      lobby = Array.isArray(lobbyRes.members) ? lobbyRes.members : [];
      board = Array.isArray(boardRes) ? boardRes : [];
      state.phase = config.phase;
      state.status = lobbyRes.status || config.quizStatus;
      state.leaderCount = questions.leaderCount || config.leaderCount || 4;
      state.leaders = config.leaders || [];
      state.questions = questions.count;
      state.ready = true;

      renderLobby();
      renderBoard();
      renderStats();
    } catch (err) {
      A.setMsg(quizMsg, 'Không thể tải trạng thái vòng Quiz', 'err');
    }
    applyLocks();
  });

  /* ---------- thao tac ---------- */

  startQuizBtn.addEventListener('click', async () => {
    const ok = await A.confirmAction({
      title: 'Bắt đầu làm bài',
      message: `Bắt đầu làm bài Quiz cho <strong>${lobby.length} người</strong> đang chờ trong phòng chờ?<br />Mọi người sẽ thấy đếm ngược 3 giây rồi vào câu hỏi đầu tiên cùng lúc.`,
      okText: 'Bắt đầu',
      danger: false,
    });
    if (!ok) return;

    const data = await A.run(startQuizBtn, lobbyMsg, 'Đang bắt đầu...', () => A.request('POST', '/api/admin/quiz/start', {}));
    if (!data) return;

    A.done(
      lobbyMsg,
      data.alreadyStarted ? 'Quiz đã được bắt đầu từ trước.' : 'Đã bắt đầu! Mọi người trong phòng chờ sẽ thấy đếm ngược 3 giây.'
    );
    state.status = 'active';
    syncButtons();
    scheduleLoad();
  });

  refreshQuizBtn.addEventListener('click', () => A.run(refreshQuizBtn, null, '', loadAll));

  finishQuizBtn.addEventListener('click', async () => {
    const force = forceFinishCheckbox.checked;
    const finished = board.filter((r) => r.finished).length;
    const ok = await A.confirmAction({
      title: 'Chốt Nhóm Trưởng',
      message: `${
        force
          ? `Chốt <strong>${state.leaderCount} Nhóm Trưởng</strong> dựa trên điểm hiện tại, <strong>kể cả người chưa làm xong</strong>`
          : `Chốt <strong>${state.leaderCount} Nhóm Trưởng</strong> trong số ${finished} người đã làm xong`
      } và mở vòng Random cho mọi người?<br />Ai đang làm quiz dở sẽ được chuyển sang màn chia nhóm.`,
      okText: 'Chốt ngay',
      danger: false,
    });
    if (!ok) return;

    const data = await A.run(finishQuizBtn, quizMsg, 'Đang chốt...', () => A.request('POST', '/api/admin/quiz/finish', { force }));
    if (!data) return;

    const names = (data.leaders || []).map((l) => l.name).join(', ');
    A.done(quizMsg, data.alreadyFinished ? `Đã chốt từ trước: ${names}` : `Đã chốt Nhóm Trưởng: ${names}. Vòng Random đã mở!`);
    state.phase = 'random';
    state.leaders = data.leaders || [];
    syncButtons();
    renderBoard();
    scheduleLoad();
  });

  resetLeadersBtn.addEventListener('click', async () => {
    const ok = await A.confirmAction({
      title: 'Làm lại vòng Quiz',
      message:
        '<strong>Xóa toàn bộ điểm quiz, câu trả lời</strong> và bỏ chốt Nhóm Trưởng hiện tại để mọi người làm lại quiz từ đầu?<br />Phòng chờ được làm trống, ai đang mở trang sẽ quay về màn Quiz. Kết quả chia nhóm không bị ảnh hưởng.<br /><br /><strong>Không thể hoàn tác.</strong>',
      okText: 'Làm lại từ đầu',
    });
    if (!ok) return;

    const data = await A.run(resetLeadersBtn, quizMsg, 'Đang reset vòng Quiz...', () => A.request('POST', '/api/admin/quiz/reset', {}));
    if (!data) return;

    A.done(quizMsg, 'Đã reset vòng chọn Nhóm Trưởng! Mọi người sẽ làm lại quiz từ đầu.');
    forceFinishCheckbox.checked = false;
    scheduleLoad();
  });

  /* ---------- realtime ---------- */

  if (A.socket) {
    A.socket.on('quiz:lobby', (payload) => {
      if (!payload || !Array.isArray(payload.members)) return;
      lobby = payload.members;
      renderLobby();
      renderStats();
    });

    // Moi luot tra loi da kem san bang xep hang -> ve thang, khong goi lai API
    A.socket.on('quiz:progress', (payload) => {
      if (!payload || !Array.isArray(payload.leaderboard)) {
        scheduleLoad();
        return;
      }
      board = payload.leaderboard;
      renderBoard();
      renderStats();
    });
  }

  // Tab admin khac bam bat dau / chot / lam lai, hoac doi cau hinh -> tai lai trang thai
  const scheduleLoad = A.onLive(
    ['quiz:started', 'phase:updated', 'groups:reset', 'settings:updated', 'questions:updated', 'members:updated'],
    loadAll
  );

  A.onTab('quiz', loadAll);
})();
