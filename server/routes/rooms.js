const express = require('express');
const prisma = require('../prisma');
const requireAdmin = require('../adminAuth');
const activity = require('../activity');
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
      members: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true, gender: true, isLeader: true, pinnedRoom: true },
      },
    },
  });
}

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/* ---------- cong khai ---------- */

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
    if (!member.joinRoom) {
      return res.status(403).json({ error: 'Bạn không nằm trong danh sách tham gia ghép phòng lần này' });
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

    await activity.log({
      type: 'room',
      icon: 'bed-double',
      actor: member.name,
      message: `${member.name} vào ${room.name}`,
      meta: { roomId: room.id, memberId: member.id },
    });

    req.io.emit('member:room-randomized', payload);
    res.json({ ...payload, alreadyAssigned: false });
  } catch (err) {
    if (err.message === 'NO_ROOM_FOR_GENDER') {
      return res
        .status(409)
        .json({ error: 'Chưa có phòng nào dành cho giới tính của bạn — nhờ admin tạo thêm phòng' });
    }
    if (err.message === 'ROOMS_FULL' || err.message === 'RACE') {
      return res
        .status(409)
        .json({ error: 'Các phòng cùng giới tính đã kín chỗ hoặc đang khóa — nhờ admin mở thêm phòng' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi ghép phòng' });
  }
});

/* ---------- admin: tung phong ---------- */

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
    const last = await prisma.room.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });

    const room = await prisma.room.create({
      data: {
        name: cleanName,
        gender: parsedGender,
        capacity: parsedCapacity,
        sortOrder: (last ? last.sortOrder : 0) + 1,
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
      },
    });

    await emitRooms(req);
    await activity.log(
      { type: 'admin', icon: 'door-open', message: `Tạo phòng ${room.name} (${genderLabel(room.gender)}, ${room.capacity} chỗ)` },
      req.io
    );
    res.json({ ok: true, room });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Tên phòng này đã tồn tại' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi tạo phòng' });
  }
});

// PUT /api/admin/rooms/:id - sua ten / gioi tinh / suc chua / ghi chu / khoa
router.put('/admin/rooms/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Phòng không hợp lệ' });
  }

  const { name, gender, capacity, note, locked } = req.body || {};
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

  if (locked !== undefined) {
    data.locked = !!locked;
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

    if (data.locked !== undefined) {
      await activity.log(
        {
          type: 'admin',
          icon: data.locked ? 'lock' : 'lock-open',
          message: `${data.locked ? 'Khóa' : 'Mở khóa'} phòng ${updated.name}`,
        },
        req.io
      );
    }

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
    req.io.emit('members:updated', {});
    await activity.log({ type: 'admin', icon: 'trash-2', message: `Xóa phòng ${room.name}` }, req.io);
    res.json({ ok: true, releasedMembers: room._count.members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa phòng' });
  }
});

/* ---------- admin: hang loat & tien ich ---------- */

