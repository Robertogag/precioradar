# Comparador de precios

App de celular que busca un producto en varias tiendas a la vez y enseña en cuál sale más barato, con los descuentos que publica cada una. El usuario elige país y, si quiere, estado.

## Encender y probar

Doble clic en `iniciar.cmd`. Abre dos ventanas: el servidor (puerto 4000) y la app.

- **En el celular:** instalar Expo Go, conectarlo al mismo Wi-Fi que esta PC y escanear el QR de la ventana "Comparador APP". La app encuentra sola al servidor.
- **En esta PC:** en la ventana "Comparador APP" presionar `W`.
- **Sin app, solo la búsqueda:** `cd api` y `npm run probar -- "iphone 15"` (o `"pantalla samsung 55" precio`).

Pruebas: `cd api && npm test`. Tipos: `npm run typecheck` en `api` y en `mobile`.

## Identidad visual: PrecioRadar

Según el kit de marca de la carpeta `visual aid` (7-nov-2026). Nombre **PrecioRadar**, lema "Compara precios. Decide mejor.". Paleta: azul profundo `#0B2545` (tinta), verde radar `#22C55E` (acción, éxito, ahorro), azul tech `#3B82F6` (interfaz y enlaces; en texto pequeño `#2563EB` para que se lea), verde menta `#A7F3D0` (resaltado "Mejor precio"), amarillo oferta `#FACC15` (rebaja) y gris claro `#E5E7EB` (fondos y bordes). Tipografía Plus Jakarta Sans. La marca es el logotipo real de la carpeta (`visual aid/logo.png`): etiqueta azul con radar y carrito, nombre "Precio" en azul profundo y "Radar" en azul tech con subrayado verde. El nombre va en texto (así lee bien en tema oscuro) y la etiqueta en PNG recortado del logo: `web/public/brand/mark.png` (barra), `web/public/favicon.png`, `web/public/brand/apple-touch-icon.png` y `web/public/brand/logo.png` (vista previa al compartir), más `mobile/assets/images/` (ícono de la app sobre blanco, capas de Android, splash y `brand-mark.png` para la barra). Se regeneran con `scratchpad/shots/logo-assets.mjs` (Playwright + canvas; el recorte de la etiqueta es x 334, y 250, lado 570 del PNG de 1254 px). En la app el ícono de pantalla de inicio cambia hasta el siguiente build. Los colores viven en un solo lugar por app: `mobile/src/theme.ts` y `web/src/styles/tokens.css`. Las tiendas se identifican con su inicial sobre su color: los logotipos reales del kit necesitan los archivos de cada marca y su permiso.

## Cómo está armado

| Carpeta | Qué es |
| --- | --- |
| `shared/contracts.ts` | El contrato tipado entre servidor y app. Ambos lo importan; si uno se queda atrás, no compila. |
| `api/` | Servidor en TypeScript (Fastify). Consulta a las tiendas, califica, agrupa y responde. |
| `mobile/` | App en React Native con Expo y TypeScript. |

El servidor es hexagonal: `domain/` (reglas, sin red), `application/` (el caso de uso y los puertos), `infrastructure/stores/` (un adaptador por tienda) e `interfaces/http/` (las rutas).

Rutas: `/search?q=&country=MX&state=&sort=relevancia|precio|descuento&accesorios=0|1&reacondicionados=0|1`, `/deals`, `/stores`, `/countries`, `/health`.

## Lo que hace la búsqueda

