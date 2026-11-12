const express = require('express');
const prisma = require('../prisma');
const requireAdmin = require('../adminAuth');
const activity = require('../activity');
const { getRoomCapacity, isRoomsLocked, setSetting, getPublicUi } = require('../settings');
const { withLock } = require('../lock');
const {
  GENDERS,
  parseGender,
  genderLabel,
  parseCapacity,
  parseLocation,
  loadRoomSlots,
  pickRoom,
  assignAllPending,
  loadRoomsPayload,
  MAX_ROOM_CAPACITY,
  MAX_LOCATION_LENGTH,
} = require('../rooms');

const router = express.Router();

// Moi thao tac doi roomId (luot quay, tu chon phong, admin xep tay / chuyen / doi
// cho / sua suc chua / xoa phong) deu chay trong CUNG hang doi 'rooms' (xem
// server/lock.js). Truoc day chi luot quay va ghep hang loat di qua hang doi:
// admin xep tay dung luc co nguoi dang quay thi ca hai cung doc "con 1 cho" ->
// phong vuot suc chua; admin xoa phong dung luc luot quay vua chon phong do ->
// luot quay ghi roomId tro vao phong da xoa va bao loi 500.
const ROOMS_LOCK = 'rooms';

// Doc lai nguoi nay NGAY TRONG hang doi: thong tin doc truoc khi vao hang co the
// da cu - admin vua doi gioi tinh / tat quyen ghep phong o luot dung truoc trong
// hang thi phai xep theo du lieu moi (khong thi vao nham phong khac gioi).
async function lockedMember(tx, id) {
  const current = await tx.member.findUnique({ where: { id }, select: { roomId: true, gender: true, joinRoom: true } });
  if (!current) throw new Error('MEMBER_GONE');
  if (current.roomId) return current;
  if (!current.joinRoom) throw new Error('NOT_ELIGIBLE');
  if (!current.gender) throw new Error('NO_GENDER');
  return current;
}

// Sau khi commit, VAN trong hang doi: doc lai phong va phat realtime. Lam ngoai
// hang doi thi 2 nguoi vao cung 1 phong co the phat lech thu tu (ban [A] den sau
// ban [A, B]) -> moi nguoi dang xem thay phong thieu nguoi cho toi khi tai lai.
async function publishPick(io, member, result, via) {
  const room = await findRoomWithMembers(result.roomId);
  if (!room) throw new Error('ROOM_NOT_FOUND');
  const payload = { member: memberView({ ...member, gender: result.gender || member.gender }), room, at: new Date().toISOString() };
  if (result.fresh) io.emit('member:room-randomized', { ...payload, via });
  return { ...result, payload };
}

// Chon ngau nhien 1 phong cho member. Kiem lai roomId ngay trong hang doi vi bam
// dup 2 lan se gui 2 request cho cung mot nguoi.
// Tra ve { roomId, fresh, payload } - fresh = false: nguoi nay vua duoc xep o luot truoc.
function drawRoomFor(member, io) {
  return withLock(ROOMS_LOCK, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const current = await lockedMember(tx, member.id);
      if (current.roomId) return { roomId: current.roomId, fresh: false, gender: current.gender };

      const slots = await loadRoomSlots(tx);
      if (!slots.some((r) => r.gender === current.gender)) {
        throw new Error('NO_ROOM_FOR_GENDER');
      }

      const room = pickRoom(slots, current.gender);
      if (!room) {
        throw new Error('ROOMS_FULL');
      }

      await tx.member.update({ where: { id: member.id }, data: { roomId: room.id } });
      return { roomId: room.id, fresh: true, gender: current.gender };
    });
    return publishPick(io, member, result, 'random');
  });
}

// Xep member vao DUNG phong ho chon (che do "Tu chon phong"). Kiem tra lai moi
// dieu kien trong hang doi: phong co the vua kin / vua bi khoa / vua bi xoa.
function chooseRoomFor(member, roomId, io) {
  return withLock(ROOMS_LOCK, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const current = await lockedMember(tx, member.id);
      if (current.roomId) return { roomId: current.roomId, fresh: false, gender: current.gender };

      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { _count: { select: { members: true } } },
      });
      if (!room) throw new Error('ROOM_NOT_FOUND');
      if (room.gender !== current.gender) throw new Error('ROOM_WRONG_GENDER');
      if (room.locked) throw new Error('ROOM_LOCKED');
      if (room._count.members >= room.capacity) throw new Error('ROOM_FULL');

      await tx.member.update({ where: { id: member.id }, data: { roomId: room.id } });
      return { roomId: room.id, fresh: true, gender: current.gender };
    });
    return publishPick(io, member, result, 'choose');
  });
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

