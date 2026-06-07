# cheerpx-base-demo — ブラウザで x86 Linux を動かす最小デモ

[CheerpX](https://cheerpx.io/) (Leaning Technologies 製) を使うと、サーバや Docker、
ネイティブアプリ無しで、**ブラウザの中だけで x86 の Linux (Debian)** が動く。

本リポジトリは「**とりあえずブラウザで Debian を起動する**」ことだけに絞った最小デモ。
COOP/COEP 付きの静的サーバ (`serve.mjs`) で `index.html` を配信し、CheerpX を CDN から
読み込んで Debian のディスクイメージをストリーム起動する。

```
$ uname -a
Linux 4.15.0-54-cheerpx i386 GNU/Linux        # ← ブラウザの中の x86 Debian
$ cat /etc/os-release
PRETTY_NAME="Debian GNU/Linux 10 (buster)"
```

## これは何 (container2wasm との違い)

姉妹プロジェクト [c2w-net-localrelay](https://github.com/NOGUD626/c2w-net-localrelay)
(container2wasm 系) と「ブラウザで Linux」という目的は同じだが、**アプローチが対照的**。

| | c2w (container2wasm) | **CheerpX (本リポジトリ)** |
|---|---|---|
| 方式 | RISC-V を TinyEMU で**エミュレーション** | x86 を **JIT で wasm に変換** |
| カーネル | 本物の Linux カーネル | Linux **syscall 互換レイヤー** |
| 中身 | OCI イメージ → wasm に同梱 | **ext2 ディスクイメージ**を HTTP/wss ストリーム |
| 速度 | 遅い (逐次模倣) | 速い (JIT) |
| 入力単位 | Docker/OCI イメージ | ディスクイメージ (VM 寄り) |

## アーキテクチャ

```
[ブラウザ http://localhost:8080]
  ├ index.html        ← serve.mjs が COOP/COEP 付きで配信
  ├ CheerpX (cx.esm.js)   ← CDN から読み込む x86→wasm JIT エンジン
  │
  ├ ディスクデバイス
  │   ├ CloudDevice   : Debian ext2 を wss でストリーム (全DLせず遅延ロード)
  │   ├ IDBDevice     : ブラウザ内 (IndexedDB) の書き込み層
  │   └ OverlayDevice : 上2つを重ねて読み書き可能に
  │
  └ /bin/bash (x86) を JIT 実行 → <pre> をコンソールとして表示
```

## 前提

| ツール | 用途 | 確認版 |
|---|---|---|
| Node.js | COOP/COEP 付き静的配信 (`serve.mjs`) | v23 |
| ブラウザ | `SharedArrayBuffer` 対応 (Chrome 推奨) | macOS / Chrome |

> CheerpX は WebAssembly なので **ホストの CPU (Intel/Apple Silicon) は問わない**。
> x86 はあくまでゲスト (中身) の話で、ホストは WASM 経由なので ARM Mac でも動く。

## 起動

CheerpX は SharedArrayBuffer を使うため **cross-origin isolation (COOP/COEP) が必須**。
`file://` で直接開くと動かないので、必ず同梱サーバ経由で開く。

```sh
node serve.mjs
# → ブラウザで http://localhost:8080 を開く
```

- 初回は Debian の ext2 を wss でストリーム取得するので起動に少し待つ
  (全部はDLせず、アクセスした部分だけ遅延ロード)
- コンソールをクリックするとキー入力できる
- 書き込みは IndexedDB に overlay されるので、リロードしても一部残る

### 動作確認に使えるコマンド

```sh
uname -a               # i386 cheerpx と出る
cat /etc/os-release    # Debian 10 (buster)
dpkg --version         # apt/dpkg 系 = Debian
python3 --version      # 同梱ツールの確認
```

> ⚠️ 既定ではネットワーク無し。`apt` / `curl` 等のネット必須コマンドは失敗する
> (ネットを使う方法は後述)。

## 他のディストリ / 自分のイメージを使う

ディストリは「**ディスクイメージの中身 (rootfs)**」で決まる。CheerpX エンジン自体は
ディストリ非依存なので、別の ext2 イメージを `index.html` の `CloudDevice.create(...)` の
URL に差し替えれば **Ubuntu や Alpine** にもできる。

```js
// index.html の該当行を差し替えるだけ
const cloud = await CheerpX.CloudDevice.create(
  "wss://disks.webvm.io/debian_large_20230522_5044875331.ext2"  // ← 別イメージの URL に
);
```

### Docker イメージから自分のイメージを作る (✅ 実機検証済み)

CheerpX は OCI を直接は食べないが、**Dockerfile → 起動可能な ext2 ディスクイメージ**に
変換して読み込める。`Dockerfile` で好きな中身を作り、`buildah` でビルド → `mkfs.ext2 -d` で
ext2 化 → `HttpBytesDevice` で読み込めば、**任意の中身のブラウザ Linux** が作れる。

本リポジトリの [`custom.html`](custom.html) がその起動例 (自作 ext2 を `HttpBytesDevice` で読む)。
ビルド用の [`Dockerfile`](Dockerfile) も同梱 (main は Debian 版)。

> **ブランチ**: `main` = Debian buster 版 / **`ubuntu-18.04`** = Ubuntu 18.04 (i386) 版。
> ブランチごとに `Dockerfile` と `custom.html` (ラベル/IDB キー) が切り替わる。

```
[Dockerfile (i386 必須)]
   ↓ buildah build --platform linux/i386
[コンテナイメージ]
   ↓ buildah mount + mkfs.ext2 -d (ディレクトリごと ext2 化)
[custom.ext2]
   ↓ 同一オリジンに置く (serve.mjs は Range / Last-Modified 対応済み)
[CheerpX.HttpBytesDevice.create("/custom.ext2")]
```

#### 実際に動かした手順 (Linux + buildah 環境で)

```sh
# 1) Dockerfile (★ ベースは 32bit x86 = i386 必須)
cat > Dockerfile <<'EOF'
FROM --platform=linux/i386 docker.io/i386/debian:buster
ARG DEBIAN_FRONTEND=noninteractive
RUN echo "deb [trusted=yes] http://archive.debian.org/debian buster main" > /etc/apt/sources.list
RUN apt-get update && apt-get -y install curl figlet
RUN echo "Built via Dockerfile on $(date -u)" > /etc/cheerpx-custom-marker.txt
EOF

# 2) ビルド (x86_64 ホストでも i386 はネイティブ実行できる)
sudo apt-get install -y buildah        # 必要なら
buildah build -f Dockerfile --dns=none --platform linux/i386 -t cheerpximage

# 3) ext2 化 (e2fsprogs 1.43+ の mkfs.ext2 -d が必要)
buildah unshare bash -c '
  buildah from --name c cheerpximage
  mnt=$(buildah mount c)
  mkfs.ext2 -b 4096 -d "$mnt" custom.ext2 600M
  buildah umount c && buildah rm c'

# 4) 中身検証 (マウントせず確認)
debugfs -R "cat /etc/cheerpx-custom-marker.txt" custom.ext2

# 5) custom.ext2 を本リポジトリ直下に置き、serve.mjs 経由で custom.html を開く
```

#### 検証結果 (どちらも実機でブラウザ起動を確認)

| ベース | 結果 | 備考 |
|---|---|---|
| **`i386/debian:buster`** | ✅ 起動 + `apt` で curl/figlet 追加も成功 | apt は `archive.debian.org` で素直に通る。**パッケージを足すなら Debian が扱いやすい** |
| **`i386/ubuntu:bionic`** (18.04) | ✅ 起動 (ベース userland のみ) | Ubuntu の **i386 は 18.04 が上限**。bionic は EOL で apt アーカイブ構成が崩れており (`old-releases` の i386 パスが 404)、パッケージ追加は一手間 |

> **i386 の壁**: CheerpX は 32bit x86 専用。Ubuntu は 18.04 以降 i386 を廃止したので、
> ブラウザで動かせる Ubuntu は実質 18.04 まで。Raspbian など **ARM 系は不可** (別アーキ)。

#### 注意
- `custom.ext2` は大きい (例 600M) ので **`.gitignore` 済み** (リポジトリには入れない)
- 自前ホストに置く場合、`HttpBytesDevice` は **Range + `Last-Modified`/`ETag`** を要求する
  (`serve.mjs` は対応済み)。別オリジンに置くなら COOP/COEP / CORS も必要
- 参考: [Custom disk images (CheerpX Docs)](https://cheerpx.io/docs/guides/custom-images)

## ビルド済みイメージの保全 / 入手 (Releases)

**ベースイメージ (Docker Hub の `i386/debian` ・ `i386/ubuntu`) や apt アーカイブは
将来 pull 不能になりうる**。そうなると Dockerfile からの**再ビルドができなくなる**。
そこで **ビルド済みの ext2 を gzip 圧縮して GitHub Releases に保全**してある
(ext2 は中身がスカスカなので 600M → 数十 MB に圧縮できる)。これは完成品なので、
**ベースイメージが消えても「動かす」のは無傷**(再ビルド不要)。

Releases: <https://github.com/NOGUD626/cheerpx-base-demo/releases/tag/images-v1>

| アセット | 中身 | 圧縮後 |
|---|---|---|
| `custom-debian-buster-i386.ext2.gz` | Debian 10 buster (i386) + curl/figlet + marker | 69M |
| `custom-ubuntu-1804-i386.ext2.gz` | Ubuntu 18.04 LTS (i386) + marker | 26M |

### 入手して起動

```sh
# gh CLI で取得 (または Releases ページから直接 DL)
gh release download images-v1 -R NOGUD626/cheerpx-base-demo

# このブランチ (main) は Debian を使う
gunzip -c custom-debian-buster-i386.ext2.gz > custom.ext2
# (Ubuntu 18.04 を使う場合: gunzip -c custom-ubuntu-1804-i386.ext2.gz > custom.ext2)

node serve.mjs   # → http://localhost:8080/custom.html
```

### sha256 (改ざん検知用)

```
e78ab65f4769fdc79e900adeedb1b73fb36658e3af097068b2f6f01a69f8bdaa  custom-debian-buster-i386.ext2.gz
51066c603bc8bca7c9520bde9e42242a0a8e505f742ef6f5b982e46e29ced1d0  custom-ubuntu-1804-i386.ext2.gz
```

> なお `main` / `ubuntu-18.04` ブランチは削除・force-push 禁止で**保護**してある
> (誤削除防止)。通常の push は可能。

## ネットワークを使う (オプション)

ネット (`apt` 等) を通すには、`index.html` 冒頭で有効化する。CheerpX のゲストネットは
**Tailscale 経由** (WireGuard)。

```js
const ENABLE_NETWORK = true;   // 既定 false
const TS_AUTHKEY = "";         // 事前認証キー (空なら対話ログイン)
const TS_CONTROL_URL = "";     // Headscale 等の自前コントロールプレーンを使う場合のみ
```

### 「届く範囲」の注意
| 宛先 | 必要なもの |
|---|---|
| 同じ tailnet の他機器 (例: VPS の tailnet IP) | tailnet 参加だけで OK |
| 公開インターネット (例: `apt`, `deb.debian.org`) | **exit node が必須** |

ブラウザは生 UDP を使えないため、Tailscale の通信は **DERP 中継 (HTTPS/443)** を経由する
(= 「443 を流れる VPN」)。

## 構成

```
cheerpx-base-demo/
├ index.html   ← CheerpX を CDN から読み込み Debian を起動。ネットは既定オフ
├ custom.html  ← 自作 ext2 (custom.ext2) を HttpBytesDevice で起動する例
├ serve.mjs    ← COOP/COEP + Range + Last-Modified/ETag 対応の静的サーバ (依存なし)
└ README.md    ← このファイル
```

> `custom.ext2` (自作イメージ本体) は大きいので含めない (`.gitignore`)。
> 上記「Docker イメージから作る」手順で各自生成して直下に置く。

## バージョン / 出典

- CheerpX: `https://cxrtnc.leaningtech.com/1.2.8/cx.esm.js` (固定。更新あり)
- Debian イメージ: `wss://disks.webvm.io/debian_large_20230522_5044875331.ext2` (WebVM 公式配布)
- ドキュメント: https://cheerpx.io/docs/getting-started
- WebVM (CheerpX のフル実装例 / Tailscale ネット): https://github.com/leaningtech/webvm

## ハマりどころ

- **真っ白 / SharedArrayBuffer エラー** → `serve.mjs` 経由で開いていない (COOP/COEP 不足)
- **CDN 取得失敗** → プロキシ等で `cxrtnc.leaningtech.com` / `disks.webvm.io` がブロック
- **`apt` が `Temporary failure resolving`** → ネット無効 (既定)。上記でネットを有効化
- **API が変わって動かない** → CDN のバージョンを上げ、`index.html` の `CheerpX.Linux.create`
  まわりを最新ドキュメントに合わせる
