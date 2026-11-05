import type { BotRecord } from "./store.ts";
import type { TurnOwner } from "./turn-resources.ts";

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

export function describeSharedDesktop(input: {
  alias: string | null;
  holder: TurnOwner | null;
  waiting: readonly TurnOwner[];
  personControls: boolean;
  botFor(owner: TurnOwner): { id: string; name: string } | null;
}) {
  if (!input.alias) return { mode: "shared" as const, activeBot: null, controller: null, waitingQueue: [] as Array<{ id: string; name: string }> };
  const active = input.holder && !input.holder.threadId.startsWith("shared-vps-person:") ? input.botFor(input.holder) : null;
  return {
    mode: "shared" as const,
    activeBot: active,
    controller: input.personControls ? "person" as const : active ? "bot" as const : null,
    waitingQueue: input.waiting.map(owner => {
      if (owner.threadId.startsWith("shared-vps-person:")) return { id: "person", name: "You" };
      const bot = input.botFor(owner);
      return { id: bot?.id ?? owner.threadId, name: bot?.name ?? "Bot" };
    }),
  };
}
