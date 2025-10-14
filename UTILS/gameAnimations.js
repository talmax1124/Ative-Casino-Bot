/**
 * Game Animation System for ATIVE Casino Bot
 * Creates smooth GIF animations for casino games
 */

const { createCanvas } = require('canvas');
const GIFEncoder = require('gif-encoder-2');
const logger = require('./logger');

/**
 * Create animated slots spinning sequence
 */
async function createSlotsSpinAnimation(finalReels, mode = 'standard', duration = 3000) {
    try {
        const width = 600;
        const height = 400;
        const frames = 20;
        const frameDelay = duration / frames;
        
        const encoder = new GIFEncoder(width, height);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(frameDelay);
        encoder.setQuality(15);
        
        // Symbol pool for spinning effect
        const symbols = ['cherry', 'lemon', 'orange', 'plum', 'bell', 'bar', 'seven', 'diamond', 'star'];
        
        for (let frame = 0; frame < frames; frame++) {
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            
            // Background
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#1a1a2e');
            gradient.addColorStop(1, '#16213e');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            
            // Machine frame with glow effect
            const glowIntensity = Math.sin(frame * 0.3) * 20 + 30;
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = glowIntensity;
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 6;
            ctx.strokeRect(20, 60, width - 40, height - 120);
            ctx.shadowBlur = 0;
            
            // Title with pulsing effect
            const titleScale = 1 + Math.sin(frame * 0.4) * 0.1;
            ctx.save();
            ctx.translate(width / 2, 40);
            ctx.scale(titleScale, titleScale);
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🎰 SPINNING... 🎰', 0, 0);
            ctx.restore();
            
            // Animated reels
            const slotWidth = 120;
            const slotHeight = 100;
            const startX = 50;
            const startY = 80;
            
            finalReels.forEach((reel, reelIndex) => {
                const x = startX + (reelIndex * (slotWidth + 10));
                
                // Reel spinning effect - different speeds per reel
                const spinSpeed = (frame + reelIndex * 3) % symbols.length;
                const isSlowingDown = frame > frames - 8; // Last 8 frames slow down
                const slowdownFactor = isSlowingDown ? Math.max(0.1, (frames - frame) / 8) : 1;
                
                reel.forEach((symbol, symbolIndex) => {
                    const y = startY + (symbolIndex * (slotHeight + 5));
                    
                    // Slot background with spinning effect
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(x, y, slotWidth, slotHeight);
                    
                    // Border with electrical effect
                    const borderGlow = Math.sin(frame * 0.5 + reelIndex) * 10 + 15;
                    ctx.shadowColor = '#00FFFF';
                    ctx.shadowBlur = borderGlow;
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, slotWidth, slotHeight);
                    ctx.shadowBlur = 0;
                    
                    // Symbol - spinning or final
                    let displaySymbol;
                    if (frame < frames - 5) {
                        // Still spinning - show random symbols
                        displaySymbol = symbols[(spinSpeed + symbolIndex) % symbols.length];
                    } else {
                        // Final frames - show actual result
                        displaySymbol = symbol;
                    }
                    
                    const symbolEmoji = getSymbolEmoji(displaySymbol);
                    
                    // Motion blur effect during spinning
                    if (frame < frames - 5) {
                        ctx.globalAlpha = 0.6 + Math.random() * 0.4;
                        const offsetY = (Math.random() - 0.5) * 10 * slowdownFactor;
                        ctx.fillStyle = '#000000';
                        ctx.font = 'bold 48px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(symbolEmoji, x + slotWidth / 2, y + slotHeight / 2 + 15 + offsetY);
                        ctx.globalAlpha = 1;
                    } else {
                        // Sharp final result
                        ctx.fillStyle = '#000000';
                        ctx.font = 'bold 48px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(symbolEmoji, x + slotWidth / 2, y + slotHeight / 2 + 15);
                    }
                });
            });
            
            // Sparkling effects
            for (let i = 0; i < 10; i++) {
                const sparkleX = Math.random() * width;
                const sparkleY = Math.random() * height;
                const sparkleSize = Math.random() * 3 + 1;
                const sparkleAlpha = Math.sin(frame * 0.3 + i) * 0.5 + 0.5;
                
                ctx.globalAlpha = sparkleAlpha;
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(sparkleX, sparkleY, sparkleSize, sparkleSize);
                ctx.globalAlpha = 1;
            }
            
            // Progress indicator
            const progress = frame / frames;
            const progressWidth = 200;
            const progressX = (width - progressWidth) / 2;
            const progressY = height - 30;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(progressX, progressY, progressWidth, 10);
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(progressX, progressY, progressWidth * progress, 10);
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        logger.error(`Error creating slots animation: ${error.message}`);
        return null;
    }
}

