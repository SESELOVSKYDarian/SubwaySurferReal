# Reconstrucción de escuela para modo historia

Base revisada: origin/main 468a0cc. Trabajo aislado en rama story-school.
Estado: guía recibida. Primera escena arquitectónica de revisión generada; medidas aproximadas.
La escena es una primera estructura 3D, no una réplica fotorrealista ni una cinemática terminada.

## Referencias del mensaje, en orden

1. Frente de oficina vidriada, dos niveles, baranda, banderas, acceso derecho y escalera derecha.
2. Vista longitudinal hacia cancha: escalera izquierda, techo industrial, arcos, tablero y cerramiento lateral.
3. Vista hacia puertas de madera, escalera y planta central; oficina vidriada a la derecha.
4. Otra vista del frente de oficina, útil para comparar proporciones con foto 1.
5. Pared de trofeos y logotipo, salida vidriada, ventanas superiores y techo.

Las fotos son vistas del entorno, no fotografías multivista de un objeto aislado.
No deben enviarse como si fueran cuatro caras equivalentes de un objeto para
inferir automáticamente una distribución que todavía no está confirmada.

## Entregables propuestos

1. Planta y ubicación de puertas/escaleras confirmadas con el usuario.
2. Escena Blender con estructura, oficinas, vidrios, rejas, escaleras y techo separados.
3. Materiales con escala física: baldosa, pintura gris/blanca, metal, chapa y vidrio.
4. Cámara de entrada y planos de revisión comparados con las fotos.
5. Render y animación de entrada; después, versión GLB optimizada para Three.js.

La animación de cámara no sustituye la animación del personaje. El cierre requiere
caminar/correr, reducir velocidad, cruzar puerta, continuar dentro del hall y
terminar en el punto que indique el usuario. Las puertas deben tener pivotes.
Iluminación y texturas deben revisarse antes de llamar al resultado realista.
Las zonas no visibles y las medidas seguirán siendo aproximaciones sin más referencias.

## Guía necesaria

- Punto de entrada desde la calle, identificado en las fotos.
- Orden del recorrido y punto final, usando números de foto y referencias físicas.
- Si la cámara acompaña al personaje en tercera persona o pasa a sus ojos.
- Una medida conocida para escalar la arquitectura (puerta, baldosa o distancia).

## Casa, fase posterior

Se propone una casa argentina cotidiana con acceso, pasillo y lugar fijo donde
está colgado el guardapolvo. Primero se preparan imágenes coherentes del exterior,
entrada e interior. Para integrarla en 3D se modelan esos mismos espacios y se
anima abrir, entrar, alcanzar la prenda y salir. Una imagen generada o un video
no equivalen a una escena GLB recorrible. Sin fotos de una casa concreta, el diseño
será ficticio y deberá identificarse así.

## Guía confirmada

Entrada desde la calle. Foto 1 a la derecha; foto 2 a la izquierda; foto 3
avanzando un poco más allá de la 1; foto 4 repetición de la 1; foto 5 de frente
al ingresar. La primera cámara avanza hacia la pared de trofeos como punto de
revisión provisional; el usuario no fijó todavía el punto final exacto.

Generador: tools/story/build_school.py. Salidas: assets/story/school-layout.blend,
school-layout.glb y school-layout-preview.png. Cámara de 240 cuadros a 24 FPS.
El GLB es una exportación de la estructura: los materiales procedurales de Blender
requieren horneado PBR antes de usarse con la misma apariencia en Three.js.

## Nueva referencia de Google Maps

Se pudo descargar la imagen pública del enlace enviado posteriormente por el usuario
como references/google-hall-front.jpg (1600×1060). Se obtuvo una vista amplia,
no un modelo 3D ni el panorama completo navegable.

Esta evidencia muestra errores importantes de la primera base: la cubierta es
curva, con cerchas y franjas de iluminación siguiendo la bóveda; el volumen
frontal tiene tres ventanas altas, vitrina/mural y logotipo, y una conexión
vidriada a su derecha. No corresponde mantener un techo genérico a dos aguas ni
un muro trasero plano simplificado. Hay que registrar la cámara de referencia
antes de ajustar volúmenes y profundidades.

La imagen de Maps muestra franjas amarillas en paredes; las fotos recientes del
usuario muestran gris. Para el acabado se priorizarán sus fotos recientes, usando
esta vista amplia para estructura y relaciones espaciales. No se afirma haber
extraído medidas reales o geometría métrica de la foto.

## Vídeo recibido: 2026-10-27 20-19-18.mp4

Archivo original de referencia disponible en los adjuntos locales, 4.877.177 bytes,
1920×1080, 60 FPS, duración 15,5167 s. Se revisaron vistas a intervalos de 2 s.
Es una grabación del giro de un panorama desde un punto interior: aporta
orientaciones relacionadas, pero no un desplazamiento continuo desde la calle
ni profundidad métrica por fotogrametría.

- 0–2 s: oficina vidriada, baranda superior, sector de bicicletas y escalera.
- 2–4 s: pared lateral y encuentro con oficina y planta/jardinera.
- 4–8 s: giro hacia volumen frontal, tres ventanas altas, vitrina y logotipo.
- 8–10 s: vista más frontal; paso a la derecha del volumen y cubierta de bóveda.
- 10–14 s: regreso hacia bicicletero y lateral de ingreso.

Se corrigió el generador: bóveda y cerchas curvas, franjas translúcidas, tres
ventanas del mismo volumen frontal y paso lateral en lugar de muro ciego.
No se considera validada todavía la ubicación exacta de la cámara, las dimensiones
ni la continuidad de la entrada exterior. Se conservan los grises de las fotos
recientes como acabado objetivo. El video antiguo muestra amarillo.

Pendientes explícitos de esta revisión: registro de cámara frente al vídeo,
proporciones de oficinas y escaleras, puertas y circulación, logotipo fiel
(en la base aún se usa texto provisional), detalles y texturas. El cierre
posterior de la base es provisional y no representa un muro medido del lugar.
No se publicará esta base como una reconstrucción idéntica ni como final del modo historia.
