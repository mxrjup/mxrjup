const { spawn } = require('child_process');

/**
 * The nightly backup of the visitor data (scripts/backup-visitors.sh), started by the
 * server itself: Infomaniak's Node.js sites have no crontab to run it from. The script
 * does the work and its own locking; this only decides when, and passes its output to
 * the server log, where a failure shows as "BACKUP FAILED".
 */

/** "03:30" -> { hour: 3, minute: 30 }. Anything else is a configuration mistake. */
function parseDailyTime(value) {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value).trim());
    if (!match) throw new Error(`VISITORS_BACKUP_AT must be HH:MM (24 h), not "${value}"`);
    return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** Milliseconds from `now` to the next hour:minute of the host's local time. */
function msUntilNext({ hour, minute }, now = new Date()) {
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
}

/**
 * Run `run` every day at `at`. Each run is scheduled from the clock when the previous
 * one ends, so a long run or a clock change never makes the next one fire twice, and
 * a failed run is logged and the next night still comes. The timer does not keep the
 * process alive on its own.
 */
function scheduleDaily({
    at, run, now = () => new Date(), setTimer = setTimeout, log = console
}) {
    const time = parseDailyTime(at);
    let timer = null;
    let stopped = false;

    function arm() {
        if (stopped) return;
        timer = setTimer(async () => {
            try {
                await run();
            } catch (err) {
                // A rejection escaping a timer would take the whole server down.
                log.error(`BACKUP FAILED: ${err.message}`);
            } finally {
                arm();
            }
        }, msUntilNext(time, now()));
        if (timer && timer.unref) timer.unref();
    }

    arm();
    return {
        stop() {
            stopped = true;
            clearTimeout(timer);
        }
    };
}

/**
 * Run the backup script with the server's VISITORS_DIR and its own node binary (the
 * script parses the JSON with node, and a process started by the host may not have it
 * on its PATH). Every output line goes to the log; resolves to the exit code.
 */
function runBackupScript({ script, visitorsDir, log = console, env = process.env }) {
    return new Promise((resolve) => {
        const child = spawn('bash', [script], {
            env: { ...env, VISITORS_DIR: visitorsDir, NODE_BIN: process.execPath },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const forward = (chunk) => {
            for (const line of String(chunk).split('\n')) {
                if (line.trim()) log.log(`[backup] ${line}`);
            }
        };
        child.stdout.on('data', forward);
        child.stderr.on('data', forward);
        child.on('error', (err) => {
            log.error(`[backup] BACKUP FAILED: cannot start ${script}: ${err.message}`);
            resolve(1);
        });
        child.on('close', (code) => {
            if (code !== 0) log.error(`[backup] exited with code ${code}`);
            resolve(code);
        });
    });
}

module.exports = { parseDailyTime, msUntilNext, scheduleDaily, runBackupScript };
