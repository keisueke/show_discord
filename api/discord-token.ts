import type { VercelRequest, VercelResponse } from '@vercel/node';

// Discord OAuth2 トークン交換エンドポイント
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight対応
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  const clientId = process.env.VITE_DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI || 'https://discord.com/oauth2/authorize';

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Discord OAuth2 credentials not configured' });
  }

  try {
    // Discord OAuth2 トークンエンドポイントにリクエスト
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Discord token exchange failed:', errorText);
      return res.status(tokenResponse.status).json({ 
        error: 'Failed to exchange authorization code',
        details: errorText 
      });
    }

    const tokenData = await tokenResponse.json();
    
    // アクセストークンを返す
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
    });
  } catch (error) {
    console.error('Error exchanging Discord token:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

