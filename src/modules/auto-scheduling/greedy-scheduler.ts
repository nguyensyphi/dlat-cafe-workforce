import { intervalsOverlap } from "@/lib/shift-time";
import type {
  EngineEmployee,
  EngineInput,
  ProposedAssignment,
  RecommendationResult,
  SchedulingEngine,
  UnfilledShiftSlot,
} from "./scheduling-engine.types";

interface AssignedState {
  shiftId: string;
  startAt: Date;
  endAt: Date;
  workDate: string;
  netMinutes: number;
}

export class GreedySchedulerEngine implements SchedulingEngine {
  public readonly name = "Greedy-Constraint-Scorer-v1";

  public async solve(input: EngineInput): Promise<RecommendationResult> {
    const startTime = Date.now();
    const {
      weekStart,
      shifts,
      employees,
      availabilities,
      leaves,
      policy,
      existingAssignments = [],
    } = input;

    // Track state per employee
    const empAssigned = new Map<string, AssignedState[]>();
    const empTotalMinutes = new Map<string, number>();

    for (const emp of employees) {
      empAssigned.set(emp.id, []);
      empTotalMinutes.set(emp.id, 0);
    }

    const proposedAssignments: ProposedAssignment[] = [];
    const pinnedSet = new Set<string>();

    // Register pinned assignments first
    for (const pin of existingAssignments) {
      if (!pin.isPinned) continue;
      const shift = shifts.find((s) => s.id === pin.shiftId);
      const emp = employees.find((e) => e.id === pin.employeeId);
      if (!shift || !emp) continue;

      const stateList = empAssigned.get(emp.id) ?? [];
      stateList.push({
        shiftId: shift.id,
        startAt: shift.startAt,
        endAt: shift.endAt,
        workDate: shift.workDate,
        netMinutes: shift.netMinutes,
      });
      empAssigned.set(emp.id, stateList);
      empTotalMinutes.set(
        emp.id,
        (empTotalMinutes.get(emp.id) ?? 0) + shift.netMinutes,
      );

      proposedAssignments.push({
        shiftId: shift.id,
        employeeId: emp.id,
        employeeName: emp.fullName,
        positionId: pin.positionId,
        positionName: "Đã ghim",
        score: 999,
        explanation: "Phân công được ghim cố định từ trước",
        isPinned: true,
      });

      pinnedSet.add(`${shift.id}_${emp.id}`);
    }

    // Availability fast lookup and track actively registered employees
    const availMap = new Map<string, "AVAILABLE" | "PREFERRED" | "UNAVAILABLE">();
    const submittedEmployees = new Set<string>();
    const empAvailSlotCount = new Map<string, number>();
    for (const av of availabilities) {
      availMap.set(`${av.employeeId}_${av.workDate}_${av.templateId ?? ""}`, av.preference);
      submittedEmployees.add(av.employeeId);
      if (av.preference === "AVAILABLE" || av.preference === "PREFERRED") {
        empAvailSlotCount.set(av.employeeId, (empAvailSlotCount.get(av.employeeId) ?? 0) + 1);
      }
    }

    const empById = new Map<string, EngineEmployee>();
    for (const emp of employees) {
      empById.set(emp.id, emp);
    }

    const isEmployeeSenior = (emp: EngineEmployee, refWorkDate: string): boolean => {
      if (emp.isSenior !== undefined) return emp.isSenior;
      const hasExpSkill = emp.skills.some(
        (s) => s.proficiency === "ADVANCED" || s.proficiency === "INTERMEDIATE",
      );
      if (hasExpSkill) return true;
      if (emp.hireDate) {
        const hireMs =
          emp.hireDate instanceof Date
            ? emp.hireDate.getTime()
            : new Date(emp.hireDate).getTime();
        const refMs = new Date(`${refWorkDate}T00:00:00.000Z`).getTime();
        if (!Number.isNaN(hireMs) && (refMs - hireMs) / 86_400_000 >= 60) {
          return true;
        }
      }
      return false;
    };

    // Sort shifts:
    // 1. Higher priority or isPeak first
    // 2. More specific position requirements first
    // 3. Chronological workDate & startAt
    const sortedShifts = [...shifts].sort((a, b) => {
      if (a.isPeak !== b.isPeak) return a.isPeak ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      const reqDiff = b.requirements.length - a.requirements.length;
      if (reqDiff !== 0) return reqDiff;
      return a.startAt.getTime() - b.startAt.getTime();
    });

    const unfilledShifts: UnfilledShiftSlot[] = [];

    // Process each shift
    for (const shift of sortedShifts) {
      // Subtract already-pinned assignments from slot demands so we never over-assign or duplicate roles
      const pinnedForShift = proposedAssignments.filter(
        (pa) => pa.shiftId === shift.id && pa.isPinned,
      );
      const pinnedByPos = new Map<string, number>();
      for (const pa of pinnedForShift) {
        pinnedByPos.set(pa.positionId, (pinnedByPos.get(pa.positionId) ?? 0) + 1);
      }

      const maxAllowed =
        shift.maxStaff !== null
          ? Math.max(0, shift.maxStaff - pinnedForShift.length)
          : Infinity;
      const targetAdditional = Math.min(
        maxAllowed,
        Math.max(0, shift.requiredStaff - pinnedForShift.length),
      );

      // Build slot demands from requirements or remaining required staff
      const neededSlots: Array<{ positionId?: string; isRequired: boolean }> = [];

      for (const req of shift.requirements) {
        const alreadyPinnedInPos = pinnedByPos.get(req.positionId) ?? 0;
        const remainingReq = Math.max(0, req.minCount - alreadyPinnedInPos);
        if (alreadyPinnedInPos > 0) {
          pinnedByPos.set(req.positionId, Math.max(0, alreadyPinnedInPos - req.minCount));
        }
        for (let i = 0; i < remainingReq && neededSlots.length < targetAdditional; i++) {
          neededSlots.push({ positionId: req.positionId, isRequired: true });
        }
      }

      // If remaining requiredStaff > sum of remaining requirements, add generic slots
      while (neededSlots.length < targetAdditional) {
        neededSlots.push({ isRequired: false });
      }

      // Fill slots
      for (const slot of neededSlots) {
        // Find best candidate
        const candidatesWithScores: Array<{
          employee: EngineEmployee;
          positionId: string;
          score: number;
          explanation: string;
        }> = [];

        const rejectReasons: string[] = [];

        for (const emp of employees) {
          // Check if already assigned to this shift
          const currentShifts = empAssigned.get(emp.id) ?? [];
          if (currentShifts.some((cs) => cs.shiftId === shift.id)) {
            continue;
          }

          // HARD CONSTRAINT 1: Skill
          let matchedPositionId = slot.positionId;
          if (matchedPositionId) {
            const hasSkill = emp.skills.some((s) => s.positionId === matchedPositionId);
            if (!hasSkill && emp.primaryPositionId !== matchedPositionId) {
              rejectReasons.push(`${emp.fullName}: thiếu kỹ năng vị trí`);
              continue;
            }
          } else {
            // Pick a skill position they have or primary
            matchedPositionId = emp.primaryPositionId;
          }

          // HARD CONSTRAINT 2: Shift Overlap
          const hasOverlap = currentShifts.some((cs) =>
            intervalsOverlap(cs.startAt, cs.endAt, shift.startAt, shift.endAt),
          );
          if (hasOverlap) {
            rejectReasons.push(`${emp.fullName}: trùng ca khác trong ngày`);
            continue;
          }

          // HARD CONSTRAINT 3: Approved Leave
          const onLeave = leaves.some(
            (l) =>
              l.employeeId === emp.id &&
              intervalsOverlap(l.startAt, l.endAt, shift.startAt, shift.endAt),
          );
          if (onLeave) {
            rejectReasons.push(`${emp.fullName}: có đơn nghỉ phép`);
            continue;
          }

          // HARD CONSTRAINT 4: Availability Registration & Fixed Rest Day
          const pref =
            availMap.get(`${emp.id}_${shift.workDate}_${shift.templateId ?? ""}`) ??
            "AVAILABLE";
          if (pref === "UNAVAILABLE") {
            rejectReasons.push(`${emp.fullName}: đăng ký bận`);
            continue;
          }

          const shiftDayOfWeek = new Date(`${shift.workDate}T00:00:00.000Z`).getUTCDay();
          if (
            emp.fixedRestDay !== undefined &&
            emp.fixedRestDay !== null &&
            emp.fixedRestDay === shiftDayOfWeek &&
            pref !== "PREFERRED"
          ) {
            rejectReasons.push(`${emp.fullName}: ngày nghỉ cố định hàng tuần`);
            continue;
          }

          // HARD CONSTRAINT 5: Overnight Minimum Rest Period between different workDays (same-day Sáng/Chiều/Tối allowed)
          const sameDayShifts = currentShifts.filter((cs) => cs.workDate === shift.workDate);
          const minRestMs = policy.minRestHours * 3600000;
          let restViolated = false;
          for (const cs of currentShifts) {
            // Same-day shifts (Sáng, Chiều, Tối) are allowed; minRestHours applies to overnight rest across different days
            if (cs.workDate === shift.workDate) {
              continue;
            }
            const gap =
              cs.endAt.getTime() <= shift.startAt.getTime()
                ? shift.startAt.getTime() - cs.endAt.getTime()
                : cs.startAt.getTime() - shift.endAt.getTime();
            if (gap < minRestMs) {
              restViolated = true;
              break;
            }
          }
          if (restViolated) {
            rejectReasons.push(`${emp.fullName}: không đủ ${policy.minRestHours}h nghỉ qua đêm`);
            continue;
          }

          // HARD CONSTRAINT 6: Weekly Hours Limit
          const currentTotalMin = empTotalMinutes.get(emp.id) ?? 0;
          const maxMinutes =
            Math.min(emp.maxWeeklyHours, policy.maxWeeklyHours) * 60;
          if (currentTotalMin + shift.netMinutes > maxMinutes) {
            rejectReasons.push(`${emp.fullName}: vượt định mức giờ tối đa tuần`);
            continue;
          }

          // HARD CONSTRAINT 7: Consecutive Days Limit
          const assignedDates = new Set(currentShifts.map((cs) => cs.workDate));
          assignedDates.add(shift.workDate);
          const sortedDates = [...assignedDates].sort();
          let maxConsecutive = 0;
          let currentStreak = 0;
          let prevDate: Date | null = null;

          for (const dStr of sortedDates) {
            const currDate = new Date(`${dStr}T00:00:00.000Z`);
            if (prevDate) {
              const diffDays = Math.round(
                (currDate.getTime() - prevDate.getTime()) / 86400000,
              );
              if (diffDays === 1) {
                currentStreak++;
              } else {
                currentStreak = 1;
              }
            } else {
              currentStreak = 1;
            }
            if (currentStreak > maxConsecutive) {
              maxConsecutive = currentStreak;
            }
            prevDate = currDate;
          }

          if (maxConsecutive > policy.maxConsecutiveDays) {
            rejectReasons.push(`${emp.fullName}: vượt quá ${policy.maxConsecutiveDays} ngày làm liên tiếp`);
            continue;
          }

          // SOFT CONSTRAINTS: Scoring
          let score = 100;
          const explanations: string[] = [];

          // 0. D'Lat Senior Staff Rule: Every shift must have at least 1 senior staff member if available
          const shiftHasSenior = proposedAssignments.some((pa) => {
            if (pa.shiftId !== shift.id) return false;
            const assignedEmp = empById.get(pa.employeeId);
            return assignedEmp ? isEmployeeSenior(assignedEmp, shift.workDate) : false;
          });
          const empIsSenior = isEmployeeSenior(emp, shift.workDate);
          if (!shiftHasSenior) {
            if (empIsSenior) {
              score += 80;
              explanations.push("Nhân viên cũ nòng cốt của ca");
            } else {
              score -= 40;
              explanations.push("Nhân viên mới (xếp khi ca đã có NV cũ hoặc thiếu NV cũ)");
            }
          }

          // 1. Availability preference, registration incentive & multi-shift flexibility bonus
          const hasSubmitted = submittedEmployees.has(emp.id);
          if (pref === "PREFERRED") {
            score += 40;
            explanations.push("Ưu tiên theo nguyện vọng");
          } else if (!hasSubmitted) {
            // Deprioritize unregistered staff so registered employees are chosen first
            score -= 50;
            explanations.push("Chưa nộp đăng ký ca tuần này (ưu tiên thấp)");
          }

          const availCount = empAvailSlotCount.get(emp.id) ?? 0;
          const targetShifts =
            emp.desiredShifts ?? Math.max(1, Math.round(emp.weeklyTargetHours / 4.0));
          const capacityMetric = availCount > 0 ? availCount : targetShifts;
          const multiShiftBonus = Math.min(20, Math.round(capacityMetric * 1.5));
          if (multiShiftBonus >= 8) {
            score += multiShiftBonus;
          }

          // 1b. Proportional fulfillment balance according to student's desiredShifts / targetShifts
          if (currentShifts.length < targetShifts) {
            const fulfillmentRatio = currentShifts.length / targetShifts;
            const ratioBonus = Math.round((1 - fulfillmentRatio) * 45);
            score += ratioBonus;
            if (emp.desiredShifts !== undefined) {
              explanations.push(`Đáp ứng nguyện vọng (${currentShifts.length}/${emp.desiredShifts} ca)`);
            }
          } else {
            score -= emp.desiredShifts !== undefined ? 180 : 40;
            explanations.push(`Đã đủ số ca nguyện vọng (${targetShifts} ca/tuần)`);
          }

          // 1c. Same-day multiple shifts pacing (allow Sáng, Chiều, Tối but spread across staff first)
          if (sameDayShifts.length === 1) {
            const first = sameDayShifts[0]!;
            const sameDayGapMs =
              first.endAt.getTime() <= shift.startAt.getTime()
                ? shift.startAt.getTime() - first.endAt.getTime()
                : first.startAt.getTime() - shift.endAt.getTime();
            if (sameDayGapMs >= 4 * 3600_000) {
              score -= 10;
              explanations.push("Ca thứ 2 trong ngày (ca gãy)");
            } else {
              score -= 15;
              explanations.push("Ca thứ 2 liên tiếp trong ngày");
            }
          } else if (sameDayShifts.length >= 2) {
            score -= 30;
            explanations.push("Ca thứ 3 trong ngày");
          }

          // 2. Workload balance (encourage reaching weeklyTargetHours)
          const targetMin = emp.weeklyTargetHours * 60;
          const remainingMin = targetMin - currentTotalMin;
          if (remainingMin > 0) {
            const balanceBonus = Math.min(50, Math.round(remainingMin / 30) * 5);
            score += balanceBonus;
            explanations.push(`Cân bằng giờ (còn thiếu ${Math.round(remainingMin / 60)}h)`);
          } else {
            // Already met target: small penalty to distribute hours to others
            score -= 20;
          }

          // 3. Peak shift skill preference
          if (shift.isPeak) {
            const skill = emp.skills.find((s) => s.positionId === matchedPositionId);
            if (skill?.proficiency === "ADVANCED") {
              score += 25;
              explanations.push("Tay nghề giỏi ca cao điểm");
            } else if (skill?.proficiency === "INTERMEDIATE") {
              score += 10;
            }
          }

          // 4. Weekend balance
          const dayOfWeek = new Date(`${shift.workDate}T00:00:00.000Z`).getUTCDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            const weekendShifts = currentShifts.filter((cs) => {
              const dow = new Date(`${cs.workDate}T00:00:00.000Z`).getUTCDay();
              return dow === 0 || dow === 6;
            }).length;
            if (weekendShifts === 0) {
              score += 15;
            }
          }

          candidatesWithScores.push({
            employee: emp,
            positionId: matchedPositionId,
            score,
            explanation: explanations.join(", ") || "Phù hợp tiêu chuẩn ca",
          });
        }

        // Sort candidates by score descending
        candidatesWithScores.sort((a, b) => b.score - a.score);

        const chosen = candidatesWithScores[0];
        if (chosen) {
          // Assign candidate
          const currentShifts = empAssigned.get(chosen.employee.id) ?? [];
          currentShifts.push({
            shiftId: shift.id,
            startAt: shift.startAt,
            endAt: shift.endAt,
            workDate: shift.workDate,
            netMinutes: shift.netMinutes,
          });
          empAssigned.set(chosen.employee.id, currentShifts);
          empTotalMinutes.set(
            chosen.employee.id,
            (empTotalMinutes.get(chosen.employee.id) ?? 0) + shift.netMinutes,
          );

          proposedAssignments.push({
            shiftId: shift.id,
            employeeId: chosen.employee.id,
            employeeName: chosen.employee.fullName,
            positionId: chosen.positionId,
            positionName: "Tự động xếp",
            score: chosen.score,
            explanation: chosen.explanation,
            isPinned: false,
          });
        } else {
          // Unfilled slot
          unfilledShifts.push({
            shiftId: shift.id,
            shiftName: shift.name,
            workDate: shift.workDate,
            positionId: slot.positionId,
            missingCount: 1,
            reasons: rejectReasons.slice(0, 5),
          });
        }
      }
    }

