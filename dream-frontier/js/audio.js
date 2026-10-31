const PREF_KEY = "dreamFrontierSound_v1";
const SCALES = {town: [0, 2, 4, 7, 9, 12, 9, 7], cave: [0, 3, 7, 10, 12, 10, 7, 3], field: [0, 4, 7, 9, 12, 9, 7, 4], demoncastle: [0, 1, 4, 5, 7, 5, 4, 1], sea: [0, 2, 5, 7, 9, 7, 5, 2]};
const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const prefs = (() => { try{ return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); }catch(_e){ return {}; } })();
let ac = null, bgmBus = null, seBus = null, unlocked = false, on = prefs.on !== false;
let bgmVol = clamp(prefs.bgmVol === undefined ? .48 : prefs.bgmVol), seVol = clamp(prefs.seVol === undefined ? .58 : prefs.seVol);
let bgmTimer = null, step = 0, key = "town", activeAudio = null, activeKey = "", pendingAudio = null, fadeToken = 0;
const tracks = {}, failedTracks = {};
const hz = (n) => 261.63 * Math.pow(2, n / 12);

function ensure(){
    if(ac) return ac;
    try{
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if(!AudioContextClass) return null;
        ac = new AudioContextClass();
        bgmBus = ac.createGain(); bgmBus.gain.value = bgmVol; bgmBus.connect(ac.destination);
        seBus = ac.createGain(); seBus.gain.value = seVol; seBus.connect(ac.destination);
    }catch(_e){ ac = null; }
    return ac;
}

function savePrefs(){ try{ localStorage.setItem(PREF_KEY, JSON.stringify({on, bgmVol, seVol})); }catch(_e){} }

function tone(f, d, type, v, when, bus){
    if(!unlocked || !on || !ensure()) return;
    const startAt = ac.currentTime + (when || 0), oscillator = ac.createOscillator(), gain = ac.createGain();
    oscillator.type = type || "sine"; oscillator.frequency.value = f;
    gain.gain.setValueAtTime(0, startAt); gain.gain.linearRampToValueAtTime(v || .2, startAt + .02); gain.gain.exponentialRampToValueAtTime(.0001, startAt + d);
    oscillator.connect(gain); gain.connect(bus === "bgm" ? bgmBus : seBus); oscillator.start(startAt); oscillator.stop(startAt + d + .05);
}

function stopSynthBgm(){ clearInterval(bgmTimer); bgmTimer = null; }

function startSynthBgm(){
    if(bgmTimer || !unlocked || !on || !ensure()) return;
    bgmTimer = setInterval(() => {
        const scale = SCALES[key] || SCALES.town, note = scale[step % scale.length];
        tone(hz(note - 12), .5, "sine", .07, 0, "bgm");
        if(step % 2 === 0) tone(hz(scale[(step * 3) % scale.length] + 12), .35, "triangle", .035, 0, "bgm");
        if(step % 8 === 0) tone(hz(scale[0] - 24), 1.4, "sine", .08, 0, "bgm");
        step++;
    }, 420);
}

function getTrack(name){
    if(failedTracks[name]) return null;
    if(tracks[name]) return tracks[name];
    try{
        const audio = new Audio(new URL("../../game2/bgm/" + name + ".mp3", import.meta.url).href);
        audio.loop = true; audio.preload = "auto"; audio.volume = 0;
        audio.addEventListener("error", () => { failedTracks[name] = true; if(key === name){ activeAudio = null; activeKey = ""; startSynthBgm(); } });
        tracks[name] = audio;
        return audio;
    }catch(_e){ failedTracks[name] = true; return null; }
}

