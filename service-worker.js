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
const CACHE_NAME = 'prestaya-v34';

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
      .then((cache) => cache.addAll(ARCHIVOS_APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ---- Activación: borra cachés de versiones anteriores ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
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
