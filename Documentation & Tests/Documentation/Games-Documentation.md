# 🎮 ATIVE Casino Bot - Games Documentation

## Overview

The ATIVE Casino Bot features a comprehensive collection of casino games built with JavaScript/Node.js. Each game is designed with fair odds, engaging gameplay, and robust security measures.

---

## 🃏 Blackjack

### Game Overview
Classic blackjack implementation with visual card displays and interactive controls.

### Technical Implementation
- **Engine**: Custom Card and Deck classes
- **RNG**: Cryptographically secure shuffling
- **Visual**: Canvas-based card rendering from assets
- **State Management**: Per-user game sessions

### Game Features
- **Standard Rules**: Hit, Stand, Double Down, Split
- **Insurance**: Available when dealer shows Ace  
- **Splitting**: Support for pair splitting
- **Blackjack Payout**: 3:2 for natural blackjack
- **Visual Cards**: High-quality card images from `assets/blackjack/`

### Card System
```javascript
// Card structure
class Card {
    constructor(rank, suit) {
        this.rank = rank;    // A, 2-10, J, Q, K
        this.suit = suit;    // ♠️, ♥️, ♦️, ♣️
    }
    
    getValue() {
        if (this.rank === 'A') return 11;
        if (['J', 'Q', 'K'].includes(this.rank)) return 10;
        return parseInt(this.rank);
    }
}
```

### Hand Evaluation
- **Soft Aces**: Automatically adjusts Ace values (11 → 1)
- **Bust Detection**: Hands over 21 automatically lose
- **Natural Blackjack**: Ace + 10-value card pays 3:2

### User Interface
- **Interactive Buttons**: Hit, Stand, Double Down, Split
- **Visual Feedback**: Card images with suits and ranks
- **Game State**: Real-time hand values and status
- **Help System**: Rules and strategy guide

### Assets Required
```
assets/blackjack/
├── Clubs/           # Club suit cards (A-K)
├── Diamonds/        # Diamond suit cards (A-K)
├── Hearts/          # Heart suit cards (A-K)
├── Spades/          # Spade suit cards (A-K)
└── board.png        # Game board background
```

---

## 🎰 Slots & Multi-Slots

### Game Overview
Two slot variants: Classic 3-reel slots and advanced multi-line slots with bonus features.

### Slot Symbols & Payouts
```javascript
const SLOT_SYMBOLS = {
    'cherries': { emoji: '🍒', rarity: 35, payout: 2.0 },
    'lemon': { emoji: '🍋', rarity: 30, payout: 2.5 },
    'orange': { emoji: '🍊', rarity: 25, payout: 3.0 },
    'grapes': { emoji: '🍇', rarity: 20, payout: 4.0 },
    'watermelon': { emoji: '🍉', rarity: 15, payout: 5.0 },
    'bar': { emoji: '📊', rarity: 12, payout: 6.0 },
    'seven': { emoji: '7️⃣', rarity: 8, payout: 10.0 },
    'diamond': { emoji: '💎', rarity: 5, payout: 20.0 },
    'buffalo': { emoji: '🦬', rarity: 3, payout: 50.0 },
    'jackpot': { emoji: '🎰', rarity: 0.5, payout: 200.0 }
};
```

### Classic Slots Features
- **3-Reel Layout**: Traditional slot machine
- **Winning Combinations**: 3 of a kind for full payout
- **Two-Match Bonus**: 75% payout for 2 matching symbols
- **Visual Animation**: Spinning reel effects
- **Symbol Images**: PNG assets from `assets/slots/`

### Multi-Slots Features
- **Matrix Mode**: 3x3 grid with multiple paylines
- **Minimum Bet**: $50,000 for matrix mode
- **Improved Odds**: 3% better win probability
- **Buffalo Bonus**: Special bonus game triggered by buffalo symbols
- **Multiple Paylines**: Up to 25 different winning combinations

### Buffalo Bonus Game
- **Trigger**: 3+ Buffalo symbols in matrix mode
- **Gameplay**: Free spins with multipliers
- **Progressive**: Increasing multiplier potential
- **Visual**: Special bonus interface

### Technical Implementation
- **RNG**: Weighted random symbol selection
- **Canvas Rendering**: Dynamic slot machine graphics
- **GIF Generation**: Animated spinning effects
- **Asset Loading**: Fallback system for missing images

