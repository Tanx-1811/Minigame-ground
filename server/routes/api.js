const express = require('express');
const prisma = require('../prisma');
const quizLobby = require('../quizLobby');
const activity = require('../activity');
const {
  getSetting,
  setSetting,
  getGroupCapacity,
  isRoomsLocked,
  isRandomLocked,
  getPublicUi,
} = require('../settings');
const { loadGroupSlots, pickGroup, loadGroupsPayload } = require('../groups');
const { withLock } = require('../lock');

const router = express.Router();

async function resolvePhase() {
  const [phaseSetting, questionCount] = await Promise.all([getSetting('phase'), prisma.question.count()]);
  let phase = phaseSetting || 'quiz';
  // Chua co cau hoi nao duoc seed thi coi nhu bo qua vong quiz, mo random luon
  if (phase === 'quiz' && questionCount === 0) {
    phase = 'random';
  }
  return phase;
}

// GET /api/config - cau hinh cho man hinh intro (gio mo, phase, noi dung admin tu dat)
router.get('/config', async (req, res) => {
  try {
    const [eventStartAt, phase, roomsLocked, randomLocked, roomCount, ui] = await Promise.all([
      getSetting('eventStartAt'),
      resolvePhase(),
      isRoomsLocked(),
      isRandomLocked(),
      prisma.room.count(),
      getPublicUi(),
    ]);

    const leaders =
      phase === 'random'
        ? await prisma.member.findMany({ where: { isLeader: true }, select: { id: true, name: true } })
        : [];

    res.json({
      eventStartAt: eventStartAt || null,
      phase,
      leaders,
      roomsLocked,
      randomLocked,
      roomCount,
      ui,
    });
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
    await activity.log(
      {
        type: 'admin',
        icon: 'clock',
        message: value
          ? `Đặt giờ mở bốc thăm: ${new Date(value).toLocaleString('vi-VN')}`
          : 'Mở bốc thăm ngay (xóa giờ hẹn)',
      },
      req.io
    );
    res.json({ ok: true, eventStartAt: value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi lưu cấu hình' });
  }
});

// GET /api/activity - hoat dong gan day (dung cho activity feed tren trang chu)
router.get('/activity', async (req, res) => {
  try {
    res.json(await activity.list({ limit: req.query.limit || activity.MAX_FEED, type: req.query.type }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải hoạt động' });
  }
});

// GET /api/groups - danh sach nhom kem thanh vien (giu nguyen dang MANG nhu truoc)
router.get('/groups', async (req, res) => {
  try {
    const globalCapacity = await getGroupCapacity();
    const payload = await loadGroupsPayload(prisma, globalCapacity);
    res.json(payload.groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải danh sách nhóm' });
  }
});

// GET /api/groups/full - kem thong ke tong hop (cho trang chu va admin)
router.get('/groups/full', async (req, res) => {
  try {
    const globalCapacity = await getGroupCapacity();
    const payload = await loadGroupsPayload(prisma, globalCapacity);
    res.json({ ...payload, globalCapacity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải danh sách nhóm' });
  }
});

// GET /api/members - danh sach thanh vien (dung cho dropdown)
// ?scope=random|room|quiz -> chi tra nguoi duoc phep tham gia vong do, nho vay
// o chon ten tren trang cong khai khong hien ten nguoi bi loai khoi vong.
router.get('/members', async (req, res) => {
  const scopeField = { random: 'joinRandom', room: 'joinRoom', quiz: 'joinQuiz' }[req.query.scope];

  try {
    const members = await prisma.member.findMany({
      where: scopeField ? { [scopeField]: true } : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        gender: true,
        groupId: true,
        roomId: true,
        isLeader: true,
        quizScore: true,
        quizTimeMs: true,
        joinRandom: true,
        joinRoom: true,
        joinQuiz: true,
        pinnedGroup: true,
        pinnedRoom: true,
        group: { select: { id: true, name: true, color: true } },
        room: { select: { id: true, name: true, gender: true, capacity: true } },
      },
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
      return res.status(403).json({ error: 'Vòng random chưa mở — cần chốt xong Nhóm Trưởng trước' });
    }
    if (await isRandomLocked()) {
      return res.status(403).json({ error: 'Vòng random đang tạm khóa — chờ admin mở lại' });
    }

    const member = await prisma.member.findUnique({
      where: { name: name.trim() },
      include: { group: true },
    });

    if (!member) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    }
    if (!member.joinRandom) {
      return res.status(403).json({ error: 'Bạn không nằm trong danh sách tham gia vòng chia nhóm lần này' });
    }

    // Da random truoc do -> tra ve nhom cu
    if (member.groupId && member.group) {
      return res.json({
        member: { id: member.id, name: member.name, isLeader: member.isLeader },
        group: member.group,
        alreadyRandomized: true,
      });
    }

    const globalCapacity = await getGroupCapacity();

    // Chua random -> chon nhom theo luat trong server/groups.js: bo qua nhom dang
    // khoa / da day, uu tien nhom it nguoi nhat (chia deu), random giua cac nhom
    // bang nhau nen thu tu nhom nao duoc chon van hoan toan ngau nhien.
    // Chay trong hang doi 'groups' (server/lock.js) de 2 nguoi bam cung luc khong
    // cung doc ra "nhom X con 1 cho"; kiem lai groupId vi bam dup gui 2 request.
    const { randomGroup, updatedMember, fresh } = await withLock('groups', () =>
      prisma.$transaction(async (tx) => {
        const current = await tx.member.findUnique({ where: { id: member.id }, include: { group: true } });
        if (current && current.group) {
          return { randomGroup: current.group, updatedMember: current, fresh: false };
        }

        const slots = await loadGroupSlots(tx, globalCapacity);
        if (slots.length === 0) {
          throw new Error('NO_GROUPS');
        }

        const chosen = pickGroup(slots, { isLeader: member.isLeader });
        if (!chosen) {
          throw new Error('GROUPS_FULL');
        }

        const updated = await tx.member.update({
          where: { id: member.id },
          data: { groupId: chosen.id },
          include: { group: true },
        });

        return { randomGroup: updated.group, updatedMember: updated, fresh: true };
      })
    );

    if (!fresh) {
      return res.json({
        member: { id: updatedMember.id, name: updatedMember.name, isLeader: updatedMember.isLeader },
        group: randomGroup,
        alreadyRandomized: true,
      });
    }

    const activityEntry = {
      member: { id: updatedMember.id, name: updatedMember.name, isLeader: updatedMember.isLeader },
      group: { id: randomGroup.id, name: randomGroup.name },
      at: new Date().toISOString(),
    };

    await activity.log({
      type: 'random',
      icon: 'dices',
      actor: updatedMember.name,
      message: `${updatedMember.name} vào ${randomGroup.name}`,
      meta: { groupId: randomGroup.id, memberId: updatedMember.id },
    });

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
    if (err.message === 'GROUPS_FULL') {
      return res.status(409).json({ error: 'Tất cả nhóm đã đầy hoặc đang khóa — nhờ admin mở thêm chỗ' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi random nhóm' });
  }
});

// POST /api/admin/reset - xoa toan bo ket qua random (can dung secret).
// Mac dinh KHONG dong den ket qua ghep phong ngu (tinh nang doc lap);
// truyen includeRooms=true neu muon xoa luon.
router.post('/admin/reset', async (req, res) => {
  const { secret, includeRooms, includeActivity, keepPinned } = req.body || {};

  if (!process.env.ADMIN_RESET_SECRET || secret !== process.env.ADMIN_RESET_SECRET) {
    return res.status(401).json({ error: 'Sai mã bí mật' });
  }

  try {
    // Diem quiz / nhom truong luon reset cho tat ca. Rieng ket qua chia nhom va
    // ghep phong thi keepPinned se bo qua nhung nguoi admin da ghim.
    await prisma.member.updateMany({ data: { isLeader: false, quizScore: 0, quizTimeMs: 0 } });
    await prisma.member.updateMany({
      where: keepPinned ? { pinnedGroup: false } : {},
      data: { groupId: null },
    });
    if (includeRooms) {
      await prisma.member.updateMany({
        where: keepPinned ? { pinnedRoom: false } : {},
        data: { roomId: null },
      });
    }
    await prisma.answer.deleteMany({});

    const questionCount = await prisma.question.count();
    const newPhase = questionCount > 0 ? 'quiz' : 'random';
    await setSetting('phase', newPhase);

    quizLobby.clearLobby();
    await quizLobby.setQuizStatus('waiting');

    if (includeActivity) await activity.clear();

    req.io.emit('groups:reset', { phase: newPhase });
    req.io.emit('groups:updated', {});
    if (includeRooms) {
      req.io.emit('rooms:reset', {});
      req.io.emit('rooms:updated', {});
    }

    await activity.log(
      {
        type: 'admin',
        icon: 'rotate-ccw',
        message: `Reset toàn bộ${includeRooms ? ' (kể cả ghép phòng)' : ''}${
          keepPinned ? ' — giữ người đã ghim' : ''
        }`,
      },
      req.io
    );

    res.json({ ok: true, phase: newPhase, roomsCleared: !!includeRooms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi reset' });
  }
});

module.exports = router;
