#!/bin/sh
# 小鱼的语音/陪看 sidecar 控制：start|stop|restart|status|log
# 用 pidfile 记账，不靠 pgrep 模糊匹配 —— pgrep 会把我自己的命令行也算进去，
# 之前用 pgrep/pkill 误杀过两次 shell，换成 pidfile 就没这毛病了。
PIDF=/home/wzy/.config/fishie-voice/watch.pid
W=/home/wzy/.config/fishie-voice/watch.js
running() {
  [ -f "$PIDF" ] || return 1
  P=$(cat "$PIDF" 2>/dev/null)
  [ -n "$P" ] && [ -d "/proc/$P" ] || return 1
  grep -qa "watch.js" "/proc/$P/cmdline" 2>/dev/null
}
case "$1" in
  start)
    running && { echo "已经在跑 pid=$(cat $PIDF)"; exit 0; }
    setsid nohup node "$W" >>/home/wzy/.config/fishie-voice/out.log 2>&1 </dev/null &
    echo $! > "$PIDF"
    sleep 1
    if running; then echo "已启动 pid=$(cat $PIDF)"; else echo "启动失败，看 out.log"; tail -3 /home/wzy/.config/fishie-voice/out.log; exit 1; fi
    ;;
  stop)
    if running; then
      P=$(cat "$PIDF"); kill "$P" 2>/dev/null; sleep 0.5; kill -9 "$P" 2>/dev/null; echo "已停止 pid=$P"
    else
      echo "没在跑"
    fi
    rm -f "$PIDF"
    ;;
  restart)
    "$0" stop; sleep 1; "$0" start ;;
  status)
    if running; then echo "运行中 pid=$(cat $PIDF)"; else echo "没在跑"; fi
    tail -5 /home/wzy/.config/fishie-voice/watch.log 2>/dev/null ;;
  log)
    tail -f /home/wzy/.config/fishie-voice/watch.log ;;
  *) echo "用法: $0 start|stop|restart|status|log" ;;
esac
