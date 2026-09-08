const cron = require("node-cron");
const db = require("../config/database");

// Every day at midnight
cron.schedule("0 0 * * *", async () => {


    try {

        await db.execute(`

            DELETE FROM SensorReadings
            WHERE timestamp < NOW() - INTERVAL 7 DAY

        `);

        // Sessions past their deadline are already refused at /refresh, but
        // nothing was deleting the rows - they pile up one per unlock.
        const [expiredSessions] = await db.execute(`

            DELETE FROM RefreshTokens
            WHERE expires_at < NOW()

        `);

        if (expiredSessions.affectedRows > 0) {
            console.log(`Cleanup: removed ${expiredSessions.affectedRows} expired session(s)`);
        }


    } catch (err) {

        console.error(err);

    }

});