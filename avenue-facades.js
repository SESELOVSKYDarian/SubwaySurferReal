import { toTexture } from './textures.js';

function canvas(width = 1024, height = 512) {
  const image = document.createElement('canvas');
  image.width = width;
  image.height = height;
  return [image, image.getContext('2d')];
}

function text(ctx, label, x, y, width, size, color) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y, width);
}

function glass(ctx, x, y, width, height) {
  const reflection = ctx.createLinearGradient(x, y, x + width, y + height);
  reflection.addColorStop(0, '#8fa5a9');
  reflection.addColorStop(.35, '#52676b');
  reflection.addColorStop(.36, '#324447');
  reflection.addColorStop(1, '#192b30');
  ctx.fillStyle = reflection;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#b3b1a5';
  ctx.lineWidth = 5;
  ctx.strokeRect(x, y, width, height);
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y);
  ctx.lineTo(x + width / 2, y + height);
  ctx.stroke();
}

function sweater(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 20, y);
  ctx.lineTo(x - 43, y + 22);
  ctx.lineTo(x - 30, y + 38);
  ctx.lineTo(x - 18, y + 29);
  ctx.lineTo(x - 18, y + 74);
  ctx.lineTo(x + 18, y + 74);
  ctx.lineTo(x + 18, y + 29);
  ctx.lineTo(x + 30, y + 38);
  ctx.lineTo(x + 43, y + 22);
  ctx.lineTo(x + 20, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a8a391';
  ctx.lineWidth = 2;
  for (let i = 15; i < 70; i += 7) {
    ctx.beginPath();ctx.moveTo(x - 17, y + i);ctx.lineTo(x + 17, y + i);ctx.stroke();
  }
}

