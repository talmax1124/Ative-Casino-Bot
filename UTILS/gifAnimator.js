/**
 * GIF Animation Utility for smooth spinning animations
 */

const Canvas = require('canvas');
const GIFEncoder = require('gif-encoder-2');
const logger = require('./logger');

class GifAnimator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.encoder = null;
    }

    /**
     * Create spinning roulette wheel GIF
     * @param {Object} config - Animation configuration
     * @returns {Buffer} GIF buffer
     */
    async createSpinningRouletteGIF(config) {
        try {
            const {
                width = 1000,
                height = 800,
                frames = 60, // 60 frames for smooth animation
                delay = 100, // 100ms delay between frames (10 FPS)
                repeat = 0 // 0 = infinite loop
            } = config;

            // Create canvas and encoder
            this.canvas = Canvas.createCanvas(width, height);
            this.ctx = this.canvas.getContext('2d');
            this.encoder = new GIFEncoder(width, height, 'octree', true);

            // Configure encoder
            this.encoder.setDelay(delay);
            this.encoder.setRepeat(repeat);
            this.encoder.setQuality(1); // Best quality
            this.encoder.start();

            logger.info(`Creating spinning roulette GIF: ${frames} frames at ${delay}ms delay`);

            // Generate all animation frames
            for (let frame = 0; frame < frames; frame++) {
                await this.renderRouletteFrame(frame, frames, config);
                
                // Add frame to encoder
                this.encoder.addFrame(this.ctx);
                
                // Log progress every 10 frames
                if (frame % 10 === 0) {
                    logger.info(`GIF Progress: ${Math.round((frame / frames) * 100)}%`);
                }
            }

            this.encoder.finish();
            const buffer = this.encoder.out.getData();
            
            logger.info(`GIF created successfully: ${buffer.length} bytes`);
            return buffer;

        } catch (error) {
            logger.error(`Error creating spinning roulette GIF: ${error.message}`);
            throw error;
        }
    }

    /**
     * Render a single frame of the spinning roulette wheel
     */
    async renderRouletteFrame(frameIndex, totalFrames, config) {
        // Use actual canvas dimensions from config
        const canvasWidth = config.width || 800;
        const canvasHeight = config.height || 600;
        
        // Center based on actual canvas size
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        
        // Scale wheel radius based on canvas size
        const wheelRadius = Math.min(canvasWidth, canvasHeight) * 0.35; // 35% of smallest dimension

        // Clear canvas
        this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Background with gradient centered on actual canvas
        const bgGradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(canvasWidth, canvasHeight) * 0.6);
        bgGradient.addColorStop(0, '#1a1a2e');
        bgGradient.addColorStop(1, '#16213e');
        this.ctx.fillStyle = bgGradient;
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Calculate rotation based on frame
        const wheelRotation = (frameIndex / totalFrames) * Math.PI * 4; // 2 full rotations
        const ballRotation = -(frameIndex / totalFrames) * Math.PI * 8; // 4 rotations opposite direction

        // Draw outer wheel rings
        for (let i = 0; i < 4; i++) {
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, wheelRadius + 30 - (i * 3), 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(139, 69, 19, ${0.8 - i * 0.15})`;
            this.ctx.fill();
            this.ctx.strokeStyle = i === 0 ? '#FFD700' : '#8B4513';
            this.ctx.lineWidth = i === 0 ? 6 : 2;
            this.ctx.stroke();
        }

        // American roulette numbers
        const wheelNumbers = [
            0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00',
            27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2
        ];

        const anglePerSlot = (Math.PI * 2) / 38;

        // Draw wheel segments with rotation
        wheelNumbers.forEach((num, index) => {
            const baseAngle = index * anglePerSlot;
            const angle = baseAngle + wheelRotation;
            const isGreen = num === 0 || num === '00';
            const isRed = !isGreen && [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(num);
            
            // Segment colors
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
            const gradient = this.ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, wheelRadius);
            gradient.addColorStop(0, color);
            gradient.addColorStop(0.7, color);
            gradient.addColorStop(1, shadowColor);

            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.arc(centerX, centerY, wheelRadius, angle, angle + anglePerSlot);
            this.ctx.closePath();
            this.ctx.fillStyle = gradient;
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#FFD700';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Draw numbers - scale positioning based on wheel size
            const textRadius = wheelRadius * 0.75; // Scale text radius relative to wheel
            const textX = centerX + Math.cos(angle + anglePerSlot/2) * textRadius;
            const textY = centerY + Math.sin(angle + anglePerSlot/2) * textRadius;
            
            this.ctx.save();
            this.ctx.translate(textX, textY);
            this.ctx.rotate(angle + anglePerSlot/2 + Math.PI/2);
            
            // Text shadow - scale font size
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            const fontSize = Math.max(12, wheelRadius / 14); // Scale font with wheel size
            this.ctx.font = `bold ${fontSize}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(num.toString(), 1, 1);
            
            // Actual text
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillText(num.toString(), 0, 0);
            this.ctx.restore();
        });

        // Enhanced inner circle - scale based on wheel size
        const innerRadius = wheelRadius * 0.25; // 25% of wheel radius
        const innerGradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, innerRadius);
        innerGradient.addColorStop(0, '#D2691E');
        innerGradient.addColorStop(0.7, '#8B4513');
        innerGradient.addColorStop(1, '#654321');
        
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = innerGradient;
        this.ctx.fill();
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        // Inner inner circle - scale based on wheel size
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, innerRadius * 0.5, 0, Math.PI * 2);
        this.ctx.fillStyle = '#654321';
        this.ctx.fill();
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Enhanced spinning ball with trail - scale based on wheel size
        const wobble = Math.sin(frameIndex * 0.5) * 0.4;
        const ballAngle = ballRotation + wobble;
        const ballOrbitRadius = wheelRadius * 0.85; // Ball orbits at 85% of wheel radius
        const ballRadius = ballOrbitRadius + Math.sin(frameIndex * 0.3) * (wheelRadius * 0.03); // Small variation
        const ballX = centerX + Math.cos(ballAngle) * ballRadius;
        const ballY = centerY + Math.sin(ballAngle) * ballRadius;

        // Ball trail effect - scale based on wheel size
        const ballSize = wheelRadius * 0.08; // Ball is 8% of wheel radius
        const trailLength = 12;
        for (let i = trailLength; i > 0; i--) {
            const alpha = 0.8 - (i * 0.06);
            const trailAngle = ballAngle - (i * 0.3);
            const trailRadius = ballRadius - (i * 2);
            const trailX = centerX + Math.cos(trailAngle) * trailRadius;
            const trailY = centerY + Math.sin(trailAngle) * trailRadius;
            const trailSize = ballSize - (i * ballSize/20); // Scale trail size
            
            this.ctx.globalAlpha = alpha;
            const trailGradient = this.ctx.createRadialGradient(trailX, trailY, 0, trailX, trailY, trailSize);
            trailGradient.addColorStop(0, '#FFFFFF');
            trailGradient.addColorStop(1, '#CCCCCC');
            
            this.ctx.beginPath();
            this.ctx.arc(trailX, trailY, trailSize, 0, Math.PI * 2);
            this.ctx.fillStyle = trailGradient;
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1.0;

        // Main ball - scale based on wheel size
        this.ctx.shadowColor = '#FFFFFF';
        this.ctx.shadowBlur = 15;

        const ballGradient = this.ctx.createRadialGradient(
            ballX - ballSize/5, ballY - ballSize/5, 0, 
            ballX, ballY, ballSize
        );
        ballGradient.addColorStop(0, '#FFFFFF');
        ballGradient.addColorStop(0.7, '#F0F0F0');
        ballGradient.addColorStop(1, '#C0C0C0');

        this.ctx.beginPath();
        this.ctx.arc(ballX, ballY, ballSize, 0, Math.PI * 2); // Scaled ball size
        this.ctx.fillStyle = ballGradient;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        
        this.ctx.strokeStyle = '#808080';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        // No text - pure roulette wheel only
    }
}

module.exports = new GifAnimator();