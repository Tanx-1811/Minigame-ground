const express = require('express');
const prisma = require('../prisma');
const requireAdmin = require('../adminAuth');
const quizLobby = require('../quizLobby');
const { getSetting, setSetting, getLeaderCount, getRoomCapacity, isRoomsLocked, DEFAULTS } = require('../settings');
const { parseGender, genderLabel, loadRoomsPayload, MAX_ROOM_CAPACITY, parseCapacity } = require('../rooms');

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
  const { name, gender, groupId } = req.body || {};

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
    const member = await prisma.member.create({
      data: { name: cleanName, gender: parsedGender, groupId: parsedGroupId },
    });

    emitMembers(req);
    if (parsedGroupId) emitGroups(req);
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

  const { name, gender, groupId, roomId, isLeader } = req.body || {};

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
  const { ids, action, gender, groupId, isLeader } = req.body || {};

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

      try {
        const member = await prisma.member.create({ data: { name, gender: parsedGender } });
        created.push({ id: member.id, name: member.name, gender: member.gender });
      } catch (err) {
        if (err.code === 'P2002') {
          skipped.push({ name, reason: 'Đã có trong danh sách' });
        } else {
          throw err;
        }
      }
    }

    if (created.length) emitMembers(req);
    res.json({ ok: true, created, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi thêm danh sách' });
  }
});

/* ---------- nhom ---------- */

// POST /api/admin/groups - them nhom moi
router.post('/admin/groups', requireAdmin, async (req, res) => {
  const { name, description } = req.body || {};

  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) {
    return res.status(400).json({ error: 'Thiếu tên nhóm' });
  }

  try {
    const group = await prisma.group.create({
      data: {
        name: cleanName,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
      },
    });

    emitGroups(req);
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

  const { name, description } = req.body || {};
  const data = {};

  if (name !== undefined) {
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName) return res.status(400).json({ error: 'Tên nhóm không được để trống' });
    data.name = cleanName;
  }
  if (description !== undefined) {
    data.description = typeof description === 'string' && description.trim() ? description.trim() : null;
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
  if (action !== 'delete') {
    return res.status(400).json({ error: 'Hành động hàng loạt không hợp lệ' });
  }

  try {
    const released = await prisma.member.count({ where: { groupId: { in: groupIds } } });

    await prisma.$transaction([
      prisma.member.updateMany({ where: { groupId: { in: groupIds } }, data: { groupId: null } }),
      prisma.group.deleteMany({ where: { id: { in: groupIds } } }),
    ]);

    emitGroups(req);
    emitMembers(req);
    res.json({ ok: true, affected: groupIds.length, releasedMembers: released });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa nhóm' });
  }
});

/* ---------- cau hoi quiz ---------- */

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
  const { text, options, correctIndex } = req.body || {};

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
    const last = await prisma.question.findFirst({ orderBy: { order: 'desc' } });
    const question = await prisma.question.create({
      data: {
        order: last ? last.order + 1 : 1,
        text: cleanText,
        options: cleanOptions,
        correctIndex: parsedCorrect,
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

  const { text, options, correctIndex, order } = req.body || {};

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
        order: last.order + 1,
        text: `${question.text} (bản sao)`,
        options: question.options,
        correctIndex: question.correctIndex,
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
    const [leaderCount, roomCapacity, roomsLocked, eventStartAt, phase, quizStatus, counts] = await Promise.all([
      getLeaderCount(),
      getRoomCapacity(),
      isRoomsLocked(),
      getSetting('eventStartAt'),
      getSetting('phase'),
      quizLobby.getQuizStatus(),
      Promise.all([prisma.member.count(), prisma.group.count(), prisma.room.count(), prisma.question.count()]),
    ]);

    res.json({
      leaderCount,
      roomCapacity,
      roomsLocked,
      eventStartAt: eventStartAt || null,
      phase: phase || 'quiz',
      quizStatus,
      defaults: DEFAULTS,
      counts: { members: counts[0], groups: counts[1], rooms: counts[2], questions: counts[3] },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải cấu hình' });
  }
});

// POST /api/admin/settings - sua so nhom truong / suc chua phong mac dinh / phase
router.post('/admin/settings', requireAdmin, async (req, res) => {
  const { leaderCount, roomCapacity, phase } = req.body || {};
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
      changes.push(`sức chứa mặc định = ${parsed}`);
    }

    if (phase !== undefined && phase !== '') {
      if (!['quiz', 'random'].includes(phase)) {
        return res.status(400).json({ error: 'Phase chỉ nhận giá trị quiz hoặc random' });
      }
      await setSetting('phase', phase);
      changes.push(`phase = ${phase}`);
      const leaders =
        phase === 'random'
          ? await prisma.member.findMany({ where: { isLeader: true }, select: { id: true, name: true } })
          : [];
      req.io.emit('phase:updated', { phase, leaders });
    }

    if (!changes.length) {
      return res.status(400).json({ error: 'Không có thay đổi nào' });
    }

    const [newLeaderCount, newRoomCapacity] = await Promise.all([getLeaderCount(), getRoomCapacity()]);
    req.io.emit('settings:updated', { leaderCount: newLeaderCount, roomCapacity: newRoomCapacity });

    res.json({ ok: true, changes, leaderCount: newLeaderCount, roomCapacity: newRoomCapacity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi lưu cấu hình' });
  }
});

module.exports = router;
