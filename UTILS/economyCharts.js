/**
 * Economy Chart Generation Utilities
 * Creates visual charts for economic analysis using Canvas
 */

const { createCanvas } = require('canvas');
const { fmt } = require('./moneyFormatter');

class EconomyCharts {
    constructor() {
        this.defaultWidth = 800;
        this.defaultHeight = 500;
        this.colors = {
            primary: '#3498DB',
            secondary: '#E74C3C',
            success: '#2ECC71',
            warning: '#F39C12',
            info: '#9B59B6',
            background: '#2C3E50',
            text: '#ECF0F1',
            grid: '#34495E'
        };
    }

    /**
     * Create wealth distribution pie chart
     */
    createWealthDistributionChart(data) {
        const canvas = createCanvas(this.defaultWidth, this.defaultHeight);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.defaultWidth, this.defaultHeight);
        
        // Title
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Wealth Distribution', this.defaultWidth / 2, 40);
        
        // Calculate chart area
        const centerX = this.defaultWidth / 2;
        const centerY = this.defaultHeight / 2 + 20;
        const radius = Math.min(this.defaultWidth, this.defaultHeight) * 0.25;
        
        // Calculate total and percentages
        const total = data.reduce((sum, item) => sum + item.value, 0);
        let currentAngle = -Math.PI / 2; // Start at top
        
        const chartColors = [
            this.colors.primary,
            this.colors.secondary,
            this.colors.success,
            this.colors.warning,
            this.colors.info,
            '#E67E22',
            '#1ABC9C',
            '#8E44AD'
        ];
        
        // Draw pie slices
        data.forEach((item, index) => {
            const sliceAngle = (item.value / total) * 2 * Math.PI;
            
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.fillStyle = chartColors[index % chartColors.length];
            ctx.fill();
            
            // Draw label on slice
            const labelAngle = currentAngle + sliceAngle / 2;
            const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
            const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            const percentage = ((item.value / total) * 100).toFixed(1);
            ctx.fillText(`${percentage}%`, labelX, labelY);
            
            currentAngle += sliceAngle;
        });
        
        // Draw legend
        const legendX = 50;
        let legendY = centerY - (data.length * 15) / 2;
        
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        
        data.forEach((item, index) => {
            // Color box
            ctx.fillStyle = chartColors[index % chartColors.length];
            ctx.fillRect(legendX, legendY - 8, 15, 15);
            
            // Label
            ctx.fillStyle = this.colors.text;
            ctx.fillText(`${item.label}: ${fmt(item.value)}`, legendX + 25, legendY + 4);
            
            legendY += 25;
        });
        
