const prisma = require('./prisma');

// Danh sach nguoi da "vao phong cho" quiz, luu tam trong RAM (khong can ben vung qua
// server restart - giong pattern recentActivity trong routes/api.js). Dung Map de
// giu thu tu tham gia va loai trung ten de dang.
const lobbyMembers = new Map();

// Thoi diem may chu gui cau hoi cho tung nguoi lan dau ("memberId:questionId" -> ms).
// Dung de do thoi gian tra loi o phia may chu: F5 giua chung lam dong ho phia trinh
// duyet chay lai tu 0, nhung moc nay thi khong doi - nen khong "an gian" thoi gian
// duoc, va gioi han thoi gian tung cau van tinh dung.
const seenAt = new Map();

function getLobbyMembers() {
  return Array.from(lobbyMembers.keys());
}

function addLobbyMember(name) {
  if (!lobbyMembers.has(name)) lobbyMembers.set(name, Date.now());
}

// Tra ve true neu ten do dang co trong phong cho (de biet co can bao cho moi nguoi)
function removeLobbyMember(name) {
  return lobbyMembers.delete(name);
}

function clearLobby() {
  lobbyMembers.clear();
  seenAt.clear();
}

// Ghi nhan lan dau thay cau hoi, tra ve so ms da troi qua ke tu lan dau do
function markSeen(memberId, questionId) {
  const key = `${memberId}:${questionId}`;
  if (!seenAt.has(key)) seenAt.set(key, Date.now());
  return Date.now() - seenAt.get(key);
}

// null = may chu chua tung gui cau nay cho nguoi do (vd server vua khoi dong lai)
function elapsedSince(memberId, questionId) {
  const at = seenAt.get(`${memberId}:${questionId}`);
  return at ? Date.now() - at : null;
}

async function getQuizStatus() {
  const row = await prisma.setting.findUnique({ where: { key: 'quizStatus' } });
  if (row) return row.value === 'active' ? 'active' : 'waiting';

  // Chua tung set quizStatus (vd nang cap tu ban cu chua co phong cho): neu da co
  // cau tra loi trong DB tuc la quiz da tung chay, coi nhu active de khong ep
  // nguoi da lam do quay lai phong cho.
  const answered = await prisma.answer.count();
  return answered > 0 ? 'active' : 'waiting';
}

async function setQuizStatus(value) {
  await prisma.setting.upsert({
    where: { key: 'quizStatus' },
    update: { value },
    create: { key: 'quizStatus', value },
  });
}

// Tinh lai diem + tong thoi gian cua moi nguoi tu bang Answer.
// Can goi sau khi xoa cau hoi hoac doi diem mot cau: truoc day diem cong don
// (increment) khong bao gio bi tru lai, nen xoa cau hoi xong bang xep hang van
// tinh diem cua cau da xoa.
async function recomputeScores(client = prisma) {
  const answers = await client.answer.findMany({
    select: { memberId: true, correct: true, timeMs: true, question: { select: { points: true } } },
  });

  const totals = new Map();
  answers.forEach((a) => {
    const t = totals.get(a.memberId) || { score: 0, time: 0 };
    if (a.correct) t.score += a.question.points;
    t.time += a.timeMs;
    totals.set(a.memberId, t);
  });

  await client.member.updateMany({
    where: { id: { notIn: Array.from(totals.keys()) } },
    data: { quizScore: 0, quizTimeMs: 0 },
  });
  for (const [memberId, t] of totals) {
    await client.member.update({ where: { id: memberId }, data: { quizScore: t.score, quizTimeMs: t.time } });
  }
}

module.exports = {
  getLobbyMembers,
  addLobbyMember,
  removeLobbyMember,
  clearLobby,
  markSeen,
  elapsedSince,
  getQuizStatus,
  setQuizStatus,
  recomputeScores,
};
