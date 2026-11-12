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
//
// Gioi han theo loai phong (Setting 'roomGenderLimits'): moi gioi chi duoc o toi da
// N phong co suc chua X (VD nam toi da 1 phong 4 nguoi, con lai o phong 2 nguoi).

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

/* ---------- gioi han so phong theo loai cho tung gioi ----------
   Setting 'roomGenderLimits' = { "MALE": { "4": 1 }, "FEMALE": {} }: nam chi duoc
   o toi da 1 phong 4 nguoi (con lai o phong nho hon). Khong ghi = khong gioi han.
   Dem theo gioi HIEU LUC cua phong (co dinh hoac dang co nguoi gioi do). Chi chan
   viec MO them phong trong cho gioi do - admin xep tay van lam duoc. */

const MAX_ROOM_LIMIT = 999;

function parseRoomLimits(raw) {
  let data = raw;
  if (typeof raw === 'string' || raw === null || raw === undefined) {
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (err) {
      data = {};
    }
  }
  const limits = { MALE: {}, FEMALE: {} };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return limits;
  GENDERS.forEach((gender) => {
    const byCap = data[gender];
    if (!byCap || typeof byCap !== 'object' || Array.isArray(byCap)) return;
    Object.entries(byCap).forEach(([cap, max]) => {
      const capacity = parseCapacity(cap);
      const value = max === null || max === '' ? NaN : Number(max);
      if (!capacity || !Number.isInteger(value) || value < 0 || value > MAX_ROOM_LIMIT) return;
      limits[gender][capacity] = value;
    });
  });
  return limits;
}

async function loadRoomLimits(client) {
  const row = await client.setting.findUnique({ where: { key: 'roomGenderLimits' } });
  return parseRoomLimits(row ? row.value : null);
}

// So phong toi da gioi nay duoc o voi suc chua nay (Infinity = khong gioi han)
function limitFor(limits, gender, capacity) {
  const value = limits && limits[gender] ? limits[gender][capacity] : undefined;
  return Number.isInteger(value) ? value : Infinity;
}

// Gioi nay con duoc MO them 1 phong trong co suc chua nay khong
function underLimit(slots, capacity, gender, limits) {
  const max = limitFor(limits, gender, capacity);
  if (max === Infinity) return true;
  return slots.filter((r) => r.gender === gender && r.capacity === capacity).length < max;
}

// So nguoi se KHONG co cho neu chia cac phong trong (chua dinh) cho 2 gioi theo
// cach tot nhat. Phong dang khoa khong nhan them ai nen khong tinh cho trong.
// Bai toan chia = quy hoach dong tren cac phong trong: trang thai = so cho chia cho
// nu -> so cho lon nhat chia duoc cho nam. Nhom phong co gioi han (VD nam toi da 1
// phong 4 nguoi) dem them so phong da chia cho tung gioi trong nhom do.
// Tra ve { total, FEMALE, MALE } - so nguoi thieu cho cua tung gioi.
function computeShortfall(slots, pending, limits) {
  const free = { MALE: 0, FEMALE: 0 };
  const taken = { MALE: {}, FEMALE: {} }; // so phong (theo suc chua) dang thuoc tung gioi
  const groups = new Map(); // suc chua -> [so cho trong cua tung phong trong]
  slots.forEach((r) => {
    if (r.gender) taken[r.gender][r.capacity] = (taken[r.gender][r.capacity] || 0) + 1;
    if (r.locked) return;
    const left = Math.max(0, r.capacity - r.occupancy);
    if (!left) return;
    if (r.gender) free[r.gender] += left;
    else {
      if (!groups.has(r.capacity)) groups.set(r.capacity, []);
      groups.get(r.capacity).push(left);
    }
  });

  let dp = new Map([[0, 0]]); // so cho chia cho nu -> so cho lon nhat chia duoc cho nam
  groups.forEach((lefts, capacity) => {
    const maxF = Math.max(0, limitFor(limits, 'FEMALE', capacity) - (taken.FEMALE[capacity] || 0));
    const maxM = Math.max(0, limitFor(limits, 'MALE', capacity) - (taken.MALE[capacity] || 0));
    const countF = maxF !== Infinity; // chi dem so phong khi co gioi han
    const countM = maxM !== Infinity;
    let cur = new Map();
    dp.forEach((sM, sF) => cur.set(`${sF}:0:0`, sM));
    lefts.forEach((left) => {
      const next = new Map();
      const put = (sF, f, m, sM) => {
        const key = `${sF}:${f}:${m}`;
        if (!next.has(key) || next.get(key) < sM) next.set(key, sM);
      };
      cur.forEach((sM, key) => {
        const [sF, f, m] = key.split(':').map(Number);
        put(sF, f, m, sM); // de trong
        if (f < maxF) put(sF + left, countF ? f + 1 : 0, m, sM);
        if (m < maxM) put(sF, f, countM ? m + 1 : 0, sM + left);
      });
      cur = next;
    });
    dp = new Map();
    cur.forEach((sM, key) => {
      const sF = Number(key.split(':')[0]);
      if (!dp.has(sF) || dp.get(sF) < sM) dp.set(sF, sM);
    });
  });

  let best = null;
  dp.forEach((sM, sF) => {
    const female = Math.max(0, (pending.FEMALE || 0) - free.FEMALE - sF);
    const male = Math.max(0, (pending.MALE || 0) - free.MALE - sM);
    if (!best || female + male < best.total) best = { total: female + male, FEMALE: female, MALE: male };
  });
  return best || { total: 0, FEMALE: 0, MALE: 0 };
}

