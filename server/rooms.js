// Logic dung chung cho phan ghep phong ngu: nam o voi nam, nu o voi nu.
// Dung boi ca routes/rooms.js (random phong) va routes/admin.js (admin sua tay).
//
// Gioi tinh cua phong:
//   - Admin co the CO DINH 1 phong cho nam hoac nu (Room.gender).
//   - Hoac de "chua dinh" (Room.gender = null): nam hay nu deu vao duoc, nguoi
//     DAU TIEN vao quyet dinh phong do thuoc gioi nao; phong trong lai thi lai mo.
//   Gioi "hieu luc" cua phong = gioi co dinh, khong co thi = gioi nguoi dang o.
//   Khong bao gio xep nam nu vao chung 1 phong.
//
// Vi phong dung chung, gioi nhan phong truoc co the chiem phong lung tung lam gioi
// sau het cho. Moi luot xep deu qua computeShortfall(): chi chap nhan neu so nguoi
// "het cho" (theo cach chia phong trong toi uu nhat) KHONG tang len.

const GENDERS = ['MALE', 'FEMALE'];
const GENDER_LABEL = { MALE: 'Nam', FEMALE: 'Nữ' };
const ROOM_TURNS = ['ALL', 'FEMALE', 'MALE'];

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

function otherGender(gender) {
  return gender === 'MALE' ? 'FEMALE' : 'MALE';
}

function parseTurn(value) {
  const upper = String(value || '').trim().toUpperCase();
  return ROOM_TURNS.includes(upper) ? upper : 'ALL';
}

const MAX_LOCATION_LENGTH = 120;

// '' / null -> null (xoa), chuoi qua dai -> undefined (khong hop le)
function parseLocation(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > MAX_LOCATION_LENGTH ? undefined : text;
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

// Gioi hieu luc: co dinh > gioi nguoi dang o > null (phong trong, chua dinh)
function effectiveGender(fixedGender, occupants) {
  if (fixedGender) return fixedGender;
  const first = (occupants || []).find((m) => m && m.gender);
  return first ? first.gender : null;
}

// Danh sach phong kem so cho da dung, dang gon de thuat toan ghep xu ly nhanh
async function loadRoomSlots(client) {
  const rooms = await client.room.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { members: { select: { gender: true } } },
  });
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    fixedGender: r.gender || null,
    gender: effectiveGender(r.gender, r.members),
    capacity: r.capacity,
    locked: r.locked,
    occupancy: r.members.length,
    mixed: new Set(r.members.map((m) => m.gender).filter(Boolean)).size > 1,
  }));
}

// So nguoi CON DANG CHO phong cua tung gioi (duoc tham gia, da co gioi tinh, chua co phong)
async function loadPending(client) {
  const rows = await client.member.groupBy({
    by: ['gender'],
    where: { joinRoom: true, roomId: null, gender: { not: null } },
    _count: { _all: true },
  });
  const pending = { MALE: 0, FEMALE: 0 };
  rows.forEach((row) => {
    if (row.gender) pending[row.gender] = row._count._all;
  });
  return pending;
}

// So nguoi se KHONG co cho neu chia cac phong trong (chua dinh) cho 2 gioi theo
// cach tot nhat. Phong dang khoa khong nhan them ai nen khong tinh cho trong.
// Bai toan chia = subset-sum tren suc chua cac phong trong (vai chuc phong, <= 50
// cho moi phong -> mang vai nghin phan tu, rat nhanh).
// Tra ve { total, FEMALE, MALE } - so nguoi thieu cho cua tung gioi.
function computeShortfall(slots, pending) {
  const free = { MALE: 0, FEMALE: 0 };
  const open = [];
  slots.forEach((r) => {
    if (r.locked) return;
    const left = Math.max(0, r.capacity - r.occupancy);
    if (!left) return;
    if (r.gender) free[r.gender] += left;
    else open.push(left);
  });

  const total = open.reduce((sum, c) => sum + c, 0);
  const reach = new Uint8Array(total + 1);
  reach[0] = 1;
  open.forEach((c) => {
    for (let s = total; s >= c; s--) if (reach[s - c]) reach[s] = 1;
  });

  let best = null;
  for (let s = 0; s <= total; s++) {
    if (!reach[s]) continue;
    const female = Math.max(0, (pending.FEMALE || 0) - free.FEMALE - s);
    const male = Math.max(0, (pending.MALE || 0) - free.MALE - (total - s));
    if (!best || female + male < best.total) best = { total: female + male, FEMALE: female, MALE: male };
  }
  return best || { total: 0, FEMALE: 0, MALE: 0 };
}

