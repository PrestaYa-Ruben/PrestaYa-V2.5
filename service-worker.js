// Service worker de PrestaYa — Sistema de Préstamos.
// Cachea el "app shell" (los archivos que hacen que la app abra y
// funcione) para que la app cargue sin conexión después de la primera
// visita. Los datos de clientes/créditos/abonos NO viven acá: esos
// siguen guardados en localStorage dentro de la propia app.

// IMPORTANTE: cuando subas una nueva versión de index.html al
// repositorio, sube también la versión del número de acá abajo
// (ej. 'prestaya-v2', 'prestaya-v3'...). Eso obliga a los teléfonos
// que ya instalaron la app a bajar los archivos nuevos en vez de
// seguir usando la copia vieja guardada en caché.
const CACHE_NAME = 'prestaya-v927';
const CACHE_FUENTES = 'prestaya-fuentes'; // v833: tipografias de Google, se guardan para verse igual sin internet

const ARCHIVOS_APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-192-maskable.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// ---- Instalación: descarga y guarda el app shell en caché ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // v833: cada archivo se guarda por separado; si uno falla, los demas igual quedan disponibles sin internet
      .then((cache) => Promise.all(ARCHIVOS_APP_SHELL.map((f) => cache.add(f).catch(() => {}))))
  );
});

// v899: la versión nueva queda "en espera" hasta que la persona toque ACTUALIZAR en el aviso de la app
self.addEventListener('message', (event) => {
  if (event.data && event.data.tipo === 'SALTAR_ESPERA') self.skipWaiting();
});

// ---- Activación: borra cachés de versiones anteriores ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME && nombre !== CACHE_FUENTES)
          .map((nombre) => caches.delete(nombre))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- Peticiones: primero caché, si no existe va a la red ----
// Si la red falla (sin conexión) y el archivo ya estaba en caché,
// la app sigue abriendo con esa copia guardada.
self.addEventListener('fetch', (event) => {
  // Solo maneja peticiones GET del propio origen (deja pasar las de
  // Google Fonts y otras normalmente, sin intentar cachearlas).
  if (event.request.method !== 'GET') return;

  // v823: la pagina (index.html) va "primero la red": si hay internet siempre carga la
  // version mas nueva (sin usar la copia temporal del navegador); sin internet usa la
  // copia guardada. Asi los cambios se ven al abrir, sin tener que abrir dos veces.
  const url = new URL(event.request.url);

  // v833: tipografias de Google — primero la copia guardada (abre al instante, incluso con senal debil o sin internet)
  // y en segundo plano se actualiza.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_FUENTES).then((cache) =>
        cache.match(event.request).then((guardada) => {
          const red = fetch(event.request).then((r) => {
            if (r && (r.status === 200 || r.type === 'opaque')) cache.put(event.request, r.clone());
            return r;
          }).catch(() => guardada || Response.error());
          return guardada || red;
        })
      )
    );
    return;
  }

  // v823/v833: la pagina (index.html) va "primero la red" para ver siempre la version mas nueva, pero si no
  // responde en 4 segundos (senal debil) o no hay internet, abre al instante la copia guardada.
  const esPagina = event.request.mode === 'navigate' || (url.origin === self.location.origin && /(^|\/)(index\.html)?$/.test(url.pathname));
  if (esPagina) {
    event.respondWith((async () => {
      // v841: sin conexion declarada por el telefono no se espera a la red: abre al instante la copia guardada
      if (self.navigator && self.navigator.onLine === false) {
        const guardadaYa = (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match(event.request, { ignoreSearch: true }));
        if (guardadaYa) return guardadaYa;
      }
      const red = fetch(event.request, { cache: 'no-cache' }).then((respuestaRed) => {
        if (respuestaRed && respuestaRed.status === 200) {
          const copia = respuestaRed.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copia));
        }
        return respuestaRed;
      });
      const limite = new Promise((resolver) => setTimeout(() => resolver(null), 1500));
      const rapida = await Promise.race([red.catch(() => null), limite]);
      if (rapida) return rapida;
      const guardada = (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match(event.request, { ignoreSearch: true }));
      if (guardada) return guardada;
      return red.catch(() => Response.error());
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then((respuestaCache) => {
      if (respuestaCache) return respuestaCache;

      return fetch(event.request)
        .then((respuestaRed) => {
          // Guarda en caché una copia de los archivos propios (mismo
          // origen) para que la próxima vez también funcionen offline.
          const esMismoOrigen = event.request.url.startsWith(self.location.origin);
          if (esMismoOrigen && respuestaRed && respuestaRed.status === 200) {
            const copia = respuestaRed.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return respuestaRed;
        })
        .catch(() => {
          // Sin conexión y sin copia en caché: si pedían una página,
          // devuelve al menos el index como último recurso.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
