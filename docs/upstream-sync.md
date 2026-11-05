# Upstream review

| Date (UTC) | Upstream main | Fork base | Review |
| --- | --- | --- | --- |
| 2026-11-01 | `cdbf1495d3f1b6951bfa702d20663a11a3bf67f4` | `007f92a317a5e4deca0a3553f8396036668f3503` | 38 upstream commits reviewed for applicable fixes before the OpenBot refactor. |
| 2026-11-01 (later) | `ac08cf72a70f4d334ea39e9044ecc514c0c1056c` | `007f92a317a5e4deca0a3553f8396036668f3503` | One additional sidebar fix (`1f35a3449`) ported: Simple mode now shows threads awaiting the person. |
| 2026-11-02 (Asia/Kolkata) | `6e32504b9d08674834bef034d76787751f39d9a3` | `007f92a317a5e4deca0a3553f8396036668f3503` | Reviewed 11 new upstream fixes. Ported coordination, key-engine hints, active remote notifications, Cursor MCP repeat detection, and Windows lease fixes. The rail wording fix has no matching key or UI in this fork. |
| 2026-11-03 (Asia/Kolkata) | `f52effc1a5871e4e54b3d2c699336a28c6cb1f97` | `35d74856cbc555b2224ca7b424f4cb5da0e77479` | Reviewed 71 subsequent commits (including merges), porting applicable memory writes, capture flushing, Windows test timing, completion notices, self-hosted pairing, remote computer UI, browser fake-IP rules, IME input, bubble wrapping, ACP provider errors and 429 handling, local-model tool budget, mascot scheduling, and initial page titles. Adapted updater tests to the local-only bridge and isolated their state per test. |
| 2026-11-06 (Asia/Kolkata) | `aede7d817df9bc4142ab569128d4462dcdee1b31` | `e37c79138006d659723436d4e64875b3f9f8f590` | Reviewed commits since the 5 November upstream check `e7317a7`. Ported the retained turn-watchdog sleep correction (`e39d9b0`) with a focused regression test. The remaining new fixes concern removed hosted accounts, unrelated integrations or UI, and Mac Docker discovery; they do not alter the Windows self-hosted VPS path in this change. |

The fork retains local and self-hosted features. Upstream changes that require
MausBot-hosted accounts, billing, or Boat computers are not ported.

The Claude account-config fix (`785be84`) changes a module absent from this fork.
The engine startup cache change (`3a2d563`) depends on upstream performance
refactors not present here. Larger Ollama context, Responses API, and local-model
tool-call changes (`9022b06`, `5bfb0f0`, `6371611`) require separate integration
and regression work; they were not included in this scoped bug-fix pass.
