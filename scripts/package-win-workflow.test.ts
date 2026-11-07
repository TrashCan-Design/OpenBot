import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
const workflow = parse(readFileSync(new URL("../.github/workflows/package-win.yml", import.meta.url), "utf8"));
describe("OpenBot Windows artifact build", () => {
  it("builds the existing installer branch on Windows without publishing a release", () => {
    expect(workflow.on.push.branches).toEqual(["codex/windows-installer"]);
    expect(workflow.on.workflow_dispatch.inputs.ref.required).toBe(false);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs.package["runs-on"]).toBe("windows-latest");
    expect(workflow.jobs.package.env.NODE_OPTIONS).toBe("--max-old-space-size=6144");
    expect(workflow.jobs.package.steps.some((step: { run?: string }) => step.run === "pnpm package:win")).toBe(true);
    expect(JSON.stringify(workflow)).not.toContain("gh release");
  });
  it("keeps the resource, browser, server and fork updater checks", () => {
    const steps = workflow.jobs.package.steps as Array<{ name?: string; run?: string }>;
    expect(steps.some(step => step.run?.includes("smoke-browser-bundle.mjs"))).toBe(true);
    expect(steps.some(step => step.run?.includes("smoke-packaged-server.mjs"))).toBe(true);
    expect(steps.some(step => step.name === "start the packaged server")).toBe(true);
    const verify = steps.find(step => step.name === "verify the packaged tree")!.run!;
    expect(verify).toContain("repo: OpenBot"); expect(verify).toContain("owner: TrashCan-Design");
    expect(verify).toContain("publisherName");
  });
  it("uploads the exe, updater metadata, checksum and exact source commit together", () => {
    const artifact = workflow.jobs.package.steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/upload-artifact@"));
    for (const path of ["release/*.exe", "release/*.exe.blockmap", "release/latest.yml", "release/SHA256SUMS.txt", "release/SOURCE_COMMIT.txt"]) expect(artifact.with.path).toContain(path);
    const record = workflow.jobs.package.steps.find((step: { name?: string }) => step.name === "Record installer checksums and source");
    expect(record.run).toContain("cd release\nsha256sum *.exe");
  });
});
