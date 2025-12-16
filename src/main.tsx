// StrictModeを一時的に無効化してデバッグ（問題解決後に戻す）
// import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { insertCoin } from 'playroomkit'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import './index.css'
import App from './App.tsx'

// デバッグ用：一時的に常にログを出力（問題解決後に削除）
function debugLog(message: string, data?: any) {
  console.log(`[DEBUG] ${message}`, data || '');
  
  // DOM上にもログを表示（Discord内でも確認可能）
  const debugDiv = document.getElementById('debug-log') || (() => {
    const div = document.createElement('div');
    div.id = 'debug-log';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.9);color:#0f0;padding:10px;font-size:10px;max-height:200px;overflow-y:auto;z-index:9999;font-family:monospace;';
    document.body.appendChild(div);
    return div;
  })();
  
  const time = new Date().toLocaleTimeString();
  debugDiv.innerHTML += `<div>[${time}] ${message} ${data ? JSON.stringify(data).slice(0, 100) : ''}</div>`;
  debugDiv.scrollTop = debugDiv.scrollHeight;
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
    try {
      await discordSdkInstance.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID || '',
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify'],
      });
      debugLog('Discord authorization successful');
    } catch (authError) {
      // 認証エラーは無視（既に認証済みの場合など）
      debugLog('Auth skipped', authError instanceof Error ? authError.message : 'Unknown');
    }

    // Discord SDKからユーザー情報を取得
    // Discord Activity内では、getUser()コマンドを使用してユーザー情報を取得
    let discordUser: any = null;
    
    try {
      // getUser()コマンドを使用（引数なしで現在のユーザー情報を取得）
      const userResult = await discordSdkInstance.commands.getUser({});
      discordUser = userResult;
      debugLog('Discord user from getUser()', { 
        id: discordUser?.id, 
        username: discordUser?.username,
        global_name: discordUser?.global_name 
      });
    } catch (e) {
      debugLog('Failed to get user from getUser()', e instanceof Error ? e.message : 'Unknown');
    }

    // Discord情報をPlayroomKitのプロファイルに設定
    if (discordUser) {
      const profileData: any = {
        name: discordUser.username || discordUser.global_name || 'Discord User',
      };

      // アバターがある場合は設定
      if (discordUser.avatar) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
        profileData.avatar = avatarUrl;
      }

      // 色を設定（DiscordのユーザーIDから生成）
      if (discordUser.accent_color) {
        profileData.color = { hex: `#${discordUser.accent_color.toString(16).padStart(6, '0')}` };
      } else {
        // デフォルトの色を設定（ユーザーIDから生成）
        const colorSeed = parseInt(discordUser.id) % 360;
        profileData.color = { hex: `hsl(${colorSeed}, 70%, 50%)` };
      }

      // PlayroomKitのプロファイルを設定
      // setProfileが存在しない場合は、型アサーションを使用
      if ('setProfile' in player && typeof (player as any).setProfile === 'function') {
        (player as any).setProfile(profileData);
        debugLog('Discord profile set to PlayroomKit', profileData);
      } else {
        debugLog('setProfile method not available on player, trying alternative method');
        // 代替方法: PlayroomKitの内部APIを使用する可能性がある
        // または、discord: true オプションを使用する必要がある
        debugLog('Profile data prepared but not set', profileData);
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
