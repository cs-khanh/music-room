# Music Room — Kế hoạch triển khai miễn phí trên Cloudflare

> **Mục tiêu:** Lập kế hoạch chuyển dự án Music Room lên Cloudflare theo hướng ưu tiên Free tier, giữ nguyên một GitHub monorepo, triển khai từng thành phần độc lập và giảm thiểu rủi ro khi refactor.
>
> **Trạng thái:** Kế hoạch ban đầu; phần triển khai Cloudflare đã được thực hiện. Kiến trúc, lệnh deploy, secrets, D1 migration và các giới hạn cutover hiện tại được ghi trong [CLOUDFLARE.md](CLOUDFLARE.md). Nội dung bên dưới nên được đọc như lịch sử quyết định và checklist, không phải hướng dẫn deploy mới nhất.
>
> **Repo:** https://github.com/cs-khanh/music-room

---

## 1. Tóm tắt quyết định

### Hướng đã chọn và triển khai

1. **Giữ một repo `music-room`**; chưa tách thành các repo nhỏ.
2. Có thể **kết nối GitHub với Cloudflare** để tự động build/deploy khi push code. Kết nối này tiện lợi nhưng không bắt buộc.
3. Audit source code và dependency trước khi chọn cấu hình build/deploy chính thức.
4. Triển khai frontend, API, database và realtime thành các thành phần có thể deploy/quản lý riêng, dù chúng vẫn nằm trong cùng repo.
5. Không cố deploy nguyên trạng NestJS server hoặc Socket.IO server lên Workers khi chưa xác minh khả năng tương thích.
6. Dùng domain mặc định của Cloudflare trong giai đoạn đầu; cấu hình domain riêng sau khi ứng dụng chạy ổn định.

### Kiến trúc mục tiêu để đánh giá

```text
GitHub: cs-khanh/music-room (monorepo)
│
├── frontend/ ───────────────► Cloudflare Pages hoặc Workers
│                                └── Giao diện web
│
├── backend/ ────────────────► Cloudflare Workers (sau khi điều chỉnh)
│                                └── REST API
│
├── Realtime ────────────────► Durable Objects + WebSocket (nếu phù hợp)
│                                └── Trạng thái phòng và đồng bộ phát nhạc
│
├── Database ────────────────► Cloudflare D1 (nếu schema/queries tương thích)
│                                └── Dữ liệu ứng dụng
│
└── shared/ ─────────────────► Dependency dùng chung trong monorepo
```

Đây là **kiến trúc đích cần kiểm chứng**, không phải mô tả chắc chắn về khả năng chạy của code hiện tại. Có thể cần thay đổi tùy thuộc vào Next.js, NestJS, Prisma, driver database, thư viện realtime và các API Node.js mà dự án đang dùng.

---

## 2. Phạm vi và nguyên tắc

### Mục tiêu

- Triển khai ứng dụng với chi phí ban đầu bằng 0 hoặc gần 0 trong giới hạn Free tier.
- Tự động deploy khi có thay đổi code nếu sử dụng tích hợp GitHub.
- Giữ một nguồn code chính để đơn giản hóa việc phát triển.
- Có thể rollback về phiên bản trước khi một đợt refactor gặp lỗi.
- Kiểm tra các chức năng quan trọng: đăng nhập, tìm kiếm YouTube, phòng nghe nhạc, queue và đồng bộ phát nhạc.

### Ngoài phạm vi giai đoạn đầu

- Không cần mua domain mới.
- Không bắt buộc chuyển nameserver của domain hiện tại ngay lập tức.
- Không tách repo chỉ để phục vụ deploy.
- Không chuyển toàn bộ hệ thống trong một lần.
- Không giả định rằng Redis đang được sử dụng; phải xác minh bằng code/configuration.
- Không cam kết ứng dụng sẽ luôn nằm trong giới hạn miễn phí khi chưa có dữ liệu tải thực tế.

### Nguyên tắc triển khai

