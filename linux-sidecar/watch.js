#!/usr/bin/env node
/**
 * fishie-voice —— 给 dsh-pet 桌宠加「声音」和「陪看陪玩」。
 *
 * 它做两件事（都是通过 dsh-pet 自己的 HTTP 接口，不改插件内部）：
 *   1. 听她说：轮询 /dsh-pet-7340/state，气泡文字一变就用 edge-tts 念出来（paplay 播放）。
 *   2. 替她看：按间隔截屏 + DeepSeek 视觉模型，看你在玩什么/看什么，评一句，
 *      用 /dsh-pet-7340/broadcast 投到她的气泡上（然后第 1 条会把它念出来）。
 *
 * 配置：~/.config/fishie-voice/config.json（不存在就用默认值）
 * 日志：~/.config/fishie-voice/watch.log
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const CONF_DIR = path.join(HOME, '.config', 'fishie-voice');
const CONF_PATH = path.join(CONF_DIR, 'config.json');
const LOG_PATH = path.join(CONF_DIR, 'watch.log');
const TMP = path.join(CONF_DIR, 'tmp');
fs.mkdirSync(TMP, { recursive: true });

const DEFAULTS = {
  base: 'http://127.0.0.1:3080',
  pet: 'main',
  voice: 'zh-CN-XiaoyiNeural',
  rate: '+6%',
  pitch: 3,
  speak: true,
  watch: true,
  watchIntervalSec: 100,
  gameIntervalSec: 75,
  onlyWhenMedia: true,
  visionModel: 'deepseek-flash',
  ttsPython: path.join(HOME, '.openclaw', 'projects', 'fishgirl', 'pyenv', 'bin', 'python'),
  ttsScript: path.join(HOME, '.openclaw', 'projects', 'fishgirl', 'python', 'tts.py'),
};
function loadConf() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONF_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}
let conf = loadConf();
fs.writeFileSync(CONF_PATH, JSON.stringify(conf, null, 2));

function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}`;
  try {
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch {}
  console.log(line);
}

// ---------------------------------------------------------------- 指令桥（她说暗号，我动手）
const ACTIONS_LOG = path.join(HOME, '.config', 'fishie-voice', 'actions.log');
const DEL_SCRIPT = path.join(HOME, '.openclaw', 'projects', 'fishgirl', 'scripts', 'fishie-del.js');
let pendingDelete = null;

/** 从她说的话里剥掉 [[...]] 标记，返回 { text, del, exec } */
function parseMarkers(raw) {
  let text = String(raw || '');
  let del = null;
  let exec = false;
  const mDel = text.match(/\[\[\s*删除\s*[:：]\s*([^\]]+?)\s*\]\]/);
  if (mDel) {
    del = mDel[1].trim();
    text = text.replace(mDel[0], '').trim();
  }
  if (/\[\[\s*执行删除\s*\]\]/.test(text)) {
    exec = true;
    text = text.replace(/\[\[\s*执行删除\s*\]\]/g, '').trim();
  }
  // 兜底：模型可能把标记写歪，出现类似 [[删掉:xxx]] / [[已确认]] 也认
  const mAlt = text.match(/\[\[\s*(?:删掉|删除文件)\s*[:：]\s*([^\]]+?)\s*\]\]/);
  if (!del && mAlt) {
    del = mAlt[1].trim();
    text = text.replace(mAlt[0], '').trim();
  }
  if (!exec && /\[\[\s*(?:已确认|确认删除|执行)\s*\]\]/.test(text)) {
    exec = true;
    text = text.replace(/\[\[\s*(?:已确认|确认删除|执行)\s*\]\]/g, '').trim();
  }
  return { text, del, exec };
}

function runDelete(name) {
  return new Promise((resolve) => {
    log('执行删除：', name);
    execFile('node', [DEL_SCRIPT, name], { timeout: 60000, env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' } }, (err, stdout, stderr) => {
      if (err) log('删除脚本失败：', (stderr || err.message).toString().slice(0, 200));
      else log('删除脚本完成：', String(stdout).trim().split('\n').slice(-2).join(' | ').slice(0, 160));
      resolve();
    });
  });
}

