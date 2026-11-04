import { validCoordinates } from './v2-utils.mjs';

let activeMap = null;
let observer = null;
let view = null;

export function unmountCityMap(resetView = false) {
  observer?.disconnect();
  observer = null;
  if (activeMap) { activeMap.remove(); activeMap = null; }
  if (resetView) view = null;
}

export function mountCityMap(people, places = []) {
  unmountCityMap();
  const root = document.querySelector('#city-map');
  if (!root) return;
  const L = globalThis.L;
  if (!L) { root.textContent = '地图组件暂未加载，请联网刷新页面。'; return; }
  const markers = [
    ...people.filter(validCoordinates).map(person => ({ ...person, kind: 'person' })),
    ...places.filter(validCoordinates).map(place => ({ ...place, kind: 'place' }))
  ];
  const key = JSON.stringify(markers.map(point => [point.latitude, point.longitude]));
  const map = L.map(root, { minZoom: 2, maxZoom: 16, worldCopyJump: true });
  activeMap = map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
  }).addTo(map);
  for (const point of markers) {
    const label = document.createElement('div');
    label.className = 'city-tooltip-content';
    const copy = document.createElement('span');
    copy.textContent = [point.name, point.visitedAt, point.note].filter(Boolean).join(' · ');
    label.append(copy);
    const albumLink = document.createElement('button');
    albumLink.type = 'button';
    albumLink.className = 'city-album-link';
    albumLink.dataset.action = 'navigate-photos-group';
    albumLink.dataset.group = point.albumGroup || point.name;
    albumLink.textContent = '打开相册';
    albumLink.title = `打开“${albumLink.dataset.group}”相册分组`;
    albumLink.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.dispatchEvent(new CustomEvent('between-us:navigate-photos-group', { detail: { group: albumLink.dataset.group } }));
    });
    label.append(albumLink);
    for (const wish of point.relatedWishes || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'city-album-link';
      button.textContent = `${wish.status} · ${wish.title}`;
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        document.dispatchEvent(new CustomEvent('between-us:open-wish', { detail: { id: wish.id } }));
      });
      label.append(button);
    }
    L.marker([point.latitude, point.longitude], {
      title: point.name,
      icon: L.divIcon({ className: `city-marker ${point.kind}${point.planned ? ' planned' : ''}`, html: point.kind === 'person' ? '♥' : point.planned ? '☆' : '●', iconSize: [30, 30], iconAnchor: [15, 15] })
    }).bindPopup(label, { className: 'city-label-popup', maxWidth: 360 }).addTo(map);
  }
  if (people.length === 2 && people.every(validCoordinates)) {
    L.polyline(people.map(point => [point.latitude, point.longitude]), { color: '#5f9dd3', weight: 2, dashArray: '6 8' }).addTo(map);
  }
  if (view?.key === key) map.setView(view.center, view.zoom);
  else if (markers.length) map.fitBounds(markers.map(point => [point.latitude, point.longitude]), { padding: [45, 45], maxZoom: 9 });
  else map.setView([35, 105], 4);
  const remember = () => { const center = map.getCenter(); view = { key, center: [center.lat, center.lng], zoom: map.getZoom() }; };
  remember();
  map.on('moveend zoomend', remember);
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => { if (activeMap === map) map.invalidateSize({ pan: false }); });
    observer.observe(root);
  }
}
