# ZeroHop

Chat privado **navegador a navegador**, sin servidor intermedio.

**`index.html` es autosuficiente**: se puede abrir con doble clic, mandar por mail o servir
desde cualquier hosting estático, y funciona solo. Los otros archivos del repo son extras de
la versión publicada: `manifest.json`, `sw.js` y los iconos la vuelven instalable como app, y
`tests/` con `tools/` son el desarrollo. Si te llevás solo el HTML, no perdés nada del chat.

## Primer uso

La primera vez la app te pide tu nombre y te explica en tres puntos qué es: que los mensajes
van directo entre navegadores, que **los dos tienen que estar con la app abierta al mismo
tiempo** —es una línea, no un buzón— y que para empezar se pasa un link. Ahí mismo podés
activar los avisos. A quien llega por una invitación le habla de eso en vez del pitch.

## Cómo se usa

1. **Persona A** abre la página y toca el botón rojo de abajo a la derecha.
   Sale un **link** para compartir.
2. A le manda el link a **Persona B** por donde quiera: WhatsApp, mail, Signal, un papel.
   ZeroHop no lo envía a ningún lado.
3. **B abre el link**: la app ya lo reconoce, le pide el nombre y genera el
   **link de respuesta**.
4. B se lo devuelve a A. Si A lo abre en el mismo navegador donde creó la invitación,
   **el chat se conecta solo**; si no, lo pega en el paso 2 de su pestaña.
5. De ahí en más los mensajes van directo de un navegador al otro.

Los códigos son el SDP de WebRTC más tu nombre y tu clave pública, comprimidos con
`deflate-raw` y codificados en base64url (~830 caracteres). Solo sirven para esa conexión:
al recargar la página dejan de valer.

### Las cuatro maneras de pasarse la invitación

Da igual cuál se use: los dos extremos aceptan tanto el link como el código pelado, y lo
que viaja es siempre lo mismo. Se elige por comodidad, no por seguridad.

| | Cuándo conviene |
|---|---|
| **Link** | Lo normal. Se copia con **Copiar link** o se manda con **Otra app** (el compartir del sistema) y se pega en cualquier chat, mail o mensaje. |
| **WhatsApp** | Están hablando por ahí. Abre WhatsApp con el mensaje escrito y, si cargaste el teléfono, directo en su chat. |
| **QR** | Están en el mismo lugar. Uno toca **Mostrar QR** y el otro lo apunta con la cámara del teléfono: al abrirse el link se une, sin copiar ni pegar. La vuelta es igual, con el QR de la respuesta. |
| **Código suelto** | La otra persona abre el archivo HTML en su máquina, donde no hay links que abrir. **Ver código suelto** cambia el link por el `ZH1…` pelado. |

El QR se dibuja en el mismo archivo, sin librerías ni pedidos de red: es un codificador de
~200 líneas (modo byte, corrección L, versiones 1 a 40). Una invitación entra en una
versión 21 —101×101 módulos—, así que conviene mostrarla con la pantalla brillante y
acercar la cámara. Leer QR con la cámara desde la app **no** hace falta: eso ya lo hace el
sistema operativo, que abre el link solo.

### Publicado como página web

El repo se publica con GitHub Pages (`.github/workflows/pages.yml`), así que se entra
directo por la URL sin bajar nada. Eso **no** agrega un servidor a la conversación:

- El invite viaja en el **fragmento** del link (después del `#`), y los navegadores
  **nunca mandan el fragmento al servidor** en un pedido HTTP. GitHub sirve el HTML y
  no ve las invitaciones ni puede reconstruirlas.
- Los mensajes siguen yendo por WebRTC de un navegador al otro.
- Lo que GitHub sí ve, como cualquier hosting, es que alguien descargó la página.

Al abrir un link, ZeroHop limpia el `#` de la barra de direcciones para que el código no
quede a la vista ni en el historial de esa pestaña. Igual, el link queda en el chat por
donde lo mandaste: tratalo como lo que es, la llave de esa conversación.

## El salto desde WhatsApp

La idea es "pasemos a la línea segura": venís hablando por WhatsApp, donde ya sabés que
del otro lado está quien decís, y mudás la conversación a un canal directo.

- **Invitar por WhatsApp** abre WhatsApp con el mensaje ya escrito y el link adentro. Si
  cargaste el teléfono de esa persona, abre **directo en su chat**; si no, el selector de
  contactos.
- Del otro lado, **Responder por WhatsApp** vuelve al chat correcto sin buscarte en la
  agenda: tu número viaja dentro de la invitación, pero **solo si lo cargaste** en Ajustes.
  Vacío, nadie lo ve.
- El **código de seguridad** se puede comparar por WhatsApp con un botón. Como ese canal ya
  es cifrado punta a punta y confiás en él, comparar ahí cierra el círculo contra cualquier
  intermediario.

