# Random Chia Nhóm

Website random chia nhóm cho nhiều người dùng, realtime bằng Socket.IO, dữ liệu lưu MySQL qua Prisma ORM.

## Công nghệ

- Node.js + Express
- Socket.IO (realtime)
- MySQL 8 (chạy qua Docker Compose)
- Prisma ORM
- HTML / CSS / Vanilla JS (không dùng React/Vue/Angular/NextJS)

## Danh sách nhóm

1. Nhóm Gà - Gà ít, chiến nhiều
2. Nhóm Zô – Zô là chiến
3. Nhóm Yếu - Yếu ít, liều nhiều
4. Nhóm Tới - Tới đâu quậy đó

## Cấu trúc thư mục

```
minigamegroup/
├─ docker-compose.yml
├─ package.json
├─ .env
├─ README.md
├─ server/
│  ├─ index.js          # Express + Socket.IO app
│  ├─ prisma.js         # Prisma client singleton
│  ├─ settings.js       # doc/ghi bang Setting (leaderCount, roomCapacity, roomsLocked...)
│  ├─ adminAuth.js      # middleware kiem tra ADMIN_RESET_SECRET
│  ├─ rooms.js          # logic ghep phong ngu theo gioi tinh
│  ├─ quizLobby.js      # phong cho quiz
│  └─ routes/
│     ├─ api.js         # /api/config, /api/groups, /api/members, /api/random, /api/admin/reset
│     ├─ quiz.js        # vong quiz chon Nhom Truong
│     ├─ rooms.js       # /api/rooms, /api/room/random, /api/admin/rooms/*
│     └─ admin.js       # CRUD thanh vien / nhom / cau hoi + cau hinh chung
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.js
└─ public/
   ├─ index.html        # trang random chia nhom
   ├─ rooms.html        # trang ghep phong ngu
   ├─ admin-reset.html  # bang dieu khien admin (nhieu tab)
   ├─ css/              # style.css, quiz.css, rooms.css, admin.css
   └─ js/               # main.js, quiz.js, rooms.js, admin-*.js
```

## Database

**Group**: id, name, description, createdAt
**Member**: id, name, gender (nullable, `MALE`/`FEMALE`), groupId (nullable, FK -> Group), roomId (nullable, FK -> Room), createdAt, isLeader, quizScore, quizTimeMs
**Room**: id, name (unique), gender (`MALE`/`FEMALE`), capacity (mặc định 2), note, createdAt — phòng ngủ, mỗi phòng chỉ dành cho một giới tính
**Setting**: key, value — lưu cấu hình chỉnh qua trang admin (`eventStartAt`, `phase`, `quizStatus`, `leaderCount`, `roomCapacity`, `roomsLocked`)
**Question** / **Answer**: bộ câu hỏi quiz chọn Nhóm Trưởng và câu trả lời của từng người

Seed tạo sẵn 4 nhóm và 16 member mẫu (chưa gán nhóm, chưa đặt giới tính — giới tính do admin đặt trong trang admin).

## Giao diện & tính năng

- **Màn hình intro trước khi vào bốc thăm**: hero đầy hiệu ứng (particle bay, tiêu đề nhấp nháy), có nút "Bắt đầu bốc thăm". Nếu admin đặt giờ mở (xem mục Trang admin), màn intro hiện đếm ngược tới giờ mở, hết giờ mới cho bấm bắt đầu (kèm confetti); ai đang mở trang sẵn cũng thấy cập nhật ngay qua Socket.IO khi admin đổi giờ. Người đã random trước đó (lưu trong `localStorage`) sẽ bỏ qua màn intro và vào thẳng kết quả.
- **Hiệu ứng random kiểu slot machine**: 3 cột quay dọc, dừng lệch nhau, cùng dừng ở icon nhóm trúng.
- **Tiện ích trước khi quay**: xem trước 4 nhóm, bộ đếm số người chưa random, modal "Cách chơi".
- **Bảng xếp hạng nhóm (leaderboard)**: xếp hạng 4 nhóm theo số thành viên, cập nhật realtime.
- **Hoạt động gần đây (activity feed)**: danh sách ai vừa random vào nhóm nào, kèm giờ, cập nhật realtime qua Socket.IO; lưu tạm trong bộ nhớ server (tối đa 20 mục gần nhất, mất khi restart server).
- **Tải ảnh kết quả**: sau khi random xong, có nút tải về ảnh PNG kết quả (tên + nhóm) để chia sẻ.

