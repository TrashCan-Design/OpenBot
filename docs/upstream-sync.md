# Upstream review

| Date (UTC) | Upstream main | Fork base | Review |
| --- | --- | --- | --- |
| 2026-11-01 | `cdbf1495d3f1b6951bfa702d20663a11a3bf67f4` | `007f92a317a5e4deca0a3553f8396036668f3503` | 38 upstream commits reviewed for applicable fixes before the OpenBot refactor. |
| 2026-11-01 (later) | `ac08cf72a70f4d334ea39e9044ecc514c0c1056c` | `007f92a317a5e4deca0a3553f8396036668f3503` | One additional sidebar fix (`1f35a3449`) ported: Simple mode now shows threads awaiting the person. |
| 2026-11-02 (Asia/Kolkata) | `6e32504b9d08674834bef034d76787751f39d9a3` | `007f92a317a5e4deca0a3553f8396036668f3503` | Reviewed 11 new upstream fixes. Ported coordination, key-engine hints, active remote notifications, Cursor MCP repeat detection, and Windows lease fixes. The rail wording fix has no matching key or UI in this fork. |
| 2026-11-03 (Asia/Kolkata) | `f52effc1a5871e4e54b3d2c699336a28c6cb1f97` | `35d74856cbc555b2224ca7b424f4cb5da0e77479` | Reviewed 71 subsequent commits (including merges), porting applicable memory writes, capture flushing, Windows test timing, completion notices, self-hosted pairing, remote computer UI, browser fake-IP rules, IME input, bubble wrapping, ACP provider errors and 429 handling, local-model tool budget, mascot scheduling, and initial page titles. Adapted updater tests to the local-only bridge and isolated their state per test. |
| 2026-11-06 (Asia/Kolkata) | `aede7d817df9bc4142ab569128d4462dcdee1b31` | `e37c79138006d659723436d4e64875b3f9f8f590` | Reviewed commits since the 5 November upstream check `e7317a7`. Ported the retained turn-watchdog sleep correction (`e39d9b0`) with a focused regression test. The remaining new fixes concern removed hosted accounts, unrelated integrations or UI, and Mac Docker discovery; they do not alter the Windows self-hosted VPS path in this change. |
| 2026-11-06 (Asia/Kolkata, later) | `dd64479da27bc43812615b83907df38e1f9e805b` | `e37c79138006d659723436d4e64875b3f9f8f590` | Two first-parent merges landed after `aede7d817` (00:06 and 00:40 IST). Neither is ported. |
| 2026-11-06 (Asia/Kolkata, 3:05 AM) | `a51e2abba3d13ca3a1eee1c5a57a96a530d40deb` | `e37c79138006d659723436d4e64875b3f9f8f590` | Five first-parent merges after `dd64479`. The locale fallback and per-person language fixes sit on Portuguese catalog and hosted-cloud code this fork does not share. The 0.1.142 release bump and the two train merges are not bug fixes for the retained VPS path. None ported. |
| 2026-11-06 (Asia/Kolkata, 9:58 PM) | `8d56ad4ef8440057e101f8c8f1dd4d7389a43c29` | `00f053431a9b9b4c605cf6a286e6b39da8881f78` | Upstream `HEAD` is still `8d56ad4` (merge of #4635, 9:08 PM IST). Nothing newer. From the range since `a51e2ab`, ported: data-lane interrupt redelivery (`b400065`), CLI send conversation selection (#4577), pairing TTL and CI tokens (#4579), `doctor --host` adapted for the Windows app and a desktop-only VM (#4580), explicit stdio MCP (#4574), and command-MCP restart without rewriting saved keys (`57b4fb0`, `6d25919`). Not ported: Brazilian Portuguese, larger Ollama context, the encrypted phone connection (#4561), MausBot Relay (#4565, #4575), SMTP sign-in (#4582), Command Code (#4624), Responses fallback (#4184), local-model text tool calls (#4180), Boat file copy and background exec (#4553, #4567), page map data (#4563), hosted HTTPS/tunnel (#4617, #4626), and the Admin connector (#4609, #4621, #4625, #4635). Those connector and tunnel commits require upstream's Admin or cloud-home deploy path. |

The fork retains local and self-hosted features. Upstream changes that require
MausBot-hosted accounts, billing, or Boat computers are not ported.

The 6 November follow-up is upstream `dd64479da`. Pull request #4549 only
collapses one optimistic-message call in `src/state/store.tsx` and rebuilds
`shared/app-frame/app-host.html`. This fork's store does not have that call.
Pull request #4504 adds Brazilian Portuguese across 626 files, including
hosted-cloud copy. It also lazy-loads `undici` from
`server/drivers/openai-chat-fetch.ts`, a module this fork does not have. The
locale itself is not a bug fix for a retained path, so it stays upstream.

The Claude account-config fix (`785be84`) changes a module absent from this fork.
The engine startup cache change (`3a2d563`) depends on upstream performance
refactors not present here. Larger Ollama context, Responses API, and local-model
tool-call changes (`9022b06`, `5bfb0f0`, `6371611`) require separate integration
and regression work; they were not included in this scoped bug-fix pass.
