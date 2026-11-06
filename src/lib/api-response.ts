import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppConfirmationRequiredError, AppError } from "@/lib/permissions";

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
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

