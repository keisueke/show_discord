// StrictModeを一時的に無効化してデバッグ（問題解決後に戻す）
// import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { insertCoin } from 'playroomkit'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import './index.css'
import App from './App.tsx'

// デバッグログの表示状態を管理
let debugLogVisible = false;

// デバッグログの表示/非表示を切り替える関数（グローバルに公開）
declare global {
  interface Window {
    toggleDebugLog?: () => void;
  }
}

window.toggleDebugLog = function() {
  debugLogVisible = !debugLogVisible;
  const debugDiv = document.getElementById('debug-log');
  if (debugDiv) {
    debugDiv.style.display = debugLogVisible ? 'block' : 'none';
  }
};

// デバッグ用：ログを出力（表示状態に応じてDOMに表示）
function debugLog(message: string, data?: any) {
  console.log(`[DEBUG] ${message}`, data || '');
  
  // DOM上にもログを表示（Discord内でも確認可能）
  const debugDiv = document.getElementById('debug-log') || (() => {
    const div = document.createElement('div');
    div.id = 'debug-log';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.9);color:#0f0;padding:10px;font-size:10px;max-height:200px;overflow-y:auto;z-index:9999;font-family:monospace;display:none;';
    document.body.appendChild(div);
    return div;
  })();
  
  // 表示状態に応じてログを追加
  if (debugLogVisible || debugDiv.children.length === 0) {
    const time = new Date().toLocaleTimeString();
    debugDiv.innerHTML += `<div>[${time}] ${message} ${data ? JSON.stringify(data).slice(0, 100) : ''}</div>`;
    debugDiv.scrollTop = debugDiv.scrollHeight;
  }
}

// プロキシURLを変換するヘルパー関数
function convertProxyUrl(url: string): string {
  // /.proxy/https://... 形式を /.proxy?url=... 形式に変換
  if (url.includes('/.proxy/')) {
    const proxyMatch = url.match(/\/.proxy\/(https?:\/\/.+)/);
    if (proxyMatch) {
      const targetUrl = proxyMatch[1];
      const baseUrl = url.substring(0, url.indexOf('/.proxy/'));
      const converted = `${baseUrl}/.proxy?url=${encodeURIComponent(targetUrl)}`;
      if (import.meta.env.MODE === 'development') {
        console.log('[PROXY CONVERTED]', url.slice(0, 80), '→', converted.slice(0, 80));
      }
      return converted;
    }
  }
  return url;
}

// グローバルfetchをインターセプト
const originalFetch = window.fetch;
window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  
  if (import.meta.env.MODE === 'development') {
    console.log('[FETCH]', url.slice(0, 100));
  }
  
  url = convertProxyUrl(url);
  
  return originalFetch.call(window, url, init);
};

// XMLHttpRequestもインターセプト（PlayroomKitが使う可能性がある）
const originalXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
  const urlString = typeof url === 'string' ? url : url.href;
  
  if (import.meta.env.MODE === 'development') {
    console.log('[XHR]', method, urlString.slice(0, 100));
  }
  
  const convertedUrl = convertProxyUrl(urlString);
  
  // 元の関数を呼び出し（引数はそのまま渡す）
  return originalXHROpen.call(this, method, convertedUrl, async ?? true, username ?? null, password ?? null);
};

// Discord SDKの初期化とユーザー情報の取得
let discordSdkInstance: DiscordSDK | null = null;

