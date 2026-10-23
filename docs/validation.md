> Histórico de las primeras mejoras visuales. Para el estado actual de Técnica Run,
> ver [animation-fixes.md](animation-fixes.md).

# Validación de la mejora visual

## Comportamiento comprobado

`npm test` sobre el main integrado: 5 pruebas pasaron, 0 fallaron, 0 omitidas.

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

4. Integración con el main remoto `c10fb4a`: guardia y perro iniciales, primer y
   segundo tropiezo, pausa y reanudación, subida por rampa, techo de vagón,
   jetpack unido al modelo nuevo, vuelo y agotamiento, encuadre durante vuelo.
   `pose.js` y `pose-worker.js` se conservaron sin modificaciones respecto a ese main.

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
La integración conserva las funciones del main `c10fb4a` y se identifica con
la etiqueta `realism-third-person-v1`. El respaldo y los comandos para volver
están en [`rollback.md`](rollback.md). Los resultados de rendimiento de arriba
pertenecen a la versión visual anterior a esta integración, no a una nueva
medición del main combinado.

## Actualización de policía y monedas

La batería ampliada verifica que el policía tenga su propio esqueleto y que
animarlo no cambie al corredor, que el guardia provisional deje de dibujarse al
cargar el modelo detallado y que ambos perseguidores se retiren al terminar
la persecución. También comprueba 300 monedas, ampliación de capacidad,
recogida, reinicio y un material metálico sin emisión de luz.

La simulación de colisiones usa obstáculos explícitos sin filas aleatorias para
que un tropiezo ajeno al caso no active invulnerabilidad durante la comprobación.
La aplicación real se sigue probando con la generación normal de obstáculos.
La captura de esta revisión se guarda en `test-results/police-coins.png`.

El main previo a esta actualización es `9441e923c35b416f24c2fb1b68b34254643aa650`,
con respaldo remoto `backup/main-before-police-coins-9441e92`. La revisión se
identifica con la etiqueta `police-coins-v1`.

Medición de esta actualización (misma máquina SwiftShader, 960×540, resolución
interna ×1, 30 muestras tras calentamiento y lectura de píxel por cuadro):
410,54 ms por cuadro, 2,44 FPS, renderizado medio 410,49 ms, percentil 95
451,90 ms, 379 llamadas de dibujo y 73.820 triángulos. La actualización anterior
integrada registró 484 llamadas y 2,56 FPS en este backend. Las monedas usan dos
niveles de detalle para limitar el aumento de geometría cercano. Esta medición
no confirma fluidez en una GPU física ni con detección corporal activa.
