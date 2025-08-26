# Graceful Shutdown System

The ATIVE Casino Bot now includes a graceful shutdown system that ensures all active games complete before restarting or shutting down the bot.

## Features

### 🎮 Active Games Detection
- Monitors both legacy games (stored in memory) and session-based games
- Tracks all active game types: Blackjack, Slots, Duck Game, Crash, etc.
- Provides detailed information about each active game

### ⏱️ Smart Waiting System
- Default wait time: **5 minutes** maximum
- Checks every 5 seconds for game completion
- Shows real-time progress updates
- Forced restart after timeout if games still active

### 🔧 VPS Integration
All VPS restart commands now use graceful shutdown:
- **Pull & Restart**: `git pull` + graceful restart
- **Restart**: Simple graceful restart
- **Status Check**: View active games before restart

## How to Use

### Via Developer Panel
1. Use `/panel developer`
2. Select "VPS Controls" for restart options
3. Select "Active Games Status" to check current games
4. Choose "Pull & Restart" or "Restart" for graceful operations

### Manual Status Check
Use the "Active Games Status" option to see:
- Number of legacy games active
- Number of session games active
- Total active game count
- Detailed game information (user, type, duration)

## Restart Process

1. **Check Active Games**: System scans for any running games
2. **Wait Period**: If games found, waits up to 5 minutes
3. **Progress Updates**: Shows status every 30 seconds
4. **Completion**: Proceeds when all games finish
5. **Force Option**: After 5 minutes, gives option to force restart
6. **Execute**: Runs git pull and restart commands

## Safety Features

- ✅ **Non-Destructive**: Never forces game termination unless timeout exceeded
- ✅ **User-Friendly**: Clear status messages and progress updates
- ✅ **Flexible**: Configurable timeout periods
- ✅ **Comprehensive**: Works with all game types
- ✅ **Logging**: All actions logged for transparency

## Error Handling

- Graceful degradation if game detection fails
- Fallback to immediate restart if systems unavailable
- Comprehensive error logging and reporting
- User notification of any issues

## Technical Details

### Game Detection Sources
1. **Legacy Games**: `getAllActiveGames()` from common utilities
2. **Session Games**: Active sessions from SessionManager
3. **Combined View**: Unified status across all systems

### Timeout Configuration
- Default: 5 minutes (300,000ms)
- Check interval: 5 seconds (5,000ms)
- Progress updates: Every 30 seconds
- All configurable in gracefulShutdown.js

### Integration Points
- `/panel developer` - Main UI access
- VPS commands - Automatic integration
- Dev commands - Enhanced restart safety
- SessionManager - Game state monitoring

## Benefits

1. **Player Experience**: No abrupt game terminations
2. **Data Integrity**: Ensures all games complete properly
3. **Fairness**: Prevents losses due to unexpected restarts
4. **Transparency**: Clear communication about restart status
5. **Flexibility**: Manual override available when needed

## Future Enhancements

- Custom timeout periods per restart type
- Game-specific completion priorities
- Advanced notification system for affected players
- Integration with maintenance windows
- Automated scheduling with game-aware timing