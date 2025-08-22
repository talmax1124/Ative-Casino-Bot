/**
 * Game Panel Utility for ATIVE Casino Bot
 * Creates standardized game panels based on reference.png design
 */

const Canvas = require('canvas');
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
}

module.exports = { GamePanelUtil };