        return canvas;
    }

    /**
     * Create bar chart for economic metrics
     */
    createBarChart(data, title, yAxisLabel) {
        const canvas = createCanvas(this.defaultWidth, this.defaultHeight);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.defaultWidth, this.defaultHeight);
        
        // Title
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, this.defaultWidth / 2, 35);
        
        // Chart area
        const padding = 80;
        const chartWidth = this.defaultWidth - (padding * 2);
        const chartHeight = this.defaultHeight - padding - 100;
        const chartX = padding;
        const chartY = 60;
        
        // Find max value for scaling
        const maxValue = Math.max(...data.map(item => item.value));
        const scale = chartHeight / maxValue;
        
        // Bar width
        const barWidth = chartWidth / data.length * 0.8;
        const barSpacing = chartWidth / data.length * 0.2;
        
        // Draw bars
        data.forEach((item, index) => {
            const barHeight = item.value * scale;
            const x = chartX + (index * (barWidth + barSpacing)) + barSpacing / 2;
            const y = chartY + chartHeight - barHeight;
            
            // Gradient
            const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
            gradient.addColorStop(0, this.colors.primary);
            gradient.addColorStop(1, this.colors.info);
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);
            
            // Value on top of bar
            ctx.fillStyle = this.colors.text;
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(fmt(item.value), x + barWidth / 2, y - 5);
            
            // Label below bar
            ctx.save();
            ctx.translate(x + barWidth / 2, chartY + chartHeight + 20);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = 'right';
            ctx.fillText(item.label, 0, 0);
            ctx.restore();
        });
        
        // Y-axis
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(chartX, chartY);
        ctx.lineTo(chartX, chartY + chartHeight);
        ctx.stroke();
        
        // Y-axis labels
        ctx.fillStyle = this.colors.text;
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        
        for (let i = 0; i <= 5; i++) {
            const value = (maxValue / 5) * i;
            const y = chartY + chartHeight - (i * chartHeight / 5);
            
            ctx.fillText(fmt(value), chartX - 10, y + 3);
            
            // Grid line
            ctx.strokeStyle = this.colors.grid;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(chartX, y);
            ctx.lineTo(chartX + chartWidth, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Y-axis label
        ctx.save();
        ctx.translate(20, chartY + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(yAxisLabel, 0, 0);
        ctx.restore();
        
        return canvas;
    }

    /**
     * Create line chart for trends
     */
    createLineChart(data, title, xAxisLabel, yAxisLabel) {
        const canvas = createCanvas(this.defaultWidth, this.defaultHeight);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.defaultWidth, this.defaultHeight);
        
        // Title
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, this.defaultWidth / 2, 35);
        
        // Chart area
        const padding = 80;
        const chartWidth = this.defaultWidth - (padding * 2);
        const chartHeight = this.defaultHeight - padding - 100;
        const chartX = padding;
        const chartY = 60;
        
        // Find min/max values for scaling
        const values = data.map(item => item.value);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const valueRange = maxValue - minValue;
        
        // Axes
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Y-axis
        ctx.moveTo(chartX, chartY);
        ctx.lineTo(chartX, chartY + chartHeight);
        // X-axis
        ctx.moveTo(chartX, chartY + chartHeight);
        ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
        ctx.stroke();
        
        // Plot data points
        const points = data.map((item, index) => ({
            x: chartX + (index * chartWidth) / (data.length - 1),
            y: chartY + chartHeight - ((item.value - minValue) / valueRange) * chartHeight
        }));
        
        // Draw line
        ctx.strokeStyle = this.colors.primary;
        ctx.lineWidth = 3;
        ctx.beginPath();
        points.forEach((point, index) => {
            if (index === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        });
        ctx.stroke();
        
        // Draw points
        points.forEach((point, index) => {
            ctx.fillStyle = this.colors.secondary;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Value label
            ctx.fillStyle = this.colors.text;
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(fmt(data[index].value), point.x, point.y - 10);
        });
        
        // X-axis labels
        ctx.fillStyle = this.colors.text;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        
        data.forEach((item, index) => {
            const x = chartX + (index * chartWidth) / (data.length - 1);
            const y = chartY + chartHeight + 20;
            
            ctx.save();
            ctx.translate(x, y);
            if (item.label.length > 8) {
                ctx.rotate(-Math.PI / 4);
            }
            ctx.fillText(item.label, 0, 0);
            ctx.restore();
        });
        
        // Y-axis labels
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const value = minValue + (valueRange / 5) * i;
            const y = chartY + chartHeight - (i * chartHeight / 5);
            
            ctx.fillText(fmt(value), chartX - 10, y + 3);
        }
        
        // Axis labels
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        
        // X-axis label
        ctx.fillText(xAxisLabel, chartX + chartWidth / 2, this.defaultHeight - 20);
        
        // Y-axis label
        ctx.save();
        ctx.translate(20, chartY + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(yAxisLabel, 0, 0);
        ctx.restore();
        
        return canvas;
    }

    /**
     * Create economic dashboard summary
     */
    createEconomyDashboard(stats) {
        const canvas = createCanvas(this.defaultWidth, 600);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.defaultWidth, 600);
        
        // Title
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🏦 Economy Dashboard', this.defaultWidth / 2, 40);
        
        // Stats cards
        const cardWidth = 180;
        const cardHeight = 120;
        const cardsPerRow = 4;
        const startX = (this.defaultWidth - (cardsPerRow * cardWidth + (cardsPerRow - 1) * 20)) / 2;
        let x = startX;
        let y = 70;
        
        const cards = [
            { title: 'Total Wealth', value: stats.totalWealth, color: this.colors.success },
            { title: 'Active Users', value: stats.activeUsers, color: this.colors.primary },
            { title: 'Avg Balance', value: stats.avgBalance, color: this.colors.warning },
            { title: 'Transactions', value: stats.totalTransactions, color: this.colors.info },
            { title: 'Total Wagered', value: stats.totalWagered, color: this.colors.secondary },
            { title: 'Total Won', value: stats.totalWon, color: this.colors.success },
            { title: 'Win Rate', value: `${stats.winRate}%`, color: this.colors.primary },
            { title: 'Lottery Pool', value: stats.lotteryPool, color: this.colors.warning }
        ];
        
        cards.forEach((card, index) => {
            if (index === cardsPerRow) {
                x = startX;
                y += cardHeight + 20;
            }
            
            // Card background
            ctx.fillStyle = card.color;
            ctx.fillRect(x, y, cardWidth, cardHeight);
            
            // Card border
            ctx.strokeStyle = this.colors.text;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cardWidth, cardHeight);
            
            // Title
            ctx.fillStyle = this.colors.text;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(card.title, x + cardWidth / 2, y + 25);
            
            // Value
            ctx.font = 'bold 18px Arial';
            const displayValue = typeof card.value === 'number' ? fmt(card.value) : card.value;
            ctx.fillText(displayValue, x + cardWidth / 2, y + 55);
            
            // Icon or additional info
            ctx.font = '12px Arial';
            ctx.fillStyle = '#ECF0F1';
            
            x += cardWidth + 20;
        });
        
        // Economic health indicator
        const healthY = y + cardHeight + 50;
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Economic Health: ', this.defaultWidth / 2 - 50, healthY);
        
        // Health status
        const healthScore = this.calculateEconomicHealth(stats);
        const healthColor = healthScore >= 80 ? this.colors.success : 
                           healthScore >= 60 ? this.colors.warning : this.colors.secondary;
        
        ctx.fillStyle = healthColor;
        ctx.fillText(`${healthScore}%`, this.defaultWidth / 2 + 50, healthY);
        
        // Health description
        ctx.fillStyle = this.colors.text;
        ctx.font = '14px Arial';
        const healthDesc = this.getHealthDescription(healthScore);
        ctx.fillText(healthDesc, this.defaultWidth / 2, healthY + 25);
        
        return canvas;
    }

    /**
     * Calculate economic health score
     */
    calculateEconomicHealth(stats) {
        let score = 50; // Base score
        
        // Active user participation
        if (stats.activeUsers > 100) score += 15;
        else if (stats.activeUsers > 50) score += 10;
        else if (stats.activeUsers > 25) score += 5;
        
        // Win rate balance (too high or too low is bad)
        if (stats.winRate >= 35 && stats.winRate <= 65) score += 15;
        else if (stats.winRate >= 25 && stats.winRate <= 75) score += 10;
        else score += 5;
        
        // Wealth distribution
        if (stats.avgBalance > 0) score += 10;
        
        // Transaction activity
        if (stats.totalTransactions > 1000) score += 10;
        else if (stats.totalTransactions > 500) score += 7;
        else if (stats.totalTransactions > 100) score += 5;
        
        return Math.min(100, Math.max(0, score));
    }

    /**
     * Get health description
     */
    getHealthDescription(score) {
        if (score >= 90) return '🟢 Excellent - Economy is thriving!';
        if (score >= 75) return '🟡 Good - Healthy economic activity';
        if (score >= 60) return '🟠 Fair - Some room for improvement';
        if (score >= 40) return '🔴 Poor - Economic concerns';
        return '⚫ Critical - Major economic issues';
    }
}

module.exports = EconomyCharts;