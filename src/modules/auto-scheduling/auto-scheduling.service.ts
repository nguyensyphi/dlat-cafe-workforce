import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { formatDateVN, formatIsoDateOnly } from "@/lib/date";
import {
  AppNotFoundError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import { addDaysToDateString, netShiftMinutes } from "@/lib/shift-time";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { createNotifications } from "@/modules/notifications/notification.service";
import { loadSettingsBundle } from "@/modules/settings/settings.service";
import {
  assertScheduleEditable,
  recordScheduleRevision,
  refreshShiftStatus,
} from "@/modules/schedules/schedule-lifecycle";
import { GreedySchedulerEngine } from "./greedy-scheduler";
import type {
  EngineAvailability,
  EngineEmployee,
  EngineInput,
  EngineLeave,
  EngineShift,
  RecommendationResult,
  SchedulingEngine,
} from "./scheduling-engine.types";

export class AutoSchedulingService {
  constructor(
    private readonly engine: SchedulingEngine = new GreedySchedulerEngine(),
  ) {}

  /**
   * Generates schedule recommendations without applying them to the database.
   */
  async generateRecommendation(
    actor: SessionUser,
    weekStart: string,
  ): Promise<RecommendationResult> {
    assertPermission(actor.role, "schedules:manage");

    const schedule = await prisma.schedule.findUnique({
      where: { weekStart: new Date(`${weekStart}T00:00:00.000Z`) },
      include: {
        shifts: {
          where: { status: { not: "CANCELLED" } },
          include: {
            positionRequirements: true,
            assignments: {
              where: { status: "ASSIGNED" },
              select: {
                id: true,
                shiftId: true,
                employeeId: true,
                positionId: true,
                isPinned: true,
              },
            },
          },
        },
      },
    });

    if (!schedule) {
      throw new AppNotFoundError("Chưa có lịch làm việc cho tuần này");
    }

    if (schedule.shifts.length === 0) {
      throw new AppValidationError("Lịch tuần chưa có ca làm việc nào để xếp ca");
    }

    const weekEnd = addDaysToDateString(weekStart, 6);
    const startDate = new Date(`${weekStart}T00:00:00.000Z`);
    const endDate = new Date(`${weekEnd}T23:59:59.999Z`);

    const [settings, employees, availabilities, leaves] = await Promise.all([
      loadSettingsBundle(),
      prisma.employee.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        include: {
          skills: { select: { positionId: true, proficiency: true } },
          payRates: {
            orderBy: { effectiveFrom: "desc" },
            take: 1,
            select: { hourlyRate: true },
          },
        },
      }),
      prisma.availability.findMany({
        where: { weekStart: startDate },
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: "APPROVED",
          startAt: { lte: endDate },
          endAt: { gte: startDate },
        },
        select: { employeeId: true, startAt: true, endAt: true },
      }),
    ]);

    const engineShifts: EngineShift[] = schedule.shifts.map((s) => ({
      id: s.id,
      templateId: s.templateId,
      name: s.name,
      workDate: formatIsoDateOnly(s.workDate),
      startAt: s.startAt,
      endAt: s.endAt,
      breakMinutes: s.breakMinutes,
      netMinutes: netShiftMinutes(s.startAt, s.endAt, s.breakMinutes),
      requiredStaff: s.requiredStaff,
      maxStaff: s.maxStaff,
      priority: s.priority,
      isPeak: s.isPeak,
      requirements: s.positionRequirements.map((r) => ({
        positionId: r.positionId,
        minCount: r.minCount,
        maxCount: r.maxCount,
      })),
    }));

    const engineEmployees: EngineEmployee[] = employees.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      employeeCode: e.employeeCode,
      primaryPositionId: e.primaryPositionId,
      status: e.status,
      weeklyTargetHours: Number(e.weeklyTargetHours),
      maxWeeklyHours: Number(e.maxWeeklyHours),
      hourlyRate: e.payRates[0]?.hourlyRate ?? BigInt(30000),
      skills: e.skills,
    }));

    const engineAvailabilities: EngineAvailability[] = availabilities.map((a) => ({
      employeeId: a.employeeId,
      workDate: formatIsoDateOnly(a.workDate),
      templateId: a.templateId,
      startAt: a.startAt,
      endAt: a.endAt,
      preference: a.preference,
    }));

    const engineLeaves: EngineLeave[] = leaves.map((l) => ({
      employeeId: l.employeeId,
      startAt: l.startAt,
      endAt: l.endAt,
    }));

    const existingAssignments = schedule.shifts.flatMap((s) =>
      s.assignments.map((a) => ({
        shiftId: a.shiftId,
        employeeId: a.employeeId,
        positionId: a.positionId,
        isPinned: a.isPinned,
      })),
    );

    const input: EngineInput = {
      weekStart,
      shifts: engineShifts,
      employees: engineEmployees,
      availabilities: engineAvailabilities,
      leaves: engineLeaves,
      policy: {
        minRestHours: Number(settings.schedulingPolicy.minRestHours),
        maxWeeklyHours: Number(settings.schedulingPolicy.maxWeeklyHours),
        maxConsecutiveDays: Number(settings.schedulingPolicy.maxConsecutiveDays),
      },
      existingAssignments,
    };

    return this.engine.solve(input);
  }

  /**
   * Applies the proposed recommendations to the schedule.
   * Keeps existing pinned assignments intact and replaces non-pinned assignments.
   */
  async applyRecommendation(
    actor: SessionUser,
    weekStart: string,
  ) {
    assertPermission(actor.role, "schedules:manage");

    const recommendation = await this.generateRecommendation(actor, weekStart);

    return prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.findUniqueOrThrow({
        where: { weekStart: new Date(`${weekStart}T00:00:00.000Z`) },
        include: { shifts: { select: { id: true } } },
      });

      assertScheduleEditable(schedule.status);
      const shiftIds = schedule.shifts.map((s) => s.id);

      // Remove unpinned assignments
      await tx.shiftAssignment.deleteMany({
        where: {
          shiftId: { in: shiftIds },
          isPinned: false,
        },
      });

      // Insert newly proposed assignments
      const newAssignments = recommendation.proposedAssignments.filter(
        (p) => !p.isPinned,
      );

      for (const p of newAssignments) {
        await tx.shiftAssignment.create({
          data: {
            shiftId: p.shiftId,
            employeeId: p.employeeId,
            positionId: p.positionId,
            assignedById: actor.userId,
            explanation: p.explanation,
            isPinned: false,
          },
        });
      }

      // Refresh shift statuses
      for (const shiftId of shiftIds) {
        await refreshShiftStatus(tx, shiftId);
      }

      const summary = `Tự động xếp ca (${recommendation.engineName}): xếp thành công ${recommendation.filledSlots}/${recommendation.totalSlots} vị trí`;

      await recordScheduleRevision(tx, {
        scheduleId: schedule.id,
        actorUserId: actor.userId,
        action: "AUTO_SCHEDULED",
        summary,
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "AUTO_SCHEDULE_APPLIED",
          entityType: "Schedule",
          entityId: schedule.id,
          newValues: {
            engine: recommendation.engineName,
            filledSlots: recommendation.filledSlots,
            totalSlots: recommendation.totalSlots,
            unfilledCount: recommendation.unfilledShifts.length,
            laborCostVND: recommendation.estimatedTotalLaborCostVND,
          },
        },
        tx,
      );

      // If already published, notify employees
      if (schedule.status === "PUBLISHED") {
        const empIds = [
          ...new Set(recommendation.proposedAssignments.map((p) => p.employeeId)),
        ];
        const users = await tx.employee.findMany({
          where: { id: { in: empIds } },
          select: { userId: true },
        });

        await createNotifications(
          tx,
          users.map((u) => ({
            userId: u.userId,
            type: "SCHEDULE_UPDATED" as const,
            title: `Lịch tuần ${formatDateVN(weekStart)} đã được cập nhật`,
            message: "Hệ thống vừa cập nhật bảng phân ca tự động.",
            linkUrl: `/employee/schedule?week=${weekStart}`,
          })),
        );
      }

      return {
        appliedCount: newAssignments.length,
        filledSlots: recommendation.filledSlots,
        totalSlots: recommendation.totalSlots,
        unfilledShifts: recommendation.unfilledShifts,
      };
    });
  }
}

export const autoSchedulingService = new AutoSchedulingService();
