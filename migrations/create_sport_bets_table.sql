-- Create sport_bets table for tracking sports betting
CREATE TABLE IF NOT EXISTS sport_bets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(255) NOT NULL,
    sport VARCHAR(50) NOT NULL,
    game_id VARCHAR(255) NOT NULL,
    game_name VARCHAR(500) NOT NULL,
    selection VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL,
    odds DECIMAL(10, 2) NOT NULL,
    payout BIGINT DEFAULT 0,
    status ENUM('pending', 'live', 'won', 'lost', 'cancelled') DEFAULT 'pending',
    result VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_user_guild (user_id, guild_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_game_id (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Add sport betting stats to user_stats if not exists
ALTER TABLE user_stats 
ADD COLUMN IF NOT EXISTS sport_bets_placed INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS sport_bets_won INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS sport_bet_profit BIGINT DEFAULT 0;