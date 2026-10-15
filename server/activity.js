// Nhat ky thao tac luu xuong DB (bang ActivityLog) thay vi mang trong bo nho:
// restart server giua su kien van con lich su, va admin co tab Nhat ky de doi soat.
// Ghi log khong duoc lam hong request chinh nen moi loi deu chi log ra console.

const prisma = require('./prisma');

const MAX_FEED = 30;
const MAX_LOG_ROWS = 500;

// Giu so dong o muc vua phai: sau moi 50 lan ghi thi don bot dong cu.
let writeCount = 0;

async function pruneIfNeeded() {
  writeCount += 1;
  if (writeCount % 50 !== 0) return;

  const total = await prisma.activityLog.count();
  if (total <= MAX_LOG_ROWS) return;

  const cutoff = await prisma.activityLog.findMany({
    orderBy: { id: 'desc' },
    skip: MAX_LOG_ROWS,
    take: 1,
    select: { id: true },
  });
  if (cutoff.length) {
    await prisma.activityLog.deleteMany({ where: { id: { lte: cutoff[0].id } } });
  }
}

// type: 'random' | 'room' | 'quiz' | 'admin'
// io (tuy chon): truyen vao de phat realtime cho trang admin dang mo tab Nhat ky.
async function log({ type, icon, message, actor, meta }, io) {
  try {
    const entry = await prisma.activityLog.create({
      data: {
        type: String(type || 'admin').slice(0, 24),
        icon: icon ? String(icon).slice(0, 32) : null,
        message: String(message || ''),
        actor: actor ? String(actor).slice(0, 160) : null,
        meta: meta === undefined ? undefined : meta,
      },
    });

    if (io) io.emit('activity:new', serialize(entry));
    await pruneIfNeeded();
    return entry;
  } catch (err) {
    console.error('[activity] khong ghi duoc nhat ky:', err.message);
    return null;
  }
}

function serialize(row) {
  return {
    id: row.id,
    type: row.type,
    icon: row.icon,
    message: row.message,
    actor: row.actor,
    meta: row.meta || null,
    at: row.createdAt.toISOString(),
  };
}

async function list({ limit = MAX_FEED, type } = {}) {
  const take = Math.min(Math.max(Number.parseInt(limit, 10) || MAX_FEED, 1), 200);
  const rows = await prisma.activityLog.findMany({
    where: Array.isArray(type) ? { type: { in: type } } : type && type !== 'all' ? { type } : undefined,
    orderBy: { id: 'desc' },
    take,
  });
  return rows.map(serialize);
}

async function clear(type) {
  const { count } = await prisma.activityLog.deleteMany({
    where: type && type !== 'all' ? { type } : undefined,
  });
  return count;
}

module.exports = { log, list, clear, serialize, MAX_FEED };
