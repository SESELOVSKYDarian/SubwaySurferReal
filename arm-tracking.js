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
    const hip=side==='Right'?23:24;
    const torso=valid(hip)&&valid(shoulder)?landmarks[hip].y-landmarks[shoulder].y:0;
    // Con los brazos descansando conservar el braceo de carrera; levantar una
    // mano activa gradualmente su control directo sin bloquear el otro brazo.
    targets[`${side}Weight`]=valid(wrist)&&torso>.08
      ? Math.max(0,Math.min(1,(landmarks[hip].y-landmarks[wrist].y)/(torso*.6))) : 1;
    targets[`${side}Arm`] = direction(shoulder, elbow);
    targets[`${side}ForeArm`] = direction(elbow, wrist);
    targets[`${side}Hand`] = direction(wrist, index) || direction(wrist, pinky);
  }
  return targets;
}
