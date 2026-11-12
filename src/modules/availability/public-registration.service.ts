import { prisma } from "@/lib/prisma";
import { formatDateTimeVN, formatIsoDateOnly, getWeekMondayDateString, todayDateStringVN } from "@/lib/date";
import { addDaysToDateString, buildShiftInterval, listWeekDates } from "@/lib/shift-time";
import { AppForbiddenError, AppNotFoundError, AppUnauthorizedError, AppValidationError } from "@/lib/permissions";

export interface RegistrationSlotInput {
  workDate: string;
  templateId: string;
  preference: "AVAILABLE" | "PREFERRED" | "UNAVAILABLE";
}

export function validateEmployeePin(phone: string, pinCode: string): boolean {
  if (!phone || !pinCode) return false;
  const cleanPhone = phone.replace(/\D/g, "");
  const cleanPin = pinCode.replace(/\D/g, "");
  if (cleanPin.length < 4) return false;
  return cleanPhone.endsWith(cleanPin);
}

export function isRegistrationOpen(deadline: Date | null, currentTime: Date = new Date()): boolean {
  if (!deadline) return true;
  return currentTime.getTime() <= deadline.getTime();
}

export function validateRegistrationPayload(data: {
  employeeId?: string;
  pinCode?: string;
  weekStart?: string;
  slots?: RegistrationSlotInput[];
  desiredShifts?: number;
}): { isValid: boolean; error?: string } {
  if (!data.employeeId?.trim()) return { isValid: false, error: "Vui lòng chọn nhân viên" };
  if (!data.pinCode || data.pinCode.trim().length < 4) return { isValid: false, error: "Mã PIN phải gồm ít nhất 4 chữ số (4 số cuối SĐT)" };
  if (!data.weekStart?.trim()) return { isValid: false, error: "Thiếu ngày bắt đầu tuần" };
  if (!data.slots || data.slots.length === 0) return { isValid: false, error: "Vui lòng chọn ít nhất 1 ca rảnh" };

  for (const s of data.slots) {
    if (!["AVAILABLE", "PREFERRED", "UNAVAILABLE"].includes(s.preference)) {
      return { isValid: false, error: `Nguyện vọng ca không hợp lệ: ${s.preference}` };
    }
  }

  return { isValid: true };
}

export async function getPublicScheduleRegistrationData(
  requestedWeek?: string | null,
  employeeId?: string | null,
  pin?: string | null,
) {
  // If no week requested, default to next week's Monday (or current week)
  const today = todayDateStringVN();
  const defaultMonday = getWeekMondayDateString(today);
  const nextMonday = addDaysToDateString(defaultMonday, 7);
  const weekStart = requestedWeek ? getWeekMondayDateString(requestedWeek) : nextMonday;

  // Find schedule for this week if exists
  const schedule = await prisma.schedule.findUnique({
    where: { weekStart: new Date(`${weekStart}T00:00:00.000Z`) },
    select: {
      id: true,
      name: true,
      availabilityDeadline: true,
      status: true,
    },
  });

  // Calculate guaranteed deadline for upcoming week (default 23:59 Sunday prior to weekStart)
  const priorSundayStr = addDaysToDateString(weekStart, -1);
  const defaultDeadline = new Date(`${priorSundayStr}T23:59:59.000Z`);
  const effectiveDeadline = schedule?.availabilityDeadline || defaultDeadline;
  const isDeadlinePassed = !isRegistrationOpen(effectiveDeadline);
  const isScheduleLocked = schedule?.status === "PUBLISHED" || schedule?.status === "LOCKED";
  const isOpen = !isDeadlinePassed && !isScheduleLocked;

  // Active templates
  const templates = await prisma.shiftTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      startTime: true,
      endTime: true,
      breakMinutes: true,
      priority: true,
    },
  });

  // Active employees - DO NOT expose phone or email
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      primaryPosition: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  // Check existing preferences if employeeId & pin provided
  let authResult: {
    authenticated: boolean;
    pinError?: string;
    existingPreferences?: Array<{
      workDate: string;
      templateId: string;
      preference: string;
    }>;
    note?: string;
  } | null = null;

  if (employeeId && pin) {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { phone: true, fullName: true },
    });

    if (!emp) {
      authResult = { authenticated: false, pinError: "Không tìm thấy nhân viên" };
    } else if (!validateEmployeePin(emp.phone, pin)) {
      authResult = { authenticated: false, pinError: "Mã PIN không đúng (phải là 4 số cuối SĐT của bạn)" };
    } else {
      const records = await prisma.availability.findMany({
        where: {
          employeeId,
          weekStart: new Date(`${weekStart}T00:00:00.000Z`),
        },
        select: {
          workDate: true,
          templateId: true,
          preference: true,
          note: true,
        },
      });

      const rawNote = records.find((r) => Boolean(r.note))?.note ?? "";
      let desiredShifts: number | undefined;
      const desiredMatch = rawNote.match(/\[Nguyện vọng:\s*(\d+)\s*ca\/tuần\]/);
      if (desiredMatch && desiredMatch[1]) {
        desiredShifts = parseInt(desiredMatch[1], 10);
      }
      const cleanNote = rawNote.replace(/\[Nguyện vọng:\s*\d+\s*ca\/tuần\]\s*/g, "").trim();

      authResult = {
        authenticated: true,
        existingPreferences: records
          .filter((r) => r.templateId !== null)
          .map((r) => ({
            workDate: formatIsoDateOnly(r.workDate),
            templateId: r.templateId!,
            preference: r.preference,
          })),
        desiredShifts,
        note: cleanNote,
      };
    }
  }

  const weekDates = listWeekDates(weekStart);
  const deadlineFormatted = formatDateTimeVN(effectiveDeadline);

  return {
    weekStart,
    weekDates,
    schedule: {
      id: schedule?.id || null,
      name: schedule?.name || `Lịch làm việc tuần tới (${weekDates[0]} – ${weekDates[6]})`,
      availabilityDeadline: effectiveDeadline.toISOString(),
      deadlineFormatted,
      status: schedule?.status || "DRAFT",
    },
    isOpen,
    isDeadlinePassed,
    isScheduleLocked,
    templates,
    employees,
    authResult,
  };
}

