// Tab "Cau hoi": soan bo cau hoi quiz dung de chon Nhom Truong.
(function () {
  const A = window.AdminCommon;

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const MAX_OPTIONS = LETTERS.length;

  const newQuestionText = document.getElementById('newQuestionText');
  const newQuestionOptions = document.getElementById('newQuestionOptions');
  const newQuestionCorrect = document.getElementById('newQuestionCorrect');
  const addQuestionBtn = document.getElementById('addQuestionBtn');
  const addQuestionMsg = document.getElementById('addQuestionMsg');

  const questionList = document.getElementById('questionList');
  const questionMsg = document.getElementById('questionMsg');

  let questions = [];

  function optionInputsHtml(values) {
    return Array.from({ length: MAX_OPTIONS }, (_, i) => {
      const value = values[i] || '';
      const optional = i >= 2 ? ' (tùy chọn)' : '';
      return `
        <div class="admin-option" data-option-index="${i}">
          <span>${LETTERS[i]}</span>
          <input type="text" data-option="${i}" value="${A.escapeHtml(value)}" placeholder="Phương án ${LETTERS[i]}${optional}" />
        </div>`;
    }).join('');
  }

  // Chi cho chon dap an dung trong so cac phuong an da nhap chu
  function syncCorrectSelect(scope, selectEl, preferredIndex) {
    const inputs = [...scope.querySelectorAll('[data-option]')];
    const filled = inputs
      .map((input, index) => ({ index, value: input.value.trim() }))
      .filter((item) => item.value);

    const previous = preferredIndex !== undefined ? preferredIndex : Number(selectEl.value);
    selectEl.innerHTML = filled.length
      ? filled
          .map(
            (item) =>
              `<option value="${item.index}" ${item.index === previous ? 'selected' : ''}>${LETTERS[item.index]}. ${A.escapeHtml(item.value)}</option>`
          )
          .join('')
      : '<option value="">-- Nhập phương án trước --</option>';
  }

  function collectOptions(scope) {
    return [...scope.querySelectorAll('[data-option]')].map((input) => input.value.trim()).filter(Boolean);
  }

  /* ---------- form them cau hoi ---------- */

  newQuestionOptions.innerHTML = optionInputsHtml([]);
  syncCorrectSelect(newQuestionOptions, newQuestionCorrect, 0);

  newQuestionOptions.addEventListener('input', () => {
    syncCorrectSelect(newQuestionOptions, newQuestionCorrect);
  });

  addQuestionBtn.addEventListener('click', async () => {
    const data = await A.run(addQuestionBtn, addQuestionMsg, 'Đang thêm câu hỏi...', () =>
      A.request('POST', '/api/admin/questions', {
        text: newQuestionText.value,
        options: collectOptions(newQuestionOptions),
        correctIndex: newQuestionCorrect.value,
      })
    );
    if (!data) return;

    A.setMsg(addQuestionMsg, `Đã thêm câu hỏi số ${data.question.order}.`, 'ok');
    newQuestionText.value = '';
    newQuestionOptions.innerHTML = optionInputsHtml([]);
    syncCorrectSelect(newQuestionOptions, newQuestionCorrect, 0);
    loadQuestions();
  });

  /* ---------- danh sach cau hoi ---------- */

  function questionHtml(question) {
    const options = Array.isArray(question.options) ? question.options : [];
    const answered = question._count ? question._count.answers : 0;

    return `
      <div class="admin-question" data-question-id="${question.id}">
        <div class="admin-question-top">
          <span class="admin-question-order">
            Câu
            <input type="number" min="1" data-field="order" value="${question.order}" title="Thứ tự câu hỏi" />
          </span>
          <span class="admin-question-badge">${answered} câu trả lời</span>
        </div>
        <div class="admin-question-body">
          <div class="admin-field">
            <label>Nội dung câu hỏi</label>
            <input type="text" data-field="text" value="${A.escapeHtml(question.text)}" />
          </div>
          <div class="admin-field">
            <label>Các phương án trả lời</label>
            <div class="admin-options" data-options>${optionInputsHtml(options)}</div>
          </div>
          <div class="admin-form-grid is-tight">
            <div class="admin-field">
              <label>Đáp án đúng</label>
              <select data-field="correctIndex"></select>
            </div>
          </div>
        </div>
        <div class="admin-question-foot">
          <button type="button" class="admin-row-btn" data-action="save-question">💾 Lưu câu này</button>
          <button type="button" class="admin-row-btn danger" data-action="delete-question">🗑️ Xóa câu này</button>
        </div>
      </div>`;
  }

  function render() {
    if (questionList.contains(document.activeElement)) return;

    questionList.innerHTML = questions.length
      ? questions.map(questionHtml).join('')
      : '<p class="admin-empty">Chưa có câu hỏi nào. Không có câu hỏi thì hệ thống bỏ qua vòng quiz và mở random luôn.</p>';

    questionList.querySelectorAll('.admin-question').forEach((card) => {
      const question = questions.find((q) => q.id === Number(card.dataset.questionId));
      const scope = card.querySelector('[data-options]');
      const select = card.querySelector('[data-field="correctIndex"]');
      syncCorrectSelect(scope, select, question.correctIndex);
      // Danh dau truc quan phuong an dang la dap an dung
      card.querySelectorAll('.admin-option').forEach((opt) => {
        opt.classList.toggle('is-correct', Number(opt.dataset.optionIndex) === question.correctIndex);
      });
    });
  }

  async function loadQuestions() {
    try {
      questions = await A.request('GET', '/api/admin/questions');
      render();
      A.setMsg(questionMsg, '');
    } catch (err) {
      questionList.innerHTML = `<p class="admin-empty">${A.escapeHtml(err.message)}</p>`;
      A.setMsg(questionMsg, err.message, 'err');
    }
  }

  questionList.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!questionList.contains(document.activeElement)) render();
    }, 0);
  });

  questionList.addEventListener('input', (e) => {
    if (e.target.dataset.option === undefined) return;
    const card = e.target.closest('.admin-question');
    syncCorrectSelect(card.querySelector('[data-options]'), card.querySelector('[data-field="correctIndex"]'));
  });

  questionList.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const card = e.target.closest('.admin-question');
    const questionId = Number(card.dataset.questionId);

    if (action === 'save-question') {
      const body = {
        text: card.querySelector('[data-field="text"]').value,
        options: collectOptions(card.querySelector('[data-options]')),
        correctIndex: card.querySelector('[data-field="correctIndex"]').value,
        order: card.querySelector('[data-field="order"]').value,
      };

      const data = await A.run(e.target, questionMsg, 'Đang lưu câu hỏi...', () =>
        A.request('PUT', `/api/admin/questions/${questionId}`, body)
      );
      if (!data) return;

      A.setMsg(questionMsg, 'Đã lưu câu hỏi.', 'ok');
      loadQuestions();
      return;
    }

    if (action === 'delete-question') {
      const text = card.querySelector('[data-field="text"]').value;
      if (!confirm(`Xóa câu hỏi "${text}"? Câu trả lời của mọi người cho câu này cũng bị xóa.`)) return;

      const data = await A.run(e.target, questionMsg, 'Đang xóa...', () =>
        A.request('DELETE', `/api/admin/questions/${questionId}`)
      );
      if (!data) return;

      A.setMsg(questionMsg, 'Đã xóa câu hỏi.', 'ok');
      loadQuestions();
    }
  });

  if (A.socket) {
    A.socket.on('questions:updated', () => {
      if (A.activeTab() === 'questions') loadQuestions();
    });
  }

  A.onTab('questions', loadQuestions);
})();
