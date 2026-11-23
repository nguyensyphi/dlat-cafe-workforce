# Hướng dẫn Triển khai Production 24/7 — D'Lat Cafe Workforce

Tài liệu này hướng dẫn triển khai trọn gói hệ thống **D'Lat Cafe Workforce** chạy ổn định 24/7 với:
- **Next.js 15 Standalone + PostgreSQL 17** trong Docker.
- **HTTPS tự động** (bắt buộc cho PWA di động và Camera quét QR chấm công) với **2 chế độ chọn linh hoạt**:
  - **Chế độ 1 (`--profile tunnel`):** Máy tính / Mini-PC đặt tại quán (Cloudflare Tunnel miễn phí, không cần IP tĩnh hay mở port modem).
  - **Chế độ 2 (`--profile vps`):** Máy chủ Cloud VPS có IP công khai + tên miền riêng (Caddy tự cấp & gia hạn SSL Let's Encrypt).
- **Tự động sao lưu DB hàng ngày lúc `03:00` sáng (`Asia/Ho_Chi_Minh`)**, tự động nén `.sql.gz` và giữ 14 bản gần nhất tại `./backups/`.
- **Tự động chạy Cron nhắc ca làm việc** (`ENABLE_IN_PROCESS_CRON=true`).

---

## Bước 1: Chuẩn bị Biến Môi trường (`.env`)

Sao chép từ `.env.example` sang `.env` (nếu chưa có) và cập nhật các giá trị bảo mật:

```bash
cp .env.example .env
```

Các biến quan trọng cần kiểm tra trong `.env`:
- **Bảo mật bắt buộc:**
  - `POSTGRES_PASSWORD`: Đổi sang mật khẩu mạnh.
  - `JWT_SECRET`: Chuỗi ngẫu nhiên tối thiểu 64 ký tự.
  - `CRON_SECRET`: Chuỗi ngẫu nhiên bảo vệ API `/api/cron/shift-reminders`.
  - `ENABLE_IN_PROCESS_CRON="true"`: Bật tự động nhắc nhân viên trước giờ vào ca / tan ca.
  - `NEXT_PUBLIC_APP_URL`: Tên miền HTTPS chính thức của quán (VD: `https://workforce.dlatcafe.vn`).
- **Thông báo đa kênh (tùy chọn — bỏ trống nếu chưa dùng):**
  - **Telegram:** `TELEGRAM_BOT_TOKEN` (tạo từ `@BotFather`), `TELEGRAM_DEFAULT_CHAT_ID`.
  - **Email:** `RESEND_API_KEY` + `EMAIL_FROM` *(hoặc `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`)*.
  - **Zalo:** `ZALO_OA_ACCESS_TOKEN` + `ZALO_ZNS_TEMPLATE_ID` *(hoặc `ZALO_WEBHOOK_URL` + `ZALO_WEBHOOK_SECRET`)*.

---

## Bước 2: Khởi chạy Theo Chế độ Hạ tầng

### Chế độ 1: Máy tính / Mini-PC tại quán (Cloudflare Tunnel — Không cần mở port)
1. Vào [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com) → **Networks → Tunnels → Create a tunnel**.
2. Copy **Tunnel Token** dán vào `CLOUDFLARE_TUNNEL_TOKEN="..."` trong tệp `.env`.
3. Trong phần **Public Hostname** của Tunnel trên Cloudflare, trỏ tên miền (VD: `workforce.dlatcafe.vn`) về Service: **`http://app:3000`**.
4. Khởi chạy toàn bộ cụm Docker:
   ```bash
   docker compose -f docker-compose.production.yml --profile tunnel up -d --build
   ```

### Chế độ 2: Cloud VPS có IP công khai (Caddy SSL tự động)
1. Trỏ bản ghi DNS `A` của tên miền (VD: `workforce.dlatcafe.vn`) về IP công khai của VPS và mở cổng `80`, `443` trên tường lửa.
2. Điền `APP_DOMAIN="workforce.dlatcafe.vn"` vào tệp `.env`.
3. Khởi chạy toàn bộ cụm Docker:
   ```bash
   docker compose -f docker-compose.production.yml --profile vps up -d --build
   ```
   Caddy sẽ tự động xin chứng chỉ HTTPS Let's Encrypt trong vòng 10–30 giây.

---

## Bước 3: Khởi tạo Cơ sở dữ liệu (chỉ chạy lần đầu trên DB trống)

Sau khi container `postgres` và `app` đã `healthy`:
```bash
# Đồng bộ cấu trúc bảng Prisma
docker compose -f docker-compose.production.yml exec app npx prisma db push

# (Tùy chọn) Tạo tài khoản Chủ quán & dữ liệu khởi đầu nếu DB hoàn toàn trống
docker compose -f docker-compose.production.yml exec app npm run db:seed
```

Kiểm tra trạng thái cụm dịch vụ:
```bash
docker compose -f docker-compose.production.yml ps
```

---

## Bước 4: Sao lưu & Khôi phục Cơ sở dữ liệu

### Tự động (24/7)
Container `dlat_postgres_backup` chạy tự động lúc **03:00 sáng hàng ngày (`Asia/Ho_Chi_Minh`)**, lưu tệp nén vào thư mục `./backups/dlat_cafe_YYYYMMDD_HHMMSS.sql.gz` và tự xóa bản cũ hơn 14 ngày.

### Sao lưu thủ công tức thì (1 lệnh)
- **Windows PowerShell:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1
  ```
- **Linux / macOS:**
  ```bash
  bash ./scripts/backup-db.sh
  ```

### Khôi phục dữ liệu từ bản sao lưu (1 lệnh)
- **Windows PowerShell:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\restore-db.ps1 -BackupFile .\backups\dlat_cafe_20261123_030000.sql.gz
  ```
- **Linux / macOS:**
  ```bash
  bash ./scripts/restore-db.sh ./backups/dlat_cafe_20261123_030000.sql.gz
  ```

---

## Bước 5: Hướng dẫn Nhân viên Cài đặt Ứng dụng PWA trên Điện thoại

1. **iPhone (Safari):**
   - Mở đường dẫn HTTPS của quán bằng **Safari**.
   - Bấm biểu tượng **Chia sẻ (Share)** ở cạnh dưới → chọn **"Thêm vào MH chính" (Add to Home Screen)** → bấm **Thêm**.
2. **Android (Google Chrome):**
   - Mở đường dẫn HTTPS của quán bằng **Chrome**.
   - Bấm biểu tượng **3 chấm** góc trên phải → chọn **"Cài đặt ứng dụng" (Install app)**.
3. **Cài đặt thông báo cá nhân:**
   - Nhân viên đăng nhập → vào mục **Cá nhân (`/employee/profile`)** → nhập **Telegram Chat ID / Zalo User ID** và bật kênh nhận tin.
   - Chủ quán vào **Cài đặt (`/settings`)** → nhập **Telegram Chat ID nhóm quán** → bấm **"Gửi thử thông báo"** để xác nhận tin nhắn đổ về điện thoại ngay lập tức.
