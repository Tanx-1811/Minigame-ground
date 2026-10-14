const express = require('express');
const prisma = require('../prisma');
const requireAdmin = require('../adminAuth');
const { getRoomCapacity, isRoomsLocked, setSetting } = require('../settings');
const {
  GENDERS,
  parseGender,
  genderLabel,
  parseCapacity,
  loadRoomSlots,
  pickRoom,
  assignAllPending,
  loadRoomsPayload,
  MAX_ROOM_CAPACITY,
} = require('../rooms');

const router = express.Router();

const MAX_DRAW_ATTEMPTS = 3;

// Hai nguoi bam quay cung luc co the cung doc ra "phong X con 1 cho" roi ghi de
// len nhau. Nen sau khi ghi phai dem lai trong cung transaction: neu vuot suc
// chua thi roll back va chon lai phong khac.
async function drawRoomFor(member) {
  for (let attempt = 1; attempt <= MAX_DRAW_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const slots = await loadRoomSlots(tx);
        if (!slots.some((r) => r.gender === member.gender)) {
          throw new Error('NO_ROOM_FOR_GENDER');
        }

        const room = pickRoom(slots, member.gender);
        if (!room) {
          throw new Error('ROOMS_FULL');
        }

        await tx.member.update({ where: { id: member.id }, data: { roomId: room.id } });

        const occupancy = await tx.member.count({ where: { roomId: room.id } });
        if (occupancy > room.capacity) {
          throw new Error('RACE');
        }

        return room.id;
      });
    } catch (err) {
      if (err.message !== 'RACE' || attempt === MAX_DRAW_ATTEMPTS) throw err;
    }
  }

  throw new Error('ROOMS_FULL');
}

// Sau moi thay doi tu admin (them/sua/xoa phong, ghep hang loat, reset) thi phat
// lai toan bo danh sach phong cho client. Thao tac admin rat it nen gui ca cuc
// du lieu la don gian va an toan nhat; rieng luot tu random cua tung nguoi dung
// payload nho de patch (giong flow random nhom) de khong bung request.
async function emitRooms(req) {
  const payload = await loadRoomsPayload(prisma);
  req.io.emit('rooms:updated', payload);
  return payload;
}

