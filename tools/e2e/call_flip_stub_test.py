import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
STUB = """
(function(){
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const cams = [{deviceId:'camFRONT', label:'front', facing:'user', color:'#c33'}, {deviceId:'camBACK', label:'back', facing:'environment', color:'#36c'}];
  function mk(c){
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; const g = cv.getContext('2d'); let n = 0;
    setInterval(() => { g.fillStyle = c.color; g.fillRect(0,0,640,360); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText(c.label + ' ' + (n++), 30, 180); }, 50);
    const s = cv.captureStream(20); const t = s.getVideoTracks()[0];
    const gs = t.getSettings.bind(t); t.getSettings = () => Object.assign(gs(), {deviceId:c.deviceId, facingMode:c.facing});
    return t;
  }
  navigator.mediaDevices.getUserMedia = async function(cons){
    if(cons && cons.video){
      let want = cams[0];
      const v = cons.video;
      if(v.deviceId && v.deviceId.exact) want = cams.find(c => c.deviceId === v.deviceId.exact) || cams[0];
      else if(v.facingMode){ const f = v.facingMode.exact || v.facingMode.ideal || v.facingMode; want = cams.find(c => c.facing === f) || cams[0]; }
      const out = new MediaStream();
      if(cons.audio){ const a = await real({audio:cons.audio, video:false}); a.getAudioTracks().forEach(t => out.addTrack(t)); }
      out.addTrack(mk(want)); return out;
    }
    return real(cons);
  };
  navigator.mediaDevices.enumerateDevices = async () => cams.map(c => ({kind:'videoinput', deviceId:c.deviceId, label:c.label, groupId:c.deviceId}));
})();
"""
with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS); gas_reset()
    ctxA, A, logA = mkpage(browser, "u-me", mobile=True); ctxB, B, logB = mkpage(browser, "u1")
    ctxA.add_init_script(STUB)
    boot(A); boot(B, room=False)
    A.evaluate("()=>document.getElementById('hdrMoreBtn')&&document.getElementById('hdrMoreBtn').click()"); A.wait_for_timeout(300)
    A.click("#telVideoBtn"); A.wait_for_timeout(300); speed(B)
    wait_for(B, "()=>!!AREtel.state.incoming", 20000); B.click("#telInVideo")
    ok = wait_for(A, "()=>AREtel.state.call && AREtel.state.call.startAt>0", 25000) and wait_for(B, "()=>AREtel.state.call && AREtel.state.call.startAt>0", 25000)
    check("0 つながる", ok); A.wait_for_timeout(1500)
    fsA = lambda: A.evaluate("async()=>{const r=await AREtel.state.call.pc.getStats();let f=0;r.forEach(x=>{if(x.type==='outbound-rtp'&&x.kind==='video')f=x.framesSent});return f}")
    fdB = lambda: B.evaluate("async()=>{const r=await AREtel.state.call.pc.getStats();let f=0;r.forEach(x=>{if(x.type==='inbound-rtp'&&x.kind==='video')f=x.framesDecoded});return f}")
    check("1 カメラ2つ以上のスマホ：🔄 が出る", wait_for(A, "()=>!document.getElementById('telFlipBox').hidden", 6000))
    check("2 はじめは内カメラ（鏡うつし）", A.evaluate("()=>AREtel.state.call.facing==='user' && document.getElementById('telLocal').classList.contains('mirror')"))
    for i, (face, txt) in enumerate([("environment","外カメラ"), ("user","内カメラ"), ("environment","外カメラ")]):
        A.click("#telFlip"); A.wait_for_timeout(500)
        a1, b1 = fsA(), fdB(); A.wait_for_timeout(2000); a2, b2 = fsA(), fdB()
        check("3-%d 🔄 で %s にかわり、相手にも映像が届き続ける" % (i+1, txt), A.evaluate("()=>AREtel.state.call.facing")==face and a2 > a1 and b2 > b1, (face, a1, a2, b1, b2))
        check("3-%d 鏡うつしは 内カメラのときだけ／ボタンの文字がつぎの向きになる" % (i+1), A.evaluate("()=>document.getElementById('telLocal').classList.contains('mirror')") == (face=="user") and A.evaluate("()=>document.getElementById('telFlipTx').textContent") == ("内カメラへ" if face=="environment" else "外カメラへ"))
        check("3-%d 声（マイク）は止まらない" % (i+1), A.evaluate("()=>AREtel.state.call.stream.getAudioTracks()[0].readyState==='live'"))
    errs = [x for x in logA + logB if x[0] == "pageerror"]
    check("9 ページのエラーなし", not errs, errs[:3])
    browser.close()
print("\\nフリップのテスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