## Ghép phòng ngủ (nam/nữ riêng biệt)

Tính năng độc lập với vòng random chia nhóm, có trang riêng `/rooms.html` (có link từ trang chủ).

- **Mỗi phòng chỉ thuộc một giới tính**: nam ở với nam, nữ ở với nữ. Hệ thống không bao giờ xếp người vào phòng khác giới — kể cả khi admin xếp tay (API sẽ từ chối).
- **Sức chứa tùy chỉnh**: admin đặt số người mỗi phòng (2 = ghép cặp đôi, tối đa 50).
- **Thuật toán ghép** (`server/rooms.js`): chỉ chọn trong các phòng đúng giới tính và còn chỗ, **ưu tiên phòng đang có người nhưng chưa đầy** để lấp kín từng phòng (không để mỗi phòng lẻ loi 1 người), và random giữa các phòng cùng mức lấp đầy — nên ai ở với ai vẫn hoàn toàn ngẫu nhiên.
- **Hai cách ghép**:
  - Mỗi người tự vào `/rooms.html`, chọn tên và bấm "Quay ghép phòng" (có hiệu ứng quay, idempotent — quay lại/F5 vẫn ra đúng phòng cũ).
  - Admin bấm **"Ghép phòng cho tất cả"** để hệ thống tự chia một lượt cho mọi người chưa có phòng (trộn thứ tự trước khi chia).
- **Realtime**: ai vừa được ghép phòng, admin sửa/xóa phòng, reset ghép phòng... tất cả client đang mở trang đều thấy ngay qua Socket.IO.
- **Điều kiện**: thành viên phải được admin đặt giới tính trước; nếu chưa có phòng trống cho giới tính đó, hệ thống báo rõ để admin tạo thêm phòng.

## Trang admin

`/admin-reset.html` — bảng điều khiển dạng dashboard (thanh trên cố định + sidebar 3 nhóm chức năng), cần `ADMIN_RESET_SECRET` trong `.env` (nhập 1 lần, dùng cho mọi thao tác).

**Chế độ chỉ xem**: chưa nhập mã bí mật thì mọi danh sách (thành viên, nhóm, phòng, câu hỏi, phòng chờ, bảng điểm) vẫn hiện đầy đủ từ API công khai — chỉ các ô sửa và nút thao tác bị khóa, kèm dòng nhắc. Nhập mã xong là mở khóa ngay, không cần tải lại trang.

- **🛏️ Phòng ngủ**: tạo phòng tự động theo số người mỗi giới; thêm/sửa/xóa từng phòng (tên, giới tính, sức chứa, ghi chú); ghép phòng cho tất cả; khóa/mở vòng tự ghép; reset ghép phòng; **danh sách người chưa có phòng** kèm ô xếp tay vào phòng cụ thể; lọc/tìm phòng theo tên, người ở, còn chỗ/đã kín/đang trống; làm trống một phòng; xóa hết phòng đang trống; xuất CSV sơ đồ phòng.
- **👥 Thành viên**: danh sách đầy đủ kèm số thứ tự và thống kê; thêm từng người hoặc **dán danh sách nhiều người** (`Tên` hoặc `Tên, Nam` / `Tên, Nữ`, bỏ qua tên trùng); sửa tên, **đặt giới tính Nam/Nữ**, xếp nhóm, xếp phòng, bật/tắt cờ Nhóm Trưởng, xóa; tìm kiếm, lọc nhanh (nữ/nam/chưa đặt giới tính/chưa có phòng/chưa có nhóm/nhóm trưởng), sắp xếp theo từng cột; **chọn nhiều người để sửa hàng loạt** (đặt giới tính, xếp nhóm, bỏ phòng, xóa); xuất CSV.
- **🏷️ Nhóm**: thêm/sửa/xóa nhóm (tên + slogan); xem chip thành viên từng nhóm và gỡ từng người khỏi nhóm bằng nút ✕; chọn nhiều nhóm để xóa cùng lúc; sắp xếp theo tên/số người; xuất CSV. Xóa nhóm chỉ bỏ random của thành viên, không xóa người.
- **⏰ Sự kiện**: đặt/xóa giờ mở bốc thăm (đếm ngược ở trang chủ).
- **🧠 Quiz**: xem phòng chờ realtime, bắt đầu làm bài, xem bảng xếp hạng, chốt Nhóm Trưởng, reset vòng chọn Nhóm Trưởng.
- **❓ Câu hỏi**: thêm/sửa/xóa câu hỏi (2–6 phương án, chọn đáp án đúng); **đổi thứ tự bằng nút ↑ ↓** hoặc nhập trực tiếp số thứ tự; nhân bản câu hỏi; tìm kiếm; chọn nhiều câu để xóa cùng lúc; xuất CSV (đáp án đúng chỉ hiện khi đã nhập mã bí mật).
- **⚙️ Hệ thống**: số Nhóm Trưởng chốt từ quiz (không còn cố định 4), sức chứa phòng mặc định, chuyển giai đoạn quiz/random, và reset toàn bộ (có tùy chọn xóa luôn kết quả ghép phòng).

