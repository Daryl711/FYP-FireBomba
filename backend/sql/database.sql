-- Drop tables if they exist (in reverse order of dependencies)
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Sessions;
DROP TABLE IF EXISTS LoginAttempts;

-- Users Table - Core account & login table
CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Sessions Table - Track active login sessions
CREATE TABLE Sessions (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- LoginAttempts Table - Security: track failed logins
CREATE TABLE LoginAttempts (
    attempt_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    success BOOLEAN NOT NULL DEFAULT FALSE,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- Indexes for performance
===========================================
CREATE INDEX idx_sessions_user_id ON Sessions(user_id);
CREATE INDEX idx_sessions_token ON Sessions(token);
CREATE INDEX idx_login_attempts_email ON LoginAttempts(email);
CREATE INDEX idx_login_attempts_ip ON LoginAttempts(ip_address);
===========================================

INSERT INTO Users (username, email, password_hash, role)
VALUES (
    'admin',
    'admin@firebomba.com',
    '$2b$10$PLACEHOLDER_HASH_REPLACE_WITH_REAL_BCRYPT_HASH',
    'admin'
);