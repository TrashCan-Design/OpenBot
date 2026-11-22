import assert from "node:assert/strict";
import test from "node:test";

import { disableWaylandColorManager, linuxDisablesGpu } from "./linux-gpu.mjs";

const only = (...paths) => (p) => paths.includes(p);

test("NVIDIA keeps software rendering", () => {
  assert.equal(linuxDisablesGpu({ env: {}, exists: only("/proc/driver/nvidia/version") }), true);
  assert.equal(linuxDisablesGpu({ env: {}, exists: only("/sys/module/nvidia") }), true);
});

test("Intel, AMD and other drivers use the GPU", () => {
  assert.equal(linuxDisablesGpu({ env: {}, exists: only() }), false);
});

test("OPENBOT_LINUX_GPU and OMB_LINUX_GPU override detection either way", () => {
  assert.equal(linuxDisablesGpu({ env: { OPENBOT_LINUX_GPU: "off" }, exists: only() }), true);
  assert.equal(linuxDisablesGpu({ env: { OPENBOT_LINUX_GPU: "on" }, exists: only("/sys/module/nvidia") }), false);
  assert.equal(linuxDisablesGpu({ env: { OMB_LINUX_GPU: "off" }, exists: only() }), true);
  assert.equal(linuxDisablesGpu({ env: { OMB_LINUX_GPU: "on" }, exists: only("/sys/module/nvidia") }), false);
});

test("the Wayland color manager is disabled and an existing disable-features list is kept", () => {
  const run = (existing) => {
    const switches = new Map();
    disableWaylandColorManager({ getSwitchValue: () => existing, appendSwitch: (name, value) => switches.set(name, value) });
    return switches.get("disable-features");
  };
  assert.equal(run(""), "WaylandWpColorManagerV1");
  assert.equal(run("Foo,Bar"), "Foo,Bar,WaylandWpColorManagerV1");
});

