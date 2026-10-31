#!/usr/bin/env node
/**
 * fishie-del —— 让桌宠「走过去、拿起来、丢进垃圾箱」。
 *
 * 用法：
 *   node fishie-del.js "桌面上的文件名片段"
 *   node fishie-del.js --list          # 列出桌面上能被删的东西
 *   node fishie-del.js --dry "xxx"     # 只演示动作，不真删
 *
 * 流程：按 KDE 桌面网格算出图标大概位置 → 让宠物走/瞬移过去 →
 *       播「被鼠标拖拽悬空反馈」（当作举起来）→ 气泡说话 → gio trash（进回收站，可恢复）→ 播开心跃动。
 *
 * 注意：图标坐标是按 plasma 的网格 + 标定常数估的，可能差一两个图标位；删除本身是真的（进回收站）。
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const BASE = process.env.FISHIE_BASE || 'http://127.0.0.1:3080';
const PET = process.env.FISHIE_PET || 'main';
const DESKTOP = path.join(HOME, '桌面');
const PLASMA = path.join(HOME, '.config', 'plasma-org.kde.plasma.desktop-appletsrc');
const LOG = path.join(HOME, '.config', 'fishie-voice', 'actions.log');

// 标定常数（1920x1080 主屏；实测：列间距 112、行间距 114、原点 33,90）
// ⚠️ KDE 存的网格是 (行, 列)，不是 (x, y)
const CELL_X = 112;
const CELL_Y = 114;
const ORIGIN_X = 33;
const ORIGIN_Y = 90;
const ICON_DX = 23;   // 图标中心相对格子原点的偏移
const ICON_DY = -20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`;
  try {
    fs.appendFileSync(LOG, line + '\n');
  } catch {}
  console.log(line);
}
async function post(rest, body, surface = 'desktop') {
  const url = `${BASE}/dsh-pet-7340/${rest}?pet=${encodeURIComponent(PET)}&surface=${surface}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return await r.json().catch(() => ({}));
  } catch (e) {
    log('POST', rest, 'failed:', e.message);
    return {};
  }
}
const say = (text, duration = 8000) => post('broadcast', { text, duration });
const play = (name) => post('anim', { name });
const SCREEN_W = 1920;
const SCREEN_H = 1080;
const WIN_W = 520;
const WIN_H = 418;
/** 屏幕像素 → /position 需要的 0..1 比例（窗口左上角落点） */
function toRatio(px, py) {
  const rx = Math.max(0, Math.min(1, px / Math.max(1, SCREEN_W - WIN_W)));
  const ry = Math.max(0, Math.min(1, py / Math.max(1, SCREEN_H - WIN_H)));
  return { rx, ry };
}
const moveTo = (px, py, mode = 'instant') => {
  const { rx, ry } = toRatio(px, py);
  log(`移动到屏幕 (${Math.round(px)},${Math.round(py)}) = 比例 (${rx.toFixed(3)},${ry.toFixed(3)})`);
  return post('position', { x: rx, y: ry, mode, duration: 1200 });
};

/** 从 plasma 配置里读桌面图标的网格坐标 */
function iconGrids() {
  try {
    const s = fs.readFileSync(PLASMA, 'utf8');
    const m = s.match(/positions=\{"\d+x\d+":\[(.*?)\]\}/s);
    if (!m) return {};
    const items = m[1].split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
    const out = {};
    for (let i = 0; i + 2 < items.length; i += 3) {
      const gx = Number(items[i]);
      const gy = Number(items[i + 1]);
      const url = items[i + 2] || '';
      const name = decodeURIComponent(url.replace(/^desktop:\/?/, '')).trim();
      if (name) out[name] = { gx, gy };
    }
    return out;
  } catch {
    return {};
  }
}

function desktopEntries() {
  try {
    return fs.readdirSync(DESKTOP, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() }));
  } catch {
    return [];
  }
}

function pickFuzzy(entries, q) {
  const needle = q.toLowerCase().replace(/\s+/g, '');
  const scored = [];
  for (const e of entries) {
    const n = e.name.toLowerCase().replace(/\s+/g, '');
    if (!n.includes(needle) && !needle.includes(n)) continue;
    // 越接近越好
    scored.push({ ...e, score: Math.abs(n.length - needle.length) - (n.startsWith(needle) ? 10 : 0) });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored;
}

function iconScreenPos(name) {
  const g = iconGrids()[name] || iconGrids()[name + '.desktop'];
  if (!g) return null;
  // gx = 行，gy = 列
  return { x: ORIGIN_X + g.gy * CELL_X + ICON_DX, y: ORIGIN_Y + g.gx * CELL_Y + ICON_DY };
}

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const listOnly = args.includes('--list');
  const query = args.filter((a) => !a.startsWith('--')).join(' ').trim();
  const entries = desktopEntries();

  if (listOnly) {
    const grid = iconGrids();
    for (const e of entries) {
      const p = iconScreenPos(e.name);
      console.log(`${e.dir ? '[目录]' : '[文件]'} ${e.name}${grid[e.name] ? `  (行${grid[e.name].gx},列${grid[e.name].gy}) → 屏幕(${p.x},${p.y})` : '  (无图标坐标)'}`);
    }
    return;
  }
  if (!query) {
    console.error('用法: node fishie-del.js "文件名片段"   |  --list   |  --dry "xxx"');
    process.exit(2);
  }

  const hits = pickFuzzy(entries, query);
  if (!hits.length) {
    log('没找到匹配：', query);
    await say(`桌面上没找到「${query}」呀，是不是名字记错了？`, 6000);
    process.exit(1);
  }
  const target = hits[0];
  const full = path.join(DESKTOP, target.name);
  let pos = iconScreenPos(target.name) || { x: 900, y: 500 };
  // 夹进屏幕（KDE 的网格值不一定落在可见区，新图标尤其靠下）
  const W = 1920, H = 1080, WIN_W = 520, WIN_H = 418;
  if (!Number.isFinite(pos.x) || pos.x < 0 || pos.x > W - WIN_W || pos.y < 0 || pos.y > H - WIN_H) {
    log('网格位置在屏幕外，退到图标区的可见位置');
    pos = { x: 120, y: 520 };
  }
  log(`目标：${target.name} ${target.dir ? '(目录)' : ''} 屏幕位置约 (${pos.x},${pos.y})`);

  // 1) 走过去（窗口左上角 = 图标左下再往左一点，让她"站在"图标旁）
  // 她的贴图在窗口里偏右下：实测窗口 (0,292) 时她站在 (250,420)，偏移 (+250,+128)
  await moveTo(Math.max(0, Math.round(pos.x - 250)), Math.max(0, Math.round(pos.y - 128)), 'instant');
  await sleep(900);
  // 2) 举起来
  await play('被鼠标拖拽悬空反馈');
  await say(`这个「${target.name}」不要了吧？我扔啦～`, 5000);
  await sleep(1800);

  if (!dry) {
    // 3) 进回收站（可恢复）
    await new Promise((resolve) => {
      execFile('gio', ['trash', full], { timeout: 15000 }, (err, _o, stderr) => {
        if (err) log('gio trash 失败：', (stderr || err.message).toString().slice(0, 200));
        else log('已进回收站：', target.name);
        resolve();
      });
    });
  } else {
    log('dry run：没有真的删');
  }

  // 4) 开心 + 报一句
  await play('点击回应-开心跃动');
  await say(dry ? `（试运行）要是真删，我这就把它丢进垃圾箱了～` : `扔进垃圾箱啦！要反悔的话去回收站捞它。`, 8000);
})();
