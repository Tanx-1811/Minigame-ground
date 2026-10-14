const prisma = require('./prisma');

// Cac cau hinh admin co the sua qua trang admin (bang Setting dang key/value).
// Gia tri luu duoi dang string nen doc ra phai tu parse + co fallback an toan.
const DEFAULTS = {
  leaderCount: 4,
  roomCapacity: 2,
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

async function isRoomsLocked() {
  return (await getSetting('roomsLocked')) === '1';
}

module.exports = {
  DEFAULTS,
  getSetting,
  setSetting,
  getNumberSetting,
  getLeaderCount,
  getRoomCapacity,
  isRoomsLocked,
};
