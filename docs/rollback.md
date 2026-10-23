# Volver al main anterior a la mejora visual

Antes de integrar estos cambios se guardó el `main` remoto completo:

- Commit: `c10fb4a136b7d2457e7d92e0f46c6efc560418e8`.
- Rama de respaldo: `backup/main-before-realism-c10fb4a` (también subida a GitHub).
- Integración identificada por la etiqueta `realism-third-person-v1`.

Para quitar la integración de `main` conservando el historial:

```bash
git fetch origin --tags
git switch main
git pull --ff-only origin main
git revert -m 1 --no-edit realism-third-person-v1
git push origin main
```

El primer padre del merge es el `main` respaldado; por eso `-m 1` conserva las
funciones anteriores (guardia, perro, rampas, jetpack y seguimiento corporal).
No hace falta un reset ni un push forzado. Si luego se modifican las mismas
líneas, el revert puede requerir resolver conflictos antes de continuar.

La rama `work` conserva el desarrollo visual previo a esta integración. El
respaldo anterior también se verificó como bundle completo en la máquina de
preparación (`/workspace/SubwaySurferReal-main-c10fb4a.bundle`).

## Deshacer solamente la actualización del policía y las monedas

Respaldo remoto: `backup/main-before-police-coins-9441e92`, commit
`9441e923c35b416f24c2fb1b68b34254643aa650`. La etiqueta `police-coins-v1`
identifica un commit normal (no un merge), por lo que se revierte sin `-m`:

```bash
git fetch origin --tags
git switch main
git pull --ff-only origin main
git revert --no-edit police-coins-v1
git push origin main
```

Esto conserva la primera mejora visual y la cámara en tercera persona.

## Deshacer la ambientación de técnica y los cambios de animación

Respaldo remoto: `backup/main-before-tecnica-5929fc5`, commit
`5929fc50aff67e2b3c454fe052c50ce7c0f6c5bb`. La etiqueta `tecnica-animation-v1`
identifica un commit normal:

```bash
git fetch origin --tags
git switch main
git pull --ff-only origin main
git revert --no-edit tecnica-animation-v1
git push origin main
```

Devuelve la versión del alumno militar y del policía anterior a esta adaptación,
conservando el historial. El archivo de respaldo permanece disponible en GitHub.

## Deshacer cámara, cuenta atrás y apoyo sobre vagones

Respaldo remoto: `backup/main-before-camera-countdown-e4c3c32`.
La etiqueta `camera-countdown-v1` identifica esta actualización:

```bash
git switch main
git pull --ff-only origin main
git revert --no-edit camera-countdown-v1
git push origin main
```
