/**
 * Scratch Ticket Visual Generator for ATIVE Casino Bot
 * Creates realistic scratch-off tickets using Canvas
 */

let Canvas;
try {
    Canvas = require('canvas');
} catch (error) {
    console.warn('Canvas module not available - scratch ticket images disabled');
    Canvas = null;
}

const logger = require('./logger');
const { fmtFull } = require('./common');

class ScratchTicketGenerator {
    constructor() {
        this.TICKET_WIDTH = 600;
        this.TICKET_HEIGHT = 400;
        
        // Colors
        this.COLORS = {
            BACKGROUND: '#1a1a2e',
            BORDER: '#FFD700',
            SCRATCH_COATING: '#C0C0C0',
            SCRATCH_PATTERN: '#A8A8A8',
            WIN_TEXT: '#FFD700',
            LOSE_TEXT: '#FF6B6B',
            SYMBOL_BG: '#FFFFFF',
            GRID_LINE: '#333333',
            HEADER_BG: '#16213e',
            PRIZE_TEXT: '#4ECDC4'
        };
        
        // Grid configuration
        this.GRID_CONFIG = {
            ROWS: 3,
            COLS: 3,
            CELL_SIZE: 80,
            SPACING: 10,
            START_X: 200,
            START_Y: 180
        };
    }

    /**
     * Create a scratch ticket image
     * @param {Object} ticketData - Ticket data
     * @param {Array} scratchedPositions - Array of scratched positions
     * @returns {Buffer} Canvas buffer
     */
    async createTicketImage(ticketData, scratchedPositions = []) {
        if (!Canvas) {
            throw new Error('Canvas not available');
        }

        try {
            const canvas = Canvas.createCanvas(this.TICKET_WIDTH, this.TICKET_HEIGHT);
            const ctx = canvas.getContext('2d');

            // Draw background
            await this.drawBackground(ctx);
            
            // Draw header
            await this.drawHeader(ctx, ticketData);
            
            // Draw scratch grid
            await this.drawScratchGrid(ctx, ticketData.symbols, scratchedPositions);
            
            // Draw prize information
            await this.drawPrizeInfo(ctx);
            
            // Draw win status if game is complete
            if (scratchedPositions.length === 9 || this.checkWinCondition(ticketData.symbols, scratchedPositions)) {
                await this.drawGameResult(ctx, ticketData, scratchedPositions);
            }
            
            // Draw border
            await this.drawBorder(ctx);
            
            return canvas.toBuffer('image/png');
            
        } catch (error) {
            logger.error(`Error creating scratch ticket image: ${error.message}`);
            throw error;
        }
    }

    /**
     * Draw the background
     */
    async drawBackground(ctx) {
        // Gradient background
        const gradient = ctx.createLinearGradient(0, 0, this.TICKET_WIDTH, this.TICKET_HEIGHT);
        gradient.addColorStop(0, this.COLORS.BACKGROUND);
        gradient.addColorStop(1, '#0f0f23');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.TICKET_WIDTH, this.TICKET_HEIGHT);

        // Add some texture
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * this.TICKET_WIDTH;
            const y = Math.random() * this.TICKET_HEIGHT;
            const size = Math.random() * 2;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Draw the header
     */
    async drawHeader(ctx, ticketData) {
        // Header background
        ctx.fillStyle = this.COLORS.HEADER_BG;
        ctx.fillRect(20, 20, this.TICKET_WIDTH - 40, 80);
        
        // Header border
        ctx.strokeStyle = this.COLORS.BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, this.TICKET_WIDTH - 40, 80);

        // Title
        ctx.fillStyle = this.COLORS.BORDER;
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎫 SCRATCH TICKET', this.TICKET_WIDTH / 2, 55);
        
