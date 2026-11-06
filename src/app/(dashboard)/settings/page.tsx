import { requireServerSession } from "@/lib/auth";
import { settingsService } from "@/modules/settings/settings.service";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const actor = await requireServerSession("settings:read");
  const settings = await settingsService.getSettings(actor);

  return <SettingsClient initialSettings={settings} actorRole={actor.role} />;
}

