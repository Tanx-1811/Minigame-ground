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
    orderBy: { id: 'asc' },
    include: { _count: { select: { members: true } } },
  });
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    gender: r.gender,
    capacity: r.capacity,
    occupancy: r._count.members,
  }));
}

// Chon phong cho 1 nguoi: chi lay phong dung gioi tinh va con cho trong.
// Uu tien phong DANG CO NGUOI nhung chua day de lap kin tung phong (ghep du cap,
// khong de nhieu phong le loi moi phong 1 nguoi), random giua cac phong cung muc
// lap day nen ai o voi ai van hoan toan ngau nhien.
function pickRoom(slots, gender) {
  const available = slots.filter((r) => r.gender === gender && r.occupancy < r.capacity);
  if (!available.length) return null;
  const maxFilled = Math.max(...available.map((r) => r.occupancy));
  const candidates = available.filter((r) => r.occupancy === maxFilled);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Ghep phong hang loat cho tat ca nguoi chua co phong (admin bam 1 nut).
// Tron thu tu truoc khi chia nen ket qua ghep cap la ngau nhien.
async function assignAllPending(tx) {
  const slots = await loadRoomSlots(tx);
  const pending = await tx.member.findMany({
    where: { roomId: null },
    select: { id: true, name: true, gender: true },
    orderBy: { id: 'asc' },
  });

  const assigned = [];
  const skipped = pending
    .filter((m) => !m.gender)
    .map((m) => ({ name: m.name, reason: 'Chưa đặt giới tính' }));

  for (const member of shuffle(pending.filter((m) => m.gender))) {
    const room = pickRoom(slots, member.gender);
    if (!room) {
      skipped.push({ name: member.name, reason: `Hết phòng trống cho ${genderLabel(member.gender)}` });
      continue;
    }
    room.occupancy += 1;
    await tx.member.update({ where: { id: member.id }, data: { roomId: room.id } });
    assigned.push({ name: member.name, roomName: room.name });
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
  }));
  return {
    id: room.id,
    name: room.name,
    gender: room.gender,
    capacity: room.capacity,
    note: room.note,
    members,
    occupancy: members.length,
    freeSlots: Math.max(0, room.capacity - members.length),
  };
}

async function loadRoomsPayload(client) {
  const [rooms, members] = await Promise.all([
    client.room.findMany({
      orderBy: [{ gender: 'asc' }, { name: 'asc' }],
      include: {
        members: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, gender: true, isLeader: true },
        },
      },
    }),
    client.member.findMany({ select: { id: true, gender: true, roomId: true } }),
  ]);

  const serialized = rooms.map(serializeRoom);
  const stats = {
    totalMembers: members.length,
    assigned: members.filter((m) => m.roomId).length,
    noGender: members.filter((m) => !m.gender).length,
    totalCapacity: serialized.reduce((sum, r) => sum + r.capacity, 0),
    byGender: GENDERS.reduce((acc, gender) => {
      acc[gender] = {
        members: members.filter((m) => m.gender === gender).length,
        assigned: members.filter((m) => m.gender === gender && m.roomId).length,
        rooms: serialized.filter((r) => r.gender === gender).length,
        capacity: serialized.filter((r) => r.gender === gender).reduce((sum, r) => sum + r.capacity, 0),
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
