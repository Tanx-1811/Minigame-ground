/* ---------- quiz phase: chon 4 nhom truong bang cau hoi truoc khi mo random ---------- */
/* Chay nhu classic script sau main.js, dung chung window.socket + cac ham dung chung
   (escapeHtml, showToast, playClick, playWin, playError) da duoc main.js khai bao o pham vi global. */

(function () {
  const QUIZ_NAME_KEY = 'randomTeam_quizName';

  const quizNamePick = document.getElementById('quizNamePick');
  const quizMemberSelect = document.getElementById('quizMemberSelect');
  const quizStartBtn = document.getElementById('quizStartBtn');
  const quizPlay = document.getElementById('quizPlay');
  const quizProgressLabel = document.getElementById('quizProgressLabel');
  const quizProgressScore = document.getElementById('quizProgressScore');
  const quizProgressDots = document.getElementById('quizProgressDots');
  const quizQuestionText = document.getElementById('quizQuestionText');
  const quizOptions = document.getElementById('quizOptions');
  const quizFeedback = document.getElementById('quizFeedback');
  const quizDone = document.getElementById('quizDone');
  const quizMyScore = document.getElementById('quizMyScore');
  const quizLeaderboardList = document.getElementById('quizLeaderboardList');

  if (!quizNamePick) return; // trang khong co man hinh quiz (vd admin-reset.html)

  let questions = [];
  let answeredIds = new Set();
  let currentName = '';
  let questionShownAt = 0;
  let answering = false;
  let liveScore = 0;

  const OPTION_MARKS = { correct: '✓', wrong: '✗' };

  function notify(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else {
      alert(message);
    }
  }

  function showStep(step) {
    quizNamePick.classList.toggle('hidden', step !== 'pick');
    quizPlay.classList.toggle('hidden', step !== 'play');
    quizDone.classList.toggle('hidden', step !== 'done');
  }

  async function loadMemberOptions() {
    try {
      const res = await fetch('/api/members');
      const members = await res.json();
      quizMemberSelect.innerHTML =
        '<option value="">-- Chọn tên --</option>' +
        members.map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
      const savedName = localStorage.getItem(QUIZ_NAME_KEY);
      if (savedName) quizMemberSelect.value = savedName;
    } catch (err) {
      console.error(err);
    }
  }

  async function loadQuestions() {
    const res = await fetch('/api/quiz/questions');
    questions = await res.json();
  }

  function findNextQuestion() {
    return questions.find((q) => !answeredIds.has(q.id));
  }

  function renderLeaderboard(rows) {
    if (!rows.length) {
      quizLeaderboardList.innerHTML = '<li class="quiz-leaderboard-empty">Chưa có dữ liệu</li>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉', '🎖️'];
    quizLeaderboardList.innerHTML = rows
      .slice(0, 4)
      .map(
        (r, i) => `
        <li class="quiz-leaderboard-row">
          <span class="quiz-leaderboard-rank">${medals[i] || i + 1}</span>
          <span class="quiz-leaderboard-name">${escapeHtml(r.name)}</span>
          <span class="quiz-leaderboard-score">${r.score} điểm</span>
        </li>`
      )
      .join('');
  }

  async function refreshLeaderboard() {
    try {
      const res = await fetch('/api/quiz/leaderboard');
      const rows = await res.json();
      renderLeaderboard(rows);
    } catch (err) {
      console.error(err);
    }
  }

  function renderProgress(activeIdx) {
    quizProgressLabel.textContent = `Câu ${activeIdx + 1}/${questions.length}`;
    quizProgressScore.textContent = `${liveScore} điểm`;
    quizProgressDots.innerHTML = questions
      .map((q, i) => {
        const state = i < activeIdx ? 'done' : i === activeIdx ? 'current' : '';
        return `<span class="quiz-progress-dot ${state}"></span>`;
      })
      .join('');
  }

  function renderQuestion(q) {
    const idx = questions.findIndex((x) => x.id === q.id);
    renderProgress(idx);
    quizQuestionText.textContent = q.text;
    quizFeedback.classList.add('hidden');
    const letters = ['A', 'B', 'C', 'D'];
    quizOptions.innerHTML = q.options
      .map(
        (opt, i) => `
        <button type="button" class="quiz-option-btn" data-index="${i}">
          <span class="quiz-option-letter">${letters[i] || i + 1}</span>
          <span class="quiz-option-text">${escapeHtml(opt)}</span>
          <span class="quiz-option-mark"></span>
        </button>`
      )
      .join('');
    questionShownAt = performance.now();
    answering = false;

    quizOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => submitAnswer(q, Number(btn.dataset.index)));
    });
  }

  async function submitAnswer(question, selectedIndex) {
    if (answering) return;
    answering = true;
    const timeMs = Math.round(performance.now() - questionShownAt);
    quizOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
      btn.disabled = true;
    });

    try {
      const res = await fetch('/api/quiz/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentName, questionId: question.id, selectedIndex, timeMs }),
      });
      const data = await res.json();

      if (!res.ok) {
        notify(data.error || 'Có lỗi xảy ra', 'error');
        quizOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
          btn.disabled = false;
        });
        answering = false;
        return;
      }

      answeredIds.add(question.id);
      liveScore = data.myScore;
      quizProgressScore.textContent = `${liveScore} điểm`;
      quizOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
        const idx = Number(btn.dataset.index);
        const mark = btn.querySelector('.quiz-option-mark');
        if (idx === data.correctIndex) {
          btn.classList.add('correct');
          if (mark) mark.textContent = OPTION_MARKS.correct;
        } else if (idx === selectedIndex) {
          btn.classList.add('wrong');
          if (mark) mark.textContent = OPTION_MARKS.wrong;
        }
      });

      if (typeof window.playWin === 'function' && typeof window.playError === 'function') {
        data.correct ? window.playWin() : window.playError();
      }

      quizFeedback.textContent = data.correct
        ? '✅ Chính xác!'
        : `❌ Sai rồi! Đáp án đúng: ${escapeHtml(question.options[data.correctIndex])}`;
      quizFeedback.className = data.correct ? 'quiz-feedback ok' : 'quiz-feedback error';
      quizFeedback.classList.remove('hidden');

      setTimeout(() => {
        const next = findNextQuestion();
        if (next) {
          renderQuestion(next);
        } else {
          quizMyScore.textContent = String(data.myScore);
          showStep('done');
          refreshLeaderboard();
        }
      }, 1100);
    } catch (err) {
      console.error(err);
      notify('Không thể kết nối máy chủ', 'error');
      quizOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
        btn.disabled = false;
      });
      answering = false;
    }
  }

  async function beginQuizFor(name) {
    currentName = name;
    localStorage.setItem(QUIZ_NAME_KEY, name);

    try {
      const [stateRes] = await Promise.all([fetch(`/api/quiz/state?name=${encodeURIComponent(name)}`), loadQuestions()]);
      const state = await stateRes.json();
      if (!stateRes.ok) {
        notify(state.error || 'Có lỗi xảy ra', 'error');
        return;
      }

      answeredIds = new Set(state.answeredIds);
      liveScore = state.score;

      if (state.finished || !questions.length) {
        quizMyScore.textContent = String(state.score);
        showStep('done');
        refreshLeaderboard();
        return;
      }

      showStep('play');
      renderQuestion(findNextQuestion());
    } catch (err) {
      console.error(err);
      notify('Không thể kết nối máy chủ', 'error');
    }
  }

  quizStartBtn.addEventListener('click', () => {
    const name = quizMemberSelect.value;
    if (!name) {
      notify('Vui lòng chọn tên của bạn trước khi bắt đầu', 'error');
      return;
    }
    if (typeof window.playClick === 'function') window.playClick();
    beginQuizFor(name);
  });

  if (window.socket) {
    window.socket.on('quiz:progress', (payload) => {
      if (quizDone.classList.contains('hidden')) return;
      if (payload && Array.isArray(payload.leaderboard)) {
        renderLeaderboard(payload.leaderboard);
      } else {
        refreshLeaderboard();
      }
    });
  }

  window.QuizUI = {
    enter() {
      showStep('pick');
      loadMemberOptions();
      const savedName = localStorage.getItem(QUIZ_NAME_KEY);
      if (savedName) {
        beginQuizFor(savedName);
      }
    },
  };
})();
