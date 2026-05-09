import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'og.png');

const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="1200" height="630" fill="#FFFFFF"/>

  <!-- Yellow bar -->
  <rect x="72" y="72" width="10" height="72" rx="5" fill="#D4960A"/>

  <!-- Title -->
  <text x="104" y="128"
    font-family="Arial, Helvetica, sans-serif"
    font-size="62" font-weight="bold"
    fill="#D4960A" letter-spacing="-1">INEVITÁVEL GPT</text>

  <!-- Subtitle -->
  <text x="104" y="163"
    font-family="Arial, Helvetica, sans-serif"
    font-size="19" fill="#999999" letter-spacing="5">LIVRO AMARELO · ENTREVISTAS</text>

  <!-- Divider -->
  <rect x="72" y="192" width="1056" height="3" fill="#D4960A"/>

  <!-- Description line 1 -->
  <text x="72" y="268"
    font-family="Arial, Helvetica, sans-serif"
    font-size="30" fill="#333333">Explore o Livro Amarelo e as entrevistas de Renan</text>

  <!-- Description line 2 -->
  <text x="72" y="316"
    font-family="Arial, Helvetica, sans-serif"
    font-size="30" fill="#333333">Santos por meio de perguntas em linguagem natural.</text>

  <!-- Description line 3 -->
  <text x="72" y="364"
    font-family="Arial, Helvetica, sans-serif"
    font-size="30" fill="#333333">Respostas baseadas no conteúdo, com citação de fonte.</text>

  <!-- Footer URL -->
  <text x="1128" y="590"
    font-family="Arial, Helvetica, sans-serif"
    font-size="20" fill="#AAAAAA"
    text-anchor="end">inevitavelgpt.com</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(OUT, png);
console.log(`OG image generated: public/og.png (${(png.length / 1024).toFixed(0)} KB)`);
