import { StrictMode } from 'react'
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
    return;
  }

  try {
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
    } catch (authError) {
      // 認証エラーは無視（既に認証済みの場合など）
      debugLog('Auth skipped', authError instanceof Error ? authError.message : 'Unknown');
    }

    // Discord Activity内では、ユーザー情報はURLパラメータやSDKから取得可能
    // ここでは簡易的に、PlayroomKitのプロファイルを手動設定する方法にフォールバック
    // 実際のDiscord情報は、PlayroomKitのdiscord: trueオプションで自動取得される
    
    debugLog('Discord profile setup attempted');
  } catch (error) {
    debugLog('Failed to set Discord profile', error instanceof Error ? error.message : 'Unknown error');
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
  insertCoin({
    skipLobby: import.meta.env.MODE === 'development' || !isDiscordActivity,
    gameId: 'GLWLPW9PB5oKsi0GGQdf',
    discord: false  // 一旦 false に戻してロビー画面を表示
  }).then(() => {
    debugLog('PlayroomKit initialized successfully');
    // PlayroomKit初期化後にDiscordプロファイルを設定
    setDiscordProfile();
  }).catch((error) => {
    debugLog('PlayroomKit init failed', { 
      message: error instanceof Error ? error.message : 'Unknown',
      error: error 
    });
  });

  // Reactアプリのレンダリング（初期化が完了していなくても表示）
  debugLog('Rendering React app...');
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    debugLog('React app rendered successfully');
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
      createRoot(root).render(
        <StrictMode>
          <App />
        </StrictMode>,
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
