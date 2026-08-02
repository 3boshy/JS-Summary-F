const CACHE_NAME = 'dna-stock-hub-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './dna-stock.html',
  './manifest.webmanifest',
  './src/main.js',
  './src/config/app.config.js',
  './src/constants/sortOptions.js',
  './src/providers/jsonDataProvider.js',
  './src/repositories/itemRepository.js',
  './src/services/storageService.js',
  './src/services/hapticService.js',
  './src/services/clipboardService.js',
  './src/services/snackbarService.js',
  './src/utils/dom.js',
  './src/utils/formatters.js',
  './src/utils/search.js',
  './src/utils/scheduler.js',
  './src/components/bottomSheet.js',
  './src/components/icons.js',
  './src/components/itemCard.js',
  './src/components/skeletons.js',
  './src/features/inventory/inventoryController.js',
  './src/features/inventory/itemDetailSheet.js',
  './src/theme/tokens.css',
  './src/animations/motion.css',
  './src/styles/app.css',
  './src/database/items.json',
  './src/database/categories.json',
  './src/database/departments.json',
  './src/database/tags.json',
  './src/database/favorites.json',
  './src/database/recent.json',
  './src/database/employees.json',
  './src/database/settings.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
