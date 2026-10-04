-- 1. Rooms Table (associated with device_id which indicates the identity of ESP32)

CREATE TABLE IF NOT EXISTS Rooms ( 
  room_id INT PRIMARY KEY AUTO_INCREMENT, 
  device_id VARCHAR(50) UNIQUE NOT NULL, 
  last_updated DATETIME 
);

-- 2. Sensor Readings Table (to be synced to the cloud)
CREATE TABLE IF NOT EXISTS SensorReadings (
  reading_id INT PRIMARY KEY AUTO_INCREMENT,
  room_id INT NOT NULL,
  reading_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  flame_detected BOOLEAN,
  temperature FLOAT,
  humidity FLOAT,
  smoke FLOAT,
  co FLOAT,
  cloud_sync_status ENUM('PENDING', 'SYNCED', 'FAILED')
      DEFAULT 'PENDING',
  cloud_synced_at DATETIME NULL,
  FOREIGN KEY (room_id)
      REFERENCES Rooms(room_id)
      ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS SensorAggregates (
  aggregate_id INT PRIMARY KEY AUTO_INCREMENT,
  room_id INT NOT NULL,
  window_start DATETIME NOT NULL,
  window_end DATETIME NOT NULL,
  avg_temperature FLOAT,
  avg_smoke FLOAT,
  avg_co FLOAT,
  avg_humidity FLOAT,
  cloud_sync_status ENUM('PENDING', 'SYNCED', 'FAILED')
      DEFAULT 'PENDING',
  cloud_synced_at DATETIME NULL,
  cloud_sync_attempted_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_room_window (room_id, window_start),
  FOREIGN KEY (room_id)
      REFERENCES Rooms(room_id)
      ON DELETE CASCADE
);

-- Insert dummy room data into the table
INSERT INTO Rooms (device_id)
  VALUES
  ('ESP32_ROOM_01'),
  ('ESP32_ROOM_02'),
  ('ESP32_ROOM_03')
;
