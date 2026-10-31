#!/bin/sh
# 让 dsh-pet 的桌面版在 Linux 上真正可用（点/右键/拖 + 不弹崩溃框）。
# 原因：Electron 的 setIgnoreMouseEvents(..., {forward:true}) 里的 forward 只有 Windows/macOS 支持；
# Linux 上透明窗一旦"穿透"就再也收不到鼠标事件（点击全落桌面，右键弹的是桌面菜单）。
# 顺带：它的 DPI 探测子进程直接 exec Electron，没带 --no-sandbox，在这台机器上每次都 FATAL → SIGTRAP 崩溃弹窗。
# 插件更新后重跑本脚本。
set -e
M="/home/wzy/.dsh/profiles/web/node_modules/dsh-pet/runtime/electron-helper/main.js"
[ -f "$M" ] || { echo "找不到 $M"; exit 1; }
cp -n "$M" "$M.bak-linuxfix" 2>/dev/null || true
python3 - "$M" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p).read()
if 'linux-fix' in s:
    print('已打过补丁，跳过')
    sys.exit(0)

# 1) DPI 探测子进程带 --no-sandbox
s = s.replace("execFileSync(process.execPath, [__filename, '--dsh-pet-dpi-probe'], opts)",
              "execFileSync(process.execPath, ['--no-sandbox', __filename, '--dsh-pet-dpi-probe'], opts)", 1)

# 2) Linux 上不穿透（整窗可交互）
old_fn = """function setWindowIgnore(win, ignore) {
  win.setIgnoreMouseEvents(ignore, { forward: true });
  windowIgnore.set(win.id, ignore);
}"""
new_fn = """function setWindowIgnore(win, ignore) {
  // [linux-fix] 输入区域交给外部 X11 SHAPE 守护进程（~/.config/fishie-voice/shape.py）；
  // 这里调 setIgnoreMouseEvents 会把 Input shape 设回整窗，形状就会闪。
  if (process.platform === "linux") {
    windowIgnore.set(win.id, false);
    return;
  }
  const opts = { forward: true };
  try { win.setIgnoreMouseEvents(ignore, opts); } catch { try { win.setIgnoreMouseEvents(ignore); } catch {} }
  windowIgnore.set(win.id, ignore);
}"""
s = s.replace(old_fn, new_fn, 1)

# 3) 指针轮询在 Linux 上也别再翻回穿透
old_next = "      const next = decideWindowIgnore(b, point, ignoring, busy, nextMs, inputRegions.get(win.id), mg);"
new_next = """      let next = decideWindowIgnore(b, point, ignoring, busy, nextMs, inputRegions.get(win.id), mg);
      if (process.platform === 'linux') next = false; // 始终可交互"""
assert old_next in s, '轮询代码变了，脚本需要更新'
s = s.replace(old_next, new_next, 1)

open(p, 'w').write(s)
print('patched')
PY
node --check "$M" && echo "语法 OK"
P=$(pgrep -f "electron-helper/main" | head -1) && kill "$P" && echo "已重启桌宠 helper（会自动回来）"