async function findRoomWithMembers(id) {
  return prisma.room.findUnique({
    where: { id },
    include: {
      members: { orderBy: { name: 'asc' }, select: { id: true, name: true, gender: true, isLeader: true } },
    },
  });
}

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// GET /api/rooms - danh sach phong ngu kem nguoi o trong tung phong
router.get('/rooms', async (req, res) => {
  try {
    const [payload, locked, defaultCapacity] = await Promise.all([
      loadRoomsPayload(prisma),
      isRoomsLocked(),
      getRoomCapacity(),
    ]);
    res.json({ ...payload, locked, defaultCapacity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải danh sách phòng' });
  }
});

// POST /api/room/random - random phong ngu cho 1 thanh vien (idempotent, dung gioi tinh)
router.post('/room/random', async (req, res) => {
  const { name } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Thiếu tên thành viên' });
  }

  try {
    if (await isRoomsLocked()) {
      return res.status(403).json({ error: 'Vòng ghép phòng đang tạm khóa — chờ admin mở' });
    }

    const member = await prisma.member.findUnique({ where: { name: name.trim() } });
    if (!member) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    }
    if (!member.gender) {
      return res
        .status(400)
        .json({ error: 'Bạn chưa được đặt giới tính (Nam/Nữ) — nhờ admin cập nhật trước khi ghép phòng' });
    }

    // Da co phong truoc do -> tra ve phong cu, khong random lai
    if (member.roomId) {
      const room = await findRoomWithMembers(member.roomId);
      if (room) {
        return res.json({
          member: { id: member.id, name: member.name, gender: member.gender },
          room,
          alreadyAssigned: true,
        });
      }
    }

    const chosenId = await drawRoomFor(member);
    const room = await findRoomWithMembers(chosenId);
    const payload = {
      member: { id: member.id, name: member.name, gender: member.gender },
      room,
      at: new Date().toISOString(),
    };

    req.io.emit('member:room-randomized', payload);
    res.json({ ...payload, alreadyAssigned: false });
  } catch (err) {
    if (err.message === 'NO_ROOM_FOR_GENDER') {
      return res
        .status(409)
        .json({ error: 'Chưa có phòng nào dành cho giới tính của bạn — nhờ admin tạo thêm phòng' });
    }
    if (err.message === 'ROOMS_FULL' || err.message === 'RACE') {
      return res.status(409).json({ error: 'Các phòng cùng giới tính đã kín chỗ — nhờ admin mở thêm phòng' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi ghép phòng' });
  }
});

// POST /api/admin/rooms - tao phong moi
router.post('/admin/rooms', requireAdmin, async (req, res) => {
  const { name, gender, capacity, note } = req.body || {};

  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) {
    return res.status(400).json({ error: 'Thiếu tên phòng' });
  }

  const parsedGender = parseGender(gender);
  if (!parsedGender) {
    return res.status(400).json({ error: 'Phòng phải chọn giới tính Nam hoặc Nữ' });
  }

  const parsedCapacity = parseCapacity(capacity === undefined || capacity === '' ? await getRoomCapacity() : capacity);
  if (!parsedCapacity) {
    return res.status(400).json({ error: `Sức chứa phải là số từ 1 đến ${MAX_ROOM_CAPACITY}` });
  }

  try {
    const room = await prisma.room.create({
      data: {
        name: cleanName,
        gender: parsedGender,
        capacity: parsedCapacity,
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
      },
    });

    await emitRooms(req);
    res.json({ ok: true, room });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Tên phòng này đã tồn tại' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi tạo phòng' });
  }
});

// PUT /api/admin/rooms/:id - sua ten / gioi tinh / suc chua / ghi chu
router.put('/admin/rooms/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Phòng không hợp lệ' });
  }

  const { name, gender, capacity, note } = req.body || {};
  const data = {};

  if (name !== undefined) {
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName) return res.status(400).json({ error: 'Tên phòng không được để trống' });
    data.name = cleanName;
  }

  if (gender !== undefined) {
    const parsedGender = parseGender(gender);
    if (!parsedGender) return res.status(400).json({ error: 'Giới tính phòng không hợp lệ' });
    data.gender = parsedGender;
  }

  if (capacity !== undefined) {
    const parsedCapacity = parseCapacity(capacity);
    if (!parsedCapacity) {
      return res.status(400).json({ error: `Sức chứa phải là số từ 1 đến ${MAX_ROOM_CAPACITY}` });
    }
    data.capacity = parsedCapacity;
  }

  if (note !== undefined) {
    data.note = typeof note === 'string' && note.trim() ? note.trim() : null;
  }

  if (!Object.keys(data).length) {
    return res.status(400).json({ error: 'Không có thay đổi nào' });
  }

  try {
    const room = await findRoomWithMembers(id);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }

    if (data.capacity !== undefined && data.capacity < room.members.length) {
      return res.status(400).json({
        error: `Phòng đang có ${room.members.length} người, không thể hạ sức chứa xuống ${data.capacity} — chuyển người ra trước`,
      });
    }

    if (data.gender !== undefined && room.members.some((m) => m.gender !== data.gender)) {
      return res.status(400).json({
        error: `Phòng đang có người ${genderLabel(room.gender)} ở trong — chuyển họ ra trước khi đổi giới tính phòng`,
      });
    }

    const updated = await prisma.room.update({ where: { id }, data });
    await emitRooms(req);
    res.json({ ok: true, room: updated });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Tên phòng này đã tồn tại' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi cập nhật phòng' });
  }
});

