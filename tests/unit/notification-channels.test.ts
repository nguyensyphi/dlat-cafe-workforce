import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { redactMeta, redactString } from "@/lib/logger";
import { sendEmailMessage } from "@/modules/notifications/channels/email";
import {
  escapeTelegramHtml,
  formatTelegramMessage,
  sendTelegramMessage,
} from "@/modules/notifications/channels/telegram";
import {
  resolveNotificationEnv,
  type EmailTransport,
  type FetchLike,
  type NotificationLogger,
  type NotificationPolicyConfig,
} from "@/modules/notifications/channels/types";
import {
  normalizeVietnamPhone,
  sendZaloMessage,
} from "@/modules/notifications/channels/zalo";
import { dispatchExternalNotifications } from "@/modules/notifications/dispatcher";
import {
  createNotifications,
  createNotificationsWithDedupeReport,
} from "@/modules/notifications/notification.service";

function createMockLogger(): NotificationLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const DEFAULT_TEST_POLICY: NotificationPolicyConfig = {
  enableTelegram: true,
  enableZalo: true,
  enableEmail: true,
  managerTelegramChatIds: [],
  groupTelegramChatId: null,
  shiftStartReminderMinutes: 15,
  shiftEndReminderMinutes: 15,
  cashDiscrepancyThresholdVnd: 0,
};

describe("Server Env & Logger Redaction", () => {
  it("normalizes empty strings to undefined and supplies safe defaults for build safety", () => {
    const parsed = parseServerEnv({
      TELEGRAM_BOT_TOKEN: "",
      ZALO_OA_ACCESS_TOKEN: "   ",
      RESEND_API_KEY: "",
      SMTP_PORT: "",
      ENABLE_IN_PROCESS_CRON: "true",
      SHIFT_START_REMINDER_MINUTES: "20",
    });

    expect(parsed.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(parsed.ZALO_OA_ACCESS_TOKEN).toBeUndefined();
    expect(parsed.RESEND_API_KEY).toBeUndefined();
    expect(parsed.SMTP_PORT).toBe(587);
    expect(parsed.ENABLE_IN_PROCESS_CRON).toBe(true);
    expect(parsed.SHIFT_START_REMINDER_MINUTES).toBe(20);
  });

  it("redacts bot tokens, bearer secrets, and sensitive object keys", () => {
    expect(
      redactString(
        "Request failed at https://api.telegram.org/bot123456:SECRET_ABC/sendMessage",
      ),
    ).toBe(
      "Request failed at https://api.telegram.org/bot***REDACTED***/sendMessage",
    );

    const sanitized = redactMeta({
      apiKey: "re_live_12345",
      smtpPass: "my-secret-pass",
      nested: {
        authorizationHeader: "Bearer secret_token_xyz",
        detail: "Bearer secret_token_xyz",
        safeField: "ok",
      },
    });

    expect(sanitized).toEqual({
      apiKey: "***REDACTED***",
      smtpPass: "***REDACTED***",
      nested: {
        authorizationHeader: "***REDACTED***",
        detail: "Bearer ***REDACTED***",
        safeField: "ok",
      },
    });

    // Shared non-circular DAG reference should serialize both branches instead of "[Circular]"
    const shared = { status: "ok", secretToken: "xyz" };
    const dag = redactMeta({ first: shared, second: shared });
    expect(dag).toEqual({
      first: { status: "ok", secretToken: "***REDACTED***" },
      second: { status: "ok", secretToken: "***REDACTED***" },
    });
  });

  it("resolveNotificationEnv falls back safely and logs warning when process.env fails Zod validation", () => {
    const prevTimeout = process.env.NOTIFICATION_TIMEOUT_MS;
    const mockLogger = createMockLogger();
    try {
      process.env.NOTIFICATION_TIMEOUT_MS = "100"; // below min 500 -> triggers ZodError in getServerEnv()
      const env = resolveNotificationEnv({ telegramBotToken: "override-tok" }, mockLogger);
      expect(env.defaultTimeoutMs).toBe(5000);
      expect(env.telegramBotToken).toBe("override-tok");
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "notification.env.fallback",
        expect.objectContaining({ reason: expect.any(String) }),
      );
    } finally {
      if (prevTimeout === undefined) {
        delete process.env.NOTIFICATION_TIMEOUT_MS;
      } else {
        process.env.NOTIFICATION_TIMEOUT_MS = prevTimeout;
      }
    }
  });
});

