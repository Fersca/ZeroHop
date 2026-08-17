# ZeroHop

Chat privado **navegador a navegador**, sin servidor intermedio. Todo vive en un único
archivo: `index.html`. Se puede abrir con doble clic, servir desde cualquier hosting
estático o mandar el archivo por mail.

## Cómo se usa

1. **Persona A** abre la página, pone su nombre y toca **Crear invitación**.
   Sale un **link** para compartir.
2. A le manda el link a **Persona B** por donde quiera: WhatsApp, mail, Signal, un papel.
   ZeroHop no lo envía a ningún lado.
3. **B abre el link**: la app ya lo reconoce, le pide el nombre y genera el
   **link de respuesta**.
4. B se lo devuelve a A. Si A lo abre en el mismo navegador donde creó la invitación,
   **el chat se conecta solo**; si no, lo pega en el paso 2 de su pestaña.
5. De ahí en más los mensajes van directo de un navegador al otro.

Con el botón **Ver código suelto** se cambia el link por el código pelado (`ZH1…`), útil
si la otra persona abre el archivo HTML local en vez de la página. Los dos campos aceptan
tanto el link completo como el código.

Los códigos son el SDP de WebRTC comprimido con `deflate-raw` y codificado en base64url
(~600 caracteres). Solo sirven para esa conexión: al recargar la página dejan de valer.

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

## Qué tiene

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
- **No hay historial.** Nada se guarda: al cerrar la pestaña la conversación desaparece.
  Lo único que queda en `localStorage` es tu nombre y la preferencia de tema.
- **No hay cuentas, ni registro, ni analytics, ni pedidos de red externos.**
- Por defecto se usan servidores **STUN** públicos de Google, que sirven únicamente para
  descubrir la IP pública y atravesar el NAT: no ven ni transportan el contenido. Se pueden
  apagar con un switch en la pantalla inicial (útil si los dos están en la misma red local).
## Si estás detrás de una VPN

Hay dos problemas distintos, con soluciones distintas. Ambos se atacan desde
**Opciones avanzadas** en la pantalla inicial.

### 1. Los dos están en la misma VPN (Tailscale, WireGuard, ZeroTier, VPN de la empresa)

Este es el caso fácil, y encima es el mejor de todos: hay conectividad IP directa entre
las dos máquinas. El obstáculo es que **Chrome oculta tu IP local detrás de un nombre
mDNS `xxxxx.local`**, que solo se resuelve por multicast dentro de la misma LAN. Un túnel
VPN no transporta ese multicast, así que el otro lado no puede resolver el nombre y ICE
no encuentra ruta, aunque los dos se hagan ping sin problema.

Solución: escribí tu IP del túnel en **Opciones avanzadas → Tu IP dentro de la VPN**
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

## Compatibilidad

Chrome, Edge, Firefox y Safari modernos (escritorio y móvil). Si el navegador no soporta
`CompressionStream`, los códigos se generan sin comprimir (más largos, igual de funcionales).
