# custom.ext2 を作るための Dockerfile (ubuntu-18.04 ブランチ = Ubuntu 18.04 版)
# ★ CheerpX は 32bit x86 専用なので --platform=linux/i386 必須。
# ★ Ubuntu の i386 は 18.04 (bionic) が上限。bionic は EOL でアーカイブ構成が崩れており
#    apt は通りにくい (old-releases の i386 パスが 404)。そのため apt は使わず、
#    ベースイメージの userland のみで起動確認している。パッケージを足したい場合は
#    動く i386 ミラーを別途探す必要がある。
#
# 使い方 (Linux + buildah 環境):
#   buildah build -f Dockerfile --dns=none --platform linux/i386 -t cheerpxubuntu
#   buildah unshare bash -c '
#     buildah from --name c cheerpxubuntu
#     mnt=$(buildah mount c)
#     mkfs.ext2 -b 4096 -d "$mnt" custom.ext2 600M
#     buildah umount c && buildah rm c'

FROM --platform=linux/i386 docker.io/i386/ubuntu:bionic
# apt は使わない (bionic EOL のため)。ベース userland だけで起動確認。
RUN echo "Built by cheerpx-base-demo via Dockerfile (Ubuntu 18.04 i386) on $(date -u)" > /etc/cheerpx-custom-marker.txt
