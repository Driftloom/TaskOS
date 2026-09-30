/**
 * Reads actual RGB pixels out of a PNG. Used to settle a contradiction between
 * what the DOM reports (getComputedStyle) and what the rendered frame looks like
 * -- squinting at a screenshot is not evidence, and this repo has already been
 * bitten once by trusting a terminal that renders valid UTF-8 as garbage.
 *
 * Minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced, which is what Chromium's
 * screenshot() produces. zlib inflate + the five PNG scanline filters.
 *
 * Usage: node scripts/read-png-pixels.cjs <file.png> [x,y ...]
 */
const fs = require('fs');
const zlib = require('zlib');

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  let ri = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ri++];
    const line = raw.subarray(ri, ri + stride);
    ri += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v + pred) & 0xff;
          break;
        }
        default: throw new Error(`unknown filter ${filter} on row ${y}`);
      }
      cur[x] = v;
    }
  }

  return { width, height, channels, data: out };
}

function pixelAt(img, x, y) {
  const i = (y * img.width + x) * img.channels;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

function regionMean(img, x0, y0, w, h) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < Math.min(y0 + h, img.height); y++) {
    for (let x = x0; x < Math.min(x0 + w, img.width); x++) {
      const p = pixelAt(img, x, y);
      r += p[0];
      g += p[1];
      b += p[2];
      n++;
    }
  }
  return n === 0 ? null : [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function relLum([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a, b) {
  const l1 = relLum(a);
  const l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/read-png-pixels.cjs <file.png>');
  process.exit(2);
}

const img = decodePng(fs.readFileSync(file));
console.log(`  file   : ${file}`);
console.log(`  size   : ${img.width}x${img.height}  channels=${img.channels}`);

// Sample a coarse grid so the whole frame is characterised, not one lucky pixel.
const xs = [40, 120, 200, 300, 700, 1100, 1350].filter((x) => x < img.width);
const ys = [20, 100, 300, 500, 700, 900].filter((y) => y < img.height);
for (const y of ys) {
  const row = xs.map((x) => {
    const p = pixelAt(img, x, y);
    return `${String(x).padStart(4)}:(${p.join(',').padEnd(11)})`;
  });
  console.log(`  y=${String(y).padStart(4)}  ${row.join(' ')}`);
}

module.exports = { decodePng, pixelAt, regionMean, contrastRatio, relLum };
