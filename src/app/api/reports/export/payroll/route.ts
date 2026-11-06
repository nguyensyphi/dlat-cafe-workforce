import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { reportsService } from "@/modules/reports/reports.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("reports:read");
    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get("periodId");

    if (!periodId) {
      return NextResponse.json(
        { success: false, message: "Thiếu mã kỳ lương periodId" },
        { status: 400 },
      );
    }

    const csvData = await reportsService.exportPayrollCsv(actor, periodId);

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bang-luong-${periodId}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

