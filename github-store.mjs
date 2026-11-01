import { PHOTO_MAX_BYTES, PHOTO_TYPES, photoPath, validCoordinates } from './v2-utils.mjs';
import { parseDay } from './date-utils.mjs';

const ROOT = 'couple-data';
const FOLDERS = ['anniversaries', 'whispers', 'habits', 'checkins', 'moods', 'profiles', 'places', 'treeholes', 'photos'];
const ROLES = ['me', 'partner'];
const cloneRecord = value => JSON.parse(JSON.stringify(value));
const validDay = value => { try { parseDay(value); return true; } catch { return false; } };
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
function timeoutController(milliseconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

function encodeJson(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}

function decodeJson(content) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), (c) => c.charCodeAt(0))));
}

function validateRecord(folder, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (folder === 'profiles') return ROLES.includes(value.role) && typeof value.name === 'string' && typeof value.city === 'string' && (!value.location || validCoordinates(value.location));
  if (folder === 'moods') return ROLES.includes(value.role) && typeof value.key === 'string' && (!value.history || (Array.isArray(value.history) && value.history.every(entry => entry && typeof entry.key === 'string' && typeof entry.note === 'string' && validTime(entry.setAt))));
  if (typeof value.id !== 'string' || !/^[\w-]+$/.test(value.id)) return false;
  if (folder === 'whispers') return ROLES.includes(value.sender) && ROLES.includes(value.recipient) && typeof value.content === 'string' && typeof value.createdAt === 'string';
  if (folder === 'habits') return ROLES.includes(value.owner) && typeof value.name === 'string';
  if (folder === 'anniversaries') return typeof value.title === 'string' && validDay(value.date);
  if (folder === 'places') return typeof value.name === 'string' && validCoordinates(value) && validDay(value.visitedAt) && (!value.note || typeof value.note === 'string');
  if (folder === 'treeholes') return ROLES.includes(value.owner) && ROLES.includes(value.recipient) && value.owner !== value.recipient && typeof value.content === 'string' && validTime(value.createdAt) && ['pending', 'willing', 'needs-time', 'replied'].includes(value.status) && (!value.readAt || validTime(value.readAt)) && (!value.reply || typeof value.reply === 'string');
  if (folder === 'photos') return ROLES.includes(value.owner) && typeof value.caption === 'string' && validTime(value.createdAt) && PHOTO_TYPES.has(value.mime) && value.imagePath === photoPath(value.id, value.mime) && Number.isInteger(value.size) && value.size > 0 && value.size <= PHOTO_MAX_BYTES && Number.isInteger(value.width) && value.width > 0 && value.width <= 1600 && Number.isInteger(value.height) && value.height > 0 && value.height <= 1600;
  return ROLES.includes(value.owner) && typeof value.habitId === 'string' && validDay(value.date);
}

