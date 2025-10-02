/**
 * Fixed Domino Board Renderer
 * Properly aligns dominoes end-to-end with correct connections
 */

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

class FixedDominoRenderer {
    constructor() {
        this.assetsDir = path.join(__dirname, '..', 'assets', 'domino');
        this.tempDir = path.join(__dirname, '..', 'temp', 'dominoes');
        
        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        
        // Create mapping for domino tiles to image numbers
        this.tileMap = this.createTileMapping();
        
        // Standard domino dimensions from assets
        this.horizontalWidth = 64;  // h1 images
        this.horizontalHeight = 32;
        this.verticalWidth = 32;    // h0 images  
        this.verticalHeight = 64;
    }
    
    createTileMapping() {
        const tileMap = {};
        let tileNumber = 1;
        
        for (let high = 0; high <= 6; high++) {
            for (let low = 0; low <= high; low++) {
                tileMap[`${high}:${low}`] = tileNumber;
                tileNumber++;
            }
        }
        
        return tileMap;
    }
    
    /**
     * Get the correct image based on tile values and required orientation
     */
    getTileImagePath(high, low, useHorizontal = true, isHighlighted = false) {
        // Normalize to ensure high >= low for mapping
        const mappingHigh = Math.max(high, low);
        const mappingLow = Math.min(high, low);
        const tileKey = `${mappingHigh}:${mappingLow}`;
        const imageNumber = this.tileMap[tileKey];
        
        if (!imageNumber) {
            throw new Error(`No image mapping found for tile ${tileKey}`);
        }
        
        // h0 = vertical (32x64), h1 = horizontal (64x32)
        const orientation = useHorizontal ? 'h1' : 'h0';
        const color = isHighlighted ? 'w' : 'b';
        const filename = `pix_dom_${orientation}_s3_${color}_${imageNumber}.png`;
        return path.join(this.assetsDir, filename);
    }
    
    /**
     * Generate properly aligned domino board
     */
    async generateProperBoard(boardTiles, leftEnd, rightEnd) {
        if (!boardTiles || boardTiles.length === 0) {
            return this.generateEmptyBoard();
        }
        
        const canvasWidth = 1000;
        const canvasHeight = 400;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');
        
        // Background - green felt
        ctx.fillStyle = '#0F5132';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Add subtle texture
        ctx.fillStyle = '#0A3D2A';
        for (let i = 0; i < 300; i++) {
            const x = Math.random() * canvasWidth;
            const y = Math.random() * canvasHeight;
            ctx.fillRect(x, y, 1, 1);
        }
        
        // Layout dominoes properly
        await this.layoutDominoesCorrectly(ctx, boardTiles, leftEnd, rightEnd, canvasWidth, canvasHeight);
        
        // Save image
        const filename = `board_${Date.now()}.png`;
        const filepath = path.join(this.tempDir, filename);
        
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(filepath, buffer);
        
        return filepath;
    }
    
    /**
     * Layout dominoes with proper end-to-end connections
     */
    async layoutDominoesCorrectly(ctx, boardTiles, leftEnd, rightEnd, canvasWidth, canvasHeight) {
        if (boardTiles.length === 0) return;
        
        // Track domino placements
        const placements = [];
        let currentX = 100; // Start position
        let currentY = canvasHeight / 2;
        
        // Track actual connecting values
        let actualLeftEnd = leftEnd;
        let actualRightEnd = rightEnd;
        
        for (let i = 0; i < boardTiles.length; i++) {
            const tile = boardTiles[i];
            
            if (i === 0) {
                // First tile - always horizontal
                try {
                    const imagePath = this.getTileImagePath(tile.high, tile.low, true, false);
                    const image = await loadImage(imagePath);
                    
                    const x = currentX;
                    const y = currentY - this.horizontalHeight / 2;
                    
                    ctx.drawImage(image, x, y);
                    
                    placements.push({
                        x, y,
                        width: this.horizontalWidth,
                        height: this.horizontalHeight,
                        isHorizontal: true,
                        leftValue: tile.low,
                        rightValue: tile.high
                    });
                    
                    // Update position for next tile
                    currentX += this.horizontalWidth;
                    actualLeftEnd = tile.low;
                    actualRightEnd = tile.high;
                    
                } catch (error) {
                    console.error(`Error placing first tile:`, error);
                }
                
            } else {
                // Subsequent tiles - connect to previous tile
                const prevPlacement = placements[placements.length - 1];
                
                // Determine which end this tile connects to and how
                let connectingValue = null;
                let connectingSide = 'right'; // default to right end
                let tileOrientation = true; // true = horizontal, false = vertical
                
                // Check if tile can connect to right end
                if (tile.high === actualRightEnd || tile.low === actualRightEnd) {
                    connectingValue = actualRightEnd;
                    connectingSide = 'right';
                } else if (tile.high === actualLeftEnd || tile.low === actualLeftEnd) {
                    connectingValue = actualLeftEnd;  
                    connectingSide = 'left';
                }
                
                // Determine tile orientation based on if it's a double
                if (tile.isDouble) {
                    tileOrientation = false; // Doubles should be vertical
                } else {
                    tileOrientation = true; // Regular tiles horizontal
                }
                
                try {
                    const imagePath = this.getTileImagePath(tile.high, tile.low, tileOrientation, false);
                    const image = await loadImage(imagePath);
                    
                    let x, y;
                    let width, height;
                    
                    if (tileOrientation) {
                        // Horizontal tile
                        width = this.horizontalWidth;
                        height = this.horizontalHeight;
                    } else {
                        // Vertical tile
                        width = this.verticalWidth;
                        height = this.verticalHeight;
                    }
                    
                    if (connectingSide === 'right') {
                        // Connect to right end of the line
                        if (tileOrientation) {
                            // Horizontal tile connecting to right
                            x = currentX;
                            y = currentY - height / 2;
                            currentX += width;
                        } else {
                            // Vertical tile connecting to right
                            x = currentX;
                            y = currentY - height / 2;
                            currentX += width;
                        }
                        
                        // Update right end value
                        if (tile.high === connectingValue) {
                            actualRightEnd = tile.low;
                        } else {
                            actualRightEnd = tile.high;
                        }
                        
                    } else {
                        // Connect to left end (rare, but possible)
                        const firstPlacement = placements[0];
                        if (tileOrientation) {
                            x = firstPlacement.x - width;
                            y = currentY - height / 2;
                        } else {
                            x = firstPlacement.x - width;
                            y = currentY - height / 2;
                        }
                        
                        // Update all existing placements x position
                        placements.forEach(p => p.x += width);
                        currentX += width;
                        
                        // Update left end value
                        if (tile.high === connectingValue) {
                            actualLeftEnd = tile.low;
                        } else {
                            actualLeftEnd = tile.high;
                        }
                    }
                    
                    // Make sure we don't go off canvas
                    if (x + width > canvasWidth - 50) {
                        // Start a new row
                        currentX = 100;
                        currentY += 80;
                        x = currentX;
                        y = currentY - height / 2;
                        currentX += width;
                    }
                    
                    // Draw the domino
                    ctx.drawImage(image, x, y);
                    
                    placements.push({
                        x, y,
                        width,
                        height,
                        isHorizontal: tileOrientation,
                        connectingSide,
                        connectingValue
                    });
                    
                } catch (error) {
                    console.error(`Error placing tile ${i}:`, error);
                }
            }
        }
    }
    
