import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { employeeCsvService } from "@/modules/employees/employee-csv.service";

export async function GET() {
  try {
    await requireApiSession("employees:write");
    const csvContent = employeeCsvService.generateTemplate();
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="mau-nhap-nhan-vien-dlat.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
