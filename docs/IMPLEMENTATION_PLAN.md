# Kế hoạch Triển khai — Cafe Workforce Management

Tài liệu đặc tả gốc: `../xếp ca/CAFE WORKFORCE MANAGEMENT agrremented rule.docx`

## Lộ trình 6 Milestones
1. **Milestone 1:** Khởi tạo dự án Next.js App Router (TypeScript strict), Docker PostgreSQL 17, Prisma Schema đầy đủ (19+ bảng chuẩn hóa UUID, `BigInt` VND, `Decimal` giờ), Seed dữ liệu thực tế D'lat Cafe, Xác thực JWT Cookie (`jose` + `bcryptjs`) & Phân quyền RBAC server-side (`OWNER`, `MANAGER`, `EMPLOYEE`), Quản lý Vị trí/Kỹ năng, Quản lý Nhân sự (đa kỹ năng, lịch sử đơn giá lương `PayRate`, lịch sử công tác `EmploymentHistory`, vô hiệu hóa mềm), Cấu hình Ca mẫu động từ DB, Cài đặt hệ thống & Giao diện SaaS Dashboard / Mobile Bottom Nav bằng tiếng Việt.
2. **Milestone 2:** Đăng ký lịch rảnh (Availability), Lịch làm việc theo tuần (Weekly/Daily/Employee/Shift views), Gán thủ công & Kéo-thả, Kiểm tra xung đột & lịch bận, Công bố / Khóa / Lưu trữ lịch & Lịch sử phiên bản (`ScheduleRevision`).
3. **Milestone 3:** Máy xếp ca tự động Greedy (Hard & Soft constraints + giải thích quyết định, giao diện mở cho Google OR-Tools CP-SAT), Xin nghỉ phép (phát hiện ca ảnh hưởng + gợi ý người thay), Đổi ca 2 bước duyệt (`Nhân viên B -> Quản lý`), Thông báo In-app.
4. **Milestone 4:** Chấm công QR Code động tại Kiosk (token CSPRNG lưu SHA-256 hash, hết hạn 30–60s, chống dùng lại) + Quét QR trên điện thoại (`CLOCK_IN`, `BREAK_START`, `BREAK_END`, `CLOCK_OUT`), Chấm công bù thủ công có lý do & audit, Bộ tính giờ công 4 tầng (`Scheduled`, `Worked`, `Approved`, `Paid`) & Màn hình duyệt công.
5. **Milestone 5:** Tính lương theo giờ VND (`PayrollPeriod`, snapshot đơn giá, tăng ca, phụ cấp, thưởng, khấu trừ, khóa sổ `LOCKED`), Báo cáo thống kê & Biểu đồ Recharts, Xuất CSV/XLSX, Nhật ký kiểm toán (`AuditLog`).
6. **Milestone 6:** PWA (`manifest.json`, service worker), Gia cố bảo mật & Rate Limiting, Tối ưu hiệu năng & Phân trang, `Dockerfile` & `docker-compose.yml` hoàn chỉnh cho Production, Kiểm thử tổng thể E2E.