export class GithubStore {
  #token;
  #fetch;
  #cache = new Map();
  retryAt = 0;
  constructor({ owner, repo, branch = '', token }, fetcher = globalThis.fetch) {
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo) || !token) throw new Error('请填写有效的仓库拥有者、仓库名称和 Token。');
    this.owner = owner; this.repo = repo; this.branch = branch;
    this.#token = token;
    // Keep the browser's native fetch receiver. Some Chromium/PWA contexts
    // throw "Illegal invocation" when an unbound fetch is called as a class field.
    this.#fetch = typeof fetcher?.bind === 'function' ? fetcher.bind(globalThis) : fetcher;
    this.base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  async request(path, options = {}) {
    if (Date.now() < this.retryAt) throw new Error('GitHub 请求较频繁，稍后会自动重试。');
    let response;
    const timeout = timeoutController(20000);
    try {
      response = await this.#fetch(`https://api.github.com${path}`, {
        ...options, cache: 'no-store', signal: timeout.signal,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.#token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
      });
    } catch (error) {
      const detail = [error?.name, error?.message].filter(Boolean).join(': ') || 'unknown fetch error';
      const message = error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'GitHub 连接超时，请检查网络后重试。'
        : `无法连接 GitHub，内容尚未保存（${detail}）。`;
      const wrapped = new Error(message, { cause: error });
      wrapped.code = error?.name || 'FETCH_FAILED';
      wrapped.requestPath = path;
      throw wrapped;
    } finally {
      timeout.cancel();
    }
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      if (retry || response.headers.get('x-ratelimit-remaining') === '0' || response.status === 429) {
        this.retryAt = retry ? Date.now() + Number(retry) * 1000 : Number(response.headers.get('x-ratelimit-reset')) * 1000 || Date.now() + 60000;
      }
      const messages = {
        401: 'Token 无效或已过期，请重新连接。',
        403: '没有操作权限或达到 API 限额。请检查 Token 的仓库授权。',
        404: '找不到仓库或分支，请检查名称和 Token 权限。',
        409: '版本发生冲突。内容尚未覆盖，请同步后重新提交。',
        422: '文件版本已变化或写入被拒绝，请同步后重新提交。',
        429: '请求频繁，稍后会自动重试。'
      };
      const error = new Error(messages[response.status] || `GitHub 请求失败（${response.status}），内容尚未保存。`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  async validate() {
    const repo = await this.request(this.base);
    if (!repo.private) throw new Error('请选择 Private 私有数据仓库。');
    if (repo.permissions && !repo.permissions.push) throw new Error('当前账号没有仓库写入权限。');
    if (!this.branch) this.branch = repo.default_branch;
    if (!this.branch) throw new Error('请先在数据仓库中添加 README，完成初始化。');
    return this;
  }

  async load() {
    // A single tree request detects unchanged content. Read only new blob SHAs.
    let tree;
    try { tree = await this.request(`${this.base}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`); }
    catch (error) {
      if (error.status === 409) error.message = '数据仓库尚未初始化。请先添加 README，再重新连接。';
      throw error;
    }
    if (!Array.isArray(tree?.tree)) throw new Error('GitHub 目录响应不完整，已保留当前数据。');
    if (tree.truncated) throw new Error('仓库过大，目录读取不完整，已保留当前数据。');
    const paths = tree.tree.filter((item) => item.type === 'blob' && new RegExp(`^${ROOT}/(${FOLDERS.join('|')})/[^/]+\\.json$`).test(item.path));
    const loaded = { anniversaries: [], whispers: [], habits: [], checkins: [], moods: {}, profiles: {}, places: [], treeholes: [], photos: [] };
    let index = 0;
    const records = new Array(paths.length);
    await Promise.all(Array.from({ length: Math.min(4, paths.length) }, async () => {
      while (index < paths.length) {
        const slot = index++;
        const item = paths[slot];
        let raw = this.#cache.get(item.sha);
        if (!raw) {
          const blob = await this.request(`${this.base}/git/blobs/${item.sha}`);
          try { raw = decodeJson(blob.content); } catch { throw new Error(`数据文件无法解析：${item.path}`); }
          this.#cache.set(item.sha, raw);
        }
        const folder = item.path.split('/')[1];
        if (!validateRecord(folder, raw)) throw new Error(`数据格式不正确：${item.path}`);
        const id = folder === 'profiles' || folder === 'moods' ? raw.role : raw.id;
        if (item.path !== `${ROOT}/${folder}/${id}.json`) throw new Error(`数据编号与文件名不一致：${item.path}`);
        records[slot] = { ...cloneRecord(raw), _sha: item.sha, _path: item.path };
      }
    }));
    records.forEach((record, slot) => {
      const folder = paths[slot].path.split('/')[1];
      if (folder === 'profiles' || folder === 'moods') loaded[folder][record.role] = record;
      else loaded[folder].push(record);
    });
    return loaded;
  }

  async save(folder, record) {
    if (!FOLDERS.includes(folder) || !validateRecord(folder, record)) throw new Error('内容格式不正确，尚未保存。');
    const id = folder === 'profiles' || folder === 'moods' ? record.role : record.id;
    const path = `${ROOT}/${folder}/${id}.json`;
    const clean = cloneRecord(record); delete clean._sha; delete clean._path;
    const body = { message: `Update ${folder} via Between Us`, content: encodeJson(clean), branch: this.branch };
    if (record._sha) body.sha = record._sha;
    const result = await this.request(`${this.base}/contents/${encodePath(path)}`, { method: 'PUT', body: JSON.stringify(body) });
    this.#cache.set(result.content.sha, cloneRecord(clean));
    return { ...clean, _sha: result.content.sha, _path: path };
  }

  async remove(record) {
    if (!record._sha || !new RegExp(`^${ROOT}/(${FOLDERS.join('|')})/[^/]+\\.json$`).test(record._path)) throw new Error('请先同步最新数据再删除。');
    await this.request(`${this.base}/contents/${encodePath(record._path)}`, { method: 'DELETE', body: JSON.stringify({ message: 'Delete record via Between Us', branch: this.branch, sha: record._sha }) });
  }

  async savePhoto(record, base64) {
    if (!validateRecord('photos', record)) throw new Error('图片资料格式不正确。');
    const size = Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (size !== record.size || size < 1 || size > PHOTO_MAX_BYTES || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('图片大小不匹配，或压缩后的图片不小于 1 MB。');
    const body = { message: 'Upload photo via Between Us', content: base64, branch: this.branch };
    const result = await this.request(`${this.base}/contents/${encodePath(record.imagePath)}`, { method: 'PUT', body: JSON.stringify(body) });
    return { ...record, imageSha: result.content.sha };
  }

  async readPhoto(record) {
    if (!validateRecord('photos', record)) throw new Error('图片资料格式不正确。');
    const result = await this.request(`${this.base}/contents/${encodePath(record.imagePath)}?ref=${encodeURIComponent(this.branch)}`);
    const base64 = String(result.content || '').replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('图片数据无法读取。');
    if (base64.length > Math.ceil(PHOTO_MAX_BYTES / 3) * 4 || base64.length % 4 !== 0) throw new Error('图片大小超出限制。');
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    if (bytes.length !== record.size) throw new Error('图片大小与记录不一致，请重新同步。');
    return bytes;
  }

  async removePhotoFile(record) {
    if (!validateRecord('photos', record)) throw new Error('图片资料格式不正确。');
    const file = record.imageSha ? { sha: record.imageSha } : await this.request(`${this.base}/contents/${encodePath(record.imagePath)}?ref=${encodeURIComponent(this.branch)}`);
    await this.request(`${this.base}/contents/${encodePath(record.imagePath)}`, { method: 'DELETE', body: JSON.stringify({ message: 'Delete photo via Between Us', branch: this.branch, sha: file.sha }) });
  }

  async removePhoto(record) {
    if (!validateRecord('photos', record)) throw new Error('图片资料格式不正确。');
    // Delete the image first. If the second operation fails, metadata still
    // advertises an unreadable photo, which the UI can retry removing.
    try { await this.removePhotoFile(record); }
    catch (error) { if (error.status !== 404) throw error; }
    await this.remove(record);
    return true;
  }
}