// Phong nay co nhan them 1 nguoi gioi `gender` khong (chua xet giu cho cho gioi kia).
// ctx = { slots, limits }: phong trong chi mo cho gioi nay khi chua cham gioi han.
function roomAccepts(room, gender, ctx) {
  if (room.locked || room.occupancy >= room.capacity) return false;
  if (room.gender) return room.gender === gender;
  return !ctx || !ctx.limits ? true : underLimit(ctx.slots, room.capacity, gender, ctx.limits);
}

function placeInto(slots, room, gender) {
  return slots.map((r) => (r.id === room.id ? { ...r, occupancy: r.occupancy + 1, gender: r.gender || gender } : r));
}

/* ---------- chi dinh phong khi quay (admin, an voi nguoi choi) ----------
   Setting 'roomReservations' = { "<memberId>": [roomId, ...] }: nguoi nay quay
   thi chi duoc roi vao 1 trong cac phong do. Moi luot xep cua NGUOI KHAC cung
   phai chua lai cho cho ho (khong lap kin / khong bien het cac phong do thanh
   phong khac gioi) - neu khong thi "chi dinh" chi con la mong muon. */

const MAX_RESERVATIONS = 8; // so to hop thu = tich so phong cua tung nguoi -> giu nho

function parseReservationMap(raw) {
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (err) {
    data = {};
  }
  const map = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return map;
  Object.entries(data).forEach(([memberId, roomIds]) => {
    const id = Number.parseInt(memberId, 10);
    if (!Number.isInteger(id) || id <= 0 || !Array.isArray(roomIds)) return;
    const rooms = [...new Set(roomIds.map((r) => Number.parseInt(r, 10)).filter((r) => Number.isInteger(r) && r > 0))];
    if (rooms.length) map[id] = rooms;
  });
  return map;
}

// Chi dinh con hieu luc: nguoi do van dang cho phong (duoc tham gia, co gioi, chua co phong)
async function loadReservations(client) {
  const row = await client.setting.findUnique({ where: { key: 'roomReservations' } });
  const map = parseReservationMap(row ? row.value : null);
  const ids = Object.keys(map).map(Number);
  if (!ids.length) return [];
  const members = await client.member.findMany({
    where: { id: { in: ids }, joinRoom: true, roomId: null, gender: { not: null } },
    select: { id: true, gender: true },
  });
  return members
    .map((m) => ({ memberId: m.id, gender: m.gender, roomIds: new Set(map[m.id]) }))
    .slice(0, MAX_RESERVATIONS);
}

// Nhu computeShortfall nhung tinh ca nguoi duoc chi dinh: thu dat tung nguoi vao 1
// phong cho phep (it nguoi, it phong -> vai tram to hop), lay cach tot nhat. Nguoi
// duoc chi dinh ma khong con phong cho phep nao nhan -> tinh la 1 nguoi het cho.
function computeShortfallWith(slots, pending, reservations, limits) {
  if (!reservations || !reservations.length) return computeShortfall(slots, pending, limits);
  let best = null;
  const visit = (i, curSlots, curPending, unplaced) => {
    if (best && best.total === 0) return; // khong the tot hon
    if (i === reservations.length) {
      const sf = computeShortfall(curSlots, curPending, limits);
      const total = sf.total + unplaced;
      if (!best || total < best.total) best = { ...sf, total };
      return;
    }
    const res = reservations[i];
    const nextPending = { ...curPending, [res.gender]: Math.max(0, (curPending[res.gender] || 0) - 1) };
    const options = curSlots.filter((r) => res.roomIds.has(r.id) && roomAccepts(r, res.gender, { slots: curSlots, limits }));
    if (!options.length) {
      visit(i + 1, curSlots, nextPending, unplaced + 1);
      return;
    }
    options.forEach((r) => visit(i + 1, placeInto(curSlots, r, res.gender), nextPending, unplaced));
  };
  visit(0, slots, pending, 0);
  return best;
}

