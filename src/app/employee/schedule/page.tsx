import { requireServerSession } from "@/lib/auth";
import { todayDateStringVN, getWeekMondayDateString } from "@/lib/date";
import { scheduleService } from "@/modules/schedules/schedule.service";
import { MyScheduleClient } from "@/components/employee/my-schedule-client";

export default async function EmployeeSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const actor = await requireServerSession("self:schedule");
  const params = await searchParams;
  const currentWeek =
    params.week || getWeekMondayDateString(todayDateStringVN());

  const mySchedule = await scheduleService.getMyWeek(actor, currentWeek);

  return (
    <MyScheduleClient
      initialSchedule={mySchedule}
      weekStart={currentWeek}
    />
  );
}

