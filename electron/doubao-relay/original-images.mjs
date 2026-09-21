// Runs inside the page. Only accept original URLs for images in this message row.
export function collectOriginalImages(nodes) {
  const images = new Map();
  for (const node of nodes) {
    const id = (node.currentSrc || node.src || '').match(/\/rc_gen_image\/([^./~?]+)/)?.[1];
    if (!id || images.has(id)) continue;
    let fiber = node[Object.keys(node).find(key => key.startsWith('__reactFiber'))];
    for (let depth = 0; fiber && depth < 24; depth++, fiber = fiber.return) {
      const list = fiber.memoizedProps?.creationsImageList;
      if (!Array.isArray(list)) continue;
      const creation = list.find(item => item.image?.key?.match(/\/rc_gen_image\/([^./~?]+)/)?.[1] === id);
      const original = creation?.image?.image_ori_raw;
      if (original?.url) {
        try {
          const url = new URL(original.url);
          if (url.protocol === 'https:' && url.hostname.endsWith('.byteimg.com') &&
              url.pathname.match(/\/rc_gen_image\/([^./~?]+)/)?.[1] === id) {
            images.set(id, { id, url: original.url });
          }
        } catch { /* Missing or malformed original: leave the task pending. */ }
      }
      break;
    }
  }
  return [...images.values()];
}

export function imageExtension(buffer) {
  if (buffer.length < 10240) throw new Error('原图文件过小或内容不完整。');
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new Error('原图返回的不是支持的图片文件。');
}
