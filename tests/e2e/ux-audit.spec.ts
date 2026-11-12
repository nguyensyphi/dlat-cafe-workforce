import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3005";

test.describe("UX Audit: D'lat Cafe Workforce Core Flows", () => {
  test("1. Mobile QR Registration Flow (/register-schedule)", async ({ page }) => {
    // Set mobile viewport emulation (iPhone 14: 390x844)
    await page.setViewportSize({ width: 390, height: 844 });

    // Open registration for next active week
    await page.goto(`${BASE_URL}/register-schedule?week=2026-11-16`);
    await page.waitForLoadState("networkidle");

    // Wait for the skeleton loader to finish and header to appear
    const heading = page.locator("h1:has-text('Đăng Ký Ca Làm Việc')");
    await heading.waitFor({ state: "visible", timeout: 20000 });
    await expect(heading).toBeVisible();

    // Verify brand title
    await expect(page.locator("text=D'lat Cafe & Bistro")).toBeVisible();

    // Select "Phạm Ngọc Ánh" from the employee list
    const empButton = page.locator("button:has-text('Phạm Ngọc Ánh')").first();
    await empButton.waitFor({ state: "visible", timeout: 10000 });
    await empButton.click();

    // Verify step 2 appears and enter PIN: 4555 (last 4 digits of 0912444555)
    const pinInput = page.locator("input[type='password']");
    await pinInput.waitFor({ state: "visible", timeout: 10000 });
    await pinInput.fill("4555");

    // Wait for authentication check
    await expect(page.locator("text=Khớp danh tính")).toBeVisible({ timeout: 10000 });

    // Test quick preset buttons
    const btnAllFree = page.locator("button:has-text('Rảnh cả tuần')");
    await expect(btnAllFree).toBeVisible();
    await btnAllFree.click();

    const btnMorningOnly = page.locator("button:has-text('Rảnh mọi ca Sáng')");
    await expect(btnMorningOnly).toBeVisible();
    await btnMorningOnly.click();

    // Tap desired shifts pill button (5 ca)
    const btn5Shifts = page.locator("button:has-text('5 ca')");
    await expect(btn5Shifts).toBeVisible();
    await btn5Shifts.click();

    // Fill notes
    const noteArea = page.locator("textarea[placeholder*='Em bận']");
    if (await noteArea.isVisible()) {
      await noteArea.fill("Thứ 5 em bận thi buổi sáng, mong ưu tiên xếp ca tối");
    }

    // Submit form (Button: "Gửi Đăng Ký (X ca rảnh / ưu tiên)")
    const submitBtn = page.locator("button:has-text('Gửi Đăng Ký')");
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Expect reassuring confirmation
    await expect(page.locator("text=Nộp Đăng Ký Thành Công!")).toBeVisible({
      timeout: 15000,
    });
  });

  test("2. Manager Scheduling Workspace Flow (/schedules)", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });

    // Login via API to set session cookie directly
    const loginRes = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: "owner@dlatcafe.vn",
        password: "Admin@123",
      },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto(`${BASE_URL}/schedules`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1:has-text('Quản lý Lịch làm việc')")).toBeVisible({ timeout: 20000 });

    // Check manager action buttons exist
    const qrBtn = page.locator("button:has-text('Mã QR Đăng Ký')");
    await expect(qrBtn).toBeVisible();

    const progressBtn = page.locator("button:has-text('Đăng ký:')");
    await expect(progressBtn).toBeVisible();

    const exportBtn = page.locator("button:has-text('Xuất ảnh Zalo')");
    await expect(exportBtn).toBeVisible();

    // Open QR Modal
    await qrBtn.click();
    await expect(page.locator("text=Mã QR Đăng Ký Lịch Tuần")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button:has-text('Tải Poster Zalo')")).toBeVisible();
    await page.keyboard.press("Escape");

    // Open Progress Drawer
    await progressBtn.click();
    await expect(page.locator("text=Tiến Độ Đăng Ký Ca Làm Việc")).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");
  });

  test("3. Manager Payroll & Payslip Flow (/payroll)", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });

    // Login via API
    const loginRes = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: "owner@dlatcafe.vn",
        password: "Admin@123",
      },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto(`${BASE_URL}/payroll`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1:has-text('Quản lý Bảng lương')")).toBeVisible({ timeout: 20000 });

    // Click on detail of first period
    const detailLink = page.locator("a:has-text('Chi tiết')").first();
    await expect(detailLink).toBeVisible();
    await detailLink.click();

    // Wait until navigated to detail page
    await page.waitForURL("**/payroll/*", { timeout: 15000 });
    await page.waitForLoadState("networkidle");

    // Verify "Nhập giờ từ Excel" button exists and click it
    const excelBtn = page.locator("button:has-text('Nhập giờ từ Excel')");
    await expect(excelBtn).toBeVisible({ timeout: 10000 });
    await excelBtn.click();

    // Verify template download button in modal
    const downloadTplBtn = page.locator("button:has-text('Tải file mẫu Excel')");
    await expect(downloadTplBtn).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");

    // Check "Phiếu lương" button on row
    const payslipBtn = page.locator("button:has-text('Phiếu lương')").first();
    await expect(payslipBtn).toBeVisible({ timeout: 10000 });
    await payslipBtn.click();

    // Verify payslip modal content
    await expect(page.locator("text=Phiếu Lương Nhân Viên")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button:has-text('Tải ảnh gửi Zalo')")).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");
  });
});
