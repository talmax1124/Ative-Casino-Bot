/**
 * UNO Card Renderer
 * Creates visual representations of UNO cards and game state
 */

const Canvas = require('canvas');
const path = require('path');
const fs = require('fs');

class UnoRenderer {
    constructor() {
        this.assetsPath = path.join(__dirname, '../assets/uno/');
        this.cardWidth = 120;
        this.cardHeight = 180;
        this.cardSpacing = 10;
    }

    /**
     * Get image path for a UNO card
     */
    getCardImagePath(card) {
        try {
            let filename;
            
            if (card.type === 'wild') {
                filename = card.value === 'Wild' ? 'Wild.png' : 'Wild_Draw.png';
            } else {
                const color = card.color;
                let value = card.value;
                
                // Map special cards to their image names
                if (value === 'Skip') value = 'Skip';
                else if (value === 'Reverse') value = 'Reverse';
                else if (value === 'Draw') value = 'Draw';
                
                filename = `${color}_${value}.png`;
            }
            
            const imagePath = path.join(this.assetsPath, filename);
            
            // Check if file exists, fallback to deck if not
            if (fs.existsSync(imagePath)) {
                return imagePath;
            } else {
                console.warn(`UNO card image not found: ${filename}, using deck`);
                return path.join(this.assetsPath, 'Deck.png');
            }
        } catch (error) {
            console.error(`Error getting card image path: ${error.message}`);
            return path.join(this.assetsPath, 'Deck.png');
        }
    }

    /**
     * Render a single card
     */
    async renderCard(card, options = {}) {
        const { width = this.cardWidth, height = this.cardHeight } = options;
        
        const canvas = Canvas.createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        try {
            const imagePath = this.getCardImagePath(card);
            const image = await Canvas.loadImage(imagePath);
            
            ctx.drawImage(image, 0, 0, width, height);
            
            return canvas.toBuffer('image/png');
        } catch (error) {
            console.error(`Error rendering UNO card: ${error.message}`);
            
            // Fallback: draw a simple colored rectangle
            ctx.fillStyle = card.color ? this.getColorCode(card.color) : '#333333';
            ctx.fillRect(0, 0, width, height);
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, width, height);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(card.toString(), width / 2, height / 2);
            
            return canvas.toBuffer('image/png');
        }
    }

    /**
     * Render current top card for game display
     */
    async renderTopCard(card, options = {}) {
        const { 
            width = 200, 
            height = 300, 
            showTitle = true,
            title = 'Current Card'
        } = options;
        
        const canvas = Canvas.createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#1e2328';
        ctx.fillRect(0, 0, width, height);
        
        // Title
        if (showTitle) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(title, width / 2, 20);
        }
        
        // Card
        const cardY = showTitle ? 35 : 10;
        const cardHeight = height - cardY - 10;
        const cardWidth = cardHeight * (this.cardWidth / this.cardHeight);
        const cardX = (width - cardWidth) / 2;
        
        try {
            const imagePath = this.getCardImagePath(card);
            const image = await Canvas.loadImage(imagePath);
            
            ctx.drawImage(image, cardX, cardY, cardWidth, cardHeight);
            
            return canvas.toBuffer('image/png');
        } catch (error) {
            console.error(`Error rendering top card: ${error.message}`);
            
            // Fallback
            ctx.fillStyle = card.color ? this.getColorCode(card.color) : '#333333';
            ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(cardX, cardY, cardWidth, cardHeight);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(card.toString(), width / 2, cardY + cardHeight / 2);
            
            return canvas.toBuffer('image/png');
        }
    }

    /**
     * Render player's hand (for private view)
     */
    async renderPlayerHand(cards, options = {}) {
        const {
            maxCards = 10,
            overlapAmount = 60,
            width = 800,
            height = 220
        } = options;
        
        if (!cards || cards.length === 0) {
            return this.renderEmptyHand(width, height);
        }
        
        const canvas = Canvas.createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#2c5aa0';
        ctx.fillRect(0, 0, width, height);
        
        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Your Hand (${cards.length} cards)`, width / 2, 25);
        
        try {
            // Calculate card positions
            const displayCards = cards.slice(0, maxCards);
            const cardCount = displayCards.length;
            const totalOverlap = (cardCount - 1) * overlapAmount;
            const totalWidth = this.cardWidth + totalOverlap;
            const startX = Math.max(10, (width - totalWidth) / 2);
            const cardY = 40;
            
            // Draw cards
            for (let i = 0; i < displayCards.length; i++) {
                const card = displayCards[i];
                const cardX = startX + (i * overlapAmount);
                
                const imagePath = this.getCardImagePath(card);
                const image = await Canvas.loadImage(imagePath);
                
                // Draw card shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(cardX + 3, cardY + 3, this.cardWidth, this.cardHeight);
                
                // Draw card
                ctx.drawImage(image, cardX, cardY, this.cardWidth, this.cardHeight);
                
                // Draw card number
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText((i + 1).toString(), cardX + this.cardWidth / 2, cardY + this.cardHeight + 15);
            }
            
            // Show "..." if more cards
            if (cards.length > maxCards) {
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(`... +${cards.length - maxCards} more`, startX + totalWidth + 20, cardY + this.cardHeight / 2);
            }
            
            return canvas.toBuffer('image/png');
        } catch (error) {
            console.error(`Error rendering player hand: ${error.message}`);
            return this.renderEmptyHand(width, height);
        }
    }

    /**
     * Render empty hand placeholder
     */
    async renderEmptyHand(width = 400, height = 200) {
        const canvas = Canvas.createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#2c5aa0';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No Cards', width / 2, height / 2);
        
        return canvas.toBuffer('image/png');
    }

    /**
     * Get color code for UNO colors
     */
    getColorCode(color) {
        const colors = {
            'Red': '#e74c3c',
            'Blue': '#3498db',
            'Green': '#27ae60',
            'Yellow': '#f1c40f'
        };
        return colors[color] || '#333333';
    }
}

module.exports = new UnoRenderer();