function landmarkFacade(ctx, profile) {
  const { kind, name, color, accent } = profile;
  if (kind === 'station') {
    ctx.fillStyle = '#f3f4ed';ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = accent;ctx.fillRect(0, 0, 1024, 128);
    if (profile.id === 'shell') {
      ctx.fillStyle = '#d72b27';ctx.fillRect(0, 104, 1024, 24);
      text(ctx, name, 512, 85, 830, 90, '#d12624');
    } else text(ctx, name, 512, 90, 940, 90, '#ffffff');
    text(ctx, profile.id === 'ypf' ? 'FULL' : profile.id === 'axion' ? 'SPOT!' : 'SELECT', 512, 183, 950, 52, '#243c4b');
    // Surtidor: pantalla, botones y manguera impresos, sin piezas adicionales.
    ctx.fillStyle = '#cdd1cc';ctx.fillRect(0, 205, 256, 307);
    ctx.fillStyle = '#1b252b';ctx.fillRect(20, 233, 169, 97);
    text(ctx, '0000', 104, 299, 150, 51, '#c0dcc0');
    ctx.fillStyle = accent;ctx.fillRect(20, 361, 164, 31);
    ctx.strokeStyle = '#242b2a';ctx.lineWidth = 11;
    ctx.beginPath();ctx.moveTo(214, 272);ctx.bezierCurveTo(247, 280, 249, 472, 205, 460);ctx.stroke();
    // Tótem: misma textura que la marquesina, con bandas de combustibles.
    ctx.fillStyle = accent;ctx.fillRect(287, 205, 737, 111);
    text(ctx, name, 650, 286, 690, 73, profile.id === 'shell' ? '#c32e26' : '#ffffff');
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#33444d';ctx.fillRect(308, 332 + i * 56, 695, 44);
      text(ctx, ['NAFTA', 'DIESEL', 'SERVICIOS'][i], 650, 367 + i * 56, 650, 34, '#ffffff');
    }
    return true;
  }
  if (kind === 'bendu') {
    ctx.fillStyle = color;ctx.fillRect(0, 0, 1024, 512);
    for (let x = 0; x < 1024; x += 10) {ctx.fillStyle = '#ffffff08';ctx.fillRect(x, 0, 2, 512);}
    ctx.fillStyle = '#00000030';ctx.fillRect(0, 390, 1024, 122);
    text(ctx, 'bendu', 512, 337, 930, 205, '#f0f0df');
    return true;
  }
  if (kind === 'lumber') {
    ctx.fillStyle = color;ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = '#724831';ctx.lineWidth = 7;
    ctx.beginPath();ctx.arc(92, 79, 58, 0, Math.PI * 2);ctx.stroke();
    text(ctx, 'JB', 92, 99, 102, 54, '#724831');
    text(ctx, name, 595, 70, 795, 75, '#81392d');
    text(ctx, 'PLACAS Y MADERAS', 595, 126, 795, 49, '#5e493b');
    // Showroom de dos alturas, carpintería marrón y carteles de productos.
    ctx.fillStyle = '#526e79';ctx.fillRect(0, 164, 1024, 348);
    const colors = ['#d9d1b4', '#8aa5a0', '#a04832', '#b99c52'];
    const labels = ['PLACAS', 'TECHOS', 'PISOS', 'MOLDURAS'];
    for (let col = 0; col < 4; col++) for (let row = 0; row < 3; row++) {
      const x = col * 256 + 12, y = 175 + row * 109;
      ctx.fillStyle = colors[(row + col) % colors.length];ctx.fillRect(x, y, 230, 83);
      text(ctx, labels[col], x + 115, y + 55, 213, 36, '#f8f3df');
    }
    ctx.fillStyle = '#614334';
    for (let x = 0; x < 1024; x += 256) ctx.fillRect(x, 164, 12, 348);
    for (let y = 164; y < 512; y += 109) ctx.fillRect(0, y, 1024, 11);
    return true;
  }
  if (kind === 'arena') {
    ctx.fillStyle = accent;ctx.fillRect(0, 0, 1024, 128);
    text(ctx, 'ESTADIO POLIDEPORTIVO', 512, 42, 960, 40, '#f7f5e9');
    text(ctx, name, 512, 111, 960, 73, '#ffffff');
    ctx.save();ctx.beginPath();ctx.rect(0, 128, 1024, 384);ctx.clip();
    ctx.fillStyle = '#e5d9bd';ctx.fillRect(0, 128, 1024, 384);
    const colors = ['#d4a42d', '#b95538', '#2a6b95', '#477b68'];
    for (let i = 0; i < 12; i++) {
      const x = i * 105 - 80;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();ctx.moveTo(x, 128);ctx.lineTo(x + 100, 128);
      ctx.lineTo(x + 225, 512);ctx.lineTo(x + 90, 512);ctx.closePath();ctx.fill();
    }
    ctx.restore();
    return true;
  }
  if (kind === 'school') {
    ctx.fillStyle = color;ctx.fillRect(0, 0, 1024, 512);
    for (const x of [26, 230, 434, 638, 842]) glass(ctx, x, 25, 156, 132);
    ctx.fillStyle = '#c8c6b6';ctx.fillRect(0, 182, 1024, 120);
    for (let x = 0; x < 1024; x += 7) {ctx.fillStyle = '#fbf9e34d';ctx.fillRect(x, 185, 2, 112);}
    ctx.shadowColor = '#493d34';ctx.shadowOffsetX = 4;ctx.shadowOffsetY = 5;ctx.shadowBlur = 1;
    text(ctx, name, 512, 271, 960, 100, accent);
    ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0;
    ctx.fillStyle = profile.secondary;ctx.fillRect(0, 438, 1024, 74);
    ctx.fillStyle = '#38423b';ctx.fillRect(50, 325, 133, 187);
    for (const x of [235, 415, 835]) glass(ctx, x, 327, 140, 94);
    ctx.fillStyle = '#3a423a';ctx.beginPath();ctx.arc(673, 402, 88, 0, Math.PI * 2);ctx.fill();
    ctx.fillStyle = '#e7e5d7';ctx.beginPath();ctx.arc(673, 402, 71, 0, Math.PI * 2);ctx.fill();
    text(ctx, '5', 673, 455, 120, 145, '#a32929');
    ctx.fillStyle = '#567e5a';ctx.fillRect(641, 351, 46, 15);
    return true;
  }
  return false;
}

