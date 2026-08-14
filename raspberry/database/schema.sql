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

