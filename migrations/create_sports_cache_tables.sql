-- Sports data caching and API management tables

-- Cache for sports game data
CREATE TABLE IF NOT EXISTS sports_games_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sport VARCHAR(50) NOT NULL,
    league VARCHAR(100) NOT NULL,
    game_id VARCHAR(255) NOT NULL UNIQUE,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    commence_time DATETIME NOT NULL,
    home_odds DECIMAL(10, 2),
    away_odds DECIMAL(10, 2),
    draw_odds DECIMAL(10, 2),
    spread_home DECIMAL(10, 2),
    spread_away DECIMAL(10, 2),
    total_over DECIMAL(10, 2),
    total_under DECIMAL(10, 2),
    raw_data JSON,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    
    INDEX idx_sport_league (sport, league),
    INDEX idx_commence_time (commence_time),
    INDEX idx_expires_at (expires_at),
    INDEX idx_cached_at (cached_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- API usage tracking table
CREATE TABLE IF NOT EXISTS api_usage_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    api_key_index INT NOT NULL DEFAULT 1, -- 1 for primary, 2 for secondary
    request_count INT NOT NULL DEFAULT 0,
    month_year VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    last_request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reset_at TIMESTAMP NOT NULL,
    
    UNIQUE KEY unique_month_key (month_year, api_key_index),
    INDEX idx_month_year (month_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- API key configuration
CREATE TABLE IF NOT EXISTS api_keys_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service VARCHAR(50) NOT NULL,
    key_index INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    monthly_limit INT DEFAULT 500,
    current_usage INT DEFAULT 0,
    last_reset DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_service_index (service, key_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Initialize API key configurations
INSERT INTO api_keys_config (service, key_index, monthly_limit, last_reset) 
VALUES 
    ('odds_api', 1, 500, CURDATE()),
    ('odds_api', 2, 500, CURDATE())
ON DUPLICATE KEY UPDATE id = id;