- **Audit trước, refactor sau.**
- **Một thay đổi lớn mỗi lần**, có kiểm thử trước khi chuyển sang bước tiếp theo.
- Giữ `main` ổn định; thực hiện refactor trên branch riêng.
- Không commit secret, token, mật khẩu hoặc file `.env` chứa thông tin nhạy cảm.
- Không xóa database, migration hoặc dịch vụ hiện có trước khi xác nhận đã sao lưu và có phương án rollback.

---

## 3. Có cần kết nối GitHub với Cloudflare không?

### Lựa chọn A — Kết nối GitHub (khuyến nghị)

Cloudflare được cấp quyền truy cập repo để cấu hình build/deploy. Tùy sản phẩm và cấu hình, có thể thiết lập tự động build/deploy khi push lên branch đã chọn.

**Ưu điểm**
- Không phải tự chạy lệnh deploy mỗi lần.
- Có thể xem trạng thái deployment và build log trên Dashboard.
- Thuận tiện cho việc deploy preview/branch nếu cấu hình hỗ trợ.
- Phù hợp với dự án cần cập nhật thường xuyên.

**Lưu ý**
- Chỉ cấp quyền repo cần thiết nếu giao diện cho phép lựa chọn phạm vi quyền.
- Chọn đúng thư mục ứng dụng trong monorepo.
- Không nên cấu hình build frontend theo cách mặc định trước khi xác minh framework và build output.
- Kết nối repo không tự động làm cho NestJS, Prisma/MySQL hoặc Socket.IO tương thích với Workers.

### Lựa chọn B — Không kết nối GitHub

Vẫn có thể deploy bằng Wrangler CLI hoặc quy trình upload/build mà sản phẩm Cloudflare hỗ trợ.

Ví dụ tổng quát:

```bash
npm install
npm run build
npx wrangler deploy
```

Các lệnh trên chỉ là ví dụ. Lệnh đúng phụ thuộc vào `package.json`, cấu hình Wrangler và loại ứng dụng. Không chạy nguyên mẫu này nếu project chưa có script hoặc cấu hình tương ứng.

**Ưu điểm**
- Kiểm soát trực tiếp quá trình deploy từ máy local/CI.
- Không cần bật tích hợp repository trên Dashboard.

**Nhược điểm**
- Phải tự chạy deploy sau mỗi lần thay đổi, trừ khi tự xây CI/CD.
- Phải quản lý profile, secrets và môi trường triển khai cẩn thận.
- Dễ phát sinh sai khác giữa máy local và môi trường deploy nếu thiếu quy trình chuẩn.

### Kết luận

Kết nối GitHub là lựa chọn thuận tiện, không phải yêu cầu bắt buộc. Nó chỉ giải quyết **quy trình lấy code và triển khai**, không thay thế công việc chuyển đổi kiến trúc ứng dụng.

---

## 4. Có cần tách repo không?

**Chưa cần.** Monorepo vẫn có thể triển khai nhiều thành phần riêng biệt. Repository và deployment là hai khái niệm khác nhau.

Ví dụ:

```text
Một GitHub repo
    ├── frontend/  ──► deployment frontend
    ├── backend/   ──► deployment API
    └── shared/    ──► được import/build cùng ứng dụng phù hợp
```

### Vì sao nên giữ monorepo lúc đầu?

- Dễ thay đổi API contract và frontend cùng lúc.
- Có thể dùng chung TypeScript types hoặc validation schemas trong `shared/`.
- Tránh phải thiết lập versioning và publish package nội bộ quá sớm.
- Dễ xem lịch sử thay đổi liên quan đến một feature.
- Giảm công việc quản lý repository, permissions và CI/CD.

### Khi nào mới cân nhắc tách repo?

Chỉ cân nhắc khi có nhu cầu rõ ràng, chẳng hạn:
- Frontend và backend có đội ngũ/quyền truy cập khác nhau.
- Hai phần có vòng đời phát hành độc lập đáng kể.
- `shared/` đã được thiết kế thành package có versioning ổn định.
- Quy trình CI/CD hoặc chính sách bảo mật yêu cầu tách biệt.

**Không nên tách repo chỉ vì Cloudflare có các lựa chọn deploy riêng.**

---

## 5. Giai đoạn 0 — Audit repository

Đây là bước bắt buộc trước khi quyết định cấu hình triển khai.