async function syncBgm(){
    if(!on || document.hidden){ fadeToken++; pendingAudio = null; if(activeAudio) activeAudio.pause(); stopSynthBgm(); return; }
    if(!unlocked) return;
    const requestKey = key, next = getTrack(requestKey);
    if(!next){ startSynthBgm(); return; }
    if(next === activeAudio && !next.paused){ next.volume = bgmVol; stopSynthBgm(); return; }
    if(next === pendingAudio) return;
    const token = ++fadeToken, previous = activeAudio, previousVolume = previous ? previous.volume : 0;
    pendingAudio = next; next.volume = 0;
    try{ await next.play(); }
    catch(error){ if(pendingAudio === next) pendingAudio = null; if(error && error.name === "NotAllowedError") return; failedTracks[requestKey] = true; startSynthBgm(); return; }
    if(token !== fadeToken){ next.pause(); if(pendingAudio === next) pendingAudio = null; return; }
    pendingAudio = null; activeAudio = next; activeKey = key; stopSynthBgm();
    const startedAt = performance.now();
    const fade = (now) => {
        if(token !== fadeToken) return;
        const progress = Math.max(0, Math.min(1, (now - startedAt) / 800));   // 時刻が開始より わずかに前でも マイナスにしない（音量が範囲外になり エラーで 無音になるのを防ぐ）
        next.volume = bgmVol * progress;
        if(previous && previous !== next) previous.volume = previousVolume * (1 - progress);
        if(progress < 1) requestAnimationFrame(fade);
        else if(previous && previous !== next){ previous.pause(); previous.currentTime = 0; }
    };
    fade(startedAt);
}

export const Snd = {
    init(){
        if(seBus){ bgmBus.gain.value = bgmVol; seBus.gain.value = seVol; }
        document.addEventListener("visibilitychange", () => {
            if(document.hidden){ fadeToken++; pendingAudio = null; if(activeAudio) activeAudio.pause(); stopSynthBgm(); }
            else syncBgm();
        });
    },
    resume(){ unlocked = true; if(ensure() && ac.state === "suspended") ac.resume(); syncBgm(); },
    setOn(value){ on = !!value; savePrefs(); if(!on){ fadeToken++; pendingAudio = null; Object.values(tracks).forEach((audio) => { audio.pause(); audio.volume = 0; }); activeAudio = null; activeKey = ""; stopSynthBgm(); } else syncBgm(); },
    isOn: () => on,
    setVol(value){ bgmVol = clamp(value); if(bgmBus) bgmBus.gain.value = bgmVol; if(activeAudio) activeAudio.volume = bgmVol; savePrefs(); },
    getVol: () => bgmVol,
    setSeVol(value){ seVol = clamp(value); if(seBus) seBus.gain.value = seVol; savePrefs(); },
    getSeVol: () => seVol,
    sfx(name){
        const sounds = {
            coin: () => { tone(988, .12, "square", .12); tone(1319, .2, "square", .12, .08); },
            clue: () => tone(660, .25, "triangle", .2),
            ok: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, "triangle", .2, i * .09)),
            ng: () => tone(150, .3, "sawtooth", .15),
            stamp: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, .3, "triangle", .22, i * .1)),
            start: () => [392, 523, 659].forEach((f, i) => tone(f, .18, "square", .1, i * .08)),
            fan: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .22, "triangle", .2, i * .12)),
            climb: () => tone(120, .5, "square", .08),
            drop: () => { for(let i = 0; i < 12; i++) tone(900 - i * 60, .12, "sawtooth", .06, i * .05); },
            splash: () => tone(90, .6, "sawtooth", .2),
            boo: () => { tone(180, .6, "sawtooth", .1); tone(150, .8, "triangle", .1, .1); },
            shot: () => tone(1400, .08, "square", .1),
            hit: () => { tone(880, .12, "triangle", .2); tone(1320, .2, "triangle", .2, .06); }
        };
        if(sounds[name]) sounds[name]();
    },
    setBgm(name){ key = name; syncBgm(); },
    startBgm(){ syncBgm(); },
    stopBgm(){ fadeToken++; pendingAudio = null; if(activeAudio) activeAudio.pause(); stopSynthBgm(); }
};
