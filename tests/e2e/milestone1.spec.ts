import { expect, test } from "@playwright/test";

test.describe("Milestone 1 — Auth, RBAC, Dashboard, Employees, Positions & Shifts", () => {
  test("redirects unauthenticated user from /dashboard to /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /Đăng nhập hệ thống/i }),
    ).toBeVisible();
  });

  test("OWNER logs in, views real KPI dashboard, manages positions, shift templates, and employees", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/Email/i).fill("owner@dlatcafe.vn");
    await page.getByLabel(/Mật khẩu/i).fill("Admin@123");
    await page.getByRole("button", { name: /Đăng nhập/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: /Tổng quan vận hành/i }),
    ).toBeVisible();
    await expect(page.getByText(/Nhân viên đang hoạt động/i)).toBeVisible();

    // Check Positions page
    await page.getByRole("link", { name: /Vị trí & Kỹ năng/i }).first().click();
    await expect(page).toHaveURL(/\/positions/);
    await expect(page.getByText("Pha chế").first()).toBeVisible();
    await expect(page.getByText("Thu ngân").first()).toBeVisible();

    // Check Shift Templates page
    await page.getByRole("link", { name: /Cấu hình ca/i }).first().click();
    await expect(page).toHaveURL(/\/shifts/);
    await expect(page.getByText("Ca Sáng").first()).toBeVisible();
    await expect(page.getByText("06:00").first()).toBeVisible();

    // Check Employees directory & detail page
    await page.getByRole("link", { name: /Nhân sự/i }).first().click();
    await expect(page).toHaveURL(/\/employees/);
    await expect(page.getByText("Lê Hoàng Nam").first()).toBeVisible();

    await page.getByRole("link", { name: /Chi tiết/i }).first().click();
    await expect(page).toHaveURL(/\/employees\/[0-9a-f-]+/);
    await expect(page.getByText(/Lịch sử mức lương/i)).toBeVisible();
    await expect(page.getByText(/Lịch sử công tác/i)).toBeVisible();
  });

  test("EMPLOYEE logs into mobile-friendly self-service portal and cannot access management pages", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/Email/i).fill("nam.le@dlatcafe.vn");
    await page.getByLabel(/Mật khẩu/i).fill("Staff@123");
    await page.getByRole("button", { name: /Đăng nhập/i }).click();

    await expect(page).toHaveURL(/\/employee\/profile/);
    await expect(page.getByText("Lê Hoàng Nam").first()).toBeVisible();
    await expect(page.getByText(/32\.000 ₫/).first()).toBeVisible();

    // Server-side API RBAC: EMPLOYEE cannot read global settings or employee directory API
    const settingsRes = await page.request.get("/api/settings");
    expect(settingsRes.status()).toBe(403);
    const directoryRes = await page.request.get("/api/employees");
    expect(directoryRes.status()).toBe(403);

    // Attempting to navigate to /employees redirects back to /employee/profile
    await page.goto("/employees");
    await expect(page).toHaveURL(/\/employee\/profile/);
  });
});

