/**
 * Slots game mechanics for ATIVE Casino Bot
 * Includes both regular 3-slot and 3x3 matrix modes with animation
 */

const Canvas = require('canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');
const logger = require('../UTILS/logger');
const { secureWeightedChoice } = require('../UTILS/rng');

// REBALANCED slot symbols - Now with proper house edge
// Higher rarities for valuable symbols, lower payouts for balance
const SLOT_SYMBOLS = {
    'cherries': { name: 'Cherries', emoji: '🍒', rarity: 40, payout: 1.5 },     // Most common, lowest payout
    'lemon': { name: 'Lemon', emoji: '🍋', rarity: 25, payout: 2.0 },         // Common
    'orange': { name: 'Orange', emoji: '🍊', rarity: 15, payout: 2.5 },       // Uncommon
    'grapes': { name: 'Grapes', emoji: '🍇', rarity: 10, payout: 3.0 },       // Uncommon
    'watermelon': { name: 'Watermelon', emoji: '🍉', rarity: 5, payout: 4.0 }, // Rare
    'bar': { name: 'Bar', emoji: '📊', rarity: 3, payout: 6.0 },              // Rare
    'seven': { name: 'Lucky Seven', emoji: '7️⃣', rarity: 1.5, payout: 10.0 }, // Very rare
    'diamond': { name: 'Diamond', emoji: '💎', rarity: 0.4, payout: 25.0 },   // Ultra rare
    'buffalo': { name: 'Buffalo', emoji: '🦬', rarity: 0.1, payout: 100.0 },  // Legendary
    'jackpot': { name: 'Jackpot', emoji: '🎰', rarity: 0.01, payout: 500.0 }  // Near impossible
};

// Matrix mode symbols (increased win probability by 3%)
const MATRIX_SYMBOLS = {
    'cherries': { name: 'Cherries', emoji: '🍒', rarity: 33, payout: 2.0 },
    'lemon': { name: 'Lemon', emoji: '🍋', rarity: 28, payout: 2.5 },
    'orange': { name: 'Orange', emoji: '🍊', rarity: 25, payout: 3.0 },
    'grapes': { name: 'Grapes', emoji: '🍇', rarity: 21, payout: 4.0 },
    'watermelon': { name: 'Watermelon', emoji: '🍉', rarity: 18, payout: 5.0 },
    'bar': { name: 'Bar', emoji: '📊', rarity: 15, payout: 6.0 },
    'seven': { name: 'Lucky Seven', emoji: '7️⃣', rarity: 11, payout: 10.0 },
    'diamond': { name: 'Diamond', emoji: '💎', rarity: 9, payout: 20.0 },
    'buffalo': { name: 'Buffalo', emoji: '🦬', rarity: 7, payout: 50.0 },
    'jackpot': { name: 'Jackpot', emoji: '🎰', rarity: 3.5, payout: 200.0 }
};

// Special combinations
const TWO_MATCH_MULTIPLIER = 0.75;
const MATRIX_MIN_BET = 35000;


/**
 * Load slot symbol image with fallback
 */
async function loadSymbolImage(symbol) {
    try {
        const assetsPath = path.join(__dirname, '..', 'assets', 'slots');
        const imagePath = path.join(assetsPath, `${symbol}.png`);
        const image = await Canvas.loadImage(imagePath);
        return image;
    } catch (error) {
        logger.warn(`Failed to load symbol image for ${symbol}, using fallback`);
        // Create colored fallback square
        const canvas = Canvas.createCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        const colors = {
            'cherries': '#FF69B4', 'lemon': '#FFFF00', 'orange': '#FFA500',
            'grapes': '#800080', 'watermelon': '#90EE90', 'bar': '#4B0082',
            'seven': '#FFD700', 'diamond': '#00BFFF', 'buffalo': '#8B4513',
            'jackpot': '#FF4500'
        };
        ctx.fillStyle = colors[symbol] || '#808080';
        ctx.fillRect(0, 0, 100, 100);
        return canvas;
    }
}