### 5.1. Lấy cấu trúc dự án

Chạy từ Ubuntu/WSL tại thư mục repository:

```bash
cd music-room

git status
git branch --show-current
git log -5 --oneline

find . -maxdepth 2 \
  -type f \
  \( -name 'package.json' \
  -o -name 'wrangler.toml' \
  -o -name 'wrangler.json' \
  -o -name 'wrangler.jsonc' \
  -o -name 'next.config.*' \
  -o -name 'nest-cli.json' \
  -o -name 'schema.prisma' \
  -o -name 'docker-compose*.yml' \
  -o -name 'Dockerfile' \
  -o -name '.env.example' \) \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*'
```

Trước khi chia sẻ output, cần che mọi secret nếu vô tình xuất hiện. Không chia sẻ nội dung `.env` thật.

### 5.2. Kiểm tra scripts và dependencies

```bash
cat package.json
cat frontend/package.json
cat backend/package.json
```

Nếu thư mục hoặc tên file khác, điều chỉnh đường dẫn theo cấu trúc thực tế.

Cần ghi nhận:
- Package manager và phiên bản Node.js.
- Lệnh build/start của frontend và backend.
- Next.js version, có dùng SSR, Server Actions, API routes hay middleware không.
- NestJS modules và các adapter đang dùng.
- Prisma version, datasource provider, schema và migration.
- Các thư viện cần native Node.js APIs hoặc binary.
- Các biến môi trường bắt buộc.
- Các thư viện WebSocket/Socket.IO và protocol hiện tại.

### 5.3. Kiểm tra database và Redis

Tìm cách ứng dụng truy cập database:
- Prisma client/provider.
- MySQL-specific SQL, stored procedure, trigger, collation hoặc kiểu dữ liệu.
- Connection pooling và cách quản lý kết nối.
- Migration scripts, indexes, unique constraints và foreign keys.

Tìm Redis một cách có mục tiêu, không quét `node_modules`:

```bash
grep -RniE \
  'redis|ioredis|REDIS_URL|REDIS_HOST|@socket.io/redis-adapter' \
  --include='package.json' \
  --include='*.ts' \
  --include='*.js' \
  --include='*.json' \
  frontend backend shared \
  2>/dev/null
```

Nếu thư mục không tồn tại thì bỏ nó khỏi lệnh. Có thể kiểm tra dependency đã cài:

```bash
npm ls redis ioredis @socket.io/redis-adapter --all
```

Lệnh này có thể báo lỗi nếu package không được cài hoặc repository dùng workspace khác; đó không tự động có nghĩa là Redis không được dùng.

**Đầu ra cần có sau audit:**
- Danh sách thành phần và trách nhiệm.
- Danh sách env vars, chỉ ghi tên biến, không ghi secret.
- Bản đồ endpoint REST và sự kiện realtime.
- Danh sách dependency có nguy cơ không tương thích Cloudflare.
- Quyết định sơ bộ cho frontend, API, database và realtime.

---

## 6. Giai đoạn 1 — Chuẩn bị Git và môi trường

### 6.1. Tạo branch refactor

```bash
git switch -c refactor/cloudflare
```

Nếu branch đã tồn tại:

```bash
git switch refactor/cloudflare
```

Trước khi thay đổi, kiểm tra `git status` và commit/stash công việc đang làm. Không chuyển branch khi còn thay đổi chưa được lưu nếu có nguy cơ mất dữ liệu.

### 6.2. Ghi lại trạng thái ban đầu

- Xác nhận ứng dụng chạy được ở môi trường hiện tại.
- Lưu lại lệnh chạy, env vars cần thiết và các bước setup.
- Ghi lại test hiện có và những chức năng đang lỗi sẵn.
- Nếu có database đang dùng, tạo bản sao lưu và xác minh có thể khôi phục.
- Giữ phương án triển khai cũ cho tới khi bản Cloudflare được kiểm chứng.

### 6.3. Thiết lập Cloudflare