Dos cosas que conviene saber:

- **Los links abiertos dentro de WhatsApp** caen en su navegador embebido, que tiene
  almacenamiento propio: ahí tu identidad y tus contactos no se guardan. ZeroHop lo detecta
  y te ofrece copiar el link para abrirlo en Chrome o Safari.
- **Dejá ZeroHop abierto** mientras esperás la respuesta. La conexión a medio armar vive en
  memoria y no se puede guardar: si el sistema descarta la pestaña, hay que invitar de nuevo.
  Como la otra persona ya está del otro lado mirando, suele tardar segundos.

La integración es de ida solamente: abrir WhatsApp con el texto puesto. Leer los mensajes
para detectar la respuesta sola no se puede — la API de WhatsApp Business es para empresas
y automatizar WhatsApp Web viola sus términos y termina con el número baneado.

## Varias conversaciones a la vez

La pantalla de inicio es una lista tipo WhatsApp: cada contacto con su avatar, el último
mensaje, la hora, el punto verde si está conectado y el globito de no leídos. Cada
conversación tiene su propia conexión WebRTC, así que podés entrar a una, salir con la
flecha, hablar con otra y volver: **las conexiones siguen vivas en segundo plano**. Los
mensajes que llegan mientras estás en otro chat suman no leídos y avisan con un toque.

## Volver a hablar con alguien más adelante

Acá conviene ser claro sobre qué se puede y qué no.

**Lo que no se puede sin servidor:** WebRTC no tiene direcciones estables. Cada conexión
necesita un SDP nuevo con candidatos ICE frescos, y un navegador no puede quedar
escuchando a que lo llamen. Aunque guardáramos la IP y el puerto de tu contacto, mañana no
sirven. **Siempre hace falta intercambiar un link nuevo, con los dos conectados a la vez.**

**Lo que sí se guarda: la identidad.** Al abrir ZeroHop por primera vez se genera un par de
claves ECDSA P-256 que vive solo en este navegador. Tu **ID** es la huella de tu clave
pública, y viaja en cada invitación. Con eso:

- Tus contactos quedan en la lista aunque cierres todo, con nombre e ID.
- Reconectar es: tocar el contacto → **Reinvitar** → mandarle el link → listo. La
  conversación se reusa, no se duplica.
- Al conectar, cada lado firma un desafío del otro **atado al código de seguridad de esa
  sesión DTLS**. Si la firma verifica, aparece *«es el mismo de siempre»* y el sello
  VERIFICADO: no hace falta comparar el código a mano nunca más.
- Si reinvitás a alguien y responde **otra identidad**, ZeroHop no pisa el contacto
  guardado: abre una conversación aparte y avisa en rojo. Puede ser que haya reinstalado y
  perdido su clave… o que no sea quien pensás.

El ID identifica, no permite llamar. Es la diferencia entre «sé que sos vos» y «puedo
encontrarte».

## Qué tiene

- Varias conversaciones simultáneas, cada una con su propia conexión.
- Cuatro maneras de pasar la invitación: link, WhatsApp, **QR** y código suelto.
- Invitación y respuesta por WhatsApp en un toque, con el chat correcto ya abierto.
- Mensajes de texto, con indicador de "escribiendo…" y tildes de enviado / entregado / leído.
- Envío de archivos e imágenes (troceado en bloques de 16 KB con control de flujo:
  8 MB tardan ~4 s en LAN). Las imágenes se ven en la burbuja, el resto se descarga.
- Arrastrar y soltar archivos, pegar imágenes desde el portapapeles, selector de emojis.
- **Código de seguridad**: derivado de las huellas de los certificados DTLS de ambos lados.
  Si a los dos les muestra lo mismo, no hay nadie en el medio.
- **Detalles de la conexión**: qué ruta están usando los datos (red local, IP pública, etc.).
- Tema claro y oscuro, diseño tipo WhatsApp/Telegram en rojo, responsive.

## Privacidad

- **Ningún mensaje pasa por un servidor.** El canal es un `RTCDataChannel` cifrado con DTLS
  directamente entre los dos navegadores.
- **No hay historial de mensajes.** Al cerrar la pestaña, las conversaciones desaparecen.
  Lo único que queda guardado es: tu clave privada en **IndexedDB** (no extraíble), y en
  `localStorage` tu clave pública, tu nombre, el teléfono si lo cargaste, la agenda de
  contactos y las preferencias. Nunca el contenido de los chats. Todo eso se borra con un
  botón en Ajustes.
- **No hay cuentas, ni registro, ni analytics, ni pedidos de red externos.**
- Por defecto se usan servidores **STUN** públicos de Google, que sirven únicamente para
  descubrir la IP pública y atravesar el NAT: no ven ni transportan el contenido. Se pueden
  apagar con un switch en *Ajustes* (útil si los dos están en la misma red local).

