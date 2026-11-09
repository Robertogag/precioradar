# Publicación en LinkedIn · PrecioRadar

Tres publicaciones, una por semana aproximadamente. Un video o captura por publicación, 3 a 5 hashtags, liga a la app y al repositorio. Publicar entre semana por la mañana.

---

## Post 1 · Lanzamiento (antes del Buen Fin)

**Adjuntar:** `docs/demo.mp4`, 24 segundos (1280×800), con música de fondo: "Let's All Dance This Christmas" de Michael Ramir C., de Mixkit (Stock Music Free License: uso libre en videos, comercial o no, sin atribución obligatoria). Alternativas ya mezcladas en `visual aidideo-opcion-2…` y `…opcion-3…`.

Hice PrecioRadar: buscas un producto y compara su precio en 21 tiendas de México al mismo tiempo, con historial para saber si la "oferta" del Buen Fin es real.

Lo que aprendí construyéndolo:

• Mercado Libre cerró su búsqueda a apps externas y Amazon bloquea lecturas desde la nube. No me brinqué ningún muro: la app dice qué tienda no contestó y enseña el último precio visto, con fecha.
• Agrupar "el mismo producto" entre tiendas con títulos distintos fue el problema difícil: ahí se fue la mayor parte del trabajo (y de las pruebas).
• Arquitectura hexagonal con pruebas desde el día uno permitió cambiar reglas todos los días sin romper nada.

Stack: TypeScript de punta a punta (Fastify, React, Expo), Postgres y Cloud Run. La web ya está en línea; la app de celular está en pruebas.

Pruébala: https://precioradar-701205043940.us-central1.run.app
Código: github.com/Robertogag/precioradar

#TypeScript #ReactNative #OpenSource #BuenFin #México

---

## Post 2 · Durante el Buen Fin (consejo práctico)

**Adjuntar:** `docs/capturas/04-historial-grafica.png` o `05-historial-tabla-oscuro.png`.

¿Cómo saber si el descuento del Buen Fin es real?

Viendo el precio de los días anteriores. En PrecioRadar cada producto trae su historial por tienda: si una tienda subió el precio la semana pasada para "bajarlo" hoy, se nota en la flecha.

Tres cosas que vi esta semana comparando consolas y celulares:
• La misma consola varía hasta $4,900 entre tiendas el mismo día.
• "Incluye juego" a veces cuesta $500 más que el producto solo y sí conviene; a veces cuesta $3,000 más y no.
• El "antes" tachado no siempre fue el precio real de ayer.

Compara antes de comprar: https://precioradar-701205043940.us-central1.run.app

#BuenFin #Precios #Consumo

---

## Post 3 · Después (números y aprendizajes)

**Adjuntar:** captura de "Qué pasó con cada tienda" o una gráfica con cifras del periodo.

Una semana de PrecioRadar en el Buen Fin, en números:

• N búsquedas, M productos con historial, K tiendas respondiendo en promedio por búsqueda.
• Amazon contestó desde la nube el X % de las veces; el resto lo cubrió la memoria de la última respuesta buena, siempre con fecha.
• Lo que falló y cómo lo arreglé: (ejemplo real).

Lo que sigue: dominio propio, alertas de precio y la app en las tiendas.

Gracias a quienes la probaron y mandaron correcciones.

#Ingeniería #TypeScript #Aprendizajes

---

## Notas para grabar o escribir

- El video se genera con `scratchpad/shots/demo-video.mjs` (Playwright) contra producción; si se regraba, hacerlo con un producto con historial (Nintendo Switch 2).
- Si ya está el dominio, usar https://precioradar.mx en los tres textos.
