import { requireServerSession } from "@/lib/auth";
import { shiftTemplateService } from "@/modules/shifts/shift-template.service";
import { positionService } from "@/modules/positions/position.service";
import { ShiftsClient } from "@/components/shifts/shifts-client";

export default async function ShiftsConfigurationPage() {
  const actor = await requireServerSession("shifts:read");
  const [templates, positions] = await Promise.all([
    shiftTemplateService.listShiftTemplates(actor, { includeInactive: true }),
    positionService.listPositions(actor, { includeInactive: false }),
  ]);

  return (
    <ShiftsClient
      initialTemplates={templates}
      positions={positions}
      actorRole={actor.role}
    />
  );
}