// POST /api/admin/rooms/bulk - xoa / don nguoi ra / khoa / mo khoa nhieu phong
router.post('/admin/rooms/bulk', requireAdmin, async (req, res) => {
  const { ids, action } = req.body || {};

  const roomIds = (Array.isArray(ids) ? ids : []).map(parseId).filter(Boolean);
  if (!roomIds.length) {
    return res.status(400).json({ error: 'Chưa chọn phòng nào' });
  }

  try {
    if (action === 'delete') {
      const released = await prisma.member.count({ where: { roomId: { in: roomIds } } });
      await prisma.$transaction([
        prisma.member.updateMany({ where: { roomId: { in: roomIds } }, data: { roomId: null } }),
        prisma.room.deleteMany({ where: { id: { in: roomIds } } }),
      ]);

      await emitRooms(req);
      req.io.emit('members:updated', {});
      await activity.log({ type: 'admin', icon: 'trash-2', message: `Xóa ${roomIds.length} phòng` }, req.io);
      return res.json({ ok: true, action, affected: roomIds.length, releasedMembers: released });
    }

    if (action === 'clear') {
      const { count } = await prisma.member.updateMany({
        where: { roomId: { in: roomIds }, pinnedRoom: false },
        data: { roomId: null },
      });

      await emitRooms(req);
      req.io.emit('members:updated', {});
      return res.json({ ok: true, action, affected: count });
    }

    if (action === 'lock' || action === 'unlock') {
      const locked = action === 'lock';
      const { count } = await prisma.room.updateMany({ where: { id: { in: roomIds } }, data: { locked } });
      await emitRooms(req);
      await activity.log(
        { type: 'admin', icon: locked ? 'lock' : 'lock-open', message: `${locked ? 'Khóa' : 'Mở khóa'} ${count} phòng` },
        req.io
      );
      return res.json({ ok: true, action, affected: count });
    }

    return res.status(400).json({ error: 'Hành động hàng loạt không hợp lệ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xử lý hàng loạt phòng' });
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
      const last = await tx.room.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
      let order = last ? last.sortOrder : 0;

      for (const gender of GENDERS) {
        // Chi dem nhung nguoi THAM GIA vong ghep phong - ai bi loai thi khong can chua cho
        const memberCount = await tx.member.count({ where: { gender, joinRoom: true } });
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
          order += 1;

          const room = await tx.room.create({
            data: { name, gender, capacity: parsedCapacity, sortOrder: order },
          });
          created.push({ id: room.id, name: room.name, gender: room.gender, capacity: room.capacity });
        }
      }
    });

    await emitRooms(req);
    if (created.length) {
      await activity.log({ type: 'admin', icon: 'layout-grid', message: `Tạo tự động ${created.length} phòng` }, req.io);
    }
    res.json({ ok: true, created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi tạo phòng tự động' });
  }
});

