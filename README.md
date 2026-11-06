# Cafe Workforce Management — D'lat Cafe

Hệ thống **Quản lý Nhân sự, Ca làm việc, Chấm công QR động & Tính lương theo giờ** dành cho mô hình quán cà phê / F&B quy mô 10–20 nhân viên.

Dự án được xây dựng theo chuẩn Production-ready với đầy đủ 6 Milestones: Phân quyền đa cấp (RBAC), Đăng ký lịch rảnh, Lịch tuần kéo-thả, Máy xếp ca tự động Greedy (Hard/Soft constraints), Nghỉ phép & Đổi ca 2 bước, Chấm công QR chống gian lận (Kiosk + Scanner), Tính công 4 tầng, Tính lương VND số nguyên BigInt, Báo cáo biểu đồ Recharts, Xuất Excel/CSV có UTF-8 BOM, Nhật ký kiểm toán Audit Logs, PWA, Rate Limiting và Docker Production.

---

## 1. Kiến trúc & Công nghệ

- **Framework:** Next.js 15.5 (App Router) + React 19 + TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`)
- **Cơ sở dữ liệu:** PostgreSQL 17 + Prisma ORM 6.6 (19 bảng chuẩn hóa UUID PK, quan hệ khóa ngoại, `BigInt` VND, `Decimal(6,2)` giờ công)
- **Xác thực & Phân quyền:** HTTP-only JWT Session (`jose` + `bcryptjs`) + Server-side RBAC 3 vai trò (`OWNER`, `MANAGER`, `EMPLOYEE`) + Kiểm tra tài khoản trực tiếp từ DB
- **Giao diện:** Tailwind CSS + Radix UI / shadcn/ui + Lucide Icons (Giao diện Tiếng Việt 100%, chuẩn múi giờ `Asia/Ho_Chi_Minh`, định dạng `DD/MM/YYYY`, giờ `HH:mm` và tiền tệ `₫`)
- **Biểu đồ & Xuất dữ liệu:** Recharts 2.15 + XLSX + CSV UTF-8 BOM (`\uFEFF`)
- **PWA & Mobile:** Web App Manifest + Service Worker offline fallback + Camera QR Scanner (`html5-qrcode`)
- **Bảo mật & Rate-limiting:** In-memory Sliding-Window Rate Limiter cho Login, Kiosk Token, QR Scan, Tính lương + HTTP Security Headers (CSP, X-Frame-Options, X-Content-Type-Options)
- **Kiểm thử:** Vitest (11 suites, 64 unit tests green 100%) + Playwright E2E

---

## 2. Yêu cầu môi trường

- **Node.js:** `>= 20.x` (khuyến nghị `v22` hoặc `v24`)
- **Docker Desktop:** Để khởi chạy PostgreSQL 17 container hoặc toàn bộ cụm container Production.

---

## 3. Hướng dẫn cài đặt & Khởi chạy Nhanh

### Cách A: Chạy Development (Khuyến nghị cho phát triển)

#### Bước 1: Khởi chạy cơ sở dữ liệu PostgreSQL
```bash
docker compose up -d
```
Container `cafe-workforce-db` sẽ lắng nghe tại `127.0.0.1:5433` (Database: `cafe_workforce`).

#### Bước 2: Cài đặt thư viện, chạy Migration & Seed dữ liệu mẫu
> **Lưu ý trên Windows PowerShell:** Sử dụng `npm.cmd` và `npx.cmd`.

```bash
npm.cmd install
npx.cmd prisma migrate dev
npm.cmd run db:seed
```

#### Bước 3: Chạy ứng dụng ở chế độ phát triển
```bash
npm.cmd run dev
```
Mở trình duyệt tại: `http://localhost:3000`

---

### Cách B: Chạy Production với Docker Compose

```bash
# Khởi chạy toàn bộ hệ thống gồm PostgreSQL 17 và Ứng dụng Next.js Standalone
docker compose -f docker-compose.production.yml up -d --build
```
Ứng dụng sẽ tự động biên dịch multi-stage Dockerfile tối ưu và chạy tại: `http://localhost:3000`

---

## 4. Tài khoản Demo (Dữ liệu Seed D'lat Cafe)

Mật khẩu dùng chung cho tất cả tài khoản mẫu: `Admin@123` (với Quản lý/Chủ quán) hoặc `Staff@123` (với Nhân viên).

