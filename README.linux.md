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
| `watch.js` | **让她说话 + 陪看陪玩**：轮询 `/dsh-pet-7340/state` 把她气泡里的字用 edge-tts 念出来；定时看你在玩什么/看什么，评一句，用 `/broadcast` 投到她气泡上（游戏 75s / 视频 100s 各最多一句）。**看有两档**：`visionMode: local`（默认，只截前台窗口 + 本机 OCR + 本机模型，截图不出本机）或 `visionMode: cloud`（整屏截图 → DeepSeek 视觉，更懂画面但花 token） |
| `ocr.py` | **认字**：优先 RapidOCR（对屏幕字准），没装就退化到 tesseract + 本地 `chi_sim` 语言包。`ocr.py <图片>`，输出纯文本 |
| `fishie-del.js` | **桌面文件操作**：算 KDE 桌面图标坐标 → 让她走过去 → 播「被鼠标拖拽悬空反馈」→ `gio trash`（进回收站，可恢复）→ 说话 |
| `install-local.sh` | 一条命令装进 profile：把本仓库的 `lib/`、`runtime/` `rsync --delete` 覆盖到 `~/.dsh/profiles/web/node_modules/dsh-pet/`（先装过 npm 版才有目录） |
| `apply-patches.sh` | 不想覆盖整个 `lib/` 时用这个：把上述补丁幂等地打进 npm 已安装版的 `lib/`（上游更新后重跑一次） |
| `restart-dsh.sh` | 重启 `dsh web`（装完插件/改完配置后让客户端重新加载） |
| `push.sh` | 把本仓库推到自己的 fork（`sh linux-sidecar/push.sh git@github.com:<你>/dsh-pet-linux.git`） |

### 指令桥（她听得懂"帮我删掉桌面的 XXX"）

`watch.js` 会解析她话里的两个暗号（人设提示词里约定好）：

- `[[删除:文件名]]` → 记住目标，等确认
- `[[执行删除]]` → 调 `fishie-del.js` 执行「走过去 → 举起来 → 扔进回收站」

---

## 本地档 / 云端档（不花 token、截图不出本机）

`watch.js` 有两种"看"的方式，靠 `~/.config/fishie-voice/config.json` 里的 `visionMode` 切：

| | `local`（默认） | `cloud` |
|---|---|---|
| 抓什么 | **只有前台窗口那块** | 整屏 1920×1080 |
| 怎么懂 | 本机 OCR 读字 + 本机小模型 | 截图 → DeepSeek 视觉模型 |
| 联网 | 不用 | 要 |
| 钱 | 0 | 每张图 ~1k 输入 token |
| 懂画面吗 | 只能靠屏幕上的**字**（血条、动作这种读不出来） | 真能看懂画面 |
| 实测延迟（Ryzen AI 9 HX 370 / 890M 核显，纯 CPU） | 截 0.2s + 认字 2.2~3.5s + 模型 1.5~2.5s ≈ **4~6s** | 网络往返 1~3s |

```jsonc
{
  "visionMode": "local",          // local | cloud
  "visionFallback": false,        // local 没话说时要不要退回云端（会花钱，默认关）
  "ollama": "http://127.0.0.1:11434",
  "localModel": "qwen3:4b-instruct-2507-q4_K_M",
  "localThreads": 12              // 打游戏嫌抢核就降到 6
}
```

准备（一次性）：

```bash
ollama pull qwen3:4b-instruct-2507-q4_K_M     # 2.4 GB，4B Q4_K_M
~/.config/fishie-voice/xenv/bin/pip install rapidocr-onnxruntime   # 认字（约 120 MB）
# 不想装 rapidocr 就只要 tesseract 的中文包（2.4 MB），放 ~/.config/fishie-voice/tessdata/：
curl -L -o ~/.config/fishie-voice/tessdata/chi_sim.traineddata \
  https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata
```

几个实测数字（同一台机器，`qwen3:4b-instruct-2507-q4_K_M`、Q4_K_M、纯 CPU）：

- 生成 **18~20 tok/s**，一句话（20 来字）端到端 **1.6s**
- 模型常驻内存 **2.9~3.2 GB**（`keep_alive: 30m`；`watch.js` 每 4 分钟摸一下，避免冷启动那 3.7s）
- 3B 是 22 tok/s 但台词明显更空（`好！这本地模型太强了`），4B 才会说（`主人！显存3.2G超猛，106段动作直接起飞～`）
- 核显（ROCm/Vulkan）没接：这套 ollama 只有 CPU + CUDA 后端，要榨核显得自己编 llama.cpp 的 Vulkan 版，大概再快 1.5~2 倍，**不建议为此折腾**

> 为什么不用云端兜底：游戏画面往往是"字很少"的那种，OCR 读不出东西时退回云端 = 打游戏时**每一句都在花 token**，正好把这个功能的意义抵消了。要兜底就显式把 `visionFallback` 打开。

---

## 安装

### 从本仓库装（推荐）

```bash
# 0) 前提：profile 里已经装过一次 dsh-pet（本分支只覆盖它的运行时）
dsh plugin --profile web add dsh-pet

git clone git@github.com:ko5521317-sys/dsh-pet-linux.git
cd dsh-pet-linux

# 1) 覆盖 lib/ 与 runtime/（只动运行时代码，assets 不碰）
sh linux-sidecar/install-local.sh

# 2) sidecar 的 python 依赖（shape.py 要 python-xlib；本地档认字要 rapidocr）
python3 -m venv linux-sidecar/xenv
linux-sidecar/xenv/bin/pip install python-xlib rapidocr-onnxruntime

# 3) 本地档要一个本机小模型（云端档可以跳过这步）
ollama pull qwen3:4b-instruct-2507-q4_K_M

# 4) 起两个 sidecar（建议都做成开机自启）
linux-sidecar/xenv/bin/python linux-sidecar/shape.py &
node linux-sidecar/watch.js &

# 5) 重启 DSH 让插件客户端重新加载
sh linux-sidecar/restart-dsh.sh
```

`watch.js` 的路径、音色、视觉节流、`visionMode` 都在 `~/.config/fishie-voice/config.json`（首次跑起来会自己生成）和文件顶部常量区，改完重启它即可。单独试一次"看"有没有配对：

```bash
node linux-sidecar/watch.js --once     # 只跑一趟：截窗口 → OCR → 模型，把结果打出来就退出
```

自启可以在 `~/.config/autostart/` 放两个 `.desktop`，`Exec` 里 `sleep 25` 等 DSH 起来。

### 手动版（等价）

```bash
cp -r . ~/.dsh/profiles/web/node_modules/dsh-pet
python3 -m venv linux-sidecar/xenv
linux-sidecar/xenv/bin/pip install python-xlib rapidocr-onnxruntime
linux-sidecar/xenv/bin/python linux-sidecar/shape.py &
node linux-sidecar/watch.js &
sh linux-sidecar/restart-dsh.sh
```

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

## 踩坑：`git push` 报 `Connection closed by ... port 22`

国内网络对 GitHub 的 22 端口时通时断（`Permission denied (publickey)` 也可能是它伪装出来的）。
走 443 就好，`~/.ssh/config` 加一段：

```
Host github.com
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes
```

先用 `ssh -T -p 443 git@ssh.github.com` 验证能通（回 `Hi <用户名>!` 才对），再 `git push`。
