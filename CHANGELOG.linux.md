# Linux 分支变更记录

## 2026-11-01 本地档：不花 token、截图不出本机

- feat(sidecar): `watch.js` 的"看"拆成两档，`config.json` 的 `visionMode` 切：
  - `local`（默认）：只截**前台窗口那一块** → 本机 OCR 认字 → 本机 4B 模型说一句。
    截图不落盘、不出网；不烧 token。
  - `cloud`：原来的整屏截图 + DeepSeek 视觉（更懂画面，但每张图约 1k 输入 token）。
- feat(sidecar): `ocr.py` —— 认字，优先 RapidOCR（屏幕字更准），退化到 tesseract + 本地
  `chi_sim` 语言包（不需要 sudo 装系统语言包）。
- feat(sidecar): `watch.js --once` —— 只跑一趟"截窗口 → OCR → 模型"并打印结果，用来验收。
- feat(sidecar): 本地模型预热 + 每 4 分钟 keep-alive，避免 ollama 卸载后 3.7s 冷启动。
- feat(sidecar): `visionFallback`（默认关）—— 本地档没话说时是否退回云端；默认关，
  因为游戏画面字少，退回云端等于每一句都在花钱。
- feat(sidecar): `config.example.json`，列出全部可调项与默认值。
- fix(ctl): `fishie-voice-ctl.sh` 改用 pidfile，不再用 `pgrep -f` 模糊匹配
  （它会把调用者自己的命令行也算进去，误判"已经在跑"、误杀 shell）。
- perf: 生成 18~20 tok/s、一句话 1.6s、模型常驻 2.9~3.2 GB（Ryzen AI 9 HX 370，纯 CPU）。

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
