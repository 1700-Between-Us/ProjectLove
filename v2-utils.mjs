export const MOOD_WINDOW_MS = 48 * 60 * 60 * 1000;
// Stay strictly below GitHub Contents API's 1 MB JSON-content boundary.
export const PHOTO_MAX_BYTES = 1000000 - 1;
export const PHOTO_TARGET_BYTES = 500 * 1024;
export const PHOTO_LIMIT = 50;
export const PHOTO_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

export function recentMoods(mood, now = Date.now()) {
  const history = Array.isArray(mood?.history) ? mood.history.filter(entry => entry && typeof entry === 'object') : [];
  if (mood?.key && mood.updatedAt && !history.some(entry => entry.setAt === mood.updatedAt)) {
    history.push({ key: mood.key, note: mood.note || '', setAt: mood.updatedAt });
  }
  return history.filter(entry => {
    const time = Date.parse(entry.setAt);
    return typeof entry.key === 'string' && Number.isFinite(time) && time <= now && time >= now - MOOD_WINDOW_MS;
  }).sort((a, b) => Date.parse(b.setAt) - Date.parse(a.setAt));
}

export function validCoordinates(place) {
  return Number.isFinite(place?.latitude) && Math.abs(place.latitude) <= 90
    && Number.isFinite(place?.longitude) && Math.abs(place.longitude) <= 180;
}

export function distanceKm(a, b) {
  if (!validCoordinates(a) || !validCoordinates(b)) return null;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function anniversaryText(days) {
  return days === 0 ? '就是今天' : days > 0 ? `还有 ${days} 天` : `已经 ${Math.abs(days)} 天`;
}

export function photoPath(id, mime) {
  if (!/^[\w-]+$/.test(id) || !PHOTO_TYPES.has(mime)) throw new Error('图片格式或编号不正确。');
  return `couple-data/images/${id}.${{ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[mime]}`;
}
