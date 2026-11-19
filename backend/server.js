const app = require('./src/app');
const dotenv = require('dotenv');
const WhatsappNotifyService = require('./src/services/whatsappNotifyService');
const RetentionService = require('./src/services/retentionService');

dotenv.config();

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Recover PENDING notify rows whose in-memory retry timers died with a
    // previous process (and any that stalled), then keep a slow safety-net
    // sweep running for the life of the process.
    WhatsappNotifyService.sweepPending().catch(() => {});
    const sweep = setInterval(() => {
        WhatsappNotifyService.sweepPending().catch(() => {});
    }, 5 * 60 * 1000);
    if (typeof sweep.unref === 'function') sweep.unref();

    // Retention purge (7-day junked leads) — opt-in via env so dev/CI never
    // delete data unless explicitly enabled. Runs hourly; idempotent.
    if (process.env.ENABLE_RETENTION_PURGE === 'true') {
        const runPurge = () => RetentionService.runPurge().catch((e) => console.error('[retention] purge error:', e && e.message));
        runPurge();
        const purgeTimer = setInterval(runPurge, 60 * 60 * 1000);
        if (typeof purgeTimer.unref === 'function') purgeTimer.unref();
    }
});
