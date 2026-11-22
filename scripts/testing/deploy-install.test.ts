import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const SCRIPT = join(ROOT, "deploy", "install.sh");
const script = readFileSync(SCRIPT, "utf8");
const posix = process.platform !== "win32";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const TOKEN = "t0ken-of-the-registry";
const BOX_PASSED = '{"box":"bwrap","total":31,"passed":31,"failed":[],"results":[{"id":"config-hidden","ok":true},{"id":"messages-db-hidden","ok":true}]}';
const FILES = "https://raw.githubusercontent.com/TrashCan-Design/OpenBot";
const REAL_TOOLS = ["sed", "awk", "grep", "cat", "head", "tail", "tr", "sort", "cut", "mkdir", "mktemp", "chmod", "chown", "mv", "rm", "dirname", "sh", "install", "find"];

const HEALTHY = {
  FAKE_UID: "0", FAKE_ARCH: "x86_64", FAKE_CPUS: "4", FAKE_FREE_GB: "80", FAKE_DOCKER: "27.3.1", FAKE_SECURITY: '["name=apparmor","name=seccomp,profile=builtin"]',
  FAKE_COMPOSE: "0", FAKE_PUBLIC_IP: "203.0.113.7", FAKE_LOCAL_IP: "10.0.0.5", FAKE_DNS: "203.0.113.7", FAKE_NOW: "1794268800", FAKE_THEIRS: "1794268790",
  FAKE_STABLE: "404", FAKE_RELEASE: "v0.1.151", FAKE_RELEASE_STATUS: "200", FAKE_HEALTH: "healthy", FAKE_HTTPS: "openbot",
  FAKE_IMAGE_ENV: '["PATH=/usr/bin","HOME=/data","OMB_IMAGE=server"]', FAKE_BOX_CHECK: BOX_PASSED, FAKE_SOURCE: "published",
};

interface Server {
  env?: Record<string, string>;
  osRelease?: string | null;
  memoryKb?: number;
  userns?: { max?: string; clone?: string };
  apparmor?: string | null;
  without?: string[];
  umask?: string;
}