    // Compute employee hour summaries and total labor costs
    let totalLaborCost = BigInt(0);
    const employeeSummaries = employees.map((emp) => {
      const assignedMin = empTotalMinutes.get(emp.id) ?? 0;
      const assignedHours = assignedMin / 60;
      const hourlyRateBigInt = emp.hourlyRate ?? BigInt(30000);
      const wage = BigInt(Math.round(assignedHours * Number(hourlyRateBigInt)));
      totalLaborCost += wage;

      return {
        employeeId: emp.id,
        fullName: emp.fullName,
        targetMinutes: emp.weeklyTargetHours * 60,
        assignedMinutes: assignedMin,
        shiftCount: (empAssigned.get(emp.id) ?? []).length,
        estimatedWageVND: wage.toString(),
      };
    });

    const totalSlots = shifts.reduce((sum, s) => sum + s.requiredStaff, 0);

    // Compute Standby Reserve Pools for each shift (so sudden absences have instant backups)
    const standbyPools = shifts.map((shift) => {
      const assignedEmployeeIds = new Set(
        (proposedAssignments.filter((a) => a.shiftId === shift.id) || []).map((a) => a.employeeId),
      );

      const standbyCandidates = employees
        .filter((emp) => {
          // Must not be currently assigned to this shift
          if (assignedEmployeeIds.has(emp.id)) return false;

          // Must not have an overlapping shift
          const currentShifts = empAssigned.get(emp.id) ?? [];
          const hasOverlap = currentShifts.some((cs) =>
            intervalsOverlap(cs.startAt, cs.endAt, shift.startAt, shift.endAt),
          );
          if (hasOverlap) return false;

          // Must not be on leave
          const onLeave = leaves.some(
            (l) =>
              l.employeeId === emp.id &&
              intervalsOverlap(l.startAt, l.endAt, shift.startAt, shift.endAt),
          );
          if (onLeave) return false;

          // Must not be marked unavailable
          const pref =
            availMap.get(`${emp.id}_${shift.workDate}_${shift.templateId ?? ""}`) ?? "AVAILABLE";
          return pref !== "UNAVAILABLE";
        })
        .map((emp) => ({
          employeeId: emp.id,
          employeeName: emp.fullName,
          positionId: emp.primaryPositionId,
          preference:
            availMap.get(`${emp.id}_${shift.workDate}_${shift.templateId ?? ""}`) ?? "AVAILABLE",
        }))
        .sort((a, b) => {
          const rank = (p: string) => (p === "PREFERRED" ? 0 : p === "AVAILABLE" ? 1 : 2);
          return rank(a.preference) - rank(b.preference);
        });

      return {
        shiftId: shift.id,
        shiftName: shift.name,
        workDate: shift.workDate,
        standbyCandidates,
      };
    });

    return {
      engineName: this.name,
      weekStart,
      totalSlots,
      filledSlots: proposedAssignments.length,
      proposedAssignments,
      unfilledShifts,
      employeeSummaries,
      estimatedTotalLaborCostVND: totalLaborCost.toString(),
      standbyPools,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
