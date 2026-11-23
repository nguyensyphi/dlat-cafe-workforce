import { PrismaClient, SkillProficiency, UserRole, EmployeeStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DLAT_DAILY_CHECKLIST_SETTING_KEY,
  DLAT_DAILY_CHECKLIST_TEMPLATES,
} from "../src/modules/handover/dlat-daily-checklist";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Đang khởi tạo dữ liệu mẫu cho D'lat Cafe Workforce...");

  // 1. System Settings
  const defaultSettings = [
    {
      key: "shop_profile",
      value: {
        name: "D'lat Cafe",
        address: "12 Nguyễn Chí Thanh, Phường 1, Đà Lạt",
        phone: "0263 388 9999",
        timezone: "Asia/Ho_Chi_Minh",
        currency: "VND",
      },
      description: "Thông tin cơ bản của quán cà phê",
    },
    {
      key: "scheduling_policy",
      value: {
        minRestHours: 8,
        maxWeeklyHours: 48,
        maxConsecutiveDays: 6,
        availabilityLeadDays: 3,
      },
      description: "Chính sách xếp ca và giới hạn giờ làm việc",
    },
    {
      key: "attendance_policy",
      value: {
        qrExpirySeconds: 45,
        lateGraceMinutes: 5,
        earlyClockInMinutes: 30,
      },
      description: "Chính sách chấm công QR và độ trễ cho phép",
    },
    {
      key: "payroll_policy",
      value: {
        overtimeMultiplier: 1.5,
        overtimeWeeklyThresholdHours: 48,
      },
      description: "Chính sách tính lương và hệ số tăng ca",
    },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, description: setting.description },
      create: setting,
    });
  }

  // 2. Positions (6 vị trí ban đầu theo PRD Module 02)
  const positionDefs = [
    {
      code: "QUAN_LY",
      name: "Quản lý",
      description: "Điều hành chung hoạt động quán, nhân sự, chấm công và lịch làm việc",
      isPeakPriority: true,
      sortOrder: 1,
    },
    {
      code: "TRUONG_CA",
      name: "Trưởng ca",
      description: "Giám sát chất lượng phục vụ, mở/đóng quầy và xử lý tình huống trong ca",
      isPeakPriority: true,
      sortOrder: 2,
    },
    {
      code: "PHA_CHE",
      name: "Pha chế",
      description: "Chuẩn bị nguyên liệu, pha chế cà phê máy, trà và thức uống theo công thức",
      isPeakPriority: true,
      sortOrder: 3,
    },
    {
      code: "THU_NGAN",
      name: "Thu ngân",
      description: "Gọi món tại quầy, thanh toán POS, kiểm đếm két tiền đầu/cuối ca",
      isPeakPriority: false,
      sortOrder: 4,
    },
    {
      code: "PHUC_VU",
      name: "Phục vụ",
      description: "Đón khách, bưng bê thức uống, dọn bàn và chăm sóc không gian khách ngồi",
      isPeakPriority: false,
      sortOrder: 5,
    },
    {
      code: "VE_SINH",
      name: "Vệ sinh",
      description: "Đảm bảo vệ sinh khu vực quầy bar, sảnh khách, khu rửa ly và nhà vệ sinh",
      isPeakPriority: false,
      sortOrder: 6,
    },
  ];

  const positionMap = new Map<string, string>();
  for (const pos of positionDefs) {
    const record = await prisma.position.upsert({
      where: { code: pos.code },
      update: {
        name: pos.name,
        description: pos.description,
        isPeakPriority: pos.isPeakPriority,
        sortOrder: pos.sortOrder,
        isActive: true,
      },
      create: pos,
    });
    positionMap.set(pos.code, record.id);
  }

  // 3. Shift Templates – cấu hình vận hành D'Lat (4 ca/ngày, 4 giờ/ca):
  //    Ca 1: 07:00–11:00, Ca 2: 11:00–15:00, Ca 3: 15:00–19:00, Ca 4: 19:00–23:00.
  //    15 phút bàn giao nằm trong ca nên được tính lương 100% (isPaidBreak = true).
  //    Định biên tối thiểu 1 – tối đa 2 người/ca; khi ca có 2 người, bộ xếp lịch tự yêu cầu 1 Ca trưởng.
  await prisma.shiftTemplate.updateMany({
    where: { code: { in: ["CA_SANG", "CA_CHIEU", "CA_TOI"] } },
    data: { isActive: false },
  });
  await prisma.shiftTemplate.updateMany({
    where: { code: "CA_SANG" },
    data: { name: "Ca Sáng (cũ)" },
  });

  const templateDefs: Array<{
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    minStaff: number;
    maxStaff: number;
    priority: number;
    isPeak: boolean;
    requirements: Array<{ posCode: string; minCount: number; maxCount: number }>;
  }> = [
    {
      code: "CA_1",
      name: "Ca 1 (07:00–11:00)",
      startTime: "07:00",
      endTime: "11:00",
      breakMinutes: 0,
      minStaff: 1,
      maxStaff: 2,
      priority: 1,
      isPeak: false,
      requirements: [],
    },
    {
      code: "CA_2",
      name: "Ca 2 (11:00–15:00)",
      startTime: "11:00",
      endTime: "15:00",
      breakMinutes: 0,
      minStaff: 1,
      maxStaff: 2,
      priority: 1,
      isPeak: false,
      requirements: [],
    },
    {
      code: "CA_3",
      name: "Ca 3 (15:00–19:00)",
      startTime: "15:00",
      endTime: "19:00",
      breakMinutes: 0,
      minStaff: 1,
      maxStaff: 2,
      priority: 1,
      isPeak: false,
      requirements: [],
    },
    {
      code: "CA_4",
      name: "Ca 4 (19:00–23:00)",
      startTime: "19:00",
      endTime: "23:00",
      breakMinutes: 0,
      minStaff: 1,
      maxStaff: 2,
      priority: 2,
      isPeak: true,
      requirements: [],
    },
  ];

  for (const tpl of templateDefs) {
    const template = await prisma.shiftTemplate.upsert({
      where: { code: tpl.code },
      update: {
        name: tpl.name,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        breakMinutes: tpl.breakMinutes,
        minStaff: tpl.minStaff,
        maxStaff: tpl.maxStaff,
        priority: tpl.priority,
        isPeak: tpl.isPeak,
        isActive: true,
      },
      create: {
        code: tpl.code,
        name: tpl.name,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        breakMinutes: tpl.breakMinutes,
        minStaff: tpl.minStaff,
        maxStaff: tpl.maxStaff,
        priority: tpl.priority,
        isPeak: tpl.isPeak,
      },
    });

    // Remove legacy per-position requirements no longer in the D'Lat config
    await prisma.shiftTemplateRequirement.deleteMany({
      where: {
        templateId: template.id,
        positionId: {
          notIn: tpl.requirements.map((r) => positionMap.get(r.posCode)!),
        },
      },
    });

    for (const req of tpl.requirements) {
      const positionId = positionMap.get(req.posCode)!;
      await prisma.shiftTemplateRequirement.upsert({
        where: {
          templateId_positionId: {
            templateId: template.id,
            positionId,
          },
        },
        update: { minCount: req.minCount, maxCount: req.maxCount },
        create: {
          templateId: template.id,
          positionId,
          minCount: req.minCount,
          maxCount: req.maxCount,
        },
      });
    }
  }

  // 4. Users & Employees (14 nhân sự: 1 Owner, 1 Manager, 12 Employees)
  const adminHash = await bcrypt.hash("Admin@123", 10);
  const staffHash = await bcrypt.hash("Staff@123", 10);

  const staffDefs: Array<{
    code: string;
    fullName: string;
    email: string;
    phone: string;
    role: UserRole;
    status: EmployeeStatus;
    primaryPos: string;
    skills: Array<{ pos: string; level: SkillProficiency }>;
    hourlyRate: bigint;
    weeklyTargetHours: number;
    maxWeeklyHours: number;
    fixedRestDay: number | null;
    hireDate: string;
    notes?: string;
  }> = [
    {
      code: "NV001",
      fullName: "Nguyễn Minh Khôi",
      email: "owner@dlatcafe.vn",
      phone: "0903111222",
      role: UserRole.OWNER,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "QUAN_LY",
      skills: [
        { pos: "QUAN_LY", level: SkillProficiency.ADVANCED },
        { pos: "PHA_CHE", level: SkillProficiency.ADVANCED },
      ],
      hourlyRate: 45000n,
      weeklyTargetHours: 36,
      maxWeeklyHours: 48,
      fixedRestDay: 0,
      hireDate: "2024-01-10",
      notes: "Chủ quán D'lat Cafe",
    },
    {
      code: "NV002",
      fullName: "Trần Thanh Thảo",
      email: "manager@dlatcafe.vn",
      phone: "0903222333",
      role: UserRole.MANAGER,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "QUAN_LY",
      skills: [
        { pos: "QUAN_LY", level: SkillProficiency.ADVANCED },
        { pos: "TRUONG_CA", level: SkillProficiency.ADVANCED },
        { pos: "THU_NGAN", level: SkillProficiency.ADVANCED },
      ],
      hourlyRate: 38000n,
      weeklyTargetHours: 42,
      maxWeeklyHours: 48,
      fixedRestDay: 1,
      hireDate: "2024-02-01",
      notes: "Quản lý vận hành cửa hàng",
    },
    {
      code: "NV003",
      fullName: "Lê Hoàng Nam",
      email: "nam.le@dlatcafe.vn",
      phone: "0912333444",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "TRUONG_CA",
      skills: [
        { pos: "TRUONG_CA", level: SkillProficiency.ADVANCED },
        { pos: "PHA_CHE", level: SkillProficiency.ADVANCED },
      ],
      hourlyRate: 32000n,
      weeklyTargetHours: 40,
      maxWeeklyHours: 48,
      fixedRestDay: 2,
      hireDate: "2024-03-15",
      notes: "Trưởng ca sáng kỳ cựu",
    },
    {
      code: "NV004",
      fullName: "Phạm Ngọc Ánh",
      email: "anh.pham@dlatcafe.vn",
      phone: "0912444555",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "TRUONG_CA",
      skills: [
        { pos: "TRUONG_CA", level: SkillProficiency.ADVANCED },
        { pos: "THU_NGAN", level: SkillProficiency.ADVANCED },
        { pos: "PHUC_VU", level: SkillProficiency.INTERMEDIATE },
      ],
      hourlyRate: 32000n,
      weeklyTargetHours: 40,
      maxWeeklyHours: 48,
      fixedRestDay: 3,
      hireDate: "2024-04-01",
      notes: "Trưởng ca tối, nắm quy trình kết toán quầy",
    },
    {
      code: "NV005",
      fullName: "Võ Quốc Bảo",
      email: "bao.vo@dlatcafe.vn",
      phone: "0915555666",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "PHA_CHE",
      skills: [
        { pos: "PHA_CHE", level: SkillProficiency.ADVANCED },
        { pos: "THU_NGAN", level: SkillProficiency.INTERMEDIATE },
      ],
      hourlyRate: 28000n,
      weeklyTargetHours: 36,
      maxWeeklyHours: 48,
      fixedRestDay: 4,
      hireDate: "2024-05-20",
      notes: "Barista chuyên Latte Art & Pour Over",
    },
    {
      code: "NV006",
      fullName: "Đặng Thu Hà",
      email: "ha.dang@dlatcafe.vn",
      phone: "0916666777",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "PHA_CHE",
      skills: [
        { pos: "PHA_CHE", level: SkillProficiency.INTERMEDIATE },
        { pos: "PHUC_VU", level: SkillProficiency.ADVANCED },
      ],
      hourlyRate: 27000n,
      weeklyTargetHours: 30,
      maxWeeklyHours: 42,
      fixedRestDay: null,
      hireDate: "2024-07-01",
    },
    {
      code: "NV007",
      fullName: "Hoàng Gia Huy",
      email: "huy.hoang@dlatcafe.vn",
      phone: "0917777888",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "PHA_CHE",
      skills: [{ pos: "PHA_CHE", level: SkillProficiency.INTERMEDIATE }],
      hourlyRate: 26000n,
      weeklyTargetHours: 24,
      maxWeeklyHours: 36,
      fixedRestDay: null,
      hireDate: "2024-09-10",
      notes: "Sinh viên làm bán thời gian, ưu tiên ca tối",
    },
    {
      code: "NV008",
      fullName: "Bùi Khánh Linh",
      email: "linh.bui@dlatcafe.vn",
      phone: "0918888999",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "THU_NGAN",
      skills: [
        { pos: "THU_NGAN", level: SkillProficiency.ADVANCED },
        { pos: "PHUC_VU", level: SkillProficiency.INTERMEDIATE },
      ],
      hourlyRate: 25000n,
      weeklyTargetHours: 30,
      maxWeeklyHours: 42,
      fixedRestDay: 5,
      hireDate: "2024-08-15",
    },
    {
      code: "NV009",
      fullName: "Ngô Tuấn Kiệt",
      email: "kiet.ngo@dlatcafe.vn",
      phone: "0932111333",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "PHUC_VU",
      skills: [
        { pos: "PHUC_VU", level: SkillProficiency.ADVANCED },
        { pos: "PHA_CHE", level: SkillProficiency.BASIC },
      ],
      hourlyRate: 24000n,
      weeklyTargetHours: 24,
      maxWeeklyHours: 36,
      fixedRestDay: null,
      hireDate: "2025-01-05",
    },
    {
      code: "NV010",
      fullName: "Đỗ Phương Nhi",
      email: "nhi.do@dlatcafe.vn",
      phone: "0932444666",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "PHUC_VU",
      skills: [
        { pos: "PHUC_VU", level: SkillProficiency.INTERMEDIATE },
        { pos: "THU_NGAN", level: SkillProficiency.BASIC },
      ],
      hourlyRate: 24000n,
      weeklyTargetHours: 24,
      maxWeeklyHours: 36,
      fixedRestDay: null,
      hireDate: "2025-02-12",
    },
    {
      code: "NV011",
      fullName: "Trương Minh Quân",
      email: "quan.truong@dlatcafe.vn",
      phone: "0933555777",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "PHUC_VU",
      skills: [
        { pos: "PHUC_VU", level: SkillProficiency.INTERMEDIATE },
        { pos: "VE_SINH", level: SkillProficiency.INTERMEDIATE },
      ],
      hourlyRate: 23000n,
      weeklyTargetHours: 20,
      maxWeeklyHours: 30,
      fixedRestDay: null,
      hireDate: "2025-03-01",
    },
    {
      code: "NV012",
      fullName: "Phan Bảo Châu",
      email: "chau.phan@dlatcafe.vn",
      phone: "0934666888",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "PHUC_VU",
      skills: [{ pos: "PHUC_VU", level: SkillProficiency.BASIC }],
      hourlyRate: 23000n,
      weeklyTargetHours: 18,
      maxWeeklyHours: 30,
      fixedRestDay: null,
      hireDate: "2025-06-15",
    },
    {
      code: "NV013",
      fullName: "Huỳnh Văn Tâm",
      email: "tam.huynh@dlatcafe.vn",
      phone: "0935777999",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      primaryPos: "VE_SINH",
      skills: [
        { pos: "VE_SINH", level: SkillProficiency.ADVANCED },
        { pos: "PHUC_VU", level: SkillProficiency.BASIC },
      ],
      hourlyRate: 23000n,
      weeklyTargetHours: 24,
      maxWeeklyHours: 40,
      fixedRestDay: 1,
      hireDate: "2024-11-01",
    },
    {
      code: "NV014",
      fullName: "Lý Mỹ Duyên",
      email: "duyen.ly@dlatcafe.vn",
      phone: "0936888000",
      role: UserRole.EMPLOYEE,
      status: EmployeeStatus.INACTIVE,
      primaryPos: "PHUC_VU",
      skills: [{ pos: "PHUC_VU", level: SkillProficiency.INTERMEDIATE }],
      hourlyRate: 23000n,
      weeklyTargetHours: 20,
      maxWeeklyHours: 30,
      fixedRestDay: null,
      hireDate: "2024-06-01",
      notes: "Đã tạm nghỉ việc cá nhân, bảo lưu hồ sơ lịch sử",
    },
  ];

  let ownerUserId: string | null = null;

  for (const s of staffDefs) {
    const isPrivileged = s.role === UserRole.OWNER || s.role === UserRole.MANAGER;
    const isActiveAccount = s.status === EmployeeStatus.ACTIVE;

    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {
        role: s.role,
        isActive: isActiveAccount,
      },
      create: {
        email: s.email,
        passwordHash: isPrivileged ? adminHash : staffHash,
        role: s.role,
        isActive: isActiveAccount,
      },
    });

    if (s.role === UserRole.OWNER) {
      ownerUserId = user.id;
    }

    const primaryPositionId = positionMap.get(s.primaryPos)!;
    const hireDateObj = new Date(`${s.hireDate}T00:00:00.000Z`);

    const employee = await prisma.employee.upsert({
      where: { employeeCode: s.code },
      update: {
        fullName: s.fullName,
        phone: s.phone,
        email: s.email,
        status: s.status,
        primaryPositionId,
        weeklyTargetHours: s.weeklyTargetHours,
        maxWeeklyHours: s.maxWeeklyHours,
        fixedRestDay: s.fixedRestDay,
        internalNotes: s.notes ?? null,
      },
      create: {
        userId: user.id,
        employeeCode: s.code,
        fullName: s.fullName,
        phone: s.phone,
        email: s.email,
        hireDate: hireDateObj,
        status: s.status,
        primaryPositionId,
        weeklyTargetHours: s.weeklyTargetHours,
        maxWeeklyHours: s.maxWeeklyHours,
        fixedRestDay: s.fixedRestDay,
        internalNotes: s.notes ?? null,
      },
    });

    // Skills
    for (const sk of s.skills) {
      const posId = positionMap.get(sk.pos)!;
      await prisma.employeeSkill.upsert({
        where: {
          employeeId_positionId: {
            employeeId: employee.id,
            positionId: posId,
          },
        },
        update: { proficiency: sk.level },
        create: {
          employeeId: employee.id,
          positionId: posId,
          proficiency: sk.level,
        },
      });
    }

    // Initial PayRate if none exists
    const existingRates = await prisma.payRate.count({
      where: { employeeId: employee.id },
    });
    if (existingRates === 0) {
      await prisma.payRate.create({
        data: {
          employeeId: employee.id,
          hourlyRate: s.hourlyRate,
          effectiveFrom: hireDateObj,
          note: "Mức lương khởi điểm khi nhận việc",
          createdById: ownerUserId,
        },
      });
    }

    // Initial EmploymentHistory if none exists
    const existingHistory = await prisma.employmentHistory.count({
      where: { employeeId: employee.id },
    });
    if (existingHistory === 0) {
      await prisma.employmentHistory.create({
        data: {
          employeeId: employee.id,
          eventType: "HIRED",
          effectiveDate: hireDateObj,
          summary: `Tiếp nhận nhân sự vào vị trí chính ${s.primaryPos}`,
          recordedById: ownerUserId,
        },
      });

      if (s.status === EmployeeStatus.INACTIVE) {
        await prisma.employmentHistory.create({
          data: {
            employeeId: employee.id,
            eventType: "DEACTIVATED",
            effectiveDate: new Date("2025-09-01T00:00:00.000Z"),
            summary: "Ngừng hoạt động tài khoản, giữ nguyên hồ sơ lịch sử",
            recordedById: ownerUserId,
          },
        });
      }
    }
  }

  console.log("✅ Khởi tạo dữ liệu mẫu hoàn tất!");
  console.log("   - Chủ quán: owner@dlatcafe.vn / Admin@123");
  console.log("   - Quản lý:  manager@dlatcafe.vn / Admin@123");
  console.log("   - Nhân viên: nam.le@dlatcafe.vn / Staff@123 (và 11 nhân sự khác)");

  // 5. Lưu cấu hình Checklist Daily 4 ca D'Lat Coffee vào SystemSetting (cục bộ)
  await prisma.systemSetting.upsert({
    where: { key: DLAT_DAILY_CHECKLIST_SETTING_KEY },
    update: {
      value: JSON.parse(JSON.stringify(DLAT_DAILY_CHECKLIST_TEMPLATES)),
      description: "Mẫu Checklist công việc hàng ngày 4 ca D'Lat Coffee (tự động nhận diện theo thứ)",
    },
    create: {
      key: DLAT_DAILY_CHECKLIST_SETTING_KEY,
      value: JSON.parse(JSON.stringify(DLAT_DAILY_CHECKLIST_TEMPLATES)),
      description: "Mẫu Checklist công việc hàng ngày 4 ca D'Lat Coffee (tự động nhận diện theo thứ)",
    },
  });
}

main()
  .catch((err) => {
    console.error("❌ Lỗi khi chạy seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

