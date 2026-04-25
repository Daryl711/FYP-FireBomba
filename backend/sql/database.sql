CREATE DATABASE IF NOT EXISTS firebomba_db;
USE firebomba_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'normal',
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS temperature_sensor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    warning_threshold FLOAT NOT NULL DEFAULT 60.0,
    status VARCHAR(50) DEFAULT 'normal',
    is_online BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS smoke_sensor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    warning_threshold FLOAT NOT NULL DEFAULT 300.0,
    status VARCHAR(50) DEFAULT 'normal',
    is_online BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gas_sensor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    warning_threshold FLOAT NOT NULL DEFAULT 500.0,
    status VARCHAR(50) DEFAULT 'normal',
    is_online BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flame_sensor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    status VARCHAR(50) DEFAULT 'normal',
    is_online BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS camera (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    stream_url VARCHAR(255),
    status VARCHAR(50) DEFAULT 'normal',
    is_online BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS water_pump (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    status VARCHAR(50) DEFAULT 'off',
    is_online BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- sensor_type tells which sensor table the sensor_id refers to
CREATE TABLE IF NOT EXISTS sensor_reading (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sensor_id INT NOT NULL,
    sensor_type ENUM('temperature', 'smoke', 'gas') NOT NULL,
    value FLOAT NOT NULL,
    unit VARCHAR(20),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS camera_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    camera_id INT NOT NULL,
    label VARCHAR(100),
    confidence FLOAT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (camera_id) REFERENCES camera(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pump_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pump_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    triggered_by VARCHAR(100),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pump_id) REFERENCES water_pump(id) ON DELETE CASCADE
);