// Phong nay co nhan them 1 nguoi gioi `gender` khong (chua xet giu cho cho gioi kia)
function roomAccepts(room, gender) {
  return !room.locked && room.occupancy < room.capacity && (!room.gender || room.gender === gender);
}

// Xep thu 1 nguoi vao phong -> co lam tang so nguoi het cho khong?
// `pending` phai DANG tinh ca nguoi nay (ho chua co phong).
function placementOk(slots, pending, room, gender) {
  if (!roomAccepts(room, gender)) return false;
  const before = computeShortfall(slots, pending).total;
  const nextSlots = slots.map((r) =>
    r.id === room.id ? { ...r, occupancy: r.occupancy + 1, gender: r.gender || gender } : r
  );
  const nextPending = { ...pending, [gender]: Math.max(0, (pending[gender] || 0) - 1) };
  return computeShortfall(nextSlots, nextPending).total <= before;
}

// Chon phong cho 1 nguoi: phong nhan duoc gioi nay (cung gioi hoac con trong, chua
// khoa, con cho) VA khong lam gioi kia het cho. Uu tien phong DANG CO NGUOI cung
// gioi nhung chua day de lap kin tung phong (khong de nhieu phong le loi 1 nguoi),
// random giua cac phong cung muc lap day nen ai o voi ai van hoan toan ngau nhien.
// Tra ve { room } hoac { room: null, reason: 'NONE' | 'FULL' | 'RESERVED' }.
function pickRoom(slots, gender, pending) {
  if (!slots.some((r) => !r.gender || r.gender === gender)) return { room: null, reason: 'NONE' };
  const accepting = slots.filter((r) => roomAccepts(r, gender));
  if (!accepting.length) return { room: null, reason: 'FULL' };
  const valid = accepting.filter((r) => placementOk(slots, pending, r, gender));
  if (!valid.length) return { room: null, reason: 'RESERVED' };
  const maxFilled = Math.max(...valid.map((r) => r.occupancy));
  const candidates = valid.filter((r) => r.occupancy === maxFilled);
  return { room: candidates[Math.floor(Math.random() * candidates.length)] };
}

// Ly do khong xep duoc -> cau bao tieng Viet
function pickFailReason(reason, gender) {
  if (reason === 'NONE') return `Không có phòng nào nhận ${genderLabel(gender)}`;
  if (reason === 'RESERVED') return `Chỗ còn lại phải để dành cho các bạn ${genderLabel(otherGender(gender))}`;
  return `Hết phòng trống cho ${genderLabel(gender)}`;
}

