# QA Hardening & Advanced Acceptance Suite (TC25 - TC36) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai các biện pháp tăng cường chất lượng thực chiến (QA Hardening) và bộ kiểm thử mở rộng TC25 - TC36 dựa trên kinh nghiệm thực tế vận hành chuỗi F&B, bao gồm auto-save draft chống mất dữ liệu khi rớt mạng, kiểm soát chặt chẽ giá trị tiền mặt số âm và độ dài giải trình, cùng ma trận kiểm thử tự động toàn diện.

**Architecture:** 
1. **Frontend Resilience:** Tích hợp cơ chế tự động lưu nháp (`localStorage` auto-save & recovery) vào `ShiftHandoverWizard` để bảo vệ tiến độ kiểm kê 8 bước của nhân viên khi gặp sự cố mạng hoặc vô tình tải lại trang.
2. **Schema & Boundary Hardening:** Ràng buộc chặt chẽ trong Zod schema đối với số tiền két (`min(0)` không cho số âm), chặn các giá trị vô lý, và chuẩn hóa độ dài lý do chênh lệch (5 - 500 ký tự).
3. **Automated Test Matrix Extension (TC25 - TC36):** Mở rộng bộ kiểm thử nghiệm thu tự động từ 24 ca lên 36 ca kiểm thử, bao quát toàn bộ các tình huống biên, làm tròn lương lẻ, gian lận QR, ca vắt ngang kỳ lương, và tính bất biến của Audit Log.

**Tech Stack:** Next.js 15, TypeScript, Zod, Vitest, React Hooks, LocalStorage API, Prisma.

**Spec:** Tài liệu đặc tả 12, 12.1, 12.2, 13 và Bộ quy tắc kiểm thử thực chiến F&B QA.

## Global Constraints
- Tuân thủ ngôn ngữ giao diện tiếng Việt chuẩn quán cà phê.
- Giữ nguyên server trên port 3005 và database PostgreSQL trên port 5433.
- Tất cả unit tests phải chạy độc lập không phụ thuộc DB sống và đạt 100% pass rate.
- Tiền tệ hiển thị chuẩn VND, không làm tròn số float làm sai lệch tiền thanh toán.

## Review Focus
1. `cashExpenses` hoặc `openingCash` bị nhập số âm (`< 0`) làm sai lệch công thức đối soát.
2. Rớt mạng hoặc reload trang khi đang kiểm kê dở bước 5/8 làm mất dữ liệu nhân viên đã đếm.
3. Làm tròn số phút lẻ trong tính lương theo giờ dẫn đến tiền lương có phần thập phân hoặc lẻ dưới 1 đồng.
4. Ca làm việc xuyên đêm ngày cuối tháng (31/10 22:00 -> 01/11 03:00) bị tính nhầm vào kỳ lương tháng 11.
5. Nhân viên bị khóa tài khoản vẫn có thể gọi API nếu không kiểm tra `isActive` tại middleware / server auth.

---

### Task 1: Zod Validation & Boundary Safeguards for Cash Reconciliation
**Files:**
- Modify: `src/modules/handover/handover.validation.ts`
- Modify: `src/modules/handover/handover-calculator.ts`
- Test: `tests/unit/shift-handover.test.ts`

- [ ] Thêm validation `min(0)` cho các trường tiền mặt trong `cashReconciliationSchema` (không chấp nhận số âm).
- [ ] Ràng buộc `cashDiscrepancyReason` trong schema với `.min(5)` và `.max(500)`.
- [ ] Bổ sung unit test kiểm tra từ chối số âm và lý do quá ngắn / quá dài.

### Task 2: LocalStorage Auto-Save & Restore Draft in Handover Wizard
**Files:**
- Modify: `src/components/employee/shift-handover-wizard.tsx`

- [ ] Tích hợp `useEffect` lắng nghe thay đổi các state (quỹ két, kho nguyên liệu, thiết bị, vệ sinh, ghi chú) và tự động ghi vào `localStorage` với key `dlat_handover_draft_${shift.id}`.
- [ ] Khi mở wizard, kiểm tra nếu có bản nháp chưa nộp, tự động khôi phục dữ liệu và hiển thị thông báo nhẹ: *"Đã khôi phục dữ liệu kiểm kê chưa nộp từ thiết bị của bạn"*.
- [ ] Thêm nút "Xóa nháp & Nhập lại từ đầu" để nhân viên chủ động làm mới khi cần.
- [ ] Sau khi nộp thành công (`handleSubmit`), tự động dọn sạch `localStorage`.

### Task 3: Triển khai Bộ Test Cases Mở rộng TC25 – TC36
**Files:**
- Modify: `tests/unit/acceptance-matrix-tc01-tc24.test.ts`

- [ ] TC25: Chặn gian lận quét QR từ xa ngoài mạng Wi-Fi quán (subnet IP validation rule).
- [ ] TC26: Chặn nhập tiền két hoặc chi phí âm (`cashExpenses < 0`).
- [ ] TC27: Lưu nháp tự động (Auto-save Draft) cho biên bản bàn giao 8 bước.
- [ ] TC28: Kiểm soát làm tròn tiền lương chính xác đến từng đồng (VND rounding strategy).
- [ ] TC29: Xử lý ca làm việc vắt ngang thời khắc chuyển giao tháng / kỳ lương (`workDate` rule).
- [ ] TC30: Khóa tài khoản nhân viên có hiệu lực tức thì (Real-time Session Invalidation).
- [ ] TC31: Kiểm tra xung đột chấm công chéo chi nhánh / ca trùng giờ.
- [ ] TC32: Kiểm soát giới hạn độ dài lý do giải trình tiền két chênh lệch (5 - 500 ký tự).
- [ ] TC33: Xử lý trường hợp nhân viên quên kết thúc giờ nghỉ trước khi bấm tan ca.
- [ ] TC34: Kiểm thử dồn dập (Burst Concurrency) khi Kiosk nhận request trong 100ms.
- [ ] TC35: Xử lý biên bản bàn giao khi chỉ có 1 nhân viên duy nhất mở & đóng quán.
- [ ] TC36: Kiểm tra tính bất biến (Immutability) của lịch sử Audit Log.

### Task 4: Chạy Toàn bộ Test Suite & Nghiệm thu
- [ ] Chạy `npx.cmd vitest run tests/unit/acceptance-matrix-tc01-tc24.test.ts`.
- [ ] Chạy toàn bộ 13 test suites của dự án đảm bảo 100% passed.
- [ ] Xác nhận giao diện hoạt động mượt mà trên server 3005.