/**
 * Create animated blackjack card dealing sequence
 */
async function createBlackjackDealAnimation(playerHand, dealerHand, gameEnded = false) {
    try {
        const width = 800;
        const height = 600;
        const frames = 15;
        const frameDelay = 200;
        
        const encoder = new GIFEncoder(width, height);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(frameDelay);
        encoder.setQuality(10);
        
        for (let frame = 0; frame < frames; frame++) {
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            
            // Background with animated felt texture
            ctx.fillStyle = '#0F5132';
            ctx.fillRect(0, 0, width, height);
            
            // Animated table pattern
            const offset = (frame * 2) % 50;
            ctx.strokeStyle = `rgba(30, 126, 52, ${0.3 + Math.sin(frame * 0.2) * 0.2})`;
            ctx.lineWidth = 1;
            for (let i = -50; i < width + 50; i += 50) {
                ctx.beginPath();
                ctx.moveTo(i + offset, 0);
                ctx.lineTo(i + offset, height);
                ctx.stroke();
            }
            for (let i = -50; i < height + 50; i += 50) {
                ctx.beginPath();
                ctx.moveTo(0, i + offset);
                ctx.lineTo(width, i + offset);
                ctx.stroke();
            }
            
            // Pulsing title
            const titlePulse = 1 + Math.sin(frame * 0.3) * 0.1;
            ctx.save();
            ctx.translate(width / 2, 50);
            ctx.scale(titlePulse, titlePulse);
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 10;
            ctx.fillText('🃏 BLACKJACK 🃏', 0, 0);
            ctx.restore();
            
            // Card dealing animation
            const cardWidth = 80;
            const cardHeight = 120;
            const dealingProgress = frame / frames;
            
            // Dealer section
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'left';
            ctx.shadowBlur = 5;
            ctx.fillText('🏠 Dealer', 50, 120);
            ctx.shadowBlur = 0;
            
            // Deal dealer cards with animation
            if (dealerHand && dealerHand.cards) {
                dealerHand.cards.forEach((card, index) => {
                    const cardX = 50 + (index * (cardWidth + 10));
                    const cardY = 140;
                    
                    // Card appears with slide effect
                    const cardProgress = Math.max(0, Math.min(1, (dealingProgress * 2) - (index * 0.3)));
                    if (cardProgress > 0) {
                        const slideOffset = (1 - cardProgress) * 100;
                        
                        if (index === 1 && !gameEnded) {
                            // Hidden card with flip animation
                            drawAnimatedCard(ctx, cardX - slideOffset, cardY, cardWidth, cardHeight, '🂠', '#000080', cardProgress);
                        } else {
                            const cardSymbol = getCardSymbol(card.rank, card.suit);
                            const cardColor = getCardColor(card.suit);
                            drawAnimatedCard(ctx, cardX - slideOffset, cardY, cardWidth, cardHeight, cardSymbol, cardColor, cardProgress);
                        }
                    }
                });
            }
            
            // Player section
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px Arial';
            ctx.shadowBlur = 5;
            ctx.fillText('🎯 Your Hand', 50, 350);
            ctx.shadowBlur = 0;
            
            // Deal player cards with animation
            if (playerHand && playerHand.cards) {
                playerHand.cards.forEach((card, index) => {
                    const cardX = 50 + (index * (cardWidth + 10));
                    const cardY = 370;
                    
                    const cardProgress = Math.max(0, Math.min(1, (dealingProgress * 2) - (index * 0.3) - 0.5));
                    if (cardProgress > 0) {
                        const slideOffset = (1 - cardProgress) * 100;
                        const cardSymbol = getCardSymbol(card.rank, card.suit);
                        const cardColor = getCardColor(card.suit);
                        drawAnimatedCard(ctx, cardX - slideOffset, cardY, cardWidth, cardHeight, cardSymbol, cardColor, cardProgress);
                    }
                });
            }
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        logger.error(`Error creating blackjack animation: ${error.message}`);
        return null;
    }
}

/**
 * Create animated roulette wheel spinning sequence
 */
async function createRouletteSpinAnimation(finalNumber, duration = 4000) {
    try {
        const width = 700;
        const height = 500;
        const frames = 30;
        const frameDelay = duration / frames;
        
        const encoder = new GIFEncoder(width, height);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(frameDelay);
        encoder.setQuality(10);
        
        for (let frame = 0; frame < frames; frame++) {
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            
            // Background
            ctx.fillStyle = '#0F5132';
            ctx.fillRect(0, 0, width, height);
            
            // Title
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🎯 ROULETTE 🎯', width / 2, 40);
            
            // Spinning wheel animation
            const centerX = 150;
            const centerY = 150;
            const radius = 120;
            const spinSpeed = frame < frames - 5 ? (frames - frame) * 0.5 : 0.1; // Slow down at end
            const rotation = (frame * spinSpeed) % (2 * Math.PI);
            
            drawAnimatedRouletteWheel(ctx, centerX, centerY, radius, rotation, finalNumber, frame >= frames - 3);
            
            // Ball animation
            const ballRadius = 8;
            const ballOrbitRadius = radius + 20;
            const ballSpeed = frame < frames - 8 ? -(frame * 0.8) : 0; // Counter-rotation
            const ballAngle = (frame * ballSpeed) % (2 * Math.PI);
            
            // Ball trail effect
            for (let trail = 0; trail < 5; trail++) {
                const trailAngle = ballAngle - (trail * 0.3);
                const trailX = centerX + Math.cos(trailAngle) * ballOrbitRadius;
                const trailY = centerY + Math.sin(trailAngle) * ballOrbitRadius;
                const trailAlpha = 1 - (trail * 0.2);
                
                ctx.globalAlpha = trailAlpha;
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(trailX, trailY, ballRadius * (1 - trail * 0.1), 0, 2 * Math.PI);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            
            // Status text
            const statusText = frame < frames - 3 ? 'SPINNING...' : `WINNING NUMBER: ${finalNumber}`;
            ctx.fillStyle = frame < frames - 3 ? '#FFFFFF' : '#FFD700';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(statusText, width / 2, 450);
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        logger.error(`Error creating roulette animation: ${error.message}`);
        return null;
    }
}

/**
 * Helper function to draw animated card
 */
function drawAnimatedCard(ctx, x, y, width, height, symbol, color, progress) {
    // Card shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x + 3, y + 3, width * progress, height * progress);
    
    // Card background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, width * progress, height * progress);
    
    // Card border with glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width * progress, height * progress);
    ctx.shadowBlur = 0;
    
    if (progress > 0.5) {
        // Card symbol (appears when card is halfway dealt)
        ctx.fillStyle = color;
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(symbol, x + (width * progress) / 2, y + (height * progress) / 2 + 10);
    }
}

/**
 * Helper function to draw animated roulette wheel
 */
function drawAnimatedRouletteWheel(ctx, centerX, centerY, radius, rotation, winningNumber, showWinner) {
    // Wheel background
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 10, 0, 2 * Math.PI);
    ctx.fill();
    
    // Numbers (simplified)
    const numbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const angleStep = (2 * Math.PI) / numbers.length;
    
    numbers.forEach((number, index) => {
        const angle = index * angleStep + rotation;
        const startAngle = angle - angleStep / 2;
        const endAngle = angle + angleStep / 2;
        
        // Highlight winning number
        const isWinning = showWinner && number === winningNumber;
        ctx.fillStyle = isWinning ? '#FFD700' : getNumberColor(number);
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
        
        // Glowing effect for winner
        if (isWinning) {
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 20;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        
        // Sector border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
    
    // Center circle
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15, 0, 2 * Math.PI);
    ctx.fill();
}

/**
 * Helper functions from Canvas utilities
 */
function getSymbolEmoji(symbol) {
    const symbolMap = {
        'cherry': '🍒', 'lemon': '🍋', 'orange': '🍊', 'plum': '🍇',
        'bell': '🔔', 'bar': '⬛', 'seven': '7️⃣', 'diamond': '💎',
        'star': '⭐', 'crown': '👑', 'jackpot': '💰'
    };
    return symbolMap[symbol.toLowerCase()] || '❓';
}

function getCardSymbol(rank, suit) {
    const suitSymbols = {
        '♠️': '♠', '♥️': '♥', '♦️': '♦', '♣️': '♣'
    };
    return `${rank}${suitSymbols[suit] || suit}`;
}

function getCardColor(suit) {
    return (suit === '♥️' || suit === '♦️') ? '#FF0000' : '#000000';
}

function getNumberColor(number) {
    if (number === 0) return '#00AA00';
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    return redNumbers.includes(number) ? '#DC143C' : '#000000';
}

/**
 * Create animated coin flip sequence
 */
async function createCoinFlipAnimation(result, choice, duration = 2000) {
    try {
        const width = 500;
        const height = 400;
        const frames = 16;
        const frameDelay = duration / frames;
        
        const encoder = new GIFEncoder(width, height);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(frameDelay);
        encoder.setQuality(10);
        
        for (let frame = 0; frame < frames; frame++) {
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            
            // Background
            ctx.fillStyle = '#2C3E50';
            ctx.fillRect(0, 0, width, height);
            
            // Title
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🪙 COIN FLIP 🪙', width / 2, 40);
            
            // Coin animation
            const coinX = width / 2;
            const coinY = 150;
            const coinRadius = 80;
            
            // Flipping effect
            const flipSpeed = frame < frames - 4 ? 1 : 0.2; // Slow down at end
            const flipAngle = (frame * flipSpeed * Math.PI / 2) % (2 * Math.PI);
            const scaleX = Math.abs(Math.cos(flipAngle));
            
            // Coin shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.ellipse(coinX + 5, coinY + 5, coinRadius * scaleX, coinRadius, 0, 0, 2 * Math.PI);
            ctx.fill();
            
            // Coin background
            const showHeads = frame < frames - 2 ? Math.cos(flipAngle) > 0 : result === 'heads';
            ctx.fillStyle = showHeads ? '#FFD700' : '#C0C0C0';
            ctx.beginPath();
            ctx.ellipse(coinX, coinY, coinRadius * scaleX, coinRadius, 0, 0, 2 * Math.PI);
            ctx.fill();
            
            // Coin border
            ctx.strokeStyle = '#8B7355';
            ctx.lineWidth = 4;
            ctx.stroke();
            
            // Coin face (only when coin is face-on)
            if (scaleX > 0.3) {
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 48px Arial';
                ctx.textAlign = 'center';
                ctx.save();
                ctx.scale(scaleX, 1);
                ctx.fillText(showHeads ? '👑' : '🏛️', coinX / scaleX, coinY + 15);
                ctx.restore();
            }
            
            // Status text
            if (frame >= frames - 2) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 24px Arial';
                ctx.fillText(`Result: ${result.toUpperCase()}`, width / 2, 270);
                
                ctx.fillStyle = '#CCCCCC';
                ctx.font = 'bold 18px Arial';
                ctx.fillText(`Your choice: ${choice.toUpperCase()}`, width / 2, 300);
            } else {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 20px Arial';
                ctx.fillText('FLIPPING...', width / 2, 270);
            }
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        logger.error(`Error creating coin flip animation: ${error.message}`);
        return null;
    }
}

/**
 * Create animated mines reveal sequence
 */
async function createMinesRevealAnimation(grid, mines, revealedCells, finalResult) {
    try {
        const gridSize = Math.sqrt(grid.length);
        const cellSize = 50;
        const padding = 50;
        const width = gridSize * cellSize + padding * 2;
        const height = gridSize * cellSize + padding * 2 + 100;
        const frames = 12;
        
        const encoder = new GIFEncoder(width, height);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(300);
        encoder.setQuality(10);
        
        for (let frame = 0; frame < frames; frame++) {
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            
            // Background
            ctx.fillStyle = '#2C3E50';
            ctx.fillRect(0, 0, width, height);
            
            // Title
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('💣 MINES 💣', width / 2, 35);
            
            // Pulsing effect for tension
            const pulseAlpha = 0.8 + Math.sin(frame * 0.8) * 0.2;
            
            // Draw grid with progressive reveal
            for (let i = 0; i < gridSize; i++) {
                for (let j = 0; j < gridSize; j++) {
                    const index = i * gridSize + j;
                    const x = padding + j * cellSize;
                    const y = padding + 50 + i * cellSize;
                    
                    const isRevealed = revealedCells.includes(index);
                    const isMine = mines.includes(index);
                    const shouldReveal = frame >= 6; // Reveal all mines in later frames
                    
                    // Cell background
                    if (isRevealed || (shouldReveal && isMine)) {
                        ctx.fillStyle = isMine ? '#DC143C' : '#90EE90';
                    } else {
                        ctx.fillStyle = '#34495E';
                    }
                    
                    // Pulsing effect for mines
                    if (isMine && shouldReveal) {
                        ctx.globalAlpha = pulseAlpha;
                    }
                    
                    ctx.fillRect(x, y, cellSize - 2, cellSize - 2);
                    ctx.globalAlpha = 1;
                    
                    // Cell border
                    ctx.strokeStyle = '#BDC3C7';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, cellSize - 2, cellSize - 2);
                    
                    // Cell content
                    if (isRevealed || (shouldReveal && isMine)) {
                        ctx.fillStyle = '#000000';
                        ctx.font = 'bold 24px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(isMine ? '💣' : '💎', x + cellSize / 2, y + cellSize / 2 + 8);
                    }
                }
            }
            
            // Result text (appears in final frames)
            if (frame >= frames - 3) {
                const won = finalResult === 'win';
                ctx.fillStyle = won ? '#00FF00' : '#FF0000';
                ctx.font = 'bold 20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(won ? '🎉 YOU WON!' : '💥 BOOM!', width / 2, height - 20);
            }
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        logger.error(`Error creating mines animation: ${error.message}`);
        return null;
    }
}

module.exports = {
    createSlotsSpinAnimation,
    createBlackjackDealAnimation,
    createRouletteSpinAnimation,
    createCoinFlipAnimation,
    createMinesRevealAnimation
};