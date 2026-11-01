import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as limits from '../v2-utils.mjs';

const source = (await readFile(new URL('../image-utils.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
function compressionHarness({ width = 3200, height = 2400, fallback = false, bytes = 100, invalid = false } = {}) {
  const revoked = [], encodings = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob(callback, type) { encodings.push(type); callback(new Blob([new Uint8Array(bytes)], { type: fallback && type === 'image/webp' ? 'image/png' : type })); } };
  class ImageDouble {
    naturalWidth = width; naturalHeight = height;
    set src(value) { if (value) { if (invalid) this.onerror(); else this.onload(); } }
  }
  const context = vm.createContext({ ...limits, URL: { createObjectURL: () => 'blob:source', revokeObjectURL: url => revoked.push(url) }, Image: ImageDouble, document: { createElement: () => canvas }, btoa, Uint8Array, Blob });
  vm.runInContext(source + '\n globalThis.compress = compressPhoto;', context);
  return { compress: context.compress, revoked, encodings, canvas };
}

test('compression scales to 1600px and returns internally consistent WebP bytes', async () => {
  const run = compressionHarness();
  const output = await run.compress({ type: 'image/png', size: 5000 });
  assert.equal(output.width, 1600); assert.equal(output.height, 1200);
  assert.equal(output.mime, 'image/webp');
  assert.equal(Buffer.from(output.base64, 'base64').length, output.size);
  assert.deepEqual(run.revoked, ['blob:source']);
});

test('compression falls back to JPEG when WebP encoding is unavailable', async () => {
  const run = compressionHarness({ fallback: true });
  assert.equal((await run.compress({ type: 'image/jpeg', size: 1000 })).mime, 'image/jpeg');
  assert.deepEqual(run.encodings, ['image/webp', 'image/jpeg']);
});

test('compression rejects unsupported or huge input and releases decoded source URLs on failure', async () => {
  const run = compressionHarness();
  await assert.rejects(run.compress({ type: 'image/heic', size: 100 }), /格式|WebP/);
  await assert.rejects(run.compress({ type: 'image/jpeg', size: 16 * 1024 * 1024 }), /15 MB/);
  for (const options of [{ invalid: true }, { width: 10000, height: 10000 }, { bytes: 1000000 }]) {
    const failed = compressionHarness(options);
    await assert.rejects(failed.compress({ type: 'image/png', size: 1000 }));
    assert.deepEqual(failed.revoked, ['blob:source']);
  }
});
