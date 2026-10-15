const express = require('express');
const prisma = require('../prisma');
const requireAdmin = require('../adminAuth');
const quizLobby = require('../quizLobby');
const activity = require('../activity');
const {
  getSetting,
  setSetting,
  getSettingMap,
  getLeaderCount,
  getRoomCapacity,
  getGroupCapacity,
  isRoomsLocked,
  isRandomLocked,
  parseBool,
  getPublicUi,
  DEFAULTS,
  TEXT_SETTINGS,
  BOOL_SETTINGS,
} = require('../settings');
const { parseGender, genderLabel, loadRoomsPayload, MAX_ROOM_CAPACITY, parseCapacity } = require('../rooms');
const { loadGroupsPayload, assignAllPendingGroups } = require('../groups');
const { withLock } = require('../lock');

const router = express.Router();

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Cac tac vu admin thay doi du lieu dung chung: client chi can nghe 1 su kien
// roi tai lai danh sach tuong ung (so luot admin bam rat it nen khong lo tai).
function emitMembers(req) {
  req.io.emit('members:updated', {});
}

function emitGroups(req) {
  req.io.emit('groups:updated', {});
}

// Mau hex 3 hoac 6 ky tu, vd #fff hoac #2563eb
function parseColor(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(text) ? text : undefined;
}

// Cac co bat/tat tren tung thanh vien, dung chung cho PUT 1 nguoi va bulk nhieu nguoi
const MEMBER_FLAGS = ['joinRandom', 'joinRoom', 'joinQuiz', 'pinnedGroup', 'pinnedRoom'];

async function emitRooms(req) {
  req.io.emit('rooms:updated', await loadRoomsPayload(prisma));
}

/* ---------- thanh vien ---------- */

// GET /api/admin/members - danh sach thanh vien day du (kem nhom, phong, diem quiz)
router.get('/admin/members', requireAdmin, async (req, res) => {
  try {
    const members = await prisma.member.findMany({
      orderBy: { name: 'asc' },
      include: {
        group: { select: { id: true, name: true } },
        room: { select: { id: true, name: true, gender: true, capacity: true } },
        _count: { select: { answers: true } },
      },
    });
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải danh sách thành viên' });
  }
});

// POST /api/admin/members - them thanh vien moi
router.post('/admin/members', requireAdmin, async (req, res) => {
  const { name, gender, groupId, note } = req.body || {};

  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) {
    return res.status(400).json({ error: 'Thiếu tên thành viên' });
  }

  const parsedGender = parseGender(gender);
  if (parsedGender === undefined) {
    return res.status(400).json({ error: 'Giới tính không hợp lệ' });
  }

  let parsedGroupId = null;
  if (groupId !== undefined && groupId !== null && groupId !== '') {
    parsedGroupId = parseId(groupId);
    if (!parsedGroupId) return res.status(400).json({ error: 'Nhóm không hợp lệ' });
    const group = await prisma.group.findUnique({ where: { id: parsedGroupId } });
    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
  }

  try {
    const flags = {};
    MEMBER_FLAGS.forEach((flag) => {
      if (req.body[flag] !== undefined) flags[flag] = !!req.body[flag];
    });

    const member = await prisma.member.create({
      data: {
        name: cleanName,
        gender: parsedGender,
        groupId: parsedGroupId,
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
        ...flags,
      },
    });

    emitMembers(req);
    if (parsedGroupId) emitGroups(req);
    await activity.log({ type: 'admin', icon: 'user-plus', message: `Thêm thành viên ${member.name}` }, req.io);
    res.json({ ok: true, member });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Tên thành viên này đã tồn tại' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi thêm thành viên' });
  }
});

// PUT /api/admin/members/:id - sua ten / gioi tinh / nhom / phong / nhom truong
router.put('/admin/members/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Thành viên không hợp lệ' });
  }

  const { name, gender, groupId, roomId, isLeader, note } = req.body || {};

  try {
    const member = await prisma.member.findUnique({ where: { id }, include: { room: true } });
    if (!member) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    }

    const data = {};
    let movedOutOfRoom = false;

    if (name !== undefined) {
      const cleanName = typeof name === 'string' ? name.trim() : '';
      if (!cleanName) return res.status(400).json({ error: 'Tên thành viên không được để trống' });
      data.name = cleanName;
    }

    if (gender !== undefined) {
      const parsedGender = parseGender(gender);
      if (parsedGender === undefined) return res.status(400).json({ error: 'Giới tính không hợp lệ' });
      data.gender = parsedGender;
    }

    if (isLeader !== undefined) {
      data.isLeader = !!isLeader;
    }

    if (note !== undefined) {
      data.note = typeof note === 'string' && note.trim() ? note.trim() : null;
    }

    // joinRandom / joinRoom / joinQuiz / pinnedGroup / pinnedRoom
    MEMBER_FLAGS.forEach((flag) => {
      if (req.body[flag] !== undefined) data[flag] = !!req.body[flag];
    });

    // Tat quyen tham gia 1 vong thi bo luon ket qua cu cua vong do, neu khong
    // nguoi bi loai van con hien trong the nhom / phong ngu.
    if (data.joinRandom === false) data.groupId = null;
    if (data.joinRoom === false) data.roomId = null;

    if (groupId !== undefined) {
      if (groupId === null || groupId === '') {
        data.groupId = null;
      } else {
        const parsedGroupId = parseId(groupId);
        if (!parsedGroupId) return res.status(400).json({ error: 'Nhóm không hợp lệ' });
        const group = await prisma.group.findUnique({ where: { id: parsedGroupId } });
        if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
        data.groupId = parsedGroupId;
      }
    }

    const finalGender = data.gender !== undefined ? data.gender : member.gender;

    if (roomId !== undefined) {
      if (roomId === null || roomId === '') {
        data.roomId = null;
      } else {
        const parsedRoomId = parseId(roomId);
        if (!parsedRoomId) return res.status(400).json({ error: 'Phòng không hợp lệ' });

        const room = await prisma.room.findUnique({
          where: { id: parsedRoomId },
          include: { _count: { select: { members: true } } },
        });
        if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });

        if (!finalGender) {
          return res.status(400).json({ error: 'Cần đặt giới tính cho thành viên trước khi xếp phòng' });
        }
        if (room.gender !== finalGender) {
          return res.status(400).json({
            error: `Phòng "${room.name}" dành cho ${genderLabel(room.gender)}, không xếp được người ${genderLabel(finalGender)}`,
          });
        }
        const occupancy = room._count.members - (member.roomId === room.id ? 1 : 0);
        if (occupancy >= room.capacity) {
          return res.status(400).json({ error: `Phòng "${room.name}" đã kín ${room.capacity} người` });
        }

        data.roomId = parsedRoomId;
      }
    } else if (data.gender !== undefined && member.room && member.room.gender !== data.gender) {
      // Doi gioi tinh ma dang o phong cua gioi cu -> tu dong dua ra khoi phong
      data.roomId = null;
      movedOutOfRoom = true;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'Không có thay đổi nào' });
    }

    const updated = await prisma.member.update({
      where: { id },
      data,
      include: {
        group: { select: { id: true, name: true } },
        room: { select: { id: true, name: true, gender: true, capacity: true } },
      },
    });

    emitMembers(req);
    if (data.groupId !== undefined || data.isLeader !== undefined || data.name !== undefined) emitGroups(req);
    if (data.roomId !== undefined || data.gender !== undefined || data.name !== undefined) await emitRooms(req);

    res.json({ ok: true, member: updated, movedOutOfRoom });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Tên thành viên này đã tồn tại' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi cập nhật thành viên' });
  }
});