## API

| Method | Endpoint               | Mô tả                                                                 |
|--------|------------------------|------------------------------------------------------------------------|
| GET    | `/api/config`          | Trả về cấu hình cho màn intro, hiện tại gồm `eventStartAt` (đọc từ bảng `Setting`, `null` nếu chưa đặt). |
| POST   | `/api/admin/event-time`| Body `{ "secret": "...", "eventStartAt": "2026-09-20T09:00:00.000Z" }` (hoặc `eventStartAt: null` để mở ngay). Cần đúng `ADMIN_RESET_SECRET`, lưu vào DB và emit socket `config:updated`. |
| GET    | `/api/activity`        | Trả về danh sách hoạt động random gần đây (tối đa 20 mục, lưu tạm trong bộ nhớ server). |
| GET    | `/api/groups`          | Trả về 4 nhóm kèm danh sách thành viên trong từng nhóm                 |
| GET    | `/api/members`         | Trả về toàn bộ thành viên (dùng cho dropdown chọn tên)                 |
| POST   | `/api/random`          | Body `{ "name": "An" }`. Nếu đã random rồi thì trả về nhóm cũ (không random lại). Nếu chưa, random 1 nhóm trong 4 nhóm, lưu DB, emit socket `member:randomized` cho tất cả client, và trả kết quả. |
| POST   | `/api/admin/reset`     | Body `{ "secret": "...", "includeRooms": false }`. Xóa `groupId` + tiến độ quiz của mọi thành viên, emit socket `groups:reset`. `includeRooms: true` thì xóa luôn `roomId`. |

### API phòng ngủ

| Method | Endpoint                         | Mô tả                                                                 |
|--------|----------------------------------|------------------------------------------------------------------------|
| GET    | `/api/rooms`                     | Danh sách phòng kèm người ở trong, thống kê theo giới tính, trạng thái khóa, sức chứa mặc định. |
| POST   | `/api/room/random`               | Body `{ "name": "An" }`. Random 1 phòng đúng giới tính và còn chỗ; đã có phòng thì trả về phòng cũ. Emit `member:room-randomized`. |
| POST   | `/api/admin/rooms`               | Tạo phòng: `{ secret, name, gender, capacity, note }`.                 |
| PUT    | `/api/admin/rooms/:id`           | Sửa phòng (chặn hạ sức chứa dưới số người đang ở, chặn đổi giới tính khi còn người khác giới). |
| DELETE | `/api/admin/rooms/:id`           | Xóa phòng, người đang ở trở về trạng thái chưa có phòng.               |
| POST   | `/api/admin/rooms/auto-create`   | `{ secret, capacity, prefix }` — tạo đủ số phòng còn thiếu cho cả 2 giới. |
| POST   | `/api/admin/rooms/random-all`    | Ghép phòng một lượt cho tất cả người chưa có phòng, trả về danh sách đã ghép và những ai chưa ghép được kèm lý do. |
| POST   | `/api/admin/rooms/reset`         | Bỏ toàn bộ kết quả ghép phòng (vẫn giữ danh sách phòng), emit `rooms:reset`. |
| POST   | `/api/admin/rooms/lock`          | `{ secret, locked: true/false }` — khóa/mở vòng tự ghép phòng.         |
| POST   | `/api/admin/rooms/bulk`          | `{ secret, ids: [...], action: "delete" \| "clear" }` — xóa nhiều phòng, hoặc đưa hết người ra khỏi các phòng đã chọn. |

### API quản trị khác

