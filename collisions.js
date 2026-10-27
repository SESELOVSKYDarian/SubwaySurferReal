export const PLAYER_HALF_DEPTH = 0.3;
export const CONTACT_HALF_WIDTH = 1.1;
export const LANE_RESPONSE = 18;

// Entrada y salida del volumen durante el cuadro, con la misma curva lateral
// exponencial que usa el cambio de carril.
function interval(from, to, min, max, timeAt) {
  if (from === to) return from > min && from < max ? [-Infinity, Infinity] : null;
  const a = timeAt(min), b = timeAt(max);
  return from < to ? [a, b] : [b, a];
}

export function obstacleContact(obstacle, fromX, toX, targetX, dt, move) {
  const { x, z } = obstacle.mesh.position;
  const lateralTime = boundary => {
    if (dt > 0 && fromX !== targetX) {
      const ratio = (boundary - targetX) / (fromX - targetX);
      if (ratio <= 0) return Infinity; // frontera más allá del destino
      return -Math.log(ratio) / (LANE_RESPONSE * dt);
    }
    return (boundary - fromX) / (toX - fromX);
  };
  const lateral = interval(fromX, toX, x - CONTACT_HALF_WIDTH, x + CONTACT_HALF_WIDTH, lateralTime);
  const halfDepth = obstacle.depth / 2 + PLAYER_HALF_DEPTH;
  const forward = interval(z - move, z, -halfDepth, halfDepth,
    boundary => (boundary - (z - move)) / move);
  if (!lateral || !forward) return null;
  const enter = Math.max(0, lateral[0], forward[0]);
  const exit = Math.min(1, lateral[1], forward[1]);
  if (enter >= exit) return null;
  return { time: enter, exit, side: lateral[0] >= 0 && lateral[0] > forward[0] + 1e-7 };
}

export function overlapsObstacle(obstacle, x, zOffset = 0) {
  return Math.abs(obstacle.mesh.position.x - x) < CONTACT_HALF_WIDTH &&
    Math.abs(obstacle.mesh.position.z + zOffset) < obstacle.depth / 2 + PLAYER_HALF_DEPTH;
}
