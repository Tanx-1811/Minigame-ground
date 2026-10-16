// Logic dung chung cho phan ghep phong ngu: nam o voi nam, nu o voi nu.
// Dung boi ca routes/rooms.js (random phong) va routes/admin.js (admin sua tay).
//
// 2 kieu phong:
//  - phong co dinh (gender = MALE / FEMALE): chi nhan dung gioi do
//  - phong "nam hoac nu" (gender = null): ai vao cung duoc, nhung nguoi DAU TIEN
//    vao quyet dinh phong la nam hay nu; tu do chi nhan nguoi cung gioi. Phong
//    trong lai (moi nguoi ra het) thi lai nhan ca hai.

const GENDERS = ['MALE', 'FEMALE'];
const GENDER_LABEL = { MALE: 'Nam', FEMALE: 'Nữ' };
const FLEX_LABEL = 'Nam hoặc nữ';

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

// Gioi tinh cua PHONG: 'ANY' / de trong = phong nam hoac nu (null).
// Tra ve 'MALE' | 'FEMALE' | null | undefined (gia tri khong hop le)
function parseRoomGender(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (String(value).trim().toUpperCase() === 'ANY') return null;
  return parseGender(value);
}

function roomGenderLabel(gender) {
  return gender ? genderLabel(gender) : FLEX_LABEL;
}

// Gioi "dang ap dung" cua phong: phong co dinh -> gioi cua phong; phong nam hoac
// nu -> gioi cua nguoi dang o, phong trong -> null (nhan ca hai).
function activeGender(room, occupants) {
  if (room.gender) return room.gender;
  const first = (occupants || []).find((m) => m.gender);
  return first ? first.gender : null;
}

// Kiem tra xep nhung nguoi `incoming` ([{ id, gender }], da co gioi tinh) vao phong.
// occupants: nguoi dang o trong phong - ai nam trong incoming thi bo qua (vd dang o
// san trong chinh phong do). Tra ve chuoi loi, hoac null neu xep duoc.
function roomGenderError(room, occupants, incoming) {
  const incomingIds = new Set(incoming.map((m) => m.id));
  const staying = (occupants || []).filter((m) => !incomingIds.has(m.id));
  const genders = [...new Set(incoming.map((m) => m.gender))];
  if (genders.length > 1) {
    return `Không xếp chung nam và nữ vào phòng "${room.name}"`;
  }
  const gender = genders[0];
  const current = activeGender(room, staying);
  if (!current || current === gender) return null;
  return room.gender
    ? `Phòng "${room.name}" dành cho ${genderLabel(current)}, không xếp được người ${genderLabel(gender)}`
    : `Phòng "${room.name}" đang có ${genderLabel(current).toLowerCase()} ở, không xếp được người ${genderLabel(gender)}`;
}

// So cho con thieu cua tung gioi. Phong nam hoac nu dang trong la "kho chung":
// chia tung phong (to truoc) cho ben dang thieu nhieu hon. Gan dung (tham lam)
// nhung du de bao "thieu X cho nu" va de tu tao phong.
// need: { MALE, FEMALE } so cho con thieu khi chua tinh kho chung
// pool: suc chua cac phong nam hoac nu dang trong
function shortageAfterPool(need, pool) {
  const left = { ...need };
  [...pool]
    .sort((a, b) => b - a)
    .forEach((capacity) => {
      const target = GENDERS.filter((g) => left[g] > 0).sort((a, b) => left[b] - left[a])[0];
      if (target) left[target] = Math.max(0, left[target] - capacity);
    });
  return left;
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

// Danh sach phong kem so cho da dung, dang gon de thuat toan ghep xu ly nhanh.
// Phai doc ca gioi tinh nguoi dang o de biet phong nam hoac nu dang la nam hay nu.
async function loadRoomSlots(client) {
  const rooms = await client.room.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { members: { select: { gender: true } } },
  });
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    gender: r.gender,
    activeGender: activeGender(r, r.members),
    mixed: new Set(r.members.map((m) => m.gender).filter(Boolean)).size > 1,
    capacity: r.capacity,
    locked: r.locked,
    occupancy: r.members.length,
  }));
}

// Phong co the nhan nguoi gioi `gender` khong (chi xet gioi, chua xet cho / khoa)
function slotAccepts(slot, gender) {
  return slot.activeGender === null || slot.activeGender === gender;
}