- Tạo hoặc đăng nhập tài khoản Cloudflare.
- Chọn sản phẩm phù hợp với ứng dụng sau audit.
- Cài Wrangler theo hướng dẫn hiện hành của Cloudflare.
- Đăng nhập CLI theo hướng dẫn chính thức.
- Tạo resource thử nghiệm trong môi trường development trước khi dùng production.
- Không đưa token có quyền rộng vào code hoặc commit.

Có thể bắt đầu bằng domain mặc định do Cloudflare cấp; chưa cần domain riêng.

---

## 7. Giai đoạn 2 — Chọn cách deploy frontend

Nếu frontend dùng Next.js, trước tiên phải xác định ứng dụng cần tính năng server-side nào.

### Nhánh A — Có thể xuất static

Nếu frontend chỉ cần các trang/tài nguyên tĩnh và dữ liệu được lấy qua API riêng, có thể đánh giá:
- Cloudflare Pages với static output; hoặc
- Workers Static Assets, tùy cấu trúc dự án.

Cần xác minh:
- `next.config.*` và cấu hình build.
- Có sử dụng SSR/ISR, Server Actions, middleware, API routes hoặc server runtime hay không.
- Có route động cần render phía server không.
- Build output thực tế.
- Các biến môi trường được dùng ở build time và runtime.

Không nên bật `output: 'export'` chỉ để làm build thành công nếu ứng dụng phụ thuộc vào tính năng server-side không hỗ trợ static export.

### Nhánh B — Cần chạy Next.js phía server

Đánh giá phương án Next.js trên Cloudflare Workers thông qua hướng dẫn/adaptor hiện hành của Cloudflare. Kiểm tra tương thích với phiên bản Next.js và tính năng cụ thể trước khi chọn.

Không giả định mọi tính năng Next.js hoặc mọi package Node.js đều hoạt động giống môi trường Node server truyền thống.

### Cấu hình deploy frontend cần ghi lại

- Root directory.
- Build command.
- Build output directory.
- Node/package manager version.
- Environment variables.
- Branch production và branch preview.
- URL frontend sau deployment.
- Cách rollback.

Không điền giá trị build command/output directory cho tới khi đã xác minh project.

---

## 8. Giai đoạn 3 — Chuyển đổi backend API

Backend NestJS chạy như một server Node.js thông thường không đồng nghĩa có thể deploy nguyên trạng lên Workers.

### 8.1. Audit trước khi chuyển

Lập danh sách:
- Controllers và routes.
- Authentication/authorization guards.
- DTOs, validation pipes và exception filters.
- Middleware/interceptors.
- Scheduled jobs hoặc background workers.
- Upload file và xử lý stream.
- Database access.
- Các thư viện dùng `node:fs`, `net`, `tls`, native bindings, child processes hoặc APIs không có trong Workers runtime.
- CORS, cookies, JWT/session và cách lưu secrets.

### 8.2. Chọn hướng triển khai

**Hướng A — Refactor API để phù hợp Workers**

Phù hợp nếu muốn hệ thống chạy chủ yếu trên Cloudflare và API có thể chuyển sang runtime tương thích. Có thể cần thay đổi entrypoint, framework adapter, thư viện và cách truy cập database.

**Hướng B — Giữ backend ở một runtime Node.js khác**

Nếu backend phụ thuộc nhiều vào Node.js/MySQL hoặc cần background processes, có thể giữ backend ở môi trường hỗ trợ Node.js, đồng thời đưa frontend lên Cloudflare. Điều này giảm lượng refactor ban đầu nhưng có thể tạo chi phí hoặc thêm nhà cung cấp.

### 8.3. Chuyển theo lát cắt nhỏ

Không chuyển toàn bộ API cùng lúc:
1. Chọn một endpoint đơn giản, không làm thay đổi dữ liệu.
2. Đưa endpoint lên môi trường development.
3. Kiểm tra auth, validation, lỗi, CORS và log.
4. Chuyển một nhóm endpoint tiếp theo.
5. Chỉ chuyển traffic sau khi test đạt yêu cầu.

---

## 9. Giai đoạn 4 — Database

Cloudflare D1 là database SQL dựa trên SQLite, không phải MySQL tương thích hoàn toàn. Vì vậy, **không được coi việc đổi connection string là đủ để chuyển MySQL sang D1**.

