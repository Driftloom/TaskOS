'use strict';

/**
 * Exclusive cross-process lock for the verification ladder.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two verification ladders running in one working tree produce FALSE results,
 * not slow results. Two specific resources are shared and unlocked:
 *
 *   1. `tsconfig.tsbuildinfo` -- `tsc --build` keeps incremental state here and
 *      never locks it. `typecheck` and `codegen` both run `tsc --build`, so two
 *      ladders interleave writes and each can report errors against
 *      half-written state.
 *   2. `dist/` -- `build:web` writes it, `verify:no-dead-classes` reads it. A
 *      reader that starts while the writer is mid-emit sees an incomplete
 *      bundle and reports dead classes that are not dead.
 *
 * Observed 2026-10-08: `codegen` went red and then green on an unchanged tree,
 * and `verify:no-dead-classes` did the same standalone. Both times the tree was
 * provably identical between runs (`git status` clean), which is what rules out
 * a real regression and points at concurrent writers instead.
 *
 * The previous mitigation was documentation: a `failureHint` telling the user to
 * "re-run once before investigating". That teaches people to expect red from
 * green code, which is how a gate stops being believed. This module removes the
 * cause instead, so the ladder serialises and a red gate means red.
 *
 * WHY NOT A LOCKFILE PACKAGE
 * --------------------------
 * No new dependency. `fs.openSync(path, 'wx')` is atomic exclusive-create on
 * every platform we run (Linux/Replit is primary, Windows best-effort), and a
 * gate runner that must install its own dependencies is a gate runner that can
 * fail before it starts.
 *
 * STALE LOCKS
 * -----------
 * A crashed or SIGKILLed runner leaves the file behind. Two independent
 * conditions reclaim it: the holder's PID is gone, or it is older than
 * `staleMs`. Both are checked, because either alone has a failure mode --
 * PID reuse makes a live PID look stale-safe forever, and an age check alone
 * would steal a lock from a legitimately long run.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_STALE_MS = 20 * 60 * 1000;
const POLL_MS = 250;

/**
 * Resolve the lock directory.
 *
 * `node_modules/.cache/` is used rather than `.git/` because `.git` is a FILE in
 * a linked worktree, not a directory, and this repo is used from worktrees. It
 * is also gitignored, which matters more than it looks: the ladder explicitly
 * warns that a dirty `git status` after a run is a real finding, so writing the
 * lock into the worktree would make every run look suspicious.
 */
function lockDir(root) {
  return path.join(root, 'node_modules', '.cache', 'cadence-locks');
}

function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process (dead, reclaimable).
    // EPERM = exists but owned by another user (alive, NOT reclaimable).
    return err && err.code === 'EPERM';
  }
}

function readHolder(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    // Unreadable or truncated (holder mid-write). Treated as "unknown holder",
    // which is not itself grounds for stealing -- age still applies.
    return null;
  }
}

function describeHolder(holder, ageMs) {
  const secs = Math.round(ageMs / 1000);
  if (!holder) return 'holder unknown, ' + secs + 's old';
  const who = holder.host === os.hostname() ? 'this machine' : 'host ' + holder.host;
  return 'pid ' + holder.pid + ' on ' + who + ', ' + secs + 's old';
}

function tryCreate(lockPath, payload) {
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch (err) {
    if (err && err.code === 'EEXIST') return null;
    throw err;
  }
  try {
    fs.writeSync(fd, JSON.stringify(payload));
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

function sleep(ms) {
  // Synchronous by design: this module is used from a synchronous runner.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Acquire an exclusive lock, waiting for a concurrent holder.
 *
 * @param {object} opts
 * @param {string} opts.root     Repository root.
 * @param {string} opts.name     Lock name (one file per contended resource).
 * @param {number} [opts.timeoutMs]  Give up after this long.
 * @param {number} [opts.staleMs]    Reclaim a lock older than this.
 * @param {boolean} [opts.noWait]    Fail immediately instead of waiting.
 * @param {(msg: string) => void} [opts.onWait]  Progress reporter.
 * @returns {() => void} release function. Idempotent.
 */
function acquire(opts) {
  const root = opts.root;
  const name = opts.name;
  const timeoutMs = opts.timeoutMs == null ? DEFAULT_TIMEOUT_MS : opts.timeoutMs;
  const staleMs = opts.staleMs == null ? DEFAULT_STALE_MS : opts.staleMs;
  const noWait = !!opts.noWait;
  const onWait = opts.onWait || function () {};

  const dir = lockDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, name + '.lock');
  const payload = { pid: process.pid, startedAt: Date.now(), host: os.hostname() };

  const startedWait = Date.now();
  let announced = false;
  let stolen = false;

  for (;;) {
    if (tryCreate(lockPath, payload)) {
      if (announced) onWait('acquired the lock.');
      return makeRelease(lockPath);
    }

    let stat;
    try {
      stat = fs.statSync(lockPath);
    } catch {
      continue; // Holder released between create attempt and stat; retry.
    }

    const age = Date.now() - stat.mtimeMs;
    const holder = readHolder(lockPath);
    const dead = holder && !isProcessAlive(holder.pid);

    if (age > staleMs || dead) {
      const why = dead
        ? 'holder pid ' + holder.pid + ' is no longer running'
        : 'lock is ' + Math.round(age / 1000) + 's old (limit ' + Math.round(staleMs / 1000) + 's)';
      onWait('reclaiming stale lock: ' + why + '.');
      // Only steal once. If another waiter wins the race we keep waiting
      // normally rather than thrashing unlink/create against each other.
      if (!stolen) {
        stolen = true;
        try {
          fs.unlinkSync(lockPath);
        } catch {
          /* lost the race; the loop re-reads current state */
        }
        continue;
      }
    }

    if (noWait) {
      const err = new Error(
        'Build lock "' + name + '" is held by ' + describeHolder(holder, age) +
        '. Pass without --no-lock-wait to queue behind it.',
      );
      err.code = 'ELOCKED';
      throw err;
    }

    if (Date.now() - startedWait > timeoutMs) {
      throw new Error(
        'Timed out after ' + Math.round(timeoutMs / 1000) + 's waiting for build lock "' +
        name + '", held by ' + describeHolder(holder, age) +
        '. If no build is running, delete ' + lockPath + '.',
      );
    }

    if (!announced) {
      announced = true;
      onWait('another verification run holds this tree (' + describeHolder(holder, age) + ').');
      onWait('waiting for it to finish -- concurrent builds cause FALSE gate results.');
    }
    sleep(POLL_MS);
  }
}

function makeRelease(lockPath) {
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Already gone (stale reclaimer, or manual cleanup). Nothing to do.
    }
  };
}

module.exports = { acquire, lockDir, isProcessAlive };
