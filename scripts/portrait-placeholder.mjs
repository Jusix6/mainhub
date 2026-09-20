// Placeholder portrait for the license-style business card (src/assets/portrait.png, 600x750).
// Replace with a real photo of the same size; the card crops with object-fit: cover.
import sharp from 'sharp';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffb35c"/>
      <stop offset="1" stop-color="#ff7a1a"/>
    </linearGradient>
  </defs>
  <rect width="600" height="750" fill="url(#bg)"/>
  <circle cx="300" cy="290" r="140" fill="#1b1440" opacity="0.9"/>
  <path d="M60 750 C60 560 160 480 300 480 C440 480 540 560 540 750 Z" fill="#1b1440" opacity="0.9"/>
  <rect x="200" y="250" width="200" height="60" rx="30" fill="#ffd23f" opacity="0.9"/>
  <text x="300" y="700" text-anchor="middle" font-family="Courier New, monospace" font-size="34" font-weight="700" fill="#1b1440" opacity="0.7">PHOTO TBD</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('src/assets/portrait.png');
console.log('wrote src/assets/portrait.png');
