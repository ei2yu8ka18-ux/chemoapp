import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDirForFile, toPosix } from './fs-utils.mjs';

function parseNextData(html) {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function safeFileName(raw, fallback) {
  const normalized = String(raw || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

function extFromUrl(url) {
  const withoutQuery = String(url || '').split('?')[0];
  const ext = path.extname(withoutQuery).toLowerCase();
  return ext && ext.length <= 5 ? ext : '.png';
}

function extractImageUrlsFromNextData(nextData) {
  const regimen = nextData?.props?.pageProps?.regimen;
  const urls = [];
  const addUrl = (value) => {
    if (typeof value !== 'string') return;
    if (!/^https?:\/\//i.test(value)) return;
    urls.push(value);
  };

  const scheduleImages = Array.isArray(regimen?.scheduleImages) ? regimen.scheduleImages : [];
  for (const image of scheduleImages) {
    addUrl(image?.source || image?.url || image?.src || image);
  }

  const abstracts = Array.isArray(regimen?.abstracts) ? regimen.abstracts : [];
  for (const op of abstracts) {
    const insert = op?.insert;
    if (insert && typeof insert === 'object') {
      addUrl(insert.source || insert.url || insert.src);
    }
  }

  return Array.from(new Set(urls));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return response.text();
}

async function downloadBinary(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://hokuto.app/',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading image ${url}`);
  }
  const arr = await response.arrayBuffer();
  return Buffer.from(arr);
}

export async function fetchHokutoSnapshot(options) {
  const url = String(options?.url || '').trim();
  const htmlOutput = String(options?.htmlOutput || '').trim();
  const imagesDirInput = options?.imagesDir ? String(options.imagesDir).trim() : '';
  if (!url) throw new Error('--url is required');
  if (!htmlOutput) throw new Error('--html-output is required');

  const html = await fetchText(url);
  await ensureDirForFile(htmlOutput);
  await fs.writeFile(path.resolve(htmlOutput), html, 'utf8');

  const nextData = parseNextData(html);
  const imageUrls = nextData ? extractImageUrlsFromNextData(nextData) : [];
  const downloadedImages = [];

  if (imagesDirInput) {
    const imagesDir = path.resolve(imagesDirInput);
    await fs.mkdir(imagesDir, { recursive: true });
    for (let i = 0; i < imageUrls.length; i += 1) {
      const imageUrl = imageUrls[i];
      const basename = safeFileName(path.basename(imageUrl.split('?')[0]), `image_${String(i + 1).padStart(3, '0')}${extFromUrl(imageUrl)}`);
      const outPath = path.join(imagesDir, basename || `image_${String(i + 1).padStart(3, '0')}${extFromUrl(imageUrl)}`);
      const binary = await downloadBinary(imageUrl);
      await fs.writeFile(outPath, binary);
      downloadedImages.push(toPosix(outPath));
    }
  }

  return {
    url,
    htmlOutput: path.resolve(htmlOutput),
    imageUrlCount: imageUrls.length,
    downloadedImageCount: downloadedImages.length,
    downloadedImages,
  };
}