// DELETE /api/admin/members/:id - xoa thanh vien (xoa luon cau tra loi quiz cua ho)
router.delete('/admin/members/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Thành viên không hợp lệ' });
  }

  try {
    const member = await prisma.member.findUnique({ where: { id } });
    if (!member) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    }

    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { memberId: id } }),
      prisma.member.delete({ where: { id } }),
    ]);

    emitMembers(req);
    emitGroups(req);
    await emitRooms(req);
    res.json({ ok: true, name: member.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa thành viên' });
  }
});

// POST /api/admin/members/bulk - sua/xoa nhieu thanh vien cung luc
router.post('/admin/members/bulk', requireAdmin, async (req, res) => {
  const { ids, action, gender, groupId, isLeader, flag, value, roomId } = req.body || {};

  const memberIds = (Array.isArray(ids) ? ids : []).map(parseId).filter(Boolean);
  if (!memberIds.length) {
    return res.status(400).json({ error: 'Chưa chọn thành viên nào' });
  }

  try {
    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      include: { room: { select: { gender: true } } },
    });
    if (!members.length) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên nào trong danh sách đã chọn' });
    }

    if (action === 'delete') {
      await prisma.$transaction([
        prisma.answer.deleteMany({ where: { memberId: { in: memberIds } } }),
        prisma.member.deleteMany({ where: { id: { in: memberIds } } }),
      ]);
      emitMembers(req);
      emitGroups(req);
      await emitRooms(req);
      return res.json({ ok: true, action, affected: members.length });
    }

    if (action === 'gender') {
      const parsedGender = parseGender(gender);
      if (parsedGender === undefined) {
        return res.status(400).json({ error: 'Giới tính không hợp lệ' });
      }

      // Ai dang o phong khac gioi thi phai ra khoi phong do
      const leaveRoomIds = members
        .filter((m) => m.room && m.room.gender !== parsedGender)
        .map((m) => m.id);

      await prisma.$transaction([
        prisma.member.updateMany({ where: { id: { in: memberIds } }, data: { gender: parsedGender } }),
        ...(leaveRoomIds.length
          ? [prisma.member.updateMany({ where: { id: { in: leaveRoomIds } }, data: { roomId: null } })]
          : []),
      ]);

      emitMembers(req);
      await emitRooms(req);
      return res.json({ ok: true, action, affected: members.length, movedOutOfRoom: leaveRoomIds.length });
    }

    if (action === 'group') {
      let targetGroupId = null;
      if (groupId !== undefined && groupId !== null && groupId !== '') {
        targetGroupId = parseId(groupId);
        if (!targetGroupId) return res.status(400).json({ error: 'Nhóm không hợp lệ' });
        const group = await prisma.group.findUnique({ where: { id: targetGroupId } });
        if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
      }

      await prisma.member.updateMany({ where: { id: { in: memberIds } }, data: { groupId: targetGroupId } });
      emitMembers(req);
      emitGroups(req);
      return res.json({ ok: true, action, affected: members.length });
    }

    if (action === 'clear-room') {
      const { count } = await prisma.member.updateMany({
        where: { id: { in: memberIds }, roomId: { not: null } },
        data: { roomId: null },
      });
      emitMembers(req);
      await emitRooms(req);
      return res.json({ ok: true, action, affected: count });
    }

    if (action === 'leader') {
      await prisma.member.updateMany({ where: { id: { in: memberIds } }, data: { isLeader: !!isLeader } });
      emitMembers(req);
      emitGroups(req);
      return res.json({ ok: true, action, affected: members.length });
    }

    if (action === 'clear-group') {
      const { count } = await prisma.member.updateMany({
        where: { id: { in: memberIds }, groupId: { not: null } },
        data: { groupId: null },
      });
      emitMembers(req);
      emitGroups(req);
      return res.json({ ok: true, action, affected: count });
    }

    // Xep nhieu nguoi vao cung 1 phong (kiem tra gioi tinh + suc chua truoc khi ghi)
    if (action === 'room') {
      if (roomId === null || roomId === '' || roomId === undefined) {
        const { count } = await prisma.member.updateMany({
          where: { id: { in: memberIds }, roomId: { not: null } },
          data: { roomId: null },
        });
        emitMembers(req);
        await emitRooms(req);
        return res.json({ ok: true, action, affected: count });
      }

      const targetRoomId = parseId(roomId);
      if (!targetRoomId) return res.status(400).json({ error: 'Phòng không hợp lệ' });

      const room = await prisma.room.findUnique({
        where: { id: targetRoomId },
        include: { _count: { select: { members: true } } },
      });
      if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });

      const wrongGender = members.filter((m) => m.gender !== room.gender);
      if (wrongGender.length) {
        return res.status(400).json({
          error: `Phòng "${room.name}" dành cho ${genderLabel(room.gender)} — ${wrongGender.length} người đã chọn không hợp giới tính`,
        });
      }

      const alreadyInside = members.filter((m) => m.roomId === room.id).length;
      const free = room.capacity - (room._count.members - alreadyInside);
      if (members.length > free) {
        return res.status(400).json({
          error: `Phòng "${room.name}" chỉ còn ${Math.max(0, free)} chỗ, không đủ cho ${members.length} người`,
        });
      }

      await prisma.member.updateMany({ where: { id: { in: memberIds } }, data: { roomId: room.id } });
      emitMembers(req);
      await emitRooms(req);
      return res.json({ ok: true, action, affected: members.length, roomName: room.name });
    }

    // Bat/tat quyen tham gia tung vong hoac ghim ket qua cho nhieu nguoi
    if (action === 'flag') {
      if (!MEMBER_FLAGS.includes(flag)) {
        return res.status(400).json({ error: 'Loại quyền không hợp lệ' });
      }
      const flagValue = !!value;
      const data = { [flag]: flagValue };
      // Loai khoi vong nao thi bo ket qua cu cua vong do
      if (flag === 'joinRandom' && !flagValue) data.groupId = null;
      if (flag === 'joinRoom' && !flagValue) data.roomId = null;

      await prisma.member.updateMany({ where: { id: { in: memberIds } }, data });

      emitMembers(req);
      if (flag === 'joinRandom') emitGroups(req);
      if (flag === 'joinRoom') await emitRooms(req);

      return res.json({ ok: true, action, flag, value: flagValue, affected: members.length });
    }

    return res.status(400).json({ error: 'Hành động hàng loạt không hợp lệ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xử lý hàng loạt' });
  }
});

