# 他プレイヤーのDiscord情報表示問題の修正案

## 問題の概要

現在、自分のDiscord情報は表示されるが、他のプレイヤーのDiscord情報が表示されません。

## 原因分析

### 現在の実装

1. **プロファイル設定**: `setDiscordProfile()`関数で自分のDiscord情報をPlayroomKitのプロファイルに設定している
2. **UI表示**: `App.tsx`の各コンポーネントで、`window.discordProfile`を自分自身の場合のみ使用している

```typescript:190-197:src/App.tsx
// Discord情報がある場合は優先的に使用（自分自身の場合のみ）
const isMyself = p.id === myself.id;
const discordProfile = isMyself && (window as any).discordProfile ? (window as any).discordProfile : null;
const profile = p.getProfile();
const displayName = discordProfile?.name || profile.name;
const displayColor = discordProfile?.color || profile.color;
const colorHex = displayColor?.hexString || displayColor?.hex || (displayColor as any)?.hex || '#ccc';

// アバター画像を取得（Discord情報またはPlayroomKitプロファイルから）
const avatarUrl = discordProfile?.photo || profile.photo || null;
```

### 問題点

1. **PlayroomKitのプロファイル同期**
   - 各プレイヤーが自分のDiscord情報をPlayroomKitのプロファイルに設定すると、その情報は他のクライアントにも同期される
   - しかし、UIコンポーネントが`window.discordProfile`を自分自身の場合のみ使用しているため、他のプレイヤーのプロファイル情報が正しく表示されない

2. **プロファイル情報の取得方法**
   - `window.discordProfile`は自分自身の情報のみを保持
   - 他のプレイヤーの情報は`p.getProfile()`から取得する必要がある
   - 現在の実装では、`window.discordProfile`が存在しない場合に`profile`をフォールバックとして使用しているが、これは正しい

## 修正案

### 解決策: PlayroomKitのプロファイルを優先的に使用

PlayroomKitのプロファイルは、各プレイヤーが設定した情報を自動的に同期します。UIコンポーネントで、すべてのプレイヤーに対して`p.getProfile()`から取得した情報を優先的に使用するように修正します。

**修正内容**:

1. **UIコンポーネントの修正**
   - `window.discordProfile`は自分自身の場合のみフォールバックとして使用
   - すべてのプレイヤーに対して、PlayroomKitの`getProfile()`から取得した情報を優先的に使用

2. **プロファイル情報の取得順序**
   - まず`p.getProfile()`から取得（他のプレイヤーが設定したDiscord情報が含まれる）
   - 自分自身の場合のみ、`window.discordProfile`をフォールバックとして使用

### 実装の詳細

**修正箇所1: `App.tsx`の`Lobby`コンポーネント**

```typescript
{players.map((p) => {
  // PlayroomKitのプロファイルを優先的に使用（すべてのプレイヤーに対して）
  const profile = p.getProfile();
  
  // 自分自身の場合のみ、window.discordProfileをフォールバックとして使用
  const isMyself = p.id === myself.id;
  const discordProfile = isMyself && (window as any).discordProfile ? (window as any).discordProfile : null;
  
  // プロファイル情報を決定（PlayroomKitのプロファイルを優先）
  const displayName = profile.name || discordProfile?.name || 'Player';
  const displayColor = profile.color || discordProfile?.color;
  const colorHex = displayColor?.hexString || displayColor?.hex || (displayColor as any)?.hex || '#ccc';
  
  // アバター画像を取得（PlayroomKitのプロファイルを優先）
  const avatarUrl = profile.photo || discordProfile?.photo || null;
  
  // ... 残りのコード
})}
```

**修正箇所2: `App.tsx`の`ResultScreen`コンポーネント**

同様の修正を`ResultScreen`コンポーネントにも適用します。

**修正箇所3: `App.tsx`の`RankingScreen`コンポーネント**

同様の修正を`RankingScreen`コンポーネントにも適用します。

## 追加の考慮事項

### PlayroomKitのプロファイル同期の確認

PlayroomKitのプロファイルが正しく同期されているか確認する必要があります。各プレイヤーが自分のDiscord情報をPlayroomKitのプロファイルに設定すると、その情報は自動的に他のクライアントにも同期されるはずです。

### デバッグログの追加

プロファイル情報の取得過程をログに出力して、問題の追跡を容易にします。

```typescript
console.log('[PROFILE]', {
  playerId: p.id,
  isMyself,
  profileName: profile.name,
  profilePhoto: profile.photo,
  discordProfileName: discordProfile?.name,
  discordProfilePhoto: discordProfile?.photo,
  finalName: displayName,
  finalPhoto: avatarUrl
});
```

## テスト項目

修正後、以下のテストを実施してください：

1. **自分のDiscord情報の表示**
   - 自分の名前、アバター、色が正しく表示されることを確認

2. **他のプレイヤーのDiscord情報の表示**
   - 他のプレイヤーの名前、アバター、色が正しく表示されることを確認

3. **プロファイル情報の同期**
   - 新しいプレイヤーが参加したとき、そのプレイヤーのDiscord情報が他のクライアントに正しく表示されることを確認

4. **フォールバック動作**
   - Discord情報が取得できない場合でも、PlayroomKitのデフォルトプロファイルが表示されることを確認

