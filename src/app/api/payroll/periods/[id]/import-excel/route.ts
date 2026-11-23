import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { payrollExcelService } from "@/modules/payroll/excel-import.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("payroll:calculate");
    const { id: periodId } = await params;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Step 1: Upload file and return validation preview
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return handleApiError(new Error("Vui lòng chọn file Excel để tải lên"));
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const preview = await payrollExcelService.previewExcel(periodId, buffer);
      return apiSuccess(preview);
    } else {
      // Step 2: Confirm & Apply the previewed rows
      const body = await request.json();
      const rows = body.rows;

      if (!Array.isArray(rows) || rows.length === 0) {
        return handleApiError(new Error("Danh sách dữ liệu không hợp lệ"));
      }

      // Convert serialized string BigInts back to BigInt
      const sanitizedRows = rows.map((r: Record<string, unknown>) => ({
        ...r,
        hourlyRateVND: BigInt(String(r.hourlyRateVND || 0)),
        basePayVND: BigInt(String(r.basePayVND || 0)),
        allowancesVND: BigInt(String(r.allowancesVND || 0)),
        bonusesVND: BigInt(String(r.bonusesVND || 0)),
        deductionsVND: BigInt(String(r.deductionsVND || 0)),
        totalPayVND: BigInt(String(r.totalPayVND || 0)),
      })) as unknown as Parameters<typeof payrollExcelService.applyImport>[1];

      const result = await payrollExcelService.applyImport(
        periodId,
        sanitizedRows,
        actor,
      );
      return apiSuccess(result);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