// Loi nghiep vu nem ra tu trong hang doi -> ma HTTP + cau bao tieng Viet
const PUBLIC_ERRORS = {
  NO_ROOM_FOR_GENDER: [409, 'Chưa có phòng nào dành cho giới tính của bạn — nhờ admin tạo thêm phòng'],
  ROOMS_FULL: [409, 'Các phòng cùng giới tính đã kín chỗ hoặc đang khóa — nhờ admin mở thêm phòng'],
  ROOM_NOT_FOUND: [404, 'Phòng này không còn tồn tại — chọn phòng khác nhé'],
  ROOM_WRONG_GENDER: [400, 'Phòng này dành cho giới tính khác — chọn phòng đúng giới tính của bạn'],
  ROOM_LOCKED: [409, 'Phòng này vừa bị admin khóa — chọn phòng khác nhé'],
  ROOM_FULL: [409, 'Phòng này vừa kín chỗ — chọn phòng khác nhé'],
  NOT_ELIGIBLE: [403, 'Bạn không nằm trong danh sách tham gia ghép phòng lần này'],
  NO_GENDER: [400, 'Bạn chưa được đặt giới tính (Nam/Nữ) — nhờ admin cập nhật trước khi nhận phòng'],
  MEMBER_GONE: [404, 'Không tìm thấy thành viên'],
};

/* ---------- cong khai ---------- */