// Xep thu 1 nguoi vao phong -> co lam tang so nguoi het cho khong (tinh ca cho phai
// giu cho nguoi duoc chi dinh)? `pending` phai DANG tinh ca nguoi nay.
// opts.reservations: danh sach chi dinh con hieu luc; opts.memberId: nguoi dang xep;
// opts.limits: gioi han so phong theo loai cho tung gioi.
function placementOk(slots, pending, room, gender, opts = {}) {
  const { limits } = opts;
  if (!roomAccepts(room, gender, { slots, limits })) return false;
  const reservations = opts.reservations || [];
  const before = computeShortfallWith(slots, pending, reservations, limits).total;
  const nextPending = { ...pending, [gender]: Math.max(0, (pending[gender] || 0) - 1) };
  const nextReservations = reservations.filter((r) => r.memberId !== opts.memberId);
  return computeShortfallWith(placeInto(slots, room, gender), nextPending, nextReservations, limits).total <= before;
}

// Chon phong cho 1 nguoi: phong nhan duoc gioi nay (cung gioi hoac con trong, chua
// khoa, con cho) VA khong lam ai het cho. Nguoi duoc admin chi dinh phong thi chi
// chon trong cac phong do. Uu tien phong DANG CO NGUOI cung gioi nhung chua day de
// lap kin tung phong, random giua cac phong cung muc lap day.
// Tra ve { room } hoac { room: null, reason: 'NONE' | 'FULL' | 'RESERVED' }.
function pickRoom(slots, gender, pending, opts = {}) {
  const reservations = opts.reservations || [];
  const own = reservations.find((r) => r.memberId === opts.memberId);
  if (!slots.some((r) => !r.gender || r.gender === gender)) return { room: null, reason: 'NONE' };
  let accepting = slots.filter((r) => roomAccepts(r, gender, { slots, limits: opts.limits }));
  if (own) accepting = accepting.filter((r) => own.roomIds.has(r.id));
  if (!accepting.length) return { room: null, reason: 'FULL' };
  const valid = accepting.filter((r) => placementOk(slots, pending, r, gender, opts));
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
  let reservations = await loadReservations(tx);
  const limits = await loadRoomLimits(tx);
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

  // Nguoi duoc chi dinh phong xep TRUOC (chac chan vao dung phong), roi moi
  // den nhung nguoi con lai theo thu tu ngau nhien
  const eligibleNow = shuffle(waiting.filter((m) => m.joinRoom && m.gender && (turn === 'ALL' || m.gender === turn)));
  const reservedIds = new Set(reservations.map((r) => r.memberId));
  const queue = [...eligibleNow.filter((m) => reservedIds.has(m.id)), ...eligibleNow.filter((m) => !reservedIds.has(m.id))];
  for (const member of queue) {
    const { room, reason } = pickRoom(slots, member.gender, pending, { reservations, limits, memberId: member.id });
    if (!room) {
      skipped.push({ name: member.name, reason: pickFailReason(reason, member.gender) });
      continue;
    }
    room.occupancy += 1;
    room.gender = room.gender || member.gender;
    pending[member.gender] = Math.max(0, pending[member.gender] - 1);
    reservations = reservations.filter((r) => r.memberId !== member.id);
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
  const [rooms, members, limits] = await Promise.all([
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
    loadRoomLimits(client),
  ]);

  const serialized = rooms.map(serializeRoom);
  const eligible = members.filter((m) => m.joinRoom);
  const pending = { MALE: 0, FEMALE: 0 };
  eligible.forEach((m) => {
    if (m.gender && !m.roomId) pending[m.gender] += 1;
  });
  const openRooms = serialized.filter((r) => !r.gender);
  const shortfall = computeShortfall(serialized, pending, limits);

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
    // Gioi han so phong theo loai cho tung gioi - trang cong khai can de biet phong
    // trong nao con mo cho minh (che do tu chon)
    limits,
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
  computeShortfallWith,
  MAX_ROOM_LIMIT,
  parseRoomLimits,
  loadRoomLimits,
  limitFor,
  underLimit,
  parseReservationMap,
  loadReservations,
  MAX_RESERVATIONS,
  roomAccepts,
  placementOk,
  pickRoom,
  pickFailReason,
  assignAllPending,
  serializeRoom,
  findRoomPayload,
  loadRoomsPayload,
};
