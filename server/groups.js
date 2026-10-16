// Logic dung chung cho vong random chia nhom.
// Dung boi routes/api.js (tung nguoi tu bam random) va routes/admin.js (admin chia hang loat).
//
// Luat chon nhom:
//  - Bo qua nhom dang KHOA va nhom da DAY (theo capacity rieng, neu khong co thi lay
//    capacity chung trong cau hinh; 0/null = khong gioi han).
//  - Trong so nhom con lai, luon uu tien nhom DANG IT NGUOI NHAT de chia deu
//    (chenh lech toi da 1 nguoi), random giua cac nhom bang nhau nen thu tu van ngau nhien.
//  - Rieng Nhom Truong: uu tien nhom chua co nhom truong nao, de khong bao gio
//    2 nhom truong roi vao cung 1 nhom.
//  - Moi nhom DUNG 2 nam (MALES_PER_GROUP): nam chi vao nhom chua du 2 nam (uu tien
//    nhom it nam nhat); nu khong duoc chiem cho con thieu cua nam neu van con nam
//    dang cho random, va duoc chia deu theo so nu. Ai chua co gioi tinh thi khong chia.

const { shuffle } = require('./rooms');

const MALES_PER_GROUP = 2;

function effectiveCapacity(group, globalCapacity) {
  if (Number.isInteger(group.capacity) && group.capacity > 0) return group.capacity;
  if (Number.isInteger(globalCapacity) && globalCapacity > 0) return globalCapacity;
  return Infinity;
}

// Danh sach nhom kem so nguoi hien co, dang gon cho thuat toan chia
async function loadGroupSlots(client, globalCapacity) {
  const groups = await client.group.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      members: { select: { isLeader: true, gender: true } },
    },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    locked: g.locked,
    capacity: effectiveCapacity(g, globalCapacity),
    occupancy: g.members.length,
    leaders: g.members.filter((m) => m.isLeader).length,
    males: g.members.filter((m) => m.gender === 'MALE').length,
  }));
}

// So nam du dieu kien nhung chua co nhom - de giu cho cho ho khi chia nu
function countPendingMales(client) {
  return client.member.count({ where: { joinRandom: true, groupId: null, gender: 'MALE' } });
}

// So cho nhom con co the nhan them nam (thieu bao nhieu nam, gioi han boi cho trong)
function maleRoom(group) {
  if (group.locked) return 0;
  return Math.min(Math.max(0, MALES_PER_GROUP - group.males), group.capacity - group.occupancy);
}

function keepMin(list, key) {
  const min = Math.min(...list.map(key));
  return list.filter((g) => key(g) === min);
}

