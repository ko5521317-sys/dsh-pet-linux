# dsh-pet-linux 🐾🐧

**dsh-pet 的 Linux 修复分支**——上游（[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)）在 Windows / macOS 上很好用，
但在 Linux 上「点不动、拦鼠标、任务栏多一个 X 图标、每次启动弹一次崩溃框」。这个分支就是把这些坑全填了，并且把配套的
「语音 / 陪看陪玩 / 桌面文件操作」sidecar 一起放进来了。

> 上游版本：`dsh-pet@0.3.8`　基线协议：DSH `0.2.0-rc.2`　License 见 `LICENSE`（与原项目一致）

---

## Linux 上修了什么

| 问题 | 真因 | 修法 |
|---|---|---|
| **完全点不动**（点/右键/拖都没反应，右键弹的是桌面菜单） | 它用 `setIgnoreMouseEvents(true, { forward: true })` 做「点击穿透 + 转发鼠标事件」，而 **`forward` 只有 Windows/macOS 支持**，Linux 上窗口一旦穿透就再也收不到事件 | `runtime/electron-helper/main.js`：Linux 上 `setWindowIgnore()` 直接不再调用 Electron 的 `setIgnoreMouseEvents`（只记账） |
| **鼠标旁边几倍大的区域都点不到桌面图标** | 修掉上一条后只能整窗可交互，而窗口 = 贴图 + 气泡/物理余量，比鱼大 2~3 倍 | 新增 `linux-sidecar/shape.py`：用 **X11 SHAPE 扩展**把窗口的 *Input shape* 裁成她身体那块（+ 一条覆盖右键菜单文字区的竖条） |
| **可点区域一闪一闪** | Electron 每次 `setIgnoreMouseEvents()` 都会把 Input shape **重置回整窗**，与守护进程打架 | 同上：helper 在 Linux 上不再调那个 API，形状只由守护进程维护；守护进程每 200ms 重设一次 |
| **每次启动弹一次「系统程序崩溃」** | DPI 探测子进程用 `execFileSync(process.execPath, [helper…])` 拉起 Electron，**没带 `--no-sandbox`**，无 setuid 环境直接 `FATAL:setuid_sandbox_host` → SIGTRAP | 探测参数补 `--no-sandbox` |
| **任务栏多一个 X 图标** | `skipTaskbar: true` 在部分 KDE 环境下不生效 | 守护进程每 5s 用 `wmctrl -b add,skip_taskbar` 补一次；顺带每 2s 保活置顶 |

## 配套 sidecar（`linux-sidecar/`）

| 文件 | 作用 |
|---|---|
| `shape.py` | **点击区裁剪 + 置顶保活 + 隐藏任务栏条目**。需要 `python-xlib`（`xenv/` 里装好了）。用法：`python shape.py`，可传 `左 宽 上 高`（占窗口比例，默认 `0.10 0.52 0.03 0.70` 是上游旧的宽松值；本仓库实测收紧到 `0.355+x15 / 0.28-30 / 0.29+15 / 0.40-30`） |
| `watch.js` | **让她说话 + 陪看陪玩**：轮询 `/dsh-pet-7340/state` 把她气泡里的字用 edge-tts 念出来；定时截屏 → DeepSeek 视觉 → 用 `/broadcast` 投到她气泡上（游戏 75s / 视频 100s 各最多一句） |
| `fishie-del.js` | **桌面文件操作**：算 KDE 桌面图标坐标 → 让她走过去 → 播「被鼠标拖拽悬空反馈」→ `gio trash`（进回收站，可恢复）→ 说话 |
| `apply-patches.sh` | 如果你仍想用 npm 装的 `dsh-pet`，这个脚本把上述补丁幂等地打进已安装的 `lib/`（上游更新后重跑一次） |
| `restart-dsh.sh` | 重启 `dsh web`（装完插件/改完配置后让客户端重新加载） |

### 指令桥（她听得懂"帮我删掉桌面的 XXX"）

`watch.js` 会解析她话里的两个暗号（人设提示词里约定好）：

- `[[删除:文件名]]` → 记住目标，等确认
- `[[执行删除]]` → 调 `fishie-del.js` 执行「走过去 → 举起来 → 扔进回收站」

---

## 安装（本地版）

```bash
# 1) 放到 DSH profile 的 node_modules（或直接用 apply-patches.sh 打补丁到 npm 已安装版）
cp -r . ~/.dsh/profiles/web/node_modules/dsh-pet

# 2) 起 sidecar（两个都建议开机自启）
python3 -m venv linux-sidecar/xenv && linux-sidecar/xenv/bin/pip install python-xlib
linux-sidecar/xenv/bin/python linux-sidecar/shape.py &
node linux-sidecar/watch.js &

# 3) 重启 DSH 让插件客户端加载
sh linux-sidecar/restart-dsh.sh
```

自启别忘了 `~/.config/autostart/` 里放两个 `.desktop`（见仓库里的示例）。

## 已知限制

- **没有真正的像素级穿透**：Linux 上 Electron 做不到，只能裁矩形。所以「她身体 + 一条菜单区」这两块仍会吃点击，
  想更小改 `shape.py` 的四个数。
- **菜单检测是静态条**：`shape.py` 不是检测"菜单开没开"，而是常驻给她右侧留一条 150px 的竖条覆盖菜单文字区——
  这样菜单永远点得动，代价是那条区域挡点击。
- **`fishie-del.js` 的图标坐标**是按 KDE 桌面配置（`plasma-org.kde.plasma.desktop-appletsrc` 的 `positions`，
  格式是 **`(行, 列)`**）+ 实测网格（112×114，原点 33,90）算的，最左一列因为窗口不能出屏，她会站偏约 80px。
- sidecar 的语音默认 `zh-CN-XiaoyiNeural` + 升 3 半音；需要 edge-tts 的独立 venv（见 `watch.js` 顶部配置）。

## 与上游的关系

本仓库 = 上游 `0.3.8` 的 `lib/`（运行时代码）+ 上面的 Linux 补丁 + `linux-sidecar/`。
**不打算跟随上游更新**：上游改 Linux 相关逻辑时再来挑；需要新功能就手动 merge。