## Si estás detrás de una VPN

Hay dos problemas distintos, con soluciones distintas. Ambos se atacan desde
**Ajustes → Conexión → Opciones avanzadas**.

### 1. Los dos están en la misma VPN (Tailscale, WireGuard, ZeroTier, VPN de la empresa)

Este es el caso fácil, y encima es el mejor de todos: hay conectividad IP directa entre
las dos máquinas. El obstáculo es que **Chrome oculta tu IP local detrás de un nombre
mDNS `xxxxx.local`**, que solo se resuelve por multicast dentro de la misma LAN. Un túnel
VPN no transporta ese multicast, así que el otro lado no puede resolver el nombre y ICE
no encuentra ruta, aunque los dos se hagan ping sin problema.

Solución: escribí tu IP del túnel en **Ajustes → Opciones avanzadas → Tu IP dentro de la VPN**
(la sacás con `tailscale ip -4`, `ip addr`, `ifconfig` o `ipconfig`). ZeroHop agrega esa
dirección como candidato extra al código que compartís, y la conexión va **directa por el
túnel**: sin STUN, sin relay, sin nada en el medio. Los dos tienen que cargar la suya.

### 2. NAT simétrico, redes corporativas, redes móviles

Acá no hay ruta directa posible: el NAT de cada lado cambia el puerto según el destino y
el agujero que abre el hole punching no sirve. La única salida es un **TURN**, que reenvía
los paquetes. Se configura en las mismas opciones avanzadas.

