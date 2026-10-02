// const cron = require("node-cron");
// const db = require("../config/supabase");

// // Every day at midnight
// cron.schedule("0 0 * * *", async () => {


//     try {

//         await db.execute(`

//             DELETE FROM SensorReadings
//             WHERE timestamp < NOW() - INTERVAL 7 DAY

//         `);


//     } catch (err) {

//         console.error(err);

//     }

// });