describe("Telegram Channel (sendTelegramMessage)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-TG-01: formats HTML payload with escaped characters and posts to sendMessage endpoint", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ ok: true, result: { message_id: 901 } }),
    );
    const logger = createMockLogger();

    expect(escapeTelegramHtml("<script>A & B</script>")).toBe(
      "&lt;script&gt;A &amp; B&lt;/script&gt;",
    );

    const result = await sendTelegramMessage(
      {
        chatId: "-100999",
        recipientUserId: "user-1",
        title: "Lịch tuần mới",
        message: "Ca sáng <07:00> & bàn giao",
        linkUrl: "/employee/schedule",
        severity: "info",
      },
      {
        fetchImpl: fetchMock,
        logger,
        env: {
          telegramBotToken: "123:ABC_TOKEN",
          telegramApiBaseUrl: "https://api.telegram.org",
          appUrl: "https://dlat.example.com",
        },
      },
    );

    expect(result.status).toBe("SENT");
    expect(result.provider).toBe("telegram-bot");
    expect(result.externalId).toBe("901");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123:ABC_TOKEN/sendMessage");
    const parsedBody = JSON.parse(String(init?.body));
    expect(parsedBody.chat_id).toBe("-100999");
    expect(parsedBody.parse_mode).toBe("HTML");
    expect(parsedBody.text).toContain("<b>[D'lat Cafe] Lịch tuần mới</b>");
    expect(parsedBody.text).toContain("Ca sáng &lt;07:00&gt; &amp; bàn giao");
    expect(parsedBody.text).toContain(
      '<a href="https://dlat.example.com/employee/schedule">Xem chi tiết</a>',
    );
  });

  it("TC-TG-02: falls back to telegramDefaultChatId when chatId is omitted", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ ok: true, result: { message_id: 42 } }),
    );

    const result = await sendTelegramMessage(
      {
        title: "Cảnh báo",
        message: "Kiểm tra két",
      },
      {
        fetchImpl: fetchMock,
        logger: createMockLogger(),
        env: {
          telegramBotToken: "123:ABC",
          telegramDefaultChatId: "-100888",
        },
      },
    );

    expect(result.status).toBe("SENT");
    expect(result.target).toBe("-100888");
  });

  it("TC-TG-03: returns SKIPPED without calling fetch when token or chatId is missing", async () => {
    const fetchMock = vi.fn<FetchLike>();
    const logger = createMockLogger();

    const noToken = await sendTelegramMessage(
      { chatId: "123", title: "Test", message: "Msg" },
      { fetchImpl: fetchMock, logger, env: { telegramBotToken: undefined } },
    );
    expect(noToken.status).toBe("SKIPPED");
    expect(noToken.reason).toBe("MISSING_TELEGRAM_BOT_TOKEN");

    const noChat = await sendTelegramMessage(
      { title: "Test", message: "Msg" },
      {
        fetchImpl: fetchMock,
        logger,
        env: {
          telegramBotToken: "123:ABC",
          telegramDefaultChatId: undefined,
        },
      },
    );
    expect(noChat.status).toBe("SKIPPED");
    expect(noChat.reason).toBe("MISSING_CHAT_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TC-TG-04: isolates HTTP errors/timeouts and redacts bot token from error reason", async () => {
    const logger = createMockLogger();
    const errorFetch = vi.fn<FetchLike>(async () => {
      throw new Error(
        "connect failed https://api.telegram.org/bot999:SECRET_XYZ/sendMessage",
      );
    });

    const failedNet = await sendTelegramMessage(
      { chatId: "123", title: "Test", message: "Msg" },
      {
        fetchImpl: errorFetch,
        logger,
        env: { telegramBotToken: "999:SECRET_XYZ" },
      },
    );

    expect(failedNet.status).toBe("FAILED");
    expect(failedNet.reason).not.toContain("999:SECRET_XYZ");
    expect(failedNet.reason).toContain("/bot***REDACTED***");

    const apiFailFetch = vi.fn<FetchLike>(async () =>
      jsonResponse({ ok: false, description: "Bad Request: chat not found" }, 400),
    );
    const failedApi = await sendTelegramMessage(
      { chatId: "123", title: "Test", message: "Msg" },
      {
        fetchImpl: apiFailFetch,
        logger,
        env: { telegramBotToken: "999:SECRET_XYZ" },
      },
    );
    expect(failedApi.status).toBe("FAILED");
    expect(failedApi.statusCode).toBe(400);
    expect(failedApi.reason).toBe("Bad Request: chat not found");

    const formatted = formatTelegramMessage({
      title: "Tiêu đề",
      message: "a".repeat(4500),
    });
    expect(formatted.length).toBeLessThanOrEqual(4000);

    // Even with a huge title and lots of HTML entities in body, never exceed 4000 or leave broken entity
    const entityFormatted = formatTelegramMessage({
      title: "T".repeat(3950),
      message: "&".repeat(1500),
    });
    expect(entityFormatted.length).toBeLessThanOrEqual(4000);
    expect(entityFormatted).not.toMatch(/&[a-zA-Z0-9#]*\.\.\./);
  });
});

describe("Zalo Channel (normalizeVietnamPhone + sendZaloMessage)", () => {
  it("TC-ZALO-01: normalizes Vietnamese phone numbers to 84xxxxxxxxx", () => {
    expect(normalizeVietnamPhone("0901234567")).toBe("84901234567");
    expect(normalizeVietnamPhone("090 123-4567")).toBe("84901234567");
    expect(normalizeVietnamPhone("+84912345678")).toBe("84912345678");
    expect(normalizeVietnamPhone("84912345678")).toBe("84912345678");
    expect(normalizeVietnamPhone("")).toBeNull();
    expect(normalizeVietnamPhone("123")).toBeNull();
  });

  it("TC-ZALO-02: sends Zalo OA CS payload when access token and zaloUserId are present", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ error: 0, message: "Success", data: { message_id: "z_oa_1" } }),
    );

    const res = await sendZaloMessage(
      {
        recipientUserId: "u1",
        zaloUserId: "41234567890",
        eventType: "SCHEDULE_PUBLISHED",
        title: "Lịch mới",
        message: "Đã công bố lịch tuần",
      },
      {
        fetchImpl: fetchMock,
        logger: createMockLogger(),
        env: {
          zaloOaAccessToken: "zalo-token",
          zaloOaApiUrl: "https://openapi.zalo.me/v3.0/oa/message/cs",
        },
      },
    );

    expect(res.status).toBe("SENT");
    expect(res.provider).toBe("zalo-oa");
    expect(res.externalId).toBe("z_oa_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openapi.zalo.me/v3.0/oa/message/cs");
    expect((init?.headers as Record<string, string>).access_token).toBe(
      "zalo-token",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.recipient).toEqual({ user_id: "41234567890" });
    expect(body.message.text).toContain("[Lịch mới]");
  });

  it("TC-ZALO-03: sends Zalo ZNS template payload with normalized phone", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ error: 0, data: { msg_id: "zns_77" } }),
    );

    const res = await sendZaloMessage(
      {
        recipientUserId: "u2",
        fullName: "Lê Văn Nam",
        phone: "0901234567",
        eventType: "SHIFT_REMINDER",
        title: "Nhắc ca",
        message: "15 phút nữa vào Ca 1",
        dedupeKey: "shift-rem-1",
      },
      {
        fetchImpl: fetchMock,
        logger: createMockLogger(),
        env: {
          zaloOaAccessToken: "zalo-token",
          zaloZnsTemplateId: "tpl_123",
          zaloZnsApiUrl: "https://business.openapi.zalo.me/message/template",
        },
      },
    );

    expect(res.status).toBe("SENT");
    expect(res.provider).toBe("zalo-zns");
    expect(res.externalId).toBe("zns_77");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.phone).toBe("84901234567");
    expect(body.template_id).toBe("tpl_123");
    expect(body.tracking_id).toBe("shift-rem-1");
    expect(body.template_data.customer_name).toBe("Lê Văn Nam");
  });

  it("TC-ZALO-04: sends Generic Webhook payload with x-webhook-secret", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ id: "wh_9" }),
    );

    const res = await sendZaloMessage(
      {
        recipientUserId: "u3",
        fullName: "Võ Gia Bảo",
        phone: "0912345678",
        eventType: "HANDOVER_DISCREPANCY",
        title: "Chênh lệch két",
        message: "Lệch -50.000đ",
      },
      {
        fetchImpl: fetchMock,
        logger: createMockLogger(),
        env: {
          zaloWebhookUrl: "https://hooks.internal/zalo",
          zaloWebhookSecret: "wh-sec-123",
        },
      },
    );

    expect(res.status).toBe("SENT");
    expect(res.provider).toBe("zalo-webhook");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.internal/zalo");
    expect((init?.headers as Record<string, string>)["x-webhook-secret"]).toBe(
      "wh-sec-123",
    );
  });

  it("TC-ZALO-05: treats Zalo HTTP 200 error != 0 as FAILED and unconfigured as SKIPPED", async () => {
    const logger = createMockLogger();

    const skipped = await sendZaloMessage(
      {
        eventType: "SHIFT_REMINDER",
        title: "Test",
        message: "Body",
        phone: "0901234567",
      },
      { fetchImpl: vi.fn<FetchLike>(), logger, env: {} },
    );
    expect(skipped.status).toBe("SKIPPED");
    expect(skipped.reason).toBe("ZALO_NOT_CONFIGURED");

    const error200Fetch = vi.fn<FetchLike>(async () =>
      jsonResponse({ error: -213, message: "Invalid phone number" }, 200),
    );
    const failed = await sendZaloMessage(
      {
        zaloUserId: "z_123",
        eventType: "SHIFT_REMINDER",
        title: "Test",
        message: "Body",
      },
      {
        fetchImpl: error200Fetch,
        logger,
        env: { zaloOaAccessToken: "tok" },
      },
    );
    expect(failed.status).toBe("FAILED");
    expect(failed.reason).toContain("-213");
  });
});

