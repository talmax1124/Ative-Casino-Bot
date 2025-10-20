-- Database Schema for UAS-Standalone-Bot Cog Management
-- Execute this in your MariaDB database to create the necessary tables

-- Table to track cog (command category) status per guild
CREATE TABLE IF NOT EXISTS cog_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    cog_name VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(20) DEFAULT NULL,
    UNIQUE KEY unique_guild_cog (guild_id, cog_name),
    INDEX idx_guild_id (guild_id),
    INDEX idx_cog_name (cog_name),
    INDEX idx_enabled (enabled)
) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table to track individual command status per guild
CREATE TABLE IF NOT EXISTS command_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    command_name VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    disabled_by_cog BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(20) DEFAULT NULL,
    UNIQUE KEY unique_guild_command (guild_id, command_name),
    INDEX idx_guild_id (guild_id),
    INDEX idx_command_name (command_name),
    INDEX idx_enabled (enabled),
    INDEX idx_disabled_by_cog (disabled_by_cog)
) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table to log cog update activities
CREATE TABLE IF NOT EXISTS cog_update_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    cog_name VARCHAR(50) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'UPDATE', 'ROLLBACK', 'BACKUP'
    success BOOLEAN NOT NULL,
    error_message TEXT DEFAULT NULL,
    backup_path VARCHAR(255) DEFAULT NULL,
    github_commit_hash VARCHAR(40) DEFAULT NULL,
    updated_by VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_guild_id (guild_id),
    INDEX idx_cog_name (cog_name),
    INDEX idx_action (action),
    INDEX idx_success (success),
    INDEX idx_updated_by (updated_by),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table to store cog backup metadata
CREATE TABLE IF NOT EXISTS cog_backups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cog_name VARCHAR(50) NOT NULL,
    backup_name VARCHAR(100) NOT NULL,
    backup_path VARCHAR(255) NOT NULL,
    file_count INT NOT NULL DEFAULT 0,
    backup_size_bytes BIGINT DEFAULT NULL,
    description TEXT DEFAULT NULL,
    created_by VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cog_name (cog_name),
    INDEX idx_backup_name (backup_name),
    INDEX idx_created_by (created_by),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table to track authorized cog managers
CREATE TABLE IF NOT EXISTS cog_managers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL UNIQUE,
    username VARCHAR(100) DEFAULT NULL,
    permissions JSON DEFAULT NULL, -- Store specific permissions as JSON
    added_by VARCHAR(20) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_action_at TIMESTAMP NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    INDEX idx_user_id (user_id),
    INDEX idx_active (active),
    INDEX idx_added_by (added_by)
) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default authorized managers
INSERT INTO cog_managers (user_id, username, permissions, added_by) VALUES 
('466050111680544798', 'Main Developer', '{"all": true, "admin": true, "cogs": true, "bans": true}', 'SYSTEM'),
('1326438668591829068', 'Authorized Manager 1', '{"cogs": true, "updates": true}', '466050111680544798'),
('1399233099224846460', 'Authorized Manager 2', '{"cogs": true, "updates": true}', '466050111680544798')
ON DUPLICATE KEY UPDATE 
    username = VALUES(username),
    permissions = VALUES(permissions);

-- View to get cog status with command counts
CREATE OR REPLACE VIEW cog_status_summary AS
SELECT 
    cs.guild_id,
    cs.cog_name,
    cs.enabled as cog_enabled,
    COUNT(cmd.command_name) as total_commands,
    SUM(CASE WHEN cmd.enabled = true THEN 1 ELSE 0 END) as enabled_commands,
    SUM(CASE WHEN cmd.enabled = false AND cmd.disabled_by_cog = true THEN 1 ELSE 0 END) as disabled_by_cog,
    SUM(CASE WHEN cmd.enabled = false AND cmd.disabled_by_cog = false THEN 1 ELSE 0 END) as manually_disabled,
    cs.updated_at as last_updated
FROM cog_status cs
LEFT JOIN command_status cmd ON cs.guild_id = cmd.guild_id
GROUP BY cs.guild_id, cs.cog_name, cs.enabled, cs.updated_at;

