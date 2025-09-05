/**
 * Game Panel Utility for ATIVE Casino Bot
 * Creates standardized game panels based on reference.png design
 */

// Optional Canvas - some features may not work if Canvas fails to load
let Canvas;
try {
    Canvas = require('canvas');
} catch (error) {
    console.warn('Canvas module not available - image generation disabled');
    Canvas = null;
}
const { fmt } = require('./common');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

class GamePanelUtil {
    constructor() {
        this.PANEL_WIDTH = 1000;
        this.PANEL_HEIGHT = 600;
        this.BORDER_COLOR = '#00ff41'; // Green border like in reference
        this.BACKGROUND_DARK = '#1a1a1a';
        this.BACKGROUND_LIGHT = '#2a2a2a';
        this.TEXT_WHITE = '#ffffff';
        this.TEXT_GOLD = '#FFD700';
        this.SECTION_BG = '#333333';
    }

    /**
     * Create a standardized game panel
     * @param {Object} config - Panel configuration
     * @returns {Buffer} Canvas buffer
     */
    async createGamePanel(config) {
        const {
            gameName,
            userName,
            gameSession,
            playerSection,
            dealerSection,
            resultSection,
            bankingSection,
            gameArea,
            actionButtons
        } = config;

        const canvas = Canvas.createCanvas(this.PANEL_WIDTH, this.PANEL_HEIGHT);
        const ctx = canvas.getContext('2d');

        // Background
        await this.drawBackground(ctx);
        
        // Border
        await this.drawBorder(ctx);
        
        // Header with game name and session
        await this.drawHeader(ctx, gameName, userName, gameSession);
        
        // Main sections
        await this.drawSections(ctx, {
            playerSection,
            dealerSection,
            resultSection
        });
        
        // Banking section
        if (bankingSection) {
            await this.drawBankingSection(ctx, bankingSection);
        }
        
        // Game area (cards, board, etc.)
        if (gameArea) {
            await this.drawGameArea(ctx, gameArea);
        }

        return canvas.toBuffer();
    }

    /**
     * Create a blackjack table image with cards only (no text panels)
     * @param {Object} config - Blackjack table configuration
     * @returns {Buffer} Canvas buffer
     */
    async createBlackjackTableImage(config) {
        const {
            playerCards,
            dealerCards,
            showDealerCard = false,
            splitHands = []
        } = config;

        const canvas = Canvas.createCanvas(800, 500);
        const ctx = canvas.getContext('2d');

        // Load and draw board
        await this.drawBlackjackBoard(ctx, 800, 500);

        // Draw cards on the board
        await this.drawBlackjackCards(ctx, {
            playerCards,
            dealerCards,
            showDealerCard,
            splitHands
        });

        return canvas.toBuffer();
    }

    /**
     * Create a blackjack panel with card alignment (DEPRECATED - use text formatting instead)
     * @param {Object} config - Blackjack configuration
     * @returns {Buffer} Canvas buffer
     */
    async createBlackjackPanel(config) {
        const {
            userName,
            playerCards,
            dealerCards,
            playerValue,
            dealerValue,
            wallet,
            bank,
            bet,
            result,
            gameStatus,
            showDealerCard = false,
            splitHands = []
        } = config;

        const canvas = Canvas.createCanvas(this.PANEL_WIDTH, this.PANEL_HEIGHT);
        const ctx = canvas.getContext('2d');

        // Background
        await this.drawBackground(ctx);
        
        // Border
        await this.drawBorder(ctx);
        
        // Header
        await this.drawHeader(ctx, 'BLACKJACK', userName, gameStatus);

        // Load and draw board
        await this.drawBlackjackBoard(ctx);

        // Draw sections
        await this.drawBlackjackSections(ctx, {
            playerCards,
            dealerCards,
            playerValue,
            dealerValue,
            result,
            showDealerCard,
            splitHands
        });

        // Banking section
        await this.drawBankingSection(ctx, {
            wallet,
            bank,
            bet
        });

        // Draw cards on the board
        await this.drawBlackjackCards(ctx, {
            playerCards,
            dealerCards,
            showDealerCard,
            splitHands
        });

        return canvas.toBuffer();
    }

