const express = require('express');
const prisma = require('../prisma');

const router = express.Router();

// Luu tam hoat dong gan day trong bo nho (mat khi restart server, du dung cho 1 su kien)
const MAX_ACTIVITY = 20;
let recentActivity = [];

function pushActivity(entry) {
  recentActivity.unshift(entry);
  if (recentActivity.length > MAX_ACTIVITY) {
    recentActivity.length = MAX_ACTIVITY;
  }
}

async function getSetting(key) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : null;
}

async function setSetting(key, value) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

async function resolvePhase() {
  const [phaseSetting, questionCount] = await Promise.all([getSetting('phase'), prisma.question.count()]);
  let phase = phaseSetting || 'quiz';
  // Chua co cau hoi nao duoc seed thi coi nhu bo qua vong quiz, mo random luon
  if (phase === 'quiz' && questionCount === 0) {
    phase = 'random';
  }
  return phase;
}

// GET /api/config - cau hinh cho man hinh intro (thoi diem mo bot tham, phase quiz/random)
router.get('/config', async (req, res) => {
  try {
    const [eventStartAt, phase] = await Promise.all([getSetting('eventStartAt'), resolvePhase()]);
    const leaders =
      phase === 'random'
        ? await prisma.member.findMany({ where: { isLeader: true }, select: { id: true, name: true } })
        : [];
    res.json({ eventStartAt: eventStartAt || null, phase, leaders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải cấu hình' });
  }
});

// POST /api/admin/event-time - dat/xoa gio mo boc tham (can dung secret)
router.post('/admin/event-time', async (req, res) => {
  const { secret, eventStartAt } = req.body || {};

  if (!process.env.ADMIN_RESET_SECRET || secret !== process.env.ADMIN_RESET_SECRET) {
    return res.status(401).json({ error: 'Sai mã bí mật' });
  }

  const value = eventStartAt && String(eventStartAt).trim() ? String(eventStartAt).trim() : null;
  if (value && Number.isNaN(new Date(value).getTime())) {
    return res.status(400).json({ error: 'Thời gian không hợp lệ' });
  }

  try {
    await setSetting('eventStartAt', value);
    req.io.emit('config:updated', { eventStartAt: value });
    res.json({ ok: true, eventStartAt: value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi lưu cấu hình' });
  }
});

// GET /api/activity - danh sach hoat dong random gan day (dung cho activity feed)
router.get('/activity', (req, res) => {
  res.json(recentActivity);
});

// GET /api/groups - danh sach 4 nhom kem thanh vien
router.get('/groups', async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      orderBy: { id: 'asc' },
      include: {
        members: {
          orderBy: { name: 'asc' },
        },
      },
    });
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải danh sách nhóm' });
  }
});

// GET /api/members - danh sach thanh vien (dung cho dropdown)
router.get('/members', async (req, res) => {
  try {
    const members = await prisma.member.findMany({
      orderBy: { name: 'asc' },
      include: { group: true },
    });
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải danh sách thành viên' });
  }
});

// POST /api/random - random nhom cho 1 thanh vien (idempotent)
router.post('/random', async (req, res) => {
  const { name } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Thiếu tên thành viên' });
  }

  try {
    const phase = await resolvePhase();
    if (phase !== 'random') {
      return res.status(403).json({ error: 'Vòng random chưa mở — cần chốt xong 4 Nhóm Trưởng trước' });
    }

    const member = await prisma.member.findUnique({
      where: { name: name.trim() },
      include: { group: true },
    });

    if (!member) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    }

    // Da random truoc do -> tra ve nhom cu
    if (member.groupId && member.group) {
      return res.json({
        member: { id: member.id, name: member.name, isLeader: member.isLeader },
        group: member.group,
        alreadyRandomized: true,
      });
    }

    // Chua random -> random lon xon giua cac nhom dang it thanh vien nhat,
    // nho do van chia deu (chenh lech toi da 1 nguoi giua cac nhom) nhung
    // thu tu nhom nao duoc chon truoc thi hoan toan ngau nhien.
    // Rieng 4 nhom truong: luon uu tien nhom chua co nhom truong nao,
    // de dam bao khong bao gio 2 nhom truong roi vao chung 1 nhom.
    const { randomGroup, updatedMember } = await prisma.$transaction(async (tx) => {
      const groups = await tx.group.findMany({
        orderBy: { id: 'asc' },
        include: {
          _count: { select: { members: true } },
          members: { where: { isLeader: true }, select: { id: true } },
        },
      });
      if (groups.length === 0) {
        throw new Error('NO_GROUPS');
      }

      let pool = groups;
      if (member.isLeader) {
        const openForLeader = groups.filter((g) => g.members.length === 0);
        pool = openForLeader.length ? openForLeader : groups;
      }

      const minCount = Math.min(...pool.map((g) => g._count.members));
      const candidates = pool.filter((g) => g._count.members === minCount);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];

      const updated = await tx.member.update({
        where: { id: member.id },
        data: { groupId: chosen.id },
        include: { group: true },
      });

      return { randomGroup: chosen, updatedMember: updated };
    });

    const activityEntry = {
      member: { id: updatedMember.id, name: updatedMember.name, isLeader: updatedMember.isLeader },
      group: { id: randomGroup.id, name: randomGroup.name },
      at: new Date().toISOString(),
    };
    pushActivity(activityEntry);

    // Emit realtime cho tat ca client
    req.io.emit('member:randomized', activityEntry);

    res.json({
      member: { id: updatedMember.id, name: updatedMember.name, isLeader: updatedMember.isLeader },
      group: randomGroup,
      alreadyRandomized: false,
    });
  } catch (err) {
    if (err.message === 'NO_GROUPS') {
      return res.status(500).json({ error: 'Chưa có nhóm nào trong hệ thống' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi random nhóm' });
  }
});

// POST /api/admin/reset - xoa toan bo ket qua random (can dung secret)
router.post('/admin/reset', async (req, res) => {
  const { secret } = req.body || {};

  if (!process.env.ADMIN_RESET_SECRET || secret !== process.env.ADMIN_RESET_SECRET) {
    return res.status(401).json({ error: 'Sai mã bí mật' });
  }

  try {
    await prisma.member.updateMany({
      data: { groupId: null, isLeader: false, quizScore: 0, quizTimeMs: 0 },
    });
    await prisma.answer.deleteMany({});

    const questionCount = await prisma.question.count();
    const newPhase = questionCount > 0 ? 'quiz' : 'random';
    await prisma.setting.upsert({
      where: { key: 'phase' },
      update: { value: newPhase },
      create: { key: 'phase', value: newPhase },
    });

    recentActivity = [];
    req.io.emit('groups:reset', { phase: newPhase });

    res.json({ ok: true, phase: newPhase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi reset' });
  }
});

module.exports = router;
