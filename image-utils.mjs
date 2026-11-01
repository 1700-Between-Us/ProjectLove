import { PHOTO_MAX_BYTES, PHOTO_TARGET_BYTES, PHOTO_TYPES } from './v2-utils.mjs';

export async function compressPhoto(file) {
  if (!file || !PHOTO_TYPES.has(file.type)) throw new Error('请选择 WebP、JPEG 或 PNG 图片。');
  if (file.size > 15 * 1024 * 1024) throw new Error('原图请小于 15 MB，建议先在手机中缩小。');
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('这张图片无法解码，请重新导出为 JPEG 或 WebP。'));
      image.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 80000000) throw new Error('图片尺寸过大，请先缩小后上传。');
    const canvas = document.createElement('canvas');
    let edge = 1600;
    let blob;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ratio = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器暂不支持图片处理。');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const encode = type => new Promise(resolve => canvas.toBlob(resolve, type, Math.max(.55, .82 - attempt * .06)));
      blob = await encode('image/webp');
      if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
      if (blob && blob.size <= PHOTO_TARGET_BYTES) break;
      edge = Math.round(edge * .75);
    }
    if (!blob || !PHOTO_TYPES.has(blob.type) || blob.size > PHOTO_MAX_BYTES) throw new Error('压缩后仍超过 1 MB，请换一张更小的图片。');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { base64: btoa(binary), mime: blob.type, size: blob.size, width: canvas.width, height: canvas.height };
  } finally { image.src = ''; URL.revokeObjectURL(sourceUrl); }
}
