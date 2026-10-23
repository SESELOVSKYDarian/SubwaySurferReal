# Seguimiento, cuenta atrás y vagones

El inicio y la reanudación usan 3, 2, 1 con intervalos de un segundo. Con cámara
activa se espera una calibración válida. Perder hombros o cadera durante diez
resultados, recalibrar con C o no recibir resultados durante 1,2 segundos pausa
la partida. Al recuperar una calibración estable se reinicia toda la cuenta.
La pausa manual permanece hasta pulsar P.

El controlador conserva stream y modelo entre reintentos y partidas. Al cargar
la página consulta Permissions API y reconecta solo si el permiso está concedido.
El navegador puede volver a solicitar acceso si lo revoca, lo concede una sola vez
o no admite consultar ese permiso. Un fallo de conexión permite reintentar desde
la pantalla de pausa. MediaPipe sigue requiriendo acceso a sus servidores.

El ancho de apoyo del techo coincide con el ancho de colisión. El aterrizaje usa
la altura del cuadro anterior para detectar el cruce del techo incluso al caer
rápido; las paredes siguen causando choques. Se conserva la subida por rampas.
El torso acompaña más la carrera y la inclinación lateral cambia suavemente.

Validación automatizada: `CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm test`.
Incluye simulación del seguimiento y permisos/stream (sin cámara física), cuenta
atrás interrumpida, pausa manual, techo, caída rápida, choques frontales y las
regresiones existentes de salto/agachado, rampas, jetpack y objetos.
