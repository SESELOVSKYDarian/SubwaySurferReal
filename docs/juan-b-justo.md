# Juan B. Justo: De los Trabajadores → San Juan

Rama de trabajo: `codex/jb-justo-mar-del-plata`.

## Criterio visual

El recorrido conserva los paredones, los tres carriles y las reglas del juego.
Reemplaza las torres genéricas con frentes bajos, vidrieras textiles, arcos de
hormigón, persianas de talleres, casas de piedra/revoque y algunos departamentos
con balcones. La zona textil usa marquesinas y exhibición de prendas.
Las cartelerías son dibujadas localmente.

Los hitos tienen estructuras propias, no el mismo cubo con un cartel distinto:

- Bendu: nave negra de tres lotes, fascia quebrada de altura variable, retorno,
  vidriado de doble altura, voladizo diagonal y palmas de silueta.
- AXION, YPF y Shell: playas abiertas, columnas delgadas, marquesinas magenta,
  azul y amarilla/roja, surtidores y tótems. Minimercado retirado al fondo.
- Maderera Juan B. Justo 4153: bóveda clara, showroom rectangular con carpintería
  marrón y carteles de productos, portón abierto y pilas de tablas. La forma y
  los colores se contrastaron con la foto de casa central del sitio oficial.
- Técnica 5: frente claro de dos alturas, banda acanalada, letras rojas E.E.T.
  Nº 5, ventanas altas y mural circular del 5, según las fotos consultadas.
- Polideportivo Islas Malvinas: arena ovalada de cuatro lotes al 3525, con
  cubierta clara, nervaduras radiales, ventanales perimetrales, escalinata y
  predio verde. La fachada usa bandas de colores como interpretación del mural
  exterior; no reproduce su composición ni incorpora fotografías como texturas.

En esos lotes se conservan los paredones y se despejan las rejas altas y los
árboles que ocultaban las fachadas. Los edificios comunes conservan sus rejas.

Es una interpretación escenográfica basada en referencias públicas, no una
réplica de cada inmueble ni un mapa a escala. Los edificios intermedios, los
lados de la calle, las dimensiones y las distancias están simplificados.
Las fuentes de comercios históricos no certifican que sigan abiertos hoy.
No se descargan fotografías para usarlas como texturas ni se agrega Street View.

## Orden y repetición

`avenue-route.js` contiene 84 lotes por lado de 24 unidades: 2.016 unidades por
vuelta. Las alturas de las direcciones se usan para ordenar los hitos desde la
costa hasta el entorno de San Juan al 4200. Esta conversión comprime el recorrido
para el juego; las unidades no deben interpretarse como metros reales.
Bendu/Coto funciona como conjunto de inicio, sin asignarle una dirección ficticia
en Juan B. Justo. Luego aparecen Raffaelli Giardino, Alpine Skate, Bender,
Stendhal, Spinaker y Materiales San Pablo entre frentes de relleno. Las estaciones
se ubican en el inicio, al 1490, al 2035, al 2402 y en San Juan al 4199.
El remate comprime Maderera Juan B. Justo 4153, Shell 4199 y Técnica 5 4287
en lotes consecutivos para incluir la escuela pedida junto al cierre de San Juan.

Al llegar a San Juan vuelve el mismo orden de fachadas, muros, árboles y farolas.
El cartel superior indica el sector y la vuelta. La puntuación, la velocidad y
los obstáculos siguen su curso: el bucle cambia únicamente la ambientación.
Reiniciar la partida vuelve a De los Trabajadores.

Se reutiliza un conjunto fijo de 32 edificios. Texturas, materiales y detalles
se almacenan por perfil, con un máximo de 23 fachadas y cuatro carteles de calle.
Los hitos de dos o tres lotes se dibujan una sola vez, incluso al cruzar el
límite del conjunto visible o la vuelta. Cada hito reutiliza los seis meshes
del edificio común y fusiona sus detalles. No añade luces ni sombras dinámicas.
No se generan texturas nuevas por vuelta y los detalles lejanos se ocultan.
Las barandas pasan de 20 a ocho postes por piso y los arcos usan menos segmentos.

## Comprobación

Suite completa: 28 pruebas aprobadas en Edge con WebGL por software. Incluye
tres vueltas sin crecimiento del conjunto de edificios/materiales, repetición
de fachadas y muros, reinicio en la costa, arranque con D durante calibración,
legibilidad del indicador a 320/768/1440 px y las colisiones/animaciones previas.
Las capturas quedan en `test-results/jb-justo-*.png`. `node tests/capture-avenue.cjs`
reproduce las vistas de costa, Bendu, YPF, maderera y Técnica 5, añade vistas
oblicuas de los tres hitos principales y mide el conjunto
de edificios visible a lo largo de los 84 puntos del recorrido.

