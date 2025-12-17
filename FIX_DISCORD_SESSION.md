# Discordアクティビティセッション共有問題の修正案

## 問題の概要

Discordで各人がアクティビティを開くと、それぞれ別のセッション（ルーム）が開いてしまい、同じゲームに参加できません。

## 原因分析

### 現在の実装

```typescript:521-525:src/main.tsx
const insertCoinPromise = insertCoin({
    skipLobby: shouldSkipLobby,
    gameId: 'GLWLPW9PB5oKsi0GGQdf',
    discord: false  // 一旦 false に戻してロビー画面を表示
});
```

### 問題点

1. **ルームIDの指定がない**
   - `insertCoin`に`roomId`パラメータが指定されていない
   - PlayroomKitが自動的にルームIDを生成するため、各ユーザーが異なるルームに入る

2. **Discord Activityの共有機能が未使用**
   - Discord SDKの`instanceId`や`channelId`を使用していない
   - 同じDiscordチャンネル/サーバー内で同じルームに参加する仕組みがない

3. **URLパラメータからのルームID取得がない**
   - URLパラメータでルームIDを共有する仕組みがない

## 修正案

### 解決策1: Discord SDKの`instanceId`を使用してルームIDを生成（推奨）

Discord Activityでは、同じアクティビティインスタンス内のユーザーは同じ`instanceId`を持ちます。この`instanceId`を使用してルームIDを生成します。

**修正内容**:

```typescript
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
    debugLog('Parent check failed (expected for iframe)');
  }
  const isDiscordActivity = !!(frameId || instanceId) || parentIsDiscord;
  
  debugLog('Is Discord Activity?', isDiscordActivity);

  // Discord SDKの初期化を非同期で開始
  debugLog('Starting Discord SDK init...');
  const discordSdk = await initDiscordSDK(isDiscordActivity);
  
  if (discordSdk) {
    // Discord情報をPlayroomKitに設定
    setDiscordProfile();
  }

  // PlayroomKitの初期化（非ブロッキング）
  debugLog('Starting PlayroomKit init...');
  
  const shouldSkipLobby = true;
  
  // ルームIDを決定
  let roomId: string | undefined = undefined;
  
  if (isDiscordActivity && instanceId) {
    // Discord Activityの場合、instanceIdを使用してルームIDを生成
    // 同じinstanceIdを持つユーザーは同じルームに入る
    roomId = `discord-${instanceId}`;
    debugLog('Using Discord instanceId as roomId', { instanceId, roomId });
  } else if (isDiscordActivity && discordSdk) {
    // Discord SDKからinstanceIdを取得を試みる
    try {
      const platform = (discordSdk as any).platform;
      if (platform && platform.instanceId) {
        roomId = `discord-${platform.instanceId}`;
        debugLog('Using Discord SDK platform.instanceId as roomId', { instanceId: platform.instanceId, roomId });
      }
    } catch (e) {
      debugLog('Failed to get instanceId from Discord SDK', e);
    }
  }
  
  // URLパラメータからroomIdを取得（手動でルームIDを指定する場合）
  const urlRoomId = urlParams.get('roomId');
  if (urlRoomId) {
    roomId = urlRoomId;
    debugLog('Using roomId from URL parameter', { roomId });
  }
  
  debugLog('Calling insertCoin...', {
    skipLobby: shouldSkipLobby,
    gameId: 'GLWLPW9PB5oKsi0GGQdf',
    discord: false,
    roomId: roomId
  });
  
  const insertCoinPromise = insertCoin({
    skipLobby: shouldSkipLobby,
    gameId: 'GLWLPW9PB5oKsi0GGQdf',
    discord: false,
    roomId: roomId  // ルームIDを指定
  });
  
  // ... 残りのコード
}
```

### 解決策2: Discord SDKの`channelId`を使用（代替案）

DiscordチャンネルIDを使用してルームIDを生成する方法です。同じチャンネル内のユーザーが同じルームに入ります。

```typescript
if (isDiscordActivity && discordSdk) {
  try {
    // Discord SDKからチャンネルIDを取得
    const channelId = await discordSdk.commands.getChannelId();
    if (channelId) {
      roomId = `discord-channel-${channelId}`;
      debugLog('Using Discord channelId as roomId', { channelId, roomId });
    }
  } catch (e) {
    debugLog('Failed to get channelId from Discord SDK', e);
  }
}
```

### 解決策3: URLパラメータでルームIDを共有（手動共有）

Discordのアクティビティ共有機能を使用して、URLパラメータでルームIDを共有する方法です。

```typescript
// URLパラメータからroomIdを取得
const urlRoomId = urlParams.get('roomId');
if (urlRoomId) {
  roomId = urlRoomId;
  debugLog('Using roomId from URL parameter', { roomId });
} else if (isDiscordActivity) {
  // ルームIDが指定されていない場合、新しいルームIDを生成してURLに追加
  // （ただし、これは各ユーザーが異なるIDを生成してしまうため、推奨しない）
  // 代わりに、instanceIdを使用する
}
```

## 推奨実装

**解決策1（instanceId使用）を推奨**します。理由：

1. Discord Activityの標準的な動作に合致
2. 同じアクティビティインスタンス内のユーザーが自動的に同じルームに入る
3. 追加の設定が不要
4. URLパラメータによる手動共有も併用可能

## 実装の詳細

### 修正ファイル

- `src/main.tsx`: `initApp`関数を修正

### 変更点

1. Discord SDKの初期化を`await`で待機
2. `instanceId`をURLパラメータまたはDiscord SDKから取得
3. `instanceId`を使用してルームIDを生成
4. `insertCoin`に`roomId`パラメータを追加

### 注意点

1. **Discord SDKの初期化タイミング**
   - `instanceId`を取得するには、Discord SDKが初期化されている必要がある
   - `initDiscordSDK`を`await`で待機する必要がある

2. **フォールバック処理**
   - `instanceId`が取得できない場合のフォールバック処理が必要
   - URLパラメータからの`roomId`取得も併用可能にする

3. **デバッグログ**
   - ルームIDの決定過程をログに出力して、問題の追跡を容易にする

## テスト項目

修正後、以下のテストを実施してください：

1. **同じDiscordアクティビティインスタンス内の複数ユーザー**
   - 同じアクティビティを開いた複数ユーザーが同じルームに入ることを確認

2. **異なるDiscordアクティビティインスタンス**
   - 異なるアクティビティを開いたユーザーが異なるルームに入ることを確認

3. **URLパラメータによる手動共有**
   - `?roomId=xxx`パラメータでルームIDを指定できることを確認

4. **フォールバック動作**
   - `instanceId`が取得できない場合でも、アプリが正常に動作することを確認

## 参考資料

- [PlayroomKit Documentation](https://playroomkit.com/docs)
- [Discord Embedded App SDK](https://discord.com/developers/docs/game-sdk/sdk-starter-guide)
- [Discord Activity Sharing](https://discord.com/developers/docs/activities)

