import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { insertCoin } from 'playroomkit'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import './index.css'
import App from './App.tsx'

// デバッグ用：エラーログをコンソールとDOMに出力
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

// グローバルfetchをインターセプトして、/.proxy/ リクエストを /.proxy?url= 形式に変換
const originalFetch = window.fetch;
window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  
  // すべてのfetchをログに出力（デバッグ用）
  console.log('[FETCH]', url.slice(0, 100));
  
  // /.proxy/https://... 形式を /.proxy?url=... 形式に変換
  if (url.includes('/.proxy/')) {
    const proxyMatch = url.match(/\/.proxy\/(https?:\/\/.+)/);
    if (proxyMatch) {
      const targetUrl = proxyMatch[1];
      const baseUrl = url.substring(0, url.indexOf('/.proxy/'));
      url = `${baseUrl}/.proxy?url=${encodeURIComponent(targetUrl)}`;
      console.log('[FETCH CONVERTED]', url.slice(0, 100));
      
      // debugLogは後で定義されるので、ここでは使わない
      setTimeout(() => {
        try {
          debugLog('Fetch intercepted', { original: proxyMatch[0].slice(0, 50), converted: url.slice(0, 80) });
        } catch (e) {
          // debugLogがまだ定義されていない場合は無視
        }
      }, 0);
    }
  }
  
  return originalFetch.call(window, url, init);
};

// Discord SDKの初期化（非同期、エラーが発生しても続行、エラーは静かに処理）
async function initDiscordSDK(isDiscordActivity: boolean) {
  if (!isDiscordActivity) {
    return;
  }

  try {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    if (!clientId) {
      // 環境変数が設定されていない場合は静かにスキップ
      return;
    }

    // Discord SDKの初期化（非同期で実行、ブロックしない）
    const discordSdk = new DiscordSDK(clientId);

    // ready()を呼び出す（タイムアウト付き、エラーは静かに処理）
    const readyPromise = discordSdk.ready();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 3000)
    );

    await Promise.race([readyPromise, timeoutPromise]);
    
    // 成功時のみログ出力
    console.log('Discord SDK initialized successfully');

  } catch (error) {
    // エラーは完全に抑制（ユーザーには表示しない）
    // Discord SDKの初期化に失敗してもアプリは正常に動作する
    // 開発時のみコンソールに出力（本番環境では出力しない）
    if (import.meta.env.MODE === 'development') {
      console.debug('Discord SDK initialization skipped:', error instanceof Error ? error.message : 'Unknown error');
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

  // Discord SDKの初期化を非同期で開始（ブロックしない、エラーは静かに処理）
  debugLog('Starting Discord SDK init...');
  initDiscordSDK(isDiscordActivity).catch((err) => {
    debugLog('Discord SDK init failed', err?.message);
  });

  // PlayroomKitの初期化（非ブロッキング）
  debugLog('Starting PlayroomKit init...', { 
    skipLobby: import.meta.env.MODE === 'development' || !isDiscordActivity,
    gameId: 'GLWLPW9PB5oKsi0GGQdf',
    discord: false
  });
  
  const insertCoinPromise = insertCoin({
    skipLobby: import.meta.env.MODE === 'development' || !isDiscordActivity,
    gameId: 'GLWLPW9PB5oKsi0GGQdf',
    discord: false  // プロキシ問題を回避するため一時的にfalse
  });
  
  // 初期化の進行状況を監視
  insertCoinPromise.then((result) => {
    debugLog('PlayroomKit initialized successfully', result);
  }).catch((error) => {
    debugLog('PlayroomKit init failed', { 
      message: error instanceof Error ? error.message : 'Unknown',
      error: error 
    });
    // PlayroomKitの初期化に失敗した場合でもアプリは動作する
    if (import.meta.env.MODE === 'development') {
      console.warn('PlayroomKit initialization failed:', error);
    }
  });
  
  // 5秒後に状態を確認
  setTimeout(() => {
    debugLog('PlayroomKit status check', { 
      promiseState: insertCoinPromise 
    });
  }, 5000);

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