describe("Email Channel (sendEmailMessage)", () => {
  it("TC-EMAIL-01: sends via Resend HTTP API when resendApiKey is configured", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ id: "re_msg_123" }),
    );

    const res = await sendEmailMessage(
      {
        recipientUserId: "u1",
        fullName: "Lan Anh",
        to: "nv@dlat.vn",
        subject: "[D'lat Cafe] Lịch tuần",
        title: "Lịch tuần mới",
        message: "Bạn được xếp Ca 1 Thứ 2",
        linkUrl: "/employee/schedule",
      },
      {
        fetchImpl: fetchMock,
        logger: createMockLogger(),
        env: {
          resendApiKey: "re_test_key",
          resendApiUrl: "https://api.resend.com/emails",
          emailFrom: "D'lat Cafe <ops@dlat.vn>",
          appUrl: "https://dlat.vn",
        },
      },
    );

    expect(res.status).toBe("SENT");
    expect(res.provider).toBe("resend");
    expect(res.externalId).toBe("re_msg_123");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.to).toEqual(["nv@dlat.vn"]);
    expect(body.html).toContain("https://dlat.vn/employee/schedule");
  });

  it("TC-EMAIL-02: sends via injected EmailTransport (mocked SMTP)", async () => {
    const sendMail = vi.fn<EmailTransport["sendMail"]>(async () => ({
      messageId: "<smtp-1@dlat.vn>",
    }));
    const emailTransport: EmailTransport = { sendMail };

    const res = await sendEmailMessage(
      {
        to: "mgr@dlat.vn",
        subject: "Cảnh báo két",
        title: "Chênh lệch két",
        message: "Lệch 50.000đ",
        severity: "urgent",
      },
      {
        emailTransport,
        logger: createMockLogger(),
        env: { emailFrom: "D'lat <no-reply@dlat.vn>" },
      },
    );

    expect(res.status).toBe("SENT");
    expect(res.provider).toBe("smtp");
    expect(res.externalId).toBe("<smtp-1@dlat.vn>");
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: "D'lat <no-reply@dlat.vn>",
      to: "mgr@dlat.vn",
      subject: "Cảnh báo két",
    });
  });

  it("TC-EMAIL-03: returns SKIPPED when unconfigured or recipient email is invalid", async () => {
    const logger = createMockLogger();

    const invalidRecipient = await sendEmailMessage(
      {
        to: "not-an-email",
        subject: "S",
        title: "T",
        message: "M",
      },
      { logger, env: { resendApiKey: "re_key" } },
    );
    expect(invalidRecipient.status).toBe("SKIPPED");
    expect(invalidRecipient.reason).toBe("MISSING_OR_INVALID_RECIPIENT_EMAIL");

    const notConfigured = await sendEmailMessage(
      {
        to: "valid@dlat.vn",
        subject: "S",
        title: "T",
        message: "M",
      },
      { logger, env: {} },
    );
    expect(notConfigured.status).toBe("SKIPPED");
    expect(notConfigured.reason).toBe("EMAIL_NOT_CONFIGURED");
  });

  it("TC-EMAIL-04: catches injected transport rejection and Resend HTTP 500 without throwing", async () => {
    const logger = createMockLogger();

    const failedSmtp = await sendEmailMessage(
      {
        to: "mgr@dlat.vn",
        subject: "S",
        title: "T",
        message: "M",
      },
      {
        emailTransport: {
          sendMail: async () => {
            throw new Error("SMTP connection refused");
          },
        },
        logger,
      },
    );
    expect(failedSmtp.status).toBe("FAILED");
    expect(failedSmtp.reason).toContain("SMTP connection refused");

    const failedResend = await sendEmailMessage(
      {
        to: "mgr@dlat.vn",
        subject: "S",
        title: "T",
        message: "M",
      },
      {
        fetchImpl: async () => jsonResponse({ message: "Server Error" }, 500),
        logger,
        env: { resendApiKey: "re_key" },
      },
    );
    expect(failedResend.status).toBe("FAILED");
    expect(failedResend.statusCode).toBe(500);
  });
});