// Chon phong cho 1 nguoi: phong nhan duoc gioi cua ho, KHONG bi khoa va con cho.
// Uu tien phong DANG CO NGUOI nhung chua day de lap kin tung phong (ghep du cap,
// khong de nhieu phong le loi moi phong 1 nguoi) - voi phong nam hoac nu dieu nay
// con giu cho moi gioi chi do dang toi da 1 phong, khong chiem het phong cua ben kia.
// Cung muc lap day thi uu tien phong co dinh dung gioi, de danh phong nam hoac nu
// cho ca hai ben; con lai random nen ai o voi ai van hoan toan ngau nhien.
// Chon xong nho cap nhat slot (occupancy, activeGender) neu con chon tiep.
function pickRoom(slots, gender) {
  const available = slots.filter((r) => slotAccepts(r, gender) && !r.locked && r.occupancy < r.capacity);
  if (!available.length) return null;
  const maxFilled = Math.max(...available.map((r) => r.occupancy));
  let candidates = available.filter((r) => r.occupancy === maxFilled);
  const fixed = candidates.filter((r) => r.gender === gender);
  if (fixed.length) candidates = fixed;
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
    room.activeGender = member.gender;
    await tx.member.update({ where: { id: member.id }, data: { roomId: room.id } });
    assigned.push({ name: member.name, roomName: room.name, roomId: room.id });
  }

  // Co nguoi tu quay xen vao giua luc admin ghep hang loat -> so cho da doc
  // bi lech. Kiem lai mot luot, neu co phong vuot suc chua hoac lan nam nu
  // thi roll back ca me.
  const verify = await loadRoomSlots(tx);
  if (verify.some((r) => r.occupancy > r.capacity || r.mixed)) {
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
    // gender: kieu phong admin dat (null = nam hoac nu); activeGender: gioi dang ap
    // dung (phong nam hoac nu dang trong -> null)
    gender: room.gender,
    flexible: !room.gender,
    activeGender: activeGender(room, members),
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
  // Phong nam hoac nu dang trong: chua thuoc ve gioi nao
  const openRooms = serialized.filter((r) => !r.activeGender);

  const stats = {
    totalMembers: members.length,
    eligible: eligible.length,
    excluded: members.length - eligible.length,
    assigned: eligible.filter((m) => m.roomId).length,
    pending: eligible.filter((m) => !m.roomId && m.gender).length,
    noGender: eligible.filter((m) => !m.gender).length,
    totalCapacity: serialized.reduce((sum, r) => sum + r.capacity, 0),
    lockedRooms: serialized.filter((r) => r.locked).length,
    flexibleRooms: serialized.filter((r) => r.flexible).length,
    // rooms / capacity cua 1 gioi = phong co dinh cua gioi do + phong nam hoac nu
    // dang co nguoi gioi do o
    byGender: GENDERS.reduce((acc, gender) => {
      const ofGender = eligible.filter((m) => m.gender === gender);
      const roomsOfGender = serialized.filter((r) => r.activeGender === gender);
      acc[gender] = {
        members: ofGender.length,
        assigned: ofGender.filter((m) => m.roomId).length,
        rooms: roomsOfGender.length,
        capacity: roomsOfGender.reduce((sum, r) => sum + r.capacity, 0),
      };
      return acc;
    }, {}),
    openRooms: {
      rooms: openRooms.length,
      capacity: openRooms.reduce((sum, r) => sum + r.capacity, 0),
    },
  };

  // So cho con thieu cua tung gioi sau khi chia cac phong nam hoac nu dang trong
  stats.shortage = shortageAfterPool(
    GENDERS.reduce((acc, g) => {
      acc[g] = Math.max(0, stats.byGender[g].members - stats.byGender[g].capacity);
      return acc;
    }, {}),
    openRooms.map((r) => r.capacity)
  );

  return { rooms: serialized, stats };
}

module.exports = {
  GENDERS,
  GENDER_LABEL,
  MAX_ROOM_CAPACITY,
  parseGender,
  parseRoomGender,
  genderLabel,
  roomGenderLabel,
  activeGender,
  roomGenderError,
  shortageAfterPool,
  parseCapacity,
  shuffle,
  loadRoomSlots,
  slotAccepts,
  pickRoom,
  assignAllPending,
  serializeRoom,
  loadRoomsPayload,
};
