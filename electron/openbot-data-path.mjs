import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Keep an existing installation's Electron state intact while using OpenBot for fresh installs. */
export function openBotUserDataPath(current, exists = existsSync) {
  if (exists(current)) return current;
  for (const name of ["OpenMausBot", "MausBot"]) {
    const legacy = join(dirname(current), name);
    if (exists(legacy)) return legacy;
  }
  return current;
}

/** Existing chats live in the old directory until the user explicitly moves them. */
export function openBotDataDir(home, configured, exists = existsSync) {
  if (configured) return configured;
  const current = join(home, ".openbot");
  const legacy = join(home, ".openmausbot");
  return exists(current) || !exists(legacy) ? current : legacy;
}

/** Drop account-listed hosted places while retaining manually paired servers. */
export function withoutHostedPlaces(state) {
  const environments = state.environments.filter((entry) => !entry.home && !entry.team && !entry.cloud);
  const activeId = environments.some((entry) => entry.id === state.activeId) ? state.activeId : "local";
  return { ...state, environments, activeId };
}
