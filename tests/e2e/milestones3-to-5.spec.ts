import { expect, test } from "@playwright/test";

test.describe("Milestones 3 to 5 — Schedule, Attendance, Payroll, Reports & Audit", () => {
  test("Quản lý và Chủ quán truy cập Lịch làm việc tuần và xem các chế độ xem", async ({
    page,
  }) => {
    // Login as MANAGER
    await page.goto("/login");
    await page.getByLabel(/Email/i).fill("manager@dlatcafe.vn");
    await page.getByLabel(/Mật khẩu/i).fill("Admin@123");
    await page.getByRole("button", { name: /Đăng nhập/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);

    // Navigate to Schedules
    await page.getByRole("link", { name: /Lịch làm việc/i }).first().click();
    await expect(page).toHaveURL(/\/schedules/);
    await expect(
      page.getByRole("heading", { name: /Quản lý Lịch làm việc tuần/i }),
    ).toBeVisible();

    // Check availability of view switcher
    await expect(page.getByText("Lưới ngày - ca").first()).toBeVisible();
    await expect(page.getByText("Theo nhân sự").first()).toBeVisible();
  });

  test("Quản lý truy cập Kiosk Chấm công và kiểm tra đồng hồ đếm ngược", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/Email/i).fill("manager@dlatcafe.vn");
    await page.getByLabel(/Mật khẩu/i).fill("Admin@123");
    await page.getByRole("button", { name: /Đăng nhập/i }).click();

    // Navigate to Attendance
    await page.getByRole("link", { name: /Chấm công/i }).first().click();
    await expect(page).toHaveURL(/\/attendance/);

    // Open Kiosk
    await page.getByRole("link", { name: /Mở Kiosk Chấm công/i }).click();
    await expect(page).toHaveURL(/\/attendance\/kiosk/);
    await expect(
      page.getByRole("heading", { name: /Kiosk Chấm công/i }),
    ).toBeVisible();
    await expect(page.getByText(/Mã QR sẽ tự làm mới/i)).toBeVisible();
  });

  test("Chủ quán truy cập Bảng lương, Báo cáo và Nhật ký hệ thống", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/Email/i).fill("owner@dlatcafe.vn");
    await page.getByLabel(/Mật khẩu/i).fill("Admin@123");
    await page.getByRole("button", { name: /Đăng nhập/i }).click();

    // Check Payroll page
    await page.getByRole("link", { name: /Bảng lương/i }).first().click();
    await expect(page).toHaveURL(/\/payroll/);
    await expect(
      page.getByRole("heading", { name: /Quản lý Bảng lương theo giờ/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Tạo kỳ lương mới/i })).toBeVisible();

    // Check Reports page
    await page.getByRole("link", { name: /Báo cáo/i }).first().click();
    await expect(page).toHaveURL(/\/reports/);
    await expect(
      page.getByRole("heading", { name: /Báo cáo & Phân tích Vận hành/i }),
    ).toBeVisible();
    await expect(page.getByText(/Xuất báo cáo chi tiết/i)).toBeVisible();

    // Check Audit Log (OWNER only)
    await page.getByRole("link", { name: /Nhật ký hệ thống/i }).first().click();
    await expect(page).toHaveURL(/\/audit/);
    await expect(
      page.getByRole("heading", { name: /Nhật ký Kiểm toán Hệ thống/i }),
    ).toBeVisible();
  });

  test("Nhân viên xem phiếu lương và trang chấm công cá nhân", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/Email/i).fill("nam.le@dlatcafe.vn");
    await page.getByLabel(/Mật khẩu/i).fill("Staff@123");
    await page.getByRole("button", { name: /Đăng nhập/i }).click();

    await expect(page).toHaveURL(/\/employee\/profile/);

    // Navigate to Employee Payroll
    await page.getByRole("link", { name: /Phiếu lương/i }).first().click();
    await expect(page).toHaveURL(/\/employee\/payroll/);
    await expect(
      page.getByRole("heading", { name: /Phiếu lương cá nhân/i }),
    ).toBeVisible();

    // Navigate to Employee Attendance
    await page.getByRole("link", { name: /Chấm công/i }).first().click();
    await expect(page).toHaveURL(/\/employee\/attendance/);
    await expect(
      page.getByRole("heading", { name: /Chấm công di động/i }),
    ).toBeVisible();
  });
});
