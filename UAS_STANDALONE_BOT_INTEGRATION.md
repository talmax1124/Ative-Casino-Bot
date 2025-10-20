# UAS-Standalone-Bot Integration Guide

This document provides everything needed to implement the admin and cog management functionality in your UAS-Standalone-Bot, enabling it to manage the ATIVE Casino Bot remotely.

## Overview

The UAS-Standalone-Bot will act as the admin control center for the ATIVE Casino Bot, handling:
- Admin commands (setup, release, bot bans)
- Cog management (enable/disable commands and categories)
- Database management and monitoring
- Cross-bot communication through shared MariaDB database

## Files Moved to UAS-Standalone-Bot

### 1. Admin Commands
- **`admin.js`** - Main consolidated admin command
- **`botban.js`** - Bot ban management system
- **`setup.js`** - Server setup wizard
- **`release.js`** - Session release management
- **`reload-cog.js`** - Hot reload from GitHub

### 2. Admin Utilities
- **`setupWizard.js`** - 7-step server configuration wizard
- **`setupInteractionHandler.js`** - Setup wizard interaction handler

### 3. Cog Management System
- **`cogmanage.js`** - Cog enable/disable command
- **`cogupdater.js`** - Cog update from GitHub
- **`cogManager.js`** - Core cog management logic
- **`cogUpdater.js`** - GitHub file update system
- **`cogFileMapper.js`** - File mapping and discovery

## Database Integration

### Shared Database Configuration
Both bots must use the same MariaDB database with these environment variables:

```env
MARIADB_HOST=localhost
MARIADB_PORT=3306
MARIADB_USER=casino_bot
MARIADB_PASSWORD=your_database_password
MARIADB_DATABASE=ative_casino
```

### Key Database Tables for Cross-Bot Communication

#### 1. Bot Ban System Tables
```sql
-- This table will be created by the bot ban system
CREATE TABLE IF NOT EXISTS bot_bans (
    user_id VARCHAR(20) PRIMARY KEY,
    reason VARCHAR(100) NOT NULL,
    banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    banned_by VARCHAR(20) NOT NULL,
    ban_data JSON DEFAULT NULL
) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 2. Cog Management Tables
```sql
-- Create tables for cog management
CREATE TABLE IF NOT EXISTS cog_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    cog_name VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_guild_cog (guild_id, cog_name)
) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS command_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    command_name VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    disabled_by_cog BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_guild_command (guild_id, command_name)
) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cog_update_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cog_name VARCHAR(50) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    action VARCHAR(20) NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT DEFAULT NULL,
    updated_by VARCHAR(20) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 3. Existing Shared Tables (Already in Casino Bot)
- **`user_balances`** - User money data
- **`user_profiles`** - User profile information  
- **`server_config`** - Server configuration
- **`game_results`** - Game statistics
- **`bot_bans`** - Bot ban records

## Implementation Guide

### 1. Database Connection (UAS-Standalone-Bot)

Create a similar database adapter in UAS-Standalone-Bot:

```javascript
// UTILS/databaseAdapter.js (for UAS-Standalone-Bot)
const mysql = require('mysql2/promise');

class UASCasinoDatabaseAdapter {
    constructor() {
        this.pool = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        const config = {
            host: process.env.MARIADB_HOST,
            port: process.env.MARIADB_PORT,
            user: process.env.MARIADB_USER,
            password: process.env.MARIADB_PASSWORD,
            database: process.env.MARIADB_DATABASE,
            connectionLimit: 10,
            acquireTimeout: 60000,
            timeout: 60000,
            charset: 'utf8mb4'
        };

        this.pool = mysql.createPool(config);
        await this.testConnection();
        this.initialized = true;
    }

    async testConnection() {
        const connection = await this.pool.getConnection();
        await connection.ping();
        connection.release();
    }

    // Add methods for bot ban management
    async getBotBanStatus(userId) {
        const [rows] = await this.pool.execute(
            'SELECT * FROM bot_bans WHERE user_id = ?',
            [userId]
        );
        return rows[0] || null;
    }

    async banUser(userId, reason, bannedBy, banData = null) {
        await this.pool.execute(
            'INSERT INTO bot_bans (user_id, reason, banned_by, ban_data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), banned_by = VALUES(banned_by), ban_data = VALUES(ban_data), banned_at = CURRENT_TIMESTAMP',
            [userId, reason, bannedBy, JSON.stringify(banData)]
        );
    }

    async unbanUser(userId) {
        await this.pool.execute(
            'DELETE FROM bot_bans WHERE user_id = ?',
            [userId]
        );
    }

    // Add methods for cog management
    async getCogStatus(guildId, cogName) {
        const [rows] = await this.pool.execute(
            'SELECT enabled FROM cog_status WHERE guild_id = ? AND cog_name = ?',
            [guildId, cogName]
        );
        return rows[0]?.enabled ?? true; // Default to enabled if not found
    }

    async setCogStatus(guildId, cogName, enabled) {
        await this.pool.execute(
            'INSERT INTO cog_status (guild_id, cog_name, enabled) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)',
            [guildId, cogName, enabled]
        );
    }

    async getCommandStatus(guildId, commandName) {
        const [rows] = await this.pool.execute(
            'SELECT enabled, disabled_by_cog FROM command_status WHERE guild_id = ? AND command_name = ?',
            [guildId, commandName]
        );
        return rows[0] || { enabled: true, disabled_by_cog: false };
    }

    async setCommandStatus(guildId, commandName, enabled, disabledByCog = false) {
        await this.pool.execute(
            'INSERT INTO command_status (guild_id, command_name, enabled, disabled_by_cog) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), disabled_by_cog = VALUES(disabled_by_cog)',
            [guildId, commandName, enabled, disabledByCog]
        );
    }
}

module.exports = new UASCasinoDatabaseAdapter();
```

### 2. Bot Ban System Implementation

The bot ban system should check the shared database and enforce bans across both bots:

```javascript
// UTILS/crossBotBanSystem.js (for UAS-Standalone-Bot)
class CrossBotBanSystem {
    constructor(databaseAdapter) {
        this.db = databaseAdapter;
    }

    async checkUserBan(userId) {
        return await this.db.getBotBanStatus(userId);
    }

    async banUser(userId, reason, bannedBy, additionalData = null) {
        await this.db.banUser(userId, reason, bannedBy, additionalData);
        
        // Log the ban
        console.log(`User ${userId} banned for: ${reason} by ${bannedBy}`);
        
        // Could implement webhook notification to casino bot here
        await this.notifyCasinoBot('user_banned', { userId, reason });
    }

    async unbanUser(userId) {
        await this.db.unbanUser(userId);
        
        // Log the unban
        console.log(`User ${userId} unbanned`);
        
        // Could implement webhook notification to casino bot here
        await this.notifyCasinoBot('user_unbanned', { userId });
    }

    async notifyCasinoBot(action, data) {
        // Implementation depends on how you want to notify the casino bot
        // Options: webhooks, shared cache, database triggers, etc.
    }
}
```

### 3. Cog Management System Implementation

```javascript
// UTILS/cogManagerUAS.js (for UAS-Standalone-Bot)
class UASCogManager {
    constructor(databaseAdapter) {
        this.db = databaseAdapter;
        this.cogCategories = {
            'games': {
                name: 'Games',
                description: 'Casino games and gambling commands',
                commands: ['blackjack', 'slots', 'roulette', 'crash', 'plinko', 'mines', 'keno', 'ceelo', 'bingo', 'lottery', 'multi-slots', 'russianroulette', 'scratch']
            },
            'economy': {
                name: 'Economy',
                description: 'Money management and economy commands',
                commands: ['balance', 'deposit', 'withdraw', 'sendmoney', 'buymoney', 'shop', 'rewards']
            },
            'earn': {
                name: 'Earning Commands',
                description: 'Commands to earn money and experience',
                commands: ['work', 'crime', 'beg', 'dailytask', 'weekly', 'monthly', 'earnmoney', 'fishing', 'treasurevault']
            },
            'social': {
                name: 'Social & Fun',
                description: 'Social interaction and fun commands',
                commands: ['marriage', 'profile', 'leaderboard', 'rob', 'robstats', 'polls', 'duck', 'rps']
            },
            'utility': {
                name: 'Utility',
                description: 'General utility and information commands',
                commands: ['help', 'stats', 'userhistory', 'cooldown', 'sessionstatus', 'stopmysession', 'stopgame']
            }
        };
    }

    async enableCog(guildId, cogName) {
        await this.db.setCogStatus(guildId, cogName, true);
        
        // Enable all commands in this cog
        const cog = this.cogCategories[cogName];
        if (cog) {
            for (const command of cog.commands) {
                await this.db.setCommandStatus(guildId, command, true, false);
            }
        }
    }

    async disableCog(guildId, cogName) {
        await this.db.setCogStatus(guildId, cogName, false);
        
        // Disable all commands in this cog
        const cog = this.cogCategories[cogName];
        if (cog) {
            for (const command of cog.commands) {
                await this.db.setCommandStatus(guildId, command, false, true);
            }
        }
    }

    async isCogEnabled(guildId, cogName) {
        return await this.db.getCogStatus(guildId, cogName);
    }

    async isCommandEnabled(guildId, commandName) {
        const status = await this.db.getCommandStatus(guildId, commandName);
        return status.enabled;
    }
}
```