| Vai trò | Email | Mật khẩu | Quyền hạn & Chức năng |
|---|---|---|---|
| **Chủ quán (`OWNER`)** | `owner@dlatcafe.vn` | `Admin@123` | Toàn quyền hệ thống: Cài đặt quán, Duyệt & Khóa sổ lương, Xem Audit Logs, Quản lý tài chính |
| **Quản lý (`MANAGER`)** | `manager@dlatcafe.vn` | `Admin@123` | Quản lý lịch ca tuần, Chạy máy xếp ca tự động, Duyệt phép/đổi ca, Bật Kiosk QR, Duyệt chấm công, Tính bảng lương, Xuất báo cáo |
| **Pha chế (`EMPLOYEE`)** | `nam.le@dlatcafe.vn` | `Staff@123` | Giao diện di động nhân viên: Đăng ký lịch rảnh, Xem lịch ca, Tạo đơn nghỉ, Đổi ca, Quét QR chấm công, Xem bảng lương cá nhân |
| **Thu ngân (`EMPLOYEE`)** | `huong.tran@dlatcafe.vn` | `Staff@123` | Giao diện nhân viên thu ngân: Quét QR, xem phiếu lương, yêu cầu ca |
| **Phục vụ (`EMPLOYEE`)** | `minh.hoang@dlatcafe.vn` | `Staff@123` | Giao diện nhân viên phục vụ |
| **Nhân viên đã nghỉ (`INACTIVE`)** | `duyen.ly@dlatcafe.vn` | `Staff@123` | Đã khóa mềm: Tự động chặn đăng nhập và bảo toàn toàn bộ lịch sử công tác |

---

## 5. Tổng quan 16 Module Chức năng

1. **Xác thực & RBAC Server-side:**
   - Đăng nhập bảo mật JWT HTTP-only cookie, phân luồng tự động theo vai trò.
   - Giới hạn tần suất đăng nhập (Rate limit 10 lượt/phút chống dò mật khẩu brute-force).
2. **Quản lý Nhân sự (`/employees`):**
   - Hồ sơ nhân viên, ngày vào làm, giờ công mục tiêu/tuần, vị trí & kỹ năng linh hoạt.
   - Lưu trữ lịch sử đơn giá lương (`PayRate`) không bao giờ ghi đè; hỗ trợ vô hiệu hóa mềm (`INACTIVE`).
3. **Quản lý Vị trí & Kỹ năng (`/positions`):**
   - Cấu hình vị trí (Pha chế, Thu ngân, Phục vụ, Bảo vệ), màu sắc nhận diện, định biên và kỹ năng yêu cầu.
4. **Cấu hình Ca mẫu (`/shifts`):**
   - Ca Sáng (06:00–12:00), Ca Chiều (12:00–18:00), Ca Tối (18:00–23:00) có thể tùy biến thời gian và định biên nhân sự theo từng vị trí.
5. **Đăng ký Lịch rảnh (`/employee/availability`):**
   - Nhân viên gửi nguyện vọng làm việc cho tuần tới theo 3 trạng thái: *Sẵn sàng (`AVAILABLE`)*, *Muốn làm (`PREFERRED`)*, *Bận (`UNAVAILABLE`)*.
6. **Quản lý Lịch tuần Đa chế độ xem (`/schedules`):**
   - 4 chế độ xem trực quan: Lưới ngày-ca, Theo nhân viên, Theo vị trí, Dạng dòng thời gian Timeline.
   - Thao tác kéo-thả chuyển ca, thêm/xóa phân công, phát hiện cảnh báo trùng ca và xung đột lịch bận.
   - Quy trình xuất bản lịch chính thức, khóa lịch chống sửa và lưu vết lịch sử phiên bản (`revisions`).
7. **Máy Xếp ca Tự động Greedy (`Auto-scheduler`):**
   - Áp dụng các ràng buộc cứng (Hard constraints): không trùng ca, tôn trọng đơn nghỉ đã duyệt, không xếp vào ca bận, đúng kỹ năng yêu cầu, đảm bảo thời gian nghỉ tối thiểu giữa 2 ca liên tiếp.
   - Tối ưu hóa ràng buộc mềm (Soft constraints): ưu tiên ca nguyện vọng, cân bằng tổng giờ công tuần giữa các nhân viên, chia đều ca cuối tuần.
   - Báo cáo rõ ràng: số ca đã xếp, ca còn thiếu nhân sự, ước tính chi phí lương dự kiến và giải thích lý do gán ca.
