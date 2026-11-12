import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppConfirmationRequiredError, AppError } from "@/lib/permissions";

// Polyfill BigInt.prototype.toJSON for Node/Next.js JSON.stringify
if (typeof (BigInt.prototype as unknown as { toJSON?: () => unknown }).toJSON === "undefined") {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function () {
      const num = Number(this);
      return Number.isSafeInteger(num) ? num : this.toString();
    },
    writable: true,
    configurable: true,
  });
}

export function safeJsonSerialize<T>(data: T): T {
  if (data === undefined || data === null) return data;
  return JSON.parse(
    JSON.stringify(data, (_, v) => {
      if (typeof v === "bigint") {
        const num = Number(v);
        return Number.isSafeInteger(num) ? num : v.toString();
      }
      return v;
    }),
  );
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data: safeJsonSerialize(data) }, { status });
}

export function apiError(
  message: string,
  status = 400,
  code = "BAD_REQUEST",
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error instanceof AppConfirmationRequiredError
            ? { details: error.details }
            : {}),
        },
      },
      { status: error.statusCode },
    );
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join(".") ? `${firstIssue.path.join(".")}: ` : ""}${firstIssue.message}`
      : "Dữ liệu đầu vào không hợp lệ";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message,
          issues: error.issues,
        },
      },
      { status: 400 },
    );
  }

  const errorStr = String(error);
  const prismaCode = (error as { code?: string })?.code;

  if (
    prismaCode === "P1001" ||
    errorStr.includes("Can't reach database server") ||
    errorStr.includes("ECONNREFUSED")
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message:
            "Không thể kết nối đến cơ sở dữ liệu PostgreSQL (cổng 5433). Vui lòng bật Docker Desktop và chạy lệnh 'docker compose up -d' để khởi động container database.",
        },
      },
      { status: 503 },
    );
  }

  console.error("[API Error]", error);
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Đã xảy ra lỗi hệ thống, vui lòng thử lại sau",
      },
    },
    { status: 500 },
  );
}

