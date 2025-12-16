import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { insertCoin } from 'playroomkit'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import './index.css'
import App from './App.tsx'

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
  const urlParams = new URLSearchParams(window.location.search);
  const frameId = urlParams.get('frame_id');
  const instanceId = urlParams.get('instance_id');

  // Discord Activity内で動作しているかチェック
  let parentIsDiscord = false;
  try {
    if (window.parent !== window) {
      parentIsDiscord = window.parent.location.hostname.includes('discord');
    }
  } catch (e) {
    // クロスオリジンでアクセスできない場合は無視
  }
  const isDiscordActivity = !!(frameId || instanceId) || parentIsDiscord;

  // Discord SDKの初期化を非同期で開始（ブロックしない、エラーは静かに処理）
  initDiscordSDK(isDiscordActivity).catch(() => {
    // エラーは完全に無視（ユーザーには表示しない）
  });

  // PlayroomKitの初期化（タイムアウト付き）
  try {
    const insertCoinPromise = insertCoin({
      skipLobby: import.meta.env.MODE === 'development' || !isDiscordActivity,
      gameId: 'QuizGoodLine',
      discord: isDiscordActivity
    });

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('PlayroomKit initialization timeout')), 10000)
    );

    await Promise.race([insertCoinPromise, timeoutPromise]);
  } catch (error) {
    // PlayroomKitの初期化に失敗した場合でもアプリを表示
    if (import.meta.env.MODE === 'development') {
      console.warn('PlayroomKit initialization failed or timed out:', error);
    }
  }

  // Reactアプリのレンダリング（初期化が完了していなくても表示）
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

// 初期化を開始（エラーが発生してもアプリを表示）
initApp().catch((error) => {
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
    } catch (e) {
      // レンダリングも失敗した場合はエラーメッセージを表示
      root.innerHTML = `
        <div style="color: white; padding: 20px; text-align: center;">
          <h2>初期化エラー</h2>
          <p>アプリの初期化中にエラーが発生しました。ページを再読み込みしてください。</p>
        </div>
      `;
    }
  }
});
