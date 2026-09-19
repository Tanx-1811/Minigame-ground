const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const groups = [
  {
    name: 'Nhóm Gà - Gà ít, chiến nhiều',
    description: 'Chơi thì 9, quoặy là 10',
  },
  {
    name: 'Nhóm Zô – Zô là chiến',
    description: 'Không tranh cãi, số 1 là số 1',
  },
  {
    name: 'Nhóm Yếu - Yếu ít, liều nhiều',
    description: 'Không cần hài, giải là chủ yếu',
  },
  {
    name: 'Nhóm Tới - Tới đâu quậy đó',
    description: 'Mầm non nhưng gánh cả team',
  },
];

const memberNames = [
  'Ngô Thị Tính',
  'Chế Thị Huỳnh Như',
  'Nguyễn Thị Lệ My',
  'Phạm Nguyễn Bảo Uyên',
  'Bùi Huỳnh Bích Trâm',
  'Lê Phạm Như Thùy',
  'Võ Nguyễn Phương Nghĩa',
  'Phạm Thuỳ Dương',
  'Lệ Thị Thu Trà',
  'Lê Thị Kiều Nga',
  'Nguyễn Minh Cường',
  'Nguyễn Anh Đôn',
  'Trương Ngọc Tấn',
  'Trần Đăng Khoa',
  'Bùi Xuân Đạt',
  'Huỳnh Quang Thắng',
  'Nguyễn Hữu Khánh',
];

// Chi co dap an dung duoc cung cap, 3 phuong an nhieu con lai la tu soan them
// de hop thanh trac nghiem 4 lua chon - sua truc tiep o day neu muon doi cau tra loi sai.
const questions = [
  {
    order: 1,
    text: 'Giá trị cốt lõi của DIMACO là gì?',
    options: [
      'Đức hạnh, Đoàn kết, Đồng hành, Đột phá',
      'Đam mê, Đoàn kết, Đồng hành, Đột phá',
      'Đức hạnh, Kỷ luật, Đồng hành, Sáng tạo',
      'Chuyên nghiệp, Đoàn kết, Tận tâm, Đột phá',
    ],
    correctIndex: 0,
  },
  {
    order: 2,
    text: 'Chú gấu bông của công ty chúng ta là con vật gì?',
    options: ['Con gấu', 'Con vẹt', 'Con cú', 'Con thỏ'],
    correctIndex: 1,
  },
  {
    order: 3,
    text: 'Dự án lớn nhất của DIMACO là dự án nào?',
    options: ['Riokupon', 'Riohub', 'RioMCN', 'RioSeller'],
    correctIndex: 0,
  },
  {
    order: 4,
    text: 'Dự án Riokupon chuẩn bị được mấy tuổi?',
    options: ['2 tuổi', '3 tuổi', '4 tuổi', '5 tuổi'],
    correctIndex: 2,
  },
  {
    order: 5,
    text: 'Sinh nhật của sếp Nguyễn Minh Cường là ngày tháng năm nào?',
    options: ['20/11/1989', '20/10/1989', '11/09/1989', '20/11/1990'],
    correctIndex: 0,
  },
  {
    order: 6,
    text: 'Nhóm đẹp trai nhất công ty Dimaco là nhóm tên gì?',
    options: ['Hoa hậu', 'Nam thần', 'Idol quốc dân', 'Thánh lầy'],
    correctIndex: 1,
  },
];

async function main() {
  console.log('Seeding groups...');
  for (const group of groups) {
    await prisma.group.upsert({
      where: { name: group.name },
      update: { description: group.description },
      create: group,
    });
  }

  console.log('Clearing old members...');
  // Answer co FK toi Member, phai xoa truoc thi moi deleteMany Member duoc
  await prisma.answer.deleteMany({});
  await prisma.member.deleteMany({});

  console.log('Seeding members...');
  for (const name of memberNames) {
    await prisma.member.create({ data: { name } });
  }

  console.log('Seeding quiz questions...');
  for (const q of questions) {
    await prisma.question.upsert({
      where: { order: q.order },
      update: { text: q.text, options: q.options, correctIndex: q.correctIndex },
      create: q,
    });
  }

  console.log('Seed completed.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
