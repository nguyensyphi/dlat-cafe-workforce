import {
  PrismaClient,
  ScheduleStatus,
  AssignmentStatus,
  AvailabilityPreference,
  AvailabilitySubmissionStatus,
  LeaveStatus,
  SwapStatus,
  AttendanceStatus,
  AttendanceSource,
  AttendanceEventType,
  PayrollStatus,
  HandoverStatus,
  Prisma,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Đang khởi tạo dữ liệu vận hành thực tế cho D'lat Cafe...");

  // 1. Fetch reference records
  const ownerUser = await prisma.user.findUniqueOrThrow({
    where: { email: "owner@dlatcafe.vn" },
  });
  const managerUser = await prisma.user.findUniqueOrThrow({
    where: { email: "manager@dlatcafe.vn" },
  });

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: {
      primaryPosition: true,
      payRates: { orderBy: { effectiveFrom: "desc" }, take: 1 },
      user: true,
    },
    orderBy: { employeeCode: "asc" },
  });

  const templates = await prisma.shiftTemplate.findMany({
    where: { isActive: true },
    orderBy: { startTime: "asc" },
  });

  const positions = await prisma.position.findMany();
  const posMap = new Map(positions.map((p) => [p.code, p.id]));

  if (employees.length === 0 || templates.length === 0) {
    throw new Error("Vui lòng chạy seed.ts trước khi chạy seed-operational-data.ts");
  }

  // Find specific employees
  const namLe = employees.find((e) => e.employeeCode === "NV-001") ?? employees[0]!;
  const huongTran = employees.find((e) => e.employeeCode === "NV-002") ?? employees[1]!;
  const minhHoang = employees.find((e) => e.employeeCode === "NV-003") ?? employees[2]!;
  const lanPham = employees.find((e) => e.employeeCode === "NV-004") ?? employees[3]!;
  const thangVu = employees.find((e) => e.employeeCode === "NV-005") ?? employees[4]!;
  const thaoDang = employees.find((e) => e.employeeCode === "NV-006") ?? employees[5]!;
  const huyBui = employees.find((e) => e.employeeCode === "NV-007") ?? employees[6]!;
  const quanDo = employees.find((e) => e.employeeCode === "NV-008") ?? employees[7]!;

  const tplSang = templates.find((t) => t.code === "CA_SANG") ?? templates[0]!;
  const tplChieu = templates.find((t) => t.code === "CA_CHIEU") ?? templates[1]!;
  const tplToi = templates.find((t) => t.code === "CA_TOI") ?? templates[2]!;

  // -------------------------------------------------------------
  // 2. Schedule for Current Week: 09/11/2026 - 15/11/2026 (PUBLISHED - TUẦN HIỆN TẠI)
  // -------------------------------------------------------------
  const currentWeekStart = new Date("2026-11-09T00:00:00.000Z");

  const currentSchedule = await prisma.schedule.upsert({
    where: { weekStart: currentWeekStart },
    update: {
      status: ScheduleStatus.PUBLISHED,
      publishedAt: new Date("2026-11-08T10:00:00.000Z"),
      publishedById: managerUser.id,
      name: "Lịch tuần 46 (09/11 - 15/11/2026)",
    },
    create: {
      weekStart: currentWeekStart,
      name: "Lịch tuần 46 (09/11 - 15/11/2026)",
      status: ScheduleStatus.PUBLISHED,
      publishedAt: new Date("2026-11-08T10:00:00.000Z"),
      publishedById: managerUser.id,
    },
  });

  console.log("   ✓ Lịch tuần hiện tại:", currentSchedule.name);

  // Clear existing operational data in correct foreign key order
  await prisma.shiftHandover.deleteMany({});
  await prisma.attendanceAdjustmentRequest.deleteMany({});
  await prisma.attendanceEvent.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.swapRequest.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.availability.deleteMany({});
  await prisma.shiftAssignment.deleteMany({});
  await prisma.shift.deleteMany({});

  const daysOfWeek = [
    { dateStr: "2026-11-09", dayName: "Thứ 2" },
    { dateStr: "2026-11-10", dayName: "Thứ 3" },
    { dateStr: "2026-11-11", dayName: "Thứ 4" }, // HÔM NAY (11/11/2026)
    { dateStr: "2026-11-12", dayName: "Thứ 5" },
    { dateStr: "2026-11-13", dayName: "Thứ 6" },
    { dateStr: "2026-11-14", dayName: "Thứ 7" },
    { dateStr: "2026-11-15", dayName: "Chủ nhật" },
  ];

  const shiftRecords: Array<{
    id: string;
    workDate: Date;
    tplCode: string;
    startAt: Date;
    endAt: Date;
  }> = [];

  for (const day of daysOfWeek) {
    const workDate = new Date(`${day.dateStr}T00:00:00.000Z`);

    // Sáng: 06:00 - 12:00
    const startSang = new Date(`${day.dateStr}T06:00:00.000+07:00`);
    const endSang = new Date(`${day.dateStr}T12:00:00.000+07:00`);
    const shiftSang = await prisma.shift.create({
      data: {
        scheduleId: currentSchedule.id,
        templateId: tplSang.id,
        workDate,
        name: `Ca Sáng (${day.dayName})`,
        startAt: startSang,
        endAt: endSang,
        breakMinutes: 0,
        requiredStaff: tplSang.minStaff,
        maxStaff: tplSang.maxStaff,
        priority: 2,
        isPeak: true,
      },
    });
    shiftRecords.push({ id: shiftSang.id, workDate, tplCode: "CA_SANG", startAt: startSang, endAt: endSang });

    // Chiều: 12:00 - 18:00
    const startChieu = new Date(`${day.dateStr}T12:00:00.000+07:00`);
    const endChieu = new Date(`${day.dateStr}T18:00:00.000+07:00`);
    const shiftChieu = await prisma.shift.create({
      data: {
        scheduleId: currentSchedule.id,
        templateId: tplChieu.id,
        workDate,
        name: `Ca Chiều (${day.dayName})`,
        startAt: startChieu,
        endAt: endChieu,
        breakMinutes: 0,
        requiredStaff: tplChieu.minStaff,
        maxStaff: tplChieu.maxStaff,
        priority: 1,
        isPeak: false,
      },
    });
    shiftRecords.push({ id: shiftChieu.id, workDate, tplCode: "CA_CHIEU", startAt: startChieu, endAt: endChieu });

    // Tối: 18:00 - 23:00
    const startToi = new Date(`${day.dateStr}T18:00:00.000+07:00`);
    const endToi = new Date(`${day.dateStr}T23:00:00.000+07:00`);
    const shiftToi = await prisma.shift.create({
      data: {
        scheduleId: currentSchedule.id,
        templateId: tplToi.id,
        workDate,
        name: `Ca Tối (${day.dayName})`,
        startAt: startToi,
        endAt: endToi,
        breakMinutes: 0,
        requiredStaff: tplToi.minStaff,
        maxStaff: tplToi.maxStaff,
        priority: 2,
        isPeak: true,
      },
    });
    shiftRecords.push({ id: shiftToi.id, workDate, tplCode: "CA_TOI", startAt: startToi, endAt: endToi });

    // Assign employees to shifts
    // Ca Sáng: Thắng (Trưởng ca), Nam (Pha chế), Hương (Thu ngân), Minh (Phục vụ)
    await prisma.shiftAssignment.createMany({
      data: [
        {
          shiftId: shiftSang.id,
          employeeId: thangVu.id,
          positionId: posMap.get("TRUONG_CA") ?? thangVu.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
        {
          shiftId: shiftSang.id,
          employeeId: namLe.id,
          positionId: posMap.get("PHA_CHE") ?? namLe.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
        {
          shiftId: shiftSang.id,
          employeeId: huongTran.id,
          positionId: posMap.get("THU_NGAN") ?? huongTran.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
        {
          shiftId: shiftSang.id,
          employeeId: minhHoang.id,
          positionId: posMap.get("PHUC_VU") ?? minhHoang.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
      ],
    });

    // Ca Chiều: Lan (Pha chế), Thảo (Phục vụ), Huy (Pha chế/Thu ngân)
    await prisma.shiftAssignment.createMany({
      data: [
        {
          shiftId: shiftChieu.id,
          employeeId: lanPham.id,
          positionId: posMap.get("PHA_CHE") ?? lanPham.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
        {
          shiftId: shiftChieu.id,
          employeeId: thaoDang.id,
          positionId: posMap.get("PHUC_VU") ?? thaoDang.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
        {
          shiftId: shiftChieu.id,
          employeeId: huyBui.id,
          positionId: posMap.get("THU_NGAN") ?? huyBui.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
      ],
    });

    // Ca Tối: Thắng (Trưởng ca), Nam (Pha chế), Quân (Phục vụ)
    await prisma.shiftAssignment.createMany({
      data: [
        {
          shiftId: shiftToi.id,
          employeeId: thangVu.id,
          positionId: posMap.get("TRUONG_CA") ?? thangVu.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
        {
          shiftId: shiftToi.id,
          employeeId: namLe.id,
          positionId: posMap.get("PHA_CHE") ?? namLe.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
        {
          shiftId: shiftToi.id,
          employeeId: quanDo.id,
          positionId: posMap.get("PHUC_VU") ?? quanDo.primaryPositionId,
          status: AssignmentStatus.ASSIGNED,
          assignedById: managerUser.id,
        },
      ],
    });
  }

  console.log("   ✓ Đã tạo 21 ca làm việc và phân công đầy đủ cho 7 ngày trong tuần.");

  // -------------------------------------------------------------
  // 3. Schedule for Next Week: 16/11/2026 - 22/11/2026 (DRAFT)
  // -------------------------------------------------------------
  const nextWeekStart = new Date("2026-11-16T00:00:00.000Z");
  await prisma.schedule.upsert({
    where: { weekStart: nextWeekStart },
    update: {
      name: "Lịch tuần 47 (16/11 - 22/11/2026)",
      status: ScheduleStatus.DRAFT,
    },
    create: {
      weekStart: nextWeekStart,
      name: "Lịch tuần 47 (16/11 - 22/11/2026)",
      status: ScheduleStatus.DRAFT,
      availabilityDeadline: new Date("2026-11-14T23:59:59.000Z"),
    },
  });

  // -------------------------------------------------------------
  // 4. Availabilities for Next Week
  // -------------------------------------------------------------
  const nextWeekDays = [
    { date: new Date("2026-11-16T00:00:00.000Z"), str: "2026-11-16" },
    { date: new Date("2026-11-17T00:00:00.000Z"), str: "2026-11-17" },
    { date: new Date("2026-11-18T00:00:00.000Z"), str: "2026-11-18" },
    { date: new Date("2026-11-19T00:00:00.000Z"), str: "2026-11-19" },
    { date: new Date("2026-11-20T00:00:00.000Z"), str: "2026-11-20" },
  ];

  for (const d of nextWeekDays) {
    const sSang = new Date(`${d.str}T06:00:00.000+07:00`);
    const eSang = new Date(`${d.str}T12:00:00.000+07:00`);
    const sChieu = new Date(`${d.str}T12:00:00.000+07:00`);
    const eChieu = new Date(`${d.str}T18:00:00.000+07:00`);
    const sToi = new Date(`${d.str}T18:00:00.000+07:00`);
    const eToi = new Date(`${d.str}T23:00:00.000+07:00`);

    await prisma.availability.createMany({
      data: [
        {
          employeeId: namLe.id,
          weekStart: nextWeekStart,
          templateId: tplSang.id,
          workDate: d.date,
          startAt: sSang,
          endAt: eSang,
          preference: AvailabilityPreference.PREFERRED,
          submissionStatus: AvailabilitySubmissionStatus.SUBMITTED,
          note: "Thích làm ca sáng",
        },
        {
          employeeId: huongTran.id,
          weekStart: nextWeekStart,
          templateId: tplSang.id,
          workDate: d.date,
          startAt: sSang,
          endAt: eSang,
          preference: AvailabilityPreference.AVAILABLE,
          submissionStatus: AvailabilitySubmissionStatus.SUBMITTED,
        },
        {
          employeeId: minhHoang.id,
          weekStart: nextWeekStart,
          templateId: tplChieu.id,
          workDate: d.date,
          startAt: sChieu,
          endAt: eChieu,
          preference: AvailabilityPreference.AVAILABLE,
          submissionStatus: AvailabilitySubmissionStatus.SUBMITTED,
        },
        {
          employeeId: lanPham.id,
          weekStart: nextWeekStart,
          templateId: tplToi.id,
          workDate: d.date,
          startAt: sToi,
          endAt: eToi,
          preference: AvailabilityPreference.UNAVAILABLE,
          submissionStatus: AvailabilitySubmissionStatus.SUBMITTED,
          note: "Bận học buổi tối",
        },
      ],
      skipDuplicates: true,
    });
  }

  console.log("   ✓ Đã tạo nguyện vọng lịch rảnh tuần tới.");

  // -------------------------------------------------------------
  // 5. Attendance Records for Past Days & Today (11/11/2026)
  // -------------------------------------------------------------
  const todayStr = "2026-11-11";
  const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

  // Past days: 09, 10 November (Completed and Approved attendances)
  const pastDays = ["2026-11-09", "2026-11-10"];
  for (const dateStr of pastDays) {
    const wDate = new Date(`${dateStr}T00:00:00.000Z`);
    const shiftsOfDay = shiftRecords.filter((s) => s.workDate.getTime() === wDate.getTime());
    const sangShift = shiftsOfDay.find((s) => s.tplCode === "CA_SANG");
    const chieuShift = shiftsOfDay.find((s) => s.tplCode === "CA_CHIEU");

    // Nam Le worked Morning shift on past days
    if (sangShift) {
      const clockIn = new Date(`${dateStr}T05:58:00.000+07:00`);
      const clockOut = new Date(`${dateStr}T12:02:00.000+07:00`);
      const att = await prisma.attendance.create({
        data: {
          employeeId: namLe.id,
          shiftId: sangShift.id,
          workDate: wDate,
          clockIn,
          clockOut,
          scheduledMinutes: 360,
          workedMinutes: 364,
          approvedMinutes: 360,
          paidMinutes: 360,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          breakMinutes: 0,
          status: AttendanceStatus.APPROVED,
          source: AttendanceSource.QR,
          approvedById: managerUser.id,
          approvedAt: new Date(`${dateStr}T18:00:00.000+07:00`),
        },
      });

      await prisma.attendanceEvent.createMany({
        data: [
          {
            attendanceId: att.id,
            eventType: AttendanceEventType.CLOCK_IN,
            occurredAt: clockIn,
            source: AttendanceSource.QR,
            recordedById: namLe.userId,
          },
          {
            attendanceId: att.id,
            eventType: AttendanceEventType.CLOCK_OUT,
            occurredAt: clockOut,
            source: AttendanceSource.QR,
            recordedById: namLe.userId,
          },
        ],
      });
    }

    // Huong Tran worked Morning shift
    if (sangShift) {
      const clockIn = new Date(`${dateStr}T06:01:00.000+07:00`);
      const clockOut = new Date(`${dateStr}T12:00:00.000+07:00`);
      await prisma.attendance.create({
        data: {
          employeeId: huongTran.id,
          shiftId: sangShift.id,
          workDate: wDate,
          clockIn,
          clockOut,
          scheduledMinutes: 360,
          workedMinutes: 359,
          approvedMinutes: 360,
          paidMinutes: 360,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          status: AttendanceStatus.APPROVED,
          source: AttendanceSource.QR,
          approvedById: managerUser.id,
        },
      });
    }

    // Lan Pham worked Afternoon shift
    if (chieuShift) {
      const clockIn = new Date(`${dateStr}T12:05:00.000+07:00`);
      const clockOut = new Date(`${dateStr}T18:00:00.000+07:00`);
      await prisma.attendance.create({
        data: {
          employeeId: lanPham.id,
          shiftId: chieuShift.id,
          workDate: wDate,
          clockIn,
          clockOut,
          scheduledMinutes: 360,
          workedMinutes: 355,
          approvedMinutes: 360,
          paidMinutes: 360,
          lateMinutes: 5,
          earlyLeaveMinutes: 0,
          status: AttendanceStatus.APPROVED,
          source: AttendanceSource.QR,
          approvedById: managerUser.id,
        },
      });
    }
  }

  // Today (06/11/2026):
  const todayShifts = shiftRecords.filter((s) => s.workDate.getTime() === todayDate.getTime());
  const todaySang = todayShifts.find((s) => s.tplCode === "CA_SANG");
  const todayChieu = todayShifts.find((s) => s.tplCode === "CA_CHIEU");

  // 1. Nam Le completed Morning shift today
  if (todaySang) {
    const clockInToday = new Date(`${todayStr}T05:59:00.000+07:00`);
    const clockOutToday = new Date(`${todayStr}T12:01:00.000+07:00`);
    const attToday = await prisma.attendance.create({
      data: {
        employeeId: namLe.id,
        shiftId: todaySang.id,
        workDate: todayDate,
        clockIn: clockInToday,
        clockOut: clockOutToday,
        scheduledMinutes: 360,
        workedMinutes: 362,
        approvedMinutes: 360,
        paidMinutes: 360,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        status: AttendanceStatus.APPROVED,
        source: AttendanceSource.QR,
        approvedById: managerUser.id,
        approvedAt: new Date(`${todayStr}T12:05:00.000+07:00`),
      },
    });

    await prisma.attendanceEvent.createMany({
      data: [
        {
          attendanceId: attToday.id,
          eventType: AttendanceEventType.CLOCK_IN,
          occurredAt: clockInToday,
          source: AttendanceSource.QR,
          recordedById: namLe.userId,
        },
        {
          attendanceId: attToday.id,
          eventType: AttendanceEventType.CLOCK_OUT,
          occurredAt: clockOutToday,
          source: AttendanceSource.QR,
          recordedById: namLe.userId,
        },
      ],
    });

    // Tạo biên bản bàn giao ca (Shift Handover) chuẩn cho Ca Sáng ngày hôm nay
    await prisma.shiftHandover.create({
      data: {
        shiftId: todaySang.id,
        handoverEmployeeId: namLe.id,
        receivingEmployeeId: lanPham.id,
        reviewerUserId: managerUser.id,
        status: HandoverStatus.CONFIRMED,
        submittedAt: new Date(`${todayStr}T12:02:00.000+07:00`),
        confirmedAt: new Date(`${todayStr}T12:05:00.000+07:00`),
        openingCashVnd: 1000000n,
        cashSalesVnd: 3250000n,
        cashExpensesVnd: 150000n,
        expectedClosingCashVnd: 4100000n,
        actualClosingCashVnd: 4100000n,
        cashDifferenceVnd: 0n,
        cardSalesVnd: 2100000n,
        qrWalletSalesVnd: 1850000n,
        posTotalSalesVnd: 7200000n,
        stockReport: [
          { code: "CF", name: "Cà phê hạt Robusta & Arabica", unit: "kg", quantity: 5.2, status: "SUFFICIENT" },
          { code: "MILK_FRESH", name: "Sữa tươi Barista", unit: "hộp 1L", quantity: 8, status: "SUFFICIENT" },
          { code: "MILK_CONDENSED", name: "Sữa đặc Ngôi sao", unit: "lon", quantity: 12, status: "SUFFICIENT" },
          { code: "TEA", name: "Trà lài & Oolong", unit: "gói", quantity: 3, status: "SUFFICIENT" },
          { code: "ICE", name: "Đá viên bi", unit: "bao", quantity: 4, status: "SUFFICIENT" },
          { code: "CUPS", name: "Ly giấy & Ly nhựa 500ml", unit: "cây", quantity: 6, status: "SUFFICIENT" },
        ],
        equipmentReport: [
          { code: "ESPRESSO", name: "Máy pha Nuova Simonelli Appia II", condition: "GOOD", note: "Áp suất 9 bar chuẩn" },
          { code: "GRINDER", name: "Máy xay Fiorenzato F64E", condition: "GOOD", note: "Độ mịn số 3.5 chuẩn" },
          { code: "POS", name: "Máy POS cảm ứng & máy in bill", condition: "GOOD", note: "Còn 2 cuộn giấy in bill" },
          { code: "FRIDGE", name: "Tủ lạnh mát trưng bày sữa/trái cây", condition: "GOOD", note: "Nhiệt độ 4°C" },
        ],
        cleanlinessReport: [
          { area: "Khu vực bàn học tầng 1 & lầu", isClean: true },
          { area: "Ghế ngồi & ổ cắm điện học bài", isClean: true },
          { area: "Quầy pha chế & bồn rửa ly", isClean: true },
          { area: "Nhà vệ sinh khách & nhân viên", isClean: true },
          { area: "Thùng rác & khu vực để xe", isClean: true },
        ],
        customerNotes: "Khách bàn 04 quên sổ tay màu xanh lá, đã cất vào ngăn kéo quầy thu ngân.",
        pendingTasks: [
          { title: "Nhận hàng sữa tươi chiều", description: "Nhà cung cấp giao 2 thùng sữa tươi lúc 14:30", priority: "HIGH", status: "PENDING" },
        ],
        handoverNotes: "Ca sáng đông khách sinh viên học bài, quầy pha chế vận hành ổn định.",
        reviewNotes: "Quản lý đã kiểm két lúc 12:05, đủ 4.100.000đ tiền mặt, phiếu bàn giao hợp lệ.",
      },
    });
  }

  // 2. Minh Hoang was 15 minutes late today (Late arrival anomaly)
  if (todaySang) {
    const clockInLate = new Date(`${todayStr}T06:15:00.000+07:00`);
    const clockOutLate = new Date(`${todayStr}T12:00:00.000+07:00`);
    const attLate = await prisma.attendance.create({
      data: {
        employeeId: minhHoang.id,
        shiftId: todaySang.id,
        workDate: todayDate,
        clockIn: clockInLate,
        clockOut: clockOutLate,
        scheduledMinutes: 360,
        workedMinutes: 345,
        approvedMinutes: 345,
        paidMinutes: 345,
        lateMinutes: 15,
        earlyLeaveMinutes: 0,
        status: AttendanceStatus.PENDING,
        source: AttendanceSource.QR,
      },
    });

    await prisma.attendanceEvent.create({
      data: {
        attendanceId: attLate.id,
        eventType: AttendanceEventType.CLOCK_IN,
        occurredAt: clockInLate,
        source: AttendanceSource.QR,
        recordedById: minhHoang.userId,
        note: "Kẹt xe trên đèo Prenn",
      },
    });
  }

  // 3. Huong Tran is currently clocked in (Working today)
  if (todaySang) {
    const clockInHuong = new Date(`${todayStr}T06:00:00.000+07:00`);
    await prisma.attendance.create({
      data: {
        employeeId: huongTran.id,
        shiftId: todaySang.id,
        workDate: todayDate,
        clockIn: clockInHuong,
        clockOut: null,
        scheduledMinutes: 360,
        workedMinutes: 180,
        status: AttendanceStatus.PENDING,
        source: AttendanceSource.QR,
      },
    });
  }

  // 4. Lan Pham is working Afternoon shift right now
  if (todayChieu) {
    const clockInLan = new Date(`${todayStr}T11:58:00.000+07:00`);
    await prisma.attendance.create({
      data: {
        employeeId: lanPham.id,
        shiftId: todayChieu.id,
        workDate: todayDate,
        clockIn: clockInLan,
        clockOut: null,
        scheduledMinutes: 360,
        workedMinutes: 60,
        status: AttendanceStatus.PENDING,
        source: AttendanceSource.QR,
      },
    });
  }

  console.log("   ✓ Đã tạo dữ liệu chấm công cho các ngày trong tuần và hôm nay (06/11/2026).");

  // -------------------------------------------------------------
  // 6. Leave Requests & Shift Swaps
  // -------------------------------------------------------------
  // Pending leave request for Minh Hoang
  await prisma.leaveRequest.create({
    data: {
      employeeId: minhHoang.id,
      startAt: new Date("2026-11-07T06:00:00.000+07:00"),
      endAt: new Date("2026-11-07T12:00:00.000+07:00"),
      reason: "Bị cảm sốt cần đi khám bệnh viện",
      status: LeaveStatus.PENDING,
    },
  });

  // Approved leave request for Lan Pham
  await prisma.leaveRequest.create({
    data: {
      employeeId: lanPham.id,
      startAt: new Date("2026-11-04T12:00:00.000+07:00"),
      endAt: new Date("2026-11-04T18:00:00.000+07:00"),
      reason: "Gia đình có việc hiếu hỉ ở quê",
      status: LeaveStatus.APPROVED,
      reviewedById: managerUser.id,
      reviewedAt: new Date("2026-11-03T15:00:00.000Z"),
      reviewNote: "Đã duyệt, xếp nhân viên Huy làm thay",
    },
  });

  // Shift swap request pending manager review
  if (todaySang) {
    const assignmentNam = await prisma.shiftAssignment.findFirst({
      where: { shiftId: todaySang.id, employeeId: namLe.id },
    });

    if (assignmentNam) {
      await prisma.swapRequest.create({
        data: {
          shiftId: todaySang.id,
          shiftAssignmentId: assignmentNam.id,
          requesterId: namLe.id,
          targetEmployeeId: huyBui.id,
          reason: "Bận việc gia đình buổi sáng, xin đổi sang ca chiều",
          status: SwapStatus.ACCEPTED,
          targetRespondedAt: new Date(`${todayStr}T08:00:00.000+07:00`),
        },
      });
    }
  }

  console.log("   ✓ Đã tạo đơn xin nghỉ và yêu cầu đổi ca chờ duyệt.");

  // -------------------------------------------------------------
  // 7. Payroll Periods: October 2026 (APPROVED) & November 2026 (DRAFT)
  // -------------------------------------------------------------
  const octStart = new Date("2026-10-01T00:00:00.000Z");
  const octEnd = new Date("2026-10-31T00:00:00.000Z");

  const octPeriod = await prisma.payrollPeriod.upsert({
    where: {
      periodStart_periodEnd: {
        periodStart: octStart,
        periodEnd: octEnd,
      },
    },
    update: {
      name: "Bảng lương Tháng 10/2026",
      status: PayrollStatus.APPROVED,
      approvedById: ownerUser.id,
      approvedAt: new Date("2026-11-02T10:00:00.000Z"),
      reviewedById: managerUser.id,
      reviewedAt: new Date("2026-11-01T17:00:00.000Z"),
    },
    create: {
      name: "Bảng lương Tháng 10/2026",
      periodStart: octStart,
      periodEnd: octEnd,
      cutoffDate: new Date("2026-10-31T00:00:00.000Z"),
      paymentDate: new Date("2026-11-05T00:00:00.000Z"),
      status: PayrollStatus.APPROVED,
      overtimeMultiplier: new Prisma.Decimal(1.5),
      approvedById: ownerUser.id,
      approvedAt: new Date("2026-11-02T10:00:00.000Z"),
      reviewedById: managerUser.id,
      reviewedAt: new Date("2026-11-01T17:00:00.000Z"),
      notes: "Bảng lương chính thức tháng 10/2026 đã duyệt chi trả đầy đủ",
    },
  });

  // Seed PayrollItems for all employees for October
  for (const emp of employees) {
    const rate = emp.payRates[0]?.hourlyRate ?? 25_000n;
    // Generate realistic hours (120 to 180 hours/month)
    const workedHours = 140 + (emp.fullName.charCodeAt(0) % 30);
    const otHours = emp.employeeCode === "NV-001" || emp.employeeCode === "NV-005" ? 8 : 0;
    const basePay = BigInt(workedHours) * rate;
    const otPay = BigInt(otHours) * BigInt(Math.round(Number(rate) * 1.5));
    const allowances = 300_000n; // Phụ cấp ăn trưa
    const bonuses = emp.employeeCode === "NV-001" ? 500_000n : 0n; // Thưởng chuyên cần
    const deductions = 0n;
    const totalPay = basePay + otPay + allowances + bonuses - deductions;

    await prisma.payrollItem.upsert({
      where: {
        payrollPeriodId_employeeId: {
          payrollPeriodId: octPeriod.id,
          employeeId: emp.id,
        },
      },
      update: {
        scheduledHours: new Prisma.Decimal(workedHours),
        workedHours: new Prisma.Decimal(workedHours),
        approvedHours: new Prisma.Decimal(workedHours),
        paidHours: new Prisma.Decimal(workedHours + otHours),
        overtimeHours: new Prisma.Decimal(otHours),
        hourlyRateSnapshot: rate,
        basePay,
        overtimePay: otPay,
        allowances,
        bonuses,
        deductions,
        totalPay,
      },
      create: {
        payrollPeriodId: octPeriod.id,
        employeeId: emp.id,
        scheduledHours: new Prisma.Decimal(workedHours),
        workedHours: new Prisma.Decimal(workedHours),
        approvedHours: new Prisma.Decimal(workedHours),
        paidHours: new Prisma.Decimal(workedHours + otHours),
        overtimeHours: new Prisma.Decimal(otHours),
        hourlyRateSnapshot: rate,
        basePay,
        overtimePay: otPay,
        allowances,
        bonuses,
        deductions,
        totalPay,
      },
    });
  }

  // November 2026 (DRAFT)
  const novStart = new Date("2026-11-01T00:00:00.000Z");
  const novEnd = new Date("2026-11-30T00:00:00.000Z");
  await prisma.payrollPeriod.upsert({
    where: {
      periodStart_periodEnd: {
        periodStart: novStart,
        periodEnd: novEnd,
      },
    },
    update: {
      name: "Bảng lương Tháng 11/2026",
      status: PayrollStatus.DRAFT,
    },
    create: {
      name: "Bảng lương Tháng 11/2026",
      periodStart: novStart,
      periodEnd: novEnd,
      cutoffDate: new Date("2026-11-30T00:00:00.000Z"),
      paymentDate: new Date("2026-12-05T00:00:00.000Z"),
      status: PayrollStatus.DRAFT,
      overtimeMultiplier: new Prisma.Decimal(1.5),
      notes: "Kỳ lương hiện tại đang thu thập dữ liệu chấm công",
    },
  });

  console.log("   ✓ Đã tạo kỳ lương Tháng 10 (Đã duyệt) và Tháng 11 (Bản nháp).");

  // -------------------------------------------------------------
  // 8. Sample Audit Logs
  // -------------------------------------------------------------
  await prisma.auditLog.createMany({
    data: [
      {
        userId: managerUser.id,
        action: "SCHEDULE_PUBLISHED",
        entityType: "Schedule",
        entityId: currentSchedule.id,
        newValues: { status: "PUBLISHED", weekStart: "2026-11-02" },
      },
      {
        userId: managerUser.id,
        action: "LEAVE_APPROVED",
        entityType: "LeaveRequest",
        entityId: lanPham.id,
        newValues: { status: "APPROVED", employeeName: "Phạm Thị Lan" },
      },
      {
        userId: ownerUser.id,
        action: "PAYROLL_APPROVED",
        entityType: "PayrollPeriod",
        entityId: octPeriod.id,
        newValues: { status: "APPROVED", periodName: "Bảng lương Tháng 10/2026" },
      },
    ],
  });

  console.log("   ✓ Đã tạo các bản ghi nhật ký kiểm toán hệ thống (Audit Logs).");
  console.log("🎉 Hoàn tất nạp dữ liệu vận hành thực tế cho D'lat Cafe!");
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
