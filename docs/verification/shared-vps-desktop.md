# Shared VPS Desktop

OpenBot's AI engines and agent processes continue running on the local computer. The default VPS SSH config alias identifies the Linux host with Docker. No Google Cloud CLI, published Docker daemon, or public VNC port is needed. OpenBot uses Docker's SSH transport and forwards the desktop viewer through a local SSH tunnel.

In a bot's Computer panel, select Cloud Computer → Self-hosted VPS, then choose **Shared VPS Desktop**. All bots using this mode and the same OpenBot installation connect to one installation-owned container on the default SSH host. **Per-Bot VPS** remains the default for existing and new bots. Per-bot SSH alias overrides are retained for that mode; shared mode always uses the default alias so the desktop remains discoverable after individual bots are deleted.

The container keeps its writable filesystem, browser profile, and installed applications while it is stopped or while OpenBot restarts. Docker's existing `unless-stopped` policy starts it again after a VPS reboot unless it was deliberately stopped. Removing or replacing the container erases its writable filesystem. Keep irreplaceable files in durable storage. The existing managed image limits the container to 4 GiB of the 8 GiB VM and 2 CPUs.

Bot computer calls claim a single turn resource. Waiting turns use the existing FIFO queue, cancellation and wait timeout; unrelated work on other bots does not claim that desktop. A person's **Take Control** joins the same queue and holds a session-bound lease. The UI shows the current bot/person and waiting queue. Handing back control releases the person's seat immediately; a viewer heartbeat refreshes the lease, and an abandoned seat expires after ten minutes without a viewer/check. Viewer WebSockets and the SSH tunnel close on release. An in-progress desktop tool call is not replayed after an SSH interruption: the next status/provision or new turn re-inspects and reconnects, and the affected call must be retried after checking the desktop state.

Verification in an isolated fixture:

```sh
node_modules/.bin/vitest run server/shared-vps-seat.test.ts server/vps-routing.test.ts server/vps-computer.test.ts server/vps-inventory.test.ts server/vps-hosts.test.ts server/turn-watchdog.test.ts
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/tsc -b
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/tsc -p tsconfig.server.json
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/vite build
```

The routing fixture starts a disposable OpenBot server with fake Docker, SSH, and an agent engine. It tests shared identity, SSH failure/retry, person control, mode isolation, and bot deletion. It cannot prove that a particular GCP VM is reachable or that a real Cua desktop/browser works there. A real check requires an SSH alias and Docker CLI in the local OpenBot environment, then two authorized bots taking turns in the same browser session, a controlled SSH disconnect/reconnect, and confirmation that the viewer tunnel and leases close. Never run that check against the user's live OpenBot data; use an isolated OpenBot data directory and test accounts.
