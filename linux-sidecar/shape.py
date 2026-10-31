#!/usr/bin/env python3
"""把 dsh-pet 桌宠窗口的**输入区域**裁成她身体那么大——其余透明区鼠标直接穿到桌面。

为什么需要：Linux 上 Electron 没有 forward 鼠标转发，只能整窗可交互（窗口 = 贴图 + 气泡/物理余量，
比鱼大 2~3 倍，旁边图标点不到）。这里用 X11 SHAPE 扩展把窗口的 Input shape 切成她身体那块矩形，
视觉没变、点击穿透恢复。

用法：./xenv/bin/python shape.py [水平起点比例 水平宽度比例 垂直起点比例 垂直高度比例] [窗口标题片段]
默认：0.10 0.52 0.03 0.70  标题片段 "dsh-pet 桌宠"
"""
import os
import subprocess
import sys
import time

from Xlib import display, X
from Xlib.ext import shape

RATIOS = [0.10, 0.52, 0.03, 0.70]
ARGS = [a for a in sys.argv[1:]]
TITLE = "dsh-pet 桌宠"
if len(ARGS) >= 4:
    try:
        RATIOS = [float(x) for x in ARGS[:4]]
        ARGS = ARGS[4:]
    except ValueError:
        pass
if ARGS:
    TITLE = ARGS[0]

d = display.Display(os.environ.get("DISPLAY", ":0"))
root = d.screen().root


ATOM_NET_WM_NAME = d.intern_atom("_NET_WM_NAME")
ATOM_UTF8 = d.intern_atom("UTF8_STRING")


def window_name(w):
    """Electron 只设 _NET_WM_NAME（UTF-8），get_wm_name() 常常是 None"""
    try:
        p = w.get_full_property(ATOM_NET_WM_NAME, ATOM_UTF8)
        if p and p.value:
            v = p.value
            return v.decode("utf-8", "ignore") if isinstance(v, bytes) else str(v)
    except Exception:
        pass
    try:
        n = w.get_wm_name()
        if isinstance(n, bytes):
            return n.decode("utf-8", "ignore")
        return n
    except Exception:
        return None


def find_windows():
    """用 wmctrl 拿窗口 id（Electron 的 WM_NAME 读不到，id 最靠谱）"""
    out = []
    try:
        txt = subprocess.run(["wmctrl", "-l"], capture_output=True, text=True, timeout=3).stdout
    except Exception:
        return out
    for line in txt.splitlines():
        if TITLE in line:
            try:
                wid = int(line.split()[0], 16)
            except Exception:
                continue
            try:
                w = d.create_resource_object("window", wid)
                if w.get_attributes().map_state == X.IsViewable:
                    out.append(w)
            except Exception:
                continue
    return out


RX, RW, RY, RH = RATIOS
DEBUG = os.environ.get("SHAPE_DEBUG") == "1"
last = {}
RAISED = {}
SKIPPED = {}
LASTDBG = {}
print(f"[shape] 目标窗口包含 “{TITLE}”｜输入区 = x {RX:.2f}+{RW:.2f}, y {RY:.2f}+{RH:.2f}", flush=True)

while True:
    for w in find_windows():
        try:
            g = w.get_geometry()
        except Exception:
            continue
        W, H = g.width, g.height
        if W < 50 or H < 50:
            continue
        # 她的身体（实测窗口内约 x 0.375..0.615, y 0.32..0.65）
        # 实测再往内收 15px（用户觉得边缘还多了一点）
        bx = int(W * 0.355) + 15
        by = int(H * 0.29) + 15
        bw = max(50, int(W * 0.28) - 30)
        bh = max(60, int(H * 0.40) - 30)
        # 菜单：从她右边缘往左压 80px 起一条 150 宽的竖条，覆盖菜单文字区；
        # 这样"多挡的部分"只是她右边一小条，而不是整块菜单区。
        rects = [(bx, by, bw, bh)]
        strip_x = max(0, bx + bw - 80)
        strip_w = max(40, min(W - strip_x, 150))
        strip_y = by
        strip_h = max(40, min(H - strip_y, bh + 70))
        rects.append((strip_x, strip_y, strip_w, strip_h))
        try:
            w.shape_rectangles(shape.SO.Set, shape.SK.Input, 0, 0, 0, rects)
            d.flush()
            key = (W, H, tuple(rects))
            if last.get(w.id) != key:
                last[w.id] = key
                print(f"[shape] win {w.id} {W}x{H} rects {rects}", flush=True)
        except Exception as e:
            print("[shape] 失败:", e, flush=True)
        # 顺手把任务栏里的条目藏掉（Electron 的 skipTaskbar 在这套环境里没生效）
        try:
            now2 = time.time()
            if now2 - SKIPPED.get(w.id, 0) > 5:
                subprocess.run(["wmctrl", "-i", "-r", hex(w.id), "-b", "add,skip_taskbar"],
                               capture_output=True, timeout=3)
                SKIPPED[w.id] = now2
        except Exception:
            pass
        # 顺带保活置顶（Electron 的 alwaysOnTop 在 helper 重启后会丢）
        try:
            now = time.time()
            if now - RAISED.get(w.id, 0) > 2:
                w.configure(stack_mode=X.Above)
                RAISED[w.id] = now
        except Exception:
            pass
    time.sleep(0.2)
