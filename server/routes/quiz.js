const express = require('express');
const prisma = require('../prisma');
const quizLobby = require('../quizLobby');
const activity = require('../activity');
const { getLeaderCount, getSetting } = require('../settings');
const { withLock } = require('../lock');

const router = express.Router();

// Tre mang + thoi gian ve giao dien: cho phep lech them chut it so voi gioi han
// thoi gian truoc khi coi la het gio, de nguoi bam o giay cuoi khong bi oan.
const TIME_GRACE_MS = 2500;

function quizIsOpen(phase, status) {
  return (phase || 'quiz') === 'quiz' && status === 'active';
}

function serializeQuestion(q) {
  return {
    id: q.id,
    order: q.order,
    text: q.text,
    options: q.options,
    points: q.points,
    timeLimitSec: q.timeLimitSec,
  };
}

// Tong diem toi da cua ca bo cau hoi (moi cau co the co diem rieng)
async function getMaxScore() {
  const agg = await prisma.question.aggregate({ _sum: { points: true } });
  return agg._sum.points || 0;
}

async function getLeaderboard() {
  const total = await prisma.question.count();
  const members = await prisma.member.findMany({
    where: { answers: { some: {} }, joinQuiz: true },
    orderBy: [{ quizScore: 'desc' }, { quizTimeMs: 'asc' }],
    include: { _count: { select: { answers: true } } },
    take: 20,
  });

  return members.map((m) => ({
    name: m.name,
    score: m.quizScore,
    timeMs: m.quizTimeMs,
    answered: m._count.answers,
    finished: total > 0 && m._count.answers >= total,
  }));
}

// GET /api/quiz/questions - danh sach cau hoi (khong kem dap an dung)
router.get('/quiz/questions', async (req, res) => {
  try {
    const questions = await prisma.question.findMany({ orderBy: { order: 'asc' } });
    res.json(questions.map(serializeQuestion));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải câu hỏi' });
  }
});

// GET /api/quiz/state?name=... - tien do quiz cua 1 thanh vien
router.get('/quiz/state', async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  if (!name) {
    return res.status(400).json({ error: 'Thiếu tên thành viên' });
  }

  try {
    const [member, total, status, leaderCount] = await Promise.all([
      prisma.member.findUnique({
        where: { name },
        include: { answers: { select: { questionId: true } } },
      }),
      prisma.question.count(),
      quizLobby.getQuizStatus(),
      getLeaderCount(),
    ]);

    if (!member) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    }

    const answeredIds = member.answers.map((a) => a.questionId);
    res.json({
      total,
      answeredIds,
      score: member.quizScore,
      timeMs: member.quizTimeMs,
      finished: total > 0 && answeredIds.length >= total,
      isLeader: member.isLeader,
      status,
      leaderCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải tiến độ quiz' });
  }
});

