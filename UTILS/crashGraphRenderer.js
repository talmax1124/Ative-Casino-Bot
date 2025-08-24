/**
 * Real-time Crash Graph Renderer using Canvas
 * Generates smooth animated crash game visuals
 */

const { createCanvas } = require('canvas');

class CrashGraphRenderer {
  constructor(width = 800, height = 400) {
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
    
    // Graph configuration - optimized for faster games
    this.padding = 60;
    this.graphWidth = width - (this.padding * 2);
    this.graphHeight = height - (this.padding * 2);
    this.maxTime = 20; // 20 seconds max display for faster pacing
    this.maxMultiplier = 8; // Start with 8x max view for faster scaling
    
    // Animation data
    this.points = [];
    this.crashed = false;
    this.crashPoint = null;
  }

  // Add new data point
  addPoint(time, multiplier) {
    this.points.push({ time, multiplier });
    
    // Adjust max multiplier view dynamically
    if (multiplier > this.maxMultiplier * 0.8) {
      this.maxMultiplier = Math.max(this.maxMultiplier * 1.5, multiplier + 2);
    }
    
    // Keep only recent points for performance
    if (this.points.length > 300) {
      this.points = this.points.slice(-250);
    }
  }

  // Set crash point
  setCrash(crashTime, crashMultiplier) {
    this.crashed = true;
    this.crashPoint = { time: crashTime, multiplier: crashMultiplier };
  }

  // Convert data coordinates to canvas coordinates
  dataToCanvas(time, multiplier) {
    const x = this.padding + (time / this.maxTime) * this.graphWidth;
    const y = this.height - this.padding - ((multiplier - 1) / (this.maxMultiplier - 1)) * this.graphHeight;
    return { x, y };
  }

  // Draw background and grid
  drawBackground() {
    const ctx = this.ctx;
    
    // Clear canvas with dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, this.width, this.height);
    
    // Draw grid
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    
    // Vertical grid lines (time) - closer spacing for faster games
    for (let t = 0; t <= this.maxTime; t += 2) {
      const { x } = this.dataToCanvas(t, 1);
      ctx.beginPath();
      ctx.moveTo(x, this.padding);
      ctx.lineTo(x, this.height - this.padding);
      ctx.stroke();
    }
    
    // Horizontal grid lines (multiplier) - more frequent for better scaling
    for (let m = 1; m <= this.maxMultiplier; m += 0.5) {
      const { y } = this.dataToCanvas(0, m);
      ctx.beginPath();
      ctx.moveTo(this.padding, y);
      ctx.lineTo(this.width - this.padding, y);
      ctx.stroke();
    }
    
    // Draw axes
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 2;
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(this.padding, this.padding);
    ctx.lineTo(this.padding, this.height - this.padding);
    ctx.stroke();
    
    // X-axis  
    const { y: baseY } = this.dataToCanvas(0, 1);
    ctx.beginPath();
    ctx.moveTo(this.padding, baseY);
    ctx.lineTo(this.width - this.padding, baseY);
    ctx.stroke();
  }

  // Draw multiplier labels
  drawLabels() {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'right';
    
    // Y-axis labels (multiplier) - show major multipliers
    for (let m = 1; m <= this.maxMultiplier; m += 1) {
      const { y } = this.dataToCanvas(0, m);
      ctx.fillText(`${m.toFixed(1)}x`, this.padding - 10, y + 5);
    }
    
    // X-axis labels (time) - faster intervals for quicker games
    ctx.textAlign = 'center';
    for (let t = 0; t <= this.maxTime; t += 2) {
      const { x } = this.dataToCanvas(t, 1);
      ctx.fillText(`${t}s`, x, this.height - this.padding + 20);
    }
  }

  // Draw the crash curve
  drawCurve() {
    if (this.points.length < 2) return;
    
    const ctx = this.ctx;
    
    // Create gradient for the line
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    if (this.crashed) {
      gradient.addColorStop(0, '#ff4444');
      gradient.addColorStop(1, '#cc0000');
    } else {
      gradient.addColorStop(0, '#00ff88');
      gradient.addColorStop(0.5, '#ffff44');
      gradient.addColorStop(1, '#ff4444');
    }
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw smooth curve
    ctx.beginPath();
    const firstPoint = this.dataToCanvas(this.points[0].time, this.points[0].multiplier);
    ctx.moveTo(firstPoint.x, firstPoint.y);
    
    for (let i = 1; i < this.points.length; i++) {
      const point = this.dataToCanvas(this.points[i].time, this.points[i].multiplier);
      ctx.lineTo(point.x, point.y);
    }
    
    ctx.stroke();
    
    // Add glow effect
    ctx.shadowColor = this.crashed ? '#ff4444' : '#00ff88';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Draw crash explosion effect
  drawCrashEffect() {
    if (!this.crashed || !this.crashPoint) return;
    
    const ctx = this.ctx;
    const { x, y } = this.dataToCanvas(this.crashPoint.time, this.crashPoint.multiplier);
    
    // Draw explosion circle
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, 30);
    gradient.addColorStop(0, '#ff4444');
    gradient.addColorStop(0.5, '#ff8844');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw "CRASHED" text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.strokeText('CRASHED!', x, y - 40);
    ctx.fillText('CRASHED!', x, y - 40);
    
    // Show crash multiplier
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`${this.crashPoint.multiplier.toFixed(2)}x`, x, y + 50);
  }

  // Draw current multiplier display
  drawCurrentMultiplier() {
    if (this.points.length === 0) return;
    
    const ctx = this.ctx;
    const currentPoint = this.points[this.points.length - 1];
    
    // Current multiplier box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(this.width - 150, 20, 130, 60);
    
    ctx.strokeStyle = this.crashed ? '#ff4444' : '#00ff88';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.width - 150, 20, 130, 60);
    
    // Multiplier text
    ctx.fillStyle = this.crashed ? '#ff4444' : '#00ff88';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${currentPoint.multiplier.toFixed(2)}x`, this.width - 85, 55);
  }

  // Generate the complete graph image
  render() {
    this.drawBackground();
    this.drawLabels();
    this.drawCurve();
    this.drawCrashEffect();
    this.drawCurrentMultiplier();
    
    return this.canvas.toBuffer('image/png');
  }

  // Reset for new game
  reset() {
    this.points = [];
    this.crashed = false;
    this.crashPoint = null;
    this.maxMultiplier = 10;
  }
}

module.exports = { CrashGraphRenderer };