// POST /api/admin/members/import - them nhieu thanh vien 1 luot (dan danh sach ten)
router.post('/admin/members/import', requireAdmin, async (req, res) => {
  const { items } = req.body || {};

  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Chưa có dòng nào để thêm' });
  }
  if (items.length > 200) {
    return res.status(400).json({ error: 'Mỗi lần chỉ thêm tối đa 200 người' });
  }

  const created = [];
  const skipped = [];

  try {
    // Cot thu 3 co the ghi ten nhom - khop khong phan biet hoa thuong
    const groups = await prisma.group.findMany({ select: { id: true, name: true } });
    const groupByName = new Map(groups.map((g) => [g.name.trim().toLowerCase(), g.id]));

    for (const item of items) {
      const name = item && typeof item.name === 'string' ? item.name.trim() : '';
      if (!name) {
        skipped.push({ name: '(dòng trống)', reason: 'Thiếu tên' });
        continue;
      }

      const parsedGender = parseGender(item.gender);
      if (parsedGender === undefined) {
        skipped.push({ name, reason: 'Giới tính không hợp lệ (chỉ nhận Nam/Nữ)' });
        continue;
      }

      let groupId = null;
      const rawGroup = typeof item.group === 'string' ? item.group.trim() : '';
      if (rawGroup) {
        groupId = groupByName.get(rawGroup.toLowerCase()) || null;
        if (!groupId) {
          skipped.push({ name, reason: `Không có nhóm tên "${rawGroup}"` });
          continue;
        }
      }

      const flags = {};
      MEMBER_FLAGS.forEach((flag) => {
        if (item[flag] !== undefined) flags[flag] = !!item[flag];
      });

      try {
        const member = await prisma.member.create({
          data: { name, gender: parsedGender, groupId, ...flags },
        });
        created.push({ id: member.id, name: member.name, gender: member.gender });
      } catch (err) {
        if (err.code === 'P2002') {
          skipped.push({ name, reason: 'Đã có trong danh sách' });
        } else {
          throw err;
        }
      }
    }

    if (created.length) {
      emitMembers(req);
      emitGroups(req);
      await activity.log(
        { type: 'admin', icon: 'file-up', message: `Nhập danh sách: thêm ${created.length} thành viên` },
        req.io
      );
    }
    res.json({ ok: true, created, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi thêm danh sách' });
  }
});

/* ---------- nhom ---------- */

// GET /api/admin/groups - danh sach nhom kem thong ke (cho tab Nhom)
router.get('/admin/groups', requireAdmin, async (req, res) => {
  try {
    const globalCapacity = await getGroupCapacity();
    const payload = await loadGroupsPayload(prisma, globalCapacity);
    res.json({ ...payload, globalCapacity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải danh sách nhóm' });
  }
});

// POST /api/admin/groups - them nhom moi
router.post('/admin/groups', requireAdmin, async (req, res) => {
  const { name, description, color, capacity, locked } = req.body || {};

  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) {
    return res.status(400).json({ error: 'Thiếu tên nhóm' });
  }

  const parsedColor = parseColor(color);
  if (parsedColor === undefined) {
    return res.status(400).json({ error: 'Mã màu không hợp lệ (dạng #2563eb)' });
  }

  let parsedCapacity = null;
  if (capacity !== undefined && capacity !== null && capacity !== '') {
    const n = Number.parseInt(capacity, 10);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: 'Giới hạn số người phải lớn hơn 0 (để trống = không giới hạn)' });
    }
    parsedCapacity = n;
  }

  try {
    const last = await prisma.group.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });

    const group = await prisma.group.create({
      data: {
        name: cleanName,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        color: parsedColor,
        capacity: parsedCapacity,
        locked: !!locked,
        sortOrder: (last ? last.sortOrder : 0) + 1,
      },
    });

    emitGroups(req);
    await activity.log({ type: 'admin', icon: 'folder-plus', message: `Tạo nhóm ${group.name}` }, req.io);
    res.json({ ok: true, group });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Tên nhóm này đã tồn tại' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi thêm nhóm' });
  }
});

// PUT /api/admin/groups/:id - sua ten / slogan nhom
router.put('/admin/groups/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Nhóm không hợp lệ' });
  }

  const { name, description, color, capacity, locked } = req.body || {};
  const data = {};

  if (name !== undefined) {
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName) return res.status(400).json({ error: 'Tên nhóm không được để trống' });
    data.name = cleanName;
  }
  if (description !== undefined) {
    data.description = typeof description === 'string' && description.trim() ? description.trim() : null;
  }
  if (color !== undefined) {
    const parsedColor = parseColor(color);
    if (parsedColor === undefined) return res.status(400).json({ error: 'Mã màu không hợp lệ (dạng #2563eb)' });
    data.color = parsedColor;
  }
  if (locked !== undefined) {
    data.locked = !!locked;
  }
  if (capacity !== undefined) {
    if (capacity === null || capacity === '') {
      data.capacity = null;
    } else {
      const n = Number.parseInt(capacity, 10);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ error: 'Giới hạn số người phải lớn hơn 0 (để trống = không giới hạn)' });
      }
      const current = await prisma.member.count({ where: { groupId: id } });
      if (n < current) {
        return res.status(400).json({
          error: `Nhóm đang có ${current} người, không thể hạ giới hạn xuống ${n} — chuyển bớt người ra trước`,
        });
      }
      data.capacity = n;
    }
  }

  if (!Object.keys(data).length) {
    return res.status(400).json({ error: 'Không có thay đổi nào' });
  }

  try {
    const group = await prisma.group.update({ where: { id }, data });
    emitGroups(req);
    res.json({ ok: true, group });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Tên nhóm này đã tồn tại' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi cập nhật nhóm' });
  }
});