8. **Đơn Xin Nghỉ phép (`/requests` & `/employee/requests`):**
   - Nhân viên gửi đơn kèm lý do; Quản lý xét duyệt trực quan.
   - Khi duyệt, hệ thống tự động gỡ phân công ca bị trùng và đề xuất danh sách nhân viên thay thế phù hợp.
9. **Đổi ca Làm việc 2 bước (`Shift Swap`):**
   - Bước 1: Nhân viên chọn ca cần đổi và gửi lời mời đến đồng nghiệp. Đồng nghiệp chấp thuận hoặc từ chối.
   - Bước 2: Quản lý thẩm định và phê duyệt cuối cùng. Hệ thống hoán đổi ca bằng Database Transaction an toàn.
10. **Chấm công QR Động Kiosk & Camera di động (`/attendance/kiosk` & `/employee/attendance`):**
    - Màn hình Kiosk tại quán tạo mã QR chứa token mã hóa ngẫu nhiên an toàn (CSPRNG), chỉ lưu hash SHA-256 trên server, hết hạn sau 40 giây.
    - Nhân viên mở camera trên điện thoại quét mã: hỗ trợ 4 sự kiện chuẩn F&B (`CLOCK_IN`, `BREAK_START`, `BREAK_END`, `CLOCK_OUT`).
    - Chống gian lận: chống dùng lại mã QR cũ, chống chụp ảnh gửi người khác, chặn chấm công trùng lặp.
11. **Duyệt Chấm công & Xử lý Dị thường (`/attendance`):**
    - Bộ tính toán giờ công 4 tầng độc lập: Giờ theo lịch (`Scheduled`), Giờ thực tế có mặt (`Worked`), Giờ quản lý duyệt (`Approved`), Giờ được trả lương (`Paid`).
    - Tự động nhận diện đi trễ, về sớm, trừ giờ nghỉ giải lao, cảnh báo quên quét thẻ ra về.
    - Modal điều chỉnh công thủ công yêu cầu bắt buộc nhập lý do và ghi nhận Audit Log.
12. **Tính Lương theo Giờ VND (`/payroll` & `/payroll/[id]`):**
    - Công thức chuẩn F&B: `Lương cơ bản = Giờ công được trả lương * Snapshot đơn giá lương lịch sử`.
    - Tính hệ số làm thêm giờ (Overtime 1.5x), phụ cấp trách nhiệm/ăn ca, tiền thưởng doanh số, các khoản khấu trừ.
    - Vòng đời kỳ lương khép kín: `DRAFT -> CALCULATED -> REVIEWED -> APPROVED -> PAID -> LOCKED`.
    - Bảo vệ khóa sổ kế toán (`LOCKED`): Chủ quán khóa sổ ngăn chặn mọi sửa đổi trái phép sau khi đã chi trả.
    - Cổng nhân viên xem phiếu lương cá nhân chi tiết từng mục (`/employee/payroll`).
13. **Báo cáo & Phân tích Trực quan Recharts (`/reports`):**
    - Biểu đồ cột xu hướng chi phí lương theo kỳ.
    - Biểu đồ tròn cơ cấu nhân sự theo vị trí công việc.
    - Biểu đồ tròn tỷ lệ tuân thủ chấm công 30 ngày (Đúng giờ, Đi trễ, Về sớm, Dị thường).
14. **Xuất Báo cáo Excel & CSV Tiếng Việt:**
    - Xuất bảng lương và dữ liệu chấm công chi tiết ra file CSV tích hợp sẵn chuẩn **UTF-8 BOM (`\uFEFF`)**, mở trực tiếp trên Microsoft Excel tiếng Việt không bị lỗi font hay vỡ dấu (`mojibake`).
15. **Nhật ký Kiểm toán Hệ thống (`/audit`):**
    - Dành riêng cho Chủ quán (`OWNER`): lưu vết đầy đủ mọi thao tác nhạy cảm (Đăng nhập, Tạo/xóa nhân sự, Xuất bản lịch, Điều chỉnh giờ công, Duyệt lương, Khóa sổ).
    - Bộ lọc đa chiều theo hành động, thực thể và nhân viên; modal xem chi tiết thay đổi (Old Values vs New Values).
