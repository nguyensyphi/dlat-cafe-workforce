import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { reportsService } from "@/modules/reports/reports.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("reports:read");
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const csvData = await reportsService.exportAttendanceCsv(actor, {
      startDate,
      endDate,
    });

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="bang-cham-cong.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