/**
 * Get weighted random symbol with entropy seeding
 */
function getWeightedSymbol(matrixMode = false, entropy = 0) {
    const symbolDict = matrixMode ? MATRIX_SYMBOLS : SLOT_SYMBOLS;
    const symbols = Object.keys(symbolDict);
    
    // Add entropy-based weight adjustment to reduce patterns
    const baseWeights = symbols.map(symbol => symbolDict[symbol].rarity);
    const adjustedWeights = baseWeights.map((weight, index) => {
        // Use entropy to slightly adjust weights (±5% variation)
        const adjustment = Math.sin(entropy + index * 0.7) * 0.05;
        return Math.max(0.01, weight * (1 + adjustment));
    });
    
    return secureWeightedChoice(symbols, adjustedWeights) || symbols[0];
}

/**
 * Generate entropy seed for better randomization
 */
function generateEntropy() {
    return Date.now() * Math.PI + (Math.random() * 1000);
}


/**
 * Generate regular slot result (3 symbols) with better randomization
 */
function spinSlots() {
    const entropy = generateEntropy();
    return [
        getWeightedSymbol(false, entropy),
        getWeightedSymbol(false, entropy * 1.3),
        getWeightedSymbol(false, entropy * 1.7)
    ];
}

/**
 * Generate matrix slot result (3x3 grid) with improved distribution
 */
function spinMatrixSlots() {
    const baseEntropy = generateEntropy();
    const matrix = [];
    
    // Generate each position with unique entropy to reduce patterns
    for (let row = 0; row < 3; row++) {
        const matrixRow = [];
        for (let col = 0; col < 3; col++) {
            // Each position gets unique entropy based on position and base seed
            const positionEntropy = baseEntropy * (1 + (row * 0.3) + (col * 0.5)) + (row * col * 0.2);
            matrixRow.push(getWeightedSymbol(true, positionEntropy));
        }
        matrix.push(matrixRow);
    }
    
    return matrix;
}

/**
 * Calculate payout for regular slots
 */
function calculatePayout(symbols, betAmount) {
    // Check for three of a kind
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
        const symbol = symbols[0];
        const symbolData = SLOT_SYMBOLS[symbol];
        const multiplier = symbolData.payout;
        const payout = betAmount * multiplier;
        
        return {
            won: true,
            payout: payout,
            multiplier: multiplier,
            type: `🎰 JACKPOT! Three ${symbolData.name}s!`
        };
    }

    // REMOVED TWO-MATCH WINS - Now only 3 of a kind wins!
    // This creates a proper house edge as most spins will lose

    // No matches
    return {
        won: false,
        payout: 0,
        multiplier: 0,
        type: '💥 No matches - Try again!'
    };
}

/**
 * Calculate payout for matrix slots
 */
