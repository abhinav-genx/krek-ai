// Shell snippets run inside the E2B sandbox (Debian 13, passwordless sudo) to
// run a headless Chromium as an interactive "virtual browser". Instead of
// screen-sharing an X display over VNC/noVNC, we drive a headless Chromium
// through the Chrome DevTools Protocol (CDP): a tiny dependency-free Node server
// streams the page via Page.startScreencast and forwards mouse/keyboard input
// via Input.dispatch*, all over a single WebSocket. The public port is chosen
// dynamically inside the sandbox (get-port style) rather than a fixed 6080, and
// Chrome's own remote-debugging port stays internal (proxied over the same WS).

// The in-sandbox viewer page served at "/": a canvas that paints CDP screencast
// frames and forwards input back to the page. Kept dependency-free (no build
// step, no npm install). String.raw preserves backslashes verbatim so the JS/CSS
// is written to disk exactly as-is (must contain no backticks and no "${").
const VIEWER_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Virtual Browser</title>
<style>
  html,body{margin:0;height:100%;background:#0b0b0b;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}
  #bar{display:flex;gap:6px;padding:6px 8px;background:#161616;align-items:center;height:32px}
  #bar button{background:#262626;color:#ddd;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:13px;line-height:1}
  #bar button:hover{background:#333}
  #url{flex:1;background:#0b0b0b;color:#eee;border:1px solid #333;border-radius:6px;padding:7px 10px;font-size:13px;outline:none}
  #url:focus{border-color:#555}
  #wrap{position:absolute;top:44px;left:0;right:0;bottom:0;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;background:#0b0b0b}
  #screen{max-width:100%;max-height:100%;background:#fff}
  #status{position:absolute;inset:44px 0 0 0;display:flex;align-items:center;justify-content:center;color:#888;font-size:13px;pointer-events:none}
</style>
</head>
<body>
  <div id="bar">
    <button id="back" title="Back">&#9664;</button>
    <button id="fwd" title="Forward">&#9654;</button>
    <button id="reload" title="Reload">&#8635;</button>
    <input id="url" placeholder="Type a URL and press Enter" spellcheck="false" autocomplete="off" />
  </div>
  <div id="wrap"><canvas id="screen" width="1280" height="800" tabindex="0"></canvas></div>
  <div id="status">Connecting…</div>
<script>
(function(){
  var canvas=document.getElementById('screen');
  var ctx=canvas.getContext('2d');
  var statusEl=document.getElementById('status');
  var urlEl=document.getElementById('url');
  var proto=location.protocol==='https:'?'wss:':'ws:';
  var frameW=1280,frameH=800,buttons=0,nextId=1;
  var ws=new WebSocket(proto+'//'+location.host+'/cdp');

  function send(method,params){ if(ws.readyState===1){ ws.send(JSON.stringify({id:nextId++,method:method,params:params||{}})); } }

  ws.onopen=function(){
    statusEl.textContent='';
    send('Page.enable');
    send('Runtime.enable');
    send('Page.startScreencast',{format:'jpeg',quality:60,maxWidth:1280,maxHeight:800,everyNthFrame:1});
  };
  ws.onclose=function(){ statusEl.textContent='Disconnected. Reloading…'; setTimeout(function(){location.reload();},1500); };
  ws.onerror=function(){};
  ws.onmessage=function(ev){
    var msg; try{ msg=JSON.parse(ev.data); }catch(e){ return; }
    if(msg.method==='Page.screencastFrame'){
      var p=msg.params;
      var img=new Image();
      img.onload=function(){
        frameW=img.width; frameH=img.height;
        if(canvas.width!==img.width) canvas.width=img.width;
        if(canvas.height!==img.height) canvas.height=img.height;
        ctx.drawImage(img,0,0);
      };
      img.src='data:image/jpeg;base64,'+p.data;
      send('Page.screencastFrameAck',{sessionId:p.sessionId});
    } else if(msg.method==='Page.frameNavigated' && msg.params && msg.params.frame && !msg.params.frame.parentId){
      urlEl.value=msg.params.frame.url;
    }
  };

  function pt(e){
    var r=canvas.getBoundingClientRect();
    return { x: Math.round((e.clientX-r.left)*(frameW/r.width)), y: Math.round((e.clientY-r.top)*(frameH/r.height)) };
  }
  function bname(b){ return b===2?'right':b===1?'middle':'left'; }
  function bmask(b){ return b===2?2:b===1?4:1; }
  canvas.addEventListener('mousemove',function(e){ var q=pt(e); send('Input.dispatchMouseEvent',{type:'mouseMoved',x:q.x,y:q.y,button:'none',buttons:buttons}); });
  canvas.addEventListener('mousedown',function(e){ e.preventDefault(); canvas.focus(); buttons|=bmask(e.button); var q=pt(e); send('Input.dispatchMouseEvent',{type:'mousePressed',x:q.x,y:q.y,button:bname(e.button),buttons:buttons,clickCount:1}); });
  window.addEventListener('mouseup',function(e){ buttons&=~bmask(e.button); var q=pt(e); send('Input.dispatchMouseEvent',{type:'mouseReleased',x:q.x,y:q.y,button:bname(e.button),buttons:buttons,clickCount:1}); });
  canvas.addEventListener('contextmenu',function(e){ e.preventDefault(); });
  canvas.addEventListener('wheel',function(e){ e.preventDefault(); var q=pt(e); send('Input.dispatchMouseEvent',{type:'mouseWheel',x:q.x,y:q.y,button:'none',buttons:buttons,deltaX:e.deltaX,deltaY:e.deltaY}); },{passive:false});

  function mods(e){ return (e.altKey?1:0)|(e.ctrlKey?2:0)|(e.metaKey?4:0)|(e.shiftKey?8:0); }
  function key(type,e){
    var p={type:type,modifiers:mods(e),key:e.key,code:e.code,windowsVirtualKeyCode:e.keyCode,nativeVirtualKeyCode:e.keyCode};
    if(type==='keyDown' && e.key && e.key.length===1) p.text=e.key;
    send('Input.dispatchKeyEvent',p);
  }
  window.addEventListener('keydown',function(e){ if(document.activeElement===urlEl) return; e.preventDefault(); key('keyDown',e); });
  window.addEventListener('keyup',function(e){ if(document.activeElement===urlEl) return; e.preventDefault(); key('keyUp',e); });

  function go(u){ u=(u||'').trim(); if(!u) return; if(u.indexOf('://')===-1) u='https://'+u; send('Page.navigate',{url:u}); canvas.focus(); }
  urlEl.addEventListener('keydown',function(e){ if(e.key==='Enter') go(urlEl.value); });
  document.getElementById('reload').onclick=function(){ send('Page.reload',{}); };
  document.getElementById('back').onclick=function(){ send('Runtime.evaluate',{expression:'history.back()'}); };
  document.getElementById('fwd').onclick=function(){ send('Runtime.evaluate',{expression:'history.forward()'}); };
})();
</script>
</body>
</html>`;

// The in-sandbox "virtual browser" server (written to ~/.krek-vbrowser/server.js
// and run under a supervisor). It launches headless Chromium with a random CDP
// port (--remote-debugging-port=0, port read back from DevToolsActivePort),
// serves the viewer at "/", answers /healthz, and raw-pipes the "/cdp" WebSocket
// to Chrome's page target. Piping the client's own Sec-WebSocket-Key through to
// Chrome lets the browser and Chrome negotiate the upgrade end-to-end, so no ws
// library is needed and Chrome only ever sees a localhost Host header (its DNS-
// rebind guard would otherwise 403 the public E2B host). Uses no backticks / "${".
const SERVER_JS = String.raw`"use strict";
var http=require("http");
var net=require("net");
var url=require("url");
var fs=require("fs");
var os=require("os");
var path=require("path");
var spawn=require("child_process").spawn;

var PORT=Number(process.env.KREK_BROWSER_PORT||process.argv[2]||0);
var HOME=os.homedir();
var DIR=path.join(HOME,".krek-vbrowser");
var UDD=path.join(DIR,"chrome-data");
var ACTIVE=path.join(UDD,"DevToolsActivePort");
var START_URL=process.env.KREK_BROWSER_URL||"https://www.google.com";
var CHROME=process.env.KREK_CHROME_BIN||"chromium";
var VIEWER="";
try{ VIEWER=fs.readFileSync(path.join(DIR,"viewer.html"),"utf8"); }catch(e){ VIEWER="<!doctype html><title>Virtual Browser</title><body>viewer.html missing</body>"; }

var cdpPort=0, chrome=null;
function log(){ try{ console.log.apply(console,["[vbrowser]"].concat([].slice.call(arguments))); }catch(e){} }

function launchChrome(){
  try{ fs.unlinkSync(ACTIVE); }catch(e){}
  var args=["--headless=new","--no-sandbox","--no-first-run","--no-default-browser-check","--disable-gpu","--hide-scrollbars","--disable-dev-shm-usage","--remote-debugging-port=0","--remote-allow-origins=*","--window-size=1280,800","--user-data-dir="+UDD,START_URL];
  chrome=spawn(CHROME,args,{stdio:["ignore","ignore","ignore"]});
  chrome.on("exit",function(code){ log("chrome exited",code); cdpPort=0; setTimeout(launchChrome,500); });
  waitForPort(0);
}

function waitForPort(tries){
  fs.readFile(ACTIVE,"utf8",function(err,data){
    if(!err && data){
      var p=parseInt(String(data).split("\n")[0],10);
      if(p>0){ cdpPort=p; log("cdp on",p); return; }
    }
    if(tries<200){ setTimeout(function(){ waitForPort(tries+1); },250); }
  });
}

function getJson(p,cb){
  var req=http.request({host:"127.0.0.1",port:cdpPort,path:p,method:"GET",headers:{Host:"127.0.0.1:"+cdpPort}},function(res){
    var d=""; res.on("data",function(c){ d+=c; }); res.on("end",function(){ try{ cb(null,JSON.parse(d)); }catch(e){ cb(e); } });
  });
  req.on("error",cb); req.setTimeout(4000,function(){ req.destroy(); }); req.end();
}

function pageWsPath(cb){
  getJson("/json",function(err,list){
    if(err||!Array.isArray(list)) return cb(err||new Error("no targets"));
    var page=null;
    for(var i=0;i<list.length;i++){ if(list[i].type==="page"){ page=list[i]; break; } }
    if(!page||!page.webSocketDebuggerUrl) return cb(new Error("no page"));
    cb(null,url.parse(page.webSocketDebuggerUrl).path);
  });
}

var server=http.createServer(function(req,res){
  if(req.url==="/healthz"){
    if(cdpPort>0){ res.writeHead(200,{"Content-Type":"text/plain"}); res.end("ok"); }
    else{ res.writeHead(503,{"Content-Type":"text/plain"}); res.end("starting"); }
    return;
  }
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
  res.end(VIEWER);
});

server.on("upgrade",function(req,sock,head){
  if(!req.url||req.url.indexOf("/cdp")!==0||cdpPort<=0){ try{ sock.destroy(); }catch(e){} return; }
  pageWsPath(function(err,wsPath){
    if(err||!wsPath){ try{ sock.destroy(); }catch(e){} return; }
    var up=net.connect(cdpPort,"127.0.0.1",function(){
      var key=req.headers["sec-websocket-key"]||"";
      var lines=["GET "+wsPath+" HTTP/1.1","Host: 127.0.0.1:"+cdpPort,"Upgrade: websocket","Connection: Upgrade","Sec-WebSocket-Key: "+key,"Sec-WebSocket-Version: 13","Origin: http://127.0.0.1:"+cdpPort,"",""];
      up.write(lines.join("\r\n"));
      if(head && head.length) up.write(head);
      up.pipe(sock); sock.pipe(up);
    });
    up.on("error",function(){ try{ sock.destroy(); }catch(e){} });
    sock.on("error",function(){ try{ up.destroy(); }catch(e){} });
  });
});

server.listen(PORT,"0.0.0.0",function(){ log("viewer listening on",PORT); launchChrome(); });
`;

// Foreground: install Chromium if missing, write the viewer + server to disk,
// and pick the public port. If a healthy server is already listening on the
// previously-chosen port we reuse it (RUNNING=1); otherwise we allocate a fresh
// free port with a python3 one-liner (get-port equivalent, run inside the
// sandbox) and record it. Prints KREK_* markers on stdout.
export const ensureBrowserScript = (): string =>
  [
    'DIR="$HOME/.krek-vbrowser"',
    'mkdir -p "$DIR"',
    `cat > "$DIR/viewer.html" <<'KREK_VIEWER_EOF'`,
    VIEWER_HTML,
    "KREK_VIEWER_EOF",
    `cat > "$DIR/server.js" <<'KREK_SERVER_EOF'`,
    SERVER_JS,
    "KREK_SERVER_EOF",
    'CHROME_BIN="$(command -v chromium || command -v chromium-browser || true)"',
    'if [ -z "$CHROME_BIN" ]; then',
    "  sudo -n DEBIAN_FRONTEND=noninteractive apt-get update -y >/tmp/krek-vbrowser-install.log 2>&1 || true",
    "  sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends chromium >>/tmp/krek-vbrowser-install.log 2>&1 || true",
    '  CHROME_BIN="$(command -v chromium || command -v chromium-browser || true)"',
    "fi",
    "DEPS=OK",
    '[ -n "$CHROME_BIN" ] || DEPS=MISSING',
    "command -v node >/dev/null 2>&1 || DEPS=MISSING",
    "command -v python3 >/dev/null 2>&1 || DEPS=MISSING",
    'PORT_FILE="$DIR/port"',
    "RUNNING=0",
    'PORT=""',
    '[ -f "$PORT_FILE" ] && PORT="$(cat "$PORT_FILE" 2>/dev/null)"',
    'if [ -n "$PORT" ] && curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/healthz"; then',
    "  RUNNING=1",
    "else",
    `  PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("",0));print(s.getsockname()[1]);s.close()')"`,
    '  echo "$PORT" > "$PORT_FILE"',
    "fi",
    'echo "KREK_CHROME=$CHROME_BIN"',
    'echo "KREK_DEPS=$DEPS"',
    'echo "KREK_PORT=$PORT"',
    'echo "KREK_RUNNING=$RUNNING"',
  ].join("\n");

