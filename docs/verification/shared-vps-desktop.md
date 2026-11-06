# Shared VPS Desktop

OpenBot's AI engines and agent processes continue running on the local computer. The default VPS SSH config alias identifies the Linux host with Docker. No Google Cloud CLI, published Docker daemon, or public VNC port is needed. OpenBot uses Docker's SSH transport and forwards the desktop viewer through a local SSH tunnel.

In a bot's Computer panel, select Cloud Computer → Self-hosted VPS, then choose **Shared VPS Desktop**. All bots using this mode and the same OpenBot installation connect to one installation-owned container on the default SSH host. **Per-Bot VPS** remains the default for existing and new bots. Per-bot SSH alias overrides are retained for that mode; shared mode always uses the default alias so the desktop remains discoverable after individual bots are deleted.

The container keeps its writable filesystem, browser profile, and installed applications while it is stopped or while OpenBot restarts. Docker's existing `unless-stopped` policy starts it again after a VPS reboot unless it was deliberately stopped. Removing or replacing the container erases its writable filesystem. Keep irreplaceable files in durable storage. The existing managed image limits the container to 4 GiB of the 8 GiB VM and 2 CPUs.

Bot computer calls claim a single turn resource. Waiting turns use the existing FIFO queue, cancellation and wait timeout; unrelated work on other bots does not claim that desktop. A person's **Take Control** joins the same queue and holds a session-bound lease. Duplicate requests share their queue position, while cancellation removes only the cancelling request's registration. A closed retry cannot release a confirmed seat. Handing back control releases the person's seat immediately; a viewer heartbeat refreshes the lease, and an abandoned seat expires after ten minutes without a viewer/check. Viewer WebSockets and the SSH tunnel close on release.

Shared-mode MCP connections automatically retry a dropped transport three times, using the same pinned container ID and SSH authentication. Only the MCP initialization handshake is repeated. Interrupted actions return an unknown-outcome error and are never replayed. Requests arriving during reconnection are refused rather than queued for later execution. Once the handshake succeeds, the bot must successfully read `get_desktop_state` or `get_window_state` before another action is accepted. If all retries fail, a subsequent request starts another bounded recovery attempt. Ending the bridge cancels recovery and stops its child process. Per-bot mode keeps its existing transport behavior.

Verification in an isolated fixture:

```sh
node_modules/.bin/vitest run server/shared-vps-seat.test.ts server/vps-routing.test.ts server/vps-computer.test.ts server/vps-inventory.test.ts server/vps-hosts.test.ts server/turn-watchdog.test.ts server/mcp-reconnect.test.ts server/mcp-bridge.test.ts src/components/ComputerPanel.takeover.test.ts
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/tsc -b
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/tsc -p tsconfig.server.json
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/vite build
```

The routing fixture starts a disposable OpenBot server with fake Docker, SSH, and agent engines. It tests shared identity, two distinct bots contending through their real turn capabilities, cancellation of a queued person, interruption and hand-off, SSH inspection failure/retry, mode isolation, retained per-bot alias guards, and bot deletion. The MCP recovery fixture uses disposable real processes to check handshake recovery, unknown action outcomes without replay, simulated desktop state retained through reconnect, fresh-inspection enforcement, invalid protocol versions, handshake timeouts, truncated responses, and shutdown. Renderer tests delay the mode PATCH and require it to settle before a status or provision request.

Protocol recovery tests use a cleanup adapter for their known leaf processes. A separate process-tree test uses the production cleanup helper and skips only when a disposable exited-process probe cannot verify cleanup in the test environment. Production recovery stops if process-tree cleanup cannot be verified; it never starts a replacement on that failure. The fixture also tests this refusal explicitly.

These fixtures cannot prove that a particular GCP VM is reachable or that a real Cua desktop/browser works there. A real check requires an SSH alias and Docker CLI in the local OpenBot environment, then two authorized bots taking turns in the same browser session, a controlled SSH disconnect/reconnect, an OpenBot restart with the desktop kept, and confirmation that the viewer tunnel and leases close. Never run that check against the user's live OpenBot data; use an isolated OpenBot data directory and test accounts.
