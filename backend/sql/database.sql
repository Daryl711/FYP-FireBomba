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
    email VARCHAR(50) DEFAULT NULL UNIQUE,
    phone VARCHAR(20) DEFAULT NULL UNIQUE,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);
-- Insert Users Data
-- NOTE: original passwords unknown, all regenerated:
--   admin@gmail.com -> Admin123!
--   test@gmail.com  -> Test123!
--   test2@gmail.com -> Test2123!
INSERT IGNORE INTO Users (
        user_id,
        room_id,
        email,
        phone,
        password,
        full_name,
        role,
        created_at
    )
VALUES (
        1,
        1,
        'admin@gmail.com',
        '+60111000001',
        '$2a$10$ErgXJL1aT.A9A1EK54fMNOtfL3wMRh4ngEWkq9Pdu7mru7oz/viZq',
        'Admin User',
        'Admin',
        NOW()
    ),
    (
        2,
        1,
        'test@gmail.com',
        '+60111000002',
        '$2a$10$Nqi6BhvHIDCKaR4GfssZyOlmSBv3BPB70CdSo9BEj2Qi1j.aDfGri',
        'Test User',
        'User',
        NOW()
    ),
    (
        3,
        2,
        'test2@gmail.com',
        '+60111000003',
        '$2a$10$sWesFoary2aSeXym63i.eeu7oDMlPlivAbirmGa4ht9jgergNsGH.',
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
    waterpump_enabled BOOLEAN DEFAULT FALSE,
    activated_status BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);
INSERT INTO Actuators (actuator_id, room_id, last_updated, waterpump_enabled, activated_status)
VALUES(1, 1, NOW(), FALSE, FALSE),
      (2, 2, NOW(), TRUE, FALSE),
      (3, 3, NOW(), TRUE, TRUE);

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

-- 10. Audit Log Table
CREATE TABLE IF NOT EXISTS AuditLog (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    performed_by VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    sensor_id INT,
    sensor_type VARCHAR(50),
    room_name VARCHAR(50),
    details VARCHAR(255),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. Admin Sensor Table
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

-- 12. User notification table (since each notification can be seen by multiple users)
CREATE TABLE IF NOT EXISTS UserNotification
(
    user_notification_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    alert_id INT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    is_hidden BOOLEAN DEFAULT FALSE,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (alert_id) REFERENCES AlertNotification(alert_id) ON DELETE CASCADE
);

-- 13. OtpCodes table (SMS one-time passwords: login 2FA + password reset)
--     Codes are stored HASHED, never in plaintext.
CREATE TABLE IF NOT EXISTS OtpCodes (
    otp_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    destination VARCHAR(20) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    INDEX idx_otp_user_purpose (user_id, purpose, consumed_at)
);