// POST /api/admin/rooms/random-all - ghep phong ngay cho tat ca nguoi chua co phong.
// reshuffle=true -> boc het ra ghep lai tu dau (tru nguoi da ghim).
router.post('/admin/rooms/random-all', requireAdmin, async (req, res) => {
  const { reshuffle } = req.body || {};

  try {
    const result = await prisma.$transaction((tx) => assignAllPending(tx, { includeAssigned: !!reshuffle }), {
      timeout: 20000,
    });
    const payload = await emitRooms(req);
    req.io.emit('rooms:bulk-randomized', { assigned: result.assigned.length });
    req.io.emit('members:updated', {});

    await activity.log(
      {
        type: 'admin',
        icon: 'shuffle',
        message: `${reshuffle ? 'Ghép lại từ đầu' : 'Ghép phòng hàng loạt'}: ${result.assigned.length} người`,
      },
      req.io
    );

    res.json({ ok: true, ...result, stats: payload.stats });
  } catch (err) {
    if (err.message === 'RACE') {
      return res.status(409).json({ error: 'Có người vừa tự quay ghép phòng cùng lúc — bấm lại lần nữa là xong' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi ghép phòng hàng loạt' });
  }
});

// POST /api/admin/rooms/move - chuyen 1 nguoi sang phong khac (hoac ra ngoai)
router.post('/admin/rooms/move', requireAdmin, async (req, res) => {
  const memberId = parseId((req.body || {}).memberId);
  const rawRoomId = (req.body || {}).roomId;
  const roomId = rawRoomId === null || rawRoomId === '' ? null : parseId(rawRoomId);

  if (!memberId) {
    return res.status(400).json({ error: 'Thành viên không hợp lệ' });
  }
  if (rawRoomId !== null && rawRoomId !== '' && !roomId) {
    return res.status(400).json({ error: 'Phòng không hợp lệ' });
  }

  try {
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return res.status(404).json({ error: 'Không tìm thấy thành viên' });

    if (roomId) {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: { _count: { select: { members: true } } },
      });
      if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
      if (!member.gender) {
        return res.status(400).json({ error: `${member.name} chưa có giới tính — đặt giới tính trước khi xếp phòng` });
      }
      if (room.gender !== member.gender) {
        return res.status(400).json({
          error: `Phòng "${room.name}" dành cho ${genderLabel(room.gender)}, không xếp được người ${genderLabel(member.gender)}`,
        });
      }
      const occupancy = room._count.members - (member.roomId === room.id ? 1 : 0);
      if (occupancy >= room.capacity) {
        return res.status(400).json({ error: `Phòng "${room.name}" đã kín ${room.capacity} người` });
      }
    }

    await prisma.member.update({ where: { id: memberId }, data: { roomId } });
    const payload = await emitRooms(req);
    req.io.emit('members:updated', {});

    res.json({ ok: true, memberId, roomId, stats: payload.stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi chuyển phòng' });
  }
});

// POST /api/admin/rooms/swap - doi cho 2 nguoi giua 2 phong (bo qua kiem tra suc chua
// vi tong so nguoi moi phong khong doi)
router.post('/admin/rooms/swap', requireAdmin, async (req, res) => {
  const aId = parseId((req.body || {}).memberAId);
  const bId = parseId((req.body || {}).memberBId);

  if (!aId || !bId || aId === bId) {
    return res.status(400).json({ error: 'Cần chọn 2 người khác nhau để đổi chỗ' });
  }

  try {
    const [a, b] = await Promise.all([
      prisma.member.findUnique({ where: { id: aId } }),
      prisma.member.findUnique({ where: { id: bId } }),
    ]);
    if (!a || !b) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    if (a.roomId === b.roomId) {
      return res.status(400).json({ error: 'Hai người đang ở cùng một phòng' });
    }
    if (a.gender !== b.gender) {
      return res.status(400).json({ error: 'Chỉ đổi chỗ được giữa 2 người cùng giới tính' });
    }

    await prisma.$transaction([
      prisma.member.update({ where: { id: aId }, data: { roomId: b.roomId } }),
      prisma.member.update({ where: { id: bId }, data: { roomId: a.roomId } }),
    ]);

    const payload = await emitRooms(req);
    req.io.emit('members:updated', {});
    await activity.log({ type: 'admin', icon: 'arrow-left-right', message: `Đổi chỗ ${a.name} ↔ ${b.name}` }, req.io);

    res.json({ ok: true, stats: payload.stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi đổi chỗ' });
  }
});

// POST /api/admin/rooms/reorder - luu lai thu tu hien thi cac phong
router.post('/admin/rooms/reorder', requireAdmin, async (req, res) => {
  const ids = (Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(parseId).filter(Boolean);
  if (!ids.length) {
    return res.status(400).json({ error: 'Thiếu thứ tự phòng' });
  }

  try {
    await prisma.$transaction(
      ids.map((id, index) => prisma.room.update({ where: { id }, data: { sortOrder: index + 1 } }))
    );
    await emitRooms(req);
    res.json({ ok: true, affected: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi lưu thứ tự phòng' });
  }
});

// POST /api/admin/rooms/reset - bo het ket qua ghep phong (van giu danh sach phong)
router.post('/admin/rooms/reset', requireAdmin, async (req, res) => {
  const { keepPinned } = req.body || {};

  try {
    const { count } = await prisma.member.updateMany({
      where: { roomId: { not: null }, ...(keepPinned ? { pinnedRoom: false } : {}) },
      data: { roomId: null },
    });
    const payload = await emitRooms(req);
    req.io.emit('rooms:reset', {});
    req.io.emit('members:updated', {});
    await activity.log({ type: 'admin', icon: 'rotate-ccw', message: `Reset ghép phòng (${count} người)` }, req.io);
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
    await activity.log(
      {
        type: 'admin',
        icon: value === '1' ? 'lock' : 'lock-open',
        message: `${value === '1' ? 'Khóa' : 'Mở'} vòng ghép phòng`,
      },
      req.io
    );
    res.json({ ok: true, locked: value === '1' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi đổi trạng thái vòng ghép phòng' });
  }
});

module.exports = router;
