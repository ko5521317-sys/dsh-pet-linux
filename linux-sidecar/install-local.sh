#!/bin/sh
# 把本仓库装进 DSH profile（覆盖 npm 版），并启动两个 sidecar
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/.dsh/profiles/web/node_modules/dsh-pet"
echo "仓库: $REPO"
echo "目标: $DEST"
[ -d "$DEST" ] || { echo "找不到 $DEST（先装一次 dsh-pet 插件）"; exit 1; }
# 只覆盖运行时代码与补丁，避免动 assets
rsync -a --delete "$REPO/lib/" "$DEST/lib/"
rsync -a --delete "$REPO/runtime/" "$DEST/runtime/"
cp "$REPO/cordis.patch.yml" "$DEST/cordis.patch.yml" 2>/dev/null || true
echo "已覆盖 lib/ 与 runtime/"
chmod +x "$REPO/linux-sidecar/shape.py" 2>/dev/null || true
echo "下一步: sh $REPO/linux-sidecar/restart-dsh.sh"