---

## 📈 Crash Game

### Game Overview
Real-time multiplier game where players cash out before the crash.

### Game Mechanics
- **Multiplier Growth**: Starts at 1.00x, increases over time
- **Crash Point**: Random crash between 1.01x and 50.0x
- **Cash Out**: Players decide when to exit
- **Auto Cash Out**: Optional automatic exit point

### Technical Implementation
```javascript
const CRASH_CONFIG = {
    min_bet: 10.0,
    max_bet: 100000.0,
    update_interval: 500,  // 500ms update cycle
    max_multiplier: 50.0,
    house_edge: 0.03      // 3% house edge
};
```

### Game Phases
1. **Betting Phase**: Players place bets (30 seconds)
2. **Flight Phase**: Multiplier climbs
3. **Crash**: Game ends, payouts calculated
4. **Results**: Winners/losers displayed

### Player Actions
- **Bet**: Place wager for round
- **Auto Cash Out**: Set automatic exit multiplier
- **Manual Cash Out**: Exit during flight phase
- **View Stats**: Historical performance

### Multiplayer Support
- **Multiple Players**: Up to 10 players per game
- **Live Updates**: Real-time multiplier display
- **Social Features**: See other players' actions
- **Chat Integration**: Game-specific messaging

### Fair Play Algorithm
- **Provably Fair**: Deterministic crash points
- **Server Seed**: Cryptographically secure
- **Hash Verification**: Players can verify fairness
- **No Manipulation**: Cannot be influenced mid-game

---

## 🦆 Duck Game

### Game Overview
Road crossing adventure game with multiple difficulty levels.

### Game Modes
- **Easy**: Slow traffic, 80% success rate
- **Medium**: Moderate speed, 60% success rate  
- **Hard**: Fast traffic, 40% success rate, higher rewards

### Gameplay Mechanics
- **Grid Movement**: 5x7 game board
- **Obstacles**: Moving cars, barriers
- **Timing**: Real-time movement decisions
- **Progress**: Advance through lanes safely

### Visual System
```
assets/duck/
├── duck.png         # Player character
├── road/
│   ├── Grass.png   # Safe areas
│   ├── road.png    # Road tiles
│   ├── car.png     # Moving obstacles
│   ├── barricade.png # Fixed obstacles
│   └── end.png     # Goal area
```

### Controls
- **Directional Buttons**: Up, Down, Left, Right
- **Real-time**: Move during traffic gaps
- **Strategy**: Time movements carefully
- **Reset**: Start over if hit

---

## 🔤 Word Chain

### Game Overview
Vocabulary building game with word association challenges.

### Gameplay Rules
- **Chain Building**: Each word must start with last letter of previous
- **Dictionary Validation**: Words must be valid English
- **Time Limits**: Response time restrictions
- **Scoring**: Points for word length and difficulty

### Dictionary System
- **Word Lists**: Multiple dictionary sources
- **Validation**: Real-time word checking  
- **Difficulty**: Progressive challenge levels
- **Categories**: Optional themed rounds

### Technical Features
- **Word Database**: Loaded from `data/words.txt`
- **Validation Engine**: Fast lookup system
- **Scoring Algorithm**: Length and rarity bonuses
- **Chain Tracking**: Complete word history

---

## 🎣 Fishing Game

### Game Overview
Virtual fishing with randomized catches and rewards.

### Fishing Mechanics
- **Cast & Wait**: Time-based fishing attempts
- **Random Catches**: Weighted probability system
- **Fish Types**: Common to legendary varieties
- **Rewards**: Economy integration with payouts

### Fish Categories
- **Common Fish**: Low value, high probability
- **Rare Fish**: Medium value, moderate probability
- **Legendary Fish**: High value, low probability
- **Special Events**: Seasonal or time-based bonuses

---

## 🎯 Bingo

### Game Overview
Classic bingo with automated number calling.

### Game Features
- **Card Generation**: Random 5x5 bingo cards
- **Number Calling**: Automated sequence
- **Multiple Players**: Up to 20 players per game
- **Winning Patterns**: Multiple winning combinations

