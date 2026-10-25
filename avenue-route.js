// Orden y distancias comprimidos para el juego; no es un relevamiento catastral.
export const LOT_LENGTH = 24;
export const LOT_COUNT = 84;
export const ROUTE_LENGTH = LOT_LENGTH * LOT_COUNT;
export const routeIndex = slot => ((slot % LOT_COUNT) + LOT_COUNT) % LOT_COUNT;

const profile = (id, kind, name, color, accent, height, secondary = '#67716b') =>
  Object.freeze({ id, kind, name, color, accent, height, secondary });

export const AVENUE_PROFILES = Object.freeze([
  profile('knitwear', 'textile', 'TEJIDOS MAR DEL PLATA', '#c9bdab', '#315866', 6.8),
  profile('outlet', 'textile', 'OUTLET · INDUMENTARIA', '#ded8c8', '#912f32', 7.4),
  profile('factory', 'arched', 'VENTA DE FÁBRICA', '#ddd2b9', '#48433f', 6.6),
  profile('stone-house', 'house', '', '#c3b6a1', '#a44e37', 5.6),
  profile('plaster-house', 'house', '', '#e2e0cc', '#896549', 6.2),
  profile('workshop', 'workshop', 'TALLER · REPUESTOS', '#aab6b8', '#27596a', 6.2),
  profile('hardware', 'workshop', 'FERRETERÍA', '#c7bfae', '#a05c36', 7.2),
  profile('apartments', 'apartments', '', '#cfccc0', '#677477', 12.8),
  profile('corner', 'corner', 'ALMACÉN', '#c9d5c4', '#904735', 7),
  profile('furniture', 'workshop', 'MUEBLES · ABERTURAS', '#c7b8a3', '#584d43', 7.8),
  profile('bendu', 'bendu', 'bendu', '#212929', '#343e3b', 12.8, '#78845a'),
  profile('coto', 'mall', 'COTO', '#d6d5cb', '#bd242d', 8),
  profile('alpine', 'textile', 'ALPINE SKATE', '#b4afa2', '#ab262c', 6.8),
  profile('raffaelli', 'textile', 'RAFFAELLI GIARDINO', '#d7d1bf', '#242b30', 7),
  profile('bender', 'arched', 'BENDER', '#e0d6c0', '#62604b', 7.6),
  profile('stendhal', 'arched', 'STENDHAL', '#dcd3bd', '#3e4241', 7.4),
  profile('spinaker', 'textile', 'SPINAKER', '#ccc6b8', '#284b61', 7),
  profile('san-pablo', 'workshop', 'MATERIALES SAN PABLO', '#bcb5a4', '#a44435', 7.8),
  profile('axion', 'station', 'AXION energy', '#e7e8e4', '#c60969', 5.2),
  profile('ypf', 'station', 'YPF', '#ecede7', '#0075be', 5.4),
  profile('shell', 'station', 'Shell', '#f0eee2', '#ffd329', 5.3, '#c32e26'),
  profile('maderera-jbj', 'lumber', 'JUAN B. JUSTO', '#deded0', '#873d2d', 9.8, '#bc915c'),
  profile('tecnica-5', 'school', 'E.E.T. Nº 5', '#e5e2ce', '#bc2627', 8.6, '#ccbd7f'),
]);

export const isLandmarkKind = kind => ['station', 'bendu', 'lumber', 'school'].includes(kind);

// Alturas verificadas en las fuentes de docs/juan-b-justo.md. La posición lateral
// y los lotes de relleno son escenográficos; las fachadas son interpretaciones.
export const LANDMARKS = Object.freeze([
  { slot: 1, span: 3, side: -1, profile: 'bendu' },
  { slot: 5, span: 2, side: -1, profile: 'coto' },
  { address: 10, slot: 0, span: 2, side: 1, profile: 'axion' },
  { address: 835, side: -1, profile: 'raffaelli' },
  { address: 860, side: 1, profile: 'alpine' },
  { address: 1001, side: -1, profile: 'bender' },
  { address: 1006, side: 1, profile: 'alpine' },
  { address: 1490, span: 2, side: 1, profile: 'axion' },
  { address: 1531, side: -1, profile: 'stendhal' },
  { address: 1670, side: 1, profile: 'spinaker' },
  { address: 2035, span: 2, side: -1, profile: 'ypf' },
  { address: 2402, span: 2, side: 1, profile: 'shell' },
  { address: 3820, side: 1, profile: 'san-pablo' },
  // El remate se comprime para incluir la escuela pedida, al 4287, junto a San Juan.
  { address: 4153, slot: 80, span: 2, side: -1, profile: 'maderera-jbj' },
  { address: 4199, slot: 82, side: -1, profile: 'shell' },
  { address: 4287, slot: 83, side: -1, profile: 'tecnica-5' },
].map(landmark => Object.freeze({ span: 1, ...landmark, slot: landmark.slot ?? Math.floor(landmark.address / 50) })));

const markers = new Map([
  [0, ['AV. DE LOS TRABAJADORES', 'JUAN B. JUSTO → SAN JUAN']],
  [15, ['AVENIDA DEL PULÓVER', 'JUAN B. JUSTO · MAR DEL PLATA']],
  [42, ['JUAN B. JUSTO', 'CONTINÚA HACIA SAN JUAN']],
  [83, ['SAN JUAN', 'EL RECORRIDO VUELVE A EMPEZAR']],
]);

export function avenueSample(slot, side = 1, channel = 0) {
  let seed = Math.imul(routeIndex(slot) + 1, 73856093) ^ Math.imul(side + 2, 19349663) ^ Math.imul(channel + 1, 83492791);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
}

const lots = new Map();
for (const side of [-1, 1]) {
  lots.set(side, Array.from({ length: LOT_COUNT }, (_, index) => {
    const sample = avenueSample(index, side);
    const choices = index < 12 ? [3, 4, 8, 7] : index < 42 ? [0, 1, 2, 3, 7] : [3, 4, 5, 6, 7, 8, 9];
    const landmark = LANDMARKS.find(item => item.side === side && item.slot <= index && index < item.slot + item.span);
    const appearance = landmark
      ? AVENUE_PROFILES.find(item => item.id === landmark.profile)
      : AVENUE_PROFILES[choices[Math.floor(sample * choices.length)]];
    return Object.freeze({ index, side, appearance, span: landmark?.span ?? 1,
      offset: landmark ? index - landmark.slot : 0,
      marker: side === 1 ? markers.get(index) : undefined });
  }));
}

export function buildingAt(slot, side) {
  return lots.get(side)[routeIndex(slot)];
}

export function routeState(distance) {
  const progress = ((distance % ROUTE_LENGTH) + ROUTE_LENGTH) % ROUTE_LENGTH;
  const index = Math.floor(progress / LOT_LENGTH);
  const zone = index < 12 ? 'De los Trabajadores' : index < 42 ? 'Avenida del Pulóver' : index < 80 ? 'Hacia San Juan' : 'San Juan';
  return { index, zone, lap: Math.floor(Math.max(0, distance) / ROUTE_LENGTH) + 1 };
}
