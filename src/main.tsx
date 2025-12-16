import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { insertCoin } from 'playroomkit'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import './index.css'
import App from './App.tsx'

// Discord SDKの初期化（非同期、エラーが発生しても続行）
async function initDiscordSDK(isDiscordActivity: boolean) {
  if (!isDiscordActivity) {
    console.log('Running in non-Discord environment (local development mode)');
    return;
  }

  try {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    if (!clientId) {
      console.warn('VITE_DISCORD_CLIENT_ID is not set - Discord SDK will not initialize');
      return;
    }

    // Discord SDKの初期化（非同期で実行、ブロックしない）
    const discordSdk = new DiscordSDK(clientId);
    console.log('Discord SDK created, initializing...', {
      clientId: clientId.substring(0, 10) + '...',
      url: window.location.href
    });

    // ready()を呼び出す（タイムアウト付き）
    const readyPromise = discordSdk.ready();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Discord SDK ready() timeout after 5s')), 5000)
    );

    await Promise.race([readyPromise, timeoutPromise]);
    
    console.log('Discord SDK is ready!', {
      instanceId: discordSdk.instanceId,
      channelId: discordSdk.channelId,
      guildId: discordSdk.guildId,
      platform: discordSdk.platform
    });

  } catch (error) {
    console.error('Discord SDK initialization failed (non-blocking):', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined
    });
    // エラーが発生してもアプリは続行
    console.warn('App will continue without Discord SDK');
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

  console.log('Environment check:', {
    isDiscordActivity,
    frameId,
    instanceId,
    hostname: window.location.hostname,
    clientId: import.meta.env.VITE_DISCORD_CLIENT_ID ? '***set***' : 'NOT SET'
  });

  // Discord SDKの初期化を非同期で開始（ブロックしない）
  initDiscordSDK(isDiscordActivity).catch(err => {
    console.error('Discord SDK init error (ignored):', err);
  });

  // PlayroomKitの初期化
  console.log('Initializing PlayroomKit...');
  await insertCoin({
    skipLobby: import.meta.env.MODE === 'development' || !isDiscordActivity,
    gameId: 'QuizGoodLine',
    discord: isDiscordActivity
  });
  console.log('PlayroomKit initialized!');

  // Reactアプリのレンダリング（Discord SDKの初期化を待たない）
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

initApp().catch((error) => {
  console.error('App initialization failed:', error);
  // エラー時にユーザーに表示
  document.getElementById('root')!.innerHTML = `
    <div style="color: white; padding: 20px; text-align: center;">
      <h2>読み込みエラー</h2>
      <p>アプリの初期化に失敗しました。</p>
      <pre style="text-align: left; background: #333; padding: 10px; border-radius: 8px; overflow: auto;">${error}</pre>
    </div>
  `;
});
