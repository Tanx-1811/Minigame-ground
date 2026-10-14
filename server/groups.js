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

const { shuffle } = require('./rooms');

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
      _count: { select: { members: true } },
      members: { where: { isLeader: true }, select: { id: true } },
    },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    locked: g.locked,
    capacity: effectiveCapacity(g, globalCapacity),
    occupancy: g._count.members,
    leaders: g.members.length,
  }));
}

function pickGroup(slots, { isLeader = false } = {}) {
  const available = slots.filter((g) => !g.locked && g.occupancy < g.capacity);
  if (!available.length) return null;

  let pool = available;
  if (isLeader) {
    const withoutLeader = available.filter((g) => g.leaders === 0);
    if (withoutLeader.length) pool = withoutLeader;
  }

  const minCount = Math.min(...pool.map((g) => g.occupancy));
  const candidates = pool.filter((g) => g.occupancy === minCount);
  return candidates[Math.floor(Math.random() * candidates.length)];
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
    select: { id: true, name: true, isLeader: true, joinRandom: true },
    orderBy: { id: 'asc' },
  });

  const assigned = [];
  const skipped = candidates
    .filter((m) => !m.joinRandom)
    .map((m) => ({ name: m.name, reason: 'Không tham gia vòng random' }));

  // Nhom truong chia truoc de chac chan moi nguoi mot nhom, phan con lai tron ngau nhien
  const eligible = candidates.filter((m) => m.joinRandom);
  const ordered = [...shuffle(eligible.filter((m) => m.isLeader)), ...shuffle(eligible.filter((m) => !m.isLeader))];

  for (const member of ordered) {
    const group = pickGroup(slots, { isLeader: member.isLeader });
    if (!group) {
      skipped.push({ name: member.name, reason: 'Các nhóm đã đầy hoặc đang khóa' });
      continue;
    }

    group.occupancy += 1;
    if (member.isLeader) group.leaders += 1;
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
  effectiveCapacity,
  loadGroupSlots,
  pickGroup,
  assignAllPendingGroups,
  serializeGroup,
  loadGroupsPayload,
};
