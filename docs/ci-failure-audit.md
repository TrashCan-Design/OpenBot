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
| Linux package verification, install and lifecycle | PR run's Ubuntu package job first stopped in `scripts/verify-linux-package.mjs` because it required `release/linux-unpacked/openmausbot` while `electron-builder.yml` sets `executableName: openbot`. The next run passed verification, then failed during DEB configuration: the post-install hook still required `/opt/OpenMausBot` while the package installed under `/opt/OpenBot`. The browser's AppArmor policy also referenced the old path. The third run passed the DEB and installed-browser smokes, then found that the lifecycle wrapper still passed `openmausbot` as the executable. A fourth run launched the app but its CUA opt-in fixture missed the fresh install's lowercase `openbot` user-data directory. | Update verifier, package hooks, policy, upgrade and lifecycle smoke paths and user-data fixture; rerun the lifecycle. |

These groups overlap; the raw failure counts are not disjoint root-cause counts.
This audit classifies failures, but it does **not** certify the entire Vitest
suite or every retained feature. PR #3's focused updater, memory, browser,
ACP, and UI tests passed locally before this audit.

## Follow-up — 5 November 2026

The scheduled main run [41948570769](https://github.com/TrashCan-Design/OpenBot/actions/runs/41948570769)
failed its 20 Vitest jobs: eight Ubuntu, eight Windows, and four macOS shards.
Its 17 other jobs, including typecheck/lint, the Ubuntu package smoke, and the
Windows browser and CUA smokes, succeeded. The historical 16-shard count above
describes the earlier push run, which had no macOS Vitest matrix.

The separate [Docker image run 41584918324](https://github.com/TrashCan-Design/OpenBot/actions/runs/41584918324)
failed because its volume-lock smoke expected “Another MausBot home” while the
server correctly said “Another OpenBot home.” The relevant workflow assertion
and `server/cloud-home.test.ts` expectations were corrected in PR #4. The later
[main Docker run 42017833571](https://github.com/TrashCan-Design/OpenBot/actions/runs/42017833571)
passed its full smoke and GHCR publish jobs.

## VPS routing follow-up

The retained `server/vps-routing.test.ts` suite initially had four failures.
Two expected the removed `cloudBackend: "box"` choice to succeed or return an
active-turn conflict; the route rejects it with 400 before checking turn state.
One expected the old `OpenMausBot` VPS error text. Those three test assertions
were updated to match the retained self-hosted VPS route and OpenBot wording.
The fourth, a computer lease contention assertion, failed in that initial
run but passed alone and in two complete suite runs. No product routing code
was changed for this intermittent result; the full suite passed 14/14 twice.

## Independent threads follow-up

The 5 November Ubuntu shard 4 log showed four failures in
`server/independent-threads-api.test.ts`, all at assertions expecting an
`OpenMausBot` approval or teammate report prefix. Those expectations now use
`OpenBot`. A local full run cannot confirm this E2E suite in this workspace:
its verification server logs `listen EPERM` for the Unix permission-broker
socket, so the fake Claude turn never writes the dump file and 14 cases time
out at that shared setup point. The CI failures reached later assertions,
which distinguishes them from this local environment restriction.

## Shared VPS change baseline — 6 November 2026

The 16-shard failure refers to the older push workflow; the scheduled main matrix has 20 Vitest jobs. The broad failures were already present before the Shared VPS Desktop branch. Their causes include stale OpenMausBot text assertions, fixtures for removed Boat/hosted Cloud behavior, and retained-feature tests that require separate diagnosis. The VPS routing suite passed 14/14 after its test expectations were corrected; it does not prove the new shared mode. Local E2E server fixtures in this workspace may fail at Unix permission-broker `listen EPERM`, before reaching their assertions. New shared-mode failures must be assessed against this baseline, never counted as covered by it.

The first Shared VPS routing run failed at server startup because the new seat class used TypeScript constructor parameter properties, unsupported by Node's strip-only loader. Explicit fields fixed this. A subsequent 14-test run had one regression: deleting a per-bot VPS scanned the default host as well as its overridden host, violating alias isolation. The deletion scan now keeps its original one-host scope for per-bot mode; shared mode scans both aliases only to find previously owned per-bot containers. The next run passed all 14 existing cases plus the new shared case. These were new change-specific failures, separate from the old matrix failures.

The `server/system-prompt.test.ts` run on this branch had five failures in assertions that still require `OpenMausBot`/`MausBot Cloud` wording. All shared VPS prompt assertions passed. The five failed names are “distinguishes background window control,” “prefers a saved login,” “says the bot runs in the cloud,” “points to a lent computer,” and “names the person's computer by its platform.” Those are the existing branding/removed hosting baseline; they should be corrected in a separate test migration without reinstating vendor services.