// DELETE /api/admin/groups/:id - xoa nhom (thanh vien trong nhom tro ve chua co nhom)
router.delete('/admin/groups/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Nhóm không hợp lệ' });
  }

  try {
    const group = await prisma.group.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
    if (!group) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }

    await prisma.$transaction([
      prisma.member.updateMany({ where: { groupId: id }, data: { groupId: null } }),
      prisma.group.delete({ where: { id } }),
    ]);

    emitGroups(req);
    emitMembers(req);
    res.json({ ok: true, releasedMembers: group._count.members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa nhóm' });
  }
});

// POST /api/admin/groups/bulk - xoa nhieu nhom cung luc
router.post('/admin/groups/bulk', requireAdmin, async (req, res) => {
  const { ids, action } = req.body || {};

  const groupIds = (Array.isArray(ids) ? ids : []).map(parseId).filter(Boolean);
  if (!groupIds.length) {
    return res.status(400).json({ error: 'Chưa chọn nhóm nào' });
  }
  if (!['delete', 'clear', 'lock', 'unlock'].includes(action)) {
    return res.status(400).json({ error: 'Hành động hàng loạt không hợp lệ' });
  }

  try {
    if (action === 'clear') {
      const { count } = await prisma.member.updateMany({
        where: { groupId: { in: groupIds }, pinnedGroup: false },
        data: { groupId: null },
      });
      emitGroups(req);
      emitMembers(req);
      return res.json({ ok: true, action, affected: count });
    }

    if (action === 'lock' || action === 'unlock') {
      const locked = action === 'lock';
      const { count } = await prisma.group.updateMany({ where: { id: { in: groupIds } }, data: { locked } });
      emitGroups(req);
      return res.json({ ok: true, action, affected: count });
    }

    const released = await prisma.member.count({ where: { groupId: { in: groupIds } } });

    await prisma.$transaction([
      prisma.member.updateMany({ where: { groupId: { in: groupIds } }, data: { groupId: null } }),
      prisma.group.deleteMany({ where: { id: { in: groupIds } } }),
    ]);

    emitGroups(req);
    emitMembers(req);
    await activity.log({ type: 'admin', icon: 'trash-2', message: `Xóa ${groupIds.length} nhóm` }, req.io);
    res.json({ ok: true, action, affected: groupIds.length, releasedMembers: released });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa nhóm' });
  }
});

// POST /api/admin/groups/random-all - chia nhom ngay cho tat ca nguoi du dieu kien.
// reshuffle=true -> boc het ra chia lai tu dau (tru nguoi da ghim pinnedGroup).
router.post('/admin/groups/random-all', requireAdmin, async (req, res) => {
  const { reshuffle } = req.body || {};

  try {
    const globalCapacity = await getGroupCapacity();
    const result = await withLock('groups', () =>
      prisma.$transaction((tx) => assignAllPendingGroups(tx, globalCapacity, { includeAssigned: !!reshuffle }), {
        timeout: 20000,
      })
    );

    emitGroups(req);
    emitMembers(req);
    req.io.emit('groups:bulk-randomized', { assigned: result.assigned.length });

    await activity.log(
      {
        type: 'admin',
        icon: 'shuffle',
        message: `${reshuffle ? 'Chia lại nhóm từ đầu' : 'Chia nhóm hàng loạt'}: ${result.assigned.length} người`,
      },
      req.io
    );

    const payload = await loadGroupsPayload(prisma, globalCapacity);
    res.json({ ok: true, ...result, stats: payload.stats });
  } catch (err) {
    if (err.message === 'NO_GROUPS') {
      return res.status(400).json({ error: 'Chưa có nhóm nào — tạo nhóm trước đã' });
    }
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi chia nhóm hàng loạt' });
  }
});

// POST /api/admin/groups/reset - bo ket qua chia nhom (van giu danh sach nhom)
router.post('/admin/groups/reset', requireAdmin, async (req, res) => {
  const { keepPinned } = req.body || {};

  try {
    const { count } = await prisma.member.updateMany({
      where: { groupId: { not: null }, ...(keepPinned ? { pinnedGroup: false } : {}) },
      data: { groupId: null },
    });

    emitGroups(req);
    emitMembers(req);
    // scope 'groups': chi xoa ket qua chia nhom - nguoi dang lam quiz khong bi day ra
    req.io.emit('groups:reset', { scope: 'groups' });
    await activity.log({ type: 'admin', icon: 'rotate-ccw', message: `Reset chia nhóm (${count} người)` }, req.io);
    res.json({ ok: true, cleared: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi reset chia nhóm' });
  }
});

// POST /api/admin/groups/reorder - luu thu tu hien thi cac nhom
router.post('/admin/groups/reorder', requireAdmin, async (req, res) => {
  const ids = (Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(parseId).filter(Boolean);
  if (!ids.length) {
    return res.status(400).json({ error: 'Thiếu thứ tự nhóm' });
  }

  try {
    await prisma.$transaction(
      ids.map((id, index) => prisma.group.update({ where: { id }, data: { sortOrder: index + 1 } }))
    );
    emitGroups(req);
    res.json({ ok: true, affected: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi lưu thứ tự nhóm' });
  }
});

// POST /api/admin/groups/move - chuyen 1 nguoi sang nhom khac (hoac bo ra khoi nhom)
router.post('/admin/groups/move', requireAdmin, async (req, res) => {
  const memberId = parseId((req.body || {}).memberId);
  const rawGroupId = (req.body || {}).groupId;
  const groupId = rawGroupId === null || rawGroupId === '' ? null : parseId(rawGroupId);

  if (!memberId) {
    return res.status(400).json({ error: 'Thành viên không hợp lệ' });
  }
  if (rawGroupId !== null && rawGroupId !== '' && !groupId) {
    return res.status(400).json({ error: 'Nhóm không hợp lệ' });
  }

  try {
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return res.status(404).json({ error: 'Không tìm thấy thành viên' });

    if (groupId) {
      const globalCapacity = await getGroupCapacity();
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { _count: { select: { members: true } } },
      });
      if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });

      const limit = group.capacity || globalCapacity || 0;
      const occupancy = group._count.members - (member.groupId === group.id ? 1 : 0);
      if (limit && occupancy >= limit) {
        return res.status(400).json({ error: `Nhóm "${group.name}" đã đủ ${limit} người` });
      }
    }

    await prisma.member.update({ where: { id: memberId }, data: { groupId } });
    emitGroups(req);
    emitMembers(req);
    res.json({ ok: true, memberId, groupId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi chuyển nhóm' });
  }
});

/* ---------- cau hoi quiz ---------- */

// points: diem cong khi tra loi dung (1..100). timeLimitSec: null = khong gioi han.
function parsePoints(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1 || n > 100) return undefined;
  return n;
}

function parseTimeLimit(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 3 || n > 600) return undefined;
  return n;
}

function parseOptions(options) {
  if (!Array.isArray(options)) return null;
  const cleaned = options.map((opt) => (typeof opt === 'string' ? opt.trim() : '')).filter(Boolean);
  if (cleaned.length < MIN_OPTIONS || cleaned.length > MAX_OPTIONS) return null;
  return cleaned;
}

// GET /api/admin/questions - danh sach cau hoi KEM dap an dung (chi admin)
router.get('/admin/questions', requireAdmin, async (req, res) => {
  try {
    const questions = await prisma.question.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { answers: true } } },
    });
    res.json(questions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải danh sách câu hỏi' });
  }
});

