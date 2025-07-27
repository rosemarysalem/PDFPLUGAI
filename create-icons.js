const fs = require('fs');
const { createCanvas } = require('canvas');

// Function to create PNG icon
function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, size, size);
  
  // Scale factor for different sizes
  const scale = size / 16;
  
  // Background circle
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.arc(8 * scale, 8 * scale, 7 * scale, 0, 2 * Math.PI);
  ctx.fill();
  
  // PDF document background
  ctx.fillStyle = '#fff';
  ctx.fillRect(4 * scale, 3 * scale, 6 * scale, 8 * scale);
  
  // PDF header
  ctx.fillStyle = '#ffb300';
  ctx.fillRect(4 * scale, 3 * scale, 6 * scale, 2 * scale);
  
  // PDF text
  ctx.fillStyle = '#2d0036';
  ctx.font = `bold ${1 * scale}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('PDF', 7 * scale, 4.5 * scale);
  
  // Smart brain indicator
  ctx.fillStyle = 'rgba(45, 0, 54, 0.8)';
  ctx.beginPath();
  ctx.arc(7 * scale, 7 * scale, 1.5 * scale, 0, 2 * Math.PI);
  ctx.fill();
  
  // Brain pattern
  ctx.fillStyle = '#ffb300';
  ctx.beginPath();
  ctx.moveTo(6 * scale, 7 * scale);
  ctx.quadraticCurveTo(7 * scale, 6 * scale, 8 * scale, 7 * scale);
  ctx.quadraticCurveTo(7 * scale, 8 * scale, 6 * scale, 7 * scale);
  ctx.fill();
  
  // Lightning bolt
  ctx.fillStyle = '#ffb300';
  ctx.beginPath();
  ctx.moveTo(11 * scale, 4 * scale);
  ctx.lineTo(10 * scale, 6 * scale);
  ctx.lineTo(10.5 * scale, 6 * scale);
  ctx.lineTo(9 * scale, 8 * scale);
  ctx.lineTo(10.5 * scale, 6 * scale);
  ctx.lineTo(10 * scale, 6 * scale);
  ctx.closePath();
  ctx.fill();
  
  // Document lines
  ctx.strokeStyle = '#2d0036';
  ctx.lineWidth = 0.3 * scale;
  
  // Line 1
  ctx.beginPath();
  ctx.moveTo(5 * scale, 8 * scale);
  ctx.lineTo(9 * scale, 8 * scale);
  ctx.stroke();
  
  // Line 2
  ctx.beginPath();
  ctx.moveTo(5 * scale, 9 * scale);
  ctx.lineTo(8.5 * scale, 9 * scale);
  ctx.stroke();
  
  // Line 3
  ctx.beginPath();
  ctx.moveTo(5 * scale, 10 * scale);
  ctx.lineTo(9 * scale, 10 * scale);
  ctx.stroke();
  
  return canvas;
}

// Create icons in different sizes
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const canvas = createIcon(size);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`icon-${size}.png`, buffer);
  console.log(`Created icon-${size}.png`);
});

console.log('All PNG icons created successfully!');