# Windows releases

OpenBot's Windows installer is built on GitHub's Windows runner by
[OpenBot Windows release](../.github/workflows/openbot-windows-release.yml).
A version change to `package.json` on `main` triggers the workflow; it also
supports a manual run. It refuses to publish from a repository other than
`TrashCan-Design/OpenBot` or to reuse an existing version.

The workflow packages the app from one commit, checks the bundled browser and
server, and verifies that `latest.yml` describes the exact installer bytes.
It publishes `OpenBot-<version>-setup.exe`, its blockmap, `latest.yml`, and a
SHA-256 checksum together in one GitHub Release. The app's existing updater
reads that public release feed, checks periodically, and offers the update in
the interface. An Actions artifact by itself is not an updater feed.

For a version bump, run **Actions → Prepare next release** and merge its PR.
Do not bump the version until the fork has been renamed to
`TrashCan-Design/OpenBot` and the Windows release is ready to run. The first
installer must be checked on a real Windows machine before distributing it.

**Package Windows** remains an artifact-only manual workflow for diagnostic
builds. It does not publish an update. The earlier multi-platform workflow
and its mirror to the original maintainer's release repository are retired;
this fork does not possess that project's macOS signing credentials.
