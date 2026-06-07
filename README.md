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

### Docker イメージから自分のイメージを作る

CheerpX は OCI を直接は食べないが、**Docker イメージ → 起動可能な ext2 ディスクイメージ**に
変換するツールが WebVM (Leaning Technologies) 側に用意されている。`Dockerfile` で好きな
パッケージを入れたイメージを作り、それを変換して `CloudDevice` で読み込めば、
**任意の中身のブラウザ Linux** が作れる。

```
[Dockerfile / docker image]
   ↓ WebVM のイメージ変換ツール (Dockerfile → ext2)
[xxx.ext2 ディスクイメージ]
   ↓ 自前の静的ホスト / オブジェクトストレージに置く
[CheerpX.CloudDevice.create("https://.../xxx.ext2")]
```

- 例: Ubuntu ベースの Dockerfile を書いて変換すれば、ブラウザの中で Ubuntu が動く
- 詳細は WebVM のドキュメント / リポジトリ (イメージ作成ツール) を参照
- 自前ホストに置く場合も COOP/COEP / CORS と、Range リクエスト対応が必要

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
├ serve.mjs    ← COOP/COEP 付きの最小静的サーバ (Node 標準のみ・依存なし)
└ README.md    ← このファイル
```

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
