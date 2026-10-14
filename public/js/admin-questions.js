// Tab "Cau hoi": soan bo cau hoi quiz chon Nhom Truong - sua noi dung/phuong an,
// doi thu tu (nut len/xuong hoac nhap so), nhan ban, xoa le hoac xoa nhieu cau,
// tim kiem, xuat CSV. Chua nhap ma bi mat van xem duoc danh sach (an dap an).
(function () {
// Chi hoan ve lai khi nguoi dung dang GO trong 1 o chu/so - ve lai luc do se
// cuop mat con tro. Con tick checkbox hay chon trong dropdown thi da xong thao tac,
// phai ve lai ngay de bang hien dung trang thai moi.
function isTyping(scope) {
  const el = document.activeElement;
  if (!el || !scope.contains(el)) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return ['text', 'search', 'number', 'password', 'date', 'datetime-local'].includes(el.type);
}
  const A = window.AdminCommon;

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const MAX_OPTIONS = LETTERS.length;

  const panel = document.querySelector('.admin-panel[data-panel="questions"]');
  const newQuestionText = document.getElementById('newQuestionText');
  const newQuestionOptions = document.getElementById('newQuestionOptions');
  const newQuestionCorrect = document.getElementById('newQuestionCorrect');
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

  let questions = [];
  let canSeeAnswers = false;
  const selected = new Set();

  function optionInputsHtml(values) {
    return Array.from({ length: MAX_OPTIONS }, (_, i) => {
      const value = values[i] || '';
      const optional = i >= 2 ? ' (tùy chọn)' : '';
      return `
        <div class="admin-option" data-option-index="${i}">
          <span class="admin-option-letter">${LETTERS[i]}</span>
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
        points: newQuestionPoints.value,
        timeLimitSec: newQuestionTime.value,
      })
    );
    if (!data) return;

    A.done(addQuestionMsg, `Đã thêm câu hỏi số ${data.question.order}.`);
    newQuestionText.value = '';
    newQuestionTime.value = '';
    newQuestionOptions.innerHTML = optionInputsHtml([]);
    syncCorrectSelect(newQuestionOptions, newQuestionCorrect, 0);
    loadQuestions();
  });

  /* ---------- danh sach cau hoi ---------- */

  function visibleQuestions() {
    const keyword = questionFilter.value.trim().toLowerCase();
    if (!keyword) return questions;
    return questions.filter(
      (q) =>
        q.text.toLowerCase().includes(keyword) ||
        (Array.isArray(q.options) ? q.options : []).some((opt) => String(opt).toLowerCase().includes(keyword))
    );
  }

  function questionHtml(question, index, total) {
    const options = Array.isArray(question.options) ? question.options : [];
    const answered = question._count ? question._count.answers : null;

    return `
      <div class="admin-question" data-question-id="${question.id}">
        <div class="admin-question-top">
          <input type="checkbox" data-select="${question.id}" ${selected.has(question.id) ? 'checked' : ''}
            title="Chọn câu này" data-always-enabled="1" />
          <span class="admin-question-order">
            Câu
            <input type="number" min="1" data-field="order" value="${question.order}" title="Thứ tự câu hỏi" />
          </span>
          <button type="button" class="admin-row-btn icon-only" data-action="move-up" ${index === 0 ? 'disabled data-keep-disabled="1"' : ''} title="Lên trên">${A.icon('chevron-up')}</button>
          <button type="button" class="admin-row-btn icon-only" data-action="move-down" ${index === total - 1 ? 'disabled data-keep-disabled="1"' : ''} title="Xuống dưới">${A.icon('chevron-down')}</button>
          <span class="admin-question-badge">
            ${A.icon('star', 'ic-sm')} ${question.points || 1} điểm
            ${question.timeLimitSec ? ` · ${A.icon('timer', 'ic-sm')} ${question.timeLimitSec}s` : ''}
            · ${answered === null ? 'đáp án đang ẩn' : `${answered} câu trả lời`}
          </span>
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
            <div class="admin-field">
              <label>Điểm cho câu này</label>
              <input type="number" min="1" max="100" data-field="points" value="${question.points || 1}" />
            </div>
            <div class="admin-field">
              <label>Giới hạn (giây)</label>
              <input type="number" min="3" max="600" data-field="timeLimitSec" value="${question.timeLimitSec || ''}" placeholder="Trống = không giới hạn" />
            </div>
          </div>
        </div>
        <div class="admin-question-foot">
          <button type="button" class="admin-row-btn" data-action="save-question">${A.icon('save')} Lưu câu này</button>
          <button type="button" class="admin-row-btn" data-action="duplicate-question">${A.icon('copy')} Nhân bản</button>
          <button type="button" class="admin-row-btn danger" data-action="delete-question">${A.icon('trash-2')} Xóa câu này</button>
        </div>
      </div>`;
  }

  function renderBulkBar() {
    bulkBar.hidden = selected.size === 0;
    bulkCount.innerHTML = `${A.icon('check-check')} Đã chọn ${selected.size} câu`;
  }

  function render() {
    if (isTyping(questionList)) return;

    renderBulkBar();

    const list = visibleQuestions();
    questionList.innerHTML = list.length
      ? list.map((q, i) => questionHtml(q, questions.indexOf(q), questions.length)).join('')
      : `<div class="admin-empty-rich">${A.icon(questions.length ? 'search-x' : 'circle-help')}
          <strong>${questions.length ? 'Không có câu hỏi nào khớp từ khóa' : 'Chưa có câu hỏi nào'}</strong>
          <p>${
            questions.length
              ? 'Thử xóa bớt từ khóa tìm kiếm.'
              : 'Không có câu hỏi thì hệ thống bỏ qua vòng quiz và mở random luôn.'
          }</p></div>`;

    questionList.querySelectorAll('.admin-question').forEach((card) => {
      const question = questions.find((q) => q.id === Number(card.dataset.questionId));
      const scope = card.querySelector('[data-options]');
      const select = card.querySelector('[data-field="correctIndex"]');
      syncCorrectSelect(scope, select, question.correctIndex);

      // Danh dau truc quan phuong an dang la dap an dung (chi khi doc duoc dap an)
      if (canSeeAnswers) {
        card.querySelectorAll('.admin-option').forEach((opt) => {
          opt.classList.toggle('is-correct', Number(opt.dataset.optionIndex) === question.correctIndex);
        });
      }
    });

    A.applyEditLock(panel, lockNote);

    if (!canSeeAnswers && questions.length) {
      A.setMsg(
        lockNote,
        'Đang ở chế độ chỉ xem — nhập mã bí mật admin ở đầu trang để xem đáp án đúng và sửa câu hỏi.',
        'warn'
      );
    }
  }

  async function loadQuestions() {
    try {
      if (A.canEdit()) {
        questions = await A.request('GET', '/api/admin/questions');
        canSeeAnswers = true;
      } else {
        // API cong khai khong tra ve correctIndex -> chi xem duoc noi dung
        questions = await fetch('/api/quiz/questions').then((r) => r.json());
        canSeeAnswers = false;
      }

      const ids = new Set(questions.map((q) => q.id));
      [...selected].forEach((id) => {
        if (!ids.has(id)) selected.delete(id);
      });

      render();
    } catch (err) {
      questionList.innerHTML = `<p class="admin-empty">${A.escapeHtml(err.message)}</p>`;
      A.setMsg(questionMsg, err.message, 'err');
    }
  }

  questionFilter.addEventListener('input', render);

  questionList.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!isTyping(questionList)) render();
    }, 0);
  });

  questionList.addEventListener('input', (e) => {
    if (e.target.dataset.option === undefined) return;
    const card = e.target.closest('.admin-question');
    syncCorrectSelect(card.querySelector('[data-options]'), card.querySelector('[data-field="correctIndex"]'));
  });

  questionList.addEventListener('change', (e) => {
    const selectId = e.target.dataset.select;
    if (!selectId) return;
    const id = Number(selectId);
    if (e.target.checked) selected.add(id);
    else selected.delete(id);
    renderBulkBar();
  });

  questionList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    const card = btn.closest('.admin-question');
    const questionId = Number(card.dataset.questionId);

    if (action === 'save-question') {
      const body = {
        text: card.querySelector('[data-field="text"]').value,
        options: collectOptions(card.querySelector('[data-options]')),
        correctIndex: card.querySelector('[data-field="correctIndex"]').value,
        order: card.querySelector('[data-field="order"]').value,
        points: card.querySelector('[data-field="points"]').value,
        timeLimitSec: card.querySelector('[data-field="timeLimitSec"]').value,
      };

      const data = await A.run(btn, questionMsg, 'Đang lưu câu hỏi...', () =>
        A.request('PUT', `/api/admin/questions/${questionId}`, body)
      );
      if (!data) return;

      A.done(questionMsg, 'Đã lưu câu hỏi.');
      loadQuestions();
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
      const text = card.querySelector('[data-field="text"]').value;
      const ok = await A.confirmAction({
        title: 'Xóa câu hỏi',
        message: `Xóa câu hỏi <strong>${A.escapeHtml(text)}</strong>?<br />Câu trả lời của mọi người cho câu này cũng bị xóa.`,
        okText: 'Xóa câu hỏi',
      });
      if (!ok) return;

      const data = await A.run(btn, questionMsg, 'Đang xóa...', () =>
        A.request('DELETE', `/api/admin/questions/${questionId}`)
      );
      if (!data) return;

      selected.delete(questionId);
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
      render();
      return;
    }

    if (action === 'delete') {
      if (!selected.size) {
        A.setMsg(questionMsg, 'Chưa chọn câu nào', 'err');
        return;
      }
      const ok = await A.confirmAction({
        title: 'Xóa câu hỏi',
        message: `Xóa <strong>${selected.size} câu hỏi</strong> đã chọn?<br />Câu trả lời của mọi người cho các câu đó cũng bị xóa.`,
        okText: 'Xóa tất cả',
      });
      if (!ok) return;

      const data = await A.run(null, questionMsg, 'Đang xóa...', () =>
        A.request('POST', '/api/admin/questions/bulk', { ids: [...selected], action: 'delete' })
      );
      if (!data) return;

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

  if (A.socket) {
    A.socket.on('questions:updated', () => {
      if (A.activeTab() === 'questions') loadQuestions();
    });
  }

  A.onSecretChange(() => {
    if (A.activeTab() === 'questions') loadQuestions();
  });

  A.onTab('questions', loadQuestions);
})();
