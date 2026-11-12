# QR Shift Registration & Smart Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng hệ thống Đăng ký ca làm việc siêu tốc qua mã QR (xác thực nhanh bằng 4 số cuối SĐT, không cần mật khẩu) và Bàn làm việc Xếp lịch thông minh cho Quản lý D'lat Cafe với định biên vị trí và xếp lịch tự động 1-chạm.

**Architecture:** 
- Public Route `/register-schedule?week=YYYY-MM-DD` cho phép nhân viên quét mã QR mở form đăng ký di động mà không bị chặn bởi Auth Middleware.
- API công khai xác thực bảo mật nhẹ nhàng bằng đối chiếu 4 số cuối SĐT nhân viên (`employee.phone.slice(-4)`), chống sửa đổi lén và lưu trực tiếp vào bảng `Availability`.
- Tích hợp Modal sinh mã QR (cho phép in poster hoặc tải ảnh gửi Zalo) và thanh theo dõi tiến độ nộp đăng ký tại `/schedules`.
- Tích hợp Bản đồ nhiệt đăng ký (Availability Heatmap) và kích hoạt nút "Tự động xếp lịch tối ưu (1-Click Auto-Schedule)" trên lưới ca tuần của Quản lý.

**Tech Stack:** Next.js 15 (App Router, Server Actions, Client Components), TypeScript, Prisma ORM, PostgreSQL 18, Tailwind CSS, Lucide Icons, QRCode library, Vitest.