// POST /api/admin/questions - them cau hoi moi (tu xep xuong cuoi danh sach)
router.post('/admin/questions', requireAdmin, async (req, res) => {
  const { text, options, correctIndex, points, timeLimitSec } = req.body || {};

  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!cleanText) {
    return res.status(400).json({ error: 'Thiếu nội dung câu hỏi' });
  }

  const cleanOptions = parseOptions(options);
  if (!cleanOptions) {
    return res.status(400).json({ error: `Cần từ ${MIN_OPTIONS} đến ${MAX_OPTIONS} phương án trả lời` });
  }

  const parsedCorrect = Number.parseInt(correctIndex, 10);
  if (!Number.isInteger(parsedCorrect) || parsedCorrect < 0 || parsedCorrect >= cleanOptions.length) {
    return res.status(400).json({ error: 'Phải chọn đáp án đúng trong các phương án đã nhập' });
  }

  try {
    const parsedPoints = points === undefined || points === '' ? 1 : parsePoints(points);
    if (parsedPoints === undefined) {
      return res.status(400).json({ error: 'Điểm mỗi câu phải là số từ 1 đến 100' });
    }
    const parsedLimit = parseTimeLimit(timeLimitSec);
    if (parsedLimit === undefined) {
      return res.status(400).json({ error: 'Giới hạn thời gian phải từ 3 đến 600 giây (để trống = không giới hạn)' });
    }

    const last = await prisma.question.findFirst({ orderBy: { order: 'desc' } });
    const question = await prisma.question.create({
      data: {
        order: last ? last.order + 1 : 1,
        text: cleanText,
        options: cleanOptions,
        correctIndex: parsedCorrect,
        points: parsedPoints,
        timeLimitSec: parsedLimit,
      },
    });

    req.io.emit('questions:updated', {});
    res.json({ ok: true, question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi thêm câu hỏi' });
  }
});

// PUT /api/admin/questions/:id - sua noi dung / phuong an / dap an / thu tu
router.put('/admin/questions/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Câu hỏi không hợp lệ' });
  }

  const { text, options, correctIndex, order, points, timeLimitSec } = req.body || {};

  try {
    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    }

    const data = {};

    if (text !== undefined) {
      const cleanText = typeof text === 'string' ? text.trim() : '';
      if (!cleanText) return res.status(400).json({ error: 'Nội dung câu hỏi không được để trống' });
      data.text = cleanText;
    }

    if (options !== undefined) {
      const cleanOptions = parseOptions(options);
      if (!cleanOptions) {
        return res.status(400).json({ error: `Cần từ ${MIN_OPTIONS} đến ${MAX_OPTIONS} phương án trả lời` });
      }
      data.options = cleanOptions;
    }

    const finalOptions = data.options || question.options;
    if (correctIndex !== undefined) {
      const parsedCorrect = Number.parseInt(correctIndex, 10);
      if (!Number.isInteger(parsedCorrect) || parsedCorrect < 0 || parsedCorrect >= finalOptions.length) {
        return res.status(400).json({ error: 'Đáp án đúng không hợp lệ' });
      }
      data.correctIndex = parsedCorrect;
    } else if (data.options && question.correctIndex >= finalOptions.length) {
      return res.status(400).json({ error: 'Số phương án mới ít hơn vị trí đáp án đúng — hãy chọn lại đáp án đúng' });
    }

    if (points !== undefined) {
      const parsedPoints = parsePoints(points);
      if (parsedPoints === undefined) {
        return res.status(400).json({ error: 'Điểm mỗi câu phải là số từ 1 đến 100' });
      }
      data.points = parsedPoints;
    }

    if (timeLimitSec !== undefined) {
      const parsedLimit = parseTimeLimit(timeLimitSec);
      if (parsedLimit === undefined) {
        return res.status(400).json({ error: 'Giới hạn thời gian phải từ 3 đến 600 giây (để trống = không giới hạn)' });
      }
      data.timeLimitSec = parsedLimit;
    }

    let swappedWith = null;
    if (order !== undefined) {
      const parsedOrder = Number.parseInt(order, 10);
      if (!Number.isInteger(parsedOrder) || parsedOrder < 1) {
        return res.status(400).json({ error: 'Thứ tự phải là số nguyên lớn hơn 0' });
      }
      if (parsedOrder !== question.order) {
        swappedWith = await prisma.question.findUnique({ where: { order: parsedOrder } });
        data.order = parsedOrder;
      }
    }

    // Doi cho thu tu voi cau dang giu so do: phai qua 1 gia tri tam vi `order` la unique
    if (swappedWith) {
      await prisma.$transaction([
        prisma.question.update({ where: { id: swappedWith.id }, data: { order: -swappedWith.order } }),
        prisma.question.update({ where: { id }, data }),
        prisma.question.update({ where: { id: swappedWith.id }, data: { order: question.order } }),
      ]);
    } else {
      if (!Object.keys(data).length) {
        return res.status(400).json({ error: 'Không có thay đổi nào' });
      }
      await prisma.question.update({ where: { id }, data });
    }

    // Doi dap an dung -> cham lai cac cau da tra loi; doi diem -> tinh lai tong diem
    if (data.correctIndex !== undefined && data.correctIndex !== question.correctIndex) {
      await prisma.answer.updateMany({ where: { questionId: id }, data: { correct: false } });
      await prisma.answer.updateMany({ where: { questionId: id, selectedIndex: data.correctIndex }, data: { correct: true } });
    }
    if (data.correctIndex !== undefined || data.points !== undefined) {
      await quizLobby.recomputeScores();
    }

    req.io.emit('questions:updated', {});
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi cập nhật câu hỏi' });
  }
});

// DELETE /api/admin/questions/:id - xoa cau hoi (xoa luon cau tra loi cua moi nguoi cho cau do)
router.delete('/admin/questions/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Câu hỏi không hợp lệ' });
  }

  try {
    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    }

    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { questionId: id } }),
      prisma.question.delete({ where: { id } }),
    ]);
    await quizLobby.recomputeScores();

    req.io.emit('questions:updated', {});
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa câu hỏi' });
  }
});