export function avenueFacade(profile) {
  const [image, ctx] = canvas();
  const { kind, name, color, accent } = profile;
  if (landmarkFacade(ctx, profile)) return toTexture(image);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 512);
  // Desgaste estable: el mismo frente reaparece igual en cada vuelta.
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff08' : '#0000000b';
    ctx.fillRect((i * 137) % 1024, (i * 83) % 512, 2 + i % 9, 2 + i % 5);
  }
  ctx.fillStyle = '#00000020';ctx.fillRect(0, 0, 1024, 16);
  ctx.fillRect(0, 478, 1024, 34);

  if (kind === 'house') {
    ctx.fillStyle = '#9a8970';
    for (let y = 270; y < 478; y += 28) for (let x = 0; x < 1024; x += 58) {
      ctx.fillRect(x + (y % 56 ? 26 : 0), y, 52, 23);
    }
    for (const x of [95, 380, 735]) glass(ctx, x, 115, 180, 200);
    ctx.fillStyle = accent;ctx.fillRect(577, 185, 100, 293);
    ctx.strokeStyle = '#e5d2a5';ctx.strokeRect(592, 205, 70, 230);
  } else if (kind === 'apartments') {
    for (let row = 0; row < 4; row++) {
      ctx.fillStyle = '#737b77';ctx.fillRect(0, 108 + row * 98, 1024, 10);
      for (let col = 0; col < 5; col++) glass(ctx, 35 + col * 200, 22 + row * 98, 150, 75);
    }
    ctx.fillStyle = '#6c6962';ctx.fillRect(0, 425, 1024, 53);
    for (let col = 0; col < 12; col++) {
      ctx.fillStyle = '#b5b3a4';ctx.fillRect(col * 90, 425, 4, 53);
    }
  } else if (kind === 'workshop') {
    ctx.fillStyle = '#656965';ctx.fillRect(48, 190, 735, 288);
    for (let y = 195; y < 478; y += 12) {
      ctx.fillStyle = '#ffffff18';ctx.fillRect(48, y, 735, 3);
      ctx.fillStyle = '#00000025';ctx.fillRect(48, y + 5, 735, 2);
    }
    glass(ctx, 810, 213, 160, 265);
    ctx.fillStyle = accent;ctx.fillRect(25, 62, 974, 95);
    text(ctx, name, 512, 125, 910, 53, '#f3edda');
    for (const x of [15, 790, 990]) {ctx.fillStyle = '#e0d5bb';ctx.fillRect(x, 165, 14, 313);}
  } else {
    const mall = kind === 'mall';
    const top = mall ? 178 : 225;
    if (mall) {
      for (let x = 0; x < 1024; x += 15) {
        ctx.fillStyle = '#ffffff0d';ctx.fillRect(x, 0, 3, 175);
      }
    } else if (kind === 'arched') {
      ctx.strokeStyle = '#a79d86';ctx.lineWidth = 12;
      for (let x = 128; x < 1024; x += 256) {
        ctx.beginPath();ctx.arc(x, 155, 107, Math.PI, 0);ctx.stroke();
      }
    } else {
      for (const x of [90, 350, 610, 870]) glass(ctx, x, 28, 110, 72);
    }
    for (let i = 0; i < 4; i++) {
      const x = 28 + i * 250;
      glass(ctx, x, top, 220, 478 - top);
      if (!mall && kind !== 'corner') for (let j = 0; j < 2; j++) sweater(ctx, x + 65 + j * 90, top + 75, ['#c1ab87', '#9d4d45', '#84978c', '#d5c5a0'][(i + j) % 4]);
    }
    ctx.fillStyle = mall ? color : accent;
    ctx.fillRect(18, mall ? 35 : 124, 988, mall ? 125 : 80);
    text(ctx, name, 512, mall ? 133 : 182, 935, name === 'bendu' ? 112 : 64, mall && name !== 'COTO' ? '#eeeade' : name === 'COTO' ? accent : '#f3efdf');
    if (!mall) {
      ctx.fillStyle = '#dbd3b3';ctx.fillRect(40, 410, 180, 45);
      text(ctx, 'FÁBRICA', 130, 442, 165, 30, '#363b37');
    }
  }
  return toTexture(image);
}

export function avenueStreetSign(lines) {
  const [image, ctx] = canvas(1024, 256);
  ctx.fillStyle = '#234d43';ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = '#d9e2cc';ctx.lineWidth = 10;ctx.strokeRect(9, 9, 1006, 238);
  text(ctx, lines[0], 512, 112, 942, 66, '#fffdf0');
  text(ctx, lines[1], 512, 196, 942, 36, '#e1e4cd');
  return toTexture(image);
}