- Consulta todas las tiendas a la vez; una lenta o caída no detiene a las demás, y la app dice qué pasó con cada una.
- Los números de la búsqueda son obligatorios ("iphone 15" no trae un iPhone 16) y la marca también, si se escribió.
- Oculta accesorios y reacondicionados, dice cuántos ocultó y deja mostrarlos. Accesorio = palabra fuerte en el título (funda, mica, estuche, "accessories"…), palabra débil ANTES de lo buscado ("Cargador para…", "Cámara Nintendo Switch 2", "Videojuego … Nintendo Switch 2") o al FINAL del título sin "con/incluye" antes ("Nintendo Switch 2 Cámara"), o un "para" antes de lo buscado. Una palabra que trae el 40 % o más de los resultados nombra la categoría y nunca cuenta como accesorio ("cámara" al buscar "canon r50").
- Junta el mismo producto entre tiendas por código de barras, por clave de modelo del fabricante, o por marca + especificaciones con título parecido y precio creíble (`domain/grouping.ts`). Dentro de una misma firma cada oferta se encadena con TODAS las anteriores que se le parecen (un título largo en la tienda más barata ya no parte el grupo); "5G", "eSIM" o "Wi-Fi" no cuentan como especificación; "Plus" se conserva al singularizar (16 Plus ≠ 16) y la letra pegada al número distingue modelos (16e ≠ 16, A16 ≠ M16); "eSIM + SIM Física" no es un paquete. Al comparar títulos no cuentan colores ni relleno ("Wi-Fi", "edición estándar", "negro"); la marca se compara por su primera palabra ("Nintendo Switch" = "Nintendo"); las claves cortas con letra distinguen hermanos ("Galaxy A16" ≠ "M16"). Una oferta con MENOS especificaciones ("Consola Nintendo Switch 2") entra al único grupo parecido que tiene las suyas y más ("… 256 GB"); con dos candidatos (128 y 256 GB) o hacia un calificador ("15 Pro") no se adivina. Dos títulos iguales de cuatro o más palabras son lo mismo aunque no haya marca. El título del grupo es el más central entre las tiendas, no el de la más barata. Si no hay con qué afirmar que es lo mismo, no lo junta.
- Guarda cada búsqueda 10 minutos: cambiar el orden o un filtro no vuelve a consultar a las tiendas.
- **Paquetes con extra:** "Switch 2 + Mario Kart", "iPhone con AppleCare+" o "Bundle: FC27" se separan en producto base + extras (`domain/bundle.ts`). El paquete se agrupa con el producto solo y el extra cuenta a su favor; por tienda se enseña la más barata del producto solo y la más barata del paquete.
- **Lo que más te conviene** (`recommendation`): la más barata manda, salvo que un paquete cueste hasta 12 % más e incluya algo; entonces se recomienda ese con el sobreprecio en pesos.
- **Modo exacto** (`exacto=1`): todas las palabras presentes y sin variantes que el usuario no escribió (Pro, Ultra, Plus, FE…). La app y la web lo ofrecen como interruptor; las sugerencias ("Compara también") llevan al modelo exacto.
- **Historial de precios** (`/api/history?items=tienda:id,…&from=&to=`): un punto por día (mínimo del día, hora de México) por producto y tienda, con cobertura (`/api/history/coverage`) para que el periodo elegible nunca prometa más datos de los que hay. Cada búsqueda guarda hasta 200 precios; además, Cloud Scheduler dispara `POST /api/jobs/refresh-prices` todos los días a las 6:00 (clave `X-Job-Key` en Secret Manager) para volver a consultar las 40 búsquedas más repetidas aunque nadie entre. **Qué series se enseñan** (`shared/history-series.ts`, igual en web y app): de entrada solo el producto solo en las 6 tiendas más baratas; los paquetes entran con el botón "Incluir paquetes"; cada tienda se puede ocultar o mostrar desde su chip; nunca más de 8 a la vez (la paleta tiene 8 colores y un color no se repite: al mostrar una novena sale la más cara) y cada tienda conserva su color mientras esté a la vista.
- **Tiendas por plataforma (8-nov-2026):** además de VTEX (`vtex.ts`, ahora también iShop), hay un adaptador por plataforma con catálogo público: Shopify (`shopify.ts`, buscador de sugerencias, 10 resultados; Doto), Magento 2 GraphQL (`magento.ts`; Steren) y WooCommerce Store API (`woocommerce.ts`; Game Planet). Agregar otra tienda de esas plataformas es un renglón en `registry.ts`. Sondeadas y descartadas por muro anti-robots: MacStore, Innovasport, DDTech, PCEL, Intercompras, Digitalife; sin catálogo público reconocible: Sodimac, La Comer, Telcel, AT&T, RadioShack. Apple MX no tiene buscador consultable.
- **Lo buscado primero (`domain/focus.ts`, 8-nov-2026):** al buscar "PlayStation 5" coinciden la consola, sus juegos y sus controles. Los grupos que son "lo buscado" van antes en cualquier orden (relevancia, precio, descuento): los que nombran la categoría del modelo conocido en `domain/models.ts` ("Consola …", categoría `consola`), y los que empiezan con lo buscado sin delatar un accesorio o un juego ("Sony PlayStation 5 Pro 2TB" sí; "Nintendo Switch 2 Juego Tamagotchi" no). Con categoría conocida, lo que cuesta menos del 35 % de la consola más barata tampoco cuenta como consola. Además `normalize` entiende abreviaturas de tienda: "PS5" = "PlayStation 5", "NSW2" = "Nintendo Switch 2" (así "Control DualSense para PS5" se detecta como accesorio).
- **Memoria por tienda (8-nov-2026):** Amazon contesta desde la nube unas 4 de cada 8 veces (captcha intermitente). La búsqueda guarda la última respuesta buena de cada tienda por consulta durante 12 h (`storeMemory` en `searchOffers.ts`); si la tienda falla ahora (bloqueada, caída o tardó), se enseña esa respuesta y `StoreRun.ageMinutes` dice de hace cuánto es; la web lo muestra en "Qué pasó con cada tienda" ("precios de hace 35 min, ahora no contestó"). Si tampoco hay memoria reciente, se buscan en el historial (`SearchHistory.lastOffers`, Postgres o memoria) los precios de esa tienda de los últimos 7 días cuyos títulos traen las palabras buscadas; cada uno lleva `Offer.seenAt` y la tarjeta lo marca "Precio visto hace 2 días · sin verificar hoy" (como hacen otros comparadores, pero siempre con fecha).
- **Precios vistos por personas (8-nov-2026, "tiendas asistidas"):** Mercado Libre no le entrega precios al servidor, pero sí a la persona que abre su página. En la app, "Ver en Mercado Libre" abre la página dentro de la app (`mobile/src/components/store-visit.tsx`, WebView); un pequeño script lee el precio que la página le mostró a esa persona (producto o listado) y, si ella aceptó compartir (pregunta la primera vez; interruptor en Ajustes), la app lo manda a `POST /api/observations`. El servidor (`application/observations.ts`, `domain/assisted.ts`) valida la liga (dominio de la tienda y id del producto `MLM…`), el precio y el título, y lo guarda en `price_snapshots` con `source = 'usuario'` (columna nueva en `db/schema.sql`); como Mercado Libre siempre falla para el servidor, la búsqueda lo enseña por el respaldo de historial con `Offer.seenBy = 'usuario'` ("Precio visto hace 2 h por un usuario de la app · sin verificar"). Límite por IP de 20 envíos por minuto y 20 productos por envío. En la web no hay WebView: el enlace abre otra pestaña; la extensión de navegador queda pendiente.
- **Historial, leyenda y cambios (8-nov-2026):** cada tienda es una ficha (logotipo grande, nombre, último precio) con una línea del color de su curva cuando está en la gráfica y borde punteado cuando no; "Incluir paquetes" es una liga aparte. Junto a cada precio va si **bajó ▼ (verde), subió ▲ (rojo) o siguió igual =** frente al dato anterior de esa tienda, también en cada celda de la tabla. Además, una página de Amazon sin resultados y sin el armazón del buscador se trata como bloqueo suave, no como "no hay". En cada renglón de tienda ya no hay barra: se ve cuánto más cuesta que el mejor precio ("+$920") con columnas alineadas.
- **Carril de navegador (8-nov-2026, `infrastructure/browser/browserLane.ts`):** Coppel y Sears tienen páginas de resultados públicas que se arman dentro del navegador (Coppel con una credencial que su sitio obtiene solo; Sears con su buscador). No se copian credenciales ni se consultan servicios internos: se abre la página pública en un Chromium real (sin disfraces, sin proxies, sin imágenes) y se lee la respuesta JSON que la propia página recibe (`coppel.ts`, `sears.ts`, con pruebas sobre capturas reales). Un Chromium por copia del servidor, 2 pestañas a la vez (`BROWSER_CONCURRENCY`), espera máxima 20 s, y la misma regla que el cliente HTTP: muro = tienda bloqueada, no se insiste. En Cloud Run lo trae la imagen oficial de Playwright (`Dockerfile`, misma versión que `playwright-core`), con 2 GiB y 2 vCPU solo mientras atiende; en esta PC usa el Chromium de la caché de Playwright. `BROWSER_STORES_OFF=1` lo apaga y esas dos tiendas vuelven a aparecer como bloqueadas con su motivo. Sanborns y Claro Shop (mismo grupo que Sears) no: Sanborns bloquea al navegador y Claro Shop no entrega precios.
- **Logotipos de tiendas:** el icono que cada tienda publica en su propio sitio, normalizado a 128 px (`web/public/stores`, `mobile/assets/stores`; listas en `*/src/lib/store-logos.ts`). Mobo, Sony Store, OfficeMax y Suburbia no publican uno utilizable y siguen con monograma. Se regeneran con `scratchpad` → `fetch-logos.mjs` + `normalize-logos.mjs` (ver memoria del proyecto).

