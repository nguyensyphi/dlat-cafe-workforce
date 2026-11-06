import { expect, test } from "@playwright/test";

test.describe("Milestone 2 — Scheduling, 4 Views, Availability Registration & Employee View", () => {
  test("OWNER navigates to /schedules and switches between all 4 views", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/Email/i).fill("owner@dlatcafe.vn");
    await page.getByLabel(/Mật khẩu/i).fill("Admin@123");
    await page.getByRole("button", { name: /Đăng nhập/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);

    // Navigate to Schedules page
    await page.getByRole("link", { name: /Lịch làm việc/i }).first().click();
    await expect(page).toHaveURL(/\/schedules/);
    await expect(
      page.getByRole("heading", { name: /Quản lý Lịch làm việc/i }),
    ).toBeVisible();

    // Verify 4 View switchers
    await expect(page.getByRole("button", { name: /Theo Tuần/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Theo Ngày/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Theo Nhân viên/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Danh sách Ca/i })).toBeVisible();

    // Switch to Daily View
    await page.getByRole("button", { name: /Theo Ngày/i }).click();
    // Switch to Employee View
    await page.getByRole("button", { name: /Theo Nhân viên/i }).click();
    // Switch to Shift List View
    await page.getByRole("button", { name: /Danh sách Ca/i }).click();
    // Switch back to Weekly View
    await page.getByRole("button", { name: /Theo Tuần/i }).click();
  });

  test("EMPLOYEE accesses /employee/schedule and /employee/availability", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/Email/i).fill("nam.le@dlatcafe.vn");
    await page.getByLabel(/Mật khẩu/i).fill("Staff@123");
    await page.getByRole("button", { name: /Đăng nhập/i }).click();

    await expect(page).toHaveURL(/\/employee\/profile/);

    // Navigate to Employee Schedule page
    await page.getByRole("link", { name: /Lịch làm/i }).first().click();
    await expect(page).toHaveURL(/\/employee\/schedule/);
    await expect(
      page.getByRole("heading", { name: /Lịch làm việc của tôi/i }),
    ).toBeVisible();

    // Navigate to Availability registration page
    await page.getByRole("link", { name: /Đăng ký rảnh/i }).first().click();
    await expect(page).toHaveURL(/\/employee\/availability/);
    await expect(
      page.getByRole("heading", { name: /Đăng ký Lịch rảnh/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Lưu đăng ký lịch rảnh/i }),
    ).toBeVisible();
  });
});