// GET /api/quiz/lobby - trang thai phong cho (waiting/active) + danh sach nguoi da tham gia
router.get('/quiz/lobby', async (req, res) => {
  try {
    const status = await quizLobby.getQuizStatus();
    res.json({ status, members: quizLobby.getLobbyMembers() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải phòng chờ' });
  }
});

// POST /api/quiz/join - 1 thanh vien vao phong cho, cho admin bam bat dau
// (idempotent - vao lai nhieu lan khong sao; neu quiz da active thi tra ve luon de
// client tu chuyen sang lam bai ngay, khong can cho)
router.post('/quiz/join', async (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Thiếu tên thành viên' });
  }

  try {
    const member = await prisma.member.findUnique({ where: { name: name.trim() } });
    if (!member) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    }
    if (!member.joinQuiz) {
      return res.status(403).json({ error: 'Bạn không nằm trong danh sách tham gia vòng Quiz lần này' });
    }

    const status = await quizLobby.getQuizStatus();
    if (status === 'active') {
      return res.json({ status: 'active', members: quizLobby.getLobbyMembers() });
    }

    quizLobby.addLobbyMember(member.name);
    const members = quizLobby.getLobbyMembers();
    req.io.emit('quiz:lobby', { members });
    res.json({ status: 'waiting', members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi vào phòng chờ' });
  }
});

// GET /api/quiz/leaderboard - bang xep hang tam thoi (khong tiet lo ai la nhom truong khi chua chot)
router.get('/quiz/leaderboard', async (req, res) => {
  try {
    res.json(await getLeaderboard());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải bảng xếp hạng quiz' });
  }
});

// POST /api/quiz/seen - client bao "dang hien cau nay". May chu ghi moc lan dau va
// tra ve so ms da troi qua, de F5 giua chung thi dong ho dem nguoc van tiep tuc
// dung cho cu thay vi chay lai tu dau.
router.post('/quiz/seen', async (req, res) => {
  const { name, questionId } = req.body || {};
  if (!name || typeof name !== 'string' || !Number.isInteger(questionId)) {
    return res.status(400).json({ error: 'Thiếu thông tin câu hỏi' });
  }

  try {
    const member = await prisma.member.findUnique({ where: { name: name.trim() }, select: { id: true } });
    if (!member) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    res.json({ elapsedMs: quizLobby.markSeen(member.id, questionId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể ghi nhận câu hỏi' });
  }
});

// POST /api/quiz/answer - ghi nhan 1 cau tra loi (idempotent theo memberId+questionId).
// selectedIndex = -1 nghia la het gio ma chua chon (tinh la sai, 0 diem).
router.post('/quiz/answer', async (req, res) => {
  const { name, questionId, selectedIndex, timeMs } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Thiếu tên thành viên' });
  }
  if (!Number.isInteger(questionId)) {
    return res.status(400).json({ error: 'Thiếu câu hỏi' });
  }
  if (!Number.isInteger(selectedIndex) || selectedIndex < -1) {
    return res.status(400).json({ error: 'Đáp án không hợp lệ' });
  }
  const clientTimeMs = Number.isFinite(timeMs) && timeMs >= 0 ? Math.round(timeMs) : 0;

  try {
    const member = await prisma.member.findUnique({ where: { name: name.trim() } });
    if (!member) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    }
    if (!member.joinQuiz) {
      return res.status(403).json({ error: 'Bạn không nằm trong danh sách tham gia vòng Quiz lần này' });
    }

    // Chi nhan bai khi admin da bam bat dau va chua chot Nhom Truong - truoc day
    // goi thang API la tra loi duoc ca truoc gio lan sau khi da chot.
    const [phase, status] = await Promise.all([getSetting('phase'), quizLobby.getQuizStatus()]);
    if (!quizIsOpen(phase, status)) {
      return res.status(403).json({
        error: (phase || 'quiz') === 'quiz' ? 'Vòng Quiz chưa bắt đầu — chờ admin bấm bắt đầu' : 'Vòng Quiz đã kết thúc',
      });
    }

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    }
    const optionCount = Array.isArray(question.options) ? question.options.length : 0;
    if (selectedIndex >= optionCount) {
      return res.status(400).json({ error: 'Đáp án không hợp lệ' });
    }

    // Thoi gian lay theo may chu neu co moc (tru hao tre mang), khong de client tu khai
    // nho hon thuc te. Qua gioi han thoi gian cua cau -> tinh nhu het gio.
    const serverElapsed = quizLobby.elapsedSince(member.id, question.id);
    let safeTimeMs = serverElapsed === null ? clientTimeMs : Math.max(clientTimeMs, serverElapsed - TIME_GRACE_MS);
    let timedOut = selectedIndex === -1;
    if (question.timeLimitSec) {
      const limitMs = question.timeLimitSec * 1000;
      if (serverElapsed !== null && serverElapsed > limitMs + TIME_GRACE_MS) timedOut = true;
      safeTimeMs = Math.min(safeTimeMs, limitMs);
    }

    // Bam dup / mang cham gui 2 lan: xep theo tung nguoi de lan sau thay ban ghi
    // cua lan truoc, thay vi dam vao khoa unique va bao loi 500.
    return await withLock(`quiz:${member.id}`, () =>
      recordAnswer(req, res, member, question, selectedIndex, safeTimeMs, timedOut)
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi ghi nhận câu trả lời' });
  }
});

async function recordAnswer(req, res, member, question, selectedIndex, safeTimeMs, timedOut) {
  const existing = await prisma.answer.findUnique({
    where: { memberId_questionId: { memberId: member.id, questionId: question.id } },
  });

  if (existing) {
    const fresh = await prisma.member.findUnique({ where: { id: member.id } });
    return res.json({
      correct: existing.correct,
      correctIndex: question.correctIndex,
      alreadyAnswered: true,
      timedOut: existing.selectedIndex === -1,
      myScore: fresh ? fresh.quizScore : member.quizScore,
      myTimeMs: fresh ? fresh.quizTimeMs : member.quizTimeMs,
    });
  }

  const correct = !timedOut && selectedIndex === question.correctIndex;

  const { updatedMember } = await prisma.$transaction(async (tx) => {
    await tx.answer.create({
      data: {
        memberId: member.id,
        questionId: question.id,
        selectedIndex: timedOut ? -1 : selectedIndex,
        correct,
        timeMs: safeTimeMs,
      },
    });

    const updated = await tx.member.update({
      where: { id: member.id },
      data: {
        quizScore: { increment: correct ? question.points : 0 },
        quizTimeMs: { increment: safeTimeMs },
      },
    });

    return { updatedMember: updated };
  });

  const [total, answeredCount, leaderboard] = await Promise.all([
    prisma.question.count(),
    prisma.answer.count({ where: { memberId: member.id } }),
    getLeaderboard(),
  ]);

  // Gui kem leaderboard san de client khong phai tu goi lai /api/quiz/leaderboard
  // moi lan co nguoi tra loi (tranh N client x M cau tra loi = qua nhieu request cung luc).
  req.io.emit('quiz:progress', {
    name: updatedMember.name,
    score: updatedMember.quizScore,
    finished: total > 0 && answeredCount >= total,
    leaderboard,
  });

  res.json({
    correct,
    correctIndex: question.correctIndex,
    alreadyAnswered: false,
    timedOut,
    myScore: updatedMember.quizScore,
    myTimeMs: updatedMember.quizTimeMs,
  });
}

// POST /api/admin/quiz/start - admin bam bat dau, khoa phong cho va bao tat ca dem nguoc 3 giay
// truoc khi vao lam bai (idempotent - bam lai khi da active thi khong dem nguoc lai tu dau)
router.post('/admin/quiz/start', async (req, res) => {
  const { secret } = req.body || {};

  if (!process.env.ADMIN_RESET_SECRET || secret !== process.env.ADMIN_RESET_SECRET) {
    return res.status(401).json({ error: 'Sai mã bí mật' });
  }

  try {
    const [status, phase, total] = await Promise.all([
      quizLobby.getQuizStatus(),
      getSetting('phase'),
      prisma.question.count(),
    ]);
    if ((phase || 'quiz') !== 'quiz') {
      return res.status(400).json({ error: 'Đã chốt Nhóm Trưởng — bấm "Làm lại vòng Quiz" nếu muốn chơi lại' });
    }
    if (total === 0) {
      return res.status(400).json({ error: 'Chưa có câu hỏi nào — thêm câu hỏi ở trang Câu hỏi trước' });
    }
    if (status === 'active') {
      return res.json({ ok: true, alreadyStarted: true });
    }

    await quizLobby.setQuizStatus('active');
    const startAt = new Date(Date.now() + 3000).toISOString();
    // delayMs: client tu dem bang dong ho cua chinh no - dien thoai lech gio 30 giay
    // ma so voi startAt tuyet doi thi se dem nguoc 33 giay thay vi 3.
    req.io.emit('quiz:started', { startAt, delayMs: 3000 });
    await activity.log(
      { type: 'quiz', icon: 'play', message: `Bắt đầu vòng Quiz (${quizLobby.getLobbyMembers().length} người trong phòng chờ)` },
      req.io
    );

    res.json({ ok: true, startAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi bắt đầu quiz' });
  }
});

// POST /api/admin/quiz/finish - chot 4 nhom truong dua tren diem quiz, mo khoa man random
router.post('/admin/quiz/finish', async (req, res) => {
  const { secret, force } = req.body || {};

  if (!process.env.ADMIN_RESET_SECRET || secret !== process.env.ADMIN_RESET_SECRET) {
    return res.status(401).json({ error: 'Sai mã bí mật' });
  }

  try {
    const existingPhase = await prisma.setting.findUnique({ where: { key: 'phase' } });
    if (existingPhase && existingPhase.value === 'random') {
      const leaders = await prisma.member.findMany({
        where: { isLeader: true },
        select: { id: true, name: true },
      });
      return res.json({ ok: true, phase: 'random', leaders, alreadyFinished: true });
    }

    const total = await prisma.question.count();
    if (total === 0) {
      return res.status(400).json({ error: 'Chưa có câu hỏi nào để chấm điểm' });
    }

    const finishers = await prisma.member.findMany({
      where: { answers: { some: {} }, joinQuiz: true },
      include: { _count: { select: { answers: true } } },
    });
    const eligible = finishers.filter((m) => m._count.answers >= total);

    // So nhom truong do admin cau hinh (bang Setting, mac dinh 4)
    const leaderCount = await getLeaderCount();

    // Nhom truong (admin) co the buoc chot du chua du leaderCount nguoi hoan thanh,
    // de khong bi ket man chi vi thieu nguoi lam het quiz.
    const pool = force ? finishers : eligible;

    if (!force && eligible.length < leaderCount) {
      return res.status(400).json({
        error: `Chưa đủ ${leaderCount} người hoàn thành hết câu hỏi (hiện có ${eligible.length})`,
      });
    }
    if (force && pool.length === 0) {
      return res.status(400).json({ error: 'Chưa có ai làm quiz để chốt' });
    }

    pool.sort((a, b) => (b.quizScore - a.quizScore) || (a.quizTimeMs - b.quizTimeMs));
    const winners = pool.slice(0, leaderCount);
    const winnerIds = winners.map((w) => w.id);

    await prisma.$transaction([
      prisma.member.updateMany({ data: { isLeader: false } }),
      prisma.member.updateMany({ where: { id: { in: winnerIds } }, data: { isLeader: true } }),
      prisma.setting.upsert({
        where: { key: 'phase' },
        update: { value: 'random' },
        create: { key: 'phase', value: 'random' },
      }),
    ]);

    const leaders = winners.map((w) => ({ id: w.id, name: w.name }));
    req.io.emit('phase:updated', { phase: 'random', leaders });
    req.io.emit('groups:updated', {});
    req.io.emit('members:updated', {});

    await activity.log(
      {
        type: 'quiz',
        icon: 'crown',
        message: `Chốt ${leaders.length} Nhóm Trưởng: ${leaders.map((l) => l.name).join(', ')}`,
      },
      req.io
    );

    res.json({ ok: true, phase: 'random', leaders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi chốt nhóm trưởng' });
  }
});

// POST /api/admin/quiz/reset - xoa tien do quiz + bo chot nhom truong, quay lai vong quiz tu dau
// (khong dong den groupId nen ket qua random cua thanh vien thuong khong bi mat)
router.post('/admin/quiz/reset', async (req, res) => {
  const { secret } = req.body || {};

  if (!process.env.ADMIN_RESET_SECRET || secret !== process.env.ADMIN_RESET_SECRET) {
    return res.status(401).json({ error: 'Sai mã bí mật' });
  }

  try {
    await prisma.answer.deleteMany({});
    await prisma.member.updateMany({
      data: { isLeader: false, quizScore: 0, quizTimeMs: 0 },
    });

    const total = await prisma.question.count();
    const newPhase = total > 0 ? 'quiz' : 'random';
    await prisma.setting.upsert({
      where: { key: 'phase' },
      update: { value: newPhase },
      create: { key: 'phase', value: newPhase },
    });

    quizLobby.clearLobby();
    await quizLobby.setQuizStatus('waiting');

    req.io.emit('groups:reset', { scope: 'quiz', phase: newPhase });
    req.io.emit('groups:updated', {});
    req.io.emit('members:updated', {});
    await activity.log({ type: 'quiz', icon: 'rotate-ccw', message: 'Làm lại vòng Quiz từ đầu' }, req.io);

    res.json({ ok: true, phase: newPhase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi reset vòng chọn nhóm trưởng' });
  }
});

module.exports = router;
