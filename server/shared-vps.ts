import type { BotRecord } from "./store.ts";

// An installation-owned Docker name, deliberately outside the bot ID namespace.
// Keeping the historic VPS name format preserves inventory and ownership checks.
export const SHARED_VPS_OWNER_ID = "openbot-shared-desktop";

export function sharedVpsOwnerId(alias: string): string {
  return `${SHARED_VPS_OWNER_ID}:${alias}`;
}

export function vpsDesktopOwnerId(bot: Pick<BotRecord, "id" | "vpsDesktopMode">, alias: string | null): string {
  return bot.vpsDesktopMode === "shared" ? sharedVpsOwnerId(alias ?? "unconfigured") : bot.id;
}

export function sharedVpsResource(alias: string): string {
  return `computer:vps:${alias}:${sharedVpsOwnerId(alias)}`;
}

export function sharedVpsControlKey(alias: string): string {
  return `shared_vps_${alias}`;
}
