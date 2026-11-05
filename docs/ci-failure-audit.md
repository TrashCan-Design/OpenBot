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

PR #7's first CI run failed its `typecheck + lint` gate at `scripts/testing/verification-docs.test.ts`: the new `shared-vps-desktop.md` recipe was not linked from `docs/verification/README.md`. The README link was added and the documentation test rerun. This was a newly introduced CI documentation gate failure, separate from the old Vitest shard failures.

## PR #7 Ubuntu shards — 6 November 2026, 1:03 AM IST

Completed run [42090695658](https://github.com/TrashCan-Design/OpenBot/actions/runs/42090695658) is on `d211c6ed`. The required gate passed, and so did behavior evals, the packaged server smoke, macOS smokes, the open-source edition build, renderer smoke, browser identity, the Ubuntu package smoke, and browser driver S4. All eight Ubuntu Vitest shards failed. This pull request's workflow did not run the Windows Vitest shards. The aggregate CI check is red because of those eight shards.

The comparison is the latest main CI [42023353355](https://github.com/TrashCan-Design/OpenBot/actions/runs/42023353355) at `e37c791`, the parent of this branch. That run failed the same eight Ubuntu shards (and eight Windows shards). Both Ubuntu logs contain the same 541 failing test names. After ignoring ports, timestamps, generated ids, and home-directory suffixes, one assertion body differs.

### The only change-specific assertion

`scripts/testing/file-size-ratchet.test.ts` already fails on main:

- `server/boat.ts` is 1261 lines, listed at 1258
- `server/config.ts` is 1284 lines, listed at 1283

Those two counts are unchanged on this branch. The shared desktop work adds six further pins, which is why this branch's failure text is longer:

| File | Main lines | This branch | Why it grew |
| --- | ---: | ---: | --- |
| `server/index.ts` | 15808 | 15936 | Shared desktop routes, lease checks, and viewer binding |
| `src/components/ComputerPanel.tsx` | 1821 | 1849 | Shared controller and queue in the Computer panel |
| `server/store.ts` | 2323 | 2327 | Drops an invalid `vpsDesktopMode` while loading a bot |
| `server/vps-computer.ts` | 1369 | 1373 | `stopVpsDesktopTunnel` for handing the seat back |
| `src/state/store.tsx` | 3379 | 3380 | `vpsDesktopMode` on the client bot |
| `shared/wire.ts` | 1000 | 1002 | The same field on the wire bot; 1000 is the listing threshold |

The ratchet allows a count to go down, not up, and a file crossing 1,000 lines has to be listed with a reason. These pins were not raised. Moving the new code out of the listed files would remove this branch's extra lines from the failure. It would not turn the shard green while `boat.ts` and `config.ts` stay over their pins.

### Why the other 540 failures happen

They are the same failures as main. Counts below are this run's Ubuntu failures. Several tests match more than one story; the first matching story owns the count.

| Tests | Why they fail |
| ---: | --- |
| 267 | The product string is `OpenBot` and the assertion still requires `OpenMausBot`, `MausBot`, or `openmausbot`. Report prefixes, CLI banners, system prompts, default-bot intros, locale lines, and container errors are in this group. One of them is not a stale label: `server/default-bot.test.ts` "keeps the colour the person gave an adopted MausBot" seeds a bot named `MausBot`, recolors it, and expects that same bot back. `seededMausBot` adopts the oldest bot only when its name is `DEFAULT_BOT_NAME` (`OpenBot`) or its color is still silver, so a recolored legacy bot is skipped and a new OpenBot is created. |
| 79 | Boat and the hosted cloud are intentionally unavailable. Thirty `server/index.test.ts` cases get HTTP 410 where they expect 200, 400, or 409. The route body is `Boat is unavailable in OpenBot`. Inventory, provisioning, and included-account tests expect `configured: true` and get `configured: false`, or they expect a Boat API call and get `Boat is not configured`. |
| 15 | `server/live-call.e2e.test.ts` expects the first `POST /api/live/session` to return 201. `server/routes/live.ts` answers 409 `needsKey` when no OpenAI key is configured, so the suite never reaches the second-client case. |
| 15 | Analytics no longer sends unless it is explicitly on. `analyticsEnabled()` is false when the desktop switch is unset and `localStorage` does not contain the opt-out key set to `"0"`. `initAnalytics()` returns immediately, and `sendDailySnapshot()` returns false, so the usage-snapshot tests see no event and no stored day. |
| 5 | `server/mcp-trim.test.ts` parses the trimmed tool text as JSON. The trim banner still carries the old product prefix in the assertion's expected shape, and `JSON.parse` throws on the trailing banner. |
| 4 | `src/locales/vocabulary.test.ts` forbids the phrase it also requires. `RETIRED` contains `["OpenBot Cloud", /OpenBot Cloud/i, "OpenBot Cloud"]`, so English strings and the "good" example `Sign in to OpenBot Cloud` are reported as retired wording. That entry is the old product name rewritten into the new one. |
| 1 | `server/legacy-migration.test.ts` looks for `~/.openmausbot` after booting a `~/.opengrokbot` home. A fresh home selects `~/.openbot` (`server/config.ts`), and the rename target is that directory. An existing `~/.openmausbot` is kept when `~/.openbot` is absent. `server/bot-folder.test.ts` hardcodes the old fresh-install directory and sees `.openbot`. |

The remaining failures are the same names and, after normalizing incidental values, the same assertions as main. They include cloud-health ledger mismatches (one case expects 200 buckets and gets 197), Computer panel copy that still describes a sleeping Boat desktop while the panel renders the self-hosted computer, Places rail actions that still expect a hosted Cloud purchase, computer-usage counts that expect a Boat computer, and coordination end-to-end cases that stop on `Unplanned fixture turn` or expect `M-RERUN` and observe `M-CUT`. Those need a per-test reproduction before a product change. They are not evidence that shared desktop mode broke a shard.

No shard failure is a shared-desktop behavior regression. The shared routing, seat, and viewer tests are not in the failing names. The draft stays open: this workspace still has no GCP SSH configuration or Docker CLI, so there is no live VPS check, and the Ubuntu shards remain red for the baseline above.
