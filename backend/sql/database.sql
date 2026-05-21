DROP DATABASE IF EXISTS firebomba_db;

CREATE DATABASE firebomba_db;

USE firebomba_db;



-- 2. Rooms Table
-- Associated with Users (1..1 relationship based on the diagram line)
CREATE TABLE IF NOT EXISTS Rooms (
    room_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    status VARCHAR(50),
    last_updated DATETIME,
    camera_enabled BOOLEAN DEFAULT 0,
);

INSERT INTO Rooms (name, status, last_updated) VALUES ("Room 1", "Active", NOW());


CREATE TABLE IF NOT EXISTS Users(
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    email VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(50) NOT NULL,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);

-- 3. SensorReadings Table
CREATE TABLE IF NOT EXISTS SensorReadings (
    reading_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    flame_detected BOOLEAN,
    temperature FLOAT,
    humidity FLOAT,
    smoke FLOAT,
    co FLOAT,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);

-- 4. Actuators Table
CREATE TABLE IF NOT EXISTS Actuators (
    actuator_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(50),
    activated_status BOOLEAN,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);

-- 5. Camera Table
CREATE TABLE IF NOT EXISTS Camera (
    camera_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    stream_url VARCHAR(50),
    status VARCHAR(50),
    is_online BOOLEAN,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);

-- 6. CameraLogs Table
CREATE TABLE IF NOT EXISTS CameraLogs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    camera_id INT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    label VARCHAR(50),
    confidence FLOAT,
    FOREIGN KEY (camera_id) REFERENCES Camera(camera_id) ON DELETE CASCADE
);

-- 7. AlertNotification Table
CREATE TABLE IF NOT EXISTS AlertNotification (
    alert_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    warning_title VARCHAR(50), -- Example Enum values
    is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS RefreshTokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(512) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS SensorAggregates (

    aggregate_id INT PRIMARY KEY AUTO_INCREMENT,

    room_id INT NOT NULL,

    window_start DATETIME,
    window_end DATETIME,

    avg_temperature FLOAT,
    max_temperature FLOAT,

    avg_humidity FLOAT,

    avg_smoke FLOAT,
    max_smoke FLOAT,

    avg_co FLOAT,
    max_co FLOAT,

    flame_trigger_count INT,

    total_readings INT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (room_id)
    REFERENCES Rooms(room_id)
    ON DELETE CASCADE
);