// DELETE /api/admin/rooms/:id - xoa phong (nguoi dang o se bi dua ve trang thai chua co phong)
router.delete('/admin/rooms/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Phòng không hợp lệ' });
  }

  try {
    const room = await prisma.room.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }

    await prisma.$transaction([
      prisma.member.updateMany({ where: { roomId: id }, data: { roomId: null } }),
      prisma.room.delete({ where: { id } }),
    ]);

    await emitRooms(req);
    res.json({ ok: true, releasedMembers: room._count.members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa phòng' });
  }
});

// POST /api/admin/rooms/auto-create - tu tao du so phong cho ca 2 gioi theo suc chua mong muon
router.post('/admin/rooms/auto-create', requireAdmin, async (req, res) => {
  const { capacity, prefix } = req.body || {};

  const parsedCapacity = parseCapacity(capacity === undefined || capacity === '' ? await getRoomCapacity() : capacity);
  if (!parsedCapacity) {
    return res.status(400).json({ error: `Sức chứa phải là số từ 1 đến ${MAX_ROOM_CAPACITY}` });
  }
  const cleanPrefix = typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'Phòng';

  try {
    const created = [];

    await prisma.$transaction(async (tx) => {
      const existingRooms = await tx.room.findMany({ select: { name: true, gender: true, capacity: true } });
      const usedNames = new Set(existingRooms.map((r) => r.name));

      for (const gender of GENDERS) {
        const memberCount = await tx.member.count({ where: { gender } });
        const currentCapacity = existingRooms
          .filter((r) => r.gender === gender)
          .reduce((sum, r) => sum + r.capacity, 0);
        const missing = Math.max(0, Math.ceil((memberCount - currentCapacity) / parsedCapacity));

        let index = 1;
        for (let i = 0; i < missing; i++) {
          let name = `${cleanPrefix} ${genderLabel(gender)} ${index}`;
          while (usedNames.has(name)) {
            index += 1;
            name = `${cleanPrefix} ${genderLabel(gender)} ${index}`;
          }
          usedNames.add(name);
          index += 1;

          const room = await tx.room.create({ data: { name, gender, capacity: parsedCapacity } });
          created.push({ id: room.id, name: room.name, gender: room.gender, capacity: room.capacity });
        }
      }
    });

    await emitRooms(req);
    res.json({ ok: true, created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi tạo phòng tự động' });
  }
});

// POST /api/admin/rooms/random-all - ghep phong ngay cho tat ca nguoi chua co phong
router.post('/admin/rooms/random-all', requireAdmin, async (req, res) => {
  try {
    const result = await prisma.$transaction((tx) => assignAllPending(tx));
    const payload = await emitRooms(req);
    req.io.emit('rooms:bulk-randomized', { assigned: result.assigned.length });
    res.json({ ok: true, ...result, stats: payload.stats });
  } catch (err) {
    if (err.message === 'RACE') {
      return res.status(409).json({ error: 'Có người vừa tự quay ghép phòng cùng lúc — bấm lại lần nữa là xong' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi ghép phòng hàng loạt' });
  }
});

// POST /api/admin/rooms/reset - bo het ket qua ghep phong (van giu danh sach phong)
router.post('/admin/rooms/reset', requireAdmin, async (req, res) => {
  try {
    const { count } = await prisma.member.updateMany({ where: { roomId: { not: null } }, data: { roomId: null } });
    const payload = await emitRooms(req);
    req.io.emit('rooms:reset', {});
    res.json({ ok: true, cleared: count, stats: payload.stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi reset phòng' });
  }
});

// POST /api/admin/rooms/lock - khoa/mo vong tu random phong cho moi nguoi
router.post('/admin/rooms/lock', requireAdmin, async (req, res) => {
  const { locked } = req.body || {};
  const value = locked ? '1' : '0';

  try {
    await setSetting('roomsLocked', value);
    req.io.emit('rooms:config', { locked: value === '1' });
    res.json({ ok: true, locked: value === '1' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi đổi trạng thái vòng ghép phòng' });
  }
});

module.exports = router;
