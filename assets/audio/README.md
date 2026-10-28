# Música del juego

Agregá o quitá archivos `.mp3` en esta carpeta y recargá el juego. También se
admiten `.MP3`, espacios, tildes y subcarpetas. El servidor `tools/serve.py`
detecta los archivos en cada carga de la lista, sin reiniciarlo.

La reproducción mezcla todos los temas sin repetir hasta recorrer la lista,
vuelve a mezclar al terminar y evita repetir el último tema inmediatamente.
Con un solo MP3, ese tema se repite en bucle. Una partida nueva elige el siguiente;
pausar y reanudar conserva la canción y la posición. Un archivo dañado se salta;
si la carpeta queda vacía o no hay archivos reproducibles, el juego sigue sin música.

## Publicación y otras copias del proyecto

Para activar la actualización automática al hacer commit, ejecutar una sola vez
en cada copia del repositorio:

```sh
python tools/audio_playlist.py --install-hook
```

El hook `.githooks/pre-commit` actualiza y agrega `playlist.json` al commit usando
solo los MP3 que se hayan incluido en ese commit. Así GitHub Pages recibe una
lista estática actualizada sin necesitar acceso al directorio desde el navegador.
No agrega los MP3 al commit por su cuenta ni modifica el audio.

Para publicar en otro servidor estático o trabajar sin el hook, regenerar la lista
antes de subir los archivos:

```sh
python tools/audio_playlist.py
```

Los mismos comandos están disponibles como `npm run setup:music` y
`npm run music:index`. No hacen falta paquetes adicionales de Python.

## Créditos de la pista inicial

`mi-perro-dinamita-8bit.mp3` es una copia sin modificaciones del archivo
**Mi Perro Dinamita (Version 8Bit).mp3**, elegido y entregado por el usuario.
La composición es **Mi perro dinamita**, de Patricio Rey y sus Redonditos de
Ricota. El nombre del archivo entregado no identifica al autor del arreglo.

La pista se sirve localmente desde el juego, sin depender de YouTube ni de un
servicio de audio externo. No se aplica conversión, ecualización ni recorte al MP3.

La lista se reproduce durante las carreras de ambos modos, se silencia en videos
y pestañas ocultas y comparte el botón de sonido y el volumen de Ajustes. Su nivel se reduce
respecto a los efectos para que monedas, saltos y avisos sigan siendo audibles.

Los créditos de la composición y del arreglo corresponden a sus autores.
Su incorporación no asigna una licencia libre a la música.
