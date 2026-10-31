(() => {
  'use strict';
  const SAVE_KEY = 'game6-starweaver-save-v1';
  const $ = (id) => document.getElementById(id);
  const state = {
    name: '主人公', x: 49, y: 18, hp: 42, maxHp: 42, mp: 18, maxMp: 18, level: 1, xp: 0,
    atk: 8, def: 5, potions: 2, starSand: 0, coins: 12,
    chestOpened: false, stoneTouched: false, talked: false, wonIntroBattle: false,
    questComplete: false, enemy: null, battleTurn: 'player', battles: 0, location: 0, steps: 0, wins: 0, play: 0
  };
  const locations = [
    {name:'霧灯の丘',detail:'薄い霧が草地をなでる丘。古い石碑と、誰かが置き忘れた宝箱がある。'},
    {name:'風の小径',detail:'低い木々の間を風が抜ける道。遠くに小さな町の灯りが見えた気がする。'},
    {name:'忘れられた石段',detail:'苔むした石段。割れ目の奥に、かすかな星の光が眠っている。'}
  ];
  let logEntries = [];
  let toastTimer = 0;

  function nowTime(){const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
  function nameFix(t){return String(t).replace(/ルカ/g,state.name||'主人公');}
  function hitFx(text){try{const m=document.querySelector('.modal-panel');if(!m||$('modal').hidden)return;const cls=/ダメージを受けた/.test(text)?'fx-hurt':/ダメージ|星斬り/.test(text)?'fx-hit':'';if(!cls)return;m.classList.remove('fx-hurt','fx-hit');void m.offsetWidth;m.classList.add(cls);setTimeout(()=>m.classList.remove(cls),480);}catch(_e){}}
  function log(text){text=nameFix(text);hitFx(text);logEntries.unshift({time:nowTime(),text});logEntries=logEntries.slice(0,12);renderLog();}
  function renderLog(){const el=$('log');el.replaceChildren();for(const entry of logEntries){const p=document.createElement('p'),t=document.createElement('time'),s=document.createElement('span');t.textContent=entry.time;s.textContent=entry.text;p.append(t,s);el.append(p);}}
  function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500);}
  function modal(title,body,actions=[{label:'閉じる',action:closeModal,primary:true}],eyebrow='FIELD EVENT'){
    $('modalTitle').textContent=nameFix(title);$('modalBody').textContent=nameFix(body);$('modalEyebrow').textContent=eyebrow;
    const box=$('modalActions');box.replaceChildren();
    actions.forEach(a=>{const btn=document.createElement('button');btn.textContent=a.label;if(a.primary)btn.classList.add('primary');if(a.disabled)btn.disabled=true;btn.addEventListener('click',()=>a.action());box.append(btn);});
    $('modal').hidden=false;const first=box.querySelector('button');if(first)first.focus();
  }
  function closeModal(){$('modal').hidden=true;}
  function update(){
    $('levelText').textContent=state.level;$('hpText').textContent=`${state.hp} / ${state.maxHp}`;$('mpText').textContent=`${state.mp} / ${state.maxMp}`;
    $('hpBar').style.width=`${state.hp/state.maxHp*100}%`;$('mpBar').style.width=`${state.mp/state.maxMp*100}%`;
    $('atkText').textContent=state.atk;$('defText').textContent=state.def;$('xpText').textContent=`${state.xp} / ${state.level*20}`;
    $('potionCount').textContent=`× ${state.potions}`;$('starCount').textContent=`× ${state.starSand}`;$('coinCount').textContent=`× ${state.coins}`;
    $('playerToken').style.left=`${state.x}%`;$('playerToken').style.bottom=`${state.y}%`;
    $('locationName').textContent=locations[state.location].name;const hn=$('heroName');if(hn)hn.textContent=state.name;
    zoneUpdate();
    const done=(state.chestOpened?1:0)+(state.stoneTouched?1:0);$('questPercent').textContent=`${done} / 2`;$('questBar').style.width=`${done*50}%`;
    $('questStatus').textContent=done===2?'達成済み':'進行中';$('questTitle');
    if(done===2&&!state.questComplete){state.questComplete=true;log('星の石碑が応えた。消えた星明かりへの道筋が見え始める。');toast('クエスト達成！ 星砂を手に入れた');state.starSand+=3;state.xp+=10;checkLevel();}
    if(state.questComplete){$('questDesc')?.replaceChildren();const desc=document.querySelector('.quest-desc');if(desc)desc.textContent='石碑の謎を解いた。次は風の向こうにある町を目指そう。';}
  }
  function checkLevel(){while(state.xp>=state.level*20){state.xp-=state.level*20;state.level++;state.maxHp+=8;state.maxMp+=3;state.atk+=2;state.def+=1;state.hp=state.maxHp;state.mp=state.maxMp;log(`ルカはレベル${state.level}に上がった！ HPとMPが全回復した。`);}}
  // ---- モンスターが出る場所／出ない場所 ----
  function isSafeSpot(){
    if(state.location===2) return true;
    const nearChest=Math.abs(state.x-72)<18&&Math.abs(state.y-19)<17, nearStone=Math.abs(state.x-25)<18&&Math.abs(state.y-24)<16;
    return state.location===0&&(nearChest||nearStone);
  }
  function zoneUpdate(){
    const w=$('world'),b=$('zoneBadge'); if(!w||!b) return; const safe=isSafeSpot();
    w.classList.toggle('zone-danger',!safe); w.classList.toggle('zone-safe',safe);
    b.textContent=safe?'🕊 ここは モンスターが出ない場所':'⚔ ここは モンスターが出る場所（草むら）';
  }
  function encRate(){let v='1';try{v=localStorage.getItem('game6-enc')||'1';}catch(_e){}return ({'0':0.1,'1':0.2,'2':0.32})[v]||0.2;}
  function encounterRoll(){
    if(isSafeSpot()||state.enemy||!$('modal').hidden||Math.random()>encRate()) return;
    const w=$('world'); w.classList.add('alert'); toast('！ モンスターが あらわれた');
    setTimeout(()=>{w.classList.remove('alert');if($('modal').hidden&&!state.enemy)startBattle();},650);
  }
  function move(dir){if(!$('modal').hidden||state.enemy)return;const old={x:state.x,y:state.y};const step=5;switch(dir){case'up':state.y=Math.min(43,state.y+step);break;case'down':state.y=Math.max(7,state.y-step);break;case'left':state.x=Math.max(9,state.x-step);break;case'right':state.x=Math.min(91,state.x+step);break;}if(old.x===state.x&&old.y===state.y)return;
    if(state.location===0&&(state.x<19&&state.y>25)){state.location=1;log('丘を越えて、風の小径へ足を踏み入れた。');toast('エリア移動：風の小径');}
    else if(state.location===1&&state.x>82&&state.y>23){state.location=2;log('石の階段を見つけた。石段の先から星の気配がする。');toast('エリア移動：忘れられた石段');}
    else if(state.location===2&&state.x<18){state.location=1;log('小径へ戻った。道は丘へと続いている。');}
    else if(state.location===1&&state.x>86){state.location=0;log('霧灯の丘へ戻った。見慣れた石碑が出迎える。');}
    state.steps=(state.steps||0)+1;update();zoneUpdate();if(Math.random()<0.11)log('草むらが揺れた。何かの足音が風に消える。');encounterRoll();
  }
  function examineChest(){if(!$('modal').hidden)return;if(state.chestOpened){modal('空になった宝箱','宝箱の中は空だ。蓋の裏に、小さく星の印が刻まれている。');return;}
    modal('古い宝箱','錆びた留め金を外すと、柔らかな光がこぼれた。中には木の実薬と、星のようにきらめく砂が入っている。',[
      {label:'宝箱を開ける',primary:true,action:()=>{state.chestOpened=true;state.potions+=2;state.starSand+=1;state.coins+=8;log('宝箱から木の実薬×2、星砂×1、ルーン銭×8を手に入れた。');closeModal();update();toast('宝箱を開けた！');}}
    ]);
  }
  function touchStone(){if(!$('modal').hidden)return;if(state.stoneTouched){modal('星の石碑','石碑に刻まれた文字が読める。「星は道を照らす。道は人をつなぐ。」');return;}
    modal('星の石碑','石碑に触れると、冷たい石の奥で微かな鼓動が響いた。文字がひとつずつ浮かび上がる。\n\n「ふたつの光がそろうとき、旅の扉はひらく」',[
      {label:'石碑に祈る',primary:true,action:()=>{state.stoneTouched=true;state.mp=Math.min(state.maxMp,state.mp+5);state.xp+=5;log('星の石碑に触れた。MPが少し回復し、経験値を得た。');checkLevel();closeModal();update();toast('石碑が淡く応えた');}}
    ],'ANCIENT MONUMENT');
  }
  function talk(){if(state.talked){modal('風のささやき','「石碑だけでは、夜空は戻らない。もうひとつ、光を見つけてごらん」\n\n風はそう告げると、丘の向こうへ流れていった。');return;}state.talked=true;modal('風のささやき','人の姿は見えない。それでも、どこからか穏やかな声が聞こえる。\n\n「旅人よ。星明かりが消えた夜から、道しるべも眠ってしまった。古い石碑と、忘れられた光を探しておくれ」',[{label:'声を胸に刻む',primary:true,action:()=>{log('風のささやきが旅の目的を告げた。');closeModal();toast('新しい手がかりを得た');}}]);}
  function explore(){if(!$('modal').hidden)return;const nearChest=!state.chestOpened&&Math.abs(state.x-72)<18&&Math.abs(state.y-19)<17;const nearStone=!state.stoneTouched&&Math.abs(state.x-25)<18&&Math.abs(state.y-24)<16;if(nearChest){examineChest();return;}if(nearStone){touchStone();return;}if(state.location===2){modal('忘れられた石段',locations[2].detail+'\n\n石段には古い足跡が残っている。慎重に進めば、先に何かが見つかるかもしれない。');return;}if(Math.random()<.38){const found=1+Math.floor(Math.random()*3);state.coins+=found;log(`草むらの中からルーン銭を${found}枚見つけた。`);update();toast(`ルーン銭 +${found}`);}else{const lines=['丘の草花の間に、小さな光がひとつ瞬いた。','遠くで鳥の鳴き声がした。空は少しずつ明るくなっている。','風が古い石の匂いを運んでくる。','地面に細い星形の模様がある。誰かの道しるべだろうか。'];const text=lines[Math.floor(Math.random()*lines.length)];log(text);modal('周囲を調べた',text);}}

  const enemies=[{name:'苔玉スライム',icon:'◉',hp:24,atk:5,def:1,xp:9,coins:4,desc:'苔をまとった、ころころした小さな魔物。'},{name:'夜鳴きコウモリ',icon:'♧',hp:20,atk:7,def:0,xp:11,coins:5,desc:'薄明の空を飛ぶ、音に敏感な魔物。'},{name:'石肌のこびと',icon:'♜',hp:31,atk:6,def:3,xp:14,coins:7,desc:'石の欠片を身につけた、頑丈な魔物。'}];
  function startBattle(){if(!$('modal').hidden||state.enemy)return;const base=enemies[Math.floor(Math.random()*enemies.length)];state.enemy={...base,hp:base.hp+Math.max(0,state.battles-1)*3,maxHp:base.hp+Math.max(0,state.battles-1)*3};state.battles++;renderBattle('野生の魔物が立ちはだかった！');}
  function renderBattle(message){const e=state.enemy;if(!e)return;modal('コマンドバトル',message,[{label:'逃げる',action:()=>{if(Math.random()<0.7){state.enemy=null;closeModal();log('ルカは距離をとり、戦いを避けた。');}else{log('逃げ道を ふさがれた！');state.battleTurn='player';enemyTurn(0);}}}],'TURN BATTLE');const body=$('modalBody');body.replaceChildren();const enemy=document.createElement('div');enemy.className='battle-enemy';const icon=document.createElement('div');icon.className='enemy-symbol';icon.textContent=e.icon;const txt=document.createElement('div');const name=document.createElement('b');name.textContent=e.name;const desc=document.createElement('p');desc.textContent=e.desc;txt.append(name,desc);const hp=document.createElement('div');hp.className='enemy-hp';hp.textContent=`HP ${e.hp}/${e.maxHp}`;enemy.append(icon,txt,hp);body.append(enemy);const note=document.createElement('p');note.textContent=`${state.name}　HP ${state.hp}/${state.maxHp}　MP ${state.mp}/${state.maxMp}`;body.append(note);const opts=document.createElement('div');opts.className='battle-options';body.append(opts);const actions=[['⚔','攻撃','剣で一撃を与える',()=>playerAttack(false)],['✧','星斬り','MP 4を使って強い一撃',()=>playerAttack(true)],['✿','木の実薬',`HPを22回復（所持 ${state.potions}）`,usePotion],['✦','防御','次の攻撃のダメージを抑える',defend]];for(const [i,title,sub,fn] of actions){const b=document.createElement('button');const t=document.createElement('b');t.textContent=`${i} ${title}`;const s=document.createElement('small');s.textContent=sub;b.append(t,s);b.disabled=(title==='木の実薬'&&state.potions<=0)||(title==='星斬り'&&state.mp<4)||state.battleTurn!=='player';b.addEventListener('click',fn);opts.append(b);}}
  function enemyTurn(reduction=0){if(!state.enemy)return;const e=state.enemy;const damage=Math.max(1,e.atk-state.def+Math.floor(Math.random()*3)-reduction);state.hp=Math.max(0,state.hp-damage);log(`${e.name}の攻撃。ルカは${damage}のダメージを受けた。`);if(state.hp<=0){state.hp=1;state.enemy=null;closeModal();update();modal('辛くも逃げ切った','ルカは最後の力を振り絞り、魔物から離れた。HPが1残った。',[{label:'立ち上がる',primary:true,action:()=>{closeModal();log('ルカは息を整えた。');}}],'BATTLE END');return;}update();renderBattle(`${e.name}の攻撃！ ${damage}ダメージを受けた。`);}
  function playerAttack(skill){const e=state.enemy;if(!e||state.battleTurn!=='player')return;if(skill&&state.mp<4)return;let damage=Math.max(1,state.atk-e.def+Math.floor(Math.random()*4));if(skill){state.mp-=4;damage=Math.floor(damage*1.9)+3;}e.hp=Math.max(0,e.hp-damage);log(skill?`ルカは星斬りを放った！ ${e.name}に${damage}ダメージ。`:`ルカの攻撃！ ${e.name}に${damage}ダメージ。`);update();if(e.hp<=0){winBattle();return;}state.battleTurn='enemy';renderBattle(`${e.name}に${damage}ダメージ！`);setTimeout(()=>{if(state.enemy){state.battleTurn='player';enemyTurn();}},420);}
  function usePotion(){if(!state.enemy||state.potions<=0)return;state.potions--;const amount=Math.min(22,state.maxHp-state.hp);state.hp+=amount;log(`木の実薬を使い、HPが${amount}回復した。`);update();state.battleTurn='player';enemyTurn(1);}
  function defend(){if(!state.enemy)return;log('ルカは身構えた。');state.battleTurn='player';enemyTurn(3);}
  function winBattle(){const e=state.enemy;state.wins=(state.wins||0)+1;state.enemy=null;state.coins+=e.coins;state.xp+=e.xp;checkLevel();update();log(`${e.name}を倒した！ 経験値${e.xp}、ルーン銭${e.coins}枚を手に入れた。`);modal('勝利！',`${e.name}を倒した。\n\n経験値 +${e.xp}\nルーン銭 +${e.coins}\n${state.level>1?`レベル ${state.level}　`:''}HP ${state.hp}/${state.maxHp}`,[{label:'冒険を続ける',primary:true,action:()=>{closeModal();}}],'BATTLE CLEAR');}
  function rest(){if(!$('modal').hidden||state.enemy)return;state.hp=state.maxHp;state.mp=state.maxMp;log('少し休んで体勢を整えた。HPとMPが全回復した。');update();modal('ひと休み','丘の草地に腰を下ろし、風の音に耳を澄ませた。\n\nHPとMPが全回復した。',[{label:'出発する',primary:true,action:closeModal}]);}
  function showMap(){const body='今いる場所と、見つけた道筋。まだ地図の先は霧に包まれている。';modal('旅の地図',body,[{label:'閉じる',primary:true,action:closeModal}],'WORLD MAP');const box=$('modalBody');const list=document.createElement('div');list.className='map-list';locations.forEach((p,i)=>{const row=document.createElement('div');row.className='map-point'+(i===state.location?' active':'');const mark=document.createElement('span');mark.className='map-mark';mark.textContent=i===state.location?'⌖':'◇';const txt=document.createElement('div');const b=document.createElement('b');b.textContent=p.name;const small=document.createElement('small');small.textContent=i===state.location?'現在地':(i===0&&state.location!==0?'訪れた場所':'まだ霧の向こう');txt.append(b,small);row.append(mark,txt);list.append(row);});box.append(list);}
  function questDetails(){modal('クエスト：消えた星明かり','星明かりが消えた夜から、旅人を導く道しるべも眠りについてしまった。\n\n【目的】\n'+(state.stoneTouched?'✓ 星の石碑に触れる':'◇ 星の石碑に触れる')+'\n'+(state.chestOpened?'✓ 古い宝箱を開ける':'◇ 古い宝箱を開ける')+'\n\n石碑と宝箱に残る光を手がかりに、夜空の謎を追いかけよう。',[{label:'旅に戻る',primary:true,action:closeModal}],'QUEST LOG');}
  function bag(){modal('持ちもの',`木の実薬　× ${state.potions}\n傷を癒やす木の実を煮出した薬。HPを22回復する。\n\n星砂　× ${state.starSand}\n星明かりのかけら。何かに使えるかもしれない。\n\nルーン銭　× ${state.coins}\n旅人たちの間で流通する小さな硬貨。`);}
  function save(){const payload={...state,enemy:null,battleTurn:'player',saveVer:2};try{localStorage.setItem(SAVE_KEY,JSON.stringify(payload));toast('冒険の記録を保存した');log('冒険の記録をこのブラウザに保存した。');}catch(e){toast('保存できませんでした。ブラウザ設定を確認してください。');}}
  function load(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw){toast('保存された記録はありません');return;}const saved=JSON.parse(raw);for(const key of Object.keys(state)){if(Object.prototype.hasOwnProperty.call(saved,key))state[key]=saved[key];}state.enemy=null;state.battleTurn='player';update();closeModal();log('保存した冒険の記録を読み込んだ。');toast('記録を読み込んだ');}catch(e){toast('記録を読み込めませんでした');}}
  const achs=[['はじめての 勝利',()=>state.wins>=1],['10回 たたかった',()=>state.battles>=10],['レベル 5',()=>state.level>=5],['宝箱を 開けた',()=>state.chestOpened],['星の石碑に 祈った',()=>state.stoneTouched],['星明かりの クエスト達成',()=>state.questComplete],['風の小径へ',()=>state.location>=1],['忘れられた石段へ',()=>state.location>=2]];
  function stats(){const m=Math.floor((state.play||0)/60);const done=achs.filter(a=>a[1]()).length;
    modal('旅の記録',`プレイ時間：${m}分\n歩数：${state.steps||0}\n戦闘：${state.battles}回（勝利 ${state.wins||0}回）\nレベル：${state.level}\n\n【実績】${done}/${achs.length}\n`+achs.map(a=>(a[1]()?'✅ ':'⬜ ')+a[0]).join('\n'),[{label:'閉じる',primary:true,action:closeModal}],'STATS');}
  setInterval(()=>{if(document.visibilityState==='visible'&&$('title')&&$('title').hidden)state.play=(state.play||0)+1;},1000);
  function init(){logEntries=[{time:nowTime(),text:'風が丘を渡り、遠くの石碑が淡く光っている。'},{time:nowTime(),text:'「星紡ぎの旅人」の物語が始まった。'}];renderLog();update();
    document.querySelectorAll('[data-move]').forEach(btn=>btn.addEventListener('click',()=>move(btn.dataset.move)));
    $('chest').addEventListener('click',examineChest);$('chest').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();examineChest();}});
    $('waystone').addEventListener('click',touchStone);$('waystone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();touchStone();}});
    $('exploreBtn').addEventListener('click',explore);$('talkBtn').addEventListener('click',talk);$('battleBtn').addEventListener('click',startBattle);$('restBtn').addEventListener('click',rest);$('mapBtn').addEventListener('click',showMap);$('questBtn').addEventListener('click',questDetails);$('bagBtn').addEventListener('click',bag);
    if($('statsBtn'))$('statsBtn').addEventListener('click',stats);$('saveBtn').addEventListener('click',save);$('loadBtn').addEventListener('click',load);$('modalClose').addEventListener('click',closeModal);$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal();});$('modal').addEventListener('keydown',e=>{if(e.key==='Escape'&&!state.enemy)closeModal();});
    window.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.matches('input,textarea,select,button'))return;const map={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'};if(map[e.key]){e.preventDefault();move(map[e.key]);}else if(e.key===' '){e.preventDefault();explore();}});
    // Keep the first screen useful even when localStorage is blocked.
    if(!window.localStorage){$('saveBtn').disabled=true;$('loadBtn').disabled=true;}
  }
  function startTitle(){
    const t=$('title');if(!t)return;let has=false;try{has=!!localStorage.getItem(SAVE_KEY);}catch(_e){}
    $('titleContinue').disabled=!has;
    $('titleStart').addEventListener('click',()=>{const v=($('titleName').value||'').trim().slice(0,8);state.name=v||'主人公';t.hidden=true;update();log(state.name+'の旅が はじまった。');toast('冒険スタート！');});
    $('titleContinue').addEventListener('click',()=>{load();t.hidden=true;update();});
    $('titleName').value='主人公';
    const en=$('titleEnc');if(en){try{en.value=localStorage.getItem('game6-enc')||'1';}catch(_e){}en.addEventListener('change',()=>{try{localStorage.setItem('game6-enc',en.value);}catch(_e){}});}
  }
  document.addEventListener('DOMContentLoaded',()=>{init();startTitle();});
})();
