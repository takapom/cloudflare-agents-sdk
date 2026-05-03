# Terraform

このディレクトリには、Cloudflare deploy 用の Terraform コードがあります。

このプロジェクトでは、Terraform から次を行います。

- Vectorize index `support-desk-tickets` の作成
- Vectorize metadata index `status` / `priority` の作成
- `npm run typecheck`
- `npm run deploy`
- workers.dev subdomain の有効化

## 事前準備

Cloudflare API token と account ID を環境変数に設定します。

```bash
export CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
export TF_VAR_cloudflare_account_id="your-cloudflare-account-id"
```

Wrangler でもログイン状態を確認しておきます。

```bash
npx wrangler whoami
```

## 実行場所

Terraform コマンドは `infra` ディレクトリで実行します。

```bash
cd infra
```

## 実装後の確認コマンド

### 1. フォーマット確認

```bash
terraform fmt -check -recursive .
```

Terraform ファイルのフォーマットが標準形式になっているか確認します。

失敗した場合は、次のコマンドで自動整形します。

```bash
terraform fmt -recursive .
```

### 2. 初期化

```bash
terraform init
```

Cloudflare provider など、Terraform 実行に必要な provider を取得します。

初回実行時、または `versions.tf` の provider 設定を変更した時に必要です。

### 3. 構文・設定の検証

```bash
terraform validate
```

Terraform コードの構文、型、provider resource の設定が正しいか確認します。

### 4. 変更内容の確認

```bash
terraform plan
```

Cloudflare に対して何が作成・変更・削除されるかを確認します。

この時点では、まだ実際の変更は反映されません。

### 5. 反映

```bash
terraform apply
```

`plan` の内容を Cloudflare に反映します。

途中で確認が表示されたら、内容を確認して `yes` を入力します。

このプロジェクトでは `terraform apply` の中で `npm run typecheck` と `npm run deploy` も実行されます。

## 最短確認フロー

Terraform コードを変更した後は、まず次を実行します。

```bash
cd infra
terraform fmt -check -recursive .
terraform init
terraform validate
terraform plan
```

問題なければ deploy まで進めます。

```bash
terraform apply
```

## アプリだけ事前確認したい場合

Terraform とは別に、アプリ側だけ確認したい場合はプロジェクトルートで実行します。

```bash
cd ..
npm run typecheck
npm run deploy
```

## よくある注意点

- `CLOUDFLARE_API_TOKEN` と `TF_VAR_cloudflare_account_id` は Git に入れないでください。
- `*.tfvars` は `.gitignore` に入れているため、ローカル用の値を置いても通常は Git 管理されません。
- `.terraform.lock.hcl` は provider version を固定するため、Git 管理対象です。
- `.terraform/` と `terraform.tfstate` は Git 管理しません。
