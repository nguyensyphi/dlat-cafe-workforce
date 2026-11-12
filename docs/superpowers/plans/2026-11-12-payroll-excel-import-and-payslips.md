# Excel Hours Import, Payroll Calculation & Payslip Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai tính năng Nhập file Excel thông tin số giờ làm của từng nhân viên (từ phần mềm vào ca/bàn giao ca của quán), tự động tính lương theo đơn giá lương `PayRate`, và tạo Phiếu tính lương (Payslip) đẹp mắt kèm xuất ảnh gửi Zalo cho nhân sự D'lat Cafe.

**Architecture:**
- **Service & Parser:** `src/modules/payroll/excel-import.service.ts` sử dụng thư viện `xlsx` để sinh file mẫu Excel chuẩn và đọc/đối chiếu dữ liệu giờ công theo `Mã NV` (`employeeCode`).
- **API Endpoints:**
  - `GET /api/payroll/periods/[id]/template`: Xuất file Excel mẫu có sẵn danh sách toàn bộ nhân viên đang làm việc của quán.
  - `POST /api/payroll/periods/[id]/import-excel`: Nhận file Excel, kiểm tra hợp lệ, đối chiếu `PayRate` và cập nhật hàng loạt `PayrollItem`.
- **UI Components:**
  - `src/components/payroll/excel-import-modal.tsx`: Modal kéo-thả file Excel, xem trước dữ liệu giờ công và đơn giá lương trước khi lưu.
  - `src/components/payroll/payslip-modal.tsx`: Modal hiển thị phiếu lương chi tiết từng bạn nhân viên, hỗ trợ In ấn và Tải ảnh thẻ lương định dạng PNG để quản lý gửi riêng vào Zalo của từng nhân sự.
  - Tích hợp vào `payroll-detail-client.tsx`, `payroll-management-client.tsx`, và trang cá nhân nhân viên `employee-payroll-client.tsx`.

---

### Task 1: Excel Import & Template Download Service & API

**Files:**
- Create: `src/modules/payroll/excel-import.service.ts`
- Create: `src/app/api/payroll/periods/[id]/template/route.ts`
- Create: `src/app/api/payroll/periods/[id]/import-excel/route.ts`
- Test: `tests/unit/payroll-excel-import.test.ts`

- [ ] **Step 1.1**: Viết unit test kiểm tra logic đọc file Excel, đối chiếu mã nhân viên và tính lương cơ bản `basePay = hours * hourlyRate`.
- [ ] **Step 1.2**: Xây dựng hàm `generatePayrollExcelTemplate(periodId)` sinh file Excel mẫu `.xlsx` với danh sách nhân viên hiện tại của quán.
- [ ] **Step 1.3**: Xây dựng hàm `parsePayrollExcel(fileBuffer, periodId)` và `applyPayrollExcelImport(periodId, rows, actor)` đối chiếu `employeeCode`, lấy đơn giá lương hiệu lực và cập nhật bảng `PayrollItem`.
- [ ] **Step 1.4**: Triển khai `GET /api/payroll/periods/[id]/template` và `POST /api/payroll/periods/[id]/import-excel`.
- [ ] **Step 1.5**: Chạy `npx vitest run tests/unit/payroll-excel-import.test.ts` đảm bảo 100% test pass.

---

### Task 2: Excel Import Modal & Payroll Integration

**Files:**
- Create: `src/components/payroll/excel-import-modal.tsx`
- Modify: `src/components/payroll/payroll-detail-client.tsx`
- Modify: `src/components/payroll/payroll-management-client.tsx`

- [ ] **Step 2.1**: Tạo component `excel-import-modal.tsx`: Kéo-thả tải file Excel, nút tải file mẫu, bảng xem trước đối chiếu giờ công và số tiền tương ứng.
- [ ] **Step 2.2**: Gắn nút **"Nhập giờ từ Excel"** trên thanh công cụ của `payroll-detail-client.tsx`.
- [ ] **Step 2.3**: Khi xác nhận import, tự động cập nhật lại bảng lương, tính tổng số giờ công và tổng quỹ lương của kỳ.

---

### Task 3: Interactive Payslip Viewer & Zalo Image Generator

**Files:**
- Create: `src/components/payroll/payslip-modal.tsx`
- Modify: `src/components/payroll/payroll-detail-client.tsx`
- Modify: `src/components/employee/employee-payroll-client.tsx`

- [ ] **Step 3.1**: Thiết kế `payslip-modal.tsx`: Bảng kê chi tiết giờ làm, mức lương/giờ, phụ cấp, thưởng, khấu trừ và thực lĩnh.
- [ ] **Step 3.2**: Thêm nút **"Tải ảnh gửi Zalo"**: Dùng HTML5 canvas vẽ ảnh thẻ lương chuẩn nét (PNG) có logo D'lat Cafe để gửi riêng cho nhân viên.
- [ ] **Step 3.3**: Thêm nút **"In phiếu lương"** hỗ trợ in ấn A5/A4.
- [ ] **Step 3.4**: Tích hợp nút xem phiếu lương vào từng dòng của bảng lương Quản lý (`payroll-detail-client.tsx`) và giao diện nhân viên tự xem lương (`employee-payroll-client.tsx`).

---

### Task 4: Rigorous Verification, Type Safety & Live Production Test

- [ ] **Step 4.1**: Chạy kiểm thử toàn bộ `npx vitest run`.
- [ ] **Step 4.2**: Chạy kiểm tra tĩnh `npx tsc --noEmit` đạt 0 lỗi biên dịch.
- [ ] **Step 4.3**: Đóng gói Production `npm run build` và khởi động lại server cổng 3005.
- [ ] **Step 4.4**: Kiểm tra tải file mẫu và nhập file Excel thử nghiệm trực tiếp qua HTTP.