### 9.1. Kiểm tra khả năng tương thích

- Provider trong `schema.prisma`.
- Kiểu dữ liệu và default values.
- Auto-increment/ID generation.
- Unique constraints, indexes và foreign keys.
- Raw SQL có cú pháp riêng của MySQL.
- Transaction và mức cô lập cần thiết.
- JSON, date/time, collation và xử lý timezone.
- Cách quản lý connection và pooling.
- Kích thước dữ liệu, số lượng query và pattern đọc/ghi.

### 9.2. Lựa chọn

- **D1:** cân nhắc khi schema và workload có thể điều chỉnh phù hợp với SQLite/D1.
- **Giữ MySQL:** cân nhắc khi ứng dụng đang phụ thuộc đáng kể vào MySQL hoặc cần tránh refactor database ngay.
- **Database khác:** chỉ xem xét khi có yêu cầu kỹ thuật cụ thể; đánh giá chi phí, độ trễ và độ phức tạp vận hành.

### 9.3. Quy trình migration an toàn

1. Liệt kê bảng, quan hệ, indexes và constraints.
2. Xác định mapping kiểu dữ liệu.
3. Viết migration/schema đích.
4. Thử migration trên dữ liệu mẫu.
5. So sánh row counts và các phép kiểm tra nghiệp vụ.
6. Kiểm tra các luồng create/read/update/delete.
7. Lập kế hoạch cutover và rollback.
8. Chỉ chuyển production sau khi backup và xác minh restore.

Không chạy migration phá hủy trên database production trong quá trình thử nghiệm.

---

## 10. Giai đoạn 5 — Realtime, WebSocket và phòng nghe nhạc

Music Room có chức năng phòng nghe nhạc và đồng bộ trạng thái, nên realtime là phần cần audit kỹ.

### 10.1. Xác định protocol hiện tại

Ghi lại:
- Tên Socket.IO events client gửi và server phát.
- Cấu trúc payload.
- Quy trình join/leave room.
- Cách xác thực khi kết nối.
- Cách xử lý reconnect.
- Ai là nguồn sự thật cho trạng thái phát nhạc.
- Queue, current track, playback position và trạng thái pause/play được lưu ở đâu.
- Có adapter, Redis hoặc nhiều backend instances hay không.

### 10.2. Đánh giá Durable Objects + WebSocket

Durable Objects có thể phù hợp để quản lý trạng thái của từng phòng và xử lý kết nối WebSocket, nhưng cần thiết kế lại protocol nếu code hiện tại dùng Socket.IO-specific features.

Cần kiểm tra:
- Mapping giữa room ID và Durable Object ID.
- Xác thực khi upgrade WebSocket.
- Broadcast sự kiện cho thành viên phòng.
- Xử lý kết nối ngắt, reconnect và thành viên rời phòng.
- Tính nhất quán khi hai người thay đổi queue gần như đồng thời.
- Khôi phục trạng thái sau khi kết nối bị mất.
- Giới hạn và quotas của gói Cloudflare đang dùng.

WebSocket thuần không tự động tương thích với Socket.IO client/server. Nếu thay đổi protocol, frontend và backend phải chuyển đổi đồng bộ hoặc có lớp tương thích được kiểm chứng.

### 10.3. Thử nghiệm vertical slice

Trước khi chuyển mọi chức năng:
1. Client A tạo phòng.
2. Client B tham gia cùng phòng.
3. A gửi một thay đổi trạng thái.
4. B nhận được trạng thái đúng.
5. B reload hoặc reconnect.
6. Xác minh trạng thái và quyền truy cập.
7. Thử nhiều thao tác gần đồng thời.

Chỉ sau khi lát cắt này ổn định mới mở rộng sang queue và đồng bộ playback đầy đủ.

---

## 11. Giai đoạn 6 — Environment variables và secrets

Tạo danh sách biến môi trường theo thành phần và môi trường.

Ví dụ cấu trúc tài liệu (chỉ ghi tên biến, không ghi giá trị bí mật):

