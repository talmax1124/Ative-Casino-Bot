/**
 * Blackjack Canvas Image Generation for ATIVE Casino Bot
 * Creates visual card representations and game states
 */

const { createCanvas } = require('canvas');
const logger = require('./logger');

/**
 * Create a visual representation of a blackjack game
 */
function createBlackjackImage(playerHand, dealerHand, gameEnded = false, result = null) {
    try {
        const width = 800;
        const height = 600;
        const cardWidth = 80;
        const cardHeight = 120;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#0F5132'; // Dark green casino table
        ctx.fillRect(0, 0, width, height);
        
        // Table pattern
        ctx.strokeStyle = '#1e7e34';
        ctx.lineWidth = 2;
        for (let i = 0; i < width; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }
        for (let i = 0; i < height; i += 50) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
            ctx.stroke();
        }
        
        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🃏 BLACKJACK 🃏', width / 2, 50);
        
        // Dealer section
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('🏠 Dealer', 50, 120);
        
        // Draw dealer cards
        let dealerValue = 0;
        if (dealerHand && dealerHand.cards) {
            dealerHand.cards.forEach((card, index) => {
                const x = 50 + (index * (cardWidth + 10));
                const y = 140;
                
                if (index === 1 && !gameEnded) {
                    // Hidden card
                    drawCard(ctx, x, y, cardWidth, cardHeight, '🂠', '#000080');
                } else {
                    const cardSymbol = getCardSymbol(card.rank, card.suit);
                    const cardColor = getCardColor(card.suit);
                    drawCard(ctx, x, y, cardWidth, cardHeight, cardSymbol, cardColor);
                }
            });
            
            if (gameEnded) {
                dealerValue = dealerHand.getValue();
                ctx.fillStyle = '#FFD700';
                ctx.font = 'bold 18px Arial';
                ctx.fillText(`Value: ${dealerValue}`, 50, 290);
            } else {
                ctx.fillStyle = '#FFD700';
                ctx.font = 'bold 18px Arial';
                ctx.fillText('Value: ?', 50, 290);
            }
        }
        
        // Player section
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('🎯 Your Hand', 50, 350);
        
        // Draw player cards
        let playerValue = 0;
        if (playerHand && playerHand.cards) {
            playerHand.cards.forEach((card, index) => {
                const x = 50 + (index * (cardWidth + 10));
                const y = 370;
                
                const cardSymbol = getCardSymbol(card.rank, card.suit);
                const cardColor = getCardColor(card.suit);
                drawCard(ctx, x, y, cardWidth, cardHeight, cardSymbol, cardColor);
            });
            
            playerValue = playerHand.getValue();
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(`Value: ${playerValue}`, 50, 520);
        }
        
        // Game result
        if (gameEnded && result) {
            ctx.fillStyle = '#000000';
            ctx.globalAlpha = 0.7;
            ctx.fillRect(width / 2 - 150, height / 2 - 50, 300, 100);
            ctx.globalAlpha = 1.0;
            
            let resultText = '';
            let resultColor = '#FFFFFF';
            
            if (result.result === 'win') {
                resultText = result.isBlackjack ? '🃏 BLACKJACK!' : '🎉 YOU WIN!';
                resultColor = '#00FF00';
            } else if (result.result === 'lose') {
                resultText = '💔 YOU LOSE';
                resultColor = '#FF0000';
            } else if (result.result === 'push') {
                resultText = '🤝 PUSH (TIE)';
                resultColor = '#FFFF00';
            }
            
            ctx.fillStyle = resultColor;
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(resultText, width / 2, height / 2);
        }
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        logger.error(`Error creating blackjack image: ${error.message}`);
        return null;
    }
}

/**
 * Draw a single card
 */
function drawCard(ctx, x, y, width, height, symbol, color) {
    // Card background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, width, height);
    
    // Card border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    
    // Card symbol
    ctx.fillStyle = color;
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(symbol, x + width / 2, y + height / 2 + 10);
    
    // Card rank in corners
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(symbol.slice(0, 2), x + 5, y + 15);
    ctx.textAlign = 'right';
    ctx.fillText(symbol.slice(0, 2), x + width - 5, y + height - 5);
}

/**
 * Get card symbol representation
 */
function getCardSymbol(rank, suit) {
    const suitSymbols = {
        '♠️': '♠',
        '♥️': '♥',
        '♦️': '♦',
        '♣️': '♣'
    };
    
    return `${rank}${suitSymbols[suit] || suit}`;
}

/**
 * Get card color based on suit
 */
function getCardColor(suit) {
    if (suit === '♥️' || suit === '♦️') {
        return '#FF0000'; // Red
    }
    return '#000000'; // Black
}

/**
 * Create action buttons overlay (for reference)
 */
function createButtonOverlay(gameId, canHit, canStand, canDouble, canSplit) {
    const width = 800;
    const height = 100;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, width, height);
    
    // Button areas (visual reference only - actual buttons are Discord components)
    const buttons = [
        { text: '🎯 HIT', enabled: canHit, x: 50 },
        { text: '✋ STAND', enabled: canStand, x: 200 },
        { text: '💰 DOUBLE', enabled: canDouble, x: 350 },
        { text: '🔄 SPLIT', enabled: canSplit, x: 500 }
    ];
    
    buttons.forEach(button => {
        const buttonWidth = 120;
        const buttonHeight = 60;
        const y = 20;
        
        // Button background
        ctx.fillStyle = button.enabled ? '#28a745' : '#6c757d';
        ctx.fillRect(button.x, y, buttonWidth, buttonHeight);
        
        // Button border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(button.x, y, buttonWidth, buttonHeight);
        
        // Button text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(button.text, button.x + buttonWidth / 2, y + buttonHeight / 2 + 5);
    });
    
    return canvas.toBuffer('image/png');
}

module.exports = {
    createBlackjackImage,
    createButtonOverlay
};