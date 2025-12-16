# クイズいい線いきましょう！ - 設定・起動ガイド

このドキュメントでは、作成したDiscordアクティビティを実際に動作させるための設定手順を説明します。

## 1. 事前準備
- **Node.js**: v16以上がインストールされていること。
- **Discordアカウント**: 開発者ポータルへのアクセスに必要です。
- **トンネリングツール**: ローカル環境を外部に公開するために `flared` (Cloudflare Tunnel) または `ngrok` が推奨されます。

## 2. Discord Developer Portal での設定

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセスし、**New Application** をクリックして新しいアプリケーションを作成します（例名: `Quiz Good Line`）。
2. 左メニューの **General Information** から **Application ID** (Client ID) をコピーします。
3. プロジェクトの `.env` ファイル（なければ作成）に以下のように記述します：
   ```env
   VITE_DISCORD_CLIENT_ID=あなたのApplication_ID
   ```
   ※ 現在のコードでは `import.meta.env.VITE_DISCORD_CLIENT_ID` を使用しています。

## 3. ローカル開発サーバーの起動

ターミナルで以下のコマンドを実行します。

```bash
npm install
npm run dev
```

通常、`http://localhost:5173` でサーバーが起動します。

## 4. トンネリングの設定 (HTTPS化)

DiscordアクティビティはHTTPS経由で提供される必要があるため、開発中はローカルサーバーを外部公開します。

**Cloudflare Tunnel を使う場合 (推奨):**
```bash
# Mac (Homebrew)
brew install cloudflare/cloudflare/cloudflared

# トンネル起動
cloudflared tunnel --url http://localhost:5173
```
出力されたURL（例: `https://rapid-yours-domain.trycloudflare.com`）をコピーします。

## 5. アクティビティのURL設定

1. Discord Developer Portal に戻り、左メニューの **Activities** (または Embedded App) を選択します。
2. **URL Mappings** セクションを見つけます。
3. **Target URL** に先ほどコピーしたトンネルURL（`https://...`）を入力します。
   - ルートパス `/` に対して設定します。
4. 設定を保存します。

## 6. Discordアプリテストモードの設定（推奨）

Discord Developer Portalの**Test Mode**を使用すると、Discord内で直接アプリをテストできます。

### テストモードの有効化手順

1. Discord Developer Portalで、作成したアプリケーションを選択します。
2. 左メニューの **Activities** (または Embedded App) を選択します。
3. **Test Mode** セクションで、**Enable Test Mode** をオンにします。
4. **Test Mode URL** に、トンネリングで取得したHTTPS URL（例: `https://rapid-yours-domain.trycloudflare.com`）を入力します。
5. 設定を保存します。

### テストモードでの起動方法

1. Discordアプリを開きます（デスクトップアプリまたはブラウザ版）。
2. 任意のサーバーまたはDMで、**アプリを追加**ボタン（または `/` コマンド）を使用します。
3. 作成したアプリケーション名を検索して選択します。
4. アプリがDiscord内のフレームで開き、テストできます。

**注意**: テストモードは開発者本人のみが使用できます。他のユーザーと共有するには、通常の公開モードでデプロイする必要があります。

---

## 7. 動作確認（通常モード）

1. Discord開発者ポータルで生成された **Activity Invite Link** を使用するか、開発サーバーに参加させているボット/アプリ経由でアクティビティを起動します。
2. ボイスチャンネルに参加し、アクティビティランチャー（ロケットアイコン）から作成したアプリを選択して起動します。

---

## 補足: Mockモードについて

現在のプロジェクトは、Discord外のブラウザで開いた場合（`discordSdk.instanceId` がない場合）、自動的にモックモードで動作します。
単にゲームのUIなどを確認したいだけであれば、Discord連携の設定を行わずに `http://localhost:5173` を開くだけで確認可能です。

---

## 8. Vercel へのデプロイについて（推奨）

Vercel を利用してアクティビティをホスティングすることを推奨します。Discord Activities では `/.proxy/*` エンドポイントが必要であり、Vercel の Serverless Functions でこれを実現しています。

### 重要: `/.proxy` エンドポイントについて

Discord Embedded App SDK は、Discord内で動作する際に `/.proxy/*` 経由で Discord API にアクセスします。このプロジェクトでは、Vercel の Serverless Function (`api/proxy.ts`) でこのエンドポイントを実装しています。

- **転送先**: Discord系ドメイン（`discord.com`, `discordapp.com` 等）のみに制限（SSRF防止）
- **設定ファイル**: `vercel.json` で `/.proxy/:path*` → `/api/proxy/:path*` にルーティング

### Vercel デプロイ手順

1. **Vercel にプロジェクトをインポート**:
   - [Vercel Dashboard](https://vercel.com/dashboard) にアクセス
   - 「New Project」→ GitHub リポジトリを選択

2. **環境変数の設定**:
   - Vercel プロジェクトの **Settings** > **Environment Variables** で以下を設定:
     - `VITE_DISCORD_CLIENT_ID`: Discord Application ID

3. **デプロイ**:
   - GitHub にプッシュすると自動デプロイされます
   - または Vercel ダッシュボードから手動デプロイ

4. **Discord Developer Portal の更新**:
   - デプロイされたURL（例: `https://your-app.vercel.app/`）を、**URL Mappings** の Target URL に設定

### 動作確認

デプロイ後、以下のURLにアクセスして `/.proxy` が動作しているか確認できます:
- `https://your-app.vercel.app/.proxy/test` → 404ではなくJSONレスポンスが返れば成功

---

## 9. GitHub Pages へのデプロイについて

**注意**: GitHub Pages は静的ホスティングのため、`/.proxy/*` エンドポイントを実装できません。Discord Activities では Vercel の使用を推奨します。

GitHub Pages を使用する場合は、別途プロキシサーバーを用意する必要があります。

### 設定手順（参考）

1. **`vite.config.ts` の確認**: `base: '/リポジトリ名/'` が設定されていることを確認してください（例: `/show_discord/`）。
2. **デプロイコマンドの実行**:
   ```bash
   npm run deploy
   ```
   このコマンドにより、自動的に `gh-pages` ブランチにビルド成果物がプッシュされます。
3. **GitHub Pages の有効化**:
   - GitHubリポジトリの **Settings** > **Pages** に移動します。
   - Source として `gh-pages` ブランチを選択します。
4. **Discord Developer Portal の更新**:
   - 公開されたページURL（例: `https://username.github.io/show_discord/`）を、**URL Mappings** の Target URL に設定します。

---

## トラブルシューティング

### Discord内で「読み込み中...」のまま止まる

**原因**: `/.proxy/*` が 404 を返している可能性があります。

**確認方法**:
1. ブラウザで `https://your-app.vercel.app/.proxy/test` にアクセス
2. 404 HTML が表示される場合、プロキシが正しく設定されていません

**解決方法**:
- Vercel にデプロイしていることを確認
- `api/proxy.ts` と `vercel.json` がリポジトリに含まれていることを確認
- Vercel で再デプロイ

### `SyntaxError: Unexpected token 'T' ... is not valid JSON`

**原因**: Discord SDK が JSON を期待しているエンドポイントで、HTML（404ページ等）が返されています。

**解決方法**: 上記と同様、`/.proxy/*` の設定を確認してください。
