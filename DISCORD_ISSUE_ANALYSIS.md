# DiscordアクティビティでLobby画面が表示されない原因分析

## 問題の概要

Discordアクティビティ内でゲームを起動すると、Lobby画面が表示されず、黒い画面のままになっています。ローカル環境では正常に動作している可能性がありますが、Discordアクティビティ内では動作しません。

## Discordアクティビティ特有の問題

### 1. iframe環境での実行制約

Discordアクティビティは、iframe内で実行されます。これにより、以下の制約が発生します：

- **DOM操作の制限**: iframe内では、親ウィンドウのDOMにアクセスできません
- **タイミングの問題**: iframeが完全に読み込まれる前にコードが実行される可能性があります
- **エラーの捕捉**: Discord内では開発者ツール（F12）が使えないため、エラーが捕捉されにくい

### 2. React StrictModeによる二重レンダリング

React StrictModeは、開発モードでコンポーネントを2回レンダリングします。これにより：

- 最初のレンダリングで `[APP] Rendering main UI` が出力される
- 2回目のレンダリングでログが上書きされる可能性がある
- しかし、StrictModeを無効化しても問題が解決していないため、これは直接的な原因ではない可能性が高い

### 3. タイミングの問題

ログを見ると、以下の順序で実行されています：

1. `[APP] Rendering main UI - phase: LOBBY, players: 1` ✅ 表示される
2. `[APP] Before return` ❌ 表示されない
3. `[APP] Rendering Lobby component` ❌ 表示されない

これは、`[APP] Rendering main UI` の後、`return` 文の直前のコードが実行されていないことを示しています。

### 4. エラーの発生

Discord内では開発者ツールが使えないため、エラーが捕捉されていません。考えられるエラー：

- `addDebugLog` 関数内でエラーが発生している
- `document.getElementById` や `document.body.appendChild` が失敗している
- Reactのレンダリング中にエラーが発生している

### 5. DOM操作の失敗

`addDebugLog` 関数は、`document.getElementById('debug-log')` でDOM要素を取得し、`innerHTML` でログを追加しています。Discordのiframe環境では：

- `document.body` が完全に読み込まれていない可能性がある
- `document.getElementById` が失敗している可能性がある
- `innerHTML` の操作が制限されている可能性がある

## 最も可能性の高い原因

**`addDebugLog` 関数内でエラーが発生しているが、エラーが捕捉されていない**

`[APP] Rendering main UI` のログは表示されているため、その時点では `addDebugLog` は正常に動作しています。しかし、その後の `addDebugLog` 呼び出しが実行されていないということは：

1. `addDebugLog` 関数内でエラーが発生している
2. エラーハンドリングが不十分で、エラーが捕捉されていない
3. Discordのiframe環境では、DOM操作が制限されている

## 推奨される解決策

### 解決策1: エラーハンドリングの強化

`addDebugLog` 関数内でエラーが発生した場合に、確実にエラーを捕捉し、DOMに直接書き込む：

```typescript
const addDebugLog = (message: string, isError = false) => {
  try {
    // 既存のコード
  } catch (e) {
    // エラーが発生した場合は、直接DOMに書き込む
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:10000;';
    errorDiv.textContent = `ERROR: ${e} - ${message}`;
    document.body.appendChild(errorDiv);
  }
};
```

### 解決策2: DOM操作のタイミングを調整

`addDebugLog` 関数を呼び出す前に、DOMが完全に読み込まれていることを確認する：

```typescript
const addDebugLog = (message: string, isError = false) => {
  // DOMが完全に読み込まれていることを確認
  if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
    // DOMが読み込まれるまで待つ
    window.addEventListener('DOMContentLoaded', () => {
      addDebugLog(message, isError);
    });
    return;
  }
  // 既存のコード
};
```

### 解決策3: ログ出力の方法を変更

`innerHTML` の代わりに、`textContent` や `createElement` を使用する：

```typescript
const addDebugLog = (message: string, isError = false) => {
  let debugDiv = document.getElementById('debug-log');
  if (!debugDiv) {
    debugDiv = document.createElement('div');
    debugDiv.id = 'debug-log';
    debugDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.9);color:#0f0;padding:10px;font-size:10px;max-height:200px;overflow-y:auto;z-index:9999;font-family:monospace;';
    document.body.appendChild(debugDiv);
  }
  
  // innerHTMLの代わりに、createElementを使用
  const logEntry = document.createElement('div');
  logEntry.style.color = isError ? 'red' : '#0f0';
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  debugDiv.appendChild(logEntry);
  debugDiv.scrollTop = debugDiv.scrollHeight;
};
```

### 解決策4: Reactのエラーバウンダリーを追加

Reactコンポーネント内でエラーが発生した場合に、エラーバウンダリーで捕捉する：

```typescript
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // エラーをDOMに直接書き込む
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:10000;';
    errorDiv.textContent = `ERROR: ${error.message}`;
    document.body.appendChild(errorDiv);
  }
  
  render() {
    return this.props.children;
  }
}
```

## 次のステップ

1. エラーハンドリングを強化し、エラーが発生した場合に確実に捕捉する
2. DOM操作のタイミングを調整し、DOMが完全に読み込まれてから操作する
3. ログ出力の方法を変更し、`innerHTML` の代わりに `createElement` を使用する
4. Reactのエラーバウンダリーを追加し、コンポーネント内のエラーを捕捉する

