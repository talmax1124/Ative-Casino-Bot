# Marriage Task Games - Developer Guide

The new Marriage Task Utility system makes it incredibly easy to create new marriage task games without worrying about database management, interaction handling, or week tracking.

## Quick Start

1. **Copy the template**: Use `GameTemplate.js` as a starting point
2. **Register your game**: Call `marriageTaskUtil.registerGame()` with your configuration
3. **Handle the start**: Implement the `handleStart` method for your game logic
4. **Add button handlers**: Handle any custom buttons your game needs

## Example: Creating a Simple Game

```javascript
const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

class MySimpleGame {
    constructor() {
        // Register the game when the class is created
        marriageTaskUtil.registerGame('week2_task2', 'my_game', {
            title: '🎮 My Awesome Game',
            description: 'Do something fun together!',
            instructions: '• Click the button\n• Have fun!',
            buttonLabel: 'Start Fun',
            buttonEmoji: '🎉',
            color: 0x00FF00,
            startHandler: this.handleStart.bind(this)
        });
    }

    async handleStart(interaction, session, util) {
        const marriage = session.marriage;
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 Game Started!')
            .setDescription(`${marriage.partner1.name} and ${marriage.partner2.name} are having fun!`)
            .setColor(0x00FF00);

        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`my_game_win_${session.sessionId}`)
                    .setLabel('Win Game!')
                    .setStyle(ButtonStyle.Success)
            );

        await util.safeReply(interaction, {
            embeds: [embed],
            components: [button]
        });
    }

    // Handle button clicks (you need to add this to index.js button handler)
    async handleWin(interaction, sessionId) {
        const session = marriageTaskUtil.getGameSession(sessionId);
        
        await marriageTaskUtil.safeReply(interaction, {
            content: '🎉 Congratulations! You won the game!',
            components: []
        });

        // This automatically marks the task as complete
        marriageTaskUtil.endGameSession(sessionId, { 
            winner: interaction.user.id 
        });
    }
}

module.exports = MySimpleGame;
```

## What the Utility Handles for You

### ✅ Automatic Features
- **Database Management**: All tables created automatically
- **Week/Rotation Tracking**: Knows which week it is and what tasks are active
- **Task Completion**: Automatically marks tasks complete when games end
- **Interaction Safety**: Never get "This interaction failed" errors again
- **Marriage Validation**: Checks if users are married and gets partner info
- **Session Management**: Handles game timeouts and cleanup
- **Error Handling**: Comprehensive error handling and logging

### ✅ What You Get
- `session.marriage` - Marriage info with partner names and IDs
- `session.sessionId` - Unique session ID for your game
- `session.gameData` - Object to store your game state
- `util.safeReply()` - Safe interaction replies that always work
- `util.endGameSession()` - Mark your game as complete

## Game Configuration Options

```javascript
marriageTaskUtil.registerGame('week2_task1', 'your_game_type', {
    // Required
    title: 'Your Game Title',
    description: 'What your game does',
    startHandler: this.handleStart.bind(this),

    // Optional (with defaults)
    instructions: 'How to play your game',
    buttonLabel: 'Start Game', // Button text
    buttonEmoji: '🎮',         // Button emoji
    color: 0xFF69B4,           // Embed color
    requiresBothPartners: true, // Both spouses needed?
    autoComplete: true,        // Auto-mark complete when ended?
    allowReplay: false,        // Can replay after complete?
    maxDuration: 30 * 60 * 1000 // 30 minutes timeout
});
```

## Adding Games to the System

1. **Create your game file** in `/UTILS/games/`
2. **Import it** in `/UTILS/games/index.js`:
   ```javascript
   const MyGame = require('./MyGame');
   const myGame = new MyGame();
   this.games.set('my_game', myGame);
   ```
3. **Add button handlers** to `index.js` if needed
4. **That's it!** Your game is now available

## Migration Benefits

### Before (Old System)
- 50+ lines of interaction handling code per game
- Manual database table management
- Repetitive marriage validation
- Week tracking scattered everywhere
- "This interaction failed" errors everywhere

### After (New System)
- 10-20 lines total per game
- Zero database code needed
- Zero interaction error handling
- Just focus on your game logic!

## Best Practices

1. **Keep it simple**: Focus on game logic, let the utility handle everything else
2. **Use the session**: Store game state in `session.gameData`
3. **Handle timeouts**: Games auto-timeout after `maxDuration`
4. **Test thoroughly**: Use the template and follow the examples
5. **Document your game**: Add comments explaining your game mechanics

## Need Help?

Check out these examples:
- `MentionTaskGame.js` - Real working example
- `GameTemplate.js` - Copy-paste template
- `MarriageTaskUtil.js` - Full utility documentation

The new system eliminates 90% of the boilerplate code and makes marriage task development fun again! 🎉