// Ghep phong hang loat cho tat ca nguoi du dieu kien ma chua co phong (admin bam 1 nut).
// Tron thu tu truoc khi chia nen ket qua ghep la ngau nhien.
// options.includeAssigned = true -> boc het nguoi ra roi ghep lai tu dau,
// tru nhung nguoi duoc ghim (pinnedRoom).
// options.turn = 'FEMALE' | 'MALE' -> chi xep gioi dang toi luot (gioi kia van duoc giu cho).
async function assignAllPending(tx, options = {}) {
  const { includeAssigned = false } = options;
  const turn = parseTurn(options.turn);

  if (includeAssigned) {
    await tx.member.updateMany({
      where: {
        joinRoom: true,
        pinnedRoom: false,
        roomId: { not: null },
        ...(turn !== 'ALL' ? { gender: turn } : {}),
      },
      data: { roomId: null },
    });
  }

  const slots = await loadRoomSlots(tx);
  const pending = await loadPending(tx);
  const waiting = await tx.member.findMany({
    where: { roomId: null },
    select: { id: true, name: true, gender: true, joinRoom: true },
    orderBy: { id: 'asc' },
  });

  const assigned = [];
  const skipped = [];

  waiting.forEach((m) => {
    if (!m.joinRoom) skipped.push({ name: m.name, reason: 'Không tham gia vòng ghép phòng' });
    else if (!m.gender) skipped.push({ name: m.name, reason: 'Chưa đặt giới tính' });
    else if (turn !== 'ALL' && m.gender !== turn) skipped.push({ name: m.name, reason: `Chưa tới lượt ${genderLabel(m.gender)}` });
  });

  const queue = shuffle(waiting.filter((m) => m.joinRoom && m.gender && (turn === 'ALL' || m.gender === turn)));
  for (const member of queue) {
    const { room, reason } = pickRoom(slots, member.gender, pending);
    if (!room) {
      skipped.push({ name: member.name, reason: pickFailReason(reason, member.gender) });
      continue;
    }
    room.occupancy += 1;
    room.gender = room.gender || member.gender;
    pending[member.gender] = Math.max(0, pending[member.gender] - 1);
    await tx.member.update({ where: { id: member.id }, data: { roomId: room.id } });
    assigned.push({ name: member.name, roomName: room.name, roomId: room.id });
  }

  // Co thao tac xen vao giua luc admin ghep hang loat -> so cho da doc bi lech.
  // Kiem lai mot luot, neu co phong vuot suc chua / nam nu chung phong thi roll back.
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
    location: room.location || null,
    // gender = gioi HIEU LUC (null = phong trong, ai vao cung duoc); fixedGender = admin co dinh
    gender: effectiveGender(room.gender, members),
    fixedGender: room.gender || null,
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

// Phong cho client (kem gioi hieu luc) - dung cho payload realtime 1 phong
async function findRoomPayload(client, id) {
  const room = await client.room.findUnique({
    where: { id },
    include: {
      members: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true, gender: true, isLeader: true, pinnedRoom: true },
      },
    },
  });
  return room ? serializeRoom(room) : null;
}

async function loadRoomsPayload(client) {
  const [rooms, members] = await Promise.all([
    client.room.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
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
  const pending = { MALE: 0, FEMALE: 0 };
  eligible.forEach((m) => {
    if (m.gender && !m.roomId) pending[m.gender] += 1;
  });
  const openRooms = serialized.filter((r) => !r.gender);
  const shortfall = computeShortfall(serialized, pending);

  const stats = {
    totalMembers: members.length,
    eligible: eligible.length,
    excluded: members.length - eligible.length,
    assigned: eligible.filter((m) => m.roomId).length,
    pending: eligible.filter((m) => !m.roomId && m.gender).length,
    noGender: eligible.filter((m) => !m.gender).length,
    totalCapacity: serialized.reduce((sum, r) => sum + r.capacity, 0),
    lockedRooms: serialized.filter((r) => r.locked).length,
    // Phong chua co ai va chua co dinh gioi: nam hay nu deu vao duoc
    openRooms: openRooms.length,
    openCapacity: openRooms.reduce((sum, r) => sum + r.capacity, 0),
    // So nguoi se khong co cho du chia phong trong theo cach tot nhat
    shortfall,
    byGender: GENDERS.reduce((acc, gender) => {
      const ofGender = eligible.filter((m) => m.gender === gender);
      const roomsOfGender = serialized.filter((r) => r.gender === gender);
      acc[gender] = {
        members: ofGender.length,
        assigned: ofGender.filter((m) => m.roomId).length,
        pending: pending[gender],
        rooms: roomsOfGender.length,
        capacity: roomsOfGender.reduce((sum, r) => sum + r.capacity, 0),
        free: roomsOfGender.filter((r) => !r.locked).reduce((sum, r) => sum + r.freeSlots, 0),
      };
      return acc;
    }, {}),
  };

  return { rooms: serialized, stats };
}

module.exports = {
  GENDERS,
  GENDER_LABEL,
  ROOM_TURNS,
  MAX_ROOM_CAPACITY,
  MAX_LOCATION_LENGTH,
  parseGender,
  parseTurn,
  genderLabel,
  otherGender,
  parseCapacity,
  parseLocation,
  shuffle,
  effectiveGender,
  loadRoomSlots,
  loadPending,
  computeShortfall,
  roomAccepts,
  placementOk,
  pickRoom,
  pickFailReason,
  assignAllPending,
  serializeRoom,
  findRoomPayload,
  loadRoomsPayload,
};