// GET /api/rooms - danh sach phong ngu kem nguoi o trong tung phong
router.get('/rooms', async (req, res) => {
  try {
    const [payload, locked, defaultCapacity, ui] = await Promise.all([
      loadRoomsPayload(prisma),
      isRoomsLocked(),
      getRoomCapacity(),
      getPublicUi(),
    ]);
    res.json({ ...payload, locked, defaultCapacity, pickMode: ui.roomPickMode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tải danh sách phòng' });
  }
});

// Kiem tra chung cho luot quay / tu chon phong. Tra ve { member } hoac
// { status, error } (da co phong thi tra { member, existing } - khoa vong chi
// chan luot nhan phong MOI, nguoi da co phong van xem lai duoc phong cua minh).
async function preparePublicPick(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return { status: 400, error: 'Thiếu tên thành viên' };
  }

  const [locked, ui] = await Promise.all([isRoomsLocked(), getPublicUi()]);
  if (!ui.showRoomsPage) {
    return { status: 403, error: 'Trang ghép phòng đang tạm đóng — chờ admin mở lại' };
  }

  const member = await prisma.member.findUnique({ where: { name: name.trim() } });
  if (!member) {
    return { status: 404, error: 'Không tìm thấy thành viên' };
  }
  if (!member.joinRoom) {
    return { status: 403, error: 'Bạn không nằm trong danh sách tham gia ghép phòng lần này' };
  }

  if (member.roomId) {
    const room = await findRoomWithMembers(member.roomId);
    if (room) return { member, ui, existing: room };
  }

  if (locked) {
    return { status: 403, error: 'Vòng ghép phòng đang tạm khóa — chờ admin mở', locked: true };
  }
  if (!member.gender) {
    return { status: 400, error: 'Bạn chưa được đặt giới tính (Nam/Nữ) — nhờ admin cập nhật trước khi nhận phòng' };
  }
  return { member, ui };
}

function memberView(member) {
  return { id: member.id, name: member.name, gender: member.gender };
}

// Ghi nhat ky + tra ket qua (dung chung cho quay va tu chon). Realtime da phat
// trong hang doi (publishPick), o day chi con viec khong can giu thu tu.
async function finishPick(req, res, member, result, verb) {
  const { payload } = result;

  if (!result.fresh) {
    return res.json({ ...payload, alreadyAssigned: true });
  }

  await activity.log(
    {
      type: 'room',
      icon: verb === 'choose' ? 'hand' : 'bed-double',
      actor: member.name,
      message: `${member.name} ${verb === 'choose' ? 'chọn' : 'vào'} ${payload.room.name}`,
      meta: { roomId: payload.room.id, memberId: member.id, via: verb },
    },
    req.io
  );

  return res.json({ ...payload, alreadyAssigned: false });
}

function sendPickError(res, err, fallback) {
  const known = PUBLIC_ERRORS[err.message];
  if (known) return res.status(known[0]).json({ error: known[1], code: err.message });
  console.error(err);
  return res.status(500).json({ error: fallback });
}

// POST /api/room/random - random phong ngu cho 1 thanh vien (idempotent, dung gioi tinh).
// Dung duoc o ca 2 che do: o che do "Tu chon phong" day la nut "Xep ngau nhien giup toi".
router.post('/room/random', async (req, res) => {
  try {
    const prep = await preparePublicPick((req.body || {}).name);
    if (prep.error) return res.status(prep.status).json({ error: prep.error, locked: !!prep.locked });

    // Da co phong truoc do -> tra ve phong cu, khong random lai
    if (prep.existing) {
      return res.json({ member: memberView(prep.member), room: prep.existing, alreadyAssigned: true });
    }

    const result = await drawRoomFor(prep.member, req.io);
    return finishPick(req, res, prep.member, result, 'random');
  } catch (err) {
    return sendPickError(res, err, 'Có lỗi xảy ra khi ghép phòng');
  }
});

// POST /api/room/choose - { name, roomId } tu chon 1 phong con cho (che do "Tu chon phong").
// Chon 1 lan duy nhat; muon doi phai nho admin chuyen (tranh nguoi bam qua bam lai
// lam nguoi khac vua thay phong con cho xong lai het).
router.post('/room/choose', async (req, res) => {
  const roomId = parseId((req.body || {}).roomId);
  if (!roomId) {
    return res.status(400).json({ error: 'Chưa chọn phòng' });
  }

  try {
    const prep = await preparePublicPick((req.body || {}).name);
    if (prep.error) return res.status(prep.status).json({ error: prep.error, locked: !!prep.locked });

    if (prep.existing) {
      return res.json({ member: memberView(prep.member), room: prep.existing, alreadyAssigned: true });
    }
    if (prep.ui.roomPickMode !== 'choose') {
      return res.status(403).json({ error: 'Lần này phòng được xếp bằng vòng quay — tải lại trang để quay nhé', code: 'PICK_MODE' });
    }

    const result = await chooseRoomFor(prep.member, roomId, req.io);
    return finishPick(req, res, prep.member, result, 'choose');
  } catch (err) {
    return sendPickError(res, err, 'Có lỗi xảy ra khi chọn phòng');
  }
});

/* ---------- admin: tung phong ---------- */

// POST /api/admin/rooms - tao phong moi
router.post('/admin/rooms', requireAdmin, async (req, res) => {
  const { name, gender, capacity, note, location } = req.body || {};

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

  const parsedLocation = parseLocation(location);
  if (parsedLocation === undefined) {
    return res.status(400).json({ error: `Vị trí phòng tối đa ${MAX_LOCATION_LENGTH} ký tự` });
  }

  try {
    const last = await prisma.room.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });

    const room = await prisma.room.create({
      data: {
        name: cleanName,
        location: parsedLocation,
        gender: parsedGender,
        capacity: parsedCapacity,
        sortOrder: (last ? last.sortOrder : 0) + 1,
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
      },
    });

    await emitRooms(req);
    await activity.log(
      {
        type: 'admin',
        icon: 'door-open',
        message: `Tạo phòng ${room.name}${room.location ? ` — ${room.location}` : ''} (${genderLabel(room.gender)}, ${room.capacity} chỗ)`,
      },
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

// PUT /api/admin/rooms/:id - sua ten / vi tri / gioi tinh / suc chua / ghi chu / khoa
router.put('/admin/rooms/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Phòng không hợp lệ' });
  }

  const { name, gender, capacity, note, locked, location } = req.body || {};
  const data = {};

  if (name !== undefined) {
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName) return res.status(400).json({ error: 'Tên phòng không được để trống' });
    data.name = cleanName;
  }

  if (location !== undefined) {
    const parsedLocation = parseLocation(location);
    if (parsedLocation === undefined) {
      return res.status(400).json({ error: `Vị trí phòng tối đa ${MAX_LOCATION_LENGTH} ký tự` });
    }
    data.location = parsedLocation;
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
    // Kiem tra so nguoi dang o va ghi trong cung hang doi voi luot quay: neu khong,
    // ha suc chua dung luc co nguoi vua duoc xep vao se thanh phong vuot suc chua.
    const outcome = await withLock(ROOMS_LOCK, async () => {
      const room = await findRoomWithMembers(id);
      if (!room) return { status: 404, error: 'Không tìm thấy phòng' };

      if (data.capacity !== undefined && data.capacity < room.members.length) {
        return {
          status: 400,
          error: `Phòng đang có ${room.members.length} người, không thể hạ sức chứa xuống ${data.capacity} — chuyển người ra trước`,
        };
      }

      if (data.gender !== undefined && room.members.some((m) => m.gender !== data.gender)) {
        return {
          status: 400,
          error: `Phòng đang có người ${genderLabel(room.gender)} ở trong — chuyển họ ra trước khi đổi giới tính phòng`,
        };
      }

      return { updated: await prisma.room.update({ where: { id }, data }) };
    });

    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    const { updated } = outcome;
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
    const room = await withLock(ROOMS_LOCK, async () => {
      const found = await prisma.room.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
      if (!found) return null;
      await prisma.$transaction([
        prisma.member.updateMany({ where: { roomId: id }, data: { roomId: null } }),
        prisma.room.delete({ where: { id } }),
      ]);
      return found;
    });
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }

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
      const { released, deleted } = await withLock(ROOMS_LOCK, async () => {
        const releasedCount = await prisma.member.count({ where: { roomId: { in: roomIds } } });
        const [, del] = await prisma.$transaction([
          prisma.member.updateMany({ where: { roomId: { in: roomIds } }, data: { roomId: null } }),
          prisma.room.deleteMany({ where: { id: { in: roomIds } } }),
        ]);
        return { released: releasedCount, deleted: del.count };
      });

      await emitRooms(req);
      req.io.emit('members:updated', {});
      await activity.log({ type: 'admin', icon: 'trash-2', message: `Xóa ${deleted} phòng` }, req.io);
      return res.json({ ok: true, action, affected: deleted, releasedMembers: released });
    }

    if (action === 'clear') {
      const { count } = await withLock(ROOMS_LOCK, () =>
        prisma.member.updateMany({
          where: { roomId: { in: roomIds }, pinnedRoom: false },
          data: { roomId: null },
        })
      );

      await emitRooms(req);
      req.io.emit('members:updated', {});
      if (count) {
        await activity.log(
          { type: 'admin', icon: 'user-round-minus', message: `Dọn ${count} người ra khỏi ${roomIds.length} phòng` },
          req.io
        );
      }
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
    const result = await withLock(ROOMS_LOCK, () =>
      prisma.$transaction((tx) => assignAllPending(tx, { includeAssigned: !!reshuffle }), { timeout: 20000 })
    );
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
    const outcome = await withLock(ROOMS_LOCK, async () => {
      const member = await prisma.member.findUnique({ where: { id: memberId } });
      if (!member) return { status: 404, error: 'Không tìm thấy thành viên' };

      let room = null;
      if (roomId) {
        room = await prisma.room.findUnique({
          where: { id: roomId },
          include: { _count: { select: { members: true } } },
        });
        if (!room) return { status: 404, error: 'Không tìm thấy phòng' };
        if (!member.gender) {
          return { status: 400, error: `${member.name} chưa có giới tính — đặt giới tính trước khi xếp phòng` };
        }
        if (room.gender !== member.gender) {
          return {
            status: 400,
            error: `Phòng "${room.name}" dành cho ${genderLabel(room.gender)}, không xếp được người ${genderLabel(member.gender)}`,
          };
        }
        const occupancy = room._count.members - (member.roomId === room.id ? 1 : 0);
        if (occupancy >= room.capacity) {
          return { status: 400, error: `Phòng "${room.name}" đã kín ${room.capacity} người` };
        }
      }

      await prisma.member.update({ where: { id: memberId }, data: { roomId } });
      return { member, room };
    });

    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });

    const payload = await emitRooms(req);
    req.io.emit('members:updated', {});
    await activity.log(
      {
        type: 'admin',
        icon: outcome.room ? 'arrow-left-right' : 'user-round-minus',
        message: outcome.room ? `Xếp ${outcome.member.name} vào ${outcome.room.name}` : `Đưa ${outcome.member.name} ra khỏi phòng`,
      },
      req.io
    );

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
    const outcome = await withLock(ROOMS_LOCK, async () => {
      const [a, b] = await Promise.all([
        prisma.member.findUnique({ where: { id: aId } }),
        prisma.member.findUnique({ where: { id: bId } }),
      ]);
      if (!a || !b) return { status: 404, error: 'Không tìm thấy thành viên' };
      if (!a.roomId && !b.roomId) return { status: 400, error: 'Cả hai người đều chưa có phòng' };
      if (a.roomId === b.roomId) return { status: 400, error: 'Hai người đang ở cùng một phòng' };
      if (!a.gender || a.gender !== b.gender) {
        return { status: 400, error: 'Chỉ đổi chỗ được giữa 2 người cùng giới tính' };
      }

      await prisma.$transaction([
        prisma.member.update({ where: { id: aId }, data: { roomId: b.roomId } }),
        prisma.member.update({ where: { id: bId }, data: { roomId: a.roomId } }),
      ]);
      return { a, b };
    });

    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });

    const payload = await emitRooms(req);
    req.io.emit('members:updated', {});
    await activity.log(
      { type: 'admin', icon: 'arrow-left-right', message: `Đổi chỗ ${outcome.a.name} ↔ ${outcome.b.name}` },
      req.io
    );

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
      ids.map((id, index) => prisma.room.updateMany({ where: { id }, data: { sortOrder: index + 1 } }))
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
    const { count } = await withLock(ROOMS_LOCK, () =>
      prisma.member.updateMany({
        where: { roomId: { not: null }, ...(keepPinned ? { pinnedRoom: false } : {}) },
        data: { roomId: null },
      })
    );
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
