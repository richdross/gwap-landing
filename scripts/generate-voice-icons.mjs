import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.resolve("public/images");

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuf.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x >= left + radius && x <= right - radius && y >= top && y <= bottom) return true;
  if (y >= top + radius && y <= bottom - radius && x >= left && x <= right) return true;
  const cx = x < left + radius ? left + radius : right - radius;
  const cy = y < top + radius ? top + radius : bottom - radius;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [5, 7, 6, 255];
  const panel = [8, 14, 10, 255];
  const green = [117, 255, 133, 255];
  const glow = [30, 70, 40, 255];

  const set = (x, y, color) => {
    const i = (y * size + x) * 4;
    rgba[i] = color[0];
    rgba[i + 1] = color[1];
    rgba[i + 2] = color[2];
    rgba[i + 3] = color[3];
  };

  const margin = Math.round(size * 0.07);
  const radius = Math.round(size * 0.22);
  const innerMargin = margin + Math.max(3, Math.round(size * 0.018));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = bg;
      if (insideRoundedRect(x, y, margin, margin, size - 1 - margin, size - 1 - margin, radius)) {
        color = panel;
      }
      set(x, y, color);
    }
  }

  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.255;
  const inner = size * 0.17;
  const gapTop = cy - size * 0.035;

  // soft green halo
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < outer * 1.25 && d > inner * 0.75) {
        const strength = Math.max(0, 1 - Math.abs(d - outer) / (outer * 0.35));
        if (strength > 0.08) {
          const i = (y * size + x) * 4;
          rgba[i] = Math.min(255, rgba[i] + Math.round(glow[0] * strength));
          rgba[i + 1] = Math.min(255, rgba[i + 1] + Math.round(glow[1] * strength));
          rgba[i + 2] = Math.min(255, rgba[i + 2] + Math.round(glow[2] * strength));
        }
      }
    }
  }

  // geometric G ring with right-side opening
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const inRing = d <= outer && d >= inner;
      const inOpening = Math.abs(angle) < 0.45 && y < gapTop + size * 0.11;
      if (inRing && !inOpening) set(x, y, green);
    }
  }

  // G crossbar and right stem
  const barY = Math.round(cy + size * 0.03);
  const barH = Math.max(8, Math.round(size * 0.045));
  const barX1 = Math.round(cx + size * 0.015);
  const barX2 = Math.round(cx + size * 0.235);
  for (let y = barY; y < Math.min(size, barY + barH); y++) {
    for (let x = barX1; x < Math.min(size, barX2); x++) set(x, y, green);
  }
  const stemX1 = Math.round(cx + size * 0.19);
  const stemX2 = Math.round(cx + size * 0.235);
  const stemY1 = barY;
  const stemY2 = Math.round(cy + size * 0.17);
  for (let y = stemY1; y < stemY2; y++) {
    for (let x = stemX1; x < stemX2; x++) set(x, y, green);
  }

  const scanline = size * 4 + 1;
  const raw = Buffer.alloc(scanline * size);
  for (let y = 0; y < size; y++) {
    raw[y * scanline] = 0;
    rgba.copy(raw, y * scanline + 1, y * size * 4, (y + 1) * size * 4);
  }

  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [180, 192, 512]) {
  const file = path.join(OUT_DIR, `gwap-voice-${size}.png`);
  fs.writeFileSync(file, makeIcon(size));
  console.log(`VOICE_ICON_READY=${file}`);
}
