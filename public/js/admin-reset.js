const secretInput = document.getElementById('secretInput');
const resetBtn = document.getElementById('resetBtn');
const msg = document.getElementById('msg');
const eventTimeInput = document.getElementById('eventTimeInput');
const saveTimeBtn = document.getElementById('saveTimeBtn');
const clearTimeBtn = document.getElementById('clearTimeBtn');
const timeMsg = document.getElementById('timeMsg');
const refreshQuizBtn = document.getElementById('refreshQuizBtn');
const finishQuizBtn = document.getElementById('finishQuizBtn');
const quizAdminLeaderboard = document.getElementById('quizAdminLeaderboard');
const quizMsg = document.getElementById('quizMsg');

function isoToLocalInputValue(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadCurrentEventTime() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.eventStartAt) {
      eventTimeInput.value = isoToLocalInputValue(data.eventStartAt);
    }
  } catch (err) {
    console.error(err);
  }
}
loadCurrentEventTime();

async function saveEventTime(eventStartAt) {
  const secret = secretInput.value.trim();
  if (!secret) {
    timeMsg.textContent = 'Vui lòng nhập mã bí mật';
    timeMsg.className = 'admin-msg err';
    return;
  }

  saveTimeBtn.disabled = true;
  clearTimeBtn.disabled = true;
  timeMsg.textContent = 'Đang lưu...';
  timeMsg.className = 'admin-msg';

  try {
    const res = await fetch('/api/admin/event-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, eventStartAt }),
    });
    const data = await res.json();

    if (!res.ok) {
      timeMsg.textContent = data.error || 'Có lỗi xảy ra';
      timeMsg.className = 'admin-msg err';
      return;
    }

    timeMsg.textContent = eventStartAt ? 'Đã lưu giờ mở bốc thăm!' : 'Đã mở bốc thăm ngay lập tức!';
    timeMsg.className = 'admin-msg ok';
  } catch (err) {
    timeMsg.textContent = 'Không thể kết nối máy chủ';
    timeMsg.className = 'admin-msg err';
  } finally {
    saveTimeBtn.disabled = false;
    clearTimeBtn.disabled = false;
  }
}

saveTimeBtn.addEventListener('click', () => {
  if (!eventTimeInput.value) {
    timeMsg.textContent = 'Vui lòng chọn ngày giờ';
    timeMsg.className = 'admin-msg err';
    return;
  }
  saveEventTime(new Date(eventTimeInput.value).toISOString());
});

clearTimeBtn.addEventListener('click', () => {
  eventTimeInput.value = '';
  saveEventTime(null);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadQuizLeaderboard() {
  quizMsg.textContent = '';
  quizMsg.className = 'admin-msg';
  try {
    const res = await fetch('/api/quiz/leaderboard');
    const rows = await res.json();
    if (!rows.length) {
      quizAdminLeaderboard.innerHTML = '<li>Chưa có ai làm quiz</li>';
      return;
    }
    quizAdminLeaderboard.innerHTML = rows
      .map(
        (r) =>
          `<li><span>${escapeHtml(r.name)}${r.finished ? ' ✅' : ' (chưa xong)'}</span><span>${r.score} điểm</span></li>`
      )
      .join('');
  } catch (err) {
    quizAdminLeaderboard.innerHTML = '';
    quizMsg.textContent = 'Không thể tải bảng xếp hạng quiz';
    quizMsg.className = 'admin-msg err';
  }
}
loadQuizLeaderboard();

refreshQuizBtn.addEventListener('click', loadQuizLeaderboard);

finishQuizBtn.addEventListener('click', async () => {
  const secret = secretInput.value.trim();
  if (!secret) {
    quizMsg.textContent = 'Vui lòng nhập mã bí mật';
    quizMsg.className = 'admin-msg err';
    return;
  }

  const confirmed = confirm('Chốt 4 Nhóm Trưởng dựa trên điểm quiz hiện tại và mở khóa vòng Random cho mọi người?');
  if (!confirmed) return;

  finishQuizBtn.disabled = true;
  quizMsg.textContent = 'Đang chốt...';
  quizMsg.className = 'admin-msg';

  try {
    const res = await fetch('/api/admin/quiz/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
    });
    const data = await res.json();

    if (!res.ok) {
      quizMsg.textContent = data.error || 'Có lỗi xảy ra';
      quizMsg.className = 'admin-msg err';
      return;
    }

    const names = (data.leaders || []).map((l) => l.name).join(', ');
    quizMsg.textContent = data.alreadyFinished
      ? `Đã chốt từ trước: ${names}`
      : `Đã chốt 4 Nhóm Trưởng: ${names}. Vòng Random đã mở!`;
    quizMsg.className = 'admin-msg ok';
    loadQuizLeaderboard();
  } catch (err) {
    quizMsg.textContent = 'Không thể kết nối máy chủ';
    quizMsg.className = 'admin-msg err';
  } finally {
    finishQuizBtn.disabled = false;
  }
});

resetBtn.addEventListener('click', async () => {
  const secret = secretInput.value.trim();
  if (!secret) {
    msg.textContent = 'Vui lòng nhập mã bí mật';
    msg.className = 'admin-msg err';
    return;
  }

  const confirmed = confirm('Bạn chắc chắn muốn xóa toàn bộ kết quả random? Không thể hoàn tác.');
  if (!confirmed) return;

  resetBtn.disabled = true;
  msg.textContent = 'Đang reset...';
  msg.className = 'admin-msg';

  try {
    const res = await fetch('/api/admin/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
    });
    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || 'Có lỗi xảy ra';
      msg.className = 'admin-msg err';
      return;
    }

    msg.textContent = 'Đã reset toàn bộ thành công! (kể cả tiến độ quiz)';
    msg.className = 'admin-msg ok';
    loadQuizLeaderboard();
  } catch (err) {
    msg.textContent = 'Không thể kết nối máy chủ';
    msg.className = 'admin-msg err';
  } finally {
    resetBtn.disabled = false;
  }
});
