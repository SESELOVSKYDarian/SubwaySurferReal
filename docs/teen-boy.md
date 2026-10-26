# Jugador teen-boy

Modelo del usuario: teen-boy, de theskipper (Sketchfab), CC BY 4.0.
Fuente y licencia completas en assets/characters/ATTRIBUTION.md.

Se mantienen las texturas originales. Blender normaliza escala y orientación,
adapta los brazos y transfiere pesos al esqueleto de 19 huesos del juego.
Se exportan dos niveles de detalle, conservando las animaciones procedurales,
la física y el seguimiento de brazos existentes en main 51b4a42.

Reconstrucción: `blender -b --python-exit-code 1 --python tools/adapt_teen_blender.py`.
El original y el rig de referencia están incluidos en source/teen-boy.
Este cambio usa la ropa original del recurso; el guardapolvo requiere otra adaptación.

Respaldo anterior: backup/main-before-teen-51b4a42.
Reversión sin reescribir historial: `git revert teen-boy-v1`, seguido de `git push origin main`.