**Spec:** [Tài liệu thiết kế Phương án A đã duyệt trong cuộc thảo luận](file:///c:/Users/LENOVO/Downloads/KH%C3%94NG%20QUAN%20TR%E1%BB%8CNG/Qu%E1%BA%A3n%20l%C3%BD%20D'lat/cafe-workforce/docs/superpowers/plans/2026-11-12-qr-shift-registration-and-scheduling.md)

## Global Constraints
- Hệ thống chạy trên cổng `3005` (LAN IP: `http://192.168.2.182:3005`).
- Giữ nguyên cấu trúc cơ sở dữ liệu `cafe_workforce` trên PostgreSQL cổng `5433`.
- Tuân thủ múi giờ Việt Nam `Asia/Ho_Chi_Minh` (UTC+7).
- Đảm bảo thuật ngữ chuẩn quán cà phê Việt Nam: Ca Sáng, Ca Chiều, Ca Tối, Quầy Bar, Thu ngân, Phục vụ, Rảnh, Bận, Ưu tiên.

## Review Focus
1. Nhân viên nhập sai mã PIN (không khớp 4 số cuối SĐT) ➔ Báo lỗi thân thiện, không cho lưu dữ liệu.
2. Quá hạn chót nộp đăng ký (`availabilityDeadline`) ➔ Khóa form đăng ký, hiển thị thông báo đã đóng đợt nộp ca.
3. Nhân viên đổi ý nộp lại trước hạn chót ➔ Tự động cập nhật (upsert) bản ghi cũ, không tạo bản ghi rác trùng lặp.
4. Quản lý xếp lịch tự động không bao giờ xếp nhân viên vào ca họ đã đánh dấu "Bận" (`UNAVAILABLE`).
5. Giao diện mobile trên điện thoại phản hồi cảm ứng mượt mà (<50ms), chuyển đổi màu sắc Rảnh/Bận/Ưu tiên trực quan.

---

### Task 1: Public Registration API & PIN Authentication Module

**Files:**
- Create: `src/app/api/public/schedule-registration/route.ts`
- Create: `src/app/api/public/schedule-registration/submit/route.ts`
- Modify: `src/middleware.ts:20-60`
- Test: `tests/unit/public-schedule-registration.test.ts`

- [x] **Step 1.1**: Viết unit test kiểm thử logic xác thực 4 số cuối SĐT và lưu nguyện vọng ca rảnh.
- [x] **Step 1.2**: Cấu hình `src/middleware.ts` để cho phép truy cập công khai vào `/register-schedule` và `/api/public/schedule-registration` mà không chuyển hướng về `/login`.
- [x] **Step 1.3**: Triển khai `GET /api/public/schedule-registration?week=YYYY-MM-DD`:
  - Trả về thông tin tuần làm việc, hạn chót đăng ký, 3 mẫu ca (Sáng, Chiều, Tối).
  - Trả về danh sách nhân viên đang hoạt động (`status = 'ACTIVE'`: chỉ gồm `id`, `fullName`, `employeeCode`, `primaryPosition.name` - TUYỆT ĐỐI KHÔNG để lộ số điện thoại thô qua API).
- [x] **Step 1.4**: Triển khai `POST /api/public/schedule-registration/submit`:
  - Nhận `{ employeeId, pinCode, weekStart, preferences, weeklyDesiredShifts, note }`.
  - Truy vấn nhân viên, kiểm tra `employee.phone.trim().endsWith(pinCode)`. Nếu sai ➔ Trả về HTTP 401 "Mã PIN (4 số cuối SĐT) không chính xác".
  - Kiểm tra `availabilityDeadline`. Nếu đã hết hạn ➔ Trả về HTTP 400 "Đợt đăng ký lịch tuần này đã kết thúc".
  - Chạy Prisma `$transaction` để upsert toàn bộ các ca rảnh/bận/ưu tiên vào bảng `Availability`.
- [x] **Step 1.5**: Chạy `npx vitest run tests/unit/public-schedule-registration.test.ts` đảm bảo 100% test pass.

---

### Task 2: Mobile-First Public QR Registration Page (`/register-schedule`)

**Files:**
- Create: `src/app/register-schedule/page.tsx`
- Create: `src/components/public/quick-schedule-registration-client.tsx`

- [x] **Step 2.1**: Thiết kế giao diện Header nhận diện thương hiệu D'lat Cafe (Logo, Tuần làm việc, Đồng hồ đếm ngược hạn chót nộp ca).
- [x] **Step 2.2**: Xây dựng Bước 1: Chọn Tên nhân viên từ danh sách Dropdown có tìm kiếm nhanh.
- [x] **Step 2.3**: Xây dựng Bước 2: Nhập mã PIN 4 số bảo mật (bàn phím số tự động mở trên điện thoại `inputMode="numeric"`). Khi nhập đúng 4 số ➔ Tự động mở bảng đăng ký ca và khôi phục dữ liệu đã chọn trước đó (nếu có).
- [x] **Step 2.4**: Xây dựng Bước 3: Lưới ma trận 7 ngày (Thứ 2 đến Chủ nhật) x 3 ca (Sáng 06:00-12:00, Chiều 12:00-18:00, Tối 18:00-23:00):
  - Chạm 1 chạm để chuyển vòng tròn: 🟢 **Rảnh** ➔ ⭐ **Ưu tiên** ➔ ⚪ **Bận**.
  - Các nút chọn nhanh: "Rảnh tất cả ca sáng", "Rảnh tất cả ca tối", "Xóa chọn lại".
- [x] **Step 2.5**: Xây dựng Bước 4: Nhập số ca mong muốn làm trong tuần (VD: 4 ca, 5 ca) và ô ghi chú nguyện vọng riêng cho Quản lý.
- [x] **Step 2.6**: Nút bấm "Gửi đăng ký lịch tuần" kèm hiệu ứng thành công, lưu bản nháp vào LocalStorage để không bị mất dữ liệu nếu lỡ tay thoát trang.

---

### Task 3: Manager Scheduling QR Generator & Registration Progress Tracker

**Files:**
- Modify: `src/components/schedules/schedule-management-client.tsx`
- Create: `src/components/schedules/schedule-qr-modal.tsx`
- Create: `src/components/schedules/registration-progress-drawer.tsx`

- [x] **Step 3.1**: Tạo Modal sinh mã QR Đăng ký Lịch Tuần (`schedule-qr-modal.tsx`):
  - Hiển thị mã QR to rõ chứa đường link `http://192.168.2.182:3005/register-schedule?week=YYYY-MM-DD`.
  - Nút **"Tải ảnh Poster QR (Để in hoặc gửi Zalo)"**: Tạo file ảnh canvas đẹp mắt có logo D'lat Cafe, tiêu đề tuần, mã QR và dòng hướng dẫn *"Quét mã để đăng ký lịch tuần mới"*.
  - Nút **"Sao chép liên kết"** kèm thông báo đã chép vào bộ nhớ tạm.
- [x] **Step 3.2**: Tạo Component theo dõi tiến độ nộp đăng ký (`registration-progress-drawer.tsx`):
  - Hiển thị thanh tiến độ trực quan: *"Tiến độ nộp: 9/13 nhân sự đã gửi"*.
  - Bấm vào mở danh sách chi tiết: Tách rõ cột **"Đã nộp đăng ký (9)"** (hiện số ca đăng ký và ghi chú) vs **"Chưa nộp đăng ký (4)"** (kèm nút nhắc nhở).
- [x] **Step 3.3**: Tích hợp các nút công cụ này lên thanh điều hướng của trang Quản lý Lịch làm việc `/schedules`.

---

### Task 4: Availability Heatmap & 1-Click Auto-Schedule Integration

**Files:**
- Modify: `src/components/schedules/schedule-management-client.tsx`
- Modify: `src/modules/schedules/schedule.service.ts`

- [x] **Step 4.1**: Hiển thị Bản đồ nhiệt đăng ký (Availability Heatmap) trên từng ô ca làm việc:
  - Trên mỗi ca trực, hiển thị badge: `👥 X người rảnh / Cần Y`.
  - Tô màu trực quan: Đỏ (thiếu người so với định mức `minCount`), Xanh (vừa đủ), Vàng (dư người đăng ký).
  - Rê chuột / chạm vào để xem danh sách cụ thể nhân viên nào đăng ký ca đó.
- [x] **Step 4.2**: Kích hoạt nút **"✨ Tự động xếp lịch thông minh (1-Click Auto-Schedule)"**:
  - Khi bấm, hệ thống gọi thuật toán `GreedyScheduler` để tự động gán nhân sự vào ca theo đúng định mức vị trí (Barista, Thu ngân, Phục vụ), tôn trọng ca rảnh, ưu tiên ca mong muốn và tránh kẹp ca đêm-sáng.
  - Hiển thị bảng Xem trước (Preview) cho Quản lý trước khi Áp dụng (Apply).
- [x] **Step 4.3**: Bổ sung tính năng **"Xuất ảnh Lịch làm việc để gửi Zalo"**:
  - Chuyển toàn bộ bảng lịch 7 ngày thành một bức ảnh PNG/JPEG chuẩn để Quản lý lưu về máy và gửi thẳng vào nhóm Zalo nhân viên quán.

---

### Task 5: Rigorous Verification, Type Safety & Production Speed

- [x] **Step 5.1**: Chạy kiểm thử toàn bộ `npx.cmd vitest run tests/unit/public-schedule-registration.test.ts`.
- [x] **Step 5.2**: Chạy kiểm tra tĩnh `npx.cmd tsc --noEmit` đạt 0 lỗi biên dịch.
- [x] **Step 5.3**: Đóng gói Production `npm.cmd run build` và khởi động lại server cổng 3005.
- [x] **Step 5.4**: Chạy benchmark kiểm tra tốc độ trang `/register-schedule` đảm bảo tải tức thì dưới **50ms**.