        // Ticket ID
        ctx.fillStyle = '#CCCCCC';
        ctx.font = '14px Arial';
        ctx.fillText(`#${ticketData.id}`, this.TICKET_WIDTH / 2, 85);
    }

    /**
     * Draw the scratch grid
     */
    async drawScratchGrid(ctx, symbols, scratchedPositions) {
        const { ROWS, COLS, CELL_SIZE, SPACING, START_X, START_Y } = this.GRID_CONFIG;

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const index = row * COLS + col;
                const x = START_X + col * (CELL_SIZE + SPACING);
                const y = START_Y + row * (CELL_SIZE + SPACING);
                
                const isScratched = scratchedPositions.includes(index);
                
                if (isScratched) {
                    // Draw revealed symbol
                    await this.drawRevealedCell(ctx, x, y, symbols[index]);
                } else {
                    // Draw scratch coating
                    await this.drawScratchCoating(ctx, x, y, index);
                }
            }
        }

        // Draw grid lines
        ctx.strokeStyle = this.COLORS.GRID_LINE;
        ctx.lineWidth = 2;
        
        // Vertical lines
        for (let col = 0; col <= COLS; col++) {
            const x = START_X + col * (CELL_SIZE + SPACING) - SPACING / 2;
            ctx.beginPath();
            ctx.moveTo(x, START_Y - SPACING / 2);
            ctx.lineTo(x, START_Y + ROWS * (CELL_SIZE + SPACING) - SPACING / 2);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let row = 0; row <= ROWS; row++) {
            const y = START_Y + row * (CELL_SIZE + SPACING) - SPACING / 2;
            ctx.beginPath();
            ctx.moveTo(START_X - SPACING / 2, y);
            ctx.lineTo(START_X + COLS * (CELL_SIZE + SPACING) - SPACING / 2, y);
            ctx.stroke();
        }
    }

    /**
     * Draw a revealed cell
     */
    async drawRevealedCell(ctx, x, y, symbol) {
        const { CELL_SIZE } = this.GRID_CONFIG;
        
        // Cell background
        ctx.fillStyle = this.COLORS.SYMBOL_BG;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        
        // Symbol
        ctx.fillStyle = '#333333';
        ctx.font = `${CELL_SIZE * 0.6}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
    }

    /**
     * Draw scratch coating
     */
    async drawScratchCoating(ctx, x, y, index) {
        const { CELL_SIZE } = this.GRID_CONFIG;
        
        // Base coating
        ctx.fillStyle = this.COLORS.SCRATCH_COATING;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        
        // Scratch pattern texture
        ctx.fillStyle = this.COLORS.SCRATCH_PATTERN;
        
        // Create a crosshatch pattern
        ctx.lineWidth = 1;
        for (let i = 0; i < CELL_SIZE; i += 8) {
            // Diagonal lines
            ctx.beginPath();
            ctx.moveTo(x + i, y);
            ctx.lineTo(x, y + i);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + CELL_SIZE - i, y);
            ctx.lineTo(x + CELL_SIZE, y + i);
            ctx.stroke();
        }
        
        // Add "SCRATCH" text
        ctx.fillStyle = '#999999';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SCRATCH', x + CELL_SIZE / 2, y + CELL_SIZE / 2);
        
        // Add position number for reference
        ctx.fillStyle = '#777777';
        ctx.font = '8px Arial';
        ctx.fillText((index + 1).toString(), x + CELL_SIZE - 8, y + 12);
    }

    /**
     * Draw prize information
     */
    async drawPrizeInfo(ctx) {
        // Prize box background
        const prizeBoxX = 20;
        const prizeBoxY = 120;
        const prizeBoxWidth = 150;
        const prizeBoxHeight = 120;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(prizeBoxX, prizeBoxY, prizeBoxWidth, prizeBoxHeight);
        
        ctx.strokeStyle = this.COLORS.BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(prizeBoxX, prizeBoxY, prizeBoxWidth, prizeBoxHeight);
        
        // Prize title
        ctx.fillStyle = this.COLORS.PRIZE_TEXT;
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('PRIZES', prizeBoxX + prizeBoxWidth / 2, prizeBoxY + 25);
        
        // Prize amounts
        const prizes = ['$150K', '$250K', '$400K'];
        ctx.font = '14px Arial';
        ctx.fillStyle = this.COLORS.WIN_TEXT;
        
        prizes.forEach((prize, index) => {
            ctx.fillText(prize, prizeBoxX + prizeBoxWidth / 2, prizeBoxY + 50 + index * 20);
        });
        
        // Instructions
        ctx.fillStyle = '#CCCCCC';
        ctx.font = '10px Arial';
        ctx.fillText('Match 3 symbols', prizeBoxX + prizeBoxWidth / 2, prizeBoxY + prizeBoxHeight - 10);
    }

    /**
     * Draw game result
     */
    async drawGameResult(ctx, ticketData, scratchedPositions) {
        const winCheck = this.checkWinCondition(ticketData.symbols, scratchedPositions);
        
        // Result box
        const resultBoxX = this.TICKET_WIDTH - 170;
        const resultBoxY = 120;
        const resultBoxWidth = 150;
        const resultBoxHeight = 120;
        
        ctx.fillStyle = winCheck.won ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(resultBoxX, resultBoxY, resultBoxWidth, resultBoxHeight);
        
        ctx.strokeStyle = winCheck.won ? this.COLORS.WIN_TEXT : this.COLORS.LOSE_TEXT;
        ctx.lineWidth = 3;
        ctx.strokeRect(resultBoxX, resultBoxY, resultBoxWidth, resultBoxHeight);
        
        // Result text
        ctx.fillStyle = winCheck.won ? this.COLORS.WIN_TEXT : this.COLORS.LOSE_TEXT;
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        
        if (winCheck.won) {
            ctx.fillText('🎉 WINNER! 🎉', resultBoxX + resultBoxWidth / 2, resultBoxY + 30);
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`3 ${winCheck.symbol}`, resultBoxX + resultBoxWidth / 2, resultBoxY + 55);
            ctx.fillText(fmtFull(ticketData.wonAmount || 0), resultBoxX + resultBoxWidth / 2, resultBoxY + 80);
        } else {
            ctx.fillText('💸 NO MATCH', resultBoxX + resultBoxWidth / 2, resultBoxY + 40);
            ctx.font = '12px Arial';
            ctx.fillText('Better luck', resultBoxX + resultBoxWidth / 2, resultBoxY + 65);
            ctx.fillText('next time!', resultBoxX + resultBoxWidth / 2, resultBoxY + 85);
        }
    }

    /**
     * Draw border
     */
    async drawBorder(ctx) {
        // Outer border
        ctx.strokeStyle = this.COLORS.BORDER;
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, this.TICKET_WIDTH - 4, this.TICKET_HEIGHT - 4);
        
        // Inner border
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 8, this.TICKET_WIDTH - 16, this.TICKET_HEIGHT - 16);
        
        // Corner decorations
        const cornerSize = 20;
        ctx.fillStyle = this.COLORS.BORDER;
        
        // Top-left corner
        ctx.fillRect(0, 0, cornerSize, 4);
        ctx.fillRect(0, 0, 4, cornerSize);
        
        // Top-right corner
        ctx.fillRect(this.TICKET_WIDTH - cornerSize, 0, cornerSize, 4);
        ctx.fillRect(this.TICKET_WIDTH - 4, 0, 4, cornerSize);
        
        // Bottom-left corner
        ctx.fillRect(0, this.TICKET_HEIGHT - 4, cornerSize, 4);
        ctx.fillRect(0, this.TICKET_HEIGHT - cornerSize, 4, cornerSize);
        
        // Bottom-right corner
        ctx.fillRect(this.TICKET_WIDTH - cornerSize, this.TICKET_HEIGHT - 4, cornerSize, 4);
        ctx.fillRect(this.TICKET_WIDTH - 4, this.TICKET_HEIGHT - cornerSize, 4, cornerSize);
    }

    /**
     * Check win condition (same as in scratchTickets.js)
     */
    checkWinCondition(symbols, scratchedPositions) {
        const scratchedSymbols = scratchedPositions.map(pos => symbols[pos]);
        const symbolCounts = {};
        
        scratchedSymbols.forEach(symbol => {
            symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
        });

        for (const [symbol, count] of Object.entries(symbolCounts)) {
            if (count >= 3) {
                return { won: true, symbol, count };
            }
        }

        return { won: false };
    }

    /**
     * Create a simple ticket preview (for drops)
     */
    async createTicketPreview() {
        if (!Canvas) {
            return null;
        }

        try {
            const canvas = Canvas.createCanvas(300, 200);
            const ctx = canvas.getContext('2d');

            // Background
            const gradient = ctx.createLinearGradient(0, 0, 300, 200);
            gradient.addColorStop(0, this.COLORS.BACKGROUND);
            gradient.addColorStop(1, '#0f0f23');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 300, 200);

            // Border
            ctx.strokeStyle = this.COLORS.BORDER;
            ctx.lineWidth = 3;
            ctx.strokeRect(5, 5, 290, 190);

            // Title
            ctx.fillStyle = this.COLORS.BORDER;
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🎫 SCRATCH', 150, 50);
            ctx.fillText('TICKET', 150, 80);

            // Scratch areas preview
            ctx.fillStyle = this.COLORS.SCRATCH_COATING;
            const cellSize = 25;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const x = 75 + j * 30;
                    const y = 110 + i * 30;
                    ctx.fillRect(x, y, cellSize, cellSize);
                }
            }

            // Prize text
            ctx.fillStyle = this.COLORS.PRIZE_TEXT;
            ctx.font = '12px Arial';
            ctx.fillText('WIN UP TO $400K!', 150, 175);

            return canvas.toBuffer('image/png');
        } catch (error) {
            logger.error(`Error creating ticket preview: ${error.message}`);
            return null;
        }
    }
}

module.exports = new ScratchTicketGenerator();