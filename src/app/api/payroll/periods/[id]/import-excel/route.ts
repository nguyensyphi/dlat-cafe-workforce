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
      const sanitizedRows = rows.map((r: any) => ({
        ...r,
        hourlyRateVND: BigInt(r.hourlyRateVND || 0),
        basePayVND: BigInt(r.basePayVND || 0),
        allowancesVND: BigInt(r.allowancesVND || 0),
        bonusesVND: BigInt(r.bonusesVND || 0),
        deductionsVND: BigInt(r.deductionsVND || 0),
        totalPayVND: BigInt(r.totalPayVND || 0),
      }));

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

