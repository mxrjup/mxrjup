const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const {
    parseDailyTime, msUntilNext, scheduleDaily, runBackupScript
} = require('../backupSchedule');

const MINUTE = 60 * 1000;

test('parseDailyTime reads HH:MM and refuses the rest', () => {
    assert.deepEqual(parseDailyTime('03:30'), { hour: 3, minute: 30 });
    assert.deepEqual(parseDailyTime('3:05'), { hour: 3, minute: 5 });
    assert.deepEqual(parseDailyTime(' 23:59 '), { hour: 23, minute: 59 });
    for (const bad of ['24:00', '3h30', '03:60', '', 'nightly', '03:30:00']) {
        assert.throws(() => parseDailyTime(bad), /HH:MM/, bad);
    }
});

test('msUntilNext is later today, or tomorrow once the time has passed', () => {
    const at = { hour: 3, minute: 30 };
    assert.equal(msUntilNext(at, new Date(2026, 8, 21, 3, 0)), 30 * MINUTE);
    assert.equal(msUntilNext(at, new Date(2026, 8, 21, 3, 30)), 24 * 60 * MINUTE);
    assert.equal(msUntilNext(at, new Date(2026, 8, 21, 4, 0)), (24 * 60 - 30) * MINUTE);
});

test('scheduleDaily runs once per day, rescheduling after each run', async () => {
    let clock = new Date(2026, 8, 21, 12, 0);
    const timers = [];
    let runs = 0;
    const schedule = scheduleDaily({
        at: '03:30',
        run: async () => { runs += 1; },
        now: () => clock,
        setTimer: (fn, ms) => {
            timers.push({ fn, ms });
            return { unref() {} };
        }
    });

    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, (15 * 60 + 30) * MINUTE);

    clock = new Date(2026, 8, 22, 3, 30, 5);
    await timers[0].fn();
    assert.equal(runs, 1);
    assert.equal(timers.length, 2);
    // Scheduled from the clock after the run: tomorrow night, not a second run now.
    assert.equal(timers[1].ms, 24 * 60 * MINUTE - 5000);

    schedule.stop();
});

test('a failed run still schedules the next night', async () => {
    const timers = [];
    const errors = [];
    scheduleDaily({
        at: '03:30',
        run: async () => { throw new Error('boom'); },
        now: () => new Date(2026, 8, 21, 12, 0),
        setTimer: (fn, ms) => {
            timers.push({ fn, ms });
            return {};
        },
        log: { error: (l) => errors.push(l) }
    });
    await timers[0].fn();
    assert.deepEqual(errors, ['BACKUP FAILED: boom']);
    assert.equal(timers.length, 2);
});

test('runBackupScript passes VISITORS_DIR and node, and logs every line', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mxrjup-backup-run-'));
    try {
        const script = path.join(dir, 'fake-backup.sh');
        await fs.writeFile(script, [
            'echo "dir=$VISITORS_DIR"',
            '"$NODE_BIN" -e "console.log(\'node ok\')"',
            'echo "BACKUP FAILED: on purpose" >&2',
            'exit 3'
        ].join('\n'));
        const lines = [];
        const errors = [];
        const code = await runBackupScript({
            script,
            visitorsDir: '/somewhere/visitors',
            log: { log: (l) => lines.push(l), error: (l) => errors.push(l) }
        });
        assert.equal(code, 3);
        // stdout and stderr are separate pipes, so only the set of lines is certain.
        assert.deepEqual(lines.sort(), [
            '[backup] BACKUP FAILED: on purpose',
            '[backup] dir=/somewhere/visitors',
            '[backup] node ok'
        ]);
        assert.deepEqual(errors, ['[backup] exited with code 3']);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});