-- View to get update history with details
CREATE OR REPLACE VIEW cog_update_history AS
SELECT 
    cul.id,
    cul.guild_id,
    cul.cog_name,
    cul.action,
    cul.success,
    cul.error_message,
    cul.github_commit_hash,
    cul.updated_by,
    cul.created_at,
    cm.username as updated_by_username
FROM cog_update_logs cul
LEFT JOIN cog_managers cm ON cul.updated_by = cm.user_id
ORDER BY cul.created_at DESC;

-- Triggers to maintain data consistency

-- Trigger to auto-update command status when cog is disabled
DELIMITER //
CREATE TRIGGER cog_status_update_commands 
AFTER UPDATE ON cog_status
FOR EACH ROW
BEGIN
    IF NEW.enabled = FALSE AND OLD.enabled = TRUE THEN
        -- Cog was disabled, disable all its commands
        UPDATE command_status 
        SET enabled = FALSE, disabled_by_cog = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = NEW.guild_id 
        AND command_name IN (
            SELECT command_name FROM (
                -- Define cog command mappings here
                SELECT 'blackjack' as command_name WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'slots' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'roulette' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'crash' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'plinko' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'mines' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'keno' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'ceelo' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'bingo' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'lottery' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'multi-slots' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'russianroulette' WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'scratch' WHERE NEW.cog_name = 'games'
                -- Economy commands
                UNION ALL SELECT 'balance' WHERE NEW.cog_name = 'economy'
                UNION ALL SELECT 'deposit' WHERE NEW.cog_name = 'economy'
                UNION ALL SELECT 'withdraw' WHERE NEW.cog_name = 'economy'
                UNION ALL SELECT 'sendmoney' WHERE NEW.cog_name = 'economy'
                UNION ALL SELECT 'buymoney' WHERE NEW.cog_name = 'economy'
                UNION ALL SELECT 'shop' WHERE NEW.cog_name = 'economy'
                UNION ALL SELECT 'rewards' WHERE NEW.cog_name = 'economy'
                -- Add other cog mappings as needed
            ) AS cog_commands
        );
    ELSEIF NEW.enabled = TRUE AND OLD.enabled = FALSE THEN
        -- Cog was enabled, enable commands that were disabled by cog
        UPDATE command_status 
        SET enabled = TRUE, disabled_by_cog = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = NEW.guild_id 
        AND disabled_by_cog = TRUE
        AND command_name IN (
            SELECT command_name FROM (
                -- Same cog command mappings as above
                SELECT 'blackjack' as command_name WHERE NEW.cog_name = 'games'
                UNION ALL SELECT 'slots' WHERE NEW.cog_name = 'games'
                -- ... (same as above)
            ) AS cog_commands
        );
    END IF;
END//
DELIMITER ;

-- Grant appropriate permissions for the casino bot user
-- Replace 'casino_bot' with your actual database user
GRANT SELECT ON cog_status TO 'casino_bot'@'%';
GRANT SELECT ON command_status TO 'casino_bot'@'%';
GRANT SELECT ON cog_status_summary TO 'casino_bot'@'%';

-- Grant full permissions for UAS bot user (you'll need to create this user)
-- CREATE USER 'uas_bot'@'%' IDENTIFIED BY 'your_uas_bot_password';
-- GRANT ALL PRIVILEGES ON *.* TO 'uas_bot'@'%';

-- Indexes for performance
CREATE INDEX idx_command_status_lookup ON command_status (guild_id, command_name, enabled);
CREATE INDEX idx_cog_status_lookup ON cog_status (guild_id, cog_name, enabled);

-- Insert default cog categories for all existing guilds
INSERT IGNORE INTO cog_status (guild_id, cog_name, enabled) 
SELECT DISTINCT server_id as guild_id, 'games' as cog_name, TRUE as enabled FROM server_config
UNION ALL
SELECT DISTINCT server_id as guild_id, 'economy' as cog_name, TRUE as enabled FROM server_config
UNION ALL
SELECT DISTINCT server_id as guild_id, 'earn' as cog_name, TRUE as enabled FROM server_config
UNION ALL
SELECT DISTINCT server_id as guild_id, 'social' as cog_name, TRUE as enabled FROM server_config
UNION ALL
SELECT DISTINCT server_id as guild_id, 'utility' as cog_name, TRUE as enabled FROM server_config;