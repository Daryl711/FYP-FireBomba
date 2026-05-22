DROP DATABASE IF EXISTS firebomba_db;
CREATE DATABASE firebomba_db;
USE firebomba_db;

-- 1. Rooms Table
-- Associated with Users (1..1 relationship based on the diagram line)
CREATE TABLE IF NOT EXISTS Rooms (
    room_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    status VARCHAR(50),
    last_updated DATETIME,
    camera_enabled BOOLEAN DEFAULT 0
);
INSERT INTO Rooms (room_id, name, status, last_updated, camera_enabled)
VALUES (1, "Room 1", "0", NOW(), 1),
       (2, "Kitchen", "0", NOW(), 1),
       (3, "Room 2", "1", NOW(), 0);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS Users(
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    email VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);
-- Insert Users Data
INSERT IGNORE INTO Users (
        user_id,
        room_id,
        email,
        password,
        full_name,
        role,
        created_at
    )
VALUES (
        1,
        1,
        'admin@gmail.com',
        '$2a$10$Ws5hhCulP8GlpEI3Lwx0M.hbpjfxAJ0EFiVhCGcSRk.V8Ma9M8uTS',
        'Admin User',
        'Admin',
        NOW()
    ),
    (
        2,
        1,
        'test@gmail.com',
        '$2a$10$fkfQZ9YHaotEPPlZ6jkOc.XaV895.bNAMY2DEDLbVMB8kFa0FXjjm',
        'Test User',
        'User',
        NOW()
    ),
    (
        3,
        2,
        'test2@gmail.com',
        '$2a$10$WY6bPepmZ3oPQ2lJcyWs1e4LLJz76yEpJmrsMUwr4BsxJ7LeeTa4m',
        'Test User 2',
        'User',
        NOW()
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
    warning_title VARCHAR(50),
    -- Example Enum values
    is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);
INSERT INTO AlertNotification (
        alert_id,
        room_id,
        timestamp,
        warning_title,
        is_read
    )
VALUES (
        1,
        1,
        NOW(),
        'High Temperature Detected',
        FALSE
    );

-- 8. RefreshTokens Table
CREATE TABLE IF NOT EXISTS RefreshTokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(512) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- 9. SensorAggregates Table
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
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);

-- 10. Admin Sensor Table
CREATE TABLE IF NOT EXISTS AdminSensor (
    sensor_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    sensor_type VARCHAR(50),
    status BOOLEAN DEFAULT TRUE,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);

INSERT INTO AdminSensor (sensor_id, room_id, sensor_type, status, last_updated)
VALUES
    (1, 1, 'Temperature', TRUE, NOW()),
    (2, 1, 'Humidity', TRUE, NOW()),
    (3, 1, 'Smoke', TRUE, NOW()),
    (4, 1, 'CO', TRUE, NOW()),
    (5, 1, 'Flame', TRUE, NOW()),
    (6, 2, 'Temperature', TRUE, NOW()),
    (7, 2, 'Humidity', FALSE, NOW()),
    (8, 2, 'Smoke', TRUE, NOW()),
    (9, 2, 'CO', TRUE, NOW()),
    (10, 2, 'Flame', TRUE, NOW()),
    (11, 3, 'Temperature', TRUE, NOW()),
    (12, 3, 'Humidity', TRUE, NOW()),
    (13, 3, 'Smoke', FALSE, NOW()),
    (14, 3, 'CO', TRUE, NOW()),
    (15, 3, 'Flame', TRUE, NOW());