function calculateMatrixPayout(matrix, betAmount) {
    let totalPayout = 0;
    const resultMessages = [];
    const winningLines = [];
    let buffaloBonus = false;

    // Check horizontal lines
    for (let row = 0; row < 3; row++) {
        const line = [matrix[row][0], matrix[row][1], matrix[row][2]];
        if (line[0] === line[1] && line[1] === line[2]) {
            const symbol = line[0];
            const symbolData = MATRIX_SYMBOLS[symbol];
            
            if (symbol === 'buffalo') {
                const bonusPayout = betAmount * 3; // 3x for buffalo bonus in matrix
                totalPayout += bonusPayout;
                resultMessages.push(`🦬 BUFFALO BONUS! Line: +${bonusPayout.toLocaleString()}`);
                winningLines.push({ type: 'horizontal', row, col: 0, endRow: row, endCol: 2 });
                buffaloBonus = true;
            } else {
                const linePayout = betAmount * symbolData.payout;
                totalPayout += linePayout;
                resultMessages.push(`${symbolData.name} Line: +${linePayout.toLocaleString()}`);
                winningLines.push({ type: 'horizontal', row, col: 0, endRow: row, endCol: 2 });
            }
        }
    }

    // Check vertical lines
    for (let col = 0; col < 3; col++) {
        const line = [matrix[0][col], matrix[1][col], matrix[2][col]];
        if (line[0] === line[1] && line[1] === line[2]) {
            const symbol = line[0];
            const symbolData = MATRIX_SYMBOLS[symbol];
            
            if (symbol === 'buffalo') {
                const bonusPayout = betAmount * 3;
                totalPayout += bonusPayout;
                resultMessages.push(`🦬 BUFFALO BONUS! Column: +${bonusPayout.toLocaleString()}`);
                winningLines.push({ type: 'vertical', row: 0, col, endRow: 2, endCol: col });
                buffaloBonus = true;
            } else {
                const linePayout = betAmount * symbolData.payout;
                totalPayout += linePayout;
                resultMessages.push(`${symbolData.name} Column: +${linePayout.toLocaleString()}`);
                winningLines.push({ type: 'vertical', row: 0, col, endRow: 2, endCol: col });
            }
        }
    }

    // Check diagonals
    const diagonal1 = [matrix[0][0], matrix[1][1], matrix[2][2]];
    if (diagonal1[0] === diagonal1[1] && diagonal1[1] === diagonal1[2]) {
        const symbol = diagonal1[0];
        const symbolData = MATRIX_SYMBOLS[symbol];
        
        if (symbol === 'buffalo') {
            const bonusPayout = betAmount * 3;
            totalPayout += bonusPayout;
            resultMessages.push(`🦬 BUFFALO BONUS! Diagonal: +${bonusPayout.toLocaleString()}`);
            winningLines.push({ type: 'diagonal1', row: 0, col: 0, endRow: 2, endCol: 2 });
            buffaloBonus = true;
        } else {
            const linePayout = betAmount * symbolData.payout;
            totalPayout += linePayout;
            resultMessages.push(`${symbolData.name} Diagonal: +${linePayout.toLocaleString()}`);
            winningLines.push({ type: 'diagonal1', row: 0, col: 0, endRow: 2, endCol: 2 });
        }
    }

    const diagonal2 = [matrix[0][2], matrix[1][1], matrix[2][0]];
    if (diagonal2[0] === diagonal2[1] && diagonal2[1] === diagonal2[2]) {
        const symbol = diagonal2[0];
        const symbolData = MATRIX_SYMBOLS[symbol];
        
        if (symbol === 'buffalo') {
            const bonusPayout = betAmount * 3;
            totalPayout += bonusPayout;
            resultMessages.push(`🦬 BUFFALO BONUS! Diagonal: +${bonusPayout.toLocaleString()}`);
            winningLines.push({ type: 'diagonal2', row: 0, col: 2, endRow: 2, endCol: 0 });
            buffaloBonus = true;
        } else {
            const linePayout = betAmount * symbolData.payout;
            totalPayout += linePayout;
            resultMessages.push(`${symbolData.name} Diagonal: +${linePayout.toLocaleString()}`);
            winningLines.push({ type: 'diagonal2', row: 0, col: 2, endRow: 2, endCol: 0 });
        }
    }

    return {
        won: totalPayout > 0,
        payout: totalPayout,
        multiplier: totalPayout > 0 ? totalPayout / betAmount : 0,
        type: totalPayout > 0 ? resultMessages.join('; ') : '💥 No winning lines - Try again!',
        winningLines,
        buffaloBonus,
        freeSpins: buffaloBonus ? 5 : 0
    };
}

/**
 * Create animated visual display for regular slots
 */
function createSlotDisplay(symbols) {
    const emojis = symbols.map(symbol => SLOT_SYMBOLS[symbol].emoji);
    return `${emojis[0]} ${emojis[1]} ${emojis[2]}`;
}


/**
 * Create visual display for matrix slots
 */
