# CI failure audit — 3 November 2026

## Scope and comparison

The main run [41360679909](https://github.com/TrashCan-Design/OpenBot/actions/runs/41360679909)
failed all 16 Vitest shards (939 failure details in the job logs). The draft PR #3
run [41535246178](https://github.com/TrashCan-Design/OpenBot/actions/runs/41535246178)
also failed Vitest. The GitHub connector returned the first 15 PR shard logs:
867 failure details, with **no failed test name absent from the earlier main run**.
The connector's first-page job limit omitted PR Windows shard 3/8, so this
comparison does not establish that shard's result or that a repeated failure
has the same underlying cause. Typecheck, lint, packaged server, macOS,
browser identity, and behavior eval jobs in the PR run succeeded.

## Reasons visible in the logs

| Group | Evidence | Action |
| --- | --- | --- |
| Old product-name assertions and fixtures | `shared/package-format.test.ts`, `server/browser-tool-shape.test.ts`, `server/host/room-transcript.test.ts`, and `server/drivers/acp/acp.test.ts` expect `OpenMausBot`, while OpenBot emits `OpenBot`. The `server/mcp-trim.test.ts` helper also parses the old banner prefix, causing JSON parse errors. | Update expected user-facing text and deliberately versioned fixtures, preserving identifiers required for existing data compatibility. |
| Removed Boat and hosted Cloud behavior | `server/index.test.ts` sets `box.token` and expects HTTP 200, while `/api/config` returns 410 (“Boat is unavailable in OpenBot”). Boat provisioning suites, cloud computer suites, `BOX_TOKEN` catalog tests, and hosted Cloud UI tests exercise intentionally unavailable features. | Retire or rewrite those tests around local and self-hosted paths; do not make the removed service operational merely to satisfy old tests. |
| Changed defaults and routing | `server/default-bot.test.ts` expects an adopted bot's old ID/color. `server/computer-engine-removal.e2e.test.ts` and other computer tests expect the removed cloud desktop destination. | Check intended local destination and migration behavior, then update fixtures or fix retained behavior. |
| Tests of retained behavior that need individual diagnosis | `server/vps-routing.test.ts` reports 400 where it expected 409/200; `server/independent-threads-api.test.ts` and `server/runtime-coordination.e2e.test.ts` report incomplete turns; some E2E tests time out; `server/index.test.ts` has a concurrent write expecting 409 but receiving 200. These cannot be classified as safe branding differences from the logs alone. | Reproduce each retained feature in isolation before changing implementation or expectations. |
| Linux package verification | PR run's Ubuntu package job stopped in `scripts/verify-linux-package.mjs` because it required `release/linux-unpacked/openmausbot` while `electron-builder.yml` sets `executableName: openbot`. The same verifier expected the old DEB package, maintainer, command, and icon. | Update verifier expectations to the current OpenBot package and rerun the package job. |

These groups overlap; the raw failure counts are not disjoint root-cause counts.
This audit classifies failures, but it does **not** certify the entire Vitest
suite or every retained feature. PR #3's focused updater, memory, browser,
ACP, and UI tests passed locally before this audit.
