// Word Islands — offline cache
// Bump this version any time app files change so the new files get cached.
var CACHE_NAME = 'word-islands-v2';
var CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './words-data.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(CORE_ASSETS);
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// cache-first for our own files, network-first fallback for anything else (e.g. Google Fonts)
self.addEventListener('fetch', function(event){
  var url = event.request.url;
  var isCoreAsset = CORE_ASSETS.some(function(a){
    if(a==='./') return false;
    return url.indexOf(a.replace('./',''))!==-1;
  });

  if(isCoreAsset){
    event.respondWith(
      caches.match(event.request).then(function(cached){
        return cached || fetch(event.request);
      })
    );
  } else {
    event.respondWith(
      fetch(event.request).then(function(res){
        var resClone = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, resClone); });
        return res;
      }).catch(function(){
        return caches.match(event.request);
      })
    );
  }
});
