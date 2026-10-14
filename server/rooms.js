// Logic dung chung cho phan ghep phong ngu: nam o voi nam, nu o voi nu.
// Dung boi ca routes/rooms.js (random phong) va routes/admin.js (admin sua tay).

const GENDERS = ['MALE', 'FEMALE'];
const GENDER_LABEL = { MALE: 'Nam', FEMALE: 'Nữ' };

const MAX_ROOM_CAPACITY = 50;

// Tra ve 'MALE' | 'FEMALE' | null (de trong) | undefined (gia tri khong hop le)
function parseGender(value) {
  if (value === null || value === undefined || value === '') return null;
  const upper = String(value).trim().toUpperCase();
  return GENDERS.includes(upper) ? upper : undefined;
}

function genderLabel(gender) {
  return GENDER_LABEL[gender] || 'Chưa đặt';
}

function parseCapacity(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_ROOM_CAPACITY) return undefined;
  return parsed;
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Danh sach phong kem so cho da dung, dang gon de thuat toan ghep xu ly nhanh
async function loadRoomSlots(client) {
  const rooms = await client.room.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { members: true } } },
  });
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    gender: r.gender,
    capacity: r.capacity,
    locked: r.locked,
    occupancy: r._count.members,
  }));
}

// Chon phong cho 1 nguoi: chi lay phong dung gioi tinh, KHONG bi khoa va con cho trong.
// Uu tien phong DANG CO NGUOI nhung chua day de lap kin tung phong (ghep du cap,
// khong de nhieu phong le loi moi phong 1 nguoi), random giua cac phong cung muc
// lap day nen ai o voi ai van hoan toan ngau nhien.
function pickRoom(slots, gender) {
  const available = slots.filter((r) => r.gender === gender && !r.locked && r.occupancy < r.capacity);
  if (!available.length) return null;
  const maxFilled = Math.max(...available.map((r) => r.occupancy));
  const candidates = available.filter((r) => r.occupancy === maxFilled);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Ghep phong hang loat cho tat ca nguoi du dieu kien ma chua co phong (admin bam 1 nut).
// Tron thu tu truoc khi chia nen ket qua ghep cap la ngau nhien.
// options.includeAssigned = true -> boc het nguoi ra roi ghep lai tu dau,
// tru nhung nguoi duoc ghim (pinnedRoom).
async function assignAllPending(tx, options = {}) {
  const { includeAssigned = false } = options;

  if (includeAssigned) {
    await tx.member.updateMany({
      where: { joinRoom: true, pinnedRoom: false, roomId: { not: null } },
      data: { roomId: null },
    });
  }

  const slots = await loadRoomSlots(tx);
  const pending = await tx.member.findMany({
    where: { roomId: null },
    select: { id: true, name: true, gender: true, joinRoom: true },
    orderBy: { id: 'asc' },
  });

  const assigned = [];
  const skipped = [];

  pending.forEach((m) => {
    if (!m.joinRoom) skipped.push({ name: m.name, reason: 'Không tham gia vòng ghép phòng' });
    else if (!m.gender) skipped.push({ name: m.name, reason: 'Chưa đặt giới tính' });
  });

  for (const member of shuffle(pending.filter((m) => m.joinRoom && m.gender))) {
    const room = pickRoom(slots, member.gender);
    if (!room) {
      skipped.push({ name: member.name, reason: `Hết phòng trống cho ${genderLabel(member.gender)}` });
      continue;
    }
    room.occupancy += 1;
    await tx.member.update({ where: { id: member.id }, data: { roomId: room.id } });
    assigned.push({ name: member.name, roomName: room.name, roomId: room.id });
  }

  // Co nguoi tu quay xen vao giua luc admin ghep hang loat -> so cho da doc
  // bi lech. Kiem lai mot luot, neu co phong vuot suc chua thi roll back ca me.
  const verify = await loadRoomSlots(tx);
  if (verify.some((r) => r.occupancy > r.capacity)) {
    throw new Error('RACE');
  }

  return { assigned, skipped };
}

function serializeRoom(room) {
  const members = (room.members || []).map((m) => ({
    id: m.id,
    name: m.name,
    gender: m.gender,
    isLeader: m.isLeader,
    pinnedRoom: m.pinnedRoom,
  }));
  return {
    id: room.id,
    name: room.name,
    gender: room.gender,
    capacity: room.capacity,
    note: room.note,
    locked: room.locked,
    sortOrder: room.sortOrder,
    members,
    occupancy: members.length,
    freeSlots: Math.max(0, room.capacity - members.length),
    isFull: members.length >= room.capacity,
  };
}

async function loadRoomsPayload(client) {
  const [rooms, members] = await Promise.all([
    client.room.findMany({
      orderBy: [{ gender: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        members: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, gender: true, isLeader: true, pinnedRoom: true },
        },
      },
    }),
    client.member.findMany({ select: { id: true, gender: true, roomId: true, joinRoom: true } }),
  ]);

  const serialized = rooms.map(serializeRoom);
  const eligible = members.filter((m) => m.joinRoom);

  const stats = {
    totalMembers: members.length,
    eligible: eligible.length,
    excluded: members.length - eligible.length,
    assigned: eligible.filter((m) => m.roomId).length,
    pending: eligible.filter((m) => !m.roomId && m.gender).length,
    noGender: eligible.filter((m) => !m.gender).length,
    totalCapacity: serialized.reduce((sum, r) => sum + r.capacity, 0),
    lockedRooms: serialized.filter((r) => r.locked).length,
    byGender: GENDERS.reduce((acc, gender) => {
      const ofGender = eligible.filter((m) => m.gender === gender);
      const roomsOfGender = serialized.filter((r) => r.gender === gender);
      acc[gender] = {
        members: ofGender.length,
        assigned: ofGender.filter((m) => m.roomId).length,
        rooms: roomsOfGender.length,
        capacity: roomsOfGender.reduce((sum, r) => sum + r.capacity, 0),
      };
      return acc;
    }, {}),
  };

  return { rooms: serialized, stats };
}

module.exports = {
  GENDERS,
  GENDER_LABEL,
  MAX_ROOM_CAPACITY,
  parseGender,
  genderLabel,
  parseCapacity,
  shuffle,
  loadRoomSlots,
  pickRoom,
  assignAllPending,
  serializeRoom,
  loadRoomsPayload,
};
