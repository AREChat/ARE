import os, sys, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright
GSRC = os.environ.get("GAME_SRC", "/home/claude/r3/game"); GPORT = int(os.environ.get("GAME_PORT", "8771"))
GBASE = "http://127.0.0.1:%d" % GPORT
def ensure_game_server():
    try:
        urllib.request.urlopen(GBASE + "/index.html", timeout=2); return None
    except Exception:
        p = subprocess.Popen([sys.executable, "-m", "http.server", str(GPORT), "--bind", "127.0.0.1", "--directory", GSRC], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(40):
            time.sleep(0.2)
            try: urllib.request.urlopen(GBASE + "/index.html", timeout=2); break
            except Exception: pass
        return p
PAD_JS = """
(function(){
  window.__pad = {buttons: new Array(17).fill(0), axes: [0,0,0,0], on: true, id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'};
  navigator.getGamepads = function(){
    if(!window.__pad.on) return [null,null,null,null];
    return [{id: window.__pad.id, index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
      buttons: window.__pad.buttons.map(function(v){ return {pressed: !!v, touched: !!v, value: +v}; }), axes: window.__pad.axes.slice()}, null, null, null];
  };
})();
"""
def new_game_page(p, w=1000, h=700, mobile=False):
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
    c = b.new_context(viewport={"width": w, "height": h})
    c.add_init_script(PAD_JS)
    pg = c.new_page(); logs = []
    pg.on("pageerror", lambda e: logs.append(("pageerror", str(e))))
    pg.on("console", lambda m: logs.append((m.type, m.text)) if m.type == "error" else None)
    return b, c, pg, logs
def press(pg, idx, ms=120):
    pg.evaluate("(i)=>{window.__pad.buttons[i]=1}", idx); pg.wait_for_timeout(ms); pg.evaluate("(i)=>{window.__pad.buttons[i]=0}", idx); pg.wait_for_timeout(120)
def axis(pg, i, v): pg.evaluate("([i,v])=>{window.__pad.axes[i]=v}", [i, v])