## Tiendas (comprobado el 6-nov-2026 desde esta PC)

**Se consultan (15):** Amazon, Liverpool, Suburbia, Costco, The Home Depot, Office Depot, Elektra, Chedraui, OfficeMax, Sony Store, Whirlpool, Martí, Mobo, Sally Beauty, Cyberpuerta. Suburbia, Home Depot y Office Depot entraron el 7-nov-2026 (Suburbia pasa por un inicio de sesión anónimo con cookies; Home Depot abre un producto suelto cuando la búsqueda coincide con uno solo; Office Depot abre una categoría para algunas búsquedas).

**Mercado Libre: registrada pero sin acceso a precios (decisión de Mercado Libre).** La app "PrecioRadar MX" existe en developers.mercadolibre.com.mx (en México el DevCenter exige antes la cuenta validada: INE y alta de Mercado Pago) y las llaves están en `api/.env` (ver `.env.example`) y en Secret Manager. Comprobado el 8-nov-2026: el token sale bien, pero `/sites/MLM/search` contesta 403 en todas sus variantes (texto, categoría, tienda oficial, vendedor) y `/products/search` responde sin precio, sin `buy_box_winner` y sin `permalink`; `/products/{id}/items` da 404 "No winners found". Desde finales de 2025 hay quejas públicas de desarrolladores con el mismo 403. El adaptador sigue intentando en cada búsqueda nueva (una petición, en caché 10 min) y reporta la tienda como bloqueada con ese motivo; si Mercado Libre reabre el acceso, funciona solo. **Mientras tanto, cada producto trae un enlace a Mercado Libre** (`ProductGroup.links`, puerto `StoreLinker` en `application/ports.ts`, servicio `application/links.ts`): la búsqueda devuelve de inmediato el enlace a su buscador (`listado.mercadolibre.com.mx/<nombre>`), y `GET /api/links?title=&brand=` lo mejora a la página exacta del producto (`mercadolibre.com.mx/p/MLM…`) cuando su catálogo lo reconoce (similitud de título ≥ 0.5; si no, se queda el buscador: mandar a otro producto sería peor). Ese paso se pide por tarjeta desde la web y la app, con caché de 24 h por producto, 3 consultas a la vez como máximo y 4 s de espera. El mismo puerto sirve para enlazar otras tiendas bloqueadas (Walmart, Sam's, Sears…) en cuanto se verifique el formato de su buscador. Al correr `desplegar-gcp.ps1`, el script sube esas dos llaves a Secret Manager (`comparador-meli-client-id` y `comparador-meli-client-secret`, solo si cambiaron) y las monta en Cloud Run como `MELI_CLIENT_ID` y `MELI_CLIENT_SECRET`; sin llaves en `.env` conserva las que ya haya en la nube. El adaptador usa el flujo *client credentials*; el token sí se obtiene, la búsqueda es la que Mercado Libre niega.

**No se pueden consultar todavía:**

- Walmart y Bodega Aurrerá responden a los lectores automáticos con resultados de otra búsqueda (siempre "leche" o "tostitos"). Parece que funciona, pero el dato es falso.
- Sam's Club, Soriana, El Palacio de Hierro y H-E-B rechazan la consulta con un muro anti-robots.
- Sears, Sanborns y Claro Shop no traen los productos en la página; salen de un servicio interno que no se consultó.
- Coppel: su buscador no tiene dirección pública (la página de resultados se arma solo dentro de la app del sitio) y cualquier ruta externa devuelve 403.

Regla del proyecto: si una tienda bloquea, se marca como bloqueada y no se intenta brincar el bloqueo. Para esas el camino es su API oficial o su programa de afiliados.

## Agregar una tienda

1. Crear `api/src/infrastructure/stores/<tienda>.ts` que cumpla `StoreAdapter` (ver `costco.ts`, el más corto).
2. Guardar una respuesta real en `api/test/fixtures/` y escribir su prueba en `stores.test.ts`.
3. Registrarla en `registry.ts`. Si la tienda es VTEX, basta un renglón en `VTEX_STORES`.

Agregar un país: darlo de alta en `infrastructure/catalog/countries.ts` y registrar sus tiendas con ese `country`.

## Despliegue en Google Cloud

Una sola imagen (`Dockerfile` en la raíz) corre en Cloud Run: la API sirve también la web compilada, así que web y API comparten dominio y no hay CORS que configurar. Postgres es la instancia Cloud SQL `prices-postgres` (proyecto `price-comparator-514101`, región `us-central1`); la API se conecta por el socket de Cloud SQL y la cadena de conexión vive en Secret Manager, nunca en el código.

```powershell
.\desplegar-gcp.ps1 -Login          # una vez: autoriza gcloud con tu cuenta de Google
.\desplegar-gcp.ps1 -SoloVerificar  # solo lee el estado
.\desplegar-gcp.ps1                 # despliega (idempotente: crea solo lo que falta, no borra nada)
```

Si Windows no deja correr scripts: `powershell -ExecutionPolicy Bypass -File .\desplegar-gcp.ps1`. El script usa el SDK de Google Cloud que ya está en esta PC (`%LOCALAPPDATA%\OeeLiveTools\google-cloud-sdk`) con el Python del sistema; la sesión queda en `%APPDATA%\gcloud`.

**Publicado el 7-nov-2026:** web y API en **https://precioradar-701205043940.us-central1.run.app** (servicio Cloud Run `precioradar` (antes `comparador`, borrado el 8-nov), 0 a 2 copias, 512 MiB, cuenta de servicio `comparador-api` con solo `cloudsql.client` y lectura del secreto `comparador-database-url`; imagen en Artifact Registry `cloud-run-source-deploy`). La clave de `price_app` se generó en el despliegue y vive solo en Secret Manager. Desde la nube Amazon pide captcha (bloqueada); las demás tiendas responden igual que desde la PC.

La app de celular apunta al servidor publicado con `mobile/.env.production` (`EXPO_PUBLIC_API_URL`) al compilarla; en desarrollo lo detecta sola.

## Pendiente

- Los descuentos sin búsqueda (`/deals`) solo salen de las tiendas VTEX, que permiten pedir el catálogo ordenado por rebaja.
- El estado se guarda pero todavía no cambia resultados: los precios en línea de estas tiendas son nacionales.
- Las lecturas de página (Amazon, Liverpool, Cyberpuerta) se rompen cuando la tienda cambia su sitio o corta el acceso. Las pruebas con respuestas reales avisan cuál lector hay que ajustar.
- Desde Cloud Run, Amazon pide captcha. Para tenerla en producción el camino es su API de afiliados (Amazon Associates).
- Cada búsqueda guarda en Postgres los precios vistos (`comparador.price_snapshots`), pero todavía no hay pantalla ni ruta que enseñe el historial, ni alertas de bajada de precio, ni un proceso que consulte precios cuando nadie busca.
