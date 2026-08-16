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
- No hay servidor **TURN**, así que si ambas redes tienen NAT simétrico (algunas redes
  corporativas, ciertas VPN o redes móviles) la conexión directa puede no establecerse.
  Agregar un TURN implicaría un relay intermedio y por eso quedó fuera a propósito.

## Compatibilidad

Chrome, Edge, Firefox y Safari modernos (escritorio y móvil). Si el navegador no soporta
`CompressionStream`, los códigos se generan sin comprimir (más largos, igual de funcionales).
