# ZeroHop

Chat privado **navegador a navegador**, sin servidor intermedio. Todo vive en un único
archivo: `index.html`. Se puede abrir con doble clic, servir desde cualquier hosting
estático o mandar el archivo por mail.

## Cómo se usa

1. **Persona A** abre `index.html`, pone su nombre y toca **Crear invitación**.
   La app genera un código (una línea de texto que empieza con `ZH1…`).
2. A le pasa ese código a **Persona B** por el medio que quiera: WhatsApp, mail, Signal,
   un papel. ZeroHop no lo envía a ningún lado.
3. **B** abre el mismo archivo, toca **Tengo un código de invitación**, lo pega y genera
   su **código de respuesta**.
4. B le devuelve la respuesta a A, que la pega y toca **Conectar**.
5. Se abre el chat. De ahí en más los mensajes van directo de un navegador al otro.

Los códigos son el SDP de WebRTC comprimido con `deflate-raw` y codificado en base64url
(~600 caracteres). Solo sirven para esa conexión: al recargar la página dejan de valer.

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