```text
Frontend
- NEXT_PUBLIC_API_URL
- NEXT_PUBLIC_WS_URL          # nếu frontend cần URL WebSocket

Backend
- DATABASE_URL                # nếu runtime/backend dùng
- JWT_SECRET                  # nếu ứng dụng dùng
- YOUTUBE_API_KEY             # nếu ứng dụng dùng
- CORS_ORIGIN                 # nếu cấu hình hiện tại cần
```

Đây chỉ là tên biến minh họa; cần đối chiếu với source code thực tế. Các biến có tiền tố `NEXT_PUBLIC_` thường được đưa vào bundle client, vì vậy **không đặt secret ở các biến này**.

Quy tắc:
- Dùng Cloudflare secrets/bindings phù hợp với từng runtime.
- Tách development và production.
- Không commit `.env`.
- Không in secret ra log.
- Sau khi deploy, kiểm tra các biến có đúng môi trường và đúng tên hay không.

---

## 12. Giai đoạn 7 — Deploy thử và domain

### 12.1. Giai đoạn đầu: dùng domain mặc định

Dùng URL mặc định được Cloudflare cấp để xác minh:
- Frontend tải được.
- Frontend gọi đúng API.
- CORS và authentication hoạt động.
- WebSocket kết nối được nếu đã triển khai realtime.
- Không có secret bị lộ ở client bundle.

### 12.2. Giai đoạn sau: gắn domain riêng

Có thể cân nhắc cấu trúc hostname như:

```text
music.khanhcs.id.vn       -> frontend
api.music.khanhcs.id.vn   -> API
```

Đây là tên gợi ý, chưa phải DNS record đã được tạo.

Trước khi thay đổi DNS:
1. Kiểm tra nơi đang quản lý DNS hiện tại.
2. Ghi lại toàn bộ DNS records đang dùng, bao gồm email và các dịch vụ khác.
3. Xác định cách Cloudflare yêu cầu cấu hình domain/custom hostname cho sản phẩm được chọn.
4. Nếu chuyển nameserver, sao chép và xác minh các record cần thiết trước khi đổi.
5. Kiểm tra domain sau khi cấu hình và có phương án quay lại nếu dịch vụ hiện có bị ảnh hưởng.

Không cần dùng Cloudflare Tunnel cho một API đã chạy trên Workers. Tunnel thường phục vụ việc kết nối Cloudflare tới dịch vụ chạy trên máy/host do mình quản lý, không phải điều kiện bắt buộc để deploy Workers.

---

## 13. Giai đoạn 8 — Kiểm thử nghiệm thu

### Chức năng

- [ ] Frontend tải thành công trên URL deployment.
- [ ] Đăng ký/đăng nhập hoạt động.
- [ ] Authentication và authorization được giữ nguyên.
- [ ] Tìm kiếm YouTube hoạt động nếu đây là tính năng hiện có.
- [ ] Tạo phòng và tham gia phòng.
- [ ] Thành viên nhận đúng trạng thái phòng.
- [ ] Thêm/xóa/reorder queue.
- [ ] Play/pause/seek đồng bộ đúng theo thiết kế.
- [ ] Reload và reconnect không làm hỏng trạng thái.
- [ ] Xử lý thành viên rời phòng.
- [ ] Các lỗi API trả về status và message phù hợp.
- [ ] CORS không cho phép origin ngoài dự kiến.
- [ ] Không có secret trong bundle frontend hoặc log.

### Vận hành

- [ ] Có log đủ để chẩn đoán lỗi.
- [ ] Có kiểm tra quota/usage trong Cloudflare Dashboard.
- [ ] Đã thử trường hợp quá tải hoặc lỗi kết nối ở mức cơ bản.
- [ ] Đã ghi lại cách rollback.
- [ ] Đã kiểm tra backup/restore database nếu có dữ liệu cần bảo toàn.
- [ ] Đã kiểm tra URL production và URL development không bị nhầm.
- [ ] Không còn phụ thuộc vào dịch vụ local không được deploy.

---

## 14. Free tier, quotas và chi phí

Cloudflare có các gói miễn phí với hạn mức theo từng sản phẩm. Hạn mức, điều kiện và cách tính có thể thay đổi theo thời gian; cần kiểm tra trang pricing/limits chính thức trước khi production.

