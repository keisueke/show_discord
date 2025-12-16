import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { insertCoin } from 'playroomkit'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import './index.css'
import App from './App.tsx'

// Discord Activity用の初期化
async function initApp() {
  const urlParams = new URLSearchParams(window.location.search);
  const frameId = urlParams.get('frame_id');
  const instanceId = urlParams.get('instance_id');

  // Discord Activity内で動作しているかチェック
  // - frame_idまたはinstance_idがあればDiscord内
  // - 親ウィンドウがDiscordのウィンドウかチェック（テストモード対応）
  let parentIsDiscord = false;
  try {
    if (window.parent !== window) {
      parentIsDiscord = window.parent.location.hostname.includes('discord');
    }
  } catch (e) {
    // クロスオリジンでアクセスできない場合は無視
  }
  const isDiscordActivity = !!(frameId || instanceId) || parentIsDiscord;

  let parentHostname = 'same';
  try {
    if (window.parent !== window) {
      parentHostname = window.parent.location.hostname;
    }
  } catch (e) {
    parentHostname = 'cross-origin (cannot access)';
  }

  console.log('Environment check:', {
    isDiscordActivity,
    frameId,
    instanceId,
    hostname: window.location.hostname,
    parentHostname,
    clientId: import.meta.env.VITE_DISCORD_CLIENT_ID ? '***set***' : 'NOT SET'
  });

  if (isDiscordActivity) {
    try {
      const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
      if (!clientId) {
        console.error('VITE_DISCORD_CLIENT_ID is not set!');
        console.error('Please set VITE_DISCORD_CLIENT_ID in your .env file');
        throw new Error('Discord Client ID is required');
      }

      // Discord SDKの初期化
      const discordSdk = new DiscordSDK(clientId);
      console.log('Discord SDK created, waiting for ready...');

      // ready()を呼び出すことで、Discordにアプリが準備完了であることを通知
      // これにより、Discord内でアプリが正しく表示されます
      await discordSdk.ready();
      console.log('Discord SDK is ready!', {
        instanceId: discordSdk.instanceId,
        channelId: discordSdk.channelId,
        guildId: discordSdk.guildId,
        platform: discordSdk.platform
      });

    } catch (error) {
      console.error('Discord SDK initialization failed:', error);
      // Discord SDK初期化失敗時もアプリは続行（デバッグ用）
      // ただし、Discord内では画面が表示されない可能性があります
    }
  } else {
    console.log('Running in non-Discord environment (local development mode)');
  }

  // PlayroomKitの初期化
  console.log('Initializing PlayroomKit...');
  await insertCoin({
    skipLobby: import.meta.env.MODE === 'development' || !isDiscordActivity,
    gameId: 'QuizGoodLine',
    discord: isDiscordActivity
  });
  console.log('PlayroomKit initialized!');

  // Reactアプリのレンダリング
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