// Long-running server, launched as one E2B background command under a single-
// supervisor flock (mirrors the editor): if the Node server ever exits it is
// relaunched, and the Node server itself respawns Chromium if it crashes, so the
// viewer's WebSocket auto-reconnect recovers in seconds instead of 502-looping.
export const startBrowserCmd = (): string =>
  [
    'DIR="$HOME/.krek-vbrowser"',
    'mkdir -p "$DIR"',
    'export KREK_BROWSER_PORT="$(cat "$DIR/port" 2>/dev/null)"',
    'export KREK_CHROME_BIN="$(command -v chromium || command -v chromium-browser || echo chromium)"',
    'exec 9>"$DIR/supervisor.lock"',
    "flock -n 9 || exit 0",
    "while true; do",
    '  node "$DIR/server.js" >>"$DIR/server.log" 2>&1',
    '  echo "[krek-vbrowser] node exited ($?) at $(date -u), restarting" >>"$DIR/server.log"',
    "  sleep 1",
    "done",
  ].join("\n");

// Foreground: wait until the viewer server is serving before we hand back a URL.
// Bounded by a wall-clock deadline (~75s) so its worst-case runtime is
// predictable; the caller's command timeout sits above it and the wait is
// best-effort (the viewer's WebSocket reconnects on its own if it comes up late).
export const browserReadyScript = (port: number): string =>
  [
    "deadline=$(( $(date +%s) + 75 ))",
    'while [ "$(date +%s)" -lt "$deadline" ]; do',
    `  if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${port}/healthz"; then echo "KREK_READY=1"; exit 0; fi`,
    "  sleep 1",
    "done",
    'echo "KREK_READY=0"',
  ].join("\n");