// POST /api/admin/questions/bulk - xoa nhieu cau hoi cung luc
router.post('/admin/questions/bulk', requireAdmin, async (req, res) => {
  const { ids, action } = req.body || {};

  const questionIds = (Array.isArray(ids) ? ids : []).map(parseId).filter(Boolean);
  if (!questionIds.length) {
    return res.status(400).json({ error: 'Chưa chọn câu hỏi nào' });
  }
  if (action !== 'delete') {
    return res.status(400).json({ error: 'Hành động hàng loạt không hợp lệ' });
  }

  try {
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { questionId: { in: questionIds } } }),
      prisma.question.deleteMany({ where: { id: { in: questionIds } } }),
    ]);
    await quizLobby.recomputeScores();

    req.io.emit('questions:updated', {});
    res.json({ ok: true, affected: questionIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa câu hỏi' });
  }
});

// POST /api/admin/questions/:id/duplicate - nhan ban 1 cau hoi xuong cuoi danh sach
router.post('/admin/questions/:id/duplicate', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Câu hỏi không hợp lệ' });
  }

  try {
    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    }

    const last = await prisma.question.findFirst({ orderBy: { order: 'desc' } });
    const copy = await prisma.question.create({
      data: {
        order: (last ? last.order : 0) + 1,
        text: `${question.text} (bản sao)`,
        options: question.options,
        correctIndex: question.correctIndex,
        points: question.points,
        timeLimitSec: question.timeLimitSec,
      },
    });

    req.io.emit('questions:updated', {});
    res.json({ ok: true, question: copy });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi nhân bản câu hỏi' });
  }
});

// POST /api/admin/questions/:id/move - doi cho voi cau lien ke (len/xuong)
router.post('/admin/questions/:id/move', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const { direction } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'Câu hỏi không hợp lệ' });
  }
  if (!['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'Hướng di chuyển không hợp lệ' });
  }

  try {
    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    }

    // Cau ke ben theo thu tu hien tai (khong gia dinh order lien tuc 1,2,3...)
    const neighbour = await prisma.question.findFirst({
      where: direction === 'up' ? { order: { lt: question.order } } : { order: { gt: question.order } },
      orderBy: { order: direction === 'up' ? 'desc' : 'asc' },
    });

    if (!neighbour) {
      return res.status(400).json({ error: direction === 'up' ? 'Câu này đã ở đầu danh sách' : 'Câu này đã ở cuối danh sách' });
    }

    // `order` la unique nen phai di qua 1 gia tri tam
    await prisma.$transaction([
      prisma.question.update({ where: { id: neighbour.id }, data: { order: -neighbour.order } }),
      prisma.question.update({ where: { id: question.id }, data: { order: neighbour.order } }),
      prisma.question.update({ where: { id: neighbour.id }, data: { order: question.order } }),
    ]);

    req.io.emit('questions:updated', {});
    res.json({ ok: true, order: neighbour.order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi đổi thứ tự câu hỏi' });
  }
});

/* ---------- cau hinh chung ---------- */