const STUBS: Record<string, string> = {
  apparmor_parser: 'echo "apparmor_parser $*" >> "$FAKE_LOG"',
  id: 'echo "$FAKE_UID"',
  uname: 'echo "$FAKE_ARCH"',
  nproc: 'echo "$FAKE_CPUS"',
  sleep: 'echo "sleep $*" >> "$FAKE_LOG"',
  df: 'echo "Filesystem 1024-blocks Used Available Capacity Mounted on"; echo "/dev/sda1 0 0 $((FAKE_FREE_GB * 1048576)) 10% /"',
  ss: `case "$*" in *":80") printf '%s' "\${FAKE_SS_80:-}" ;; *":443") printf '%s' "\${FAKE_SS_443:-}" ;; esac`,
  getent: 'for address in ${FAKE_DNS:-}; do echo "$address STREAM $2"; done',
  ip: 'echo "2: eth0    inet $FAKE_LOCAL_IP/24 brd 10.0.0.255 scope global eth0"',
  date: `case "$*" in
  "-u +%s") echo "$FAKE_NOW" ;;
  "-u -d "*) echo "$FAKE_THEIRS" ;;
  "-u +%Y") echo "\${FAKE_YEAR:-2026}" ;;
  *) echo "2026-11-10 12:00" ;;
esac`,
  curl: `echo "curl $*" >> "$FAKE_LOG"
blocked() { case " \${FAKE_BLOCKED:-} " in *" $1 "*) return 0 ;; esac; return 1; }
case "$*" in
  *"-K - -fsSL"*) cat >> "$FAKE_LOG.stdin"
    case "$*" in
      */manifests/sha256:*) printf '%s' "\${FAKE_MANIFEST:-}" ;;
      */manifests/*) printf '%s' "\${FAKE_INDEX:-}" ;;
      */blobs/*) printf '%s' "\${FAKE_CONFIG:-}" ;;
    esac ;;
  *"-K -"*) cat >> "$FAKE_LOG.stdin"
    if blocked ghcr.io; then exit 7; fi
    case "$*" in */manifests/stable) printf '%s' "$FAKE_STABLE" ;; *) printf '%s' "$FAKE_RELEASE_STATUS" ;; esac ;;
  *cdn-cgi/trace*) printf 'fl=1\\nip=%s\\nts=1\\n' "$FAKE_PUBLIC_IP" ;;
  "-sSI "*) printf 'HTTP/2 405\\r\\ndate: Tue, 10 Nov 2026 12:00:00 GMT\\r\\n' ;;
  *ghcr.io/token*) if blocked ghcr.io; then exit 7; fi; printf '{"token":"${TOKEN}"}' ;;
  *releases/latest*) printf '{\\n  "tag_name": "%s",\\n  "name": "x"\\n}\\n' "$FAKE_RELEASE" ;;
  *--resolve*) printf '%s' "\${FAKE_HTTPS:-}" ;;
  *"/install.sh -o "*) exit 22 ;;
  *"${FILES}/"*" -o "*) case "$*" in
      *"${FILES}/main/"*) [ "$FAKE_SOURCE" = published ] || [ "$FAKE_SOURCE" = main-only ] || exit 22 ;;
      *) [ "$FAKE_SOURCE" = published ] || exit 22 ;;
    esac
    for last; do :; done
    case "$*" in
      *deploy/box/prepare-host.sh*) printf '#!/bin/sh\\necho "prepare-host profiles=$OPENBOT_PROFILES_DIR" >> "$FAKE_LOG"\\nexit "\${FAKE_PREPARE:-0}"\\n' > "$last" ;;
      *) printf 'the repository file\\n' > "$last" ;;
    esac ;;
  *"get.docker.com -o "*) exit 22 ;;
  *) for last; do :; done
    host=$(printf '%s' "$last" | sed -e 's#^[a-z]*://##' -e 's#/.*##')
    if blocked "$host"; then exit 7; fi ;;
esac`,
  docker: `echo "docker $*" >> "$FAKE_LOG"
case "$*" in
  "version --format"*) [ -n "$FAKE_DOCKER" ] || exit 1; echo "$FAKE_DOCKER" ;;
  "info --format {{json .SecurityOptions}}") echo "$FAKE_SECURITY" ;;
  "info --format {{.DockerRootDir}}") echo /nonexistent/docker ;;
  "compose version") exit "$FAKE_COMPOSE" ;;
  "ps -q --filter label=com.docker.compose.project=openbot --filter publish="*) printf '%s' "\${FAKE_OURS:-}" ;;
  "ps -aq --filter name=openbot-connector") printf '%s' "\${FAKE_CONNECTOR:-}" ;;
  "run --rm --network none --entrypoint id "*" -u") /usr/bin/id -u ;;
  "run --rm --network none --entrypoint id "*" -g") /usr/bin/id -g ;;
  compose*" ps -q omb") echo c1 ;;
  "image inspect -f {{json .Config.Env}} "*) echo "$FAKE_IMAGE_ENV" ;;
  "image inspect -f {{index .Config.Labels "*) echo "\${FAKE_IMAGE_VERSION-v0.1.151}" ;;
  "compose exec -T omb node dist-server/bot-box/box-check.js --public=none") echo "$FAKE_BOX_CHECK"; case "$FAKE_BOX_CHECK" in *'"failed":[]'*) ;; *) exit 1 ;; esac ;;
  "inspect --format {{.State.Health.Status}} c1") echo "$FAKE_HEALTH" ;;
esac`,
};

