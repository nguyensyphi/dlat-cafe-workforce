import { requireServerSession } from "@/lib/auth";
import { todayDateStringVN, getWeekMondayDateString } from "@/lib/date";
import { positionService } from "@/modules/positions/position.service";
import { shiftTemplateService } from "@/modules/shifts/shift-template.service";
import { scheduleService } from "@/modules/schedules/schedule.service";
import { ScheduleManagementClient } from "@/components/schedules/schedule-management-client";

export const dynamic = "force-dynamic";

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const actor = await requireServerSession("schedules:read");
  const params = await searchParams;
  const currentWeek =
    params.week || getWeekMondayDateString(todayDateStringVN());

  const [schedule, positions, templates] = await Promise.all([
    scheduleService.getWeek(actor, currentWeek),
    positionService.listPositions(actor, { includeInactive: false }),
    shiftTemplateService.listShiftTemplates(actor, { includeInactive: false }),
  ]);

  return (
    <ScheduleManagementClient
      initialSchedule={schedule}
      weekStart={currentWeek}
      positions={positions}
      templates={templates}
      user={actor}
    />
  );
}

