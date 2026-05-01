const cron = require("node-cron");
const db = require("../config/database");

cron.schedule("* * * * *", async () => {
  console.log("Running aggregation job...");

  try {
    const [rows] = await db.execute(`

    SELECT 
          room_id,
          AVG(temperature) AS avg_temperature,
          MAX(temperature) AS max_temperature,
          AVG(smoke) AS avg_smoke,
          MAX(smoke) AS max_smoke,
          AVG(co) AS avg_co,
          MAX(co) AS max_co,
          AVG(humidity) AS avg_humidity,
          COUNT(*) AS total_readings,
          SUM(flame_detected = TRUE) AS flame_trigger_count,
          DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:00') AS window_start,
          DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:59') AS window_end
        FROM SensorReadings
        WHERE timestamp >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:00'), INTERVAL 1 MINUTE)
          AND timestamp < DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:00')
        GROUP BY room_id, window_start  
      `);

    for (const row of rows) {
      await db.execute(
        `

                INSERT IGNORE INTO SensorAggregates
                (
                    room_id,

                    avg_temperature,
                    max_temperature,

                    avg_smoke,
                    max_smoke,
                    avg_co,
                    max_co,

                    avg_humidity,

                    total_readings,

                    flame_trigger_count,
                

                    window_start,
                    window_end
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

            `,
        [
          row.room_id,

          row.avg_temperature,
          row.max_temperature,

          row.avg_smoke,
          row.max_smoke,
          row.avg_co,
          row.max_co,

          row.avg_humidity,

          row.total_readings,

          row.flame_trigger_count,

          row.window_start,
          row.window_end,
        ],
      );
    }

    console.log("Aggregation complete");
  } catch (err) {
    console.error(err);
  }
});
