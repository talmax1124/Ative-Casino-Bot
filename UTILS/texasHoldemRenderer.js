/**
 * Texas Hold'em Poker Visual Renderer for ATIVE Casino Bot
 * Creates beautiful poker table graphics with cards, chips, and player positions
 * Uses Canvas API for high-quality rendering
 */

const { createCanvas, loadImage, registerFont } = require('@napi-rs/canvas');
const path = require('path');
const logger = require('./logger');

// Table dimensions and styling - Enhanced for better visibility
const TABLE_WIDTH = 1400;
const TABLE_HEIGHT = 900;
const CARD_WIDTH = 180;
const CARD_HEIGHT = 252;
const CHIP_RADIUS = 25;

// Color scheme
const COLORS = {
    TABLE_GREEN: '#0F5132',
    TABLE_BORDER: '#8B4513',
    FELT_GRADIENT_START: '#2E7D32',
    FELT_GRADIENT_END: '#1B5E20',
    CARD_BACK: '#000080',
    GOLD: '#FFD700',
    WHITE: '#FFFFFF',
    BLACK: '#000000',
    RED: '#DC143C',
    BLUE: '#1E90FF',
    GRAY: '#808080',
    LIGHT_GRAY: '#D3D3D3'
};

// Player positions around the oval table perimeter - Optimized for Texas_Board.png
const PLAYER_POSITIONS = [
    { x: 700, y: 820, angle: 0, name: 'Bottom Center' },     // Seat 1 (bottom center)
    { x: 400, y: 770, angle: -20, name: 'Bottom Left' },     // Seat 2 (bottom left)
    { x: 150, y: 600, angle: -65, name: 'Left' },            // Seat 3 (left side)
    { x: 80, y: 450, angle: -90, name: 'Left Middle' },      // Seat 4 (left middle)
    { x: 150, y: 300, angle: -115, name: 'Top Left' },       // Seat 5 (left top)
    { x: 700, y: 80, angle: 180, name: 'Top Center' },       // Seat 6 (top center)
    { x: 1250, y: 300, angle: 115, name: 'Top Right' },      // Seat 7 (right top)
    { x: 1320, y: 450, angle: 90, name: 'Right Middle' },    // Seat 8 (right middle)
    { x: 1000, y: 770, angle: 20, name: 'Bottom Right' }     // Seat 9 (bottom right)
];

// Community card positions - Properly centered and evenly spaced with margins
const COMMUNITY_POSITIONS = {
    flop1: { x: 400, y: 450 },
    flop2: { x: 570, y: 450 },
    flop3: { x: 740, y: 450 },
    turn: { x: 910, y: 450 },
    river: { x: 1080, y: 450 }
};

class TexasHoldemRenderer {
    constructor() {
        this.cardImages = new Map();
        this.fontLoaded = false;
        this.initialize();
    }

    async initialize() {
        try {
            // Try to load custom fonts
            try {
                registerFont(path.join(__dirname, '../assets/fonts/Roboto-Bold.ttf'), { family: 'Roboto' });
                this.fontLoaded = true;
            } catch (fontError) {
                logger.warn('Custom font not found, using system fonts');
                this.fontLoaded = false;
            }

            // Preload card back image
            try {
                const cardBackPath = path.join(__dirname, '../assets/poker/card_back.png');
                this.cardBackImage = await loadImage(cardBackPath);
            } catch (error) {
                logger.warn('Card back image not found, will use colored rectangle');
                this.cardBackImage = null;
            }

            logger.info('Texas Hold\'em renderer initialized');
        } catch (error) {
            logger.error(`Error initializing Texas Hold'em renderer: ${error.message}`);
        }
    }

