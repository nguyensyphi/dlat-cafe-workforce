import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { AppValidationError } from "@/lib/permissions";
import { employeeCsvService } from "@/modules/employees/employee-csv.service";

const importCsvRequestSchema = z.object({
  csvText: z.string().min(1, "Vui lòng cung cấp nội dung file CSV"),
  mode: z.enum(["preview", "commit"]).default("preview"),
  skipInvalid: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("employees:write");
    const body = await request.json();
    const parsed = importCsvRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Dữ liệu yêu cầu không hợp lệ",
      );
    }

    const { csvText, mode, skipInvalid } = parsed.data;

    if (mode === "preview") {
      const preview = await employeeCsvService.previewImport(actor, csvText);
      return apiSuccess(preview);
    }

    const result = await employeeCsvService.commitImport(actor, csvText, {
      skipInvalid,
    });
    return apiSuccess(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
