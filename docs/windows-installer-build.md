# Windows installer artifact

The branch used by the previous successful fork installer build is
`codex/windows-installer` (run 41248641661). Its old `fork-windows.yml` checked
`repo: OpenMausBot`, predating the repository rename. The maintained
`.github/workflows/package-win.yml` already checks `TrashCan-Design/OpenBot`
and the browser, CUA, private updater metadata and packaged server resources.
A push to that installer branch now triggers that existing workflow.

The build is based on the current Shared VPS Desktop implementation plus the
recorded route/OpenCode regression corrections. Version 0.1.137 distinguishes
it from the previously published 0.1.136 installer. The old installer branch's
history is preserved as a merge parent; its obsolete application tree and old
workflow are replaced by the current reviewed source tree. No force-push or
merge into main is needed.

The job builds on windows-latest with a 6 GiB Node heap and a 60-minute deadline.
It preserves existing browser/server/resource verification, starts the packaged
server in an isolated home, then uploads windows-installer containing:

- OpenBot-0.1.137-setup.exe
- its .exe.blockmap and latest.yml
- SHA256SUMS.txt with filenames relative to the extracted artifact
- SOURCE_COMMIT.txt identifying the exact build commit

Download the artifact from its GitHub Actions run, extract it, and compare:

```powershell
Get-FileHash .\OpenBot-0.1.137-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
Get-Content .\SOURCE_COMMIT.txt
```

Run the EXE to install. A successful package/resource smoke is not a live GCP
or desktop-interaction qualification. The installer retains the existing signing
configuration; this workflow does not invent a signing identity.

This is an artifact build. It does not publish a GitHub Release, advance latest,
or change the in-app public updater feed. The stable release workflow remains
openbot-windows-release.yml on main and requires a separate release decision.
Full Vitest matrix failures remain recorded in ci-failure-audit.md; a successful
installer build must not be described as a completely green project.
