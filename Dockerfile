# custom.ext2 を作るための Dockerfile (main = Debian buster 版)
# ★ CheerpX は 32bit x86 専用なので --platform=linux/i386 必須。
#
# 使い方 (Linux + buildah 環境):
#   buildah build -f Dockerfile --dns=none --platform linux/i386 -t cheerpximage
#   buildah unshare bash -c '
#     buildah from --name c cheerpximage
#     mnt=$(buildah mount c)
#     mkfs.ext2 -b 4096 -d "$mnt" custom.ext2 600M
#     buildah umount c && buildah rm c'
#   # できた custom.ext2 を本リポジトリ直下に置き、serve.mjs 経由で custom.html を開く
#
# Ubuntu 18.04 版は ubuntu-18.04 ブランチを参照。

FROM --platform=linux/i386 docker.io/i386/debian:buster
ARG DEBIAN_FRONTEND=noninteractive
RUN echo "deb [trusted=yes] http://archive.debian.org/debian buster main contrib non-free" > /etc/apt/sources.list \
 && echo "deb [trusted=yes] http://archive.debian.org/debian-security buster/updates main" >> /etc/apt/sources.list
RUN apt-get update && apt-get -y install curl figlet
# このイメージが Dockerfile 由来だと分かるマーカー
RUN echo "Built by cheerpx-base-demo via Dockerfile (Debian buster i386) on $(date -u)" > /etc/cheerpx-custom-marker.txt
