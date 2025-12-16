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

## 6. 動作確認

1. Discord開発者ポータルで生成された **Activity Invite Link** を使用するか、開発サーバーに参加させているボット/アプリ経由でアクティビティを起動します。
2. ボイスチャンネルに参加し、アクティビティランチャー（ロケットアイコン）から作成したアプリを選択して起動します。

---

## 補足: Mockモードについて

現在のプロジェクトは、Discord外のブラウザで開いた場合（`discordSdk.instanceId` がない場合）、自動的にモックモードで動作します。
単にゲームのUIなどを確認したいだけであれば、Discord連携の設定を行わずに `http://localhost:5173` を開くだけで確認可能です。

---

## 7. GitHub Pages へのデプロイについて

GitHub Pages を利用してアクティビティをホスティングすることが可能です。

### 設定手順

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
