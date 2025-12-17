# Discord情報がプロファイルに設定されない問題の修正案

## 問題の概要

Discord情報がロビー画面やゲーム中で反映されていません。PlayroomKitのプロファイルにDiscord情報が正しく設定されていない可能性があります。

## 原因分析

### 現在の実装

1. **プロファイル設定の試行**: `setDiscordProfile()`関数で複数の方法を試しているが、PlayroomKitの型定義には`setProfile()`や`updateProfile()`メソッドが存在しない
2. **タイミングの問題**: `setDiscordProfile()`がPlayroomKitの初期化前に呼ばれている可能性がある
3. **APIの問題**: PlayroomKitのプロファイルは読み取り専用で、直接設定できない可能性がある

### 問題点

1. **PlayroomKitのAPI制限**
   - `PlayerState`インターフェースには`getProfile()`メソッドしかない
   - `setProfile()`や`updateProfile()`メソッドが存在しない
   - プロファイルは`insertCoin`のオプションで設定する必要がある可能性がある

2. **タイミングの問題**
   - `setDiscordProfile()`がPlayroomKitの初期化前に呼ばれている
   - PlayroomKitの初期化完了を確実に待つ必要がある

3. **プロキシの問題**
   - `discord: false`に設定されているため、Discord情報が自動的に取得されない
   - 手動でプロファイルを設定する必要がある

## 修正案

### 解決策1: `insertCoin`のオプションでプロファイルを設定（推奨）

PlayroomKitの`insertCoin`のオプションで、プロファイル情報を設定する方法を試します。

**修正内容**:

```typescript
// Discord情報を取得
const discordUser = await getDiscordUser(); // Discordユーザー情報を取得する関数

// insertCoinのオプションでプロファイルを設定
const insertCoinOptions = {
  skipLobby: shouldSkipLobby,
  gameId: 'GLWLPW9PB5oKsi0GGQdf',
  discord: false,
  ...(roomId && { roomCode: roomId }),
  // プロファイル情報を設定（PlayroomKitがサポートしている場合）
  defaultPlayerStates: {
    discordName: discordUser?.username || discordUser?.global_name,
    discordPhoto: discordUser?.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : undefined,
  }
};

const insertCoinPromise = insertCoin(insertCoinOptions);
```

### 解決策2: PlayroomKitの初期化後にプロファイルを設定

PlayroomKitの初期化完了を確実に待ってから、プロファイルを設定します。

**修正内容**:

```typescript
insertCoinPromise.then(async () => {
  clearTimeout(timeoutId);
  debugLog('PlayroomKit initialized successfully');
  
  // PlayroomKit初期化後にDiscordプロファイルを設定
  // 少し待ってから設定（PlayroomKitの内部状態が安定するまで）
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Discord情報を取得して設定
  await setDiscordProfile();
}).catch((error) => {
  // ...
});
```

### 解決策3: PlayroomKitの内部APIを使用

PlayroomKitの内部実装を確認して、正しいAPIを使用します。

**修正内容**:

```typescript
// PlayroomKitの内部APIを確認
const { myPlayer } = await import('playroomkit');
const player = myPlayer();

// プロファイルオブジェクトを直接変更
const profile = player.getProfile();
if (profile && typeof profile === 'object') {
  // プロファイルのプロパティを直接変更
  Object.defineProperty(profile, 'name', {
    value: discordUser.username || discordUser.global_name,
    writable: true,
    configurable: true
  });
  
  if (discordUser.avatar) {
    Object.defineProperty(profile, 'photo', {
      value: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`,
      writable: true,
      configurable: true
    });
  }
  
  // 色を設定
  if (discordUser.accent_color) {
    const hexString = `#${discordUser.accent_color.toString(16).padStart(6, '0')}`;
    const r = parseInt(hexString.slice(1, 3), 16);
    const g = parseInt(hexString.slice(3, 5), 16);
    const b = parseInt(hexString.slice(5, 7), 16);
    const hex = parseInt(hexString.slice(1), 16);
    
    Object.defineProperty(profile, 'color', {
      value: { r, g, b, hexString, hex },
      writable: true,
      configurable: true
    });
  }
}
```

### 解決策4: `insertCoin`のオプションで`discord: true`を設定（プロキシ問題を解決）

プロキシの問題を解決して、`discord: true`を設定することで、Discord情報を自動的に取得します。

**修正内容**:

```typescript
// プロキシ問題を解決した後、discord: trueを設定
const insertCoinOptions = {
  skipLobby: shouldSkipLobby,
  gameId: 'GLWLPW9PB5oKsi0GGQdf',
  discord: true,  // Discord情報を自動的に取得
  ...(roomId && { roomCode: roomId })
};
```

## 推奨実装

**解決策2（PlayroomKitの初期化後にプロファイルを設定）と解決策3（PlayroomKitの内部APIを使用）を組み合わせる**ことを推奨します。

理由：
1. `insertCoin`のオプションでプロファイルを設定する方法が不明確
2. PlayroomKitの初期化完了を確実に待つ必要がある
3. プロファイルオブジェクトを直接変更する方法が最も確実

## 実装の詳細

### 修正ファイル

- `src/main.tsx`: `setDiscordProfile()`関数と`initApp()`関数を修正

### 変更点

1. PlayroomKitの初期化完了を確実に待つ
2. プロファイルオブジェクトを直接変更する方法を使用
3. デバッグログを追加して、プロファイル設定の過程を追跡

## テスト項目

修正後、以下のテストを実施してください：

1. **自分のDiscord情報の表示**
   - 自分の名前、アバター、色が正しく表示されることを確認

2. **他のプレイヤーのDiscord情報の表示**
   - 他のプレイヤーの名前、アバター、色が正しく表示されることを確認

3. **プロファイル情報の同期**
   - 新しいプレイヤーが参加したとき、そのプレイヤーのDiscord情報が他のクライアントに正しく表示されることを確認

4. **タイミングの問題**
   - PlayroomKitの初期化後にプロファイルが正しく設定されることを確認

