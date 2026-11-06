# Selected upstream work

Checked upstream `8d56ad4ef8440057e101f8c8f1dd4d7389a43c29` on 6 November 2026 (Asia/Kolkata). No newer commit was on upstream `HEAD`. Status below is what this fork actually runs, not a plan.

| ID | Status | What landed |
| --- | --- | --- |
| 1 | Implemented | `send --task new`, `--task current`, and `--task ID` choose the conversation and the reply names it. JSON, dry-run, `--send-id`, and rejected tasks keep the existing exit codes. |
| 2 | Implemented | `openmausbot pair --ttl` keeps a one-time code open for up to a day (default remains five minutes). `token create`, `token list`, and `token revoke` make a named session that expires and does not renew. The token is written to a private file and is not printed. A session cannot grant a scope it does not hold. |
| 3 | Implemented | `doctor --host` only reads. Linux without `--desktop` is checked as a host for OpenBot and the bot sandbox. `--desktop` checks a VPS that only runs the remote desktop container and does not require user namespaces, seccomp, or cgroup v2. Windows reports the local app and does not require those prerequisites. Nothing is installed, no sysctl or firewall is changed, and Google Cloud CLI is not used. A time comparison happens only when `--time-url` is an https address the operator supplies. |
| 4 | Implemented | A command MCP entry may say `"type": "stdio"`. The type is not stored. `stdio` with a URL, `http` with only a command, and an unknown type are rejected. Existing command and URL shapes still work. |
| 5 | Implemented | `PATCH /api/mcp/servers/:name` with `{ "restart": true }` bumps the next turn's spec and leaves saved keys, sign-in, apps, and bot ownership in place. A restart count is ignored by the app identity hash. A check already starting is not started again. Removing the server drops the count. A URL server and a disabled server are refused. |
| 6 | Not started | Command Code as an optional ACP engine. |
| 9 | Not started | OpenAI Responses fallback when Chat Completions rejects tools. |
| 10 | Not started | Recovery of tool calls that a local model emits as text. |
| 13 | Not started | Copying files between a bot's working folder and its SSH VPS desktop. |
| 14 | Not started | Background commands on the existing SSH VPS tools. |
| 15 | Not started | Map data in folder-page publishing, and the skipped-file reporting fix. |
| 16 | Not started | Optional self-hosted HTTPS and tunnel support. Upstream's tunnel work is tied to the hosted cloud-home deploy path and was not copied. |
| 18 | Not started | Optional server-management connector. Upstream's connector talks to its Admin service. It stays out until a user-controlled design exists. It is not enabled. |

Excluded and not implemented: 7 Brazilian Portuguese, 8 automatic larger Ollama context, 11 the new encrypted phone connection, 12 MausBot Relay, 17 SMTP email sign-in.

## Bug fix in this pass

`Lane.interrupt()` now keeps delivering the interrupt until the statement settles, including when it arrives before DuckDB has dispatched the query. Close uses that path. An abort that arrives early already did. The regression is `cancels a statement whose interrupt landed before it dispatched` in `server/data/engine.test.ts`.

## Verification in this pass

Focused Vitest files were run on Linux. They are not a Windows run and not a GCP desktop run.

- `server/data/engine.test.ts` filtered to the interrupt cases, and the send tests: passed (the interrupt cases were in the first combined run; the send file then passed 6/6).
- `server/headless/token.test.ts`, `server/headless/args.test.ts`, `server/sessions.test.ts`, `server/cli-pair.test.ts`, `server/cli.test.ts`: 113 passed.
- `server/mcp-registry.test.ts`, `server/routes/mcp-servers.test.ts`, `server/host/mcp-servers-host.test.ts`: 49 passed.
- `server/headless/host-doctor.test.ts`: 5 passed.

No live GCP SSH, Docker, or Windows desktop check was performed. No Windows EXE was built.