    /**
     * Draw background gradient
     */
    async drawBackground(ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, this.PANEL_HEIGHT);
        gradient.addColorStop(0, this.BACKGROUND_DARK);
        gradient.addColorStop(1, this.BACKGROUND_LIGHT);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.PANEL_WIDTH, this.PANEL_HEIGHT);
    }

    /**
     * Draw green border
     */
    async drawBorder(ctx) {
        ctx.strokeStyle = this.BORDER_COLOR;
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, this.PANEL_WIDTH - 4, this.PANEL_HEIGHT - 4);
    }

    /**
     * Draw header section
     */
    async drawHeader(ctx, gameName, userName, gameSession) {
        const headerHeight = 80;
        
        // Header background
        ctx.fillStyle = this.SECTION_BG;
        ctx.fillRect(10, 10, this.PANEL_WIDTH - 20, headerHeight);
        
        // Game title
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = this.TEXT_WHITE;
        ctx.textAlign = 'center';
        ctx.fillText(`${userName}'s ${gameName} ${gameSession || 'Session'}`, this.PANEL_WIDTH / 2, 50);
    }

    /**
     * Draw main game sections (Player Cards, Dealer Cards, Result)
     */
    async drawSections(ctx, { playerSection, dealerSection, resultSection }) {
        const sectionY = 100;
        const sectionHeight = 60;
        const sectionWidth = 300;
        const spacing = 50;

        // Player section
        if (playerSection) {
            ctx.fillStyle = this.SECTION_BG;
            ctx.fillRect(50, sectionY, sectionWidth, sectionHeight);
            
            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = this.TEXT_WHITE;
            ctx.textAlign = 'left';
            ctx.fillText('PLAYER CARDS', 60, sectionY + 25);
            
            ctx.font = '14px Arial';
            ctx.fillText(playerSection.value || '', 60, sectionY + 45);
        }

        // Dealer section
        if (dealerSection) {
            ctx.fillStyle = this.SECTION_BG;
            ctx.fillRect(350, sectionY, sectionWidth, sectionHeight);
            
            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = this.TEXT_WHITE;
            ctx.textAlign = 'left';
            ctx.fillText('DEALER CARDS', 360, sectionY + 25);
            
            ctx.font = '14px Arial';
            ctx.fillText(dealerSection.value || '', 360, sectionY + 45);
        }

        // Result section
        if (resultSection) {
            ctx.fillStyle = this.SECTION_BG;
            ctx.fillRect(700, sectionY, sectionWidth - 50, sectionHeight);
            
            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = this.TEXT_WHITE;
            ctx.textAlign = 'left';
            ctx.fillText('RESULT', 710, sectionY + 25);
            
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = resultSection.color || this.TEXT_WHITE;
            ctx.fillText(resultSection.value || '', 710, sectionY + 45);
        }
    }

    /**
     * Draw banking section
     */
    async drawBankingSection(ctx, { wallet, bank, bet }) {
        const bankingY = 180;
        const bankingHeight = 60;
        
        // Banking background
        ctx.fillStyle = this.SECTION_BG;
        ctx.fillRect(50, bankingY, this.PANEL_WIDTH - 100, bankingHeight);
        
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = this.TEXT_WHITE;
        ctx.textAlign = 'left';
        ctx.fillText('BANKING', 60, bankingY + 25);
        
        // Wallet and bank info
        ctx.font = '14px Arial';
        if (wallet !== undefined) {
            ctx.fillText(`💵 ${fmt(wallet)} (${this.formatShort(wallet)})`, 200, bankingY + 25);
        }
        if (bank !== undefined) {
            ctx.fillText(`🏦 ${fmt(bank)} (${this.formatShort(bank)})`, 500, bankingY + 25);
        }
        if (bet !== undefined) {
            ctx.fillText(`🎯 Bet: ${fmt(bet)}`, 60, bankingY + 45);
        }
    }

    /**
     * Draw blackjack board
     */
    async drawBlackjackBoard(ctx, width = null, height = null) {
        const boardWidth = width || (this.PANEL_WIDTH - 100);
        const boardHeight = height || 240;
        try {
            const boardPath = path.join(__dirname, '../assets/blackjack/board.png');
            const boardImage = await Canvas.loadImage(boardPath);
            
            // Draw board
            const boardX = width ? 0 : 50;
            const boardY = width ? 0 : 260;
            
            ctx.drawImage(boardImage, boardX, boardY, boardWidth, boardHeight);
        } catch (error) {
            logger.error(`Error loading blackjack board: ${error.message}`);
            
            // Fallback: draw a green rectangle
            ctx.fillStyle = '#0d5d2a';
            ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
            
            // Draw table outline
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 3;
            ctx.strokeRect(boardX, boardY, boardWidth, boardHeight);
        }
    }

    /**
     * Draw blackjack-specific sections
     */
    async drawBlackjackSections(ctx, { playerCards, dealerCards, playerValue, dealerValue, result, showDealerCard, splitHands }) {
        // Player section
        let playerDisplay = '';
        if (splitHands && splitHands.length > 0) {
            splitHands.forEach((hand, index) => {
                playerDisplay += `Hand ${index + 1}: ${hand.cards} (${hand.value}) `;
            });
        } else {
            playerDisplay = `${playerCards} (${playerValue})`;
        }

        // Dealer section
        const dealerDisplay = showDealerCard ? 
            `${dealerCards} (${dealerValue})` : 
            `${dealerCards.split(' ')[0]} + Hidden Card`;

        await this.drawSections(ctx, {
            playerSection: { value: playerDisplay },
            dealerSection: { value: dealerDisplay },
            resultSection: result ? { 
                value: result, 
                color: result.includes('WIN') ? '#00ff00' : result.includes('LOSE') ? '#ff0000' : this.TEXT_GOLD 
            } : null
        });
    }

    /**
     * Draw cards on the blackjack board
     */
    async drawBlackjackCards(ctx, { playerCards, dealerCards, showDealerCard, splitHands }) {
        const cardWidth = 90;   // Optimal card size
        const cardHeight = 135; // Optimal card size
        const canvasWidth = 800;
        const canvasHeight = 500;
        
        // Calculate center positions for better centering
        const dealerY = 80;  // Moved dealer cards lower
        const playerY = 300; // Moved player cards up slightly
        
        // Center the dealer cards horizontally
        const dealerCardList = this.parseCards(dealerCards);
        const dealerTotalWidth = (dealerCardList.length * cardWidth) + ((dealerCardList.length - 1) * 15);
        let dealerX = (canvasWidth - dealerTotalWidth) / 2;
        
        // Center the player cards horizontally  
        let playerX = 50; // Will be recalculated for each hand

        try {
            // Draw dealer cards
            const dealerCardList = this.parseCards(dealerCards);
            for (let i = 0; i < dealerCardList.length; i++) {
                if (i === 1 && !showDealerCard) {
                    // Draw card back for hidden card
                    await this.drawCardBack(ctx, dealerX, dealerY, cardWidth, cardHeight);
                } else {
                    await this.drawCard(ctx, dealerCardList[i], dealerX, dealerY, cardWidth, cardHeight);
                }
                dealerX += cardWidth + 15;
            }

            // Draw player cards
            if (splitHands && splitHands.length > 0) {
                // Calculate total width for all split hands to center them
                let totalHandsWidth = 0;
                for (const hand of splitHands) {
                    const handCardList = this.parseCards(hand.toString());
                    totalHandsWidth += (handCardList.length * cardWidth) + ((handCardList.length - 1) * 15) + 30; // 30 for space between hands
                }
                totalHandsWidth -= 30; // Remove extra space after last hand
                
                let handStartX = (canvasWidth - totalHandsWidth) / 2;
                
                for (let handIndex = 0; handIndex < splitHands.length; handIndex++) {
                    const hand = splitHands[handIndex];
                    const handCardList = this.parseCards(hand.toString());
                    let handX = handStartX;
                    
                    for (const card of handCardList) {
                        await this.drawCard(ctx, card, handX, playerY, cardWidth, cardHeight);
                        handX += cardWidth + 15;
                    }
                    
                    // Move to next hand position
                    handStartX = handX + 30;
                }
            } else {
                // Center regular hand
                const playerCardList = this.parseCards(playerCards);
                const playerTotalWidth = (playerCardList.length * cardWidth) + ((playerCardList.length - 1) * 15);
                playerX = (canvasWidth - playerTotalWidth) / 2;
                
                for (const card of playerCardList) {
                    await this.drawCard(ctx, card, playerX, playerY, cardWidth, cardHeight);
                    playerX += cardWidth + 15;
                }
            }

        } catch (error) {
            logger.error(`Error drawing cards: ${error.message}`);
        }
    }

    /**
     * Draw a playing card
     */
    async drawCard(ctx, card, x, y, width, height) {
        try {
            const cardImagePath = this.getCardImagePath(card);
            if (!cardImagePath) {
                throw new Error(`No image path found for card: ${card}`);
            }
            
            const cardImage = await Canvas.loadImage(cardImagePath);
            ctx.drawImage(cardImage, x, y, width, height);
            
        } catch (error) {
            logger.error(`Failed to load card image for ${card}: ${error.message}`);
            
            // Fallback: draw a styled card rectangle with text
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, width, height);
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
            
            // Card corners
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 3, y + 3, width - 6, height - 6);
            
            // Card text
            ctx.fillStyle = card.includes('♥️') || card.includes('♦️') ? '#dc2626' : '#000000';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(card, x + width/2, y + height/2);
        }
    }

    /**
     * Draw card back
     */
    async drawCardBack(ctx, x, y, width, height) {
        // Draw card back with casino theme
        ctx.fillStyle = '#0f172a'; // Dark slate background
        ctx.fillRect(x, y, width, height);
        
        // Border
        ctx.strokeStyle = '#fbbf24'; // Golden border
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);
        
        // Inner border
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
        
        // Draw ATIVE pattern
        ctx.fillStyle = '#fbbf24'; // Gold text
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎰', x + width/2, y + height/2 - 15);
        ctx.font = 'bold 14px Arial';
        ctx.fillText('ATIVE', x + width/2, y + height/2 + 5);
        ctx.font = 'bold 10px Arial';
        ctx.fillText('CASINO', x + width/2, y + height/2 + 20);
    }

    /**
     * Get card image path from card string
     */
    getCardImagePath(cardString) {
        // Parse card string like "A♠" or "10♥"
        const card = cardString.trim();
        
        // Extract rank and suit from card notation
        let rank = '';
        let suit = '';
        
        // Handle multi-character ranks (10)
        if (card.startsWith('10')) {
            rank = '10';
            suit = card.slice(2);
        } else {
            rank = card.slice(0, 1);
            suit = card.slice(1);
        }
        
        // Map suit symbols to folder names
        const suitMap = {
            '♠️': 'Spades',
            '♥️': 'Hearts', 
            '♦️': 'Diamonds',
            '♣️': 'Clubs',
            '♠': 'Spades',
            '♥': 'Hearts', 
            '♦': 'Diamonds',
            '♣': 'Clubs'
        };
        
        // Map rank names to file names
        const rankMap = {
            'A': 'Ace',
            '2': 'Two',
            '3': 'Three', 
            '4': 'Four',
            '5': 'Five',
            '6': 'Six',
            '7': 'Seven',
            '8': 'Eight',
            '9': 'Nine',
            '10': 'Ten',
            'J': 'Jack',
            'Q': 'Queen',
            'K': 'King'
        };
        
        const suitFolder = suitMap[suit];
        const rankName = rankMap[rank];
        
        if (!suitFolder || !rankName) {
            logger.error(`Invalid card: ${cardString}, rank: ${rank}, suit: ${suit}`);
            return null;
        }
        
        const fileName = `${rankName}_${suitFolder}.jpg`;
        return path.join(__dirname, '../assets/blackjack', suitFolder, fileName);
    }

    /**
     * Parse card string into individual cards
     */
    parseCards(cardsString) {
        if (!cardsString) return [];
        // Split by spaces to separate individual cards like "A♠ K♥ 10♦"
        return cardsString.split(' ').map(card => card.trim()).filter(card => card.length > 0);
    }

    /**
     * Format large numbers with suffixes
     */
    formatShort(amount) {
        const num = parseFloat(amount);
        if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    /**
     * Create action buttons matching reference.png style
     */
    createActionButtons() {
        const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
        
        const hitButton = new ButtonBuilder()
            .setCustomId('blackjack_hit')
            .setLabel('Hit')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🃏');

        const standButton = new ButtonBuilder()
            .setCustomId('blackjack_stand')
            .setLabel('Stand')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('✋');

        const doubleButton = new ButtonBuilder()
            .setCustomId('blackjack_double')
            .setLabel('Double Down')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('💰');

        const splitButton = new ButtonBuilder()
            .setCustomId('blackjack_split')
            .setLabel('Split')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✂️');

        const helpButton = new ButtonBuilder()
            .setCustomId('blackjack_help')
            .setLabel('?')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❓');

        return new ActionRowBuilder().addComponents(hitButton, standButton, doubleButton, splitButton, helpButton);
    }

    /**
     * Create American Roulette wheel visualization
     * @param {Object} config - Roulette configuration
     * @returns {Buffer} Canvas buffer
     */
    async createRouletteWheel(config) {
        if (!Canvas) {
            logger.warn('Canvas not available for roulette wheel generation');
            return null;
        }

        try {
            const {
                result = null,
                currentBet = null,
                isSpinning = false,
                showResult = false
            } = config;

            // Larger canvas for better visibility
            const canvas = Canvas.createCanvas(1000, 800);
            const ctx = canvas.getContext('2d');

            // Background with gradient
            const bgGradient = ctx.createRadialGradient(500, 400, 0, 500, 400, 600);
            bgGradient.addColorStop(0, '#1a1a2e');
            bgGradient.addColorStop(1, '#16213e');
            ctx.fillStyle = bgGradient;
            ctx.fillRect(0, 0, 1000, 800);

            // Draw outer wheel (larger)
            const centerX = 500;
            const centerY = 400;
            const wheelRadius = 280; // Increased from 200

            // Multiple outer rings for depth
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, wheelRadius + 30 - (i * 3), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(139, 69, 19, ${0.8 - i * 0.15})`;
                ctx.fill();
                ctx.strokeStyle = i === 0 ? '#FFD700' : this.BORDER_COLOR;
                ctx.lineWidth = i === 0 ? 6 : 2;
                ctx.stroke();
            }

            // American roulette numbers in proper order
            const wheelNumbers = [
                0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00',
                27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2
            ];

            const anglePerSlot = (Math.PI * 2) / 38;
            
            // Wheel rotation for spinning effect with frame-based animation
            let wheelRotation = 0;
            if (isSpinning) {
                // Use a frame counter instead of time for smoother, consistent animation
                const frameIndex = config.frameIndex || 0;
                wheelRotation = (frameIndex * 6) * (Math.PI / 180); // 6 degrees per frame
            }
            
            // Draw wheel segments with rotation
            wheelNumbers.forEach((num, index) => {
                const baseAngle = index * anglePerSlot;
                const angle = baseAngle + wheelRotation;
                const isGreen = num === 0 || num === '00';
                const isRed = !isGreen && [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(num);
                
                // Enhanced segment colors with gradients
                let color, shadowColor;
                if (isGreen) {
                    color = '#228B22';
                    shadowColor = '#006400';
                } else if (isRed) {
                    color = '#DC143C';
                    shadowColor = '#8B0000';
                } else {
                    color = '#2F2F2F';
                    shadowColor = '#000000';
                }

                // Draw segment with gradient
                const gradient = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, wheelRadius);
                gradient.addColorStop(0, color);
                gradient.addColorStop(0.7, color);
                gradient.addColorStop(1, shadowColor);

                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, wheelRadius, angle, angle + anglePerSlot);
                ctx.closePath();
                ctx.fillStyle = gradient;
                ctx.fill();
                
                // Enhanced borders
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Draw number with better positioning and styling
                const textRadius = wheelRadius - 45; // Increased margin
                const textX = centerX + Math.cos(angle + anglePerSlot/2) * textRadius;
                const textY = centerY + Math.sin(angle + anglePerSlot/2) * textRadius;
                
                ctx.save();
                ctx.translate(textX, textY);
                ctx.rotate(angle + anglePerSlot/2 + Math.PI/2);
                
                // Text shadow for better readability
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.font = 'bold 20px Arial'; // Larger font
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(num.toString(), 1, 1);
                
                // Actual text
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(num.toString(), 0, 0);
                ctx.restore();

                // Highlight winning number with pulsing effect
                if (showResult && result !== null && num === result) {
                    const time = Date.now();
                    const pulseAlpha = 0.3 + 0.3 * Math.sin(time / 200);
                    
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.arc(centerX, centerY, wheelRadius, angle, angle + anglePerSlot);
                    ctx.closePath();
                    ctx.fillStyle = `rgba(255, 215, 0, ${pulseAlpha})`;
                    ctx.fill();
                    ctx.strokeStyle = '#FFD700';
                    ctx.lineWidth = 6;
                    ctx.stroke();
                    
                    // Extra glow effect
                    ctx.shadowColor = '#FFD700';
                    ctx.shadowBlur = 20;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
            });

            // Enhanced inner circle with depth
            const innerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 70);
            innerGradient.addColorStop(0, '#D2691E');
            innerGradient.addColorStop(0.7, '#8B4513');
            innerGradient.addColorStop(1, '#654321');
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, 70, 0, Math.PI * 2);
            ctx.fillStyle = innerGradient;
            ctx.fill();
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Inner inner circle for more depth
            ctx.beginPath();
            ctx.arc(centerX, centerY, 35, 0, Math.PI * 2);
            ctx.fillStyle = '#654321';
            ctx.fill();
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Ball (always visible now, either spinning or at result)
            let ballAngle;
            if (showResult && result !== null) {
                const resultIndex = wheelNumbers.findIndex(n => n === result);
                ballAngle = resultIndex * anglePerSlot + anglePerSlot/2 + wheelRotation;
            } else {
                // Constant spinning ball animation - opposite direction to wheel  
                const frameIndex = config.frameIndex || 0;
                const baseSpeed = (frameIndex * 12) * (Math.PI / 180); // Faster than wheel, 12 degrees per frame
                const wobble = Math.sin(frameIndex * 0.3) * 0.4; // Enhanced wobble
                ballAngle = -baseSpeed + wobble; // Negative for opposite direction
            }

            // Enhanced ball positioning and size
            const ballRadius = wheelRadius - 25 + (isSpinning ? Math.sin(Date.now() / 200) * 8 : 0); // More dramatic radius variation
            const ballX = centerX + Math.cos(ballAngle) * ballRadius;
            const ballY = centerY + Math.sin(ballAngle) * ballRadius;

            // Ball glow effect
            if (isSpinning) {
                ctx.shadowColor = '#FFFFFF';
                ctx.shadowBlur = 15;
            }

            // Larger ball with gradient
            const ballGradient = ctx.createRadialGradient(ballX - 3, ballY - 3, 0, ballX, ballY, 15);
            ballGradient.addColorStop(0, '#FFFFFF');
            ballGradient.addColorStop(0.7, '#F0F0F0');
            ballGradient.addColorStop(1, '#C0C0C0');

            ctx.beginPath();
            ctx.arc(ballX, ballY, 15, 0, Math.PI * 2); // Larger ball
            ctx.fillStyle = ballGradient;
            ctx.fill();
            ctx.shadowBlur = 0;
            
            ctx.strokeStyle = '#808080';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Enhanced ball trail effect when spinning
            if (isSpinning) {
                const trailLength = 8;
                for (let i = 1; i <= trailLength; i++) {
                    const alpha = 0.6 - (i * 0.08);
                    const trailAngle = ballAngle - (i * 0.4);
                    const trailRadius = ballRadius - (i * 3);
                    const trailX = centerX + Math.cos(trailAngle) * trailRadius;
                    const trailY = centerY + Math.sin(trailAngle) * trailRadius;
                    const trailSize = 15 - (i * 1.5);
                    
                    ctx.globalAlpha = alpha;
                    const trailGradient = ctx.createRadialGradient(trailX, trailY, 0, trailX, trailY, trailSize);
                    trailGradient.addColorStop(0, '#FFFFFF');
                    trailGradient.addColorStop(1, '#CCCCCC');
                    
                    ctx.beginPath();
                    ctx.arc(trailX, trailY, trailSize, 0, Math.PI * 2);
                    ctx.fillStyle = trailGradient;
                    ctx.fill();
                }
                ctx.globalAlpha = 1.0;
            }

            // No text overlays - clean roulette wheel only

            return canvas.toBuffer('image/png');
        } catch (error) {
            logger.error(`Error creating roulette wheel: ${error.message}`);
            return null;
        }
    }

    /**
     * Get number color for roulette
     * @param {number|string} number 
     * @returns {string}
     */
    getNumberColor(number) {
        if (number === 0 || number === '00') return 'green';
        const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        return redNumbers.includes(Number(number)) ? 'red' : 'black';
    }

    // Removed payout image generation - now using text-based embeds for better performance
}

module.exports = { GamePanelUtil };