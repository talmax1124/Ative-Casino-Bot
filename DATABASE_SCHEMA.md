# 🗄️ ATIVE Casino Bot - Database Schema Documentation

This document provides a comprehensive overview of all database tables and their fields used in the ATIVE Casino Bot system.

## 📋 Table of Contents
- [Core User System](#core-user-system)
- [Gaming System](#gaming-system)
- [Economy & Lottery](#economy--lottery)
- [Marriage System](#marriage-system)
- [Shop System](#shop-system)
- [Sports Betting](#sports-betting)
- [Administration & Logging](#administration--logging)
- [Miscellaneous](#miscellaneous)

---

## 🧑‍💻 Core User System

### `user_balances`
Primary user account table storing financial and activity data.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `user_id` | VARCHAR(20) | - | Discord user ID (Primary Key) |
| `wallet` | DECIMAL(20,2) | 1000.00 | Current wallet balance |
| `bank` | DECIMAL(20,2) | 0.00 | Current bank balance |
| `last_earn_ts` | BIGINT | 0 | Last earn command timestamp |
| `last_rob_ts` | BIGINT | 0 | Last rob attempt timestamp |
| `game_active` | BOOLEAN | FALSE | Whether user is in a game |
| `last_work_ts` | BIGINT | 0 | Last work command timestamp |
| `last_beg_ts` | BIGINT | 0 | Last beg command timestamp |
| `last_crime_ts` | BIGINT | 0 | Last crime command timestamp |
| `last_heist_ts` | BIGINT | 0 | Last heist command timestamp |
| `last_earnmoney_ts` | BIGINT | 0 | Last earnmoney command timestamp |
| `last_dailytask_ts` | BIGINT | 0 | Last daily task timestamp |
| `last_quiz_ts` | BIGINT | 0 | Last quiz command timestamp |
| `daily_sent` | DECIMAL(20,2) | 0.00 | Amount sent today |
| `last_send_reset` | BIGINT | 0 | Last daily send reset timestamp |
| `username` | VARCHAR(100) | NULL | Discord username |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Account creation time |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update time |

### `user_stats`
Game statistics for each user per game type.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | VARCHAR(50) | - | Unique stat ID (Primary Key) |
| `user_id` | VARCHAR(20) | - | Discord user ID |
| `game_type` | VARCHAR(50) | NULL | Type of game |
| `wins` | INT | 0 | Number of wins |
| `losses` | INT | 0 | Number of losses |
| `total_wagered` | DECIMAL(20,2) | 0.00 | Total amount wagered |
| `total_won` | DECIMAL(20,2) | 0.00 | Total amount won |
| `biggest_win` | DECIMAL(20,2) | 0.00 | Largest single win |
| `biggest_loss` | DECIMAL(20,2) | 0.00 | Largest single loss |
| `total_wins` | INT | 0 | Total wins (legacy) |
| `total_losses` | INT | 0 | Total losses (legacy) |
| `total_games_played` | INT | 0 | Total games played |
| `last_played` | TIMESTAMP | NULL | Last game played |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update time |

### `user_levels`
User leveling and XP system.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `user_id` | VARCHAR(20) | - | Discord user ID |
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `level` | INT | 1 | Current user level |
| `xp` | INT | 0 | Current XP in level |
| `total_xp` | INT | 0 | Total XP earned |
| `games_played` | INT | 0 | Total games played |
| `games_won` | INT | 0 | Total games won |
| `messages_sent` | INT | 0 | Total messages sent |
| `last_level_up` | TIMESTAMP | NULL | Last level up time |
| `last_xp_gain` | TIMESTAMP | NULL | Last XP gain time |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update time |

### `user_settings`
User preferences and settings.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `user_id` | VARCHAR(20) | - | Discord user ID (Primary Key) |
| `role_color_enabled` | BOOLEAN | TRUE | Enable role color changes |
| `decorations_enabled` | BOOLEAN | TRUE | Enable profile decorations |
| `active_decoration_id` | INT | NULL | Currently active decoration |
| `settings` | JSON | NULL | Additional user settings |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update time |

### `off_economy_users`
Users who opt out of the economy system.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `user_id` | VARCHAR(255) | - | Discord user ID (Primary Key) |
| `active` | TINYINT(1) | 1 | Whether opt-out is active |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Opt-out creation time |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update time |

---

## 🎮 Gaming System

### `game_results`
Individual game result tracking.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `user_id` | VARCHAR(20) | - | Discord user ID |
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `game_type` | VARCHAR(50) | - | Type of game played |
| `bet_amount` | DECIMAL(20,2) | - | Amount bet |
| `payout` | DECIMAL(20,2) | - | Amount won/lost |
| `won` | BOOLEAN | - | Whether game was won |
| `metadata` | JSON | NULL | Additional game data |
| `played_at` | TIMESTAMP | CURRENT_TIMESTAMP | Game play timestamp |

### `scratch_tickets`
Scratch ticket drop system.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | VARCHAR(50) | - | Unique ticket ID (Primary Key) |
| `user_id` | VARCHAR(20) | NULL | User who claimed ticket |
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `channel_id` | VARCHAR(20) | - | Channel where ticket dropped |
| `ticket_data` | JSON | - | Ticket metadata |
| `symbols` | JSON | - | 3x3 grid of symbols |
| `winning_combination` | JSON | NULL | Winning pattern if any |
| `status` | ENUM | 'dropped' | Ticket status |
| `scratched_positions` | JSON | NULL | Positions scratched |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Drop time |
| `expires_at` | TIMESTAMP | - | Expiration time |
| `won_amount` | DECIMAL(20,2) | 0.00 | Amount won |
| `claimed_by` | VARCHAR(20) | NULL | User who claimed |
| `scratched_at` | TIMESTAMP | NULL | When scratching started |
| `completed_at` | TIMESTAMP | NULL | When completed |

### `scratch_drops`
Scratch ticket drop configuration per guild.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `guild_id` | VARCHAR(20) | - | Discord guild ID (Primary Key) |
| `last_drop_time` | TIMESTAMP | CURRENT_TIMESTAMP | Last drop time |
| `daily_drops` | INT | 0 | Drops today |
| `drop_count_reset` | DATE | CURRENT_DATE | Daily reset date |
| `total_drops` | INT | 0 | Total drops all time |
| `total_wins` | INT | 0 | Total winning tickets |
| `total_winnings` | DECIMAL(20,2) | 0.00 | Total winnings paid |
| `next_drop_time` | TIMESTAMP | NULL | Next scheduled drop |
| `drop_enabled` | BOOLEAN | TRUE | Whether drops are enabled |
| `max_daily_drops` | INT | 2 | Maximum drops per day |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Config creation time |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update time |

---

## 💰 Economy & Lottery

### `lottery_tickets`
User lottery ticket purchases.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `user_id` | VARCHAR(20) | - | Discord user ID |
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `ticket_count` | INT | 1 | Number of tickets |
| `purchase_cost` | DECIMAL(20,2) | - | Cost paid for tickets |
| `week_start` | DATE | - | Week of purchase |
| `tier` | TINYINT | 1 | Lottery tier (1 or 2) |
| `purchased_at` | TIMESTAMP | CURRENT_TIMESTAMP | Purchase time |
| `awarded_manually` | BOOLEAN | FALSE | If manually awarded |
| `award_reason` | TEXT | NULL | Reason for manual award |
| `awarded_by` | VARCHAR(20) | NULL | Who awarded manually |

### `lottery_info`
Lottery pool information per guild and tier.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `tier` | TINYINT | 1 | Lottery tier |
| `total_tickets` | INT | 0 | Total tickets sold |
| `total_prize` | DECIMAL(20,2) | 400000.00 | Current prize pool |
| `next_drawing` | TIMESTAMP | NULL | Next drawing time |
| `current_week_start` | DATE | - | Current week start |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Record creation |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update |

### `lottery_winners`
Historical lottery winners.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `user_id` | VARCHAR(20) | - | Winner's Discord user ID |
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `week_start` | DATE | - | Week of winning |
| `tickets_owned` | INT | - | Tickets owned by winner |
| `total_tickets` | INT | - | Total tickets in drawing |
| `prize_amount` | DECIMAL(20,2) | - | Amount won |
| `won_at` | TIMESTAMP | CURRENT_TIMESTAMP | Win timestamp |

### `rob_stats`
Robbery attempt statistics.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | VARCHAR(100) | - | Unique rob ID (Primary Key) |
| `robber_id` | VARCHAR(20) | - | Robber's Discord user ID |
| `victim_id` | VARCHAR(20) | - | Victim's Discord user ID |
| `robber_name` | VARCHAR(255) | NULL | Robber's username |
| `victim_name` | VARCHAR(255) | NULL | Victim's username |
| `amount_stolen` | DECIMAL(20,2) | 0.00 | Amount stolen |
| `penalty_paid` | DECIMAL(20,2) | 0.00 | Penalty if failed |
| `success` | BOOLEAN | - | Whether rob succeeded |
| `robber_tier` | VARCHAR(50) | NULL | Robber's wealth tier |
| `victim_tier` | VARCHAR(50) | NULL | Victim's wealth tier |
| `tier_difference` | INT | 0 | Difference in tiers |
| `robber_balance_before` | DECIMAL(20,2) | NULL | Robber balance before |
| `victim_balance_before` | DECIMAL(20,2) | NULL | Victim balance before |
| `timestamp` | TIMESTAMP | CURRENT_TIMESTAMP | Rob attempt time |
| `guild_id` | VARCHAR(20) | NULL | Discord guild ID |

---

## 💍 Marriage System

### `marriages`
Active marriages between users.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `partner1_id` | VARCHAR(20) | - | First partner's Discord ID |
| `partner1_name` | VARCHAR(100) | - | First partner's name |
| `partner1_role` | ENUM | - | 'husband' or 'wife' |
| `partner2_id` | VARCHAR(20) | - | Second partner's Discord ID |
| `partner2_name` | VARCHAR(100) | - | Second partner's name |
| `partner2_role` | ENUM | - | 'husband' or 'wife' |
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `married_at` | TIMESTAMP | CURRENT_TIMESTAMP | Marriage timestamp |
| `ceremony_data` | JSON | NULL | Ceremony details |
| `shared_bank` | DECIMAL(20,2) | 0.00 | Shared bank balance |
| `status` | ENUM | 'active' | 'active' or 'divorced' |
| `divorced_at` | TIMESTAMP | NULL | Divorce timestamp |
| `divorce_reason` | TEXT | NULL | Reason for divorce |

### `marriage_proposals`
Marriage proposals between users.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `proposer_id` | VARCHAR(20) | - | Proposer's Discord ID |
| `proposer_name` | VARCHAR(100) | - | Proposer's name |
| `recipient_id` | VARCHAR(20) | - | Recipient's Discord ID |
| `recipient_name` | VARCHAR(100) | - | Recipient's name |
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `status` | ENUM | 'pending' | Proposal status |
| `proposal_message` | TEXT | NULL | Proposal text |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Proposal time |
| `expires_at` | TIMESTAMP | NULL | Expiration time |
| `responded_at` | TIMESTAMP | NULL | Response time |

### `marriage_levels`
Marriage XP and leveling system.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `marriage_id` | INT | - | Reference to marriages table |
| `current_level` | INT | 1 | Current marriage level |
| `current_xp` | INT | 0 | Current XP in level |
| `total_challenges_completed` | INT | 0 | Total challenges done |
| `last_level_up` | TIMESTAMP | NULL | Last level up time |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Record creation |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update |

### `marriage_challenges`
Weekly marriage challenges.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `week_start` | DATE | - | Week start date |
| `challenge_1` | JSON | - | First challenge data |
| `challenge_2` | JSON | - | Second challenge data |
| `challenge_3` | JSON | - | Third challenge data |
| `challenge_4` | JSON | - | Fourth challenge data |
| `bonus_challenge` | JSON | NULL | Bonus challenge data |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Creation time |

### `marriage_challenge_progress`
Marriage challenge completion tracking.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `marriage_id` | INT | - | Reference to marriages table |
| `week_start` | DATE | - | Week of challenges |
| `challenge_1_completed` | BOOLEAN | FALSE | Challenge 1 status |
| `challenge_1_completed_at` | TIMESTAMP | NULL | Challenge 1 completion |
| `challenge_2_completed` | BOOLEAN | FALSE | Challenge 2 status |
| `challenge_2_completed_at` | TIMESTAMP | NULL | Challenge 2 completion |
| `challenge_3_completed` | BOOLEAN | FALSE | Challenge 3 status |
| `challenge_3_completed_at` | TIMESTAMP | NULL | Challenge 3 completion |
| `challenge_4_completed` | BOOLEAN | FALSE | Challenge 4 status |
| `challenge_4_completed_at` | TIMESTAMP | NULL | Challenge 4 completion |
| `bonus_completed` | BOOLEAN | FALSE | Bonus challenge status |
| `bonus_completed_at` | TIMESTAMP | NULL | Bonus completion |
| `total_xp_earned` | INT | 0 | XP earned this week |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Record creation |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update |

### `marriage_task_completions`
Task completion tracking for marriages.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `marriage_id` | INT | - | Reference to marriages table |
| `task_number` | INT | - | Task number (1-4) |
| `completed_by` | VARCHAR(20) | - | User who completed |
| `week_start` | DATE | - | Week of completion |
| `completion_data` | JSON | NULL | Task completion details |
| `completed_at` | TIMESTAMP | CURRENT_TIMESTAMP | Completion time |

### Marriage Task Tables
Additional tables for specific marriage tasks:
- `marriage_house_quiz` - House hunting quiz data
- `marriage_connect4_games` - Connect4 game sessions
- `marriage_love_letters` - Love letter compositions
- `marriage_vacation_plans` - Vacation planning data
- `marriage_vacation_sessions` - Vacation session tracking
- `marriage_daily_checkins` - Daily check-in tracking
- `marriage_virtual_pets` - Virtual pet management
- `marriage_pet_interactions` - Pet interaction logs
- `marriage_businesses` - Business ownership data
- `marriage_business_earnings` - Business income tracking
- `marriage_stock_holdings` - Stock portfolio data
- `marriage_stock_transactions` - Stock transaction history
- `marriage_xp` - Marriage XP tracking
- `marriage_xp_history` - XP gain history

---

## 🛒 Shop System

### `shop_items`
Available items in the shop.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `name` | VARCHAR(100) | - | Item name |
| `description` | TEXT | - | Item description |
| `category` | ENUM | - | Item category |
| `price` | DECIMAL(20,2) | - | Item price |
| `duration_hours` | INT | NULL | Duration if temporary |
| `metadata` | JSON | NULL | Additional item data |
| `active` | BOOLEAN | TRUE | Whether item is available |
| `sort_order` | INT | 0 | Display order |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Item creation |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update |

### `user_shop_purchases`
User purchase history.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `user_id` | VARCHAR(20) | - | Discord user ID |
| `item_id` | INT | - | Reference to shop_items |
| `purchased_at` | TIMESTAMP | CURRENT_TIMESTAMP | Purchase time |
| `expires_at` | TIMESTAMP | NULL | Expiration time |
| `active` | BOOLEAN | TRUE | Whether purchase is active |
| `metadata` | JSON | NULL | Purchase metadata |

### `user_active_boosts`
Currently active user boosts.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `user_id` | VARCHAR(20) | - | Discord user ID |
| `boost_type` | VARCHAR(50) | - | Type of boost |
| `multiplier` | DECIMAL(3,2) | 1.00 | Boost multiplier |
| `expires_at` | TIMESTAMP | - | Boost expiration |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Boost activation |

---

## 🏈 Sports Betting

### `sport_bets`
Individual sports bets placed by users.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `user_id` | VARCHAR(255) | - | Discord user ID |
| `guild_id` | VARCHAR(255) | - | Discord guild ID |
| `sport` | VARCHAR(50) | - | Sport type |
| `game_id` | VARCHAR(255) | - | External game ID |
| `game_name` | VARCHAR(500) | - | Game description |
| `selection` | VARCHAR(255) | - | Bet selection |
| `amount` | BIGINT | - | Bet amount |
| `odds` | DECIMAL(10,2) | - | Bet odds |
| `payout` | BIGINT | 0 | Payout amount |
| `status` | ENUM | 'pending' | Bet status |
| `result` | VARCHAR(255) | NULL | Bet result |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Bet placement time |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update |

### `sports_games_cache`
Cached sports game data and odds.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `sport` | VARCHAR(50) | - | Sport type |
| `league` | VARCHAR(100) | - | League name |
| `game_id` | VARCHAR(255) | - | Unique game ID |
| `home_team` | VARCHAR(255) | - | Home team name |
| `away_team` | VARCHAR(255) | - | Away team name |
| `commence_time` | DATETIME | - | Game start time |
| `home_odds` | DECIMAL(10,2) | NULL | Home team odds |
| `away_odds` | DECIMAL(10,2) | NULL | Away team odds |
| `draw_odds` | DECIMAL(10,2) | NULL | Draw odds |
| `spread_home` | DECIMAL(10,2) | NULL | Home spread |
| `spread_away` | DECIMAL(10,2) | NULL | Away spread |
| `total_over` | DECIMAL(10,2) | NULL | Over total |
| `total_under` | DECIMAL(10,2) | NULL | Under total |
| `raw_data` | JSON | NULL | Raw API data |
| `cached_at` | TIMESTAMP | CURRENT_TIMESTAMP | Cache time |
| `expires_at` | TIMESTAMP | - | Cache expiration |

### `api_usage_tracking`
API usage tracking for sports data.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `api_key_index` | INT | 1 | API key index |
| `request_count` | INT | 0 | Number of requests |
| `month_year` | VARCHAR(7) | - | Month in YYYY-MM format |
| `last_request_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last request time |
| `reset_at` | TIMESTAMP | - | Usage reset time |

### `api_keys_config`
API key configuration and limits.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `service` | VARCHAR(50) | - | Service name |
| `key_index` | INT | - | Key index number |
| `is_active` | BOOLEAN | TRUE | Whether key is active |
| `monthly_limit` | INT | 500 | Monthly request limit |
| `current_usage` | INT | 0 | Current month usage |
| `last_reset` | DATE | NULL | Last usage reset |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Config creation |

---

## 📊 Administration & Logging

### `economic_changes`
Economic system change audit log.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `timestamp` | VARCHAR(50) | - | Change timestamp |
| `change_type` | VARCHAR(100) | - | Type of change |
| `target` | VARCHAR(100) | - | Target of change |
| `changes_data` | JSON | - | Change details |
| `source` | VARCHAR(50) | 'EconomyGuardian' | Source system |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Log creation |

### `premium_claims`
Premium subscription claim tracking.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | INT | - | Auto-increment ID (Primary Key) |
| `user_id` | VARCHAR(20) | - | Discord user ID |
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `claim_type` | ENUM | - | 'weekly' or 'monthly' |
| `amount` | DECIMAL(20,2) | - | Amount claimed |
| `subscription_type` | VARCHAR(50) | - | Subscription tier |
| `claimed_at` | TIMESTAMP | CURRENT_TIMESTAMP | Claim timestamp |

---

## 🗳️ Miscellaneous

### `poem_votes`
Poem voting system for marriage tasks.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `poem_id` | VARCHAR(100) | - | Unique poem ID (Primary Key) |
| `message_id` | VARCHAR(20) | - | Discord message ID |
| `channel_id` | VARCHAR(20) | - | Discord channel ID |
| `guild_id` | VARCHAR(20) | - | Discord guild ID |
| `upvotes` | INT | 0 | Number of upvotes |
| `downvotes` | INT | 0 | Number of downvotes |
| `voters` | TEXT | NULL | JSON array of voter IDs |
| `poem_data` | JSON | NULL | Poem content and metadata |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Creation time |
| `expires_at` | TIMESTAMP | NULL | Voting expiration |

---

## 🔧 Database Configuration

### Connection Environment Variables
```bash
MARIADB_HOST=your_host
MARIADB_PORT=3306
MARIADB_USER=your_username
MARIADB_PASSWORD=your_password
MARIADB_DATABASE=your_database_name
```

### Character Set & Collation
- **Engine**: InnoDB
- **Character Set**: utf8mb4
- **Collation**: utf8mb4_unicode_ci

---

## 📈 Key Relationships

1. **User System**: `user_balances` ←→ `user_stats` ←→ `user_levels`
2. **Marriage System**: `marriages` ←→ `marriage_levels` ←→ `marriage_challenges`
3. **Shop System**: `shop_items` ←→ `user_shop_purchases` ←→ `user_active_boosts`
4. **Gaming**: `game_results` references user data for statistics
5. **Sports Betting**: `sport_bets` ←→ `sports_games_cache`

---

## 🚀 Performance Notes

### Indexes
- Most tables have appropriate indexes on frequently queried fields
- Composite indexes on user_id + guild_id combinations
- Timestamp indexes for time-based queries

### Data Types
- User IDs stored as VARCHAR(20) for Discord's snowflake format
- Financial amounts use DECIMAL(20,2) for precision
- Timestamps use BIGINT for Unix timestamps in some legacy fields
- JSON fields for flexible metadata storage

---

*This documentation is auto-generated from the ATIVE Casino Bot codebase. Last updated: October 2025*