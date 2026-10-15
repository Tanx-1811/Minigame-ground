/* ---------- vong quiz: chon Nhom Truong bang cau hoi truoc khi mo random ---------- */
/* Chay nhu classic script sau main.js, dung chung window.socket + cac ham dung chung
   (escapeHtml, showToast, playClick, playWin, playError, playTick, fetchJson, announce)
   da duoc main.js khai bao o pham vi global. */

(function () {
  const QUIZ_NAME_KEY = 'randomTeam_quizName';
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const NEXT_DELAY_MS = 1500;
  const WARN_SECONDS = 5;

  const $ = (id) => document.getElementById(id);
  const quizNamePick = $('quizNamePick');
  const quizMemberSelect = $('quizMemberSelect');
  const quizStartBtn = $('quizStartBtn');
  const quizRuleCount = $('quizRuleCount');
  const quizRuleLeaders = $('quizRuleLeaders');
  const quizWaiting = $('quizWaiting');
  const quizWaitingName = $('quizWaitingName');
  const quizWaitingCount = $('quizWaitingCount');
  const quizWaitingList = $('quizWaitingList');
  const quizChangeNameBtn = $('quizChangeNameBtn');
  const quizCountdownOverlay = $('quizCountdownOverlay');
  const quizCountdownNumber = $('quizCountdownNumber');
  const quizPlay = $('quizPlay');
  const quizProgressLabel = $('quizProgressLabel');
  const quizProgressScore = $('quizProgressScore');
  const quizProgressDots = $('quizProgressDots');
  const quizTimer = $('quizTimer');
  const quizTimerText = $('quizTimerText');
  const quizTimebar = $('quizTimebar');
  const quizTimebarFill = $('quizTimebarFill');
  const quizQuestionMeta = $('quizQuestionMeta');
  const quizQuestionText = $('quizQuestionText');
  const quizOptions = $('quizOptions');
  const quizFeedback = $('quizFeedback');
  const quizDone = $('quizDone');
  const quizMyScore = $('quizMyScore');
  const quizMyRank = $('quizMyRank');
  const quizMyTime = $('quizMyTime');
  const quizLeaderNote = $('quizLeaderNote');
  const quizLeaderboardList = $('quizLeaderboardList');

  if (!quizNamePick) return; // trang khong co man hinh quiz

  let step = 'pick';
  let questions = [];
  let answeredIds = new Set();
  let currentName = '';
  let currentQuestion = null;
  let questionShownAt = 0; // performance.now() luc hien cau hoi
  let elapsedOffset = 0; // ms da troi qua truoc do (F5 giua chung - lay tu may chu)
  let answering = false;
  let liveScore = 0;
  let myTimeMs = 0;
  let leaderCount = 4;
  let lastLeaderboard = [];

  // Moi timer deu giu o day de reset() / leave() don sach. Truoc day dem nguoc 3-2-1
  // va timeout chuyen cau van chay sau khi admin reset -> goi beginQuizFor('').
  let countdownTimer = null;
  let nextTimer = null;
  let questionTimer = null;
  // Tang moi lan reset: phan hoi mang ve tre cua phien cu bi bo qua
  let session = 0;

  function notify(message, type, opts) {
    if (typeof window.showToast === 'function') window.showToast(message, type, undefined, opts);
  }

  function notifyNetworkError() {
    notify('Không thể kết nối máy chủ', 'error', { key: 'net-error' });
  }

  function say(text) {
    if (typeof window.announce === 'function') window.announce(text);
  }

  function clearTimers() {
    clearInterval(countdownTimer);
    clearTimeout(nextTimer);
    clearInterval(questionTimer);
    countdownTimer = null;
    nextTimer = null;
    questionTimer = null;
    quizCountdownOverlay.classList.add('hidden');
  }

  function showStep(next) {
    step = next;
    quizNamePick.classList.toggle('hidden', next !== 'pick');
    quizWaiting.classList.toggle('hidden', next !== 'waiting');
    quizPlay.classList.toggle('hidden', next !== 'play');
    quizDone.classList.toggle('hidden', next !== 'done');
  }

  function formatSeconds(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    const s = ms / 1000;
    return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}p${String(Math.round(s % 60)).padStart(2, '0')}`;
  }

  function saveName(name) {
    try {
      if (name) localStorage.setItem(QUIZ_NAME_KEY, name);
      else localStorage.removeItem(QUIZ_NAME_KEY);
    } catch (err) {
      /* localStorage bi chan */
    }
  }

  function savedName() {
    try {
      return localStorage.getItem(QUIZ_NAME_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  /* ---------- thong tin luat choi ---------- */

  function renderRules() {
    quizRuleCount.textContent = questions.length
      ? `${questions.length} câu hỏi trắc nghiệm`
      : 'Trắc nghiệm nhiều lựa chọn';
    quizRuleLeaders.textContent = `Top ${leaderCount} điểm cao nhất làm Nhóm Trưởng`;
    quizLeaderNote.textContent = `Top ${leaderCount} khi Admin chốt sẽ trở thành Nhóm Trưởng.`;
  }

  async function loadQuestions() {
    const data = await fetchJson('/api/quiz/questions');
    questions = Array.isArray(data) ? data : [];
    renderRules();
  }

  async function loadMemberOptions() {
    try {
      const members = await fetchJson('/api/members?scope=quiz');
      const keep = quizMemberSelect.value || savedName();
      quizMemberSelect.replaceChildren(
        new Option('-- Chọn tên --', ''),
        ...members.map((m) => new Option(m.name, m.name))
      );
      if (keep && members.some((m) => m.name === keep)) quizMemberSelect.value = keep;
    } catch (err) {
      console.error(err);
    }
  }

  /* ---------- phong cho ---------- */

  function renderWaitingList(members) {
    const list = Array.isArray(members) ? members : [];
    quizWaitingCount.textContent = `${list.length} người đã sẵn sàng`;
    quizWaitingList.innerHTML = list.length
      ? list
          .map(
            (name) =>
              `<li class="quiz-waiting-chip${name === currentName ? ' is-me' : ''}">${escapeHtml(name)}${
                name === currentName ? ' <small>(bạn)</small>' : ''
              }</li>`
          )
          .join('')
      : '<li class="quiz-waiting-empty">Chưa có ai tham gia...</li>';
  }

  // Vao phong cho thay vi lam bai ngay: doi admin bam bat dau (hoac quiz da active
  // tu truoc, vd nguoi vao tre / F5 lai trang) thi moi thuc su vao cau hoi.
  async function joinQuizLobby(name) {
    const mySession = session;
    currentName = name;
    saveName(name);
    quizStartBtn.disabled = true;

    try {
      const data = await fetchJson('/api/quiz/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (mySession !== session) return;

      if (data.status === 'active') {
        await beginQuizFor(name);
        return;
      }

      quizWaitingName.textContent = name;
      renderWaitingList(data.members);
      showStep('waiting');
      say(`Đã vào phòng chờ với tên ${name}. Đợi Admin bắt đầu.`);
    } catch (err) {
      if (mySession !== session) return;
      // Ten da luu khong con hop le (bi xoa / bi loai khoi quiz) -> quen di
      if (err.status === 404 || err.status === 403) {
        saveName('');
        currentName = '';
        showStep('pick');
      }
      if (err.status) notify(err.message, 'error');
      else notifyNetworkError();
    } finally {
      quizStartBtn.disabled = false;
    }
  }

  function runStartCountdown(delayMs) {
    clearInterval(countdownTimer);
    const endAt = performance.now() + Math.max(0, Math.min(delayMs, 10000));
    quizCountdownOverlay.classList.remove('hidden');
    if (typeof window.playClick === 'function') window.playClick();
    let lastShown = null;
    const mySession = session;

    function tick() {
      const remainingMs = endAt - performance.now();
      const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
      if (secondsLeft !== lastShown) {
        lastShown = secondsLeft;
        quizCountdownNumber.textContent = secondsLeft > 0 ? String(secondsLeft) : 'Bắt đầu!';
        // chay lai animation moi giay de so "nhay" lai tu dau
        quizCountdownNumber.style.animation = 'none';
        void quizCountdownNumber.offsetWidth;
        quizCountdownNumber.style.animation = '';
        if (secondsLeft > 0 && typeof window.playTick === 'function') window.playTick();
      }

      // Giu chu "Bat dau!" them mot nhip ngan roi moi vao cau hoi
      if (remainingMs <= -350) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        quizCountdownOverlay.classList.add('hidden');
        if (mySession !== session || !currentName) return;
        if (typeof window.playWin === 'function') window.playWin();
        beginQuizFor(currentName);
      }
    }

    tick();
    countdownTimer = setInterval(tick, 100);
  }

  /* ---------- lam bai ---------- */

  function findNextQuestion() {
    return questions.find((q) => !answeredIds.has(q.id));
  }

  function renderProgress(activeIdx) {
    quizProgressLabel.textContent = `Câu ${activeIdx + 1}/${questions.length}`;
    quizProgressScore.textContent = `${liveScore} điểm`;
    quizProgressDots.innerHTML = questions
      .map((q, i) => {
        const state = answeredIds.has(q.id) ? 'done' : i === activeIdx ? 'current' : '';
        return `<span class="quiz-progress-dot ${state}"></span>`;
      })
      .join('');
  }

  function setOptionsDisabled(disabled) {
    quizOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
      btn.disabled = disabled;
    });
  }

  function elapsedNow() {
    return Math.max(0, performance.now() - questionShownAt + elapsedOffset);
  }

  function stopQuestionTimer() {
    clearInterval(questionTimer);
    questionTimer = null;
  }

  // Dong ho tung cau: hien so giay con lai + thanh thoi gian, 5 giay cuoi doi mau va
  // keu tick, het gio thi tu nop "chua chon" (may chu tinh la sai).
  function startQuestionTimer(q) {
    stopQuestionTimer();
    const limitMs = q.timeLimitSec ? q.timeLimitSec * 1000 : 0;
    quizTimer.classList.toggle('hidden', !limitMs);
    quizTimebar.classList.toggle('hidden', !limitMs);
    quizTimer.classList.remove('is-warn');
    quizTimebar.classList.remove('is-warn');
    if (!limitMs) return;

    let lastSecond = null;
    const tick = () => {
      if (currentQuestion !== q || answering) return;
      const left = Math.max(0, limitMs - elapsedNow());
      const seconds = Math.ceil(left / 1000);
      quizTimerText.textContent = String(seconds);
      quizTimebarFill.style.width = `${(left / limitMs) * 100}%`;
      const warn = seconds <= WARN_SECONDS;
      quizTimer.classList.toggle('is-warn', warn);
      quizTimebar.classList.toggle('is-warn', warn);
      if (seconds !== lastSecond) {
        if (warn && seconds > 0 && typeof window.playTick === 'function') window.playTick();
        if (seconds === WARN_SECONDS) say(`Còn ${WARN_SECONDS} giây`);
        lastSecond = seconds;
      }
      if (left <= 0) {
        stopQuestionTimer();
        submitAnswer(q, -1);
      }
    };
    tick();
    questionTimer = setInterval(tick, 200);
  }

  function renderQuestion(q) {
    const mySession = session;
    currentQuestion = q;
    answering = false;
    elapsedOffset = 0;
    const idx = questions.findIndex((x) => x.id === q.id);
    renderProgress(idx);

    const meta = [`${q.points || 1} điểm`];
    if (q.timeLimitSec) meta.push(`${q.timeLimitSec} giây`);
    quizQuestionMeta.textContent = meta.join(' · ');
    quizQuestionText.textContent = q.text;
    quizFeedback.classList.add('hidden');
    quizOptions.classList.toggle('is-many', q.options.length > 4);
    quizOptions.innerHTML = q.options
      .map(
        (opt, i) => `
        <button type="button" class="quiz-option-btn" data-index="${i}">
          <span class="quiz-option-letter">${LETTERS[i] || i + 1}</span>
          <span class="quiz-option-text">${escapeHtml(opt)}</span>
          <span class="quiz-option-mark" aria-hidden="true"></span>
        </button>`
      )
      .join('');
    questionShownAt = performance.now();

    quizOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => submitAnswer(q, Number(btn.dataset.index)));
    });

    // Bao may chu "dang xem cau nay": may chu giu moc lan dau, F5 giua chung thi
    // dong ho tiep tuc tu cho cu thay vi chay lai tu dau.
    startQuestionTimer(q);
    fetchJson('/api/quiz/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: currentName, questionId: q.id }),
    })
      .then((data) => {
        if (mySession !== session || currentQuestion !== q || answering) return;
        const serverElapsed = Number(data && data.elapsedMs) || 0;
        const localElapsed = performance.now() - questionShownAt;
        // Chi tinh phan da troi qua TRUOC lan hien nay (vd truoc khi F5)
        elapsedOffset = Math.max(0, serverElapsed - localElapsed);
        startQuestionTimer(q);
      })
      .catch(() => {
        /* khong ghi duoc moc thi van lam bai binh thuong theo dong ho cuc bo */
      });

    const firstBtn = quizOptions.querySelector('.quiz-option-btn');
    if (firstBtn && document.activeElement && document.activeElement.closest('#quizOptions, #quizPlay')) {
      firstBtn.focus();
    }
  }

  function showNextOrDone() {
    const next = findNextQuestion();
    if (next) {
      renderQuestion(next);
    } else {
      showDone();
    }
  }

  async function submitAnswer(question, selectedIndex) {
    if (answering || currentQuestion !== question) return;
    answering = true;
    stopQuestionTimer();
    const mySession = session;
    const timeMs = Math.round(elapsedNow());
    setOptionsDisabled(true);
    if (selectedIndex >= 0) {
      const picked = quizOptions.querySelector(`[data-index="${selectedIndex}"]`);
      if (picked) picked.classList.add('is-picked');
    }

    try {
      const data = await fetchJson('/api/quiz/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentName, questionId: question.id, selectedIndex, timeMs }),
      });
      if (mySession !== session) return;

      answeredIds.add(question.id);
      liveScore = data.myScore;
      myTimeMs = data.myTimeMs || myTimeMs;
      quizProgressScore.textContent = `${liveScore} điểm`;
      quizOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
        const idx = Number(btn.dataset.index);
        const mark = btn.querySelector('.quiz-option-mark');
        btn.classList.remove('is-picked');
        if (idx === data.correctIndex) {
          btn.classList.add('correct');
          if (mark) mark.textContent = '✓';
        } else if (idx === selectedIndex) {
          btn.classList.add('wrong');
          if (mark) mark.textContent = '✗';
        }
      });

      if (data.correct) {
        if (typeof window.playWin === 'function') window.playWin();
      } else if (typeof window.playError === 'function') {
        window.playError();
      }

      const correctText = question.options[data.correctIndex];
      // textContent: khong escape lan nua (truoc day "&" hien thanh "&amp;")
      quizFeedback.textContent = data.correct
        ? `✅ Chính xác! +${question.points || 1} điểm`
        : data.timedOut
          ? `⏰ Hết giờ! Đáp án đúng: ${correctText}`
          : `❌ Sai rồi! Đáp án đúng: ${correctText}`;
      quizFeedback.className = `quiz-feedback ${data.correct ? 'ok' : 'error'}`;
      renderProgress(questions.findIndex((x) => x.id === question.id));

      nextTimer = setTimeout(() => {
        if (mySession !== session) return;
        showNextOrDone();
      }, NEXT_DELAY_MS);
    } catch (err) {
      if (mySession !== session) return;
      if (err.status === 403) {
        // Quiz chua mo / da ket thuc / bi loai: dong bo lai thay vi ket o cau nay
        notify(err.message, 'error');
        resync();
        return;
      }
      if (err.status === 404) {
        // Cau hoi vua bi admin xoa -> tai lai bo cau hoi va lam tiep
        notify('Câu hỏi này vừa được Admin thay đổi — chuyển sang câu tiếp theo', 'info');
        await refreshPlayState();
        return;
      }
      if (err.status) notify(err.message, 'error');
      else notifyNetworkError();
      answering = false;
      setOptionsDisabled(false);
      quizOptions.querySelectorAll('.is-picked').forEach((b) => b.classList.remove('is-picked'));
      startQuestionTimer(question);
    }
  }

  /* ---------- xong bai + bang xep hang ---------- */

  function renderLeaderboard(rows) {
    lastLeaderboard = Array.isArray(rows) ? rows : [];
    const finished = lastLeaderboard.filter((r) => r.finished);
    const list = finished.length ? finished : lastLeaderboard;

    const myIdx = list.findIndex((r) => r.name === currentName);
    quizMyRank.textContent = myIdx >= 0 ? `#${myIdx + 1}` : '—';

    if (!list.length) {
      quizLeaderboardList.innerHTML = '<li class="quiz-leaderboard-empty">Chưa có dữ liệu</li>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    const shown = Math.max(leaderCount + 2, 6);
    quizLeaderboardList.innerHTML = list
      .slice(0, shown)
      .map((r, i) => {
        const isMe = r.name === currentName;
        const isTop = i < leaderCount;
        return `
        <li class="quiz-leaderboard-row${isTop ? ' is-top' : ''}${isMe ? ' is-me' : ''}">
          <span class="quiz-leaderboard-rank">${medals[i] || i + 1}</span>
          <span class="quiz-leaderboard-name">${escapeHtml(r.name)}${isMe ? ' <small>(bạn)</small>' : ''}</span>
          <span class="quiz-leaderboard-time num">${formatSeconds(r.timeMs)}</span>
          <span class="quiz-leaderboard-score num">${r.score} đ</span>
        </li>`;
      })
      .join('');
    if (myIdx >= shown) {
      quizLeaderboardList.insertAdjacentHTML(
        'beforeend',
        `<li class="quiz-leaderboard-row is-me"><span class="quiz-leaderboard-rank">${myIdx + 1}</span><span class="quiz-leaderboard-name">${escapeHtml(
          currentName
        )} <small>(bạn)</small></span><span class="quiz-leaderboard-time num">${formatSeconds(
          list[myIdx].timeMs
        )}</span><span class="quiz-leaderboard-score num">${list[myIdx].score} đ</span></li>`
      );
    }
  }

  async function refreshLeaderboard() {
    try {
      renderLeaderboard(await fetchJson('/api/quiz/leaderboard'));
    } catch (err) {
      console.error(err);
    }
  }

  function showDone() {
    stopQuestionTimer();
    currentQuestion = null;
    quizMyScore.textContent = String(liveScore);
    quizMyTime.textContent = formatSeconds(myTimeMs);
    showStep('done');
    refreshLeaderboard();
    say(`Bạn đã hoàn thành với ${liveScore} điểm.`);
  }

  /* ---------- vao bai / dong bo ---------- */

  async function beginQuizFor(name) {
    if (!name) return;
    const mySession = session;
    currentName = name;
    saveName(name);

    try {
      const [state] = await Promise.all([
        fetchJson(`/api/quiz/state?name=${encodeURIComponent(name)}`),
        loadQuestions(),
      ]);
      if (mySession !== session) return;

      answeredIds = new Set(state.answeredIds);
      liveScore = state.score;
      myTimeMs = state.timeMs || 0;
      if (state.leaderCount) leaderCount = state.leaderCount;
      renderRules();

      if (state.finished || !questions.length) {
        showDone();
        return;
      }
      if (state.status !== 'active') {
        // Chua bat dau (hoac admin vua reset) -> ve phong cho
        await joinQuizLobby(name);
        return;
      }

      showStep('play');
      showNextOrDone();
    } catch (err) {
      if (mySession !== session) return;
      console.error(err);
      if (err.status === 404) {
        saveName('');
        currentName = '';
        showStep('pick');
        notify(err.message, 'error');
        return;
      }
      notifyNetworkError();
    }
  }

  // Admin them / sua / xoa cau hoi giua chung: tai lai bo cau hoi + tien do, cau
  // dang lam bi xoa thi chuyen sang cau ke; vua them cau moi thi quay lai lam tiep.
  async function refreshPlayState() {
    if (!currentName) return;
    const mySession = session;
    try {
      const [state] = await Promise.all([
        fetchJson(`/api/quiz/state?name=${encodeURIComponent(currentName)}`),
        loadQuestions(),
      ]);
      if (mySession !== session) return;
      answeredIds = new Set(state.answeredIds);
      liveScore = state.score;
      myTimeMs = state.timeMs || 0;

      if (step === 'done') {
        if (!state.finished && questions.length && state.status === 'active') {
          notify('Admin vừa thêm câu hỏi mới — làm tiếp nhé!', 'info');
          showStep('play');
          showNextOrDone();
        } else {
          quizMyScore.textContent = String(liveScore);
          refreshLeaderboard();
        }
        return;
      }

      if (step === 'play') {
        const stillThere = currentQuestion && questions.find((q) => q.id === currentQuestion.id);
        if (stillThere && !answeredIds.has(stillThere.id) && !answering) {
          // Cau dang lam van con: cap nhat noi dung neu admin vua sua, giu dong ho
          if (stillThere.text !== currentQuestion.text || JSON.stringify(stillThere.options) !== JSON.stringify(currentQuestion.options)) {
            renderQuestion(stillThere);
          } else {
            renderProgress(questions.findIndex((q) => q.id === stillThere.id));
          }
          return;
        }
        if (!answering) showNextOrDone();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Goi khi ket noi lai / quay lai tab: co the da bo lo quiz:started, quiz:lobby...
  async function resync() {
    if (quizScreenHidden() || !currentName) {
      return;
    }
    const mySession = session;
    try {
      if (step === 'waiting') {
        const lobby = await fetchJson('/api/quiz/lobby');
        if (mySession !== session) return;
        if (lobby.status === 'active') {
          await beginQuizFor(currentName);
        } else if (!lobby.members.includes(currentName)) {
          // Server khoi dong lai lam mat danh sach phong cho -> vao lai
          await joinQuizLobby(currentName);
        } else {
          renderWaitingList(lobby.members);
        }
        return;
      }
      if (step === 'play' || step === 'done') {
        await refreshPlayState();
      }
    } catch (err) {
      console.error(err);
    }
  }

  function quizScreenHidden() {
    const screen = document.getElementById('quizScreen');
    return !screen || screen.classList.contains('hidden');
  }

  /* ---------- su kien nguoi dung ---------- */

  quizStartBtn.addEventListener('click', () => {
    const name = quizMemberSelect.value;
    if (!name) {
      notify('Vui lòng chọn tên của bạn trước khi bắt đầu', 'error');
      quizMemberSelect.focus();
      return;
    }
    if (typeof window.playClick === 'function') window.playClick();
    joinQuizLobby(name);
  });

  quizChangeNameBtn.addEventListener('click', () => {
    if (typeof window.playClick === 'function') window.playClick();
    session += 1;
    clearTimers();
    saveName('');
    currentName = '';
    quizMemberSelect.value = '';
    showStep('pick');
    quizMemberSelect.focus();
  });

  /* ---------- realtime ---------- */

  if (window.socket) {
    window.socket.on('quiz:progress', (payload) => {
      if (step !== 'done') return;
      if (payload && Array.isArray(payload.leaderboard)) {
        renderLeaderboard(payload.leaderboard);
      } else {
        refreshLeaderboard();
      }
    });

    window.socket.on('quiz:lobby', (payload) => {
      if (step !== 'waiting') return;
      if (payload && Array.isArray(payload.members)) {
        renderWaitingList(payload.members);
      }
    });

    window.socket.on('quiz:started', (payload) => {
      // Chi nguoi dang o phong cho moi bi keo vao dem nguoc. Dung delayMs (dem bang
      // dong ho cua chinh may nay) thay vi startAt tuyet doi - dien thoai lech gio
      // 30 giay se dem nguoc 33 giay.
      if (step !== 'waiting' || !currentName || quizScreenHidden()) return;
      let delayMs = payload && Number.isFinite(payload.delayMs) ? payload.delayMs : null;
      if (delayMs === null) {
        const startAtMs = payload && payload.startAt ? new Date(payload.startAt).getTime() : Date.now();
        delayMs = Math.max(0, Math.min(startAtMs - Date.now(), 5000));
      }
      runStartCountdown(delayMs);
    });

    window.socket.on('questions:updated', () => {
      if (quizScreenHidden()) return;
      if (step === 'pick' || step === 'waiting') {
        loadQuestions().catch(() => {});
        return;
      }
      refreshPlayState();
    });

    window.socket.on('members:updated', () => {
      if (step === 'pick' && !quizScreenHidden()) loadMemberOptions();
    });
  }

  if (window.UiConfig && window.UiConfig.ready) {
    window.UiConfig.ready.then((config) => {
      if (config && config.leaderCount) {
        leaderCount = config.leaderCount;
        renderRules();
      }
    });
  }
  window.addEventListener('beforeunload', () => stopQuestionTimer());

  // Admin reset -> xoa sach tien do trong bo nho va moi timer dang chay
  function resetQuizState() {
    session += 1;
    clearTimers();
    questions = [];
    answeredIds = new Set();
    currentName = '';
    currentQuestion = null;
    questionShownAt = 0;
    elapsedOffset = 0;
    answering = false;
    liveScore = 0;
    myTimeMs = 0;

    quizOptions.innerHTML = '';
    quizFeedback.classList.add('hidden');
    quizMemberSelect.value = '';
    quizStartBtn.disabled = false;
    showStep('pick');
  }

  window.QuizUI = {
    enter() {
      showStep('pick');
      loadMemberOptions();
      loadQuestions().catch(() => {});
      const name = savedName();
      if (name) {
        joinQuizLobby(name);
      }
    },
    // Roi man quiz (vd vong random vua mo): dung moi timer, giu ten de dien san
    leave() {
      session += 1;
      clearTimers();
      currentQuestion = null;
    },
    reset: resetQuizState,
    resync,
    currentName() {
      return currentName || savedName();
    },
  };
})();
