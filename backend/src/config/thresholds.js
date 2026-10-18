// Readings at or above these raise a warning alert. Shown read-only in the
// app's System Settings; only an admin changes them, here.
module.exports = {
  temperature: 60.0, // °C
  smoke: 300.0, // ppm
  gas: 500.0, // ppm (the sensor_readings "co" column)
};
