import type { VercelRequest, VercelResponse } from '@vercel/node';

// Discord系ドメインのみ許可（SSRF防止）
const ALLOWED_DOMAINS = [
  'discord.com',
  'discordapp.com',
  'discord.gg',
  'cdn.discordapp.com',
  'media.discordapp.net',
  'gateway.discord.gg',
];

// ドメインがホワイトリストに含まれるかチェック
function isAllowedDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

// 転送しないヘッダー（hop-by-hop等）
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight対応
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  // パスパラメータから転送先URLを取得
  // /.proxy/https://discord.com/api/... → https://discord.com/api/...
  const pathParam = req.query.path;
  
  // パスが空の場合
  if (!pathParam) {
    return res.status(400).json({ 
      error: 'Target URL is required', 
      usage: '/.proxy/{full_url}',
      status: 'Proxy endpoint is working'
    });
  }

  // 配列の場合は結合、文字列の場合はそのまま使用
  const targetPath = Array.isArray(pathParam) ? pathParam.join('/') : pathParam;

  // URLのデコード（二重エンコードされている場合に対応）
  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(targetPath);
  } catch {
    decodedUrl = targetPath;
  }

  // http:// または https:// で始まらない場合は https:// を付与
  if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
    decodedUrl = 'https://' + decodedUrl;
  }

  // ドメインチェック（SSRF防止）
  if (!isAllowedDomain(decodedUrl)) {
    return res.status(403).json({
      error: 'Domain not allowed',
      allowed: ALLOWED_DOMAINS,
    });
  }

  try {
    // リクエストヘッダーを転送用に整形
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      if (!HOP_BY_HOP_HEADERS.has(lowerKey) && value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    // fetch オプション
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers,
    };

    // body がある場合（POST/PUT/PATCH等）
    if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
      if (typeof req.body === 'string') {
        fetchOptions.body = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        fetchOptions.body = req.body;
      } else {
        fetchOptions.body = JSON.stringify(req.body);
      }
    }

    // 転送先へリクエスト
    const response = await fetch(decodedUrl, fetchOptions);

    // レスポンスヘッダーを転送
    res.setHeader('Access-Control-Allow-Origin', '*');
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!HOP_BY_HOP_HEADERS.has(lowerKey)) {
        res.setHeader(key, value);
      }
    });

    // レスポンスボディを転送
    const buffer = await response.arrayBuffer();
    res.status(response.status).send(Buffer.from(buffer));
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(502).json({
      error: 'Proxy request failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