16. **Hỗ trợ PWA & Cài đặt Hệ thống (`/settings`):**
    - Cài đặt làm ứng dụng PWA trên điện thoại và máy tính bảng (Web App Manifest, Service Worker offline fallback, app icons).
    - Cấu hình quy định quán: thời gian làm việc, mức phạt đi trễ, tỷ lệ tăng ca, thông tin liên hệ.

---

## 6. Lệnh Kiểm thử & Kiểm định chất lượng

```bash
# 1. Kiểm tra toàn bộ Type TypeScript ở chế độ nghiêm ngặt (0 lỗi)
npm.cmd run typecheck

# 2. Kiểm tra quy tắc mã nguồn ESLint (0 lỗi, 0 cảnh báo)
npm.cmd run lint

# 3. Chạy toàn bộ 11 bộ Unit & Integration Tests (64/64 tests pass)
npm.cmd test

# 4. Kiểm định Build Production độc lập (Standalone Next.js)
npm.cmd run build
```

---

## 7. Cấu trúc Thư mục Dự án

```text
cafe-workforce/
├── Dockerfile                     # Multi-stage production Docker build (Node 22 Alpine + Standalone)
├── docker-compose.yml             # Cụm database PostgreSQL phục vụ development
├── docker-compose.production.yml  # Cụm Production hoàn chỉnh (PostgreSQL 17 + App Standalone)
├── public/                        # Static assets, Web App Manifest, Service Worker & Icons
│   ├── manifest.json              # PWA Web App Manifest
│   ├── sw.js                      # Service Worker offline fallback
│   └── icons/                     # Biểu tượng quán cà phê D'lat
├── prisma/
│   ├── schema.prisma              # Schema PostgreSQL chuẩn hóa (19 bảng, UUID, BigInt VND)
│   ├── migrations/                # Lịch sử các migration database
│   └── seed.ts                    # Dữ liệu khởi tạo chuẩn quán D'lat Cafe
├── src/
│   ├── app/                       # Next.js App Router (48 routes: Pages & REST API)
│   ├── components/                # React UI Components chuẩn Tailwind & shadcn
│   │   ├── attendance/            # Kiosk QR, Scanner, Review & Correction Modal
│   │   ├── audit/                 # Audit Log Viewer & JSON Diff Modal
│   │   ├── employee/              # Mobile Employee Views: Ca làm, Chấm công, Lịch rảnh, Phiếu lương
│   │   ├── layout/                # Desktop Management Shell & Mobile Employee Shell
│   │   ├── payroll/               # Quản lý kỳ lương, Tính lương, Điều chỉnh khoản chi
│   │   ├── reports/               # Dashboard phân tích biểu đồ Recharts & Xuất CSV
│   │   ├── schedule/              # Lịch tuần 4 views, Kéo thả, Gợi ý tự động
│   │   └── ui/                    # Thư viện UI nguyên tử (Dialog, Button, Badge, Card, Select...)
│   ├── lib/                       # Core utilities (Tiền tệ BigInt, Thời gian, QR CSPRNG, Rate-limiter)
│   └── modules/                   # Tầng Business Logic & Services độc lập
│       ├── attendance/            # QR Attendance Service & 4-tier Hours Calculator
│       ├── audit/                 # Audit Log Service
│       ├── auth/                  # Authentication & Password Hashing
│       ├── availability/          # Employee Availability Service
│       ├── employee/              # Employee Management Service
│       ├── leave/                 # Leave Request & Unassign/Recommend Service
│       ├── payroll/               # Payroll Calculation Engine & Lifecycle Service
│       ├── position/              # Position & Skill Management
│       ├── reports/               # Reports & Analytics Service
│       ├── schedule/              # Schedule Service & Greedy Auto-scheduling Engine
│       └── swap/                  # Shift Swap 2-step Approval Service
└── tests/
    └── unit/                      # 11 test suites kiểm định nghiệp vụ lõi (64 tests)
```

---

## 8. Tác giả & Giấy phép

Được thiết kế và phát triển riêng cho mô hình quản trị chuỗi và quán cà phê **D'lat Cafe**.
Sẵn sàng đưa vào vận hành thực tế.
