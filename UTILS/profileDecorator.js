/**
 * Profile Decorator for ATIVE Casino Bot
 * Handles profile picture decoration with frames and overlays
 */

const Canvas = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const shopManager = require('./shopManager');
const logger = require('./logger');

class ProfileDecorator {
    constructor() {
        // Canvas settings
        this.canvasSize = 512; // Base canvas size
        this.avatarSize = 400; // Avatar size inside the frame
        this.frameWidth = 56; // Frame border width
        
        // Frame colors and styles
        this.frameStyles = {
            'gold': {
                gradient: ['#FFD700', '#FFA500', '#FFD700'],
                shadow: '#B8860B',
                glow: '#FFFF00',
                pattern: 'solid'
            },
            'diamond': {
                gradient: ['#E0E6FF', '#B4C6FC', '#9BB0FF', '#E0E6FF'],
                shadow: '#4169E1',
                glow: '#FFFFFF',
                pattern: 'sparkle'
            },
            'ruby': {
                gradient: ['#DC143C', '#8B0000', '#DC143C'],
                shadow: '#800000',
                glow: '#FF69B4',
                pattern: 'solid'
            },
            'emerald': {
                gradient: ['#50C878', '#228B22', '#50C878'],
                shadow: '#006400',
                glow: '#90EE90',
                pattern: 'solid'
            }
        };
    }

    /**
     * Create decorated profile image
     * @param {string} avatarUrl - User's avatar URL
     * @param {Array} decorations - User's active decorations
     * @returns {Buffer} Decorated image buffer
     */
    async createDecoratedProfile(avatarUrl, decorations) {
        try {
            // Create canvas
            const canvas = Canvas.createCanvas(this.canvasSize, this.canvasSize);
            const ctx = canvas.getContext('2d');
            
            // Set high quality rendering
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Clear canvas with transparent background
            ctx.clearRect(0, 0, this.canvasSize, this.canvasSize);
            
            // Load and draw avatar
            const avatar = await Canvas.loadImage(avatarUrl);
            await this.drawAvatar(ctx, avatar);
            
            // Apply decorations in order (frames first, then overlays)
            const frames = decorations.filter(d => d.type === 'frame');
            const overlays = decorations.filter(d => d.type === 'overlay');
            
            // Draw frames
            for (const frame of frames) {
                await this.drawFrame(ctx, frame.color);
            }
            
            // Draw overlays
            for (const overlay of overlays) {
                await this.drawOverlay(ctx, overlay);
            }
            
            return canvas.toBuffer('image/png');
        } catch (error) {
            logger.error(`Error creating decorated profile: ${error.message}`);
            return null;
        }
    }

    /**
     * Draw user avatar in the center
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Image} avatar - Avatar image
     */
    async drawAvatar(ctx, avatar) {
        const centerX = this.canvasSize / 2;
        const centerY = this.canvasSize / 2;
        const radius = this.avatarSize / 2;
        
        // Create circular clipping path
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.clip();
        
        // Draw avatar
        ctx.drawImage(
            avatar,
            centerX - radius,
            centerY - radius,
            this.avatarSize,
            this.avatarSize
        );
        
        ctx.restore();
    }

    /**
     * Draw decorative frame around avatar
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {string} frameColor - Frame color type
     */
    async drawFrame(ctx, frameColor) {
        const centerX = this.canvasSize / 2;
        const centerY = this.canvasSize / 2;
        const innerRadius = this.avatarSize / 2;
        const outerRadius = innerRadius + this.frameWidth;
        
        const frameStyle = this.frameStyles[frameColor] || this.frameStyles.gold;
        
        ctx.save();
        
        // Create frame gradient
        const gradient = ctx.createRadialGradient(
            centerX, centerY, innerRadius,
            centerX, centerY, outerRadius
        );
        
        const colors = frameStyle.gradient;
        for (let i = 0; i < colors.length; i++) {
            gradient.addColorStop(i / (colors.length - 1), colors[i]);
        }
        
        // Draw outer glow
        if (frameStyle.glow) {
            ctx.shadowColor = frameStyle.glow;
            ctx.shadowBlur = 20;
        }
        
        // Draw frame
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
        ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true); // Counter-clockwise for inner circle
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Add sparkle pattern for diamond frame
        if (frameStyle.pattern === 'sparkle') {
            await this.drawSparkles(ctx, centerX, centerY, innerRadius, outerRadius);
        }
        