// GET /api/admin/settings - toan bo cau hinh dang ap dung
router.get('/admin/settings', requireAdmin, async (req, res) => {
  try {
    const [leaderCount, roomCapacity, groupCapacity, roomsLocked, randomLocked, eventStartAt, phase, quizStatus, ui, counts] =
      await Promise.all([
        getLeaderCount(),
        getRoomCapacity(),
        getGroupCapacity(),
        isRoomsLocked(),
        isRandomLocked(),
        getSetting('eventStartAt'),
        getSetting('phase'),
        quizLobby.getQuizStatus(),
        getPublicUi(),
        Promise.all([prisma.member.count(), prisma.group.count(), prisma.room.count(), prisma.question.count()]),
      ]);

    res.json({
      leaderCount,
      roomCapacity,
      groupCapacity,
      roomsLocked,
      randomLocked,
      eventStartAt: eventStartAt || null,
      phase: phase || 'quiz',
      quizStatus,
      ui,
      // Mo ta cac o nhap de trang admin tu dung form, them key moi khong phai sua HTML
      schema: {
        text: Object.entries(TEXT_SETTINGS).map(([key, def]) => ({ key, label: def.label, fallback: def.fallback })),
        flags: Object.entries(BOOL_SETTINGS).map(([key, def]) => ({ key, label: def.label, fallback: def.fallback })),
      },
      defaults: DEFAULTS,
      counts: { members: counts[0], groups: counts[1], rooms: counts[2], questions: counts[3] },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải cấu hình' });
  }
});

// POST /api/admin/settings - luu cac thong so luat choi + noi dung hien thi
router.post('/admin/settings', requireAdmin, async (req, res) => {
  const { leaderCount, roomCapacity, groupCapacity, phase, ui } = req.body || {};
  const changes = [];

  try {
    if (leaderCount !== undefined && leaderCount !== '') {
      const parsed = Number.parseInt(leaderCount, 10);
      const memberCount = await prisma.member.count();
      if (!Number.isInteger(parsed) || parsed < 1) {
        return res.status(400).json({ error: 'Số nhóm trưởng phải là số nguyên lớn hơn 0' });
      }
      if (memberCount && parsed > memberCount) {
        return res.status(400).json({ error: `Chỉ có ${memberCount} thành viên, không thể chốt ${parsed} nhóm trưởng` });
      }
      await setSetting('leaderCount', String(parsed));
      changes.push(`số nhóm trưởng = ${parsed}`);
    }

    if (roomCapacity !== undefined && roomCapacity !== '') {
      const parsed = parseCapacity(roomCapacity);
      if (!parsed) {
        return res.status(400).json({ error: `Sức chứa mặc định phải là số từ 1 đến ${MAX_ROOM_CAPACITY}` });
      }
      await setSetting('roomCapacity', String(parsed));
      changes.push(`sức chứa phòng mặc định = ${parsed}`);
    }

    // 0 = khong gioi han so nguoi moi nhom (chia deu nhu truoc)
    if (groupCapacity !== undefined && groupCapacity !== '') {
      const parsed = Number.parseInt(groupCapacity, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'Giới hạn người mỗi nhóm phải là số từ 0 trở lên (0 = không giới hạn)' });
      }
      await setSetting('groupCapacity', String(parsed));
      changes.push(`giới hạn mỗi nhóm = ${parsed === 0 ? 'không giới hạn' : parsed}`);
    }

    // Chi phat phase:updated khi giai doan THUC SU doi: form cau hinh luon gui kem
    // phase, va moi lan phat la moi nguoi dang mo trang bi day ve man hinh tuong ung.
    if (phase !== undefined && phase !== '') {
      if (!['quiz', 'random'].includes(phase)) {
        return res.status(400).json({ error: 'Phase chỉ nhận giá trị quiz hoặc random' });
      }
      const currentPhase = (await getSetting('phase')) || 'quiz';
      if (phase !== currentPhase) {
        await setSetting('phase', phase);
        changes.push(`giai đoạn = ${phase === 'quiz' ? 'Quiz' : 'Random'}`);
        const leaders =
          phase === 'random'
            ? await prisma.member.findMany({ where: { isLeader: true }, select: { id: true, name: true } })
            : [];
        req.io.emit('phase:updated', { phase, leaders });
      }
    }

    // Noi dung + cong tac hien thi cua 2 trang cong khai
    if (ui && typeof ui === 'object') {
      for (const [key, value] of Object.entries(ui)) {
        if (TEXT_SETTINGS[key]) {
          const text = value === null || value === undefined ? '' : String(value).trim();
          if (text.length > 400) {
            return res.status(400).json({ error: `"${TEXT_SETTINGS[key].label}" quá dài (tối đa 400 ký tự)` });
          }
          await setSetting(key, text);
          changes.push(TEXT_SETTINGS[key].label);
        } else if (BOOL_SETTINGS[key]) {
          await setSetting(key, value ? '1' : '0');
          changes.push(`${BOOL_SETTINGS[key].label}: ${value ? 'bật' : 'tắt'}`);
        }
      }
    }

    if (!changes.length) {
      return res.status(400).json({ error: 'Không có thay đổi nào' });
    }

    const [newLeaderCount, newRoomCapacity, newUi] = await Promise.all([
      getLeaderCount(),
      getRoomCapacity(),
      getPublicUi(),
    ]);
    req.io.emit('settings:updated', { leaderCount: newLeaderCount, roomCapacity: newRoomCapacity, ui: newUi });

    await activity.log({ type: 'admin', icon: 'settings', message: `Lưu cấu hình: ${changes.join(', ')}` }, req.io);
    res.json({ ok: true, changes, leaderCount: newLeaderCount, roomCapacity: newRoomCapacity, ui: newUi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi lưu cấu hình' });
  }
});

// POST /api/admin/settings/lock - khoa/mo nhanh vong random chia nhom
router.post('/admin/settings/lock', requireAdmin, async (req, res) => {
  const { locked } = req.body || {};
  const value = locked ? '1' : '0';

  try {
    await setSetting('randomLocked', value);
    req.io.emit('random:config', { locked: value === '1' });
    await activity.log(
      {
        type: 'admin',
        icon: value === '1' ? 'lock' : 'lock-open',
        message: `${value === '1' ? 'Khóa' : 'Mở'} vòng random chia nhóm`,
      },
      req.io
    );
    res.json({ ok: true, locked: value === '1' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi đổi trạng thái vòng random' });
  }
});

/* ---------- tong quan & nhat ky ---------- */

// GET /api/admin/overview - so lieu tong hop cho tab Tong quan
router.get('/admin/overview', requireAdmin, async (req, res) => {
  try {
    const globalCapacity = await getGroupCapacity();

    const [members, groupsPayload, roomsPayload, questionCount, answersByMember, phase, quizStatus, leaderCount, locks] =
      await Promise.all([
        prisma.member.findMany({
          select: {
            id: true,
            gender: true,
            groupId: true,
            roomId: true,
            isLeader: true,
            quizScore: true,
            joinRandom: true,
            joinRoom: true,
            joinQuiz: true,
          },
        }),
        loadGroupsPayload(prisma, globalCapacity),
        loadRoomsPayload(prisma),
        prisma.question.count(),
        prisma.answer.groupBy({ by: ['memberId'], _count: { _all: true } }),
        getSetting('phase'),
        quizLobby.getQuizStatus(),
        getLeaderCount(),
        Promise.all([isRoomsLocked(), isRandomLocked()]),
      ]);

    const count = (fn) => members.filter(fn).length;

    res.json({
      members: {
        total: members.length,
        male: count((m) => m.gender === 'MALE'),
        female: count((m) => m.gender === 'FEMALE'),
        noGender: count((m) => !m.gender),
        leaders: count((m) => m.isLeader),
        joinRandom: count((m) => m.joinRandom),
        joinRoom: count((m) => m.joinRoom),
        joinQuiz: count((m) => m.joinQuiz),
        excludedRandom: count((m) => !m.joinRandom),
        excludedRoom: count((m) => !m.joinRoom),
        excludedQuiz: count((m) => !m.joinQuiz),
      },
      groups: groupsPayload.stats,
      rooms: roomsPayload.stats,
      quiz: {
        questions: questionCount,
        answers: answersByMember.reduce((sum, row) => sum + row._count._all, 0),
        status: quizStatus,
        lobby: quizLobby.getLobbyMembers().length,
        leaderCount,
        // So nguoi da tra loi het bo cau hoi (truoc day dem nguoi co diem > 0 -
        // ai lam het ma sai het thi khong duoc tinh, ai moi lam 1 cau dung lai duoc tinh)
        started: answersByMember.length,
        finished: questionCount ? answersByMember.filter((row) => row._count._all >= questionCount).length : 0,
      },
      flow: {
        // Giai doan THUC TE nguoi choi dang thay: chua co cau hoi nao thi bo qua quiz
        phase: (phase || 'quiz') === 'quiz' && questionCount === 0 ? 'random' : phase || 'quiz',
        storedPhase: phase || 'quiz',
        roomsLocked: locks[0],
        randomLocked: locks[1],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải tổng quan' });
  }
});

// GET /api/admin/activity - nhat ky day du (loc theo loai)
router.get('/admin/activity', requireAdmin, async (req, res) => {
  try {
    res.json(await activity.list({ limit: req.query.limit || 100, type: req.query.type }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải nhật ký' });
  }
});

// POST /api/admin/activity/clear - xoa nhat ky (toan bo hoac 1 loai)
router.post('/admin/activity/clear', requireAdmin, async (req, res) => {
  try {
    const cleared = await activity.clear((req.body || {}).type);
    req.io.emit('activity:cleared', {});
    res.json({ ok: true, cleared });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa nhật ký' });
  }
});

/* ---------- sao luu & phuc hoi ---------- */

// GET /api/admin/export - tai toan bo du lieu ra 1 file JSON de sao luu
router.get('/admin/export', requireAdmin, async (req, res) => {
  try {
    const [members, groups, rooms, questions, settings, answers] = await Promise.all([
      prisma.member.findMany({ orderBy: { id: 'asc' } }),
      prisma.group.findMany({ orderBy: { id: 'asc' } }),
      prisma.room.findMany({ orderBy: { id: 'asc' } }),
      prisma.question.findMany({ orderBy: { order: 'asc' } }),
      prisma.setting.findMany(),
      prisma.answer.findMany({ orderBy: { id: 'asc' } }),
    ]);

    res.json({
      version: 3,
      exportedAt: new Date().toISOString(),
      counts: {
        members: members.length,
        groups: groups.length,
        rooms: rooms.length,
        questions: questions.length,
        answers: answers.length,
      },
      groups,
      rooms,
      members,
      questions,
      // Kem cau tra loi quiz: thieu no thi phuc hoi xong bang xep hang rong trong khi
      // diem va Nhom Truong van con, khong chot lai duoc vong quiz.
      answers,
      settings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xuất dữ liệu' });
  }
});

// POST /api/admin/import - phuc hoi tu file JSON da xuat.
// GHI DE toan bo du lieu hien tai nen bat buoc gui confirm: 'GHI DE'.
router.post('/admin/import', requireAdmin, async (req, res) => {
  const { data, confirm } = req.body || {};

  if (confirm !== 'GHI DE') {
    return res.status(400).json({ error: 'Cần xác nhận ghi đè trước khi phục hồi dữ liệu' });
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.members)) {
    return res.status(400).json({ error: 'File sao lưu không đúng định dạng' });
  }

  try {
    const report = await prisma.$transaction(
      async (tx) => {
        // Xoa theo dung thu tu khoa ngoai: answer -> member -> room/group/question
        await tx.answer.deleteMany({});
        await tx.member.deleteMany({});
        await tx.question.deleteMany({});
        await tx.room.deleteMany({});
        await tx.group.deleteMany({});

        const groupIdMap = new Map();
        for (const g of data.groups || []) {
          const created = await tx.group.create({
            data: {
              name: String(g.name),
              description: g.description || null,
              color: g.color || null,
              capacity: Number.isInteger(g.capacity) ? g.capacity : null,
              locked: !!g.locked,
              sortOrder: Number.isInteger(g.sortOrder) ? g.sortOrder : 0,
            },
          });
          groupIdMap.set(g.id, created.id);
        }

        const roomIdMap = new Map();
        for (const r of data.rooms || []) {
          const created = await tx.room.create({
            data: {
              name: String(r.name),
              gender: r.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
              capacity: Number.isInteger(r.capacity) && r.capacity > 0 ? r.capacity : 2,
              note: r.note || null,
              locked: !!r.locked,
              sortOrder: Number.isInteger(r.sortOrder) ? r.sortOrder : 0,
            },
          });
          roomIdMap.set(r.id, created.id);
        }

        let memberCount = 0;
        const memberIdMap = new Map();
        for (const m of data.members) {
          if (!m || !m.name) continue;
          const createdMember = await tx.member.create({
            data: {
              name: String(m.name),
              gender: m.gender === 'MALE' || m.gender === 'FEMALE' ? m.gender : null,
              groupId: groupIdMap.get(m.groupId) || null,
              roomId: roomIdMap.get(m.roomId) || null,
              isLeader: !!m.isLeader,
              quizScore: Number.isInteger(m.quizScore) ? m.quizScore : 0,
              quizTimeMs: Number.isInteger(m.quizTimeMs) ? m.quizTimeMs : 0,
              joinRandom: m.joinRandom === undefined ? true : !!m.joinRandom,
              joinRoom: m.joinRoom === undefined ? true : !!m.joinRoom,
              joinQuiz: m.joinQuiz === undefined ? true : !!m.joinQuiz,
              pinnedGroup: !!m.pinnedGroup,
              pinnedRoom: !!m.pinnedRoom,
              note: m.note || null,
            },
          });
          memberIdMap.set(m.id, createdMember.id);
          memberCount += 1;
        }

        let questionCount = 0;
        const questionIdMap = new Map();
        for (const q of data.questions || []) {
          if (!q || !q.text || !Array.isArray(q.options)) continue;
          questionCount += 1;
          const createdQuestion = await tx.question.create({
            data: {
              order: questionCount,
              text: String(q.text),
              options: q.options,
              correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
              points: Number.isInteger(q.points) && q.points > 0 ? q.points : 1,
              timeLimitSec: Number.isInteger(q.timeLimitSec) ? q.timeLimitSec : null,
            },
          });
          questionIdMap.set(q.id, createdQuestion.id);
        }

        let answerCount = 0;
        for (const a of Array.isArray(data.answers) ? data.answers : []) {
          const memberId = a && memberIdMap.get(a.memberId);
          const questionId = a && questionIdMap.get(a.questionId);
          if (!memberId || !questionId) continue;
          await tx.answer.create({
            data: {
              memberId,
              questionId,
              selectedIndex: Number.isInteger(a.selectedIndex) ? a.selectedIndex : -1,
              correct: !!a.correct,
              timeMs: Number.isInteger(a.timeMs) && a.timeMs >= 0 ? a.timeMs : 0,
            },
          });
          answerCount += 1;
        }

        for (const st of data.settings || []) {
          if (!st || !st.key) continue;
          await tx.setting.upsert({
            where: { key: st.key },
            update: { value: st.value ?? null },
            create: { key: st.key, value: st.value ?? null },
          });
        }

        return {
          groups: groupIdMap.size,
          rooms: roomIdMap.size,
          members: memberCount,
          questions: questionCount,
          answers: answerCount,
        };
      },
      { timeout: 60000 }
    );

    quizLobby.clearLobby();
    if (Array.isArray(data.answers)) await quizLobby.recomputeScores();

    // Phat lai moi thu trang cong khai dang giu: noi dung giao dien, khoa vong, gio mo
    const [ui, roomsLocked, randomLocked, eventStartAt] = await Promise.all([
      getPublicUi(),
      isRoomsLocked(),
      isRandomLocked(),
      getSetting('eventStartAt'),
    ]);
    req.io.emit('settings:updated', { leaderCount: await getLeaderCount(), roomCapacity: await getRoomCapacity(), ui });
    req.io.emit('random:config', { locked: randomLocked });
    req.io.emit('rooms:config', { locked: roomsLocked });
    req.io.emit('config:updated', { eventStartAt: eventStartAt || null });

    emitMembers(req);
    emitGroups(req);
    await emitRooms(req);
    req.io.emit('questions:updated', {});
    const restoredPhase = (await getSetting('phase')) || 'quiz';
    req.io.emit('groups:reset', { scope: 'all', phase: restoredPhase });

    await activity.log(
      {
        type: 'admin',
        icon: 'database-backup',
        message: `Phục hồi dữ liệu: ${report.members} thành viên, ${report.groups} nhóm, ${report.rooms} phòng, ${report.questions} câu hỏi`,
      },
      req.io
    );

    res.json({ ok: true, ...report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi phục hồi dữ liệu — dữ liệu cũ được giữ nguyên' });
  }
});

module.exports = router;