function createMatrixDisplay(matrix) {
    const lines = matrix.map(row => 
        row.map(symbol => MATRIX_SYMBOLS[symbol].emoji).join(' ')
    );
    return lines.join('\n');
}


/**
 * Generate slot machine image for regular slots
 */
async function createSlotsImage(symbols, won = false) {
    try {
        const canvas = Canvas.createCanvas(600, 300);
        const ctx = canvas.getContext('2d');

        // Background
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 300);

        // Slot frame
        ctx.strokeStyle = won ? '#FFD700' : '#666666';
        ctx.lineWidth = 5;
        ctx.strokeRect(50, 50, 500, 200);

        // Draw symbols
        const symbolSize = 120;
        const symbolSpacing = 150;
        const startX = 100;
        const startY = 90;

        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            const x = startX + (i * symbolSpacing);
            const y = startY;

            // Symbol background
            ctx.fillStyle = won ? '#2a4a2a' : '#2a2a2a';
            ctx.fillRect(x, y, symbolSize, symbolSize);
            
            // Symbol border
            ctx.strokeStyle = won ? '#4a8a4a' : '#4a4a4a';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, symbolSize, symbolSize);

            try {
                const symbolImage = await loadSymbolImage(symbol);
                ctx.drawImage(symbolImage, x + 10, y + 10, symbolSize - 20, symbolSize - 20);
            } catch (error) {
                // Fallback to emoji
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '60px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(SLOT_SYMBOLS[symbol].emoji, x + symbolSize/2, y + symbolSize/2 + 20);
            }
        }

        // Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎰 SLOT MACHINE 🎰', 300, 30);

        return canvas.toBuffer('image/png');
    } catch (error) {
        logger.error(`Error creating slots image: ${error.message}`);
        return null;
    }
}

/**
 * Generate 3x3 matrix slots image
 */
async function createMatrixImage(matrix, winningLines = [], won = false) {
    try {
        // Canvas sized to keep full grid within bounds in Discord
        const canvasWidth = 620;
        const canvasHeight = 540;
        const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Background
        const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Layout constants
        const cellSize = 120;
        const cellSpacing = 25;
        const gridSpan = cellSize * 3 + cellSpacing * 2; // 410
        const startX = 105; // centers grid
        const startY = 110; // leaves room for title

        // Matrix frame around grid
        ctx.strokeStyle = won ? '#FFD700' : '#666666';
        ctx.lineWidth = 5;
        ctx.strokeRect(startX - 15, startY - 15, gridSpan + 30, gridSpan + 30);

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const symbol = matrix[row][col];
                const x = startX + (col * (cellSize + cellSpacing));
                const y = startY + (row * (cellSize + cellSpacing));

                // Cell background
                ctx.fillStyle = won ? '#2a4a2a' : '#2a2a2a';
                ctx.fillRect(x, y, cellSize, cellSize);
                
                // Cell border
                ctx.strokeStyle = won ? '#4a8a4a' : '#4a4a4a';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, cellSize, cellSize);

                try {
                    const symbolImage = await loadSymbolImage(symbol);
                    ctx.drawImage(symbolImage, x + 10, y + 10, cellSize - 20, cellSize - 20);
                } catch (error) {
                    // Fallback to emoji
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = '60px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(MATRIX_SYMBOLS[symbol].emoji, x + cellSize/2, y + cellSize/2 + 20);
                }
            }
        }

        // Draw winning lines
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 6;
        winningLines.forEach(line => {
            const stride = cellSize + cellSpacing;
            const sX = startX + (line.col * stride) + cellSize / 2;
            const sY = startY + (line.row * stride) + cellSize / 2;
            const eX = startX + (line.endCol * stride) + cellSize / 2;
            const eY = startY + (line.endRow * stride) + cellSize / 2;
            
            ctx.beginPath();
            ctx.moveTo(sX, sY);
            ctx.lineTo(eX, eY);
            ctx.stroke();
        });

        // Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎰 SLOTS MATRIX 3x3 🎰', canvasWidth / 2, 60);

        return canvas.toBuffer('image/png');
    } catch (error) {
        logger.error(`Error creating matrix image: ${error.message}`);
        return null;
    }
}

