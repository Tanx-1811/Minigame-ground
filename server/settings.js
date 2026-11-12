const prisma = require('./prisma');

// Cac cau hinh admin co the sua qua trang admin (bang Setting dang key/value).
// Gia tri luu duoi dang string nen doc ra phai tu parse + co fallback an toan.
const DEFAULTS = {
  leaderCount: 4,
  roomCapacity: 2,
  groupCapacity: 0, // 0 = khong gioi han, chia deu nhu cu
};

// Noi dung hien thi tren 2 trang cong khai - admin sua duoc het, khong can sua code.
// Key -> { label, fallback, multiline }
const TEXT_SETTINGS = {
  brandBadge: {
    label: 'Dòng chữ nhỏ trên trang chủ',
    fallback: 'Mãi mãi là anh em nha mọi người cho dù vào nhóm nào thì mọi người cũng nhẹ tay với nhau',
  },
  brandTitle: { label: 'Tiêu đề trang chủ', fallback: 'Bốc Thăm Chia Nhóm' },
  brandSubtitle: {
    label: 'Mô tả trang chủ',
    fallback: 'Chọn tên của bạn, nhấn nút và khám phá bạn thuộc đội nào!',
  },
  startButtonText: { label: 'Chữ trên nút bắt đầu', fallback: 'Bắt đầu bốc thăm' },
  roomsBadge: { label: 'Dòng chữ nhỏ trên trang ghép phòng', fallback: 'Nam ở với nam · Nữ ở với nữ' },
  roomsTitle: { label: 'Tiêu đề trang ghép phòng', fallback: 'Ghép Phòng Ngủ' },
  roomsSubtitle: {
    label: 'Mô tả trang ghép phòng',
    fallback:
      'Chọn tên của bạn và quay một lần duy nhất — hệ thống tự xếp bạn vào phòng đúng giới tính và còn chỗ trống.',
  },
  quizTitle: { label: 'Tiêu đề vòng Quiz', fallback: 'Ai sẽ là Nhóm Trưởng?' },
  quizSubtitle: {
    label: 'Mô tả vòng Quiz',
    fallback:
      'Trả lời đúng & nhanh nhất để có cơ hội trở thành Nhóm Trưởng. Chốt xong Nhóm Trưởng thì vòng Random mới mở!',
  },
  footerText: { label: 'Dòng chân trang', fallback: 'Một ngày là anh em suốt đời anh em' },
  accentColor: { label: 'Màu chủ đạo', fallback: '#4f46e5' },
};

// Khoa vong (roomsLocked / randomLocked) KHONG nam o day: chung co endpoint rieng
// (/admin/rooms/lock, /admin/settings/lock) phat dung su kien realtime. De chung
// chung form "Giao dien" thi mot tab admin cu bam luu chu se am tham mo khoa vong.
const BOOL_SETTINGS = {
  showLeaderboard: { label: 'Hiện bảng xếp hạng nhóm', fallback: true },
  showActivity: { label: 'Hiện hoạt động gần đây', fallback: true },
  showMemberNames: { label: 'Hiện tên thành viên trong thẻ nhóm', fallback: true },
  showRoomsPage: { label: 'Mở trang ghép phòng cho mọi người', fallback: true },
  confettiEnabled: { label: 'Bật hiệu ứng pháo giấy', fallback: true },
  soundEnabled: { label: 'Bật âm thanh mặc định', fallback: true },
};

// Che do su kien: 'full' = Quiz -> Boc tham -> Ghep phong (nhu cu),
// 'rooms' = CHI ghep phong: trang chu tu chuyen sang trang ghep phong, cac API
// quiz / boc tham nhom bi chan. Khong nam trong form "Giao dien" (giong khoa vong)
// de 1 tab admin cu bam luu khong am tham doi che do.
const EVENT_MODES = {
  full: 'Đầy đủ: Quiz → Bốc thăm → Ghép phòng',
  rooms: 'Chỉ ghép phòng',
};

// Cach moi nguoi nhan phong: 'random' = bam quay, he thong xep ngau nhien;
// 'choose' = tu chon 1 phong con cho (van chi phong dung gioi tinh).
const ROOM_PICK_MODES = {
  random: 'Quay ngẫu nhiên',
  choose: 'Tự chọn phòng',
};

function parseEventMode(raw) {
  return Object.prototype.hasOwnProperty.call(EVENT_MODES, raw) ? raw : 'full';
}