Un TURN es un intermediario de red, pero **no es un servidor de chat**: el DTLS se negocia
punta a punta entre los dos navegadores, así que el relay mueve bytes cifrados que no puede
leer. Ve que dos IPs hablan y cuánto tráfico hay; no ve el contenido. Igual conviene que
sea tuyo (por ejemplo [coturn](https://github.com/coturn/coturn)) y no uno público.

El switch **Forzar el paso por el relay** hace que ni siquiera se intenten rutas directas:
más lento, pero no le mostrás tu IP real a la otra persona.

> Muchas VPN comerciales funcionan sin tocar nada: si la VPN deja pasar UDP y no hace NAT
> simétrico, el STUN por defecto alcanza. Probá primero así.

## Tests

Quince suites end-to-end (242 verificaciones) que manejan Chromium de verdad: dos o más
navegadores con perfiles separados que se conectan entre sí, se mandan mensajes y archivos,
se desconectan y reconectan. No hay mocks de WebRTC — las conexiones son reales.

```bash
npm install
npx playwright install chromium
npm test                  # todas
npm test -- files agenda  # solo las que coincidan
ZH_URL=file://$PWD/index.html npm test   # contra el archivo local, sin servidor
```

El runner levanta su propio servidor estático y descubre las suites solo (alcanza con dejar
un archivo nuevo en `tests/suites/`), así que no hace falta nada corriendo antes.

| Suite | Qué cubre |
|---|---|
| `01-chat` | conexión, escapado de HTML, indicador de escritura, acuses, cortar a mano |
| `02-files` | 8 MB byte a byte, imágenes, cola de envío, límites, escritura a disco |
| `03-errors` | mensajes sin confirmar, reintento, códigos inválidos con error entendible |
| `04-agenda` | contactos que sobreviven al cierre, reinvitación, impostores |
| `05-multi` | tres conversaciones en paralelo, no leídos por conversación, título de pestaña |
| `06-links` | invitación como link, deep links de WhatsApp, dos pestañas por BroadcastChannel |
| `07-vpn` | candidato manual, STUN, TURN, relay forzado, validación de IP |
| `08-csp` | CSP por hash, inyecciones bloqueadas, notificaciones, clave no extraíble |
| `09-pwa` | onboarding, 360 px sin desborde, accesibilidad, manifest y service worker |
| `10-hostil` | basura, tamaños absurdos, ids repetidos, HTML y firmas falsas del otro lado |
| `11-codigos` | formatos, el código pegado de seis maneras, navegadores sin Compression/WebCrypto |
| `12-uso` | 300 mensajes, scroll y leído, emojis, archivos raros, buscador, tema, borrar todo |
| `13-privacidad` | auditoría del tráfico HTTP y de lo que queda guardado en el navegador |
| `14-pestanas` | mismo perfil en dos pestañas: la agenda no se pisa; autoinvitación |
| `15-qr` | el QR de la invitación y el de la respuesta, leídos con un decodificador de verdad |

La suite de privacidad es la que audita la promesa del producto: mira **todos** los pedidos
HTTP de las dos pestañas mientras se conversa (ninguno a un tercero, ni un POST, ni el
mensaje ni el código en ninguna URL), revisa del lado del servidor de prueba que el código
de invitación nunca llegó, y confirma que al recargar no queda nada de lo hablado.

Corren también en CI (`.github/workflows/test.yml`) en cada push, en los dos modos
(servida por http y abierta como archivo).

## Instalable como app (PWA)

Servida por http(s), ZeroHop se instala en la pantalla de inicio o en el dock: ventana
propia, ícono, y el service worker guarda el shell para que abra sin conexión. En celular la
diferencia es grande, porque una pestaña común se descarta cuando el sistema necesita
memoria.

Eso **no** agrega servidor a la conversación: el service worker solo sirve los archivos de la
app desde el cache. Los mensajes siguen yendo por WebRTC de un navegador al otro.

La estrategia es **red primero, cache como respaldo**: si publicás una versión nueva, la
próxima vez que se abra ya la toma; el cache solo entra cuando no hay conexión. Abierta como
`file://` no se registra nada.

## Avisos

En *Ajustes → Avisos* hay dos interruptores, los dos apagables:

- **Avisos del sistema**: cuando llega un mensaje que no está a la vista —otra
  conversación abierta, o la ventana en segundo plano— salta la notificación del sistema
  con el nombre y el texto, y al tocarla se abre esa conversación. El navegador pide permiso
  la primera vez; si lo niega, la app te lo dice en vez de fallar en silencio.
- **Sonido**: un tono corto generado con Web Audio. No descarga ningún archivo.

Cuando un contacto está sin conexión, además de *Reinvitar* aparece **Avisarle**: abre
WhatsApp con un "¿te conectás a ZeroHop?" y el link de la app. Es la vuelta práctica a la
limitación de que los dos tienen que estar presentes.

Esto funciona **mientras ZeroHop esté abierto**, aunque la pestaña esté de fondo. No hay
servidor de notificaciones: si cerrás el navegador, nadie te puede despertar.

Al entrar a una conversación con mensajes sin leer aparece un divisor **MENSAJES NUEVOS**
en el punto donde quedaste.

## Content-Security-Policy

La página declara un CSP estricto: `default-src 'none'` y el script inline habilitado
**por su hash**. Eso significa que no puede cargarse nada externo, y que un `<script>`
inyectado o un `onerror=` que se colara en un mensaje **no se ejecutan**.

El precio es que el hash hay que mantenerlo sincronizado con el script:

```bash
npm run csp          # recalcula y escribe el hash en el meta
npm run csp:check    # falla si quedó desincronizado
```

La verificación corre en los tests y también antes de publicar en Pages, así un hash viejo
no puede dejar la página rota en producción.

## Tu clave privada

La clave de identidad se genera **no extraíble** y vive en IndexedDB como `CryptoKey`: ni la
propia página puede exportarla. Si ya tenías una identidad guardada como JWK en
`localStorage`, se migra sola en el primer arranque —conservando tu ID— y la copia vieja se
borra. Un atacante que lograra ejecutar código en la página podría hacerla firmar, pero no
robársela.

## Límites de los archivos

- Hasta **64 MB** el archivo recibido se arma en memoria, que es lo más rápido.
- Más grande, se escribe **a disco** en el sistema de archivos privado del origen mientras
  llega, para que la pestaña no se quede sin memoria. Esos archivos se borran al arrancar la
  app: como los mensajes, no sobreviven a la sesión.
- El techo duro es **2 GB**. Por encima, o si el navegador no puede escribir a disco, el
  receptor **rechaza** la transferencia y los dos lados lo ven explicado en la burbuja.

## Cuando algo falla

- Si un mensaje sale pero la conexión se corta antes de que llegue la confirmación, la
  burbuja queda marcada en rojo con **«Sin confirmar»** y un botón de **Reintentar**: la app
  no te miente diciendo que llegó.
- El reintento reenvía con el mismo identificador, así los acuses siguen calzando y no
  aparecen mensajes duplicados.
- Los archivos que fallan o son rechazados también se pueden reintentar, sin volver a
  elegirlos del disco.

## Accesibilidad y mobile

- Los mensajes entrantes se anuncian por una región `aria-live`, así un lector de pantalla
  los lee sin que haya que buscar el foco.
- Todos los botones de ícono tienen `aria-label`.
- El alto de la app sigue al `visualViewport`, así el teclado en pantalla no tapa el
  compositor (el problema clásico de Safari en iOS).
- Layout verificado a 360 px de ancho: sin desborde horizontal.

## Compatibilidad

Chrome, Edge, Firefox y Safari modernos (escritorio y móvil). Si el navegador no soporta
`CompressionStream`, los códigos se generan sin comprimir (más largos, igual de funcionales).
