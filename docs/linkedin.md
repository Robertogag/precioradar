# Publicación en LinkedIn · PrecioRadar

Tres publicaciones, una por semana aproximadamente. Un video o captura por publicación, 3 a 5 hashtags, liga a la app y al repositorio. Publicar entre semana por la mañana.

---

## Post 1 · Lanzamiento (antes del Buen Fin)

**Adjuntar:** `docs/demo.mp4`, 34 segundos (1280×800, sin audio).

Hice PrecioRadar: buscas un producto y compara su precio en 21 tiendas de México al mismo tiempo, con historial para saber si la "oferta" del Buen Fin es real.

Lo que aprendí construyéndolo:

• Mercado Libre y Amazon cerraron su búsqueda a apps externas. En vez de brincarme sus muros, el usuario abre la página en la app y el precio que ve se comparte con los demás, con fecha y con su permiso.
• Agrupar "el mismo producto" entre tiendas con títulos distintos fue el problema difícil: ahí se fue la mayor parte del trabajo (y de las pruebas).
• Arquitectura hexagonal con pruebas desde el día uno permitió cambiar reglas todos los días sin romper nada.

Stack: TypeScript de punta a punta (Fastify, React, Expo), Postgres y Cloud Run.

Pruébala: https://precioradar-701205043940.us-central1.run.app
Código: github.com/<tu-usuario>/precioradar

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
- Reemplazar `github.com/<tu-usuario>/precioradar` por la liga real del repositorio al crearlo.
- Si ya está el dominio, usar https://precioradar.mx en los tres textos.
