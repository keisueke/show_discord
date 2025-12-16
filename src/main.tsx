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

  // Discord Activity内で動作しているかチェック（frame_idまたはinstance_idがあればDiscord内）
  const isDiscordActivity = !!(frameId || instanceId);

  console.log('Environment check:', {
    isDiscordActivity,
    frameId,
    instanceId,
    hostname: window.location.hostname,
    clientId: import.meta.env.VITE_DISCORD_CLIENT_ID
  });

  if (isDiscordActivity) {
    try {
      const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
      if (!clientId) {
        console.error('VITE_DISCORD_CLIENT_ID is not set!');
        throw new Error('Discord Client ID is required');
      }

      // Discord SDKの初期化
      const discordSdk = new DiscordSDK(clientId);
      console.log('Discord SDK created, waiting for ready...');

      await discordSdk.ready();
      console.log('Discord SDK is ready!', {
        instanceId: discordSdk.instanceId,
        channelId: discordSdk.channelId,
        guildId: discordSdk.guildId
      });

    } catch (error) {
      console.error('Discord SDK initialization failed:', error);
      // Discord SDK初期化失敗時もアプリは続行（デバッグ用）
    }
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
