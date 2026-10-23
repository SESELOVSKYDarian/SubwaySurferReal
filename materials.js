// Microdetalle compartido: no descarga imágenes ni crea texturas durante el juego.
import * as THREE from 'three';

const cache = new Map();
export function surface(kind = 'concrete') {
  if (cache.has(kind)) return cache.get(kind);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(256, 256);
  let seed = 731;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const fabric = kind === 'fabric';
      const weave = fabric ? ((x % 4 < 2 ? 9 : -9) + (y % 4 < 2 ? 9 : -9)) : 0;
      const value = 150 + weave + (random() - 0.5) * (fabric ? 18 : 85);
      const i = (y * 256 + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const bump = new THREE.CanvasTexture(canvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.anisotropy = 4;
  // Datos de relieve y rugosidad: espacio lineal, no sRGB.
  const result = { bumpMap: bump, bumpScale: kind === 'skin' ? 0.0012 : kind === 'fabric' ? 0.004 : kind === 'metal' ? 0.0015 : kind === 'fur' ? 0.004 : 0.035, roughnessMap: bump };
  cache.set(kind, result);
  return result;
}

export function contactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.25)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