    /**
     * Create a poker table image with current game state
     */
    async createTableImage(gameState, viewingUserId = null) {
        try {
            const canvas = createCanvas(TABLE_WIDTH, TABLE_HEIGHT);
            const ctx = canvas.getContext('2d');

            // Draw table background
            await this.drawTableBackground(ctx);

            // Draw community cards
            await this.drawCommunityCards(ctx, gameState.communityCards, gameState.phase);

            // Pot information removed - now in embed instead

            // Draw player positions
            await this.drawPlayers(ctx, gameState.players, gameState.currentPlayer, viewingUserId);

            // Draw dealer button
            this.drawDealerButton(ctx, gameState.dealerPosition, gameState.players);

            // Draw game info
            this.drawGameInfo(ctx, gameState);

            return canvas.toBuffer('image/png');
        } catch (error) {
            logger.error(`Error creating poker table image: ${error.message}`);
            return null;
        }
    }

    /**
     * Draw the poker table background using custom Texas_Board.png
     */
    async drawTableBackground(ctx) {
        try {
            // Load the custom Texas board image
            const boardImagePath = path.join(__dirname, '..', 'assets', 'Texas_Board.png');
            const boardImage = await loadImage(boardImagePath);
            
            // Draw the custom background scaled to fit our table size
            ctx.drawImage(boardImage, 0, 0, TABLE_WIDTH, TABLE_HEIGHT);
            
        } catch (error) {
            logger.warn(`Could not load custom Texas_Board.png: ${error.message}, using fallback`);
            
            // Fallback to simplified design if image fails to load
            const outerGradient = ctx.createRadialGradient(
                TABLE_WIDTH / 2, TABLE_HEIGHT / 2, 50,
                TABLE_WIDTH / 2, TABLE_HEIGHT / 2, 700
            );
            outerGradient.addColorStop(0, '#388E3C');
            outerGradient.addColorStop(0.3, '#2E7D32');
            outerGradient.addColorStop(0.7, '#1B5E20');
            outerGradient.addColorStop(1, '#0F3518');

            // Draw fallback background
            ctx.fillStyle = '#654321';
            ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

            ctx.fillStyle = outerGradient;
            ctx.beginPath();
            ctx.ellipse(TABLE_WIDTH / 2, TABLE_HEIGHT / 2, TABLE_WIDTH / 2 - 60, TABLE_HEIGHT / 2 - 60, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = COLORS.GOLD;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.ellipse(TABLE_WIDTH / 2, TABLE_HEIGHT / 2, TABLE_WIDTH / 2 - 80, TABLE_HEIGHT / 2 - 80, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    /**
     * Draw community cards area
     */
    async drawCommunityCards(ctx, communityCards, phase) {
        const positions = Object.values(COMMUNITY_POSITIONS);
        
        // Simple community cards label - no background box
        const centerX = TABLE_WIDTH / 2;
        const labelY = 380;
        
        ctx.fillStyle = COLORS.WHITE;
        ctx.font = this.fontLoaded ? 'bold 18px Roboto' : 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('COMMUNITY CARDS', centerX, labelY);

        // Draw card positions
        for (let i = 0; i < 5; i++) {
            const pos = positions[i];
            
            if (i < communityCards.length) {
                // Draw actual card
                await this.drawCard(ctx, communityCards[i], pos.x, pos.y, false);
            } else {
                // Draw subtle placeholder - just a very faint rectangle
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.fillRect(pos.x - CARD_WIDTH/2, pos.y - CARD_HEIGHT/2, CARD_WIDTH, CARD_HEIGHT);
            }
        }

        // Enhanced phase labels with corrected positioning
        if (communityCards.length >= 3) {
            ctx.fillStyle = COLORS.GOLD;
            ctx.font = this.fontLoaded ? 'bold 14px Roboto' : 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('FLOP', 590, 540);
        }
        if (communityCards.length >= 4) {
            ctx.fillText('TURN', 810, 540);
        }
        if (communityCards.length >= 5) {
            ctx.fillText('RIVER', 910, 540);
        }
    }

    /**
     * Draw pot information - positioned above community cards
     */
    drawPotInfo(ctx, totalPot, pots = []) {
        const centerX = TABLE_WIDTH / 2;
        const potY = 280; // Position above the community cards area
        
        // Subtle pot display background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(centerX - 100, potY - 25, 200, 50, 10);
        ctx.fill();
        
        // Gold border for pot area
        ctx.strokeStyle = COLORS.GOLD;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(centerX - 100, potY - 25, 200, 50, 10);
        ctx.stroke();
        
        // Enhanced main pot display
        ctx.fillStyle = COLORS.GOLD;
        ctx.font = this.fontLoaded ? 'bold 28px Roboto' : 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`POT: $${totalPot.toLocaleString()}`, centerX, potY + 5);
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Side pots display below main pot, avoiding card overlap
        if (pots && pots.length > 1) {
            ctx.font = this.fontLoaded ? '12px Roboto' : '12px Arial';
            ctx.fillStyle = COLORS.WHITE;
            ctx.textAlign = 'center';
            let yOffset = 0;
            pots.forEach((pot, index) => {
                if (index > 0) { // Only show side pots, main pot is already displayed
                    const label = `Side Pot ${index}: $${pot.amount.toLocaleString()}`;
                    ctx.fillText(label, centerX, potY + 35 + yOffset);
                    yOffset += 18;
                }
            });
        }
        
        // Remove chip stacks - they were creating the blue circles overlapping cards
    }

    /**
     * Draw players around the table
     */
    async drawPlayers(ctx, players, currentPlayer, viewingUserId) {
        for (const player of players) {
            const position = PLAYER_POSITIONS[player.seatNumber];
            if (!position) continue;

            const isCurrentPlayer = currentPlayer && currentPlayer.userId === player.userId;
            const isViewingPlayer = player.userId === viewingUserId;

            // Draw player area background with enhanced visibility
            let bgColor = COLORS.WHITE;
            let borderColor = COLORS.BLACK;
            let borderWidth = 2;
            
            if (isCurrentPlayer) {
                bgColor = COLORS.GOLD;
                borderColor = COLORS.GOLD;
                borderWidth = 4;
            } else if (isViewingPlayer) {
                bgColor = COLORS.BLUE;
                borderColor = COLORS.BLUE;
                borderWidth = 3;
            } else if (player.hasFolded) {
                bgColor = COLORS.GRAY;
                borderColor = COLORS.GRAY;
            }
            
            // Draw cleaner player area background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.roundRect(position.x - 90, position.y - 80, 180, 160, 10);
            ctx.fill();
            
            // Draw border to indicate status
            if (isCurrentPlayer) {
                ctx.strokeStyle = COLORS.GOLD;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.roundRect(position.x - 90, position.y - 80, 180, 160, 10);
                ctx.stroke();
            }

            // Draw player name with background for better visibility
            const nameWidth = 160;
            const nameHeight = 28;
            
            // Name background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(position.x - nameWidth/2, position.y - 75, nameWidth, nameHeight);
            
            // Name text with better contrast
            ctx.fillStyle = isCurrentPlayer ? COLORS.GOLD : 
                           isViewingPlayer ? '#00FFFF' :
                           player.hasFolded ? COLORS.GRAY : COLORS.WHITE;
            ctx.font = this.fontLoaded ? 'bold 18px Roboto' : 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(player.username, position.x, position.y - 56);

            // Draw seat number
            ctx.fillStyle = isCurrentPlayer ? COLORS.BLACK : COLORS.LIGHT_GRAY;
            ctx.font = this.fontLoaded ? '12px Roboto' : '12px Arial';
            ctx.fillText(`Seat ${player.seatNumber + 1}`, position.x, position.y - 45);

            // Draw chip count with better formatting
            ctx.fillStyle = isCurrentPlayer ? COLORS.BLACK : COLORS.WHITE;
            ctx.font = this.fontLoaded ? 'bold 14px Roboto' : 'bold 14px Arial';
            ctx.fillText(`💰 $${player.chipCount.toLocaleString()}`, position.x, position.y - 25);

            // Draw current bet if any
            if (player.currentBet > 0) {
                ctx.fillStyle = COLORS.RED;
                ctx.font = this.fontLoaded ? '13px Roboto' : '13px Arial';
                ctx.fillText(`🎯 Bet: $${player.currentBet.toLocaleString()}`, position.x, position.y - 5);
            }

            // Draw status with icons
            let statusText = '';
            let statusColor = COLORS.WHITE;
            
            if (player.hasFolded) {
                statusText = '❌ FOLDED';
                statusColor = COLORS.RED;
            } else if (player.isAllIn) {
                statusText = '🚀 ALL-IN';
                statusColor = COLORS.GOLD;
            } else if (player.lastAction) {
                const actionEmojis = {
                    'check': '✅ CHECK',
                    'call': '📞 CALL',
                    'bet': '💰 BET',
                    'raise': '⬆️ RAISE',
                    'fold': '❌ FOLD'
                };
                statusText = actionEmojis[player.lastAction.toLowerCase()] || player.lastAction.toUpperCase();
                statusColor = COLORS.WHITE;
            } else if (isCurrentPlayer) {
                statusText = '⏰ THINKING...';
                statusColor = COLORS.GOLD;
            }
            
            if (statusText) {
                ctx.fillStyle = statusColor;
                ctx.font = this.fontLoaded ? '12px Roboto' : '12px Arial';
                ctx.fillText(statusText, position.x, position.y + 15);
            }

            // Draw hole cards - ALL CARDS ARE HIDDEN in main view (private cards sent via ephemeral)
            if (player.holeCards && player.holeCards.length === 2 && !player.hasFolded) {
                // Always draw face-down cards for all players in the main view
                await this.drawCard(ctx, null, position.x - 25, position.y + 40, true);
                await this.drawCard(ctx, null, position.x + 25, position.y + 40, true);
                
                // Add card count indicator
                ctx.fillStyle = COLORS.WHITE;
                ctx.font = this.fontLoaded ? '10px Roboto' : '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('🎴 2 Cards', position.x, position.y + 75);
            } else if (player.hasFolded && player.holeCards && player.holeCards.length === 2) {
                // Show folded cards differently
                ctx.fillStyle = COLORS.GRAY;
                ctx.fillRect(position.x - 30, position.y + 30, 25, 35);
                ctx.fillRect(position.x + 5, position.y + 30, 25, 35);
                ctx.strokeStyle = COLORS.RED;
                ctx.lineWidth = 2;
                ctx.strokeRect(position.x - 30, position.y + 30, 25, 35);
                ctx.strokeRect(position.x + 5, position.y + 30, 25, 35);
                
                // Draw fold indicator
                ctx.fillStyle = COLORS.RED;
                ctx.font = this.fontLoaded ? 'bold 12px Roboto' : 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('FOLDED', position.x, position.y + 75);
            }

            // Draw turn indicator
            if (isCurrentPlayer) {
                ctx.strokeStyle = COLORS.GOLD;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.roundRect(position.x - 105, position.y - 85, 210, 170, 10);
                ctx.stroke();
                
                // Arrow pointing to current player
                ctx.fillStyle = COLORS.GOLD;
                ctx.beginPath();
                ctx.moveTo(position.x, position.y - 100);
                ctx.lineTo(position.x - 10, position.y - 115);
                ctx.lineTo(position.x + 10, position.y - 115);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    /**
     * Draw a single playing card
     */
    async drawCard(ctx, card, x, y, faceDown = false) {
        const cardX = x - CARD_WIDTH / 2;
        const cardY = y - CARD_HEIGHT / 2;

        // Draw card shadow for 3D effect
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(cardX + 3, cardY + 3, CARD_WIDTH, CARD_HEIGHT);

        if (faceDown || !card) {
            // Draw enhanced card back
            if (this.cardBackImage) {
                ctx.drawImage(this.cardBackImage, cardX, cardY, CARD_WIDTH, CARD_HEIGHT);
            } else {
                // Enhanced fallback card back
                const gradient = ctx.createLinearGradient(cardX, cardY, cardX + CARD_WIDTH, cardY + CARD_HEIGHT);
                gradient.addColorStop(0, '#000080');
                gradient.addColorStop(0.5, '#0000CD');
                gradient.addColorStop(1, '#000080');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(cardX, cardY, CARD_WIDTH, CARD_HEIGHT);
                
                // Enhanced border
                ctx.strokeStyle = COLORS.GOLD;
                ctx.lineWidth = 3;
                ctx.strokeRect(cardX, cardY, CARD_WIDTH, CARD_HEIGHT);
                
                // Enhanced pattern
                ctx.fillStyle = COLORS.GOLD;
                ctx.font = this.fontLoaded ? 'bold 60px Roboto' : 'bold 60px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('♠', x, y + 10);
                
                // Inner border
                ctx.strokeStyle = COLORS.WHITE;
                ctx.lineWidth = 1;
                ctx.strokeRect(cardX + 5, cardY + 5, CARD_WIDTH - 10, CARD_HEIGHT - 10);
            }
            return;
        }

        try {
            // Try to load specific card image
            const cardImagePath = path.join(__dirname, `../assets/poker/${card.rank}_${card.suit.replace('️', '')}.png`);
            const cardImage = await loadImage(cardImagePath);
            ctx.drawImage(cardImage, cardX, cardY, CARD_WIDTH, CARD_HEIGHT);
            
            // Add subtle border to face-up cards for better definition
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 2;
            ctx.strokeRect(cardX, cardY, CARD_WIDTH, CARD_HEIGHT);
        } catch (error) {
            // Fallback: draw card manually with enhanced design
            this.drawCardManually(ctx, card, cardX, cardY);
        }
    }

    /**
     * Draw card manually when image is not available
     */
    drawCardManually(ctx, card, x, y) {
        // Draw card background
        ctx.fillStyle = COLORS.WHITE;
        ctx.fillRect(x, y, CARD_WIDTH, CARD_HEIGHT);
        ctx.strokeStyle = COLORS.BLACK;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, CARD_WIDTH, CARD_HEIGHT);

        // Draw rounded corners effect
        ctx.fillStyle = COLORS.WHITE;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, CARD_WIDTH - 4, CARD_HEIGHT - 4, 8);
        ctx.fill();
        ctx.stroke();

        // Determine card color
        const isRed = card.suit === '♥️' || card.suit === '♦️';
        ctx.fillStyle = isRed ? COLORS.RED : COLORS.BLACK;

        // Draw rank (top-left) - Enhanced size for larger cards
        ctx.font = this.fontLoaded ? 'bold 24px Roboto' : 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(card.rank, x + 12, y + 30);

        // Draw suit (top-left, below rank) - Enhanced size
        ctx.font = this.fontLoaded ? '20px Roboto' : '20px Arial';
        ctx.fillText(card.suit, x + 12, y + 50);

        // Draw large suit in center - Enhanced size for larger cards
        ctx.font = this.fontLoaded ? '60px Roboto' : '60px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(card.suit, x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2 + 15);

        // Draw rank (bottom-right, rotated) - Enhanced size
        ctx.save();
        ctx.translate(x + CARD_WIDTH - 12, y + CARD_HEIGHT - 12);
        ctx.rotate(Math.PI);
        ctx.font = this.fontLoaded ? 'bold 24px Roboto' : 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(card.rank, 0, 0);
        ctx.restore();

        // Draw suit (bottom-right, rotated) - Enhanced size
        ctx.save();
        ctx.translate(x + CARD_WIDTH - 12, y + CARD_HEIGHT - 35);
        ctx.rotate(Math.PI);
        ctx.font = this.fontLoaded ? '20px Roboto' : '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(card.suit, 0, 0);
        ctx.restore();
    }

    /**
     * Draw dealer button
     */
    drawDealerButton(ctx, dealerPosition, players) {
        const dealer = players.find(p => p.seatNumber === dealerPosition);
        if (!dealer) return;

        const position = PLAYER_POSITIONS[dealerPosition];
        if (!position) return;

        // Draw dealer button
        ctx.fillStyle = COLORS.WHITE;
        ctx.beginPath();
        ctx.arc(position.x + 60, position.y - 60, 15, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = COLORS.BLACK;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw "D" for dealer
        ctx.fillStyle = COLORS.BLACK;
        ctx.font = this.fontLoaded ? 'bold 16px Roboto' : 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('D', position.x + 60, position.y - 55);
    }

    /**
     * Draw chip stack representation
     */
    drawChipStack(ctx, x, y, amount) {
        const chipCount = Math.min(Math.floor(amount / 1000), 10);
        
        for (let i = 0; i < chipCount; i++) {
            const chipY = y - i * 3;
            
            // Draw chip shadow
            ctx.fillStyle = `${COLORS.BLACK}40`;
            ctx.beginPath();
            ctx.arc(x + 2, chipY + 2, CHIP_RADIUS, 0, 2 * Math.PI);
            ctx.fill();
            
            // Draw chip
            ctx.fillStyle = i % 2 === 0 ? COLORS.RED : COLORS.BLUE;
            ctx.beginPath();
            ctx.arc(x, chipY, CHIP_RADIUS, 0, 2 * Math.PI);
            ctx.fill();
            
            // Draw chip border
            ctx.strokeStyle = COLORS.WHITE;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    /**
     * Draw game information panel with enhanced win/end state display
     */
    drawGameInfo(ctx, gameState) {
        const panelX = 20;
        const panelY = 20;
        let panelWidth = 280;
        let panelHeight = 110;
        
        // Check if this is a finished hand or game end
        const isFinished = gameState.phase === 'finished' || gameState.phase === 'showdown';
        const hasWinner = gameState.payoutResults && gameState.payoutResults.length > 0;
        
        // Adjust panel size for end states
        if (isFinished || hasWinner) {
            panelHeight = 140;
            panelWidth = 320;
        }
        
        // Enhanced background for end states
        if (isFinished || hasWinner) {
            ctx.fillStyle = 'rgba(0, 100, 0, 0.9)'; // Green tint for winners
        } else {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        }
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 8);
        ctx.fill();
        
        // Enhanced border for end states
        ctx.strokeStyle = isFinished || hasWinner ? '#00FF00' : COLORS.GOLD;
        ctx.lineWidth = isFinished || hasWinner ? 3 : 2;
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 8);
        ctx.stroke();
        
        // Title based on game state
        ctx.fillStyle = isFinished || hasWinner ? '#00FF00' : COLORS.GOLD;
        ctx.font = this.fontLoaded ? 'bold 18px Roboto' : 'bold 18px Arial';
        ctx.textAlign = 'left';
        
        if (hasWinner) {
            ctx.fillText('🎉 HAND COMPLETE', panelX + 15, panelY + 25);
            
            // Show winner info
            ctx.fillStyle = COLORS.WHITE;
            ctx.font = this.fontLoaded ? '14px Roboto' : '14px Arial';
            const winner = gameState.payoutResults.find(p => p.won);
            if (winner) {
                const winnerName = winner.username && winner.username.length > 15 ? 
                    winner.username.substring(0, 15) + '...' : 
                    (winner.username || 'Player');
                ctx.fillText(`Winner: ${winnerName}`, panelX + 15, panelY + 45);
                ctx.fillText(`Won: $${winner.amount.toFixed(2)}`, panelX + 15, panelY + 65);
                ctx.fillText(`Hand: ${winner.handName || 'Uncontested'}`, panelX + 15, panelY + 85);
            }
        } else if (isFinished) {
            ctx.fillText('🏁 GAME ENDED', panelX + 15, panelY + 25);
        } else {
            ctx.fillText(`Hand #${gameState.handNumber}`, panelX + 15, panelY + 25);
        }
        
        // Regular game info for active games
        if (!isFinished && !hasWinner) {
            ctx.fillStyle = COLORS.WHITE;
            ctx.font = this.fontLoaded ? '14px Roboto' : '14px Arial';
            ctx.fillText(`Phase: ${gameState.phase}`, panelX + 15, panelY + 45);
            
            const activePlayers = gameState.players.filter(p => p.isActive).length;
            ctx.fillText(`Players: ${activePlayers}`, panelX + 15, panelY + 65);
            
            if (gameState.blinds) {
                ctx.fillText(`Blinds: $${gameState.blinds.small}/$${gameState.blinds.big}`, panelX + 15, panelY + 85);
            }
            
            // Current turn indicator
            if (gameState.currentPlayer && gameState.currentPlayer.username) {
                ctx.fillStyle = COLORS.GOLD;
                const username = gameState.currentPlayer.username.length > 12 ? 
                    gameState.currentPlayer.username.substring(0, 12) + '...' : 
                    gameState.currentPlayer.username;
                ctx.fillText(`Turn: ${username}`, panelX + 15, panelY + 105);
            }
        } else {
            // Show next hand countdown or game status
            ctx.fillStyle = COLORS.WHITE;
            ctx.font = this.fontLoaded ? '12px Roboto' : '12px Arial';
            if (gameState.nextHandIn) {
                ctx.fillText(`Next hand in: ${gameState.nextHandIn}s`, panelX + 15, panelY + 105);
            } else {
                ctx.fillText('Preparing next hand...', panelX + 15, panelY + 105);
            }
        }
    }

    /**
     * Create a simplified hand result image for showdown
     */
    async createHandResultImage(playerHands, communityCards, winners) {
        try {
            // Enhanced size for better presentation
            const canvas = createCanvas(1200, 800);
            const ctx = canvas.getContext('2d');

            // Enhanced background with radial gradient
            const radialGradient = ctx.createRadialGradient(600, 400, 0, 600, 400, 600);
            radialGradient.addColorStop(0, '#2E7D32');
            radialGradient.addColorStop(0.7, '#1B5E20');
            radialGradient.addColorStop(1, '#0F3518');
            ctx.fillStyle = radialGradient;
            ctx.fillRect(0, 0, 1200, 800);

            // Add poker table pattern
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.1)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 12; i++) {
                ctx.beginPath();
                ctx.arc(600, 400, 50 + i * 40, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Enhanced title with shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;

            ctx.fillStyle = COLORS.GOLD;
            ctx.font = this.fontLoaded ? 'bold 48px Roboto' : 'bold 48px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🏆 SHOWDOWN RESULTS 🏆', 600, 80);

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Community cards section with enhanced styling
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(150, 120, 900, 140);
            ctx.strokeStyle = COLORS.GOLD;
            ctx.lineWidth = 3;
            ctx.strokeRect(150, 120, 900, 140);

            ctx.fillStyle = COLORS.WHITE;
            ctx.font = this.fontLoaded ? 'bold 24px Roboto' : 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('COMMUNITY CARDS', 600, 150);

            // Draw community cards with enhanced spacing
            const cardSpacing = 140;
            const startX = 600 - (communityCards.length - 1) * cardSpacing / 2;
            for (let i = 0; i < communityCards.length; i++) {
                await this.drawCard(ctx, communityCards[i], startX + i * cardSpacing, 210, false);
            }

            // Enhanced player hands section
            let yOffset = 320;
            const playerEntries = Object.entries(playerHands);

            for (let i = 0; i < playerEntries.length; i++) {
                const [userId, hand] = playerEntries[i];
                const isWinner = winners.includes(userId);

                // Player background box
                const boxY = yOffset - 30;
                const boxHeight = 100;

                if (isWinner) {
                    // Winner box with golden gradient
                    const winnerGradient = ctx.createLinearGradient(50, boxY, 1150, boxY);
                    winnerGradient.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
                    winnerGradient.addColorStop(0.5, 'rgba(255, 193, 7, 0.9)');
                    winnerGradient.addColorStop(1, 'rgba(255, 215, 0, 0.8)');
                    ctx.fillStyle = winnerGradient;
                    ctx.fillRect(50, boxY, 1100, boxHeight);

                    // Winner border
                    ctx.strokeStyle = COLORS.GOLD;
                    ctx.lineWidth = 4;
                    ctx.strokeRect(50, boxY, 1100, boxHeight);
                } else {
                    // Regular player box
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.fillRect(50, boxY, 1100, boxHeight);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(50, boxY, 1100, boxHeight);
                }

                // Player name and hand
                ctx.fillStyle = isWinner ? '#1A1A1A' : COLORS.WHITE;
                ctx.font = this.fontLoaded ? (isWinner ? 'bold 24px Roboto' : 'bold 20px Roboto') : (isWinner ? 'bold 24px Arial' : 'bold 20px Arial');
                ctx.textAlign = 'left';
                ctx.fillText(hand.playerName, 80, yOffset + 10);

                ctx.font = this.fontLoaded ? (isWinner ? 'bold 20px Roboto' : '18px Roboto') : (isWinner ? 'bold 20px Arial' : '18px Arial');
                ctx.fillText(hand.handName, 80, yOffset + 35);

                // Draw player's hole cards with enhanced positioning
                if (hand.holeCards && hand.holeCards.length === 2) {
                    await this.drawCard(ctx, hand.holeCards[0], 450, yOffset + 5, false);
                    await this.drawCard(ctx, hand.holeCards[1], 590, yOffset + 5, false);
                }

                // Winner crown and text
                if (isWinner) {
                    ctx.fillStyle = '#1A1A1A';
                    ctx.font = this.fontLoaded ? 'bold 32px Roboto' : 'bold 32px Arial';
                    ctx.textAlign = 'right';
                    ctx.fillText('👑 WINNER! 👑', 1070, yOffset + 20);
                }

                yOffset += 120;
            }

            return canvas.toBuffer('image/png');
        } catch (error) {
            logger.error(`Error creating hand result image: ${error.message}`);
            return null;
        }
    }

    /**
     * Create a private hand image for a specific player (for ephemeral messages)
     */
    async createPrivateHandImage(player, communityCards = []) {
        try {
            const canvas = createCanvas(400, 300);
            const ctx = canvas.getContext('2d');

            // Background
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, COLORS.BLUE);
            gradient.addColorStop(1, COLORS.FELT_GRADIENT_END);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 400, 300);

            // Title
            ctx.fillStyle = COLORS.WHITE;
            ctx.font = this.fontLoaded ? 'bold 24px Roboto' : 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🎴 Your Private Hand', 200, 40);

            // Player's hole cards
            if (player.holeCards && player.holeCards.length === 2) {
                await this.drawCard(ctx, player.holeCards[0], 150, 120, false);
                await this.drawCard(ctx, player.holeCards[1], 250, 120, false);
                
                // Card labels
                ctx.fillStyle = COLORS.WHITE;
                ctx.font = this.fontLoaded ? '14px Roboto' : '14px Arial';
                ctx.fillText('Card 1', 150, 200);
                ctx.fillText('Card 2', 250, 200);
            }

            // Player info
            ctx.fillStyle = COLORS.WHITE;
            ctx.font = this.fontLoaded ? '16px Roboto' : '16px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`💰 Chips: ${player.chipCount.toLocaleString()}`, 20, 250);
            ctx.fillText(`🪑 Seat: ${player.seatNumber + 1}`, 20, 270);
            
            if (player.currentBet > 0) {
                ctx.fillText(`🎯 Current Bet: ${player.currentBet.toLocaleString()}`, 220, 250);
            }

            return canvas.toBuffer('image/png');
        } catch (error) {
            logger.error(`Error creating private hand image: ${error.message}`);
            return null;
        }
    }
}

module.exports = TexasHoldemRenderer;