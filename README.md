# Random Chia Nhóm

Website random chia nhóm cho nhiều người dùng, realtime bằng Socket.IO, dữ liệu lưu MySQL qua Prisma ORM.

## Công nghệ

- Node.js + Express
- Socket.IO (realtime)
- MySQL 8 (chạy qua Docker Compose)
- Prisma ORM
- HTML / CSS / Vanilla JS (không dùng React/Vue/Angular/NextJS)
- Lucide Icons (qua CDN) cho toàn bộ biểu tượng giao diện

> Quy ước CSS của dự án: **không dùng `box-shadow` ở bất kỳ đâu**. Chiều sâu được tạo
> bằng viền 1px, nền chồng lớp và gradient mờ (xem `public/css/theme.css`).

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
│  ├─ settings.js       # doc/ghi bang Setting + noi dung hien thi cho trang cong khai
│  ├─ adminAuth.js      # middleware kiem tra ADMIN_RESET_SECRET
│  ├─ rooms.js          # logic ghep phong ngu theo gioi tinh
│  ├─ groups.js         # logic chia nhom (suc chua, khoa nhom, chia hang loat)
│  ├─ activity.js       # nhat ky thao tac luu xuong DB
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
   ├─ admin-reset.html  # duong dan cu -> chuyen huong sang /admin/
   ├─ admin/            # moi khu vuc quan ly MOT TRANG rieng
   │  ├─ index.html     #   Tong quan
   │  ├─ event.html     #   Su kien
   │  ├─ quiz.html      #   Vong Quiz
   │  ├─ groups.html    #   Chia nhom
   │  ├─ rooms.html     #   Phong ngu
   │  ├─ members.html   #   Thanh vien
   │  ├─ questions.html #   Cau hoi
   │  ├─ activity.html  #   Nhat ky
   │  ├─ appearance.html#   Giao dien & noi dung
   │  └─ settings.html  #   Cau hinh & Reset
   ├─ css/              # theme.css (he thiet ke chung), style.css, quiz.css, rooms.css, admin.css
   └─ js/               # icons.js, icon-set.js (tu sinh), ui-config.js, version-guard.js,
                        # main.js, quiz.js, rooms.js,
                        # admin-common.js (dung topbar + sidebar dung chung)
                        # + 1 file cho moi trang admin