async function initDiscordSDK(isDiscordActivity: boolean): Promise<DiscordSDK | null> {
  if (!isDiscordActivity) {
    return null;
  }

  try {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    if (!clientId) {
      return null;
    }

    const discordSdk = new DiscordSDK(clientId);

    // ready()を呼び出す（タイムアウト付き）
    const readyPromise = discordSdk.ready();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 3000)
    );

    await Promise.race([readyPromise, timeoutPromise]);
    
    discordSdkInstance = discordSdk;
    debugLog('Discord SDK initialized successfully');
    return discordSdk;

  } catch (error) {
    debugLog('Discord SDK initialization failed', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

// グローバルにDiscord情報を保存（Reactコンポーネントからアクセス可能にする）
declare global {
  interface Window {
    discordProfile?: {
      name: string;
      photo?: string;
      color?: { r: number; g: number; b: number; hexString: string; hex: number } | { hex: string };
    };
  }
}

// Discordユーザー情報を取得してPlayroomKitに設定
async function setDiscordProfile() {
  if (!discordSdkInstance) {
    debugLog('Discord SDK not initialized, skipping profile setup');
    return;
  }

  try {
    // PlayroomKitのmyPlayer()を取得（初期化後である必要がある）
    const { myPlayer } = await import('playroomkit');
    const player = myPlayer();
    
    if (!player) {
      debugLog('PlayroomKit player not available yet, retrying...');
      // 少し待ってから再試行
      setTimeout(() => setDiscordProfile(), 1000);
      return;
    }

    // Discord Activity内では、認証済みのユーザー情報を取得
    // まず認証を試みる（既に認証済みの場合はスキップされる）
    let accessToken: string | null = null;
    let authCode: string | null = null;
    
    try {
      const authResult = await discordSdkInstance.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID || '',
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify'],
      });
      debugLog('Discord authorization successful', { code: authResult?.code ? 'received' : 'none' });
      
      // 認証コードを取得
      if (authResult && 'code' in authResult) {
        authCode = (authResult as any).code;
        debugLog('Authorization code received');
      }
      
      // アクセストークンが直接返される場合（稀なケース）
      if (authResult && 'access_token' in authResult) {
        accessToken = (authResult as any).access_token;
        debugLog('Access token received from authorize');
      }
    } catch (authError) {
      // 認証エラーは無視（既に認証済みの場合など）
      debugLog('Auth skipped', authError instanceof Error ? authError.message : 'Unknown');
    }

    // Discord SDKからユーザー情報を取得
    let discordUser: any = null;
    
    // 方法1: 認証コードをバックエンドでトークンと交換
    if (!accessToken && authCode) {
      try {
        debugLog('Attempting to exchange code for token', { codeLength: authCode.length });
        const tokenResponse = await fetch('/api/discord-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code: authCode }),
        });
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          accessToken = tokenData.access_token;
          debugLog('Access token received from backend exchange');
        } else {
          const errorText = await tokenResponse.text();
          debugLog('Failed to exchange code for token', { 
            status: tokenResponse.status, 
            statusText: tokenResponse.statusText,
            error: errorText 
          });
        }
      } catch (e) {
        debugLog('Failed to exchange code for token', { 
          error: e instanceof Error ? e.message : 'Unknown',
          stack: e instanceof Error ? e.stack : undefined
        });
      }
    }
    
    // 方法2: authenticate()メソッドを使用してアクセストークンを取得（フォールバック）
    if (!accessToken) {
      try {
        const authenticateResult = await discordSdkInstance.commands.authenticate({
          access_token: undefined, // Discord Activity内では自動的に取得される
        });
        if (authenticateResult && 'access_token' in authenticateResult) {
          accessToken = (authenticateResult as any).access_token;
          debugLog('Access token received from authenticate');
        }
      } catch (e) {
        debugLog('Failed to authenticate', e instanceof Error ? e.message : 'Unknown');
      }
    }

    // 方法2: アクセストークンを使用してDiscord APIからユーザー情報を取得
    if (accessToken) {
      try {
        const response = await fetch('https://discord.com/api/v10/users/@me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          discordUser = await response.json();
          debugLog('Discord user from API', { 
            id: discordUser?.id, 
            username: discordUser?.username,
            global_name: discordUser?.global_name
          });
        } else {
          debugLog('Failed to fetch user from Discord API', { status: response.status, statusText: response.statusText });
        }
      } catch (e) {
        debugLog('Failed to fetch user from Discord API', e instanceof Error ? e.message : 'Unknown');
      }
    }

    // 方法3: SDKのplatformからユーザー情報を取得（フォールバック）
    if (!discordUser) {
      try {
        if ((discordSdkInstance as any).platform && (discordSdkInstance as any).platform.user) {
          discordUser = (discordSdkInstance as any).platform.user;
          debugLog('Discord user from platform.user', { 
            id: discordUser?.id, 
            username: discordUser?.username 
          });
        }
      } catch (e) {
        debugLog('Failed to get user from platform.user', e instanceof Error ? e.message : 'Unknown');
      }
    }

    if (!discordUser) {
      debugLog('Discord user information not available via SDK, consider using discord: true option');
    }

    // Discord情報をPlayroomKitのプロファイルに設定
    if (discordUser) {
      // 現在のプロファイルを取得して構造を確認
      const currentProfile = player.getProfile();
      debugLog('Current profile structure', {
        hasName: 'name' in currentProfile,
        hasPhoto: 'photo' in currentProfile,
        hasAvatar: 'avatar' in currentProfile,
        hasColor: 'color' in currentProfile,
        colorType: currentProfile.color ? typeof currentProfile.color : 'none'
      });

      // グローバルにDiscord情報を保存（Reactコンポーネントからアクセス可能にする）
      window.discordProfile = {
        name: discordUser.username || discordUser.global_name || 'Discord User',
      };

      // PlayroomKitのプロファイル構造に合わせてデータを準備
      const profileData: any = {
        name: discordUser.username || discordUser.global_name || 'Discord User',
      };

      // アバターがある場合は設定（PlayroomKitは photo を使用）
      if (discordUser.avatar) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
        profileData.photo = avatarUrl; // PlayroomKitは photo を使用
        window.discordProfile!.photo = avatarUrl; // グローバルにも保存
      }

      // 色を設定（PlayroomKitの形式に合わせる）
      // 現在のプロファイルのcolor構造を確認して、同じ形式で設定
      if (currentProfile.color && typeof currentProfile.color === 'object') {
        // 既存のcolor構造を使用
        if ('hexString' in currentProfile.color) {
          // hexString形式の場合
          if (discordUser.accent_color) {
            const hexString = `#${discordUser.accent_color.toString(16).padStart(6, '0')}`;
            // hexStringからRGBを計算
            const r = parseInt(hexString.slice(1, 3), 16);
            const g = parseInt(hexString.slice(3, 5), 16);
            const b = parseInt(hexString.slice(5, 7), 16);
            const hex = parseInt(hexString.slice(1), 16);
            profileData.color = { r, g, b, hexString, hex };
          } else {
            // ユーザーIDから色を生成
            const colorSeed = parseInt(discordUser.id) % 360;
            // HSLからRGBに変換
            const h = colorSeed / 360;
            const s = 0.7;
            const l = 0.5;
            const c = (1 - Math.abs(2 * l - 1)) * s;
            const x = c * (1 - Math.abs((h * 6) % 2 - 1));
            const m = l - c / 2;
            let r = 0, g = 0, b = 0;
            if (h < 1/6) { r = c; g = x; b = 0; }
            else if (h < 2/6) { r = x; g = c; b = 0; }
            else if (h < 3/6) { r = 0; g = c; b = x; }
            else if (h < 4/6) { r = 0; g = x; b = c; }
            else if (h < 5/6) { r = x; g = 0; b = c; }
            else { r = c; g = 0; b = x; }
            r = Math.round((r + m) * 255);
            g = Math.round((g + m) * 255);
            b = Math.round((b + m) * 255);
            const hexString = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            const hex = parseInt(hexString.slice(1), 16);
            profileData.color = { r, g, b, hexString, hex };
            window.discordProfile!.color = { r, g, b, hexString, hex }; // グローバルにも保存
          }
        } else if ('hex' in currentProfile.color) {
          // シンプルなhex形式の場合
          if (discordUser.accent_color) {
            profileData.color = { hex: `#${discordUser.accent_color.toString(16).padStart(6, '0')}` };
            window.discordProfile!.color = { hex: `#${discordUser.accent_color.toString(16).padStart(6, '0')}` };
          } else {
            const colorSeed = parseInt(discordUser.id) % 360;
            profileData.color = { hex: `hsl(${colorSeed}, 70%, 50%)` };
            window.discordProfile!.color = { hex: `hsl(${colorSeed}, 70%, 50%)` };
          }
        }
      }
      
      debugLog('Discord profile saved to window.discordProfile', window.discordProfile);

      // PlayroomKitのプロファイルを設定
      // 複数の方法を試す
      let profileSet = false;
      
      // 方法1: setProfileメソッドを使用
      if ('setProfile' in player && typeof (player as any).setProfile === 'function') {
        try {
          (player as any).setProfile(profileData);
          debugLog('Discord profile set via setProfile()', profileData);
          profileSet = true;
        } catch (e) {
          debugLog('setProfile() failed', e instanceof Error ? e.message : 'Unknown');
        }
      }
      
      // 方法2: updateProfileメソッドを使用
      if (!profileSet && 'updateProfile' in player && typeof (player as any).updateProfile === 'function') {
        try {
          (player as any).updateProfile(profileData);
          debugLog('Discord profile set via updateProfile()', profileData);
          profileSet = true;
        } catch (e) {
          debugLog('updateProfile() failed', e instanceof Error ? e.message : 'Unknown');
        }
      }
      
      // 方法3: profileプロパティを直接設定
      if (!profileSet && 'profile' in player) {
        try {
          (player as any).profile = profileData;
          debugLog('Discord profile set via direct property assignment', profileData);
          profileSet = true;
        } catch (e) {
          debugLog('Direct profile assignment failed', e instanceof Error ? e.message : 'Unknown');
        }
      }
      
      // 方法4: _profile や内部プロパティを設定
      if (!profileSet) {
        try {
          // PlayroomKitの内部実装を試す
          const playerAny = player as any;
          if (playerAny._profile !== undefined) {
            playerAny._profile = profileData;
            debugLog('Discord profile set via _profile', profileData);
            profileSet = true;
          } else if (playerAny.__profile !== undefined) {
            playerAny.__profile = profileData;
            debugLog('Discord profile set via __profile', profileData);
            profileSet = true;
          }
        } catch (e) {
          debugLog('Internal profile assignment failed', e instanceof Error ? e.message : 'Unknown');
        }
      }
      
      if (!profileSet) {
        // デバッグ情報を取得（ログが長すぎる場合は分割）
        const playerMethods = Object.getOwnPropertyNames(player);
        const playerPrototype = Object.getOwnPropertyNames(Object.getPrototypeOf(player));
        const playerKeys = Object.keys(player);
        
        debugLog('All profile setting methods failed - Player methods', playerMethods.slice(0, 20));
        debugLog('All profile setting methods failed - Player prototype', playerPrototype.slice(0, 20));
        debugLog('All profile setting methods failed - Player keys', playerKeys.slice(0, 20));
        debugLog('All profile setting methods failed - Profile data', profileData);
        
        // 方法5: getProfile()で取得したオブジェクトを直接変更
        try {
          const currentProfile = player.getProfile();
          debugLog('Current profile from getProfile()', currentProfile);
          
          // プロファイルオブジェクトのプロパティを直接変更
          if (currentProfile && typeof currentProfile === 'object') {
            Object.assign(currentProfile, profileData);
            debugLog('Discord profile set via Object.assign to getProfile() result', profileData);
            profileSet = true;
          }
        } catch (e) {
          debugLog('Object.assign to getProfile() failed', e instanceof Error ? e.message : 'Unknown');
        }
        
        if (!profileSet) {
          debugLog('All profile setting methods failed - Final attempt: using setState');
          // 方法6: setStateを使用してプロファイル情報を保存
          try {
            player.setState('discordProfile', profileData);
            debugLog('Discord profile saved to state (may need custom rendering)', profileData);
          } catch (e) {
            debugLog('setState for profile failed', e instanceof Error ? e.message : 'Unknown');
          }
        }
      }
    } else {
      debugLog('Discord user information not available, using default profile');
    }
  } catch (error) {
    debugLog('Failed to set Discord profile', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error && error.stack) {
      debugLog('Error stack', error.stack);
    }
  }
}