function parseRoomPickMode(raw) {
  return Object.prototype.hasOwnProperty.call(ROOM_PICK_MODES, raw) ? raw : 'random';
}

// Doc che do cho moi lan tai trang chu (chuyen huong) va moi luot goi API quiz /
// boc tham -> nho tam 2 giay. setSetting xoa bo nho ngay nen admin doi la co hieu luc.
let modeCache = { value: null, at: 0 };

async function getEventMode() {
  if (modeCache.value && Date.now() - modeCache.at < 2000) return modeCache.value;
  const row = await prisma.setting.findUnique({ where: { key: 'eventMode' } });
  modeCache = { value: parseEventMode(row ? row.value : null), at: Date.now() };
  return modeCache.value;
}

async function isRoomsOnly() {
  return (await getEventMode()) === 'rooms';
}

async function getSetting(key) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : null;
}

async function setSetting(key, value) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  if (key === 'eventMode') modeCache = { value: null, at: 0 };
}

// Phuc hoi tu file sao luu ghi thang vao bang Setting -> goi ham nay de bo nho tam khong giu gia tri cu
function invalidateSettingCache() {
  modeCache = { value: null, at: 0 };
}

// Doc nhieu key 1 lan (1 query thay vi N query) - dung cho /api/config va tab cau hinh.
async function getSettingMap(keys) {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map = {};
  rows.forEach((row) => {
    map[row.key] = row.value;
  });
  return map;
}

async function getNumberSetting(key, fallback) {
  const raw = await getSetting(key);
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getLeaderCount() {
  return getNumberSetting('leaderCount', DEFAULTS.leaderCount);
}

function getRoomCapacity() {
  return getNumberSetting('roomCapacity', DEFAULTS.roomCapacity);
}

// 0 / khong dat = khong gioi han so nguoi moi nhom
async function getGroupCapacity() {
  const raw = await getSetting('groupCapacity');
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function parseBool(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  return raw === '1' || raw === 'true';
}

async function isRoomsLocked() {
  return parseBool(await getSetting('roomsLocked'), false);
}

// Luot nhan phong: 'ALL' = ca nam lan nu, 'FEMALE' / 'MALE' = chi gioi do duoc
// nhan phong luc nay (vd cho nu chon truoc roi moi mo cho nam). Nam cung cho voi
// roomsLocked: thay doi phat qua rooms:config, khong nam trong form "Giao dien".
async function getRoomTurn() {
  const raw = String((await getSetting('roomTurn')) || '').toUpperCase();
  return ['FEMALE', 'MALE'].includes(raw) ? raw : 'ALL';
}

async function isRandomLocked() {
  return parseBool(await getSetting('randomLocked'), false);
}

// Toan bo noi dung + cong tac hien thi cho 2 trang cong khai, da ap fallback.
async function getPublicUi() {
  const keys = [...Object.keys(TEXT_SETTINGS), ...Object.keys(BOOL_SETTINGS), 'eventMode', 'roomPickMode'];
  const map = await getSettingMap(keys);

  const text = {};
  Object.entries(TEXT_SETTINGS).forEach(([key, def]) => {
    const value = map[key];
    text[key] = value !== null && value !== undefined && value !== '' ? value : def.fallback;
  });

  const flags = {};
  Object.entries(BOOL_SETTINGS).forEach(([key, def]) => {
    flags[key] = parseBool(map[key], def.fallback);
  });

  // Che do di kem ui: moi trang cong khai nhan qua /api/config va settings:updated,
  // nen admin doi che do la trang chu tu chuyen sang trang ghep phong ngay.
  return {
    ...text,
    ...flags,
    eventMode: parseEventMode(map.eventMode),
    roomPickMode: parseRoomPickMode(map.roomPickMode),
  };
}

module.exports = {
  DEFAULTS,
  TEXT_SETTINGS,
  BOOL_SETTINGS,
  EVENT_MODES,
  ROOM_PICK_MODES,
  parseEventMode,
  parseRoomPickMode,
  getEventMode,
  isRoomsOnly,
  invalidateSettingCache,
  getSetting,
  setSetting,
  getSettingMap,
  getNumberSetting,
  getLeaderCount,
  getRoomCapacity,
  getGroupCapacity,
  parseBool,
  isRoomsLocked,
  getRoomTurn,
  isRandomLocked,
  getPublicUi,
};