Các hạng mục cần đánh giá:
- Workers requests và CPU time.
- Durable Objects requests, thời gian hoạt động và lưu trữ.
- D1 rows read/write, dung lượng và giới hạn query.
- Băng thông, build/deployment và các tính năng theo sản phẩm.
- Dịch vụ ngoài Cloudflare, chẳng hạn database MySQL hiện tại, API bên thứ ba hoặc hosting còn giữ lại.

**Free tier không đồng nghĩa không giới hạn hoặc đảm bảo mọi thành phần của ứng dụng đều miễn phí.** Đo tải thực tế và kiểm tra usage sau khi triển khai thử.

---

## 15. Rollback và xử lý sự cố

Trước mỗi đợt thay đổi lớn:
- Tạo commit/branch có thể khôi phục.
- Ghi lại deployment đang chạy tốt.
- Không thay đổi frontend, API, realtime và database cùng lúc nếu không cần thiết.
- Có kế hoạch khôi phục dữ liệu trước khi thay schema.
- Nếu có thể, giữ endpoint/backend cũ cho tới khi bản mới vượt qua kiểm thử.

Khi deployment lỗi:
1. Xem build log và runtime log.
2. Xác định lỗi thuộc build, environment, API, database hay WebSocket.
3. Rollback về bản deploy ổn định nếu lỗi ảnh hưởng người dùng.
4. Tái hiện lỗi ở development.
5. Sửa một nguyên nhân mỗi lần và chạy lại checklist.

---

## 16. Lộ trình triển khai theo thứ tự ưu tiên

| Giai đoạn | Công việc | Điều kiện hoàn tất |
|---|---|---|
| 0 | Audit monorepo và dependency | Có bản đồ thành phần, env vars, API/realtime protocol |
| 1 | Tạo branch, chuẩn bị Cloudflare/Wrangler | Môi trường thử nghiệm sẵn sàng |
| 2 | Kiểm tra khả năng deploy frontend | Frontend hoạt động trên URL thử nghiệm |
| 3 | Xác minh phương án database | Có schema/migration và kế hoạch rollback |
| 4 | Chuyển một API nhỏ | Endpoint hoạt động và được kiểm thử |
| 5 | Prototype WebSocket/room | Hai client đồng bộ được trạng thái cơ bản |
| 6 | Mở rộng API, auth và database | Các test nghiệp vụ đạt yêu cầu |
| 7 | Hoàn thiện frontend và tích hợp | Luồng end-to-end hoạt động |
| 8 | Kiểm thử tải nhẹ, quota và bảo mật | Đạt checklist nghiệm thu |
| 9 | Gắn domain riêng (tùy chọn) | DNS và hostname được xác minh |
| 10 | Production và theo dõi | Có log, rollback và quy trình xử lý sự cố |

Các giai đoạn có thể điều chỉnh sau audit; không nên cam kết thời gian hoàn thành trước khi biết mức độ tương thích của các dependency.

---

## 17. Việc cần làm ngay

Thực hiện theo thứ tự này:

1. Mở repo `cs-khanh/music-room` và kiểm tra `git status`.
2. Tạo branch `refactor/cloudflare`.
3. Thu thập cấu trúc thư mục và nội dung các `package.json` (loại bỏ secrets nếu có).
4. Kiểm tra Next.js, NestJS, Prisma/database, Socket.IO/WebSocket và Redis.
5. Quyết định frontend có thể static hay cần server runtime.
6. Chọn chiến lược database trước khi viết migration.
7. Làm prototype một phòng + WebSocket.
8. Sau khi các lựa chọn kỹ thuật rõ ràng, mới thiết lập pipeline deploy tự động và cân nhắc domain.

### Kết luận

**Giữ nguyên monorepo và triển khai từng thành phần riêng biệt là hướng khởi đầu hợp lý.** Connect GitHub với Cloudflare giúp tự động hóa deploy nhưng không bắt buộc. Rủi ro kỹ thuật lớn nhất không nằm ở việc có tách repo hay không, mà ở khả năng tương thích của Next.js/NestJS, database và protocol realtime với môi trường Cloudflare được chọn.