Comparación con la primera versión, mismas distancias y distancia de dibujo:
90,27 → 87,62 meshes de edificios de media (−2,94 %) y 3.521,14 → 2.390,60
triángulos de media (−32,11 %); máximo 7.700 → 3.462 triángulos. Es un conteo
de los edificios habilitados por el escenario, no una medición de FPS ni del
coste total del juego. La memoria de texturas aumenta de 18 a 23 variantes.

## Referencias consultadas

- [Maderera: sucursales oficiales](https://mjbj.ar/sucursales/) y
  [foto de casa central](https://mjbj.ar/mdh/2023/12/casa-central.jpg): forma curva,
  showroom y dirección 4153, confirmada también por el usuario.
- [Técnica 5: padrón educativo oficial](https://mapa.educacion.gob.ar/legajo/060622400):
  Amancio Williams, Juan B. Justo 4287.
- [Técnica 5: foto del frente](https://www.lateclamardelplata.com.ar/33888-tecnica-5-las-tierras-destinadas-para-su-traslado-se-usaran-para-vivienda-social):
  letras rojas, acanalado claro y mural del 5; la nota usa otro nombre de escuela,
  por eso se toma la denominación del padrón y solo el aspecto de la foto.
- [AXION: listado oficial](https://www.axionenergy.com/legales/estaciones-adheridas-promocion-desafio-redondo/):
  Juan B. Justo y Martínez de Hoz / actual De los Trabajadores.
- [Estaciones GNC: ENARGAS](https://www.enargas.gob.ar/secciones/gas-natural-comprimido/estaciones-carga-420.php):
  YPF, Juan B. Justo 2035.
- [Estaciones del recorrido](https://www.derutasydestinos.com/estaciones-Mar-del-Plata--Buenos-Aires.html):
  AXION 1490, Shell 2402 y Shell 4199; se representan como referencias de lugar,
  sin afirmar el estado comercial actual.

- [Centro Comercial Juan B. Justo](https://ccjuanbjusto.com.ar/): ubicación del
  corredor comercial entre Buenos Aires y Alem/Edison.
- [Alpine Skate: tiendas oficiales](https://www.alpineskate.com/tiendas):
  sucursales en Juan B. Justo 860 y 1006.
- [Banco Provincia: comercios adheridos](https://www.bancoprovincia.com.ar/CDN/Get/locales_viernes_cdni):
  Raffaelli Giardino 835, Stendhal 1531 y Spinaker 1670.
- [Bender: referencia de ubicación](https://www.cylex.com.ar/mar-del-plata/bender-mdp-11451342.html):
  Juan B. Justo 1001.
- [Banco Provincia: construcción](https://www.bancoprovincia.com.ar/CDN/Get/listado_construccion):
  Materiales San Pablo, Juan B. Justo 3820.
- [Coto: sucursales](https://www.coto.com.ar/sucursales/): Puerto Mar del Plata,
  Av. de los Trabajadores 150, Multiespacio Bendu.
- [Bendu: exterior fotografiado](https://dib.com.ar/sociedad/bendu-el-mega-shopping-que-transformara-la-entrada-al-puerto-mar-del-plata-n49054):
  referencia de volumen oscuro, vidrio y marquesina.
- [Juan B. Justo: fotos del corredor comercial](https://www.lacapitalmdp.com/a-pesa-de-las-ofertas-hay-muchas-consultas-y-pocas-ventas-en-juan-b-justo/):
  referencia de escala, vidrieras, carteles y mezcla de materiales.
- [Frentes con arcos](https://www.0223.com.ar/nota/2021-11-3-8-9-0-distrito-juan-b-justo-el-proyecto-que-busca-revitalizar-los-negocios-con-beneficios-fiscales):
  referencia de los comercios bajos de la avenida.
- [Inmueble en Juan B. Justo y San Juan](https://www.rossigiagnoriopropiedades.com.ar/p/7385893-Casa-en-Venta-en-Mar-Del-Plata-juan-b-justo-al-4200):
  extremo del recorrido al 4200 y mezcla comercial/residencial de baja altura.
- [EMDER: resoluciones municipales de septiembre de 2022](https://sibom.slyt.gba.gov.ar/bulletins/7781/contents/1796966):
  dirección del Polideportivo Islas Malvinas, Juan B. Justo 3525, y autorización
  del mural exterior. La dirección fija el orden del hito; sus proporciones se
  comprimen para el juego.
- [Fachada del polideportivo](https://www.infobrisas.com/noticias/2022/10/13/48678-se-presento-la-nueva-fachada-del-estadio-polideportivo):
  referencia de la intervención exterior presentada en 2022. Las bandas del
  juego son un dibujo procedural propio inspirado en su carácter colorido.
