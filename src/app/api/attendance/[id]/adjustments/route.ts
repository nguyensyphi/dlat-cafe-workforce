import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "@/lib/permissions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireServerSession("self:attendance");
    const { id } = await params;
    const body = await request.json();

    if (!actor.employeeId) {
      throw new AppForbiddenError("Tài khoản chưa được liên kết với hồ sơ nhân viên.");
    }

    const attendance = await prisma.attendance.findUnique({
      where: { id },
    });

    if (!attendance) {
      throw new AppNotFoundError("Không tìm thấy bản ghi chấm công.");
    }

    // Nhân viên chỉ được gửi yêu cầu cho chấm công của chính mình
    if (actor.role === "EMPLOYEE" && attendance.employeeId !== actor.employeeId) {
      throw new AppForbiddenError("Bạn không có quyền yêu cầu hiệu chỉnh công của nhân viên khác.");
    }

    if (!body.reason || body.reason.trim().length < 5) {
      throw new AppValidationError("Vui lòng nhập lý do điều chỉnh tối thiểu 5 ký tự.");
    }

    const requestRecord = await prisma.attendanceAdjustmentRequest.create({
      data: {
        attendanceId: id,
        employeeId: attendance.employeeId,
        requestedType: body.requestedType ?? "TIME_CORRECTION",
        proposedClockIn: body.proposedClockIn ? new Date(body.proposedClockIn) : null,
        proposedClockOut: body.proposedClockOut ? new Date(body.proposedClockOut) : null,
        proposedMinutes: body.proposedMinutes ? Number(body.proposedMinutes) : null,
        reason: body.reason.trim(),
        status: "PENDING",
      },
    });

    // Ghi audit log
    await prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: "REQUEST_ATTENDANCE_ADJUSTMENT",
        entityType: "AttendanceAdjustmentRequest",
        entityId: requestRecord.id,
        newValues: {
          attendanceId: id,
          reason: body.reason.trim(),
        },
      },
    });

    return apiSuccess({ adjustmentRequest: requestRecord }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