async function handleSay(text) {
  const { text: clean, del, exec } = parseMarkers(text);
  if (del) {
    pendingDelete = del;
    log('她说要删：', del, '→ 等确认');
  }
  if (clean) speak(clean);
  if (exec && pendingDelete) {
    const target = pendingDelete;
    pendingDelete = null;
    await runDelete(target);
  } else if (exec && !pendingDelete) {
    log('收到执行标记但没有待删目标，忽略');
  }
}

// ---------------------------------------------------------------- 说
let lastSayCounter = 0;
let lastSpoken = '';
let speaking = false;
const ttsQueue = [];

function speak(text) {
  if (!conf.speak || !text) return;
  if (text === lastSpoken) return;
  lastSpoken = text;
  ttsQueue.push(text);
  drainTts();
}
async function drainTts() {
  if (speaking) return;
  const text = ttsQueue.shift();
  if (!text) return;
  speaking = true;
  const out = path.join(TMP, `say-${Date.now()}.mp3`);
  try {
    const args = JSON.stringify({ text, voice: conf.voice, rate: conf.rate, pitch: conf.pitch, out });
    await new Promise((resolve, reject) => {
      execFile(conf.ttsPython, [conf.ttsScript, args], { timeout: 40000 }, (e) => (e ? reject(e) : resolve()));
    });
    await new Promise((resolve) => {
      execFile('paplay', [out], { timeout: 30000 }, () => resolve());
    });
    log('spoke:', text.slice(0, 40));
  } catch (e) {
    log('tts failed', e.message ? e.message.slice(0, 120) : String(e));
  } finally {
    try {
      fs.unlink(out, () => {});
    } catch {}
    speaking = false;
    if (ttsQueue.length) setTimeout(drainTts, 60);
  }
}

// ---------------------------------------------------------------- 看
function activeWindowTitle() {
  return new Promise((resolve) => {
    execFile('xdotool', ['getactivewindow', 'getwindowname'], { timeout: 3000 }, (err, out) => resolve(err ? '' : String(out).trim()));
  });
}
const MEDIA_HINTS = /(哔哩哔哩|bilibili|YouTube|腾讯视频|爱奇艺|优酷|芒果TV|Netflix|番剧|剧场版|电影|纪录片|第[0-9一二三四五六七八九十]+[集话期]|直播|mpv|vlc|celluloid|Kodi|Plex)/i;
const GAME_HINTS = /(Moonlight|Steam|Parsec|Xbox|PlayStation|原神|崩坏|绝区零|鸣潮|艾尔登|黑神话|游戏)/i;