let stubs = "";
beforeAll(() => {
  stubs = mkdtempSync(join(tmpdir(), "openbot-server-install-stubs-"));
  for (const [name, body] of Object.entries(STUBS)) {
    const file = join(stubs, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
  }
});
afterAll(() => rmSync(stubs, { recursive: true, force: true }));

function run(args: string[], server: Server = {}, kept?: { dir: string }) {
  const dir = kept?.dir ?? mkdtempSync(join(tmpdir(), "openbot-server-install-"));
  if (!kept) dirs.push(dir);
  const bin = join(dir, "bin");
  const sysroot = join(dir, "sysroot");
  const install = join(dir, "opt", "openbot");
  const log = join(dir, "calls.log");
  rmSync(bin, { recursive: true, force: true });
  rmSync(log, { force: true });
  rmSync(sysroot, { recursive: true, force: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(dir, "opt"), { recursive: true });
  for (const name of REAL_TOOLS) {
    const found = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].map((folder) => join(folder, name)).find((path) => existsSync(path));
    if (found) symlinkSync(found, join(bin, name));
  }
  for (const name of Object.keys(STUBS)) if (!server.without?.includes(name)) symlinkSync(join(stubs, name), join(bin, name));
  mkdirSync(join(sysroot, "etc"), { recursive: true });
  mkdirSync(join(sysroot, "proc", "sys", "user"), { recursive: true });
  mkdirSync(join(sysroot, "proc", "sys", "kernel"), { recursive: true });
  mkdirSync(join(sysroot, "sys", "module", "apparmor", "parameters"), { recursive: true });
  if (server.apparmor !== null) writeFileSync(join(sysroot, "sys", "module", "apparmor", "parameters", "enabled"), `${server.apparmor ?? "Y"}\n`);
  if (server.osRelease !== null) {
    writeFileSync(join(sysroot, "etc", "os-release"), server.osRelease ?? 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n');
  }
  writeFileSync(join(sysroot, "proc", "meminfo"), `MemTotal:       ${server.memoryKb ?? 8_100_000} kB\nMemFree:         1000000 kB\n`);
  writeFileSync(join(sysroot, "proc", "sys", "user", "max_user_namespaces"), `${server.userns?.max ?? "63000"}\n`);
  if (server.userns?.clone !== undefined) writeFileSync(join(sysroot, "proc", "sys", "kernel", "unprivileged_userns_clone"), `${server.userns.clone}\n`);
  const command = server.umask ? ["-c", `umask ${server.umask}; exec /bin/sh "$0" "$@"`, SCRIPT, ...args] : [SCRIPT, ...args];
  const result = spawnSync("/bin/sh", command, {
    encoding: "utf8",
    env: { PATH: bin, FAKE_LOG: log, OPENBOT_INSTALL_SYSROOT: sysroot, OPENBOT_INSTALL_DIR: install, OPENBOT_ADMIN_URL: "https://admin.example.test", ...HEALTHY, ...server.env },
    timeout: 60_000,
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  const fixes = result.stdout.split("\n").filter((line) => line.startsWith("  FIX   ")).map((line) => line.slice(8));
  return { ...result, calls, fixes, dir, install, docker: calls.filter((call) => call.startsWith("docker ")), all: result.stdout + result.stderr };
}

describe.skipIf(!posix)("deploy/install.sh", () => {
  it("is plain POSIX sh, as `curl … | sh` runs it", () => {
    expect(spawnSync("sh", ["-n", SCRIPT]).status).toBe(0);
    const dash = spawnSync("dash", ["-n", SCRIPT]);
    if (!dash.error) expect(dash.status).toBe(0);
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    for (const bashism of [/\[\[/, /\bfunction\s+\w+/, /\blocal\s/, /<<</, /\$\{[A-Za-z_]+\[/, /\bsource\s/, /&>/]) expect(script, String(bashism)).not.toMatch(bashism);
  });

  it("gives what it makes fixed modes whatever the umask it is started with, and closes a folder others could change", () => {
    const mode = (path: string) => statSync(path).mode & 0o777;
    const first = run(["--domain", "bot.example.com"], { umask: "000" });
    expect(first.status, first.all).toBe(0);
    const expected: Record<string, number> = {
      "": 0o755, "compose.yaml": 0o644, Caddyfile: 0o644, ".env": 0o600, data: 0o700, "update.sh": 0o755,
      caddy: 0o755, "caddy/data": 0o755, "caddy/config": 0o755,
    };
    for (const [path, want] of Object.entries(expected)) expect(mode(join(first.install, path)).toString(8), path || "the install's folder").toBe(want.toString(8));
    chmodSync(first.install, 0o777);
    chmodSync(join(first.install, "data"), 0o777);
    const again = run([], { umask: "000" }, { dir: first.dir });
    expect(again.status, again.all).toBe(0);
    expect(mode(first.install)).toBe(0o755);
    expect(mode(join(first.install, "data"))).toBe(0o755);
    expect(again.stdout).toContain(`  note  ${first.install} could be changed by others on this server; now only its owner can change it.`);
  });

  it("supports OPENBOT_INSTALL_SOURCE ahead of OMB_INSTALL_SOURCE", () => {
    const res = spawnSync("sh", [
      "-c",
      `eval "$(sed -e 's/^main /# main /' "$0")"; settings; printf '%s' "$SOURCE_ASKED"`,
      SCRIPT,
    ], {
      encoding: "utf8",
      env: {
        OPENBOT_INSTALL_SOURCE: "https://openbot.example.com/source",
        OMB_INSTALL_SOURCE: "https://legacy.example.com/source",
      },
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("https://openbot.example.com/source");

    const fallback = spawnSync("sh", [
      "-c",
      `eval "$(sed -e 's/^main /# main /' "$0")"; settings; printf '%s' "$SOURCE_ASKED"`,
      SCRIPT,
    ], {
      encoding: "utf8",
      env: {
        OMB_INSTALL_SOURCE: "https://legacy.example.com/source",
      },
    });
    expect(fallback.status).toBe(0);
    expect(fallback.stdout).toBe("https://legacy.example.com/source");

    const unset = spawnSync("sh", [
      "-c",
      `eval "$(sed -e 's/^main /# main /' "$0")"; settings; printf '%s' "$SOURCE_ASKED"`,
      SCRIPT,
    ], {
      encoding: "utf8",
      env: {},
    });
    expect(unset.status).toBe(0);
    expect(unset.stdout).toBe("");
  });
});

describe.skipIf(!posix)("deploy/update.sh", () => {
  const UPDATE_SCRIPT = join(ROOT, "deploy", "update.sh");

  it("is valid bash script", () => {
    expect(existsSync(UPDATE_SCRIPT)).toBe(true);
    expect(spawnSync("bash", ["-n", UPDATE_SCRIPT]).status).toBe(0);
  });

  it("enforces umask 022 when invoked under umask 000", () => {
    const res = spawnSync("bash", [
      "-c",
      `umask 000; bash -c 'eval "$(head -n 40 "$0")"; umask' "$0"`,
      UPDATE_SCRIPT,
    ], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe("0022");
  });

  it("acquires exclusive lock and rejects concurrent update with exit code 3", () => {
    const dir = mkdtempSync(join(tmpdir(), "openbot-update-lock-"));
    dirs.push(dir);
    const res = spawnSync("bash", [
      "-c",
      `
        eval "$(sed -n '/^take_lock() {/,/^}/p' "$0")"
        DIR="$1"
        STATE="$DIR/.update"
        LOCK="$STATE/lock"
        take_lock
        (
          take_lock
        )
      `,
      UPDATE_SCRIPT,
      dir,
    ], { encoding: "utf8" });
    expect(res.status).toBe(3);
    expect(res.stdout).toMatch(/already running|took the lock/);
  });

  it("reclaims regular lock file with stale PID and overwrites with current PID", () => {
    const dir = mkdtempSync(join(tmpdir(), "openbot-update-stale-file-"));
    dirs.push(dir);
    const updateDir = join(dir, ".update");
    mkdirSync(updateDir, { recursive: true });
    writeFileSync(join(updateDir, "lock"), "99999999\n");

    const res = spawnSync("bash", [
      "-c",
      `
        eval "$(sed -n '/^take_lock() {/,/^}/p' "$0")"
        DIR="$1"
        STATE="$DIR/.update"
        LOCK="$STATE/lock"
        take_lock
        printf 'pid:%s' "$(cat "$LOCK")"
      `,
      UPDATE_SCRIPT,
      dir,
    ], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/^pid:\d+$/);
    expect(res.stdout).not.toBe("pid:99999999");
  });

  it("handles legacy directory lock and reclaims stale locks", () => {
    const dir = mkdtempSync(join(tmpdir(), "openbot-update-legacy-lock-"));
    dirs.push(dir);
    const lockDir = join(dir, ".update", "lock");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "pid"), "99999999\n");

    const res = spawnSync("bash", [
      "-c",
      `
        eval "$(sed -n '/^take_lock() {/,/^}/p' "$0")"
        DIR="$1"
        STATE="$DIR/.update"
        LOCK="$STATE/lock"
        take_lock
        [ -f "$LOCK" ] && printf "lock-file-created"
      `,
      UPDATE_SCRIPT,
      dir,
    ], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("lock-file-created");
  });

  it("rejects update when legacy directory lock belongs to an active running process", () => {
    const dir = mkdtempSync(join(tmpdir(), "openbot-update-legacy-active-"));
    dirs.push(dir);
    const lockDir = join(dir, ".update", "lock");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "pid"), `${process.pid}\n`);

    const res = spawnSync("bash", [
      "-c",
      `
        eval "$(sed -n '/^take_lock() {/,/^}/p' "$0")"
        DIR="$1"
        STATE="$DIR/.update"
        LOCK="$STATE/lock"
        take_lock
      `,
      UPDATE_SCRIPT,
      dir,
    ], { encoding: "utf8" });
    expect(res.status).toBe(3);
    expect(res.stdout).toContain(`An update is already running here (process ${process.pid}). Wait for it to finish.`);
  });
});

