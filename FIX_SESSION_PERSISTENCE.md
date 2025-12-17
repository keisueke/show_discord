# Discordアクティビティセッション固定化問題の修正案

## 問題の概要

Discordのアクティビティを閉じても、同じ人が開くとセッションが固定化されている可能性があります。これは、`instanceId`のみを使用して`roomId`を生成しているため、同じユーザーが再度アクティビティを開くと、前のセッションに再接続してしまう可能性があります。

## 原因分析

### 現在の実装

```typescript:584-588:src/main.tsx
if (isDiscordActivity && instanceId) {
  // Discord Activityの場合、instanceIdを使用してルームIDを生成
  // 同じinstanceIdを持つユーザーは同じルームに入る
  roomId = `discord-${instanceId}`;
  debugLog('Using Discord instanceId as roomId', { instanceId, roomId });
}
```

### 問題点

1. **`instanceId`のみを使用**
   - `instanceId`はアクティビティインスタンスごとに異なるはずですが、同じユーザーが閉じて開くと、同じ`instanceId`が使われる可能性がある
   - または、ブラウザのキャッシュや状態が原因で、同じ`instanceId`が使われている

2. **セッションの永続化**
   - PlayroomKitのセッションが永続化されている可能性がある
   - アクティビティを閉じても、セッションが残っている

3. **タイムスタンプやランダム値の不足**
   - アクティビティを開くたびに新しいセッションを作成する仕組みがない

## 修正案

### 解決策1: `instanceId`にタイムスタンプを追加（推奨）

`instanceId`に加えて、アクティビティを開いた時刻のタイムスタンプを追加して、毎回新しいセッションを作成します。

**修正内容**:

```typescript
if (isDiscordActivity && instanceId) {
  // Discord Activityの場合、instanceIdとタイムスタンプを使用してルームIDを生成
  // これにより、アクティビティを開くたびに新しいセッションが作成される
  const sessionTimestamp = Date.now();
  roomId = `discord-${instanceId}-${sessionTimestamp}`;
  debugLog('Using Discord instanceId with timestamp as roomId', { instanceId, sessionTimestamp, roomId });
}
```

**メリット**:
- アクティビティを開くたびに新しいセッションが作成される
- 同じアクティビティインスタンス内のユーザーは、同じ`instanceId`とタイムスタンプを持つため、同じルームに入る

**デメリット**:
- 同じアクティビティインスタンス内のユーザーが、異なるタイミングで開くと異なるルームに入る可能性がある

### 解決策2: `instanceId`にランダム値を追加（代替案）

`instanceId`に加えて、ランダムな値を追加して、毎回新しいセッションを作成します。

**修正内容**:

```typescript
if (isDiscordActivity && instanceId) {
  // Discord Activityの場合、instanceIdとランダム値を使用してルームIDを生成
  const randomValue = Math.random().toString(36).substring(2, 15);
  roomId = `discord-${instanceId}-${randomValue}`;
  debugLog('Using Discord instanceId with random value as roomId', { instanceId, randomValue, roomId });
}
```

**メリット**:
- アクティビティを開くたびに新しいセッションが作成される

**デメリット**:
- 同じアクティビティインスタンス内のユーザーが、異なるランダム値を持つため、異なるルームに入る
- セッション共有ができなくなる

### 解決策3: セッション開始時刻を`instanceId`と組み合わせる（推奨）

`instanceId`に加えて、セッション開始時刻（分単位）を追加して、同じ分内に開いたユーザーは同じルームに入るようにします。

**修正内容**:

```typescript
if (isDiscordActivity && instanceId) {
  // Discord Activityの場合、instanceIdとセッション開始時刻（分単位）を使用してルームIDを生成
  // 同じ分内に開いたユーザーは同じルームに入る
  const sessionMinute = Math.floor(Date.now() / 60000); // 分単位のタイムスタンプ
  roomId = `discord-${instanceId}-${sessionMinute}`;
  debugLog('Using Discord instanceId with session minute as roomId', { instanceId, sessionMinute, roomId });
}
```

**メリット**:
- 同じアクティビティインスタンス内のユーザーが、同じ分内に開くと同じルームに入る
- 1分経過すると新しいセッションが作成される

**デメリット**:
- 1分経過すると、新しいセッションが作成されるため、既存のセッションから切断される

### 解決策4: URLパラメータでセッションIDを共有（手動共有）

Discordのアクティビティ共有機能を使用して、URLパラメータでセッションIDを共有する方法です。

**修正内容**:

```typescript
// URLパラメータからsessionIdを取得
const urlSessionId = urlParams.get('sessionId');
if (urlSessionId) {
  // セッションIDが指定されている場合、それを使用
  roomId = `discord-${instanceId}-${urlSessionId}`;
  debugLog('Using sessionId from URL parameter', { instanceId, sessionId: urlSessionId, roomId });
} else if (isDiscordActivity && instanceId) {
  // セッションIDが指定されていない場合、新しいセッションIDを生成
  const sessionId = Math.random().toString(36).substring(2, 15);
  roomId = `discord-${instanceId}-${sessionId}`;
  debugLog('Generated new sessionId', { instanceId, sessionId, roomId });
  
  // URLにセッションIDを追加（他のユーザーと共有するため）
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('sessionId', sessionId);
  window.history.replaceState({}, '', newUrl);
}
```

## 推奨実装

**解決策3（セッション開始時刻を`instanceId`と組み合わせる）を推奨**します。理由：

1. 同じアクティビティインスタンス内のユーザーが、同じ分内に開くと同じルームに入る
2. 1分経過すると新しいセッションが作成されるため、古いセッションが自動的にクリーンアップされる
3. 実装が簡単で、追加の設定が不要

ただし、**解決策1（タイムスタンプを追加）**も検討に値します。理由：

1. アクティビティを開くたびに確実に新しいセッションが作成される
2. セッションの固定化を完全に防ぐことができる

## 実装の詳細

### 修正ファイル

- `src/main.tsx`: `initApp`関数内の`roomId`決定ロジックを修正

### 変更点

1. `instanceId`にタイムスタンプまたはセッション開始時刻を追加
2. デバッグログを追加して、セッションIDの生成過程を追跡

### 注意点

1. **セッション共有のバランス**
   - セッションの固定化を防ぎつつ、同じアクティビティインスタンス内のユーザーが同じルームに入れるようにする
   - タイムスタンプを細かくしすぎると、セッション共有が難しくなる

2. **PlayroomKitのセッション管理**
   - PlayroomKitのセッションがどのように管理されているか確認する必要がある
   - アクティビティを閉じたときに、セッションが自動的にクリーンアップされるか確認

## テスト項目

修正後、以下のテストを実施してください：

1. **同じユーザーがアクティビティを閉じて再度開く**
   - 新しいセッションが作成されることを確認

2. **同じアクティビティインスタンス内の複数ユーザー**
   - 同じ分内に開いたユーザーが同じルームに入ることを確認（解決策3の場合）

3. **異なるタイミングで開いたユーザー**
   - 異なるタイミングで開いたユーザーが異なるルームに入ることを確認

4. **セッションのクリーンアップ**
   - アクティビティを閉じたときに、セッションがクリーンアップされることを確認