export async function submitPublicScheduleRegistration(payload: {
  employeeId: string;
  pinCode: string;
  weekStart: string;
  slots: RegistrationSlotInput[];
  desiredShifts?: number;
  note?: string;
}) {
  const validation = validateRegistrationPayload(payload);
  if (!validation.isValid) {
    throw new AppValidationError(validation.error || "Dữ liệu không hợp lệ");
  }

  const weekStart = getWeekMondayDateString(payload.weekStart);

  // Check employee & PIN
  const emp = await prisma.employee.findUnique({
    where: { id: payload.employeeId },
    select: { id: true, phone: true, fullName: true, status: true },
  });

  if (!emp || emp.status !== "ACTIVE") {
    throw new AppNotFoundError("Nhân viên không tồn tại hoặc đã ngừng làm việc");
  }

  if (!validateEmployeePin(emp.phone, payload.pinCode)) {
    throw new AppUnauthorizedError("Mã PIN không chính xác (Vui lòng nhập đúng 4 số cuối SĐT đã đăng ký)");
  }

  // Check schedule deadline
  const schedule = await prisma.schedule.findUnique({
    where: { weekStart: new Date(`${weekStart}T00:00:00.000Z`) },
    select: { id: true, availabilityDeadline: true, status: true },
  });

  if (schedule) {
    if (schedule.status === "PUBLISHED" || schedule.status === "LOCKED") {
      throw new AppForbiddenError("Lịch tuần này đã được Quản lý chốt, không nhận thêm đăng ký mới");
    }
    if (schedule.availabilityDeadline && !isRegistrationOpen(schedule.availabilityDeadline)) {
      throw new AppForbiddenError(`Đợt đăng ký đã kết thúc lúc ${formatDateTimeVN(schedule.availabilityDeadline)}`);
    }
  }

  // Load templates to build shift intervals
  const templates = await prisma.shiftTemplate.findMany({
    where: { isActive: true },
  });
  const tplMap = new Map(templates.map((t) => [t.id, t]));

  // Format note with desired shifts prefix if provided
  const desiredPrefix = payload.desiredShifts ? `[Nguyện vọng: ${payload.desiredShifts} ca/tuần]` : "";
  const finalNote = [desiredPrefix, payload.note?.trim()].filter(Boolean).join(" ") || null;

  // Upsert in transaction
  await prisma.$transaction(async (tx) => {
    for (const slot of payload.slots) {
      const tpl = tplMap.get(slot.templateId);
      if (!tpl) continue;

      const { startAt, endAt } = buildShiftInterval(
        slot.workDate,
        tpl.startTime,
        tpl.endTime,
      );

      await tx.availability.upsert({
        where: {
          employeeId_workDate_templateId: {
            employeeId: payload.employeeId,
            workDate: new Date(`${slot.workDate}T00:00:00.000Z`),
            templateId: slot.templateId,
          },
        },
        update: {
          preference: slot.preference,
          startAt,
          endAt,
          submissionStatus: "SUBMITTED",
          note: finalNote,
        },
        create: {
          employeeId: payload.employeeId,
          weekStart: new Date(`${weekStart}T00:00:00.000Z`),
          workDate: new Date(`${slot.workDate}T00:00:00.000Z`),
          templateId: slot.templateId,
          startAt,
          endAt,
          preference: slot.preference,
          submissionStatus: "SUBMITTED",
          note: finalNote,
        },
      });
    }
  });

  return {
    success: true,
    message: `Đã lưu thành công đăng ký ca của ${emp.fullName}`,
    employeeName: emp.fullName,
    slotCount: payload.slots.length,
    weekStart,
  };
}
