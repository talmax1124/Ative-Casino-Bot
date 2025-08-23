# 🛠️ Developer Panel Guide

## Overview
The `/dev` command provides a unified developer control panel that consolidates all administrative and developer tools into one command with various subcommands.

## Access
- **Restricted to Developer Only**: User ID `466050111680544798`
- All subcommands require developer permissions
- Commands are executed ephemerally (only visible to the developer)

## Available Subcommands

### 1. `/dev disable <command>`
**Description**: Disable a command from being used by users
- **Parameters**: 
  - `command` (required): Name of command to disable
- **Autocomplete**: Shows only enabled commands (excluding protected ones)
- **Protected Commands**: `dev`, `status` cannot be disabled
- **Example**: `/dev disable blackjack`

### 2. `/dev enable <command>`  
**Description**: Re-enable a previously disabled command
- **Parameters**:
  - `command` (required): Name of command to enable
- **Autocomplete**: Shows only disabled commands
- **Example**: `/dev enable blackjack`

### 3. `/dev commands`
**Description**: List all commands and their current status (enabled/disabled)
- **Shows**: 
  - Total command count
  - Enabled commands list
  - Disabled commands list
- **Example**: `/dev commands`

### 4. `/dev status`
**Description**: Display comprehensive bot status and system information
- **Information Displayed**:
  - Bot uptime
  - Ping/latency
  - Memory usage
  - Node.js version
  - Discord.js version
  - CPU usage
  - Environment details
  - Git information (if available)
- **Example**: `/dev status`

### 5. `/dev logs [lines]`
**Description**: View recent log entries from the bot
- **Parameters**:
  - `lines` (optional): Number of log lines to display (1-100, default: 20)
- **Shows**: Most recent log entries from `logs/combined.log`
- **Example**: `/dev logs 50`

### 6. `/dev reload <command>`
**Description**: Hot-reload a command file without restarting the bot
- **Parameters**:
  - `command` (required): Name of command to reload
- **Autocomplete**: Shows all available commands
- **Use Cases**: After editing command files during development
- **Example**: `/dev reload fishing`

### 7. `/dev updatelottery`
**Description**: Update the lottery information panel in the designated lottery channel
- **Restrictions**: Only works in the designated lottery server
- **Function**: 
  - Fetches current lottery information
  - Creates/updates lottery panel with current data
  - Generates Canvas-based lottery image
  - Updates interactive buttons
- **Example**: `/dev updatelottery`

### 8. `/dev stopgame [user]`
**Description**: Stop active games for users (includes crash games)
- **Parameters**:
  - `user` (optional): Specific user to stop games for
- **Behavior**:
  - **With user**: Stops that user's active game immediately
  - **Without user**: Shows selection menu of all active games
- **Game Types Supported**:
  - Crash games (properly stops crash instances)
  - Wordchain games
  - All other tracked active games
- **Example**: `/dev stopgame @username` or `/dev stopgame`

## Removed Commands

The following standalone commands have been **removed** and integrated into the dev panel:

### Deprecated Commands:
- ❌ `/cog disable` → Use `/dev disable`
- ❌ `/cog enable` → Use `/dev enable`  
- ❌ `/cog list` → Use `/dev commands`
- ❌ `/status` → Use `/dev status`
- ❌ `/logs` → Use `/dev logs`
- ❌ `/reload` → Use `/dev reload`
- ❌ `/updatelotterypanel` → Use `/dev updatelottery`
- ❌ `/stopcrash` → Use `/dev stopgame` (now handles all game types including crash)

## Interactive Menus

### Stop Game Selection
When using `/dev stopgame` without specifying a user, an interactive menu displays:
- **Format**: `Username - GameType in #channel`
- **Support**: Up to 25 active games (Discord limit)
- **Information**: Shows channel information for crash games
- **Selection**: Click to stop the selected game

### Game Type Handling
- **Crash Games**: Properly calls `stopCrashGame()` function with guild and channel IDs
- **Wordchain**: Calls `forceStop()` method if available
- **General Games**: Clears from active game tracking system
- **Logging**: All game stops are logged with user and game type information

## Error Handling
- **Permission Checks**: All subcommands verify developer access
- **File Validation**: Reload checks if command files exist
- **Game Validation**: Stop game verifies games are still active
- **Graceful Degradation**: Failed operations show clear error messages

## Logging
All developer actions are logged including:
- Command enable/disable actions
- Game stops with user and game type
- Reload operations
- System status checks
- Lottery panel updates

## Usage Examples

```bash
# Disable a problematic command
/dev disable crash

# Check what commands are currently disabled
/dev commands

# View recent error logs
/dev logs 30

# Stop all crash games for a specific user
/dev stopgame @TroublesomeUser

# Reload a command after making changes
/dev reload mystats

# Check bot system status
/dev status

# Update lottery panel with current data
/dev updlelottery
```

## Benefits of Unified Panel

1. **Single Entry Point**: All developer tools in one command
2. **Consistent Permissions**: Unified access control
3. **Better Organization**: Related functionality grouped together
4. **Reduced Command Clutter**: Fewer top-level commands
5. **Enhanced Functionality**: Improved game stopping with crash support
6. **Maintainability**: Easier to manage and update developer tools

## Technical Notes

- **Command Registration**: Only the main `/dev` command is registered with Discord
- **Autocomplete**: Full autocomplete support for all relevant subcommands
- **Select Menus**: Custom interaction handlers for complex operations
- **Error Recovery**: Robust error handling for all operations
- **Backward Compatibility**: Old functionality preserved with improved implementation