describe("Multi-Channel Dispatcher & Notification Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-DISP-01: fans out concurrently via Promise.allSettled and isolates per-channel failures", async () => {
    const fetchMock = vi.fn<FetchLike>(async (input) => {
      const url = String(input);
      if (url.includes("telegram.org")) {
        return jsonResponse({ ok: false, description: "Internal Error" }, 500);
      }
      return jsonResponse({ id: "re_ok" });
    });

    const summary = await dispatchExternalNotifications(
      {
        eventType: "HANDOVER_DISCREPANCY",
        title: "Chênh lệch két",
        message: "Ca 2 lệch -20.000đ",
        recipients: [
          {
            userId: "mgr-1",
            email: "mgr@dlat.vn",
            telegramChatId: "111222",
            phone: null,
            zaloUserId: null,
          },
        ],
      },
      {
        fetchImpl: fetchMock,
        logger: createMockLogger(),
        loadPolicy: async () => DEFAULT_TEST_POLICY,
        env: {
          telegramBotToken: "bot-tok",
          resendApiKey: "re-tok",
        },
      },
    );

    expect(summary.totalAttempted).toBe(3);
    expect(summary.sent).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it("TC-DISP-02: respects global policy toggles and user preferences opt-outs", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ ok: true, result: { message_id: 55 } }),
    );
    const sendMail = vi.fn(async () => ({ messageId: "smtp-1" }));

    const summary = await dispatchExternalNotifications(
      {
        eventType: "SCHEDULE_PUBLISHED",
        title: "Lịch mới",
        message: "Tuần tới",
        recipients: [
          {
            userId: "emp-1",
            email: "emp@dlat.vn",
            telegramChatId: "tg-emp-1",
            zaloUserId: "zalo-emp-1",
            preferences: { telegram: true, zalo: true, email: false },
          },
        ],
      },
      {
        fetchImpl: fetchMock,
        emailTransport: { sendMail },
        logger: createMockLogger(),
        loadPolicy: async () => ({
          ...DEFAULT_TEST_POLICY,
          enableZalo: false,
        }),
        env: {
          telegramBotToken: "tok",
          zaloOaAccessToken: "z-tok",
        },
      },
    );

    expect(summary.sent).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(
      summary.results.find((r) => r.channel === "zalo")?.reason,
    ).toBe("POLICY_DISABLED");
    expect(
      summary.results.find((r) => r.channel === "email")?.reason,
    ).toBe("USER_OPTED_OUT");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("TC-DISP-03: prevents default group Telegram spam and deduplicates identical group/manager chat IDs", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ ok: true, result: { message_id: 77 } }),
    );

    // 3 employees without personal telegramChatId and includeGroupTelegram: false -> 0 Telegram HTTP calls
    await dispatchExternalNotifications(
      {
        eventType: "SCHEDULE_PUBLISHED",
        title: "Lịch tuần",
        message: "Đã công bố",
        includeGroupTelegram: false,
        recipients: [
          { userId: "e1", email: null },
          { userId: "e2", email: null },
          { userId: "e3", email: null },
        ],
      },
      {
        fetchImpl: fetchMock,
        logger: createMockLogger(),
        loadPolicy: async () => DEFAULT_TEST_POLICY,
        env: {
          telegramBotToken: "tok",
          telegramDefaultChatId: "-100group",
        },
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();

    // includeGroupTelegram: true with overlapping group/manager/default chatIds -> deduplicated to 1 send
    await dispatchExternalNotifications(
      {
        eventType: "HANDOVER_DISCREPANCY",
        title: "Khẩn",
        message: "Lệch tiền két",
        includeGroupTelegram: true,
        recipients: [{ userId: "m1", telegramChatId: "-100group" }],
      },
      {
        fetchImpl: fetchMock,
        logger: createMockLogger(),
        loadPolicy: async () => ({
          ...DEFAULT_TEST_POLICY,
          groupTelegramChatId: "-100group",
          managerTelegramChatIds: ["-100group", "999001"],
        }),
        env: {
          telegramBotToken: "tok",
          telegramDefaultChatId: "-100group",
        },
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // "-100group" once + "999001" once
  });

  it("TC-SVC-01: createNotifications preserves backward compatibility and uses skipDuplicates + dedupeKey", async () => {
    const createMany = vi.fn(async () => ({ count: 1 }));
    const findMany = vi.fn(async () => [{ dedupeKey: "already-sent" }]);
    const mockDb = {
      notification: { createMany, findMany },
    } as unknown as Parameters<typeof createNotifications>[0];

    const count = await createNotifications(mockDb, [
      {
        userId: "u1",
        type: "SCHEDULE_PUBLISHED",
        title: "Lịch",
        message: "Mới",
      },
      {
        userId: "u1",
        type: "SCHEDULE_PUBLISHED",
        title: "Lịch",
        message: "Mới",
      },
    ]);

    expect(count).toBe(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "u1",
          type: "SCHEDULE_PUBLISHED",
          title: "Lịch",
          message: "Mới",
          linkUrl: null,
        },
      ],
      skipDuplicates: true,
    });

    const report = await createNotificationsWithDedupeReport(mockDb, [
      {
        userId: "u1",
        type: "SHIFT_REMINDER",
        title: "Nhắc ca",
        message: "Đã gửi",
        dedupeKey: "already-sent",
      },
      {
        userId: "u2",
        type: "SHIFT_REMINDER",
        title: "Nhắc ca",
        message: "Mới",
        dedupeKey: "fresh-key",
      },
    ]);

    expect(report).toEqual({
      count: 1,
      insertedDedupeKeys: ["fresh-key"],
    });

    // When concurrent race causes createMany to insert 0 rows, insertedDedupeKeys must be empty
    const zeroCreateMany = vi.fn(async () => ({ count: 0 }));
    const zeroFindMany = vi.fn(async () => []);
    const raceReport = await createNotificationsWithDedupeReport(
      {
        notification: { createMany: zeroCreateMany, findMany: zeroFindMany },
      } as unknown as Parameters<typeof createNotifications>[0],
      [
        {
          userId: "u2",
          type: "SHIFT_REMINDER",
          title: "Nhắc ca",
          message: "Đua tranh",
          dedupeKey: "race-key",
        },
      ],
    );
    expect(raceReport).toEqual({
      count: 0,
      insertedDedupeKeys: [],
    });
  });
});
