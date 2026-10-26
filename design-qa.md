# Revisión visual del menú

Source visual truth: imagen de referencia adjunta por el usuario en la solicitud
(delante de EEST N°5, título El Guardapolvo, botones rojo y blanco), 1600×900.
La imagen está visible en la conversación; no se recibió como archivo con ruta.
El encargo es conservar su estilo, no reproducir la fotografía píxel por píxel.

Implementación renderizada con Chromium/Playwright, sin marco de navegador:
- test-results/menu-desktop.png, 1600×900 CSS y píxeles, deviceScaleFactor 1.
- test-results/menu-mobile.png, 390×844 CSS y píxeles, deviceScaleFactor 1.
- test-results/menu-characters.png, selector abierto, 1600×900.
No se aplicó escalado de densidad. No se afirma comparación píxel a píxel ni
composición lado a lado con el adjunto original que no tiene archivo local.

## Hallazgos y correcciones

Primera captura: iconos rotos en el servidor de pruebas (P1) y fondo claro en
Récords heredado del CSS anterior (P2). Se agregó MIME image/svg+xml al servidor
de pruebas y se corrigió la especificidad del botón. Las capturas posteriores
muestran los iconos de biblioteca y navegación uniforme. Sin desborde horizontal
ni controles fuera de pantalla en la revisión móvil.

## Superficies revisadas

- Tipografía: Permanent Marker para título y frase; Bangers para botones. Título
  blanco, subrayado rojo y jerarquía secundaria. La familia aproxima el trazo
  de la referencia sin convertir el texto editable en una imagen.
- Espaciado: escuela y corredor a la izquierda; navegación y acciones a la
  derecha; utilidades abajo. En móvil el contenido forma una sola columna.
- Color: rojo oscuro, papel cálido, azul y negro; contraste suficiente detrás
  de las acciones. Foco visible y hover diferenciados.
- Imágenes: fondo generado con arquitectura de escuela argentina, corredor de
  espaldas y luz cálida; es una ilustración inspirada, no una foto documental.
  Miniaturas renderizadas de los cuatro modelos reales. Iconos Tabler locales.
- Texto: modo infinito inicia el juego; modo historia dice Próximamente y
  explica su estado. Selección muestra nombre guardado. Ajustes y volumen son
  controles reales; récords usa el ranking existente y logros usa puntuaciones.

## Interacciones comprobadas

Apertura/cierre con Escape, selección y persistencia tras recarga, silencio
persistente, volumen, modo infinito, aviso de historia, logros, versión móvil.
Prueba de consola sin errores en el recorrido principal. Pruebas de las nuevas
mallas: ambos LOD, carrera, salto, agachado y apoyo al piso. Revisión de frente
animado: test-results/hoodie-student-run.png y phone-student-run.png.

## Límites y seguimiento

P3: los bordes pintados son más regulares que la referencia. La calle y la escuela
del fondo son una interpretación. No se verificó rendimiento en GPU física.
El archivo de caminata que excede 32 MiB no se agregó ni se muestra disponible.

final result: passed
