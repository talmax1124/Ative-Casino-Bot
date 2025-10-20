# Admin Commands Removed - Migration Guide for UAS-Standalone-Bot

## Files Removed

### Main Admin Commands
1. **`COMMANDS/admin.js`** - Consolidated admin command with subcommands:
   - `/admin setup` - Server setup wizard
   - `/admin release` - Release management 
   - `/admin backup` - Database backup (was disabled)

2. **`COMMANDS/ADMIN/reload-cog.js`** - Command to reload cogs/modules from GitHub
3. **`COMMANDS/botban.js`** - Developer-only bot ban system for economy violations
4. **`COMMANDS/setup.js`** - Server setup wizard command
5. **`COMMANDS/release.js`** - Manual session cleanup/release command
6. **`COMMANDS/backup.js.disabled`** - Disabled backup command

### Admin Utilities Removed
1. **`UTILS/setupWizard.js`** - Setup wizard utility class (7-step server configuration)
2. **`UTILS/setupInteractionHandler.js`** - Handles setup wizard interactions

## Developer User ID Used
- `466050111680544798` - Main developer ID used across all admin commands

## Key Features to Migrate

### 1. Admin Command (`admin.js`)
- **Purpose**: Consolidated admin interface
- **Subcommands**: setup, release, backup
- **Developer-only access**: Checks `DEVELOPER_USER_ID`

### 2. Bot Ban System (`botban.js`)
- **Purpose**: Ban users for economy violations
- **Features**: 
  - Ban/unban users
  - Multiple ban reasons (quintillion threshold, exploitation, etc.)
  - Ban status checking
  - Developer + role-based access control

### 3. Cog Reload System (`reload-cog.js`)
- **Purpose**: Hot reload bot modules from GitHub
- **Features**:
  - Downloads files from GitHub repo
  - Reloads commands in memory
  - Multiple file types supported
  - Maps cog names to file paths

### 4. Setup Wizard (`setup.js` + `setupWizard.js`)
- **Purpose**: 7-step server configuration
- **Features**:
  - Interactive step-by-step setup
  - Channel configuration
  - Role configuration  
  - Economy settings
  - Game settings
  - Security settings
  - Completion tracking

### 5. Release/Session Management (`release.js`)
- **Purpose**: Manual game session cleanup
- **Features**:
  - Release stuck game sessions
  - Admin can target other users
  - Regular users can only target themselves

## References Cleaned Up
- Removed from `index.js` command loading logic
- Removed from `UTILS/fastCommandLoader.js` 
- Removed from `UTILS/cogFileMapper.js`
- Removed from `package.json` scripts
- Updated interaction handlers to remove setup wizard references

## Migration Notes
- All admin functionality used the same developer ID: `466050111680544798`
- Commands were properly integrated with the bot's session management system
- Setup wizard had complex interaction handling with buttons and select menus
- Bot ban system integrated with the economy protection systems
- Cog reload system supports multiple GitHub repositories

## Dependencies to Consider
When migrating, these admin commands may require:
- Access to the same database for bot bans
- GitHub integration for cog reloading
- Discord.js interaction handling
- Session management integration
- Economy system integration for ban reasons