        // Add inner border
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.strokeStyle = frameStyle.shadow;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius + 2, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }

    /**
     * Draw sparkle pattern for diamond frames
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} centerX - Center X coordinate
     * @param {number} centerY - Center Y coordinate
     * @param {number} innerRadius - Inner radius
     * @param {number} outerRadius - Outer radius
     */
    async drawSparkles(ctx, centerX, centerY, innerRadius, outerRadius) {
        const sparkleCount = 12;
        const sparkleSize = 8;
        
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 4;
        
        for (let i = 0; i < sparkleCount; i++) {
            const angle = (Math.PI * 2 * i) / sparkleCount;
            const distance = innerRadius + (outerRadius - innerRadius) * Math.random();
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            
            // Draw sparkle (diamond shape)
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            
            ctx.beginPath();
            ctx.moveTo(0, -sparkleSize / 2);
            ctx.lineTo(sparkleSize / 4, 0);
            ctx.lineTo(0, sparkleSize / 2);
            ctx.lineTo(-sparkleSize / 4, 0);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
        
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }

    /**
     * Draw overlay decoration
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} overlay - Overlay decoration data
     */
    async drawOverlay(ctx, overlay) {
        // Future implementation for badges, ribbons, etc.
        // For now, this is a placeholder for extensibility
        logger.info(`Drawing overlay: ${overlay.type}`);
    }

    /**
     * Generate profile image for user
     * @param {string} userId - User ID
     * @param {string} avatarUrl - User's avatar URL
     * @returns {AttachmentBuilder|null} Discord attachment with decorated profile
     */
    async generateUserProfile(userId, avatarUrl) {
        try {
            // Check if user has decorations enabled
            const dbManager = require('./database');
            const userSettings = await dbManager.getUserSettings(userId);
            // Handle boolean conversion: null/undefined = true (default), 0/false = false, 1/true = true
            const decorationsEnabled = userSettings?.decorations_enabled == null ? true : Boolean(userSettings.decorations_enabled);
            
            if (!decorationsEnabled) {
                // Decorations are disabled, return null to use original avatar
                return null;
            }
            
            // Get user's active decoration
            const activeDecoration = await shopManager.getActiveDecoration(userId);
            
            if (!activeDecoration) {
                // No active decoration, return null to use original avatar
                return null;
            }
            
            // Create decorated image with active decoration
            const decoratedBuffer = await this.createDecoratedProfile(avatarUrl, [activeDecoration]);
            
            if (!decoratedBuffer) {
                return null;
            }
            
            // Create Discord attachment
            const attachment = new AttachmentBuilder(decoratedBuffer, {
                name: 'decorated_profile.png',
                description: 'Decorated profile picture'
            });
            
            return attachment;
        } catch (error) {
            logger.error(`Error generating user profile: ${error.message}`);
            return null;
        }
    }

    /**
     * Create profile preview for shop
     * @param {string} frameColor - Frame color to preview
     * @returns {Buffer} Preview image buffer
     */
    async createFramePreview(frameColor) {
        try {
            const canvas = Canvas.createCanvas(256, 256);
            const ctx = canvas.getContext('2d');
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Create sample avatar (gradient circle)
            const centerX = 128;
            const centerY = 128;
            const radius = 80;
            
            // Draw sample avatar
            const avatarGradient = ctx.createRadialGradient(
                centerX, centerY, 0,
                centerX, centerY, radius
            );
            avatarGradient.addColorStop(0, '#4A90E2');
            avatarGradient.addColorStop(1, '#2E5C8A');
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fillStyle = avatarGradient;
            ctx.fill();
            
            // Draw frame preview (scaled down)
            const originalSize = this.canvasSize;
            const originalAvatarSize = this.avatarSize;
            const originalFrameWidth = this.frameWidth;
            
            // Temporarily scale down for preview
            this.canvasSize = 256;
            this.avatarSize = 160;
            this.frameWidth = 28;
            
            await this.drawFrame(ctx, frameColor);
            
            // Restore original sizes
            this.canvasSize = originalSize;
            this.avatarSize = originalAvatarSize;
            this.frameWidth = originalFrameWidth;
            
            return canvas.toBuffer('image/png');
        } catch (error) {
            logger.error(`Error creating frame preview: ${error.message}`);
            return null;
        }
    }
}

module.exports = new ProfileDecorator();