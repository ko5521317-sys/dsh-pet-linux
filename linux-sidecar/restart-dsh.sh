#!/bin/sh
# 重启 DSH web（3080）：让新装的 dsh-pet 插件加载客户端
# 用法：sh ~/restart-dsh.sh
echo "停止当前 DSH ..."
pkill -f "dsh --profile web" 2>/dev/null
sleep 2
cd /home/wzy
setsid nohup /home/wzy/.nvm/versions/node/v24.18.1/bin/dsh --profile web \
  --host 127.0.0.1 --port 3080 --no-open \
  --trusted-host localhost --trusted-host RetroFC --trusted-host RetroFC.local \
  --trusted-host 192.168.100.188 --trusted-host 192.168.100.184 --trusted-host 10.147.17.190 \
  >/tmp/dsh-web.out 2>&1 &
sleep 6
for i in 1 2 3 4 5 6 7 8 9 10; do
  code=$(curl -s -m 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/ 2>/dev/null)
  if [ "$code" = "200" ]; then echo "DSH 已重启（HTTP $code），刷新页面即可"; exit 0; fi
  sleep 1
done
echo "没等到 3080，看看 /tmp/dsh-web.out"
