const express = require('express');
const prisma = require('../prisma');

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

// POST /api/admin/quiz/finish - chot 4 nhom truong dua tren diem quiz, mo khoa man random
router.post('/admin/quiz/finish', async (req, res) => {
  const { secret } = req.body || {};

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

    if (eligible.length < LEADER_COUNT) {
      return res.status(400).json({
        error: `Chưa đủ ${LEADER_COUNT} người hoàn thành hết câu hỏi (hiện có ${eligible.length})`,
      });
    }

    eligible.sort((a, b) => (b.quizScore - a.quizScore) || (a.quizTimeMs - b.quizTimeMs));
    const winners = eligible.slice(0, LEADER_COUNT);
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

module.exports = router;
