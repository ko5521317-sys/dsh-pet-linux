# Linux 分支变更记录

## 2026-10-31 初始分支（基于 dsh-pet 0.3.8）

- fix(runtime): Linux 上 `setWindowIgnore()` 不再调用 Electron `setIgnoreMouseEvents`
  —— Linux 不支持 `forward` 鼠标转发，穿透后窗口永远收不到鼠标事件（点/右键/拖全废）。
- fix(runtime): DPI 探测子进程补 `--no-sandbox`，避免无 setuid 环境下每次启动
  `FATAL:setuid_sandbox_host` → SIGTRAP 崩溃。
- fix(runtime): Linux 上跳过主进程的 60ms 光标轮询，避免与外部 Input shape 守护进程抢形状。
- feat(sidecar): `shape.py` —— X11 SHAPE 裁剪输入区（只留她身体 + 菜单条）、保活置顶、隐藏任务栏条目。
- feat(sidecar): `watch.js` —— 气泡文字走 edge-tts 念出来；定时截屏 + 视觉模型点评并 broadcast 到气泡；
  解析 `[[删除:…]]` / `[[执行删除]]` 暗号做桌面文件操作。
- feat(sidecar): `fishie-del.js` —— 按 KDE 桌面网格算图标位置，走过去 → 举起来 → `gio trash` → 说话。
- docs: `README.linux.md` 记录每个坑的真因与修法。
