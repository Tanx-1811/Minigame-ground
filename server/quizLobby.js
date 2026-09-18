const prisma = require('./prisma');

// Danh sach nguoi da "vao phong cho" quiz, luu tam trong RAM (khong can ben vung qua
// server restart - giong pattern recentActivity trong routes/api.js). Dung Map de
// giu thu tu tham gia va loai trung ten de dang.
const lobbyMembers = new Map();

function getLobbyMembers() {
  return Array.from(lobbyMembers.keys());
}

function addLobbyMember(name) {
  if (!lobbyMembers.has(name)) lobbyMembers.set(name, Date.now());
}

function clearLobby() {
  lobbyMembers.clear();
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

module.exports = {
  getLobbyMembers,
  addLobbyMember,
  clearLobby,
  getQuizStatus,
  setQuizStatus,
};
