import { requireServerSession } from "@/lib/auth";
import { todayDateStringVN, getWeekMondayDateString } from "@/lib/date";
import { availabilityService } from "@/modules/availability/availability.service";
import { AvailabilityRegistrationClient } from "@/components/employee/availability-registration-client";

export default async function EmployeeAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const actor = await requireServerSession("self:availability");
  const params = await searchParams;
  const currentWeek =
    params.week || getWeekMondayDateString(todayDateStringVN());

  const data = await availabilityService.getMyAvailability(actor, currentWeek);

  return (
    <AvailabilityRegistrationClient
      initialData={data}
      weekStart={currentWeek}
    />
  );
}

