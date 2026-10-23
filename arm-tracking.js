// MediaPipe Pose: hombro, codo, muñeca y centro aproximado de la mano.
// Mismo espejo que la vista de cámara; sin inventar articulaciones de dedos.
export function armTargets(landmarks, aspect = 4 / 3) {
  const valid = i => landmarks?.[i] && (landmarks[i].visibility ?? 1) >= 0.6 &&
    Number.isFinite(landmarks[i].x) && Number.isFinite(landmarks[i].y);
  const direction = (a, b) => {
    if (!valid(a) || !valid(b)) return null;
    const x = -(landmarks[b].x - landmarks[a].x) * aspect;
    const y = -(landmarks[b].y - landmarks[a].y);
    const length = Math.hypot(x, y);
    return length > 0.025 ? [x / length, y / length, 0] : null;
  };
  const targets = {};
  // La izquierda anatómica detectada se ve a la izquierda en el espejo.
  for (const [side, shoulder, elbow, wrist, index, pinky] of [
    ['Right', 11, 13, 15, 19, 17], ['Left', 12, 14, 16, 20, 18],
  ]) {
    targets[`${side}Arm`] = direction(shoulder, elbow);
    targets[`${side}ForeArm`] = direction(elbow, wrist);
    targets[`${side}Hand`] = direction(wrist, index) || direction(wrist, pinky);
  }
  return targets;
}