### 4. Casino Bot Integration (Already Implemented)

The casino bot needs to check the database for bans and disabled commands. Add this to the casino bot's command handler:

```javascript
// In ATIVE Casino Bot index.js (interaction handler)
async function checkUserBanStatus(userId) {
    try {
        const [rows] = await dbManager.databaseAdapter.pool.execute(
            'SELECT * FROM bot_bans WHERE user_id = ?',
            [userId]
        );
        return rows[0] || null;
    } catch (error) {
        logger.error('Failed to check ban status:', error);
        return null;
    }
}

async function checkCommandEnabled(guildId, commandName) {
    try {
        const [rows] = await dbManager.databaseAdapter.pool.execute(
            'SELECT enabled FROM command_status WHERE guild_id = ? AND command_name = ?',
            [guildId, commandName]
        );
        return rows[0]?.enabled ?? true; // Default to enabled
    } catch (error) {
        logger.error('Failed to check command status:', error);
        return true; // Default to enabled on error
    }
}

// Add these checks to the command handler before executing commands
```

## Developer IDs and Authorization

- **Main Developer ID**: `466050111680544798`
- **Additional Authorized IDs**: `1326438668591829068`, `1399233099224846460`

## GitHub Integration

For cog updating functionality, configure GitHub access:

```javascript
const GITHUB_CONFIG = {
    repo: 'talmax1124/Ative-Casino-Bot',
    branch: 'main',
    token: process.env.GITHUB_TOKEN // Optional for rate limiting
};
```

## Testing the Integration

1. **Database Connection Test**:
   ```javascript
   const db = require('./UTILS/databaseAdapter');
   await db.initialize();
   await db.testConnection();
   console.log('Database connection successful!');
   ```

2. **Ban System Test**:
   ```javascript
   await banSystem.banUser('test_user_id', 'TEST_BAN', 'developer');
   const banStatus = await banSystem.checkUserBan('test_user_id');
   console.log('Ban status:', banStatus);
   ```

3. **Cog Management Test**:
   ```javascript
   await cogManager.disableCog('test_guild_id', 'games');
   const isEnabled = await cogManager.isCogEnabled('test_guild_id', 'games');
   console.log('Games cog enabled:', isEnabled);
   ```

## Security Considerations

1. **Database Access**: Both bots share the same database - ensure proper connection pooling and error handling
2. **Authorization**: Only authorized developers can access admin commands
3. **Rate Limiting**: Implement rate limiting for GitHub API calls
4. **Logging**: All admin actions should be logged for audit purposes
5. **Backup**: Regular database backups before making changes

## Communication Flow

```
UAS-Standalone-Bot  ←→  MariaDB Database  ←→  ATIVE Casino Bot
     (Admin)                (Shared)              (Game Bot)
```

1. UAS-Standalone-Bot receives admin command
2. Updates shared database tables  
3. ATIVE Casino Bot reads from database on each command
4. Both bots stay synchronized through database

This setup allows the UAS-Standalone-Bot to have full administrative control over the ATIVE Casino Bot while maintaining separation of concerns and proper security.