const cron = require("node-cron");
const db = require("../config/database");
const OtpCode = require("../models/OtpCode");

// Every day at midnight
cron.schedule("0 0 * * *", async () => {


    try {

        await db.execute(`

            DELETE FROM SensorReadings
            WHERE timestamp < NOW() - INTERVAL 7 DAY

        `);

        await OtpCode.deleteExpired();


    } catch (err) {

        console.error(err);

    }

});