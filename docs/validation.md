# Validación de la mejora visual

## Comportamiento comprobado

`npm test`: 3 pruebas pasaron, 0 fallaron, 0 omitidas.

1. Aplicación real: arranque, puntuación, teclado, selector de calidad y captura;
   sin peticiones a CDN para el modo de teclado.
2. Motor: modelo con dos mallas deformadas por esqueleto, altura normalizada a
   2,05 m, animación que cambia entre cuadros, carriles, salto, rodada, puntuación,
   encuadre en tercera persona en horizontal y vertical (incluido salto),
   selección de calidad, reducción automática de resolución, colisión y reinicio.
   La simulación intermedia evita renderizar cientos de cuadros innecesarios;
   se comprueba también el renderizado final.
3. Fallo de descarga del GLB: aparece el aviso y el juego sigue funcionando con
   el personaje procedural.

Se revisaron capturas de carrera y rodada. Se corrigieron la medición del modelo
antes de actualizar los huesos, su orientación y el centro de giro de la rodada.
También pasaron la comprobación de sintaxis de los módulos y `git diff --check`.

## Rendimiento medido

Chromium con ANGLE/Vulkan **SwiftShader**: renderizado por software, sin GPU física.
Ventana de 960×540, resolución interna ×1, cámara apagada y escena inicial.
Esta medición es anterior al ajuste posterior de encuadre de la cámara; no es
una medición nueva de esa revisión.
El benchmark usa semilla fija, cinco cuadros de calentamiento y 30 muestras;
actualiza la simulación con 1/60 s y espera `readPixels` tras cada renderizado.
Este paso fijo mantiene estable la resolución durante la comparación: no mide la
mejora posterior del modo automático durante una partida con cuadros lentos.

| Medida | Resultado |
| --- | ---: |
| Cuadro medio observado | 429,98 ms |
| FPS observados | 2,33 |
| Renderizado medio, incluyendo espera gráfica | 429,00 ms |
| Percentil 95 del renderizado | 473,00 ms |
| Llamadas de dibujo | 432 |
| Triángulos | 57.470 |

Como referencia, la primera versión procedural mejorada registró unas 912 llamadas
de dibujo, 52.128 triángulos y 2,7 FPS con este mismo backend de software. La nueva
versión reduce envíos de geometría, pero añade piel animada y materiales y no
supone una mejora de FPS a resolución fija en este backend. El cielo se calcula
una vez y se reutiliza como mapa, evitando su dispersión atmosférica por cuadro.

**No se verificaron 60 FPS.** Debe ejecutarse `npm run benchmark` y probarse una
partida en el navegador y GPU de destino. No se verificaron webcam física,
detección corporal ni rendimiento con MediaPipe activo.

## Alcance visual

Hay un personaje humano texturado con animación esquelética (Vanguard de Mixamo),
no un personaje civil diseñado específicamente para este juego. El entorno aún
usa texturas procedurales. Las mejoras se orientan a un estilo más realista;
no constituyen un acabado equivalente a GTA ni un escenario fotogramétrico.
Los cambios están en el checkout local; no se realizó publicación ni push.