function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const s = fs.readFileSync(path.join(HOME, '.dsh', '.credentials.yaml'), 'utf8');
    const i = s.indexOf('DEEPSEEK_API_KEY');
    if (i >= 0) {
      const m = s.slice(i).match(/DEEPSEEK_API_KEY:\s*(\S+)/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

function grabScreen() {
  return new Promise((resolve) => {
    const out = path.join(TMP, `shot-${Date.now()}.jpg`);
    const args = ['-v', 'error', '-y', '-f', 'x11grab', '-video_size', '1920x1080', '-i', `${process.env.DISPLAY || ':0'}.0`,
      '-frames:v', '1', '-vf', 'scale=1024:-1', '-q:v', '3', out];
    execFile('ffmpeg', args, { timeout: 9000 }, (err) => {
      if (err) return resolve(null);
      try {
        resolve(fs.readFileSync(out));
      } catch {
        resolve(null);
      } finally {
        try {
          fs.unlink(out, () => {});
        } catch {}
      }
    });
  });
}

const recent = [];
async function visionTick() {
  const key = deepseekKey();
  if (!key) return;
  const title = await activeWindowTitle();
  const isGame = GAME_HINTS.test(title);
  const isMedia = MEDIA_HINTS.test(title);
  if (conf.onlyWhenMedia && !isGame && !isMedia) return;
  const shot = await grabScreen();
  if (!shot) return;
  const b64 = shot.toString('base64');
  const avoid = recent.length ? `刚才说过这些，别重复：${recent.map((x) => '「' + x + '」').join('')}` : '';
  const prompt = isGame
    ? `你正坐在主人旁边看他打游戏。当前窗口标题：「${title}」。
先判断情境，从这些标签里挑一个放最前：低血 / 濒死 / 死亡 / 击杀 / 胜利 / BOSS / 打怪 / 探索 / 卡关 / 过场 / 菜单 / 翻车
然后写 8~24 字台词，用「大肥鱼」的口吻，要嗨：短句、口语、带情绪（哎哟、我去、救命、完了完了、牛啊），必须提到画面里的具体东西。
严格格式：标签|台词
${avoid}
没话说就只输出 SKIP。`
    : `你正陪主人看屏幕。当前窗口标题：「${title}」。
用「大肥鱼」的口吻说一句 15~35 字的即时反应（吐槽/惊讶/接话），要具体。
${avoid}
只输出这句话，没话说就输出 SKIP。`;
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: conf.visionModel,
        max_tokens: 160,
        temperature: 1.05,
        thinking: { type: 'disabled' },
        messages: [
          { role: 'system', content: '你是桌面上的Q版蓝发小女仆「大肥鱼」，正在陪主人看屏幕。' },
          { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } }] },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return log('vision http', r.status);
    const j = await r.json();
    let text = (j.choices?.[0]?.message?.content || '').trim();
    if (!text || /^SKIP/i.test(text)) return;
    let tag = '';
    const m = text.match(/^([^|｜]{1,6})[|｜](.+)$/s);
    if (m) {
      tag = m[1].trim();
      text = m[2].trim();
    }
    if (text.length < 2) return;
    recent.push(text);
    while (recent.length > 4) recent.shift();
    log('comment:', tag ? `[${tag}] ` : '', text);
    // 投到她气泡上（她自己的渲染 + 我们的 TTS 都会用上）
    await fetch(`${conf.base}/dsh-pet-7340/broadcast?pet=${encodeURIComponent(conf.pet)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, duration: 12000 }),
      signal: AbortSignal.timeout(8000),
    }).catch((e) => log('broadcast failed', e.message));
  } catch (e) {
    log('vision failed', e.message ? e.message.slice(0, 140) : String(e));
  }
}

// ---------------------------------------------------------------- 主循环
async function pollSay() {
  try {
    const r = await fetch(`${conf.base}/dsh-pet-7340/state?pet=${encodeURIComponent(conf.pet)}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return;
    const j = await r.json();
    const say = j?.pets?.[conf.pet]?.say;
    if (!say || !say.data || !say.data.text) return;
    if (say.counter && say.counter !== lastSayCounter) {
      lastSayCounter = say.counter;
      handleSay(String(say.data.text).trim()).catch((e) => log('handleSay error', e.message));
    }
  } catch {}
}

let lastVisionAt = 0;
let visionBusy = false;
async function maybeVision() {
  if (!conf.watch || visionBusy) return;
  const now = Date.now();
  const title = await activeWindowTitle();
  const isGame = GAME_HINTS.test(title);
  const gap = (isGame ? conf.gameIntervalSec : conf.watchIntervalSec) * 1000;
  if (now - lastVisionAt < gap) return;
  lastVisionAt = now;
  visionBusy = true;
  try {
    await visionTick();
  } finally {
    visionBusy = false;
  }
}

log('fishie-voice started', { speak: conf.speak, watch: conf.watch, voice: conf.voice });
setInterval(pollSay, 700);
setInterval(maybeVision, 15000);
setTimeout(maybeVision, 4000);
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
