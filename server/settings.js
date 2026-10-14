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
  accentColor: { label: 'Màu chủ đạo', fallback: '#2563eb' },
};

const BOOL_SETTINGS = {
  roomsLocked: { label: 'Khóa vòng ghép phòng', fallback: false },
  randomLocked: { label: 'Khóa vòng random chia nhóm', fallback: false },
  showLeaderboard: { label: 'Hiện bảng xếp hạng nhóm', fallback: true },
  showActivity: { label: 'Hiện hoạt động gần đây', fallback: true },
  showMemberNames: { label: 'Hiện tên thành viên trong thẻ nhóm', fallback: true },
  showRoomsPage: { label: 'Mở trang ghép phòng cho mọi người', fallback: true },
  confettiEnabled: { label: 'Bật hiệu ứng pháo giấy', fallback: true },
  soundEnabled: { label: 'Bật âm thanh mặc định', fallback: true },
};

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

async function isRandomLocked() {
  return parseBool(await getSetting('randomLocked'), false);
}

// Toan bo noi dung + cong tac hien thi cho 2 trang cong khai, da ap fallback.
async function getPublicUi() {
  const keys = [...Object.keys(TEXT_SETTINGS), ...Object.keys(BOOL_SETTINGS)];
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

  return { ...text, ...flags };
}

module.exports = {
  DEFAULTS,
  TEXT_SETTINGS,
  BOOL_SETTINGS,
  getSetting,
  setSetting,
  getSettingMap,
  getNumberSetting,
  getLeaderCount,
  getRoomCapacity,
  getGroupCapacity,
  parseBool,
  isRoomsLocked,
  isRandomLocked,
  getPublicUi,
};
