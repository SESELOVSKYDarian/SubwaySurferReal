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
