const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const output = path.join(root, 'assets', 'foco.ico');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const colors = {
  background: [23, 24, 31, 255], border: [52, 53, 63, 255],
  frame: [220, 217, 229, 255], monogram: [184, 169, 234, 255], accent: [229, 165, 176, 255]
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function roundedRect(x, y, left, top, width, height, radius) {
  const cx = clamp(x, left + radius, left + width - radius);
  const cy = clamp(y, top + radius, top + height - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}
function segmentDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function inStroke(x, y, segments, thickness) {
  return segments.some(([x1, y1, x2, y2]) => segmentDistance(x, y, x1, y1, x2, y2) <= thickness / 2);
}
function colorAt(x, y) {
  if (!roundedRect(x, y, 4, 4, 120, 120, 30)) return [0, 0, 0, 0];
  if (!roundedRect(x, y, 5, 5, 118, 118, 29.5)) return colors.border;
  const corners = [
    [43, 31, 31, 31], [31, 31, 31, 43], [85, 31, 97, 31], [97, 31, 97, 43],
    [31, 85, 31, 97], [31, 97, 43, 97], [97, 85, 97, 97], [85, 97, 97, 97]
  ];
  if (inStroke(x, y, [[49, 46, 78, 46], [49, 46, 49, 83], [49, 64, 72, 64]], 9)) return colors.monogram;
  if (Math.hypot(x - 80, y - 82) <= 5) return colors.accent;
  if (inStroke(x, y, corners, 7)) return colors.frame;
  return colors.background;
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}
function png(size) {
  const samples = 4, raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const total = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        const color = colorAt((x + (sx + .5) / samples) * 128 / size, (y + (sy + .5) / samples) * 128 / size);
        for (let channel = 0; channel < 4; channel++) total[channel] += color[channel];
      }
      for (const value of total) raw[offset++] = Math.round(value / (samples * samples));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const images = sizes.map(png);
const header = Buffer.alloc(6); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = 6 + images.length * 16;
const entries = images.map((image, index) => {
  const size = sizes[index], entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size; entry[1] = size === 256 ? 0 : size;
  entry[4] = 1; entry[6] = 32; entry.writeUInt32LE(image.length, 8); entry.writeUInt32LE(offset, 12);
  offset += image.length; return entry;
});
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([header, ...entries, ...images]));
console.log(`Windows icon written: ${output}`);
