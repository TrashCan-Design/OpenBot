# OpenBot

OpenBot is a local-first desktop app for a team of AI agents. This is the
[`TrashCan-Design/OpenBot`](https://github.com/TrashCan-Design/OpenBot) fork of
[`milind-soni/OpenMausBot`](https://github.com/milind-soni/OpenMausBot).
The original authors and contributors retain their attribution in [NOTICE](NOTICE)
and [LICENSE](LICENSE).

Bots run through locally installed Claude, Codex, or Grok CLIs, or a configured
model provider. The embedded server stores conversations and settings on your
computer. Its existing data directory and desktop application identifier are
preserved so an installed copy can use its existing data after upgrading.

## Run from source

Requires Node 24+, pnpm, and at least one installed and signed-in agent CLI.

```sh
git clone https://github.com/TrashCan-Design/OpenBot.git
cd OpenBot
pnpm install
pnpm dev:server
```

In a second terminal, run `pnpm dev`; in a third, run `pnpm dev:desktop`.
The harness listens on `127.0.0.1:8799` by default. See [self-hosting](docs/self-hosting.md)
and [VPS deployment](docs/deploy-vps.md) for a server you operate yourself.
Desktop pairing and your own HTTPS endpoint remain available.

## Windows releases and updates

The [Windows release workflow](.github/workflows/openbot-windows-release.yml)
builds an x64 installer on a Windows runner when the version in `package.json`
changes on `main`, or when manually dispatched. It verifies the packaged server,
browser bundle, installer, and updater metadata, then publishes a public GitHub
Release with `OpenBot-<version>-setup.exe` and `latest.yml`. The workflow checks
that it runs in `TrashCan-Design/OpenBot` before publishing. No OpenBot installer
has been published by this refactor yet.

Installed desktop copies check the fork's release feed and display an update
control when a newer version is available. The installer is currently unsigned;
Windows may display its unknown-publisher warning. The updater requires a
public release and a higher version than the installed copy.

## External services

There is no MausBot-hosted Cloud subscription in this fork. Local chat and
self-hosted pairing do not require a Cloud account. Optional integrations,
including model providers, Composio, speech providers, Cloudflare Tunnel, and
PostHog analytics, can contact their respective services when configured or
enabled. Analytics are off by default. The packaging scripts still fetch
verified, pinned upstream native browser and computer-use components; consult
their provenance records under `third_party/` before distributing a build.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

See [upstream sync](docs/upstream-sync.md) for the review of official changes.

## License

[Apache License 2.0](LICENSE) applies except to `enterprise/`, which has its
[own license](enterprise/LICENSE). Copyright and third-party notices are in
[NOTICE](NOTICE) and the corresponding `third_party/` directories.