// Discord Activity用の初期化
async function initApp() {
  debugLog('App initialization started');
  
  const urlParams = new URLSearchParams(window.location.search);
  const frameId = urlParams.get('frame_id');
  const instanceId = urlParams.get('instance_id');
  
  debugLog('URL params', { frameId, instanceId, url: window.location.href });

  // Discord Activity内で動作しているかチェック
  let parentIsDiscord = false;
  try {
    if (window.parent !== window) {
      parentIsDiscord = window.parent.location.hostname.includes('discord');
    }
  } catch (e) {
    // クロスオリジンでアクセスできない場合は無視
    debugLog('Parent check failed (expected for iframe)');
  }
  const isDiscordActivity = !!(frameId || instanceId) || parentIsDiscord;
  
  debugLog('Is Discord Activity?', isDiscordActivity);

  // Discord SDKの初期化を非同期で開始
  debugLog('Starting Discord SDK init...');
  initDiscordSDK(isDiscordActivity).then((sdk) => {
    if (sdk) {
      // Discord情報をPlayroomKitに設定
      setDiscordProfile();
    }
  }).catch((err) => {
    debugLog('Discord SDK init failed', err?.message);
  });

  // PlayroomKitの初期化（非ブロッキング）
  debugLog('Starting PlayroomKit init...');
  
  // プロキシ問題を回避するため、一旦 discord: false に設定
  // インターセプターが完全に機能するまで待つ
  // skipLobby: true にして、PlayroomKitのロビーUIをスキップ
  // Reactアプリ側のロビー画面を使用
  const shouldSkipLobby = true; // 常にReactアプリ側のロビーを使用
  
  debugLog('Calling insertCoin...', {
    skipLobby: shouldSkipLobby,
    gameId: 'GLWLPW9PB5oKsi0GGQdf',
    discord: false
  });
  
  const insertCoinPromise = insertCoin({
    skipLobby: shouldSkipLobby,
    gameId: 'GLWLPW9PB5oKsi0GGQdf',
    discord: false  // 一旦 false に戻してロビー画面を表示
  });
  
  debugLog('insertCoin called, waiting for promise...');
  
  // タイムアウトを追加して、初期化が完了しない場合を検出
  const timeoutId = setTimeout(() => {
    debugLog('PlayroomKit initialization timeout (10s)', { promise: insertCoinPromise });
  }, 10000);
  
  insertCoinPromise.then(() => {
    clearTimeout(timeoutId);
    debugLog('PlayroomKit initialized successfully');
    // PlayroomKit初期化後にDiscordプロファイルを設定
    setDiscordProfile();
  }).catch((error) => {
    clearTimeout(timeoutId);
    debugLog('PlayroomKit init failed', { 
      message: error instanceof Error ? error.message : 'Unknown',
      error: error,
      stack: error instanceof Error ? error.stack : undefined
    });
  });

  // Reactアプリのレンダリング（初期化が完了していなくても表示）
  debugLog('Rendering React app...');
  const root = document.getElementById('root');
  if (root) {
    try {
      debugLog('Root element found, creating React root...');
      const reactRoot = createRoot(root);
      debugLog('React root created, rendering App component...');
      
      // グローバルエラーハンドラーを設定（Reactエラーを捕捉）
      const originalError = console.error;
      console.error = (...args: any[]) => {
        debugLog('CONSOLE ERROR', args);
        originalError.apply(console, args);
      };
      
      // StrictModeを一時的に無効化してデバッグ（問題解決後に戻す）
      // StrictModeはコンポーネントを2回レンダリングするため、デバッグが困難になる
      // エラーバウンダリーでAppコンポーネントをラップ
      reactRoot.render(
        // <StrictMode>
      <App />
        // </StrictMode>,
      );
      debugLog('React app rendered successfully');
    } catch (error) {
      debugLog('ERROR: React rendering failed', {
        message: error instanceof Error ? error.message : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      });
      root.innerHTML = `
        <div style="color: white; padding: 20px; text-align: center;">
          <h2>レンダリングエラー</h2>
          <p>Reactアプリのレンダリング中にエラーが発生しました。</p>
          <pre style="text-align: left; background: #222; padding: 10px; margin-top: 10px;">${error instanceof Error ? error.message : String(error)}</pre>
        </div>
      `;
    }
  } else {
    debugLog('ERROR: root element not found!');
  }
}

// 初期化を開始（エラーが発生してもアプリを表示）
debugLog('Starting app initialization...');
initApp().catch((error) => {
  debugLog('FATAL ERROR in initApp', error?.message || error);
  // エラーが発生した場合でもアプリを表示
  if (import.meta.env.MODE === 'development') {
    console.error('App initialization error:', error);
  }
  
  const root = document.getElementById('root');
  if (root) {
    // エラーが発生してもアプリを表示しようとする
    try {
      // StrictModeを一時的に無効化してデバッグ（問題解決後に戻す）
      createRoot(root).render(
        // <StrictMode>
          <App />
        // </StrictMode>,
      );
      debugLog('App rendered after error');
    } catch (e) {
      debugLog('FATAL: React render failed', e);
      // レンダリングも失敗した場合はエラーメッセージを表示
      root.innerHTML = `
        <div style="color: white; padding: 20px; text-align: center;">
          <h2>初期化エラー</h2>
          <p>アプリの初期化中にエラーが発生しました。ページを再読み込みしてください。</p>
          <pre style="text-align: left; background: #222; padding: 10px; margin-top: 10px;">${e instanceof Error ? e.message : String(e)}</pre>
        </div>
      `;
    }
  }
});
