const CACHE = 'stormline-v7';
const APP_FILES = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin || new URL(request.url).pathname.startsWith('/.netlify/')) return;
  event.respondWith(fetch(request).then(response => { if(response.ok){ const copy=response.clone(); caches.open(CACHE).then(c=>c.put(request,copy)); } return response; }).catch(() => caches.match(request).then(r => r || caches.match('/'))));
});
self.addEventListener('push', event => {
  let payload = {title:'Stormline weather update', body:'Open Stormline for the latest conditions.', url:'/'};
  try {if(event.data) payload={...payload,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(payload.title, {body:payload.body, icon:'/icons/icon-192.png', badge:'/icons/icon-192.png', tag:payload.tag || 'stormline-alert', renotify:true, data:{url:payload.url || '/'}, requireInteraction:Boolean(payload.urgent)}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const url=new URL(event.notification.data?.url||'/', self.location.origin).href; for(const c of clients){if(c.url.startsWith(self.location.origin)){await c.focus();c.navigate(url);return;}} await self.clients.openWindow(url);}));});