| Method | Endpoint                      | Mô tả                                                                    |
|--------|-------------------------------|--------------------------------------------------------------------------|
| GET    | `/api/admin/members`          | Danh sách thành viên đầy đủ (nhóm, phòng, giới tính, điểm quiz).         |
| POST   | `/api/admin/members`          | Thêm thành viên `{ secret, name, gender, groupId }`.                      |
| PUT    | `/api/admin/members/:id`      | Sửa `{ name, gender, groupId, roomId, isLeader }` — kiểm tra giới tính và sức chứa phòng trước khi xếp. |
| DELETE | `/api/admin/members/:id`      | Xóa thành viên (xóa luôn câu trả lời quiz của họ).                        |
| POST   | `/api/admin/members/bulk`     | `{ secret, ids: [...], action }` với action = `gender` (+`gender`), `group` (+`groupId`), `clear-room`, `leader` (+`isLeader`), `delete`. Đổi giới tính hàng loạt sẽ tự đưa ai đang ở phòng khác giới ra ngoài. |
| POST   | `/api/admin/members/import`   | `{ secret, items: [{ name, gender }] }` — thêm tối đa 200 người/lần, trả về danh sách đã tạo và các dòng bị bỏ qua kèm lý do. |
| POST   | `/api/admin/groups`           | Thêm nhóm `{ secret, name, description }`.                                |
| PUT    | `/api/admin/groups/:id`       | Sửa tên / slogan nhóm.                                                    |
| DELETE | `/api/admin/groups/:id`       | Xóa nhóm, thành viên trong nhóm trở về chưa random.                       |
| POST   | `/api/admin/groups/bulk`      | `{ secret, ids: [...], action: "delete" }` — xóa nhiều nhóm cùng lúc.     |
| GET    | `/api/admin/questions`        | Danh sách câu hỏi kèm đáp án đúng (chỉ admin).                            |
| POST   | `/api/admin/questions`        | Thêm câu hỏi `{ secret, text, options[], correctIndex }`.                 |
| PUT    | `/api/admin/questions/:id`    | Sửa nội dung / phương án / đáp án / thứ tự (đổi thứ tự = đổi chỗ 2 câu).  |
| DELETE | `/api/admin/questions/:id`    | Xóa câu hỏi và các câu trả lời cho câu đó.                                |
| POST   | `/api/admin/questions/bulk`   | `{ secret, ids: [...], action: "delete" }` — xóa nhiều câu hỏi cùng lúc.  |
| POST   | `/api/admin/questions/:id/duplicate` | Nhân bản câu hỏi xuống cuối danh sách (giữ nguyên phương án + đáp án). |
| POST   | `/api/admin/questions/:id/move`      | `{ secret, direction: "up" \| "down" }` — đổi chỗ với câu liền kề.  |
| GET    | `/api/admin/settings`         | Cấu hình đang áp dụng + số lượng thành viên/nhóm/phòng/câu hỏi.           |
| POST   | `/api/admin/settings`         | Lưu `{ secret, leaderCount, roomCapacity, phase }`.                       |

## Cách chạy local

1. Khởi động MySQL bằng Docker:
   ```bash
   docker compose up -d
   ```
2. Cài dependency:
   ```bash
   npm install
   ```
3. Tạo bảng trong database (Prisma migrate):
   ```bash
   npx prisma migrate dev
   ```
4. Seed dữ liệu mẫu (4 nhóm + 20 thành viên):
   ```bash
   npm run seed
   ```
5. Chạy server:
   ```bash
   npm run dev
   ```
6. Mở trình duyệt: http://localhost:3000

## Cách hoạt động

- Trang chủ luôn hiển thị đầy đủ 4 nhóm và thành viên trong từng nhóm, cập nhật realtime qua Socket.IO mỗi khi có người random.
- Mỗi người chọn đúng tên mình trong dropdown rồi bấm "Random ngay".
- Nếu tên đó đã random trước đó, server trả về đúng nhóm cũ (không random lại) — nhờ đó refresh trang vẫn giữ nguyên kết quả (client tự lưu tên đã chọn vào `localStorage` và gọi lại API khi tải trang, API này idempotent với thành viên đã có nhóm).
- Nếu chưa random, server dùng `Math.random()` để chọn ngẫu nhiên 1 trong 4 nhóm, lưu vào DB, rồi emit sự kiện `member:randomized` để tất cả client khác cập nhật danh sách nhóm ngay lập tức.
