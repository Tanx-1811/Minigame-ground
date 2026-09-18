const express = require('express');
const prisma = require('../prisma');
const quizLobby = require('../quizLobby');

const router = express.Router();

const LEADER_COUNT = 4;

function serializeQuestion(q) {
  return { id: q.id, order: q.order, text: q.text, options: q.options };
}

async function getLeaderboard() {
  const total = await prisma.question.count();
  const members = await prisma.member.findMany({
    where: { answers: { some: {} } },
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
    const [member, total] = await Promise.all([
      prisma.member.findUnique({
        where: { name },
        include: { answers: { select: { questionId: true } } },
      }),
      prisma.question.count(),
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

// POST /api/quiz/answer - ghi nhan 1 cau tra loi (idempotent theo memberId+questionId)
router.post('/quiz/answer', async (req, res) => {
  const { name, questionId, selectedIndex, timeMs } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Thiếu tên thành viên' });
  }
  if (!Number.isInteger(questionId)) {
    return res.status(400).json({ error: 'Thiếu câu hỏi' });
  }
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
    return res.status(400).json({ error: 'Đáp án không hợp lệ' });
  }
  const safeTimeMs = Number.isFinite(timeMs) && timeMs >= 0 ? Math.round(timeMs) : 0;

  try {
    const member = await prisma.member.findUnique({ where: { name: name.trim() } });
    if (!member) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    }

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    }

    const existing = await prisma.answer.findUnique({
      where: { memberId_questionId: { memberId: member.id, questionId: question.id } },
    });

    if (existing) {
      return res.json({
        correct: existing.correct,
        correctIndex: question.correctIndex,
        alreadyAnswered: true,
        myScore: member.quizScore,
        myTimeMs: member.quizTimeMs,
      });
    }

    const correct = selectedIndex === question.correctIndex;

    const { updatedMember } = await prisma.$transaction(async (tx) => {
      await tx.answer.create({
        data: {
          memberId: member.id,
          questionId: question.id,
          selectedIndex,
          correct,
          timeMs: safeTimeMs,
        },
      });

      const updated = await tx.member.update({
        where: { id: member.id },
        data: {
          quizScore: { increment: correct ? 1 : 0 },
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
      myScore: updatedMember.quizScore,
      myTimeMs: updatedMember.quizTimeMs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi ghi nhận câu trả lời' });
  }
});

// POST /api/admin/quiz/start - admin bam bat dau, khoa phong cho va bao tat ca dem nguoc 3 giay
// truoc khi vao lam bai (idempotent - bam lai khi da active thi khong dem nguoc lai tu dau)
router.post('/admin/quiz/start', async (req, res) => {
  const { secret } = req.body || {};

  if (!process.env.ADMIN_RESET_SECRET || secret !== process.env.ADMIN_RESET_SECRET) {
    return res.status(401).json({ error: 'Sai mã bí mật' });
  }

  try {
    const status = await quizLobby.getQuizStatus();
    if (status === 'active') {
      return res.json({ ok: true, alreadyStarted: true });
    }

    await quizLobby.setQuizStatus('active');
    const startAt = new Date(Date.now() + 3000).toISOString();
    req.io.emit('quiz:started', { startAt });

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
      where: { answers: { some: {} } },
      include: { _count: { select: { answers: true } } },
    });
    const eligible = finishers.filter((m) => m._count.answers >= total);

    // Nhom truong (admin) co the buoc chot du chua du LEADER_COUNT nguoi hoan thanh,
    // de khong bi ket man chi vi thieu nguoi lam het quiz.
    const pool = force ? finishers : eligible;

    if (!force && eligible.length < LEADER_COUNT) {
      return res.status(400).json({
        error: `Chưa đủ ${LEADER_COUNT} người hoàn thành hết câu hỏi (hiện có ${eligible.length})`,
      });
    }
    if (force && pool.length === 0) {
      return res.status(400).json({ error: 'Chưa có ai làm quiz để chốt' });
    }

    pool.sort((a, b) => (b.quizScore - a.quizScore) || (a.quizTimeMs - b.quizTimeMs));
    const winners = pool.slice(0, LEADER_COUNT);
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

    req.io.emit('groups:reset', { phase: newPhase });

    res.json({ ok: true, phase: newPhase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi reset vòng chọn nhóm trưởng' });
  }
});

module.exports = router;