    /**
     * Generate empty board
     */
    async generateEmptyBoard() {
        const canvas = createCanvas(600, 300);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#0F5132';
        ctx.fillRect(0, 0, 600, 300);
        
        // Add texture
        ctx.fillStyle = '#0A3D2A';
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 300;
            ctx.fillRect(x, y, 1, 1);
        }
        
        // Draw placement guide (subtle)
        ctx.strokeStyle = '#1F6642';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(250, 130, 100, 40);
        ctx.setLineDash([]);
        
        const filename = `board_empty_${Date.now()}.png`;
        const filepath = path.join(this.tempDir, filename);
        
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(filepath, buffer);
        
        return filepath;
    }
    
    /**
     * Generate hand view using horizontal tiles for clarity
     */
    async generateHandView(hand, playableIndices = []) {
        if (!hand || hand.length === 0) {
            return this.generateEmptyHand();
        }
        
        const tilesPerRow = Math.min(hand.length, 7);
        const rows = Math.ceil(hand.length / tilesPerRow);
        const spacing = 10;
        
        const canvasWidth = (this.horizontalWidth * tilesPerRow) + (spacing * (tilesPerRow + 1));
        const canvasHeight = (this.horizontalHeight * rows) + (spacing * (rows + 1)) + 40;
        
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#1a472a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Draw each domino using horizontal orientation
        for (let i = 0; i < hand.length; i++) {
            const tile = hand[i];
            const isPlayable = playableIndices.includes(i);
            
            const row = Math.floor(i / tilesPerRow);
            const col = i % tilesPerRow;
            
            const x = spacing + (col * (this.horizontalWidth + spacing));
            const y = 20 + (row * (this.horizontalHeight + spacing));
            
            try {
                const imagePath = this.getTileImagePath(tile.high, tile.low, true, isPlayable);
                
                if (fs.existsSync(imagePath)) {
                    const tileImage = await loadImage(imagePath);
                    ctx.drawImage(tileImage, x, y);
                    
                    // Add number label
                    ctx.fillStyle = isPlayable ? '#00FF00' : '#CCCCCC';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${i + 1}`, x + this.horizontalWidth/2, y + this.horizontalHeight + 12);
                }
            } catch (error) {
                console.error(`Error loading tile for hand:`, error);
            }
        }
        
        const filename = `hand_${Date.now()}.png`;
        const filepath = path.join(this.tempDir, filename);
        
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(filepath, buffer);
        
        return filepath;
    }
    
    async generateEmptyHand() {
        const canvas = createCanvas(400, 150);
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#1a472a';
        ctx.fillRect(0, 0, 400, 150);
        
        const filename = `hand_empty_${Date.now()}.png`;
        const filepath = path.join(this.tempDir, filename);
        
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(filepath, buffer);
        
        return filepath;
    }
    
    /**
     * Clean up temporary files
     */
    cleanupTempFiles() {
        try {
            const files = fs.readdirSync(this.tempDir);
            files.forEach(file => {
                if (file.endsWith('.png')) {
                    fs.unlinkSync(path.join(this.tempDir, file));
                }
            });
        } catch (error) {
            console.error('Error cleaning up temp files:', error);
        }
    }
}

module.exports = new FixedDominoRenderer();