# Random Chia Nhóm

Website random chia nhóm cho nhiều người dùng, realtime bằng Socket.IO, dữ liệu lưu MySQL qua Prisma ORM.

## Công nghệ

- Node.js + Express
- Socket.IO (realtime)
- MySQL 8 (chạy qua Docker Compose)
- Prisma ORM
- HTML / CSS / Vanilla JS (không dùng React/Vue/Angular/NextJS)

## Danh sách nhóm

1. Nhóm Lành - Lành ít dữ nhiều
2. Nhóm này là số một
3. Nhóm hạt nhài hạt lựu
4. Nhóm mầm non gánh tạ

## Cấu trúc thư mục

```
minigamegroup/
├─ docker-compose.yml
├─ package.json
├─ .env
├─ README.md
├─ server/
│  ├─ index.js         # Express + Socket.IO app
│  ├─ prisma.js         # Prisma client singleton
│  └─ routes/
│     └─ api.js         # GET /api/groups, GET /api/members, POST /api/random
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.js
└─ public/
   ├─ index.html
   ├─ css/style.css
   └─ js/main.js
```

## Database

**Group**: id, name, description, createdAt
**Member**: id, name, groupId (nullable, FK -> Group), createdAt
**Setting**: key, value — lưu cấu hình chỉnh qua trang admin (hiện tại chỉ có `eventStartAt`)

Seed tạo sẵn 4 nhóm và 16 member mẫu (chưa gán nhóm, groupId = null).

## Giao diện & tính năng

- **Màn hình intro trước khi vào bốc thăm**: hero đầy hiệu ứng (particle bay, tiêu đề nhấp nháy), có nút "Bắt đầu bốc thăm". Nếu admin đặt giờ mở (xem mục Trang admin), màn intro hiện đếm ngược tới giờ mở, hết giờ mới cho bấm bắt đầu (kèm confetti); ai đang mở trang sẵn cũng thấy cập nhật ngay qua Socket.IO khi admin đổi giờ. Người đã random trước đó (lưu trong `localStorage`) sẽ bỏ qua màn intro và vào thẳng kết quả.
- **Hiệu ứng random kiểu slot machine**: 3 cột quay dọc, dừng lệch nhau, cùng dừng ở icon nhóm trúng.
- **Tiện ích trước khi quay**: xem trước 4 nhóm, bộ đếm số người chưa random, modal "Cách chơi".
- **Bảng xếp hạng nhóm (leaderboard)**: xếp hạng 4 nhóm theo số thành viên, cập nhật realtime.
- **Hoạt động gần đây (activity feed)**: danh sách ai vừa random vào nhóm nào, kèm giờ, cập nhật realtime qua Socket.IO; lưu tạm trong bộ nhớ server (tối đa 20 mục gần nhất, mất khi restart server).
- **Tải ảnh kết quả**: sau khi random xong, có nút tải về ảnh PNG kết quả (tên + nhóm) để chia sẻ.

## Trang admin

- `/admin-reset.html` — cần `ADMIN_RESET_SECRET` trong `.env`:
  - **Đặt giờ mở bốc thăm**: chọn ngày giờ, bấm "Lưu giờ mở" — lưu vào bảng `Setting`, áp dụng ngay cho mọi người đang mở trang, không cần restart server. Để trống + bấm "Mở ngay" để bỏ đếm ngược.
  - **Reset toàn bộ random**: xóa `groupId` của tất cả thành viên để random lại từ đầu.

## API

| Method | Endpoint               | Mô tả                                                                 |
|--------|------------------------|------------------------------------------------------------------------|
| GET    | `/api/config`          | Trả về cấu hình cho màn intro, hiện tại gồm `eventStartAt` (đọc từ bảng `Setting`, `null` nếu chưa đặt). |
| POST   | `/api/admin/event-time`| Body `{ "secret": "...", "eventStartAt": "2026-09-20T09:00:00.000Z" }` (hoặc `eventStartAt: null` để mở ngay). Cần đúng `ADMIN_RESET_SECRET`, lưu vào DB và emit socket `config:updated`. |
| GET    | `/api/activity`        | Trả về danh sách hoạt động random gần đây (tối đa 20 mục, lưu tạm trong bộ nhớ server). |
| GET    | `/api/groups`          | Trả về 4 nhóm kèm danh sách thành viên trong từng nhóm                 |
| GET    | `/api/members`         | Trả về toàn bộ thành viên (dùng cho dropdown chọn tên)                 |
| POST   | `/api/random`          | Body `{ "name": "An" }`. Nếu đã random rồi thì trả về nhóm cũ (không random lại). Nếu chưa, random 1 nhóm trong 4 nhóm, lưu DB, emit socket `member:randomized` cho tất cả client, và trả kết quả. |
| POST   | `/api/admin/reset`     | Body `{ "secret": "..." }`. Xóa `groupId` của mọi thành viên, emit socket `groups:reset`. |

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