### Winning Conditions
- **Line Wins**: Horizontal, vertical, diagonal
- **Full House**: Complete card coverage
- **Pattern Wins**: Special shapes and patterns
- **Progressive**: Increasing difficulty levels

---

## ♟️ Chess

### Game Overview
Full chess implementation with Discord integration.

### Chess Features
- **Complete Ruleset**: All standard chess rules
- **Visual Board**: Canvas-based chess board rendering
- **Move Validation**: Legal move checking
- **Game States**: Check, checkmate, stalemate detection

### Technical Implementation
- **Piece Logic**: Individual piece movement rules
- **Board State**: 8x8 position tracking
- **Move History**: Complete game record
- **AI Opponent**: Optional computer player

### Assets
```
assets/chess/
├── Board - Side Named.png
├── Piece=King, Side=White.png
├── Piece=Queen, Side=White.png
└── [All piece variations]
```

---

## 🎮 UNO

### Game Overview
Digital UNO card game with Discord controls.

### Game Rules
- **Standard UNO**: Classic card game rules
- **Special Cards**: Skip, Reverse, Draw Two, Wild
- **Color System**: Red, Blue, Green, Yellow
- **Winning**: First to play all cards

### Card System
- **Number Cards**: 0-9 in each color
- **Action Cards**: Skip, Reverse, Draw Two
- **Wild Cards**: Wild, Wild Draw Four
- **Visual Cards**: PNG assets for all cards

---

## ⚔️ Battleship

### Game Overview
Naval strategy game with hidden ship placement.

### Game Features
- **Fleet Setup**: Place ships on grid
- **Turn-Based**: Alternating attack phases
- **Hit/Miss System**: Feedback on attacks
- **Ship Types**: Various ship sizes

---

## 🎯 Rock Paper Scissors

### Game Overview
Classic RPS with betting integration.

### Variations
- **Best of 3**: Multi-round matches
- **Tournament**: Multiple players
- **Betting**: Wager on outcomes
- **Statistics**: Win/loss tracking

---

## 🎲 Game Framework

### Common Features

#### State Management
```javascript
// Game session structure
{
    gameType: 'blackjack|slots|crash|etc',
    userId: 'discord_user_id',
    channelId: 'discord_channel_id',
    guildId: 'discord_guild_id',
    bet: 1000,
    startTime: Date.now(),
    gameState: { /* game-specific data */ }
}
```

#### Security Features
- **Input Validation**: All user inputs sanitized
- **Bet Limits**: Minimum and maximum wagering
- **Rate Limiting**: Prevent game spam
- **Session Isolation**: User games don't interfere
- **Anti-Cheat**: Server-side validation

#### Economy Integration
- **Balance Checking**: Verify sufficient funds
- **Automatic Deduction**: Bet amounts withdrawn
- **Payout Processing**: Winnings added to wallet
- **Transaction Logging**: All money movements recorded

#### Visual System
- **Canvas Rendering**: Dynamic image generation
- **Asset Management**: Organized game graphics
- **Animation Support**: GIF and frame animation
- **Responsive Design**: Adapts to different screen sizes

#### Error Handling
- **Graceful Degradation**: Fallback for missing assets
- **Session Recovery**: Handle Discord timeouts
- **Logging**: Comprehensive error reporting
- **User Feedback**: Clear error messages

### Game Development Guidelines

#### New Game Creation
1. **Game Logic**: Implement in `GAMES/` directory
2. **Command Handler**: Create in `COMMANDS/` directory
3. **Assets**: Add images to `assets/[gamename]/`
4. **Documentation**: Update this file with new game info
5. **Testing**: Verify all game mechanics work correctly

#### Code Structure
```javascript
// Standard game module structure
module.exports = {
    // Game configuration
    config: { /* game settings */ },
    
    // Main game logic
    startGame: async (userId, bet) => { /* start logic */ },
    processAction: async (gameId, action) => { /* action handler */ },
    endGame: async (gameId) => { /* cleanup logic */ },
    
    // Utility functions
    calculatePayout: (bet, result) => { /* payout logic */ },
    validateAction: (action) => { /* validation logic */ },
    
    // Visual rendering
    renderGame: async (gameState) => { /* visual generation */ }
};
```

This comprehensive game system provides engaging entertainment while maintaining fair play and security standards throughout the ATIVE Casino Bot ecosystem.