/**
 * Create animated GIF of spinning slot machine with assets
 */
async function createSpinningSlotGIF(finalSymbols) {
    try {
        const canvas = Canvas.createCanvas(800, 400);
        const ctx = canvas.getContext('2d');
        const encoder = new GIFEncoder(800, 400);
        
        encoder.start();
        encoder.setRepeat(0);
        encoder.setQuality(10);

        // Pre-load all symbol images
        const symbolKeys = Object.keys(SLOT_SYMBOLS);
        const symbolImages = {};
        for (const symbol of symbolKeys) {
            symbolImages[symbol] = await loadSymbolImage(symbol);
        }

        // Animation parameters
        const totalFrames = 50; // More frames for smooth animation
        const slotWidth = 180;
        const slotHeight = 160;
        const startX = 120;
        const startY = 120;
        
        // Create reel strips for each slot (long list of symbols that will spin)
        const reelStrips = [];
        for (let i = 0; i < 3; i++) {
            const strip = [];
            // Add random symbols before the final result
            for (let j = 0; j < 15; j++) {
                strip.push(symbolKeys[Math.floor(Math.random() * symbolKeys.length)]);
            }
            // Add the final result at the end
            strip.push(finalSymbols[i]);
            reelStrips.push(strip);
        }

        // Generate frames
        for (let frame = 0; frame < totalFrames; frame++) {
            // Variable delay - start fast, slow down at the end
            const progress = frame / (totalFrames - 1);
            const delay = Math.floor(50 + (progress * progress * 200)); // 50ms to 250ms
            encoder.setDelay(delay);
            
            // Clear canvas
            ctx.clearRect(0, 0, 800, 400);
            
            // Background gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, '#1a2a3a');
            gradient.addColorStop(1, '#0a1a2a');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 800, 400);
            
            // Header with glow effect
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🎰 SLOT MACHINE 🎰', 400, 50);
            ctx.shadowBlur = 0;
            
            // Slot machine frame with metallic look
            const frameGradient = ctx.createLinearGradient(100, 100, 700, 300);
            frameGradient.addColorStop(0, '#4a5a6a');
            frameGradient.addColorStop(0.5, '#2a3a4a');
            frameGradient.addColorStop(1, '#1a2a3a');
            ctx.fillStyle = frameGradient;
            ctx.fillRect(90, 90, 620, 220);
            
            // Frame border
            ctx.strokeStyle = '#8a9aaa';
            ctx.lineWidth = 6;
            ctx.strokeRect(90, 90, 620, 220);
            
            // Draw each reel
            for (let i = 0; i < 3; i++) {
                const x = startX + (i * (slotWidth + 20));
                const y = startY;
                
                // Reel background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x, y, slotWidth, slotHeight);
                
                // Reel border
                ctx.strokeStyle = '#666666';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, slotWidth, slotHeight);
                
                // Calculate which symbol to show based on animation progress
                const strip = reelStrips[i];
                let symbolIndex;
                
                if (frame < totalFrames - 10) {
                    // Spinning phase - each reel stops at different times
                    const reelStopFrame = totalFrames - 15 + (i * 3); // Reels stop sequentially
                    if (frame < reelStopFrame) {
                        // Still spinning - show cycling symbols
                        const cycleSpeed = Math.max(1, Math.floor((totalFrames - frame) / 5));
                        symbolIndex = Math.floor(frame / cycleSpeed) % (strip.length - 1);
                    } else {
                        // This reel has stopped - show final symbol
                        symbolIndex = strip.length - 1;
                    }
                } else {
                    // All reels stopped - show final result
                    symbolIndex = strip.length - 1;
                }
                
                const symbolKey = strip[symbolIndex];
                const symbolImage = symbolImages[symbolKey];
                
                if (symbolImage) {
                    // Draw the symbol image, properly sized
                    const imageSize = Math.min(slotWidth - 20, slotHeight - 20);
                    const imageX = x + (slotWidth - imageSize) / 2;
                    const imageY = y + (slotHeight - imageSize) / 2;
                    ctx.drawImage(symbolImage, imageX, imageY, imageSize, imageSize);
                } else {
                    // Fallback to emoji if image loading failed
                    ctx.fillStyle = '#333333';
                    ctx.font = 'bold 60px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(SLOT_SYMBOLS[symbolKey].emoji, x + slotWidth/2, y + slotHeight/2 + 20);
                }
                
                // Add reel glass effect
                const glassGradient = ctx.createLinearGradient(x, y, x + slotWidth, y + slotHeight);
                glassGradient.addColorStop(0, 'rgba(255,255,255,0.3)');
                glassGradient.addColorStop(0.3, 'rgba(255,255,255,0.1)');
                glassGradient.addColorStop(0.7, 'rgba(255,255,255,0.05)');
                glassGradient.addColorStop(1, 'rgba(255,255,255,0.2)');
                ctx.fillStyle = glassGradient;
                ctx.fillRect(x, y, slotWidth, slotHeight);
            }
            
            // Add spinning indicator during spin phases
            if (frame < totalFrames - 10) {
                ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
                ctx.font = 'bold 24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('SPINNING...', 400, 350);
            }
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        logger.error(`Error creating spinning slot GIF: ${error.message}`);
        return null;
    }
}

