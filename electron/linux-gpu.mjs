import fs from "node:fs";

// Chromium's GPU process crashed on NVIDIA/libGLES and left an invisible window intercepting input, so NVIDIA keeps
// software rendering. Elsewhere software rendering costs about a CPU core whenever the UI animates.
export function linuxDisablesGpu({ env = process.env, exists = fs.existsSync } = {}) {
  const flag = env.OPENBOT_LINUX_GPU ?? env.OMB_LINUX_GPU;
  if (flag === "off") return true;
  if (flag === "on") return false;
  return exists("/proc/driver/nvidia/version") || exists("/sys/module/nvidia");
}

// Chromium in Electron 43 binds KWin's wp_color_manager_v1 and logs "Unable to set image transfer function" on Plasma 6 Wayland.
export function disableWaylandColorManager(commandLine) {
  const disabled = commandLine.getSwitchValue("disable-features");
  commandLine.appendSwitch("disable-features", [disabled, "WaylandWpColorManagerV1"].filter(Boolean).join(","));
}

