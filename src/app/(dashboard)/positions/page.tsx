import { requireServerSession } from "@/lib/auth";
import { positionService } from "@/modules/positions/position.service";
import { PositionsClient } from "@/components/positions/positions-client";

export default async function PositionsPage() {
  const actor = await requireServerSession("positions:read");
  const positions = await positionService.listPositions(actor, {
    includeInactive: true,
  });

  return <PositionsClient initialPositions={positions} actorRole={actor.role} />;
}