/**
 * Create animated GIF of spinning matrix slots with assets
 */
async function createSpinningMatrixGIF(finalMatrix) {
    try {
        const canvas = Canvas.createCanvas(800, 800);
        const ctx = canvas.getContext('2d');
        const encoder = new GIFEncoder(800, 800);
        
        encoder.start();
        encoder.setRepeat(0);
        encoder.setQuality(10);

        // Pre-load all symbol images
        const symbolKeys = Object.keys(MATRIX_SYMBOLS);
        const symbolImages = {};
        for (const symbol of symbolKeys) {
            symbolImages[symbol] = await loadSymbolImage(symbol);
        }

        // Animation parameters - OPTIMIZED for performance
        const totalFrames = 20; // Reduced from 60 for faster generation
        const cellSize = 200;
        const cellSpacing = 15;
        const startX = 100;
        const startY = 150;
        
        // Create reel strips for each matrix cell
        const matrixStrips = [];
        for (let row = 0; row < 3; row++) {
            matrixStrips[row] = [];
            for (let col = 0; col < 3; col++) {
                const strip = [];
                // Add random symbols before the final result - reduced for performance
                for (let j = 0; j < 10; j++) {
                    strip.push(symbolKeys[Math.floor(Math.random() * symbolKeys.length)]);
                }
                // Add the final result at the end
                strip.push(finalMatrix[row][col]);
                matrixStrips[row][col] = strip;
            }
        }

        // Generate frames
        for (let frame = 0; frame < totalFrames; frame++) {
            // Variable delay - start fast, slow down at the end
            const progress = frame / (totalFrames - 1);
            const delay = Math.floor(40 + (progress * progress * 100)); // 40ms to 140ms - faster animation
            encoder.setDelay(delay);
            
            // Clear canvas
            ctx.clearRect(0, 0, 800, 800);
            
            // Background gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, 800);
            gradient.addColorStop(0, '#2a1a3a');
            gradient.addColorStop(1, '#0a0a2a');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 800, 800);
            
            // Header with glow effect
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 15;
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🎰 MATRIX SLOTS 3x3 🎰', 400, 60);
            ctx.shadowBlur = 0;
            
            // Matrix frame with premium look
            const frameGradient = ctx.createLinearGradient(50, 100, 750, 750);
            frameGradient.addColorStop(0, '#5a4a6a');
            frameGradient.addColorStop(0.5, '#3a2a4a');
            frameGradient.addColorStop(1, '#2a1a3a');
            ctx.fillStyle = frameGradient;
            ctx.fillRect(70, 120, 660, 660);
            
            // Frame border with glow
            ctx.shadowColor = '#8a7aaa';
            ctx.shadowBlur = 8;
            ctx.strokeStyle = '#aa9acc';
            ctx.lineWidth = 8;
            ctx.strokeRect(70, 120, 660, 660);
            ctx.shadowBlur = 0;
            
            // Draw 3x3 matrix
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    const x = startX + (col * (cellSize + cellSpacing));
                    const y = startY + (row * (cellSize + cellSpacing));
                    
                    // Cell background with depth
                    const cellGradient = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize);
                    cellGradient.addColorStop(0, '#ffffff');
                    cellGradient.addColorStop(1, '#f0f0f0');
                    ctx.fillStyle = cellGradient;
                    ctx.fillRect(x, y, cellSize, cellSize);
                    
                    // Cell border
                    ctx.strokeStyle = '#888888';
                    ctx.lineWidth = 4;
                    ctx.strokeRect(x, y, cellSize, cellSize);
                    
                    // Calculate which symbol to show based on animation progress
                    const strip = matrixStrips[row][col];
                    let symbolIndex;
                    
                    // Each cell stops at different times for cascading effect
                    const cellStopFrame = totalFrames - 20 + (row * 3 + col) * 2; // Cascade from top-left to bottom-right
                    
                    if (frame < cellStopFrame) {
                        // Still spinning - show cycling symbols
                        const cycleSpeed = Math.max(1, Math.floor((totalFrames - frame) / 4));
                        symbolIndex = Math.floor(frame / cycleSpeed) % (strip.length - 1);
                    } else {
                        // This cell has stopped - show final symbol
                        symbolIndex = strip.length - 1;
                    }
                    
                    const symbolKey = strip[symbolIndex];
                    const symbolImage = symbolImages[symbolKey];
                    
                    if (symbolImage) {
                        // Draw the symbol image, properly sized
                        const imageSize = Math.min(cellSize - 30, cellSize - 30);
                        const imageX = x + (cellSize - imageSize) / 2;
                        const imageY = y + (cellSize - imageSize) / 2;
                        ctx.drawImage(symbolImage, imageX, imageY, imageSize, imageSize);
                    } else {
                        // Fallback to emoji if image loading failed
                        ctx.fillStyle = '#333333';
                        ctx.font = 'bold 80px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(MATRIX_SYMBOLS[symbolKey].emoji, x + cellSize/2, y + cellSize/2 + 25);
                    }
                    
                    // Add cell glass effect
                    const glassGradient = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize);
                    glassGradient.addColorStop(0, 'rgba(255,255,255,0.4)');
                    glassGradient.addColorStop(0.3, 'rgba(255,255,255,0.1)');
                    glassGradient.addColorStop(0.7, 'rgba(255,255,255,0.05)');
                    glassGradient.addColorStop(1, 'rgba(255,255,255,0.3)');
                    ctx.fillStyle = glassGradient;
                    ctx.fillRect(x, y, cellSize, cellSize);
                }
            }
            
            // Add spinning indicator during spin phases
            if (frame < totalFrames - 15) {
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 10;
                ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
                ctx.font = 'bold 28px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('MATRIX SPINNING...', 400, 750);
                ctx.shadowBlur = 0;
            }
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        logger.error(`Error creating spinning matrix GIF: ${error.message}`);
        return null;
    }
}

module.exports = {
    SLOT_SYMBOLS,
    MATRIX_SYMBOLS,
    MATRIX_MIN_BET,
    spinSlots,
    spinMatrixSlots,
    calculatePayout,
    calculateMatrixPayout,
    createSlotDisplay,
    createMatrixDisplay,
    createSlotsImage,
    createMatrixImage,
    createSpinningSlotGIF,
    createSpinningMatrixGIF
};
