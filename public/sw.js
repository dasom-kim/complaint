self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach((client) => {
            client.postMessage({ type: 'FORCE_RELOAD' });
        });
    })());
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
