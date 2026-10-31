#!/bin/sh
# 推送到你自己的 GitHub 仓库
# 用法：sh linux-sidecar/push.sh git@github.com:<你>/dsh-pet-linux.git
set -e
URL="$1"
[ -n "$URL" ] || { echo "用法: sh push.sh <git-remote-url>"; exit 1; }
cd "$(dirname "$0")/.."
git remote remove origin 2>/dev/null || true
git remote add origin "$URL"
git branch -M main
git push -u origin main
echo "推好了：$URL"
