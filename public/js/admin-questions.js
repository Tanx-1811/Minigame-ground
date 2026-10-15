// Tab "Cau hoi": soan bo cau hoi quiz chon Nhom Truong - sua noi dung/phuong an,
// doi thu tu (nut len/xuong hoac nhap so), nhan ban, xoa le hoac xoa nhieu cau,
// tim kiem, xuat CSV. Chua nhap ma bi mat van xem duoc danh sach (an dap an).
//
// Moi the cau hoi chi hien cac phuong an DA CO chu + nut "Them phuong an"
// (2..6 phuong an). Dap an dung chon bang nut "Dung" ngay canh phuong an, khi
// gui di van doi ra correctIndex theo danh sach phuong an da bo o trong.
//
// The dang sua do (co thay doi chua luu) hoac dang go thi GIU NGUYEN khi co ban
// cap nhat realtime - truoc day the bi ve lai moi lan roi focus (focusout ->
// render) nen chu vua go bien mat va bam "Luu" khong an.
(function () {
  const A = window.AdminCommon;

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const MAX_OPTIONS = LETTERS.length;
  const MIN_OPTIONS = 2;

  const panel = document.querySelector('.admin-panel[data-panel="questions"]');
  const newQuestionText = document.getElementById('newQuestionText');
  const newQuestionEditor = document.getElementById('newQuestionEditor');
  const newQuestionPoints = document.getElementById('newQuestionPoints');
  const newQuestionTime = document.getElementById('newQuestionTime');
  const addQuestionBtn = document.getElementById('addQuestionBtn');
  const addQuestionMsg = document.getElementById('addQuestionMsg');

  const questionList = document.getElementById('questionList');
  const questionMsg = document.getElementById('questionMsg');
  const lockNote = document.getElementById('questionLockNote');
  const questionFilter = document.getElementById('questionFilter');
  const bulkBar = document.getElementById('questionBulkBar');
  const bulkCount = document.getElementById('questionBulkCount');
  const exportBtn = document.getElementById('questionExportBtn');
  const resultCount = document.getElementById('questionResultCount');

  let questions = [];
  let canSeeAnswers = false;
  let loaded = false;
  const selected = new Set();

  /* ---------- bo soan phuong an (dung chung cho form them + tung the) ---------- */

  function optionRowHtml(scope, index, value, isCorrect, total) {
    const letter = LETTERS[index];
    return `
      <div class="admin-option ${isCorrect ? 'is-correct' : ''}">
        <span class="admin-option-letter" aria-hidden="true">${letter}</span>
        <input type="text" id="${scope}-opt-${index}" data-option="${index}" value="${A.escapeHtml(value)}"
          placeholder="Phương án ${letter}" aria-label="Phương án ${letter}" autocomplete="off" />
        <label class="admin-correct-toggle" title="Chọn ${letter} là đáp án đúng">
          <input type="radio" name="${scope}-correct" data-correct="${index}" ${isCorrect ? 'checked' : ''}
            aria-label="${letter} là đáp án đúng" />
          <span>${A.icon('check', 'ic-sm')} Đúng</span>
        </label>
        <button type="button" class="admin-option-remove" data-remove-option="${index}" title="Bỏ phương án ${letter}"
          aria-label="Bỏ phương án ${letter}" ${total <= MIN_OPTIONS ? 'hidden' : ''}>${A.icon('x', 'ic-sm')}</button>
      </div>`;
  }

  function optionsHtml(scope, items) {
    return items.map((item, i) => optionRowHtml(scope, i, item.value, item.correct, items.length)).join('');
  }

  function editorHtml(scope, items) {
    return `
      <div class="admin-option-editor" data-scope="${scope}">
        <div class="admin-options" data-options role="group" aria-label="Các phương án trả lời">${optionsHtml(scope, items)}</div>
        <button type="button" class="admin-add-option" data-action="add-option" ${items.length >= MAX_OPTIONS ? 'data-keep-disabled="1"' : ''}>
          ${A.icon('plus', 'ic-sm')} Thêm phương án <span>(${items.length}/${MAX_OPTIONS})</span>
        </button>
      </div>`;
  }

  function readItems(editor) {
    return [...editor.querySelectorAll('.admin-option')].map((row) => ({
      value: row.querySelector('[data-option]').value,
      correct: row.querySelector('[data-correct]').checked,
    }));
  }

  function paintOptions(editor, items, focusIndex) {
    const scope = editor.dataset.scope;
    editor.querySelector('[data-options]').innerHTML = optionsHtml(scope, items);
    const addBtn = editor.querySelector('[data-action="add-option"]');
    addBtn.innerHTML = `${A.icon('plus', 'ic-sm')} Thêm phương án <span>(${items.length}/${MAX_OPTIONS})</span>`;
    A.setAllowed(addBtn, items.length < MAX_OPTIONS);
    A.applyEditLock(editor, null);
    if (focusIndex !== undefined) {
      const target = editor.querySelector(`[data-option="${focusIndex}"]`);
      if (target) target.focus();
    }
  }

  // Doc phuong an + dap an dung tu bo soan, bo o trong va doi lai chi so dap an
  function collect(editor) {
    const items = readItems(editor);
    const options = [];
    let correctIndex = -1;
    let correctBlank = false;
    items.forEach((item) => {
      const value = item.value.trim();
      if (!value) {
        if (item.correct) correctBlank = true;
        return;
      }
      if (item.correct) correctIndex = options.length;
      options.push(value);
    });
    return { options, correctIndex, correctBlank, hasCorrect: items.some((i) => i.correct) };
  }

  function validateOptions(result) {
    if (result.options.length < MIN_OPTIONS) return `Cần ít nhất ${MIN_OPTIONS} phương án có nội dung`;
    if (result.correctBlank) return 'Phương án được chọn là đáp án đúng đang để trống';
    if (!result.hasCorrect || result.correctIndex < 0) return 'Chưa chọn đáp án đúng — bấm "Đúng" cạnh phương án đúng';
    return '';
  }

  function onEditorClick(e) {
    const editor = e.target.closest('.admin-option-editor');
    if (!editor) return false;

    const addBtn = e.target.closest('[data-action="add-option"]');
    if (addBtn) {
      const items = readItems(editor);
      if (items.length >= MAX_OPTIONS) return true;
      items.push({ value: '', correct: false });
      paintOptions(editor, items, items.length - 1);
      editorChanged(editor);
      return true;
    }

    const removeBtn = e.target.closest('[data-remove-option]');
    if (removeBtn) {
      const items = readItems(editor);
      if (items.length <= MIN_OPTIONS) return true;
      const index = Number(removeBtn.dataset.removeOption);
      items.splice(index, 1);
      paintOptions(editor, items, Math.min(index, items.length - 1));
      editorChanged(editor);
      return true;
    }
    return false;
  }

  function onEditorChange(e) {
    if (e.target.dataset.correct === undefined) return;
    const editor = e.target.closest('.admin-option-editor');
    editor.querySelectorAll('.admin-option').forEach((row) => {
      row.classList.toggle('is-correct', row.querySelector('[data-correct]').checked);
    });
    editorChanged(editor);
  }

  function editorChanged(editor) {
    const card = editor.closest('.admin-question');
    if (card) updateDirty(card);
  }

  /* ---------- form them cau hoi ---------- */

  function resetNewForm() {
    newQuestionEditor.innerHTML = editorHtml(
      'qnew',
      Array.from({ length: 4 }, () => ({ value: '', correct: false }))
    );
    newQuestionText.value = '';
    newQuestionTime.value = '';
    A.applyEditLock(newQuestionEditor, null);
  }

  resetNewForm();

  newQuestionEditor.addEventListener('click', onEditorClick);
  newQuestionEditor.addEventListener('change', onEditorChange);

  addQuestionBtn.addEventListener('click', async () => {
    const editor = newQuestionEditor.querySelector('.admin-option-editor');
    const result = collect(editor);
    const problem = !newQuestionText.value.trim() ? 'Thiếu nội dung câu hỏi' : validateOptions(result);
    if (problem) {
      A.setMsg(addQuestionMsg, problem, 'err');
      return;
    }

    const data = await A.run(addQuestionBtn, addQuestionMsg, 'Đang thêm câu hỏi...', () =>
      A.request('POST', '/api/admin/questions', {
        text: newQuestionText.value,
        options: result.options,
        correctIndex: result.correctIndex,
        points: newQuestionPoints.value,
        timeLimitSec: newQuestionTime.value,
      })
    );
    if (!data) return;

    A.done(addQuestionMsg, `Đã thêm câu hỏi số ${data.question.order}.`);
    resetNewForm();
    newQuestionText.focus();
    loadQuestions();
  });

  /* ---------- danh sach cau hoi ---------- */

  function isDirty(card) {
    return card.classList.contains('is-dirty');
  }

  function visibleQuestions() {
    const keyword = questionFilter.value.trim().toLowerCase();
    // The dang sua do luon hien, ke ca khi khong khop tu khoa - khong mat chu
    const dirtyIds = new Set(
      [...questionList.querySelectorAll('.admin-question.is-dirty')].map((c) => Number(c.dataset.questionId))
    );
    if (!keyword) return questions;
    return questions.filter(
      (q) =>
        dirtyIds.has(q.id) ||
        q.text.toLowerCase().includes(keyword) ||
        (Array.isArray(q.options) ? q.options : []).some((opt) => String(opt).toLowerCase().includes(keyword))
    );
  }

  function metaText(question) {
    const answered = question._count ? question._count.answers : null;
    return answered === null ? 'Đáp án đang ẩn' : answered ? `${answered} lượt trả lời` : 'Chưa ai trả lời';
  }

  function questionHtml(question, index, total) {
    const options = Array.isArray(question.options) ? question.options : [];
    const scope = `q${question.id}`;
    const items = options.map((value, i) => ({ value, correct: canSeeAnswers && i === question.correctIndex }));
    const isSelected = selected.has(question.id);

    return `
      <article class="admin-question ${isSelected ? 'is-selected' : ''}" data-question-id="${question.id}"
        aria-labelledby="${scope}-title">
        <header class="admin-question-top">
          <input type="checkbox" data-select="${question.id}" ${isSelected ? 'checked' : ''}
            aria-label="Chọn câu ${question.order}" data-always-enabled="1" />
          <label class="admin-question-order" id="${scope}-title" for="${scope}-order">
            Câu
            <input id="${scope}-order" type="number" min="1" inputmode="numeric" data-field="order" value="${question.order}"
              title="Nhập số thứ tự mới rồi bấm Enter" />
          </label>
          <span class="admin-question-move">
            <button type="button" class="admin-row-btn icon-only" data-action="move-up" ${
              index === 0 ? 'disabled data-keep-disabled="1"' : ''
            } title="Lên trên" aria-label="Đưa câu ${question.order} lên trên">${A.icon('chevron-up')}</button>
            <button type="button" class="admin-row-btn icon-only" data-action="move-down" ${
              index === total - 1 ? 'disabled data-keep-disabled="1"' : ''
            } title="Xuống dưới" aria-label="Đưa câu ${question.order} xuống dưới">${A.icon('chevron-down')}</button>
          </span>
          <span class="admin-question-meta" data-meta>${A.escapeHtml(metaText(question))}</span>
          <span class="admin-dirty-chip" aria-live="polite">${A.icon('pencil', 'ic-sm')} Chưa lưu</span>
        </header>

        <div class="admin-question-body">
          <label class="visually-hidden" for="${scope}-text">Nội dung câu hỏi</label>
          <input id="${scope}-text" class="admin-question-text" type="text" data-field="text"
            value="${A.escapeHtml(question.text)}" placeholder="Nội dung câu hỏi" autocomplete="off" />
          ${editorHtml(scope, items)}
        </div>

        <footer class="admin-question-foot">
          <label class="admin-inline-field" for="${scope}-points">
            ${A.icon('star', 'ic-sm')} Điểm
            <input id="${scope}-points" type="number" min="1" max="100" inputmode="numeric" data-field="points"
              value="${question.points || 1}" />
          </label>
          <label class="admin-inline-field" for="${scope}-time">
            ${A.icon('timer', 'ic-sm')} Giới hạn
            <input id="${scope}-time" type="number" min="3" max="600" inputmode="numeric" data-field="timeLimitSec"
              value="${question.timeLimitSec || ''}" placeholder="∞" title="Để trống = không giới hạn" />
            giây
          </label>
          <span class="admin-question-actions">
            <button type="button" class="admin-row-btn" data-action="duplicate-question" title="Nhân bản câu này">${A.icon('copy')}<span class="admin-hide-sm">Nhân bản</span></button>
            <button type="button" class="admin-row-btn danger" data-action="delete-question" title="Xóa câu này">${A.icon('trash-2')}<span class="admin-hide-sm">Xóa</span></button>
            <button type="button" class="admin-row-btn" data-action="revert-question" data-keep-disabled="1" title="Bỏ các thay đổi chưa lưu">${A.icon('rotate-ccw')}<span class="admin-hide-sm">Hoàn tác</span></button>
            <button type="button" class="admin-row-btn is-primary" data-action="save-question" data-keep-disabled="1">${A.icon('save')} Lưu</button>
          </span>
        </footer>
      </article>`;
  }

  // Doc trang thai hien tai cua the va so voi ban tren may chu: tra ve nhung
  // truong DA DOI (chi gui dung nhung truong do khi luu).
  function cardChanges(card, question) {
    const body = {};
    const text = card.querySelector('[data-field="text"]').value.trim();
    if (text !== question.text) body.text = text;

    const result = collect(card.querySelector('.admin-option-editor'));
    const original = Array.isArray(question.options) ? question.options : [];
    const optionsChanged =
      result.options.length !== original.length || result.options.some((opt, i) => opt !== original[i]);
    const correctChanged = canSeeAnswers && result.correctIndex !== question.correctIndex;
    if (optionsChanged || correctChanged || result.correctBlank) {
      body.options = result.options;
      body.correctIndex = result.correctIndex;
    }

    const points = card.querySelector('[data-field="points"]').value.trim();
    if (points !== String(question.points || 1)) body.points = points;

    const time = card.querySelector('[data-field="timeLimitSec"]').value.trim();
    if (time !== String(question.timeLimitSec || '')) body.timeLimitSec = time;

    return { body, result };
  }

  function findQuestion(card) {
    return questions.find((q) => q.id === Number(card.dataset.questionId));
  }

  function updateDirty(card) {
    const question = findQuestion(card);
    if (!question) return;
    const dirty = Object.keys(cardChanges(card, question).body).length > 0;
    card.classList.toggle('is-dirty', dirty);
    A.setAllowed(card.querySelector('[data-action="save-question"]'), dirty);
    A.setAllowed(card.querySelector('[data-action="revert-question"]'), dirty);
  }

  // Cap nhat phan dau the (so thu tu, nut len/xuong, so luot tra loi) cho the
  // dang duoc giu nguyen vi dang sua - phan do khong phai noi dung dang soan.
  function refreshKeptCard(card, question, index, total) {
    const order = card.querySelector('[data-field="order"]');
    if (order && document.activeElement !== order) order.value = question.order;
    const meta = card.querySelector('[data-meta]');
    if (meta) meta.textContent = metaText(question);
    const up = card.querySelector('[data-action="move-up"]');
    const down = card.querySelector('[data-action="move-down"]');
    A.setAllowed(up, index !== 0);
    A.setAllowed(down, index !== total - 1);
    card.classList.toggle('is-selected', selected.has(question.id));
  }

  function renderBulkBar() {
    bulkBar.hidden = selected.size === 0;
    bulkCount.innerHTML = `${A.icon('check-check')} Đã chọn ${selected.size} câu`;
  }

  let pendingRender = false;

  function render() {
    renderBulkBar();
    pendingRender = false;

    const list = visibleQuestions();
    resultCount.textContent = list.length === questions.length ? `${questions.length} câu` : `${list.length}/${questions.length} câu`;

    A.patchList(
      questionList,
      list.map((q) => ({ key: q.id, html: questionHtml(q, questions.indexOf(q), questions.length) })),
      {
        keep: (card) => {
          if (isDirty(card)) return true; // ve lai sau khi Luu / Hoan tac
          if (!A.isBusy(card)) return false;
          pendingRender = true; // ve lai khi roi khoi o dang go
          return true;
        },
        empty: `<div class="admin-empty-rich">${A.icon(questions.length ? 'search-x' : 'circle-help')}
          <strong>${!loaded ? 'Đang tải…' : questions.length ? 'Không có câu hỏi nào khớp từ khóa' : 'Chưa có câu hỏi nào'}</strong>
          <p>${
            questions.length
              ? 'Thử xóa bớt từ khóa tìm kiếm.'
              : 'Không có câu hỏi thì hệ thống bỏ qua vòng quiz và mở random luôn.'
          }</p></div>`,
      }
    );

    questionList.querySelectorAll('.admin-question').forEach((card) => {
      const question = findQuestion(card);
      if (!question) return;
      if (isDirty(card) || A.isBusy(card)) refreshKeptCard(card, question, questions.indexOf(question), questions.length);
    });

    A.applyEditLock(panel, lockNote);

    if (!canSeeAnswers && questions.length && !A.canEdit()) {
      A.setMsg(lockNote, `${lockNote.textContent} Đáp án đúng đang được ẩn.`, lockNote.className.includes('err') ? 'err' : 'warn');
    }
    A.setBadge('questions', questions.length);
  }

  const loadQuestions = A.serial(async () => {
    try {
      if (A.canEdit()) {
        questions = await A.request('GET', '/api/admin/questions');
        canSeeAnswers = true;
      } else {
        // API cong khai khong tra ve correctIndex -> chi xem duoc noi dung
        questions = await fetch('/api/quiz/questions').then((r) => r.json());
        canSeeAnswers = false;
      }
      loaded = true;

      const ids = new Set(questions.map((q) => q.id));
      [...selected].forEach((id) => {
        if (!ids.has(id)) selected.delete(id);
      });

      render();
    } catch (err) {
      questionList.innerHTML = `<p class="admin-empty">${A.escapeHtml(err.message)}</p>`;
      A.setMsg(questionMsg, err.message, 'err');
    }
  });

  questionFilter.addEventListener('input', render);

  // Roi khoi the dang go (va the do khong con thay doi chua luu) -> ap dung ban
  // cap nhat realtime da hoan trong luc go
  questionList.addEventListener('focusout', () => {
    setTimeout(() => {
      if (pendingRender && !A.isBusy(questionList)) render();
    }, 0);
  });

  questionList.addEventListener('input', (e) => {
    const card = e.target.closest('.admin-question');
    if (card && e.target.dataset.select === undefined && e.target.dataset.field !== 'order') updateDirty(card);
  });

  questionList.addEventListener('change', (e) => {
    const selectId = e.target.dataset.select;
    if (selectId) {
      const id = Number(selectId);
      if (e.target.checked) selected.add(id);
      else selected.delete(id);
      e.target.closest('.admin-question').classList.toggle('is-selected', e.target.checked);
      renderBulkBar();
      return;
    }
    if (e.target.dataset.field === 'order') {
      saveOrder(e.target);
      return;
    }
    onEditorChange(e);
  });

  questionList.addEventListener('keydown', (e) => {
    const card = e.target.closest('.admin-question');
    if (!card) return;
    if (e.target.dataset.field === 'order' && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
      return;
    }
    // Ctrl/Cmd + Enter trong the = Luu cau nay
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && isDirty(card)) {
      e.preventDefault();
      card.querySelector('[data-action="save-question"]').click();
    }
  });

  // Doi so thu tu: luu ngay (giong nut len/xuong), khong tinh vao "chua luu"
  async function saveOrder(input) {
    const card = input.closest('.admin-question');
    const question = findQuestion(card);
    if (!question) return;
    const value = Number.parseInt(input.value, 10);
    if (!Number.isInteger(value) || value < 1) {
      input.value = question.order;
      A.setMsg(questionMsg, 'Thứ tự phải là số nguyên lớn hơn 0', 'err');
      return;
    }
    if (value === question.order) return;

    const data = await A.run(null, questionMsg, 'Đang đổi thứ tự...', () =>
      A.request('PUT', `/api/admin/questions/${question.id}`, { order: value })
    );
    if (!data) {
      input.value = question.order;
      return;
    }
    A.done(questionMsg, `Đã chuyển thành câu số ${value}.`);
    loadQuestions();
  }

  async function saveCard(card, btn) {
    const question = findQuestion(card);
    if (!question) return;
    const { body, result } = cardChanges(card, question);
    if (!Object.keys(body).length) {
      updateDirty(card);
      return;
    }
    if (body.text === '') {
      A.setMsg(questionMsg, 'Nội dung câu hỏi không được để trống', 'err');
      card.querySelector('[data-field="text"]').focus();
      return;
    }
    if (body.options) {
      const problem = validateOptions(result);
      if (problem) {
        A.setMsg(questionMsg, `Câu ${question.order}: ${problem}`, 'err');
        A.toast(problem, 'err');
        return;
      }
    }

    const data = await A.run(btn, questionMsg, 'Đang lưu câu hỏi...', () =>
      A.request('PUT', `/api/admin/questions/${question.id}`, body)
    );
    if (!data) return;

    // Ghi ngay vao danh sach tai cho roi ve lai the - khong cho tai lai ca trang
    if (body.text !== undefined) question.text = body.text;
    if (body.options) {
      question.options = body.options;
      question.correctIndex = body.correctIndex;
    }
    if (body.points !== undefined) question.points = Number(body.points);
    if (body.timeLimitSec !== undefined) question.timeLimitSec = body.timeLimitSec === '' ? null : Number(body.timeLimitSec);

    card.classList.remove('is-dirty');
    A.done(questionMsg, `Đã lưu câu ${question.order}.`);
    render();
    loadQuestions();
  }

  questionList.addEventListener('click', async (e) => {
    if (onEditorClick(e)) return;

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    const card = btn.closest('.admin-question');
    if (!card) return;
    const questionId = Number(card.dataset.questionId);

    if (action === 'save-question') {
      saveCard(card, btn);
      return;
    }

    if (action === 'revert-question') {
      card.classList.remove('is-dirty');
      render();
      A.setMsg(questionMsg, 'Đã bỏ các thay đổi chưa lưu.', '');
      return;
    }

    if (action === 'move-up' || action === 'move-down') {
      const data = await A.run(btn, questionMsg, 'Đang đổi thứ tự...', () =>
        A.request('POST', `/api/admin/questions/${questionId}/move`, {
          direction: action === 'move-up' ? 'up' : 'down',
        })
      );
      if (!data) return;
      A.done(questionMsg, 'Đã đổi thứ tự câu hỏi.');
      loadQuestions();
      return;
    }

    if (action === 'duplicate-question') {
      const data = await A.run(btn, questionMsg, 'Đang nhân bản...', () =>
        A.request('POST', `/api/admin/questions/${questionId}/duplicate`)
      );
      if (!data) return;
      A.done(questionMsg, `Đã nhân bản thành câu số ${data.question.order}.`);
      loadQuestions();
      return;
    }

    if (action === 'delete-question') {
      const question = findQuestion(card);
      const text = question ? question.text : card.querySelector('[data-field="text"]').value;
      const answered = question && question._count ? question._count.answers : 0;
      const ok = await A.confirmAction({
        title: 'Xóa câu hỏi',
        message: `Xóa câu hỏi <strong>${A.escapeHtml(text)}</strong>?<br />${
          answered ? `${answered} câu trả lời cho câu này cũng bị xóa và điểm quiz được tính lại.` : 'Chưa ai trả lời câu này.'
        }`,
        okText: 'Xóa câu hỏi',
      });
      if (!ok) return;

      const data = await A.run(btn, questionMsg, 'Đang xóa...', () =>
        A.request('DELETE', `/api/admin/questions/${questionId}`)
      );
      if (!data) return;

      selected.delete(questionId);
      card.classList.remove('is-dirty');
      A.done(questionMsg, 'Đã xóa câu hỏi.');
      loadQuestions();
    }
  });

  bulkBar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-bulk]');
    if (!btn) return;
    const action = btn.dataset.bulk;

    if (action === 'clear-selection') {
      selected.clear();
      questionList.querySelectorAll('[data-select]').forEach((box) => {
        box.checked = false;
        box.closest('.admin-question').classList.remove('is-selected');
      });
      renderBulkBar();
      return;
    }

    if (action === 'delete') {
      if (!selected.size) {
        A.setMsg(questionMsg, 'Chưa chọn câu nào', 'err');
        return;
      }
      const ok = await A.confirmAction({
        title: 'Xóa câu hỏi',
        message: `Xóa <strong>${selected.size} câu hỏi</strong> đã chọn?<br />Câu trả lời của mọi người cho các câu đó cũng bị xóa và điểm quiz được tính lại.`,
        okText: 'Xóa tất cả',
      });
      if (!ok) return;

      const data = await A.run(btn, questionMsg, 'Đang xóa...', () =>
        A.request('POST', '/api/admin/questions/bulk', { ids: [...selected], action: 'delete' })
      );
      if (!data) return;

      selected.forEach((id) => {
        const card = questionList.querySelector(`.admin-question[data-question-id="${id}"]`);
        if (card) card.classList.remove('is-dirty');
      });
      selected.clear();
      A.done(questionMsg, `Đã xóa ${data.affected} câu hỏi.`);
      loadQuestions();
    }
  });

  exportBtn.addEventListener('click', () => {
    const rows = [['Thứ tự', 'Câu hỏi', ...LETTERS.map((l) => `Phương án ${l}`), 'Đáp án đúng', 'Điểm', 'Giới hạn (giây)']];
    visibleQuestions().forEach((q) => {
      const options = Array.isArray(q.options) ? q.options : [];
      rows.push([
        q.order,
        q.text,
        ...Array.from({ length: MAX_OPTIONS }, (_, i) => options[i] || ''),
        canSeeAnswers ? `${LETTERS[q.correctIndex] || ''}. ${options[q.correctIndex] || ''}` : '(ẩn)',
        q.points || 1,
        q.timeLimitSec || '',
      ]);
    });
    A.downloadCsv('cau-hoi-quiz.csv', rows);
    A.done(questionMsg, `Đã xuất ${rows.length - 1} câu hỏi ra file CSV.`);
  });

  // Canh bao khi roi trang ma con cau chua luu
  window.addEventListener('beforeunload', (e) => {
    if (questionList.querySelector('.admin-question.is-dirty')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  A.onLive(['questions:updated', 'groups:reset'], loadQuestions);

  A.onTab('questions', loadQuestions);
})();