```

## Database

**Group**: id, name, description, **color** (hex, màu nhận diện thẻ nhóm), **capacity** (giới hạn số người, null = không giới hạn), **locked** (khóa — không nhận thêm ai khi random), sortOrder, createdAt

**Member**: id, name, gender (nullable, `MALE`/`FEMALE`), groupId, roomId, isLeader, quizScore, quizTimeMs, note, createdAt
- **joinRandom / joinRoom / joinQuiz**: quyền tham gia từng vòng. Tắt vòng nào thì người đó
  không thấy tên mình trong ô chọn của vòng đó, bị server chặn nếu cố gọi API, bị bỏ qua khi
  admin chia hàng loạt — và kết quả cũ của đúng vòng đó bị gỡ.
- **pinnedGroup / pinnedRoom**: ghim kết quả. Người đã ghim không bị xáo lại hay bị xóa kết quả
  khi admin bấm "Xáo lại toàn bộ" / "Reset" (nếu chọn giữ người đã ghim).

**Room**: id, name (unique), gender (`MALE`/`FEMALE`), capacity (mặc định 2), note, **locked**, sortOrder, createdAt — phòng ngủ, mỗi phòng chỉ dành cho một giới tính

**Setting**: key, value — cấu hình chỉnh qua trang admin:
- Luật chơi: `eventStartAt`, `phase`, `quizStatus`, `leaderCount`, `roomCapacity`, `groupCapacity`, `roomsLocked`, `randomLocked`
- Nội dung hiển thị: `brandTitle`, `brandBadge`, `brandSubtitle`, `startButtonText`, `roomsTitle`,
  `roomsSubtitle`, `quizTitle`, `quizSubtitle`, `footerText`, `accentColor`
- Bật/tắt khối giao diện: `showLeaderboard`, `showActivity`, `showMemberNames`, `showRoomsPage`,
  `confettiEnabled`, `soundEnabled`

**Question**: id, order, text, options, correctIndex, **points** (điểm riêng từng câu), **timeLimitSec** (null = không giới hạn)
**Answer**: câu trả lời của từng người cho từng câu

**ActivityLog**: id, type (`random`/`room`/`quiz`/`admin`), icon, message, actor, meta, createdAt —
nhật ký thao tác, còn nguyên sau khi khởi động lại máy chủ (trước đây lưu trong bộ nhớ nên mất).

Seed tạo sẵn 4 nhóm và 16 member mẫu (chưa gán nhóm, chưa đặt giới tính — giới tính do admin đặt trong trang admin).

## Giao diện & tính năng

- **Reset là về màn hình chờ**: admin bấm "Reset toàn bộ" (hoặc "Làm lại vòng Quiz") thì mọi người đang mở trang — kể cả người đang xem kết quả hay đang làm bài dở — đều được đưa ngay về màn hình chờ, xóa kết quả cũ và sẵn sàng bắt đầu lại. Tương tự khi admin kéo giai đoạn ngược từ Random về Quiz.
- **Màn hình intro trước khi vào bốc thăm**: hero đầy hiệu ứng (particle bay, tiêu đề nhấp nháy), có nút "Bắt đầu bốc thăm". Nếu admin đặt giờ mở (xem mục Trang admin), màn intro hiện đếm ngược tới giờ mở, hết giờ mới cho bấm bắt đầu (kèm confetti); ai đang mở trang sẵn cũng thấy cập nhật ngay qua Socket.IO khi admin đổi giờ. Người đã random trước đó (lưu trong `localStorage`) sẽ bỏ qua màn intro và vào thẳng kết quả.
- **Hiệu ứng random kiểu slot machine**: 3 cột quay dọc, dừng lệch nhau, cùng dừng ở icon nhóm trúng.
- **Tiện ích trước khi quay**: xem trước 4 nhóm, bộ đếm số người chưa random, modal "Cách chơi".
- **Bảng xếp hạng nhóm (leaderboard)**: xếp hạng các nhóm theo số thành viên, cập nhật realtime.
- **Hoạt động gần đây (activity feed)**: ai vừa random vào nhóm nào, kèm giờ, cập nhật realtime qua Socket.IO; lưu xuống DB nên còn nguyên sau khi khởi động lại máy chủ.
- **Tải ảnh kết quả**: sau khi random xong, có nút tải về ảnh PNG kết quả (tên + nhóm) để chia sẻ.
- **Màu nhóm do admin đặt**: thẻ nhóm lấy đúng màu nhận diện admin chọn trong tab Chia nhóm.
- **Nội dung do admin đặt**: tiêu đề, mô tả, chữ trên nút, dòng chân trang và màu chủ đạo đều sửa được ở tab "Giao diện & nội dung", áp dụng ngay cho người đang mở trang. Các khối như bảng xếp hạng hay hoạt động gần đây cũng bật/tắt được.
- **Chỉ hiện tên người được tham gia**: ô chọn tên của mỗi vòng chỉ liệt kê những người admin cho phép tham gia vòng đó.

## Chia nhóm (vòng random)

- **Chỉ người được phép mới tham gia**: admin bật/tắt quyền chia nhóm cho từng người ở tab Thành viên. Người bị tắt không thấy tên mình trong ô chọn, bị server chặn nếu cố gọi API, và bị bỏ qua khi chia hàng loạt.
- **Thuật toán chọn nhóm** (`server/groups.js`): bỏ qua nhóm đang khóa và nhóm đã đầy, rồi **ưu tiên nhóm ít người nhất** để luôn chia đều (chênh lệch tối đa 1 người), random giữa các nhóm bằng nhau nên thứ tự vẫn hoàn toàn ngẫu nhiên. Riêng Nhóm Trưởng được ưu tiên vào nhóm chưa có nhóm trưởng nào, nên không bao giờ 2 Nhóm Trưởng rơi vào cùng một nhóm.
- **Giới hạn số người**: đặt chung cho mọi nhóm ở tab Cấu hình, hoặc đặt riêng cho từng nhóm (giới hạn riêng được ưu tiên). Để trống / 0 = không giới hạn.
- **Khóa nhóm**: nhóm bị khóa giữ nguyên người đang có nhưng không nhận thêm ai khi random.
- **Hai cách chia**: mỗi người tự bấm Random ở trang chủ, hoặc admin bấm **"Chia nhóm cho người chưa có"** / **"Xáo lại toàn bộ"**.
- **Ghim kết quả**: người được ghim không bị xáo lại hay bị xóa nhóm khi admin chia lại.

## Ghép phòng ngủ (nam/nữ riêng biệt)

Tính năng độc lập với vòng random chia nhóm, có trang riêng `/rooms.html` (có link từ trang chủ).

- **Mỗi phòng chỉ thuộc một giới tính**: nam ở với nam, nữ ở với nữ. Hệ thống không bao giờ xếp người vào phòng khác giới — kể cả khi admin xếp tay (API sẽ từ chối).
- **Sức chứa tùy chỉnh**: admin đặt số người mỗi phòng (2 = ghép cặp đôi, tối đa 50).
- **Thuật toán ghép** (`server/rooms.js`): chỉ chọn trong các phòng đúng giới tính, **chưa bị khóa** và còn chỗ; **ưu tiên phòng đang có người nhưng chưa đầy** để lấp kín từng phòng (không để mỗi phòng lẻ loi 1 người), và random giữa các phòng cùng mức lấp đầy — nên ai ở với ai vẫn hoàn toàn ngẫu nhiên.
- **Chỉ ghép người được phép**: ai bị admin tắt quyền ghép phòng sẽ không nằm trong danh sách ghép, và việc tạo phòng tự động cũng chỉ đếm số người thực sự tham gia.
- **Hai cách ghép**:
  - Mỗi người tự vào `/rooms.html`, chọn tên và bấm "Quay ghép phòng" (có hiệu ứng quay, idempotent — quay lại/F5 vẫn ra đúng phòng cũ).
  - Admin bấm **"Ghép phòng cho tất cả"** để hệ thống tự chia một lượt cho mọi người chưa có phòng (trộn thứ tự trước khi chia), hoặc **"Xáo lại toàn bộ"** để bốc hết ra ghép lại từ đầu.
- **Realtime**: ai vừa được ghép phòng, admin sửa/xóa phòng, reset ghép phòng... tất cả client đang mở trang đều thấy ngay qua Socket.IO.
- **Điều kiện**: thành viên phải được admin đặt giới tính trước; nếu chưa có phòng trống cho giới tính đó, hệ thống báo rõ để admin tạo thêm phòng.

## Trang admin

`/admin/` — bảng điều khiển dạng console (thanh trên cố định + sidebar tối 4 nhóm chức năng), cần `ADMIN_RESET_SECRET` trong `.env` (nhập 1 lần, dùng cho mọi thao tác). Có nút đổi **nền sáng/tối**, toast thông báo và hộp thoại xác nhận riêng thay cho `confirm()` của trình duyệt. Đường dẫn cũ `/admin-reset.html` tự chuyển hướng sang đây.

**Mỗi khu vực là một trang riêng.** Trước đây cả 10 khu vực nằm chung một trang và ẩn/hiện bằng tab: mở trang nào cũng phải tải 47KB HTML + 137KB JS của cả 10 module, tất cả cùng chạy và cùng đăng ký socket — đó là lý do trang giật và bấm tab không kịp phản hồi. Giờ mỗi trang chỉ còn trung bình **5KB HTML + 38KB JS**, nạp đúng một module của nó. Thanh trên và sidebar do `js/admin-common.js` dựng từ một bảng khai báo duy nhất nên không bao giờ lệch nhau giữa các trang.

Những việc ít làm (thêm thủ công, nhập danh sách, đổi chỗ, sao lưu, reset) được **gấp lại thành khối thu gọn** — bấm vào tiêu đề để mở — nên mỗi tab chỉ hiện việc chính.

**Chế độ chỉ xem**: chưa nhập mã bí mật thì mọi danh sách (thành viên, nhóm, phòng, câu hỏi, phòng chờ, bảng điểm) vẫn hiện đầy đủ từ API công khai — chỉ các ô sửa và nút thao tác bị khóa, kèm dòng nhắc. Nhập mã xong là mở khóa ngay, không cần tải lại trang.

### Ai được tham gia vòng nào

Đây là trục chính của bản nâng cấp. Mỗi thành viên có 3 công tắc độc lập — **chia nhóm**, **ghép phòng**, **làm quiz** — bật/tắt ngay trong bảng ở tab Thành viên (cột "Tham gia"), hoặc hàng loạt cho nhiều người đã tick chọn.

Tắt một vòng thì người đó:
- không còn thấy tên mình trong ô chọn tên của vòng đó (server lọc sẵn qua `?scope=`),
- bị chặn kèm thông báo rõ ràng nếu cố gọi thẳng API,
- bị bỏ qua (có nêu lý do) khi admin bấm chia/ghép hàng loạt,
- bị gỡ kết quả cũ của đúng vòng đó, nên không còn lọt vào thẻ nhóm hay sơ đồ phòng.

Công tắc thứ tư là **ghim** 📌: người đã ghim giữ nguyên nhóm và phòng khi admin bấm "Xáo lại toàn bộ" hoặc "Reset" (nếu để tick "Giữ nguyên những người đã ghim").

### Các tab

- **Tổng quan** — toàn cảnh một màn hình: tiến trình 3 bước (Quiz → Chia nhóm → Ghép phòng) với bước đang mở được làm nổi, số liệu thành viên / nhóm / phòng kèm thanh tiến độ, nút khóa nhanh từng vòng, và 10 hoạt động gần nhất.
- **Sự kiện** — đặt/xóa giờ mở bốc thăm, kèm đồng hồ đếm ngược ngay trên thẻ.
- **Vòng Quiz** — phòng chờ realtime, bắt đầu làm bài, bảng xếp hạng, chốt Nhóm Trưởng, làm lại vòng quiz.
- **Chia nhóm** — mỗi nhóm là một thẻ: đổi tên/slogan, **đặt màu nhận diện** (màu này hiện luôn trên thẻ nhóm ở trang chủ), **giới hạn số người riêng cho từng nhóm**, **khóa nhóm** (giữ người đang có, không nhận thêm ai). Thao tác hàng loạt: chia nhóm cho người chưa có, **xáo lại toàn bộ**, khóa cả vòng chia nhóm, xóa kết quả. Gỡ từng người khỏi nhóm bằng nút ✕, tìm theo tên nhóm hoặc tên người, xuất CSV.
- **Phòng ngủ** — tạo phòng tự động theo số người **được tham gia** của mỗi giới; thêm/sửa/xóa từng phòng; **khóa từng phòng** hoặc khóa hết phòng đã đầy; ghép phòng cho tất cả; **xáo lại toàn bộ**; **đổi chỗ hai người** cùng giới giữa hai phòng; danh sách người chưa có phòng kèm ô xếp tay; lọc theo giới/còn chỗ/đã kín/đang trống/đang khóa; dọn phòng; xóa hết phòng trống; xuất CSV. Cảnh báo thiếu chỗ tính **riêng cho nam và nữ**, không nhìn con số tổng.
- **Thành viên** — bảng đầy đủ với thống kê; thêm từng người hoặc dán danh sách (`Tên`, `Tên, Nam`, `Tên, Nữ, Tên nhóm`); sửa tên, giới tính, nhóm, phòng, cờ Nhóm Trưởng và 4 công tắc tham gia/ghim; tìm kiếm, 9 bộ lọc nhanh, sắp xếp theo cột; **chọn nhiều người để sửa hàng loạt** (đặt giới tính, xếp nhóm, xếp phòng, cho/cấm tham gia từng vòng hoặc cả 3 vòng, bỏ nhóm, bỏ phòng, xóa); xuất CSV kèm cột quyền tham gia.
- **Câu hỏi** — thêm/sửa/xóa câu hỏi (2–6 phương án); **điểm riêng cho từng câu** và **giới hạn thời gian từng câu**; đổi thứ tự bằng mũi tên hoặc nhập số; nhân bản; tìm kiếm; xóa nhiều câu; xuất CSV (đáp án đúng chỉ hiện khi đã nhập mã).
- **Nhật ký** — lịch sử mọi lượt bốc thăm, ghép phòng và thao tác admin, lưu trong DB nên **còn nguyên sau khi khởi động lại máy chủ**. Lọc theo loại, xuất CSV, xóa nhật ký.
- **Giao diện & nội dung** — sửa trực tiếp tiêu đề, mô tả, chữ trên nút, dòng chân trang của trang chủ / trang ghép phòng / vòng quiz, đổi **màu chủ đạo**, và bật/tắt từng khối (bảng xếp hạng, hoạt động gần đây, tên thành viên trong thẻ nhóm, trang ghép phòng, pháo giấy, âm thanh). Lưu xong áp dụng ngay cho mọi người đang mở trang, không cần tải lại.
- **Cấu hình & Reset** — số Nhóm Trưởng chốt từ quiz, sức chứa phòng mặc định, **giới hạn người mỗi nhóm** (0 = không giới hạn), chuyển giai đoạn quiz/random; **sao lưu toàn bộ dữ liệu ra file JSON và phục hồi lại từ file đó**; reset toàn bộ với các tùy chọn (xóa luôn ghép phòng, giữ người đã ghim, xóa luôn nhật ký).

## API

Mọi endpoint `/api/admin/*` đều cần `ADMIN_RESET_SECRET`: gửi trong body với POST/PUT/DELETE, hoặc trong query string `?secret=...` với GET.

### API công khai

| Method | Endpoint               | Mô tả                                                                 |
|--------|------------------------|------------------------------------------------------------------------|
| GET    | `/api/config`          | Cấu hình cho trang công khai: `eventStartAt`, `phase`, `leaders`, `roomsLocked`, `randomLocked`, `roomCount`, và `ui` (toàn bộ nội dung + công tắc hiển thị admin đặt). |
| GET    | `/api/activity`        | Hoạt động gần đây (`?limit=`, `?type=random\|room\|quiz\|admin`), đọc từ bảng `ActivityLog`. |
| GET    | `/api/groups`          | Danh sách nhóm kèm thành viên (dạng mảng, giữ nguyên để tương thích).   |
| GET    | `/api/groups/full`     | Như trên nhưng kèm `stats` và `globalCapacity`.                         |
| GET    | `/api/members`         | Toàn bộ thành viên. **`?scope=random\|room\|quiz`** chỉ trả người được phép tham gia vòng đó — đây là cách ô chọn tên trên trang công khai không hiện tên người bị loại. |
| POST   | `/api/random`          | Body `{ "name": "An" }`. Đã random rồi thì trả nhóm cũ. Chặn nếu vòng đang khóa, hoặc người này bị tắt `joinRandom`. Chọn nhóm còn chỗ, chưa khóa, ít người nhất. Emit `member:randomized`. |
| POST   | `/api/room/random`     | Body `{ "name": "An" }`. Tương tự cho phòng ngủ, chặn nếu bị tắt `joinRoom`, chưa có giới tính, hoặc vòng đang khóa. Emit `member:room-randomized`. |

### API phòng ngủ (admin)

| Method | Endpoint                         | Mô tả                                                                 |
|--------|----------------------------------|------------------------------------------------------------------------|
| GET    | `/api/rooms`                     | Danh sách phòng kèm người ở, thống kê theo giới, trạng thái khóa (công khai). |
| POST   | `/api/admin/rooms`               | Tạo phòng `{ name, gender, capacity, note }`.                          |
| PUT    | `/api/admin/rooms/:id`           | Sửa `{ name, gender, capacity, note, locked }`. Chặn hạ sức chứa dưới số người đang ở, chặn đổi giới tính khi còn người khác giới. |
| DELETE | `/api/admin/rooms/:id`           | Xóa phòng, người đang ở trở về chưa có phòng.                          |
| POST   | `/api/admin/rooms/auto-create`   | `{ capacity, prefix }` — tạo đủ số phòng còn thiếu cho cả 2 giới, chỉ tính người **được tham gia** ghép phòng. |
| POST   | `/api/admin/rooms/random-all`    | Ghép một lượt cho người chưa có phòng. `{ reshuffle: true }` = bốc hết ra ghép lại từ đầu (trừ người đã ghim). Trả về danh sách đã ghép và ai bị bỏ qua kèm lý do. |
| POST   | `/api/admin/rooms/move`          | `{ memberId, roomId }` — chuyển một người sang phòng khác, `roomId: ""` là đưa ra ngoài. |
| POST   | `/api/admin/rooms/swap`          | `{ memberAId, memberBId }` — đổi chỗ 2 người cùng giới ở 2 phòng khác nhau (không cần phòng còn trống). |
| POST   | `/api/admin/rooms/reorder`       | `{ ids: [...] }` — lưu thứ tự hiển thị các phòng.                      |
| POST   | `/api/admin/rooms/reset`         | `{ keepPinned }` — bỏ kết quả ghép phòng, vẫn giữ danh sách phòng.     |
| POST   | `/api/admin/rooms/lock`          | `{ locked }` — khóa/mở vòng tự ghép phòng cho mọi người.               |
| POST   | `/api/admin/rooms/bulk`          | `{ ids: [...], action: "delete" \| "clear" \| "lock" \| "unlock" }`.   |

### API chia nhóm (admin)

| Method | Endpoint                       | Mô tả                                                                   |
|--------|--------------------------------|---------------------------------------------------------------------------|
| GET    | `/api/admin/groups`            | Danh sách nhóm kèm thống kê và `globalCapacity`.                          |
| POST   | `/api/admin/groups`            | Thêm nhóm `{ name, description, color, capacity, locked }`.               |
| PUT    | `/api/admin/groups/:id`        | Sửa các trường trên. Chặn hạ giới hạn xuống dưới số người đang có.        |
| DELETE | `/api/admin/groups/:id`        | Xóa nhóm, thành viên trở về chưa chia nhóm.                               |
| POST   | `/api/admin/groups/random-all` | Chia nhóm một lượt cho người chưa có. `{ reshuffle: true }` = xáo lại toàn bộ (trừ người đã ghim). |
| POST   | `/api/admin/groups/move`       | `{ memberId, groupId }` — chuyển một người sang nhóm khác, `""` là bỏ ra. |
| POST   | `/api/admin/groups/reorder`    | `{ ids: [...] }` — lưu thứ tự hiển thị các nhóm.                          |
| POST   | `/api/admin/groups/reset`      | `{ keepPinned }` — xóa kết quả chia nhóm, vẫn giữ danh sách nhóm.         |
| POST   | `/api/admin/groups/bulk`       | `{ ids: [...], action: "delete" \| "clear" \| "lock" \| "unlock" }`.      |

### API thành viên & câu hỏi (admin)

| Method | Endpoint                      | Mô tả                                                                    |
|--------|-------------------------------|--------------------------------------------------------------------------|
| GET    | `/api/admin/members`          | Danh sách thành viên đầy đủ (nhóm, phòng, giới tính, điểm quiz, quyền tham gia). |
| POST   | `/api/admin/members`          | Thêm `{ name, gender, groupId, note, joinRandom, joinRoom, joinQuiz }`.   |
| PUT    | `/api/admin/members/:id`      | Sửa `{ name, gender, groupId, roomId, isLeader, note, joinRandom, joinRoom, joinQuiz, pinnedGroup, pinnedRoom }`. Tắt `joinRandom`/`joinRoom` sẽ tự gỡ kết quả cũ của vòng đó. |
| DELETE | `/api/admin/members/:id`      | Xóa thành viên (xóa luôn câu trả lời quiz).                               |
| POST   | `/api/admin/members/bulk`     | `{ ids: [...], action }` với action = `gender`, `group`, `room`, `clear-group`, `clear-room`, `leader`, **`flag`** (`{ flag, value }` cho 5 công tắc tham gia/ghim), `delete`. |
| POST   | `/api/admin/members/import`   | `{ items: [{ name, gender, group }] }` — tối đa 200 người/lần, trả về đã tạo và bị bỏ qua kèm lý do. |
| GET    | `/api/admin/questions`        | Danh sách câu hỏi kèm đáp án đúng.                                        |
| POST   | `/api/admin/questions`        | Thêm `{ text, options[], correctIndex, points, timeLimitSec }`.           |
| PUT    | `/api/admin/questions/:id`    | Sửa nội dung / phương án / đáp án / thứ tự / điểm / giới hạn thời gian.   |
| DELETE | `/api/admin/questions/:id`    | Xóa câu hỏi và các câu trả lời cho câu đó.                                |
| POST   | `/api/admin/questions/bulk`   | `{ ids: [...], action: "delete" }`.                                       |
| POST   | `/api/admin/questions/:id/duplicate` | Nhân bản xuống cuối danh sách.                                     |
| POST   | `/api/admin/questions/:id/move`      | `{ direction: "up" \| "down" }`.                                    |

### API hệ thống (admin)

| Method | Endpoint                      | Mô tả                                                                    |
|--------|-------------------------------|--------------------------------------------------------------------------|
| GET    | `/api/admin/overview`         | Số liệu tổng hợp cho tab Tổng quan (thành viên, nhóm, phòng, quiz, trạng thái vòng). |
| GET    | `/api/admin/settings`         | Cấu hình đang áp dụng + `schema` mô tả các ô nhập nội dung/công tắc + số lượng bản ghi. |
| POST   | `/api/admin/settings`         | Lưu `{ leaderCount, roomCapacity, groupCapacity, phase, ui: {...} }`. Emit `settings:updated` để trang công khai đổi ngay. |
| POST   | `/api/admin/settings/lock`    | `{ locked }` — khóa/mở vòng random chia nhóm.                            |
| POST   | `/api/admin/event-time`       | `{ eventStartAt }` (ISO hoặc `null` để mở ngay). Emit `config:updated`.   |
| GET    | `/api/admin/activity`         | Nhật ký đầy đủ (`?limit=`, `?type=`).                                    |
| POST   | `/api/admin/activity/clear`   | `{ type }` — xóa toàn bộ hoặc một loại nhật ký.                          |
| GET    | `/api/admin/export`           | Tải toàn bộ dữ liệu ra JSON để sao lưu.                                  |
| POST   | `/api/admin/import`           | `{ data, confirm: "GHI DE" }` — phục hồi từ file sao lưu. **Ghi đè toàn bộ** dữ liệu hiện tại, chạy trong một transaction nên lỗi giữa chừng thì dữ liệu cũ được giữ nguyên. |
| POST   | `/api/admin/reset`            | `{ includeRooms, keepPinned, includeActivity }` — reset kết quả chia nhóm + tiến độ quiz. |

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

## Tối ưu tốc độ

Trang admin ban đầu gom cả 10 khu vực vào một file và ẩn/hiện bằng tab. Mở bất kỳ khu
vực nào cũng phải tải và chạy toàn bộ, nên trang giật và bấm tab không kịp phản hồi.
Bốn thay đổi dưới đây xử lý việc đó:

| Trước | Sau |
|---|---|
| 1 trang 47KB HTML, 10 panel cùng nằm trong DOM | **Mỗi khu vực một trang**, trung bình 5KB HTML |
| 137KB JS của 9 module đều tải và chạy cùng lúc | Chỉ nạp **1 module** của trang đang mở |
| Lucide từ CDN: 348KB cho 1799 icon | **Tự host 21KB** cho đúng 108 icon đang dùng |
| Mỗi lần vẽ lại icon là dựng lại **toàn bộ** icon trên trang | Chỉ vẽ phần DOM vừa đổi, có bộ nhớ đệm |

Tổng tải mỗi lần mở: **~540KB → ~64KB**.

Hai điểm đáng chú ý trong cách làm:

- **Vẽ icon có giới hạn phạm vi** (`js/icons.js`). `lucide.createIcons()` không nhận
  phạm vi — mỗi lần gọi là quét cả `document`. Đồng hồ đếm ngược ghi lại DOM mỗi giây,
  nghĩa là mỗi giây dựng lại hơn trăm thẻ SVG. Giờ bộ vẽ tự dựng SVG từ `lucide.icons`,
  nhớ sẵn theo tên icon, và `MutationObserver` chỉ xử lý **nhánh DOM vừa được thêm**.
- **Đánh phiên bản tài nguyên.** Máy chủ chèn `?v=<BUILD_ID>` vào mọi đường dẫn
  `/js/…` và `/css/…` trong HTML, rồi cho các file đó cache vĩnh viễn (`immutable`).
  Sửa code thì `BUILD_ID` đổi → đường dẫn đổi → trình duyệt tự lấy bản mới. Nhờ vậy
  chuyển trang không còn phải hỏi lại máy chủ từng file.

> Thêm icon mới vào mã nguồn thì chạy lại `npm run build:icons` — script sẽ báo nếu
> có tên icon không tồn tại trong thư viện.

## Nhắc tải lại khi có bản mới

Sửa code giữa lúc sự kiện đang chạy là chuyện bình thường, nhưng tab mà mọi người đang mở
vẫn chạy JS cũ đã nạp vào bộ nhớ. HTML mới + JS cũ lệch nhau cho ra triệu chứng rất khó đoán:
bấm nút không ăn gì, một khu vực trống trơn, giao diện vỡ.

Vì vậy máy chủ tính một "vân tay" (`BUILD_ID`) từ toàn bộ file trong `public/` lúc khởi động,
gửi cho client ngay khi socket kết nối và qua `GET /api/version`. Client so với bản nó đang
chạy, lệch thì hiện một thanh nhỏ **"Trang đã được cập nhật — Tải lại ngay"**. Cơ chế này có
trên cả ba trang (`js/version-guard.js`).

> Sau khi sửa code, **khởi động lại server** là mọi người sẽ được nhắc. Bản thân bạn thì vẫn
> nên `Ctrl+Shift+R` ở tab đang mở.

## Cách hoạt động

- Trang chủ luôn hiển thị đầy đủ các nhóm và thành viên trong từng nhóm, cập nhật realtime qua Socket.IO mỗi khi có người random.
- Mỗi người chọn đúng tên mình trong dropdown rồi bấm "Random ngay". Dropdown chỉ liệt kê những người admin cho phép tham gia vòng này.
- Nếu tên đó đã random trước đó, server trả về đúng nhóm cũ (không random lại) — nhờ đó refresh trang vẫn giữ nguyên kết quả (client tự lưu tên đã chọn vào `localStorage` và gọi lại API khi tải trang, API này idempotent với thành viên đã có nhóm).
- Nếu chưa random, server chọn ngẫu nhiên một nhóm còn chỗ và chưa khóa (ưu tiên nhóm ít người nhất để chia đều), lưu vào DB, ghi nhật ký, rồi emit sự kiện `member:randomized` để tất cả client khác cập nhật danh sách nhóm ngay lập tức.

### Chống ghi đè khi nhiều người bấm cùng lúc

Hai người bấm cùng lúc có thể cùng đọc ra "phòng X còn 1 chỗ" rồi ghi đè lên nhau. Vì vậy mỗi lượt ghép phòng chạy trong một transaction: ghi xong thì **đếm lại** số người trong phòng, nếu vượt sức chứa thì roll back và chọn phòng khác (thử tối đa 3 lần). Thao tác ghép hàng loạt của admin cũng kiểm lại một lượt ở cuối transaction, có phòng nào vượt sức chứa thì hủy cả mẻ và báo admin bấm lại.