// Tra ve null neu khong con nhom hop le (groupFullReason() cho biet vi sao).
function pickGroup(slots, { isLeader = false, gender = null, pendingMales = 0 } = {}) {
  const isMale = gender === 'MALE';
  let available = slots.filter((g) => !g.locked && g.occupancy < g.capacity);

  if (isMale) {
    available = available.filter((g) => g.males < MALES_PER_GROUP);
  } else {
    // Nu chi duoc lay cho cua nam khi tong cho con lai cho nam van du cho so nam dang cho
    const spareMaleRoom = slots.reduce((sum, g) => sum + maleRoom(g), 0) - pendingMales;
    available = available.filter((g) => g.capacity - g.occupancy > maleRoom(g) || spareMaleRoom > 0);
  }
  if (!available.length) return null;

  let pool = available;
  if (isLeader) {
    const withoutLeader = available.filter((g) => g.leaders === 0);
    if (withoutLeader.length) pool = withoutLeader;
  }

  // Nam rai deu theo so nam, nu chia deu theo so nu -> cuoi cung nhom nao cung 2 nam
  // va so nu chenh lech toi da 1
  pool = isMale ? keepMin(pool, (g) => g.males) : keepMin(pool, (g) => g.occupancy - g.males);
  const candidates = keepMin(pool, (g) => g.occupancy);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function groupFullReason(slots, gender) {
  const hasFreeSlot = slots.some((g) => !g.locked && g.occupancy < g.capacity);
  if (gender === 'MALE' && hasFreeSlot) return `Các nhóm đều đã đủ ${MALES_PER_GROUP} nam`;
  return 'Các nhóm đã đầy hoặc đang khóa';
}

// Chia nhom hang loat cho moi nguoi du dieu kien ma chua co nhom (admin bam 1 nut).
// Tron thu tu truoc khi chia nen ket qua van ngau nhien.
// options.includeAssigned = true -> chia lai tu dau cho ca nhung nguoi DA co nhom
// (tru nhung nguoi duoc ghim pinnedGroup).
async function assignAllPendingGroups(tx, globalCapacity, options = {}) {
  const { includeAssigned = false } = options;

  if (includeAssigned) {
    await tx.member.updateMany({
      where: { joinRandom: true, pinnedGroup: false, groupId: { not: null } },
      data: { groupId: null },
    });
  }

  const slots = await loadGroupSlots(tx, globalCapacity);
  if (!slots.length) throw new Error('NO_GROUPS');

  const candidates = await tx.member.findMany({
    where: { groupId: null },
    select: { id: true, name: true, isLeader: true, joinRandom: true, gender: true },
    orderBy: { id: 'asc' },
  });

  const assigned = [];
  const skipped = [
    ...candidates
      .filter((m) => !m.joinRandom)
      .map((m) => ({ name: m.name, reason: 'Không tham gia vòng random' })),
    ...candidates
      .filter((m) => m.joinRandom && !m.gender)
      .map((m) => ({ name: m.name, reason: 'Chưa có giới tính (Nam/Nữ)' })),
  ];

  // Nhom truong chia truoc de chac chan moi nguoi mot nhom, roi den nam (lap du 2 nam/nhom),
  // cuoi cung la nu; trong tung lop tron ngau nhien
  const eligible = candidates.filter((m) => m.joinRandom && m.gender);
  const regular = eligible.filter((m) => !m.isLeader);
  const ordered = [
    ...shuffle(eligible.filter((m) => m.isLeader)),
    ...shuffle(regular.filter((m) => m.gender === 'MALE')),
    ...shuffle(regular.filter((m) => m.gender !== 'MALE')),
  ];
  let pendingMales = eligible.filter((m) => m.gender === 'MALE').length;

  for (const member of ordered) {
    const isMale = member.gender === 'MALE';
    if (isMale) pendingMales -= 1;

    const group = pickGroup(slots, { isLeader: member.isLeader, gender: member.gender, pendingMales });
    if (!group) {
      skipped.push({ name: member.name, reason: groupFullReason(slots, member.gender) });
      continue;
    }

    group.occupancy += 1;
    if (member.isLeader) group.leaders += 1;
    if (isMale) group.males += 1;
    await tx.member.update({ where: { id: member.id }, data: { groupId: group.id } });
    assigned.push({ name: member.name, groupName: group.name, groupId: group.id });
  }

  return { assigned, skipped };
}

function serializeGroup(group, globalCapacity) {
  const members = (group.members || []).map((m) => ({
    id: m.id,
    name: m.name,
    gender: m.gender,
    isLeader: m.isLeader,
    pinnedGroup: m.pinnedGroup,
  }));
  const capacity = effectiveCapacity(group, globalCapacity);

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    capacity: group.capacity,
    effectiveCapacity: capacity === Infinity ? null : capacity,
    locked: group.locked,
    sortOrder: group.sortOrder,
    members,
    occupancy: members.length,
    freeSlots: capacity === Infinity ? null : Math.max(0, capacity - members.length),
    isFull: members.length >= capacity,
  };
}

async function loadGroupsPayload(client, globalCapacity) {
  const [groups, members] = await Promise.all([
    client.group.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        members: {
          orderBy: [{ isLeader: 'desc' }, { name: 'asc' }],
          select: { id: true, name: true, gender: true, isLeader: true, pinnedGroup: true },
        },
      },
    }),
    client.member.findMany({ select: { id: true, groupId: true, joinRandom: true } }),
  ]);

  const serialized = groups.map((g) => serializeGroup(g, globalCapacity));
  const eligible = members.filter((m) => m.joinRandom);

  return {
    groups: serialized,
    stats: {
      totalMembers: members.length,
      eligible: eligible.length,
      excluded: members.length - eligible.length,
      assigned: eligible.filter((m) => m.groupId).length,
      pending: eligible.filter((m) => !m.groupId).length,
      totalGroups: serialized.length,
      lockedGroups: serialized.filter((g) => g.locked).length,
    },
  };
}

module.exports = {
  MALES_PER_GROUP,
  effectiveCapacity,
  loadGroupSlots,
  countPendingMales,
  pickGroup,
  groupFullReason,
  assignAllPendingGroups,
  serializeGroup,
  loadGroupsPayload,
};
