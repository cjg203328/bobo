#!/usr/bin/env node

/**
 * Run a Bun build in a disposable child process with explicit resource bounds.
 *
 * Bun's standalone compiler can finish writing an executable while its parent
 * process keeps a very large heap alive. Keeping the compiler in a child lets
 * us reclaim it deterministically and prevents concurrent release jobs from
 * multiplying the peak memory usage of the host.
 *
 * Usage:
 *   bun scripts/run-bun-build-safe.mjs -- build --compile --outfile app.exe src/main.ts
 *   bun scripts/run-bun-build-safe.mjs -- run vite build
 *
 * BOBO_BUILD_MAX_RSS_MB and BOBO_BUILD_TIMEOUT_MS can raise the defaults for
 * a known large build. BOBO_BUILD_LOCK_PATH selects the lock location.
 */
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_MAX_RSS_MB = 4096;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_POLL_MS = 1000;

function numberEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    const value = Number.parseInt(process.env[name] || "", 10);
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function parseArgs(argv) {
    const forwarded = [];
    let timeoutMs = numberEnv("BOBO_BUILD_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, { min: 1000 });
    let maxRssMb = numberEnv("BOBO_BUILD_MAX_RSS_MB", DEFAULT_MAX_RSS_MB, { min: 256 });
    let lockPath = process.env.BOBO_BUILD_LOCK_PATH || resolve(process.cwd(), ".local", "bobo-build.lock");
    let useSmol = process.env.BOBO_BUILD_SMOL !== "0";

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--") {
            forwarded.push(...argv.slice(index + 1));
            break;
        }
        if (arg === "--no-smol") {
            useSmol = false;
            continue;
        }
        if (arg === "--timeout-ms") {
            timeoutMs = parsePositive(argv[++index], "--timeout-ms");
            continue;
        }
        if (arg.startsWith("--timeout-ms=")) {
            timeoutMs = parsePositive(arg.slice("--timeout-ms=".length), "--timeout-ms");
            continue;
        }
        if (arg === "--max-rss-mb") {
            maxRssMb = parsePositive(argv[++index], "--max-rss-mb");
            continue;
        }
        if (arg.startsWith("--max-rss-mb=")) {
            maxRssMb = parsePositive(arg.slice("--max-rss-mb=".length), "--max-rss-mb");
            continue;
        }
        if (arg === "--lock") {
            lockPath = resolve(argv[++index]);
            continue;
        }
        if (arg.startsWith("--lock=")) {
            lockPath = resolve(arg.slice("--lock=".length));
            continue;
        }
        // A leading separator is optional for convenience. Once a command
        // argument is seen, the rest is always forwarded to Bun unchanged.
        forwarded.push(...argv.slice(index));
        break;
    }

    if (forwarded[0] === "--") forwarded.shift();
    if (forwarded.length === 0) throw new Error("A Bun command is required after -- (for example: -- build --compile entry.ts)");
    return { forwarded, timeoutMs, maxRssMb, lockPath, useSmol };
}

function parsePositive(value, flag) {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
    return parsed;
}

function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function acquireLock(lockPath) {
    mkdirSync(dirname(lockPath), { recursive: true });
    try {
        const descriptor = openSync(lockPath, "wx");
        writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
        closeSync(descriptor);
        return () => {
            try { unlinkSync(lockPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
        };
    } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        let owner = "unknown";
        try {
            const contents = JSON.parse(readFileSync(lockPath, "utf8"));
            owner = String(contents.pid || owner);
            if (!isProcessAlive(Number(contents.pid))) {
                unlinkSync(lockPath);
                return acquireLock(lockPath);
            }
        } catch (readError) {
            if (readError?.code !== "ENOENT") throw new Error(`Build lock is busy (${lockPath})`);
            return acquireLock(lockPath);
        }
        throw new Error(`Another Bobo build is already running (pid ${owner}, lock ${lockPath})`);
    }
}

function bunExecutable() {
    if (process.versions.bun) return process.execPath;
    const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["bun"], { encoding: "utf8" });
    if (result.status !== 0) throw new Error("Bun is required to run the safe build wrapper");
    return result.stdout.trim().split(/\r?\n/)[0];
}

function processTreeRssBytes(pid) {
    if (process.platform === "win32") {
        const script = "$root=" + Number(pid) + "; $rows=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize; $ids=@($root); $changed=$true; while($changed){$changed=$false; foreach($row in $rows){if($ids -contains [int]$row.ParentProcessId -and -not ($ids -contains [int]$row.ProcessId)){ $ids += [int]$row.ProcessId; $changed=$true }}}; ($rows | Where-Object {$ids -contains [int]$_.ProcessId} | Measure-Object -Property WorkingSetSize -Sum).Sum";
        const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, timeout: 5000 });
        const value = Number.parseInt((result.stdout || "").trim(), 10);
        return Number.isFinite(value) ? value : 0;
    }
    try {
        const status = readFileSync(`/proc/${pid}/status`, "utf8");
        const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
        return match ? Number.parseInt(match[1], 10) * 1024 : 0;
    } catch {
        const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" });
        const value = Number.parseInt((result.stdout || "").trim(), 10);
        return Number.isFinite(value) ? value * 1024 : 0;
    }
}

function terminateTree(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === "win32") {
        spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        return;
    }
    try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
    setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
            try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
        }
    }, 2000).unref();
}

async function run() {
    const { forwarded, timeoutMs, maxRssMb, lockPath, useSmol } = parseArgs(process.argv.slice(2));
    const releaseLock = acquireLock(lockPath);
    const bun = bunExecutable();
    const childArgs = [...(useSmol ? ["--smol"] : []), ...forwarded];
    const child = spawn(bun, childArgs, { cwd: process.cwd(), stdio: "inherit", windowsHide: true, detached: process.platform !== "win32" });
    let timedOut = false;
    let overMemory = false;
    let monitor;
    const startedAt = Date.now();
    const stopMonitor = () => { if (monitor) clearInterval(monitor); };
    const onParentExit = () => terminateTree(child);
    process.once("SIGINT", onParentExit);
    process.once("SIGTERM", onParentExit);
    try {
        monitor = setInterval(() => {
            if (child.exitCode !== null || child.signalCode !== null) return;
            const rss = processTreeRssBytes(child.pid);
            if (rss > maxRssMb * 1024 * 1024) {
                overMemory = true;
                console.error(`Bobo build exceeded RSS limit (${Math.round(rss / 1024 / 1024)} MiB > ${maxRssMb} MiB); terminating compiler.`);
                terminateTree(child);
            } else if (Date.now() - startedAt > timeoutMs) {
                timedOut = true;
                console.error(`Bobo build exceeded timeout (${timeoutMs} ms); terminating compiler.`);
                terminateTree(child);
            }
        }, DEFAULT_POLL_MS);
        const result = await new Promise((resolvePromise) => {
            child.once("error", (error) => resolvePromise({ error }));
            child.once("exit", (code, signal) => resolvePromise({ code, signal }));
        });
        if (result.error) throw result.error;
        if (overMemory) process.exitCode = 137;
        else if (timedOut) process.exitCode = 124;
        else if (result.code !== 0) process.exitCode = result.code ?? 1;
    } finally {
        stopMonitor();
        process.removeListener("SIGINT", onParentExit);
        process.removeListener("SIGTERM", onParentExit);
        releaseLock();
    }
}

if (import.meta.main) {
    run().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}

export { acquireLock, parseArgs, processTreeRssBytes };
