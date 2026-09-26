(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const MAX_STAT = 1e90;
  const MAX_RESOURCE = Number.MAX_SAFE_INTEGER;
  const MAX_ENEMY_LEVEL = 999;
  const addResource = (a, b) => Math.min(MAX_RESOURCE, Math.floor(a + b));
  const finiteStat = n => clamp(n, 0, MAX_STAT);
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n) {
    if (!Number.isFinite(n)) return 'MAX';
    const sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n < 1000) return sign + Math.floor(n).toLocaleString('ja-JP');
    let index = Math.floor(Math.log10(n) / 3);
    if (index >= units.length) return sign + n.toExponential(2).replace('e+', 'e');
    let value = n / 1000 ** index;
    let rounded = Number(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2));
    if (rounded >= 1000) { index++; rounded = 1; }
    return sign + rounded + (units[index] || `e${index * 3}`);
  }
  const exact = n => Math.floor(n).toLocaleString('ja-JP');
  const rarityLabels = ['N', 'R', 'SR', 'SSR', 'UR', 'SECRET'];
  const rarityRank = Object.fromEntries(rarityLabels.map((r, i) => [r, i]));
  const rarityRates = [['SECRET', .00001], ['UR', .001], ['SSR', .015], ['SR', .08], ['R', .25], ['N', .65399]];
  const settings = { pauseDuringPacks: true, fxIntensity:'max', autoSlow:true, targetPolicy:'standard', fontScale:'normal', animationPolicy:'luxury',fxFlash:true,fxShake:true,fxParticles:true,fxNumbers:true,speed:1,amount:1,rareOnly:false,newOnly:false };
  const session={mode:'normal',preset:'standard',guest:false,slots:{},saveStatus:'',lastSave:0,records:{},storageReady:false};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function initialState() {
    return {
      world: 1, stage: 1, wave: 1, kills: 0, waveKills: 0, gold: 250, packs: 128,
      hp: 100, maxHp: 100, damage: 10, aps: 2, crit: .1, critMult: 2,
      packChance: .12, splash: 0, goldMult: 1, doubleChance: 0, magnetChance: 0,
      chainChance: 0, inferno: 0, packBonus: 1, infinityChance: 0, infinityProcs: 0,
      armor:0, shield:0, shieldMax:0, regen:0, blockChance:0, aegisCopies:0, chronoSlow:0, starfallCopies:0,
      aegisTimer:0, starfallTimer:0, character:'collector', unlockedCharacters:new Set(['collector']),
      enemyLevel:0, commandSignature:'', counterReadyAt:0,
      debuffs:{slowUntil:0,poisonUntil:0,poisonNextTick:0,poisonDamage:0,jamUntil:0},
      speed: 1, selectedOpen: 1, enemies: [], nextEnemyId: 1, gameTime: 0, effectTime: 0,
      spawnTimer: 0, attackTimer: 0, secondTimer: 0, holeTimer: 0, infernoTimer: 0,
      waveType: 'normal', waveElapsed: 0, waveLimit:45, waveWarning:11, waveTimeouts:0, waveBag: [], bossSpawned: false, bossKilled: false,
      bossSlowUntil: 0, waveSerial: 0, chain: 0, lastKillTime: -10,
      flashPower:0, impactSlowUntil:0, lastImpactSlow:-10, lastImpactWord:-10,
      totalOpened: 0, normalCards: 0, bestRareBatch: 0, cardCounts: {}, discovered: new Set(),
      activeSynergies: new Set(), jackpotUntil: 0, taxPaidUntil: 0,
      manualPause: false, modalOpen: false, lastOpen: null, opening: null,
      toastQueue: [], toastUntil: 0, bannerUntil: 0, hurtUntil: 0, shakeUntil: 0, lastShake: -1,
      supplyUntil: 0, danger: 0, buildDirty: true, synergySignature: '', clickAt: -1,
      ready:true, decisionOpen:false, helpOpen:false, targetId:null, damageHistory:[], lastDefeat:'',
      respawnRemaining:0,
      unlockedEnemyLevel:0,pendingEnemyLevel:null,earnedGold:0,earnedPacks:0,combatSeconds:0,records:{},bossesDefeated:0,
    };
  }
  const state = initialState();
  const el = {};
  for (const id of ['battlefield','enemyZone','effectLayer','damageLayer','worldText','waveText','waveType',
    'bossProgress','progressLabel','killsText','goldText','packText','packBigText','hpBar','hpText','damageText',
    'apsText','critText','luckText','splashText','amountButtons','openBtn','buyPackBtn','demoPackBtn','supplyNotice',
    'packResult','totalOpened','buildList','synergyList','synergyCount','collectionCount','speedBtn','pauseBtn',
    'resetBtn','playerCard','sectorText','enemyCount','buffList','dangerLabel','killChain','waveBanner','synergyToast',
    'pausedLabel','packModal','modalCard','modalTitle','modalKicker','modalSubtitle','modalSummary','rareReveal',
    'rareDrops','packBurst','statChanges','unlockedSynergies','cardDetails','cardRows','detailCount','closeModalBtn',
    'skipBtn','dismissModalBtn','rareOnly','newOnly','playerClass','playerRole','playerEmoji','shieldBar','shieldText',
    'armorText','barrierText','regenText','blockText','characterList','threatLevel','threatPreview',
    'upgradeEnemyBtn','commandNotice','helpTooltip','juiceCanvas','battleFlash','soundBtn','modalSoundBtn','volumeSlider','volumeValue','fxBtn',
    'openMaxBtn','openMaxCount','debuffList','slowDebuff','poisonDebuff','waveClock','waveTimeText','waveTimeBar',
    'bossShieldStatus','directWarning','packStage','packConfetti','packHeroRarity','packHeroName','packHeroCount','packChargeBar','packPhaseLabel']) el[id] = $(id);

  // One lazily-created AudioContext. Short envelopes, category throttles and a voice cap
  // keep a million-pack build from spawning a million sounds. No audio assets or timers.
  function createSoundEngine() {
    let context=null,master=null,compressor=null,noiseBuffer=null,unsupported=false;
    let enabled=true,volume=.35,resuming=false;
    const voices=new Set(),lastPlayed=new Map();
    const limits={shot:.075,hit:.065,crit:.11,kill:.09,explosion:.18,loot:.12,enemy:.18,hurt:.18,shield:.15,counter:.22,chain:.5,boss:.7,wave:.7,ui:.06,open:.2,count:.07,rare:.35,secret:.6,synergy:.5,charge:.5,rupture:.4};
    const stats={played:0,dropped:0,maxVoices:0,contexts:0};
    const voiceLimit=24;
    function updateGain() {
      if(!context)return;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(enabled&&!document.hidden?volume*.7:0,context.currentTime,.018);
    }
    function updateControls() {
      for(const button of [el.soundBtn,el.modalSoundBtn]) {
        button.textContent=unsupported?'SE 非対応':enabled&&volume>0?'🔊 SE ON':'🔇 SE OFF';
        button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'SEをミュート':'SEを有効にする');
        button.disabled=unsupported;
      }
      el.volumeValue.textContent=Math.round(volume*100)+'%';el.volumeSlider.value=Math.round(volume*100);
      el.soundBtn.disabled=unsupported;el.volumeSlider.disabled=unsupported;
    }
    function unlock() {
      if(unsupported||!enabled)return;
      try {
        if(!context) {
          const Audio=window.AudioContext||window.webkitAudioContext;
          if(!Audio){unsupported=true;updateControls();return;}
          context=new Audio();stats.contexts++;
          master=context.createGain();compressor=context.createDynamicsCompressor();
          compressor.threshold.value=-18;compressor.knee.value=18;compressor.ratio.value=8;
          compressor.attack.value=.003;compressor.release.value=.12;
          master.connect(compressor);compressor.connect(context.destination);
          noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.6),context.sampleRate);
          const data=noiseBuffer.getChannelData(0);
          // Independent noise generator: enabling audio never changes gameplay RNG.
          let seed=1234567;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=(seed>>>0)/2147483648-1;}
          updateGain();
        }
        if(context.state==='suspended'&&!resuming) {
          resuming=true;context.resume().then(()=>{resuming=false;updateGain();}).catch(()=>{resuming=false;});
        }
      } catch {unsupported=true;updateControls();}
    }
    function stopAll() {
      for(const voice of voices){try{voice.source.stop();}catch{}voice.cleanup();}
      voices.clear();lastPlayed.clear();
    }
    function tone(frequency,endFrequency,duration=.12,gain=.09,type='triangle',delay=0,noise=false) {
      if(!context||context.state!=='running'||!enabled||volume<=0||document.hidden)return;
      if(voices.size>=voiceLimit){stats.dropped++;return;}
      const at=context.currentTime+delay,envelope=context.createGain();
      const source=noise?context.createBufferSource():context.createOscillator();
      let filter=null;
      if(noise) {
        source.buffer=noiseBuffer;filter=context.createBiquadFilter();filter.type='lowpass';
        filter.frequency.setValueAtTime(frequency,at);filter.frequency.exponentialRampToValueAtTime(Math.max(40,endFrequency),at+duration);
        source.connect(filter);filter.connect(envelope);
      } else {
        source.type=type;source.frequency.setValueAtTime(frequency,at);
        source.frequency.exponentialRampToValueAtTime(Math.max(25,endFrequency),at+duration);source.connect(envelope);
      }
      envelope.gain.setValueAtTime(.0001,at);envelope.gain.exponentialRampToValueAtTime(gain,at+.006);
      envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);envelope.connect(master);
      const voice={source,cleanup:()=>{voices.delete(voice);source.disconnect();envelope.disconnect();if(filter)filter.disconnect();}};
      voices.add(voice);source.onended=voice.cleanup;source.start(at);source.stop(at+duration+.015);
      stats.played++;stats.maxVoices=Math.max(stats.maxVoices,voices.size);
    }
    function play(kind,power=1,character='collector') {
      if(!context||context.state!=='running'||!enabled||volume<=0||document.hidden)return;
      const now=context.currentTime;
      if(now-(lastPlayed.get(kind)??-100)<(limits[kind]??.1)){stats.dropped++;return;}
      lastPlayed.set(kind,now);power=clamp(power,.5,1.5);
      const note=(f,e,d=.12,g=.08,type='triangle',delay=0)=>tone(f,e,d,g*power,type,delay);
      const noise=(f,e,d=.15,g=.1)=>tone(f,e,d,g*power,'triangle',0,true);
      switch(kind) {
        case 'shot': if(character==='ranger'){noise(2100,400,.06,.065);note(360,110,.05,.055,'square');}else if(character==='counter'){noise(650,100,.08,.085);}else{note(character==='nova'?450:850,character==='nova'?100:300,.09,.055);}break;
        case 'hit':note(240,75,.07,.06);noise(1500,350,.055,.025);break;
        case 'crit':note(1400,250,.16,.10,'square');note(90,35,.19,.12,'sine');break;
        case 'kill':note(390,65,.12,.07,'sawtooth');break;
        case 'explosion':noise(1800,80,.3,.2);note(100,30,.32,.18,'sine');break;
        case 'loot':note(1100,1800,.085,.07,'sine');break;
        case 'enemy':note(450,190,.13,.07,'sawtooth');break;
        case 'hurt':noise(700,80,.16,.12);note(170,65,.18,.09,'square');break;
        case 'shield':note(1700,750,.2,.07,'sine');note(2250,1100,.16,.04,'triangle');break;
        case 'counter':noise(2000,150,.2,.13);note(260,65,.17,.1,'square');break;
        case 'chain':[440,554,659,880].forEach((f,i)=>note(f,f*1.1,.15,.075,'triangle',i*.055));break;
        case 'boss':noise(1200,45,.5,.22);[110,82,55].forEach((f,i)=>note(f,f*.75,.3,.12,'sawtooth',i*.1));break;
        case 'wave':note(330,220,.2,.075,'square');note(330,165,.24,.075,'square',.24);break;
        case 'ui':note(720,1050,.055,.045,'sine');break;
        case 'open':noise(500,2800,.18,.11);[330,440,660].forEach((f,i)=>note(f,f*1.4,.15,.075,'triangle',i*.055));break;
        case 'charge':note(110,880,.55,.09,'sine');note(165,1320,.55,.045,'triangle');break;
        case 'rupture':noise(3200,180,.3,.17);note(95,35,.35,.15,'sine');[880,1320,1760].forEach((f,i)=>note(f,f*1.15,.2,.06,'sine',i*.045));break;
        case 'count':note(680+power*260,1200,.04,.025,'square');break;
        case 'rare':[523,659,784,1047].forEach((f,i)=>note(f,f,.23,.085,'sine',i*.07));break;
        case 'secret':noise(1900,100,.45,.12);[261,392,523,659,784,1047].forEach((f,i)=>note(f,f*1.5,.48,.08,'sine',i*.075));break;
        case 'synergy':[392,494,587,784].forEach((f,i)=>note(f,f*1.02,.25,.08,'triangle',i*.08));break;
      }
    }
    return {unlock,play,stopAll,updateControls,
      toggle(){enabled=!enabled;if(!enabled)stopAll();else unlock();updateGain();updateControls();if(enabled)play('ui');},
      setVolume(value){volume=clamp(Number(value),0,1);if(!Number.isFinite(volume))volume=.35;if(volume===0)stopAll();updateGain();updateControls();},
      onVisibility(){if(document.hidden)stopAll();updateGain();},
      inspect:()=>({...stats,enabled,volume,voices:voices.size,voiceLimit,contextState:context?.state||'locked',unsupported}),
      createAnalyser(){if(!context)return null;const analyser=context.createAnalyser();analyser.fftSize=2048;compressor.connect(analyser);return analyser;},
    };
  }
  const sound=createSoundEngine();

  const characterPool=[
    {id:'collector',emoji:'🧙',name:'COLLECTOR',role:'バランス',cost:0,damage:1,aps:1,guard:0,shot:'✦',merit:'補正なし・安定した基本性能',drawback:'特殊攻撃なし',desc:'初期キャラクター。DMG・APSに補正なし。カードビルドの力をそのまま使う。'},
    {id:'counter',emoji:'🥊',name:'BRAWLER',role:'カウンター',cost:750,damage:.85,aps:.65,guard:.35,shot:'👊',merit:'軽減35% / 範囲反撃 ×4',drawback:'通常DMG −15% / APS −35%',desc:'被ダメージ35%軽減。被弾・ガード・シールド吸収時、攻撃元へDMG ×4の範囲反撃（0.6秒間隔）。弱点：通常DMG ×0.85 / APS ×0.65。反撃の機会が少ないと時間制限に苦戦。'},
    {id:'nova',emoji:'🧝‍♀️',name:'NOVA',role:'広範囲',cost:2000,damage:1.2,aps:.65,guard:0,shieldScale:.6,shot:'🔮',merit:'広域爆発120% / DMG +20%',drawback:'APS −35% / SHIELD容量 −40%',desc:'すべての通常攻撃が着弾地点の広範囲へ120%ダメージ。DMG ×1.2。弱点：APS ×0.65、BARRIER・AEGISを含むシールド容量 ×0.6。群れに強いが、守りと手数が薄い。'},
    {id:'ranger',emoji:'🤠',name:'RANGER',role:'射撃',cost:5000,damage:.75,aps:1.9,guard:0,incoming:1.35,shot:'➤',merit:'2体射撃 / APS +90% / 射手優先',drawback:'DMG −25% / 被ダメージ +35%',desc:'遠距離・直撃敵を優先し、毎回2体へ射撃（2体目は65%威力）。APS ×1.9。弱点：DMG ×0.75、被ダメージ ×1.35（毒も含む）。シールドと軽減の前に倍率を適用。'},
  ];
  const currentCharacter=()=>characterPool.find(c=>c.id===state.character);
  const shieldCapacity=()=>finiteStat((state.shieldMax+state.maxHp*Math.min(10,state.aegisCopies*.5))*(currentCharacter().shieldScale||1));
  const enemyModifiers=(level=state.enemyLevel)=>{
    const early=Math.min(30,level),late=Math.max(0,level-30);
    return {hp:3**early*1.16**late,attack:1.12**early*1.04**late,gold:1.6**early*1.012**late,packs:1.25**early*1.008**late};
  };
  const enemyDamage=(amount,enemy)=>finiteStat(amount*1.75*enemyModifiers().attack*(enemy?.elite?1.4:1)*(enemy?.berserk&&enemy.enraged?1.5:1)*(enemy?enemyLinkEffects(enemy).attack:1));
  const enemyUpgradeCost=(level=Math.max(state.enemyLevel,state.unlockedEnemyLevel))=>Math.floor(500*1.8**Math.min(30,level)*(1+Math.max(0,level-30)/20)**2);
  function upgradeQuote(amount=1) {
    const from=Math.max(state.enemyLevel,state.unlockedEnemyLevel),limit=amount==='max'?MAX_ENEMY_LEVEL:Math.min(MAX_ENEMY_LEVEL,from+amount);
    let to=from,cost=0;
    while(to<limit&&cost+enemyUpgradeCost(to)<=state.gold){cost+=enemyUpgradeCost(to);to++;}
    return {from,to,count:to-from,cost};
  }
  function rescaleEnemies(level) {
    for(const enemy of state.enemies) {
      const hpRatio=enemy.hp/enemy.maxHp,shieldRatio=enemy.shieldMax?enemy.shield/enemy.shieldMax:0,shieldScale=enemy.shieldMax/enemy.maxHp;
      enemy.maxHp=finiteStat(enemy.baseHp*enemyModifiers(level).hp);enemy.hp=enemy.maxHp*hpRatio;
      enemy.shieldMax=finiteStat(enemy.maxHp*shieldScale);enemy.shield=enemy.shieldMax*shieldRatio;positionEnemy(enemy);
    }
  }
  function selectCharacter(id) {
    if(state.modalOpen)return false;
    const character=characterPool.find(c=>c.id===id);if(!character)return false;
    if(!state.unlockedCharacters.has(id)) {
      if(state.gold<character.cost)return false;
      state.gold-=character.cost;state.unlockedCharacters.add(id);
      el.commandNotice.textContent=`${character.emoji} ${character.name} 解放！ ${exact(character.cost)} GOLDを使用。`;
    } else el.commandNotice.textContent=`${character.emoji} ${character.name} に交代しました。`;
    state.character=id;state.shield=Math.min(state.shield,shieldCapacity());sound.play('synergy',.8);emitBurst(86,48,'#d6ff73',28,1);saveProgress();renderUI();return true;
  }
  function upgradeEnemies(amount=1) {
    const quote=upgradeQuote(amount);
    if(state.modalOpen||!quote.count)return false;
    state.gold-=quote.cost;state.enemyLevel=quote.to;state.unlockedEnemyLevel=quote.to;state.pendingEnemyLevel=null;rescaleEnemies(quote.to);
    el.commandNotice.textContent=`OVERDRIVE +${quote.count} → Lv.${state.enemyLevel} / ${exact(quote.cost)} GOLD`;
    resetEconomy();showBanner('ENEMY OVERDRIVE',`Lv.${state.enemyLevel} / 敵と報酬が強化されました`);sound.play('boss',.7);battleFlash('#ff8899',.12);saveProgress();renderUI();return true;
  }

  // Compress very large stacks instead of overflowing Number. Bulk and split opens agree.
  function stackMultiplier(id, count, factor) {
    const previous = state.cardCounts[id] || 0;
    const effective = 36 * Math.log1p(count / (36 + previous));
    return Math.exp(Math.min(200, Math.log(factor) * effective));
  }
  function multiplyStat(key, id, count, factor) {
    state[key] = finiteStat(state[key] * stackMultiplier(id, count, factor));
  }
  const cardPool = [
    {id:'power',rarity:'N',emoji:'⚔️',name:'POWER',desc:'DMG +10% / 大量取得で緩やかに成長',apply:n=>multiplyStat('damage','power',n,1.1)},
    {id:'haste',rarity:'N',emoji:'⚡',name:'HASTE',desc:'APS +8% / 基礎APS上限30',apply:n=>{multiplyStat('aps','haste',n,1.08);state.aps=Math.min(30,state.aps);}},
    {id:'greed',rarity:'N',emoji:'🪙',name:'GREED',desc:'GOLD獲得 +10%',apply:n=>{state.goldMult=finiteStat(state.goldMult+.1*n);}},
    {id:'luck',rarity:'R',emoji:'🍀',name:'LUCK',desc:'PACK率 +1.5pt / 上限95%',apply:n=>{state.packChance=Math.min(.95,state.packChance+.015*n);}},
    {id:'crit',rarity:'R',emoji:'💥',name:'CRIT',desc:'CRIT率 +1pt / 上限90%',apply:n=>{state.crit=Math.min(.9,state.crit+.01*n);}},
    {id:'aim',rarity:'R',emoji:'🎯',name:'AIM',desc:'CRIT倍率 +0.1',apply:n=>{state.critMult=finiteStat(state.critMult+.1*n);}},
    {id:'splash',rarity:'SR',emoji:'💣',name:'SPLASH',desc:'周辺への範囲ダメージ +4pt / 上限100%',apply:n=>{state.splash=Math.min(1,state.splash+.04*n);}},
    {id:'vital',rarity:'SR',emoji:'❤️',name:'VITAL',desc:'最大HP +8 / 同量回復',apply:n=>{state.maxHp=finiteStat(state.maxHp+8*n);state.hp=Math.min(state.maxHp,state.hp+8*n);}},
    {id:'double',rarity:'SR',emoji:'🔁',name:'DOUBLE',desc:'追加攻撃率 +2pt / 上限65%',apply:n=>{state.doubleChance=Math.min(.65,state.doubleChance+.02*n);}},
    {id:'berserk',rarity:'SSR',emoji:'🔥',name:'BERSERK',desc:'DMG +35% / 大量取得で緩やかに成長',apply:n=>multiplyStat('damage','berserk',n,1.35)},
    {id:'storm',rarity:'SSR',emoji:'🌩️',name:'STORM',desc:'APS +25% / 基礎APS上限30',apply:n=>{multiplyStat('aps','storm',n,1.25);state.aps=Math.min(30,state.aps);}},
    {id:'magnet',rarity:'SSR',emoji:'🧲',name:'MAGNET',desc:'PACK獲得時 +1個の確率 +3pt / 上限80%',apply:n=>{state.magnetChance=Math.min(.8,state.magnetChance+.03*n);}},
    {id:'chain',rarity:'SSR',emoji:'☠️',name:'CHAIN',desc:'撃破時、別の敵へ60%DMG / 発動率+4pt',apply:n=>{state.chainChance=Math.min(.8,state.chainChance+.04*n);}},
    {id:'kingmaker',rarity:'UR',emoji:'👑',name:'KINGMAKER',desc:'DMG ×1.8 / 大量取得で緩やかに成長',apply:n=>multiplyStat('damage','kingmaker',n,1.8)},
    {id:'inferno',rarity:'UR',emoji:'🌋',name:'INFERNO',desc:'2秒ごとに炎爆発 / 威力+35%',apply:n=>{state.inferno=finiteStat(state.inferno+.35*n);}},
    {id:'jackpot',rarity:'UR',emoji:'🎰',name:'JACKPOT',desc:'PACK獲得数 +20% / 確率で端数を獲得',apply:n=>{state.packBonus=finiteStat(state.packBonus+.2*n);}},
    {id:'void',rarity:'SECRET',emoji:'🕳️',name:'VOID',desc:'DMG ×2.2 / APS ×1.35 / PACK・範囲強化',apply:n=>{multiplyStat('damage','void',n,2.2);multiplyStat('aps','void',n,1.35);state.aps=Math.min(30,state.aps);state.packChance=Math.min(.95,state.packChance+.05*n);state.splash=Math.min(1,state.splash+.1*n);}},
    {id:'prism',rarity:'SECRET',emoji:'🌈',name:'PRISM',desc:'DMG ×2 / CRIT倍率+1 / PACK獲得数+50%',apply:n=>{multiplyStat('damage','prism',n,2);state.critMult=finiteStat(state.critMult+n);state.packBonus=finiteStat(state.packBonus+.5*n);}},
    {id:'infinity',rarity:'SECRET',emoji:'♾️',name:'INFINITY',desc:'0.5%でDMG ×10 / 発動ごと確率+0.01pt',apply:n=>{state.infinityChance=Math.min(.25,state.infinityChance+.005*n);}},
    {id:'armor',rarity:'N',emoji:'🛡️',name:'ARMOR',desc:'被ダメージ軽減 +1.5pt / カード分上限60%',apply:n=>{state.armor=Math.min(.6,state.armor+.015*n);}},
    {id:'barrier',rarity:'R',emoji:'🔷',name:'BARRIER',desc:'シールド上限 +12 / 同量補充 / 毎秒上限の4%を再生',apply:n=>{state.shieldMax=finiteStat(state.shieldMax+12*n);state.shield=Math.min(shieldCapacity(),finiteStat(state.shield+12*n));}},
    {id:'regen',rarity:'SR',emoji:'🌿',name:'REGEN',desc:'毎秒回復 +最大HPの0.25% / 追加分上限5%',apply:n=>{state.regen=Math.min(.05,state.regen+.0025*n);}},
    {id:'parry',rarity:'SSR',emoji:'🤺',name:'PARRY',desc:'攻撃を完全ガードする確率 +2pt / 上限40%',apply:n=>{state.blockChance=Math.min(.4,state.blockChance+.02*n);}},
    {id:'aegis',rarity:'SECRET',emoji:'🏰',name:'AEGIS CORE',desc:'シールド上限 +最大HPの50% / 最大10倍HP / 6秒ごと全補充',apply:n=>{const before=shieldCapacity();state.aegisCopies=addResource(state.aegisCopies,n);state.shield=Math.min(shieldCapacity(),finiteStat(state.shield+shieldCapacity()-before));}},
    {id:'chrono',rarity:'SECRET',emoji:'⏳',name:'CHRONO',desc:'敵の移動・射撃準備を5%遅くする / 上限50%',apply:n=>{state.chronoSlow=Math.min(.5,state.chronoSlow+.05*n);}},
    {id:'starfall',rarity:'SECRET',emoji:'☄️',name:'STARFALL',desc:'4秒ごと最大3体へ隕石 / 1枚につきDMG ×3の範囲爆発',apply:n=>{state.starfallCopies=addResource(state.starfallCopies,n);}},
  ];
  const cardsByRarity = Object.fromEntries(rarityLabels.map(r => [r, cardPool.filter(c => c.rarity === r)]));
  const byId = Object.fromEntries(cardPool.map(c => [c.id, c]));
  const synergyPool = [
    {id:'apocalypse',emoji:'🌋',name:'APOCALYPSE',requires:{berserk:5,splash:5},description:'撃破時35%で大爆発。爆発キルでも連鎖。'},
    {id:'thunderstorm',emoji:'⚡',name:'THUNDERSTORM',requires:{storm:4,crit:8},description:'CRITが別の敵2体へ70%の雷ダメージ。'},
    {id:'packAddict',emoji:'📦',name:'PACK ADDICT',requires:{luck:10},extra:()=>state.totalOpened/1000,extraLabel:'累計開封1,000',description:'累計100開封ごとにDMG +1%。'},
    {id:'kingsTax',emoji:'👑',name:"KING'S TAX",requires:{kingmaker:2},extra:()=>state.gold/10000,extraLabel:'所持GOLD 10,000',description:'毎秒最大100 GOLDを支払いDMG ×2。GOLDが0で停止。'},
    {id:'eventHorizon',emoji:'🕳️',name:'EVENT HORIZON',requires:{void:1,splash:10},description:'6秒ごとに重力井戸。2秒間吸引し、大爆発。'},
    {id:'lastStand',emoji:'❤️',name:'LAST STAND',requires:{vital:8,berserk:3},description:'HP30%以下でAPS ×2、DMG ×1.5。回復で解除。'},
    {id:'trashKing',emoji:'🐀',name:'TRASH KING',requires:{},extra:()=>state.normalCards/1000,extraLabel:'Nカード累計1,000枚',description:'Nカード100枚ごとにDMG +5%。'},
    {id:'jackpot',emoji:'🌈',name:'JACKPOT',requires:{},extra:()=>state.bestRareBatch/10,extraLabel:'一度の開封でUR以上10枚',description:'条件を満たす開封ごとに15秒間PACK DROP ×3。'},
  ];
  const active = id => state.activeSynergies.has(id);
  const isLastStand = () => active('lastStand') && state.hp <= state.maxHp * .3;
  const isTaxActive = () => active('kingsTax') && state.gold > 0 && state.taxPaidUntil > state.gameTime;
  const isJackpot = () => state.jackpotUntil > state.gameTime;
  const isPaused = () => state.respawnRemaining>0 || !state.ready || state.helpOpen || state.decisionOpen || state.manualPause || (state.modalOpen && settings.pauseDuringPacks);
  const isSlowed = () => state.debuffs.slowUntil>state.gameTime;
  const isPoisoned = () => state.debuffs.poisonUntil>state.gameTime;
  const isJammed = () => state.debuffs.jamUntil>state.gameTime;
  function snapshotStats() {
    let damage = state.damage;
    if (active('packAddict')) damage *= 1 + Math.floor(state.totalOpened/100)*.01;
    if (active('trashKing')) damage *= 1 + Math.floor(state.normalCards/100)*.05;
    if (isTaxActive()) damage *= 2;
    if (isLastStand()) damage *= 1.5;
    const character=currentCharacter();
    return {damage:finiteStat(damage*character.damage),aps:Math.min(60,state.aps*character.aps*(isLastStand()?2:1))*(isSlowed()?.7:1),crit:state.crit,
      packChance:Math.min(1,state.packChance*(isJackpot()?3:1)),splash:state.splash,maxHp:state.maxHp,
      armor:1-(1-state.armor)*(1-character.guard),shieldMax:shieldCapacity(),
      regen:(Math.max(.4,state.maxHp*.002)+state.maxHp*state.regen)*(isPoisoned()?.5:1),blockChance:state.blockChance};
  }
  function synergyProgress(s) {
    const parts=Object.entries(s.requires).map(([id,n])=>Math.min(1,(state.cardCounts[id]||0)/n));
    if(s.extra) parts.push(clamp(s.extra(),0,1));
    return parts.length ? parts.reduce((a,b)=>a+b,0)/parts.length : 1;
  }
  function checkSynergies() {
    const unlocked=[];
    for(const synergy of synergyPool) {
      if(!active(synergy.id) && synergyProgress(synergy)>=1) {
        state.activeSynergies.add(synergy.id);unlocked.push(synergy.id);state.toastQueue.push(synergy);
        if(synergy.id==='kingsTax') payKingsTax();
      }
    }
    return unlocked;
  }
  function payKingsTax() {
    if(!active('kingsTax') || state.gold<=0) return;
    state.gold=Math.max(0,state.gold-Math.min(state.gold,100));
    state.taxPaidUntil=state.gameTime+1.05;
  }

  const enemyCatalog = [
    {emoji:'🐀',hp:20,speed:8.5,gold:4,size:38},{emoji:'🐍',hp:28,speed:6.5,gold:5,size:42},
    {emoji:'🦇',hp:24,speed:9,gold:5,size:38},{emoji:'👻',hp:42,speed:6,gold:7,size:44},
    {emoji:'💀',hp:58,speed:5.5,gold:9,size:44},{emoji:'👹',hp:90,speed:5,gold:13,size:50},
    {emoji:'🤖',hp:120,speed:4.6,gold:18,size:48},{emoji:'👽',hp:155,speed:5,gold:20,size:48},
    {id:'archer',name:'BONE ARCHER',emoji:'🏹',hp:34,speed:6,gold:8,size:42,ranged:true,shot:'➤',cooldown:2.5,stopX:43,attack:7},
    {id:'warlock',name:'HEX CASTER',emoji:'🧛',hp:65,speed:5,gold:14,size:45,ranged:true,shot:'🔮',cooldown:3.2,stopX:34,attack:13,debuff:'slow'},
    {id:'piercer',name:'VOID LANCER',emoji:'🦑',hp:80,speed:5.5,gold:19,size:46,ranged:true,shot:'⟐',cooldown:3.4,stopX:40,attack:16,pierce:.6},
    {id:'plague',name:'PLAGUE SHAMAN',emoji:'🧟',hp:75,speed:4.7,gold:18,size:46,ranged:true,shot:'🧪',cooldown:4.4,stopX:31,attack:10,debuff:'poison'},
    {id:'assassin',name:'PHASE ASSASSIN',emoji:'🥷',hp:70,speed:7,gold:23,size:44,ranged:true,direct:true,cooldown:4.8,stopX:29,attack:18,pierce:1},
    {id:'bomber',name:'NITRO IMP',emoji:'💣',hp:18,speed:32,gold:12,size:37,bomber:true,attack:28},
    {id:'medic',name:'BLOOM MEDIC',emoji:'🪷',hp:90,speed:4.6,gold:24,size:44,ranged:true,support:'heal',cooldown:4.5,stopX:33,attack:0,desc:'4.5秒ごとに近くの負傷した仲間3体を12%回復（ボスは4%）。自分は回復しない。1秒の回復予告中に倒すと阻止。'},
    {id:'summoner',name:'GRAVE CALLER',emoji:'🪦',hp:110,speed:4.2,gold:30,size:46,ranged:true,support:'summon',cooldown:5.5,stopX:27,attack:0,desc:'5.5秒ごとに雑兵2体を召喚、1体の術者につき最大4体。雑兵は報酬・WAVE目標に含まれない。術者を倒すと配下も消滅。'},
    {id:'siphon',name:'SHIELD LEECH',emoji:'🪫',hp:85,speed:5.8,gold:25,size:43,ranged:true,shot:'⚡',cooldown:3.6,stopX:41,attack:12,shieldDrain:.25,desc:'命中時、先にプレイヤーの防壁最大値の25%を削り、その後に通常ダメージ。防壁がない場合は通常ダメージだけ。完全ガードで両方を防げる。'},
    {id:'boar',name:'RAGE BOAR',emoji:'🐗',hp:125,speed:5,gold:28,size:49,armor:.55,berserk:true,desc:'装甲で被ダメージ55%軽減。HP45%以下で装甲を捨て、移動2.5倍・接触威力1.5倍に激昂。激昂後は集中攻撃で倒す。'},
    {id:'thrall',name:'BONE THRALL',emoji:'🦴',hp:16,speed:12,gold:0,size:30,summoned:true,desc:'GRAVE CALLERの召喚雑兵。報酬とWAVE目標加算なし。術者を倒すと一緒に消滅。'},
    {id:'warden',name:'AEGIS WARDEN',emoji:'🗿',hp:150,speed:4,gold:36,size:48,ranged:true,support:'shield',cooldown:6,stopX:32,desc:'6秒ごとに近くの仲間3体へ最大HPの20%分の防壁を補充（上限35%、ボスは上限を変更せず5%補充）。1秒の予告中に倒して阻止。'},
    {id:'splitter',name:'SPLIT JELLY',emoji:'🪼',hp:100,speed:7,gold:31,size:48,splitter:true,desc:'倒すと高速の小クラゲ2体に分裂。小クラゲは報酬・WAVE目標加算なし、再分裂もしない。範囲攻撃でまとめて処理。'},
    {id:'shard',name:'JELLY SHARD',emoji:'🫧',hp:22,speed:22,gold:0,size:29,summoned:true,desc:'分裂した小クラゲ。高速で接近する。報酬・WAVE目標加算なし、再分裂なし。'},
    {id:'jammer',name:'STATIC JAMMER',emoji:'📡',hp:85,speed:5,gold:35,size:44,ranged:true,shot:'〰',cooldown:4,stopX:35,attack:11,debuff:'jam',desc:'電波弾が命中すると3秒間、防壁の自然回復とAEGISの補充準備を停止。HP回復・攻撃・開封による防壁補充は有効。完全ガードで防止。'},
    {id:'sniper',name:'RAIL SNIPER',emoji:'🎯',hp:65,speed:4.8,gold:38,size:43,ranged:true,shot:'➠',cooldown:6,stopX:19,attack:38,pierce:.4,sniper:true,desc:'1.5秒の照準予告後に高威力の単発弾。防壁を40%貫通。攻撃間隔6秒、HPは低い。予告中の集中攻撃で倒そう。'},
    {id:'haste',name:'WAR DRUMMER',emoji:'🥁',hp:115,speed:4.5,gold:34,size:45,ranged:true,support:'haste',cooldown:5,stopX:30,desc:'5秒ごとに周囲の仲間へ3秒間の移動・攻撃準備速度1.6倍を付与。重複せず時間更新。1秒の予告中に倒して阻止。'},
    {id:'relay',name:'RAIL CONDUCTOR',emoji:'🧲',hp:95,speed:4.8,gold:40,size:45,ranged:true,shot:'⚡',cooldown:4.8,stopX:28,attack:9,linkRole:'rail',desc:'周囲に攻撃型の射手が2体以上いると「電磁射線」。周囲の射手（ボス・支援役以外）の攻撃準備1.3倍、弾の防壁貫通+20pt（最大85%）。'},
    {id:'brood',name:'BROOD MATRON',emoji:'🐝',hp:140,speed:4,gold:42,size:48,ranged:true,support:'brood',cooldown:6,stopX:31,linkRole:'brood',desc:'6秒ごとに雑兵1体を召喚、配下最大3体。周囲に召喚雑兵が2体以上いると「群体凶暴」：雑兵の移動1.3倍・攻撃1.5倍。女王の撃破で自身の配下も消滅。'},
    {id:'prism',name:'PRISM ANCHOR',emoji:'💠',hp:130,speed:4.4,gold:43,size:45,ranged:true,support:'anchor',cooldown:7,stopX:34,linkRole:'prism',desc:'周囲にAEGIS WARDENか堡塁ボスがいると「共鳴防壁」。周囲の防壁を持つ仲間の被ダメージを30%軽減。防壁がなくなるか結晶・防壁役を倒すと解除。'},
    {id:'beacon',name:'CURSE BEACON',emoji:'🕯️',hp:90,speed:4.7,gold:41,size:45,ranged:true,shot:'✧',cooldown:5,stopX:30,attack:9,debuff:'slow',linkRole:'curse',desc:'周囲に別のデバフ敵がいると「呪いの連鎖」。プレイヤーが毒・鈍足・防壁回復停止中、周囲の敵の攻撃威力1.35倍（毒の継続ダメージを再増幅しない）。'},
  ];
  const bossCatalog=['👹','🐲','🐙','👁️','🤖','🌞','🕳️'];
  const bossProfiles=[
    {id:'bastion',name:'堡塁王',emoji:'🏰',skill:'防壁再装填',interval:9,escorts:['warden','prism'],desc:'9秒ごとに防壁を最大HPの15%補充（最大3回）。防壁役＋結晶の共鳴で硬くなる。',hint:'先に💠結晶→🗿防壁役を倒す。特殊行動の予告中にボス防壁を割ると中断し、3秒間ボスへのダメージ1.35倍。'},
    {id:'swarm',name:'群体皇后',emoji:'🐝',skill:'群体招集',interval:8,escorts:['brood','haste'],desc:'8秒ごとに雑兵3体を呼ぶ。ボスの配下は最大6体。女王の凶暴化と鼓手の加速が重なる。',hint:'🐝女王を先に倒して群体凶暴を解除。範囲攻撃で雑兵を一掃。予告中のボス防壁破壊で招集を阻止できる。'},
    {id:'oracle',name:'虚眼の審判者',emoji:'👁️',skill:'虚空裁定',interval:10,escorts:['beacon','jammer'],desc:'10秒ごとに防壁80%貫通の直撃＋3秒間の防壁回復停止。通常弾幕も35%貫通。呪い役とジャマーが火力を支える。',hint:'🕯️呪い役を倒して状態異常中の被害増を止める。軽減・完全ガードを用意。予告中にボス防壁を割って直撃を阻止。'},
  ];
  const commonNames=['RUST RAT','VENOM SNAKE','NIGHT BAT','LOST GHOST','BONE WALKER','ONI BRUTE','IRON WALKER','VOID SCOUT'];
  enemyCatalog.slice(0,8).forEach((e,i)=>{e.id='front'+i;e.name=commonNames[i];e.desc='前衛の接触型。右端に到達するとダメージ。WORLDとSTAGEが進むにつれて強い前衛が混ざる。';});
  const enemyLinkCatalog=[
    {id:'rail',name:'電磁射線',emoji:'🧲',condition:'中継役＋攻撃型の射手2体以上（中継役以外）',effect:'範囲内の射手：攻撃準備×1.3、防壁貫通+20pt（上限85%）。ボス・支援役・直撃敵は対象外。',hint:'🧲中継役を優先。射手を減らして2体未満にしても解除。'},
    {id:'brood',name:'群体凶暴',emoji:'🐝',condition:'女王＋召喚雑兵2体以上',effect:'範囲内の雑兵：移動×1.3、攻撃×1.5。召喚役の雑兵と分裂クラゲの子も対象。',hint:'🐝女王を先に倒す。密集にはNOVAやSPLASH。'},
    {id:'prism',name:'共鳴防壁',emoji:'💠',condition:'結晶＋防壁役または堡塁王',effect:'範囲内で防壁が残る仲間：被ダメージ30%軽減。防壁が切れると軽減も解除。',hint:'防壁のない💠結晶を狙う。回復役がいる場合も結晶を先に処理。'},
    {id:'curse',name:'呪いの連鎖',emoji:'🕯️',condition:'呪い役＋別のデバフ敵',effect:'プレイヤーが毒・鈍足・防壁回復停止中、範囲内の敵の攻撃×1.35。継続毒は再増幅しない。',hint:'🕯️呪い役を優先。PARRYはデバフの付与も防ぐ。'},
  ];
  const nearEnemy=(a,b,radius=38)=>Math.hypot(a.x-b.x,(a.y-b.y)*.6)<radius;
  function activeEnemyLinks() {
    return state.enemies.filter(e=>e.alive&&e.linkRole).flatMap(source=>{
      const allies=state.enemies.filter(e=>e.alive&&e!==source&&nearEnemy(source,e));
      const role=source.linkRole,enabled=role==='rail'?allies.filter(e=>e.ranged&&!e.support&&!e.direct&&!e.boss&&e.type!=='relay').length>=2:role==='brood'?allies.filter(e=>e.summoned).length>=2:role==='prism'?allies.some(e=>e.support==='shield'||e.bossProfile==='bastion'):allies.some(e=>e.debuff);
      return enabled?[{source,role,info:enemyLinkCatalog.find(c=>c.id===role)}]:[];
    });
  }
  function enemyLinkEffects(enemy,links=activeEnemyLinks()) {
    const roles=new Set(links.filter(link=>nearEnemy(link.source,enemy)).map(link=>link.role));
    const rail=roles.has('rail')&&enemy.ranged&&!enemy.support&&!enemy.direct&&!enemy.boss;
    return {shotSpeed:rail?1.3:1,pierce:rail?.2:0,move:roles.has('brood')&&enemy.summoned?1.3:1,
      attack:(roles.has('brood')&&enemy.summoned?1.5:1)*(roles.has('curse')&&(isSlowed()||isPoisoned()||isJammed())?1.35:1),guard:roles.has('prism')&&enemy.shield>0?.3:0};
  }
  const enemyHints={archer:'接近してこない射手も残すと危険。RANGERか固定照準で先に倒す。',warlock:'鈍足でWAVE時間が厳しくなる。毒・呪い役と並んだら優先。',piercer:'防壁だけに頼らずARMORやPARRYも使う。',plague:'毒は回復も妨げる。状態異常中は呪い役との組み合わせに注意。',assassin:'1秒の直撃予告中に固定照準。防壁100%貫通に注意。',bomber:'接近したら最優先。NOVAや範囲攻撃で群れごと消す。',medic:'回復役を放置するとボスが長引く。回復予告中に倒す。',summoner:'雑兵より召喚主を狙う。主が倒れると自身の配下も消える。',siphon:'防壁の量だけでは解決しない。完全ガードと早期撃破を併用。',boar:'激昂で装甲が外れたら集中攻撃。高速突進を見送らない。',thrall:'単体報酬なし。術者の撃破か範囲攻撃でまとめて処理。',warden:'結晶がいると共鳴防壁になる。結晶→防壁役の順に崩す。',splitter:'撃破後にも敵が残る。範囲攻撃の追撃を用意。',shard:'女王と鼓手の組み合わせで高速化する。群れごと処理。',jammer:'防壁補充が止まる3秒を、HPと軽減で耐える。PARRYで付与を防げる。',sniper:'1.5秒の予告が狙い目。中継役と並ぶと射撃頻度と貫通率が上がる。',haste:'雑兵や自爆敵を加速する。女王や召喚役とセットなら早めに倒す。',relay:'中継役そのものを固定照準。射手を2体未満にする方法も有効。',brood:'別の召喚主の雑兵も強化する。女王の撃破で群体凶暴を解除。',prism:'共鳴の中心を倒すと仲間の軽減が即解除。盾が張られる前が狙い目。',beacon:'状態異常がついてからの追撃が痛い。呪い役を先に倒して火力増加を止める。'};
  function enemyDescription(e){return e.desc||(e.direct?'予告付きで防壁100%貫通の直撃。':e.bomber?'超高速で接近し、0.55秒の導火線後に自爆。':`${e.cooldown}秒ごとに遠距離攻撃。`+(e.debuff==='slow'?'命中で5秒間APS30%低下。':e.debuff==='poison'?'6秒間の毒＋HP回復半減。':e.pierce?'防壁60%貫通。':''));}
  const strategyHints=[
    ['開封→出撃','最初の128パックをMAX開封。カードは即反映。敵に負けた10秒の待機中にも強化できる。'],
    ['先に連携の中心を倒す','🧲中継役・🐝女王・💠結晶・🕯️呪い役を固定照準。条件が崩れると連携は即解除。同種の連携は重複しない。効果範囲は中心から38（画面座標）未満。'],
    ['予告を利用する','危険時の自動減速を有効に。ボスの特殊行動は1.5秒予告、予告中の防壁破壊で中断＋3秒間被ダメージ1.35倍。'],
    ['ボスの支援役を掃除','堡塁王は結晶と防壁役、群体皇后は女王と鼓手、虚眼は呪い役とジャマーが随伴。討伐するとそのボスの随伴と配下は消える。'],
    ['防壁だけで受けない','直撃・貫通・防壁吸収・回復停止がある。ARMOR・PARRY・HPも育てる。毒の継続ダメージには完全ガード不可。'],
    ['キャラの弱点を補う','密集にはNOVA、射手にはRANGER、被弾反撃ならBRAWLER。交代の比較で防壁・被ダメージの変化を確認。'],
    ['敵強化は戻せる','Lv.999まで解放できるがHPも上がる。倒し切れないなら解放済みの低いLvへ予約変更。次WAVEから無料で適用。'],
  ];
  const fxLimits={projectile:40,damage:60,particle:80};
  const effects={projectile:[],damage:[],particle:[]};
  const juiceParticles=[],juiceLimit=360,juiceStats={maxParticles:0};
  const juiceContext=el.juiceCanvas.getContext('2d');
  let visualSeed=937;
  const fxRandom=()=>{visualSeed=(Math.imul(visualSeed,1664525)+1013904223)|0;return (visualSeed>>>0)/4294967296;};
  const fxScale=()=>reducedMotion.matches?.12:settings.fxIntensity==='low'?.3:1;
  let deaths=[],processingDeaths=false,holes=[],returnFocus=null;
  let fieldSize={width:1000,height:355};
  const resizeObserver=new ResizeObserver(entries=>{
    const r=entries[0].contentRect;fieldSize={width:r.width,height:r.height};
    const dpr=Math.min(2,window.devicePixelRatio||1);
    el.juiceCanvas.width=Math.round(r.width*dpr);el.juiceCanvas.height=Math.round(r.height*dpr);
    juiceContext?.setTransform(dpr,0,0,dpr,0,0);
  });
  resizeObserver.observe(el.battlefield);
  function maxEnemies() { return state.world>=10?36:([12,16,20,23,26][state.world-1]||26+(state.world-5)*2); }
  const worldScale=()=>Math.min(1e75,1.8*Math.pow(1.9,Math.min(state.world-1,270))*(1+(state.stage-1)*.38));
  const targetWaveKills=()=>18+state.stage*4+Math.min(state.world,40)*2;
  function addJuice(particle) {
    if(!juiceContext)return;
    if(juiceParticles.length>=juiceLimit)juiceParticles.shift();
    juiceParticles.push(particle);juiceStats.maxParticles=Math.max(juiceStats.maxParticles,juiceParticles.length);
  }
  function emitBurst(x,y,color='#ffd276',count=16,energy=1) {
    if(!settings.fxParticles)return;
    const scale=fxScale();
    for(let i=0;i<Math.ceil(count*scale);i++) {
      const angle=fxRandom()*Math.PI*2,speed=(60+fxRandom()*180)*energy*(reducedMotion.matches?.2:1);
      addJuice({kind:'spark',x:x*fieldSize.width/100,y:y*fieldSize.height/100,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        color,size:1.3+fxRandom()*2.8,life:.22+fxRandom()*.4,maxLife:.62,gravity:85});
    }
  }
  function shockwave(x,y,color='#ffc773',radius=110) {
    if(reducedMotion.matches||!settings.fxParticles)return;
    addJuice({kind:'ring',x:x*fieldSize.width/100,y:y*fieldSize.height/100,color,radius:radius*fxScale(),life:.42,maxLife:.42});
  }
  function battleFlash(color='#ffd276',strength=.18) {
    if(!settings.fxFlash)return;
    state.flashPower=Math.max(state.flashPower,Math.min(.22,strength)*fxScale());el.battleFlash.style.background=color;
  }
  function impactWord(text,x,y,color='#ffe1a6') {
    if(state.effectTime-state.lastImpactWord<.3||reducedMotion.matches||!settings.fxParticles)return;
    state.lastImpactWord=state.effectTime;const fx=addFx('particle','combat-word',text,x,y,.5);fx.el.style.color=color;
  }
  function impactSlow(duration=.055) {
    if(reducedMotion.matches||state.effectTime-state.lastImpactSlow<.5)return;
    state.lastImpactSlow=state.effectTime;state.impactSlowUntil=state.effectTime+duration;
  }
  function updateJuice(dt) {
    if(!juiceContext)return;
    const ctx=juiceContext;ctx.clearRect(0,0,fieldSize.width,fieldSize.height);ctx.globalCompositeOperation='lighter';
    for(let i=juiceParticles.length-1;i>=0;i--) {
      const p=juiceParticles[i];p.life-=dt;if(p.life<=0){juiceParticles.splice(i,1);continue;}
      ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.strokeStyle=p.color;ctx.fillStyle=p.color;
      if(p.kind==='ring') {
        const radius=5+p.radius*(1-p.life/p.maxLife);ctx.lineWidth=2+p.life*5;
        ctx.beginPath();ctx.ellipse(p.x,p.y,radius,radius*.6,0,0,Math.PI*2);ctx.stroke();
      } else {
        const oldX=p.x,oldY=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.gravity*dt;
        ctx.lineWidth=p.size;ctx.beginPath();ctx.moveTo(oldX-p.vx*.012,oldY-p.vy*.012);ctx.lineTo(p.x,p.y);ctx.stroke();
        ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
      }
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    state.flashPower=Math.max(0,state.flashPower-dt*.9);el.battleFlash.style.opacity=state.flashPower;
  }
  function addFx(kind,className,text,x,y,duration,extra={}) {
    const queue=effects[kind];
    if(queue.length>=fxLimits[kind]) {
      const old=queue.shift();old.el.remove();
      if(old.onFinish) old.onFinish();
    }
    const node=document.createElement('div');node.className=(kind==='damage'?'damage-pop':kind==='projectile'?'projectile':'particle')+' '+className;
    // Hidden decoration keeps its bounded lifecycle; projectile callbacks still deal damage.
    if(kind==='damage'&&!settings.fxNumbers||kind==='particle'&&!settings.fxParticles)node.style.display='none';
    node.textContent=text;node.style.left=x+'%';node.style.top=y+'%';
    (kind==='damage'?el.damageLayer:el.effectLayer).appendChild(node);
    const fx={el:node,born:state.effectTime,duration,...extra};queue.push(fx);return fx;
  }
  function updateEffects() {
    for(const queue of Object.values(effects)) {
      // Completion can kill the player and clear every queue. Iterate a bounded snapshot.
      for(const fx of [...queue]) {
        if(!queue.includes(fx))continue;
        const progress=clamp((state.effectTime-fx.born)/fx.duration,0,1);
        if(fx.target) {
          const target=fx.target;
          fx.el.style.left=(fx.startX+(target.x-fx.startX)*progress)+'%';
          fx.el.style.top=(fx.startY+(target.y-fx.startY)*progress)+'%';
        }
        if(progress>=1) {queue.splice(queue.indexOf(fx),1);fx.el.remove();if(fx.onFinish) fx.onFinish();}
      }
    }
  }
  function clearEffects() {
    for(const queue of Object.values(effects)) {for(const fx of queue)fx.el.remove();queue.length=0;}
    holes=[];deaths=[];juiceParticles.length=0;juiceContext?.clearRect(0,0,fieldSize.width,fieldSize.height);
    state.flashPower=0;el.battleFlash.style.opacity=0;
    el.directWarning.classList.add('hidden');
  }
  function shakeBattlefield(strength=2,duration=.18) {
    if(!settings.fxShake || reducedMotion.matches || state.effectTime<state.shakeUntil || state.effectTime-state.lastShake<.18) return;
    el.battlefield.style.setProperty('--shake',strength*fxScale()+'px');el.battlefield.style.setProperty('--shake-duration',duration+'s');
    el.battlefield.classList.remove('shaking');void el.battlefield.offsetWidth;el.battlefield.classList.add('shaking');
    state.shakeUntil=state.effectTime+duration;state.lastShake=state.effectTime;
  }
  function popDamage(x,y,text,crit=false,loot=false) {addFx('damage',(crit?'crit':'')+(loot?' loot-pop':''),text,x,y,.72);}
  function spawnParticles(x,y,count=4) {
    emitBurst(x,y,'#ffdf83',count*4,1);
  }
  function showBanner(title,subtitle='') {
    el.waveBanner.innerHTML=title+(subtitle?`<small>${subtitle}</small>`:'');
    el.waveBanner.classList.remove('show');void el.waveBanner.offsetWidth;el.waveBanner.classList.add('show');
    state.bannerUntil=state.effectTime+2;
  }
  function spawnEnemy(options={}) {
    if(typeof options==='boolean')options={boss:options};
    if(state.enemies.length>=maxEnemies())return null;
    const boss=!!options.boss,elite=!boss && state.waveType==='elite';
    const small=options.small||state.waveType==='rush'||state.waveType==='swarm';
    const index=small?Math.floor(Math.random()*3):Math.min(7,Math.floor((state.world+state.stage+Math.random()*5)/2.5));
    const rangedPool=['archer'];
    if(state.world>=2||state.stage>=2||state.wave>=3)rangedPool.push('piercer');
    if(state.world>=2)rangedPool.push('warlock','plague');
    if(state.world>=2||state.stage>=2||state.wave>=4)rangedPool.push('assassin');
    if((state.world>=2||state.stage>=2||state.wave>=3)&&state.enemies.filter(e=>e.support==='heal').length<2)rangedPool.push('medic');
    if(state.world>=2||state.stage>=2||state.wave>=4)rangedPool.push('siphon');
    if(state.world>=2||state.stage>=2)rangedPool.push('boar');
    if(state.world>=2&&state.enemies.filter(e=>e.support==='summon').length<2)rangedPool.push('summoner');
    if(state.stage>=3||state.world>=2)rangedPool.push('splitter','sniper');
    if(state.world>=2)rangedPool.push('jammer');
    if(state.world>=2&&state.enemies.filter(e=>e.support==='shield').length<2)rangedPool.push('warden');
    if(state.world>=3&&state.enemies.filter(e=>e.support==='haste').length<2)rangedPool.push('haste');
    if(state.world>=2&&state.enemies.filter(e=>e.type==='relay').length<2)rangedPool.push('relay');
    if(state.world>=2&&state.enemies.filter(e=>e.type==='prism').length<2)rangedPool.push('prism');
    if(state.world>=3&&state.enemies.filter(e=>e.type==='brood').length<2)rangedPool.push('brood');
    if(state.world>=3&&state.enemies.filter(e=>e.type==='beacon').length<2)rangedPool.push('beacon');
    const rangedType=!small&&Math.random()<.3?rangedPool[Math.floor(Math.random()*rangedPool.length)]:null;
    const bomberType=(state.world>=2||state.stage>=2||state.wave>=2)&&Math.random()<(small?.18:.08)?'bomber':null;
    const base=boss?{emoji:bossCatalog[(state.world-1)%bossCatalog.length],hp:1600,speed:4.2,gold:220,size:98}:(enemyCatalog.find(e=>e.id===(options.type||bomberType||rangedType))||enemyCatalog[index]);
    const profile=boss?(bossProfiles.find(p=>p.id===options.bossProfile)||bossProfiles[(state.world+state.stage-2)%bossProfiles.length]):null;
    const baseHp=finiteStat(base.hp*worldScale()*(boss?1.5:elite?5:state.waveType==='swarm'?.36:1)),hp=finiteStat(baseHp*enemyModifiers().hp);
    const enemy={id:state.nextEnemyId++,boss,elite,alive:true,emoji:base.emoji,hp,maxHp:hp,baseHp,
      speed:base.speed*1.22*(1+Math.min(2,state.world*.025))*(options.formation==='rush'?1.7:1),
      gold:finiteStat(base.gold*worldScale()*1.35*(elite?4:1)),size:base.size*(elite?1.25:small?.85:1),
      x:options.x??(4+Math.random()*9),y:options.y??(23+Math.random()*55),hitUntil:0,waveSerial:state.waveSerial,
      ranged:!!base.ranged,name:base.name|| (boss?'BOSS':'前衛'),shot:base.shot,shotTimer:0,
      type:base.id||'melee',pierce:base.pierce||0,debuff:base.debuff||null,
      direct:!!base.direct,bomber:!!base.bomber,fuseTimer:0,shieldMax:boss?finiteStat(hp*.6):0,shield:boss?finiteStat(hp*.6):0,
      cooldown:base.cooldown||3,stopX:base.stopX||90,attackPower:base.attack||0,bossTimer:0,enraged:false,
      support:base.support||null,armor:base.armor||0,berserk:!!base.berserk,shieldDrain:base.shieldDrain||0,summoned:!!base.summoned,summonerId:options.summonerId??null,desc:base.desc||'',splitter:!!base.splitter,sniper:!!base.sniper,hasteUntil:0,
      linkRole:base.linkRole||null,bossProfile:profile?.id||null,skillTimer:0,skillUses:0,exposedUntil:0,bossOwner:options.bossOwner??null};
    if(profile){enemy.name=profile.name;enemy.desc=profile.desc+' '+profile.hint;enemy.skillInterval=profile.interval;}
    enemy.el=document.createElement('button');enemy.el.type='button';enemy.el.className='enemy'+(boss?' boss':'')+(elite?' elite':'')+(enemy.ranged?' ranged':'')+(enemy.pierce?' piercing':'')+(enemy.debuff==='slow'?' hexer':enemy.debuff==='poison'?' toxic':'');
    if(enemy.direct)enemy.el.classList.add('direct');if(enemy.bomber)enemy.el.classList.add('bomber');
    if(enemy.support)enemy.el.classList.add('support-'+enemy.support);if(enemy.berserk)enemy.el.classList.add('rage-boar');if(enemy.shieldDrain)enemy.el.classList.add('shield-leech');if(enemy.summoned)enemy.el.classList.add('summoned');
    if(enemy.splitter)enemy.el.classList.add('splitter');if(enemy.sniper)enemy.el.classList.add('sniper');if(enemy.debuff==='jam')enemy.el.classList.add('jammer');
    if(enemy.linkRole)enemy.el.classList.add('link-'+enemy.linkRole);
    enemy.el.dataset.help='enemy:'+enemy.id;
    enemy.el.setAttribute('aria-label',(boss?'ボス ':elite?'エリート ':'敵 ')+enemy.emoji+' '+enemy.name+'を攻撃');
    enemy.el.style.fontSize=`clamp(${Math.round(enemy.size*.65)}px, ${enemy.size/10}vw, ${enemy.size}px)`;
    enemy.el.innerHTML=`<span>${enemy.emoji}</span><div class="enemy-hp"><i></i></div><div class="enemy-shield"><i></i></div>`;enemy.hpEl=enemy.el.querySelector('.enemy-hp i');enemy.shieldEl=enemy.el.querySelector('.enemy-shield i');
    enemy.el.addEventListener('click',()=>{
      const now=performance.now();if(isPaused()||now-state.clickAt<80)return;state.clickAt=now;
      state.targetId=enemy.id;attackEnemy(enemy,.65);renderUI();
    });
    el.enemyZone.appendChild(enemy.el);state.enemies.push(enemy);positionEnemy(enemy);return enemy;
  }
  function positionEnemy(enemy) {
    enemy.el.style.left=enemy.x+'%';enemy.el.style.top=enemy.y+'%';enemy.hpEl.style.width=clamp(enemy.hp/enemy.maxHp*100,0,100)+'%';
    if(enemy.shieldEl){enemy.shieldEl.style.width=(enemy.shieldMax?clamp(enemy.shield/enemy.shieldMax*100,0,100):0)+'%';enemy.shieldEl.parentElement.classList.toggle('hidden',enemy.shieldMax<=0);enemy.el.classList.toggle('shielded',enemy.shield>0);}
  }
  function spawnGroup({count=4,formation='cluster',x=4,small=false}={}) {
    const center=32+Math.random()*36;
    for(let i=0;i<count;i++) {
      const y=formation==='line'?22+(i%6)*11:clamp(center+(Math.random()-.5)*36,20,80);
      spawnEnemy({x:x+(formation==='line'?Math.random()*2:Math.random()*15),y,formation,small});
    }
  }
  function startWave(initial=false,forcedType=null) {
    if(state.pendingEnemyLevel!==null) {
      state.enemyLevel=state.pendingEnemyLevel;state.pendingEnemyLevel=null;rescaleEnemies(state.enemyLevel);resetEconomy();
    }
    state.waveSerial++;state.waveKills=0;state.waveElapsed=0;state.spawnTimer=0;state.bossSpawned=false;state.bossKilled=false;
    if(state.wave===5)state.waveType='boss';
    else if(forcedType)state.waveType=forcedType;
    else if(initial)state.waveType='normal';
    else {
      if(!state.waveBag.length)state.waveBag=['normal','rush','elite','swarm'];
      state.waveType=state.waveBag.splice(Math.floor(Math.random()*state.waveBag.length),1)[0];
    }
    state.waveLimit=({normal:45,rush:35,elite:50,swarm:40,boss:75})[state.waveType]*presets[session.preset].time;state.waveWarning=11;
    if(state.waveType==='boss') {
      // Always reserve room for the boss even if the preceding wave filled the field.
      while(state.enemies.length>maxEnemies()-7)removeEnemy(state.enemies[0]);
      const boss=spawnEnemy({boss:true,x:13,y:50});state.bossSpawned=true;
      const profile=bossProfiles.find(p=>p.id===boss.bossProfile);
      profile.escorts.forEach((type,i)=>spawnEnemy({type,x:17+i*9,y:i?73:27,bossOwner:boss.id}));
      spawnGroup({count:4,formation:'line',x:5});state.bossSlowUntil=state.effectTime+.65;
      showBanner(profile.name,`${profile.skill}に注意 / 防壁破壊で予告中断 / ${state.waveLimit}秒`);shakeBattlefield(4,.28);sound.play('boss');battleFlash('#ff749a',.17);
    } else if(state.waveType==='swarm') {
      spawnGroup({count:maxEnemies()-state.enemies.length,formation:'cluster',x:5,small:true});
      showBanner('⚠ SWARM','大量の敵を、まとめて吹き飛ばせ。');sound.play('wave');
    } else if(state.waveType==='rush') {
      spawnGroup({count:5,formation:'rush',small:true});showBanner('⚠ RUSH WAVE','5秒間、スポーン頻度 ×3。');sound.play('wave');
    } else if(state.waveType==='elite') {
      spawnGroup({count:Math.max(0,5-state.enemies.length),formation:'line',x:8});showBanner('⚠ ELITE','高耐久・高ドロップの精鋭部隊。');sound.play('wave');
    } else {spawnGroup({count:initial?8:4,formation:'cluster',x:initial?13:4});if(initial)spawnEnemy({type:'archer',x:12,y:28});}
  }
  function removeEnemy(enemy) {
    if(state.targetId===enemy.id)state.targetId=null;
    enemy.alive=false;const index=state.enemies.indexOf(enemy);if(index>=0)state.enemies.splice(index,1);enemy.el.remove();
    for(const child of [...state.enemies])if(child.summonerId===enemy.id||child.bossOwner===enemy.id)removeEnemy(child);
  }
  function checkWaveDeadline() {
    const remaining=state.waveLimit-state.waveElapsed,seconds=Math.ceil(remaining);
    if(remaining>0) {
      if(seconds<=10&&seconds<state.waveWarning){state.waveWarning=seconds;sound.play('wave',.65);if(seconds===10)showBanner('10 SECONDS LEFT','残り時間内にウェーブを突破しろ');}
      return false;
    }
    const type=state.waveType,rules=presets[session.preset];state.waveTimeouts++;state.lastDefeat='時間切れ：撃破数／ボスHPが未達。開封・火力強化・挑戦Lvを見直してください。';state.gold=Math.floor(state.gold*(1-rules.timeoutLoss));
    state.hp=state.maxHp;state.shield=shieldCapacity();state.chain=0;clearDebuffs();
    for(const enemy of [...state.enemies])removeEnemy(enemy);clearEffects();
    state.attackTimer=0;state.secondTimer=0;state.counterReadyAt=state.gameTime;
    startWave(false,type);showBanner('TIME UP',`同じWAVEを再挑戦 / GOLD −${rules.timeoutLoss*100}% / ビルド・PACK保持`);sound.play('boss');if(rules.retryPause)prepareBattle(state.lastDefeat);saveProgress();
    return true;
  }
  function clearDebuffs() {
    Object.assign(state.debuffs,{slowUntil:0,poisonUntil:0,poisonNextTick:0,poisonDamage:0,jamUntil:0});
    el.playerCard.classList.remove('slowed','poisoned');el.debuffList.classList.add('hidden');
  }
  function applyDebuff(kind,amount) {
    const d=state.debuffs;
    if(kind==='jam'){d.jamUntil=state.gameTime+3;popDamage(84,33,'📡 防壁回復停止');}
    else if(kind==='slow') {
      const fresh=!isSlowed();d.slowUntil=state.gameTime+5;
      if(fresh){addFx('damage','status-pop status-slow','⛓ SLOW',84,23,.85);emitBurst(86,48,'#c399ff',18);}
    } else if(kind==='poison') {
      const fresh=!isPoisoned();
      if(fresh){d.poisonNextTick=state.gameTime+1;d.poisonDamage=0;addFx('damage','status-pop status-poison','☣ POISON',84,33,.85);emitBurst(86,48,'#a5ff80',18);}
      d.poisonUntil=state.gameTime+6;d.poisonDamage=Math.max(d.poisonDamage,finiteStat(amount*.3));
    }
  }
  function updateDebuffs() {
    const d=state.debuffs;
    // One shared simulation clock: pause/opening freezes durations and poison ticks.
    // Refreshing poison keeps its tick cadence; multiple enemies cannot stack its damage.
    let ticks=0;
    while(d.poisonNextTick>0&&d.poisonNextTick<=Math.min(state.gameTime,d.poisonUntil)+1e-8&&ticks++<8) {
      d.poisonNextTick+=1;
      if(hurtPlayer(d.poisonDamage,null,{periodic:true}))return;
    }
    if(state.gameTime>=d.poisonUntil){d.poisonUntil=0;d.poisonNextTick=0;d.poisonDamage=0;}
    if(state.gameTime>=d.slowUntil)d.slowUntil=0;
  }
  function hurtPlayer(amount,source=null,{periodic=false}={}) {
    if(state.respawnRemaining>0)return true;
    const stats=snapshotStats(),blocked=!periodic&&state.blockChance>0&&Math.random()<state.blockChance;
    const drained=!blocked&&!periodic&&source?.shieldDrain?Math.min(state.shield,stats.shieldMax*source.shieldDrain):0;
    state.shield-=drained;
    let damage=blocked?0:finiteStat(amount*(currentCharacter().incoming||1))*(1-stats.armor);
    // Pierce bypasses only the shield. Armor and a successful parry still protect HP.
    const extraPierce=!periodic&&source?enemyLinkEffects(source).pierce:0;
    const piercing=damage*(periodic?0:Math.max(source?.pierce||0,Math.min(.85,(source?.pierce||0)+extraPierce)));
    const absorbed=Math.min(state.shield,damage-piercing);state.shield-=absorbed;damage-=absorbed;
    recordDamage(periodic?'poison':source?.shieldDrain?'drain':source?.direct?'direct':source?.bomber?'bomb':source?.pierce?'pierce':source?.boss?'boss':source?.ranged?'shot':'contact',damage,absorbed+drained,blocked);
    state.hp=Math.max(0,state.hp-damage);state.hurtUntil=state.effectTime+.3;el.playerCard.classList.add('hurt');
    popDamage(87,43,blocked?'🤺 BLOCK':damage>0?(periodic?'☣ ':piercing>0?'⟐ ':'')+'−'+fmt(damage):'🛡 ABSORB');
    sound.play(blocked||absorbed>0?'shield':'hurt');emitBurst(86,48,damage>0?'#ff718b':'#83eaf6',blocked?22:12);
    if(damage>0)battleFlash('#ff5779',.12);else shockwave(86,48,'#83eaf6',75);
    if(absorbed>0)addFx('particle','shield-flare','🔷',86,50,.35);
    if(state.hp>0) {
      if(!blocked&&!periodic&&source?.debuff)applyDebuff(source.debuff,amount);
      if(state.character==='counter'&&source&&state.gameTime>=state.counterReadyAt) {
        state.counterReadyAt=state.gameTime+.6;
        popDamage(84,31,'🥊 COUNTER!',true);
        sound.play('counter');impactWord('COUNTER!',79,38,'#ffbd8f');
        drawLightning({x:86,y:50},source);triggerExplosion(source,finiteStat(stats.damage*4),22,true);
      }
      return false;
    }
    state.lastDefeat='撃破されました：'+damageSummary();
    const rules=presets[session.preset],retryType=state.waveType;
    state.hp=state.maxHp;state.gold=Math.floor(state.gold*(1-rules.goldLoss));state.packs=Math.floor(state.packs*(1-rules.packLoss));
    state.shield=shieldCapacity();clearDebuffs();
    if(session.preset!=='relaxed'){state.world=Math.max(1,state.world-1);state.stage=1;state.wave=1;}state.chain=0;
    for(const enemy of [...state.enemies])removeEnemy(enemy);clearEffects();startWave(session.preset!=='relaxed',session.preset==='relaxed'?retryType:null);
    state.respawnRemaining=10;
    showBanner('SECOND CHANCE',`10秒後に復帰 / GOLD −${rules.goldLoss*100}%・PACK −${rules.packLoss*100}%`);if(rules.retryPause)prepareBattle(state.lastDefeat);renderPauseState();saveProgress();return true;
  }
  function updateEnemies(dt) {
    const serial=state.waveSerial;
    for(const enemy of [...state.enemies]) {
      if(!enemy.alive)continue;
      const hasted=enemy.hasteUntil>state.gameTime;enemy.el.classList.toggle('hasted',hasted);
      const enemyDt=dt*(1-state.chronoSlow)*(hasted?1.6:1);
      const links=enemyLinkEffects(enemy);
      if(enemy.berserk&&!enemy.enraged&&enemy.hp/enemy.maxHp<=.45) {
        enemy.enraged=true;enemy.armor=0;enemy.el.classList.add('enraged');sound.play('enemy',1.2);
        emitBurst(enemy.x,enemy.y,'#ffb16c',22);popDamage(enemy.x,enemy.y-10,'🐗 激昂！');
      }
      if(enemy.boss) {
        if(!enemy.enraged&&enemy.hp/enemy.maxHp<=.4) {
          enemy.enraged=true;enemy.shield=enemy.shieldMax;enemy.el.classList.add('enraged');
          shockwave(enemy.x,enemy.y,'#87eaff',150);emitBurst(enemy.x,enemy.y,'#9af4ff',45);
          showBanner('BOSS ENRAGED','シールド再展開 / 5連弾 / 弾幕頻度 ×1.6');sound.play('boss');battleFlash('#ff5779',.2);
        }
        enemy.bossTimer+=enemyDt*(enemy.enraged?1.6:1);
        if(enemy.bossTimer>=4.2){enemy.bossTimer%=4.2;fireBossVolley(enemy);}
        if(enemy.bossProfile!=='bastion'||enemy.skillUses<3){enemy.skillTimer+=enemyDt;enemy.el.classList.toggle('skill-aiming',bossWindingUp(enemy));if(enemy.skillTimer>=enemy.skillInterval){enemy.skillTimer=0;executeBossSkill(enemy);if(state.waveSerial!==serial)break;}}
      }
      if(enemy.bomber) {
        if(enemy.x<74)enemy.x=Math.min(74,enemy.x+enemy.speed*enemyDt*links.move);
        else {enemy.fuseTimer+=enemyDt;enemy.el.classList.add('fusing');if(enemy.fuseTimer>=.55){detonateEnemy(enemy);if(state.waveSerial!==serial)break;continue;}}
        positionEnemy(enemy);if(state.effectTime>=enemy.hitUntil)enemy.el.classList.remove('hit');continue;
      }
      if(enemy.ranged&&enemy.x>=enemy.stopX&&enemy.x<90) {
        if(enemy.support==='anchor'){positionEnemy(enemy);if(state.effectTime>=enemy.hitUntil)enemy.el.classList.remove('hit');continue;}
        enemy.shotTimer+=enemyDt*links.shotSpeed;enemy.el.classList.toggle('aiming',enemy.shotTimer>=enemy.cooldown-(enemy.sniper?1.5:enemy.direct||enemy.support?1:.65));
        if(enemy.shotTimer>=enemy.cooldown){enemy.shotTimer%=enemy.cooldown;if(enemy.support)castEnemySupport(enemy);else if(enemy.direct)directStrike(enemy);else fireEnemyProjectile(enemy);if(state.waveSerial!==serial)break;}
      } else if(!enemy.boss||enemy.x<(enemy.enraged?68:58))enemy.x+=enemy.speed*enemyDt*links.move*(enemy.enraged?(enemy.berserk?2.5:1.5):1);
      if(enemy.x>=91) {
        const boss=enemy.boss;
        if(hurtPlayer(enemyDamage(boss?50+state.world*5:10+state.world*2,enemy),enemy))break;
        if(enemy.alive)removeEnemy(enemy);
        // An escaped boss never counts as a kill and cannot strand a boss wave.
        if(boss&&!state.bossKilled)spawnEnemy({boss:true,x:5,y:50});
      } else {positionEnemy(enemy);if(state.effectTime>=enemy.hitUntil)enemy.el.classList.remove('hit');}
    }
    el.directWarning.classList.toggle('hidden',!state.enemies.some(e=>e.direct&&e.el.classList.contains('aiming')));
    const front=state.enemies.reduce((x,e)=>Math.max(x,e.x),0);
    const danger=front>=90?3:front>=80?2:front>=70?1:0;
    if(danger!==state.danger) {
      el.battlefield.classList.remove('danger-1','danger-2','danger-3');if(danger)el.battlefield.classList.add('danger-'+danger);state.danger=danger;
    }
    if(danger===3)shakeBattlefield(1,.16);
  }
  function castEnemySupport(enemy) {
    if(!enemy.alive)return;
    enemy.el.classList.remove('aiming');
    if(enemy.support==='heal') {
      const wounded=state.enemies.filter(e=>e!==enemy&&e.alive&&e.hp<e.maxHp&&Math.hypot(e.x-enemy.x,(e.y-enemy.y)*.6)<35).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp).slice(0,3);
      for(const target of wounded){const amount=Math.min(target.maxHp-target.hp,target.maxHp*(target.boss?.04:.12));target.hp+=amount;positionEnemy(target);popDamage(target.x,target.y-8,'🌿 +'+fmt(amount));drawLightning(enemy,target);}
      if(wounded.length){sound.play('shield',.65);emitBurst(enemy.x,enemy.y,'#a6f5b5',20);}
    } else if(enemy.support==='shield') {
      const allies=state.enemies.filter(e=>e!==enemy&&e.alive&&Math.hypot(e.x-enemy.x,(e.y-enemy.y)*.6)<35&&e.shield<(e.boss?e.shieldMax:Math.max(e.shieldMax,e.maxHp*.35))).sort((a,b)=>a.shield/a.maxHp-b.shield/b.maxHp).slice(0,3);
      for(const target of allies){if(!target.boss)target.shieldMax=Math.max(target.shieldMax,target.maxHp*.35);target.shield=Math.min(target.shieldMax,target.shield+target.maxHp*(target.boss?.05:.2));positionEnemy(target);drawLightning(enemy,target);popDamage(target.x,target.y-8,'🛡 防壁！');}
      if(allies.length){sound.play('shield');emitBurst(enemy.x,enemy.y,'#9beaff',24);}
    } else if(enemy.support==='haste') {
      const allies=state.enemies.filter(e=>e!==enemy&&e.alive&&Math.hypot(e.x-enemy.x,(e.y-enemy.y)*.6)<38).slice(0,6);
      for(const target of allies){target.hasteUntil=state.gameTime+3;drawLightning(enemy,target);}
      if(allies.length){sound.play('wave',.6);popDamage(enemy.x,enemy.y-10,'🥁 加速！');}
    } else if(enemy.support==='summon'||enemy.support==='brood') {
      const owned=state.enemies.filter(e=>e.summonerId===enemy.id).length;
      const count=Math.min(enemy.support==='brood'?1:2,(enemy.support==='brood'?3:4)-owned,maxEnemies()-state.enemies.length);
      for(let i=0;i<count;i++)spawnEnemy({type:'thrall',summonerId:enemy.id,x:Math.min(65,enemy.x+4),y:clamp(enemy.y+(i?12:-12),20,80)});
      if(count>0){sound.play('enemy');emitBurst(enemy.x,enemy.y,'#c2a5ff',26);popDamage(enemy.x,enemy.y-8,'🦴 増援 +'+count);}
    }
  }
  function directStrike(enemy) {
    if(!enemy.alive)return;
    enemy.el.classList.remove('aiming');
    addFx('particle','direct-slash','✕',86,48,.3);drawLightning(enemy,{x:86,y:48});
    sound.play('enemy',1.3);emitBurst(86,48,'#ff8adf',28);impactWord('DIRECT!',82,34,'#ff9be7');
    hurtPlayer(enemyDamage(enemy.attackPower*(1+state.world*.12),enemy),enemy);
  }
  function detonateEnemy(enemy) {
    if(!enemy.alive)return;
    // A detonation is an escape, not a rewarded kill; killing it first cancels its fuse.
    removeEnemy(enemy);shockwave(enemy.x,enemy.y,'#ff9360',210);emitBurst(enemy.x,enemy.y,'#ff9860',65,2);
    addFx('particle','suicide-blast','💥',enemy.x,enemy.y,.5);sound.play('explosion',1.3);shakeBattlefield(5,.22);
    hurtPlayer(enemyDamage(enemy.attackPower*(1+state.world*.15),enemy),enemy);
  }
  function fireEnemyProjectile(enemy) {
    if(!enemy.alive)return;
    const amount=enemyDamage(enemy.attackPower*(1+state.world*.12),enemy);
    const shots=enemy.sniper?1:enemy.elite||enemy.name==='HEX CASTER'||state.world>=3?2:1;
    const special=enemy.pierce?' pierce-shot':enemy.debuff==='slow'?' hex-shot':enemy.debuff==='poison'?' poison-shot':'';
    for(let i=0;i<shots;i++)addFx('projectile','enemy-shot'+special,enemy.shot,enemy.x,enemy.y+(i?5:0),reducedMotion.matches?.12:.62+i*.12,
      {target:{x:86,y:48},startX:enemy.x,startY:enemy.y+(i?5:0),onFinish:()=>hurtPlayer(amount*(i?.65:1),enemy)});
    sound.play('enemy');emitBurst(enemy.x,enemy.y,'#ff718b',7,.5);
    enemy.el.classList.remove('aiming');
  }
  function fireBossVolley(enemy) {
    if(!enemy.alive)return;
    sound.play('enemy',1.4);shockwave(enemy.x,enemy.y,'#ff6c9e',80);
    const amount=enemyDamage((8+state.world*3)*(enemy.enraged?1.3:1),enemy),shots=enemy.enraged?5:3;
    for(let i=0;i<shots;i++)addFx('projectile','enemy-shot boss-shot','🔴',enemy.x,enemy.y+(i-(shots-1)/2)*7,.7+i*.13,
      {target:{x:86,y:48},startX:enemy.x,startY:enemy.y+(i-(shots-1)/2)*7,onFinish:()=>hurtPlayer(amount,enemy.bossProfile==='oracle'?{...enemy,pierce:.35}:enemy)});
  }
  const bossWindingUp=enemy=>enemy.boss&&enemy.skillTimer>=enemy.skillInterval-1.5&&(enemy.bossProfile!=='bastion'||enemy.skillUses<3);
  function executeBossSkill(enemy) {
    if(!enemy.alive)return;
    enemy.el.classList.remove('skill-aiming');
    if(enemy.bossProfile==='bastion'){
      if(enemy.skillUses>=3)return;enemy.shield=Math.min(enemy.shieldMax,enemy.shield+enemy.maxHp*.15);positionEnemy(enemy);popDamage(enemy.x,enemy.y-15,'🏰 防壁再装填');
    } else if(enemy.bossProfile==='swarm'){
      const owned=state.enemies.filter(e=>e.summonerId===enemy.id).length,count=Math.min(3,6-owned,maxEnemies()-state.enemies.length);
      for(let i=0;i<count;i++)spawnEnemy({type:'thrall',summonerId:enemy.id,x:Math.min(64,enemy.x+5),y:30+i*20});popDamage(enemy.x,enemy.y-15,'🐝 群体招集');
    } else {
      drawLightning(enemy,{x:86,y:48});hurtPlayer(enemyDamage(28*(1+state.world*.12),enemy),{...enemy,direct:true,pierce:.8,debuff:'jam'});
    }
    enemy.skillUses++;sound.play('boss',.8);emitBurst(enemy.x,enemy.y,'#ffa3d6',35);
  }
  function nearestEnemies(origin,exclude=null) {
    return state.enemies.filter(e=>e!==exclude).sort((a,b)=>Math.hypot(a.x-origin.x,(a.y-origin.y)*.6)-Math.hypot(b.x-origin.x,(b.y-origin.y)*.6));
  }
  function attackEnemy(target,multiplier=1) {
    if(!target?.alive)return;
    const stats=snapshotStats(),crit=Math.random()<stats.crit,character=currentCharacter();
    sound.play('shot',crit?1.15:1,character.id);emitBurst(84,48,character.id==='ranger'?'#d6ff73':'#c8a0ff',5,.45);
    let amount=finiteStat(stats.damage*multiplier*(crit?state.critMult:1)*(.92+Math.random()*.16));
    if(state.infinityChance>0 && Math.random()<state.infinityChance) {
      amount=finiteStat(amount*10);state.infinityProcs++;state.infinityChance=Math.min(.25,state.infinityChance+.0001);
      popDamage(84,32,'♾️ ×10',true);
    }
    addFx('projectile',(crit?'critical-shot ':'')+'shot-'+character.id,crit?'⚡':character.shot,86,48,reducedMotion.matches?.05:character.id==='ranger'?.12:.18,
      {target,startX:86,startY:48,onFinish:()=>{
        if(!target.alive)return;
        const origin={x:target.x,y:target.y};
        addFx('particle','impact','',target.x,target.y,.3);
        emitBurst(target.x,target.y,crit?'#ffe88a':'#c8d0ff',crit?28:8,crit?1.3:.65);sound.play(crit?'crit':'hit');
        damageEnemy(target,amount,crit);
        if(character.id==='nova')triggerExplosion(origin,finiteStat(amount*1.2),34,true);
        if(state.splash>0)triggerExplosion(origin,finiteStat(amount*state.splash),15,false);
        if(crit && active('thunderstorm'))triggerChainLightning(origin,finiteStat(amount*.7),2,target);
      }});
  }
  function attack() {
    const ranger=state.character==='ranger';
    const targets=state.enemies.filter(e=>e.alive).sort((a,b)=>Number(b.id===state.targetId)-Number(a.id===state.targetId)||(settings.targetPolicy==='danger'?threatScore(b)-threatScore(a):settings.targetPolicy==='boss'?Number(b.boss)-Number(a.boss):0)||(ranger?Number(b.ranged)-Number(a.ranged):0)||b.x-a.x);
    if(!targets.length)return;
    attackEnemy(targets[0]);
    if(ranger&&targets[1])attackEnemy(targets[1],.65);
    if(Math.random()<state.doubleChance)attackEnemy(targets[1]||targets[0],.8);
  }
  function damageEnemy(enemy,amount,crit=false,silent=false) {
    if(!enemy?.alive)return;
    amount=finiteStat(finiteStat(amount)*(1-(enemy.armor||0))*(1-enemyLinkEffects(enemy).guard)*(enemy.exposedUntil>state.gameTime?1.35:1));
    const absorbed=Math.min(enemy.shield||0,amount);enemy.shield=Math.max(0,(enemy.shield||0)-absorbed);
    enemy.hp=Math.max(0,enemy.hp-(amount-absorbed));
    if(absorbed>0&&enemy.shield===0){sound.play('rupture',.8);emitBurst(enemy.x,enemy.y,'#8fefff',55,1.6);shockwave(enemy.x,enemy.y,'#97efff',180);impactWord('SHIELD BREAK',enemy.x,enemy.y-12,'#94efff');if(bossWindingUp(enemy)){enemy.skillTimer=0;enemy.exposedUntil=state.gameTime+3;enemy.el.classList.remove('skill-aiming');popDamage(enemy.x,enemy.y-18,'BREAK！3秒 弱体');}}
    enemy.hitUntil=state.effectTime+.09;enemy.el.classList.add('hit');
    if(!silent)popDamage(enemy.x,enemy.y-4,(absorbed>0?'🛡 ':crit?'💥 ':'')+fmt(amount)+(crit?'!':''),crit);
    if(crit){spawnParticles(enemy.x,enemy.y,5);shakeBattlefield(2.5,.15);impactWord('CRITICAL!',enemy.x,enemy.y-10);impactSlow();}
    if(enemy.hp<=0)killEnemy(enemy);else positionEnemy(enemy);
  }
  function triggerExplosion(origin,damage,radius=23,big=true) {
    const fx=addFx('particle','explosion',big?'💥':'',origin.x,origin.y,.48);
    fx.el.style.width=(big?Math.min(260,radius*7):80)+'px';fx.el.style.height=(big?Math.min(180,radius*5):80)+'px';
    emitBurst(origin.x,origin.y,big?'#ff9f55':'#e8ce9b',big?38:8,big?1.6:.7);
    if(big){shockwave(origin.x,origin.y,'#ffb76b',radius*5);sound.play('explosion');impactWord('BOOM!',origin.x,origin.y-8,'#ffb879');}
    const victims=state.enemies.filter(e=>Math.hypot(e.x-origin.x,(e.y-origin.y)*.6)<radius);
    for(const enemy of victims)damageEnemy(enemy,damage,false,!big);
    if(big&&victims.length>=3){shakeBattlefield(4,.22);battleFlash('#ffb36b',.14);}
  }
  function drawLightning(origin,target) {
    const dx=(target.x-origin.x)*fieldSize.width/100,dy=(target.y-origin.y)*fieldSize.height/100;
    const fx=addFx('particle','lightning','',origin.x,origin.y,.28);
    fx.el.style.width=Math.hypot(dx,dy)+'px';fx.el.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;
    addFx('particle','spark','⚡',target.x,target.y,.28);
    emitBurst(target.x,target.y,'#84f5ff',8,.6);
  }
  function triggerChainLightning(origin,damage,count=2,exclude=null) {
    let from=origin;
    for(const target of nearestEnemies(origin,exclude).slice(0,count)) {
      drawLightning(from,target);damageEnemy(target,damage,false);from={x:target.x,y:target.y};
    }
  }
  function dropPacks(enemy,base) {
    const boosted=base*state.packBonus*enemyModifiers().packs*(isJackpot()?3:1);
    let count=Math.min(MAX_RESOURCE,Math.floor(boosted)+(Math.random()<boosted%1?1:0));
    if(Math.random()<state.magnetChance)count=addResource(count,1);
    const beforePacks=state.packs;state.packs=addResource(state.packs,count);state.earnedPacks=addResource(state.earnedPacks,state.packs-beforePacks);
    sound.play('loot');emitBurst(enemy.x,enemy.y,'#d6ff73',9,.6);
    popDamage(enemy.x,enemy.y-10,'📦 +'+fmt(count),false,true);
    const fx=addFx('particle','loot','📦',enemy.x,enemy.y,.62);
    fx.el.style.setProperty('--loot-x',(86-enemy.x)*fieldSize.width/100+'px');
    fx.el.style.setProperty('--loot-y',(48-enemy.y)*fieldSize.height/100+'px');
  }
  function killEnemy(enemy) {
    if(!enemy.alive)return;
    // Remove first, then process death effects iteratively. A corpse can only proc once.
    removeEnemy(enemy);state.kills=addResource(state.kills,1);if(!enemy.summoned)state.waveKills++;
    if(enemy.support==='summon')for(const minion of [...state.enemies])if(minion.summonerId===enemy.id)removeEnemy(minion);
    if(enemy.splitter){for(let i=0;i<2;i++)spawnEnemy({type:'shard',x:Math.min(72,enemy.x+2),y:clamp(enemy.y+(i?8:-8),20,80)});popDamage(enemy.x,enemy.y-10,'🪼 分裂！');}
    sound.play(enemy.boss?'boss':'kill');emitBurst(enemy.x,enemy.y,enemy.boss?'#ff9fce':'#ffda89',enemy.boss?90:14,enemy.boss?2.4:1);
    if(enemy.boss){shockwave(enemy.x,enemy.y,'#ffabd1',280);battleFlash('#ffadce',.22);impactSlow(.1);}
    const beforeGold=state.gold;if(!enemy.summoned)state.gold=addResource(state.gold,Math.max(1,enemy.gold*state.goldMult*enemyModifiers().gold));
    const chance=clamp(state.packChance*(enemy.elite?2:state.waveType==='rush'?1.3:1)*(isJackpot()?3:1),0,1);
    if(!enemy.summoned&&(enemy.boss || Math.random()<chance))dropPacks(enemy,enemy.boss?25*state.world:enemy.elite?3:Math.max(1,Math.floor(state.world/3)));
    if(enemy.boss){state.bossKilled=true;state.bossesDefeated=addResource(state.bossesDefeated,1);state.gold=addResource(state.gold,300*state.world*state.goldMult*enemyModifiers().gold);shakeBattlefield(6,.3);showBanner('BOSS SHATTERED','次のステージへ / HP +35%');}
    state.earnedGold=addResource(state.earnedGold,state.gold-beforeGold);
    const death=addFx('particle','death',enemy.emoji,enemy.x,enemy.y,.32);death.el.style.fontSize=enemy.size+'px';
    addFx('particle','impact','✨',enemy.x,enemy.y,.3);
    state.chain=state.effectTime-state.lastKillTime<=.7?state.chain+1:1;state.lastKillTime=state.effectTime;
    if([10,25,50,100].includes(state.chain)){spawnParticles(24,24,10);sound.play('chain',Math.min(1.5,1+state.chain/200));impactWord('CHAIN ×'+state.chain,35,28,'#c6fff7');if(state.chain>=25){shakeBattlefield(4,.2);battleFlash('#91f6e6',.16);}}
    deaths.push({x:enemy.x,y:enemy.y});
    if(processingDeaths)return;
    processingDeaths=true;
    try {
      while(deaths.length) {
        const origin=deaths.shift(),stats=snapshotStats();
        if(active('apocalypse')&&Math.random()<.35)triggerExplosion(origin,finiteStat(stats.damage*2.5),26,true);
        if(state.chainChance>0&&Math.random()<state.chainChance)triggerChainLightning(origin,finiteStat(stats.damage*.6),1);
      }
    } finally {processingDeaths=false;}
  }
  function advanceWaveIfNeeded() {
    if(state.wave===5 ? !state.bossKilled : state.waveKills<targetWaveKills())return;
    if(state.wave===5) {
      state.stage++;if(state.stage>5){state.world++;state.stage=1;}
      state.wave=1;state.hp=Math.min(state.maxHp,state.hp+state.maxHp*.35);
    } else state.wave++;
    startWave();
  }
  function createBlackHole() {
    if(!state.enemies.length)return;
    const hole={x:36,y:50,until:state.gameTime+2};
    hole.fx=addFx('particle','black-hole','🕳️',hole.x,hole.y,100);
    holes.push(hole);
    sound.play('explosion',.6);shockwave(hole.x,hole.y,'#c593ff',160);
  }
  function updateAbilities(dt) {
    state.secondTimer+=dt;
    if(state.secondTimer>=1) {
      state.secondTimer%=1;payKingsTax();checkSynergies();
      state.hp=Math.min(state.maxHp,state.hp+snapshotStats().regen);
      if(!isJammed())state.shield=Math.min(shieldCapacity(),state.shield+shieldCapacity()*.04);
    }
    if(state.aegisCopies>0&&!isJammed()) {
      state.aegisTimer+=dt;
      if(state.aegisTimer>=6){state.aegisTimer%=6;state.shield=shieldCapacity();addFx('particle','shield-flare','🏰',86,50,.5);}
    }
    if(state.starfallCopies>0) {
      state.starfallTimer+=dt;
      if(state.starfallTimer>=4) {
        state.starfallTimer%=4;
        const targets=[...state.enemies].sort((a,b)=>b.x-a.x).slice(0,3);
        const damage=finiteStat(snapshotStats().damage*3*state.starfallCopies);
        for(const target of targets)addFx('projectile','meteor-shot','☄️',target.x-8,0,.4,
          {target,startX:target.x-8,startY:0,onFinish:()=>triggerExplosion(target,damage,23,true)});
      }
    }
    if(active('eventHorizon')) {
      state.holeTimer+=dt;
      if(state.holeTimer>=6){state.holeTimer%=6;createBlackHole();}
    }
    for(let i=holes.length-1;i>=0;i--) {
      const hole=holes[i];
      for(const enemy of state.enemies) {
        enemy.x+=(hole.x-enemy.x)*Math.min(1,dt*.9);
        enemy.y+=(hole.y-enemy.y)*Math.min(1,dt*.65);positionEnemy(enemy);
      }
      if(state.gameTime>=hole.until) {
        hole.fx.el.remove();const index=effects.particle.indexOf(hole.fx);if(index>=0)effects.particle.splice(index,1);
        holes.splice(i,1);triggerExplosion(hole,finiteStat(snapshotStats().damage*8),45,true);
      }
    }
    if(state.inferno>0) {
      state.infernoTimer+=dt;
      if(state.infernoTimer>=2) {
        state.infernoTimer%=2;
        const target=state.enemies[Math.floor(Math.random()*state.enemies.length)];
        if(target)triggerExplosion({x:target.x,y:target.y},finiteStat(snapshotStats().damage*state.inferno),28,true);
      }
    }
  }

  // Sequential binomial allocation preserves integer totals without an array of packs.
  // Rare tails use exact inversion; large, well-populated bins use a normal approximation.
  function sampleBinomial(n,p) {
    if(n<=0||p<=0)return 0;if(p>=1)return n;
    if(p>.5)return n-sampleBinomial(n,1-p);
    const mean=n*p;
    if(n<=128) {let result=0;for(let i=0;i<n;i++)if(Math.random()<p)result++;return result;}
    if(mean<30) {
      let probability=Math.exp(n*Math.log1p(-p)),cumulative=probability,k=0;
      const roll=Math.random();
      while(roll>cumulative&&k<Math.min(n,256)) {
        k++;probability*=((n-k+1)/k)*(p/(1-p));cumulative+=probability;
      }
      return k;
    }
    const z=Math.sqrt(-2*Math.log(Math.max(Number.EPSILON,Math.random())))*Math.cos(2*Math.PI*Math.random());
    return clamp(Math.round(mean+Math.sqrt(n*p*(1-p))*z),0,n);
  }
  function calculatePackResults(count) {
    count=clamp(Math.floor(count),0,MAX_RESOURCE);
    const counts=Object.fromEntries(rarityLabels.map(r=>[r,0])),cardCounts=new Map();
    let remaining=count,probabilityLeft=1;
    rarityRates.forEach(([rarity,probability],index)=>{
      const quantity=index===rarityRates.length-1?remaining:sampleBinomial(remaining,clamp(probability/probabilityLeft,0,1));
      counts[rarity]=quantity;remaining-=quantity;probabilityLeft-=probability;
      const pool=cardsByRarity[rarity];let cardsLeft=quantity;
      pool.forEach((card,cardIndex)=>{
        const n=cardIndex===pool.length-1?cardsLeft:sampleBinomial(cardsLeft,1/(pool.length-cardIndex));
        if(n)cardCounts.set(card.id,n);cardsLeft-=n;
      });
    });
    return {counts,cardCounts};
  }
  function applyPackResults(result,amount) {
    result.newIds=[];
    for(const card of cardPool) {
      const count=result.cardCounts.get(card.id)||0;if(!count)continue;
      if(!state.discovered.has(card.id))result.newIds.push(card.id);
      card.apply(count);state.cardCounts[card.id]=addResource(state.cardCounts[card.id]||0,count);state.discovered.add(card.id);
    }
    state.totalOpened=addResource(state.totalOpened,amount);state.normalCards=addResource(state.normalCards,result.counts.N);
    const rare=result.counts.UR+result.counts.SECRET;state.bestRareBatch=Math.max(state.bestRareBatch,rare);
    result.unlocked=checkSynergies();
    if(rare>=10)state.jackpotUntil=state.gameTime+15;
    result.triggered=[...result.unlocked];
    if(rare>=10&&!result.triggered.includes('jackpot'))result.triggered.push('jackpot');
    result.synergies=[...state.activeSynergies];state.buildDirty=true;
  }
  function openPacks(selection=state.selectedOpen) {
    if(state.modalOpen)return;
    const amount=Math.floor(selection==='max'?state.packs:Math.min(selection,state.packs));
    if(amount<=0)return;
    const before=snapshotStats();
    const result=calculatePackResults(amount);state.packs-=amount;applyPackResults(result,amount);
    Object.assign(result,{amount,before,after:snapshotStats(),massive:amount>=1e6||selection==='max'});
    state.lastOpen=result;showLastOpen();showPackAnimation(result);saveProgress();renderUI();
  }
  function sortedCards(result) {
    const fresh=new Set(result.newIds);
    return [...result.cardCounts].map(([id,count])=>({...byId[id],count,isNew:fresh.has(id)})).sort((a,b)=>{
      const aHigh=rarityRank[a.rarity]>=3?rarityRank[a.rarity]:0,bHigh=rarityRank[b.rarity]>=3?rarityRank[b.rarity]:0;
      return bHigh-aHigh||Number(b.isNew)-Number(a.isNew)||b.count-a.count;
    });
  }
  function summaryHTML(result,zero=false) {
    return rarityLabels.map(r=>`<div class="result-chip rarity-${r}" data-rarity="${r}" data-help="rarity:${r}:${result.counts[r]}" tabindex="0"><span>${r}</span><b>${zero?'0':fmt(result.counts[r])}</b></div>`).join('');
  }
  function showLastOpen() {
    const r=state.lastOpen;if(!r)return;
    const fresh=sortedCards(r).filter(c=>c.isNew);
    el.packResult.classList.remove('empty-state');
    el.packResult.innerHTML=`<div class="last-open-head" data-help="lastOpen" tabindex="0"><span>LAST OPEN ×${exact(r.amount)}</span><b>NEW ${fresh.length}</b></div><div class="result-grid">${summaryHTML(r)}</div><div class="result-footer"><div class="last-new"><strong>${fresh.length?'NEW':'COLLECTED'}</strong>${fresh.length?fresh.slice(0,3).map(c=>`<span data-help="card:${c.id}" tabindex="0">${c.emoji} ${c.name}</span>`).join(''):'新規カードなし'}${fresh.length>3?`<span>＋${fresh.length-3}種類</span>`:''}<br>SSR以上 ${exact(r.counts.SSR+r.counts.UR+r.counts.SECRET)}枚</div><button class="ghost-btn" data-action="details" data-help="lastOpen">詳細を見る ↗</button></div>`;
  }
  function openModal() {
    hideHelp();
    returnFocus=document.activeElement;state.modalOpen=true;
    el.packModal.classList.remove('hidden');el.packModal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');document.querySelector('.app-shell').inert=true;
    el.modalCard.scrollTop=0;renderPauseState();
  }
  function showPackAnimation(result) {
    openModal();el.modalCard.className='modal-card opening'+(result.massive?' massive':'');
    el.modalTitle.textContent=exact(result.amount)+(result.amount===1?' PACK':' PACKS');
    el.modalKicker.textContent=result.amount>=1e6?'MILLION / OVERLOAD':result.massive?'MAX / OVERLOAD':result.amount>=10000?'PACK STORM':'PACK OPEN';
    el.modalSubtitle.textContent='OPENING… 箱の向こうに、新しいビルド。';
    el.modalSummary.innerHTML=summaryHTML(result,true);el.rareDrops.innerHTML='';el.rareReveal.textContent='';
    el.statChanges.innerHTML='';el.unlockedSynergies.innerHTML='';el.cardRows.innerHTML='';el.cardDetails.open=false;
    el.skipBtn.classList.remove('hidden');el.closeModalBtn.textContent='SKIP →';el.skipBtn.focus();hideHelp();
    const freshSecret=result.newIds.some(id=>byId[id]?.rarity==='SECRET');
    const special=result.newIds.length>0||result.counts.UR>0||result.counts.SECRET>0;
    const quick=settings.animationPolicy==='quick'&&!freshSecret||settings.animationPolicy==='special'&&!special;
    const duration=reducedMotion.matches?.18:quick?.22:result.amount>=1e6?5.6:result.amount>=10000?4.3:result.amount>=100?3.2:freshSecret?3.2:2.1;
    const featured=sortedCards(result).find(c=>(!el.rareOnly.checked||rarityRank[c.rarity]>=3)&&(!el.newOnly.checked||c.isNew))||null;
    state.opening={result,elapsed:0,duration,revealed:new Set(),lastPaint:0,featured,heroShown:false,phase:'charge'};
    el.packStage.classList.remove('hidden','hero-revealed');el.packStage.dataset.phase='charge';el.packStage.dataset.rarity='N';
    setText(el.packBurst,'📦');setText(el.packHeroRarity,'SEALED');setText(el.packHeroName,result.massive?'OVERLOAD CORE':'LOOT CORE');
    setText(el.packHeroCount,'CHARGE → BREAK → REVEAL');setText(el.packPhaseLabel,'01 / CHARGING');el.packChargeBar.style.width='0%';
    // Fixed decorative budget; neither pack count nor card count creates additional nodes.
    const colors=['#d6ff73','#9bdbff','#d6a0ff','#ffe189','#ff9bdc'];
    const pieces=reducedMotion.matches?0:Math.round((result.massive?48:30)*fxScale());
    el.packConfetti.innerHTML=Array.from({length:pieces},(_,i)=>`<i style="--x:${Math.round((fxRandom()-.5)*600)}px;--y:${Math.round(-40-fxRandom()*240)}px;--r:${Math.round(fxRandom()*900)}deg;--delay:${(i%8)*.045}s;--spark:${colors[i%colors.length]}"></i>`).join('');
    sound.play('open',result.massive?1.4:1);sound.play('charge');
  }
  function revealPackHero(opening) {
    if(opening.heroShown)return;opening.heroShown=true;
    const card=opening.featured;
    el.packStage.dataset.rarity=card?.rarity||'N';
    setText(el.packHeroRarity,card?card.rarity+(card.isNew?' / NEW':''):'COLLECTED');
    setText(el.packBurst,card?.emoji||'✨');setText(el.packHeroName,card?.name||'BUILD UPGRADED');
    setText(el.packHeroCount,card?'×'+exact(card.count):'カード効果をすべて反映');
    el.packStage.classList.add('hero-revealed');
  }
  function updatePackAnimation(dt) {
    const opening=state.opening;if(!opening)return;
    opening.elapsed+=dt;const progress=clamp(opening.elapsed/opening.duration,0,1);
    const phase=progress<.26?'charge':progress<.46?'rupture':progress<.78?'cascade':'reveal';
    if(phase!==opening.phase) {
      opening.phase=phase;el.packStage.dataset.phase=phase;
      setText(el.packPhaseLabel,phase==='rupture'?'02 / SEAL BREAK':phase==='cascade'?'03 / LOOT CASCADE':'04 / RARE REVEAL');
      if(phase==='rupture'){setText(el.packBurst,'💥');sound.play('rupture',opening.result.massive?1.3:1);}
      if(phase==='cascade')setText(el.packBurst,'✨');
    }
    el.packChargeBar.style.width=(progress*100)+'%';
    const heroThreshold=opening.featured?.rarity==='SECRET'?.9:opening.featured?.rarity==='UR'?.79:.58;
    if(progress>=heroThreshold)revealPackHero(opening);
    if(progress>.1&&progress<.75)sound.play('count',.5+progress);
    if(opening.elapsed-opening.lastPaint>.032||progress===1) {
      opening.lastPaint=opening.elapsed;
      const countProgress=clamp((progress-.1)/.64,0,1),ease=1-Math.pow(1-countProgress,3);
      for(const node of el.modalSummary.children)node.querySelector('b').textContent=fmt(Math.floor(opening.result.counts[node.dataset.rarity]*ease));
    }
    for(const [rarity,threshold] of [['SSR',.58],['UR',.76],['SECRET',.88]]) {
      if(progress>=threshold&&!opening.revealed.has(rarity)) {
        opening.revealed.add(rarity);const count=opening.result.counts[rarity];
        if(count>0) {
          el.rareReveal.textContent=(rarity==='SECRET'?'🌈 ':rarity==='UR'?'👑 ':'✦ ')+rarity+' ×'+exact(count)+(rarity==='SECRET'?' !!!':'');
          el.modalSummary.querySelector(`[data-rarity="${rarity}"]`).classList.add('revealed');
          if(rarity==='SSR')sound.play('rare',.7);
          if(rarity==='UR'){el.modalCard.classList.add('ur-flash');sound.play('rare',1.2);}
          if(rarity==='SECRET'){el.modalCard.classList.add('secret-flash');sound.stopAll();sound.play('secret');}
        }
      }
    }
    if(progress>=1)finishPackAnimation();
  }
  function renderStatChanges(result) {
    const percent=n=>Math.round(n*100)+'%';
    const fields=[['damage','⚔ DAMAGE',fmt],['aps','⚡ APS',n=>n.toFixed(1)],['crit','💥 CRIT',percent],['packChance','🍀 PACK',percent],['splash','💣 SPLASH',percent],['maxHp','❤️ MAX HP',fmt],['armor','🛡 GUARD',percent],['shieldMax','🔷 SHIELD MAX',fmt],['regen','🌿 REGEN',n=>fmtDecimal(n)+'/s'],['blockChance','🤺 BLOCK',percent]];
    el.statChanges.innerHTML=fields.map(([key,label,format])=>{
      const before=result.before[key],after=result.after[key],gain=before>0?(after/before-1)*100:0;
      const huge=gain>=99.5;
      const delta=['crit','packChance','splash','armor','blockChance'].includes(key)?`${after>=before?'+':''}${((after-before)*100).toFixed(1)}pt`:before?`${gain>=0?'+':''}${gain>=1000?fmt(gain):gain.toFixed(0)}%`:('+'+format(after-before));
      return `<div class="stat-change${huge?' huge':''}" data-help="${key}" tabindex="0"><span>${label}</span><b><em>${format(before)}</em> → ${format(after)}</b><small>${delta}${huge?' · HUGE BOOST!':''}</small></div>`;
    }).join('');
  }
  function renderResultCards(result) {
    const all=sortedCards(result);
    let shown=all.filter(c=>(!el.rareOnly.checked||rarityRank[c.rarity]>=3)&&(!el.newOnly.checked||c.isNew));
    const small=result.amount<=10,fan=result.amount>=100&&result.amount<=1000;
    // Small batches show every individual card (at most 10). Larger batches stay aggregated.
    if(small)shown=shown.flatMap(c=>Array.from({length:c.count},()=>({...c,count:1})));
    const max=small?10:fan?5:6,total=shown.length;shown=shown.slice(0,max);
    el.rareDrops.className='rare-drops'+(fan?' fan':'');
    el.rareDrops.innerHTML=shown.length?shown.map((c,i)=>`<div class="rare-card rarity-${c.rarity}" data-help="card:${c.id}" tabindex="0" style="--fan-r:${(i-(shown.length-1)/2)*5}deg;--fan-y:${Math.abs(i-(shown.length-1)/2)*4}px">${c.isNew?'<span class="new-tag">NEW</span>':''}<span class="emoji">${c.emoji}</span><small>${c.rarity}</small><b>${c.name}</b><small>${c.desc}</small><span class="card-quantity">×${exact(c.count)}</span></div>`).join(''):'<div class="empty-state">フィルターに一致するカードはありません。全内訳は下の詳細へ。</div>';
    el.modalSubtitle.textContent=`NEW ${result.newIds.length}種類 / SSR以上 ${exact(result.counts.SSR+result.counts.UR+result.counts.SECRET)}枚`+(total>max?` / 代表${max}件を表示`:'');
    renderResultInventory(result);
  }
  function renderPackDetails(result) {
    el.modalSummary.innerHTML=summaryHTML(result);renderResultCards(result);renderStatChanges(result);
    const ids=result.triggered;
    el.unlockedSynergies.innerHTML=ids.map(id=>{
      const s=synergyPool.find(s=>s.id===id);return `<div data-help="synergy:${id}" tabindex="0">✦ ${result.unlocked.includes(id)?'UNLOCKED':'BUFF REFRESH'} / ${s.emoji} ${s.name}<br><small>${s.description}</small></div>`;
    }).join('')+(result.synergies.length?`<div>獲得済みシナジー ${result.synergies.length}/8 · ${result.synergies.map(id=>synergyPool.find(s=>s.id===id).emoji).join(' ')}</div>`:'');
  }
  function finishPackAnimation() {
    if(!state.opening)return;
    const opening=state.opening,result=opening.result,revealed=opening.revealed;
    revealPackHero(opening);el.packStage.dataset.phase='complete';el.packChargeBar.style.width='100%';setText(el.packPhaseLabel,'OPEN COMPLETE');
    state.opening=null;
    if(result.counts.SECRET&&!revealed.has('SECRET')){sound.stopAll();sound.play('secret');}
    else if(result.counts.UR&&!revealed.has('UR'))sound.play('rare');
    else if(!revealed.size)sound.play('loot');
    el.modalCard.classList.remove('opening');el.modalKicker.textContent='OPEN COMPLETE';
    el.skipBtn.classList.add('hidden');el.closeModalBtn.textContent='戦闘へ戻る →';
    el.rareReveal.textContent=result.counts.SECRET?`🌈 SECRET ×${exact(result.counts.SECRET)} !!!`:result.counts.UR?`👑 UR ×${exact(result.counts.UR)}`:'BUILD UPGRADED';
    renderPackDetails(result);el.closeModalBtn.focus({preventScroll:true});hideHelp();
  }
  function showPackDetails() {
    if(!state.lastOpen||state.modalOpen)return;
    const result=state.lastOpen;openModal();el.modalCard.className='modal-card';
    el.packStage.classList.add('hidden');el.packConfetti.replaceChildren();
    el.modalTitle.textContent=exact(result.amount)+' PACKS';el.modalKicker.textContent='LAST OPEN / DETAILS';
    el.rareReveal.textContent='直近の開封結果';el.skipBtn.classList.add('hidden');el.closeModalBtn.textContent='戦闘へ戻る →';
    renderPackDetails(result);el.cardDetails.open=true;el.closeModalBtn.focus({preventScroll:true});hideHelp();
  }
  function closeModal() {
    hideHelp();
    if(state.opening){finishPackAnimation();return;}
    state.modalOpen=false;el.packModal.classList.add('hidden');el.packModal.setAttribute('aria-hidden','true');
    el.packConfetti.replaceChildren();el.packStage.classList.remove('hero-revealed');
    document.body.classList.remove('modal-open');document.querySelector('.app-shell').inert=false;
    renderPauseState();renderUI();if(returnFocus?.isConnected)(returnFocus.disabled?el.packText:returnFocus).focus({preventScroll:true});
    if(state.lastOpen?.counts.SECRET)shakeBattlefield(4,.22);
    focusSection('battlePanel');
  }
  function setText(node,text) {if(node.textContent!==String(text))node.textContent=text;}
  function fmtDecimal(n) {return n<100?n.toFixed(1):fmt(n);}
  function renderCommand() {
    const character=currentCharacter();
    setText(el.playerEmoji,character.emoji);setText(el.playerClass,character.name);setText(el.playerRole,character.role+' / AUTO');
    el.playerCard.dataset.character=character.id;
    // Keep purchase buttons stable while GOLD changes, so focus/hover and clicks are not lost.
    if(!el.characterList.children.length) {
      el.characterList.innerHTML=characterPool.map(c=>`<article class="character-item" data-character="${c.id}" data-help="character:${c.id}" tabindex="0"><span class="character-emoji">${c.emoji}</span><span class="character-role">${c.role}</span><b>${c.name}</b><p class="character-merit">＋ ${c.merit}</p><p class="character-drawback">− ${c.drawback}</p><button data-select-character="${c.id}" class="buy-btn" data-help="character:${c.id}"></button></article>`).join('');
    }
    for(const item of el.characterList.children) {
      const c=characterPool.find(c=>c.id===item.dataset.character),button=item.querySelector('button');
      const unlocked=state.unlockedCharacters.has(c.id),selected=state.character===c.id;
      item.classList.toggle('selected',selected);item.classList.toggle('locked',!unlocked);
      setText(button,selected?'使用中':unlocked?'交代する':`🪙 ${fmt(c.cost)} 解放`);
      button.disabled=selected||(!unlocked&&state.gold<c.cost);button.setAttribute('aria-pressed',String(selected));
    }
    const unlocked=Math.max(state.enemyLevel,state.unlockedEnemyLevel),modifiers=enemyModifiers(),next=enemyModifiers(Math.min(MAX_ENEMY_LEVEL,unlocked+1)),signature=state.enemyLevel+':'+unlocked;
    if(state.commandSignature!==signature) {
      state.commandSignature=signature;
      el.threatPreview.innerHTML=[['hp','♥ HP'],['attack','⚔ ATK'],['gold','🪙 GOLD'],['packs','📦 PACK']].map(([key,label])=>`<div data-help="enemyUpgrade" tabindex="0"><span>${label}</span><b>×${fmtDecimal(modifiers[key])} <em>→ ×${fmtDecimal(next[key])}</em></b></div>`).join('');
      setText(el.threatLevel,`Lv.${state.enemyLevel} / 上限 ${MAX_ENEMY_LEVEL} · 解放 ${unlocked}`);
    }
    setText(el.upgradeEnemyBtn,unlocked>=MAX_ENEMY_LEVEL?'Lv.999 到達！':`🪙 ${fmt(enemyUpgradeCost())} — Lv.${unlocked+1} 解放`);
    el.upgradeEnemyBtn.disabled=unlocked>=MAX_ENEMY_LEVEL||state.gold<enemyUpgradeCost();
    for(const [id,amount] of [['upgradeTenBtn',10],['upgradeMaxBtn','max']]){const q=upgradeQuote(amount);$(id).disabled=!q.count;setText($(id),q.count?'+ '+q.count+' Lv · '+fmt(q.cost)+' GOLD':amount==='max'?'MAX強化':'＋10 Lv');}
    if($('enemyLevelChoice').options.length!==unlocked+1)$('enemyLevelChoice').innerHTML=Array.from({length:unlocked+1},(_,i)=>`<option value="${i}">Lv.${i}</option>`).join('');
    $('enemyLevelChoice').value=state.pendingEnemyLevel??state.enemyLevel;
    const stats=snapshotStats(),dps=Math.max(.001,stats.damage*stats.aps*(1+state.crit*(state.critMult-1))*(state.character==='nova'?2.2:1));
    const hp=finiteStat(34*worldScale()*modifiers.hp),seconds=hp/dps;
    setText($('economyReport'),`射手1体の目安：HP ${fmt(hp)} / 通常攻撃のみ約 ${fmtDecimal(seconds)}秒。次の解放Lvでは約 ${fmtDecimal(seconds*next.hp/modifiers.hp)}秒。Lv.30まではHP×3、以降はHP×1.16／ATK×1.04／GOLD×1.012／PACK×1.008。収益/秒が増えるとは限りません。実測 ${state.combatSeconds.toFixed(1)}秒：${fmtDecimal(state.earnedGold/Math.max(1,state.combatSeconds))} GOLD/s、${fmtDecimal(state.earnedPacks/Math.max(1,state.combatSeconds))} PACK/s（撃破報酬・ゲーム内時間、消費は控除前）。${state.pendingEnemyLevel!==null?'次WAVEからLv.'+state.pendingEnemyLevel:'Lv変更時に実測をリセット'}`);
    if($('characterCompare').closest('details').open)renderCharacterComparison();
  }
  function renderBuilds() {
    if(!state.buildDirty)return;
    state.buildDirty=false;
    const cards=cardPool.filter(c=>state.cardCounts[c.id]).sort((a,b)=>rarityRank[b.rarity]-rarityRank[a.rarity]);
    el.buildList.innerHTML=cards.length?cards.map(c=>`<div class="build-item rarity-${c.rarity}" data-help="card:${c.id}" tabindex="0"><div class="build-icon">${c.emoji}</div><div><b>${c.name} <small>${c.rarity} · ${c.desc}</small></b></div><div class="build-count">×${fmt(state.cardCounts[c.id])}</div></div>`).join(''):'<div class="empty-state"><p>パックを開封してビルドを育てよう。<br>カードの組み合わせで、シナジーを解放。</p></div>';
    setText(el.collectionCount,`${state.discovered.size} / ${cardPool.length}`);
  }
  function synergyStatus(s) {
    if(!active(s.id))return Math.floor(synergyProgress(s)*100)+'%';
    if(s.id==='lastStand')return isLastStand()?'ACTIVE':'READY';
    if(s.id==='kingsTax')return isTaxActive()?'ACTIVE':'NO GOLD';
    if(s.id==='jackpot')return isJackpot()?'ACTIVE':'READY';
    return 'ACTIVE';
  }
  function renderSynergies() {
    const signature=synergyPool.map(s=>`${active(s.id)}:${synergyStatus(s)}`).join('|');
    if(signature===state.synergySignature)return;state.synergySignature=signature;
    el.synergyList.innerHTML=synergyPool.map(s=>{
      const status=synergyStatus(s),unlocked=active(s.id);
      return `<div class="synergy-item${status==='ACTIVE'?' active':''}" data-help="synergy:${s.id}" tabindex="0"><span class="synergy-icon">${s.emoji}</span><b>${s.name}</b><small>${status}</small>${!unlocked?`<i style="width:${synergyProgress(s)*100}%"></i>`:''}</div>`;
    }).join('');
    setText(el.synergyCount,`${state.activeSynergies.size} / 8`);
  }
  function renderPauseState() {
    const paused=isPaused();el.battlefield.classList.toggle('frozen',paused);
    if(paused)sound.stopAll();
    el.pausedLabel.classList.toggle('hidden',(!state.manualPause&&state.ready&&state.respawnRemaining<=0)||state.modalOpen);
    setText(el.pausedLabel,state.respawnRemaining>0?`復帰まで ${Math.ceil(state.respawnRemaining)} 秒${state.manualPause?'（停止中）':''}`:state.ready?'BATTLE PAUSED':'準備中 · 出撃ボタンで開始');
    el.pauseBtn.setAttribute('aria-pressed',String(state.manualPause));
    el.pauseBtn.setAttribute('aria-label',state.manualPause?'戦闘を再開':'戦闘を一時停止');
    setText(el.pauseBtn,state.manualPause?'▶ RESUME':'Ⅱ PAUSE');
  }
  function renderAVControls() {
    sound.updateControls();const high=settings.fxIntensity==='max';
    setText(el.fxBtn,high?'✦ FX MAX':'✧ FX LOW');el.fxBtn.setAttribute('aria-pressed',String(high));
    el.battlefield.classList.toggle('fx-low',!high);
  }
  const helpDefinitions={
    world:()=>`WORLD / STAGE\n現在 ${state.world}-${state.stage}。5ウェーブでステージ進行、5ステージで次のWORLD。奥に進むほど敵が強くなり、数が増えます。`,
    kills:()=>`KILLS\nこの周回の累計撃破数 ${exact(state.kills)}。敵を倒すとGOLDと、確率でPACKを獲得します。`,
    gold:()=>`GOLD / コイン\n所持 ${exact(state.gold)}。パック購入、キャラクター解放、敵強化に使えます。KING'S TAX発動中は毎秒最大100を消費。`,
    packs:()=>`PACKS\n所持 ${exact(state.packs)}。1パックから1枚のカードが出現。カードの効果は開封直後から反映されます。`,
    wave:'WAVE\n5回目はシールド付きボス＋取り巻き。NORMAL・RUSH（5秒間増援3倍）・ELITE（高耐久）・SWARM（大量の低HP敵）が登場します。制限時間内の突破を目指します。',
    waveTimer:()=>`WAVE TIME / 残り ${Math.max(0,Math.ceil(state.waveLimit-state.waveElapsed))}秒\n通常設定：NORMAL45秒 / RUSH35秒 / ELITE50秒 / SWARM40秒 / BOSS75秒。現在は${presets[session.preset].name}（時間 ×${presets[session.preset].time}）。${presets[session.preset].description} 開封・一時停止中は止まり、戦闘速度に連動します。`,
    bossShield:'BOSS SHIELD\nボスのHPの60%に相当する防壁。すべての攻撃を先に吸収し、超過分はHPへ。HP40%以下で1回だけ全再展開し、5連弾に激昂。防壁を砕いて制限時間内に倒しましょう。',
    progress:'STAGE PROGRESS / BOSS HP\n通常はステージの進行度。ボス登場中はボスの残りHPを表示します。',
    damage:'DMG / ダメージ\n通常攻撃1発の基準威力。カード、シナジー、キャラクター補正を反映。CRIT時は会心倍率が乗ります。',
    aps:'APS / 攻撃速度\n1秒あたりの自動攻撃回数。キャラクターとLAST STANDの効果を反映。実効上限60回/秒。速度ボタンは戦闘全体の時間を加速します。',
    crit:()=>`CRIT / 会心\n会心発生率 ${Math.round(state.crit*100)}%。会心倍率 ×${fmtDecimal(state.critMult)}。CRITで確率、AIMで倍率を強化できます。`,
    packChance:'PACK / ドロップ率\n敵撃破時にパックを得る基準確率。エリート・RUSH・JACKPOTで増加。ボスは確定でドロップします。',
    splash:'SPLASH / 範囲攻撃\n命中時、近くの敵へ与える追加ダメージの割合。100%なら周辺にも元の攻撃と同じ威力。NOVAの広範囲攻撃とも重なります。',
    maxHp:'HP / 最大体力\nHPが0になるとビルド・解放キャラ・敵強化を保持して再出撃。GOLDを18%、PACKを10%失い、WORLDが1つ戻ります。VITALで最大HPを増やせます。',
    armor:'GUARD / 被ダメージ軽減\n接触・射撃・直撃・自爆・毒をこの割合だけ軽減。ARMORは最大60%、BRAWLERの35%軽減とは乗算で合成（合計最大74%）。RANGERの被ダメージ35%増は軽減前に適用。',
    shieldMax:()=>`SHIELD / シールド\n${fmt(state.shield)} / ${fmt(shieldCapacity())}。軽減後のダメージをHPより先に吸収。毎秒上限の4%を補充。BARRIERで容量、AEGIS COREでHP比例容量と6秒ごとの全補充を獲得。NOVAは容量が40%低下。VOID LANCERは60%貫通、PHASE ASSASSINの直撃は100%貫通。`,
    regen:'REGEN / 毎秒回復\n1秒で回復するHP量。基礎回復にREGENカードの割合回復を加算。最大HPを超えて回復しません。',
    blockChance:'BLOCK / 完全ガード\nPARRYで攻撃を無効化する確率を強化（最大40%）。貫通・状態異常の付与も防ぎます。付与済みの毒ダメージはガード不可。ガード時はHPもシールドも減りません。BRAWLERの反撃は発動します。',
    player:()=>`${currentCharacter().emoji} ${currentCharacter().name} / ${currentCharacter().role}\n${currentCharacter().desc}\nCOMBAT HQで解放済みキャラクターに無料交代できます。交代でHP・シールドは回復せず、NOVAへの交代時は容量超過分を失います。`,
    pause:'PAUSE / RESUME\n戦闘・敵弾・一時バフの残り時間を停止／再開。停止中も開封・購入・キャラクター交代ができます。',
    speed:'戦闘速度\nクリックで×1 → ×2 → ×4。敵・攻撃・回復・一時バフの時間が加速。開封演出の速度は変わりません。',
    sound:'SE / 効果音\n最初のクリック・キー操作から音が鳴ります。ボタンでミュート、スライダーで0〜100%調整。弾・会心・爆発・ガード・開封・SECRETなどを音で区別。外部音源・BGMは使いません。',
    effects:'FX MAX / LOW\nMAXは火花・衝撃波・フラッシュ・会心の瞬間スローを強調。LOWは火花と画面揺れを約30%に軽減。OSの動きを減らす設定ではさらに控えめになります。',
    difficulty:'HARD PRESSURE\n敵の基礎HP ×1.8、移動 ×1.22、火力はさらに×1.75。貫通・鈍足・毒に加え、予告後に直撃する暗殺者、高速自爆するNITRO IMPも登場。ボスはHP増強・シールド装備・激昂時に防壁再展開と5連弾。時間内に突破しましょう。',
    slow:'⛓ SLOW / 攻撃速度低下\nHEX CASTERの攻撃を受けると5秒間、最終APSが30%低下。重複せず、再被弾で時間を更新。シールド吸収でも付与、完全ガードなら防止。PAUSE・開封中は残り時間も停止。',
    poison:'☣ POISON / 毒・回復低下\nPLAGUE SHAMANの攻撃を受けると6秒間、毎秒着弾前の基礎ダメージの30%を受け、HPの毎秒回復が50%低下。毒は軽減・シールドが有効。再被弾で時間を更新、威力は強い方だけ適用。付与は完全ガードで防止、付与済みの毒はガード不可。PAUSE・開封中は停止、再出撃で解除。',
    openMax:()=>`MAX開封 / ワンクリック\n現在所持している ${exact(state.packs)}パックをすべて開封します。PACK LABの開封数の選択はそのまま。開封・結果表示中は戦闘も状態異常も停止します。`,
    open:()=>`OPEN / 一括開封\n${exact(state.selectedOpen==='max'?state.packs:Math.min(state.packs,state.selectedOpen))}パックを開封します。所持数が足りない場合は所持分だけ。結果表示中は戦闘とバフ時間を停止します。`,
    buy:'パック購入\n100 GOLDで10 PACKを獲得します。コインはキャラクター解放や敵強化にも使えます。',
    demo:'DEMO補給\nDEMO枠へ移動して1,000,000パックを追加。通常プレイのカード・資源・到達記録はそのまま保存されます。体験の選択で戻れます。',
    rareOnly:'SSR以上だけ演出\n開封演出のカード表示をSSR・UR・SECRETに限定。抽選結果と効果は変わらず、詳細内訳には全カードが残ります。',
    newOnly:'NEWだけ表示\n今回初めて入手した種類だけを演出に表示。NEWは開封前の所持状態と比較して判定します。',
    lastOpen:'LAST OPEN / 詳細\n最後の開封の枚数・新規カード・内訳・シナジー・能力の上昇前後を確認。全26種類（0枚も掲載）の内訳を並べ替え・絞り込みできます。開封合計とレア別合計を照合します。',
    totalOpened:()=>`累計開封\nこの周回で ${exact(state.totalOpened)}パック開封。PACK ADDICTの解放条件・ダメージ補正に使われます。`,
    synergy:'ACTIVE SYNERGY\nカードの組み合わせや累計枚数で解放する追加能力。READYは解放済み・条件待ち、%は解放への進捗。各シナジーに重ねると条件が見られます。',
    build:'CARD BUILD\n所持カードと累計枚数。すべての解放済みキャラクターに共通で適用されます。各カードに重ねると効果と正確な枚数を表示します。',
    characters:'PLAYABLE CHARACTERS\nGOLDで3種類の追加キャラクターを解放。解放と同時に交代し、以降の交代は無料。カードビルド・HP・シールドは共通。解放状態はこの周回中のみ保持されます。',
    command:'COMBAT HQ\nGOLDを使ってキャラクターを解放したり、敵とその報酬を強化したりできます。パック購入とは別のコインの使い道です。',
    enemyUpgrade:()=>`ENEMY OVERDRIVE / Lv.${state.enemyLevel}\n上限Lv.999。Lv.30まではHP ×3、ATK ×1.12、GOLD ×1.6、PACK ×1.25。Lv.31以降はHP ×1.16、ATK ×1.04、GOLD ×1.012、PACK ×1.008。購入は解放済みの最高Lv＋1を解放・適用。既存の敵にも残HP比率を保って即反映。\n${state.unlockedEnemyLevel>=MAX_ENEMY_LEVEL?'解放上限です。':`次の費用 ${exact(enemyUpgradeCost())} GOLD。`}解放済みLvへの変更は無料・次WAVEから。1体の報酬増は毎秒収益増を保証しません。`,
    chain:'KILL CHAIN\n0.7秒以内に連続撃破するとチェイン継続。10・25・50・100体で演出が強化。報酬倍率には影響しません。',
    danger:'DANGER\n画面右30%へ敵が入ると赤く脈動、右20%で警告、右10%で画面揺れ。遠距離敵は前線へ来る前に射撃します。',
    enemyCount:'HOSTILES\n現在の敵数 / 同時出現上限。WORLD 1は12体、WORLD 10以降は最大36体。射手は遠距離で停止します。',
    reset:'RESET\n確認後、選択中の体験／遊び方の枠だけを初期化。資源・カード・キャラ解放・敵強化・記録が消えます。他の保存枠は保持。キャンセルで戻れます。',
    close:'開封結果を閉じる\n演出中なら即結果へスキップ。結果表示中なら戦闘へ戻ります。ESCでも同じ操作。',
    skip:'SKIP\n開封演出を飛ばして結果を表示。抽選内容・獲得効果は変わりません。',
  };
  let helpOwner=null;
  function helpText(node) {
    const [kind,id,count]=node.dataset.help.split(':');
    if(kind==='card') {const c=byId[id];return c?`${c.emoji} ${c.name} / ${c.rarity}\n${c.desc}\n所持 ${exact(state.cardCounts[id]||0)}枚。すべてのキャラクターに適用。`:'';}
    if(kind==='character') {const c=characterPool.find(c=>c.id===id);return c?`${c.emoji} ${c.name} / ${c.role}\n${c.desc}\n${state.unlockedCharacters.has(id)?'解放済み。交代は無料。':`解放費用 ${exact(c.cost)} GOLD。`}`:'';}
    if(kind==='synergy') {
      const s=synergyPool.find(s=>s.id===id);if(!s)return '';
      const requirement=Object.entries(s.requires).map(([key,n])=>`${byId[key].name} ${exact(state.cardCounts[key]||0)}/${n}`).concat(s.extraLabel?[s.extraLabel]:[]).join(' + ');
      return `${s.emoji} ${s.name} / ${synergyStatus(s)}\n条件: ${requirement}\n${s.description}`;
    }
    if(kind==='enemy') {
      const enemy=state.enemies.find(e=>e.id===Number(id));
      if(!enemy)return '';
      const behavior=enemy.desc|| (enemy.boss?`ボス。SHIELD ${fmt(enemy.shield)} / ${fmt(enemy.shieldMax)}。HP40%以下で防壁を1回再展開、3連弾→5連弾・射撃頻度1.6倍。`:
        enemy.direct?'⌖ 1秒のLOCK ON予告後、4.8秒ごとに直接攻撃。シールド100%貫通。予告中に倒せば中断。ARMORとPARRYは有効。':
        enemy.bomber?'⚡ 超高速で接近。左74%で0.55秒の導火線後に自爆。起爆前に倒せば不発、起爆した敵は報酬・撃破数なし。':
        enemy.ranged?`遠距離型。画面の左${enemy.stopX}%付近で停止、${enemy.cooldown}秒ごとに射撃。魔法使い・エリート・WORLD 3以降は2連射。`:'接触型。右端に到達するとプレイヤーにダメージ。');
      const trait=enemy.pierce&&!enemy.direct?`\n⟐ シールド${Math.round(enemy.pierce*100)}%貫通。ARMORの軽減・PARRYの完全ガードは有効。`:enemy.debuff==='slow'?'\n⛓ 5秒間、APS −30%。シールド吸収でも付与、完全ガードで防止。':enemy.debuff==='poison'?'\n☣ 6秒間の毒＋毎秒HP回復 −50%。毒は毎秒基礎威力の30%、重複なし。シールド吸収でも付与、完全ガードで防止。':'';
      return `${enemy.emoji} ${enemy.name}${enemy.elite?' / ELITE':''}${enemy.enraged?' / ENRAGED':''}\nHP ${fmt(enemy.hp)} / ${fmt(enemy.maxHp)}\n${behavior}${trait}\nクリックで追撃できます。`;
    }
    if(kind==='rarity')return `${id} / ${exact(Number(count))}枚\n基本出現率 ${(rarityRates.find(r=>r[0]===id)[1]*100).toFixed(id==='SECRET'?3:1)}%。同じレアリティ内のカードは均等に抽選します。`;
    if(kind==='amount')return `開封数 ${id==='max'?'MAX（所持する全パック）':exact(Number(id))+'パック'}\n選択後、OPENで開封。所持数を超える場合は所持分だけ開封します。`;
    const definition=helpDefinitions[kind];return typeof definition==='function'?definition():definition||'';
  }
  function hideHelp() {helpOwner=null;}
  function refreshHelp() {}
  function renderGuide() {
    const value=$('guideTopic').value;
    if(value.startsWith('foe:')){const e=enemyCatalog.find(e=>e.id===value.slice(4));el.helpTooltip.textContent=e.emoji+' '+e.name+'\n'+enemyDescription(e)+'\n攻略：'+(enemyHints[e.id]||'接近順に倒す。群れは範囲攻撃で処理。');}
    else if(value.startsWith('boss:')){const b=bossProfiles.find(b=>b.id===value.slice(5));el.helpTooltip.textContent=b.name+'\n'+b.desc+'\n攻略：'+b.hint;}
    else el.helpTooltip.textContent=helpText({dataset:{help:value}});
  }
  function initializeHelp() {
    const groups=[['操作',[['openMax','📦 MAX開封'],['enemyUpgrade','🔥 敵強化 Lv.999'],['player','🧙 プレイヤー'],['wave','⚔ WAVE'],['pause','Ⅱ 停止・復帰'],['sound','🔊 サウンド'],['reset','↻ 初期化']]],['敵',enemyCatalog.filter(e=>e.id).map(e=>['foe:'+e.id,e.emoji+' '+e.name])],['キャラ',characterPool.map(c=>['character:'+c.id,c.emoji+' '+c.name])],['カード',cardPool.map(c=>['card:'+c.id,c.emoji+' '+c.name])],['シナジー',synergyPool.map(s=>['synergy:'+s.id,s.emoji+' '+s.name])]];
    groups.push(['能力・システム',Object.entries(helpDefinitions).filter(([key])=>!groups[0][1].some(([id])=>id===key)).map(([key,value])=>[key,(typeof value==='function'?value():value).split('\n')[0]])]);
    groups.push(['ボス',bossProfiles.map(b=>['boss:'+b.id,b.emoji+' '+b.name])]);
    $('guideTopic').innerHTML=groups.map(([label,entries])=>'<optgroup label="'+label+'">'+entries.map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')+'</optgroup>').join('');
    $('guideBtn').addEventListener('click',()=>{if(state.modalOpen||state.decisionOpen)return;state.helpOpen=true;renderGuide();$('guideDialog').showModal();renderPauseState();});
    $('guideTopic').addEventListener('change',renderGuide);
    $('guideCloseBtn').addEventListener('click',()=>$('guideDialog').close());
    $('guideDialog').addEventListener('close',()=>{state.helpOpen=false;renderPauseState();$('guideBtn').focus({preventScroll:true});});
    for(const button of document.querySelectorAll('[data-jump]'))button.addEventListener('click',()=>{const section=$(button.dataset.jump);const details=section.closest('details');if(details)details.open=true;focusSection(section.id);});
  }
  function renderUI() {
    const stats=snapshotStats();
    setText(el.worldText,`${state.world}-${state.stage}`);setText(el.waveText,`${state.wave} / 5`);
    setText(el.waveType,state.waveType.toUpperCase());el.waveType.classList.toggle('special',state.waveType!=='normal');
    const timeLeft=Math.max(0,Math.ceil(state.waveLimit-state.waveElapsed));
    setText(el.waveTimeText,`${String(Math.floor(timeLeft/60)).padStart(2,'0')}:${String(timeLeft%60).padStart(2,'0')}`);
    el.waveTimeBar.style.width=clamp((state.waveLimit-state.waveElapsed)/state.waveLimit*100,0,100)+'%';el.waveClock.classList.toggle('urgent',timeLeft<=10);
    setText(el.killsText,fmt(state.kills));setText(el.goldText,fmt(state.gold));setText(el.packText,fmt(state.packs));
    setText(el.packBigText,fmt(state.packs));
    setText(el.openMaxCount,state.packs>0?fmt(state.packs)+' PACKS →':'パックなし');
    el.openMaxBtn.disabled=state.packs<=0||state.modalOpen;
    el.openMaxBtn.setAttribute('aria-label',`所持パック ${exact(state.packs)}個をMAX開封`);
    setText(el.hpText,`${fmt(Math.ceil(state.hp))} / ${fmt(state.maxHp)}`);el.hpBar.style.width=clamp(state.hp/state.maxHp*100,0,100)+'%';
    setText(el.damageText,fmt(stats.damage));setText(el.apsText,stats.aps.toFixed(1));setText(el.critText,Math.round(stats.crit*100)+'%');
    setText(el.luckText,Math.round(stats.packChance*100)+'%');setText(el.splashText,Math.round(stats.splash*100)+'%');
    setText(el.armorText,Math.round(stats.armor*100)+'%');setText(el.barrierText,`${fmt(state.shield)} / ${fmt(stats.shieldMax)}`);
    setText(el.regenText,fmtDecimal(stats.regen)+'/s');setText(el.blockText,Math.round(stats.blockChance*100)+'%');
    setText(el.shieldText,fmt(state.shield));el.shieldBar.style.width=(stats.shieldMax?clamp(state.shield/stats.shieldMax*100,0,100):0)+'%';
    const slowed=isSlowed(),poisoned=isPoisoned(),jammed=isJammed();
    el.playerCard.classList.toggle('slowed',slowed);el.playerCard.classList.toggle('poisoned',poisoned);
    el.debuffList.classList.toggle('hidden',!slowed&&!poisoned&&!jammed);$('jamDebuff').classList.toggle('hidden',!jammed);setText($('jamDebuff'),`📡 防壁回復停止 ${Math.ceil(Math.max(0,state.debuffs.jamUntil-state.gameTime))}s`);
    el.slowDebuff.classList.toggle('hidden',!slowed);el.poisonDebuff.classList.toggle('hidden',!poisoned);
    setText(el.slowDebuff,`⛓ SLOW ${Math.ceil(Math.max(0,state.debuffs.slowUntil-state.gameTime))}s · APS −30%`);
    setText(el.poisonDebuff,`☣ POISON ${Math.ceil(Math.max(0,state.debuffs.poisonUntil-state.gameTime))}s · 回復 −50%`);
    const boss=state.enemies.find(e=>e.boss);
    el.bossShieldStatus.classList.toggle('hidden',!boss);
    if(boss)setText(el.bossShieldStatus,`🛡 ボス防壁 ${fmt(boss.shield)} / ${fmt(boss.shieldMax)} · ${boss.enraged?'再展開済み（残り0回）':'HP40%で再展開（残り1回）'}`);
    $('bossSkillStatus').classList.toggle('hidden',!boss);
    if(boss){const profile=bossProfiles.find(b=>b.id===boss.bossProfile),warning=bossWindingUp(boss),exposed=boss.exposedUntil>state.gameTime;setText($('bossSkillStatus'),`${profile.emoji} ${profile.name} · ${exposed?'BREAK 弱体 '+Math.ceil(boss.exposedUntil-state.gameTime)+'秒':boss.bossProfile==='bastion'&&boss.skillUses>=3?'再装填を使い切った':(warning?'⚠ ':'')+profile.skill+'まで '+Math.max(0,boss.skillInterval-boss.skillTimer).toFixed(1)+'秒'}${boss.bossProfile==='bastion'?' / 装填残り'+Math.max(0,3-boss.skillUses)+'回':''}`);$('bossSkillStatus').classList.toggle('urgent',warning);}
    el.bossProgress.style.width=(boss?boss.hp/boss.maxHp*100:((state.wave-1)+Math.min(1,state.waveKills/targetWaveKills()))/5*100)+'%';
    setText(el.progressLabel,boss?'BOSS HP':'STAGE PROGRESS');
    setText(el.sectorText,String(state.world).padStart(2,'0'));setText(el.enemyCount,`HOSTILES ${state.enemies.length} / ${maxEnemies()}`);
    const selected=state.selectedOpen==='max'?state.packs:Math.min(state.selectedOpen,state.packs);
    const buttonText=`📦 OPEN ×${state.selectedOpen==='max'?'MAX · '+fmt(selected):fmt(selected)} →`;
    setText(el.openBtn,buttonText);el.openBtn.disabled=selected<=0;
    el.buyPackBtn.disabled=state.gold<100||state.packs>=MAX_RESOURCE;
    setText(el.totalOpened,'TOTAL OPENED '+fmt(state.totalOpened));
    const buffs=[];
    if(isJackpot())buffs.push(['synergy:jackpot',`🌈 JACKPOT ${Math.ceil(state.jackpotUntil-state.gameTime)}s · DROP ×3`]);
    if(isLastStand())buffs.push(['synergy:lastStand','❤️ LAST STAND']);if(isTaxActive())buffs.push(['synergy:kingsTax','👑 TAX · DMG ×2']);
    if(state.infinityProcs)buffs.push(['card:infinity','♾️ '+(state.infinityChance*100).toFixed(2)+'%']);
    if(state.chronoSlow)buffs.push(['card:chrono',`⏳ SLOW ${Math.round(state.chronoSlow*100)}%`]);
    const buffsHTML=buffs.map(([help,text])=>`<span data-help="${help}" tabindex="0">${text}</span>`).join('');if(el.buffList.innerHTML!==buffsHTML)el.buffList.innerHTML=buffsHTML;
    const visible=state.chain>=2&&state.effectTime-state.lastKillTime<1.4;
    const tier=state.chain>=100?4:state.chain>=50?3:state.chain>=25?2:state.chain>=10?1:0;
    el.killChain.className='kill-chain'+(visible?' visible':'')+' tier-'+tier;
    if(visible)setText(el.killChain,'KILL CHAIN ×'+state.chain);
    renderBuilds();renderSynergies();renderCommand();renderExperience();refreshHelp();
  }
  function updateNotifications() {
    if(state.effectTime>=state.bannerUntil)el.waveBanner.classList.remove('show');
    if(state.effectTime>=state.hurtUntil)el.playerCard.classList.remove('hurt');
    if(state.effectTime>=state.shakeUntil)el.battlefield.classList.remove('shaking');
    if(state.effectTime>=state.toastUntil) {
      el.synergyToast.classList.remove('show');
      if(state.toastQueue.length) {
        const s=state.toastQueue.shift();el.synergyToast.innerHTML=`<small>SYNERGY UNLOCKED</small><b>${s.emoji} ${s.name}</b>`;
        sound.play('synergy');emitBurst(45,64,'#d6ff73',30,1.2);shockwave(45,64,'#b594ff',170);
        void el.synergyToast.offsetWidth;el.synergyToast.classList.add('show');state.toastUntil=state.effectTime+1.4;
      }
    }
    if(state.effectTime>=state.supplyUntil)el.supplyNotice.textContent='';
  }
  let lastFrame=null,renderElapsed=0;
  function step(realDt) {
    // Animation uses wall time; combat/buffs use simulation time. Modal pause freezes both combat clocks.
    updatePackAnimation(realDt);
    const wasRespawning=state.respawnRemaining>0;
    if(wasRespawning&&!state.manualPause&&!state.modalOpen&&!state.decisionOpen&&!state.helpOpen) {
      const before=Math.ceil(state.respawnRemaining);state.respawnRemaining=Math.max(0,state.respawnRemaining-realDt);
      if(state.respawnRemaining<1e-7)state.respawnRemaining=0;
      if(before!==Math.ceil(state.respawnRemaining)){renderPauseState();renderUI();}
      if(state.respawnRemaining===0){if(state.ready){showBanner('復帰！','ビルドを保持して再出撃');sound.play('wave',.7);}saveProgress();}
    }
    if(!wasRespawning&&!isPaused()) {
      state.effectTime+=realDt;
      const speed=settings.autoSlow&&state.enemies.some(isUrgent)?.5:state.speed;
      const dt=realDt*speed*(state.effectTime<state.bossSlowUntil?.25:state.effectTime<state.impactSlowUntil?.35:1);
      state.gameTime+=dt;state.waveElapsed+=dt;state.combatSeconds+=dt;
      updateDebuffs();if(isPaused()){renderUI();return;}
      updateEffects();if(isPaused()){renderUI();return;}
      updateEnemies(dt);if(isPaused()){renderUI();return;}updateAbilities(dt);
      state.spawnTimer+=dt;
      const rushing=state.waveType==='rush'&&state.waveElapsed<5;
      const interval=rushing?.65/3:state.waveType==='boss'?.85:.65;
      if(state.spawnTimer>=interval) {
        state.spawnTimer%=interval;
        const cap=state.waveType==='elite'?Math.min(6,maxEnemies()):maxEnemies();
        spawnGroup({count:Math.max(0,Math.min(cap-state.enemies.length,rushing?5:4)),formation:rushing?'rush':Math.random()<.35?'line':'cluster',small:rushing});
      }
      const aps=snapshotStats().aps;state.attackTimer+=dt;
      // Bound catch-up on slow frames; never create per-enemy timers or additional RAF loops.
      let attacks=0;
      while(state.attackTimer>=1/aps&&attacks<12) {state.attackTimer-=1/aps;attack();attacks++;}
      state.attackTimer=Math.min(state.attackTimer,1/aps);
      advanceWaveIfNeeded();checkWaveDeadline();updateNotifications();updateJuice(realDt);
    }
    session.lastSave+=realDt;if(session.lastSave>=5){session.lastSave=0;saveProgress();}
    renderElapsed+=realDt;if(renderElapsed>=.1){renderElapsed=0;renderUI();}
  }
  function tick(now) {
    const dt=lastFrame===null?0:Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
    if(!document.hidden)step(dt);
    requestAnimationFrame(tick);
  }
  function resetGame(ready=true) {
    hideHelp();sound.stopAll();
    for(const enemy of [...state.enemies])removeEnemy(enemy);clearEffects();processingDeaths=false;
    Object.assign(state,initialState());state.ready=ready;lastFrame=null;renderElapsed=0;
    el.packModal.classList.add('hidden');el.packModal.setAttribute('aria-hidden','true');
    el.packConfetti.replaceChildren();el.packStage.classList.remove('hero-revealed');
    document.body.classList.remove('modal-open');document.querySelector('.app-shell').inert=false;
    el.battlefield.className='battlefield';el.waveBanner.classList.remove('show');el.synergyToast.classList.remove('show');
    el.playerCard.classList.remove('hurt');clearDebuffs();el.supplyNotice.textContent='';el.commandNotice.textContent='';
    el.packResult.className='pack-result empty-state';el.packResult.innerHTML='<span>✦</span><b>YOUR NEXT BUILD IS IN THE BOX.</b><p>パックを開封すると、直近の結果がここに残ります。</p>';
    el.rareOnly.checked=false;el.newOnly.checked=false;setText(el.speedBtn,'⏩ ×1');
    for(const button of el.amountButtons.children) {
      const selected=button.dataset.amount==='1';button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
    }
    startWave(true);renderPauseState();renderAVControls();renderUI();
  }
  const achievements=[
    {label:'箱のはじまり',goal:'最初のパックを開封',done:()=>state.totalOpened>0},
    {label:'千の箱',goal:'合計1,000個開封',done:()=>state.totalOpened>=1000},
    {label:'秘密の発見',goal:'SECRETを1種類入手',done:()=>cardPool.some(c=>c.rarity==='SECRET'&&state.discovered.has(c.id))},
    {label:'ボスブレイカー',goal:'ボスを1体討伐',done:()=>state.bossesDefeated>0},
    {label:'次の世界へ',goal:'WORLD 2に到達',done:()=>Object.values(state.records).some(n=>n>25)},
    {label:'四つの戦い方',goal:'全4キャラを解放',done:()=>state.unlockedCharacters.size===4},
    {label:'完全コレクション',goal:'全26種類を入手',done:()=>state.discovered.size===cardPool.length},
  ];
  const progressPosition=()=>Math.min(MAX_RESOURCE,(state.world-1)*25+(state.stage-1)*5+state.wave);
  const libraryState={tab:'enemies',returnFocus:null};
  function libraryEntries(tab) {
    if(tab==='enemies')return enemyCatalog.map(e=>({name:e.emoji+' '+e.name,desc:enemyDescription(e),hint:enemyHints[e.id]||'接近順に倒し、密集した敵には範囲攻撃を使う。',meta:e.summoned?'召喚・分裂専用 / 追加報酬なし':e.linkRole?'連携の中心 / ボス随伴・後半の通常抽選':'敵ユニット / 全種類公開'}));
    if(tab==='bosses')return bossProfiles.map(b=>({name:b.emoji+' '+b.name,desc:b.desc+' 共通：HP60%分の防壁、HP40%で1回再展開＋激昂。',hint:b.hint,meta:'1.5秒予告 / WORLDとSTAGEに応じ3タイプが順番に登場'}));
    if(tab==='cards')return cardPool.map(c=>({name:c.emoji+' '+c.name+' / '+c.rarity,desc:c.desc,hint:['armor','barrier','parry','vital','aegis','regen'].includes(c.id)?'防壁・HP・軽減・完全ガードを組み合わせ、貫通や回復妨害にも備える。':['splash','inferno','chain','starfall','void'].includes(c.id)?'召喚雑兵や分裂した敵が密集する場面に有効。':'キャラの長所と組み合わせ、味方シナジー図鑑の解放条件も確認。',meta:state.discovered.has(c.id)?'入手済 ×'+exact(state.cardCounts[c.id]):'未入手 · パックから入手',owned:state.discovered.has(c.id)}));
    if(tab==='characters')return characterPool.map(c=>({name:c.emoji+' '+c.name,desc:'長所：'+c.merit+'。弱点：'+c.drawback+'。',hint:c.id==='nova'?'群体・召喚・分裂に強い。防壁容量が低いためHPと軽減を補う。':c.id==='ranger'?'中継役を含む射手隊を崩す。被ダメージ増に注意。':c.id==='counter'?'接触や弾幕へ反撃。通常火力が低いため時間制限に注意。':'特殊な弱点がない。カードのシナジーで火力と防御を伸ばす。',meta:state.unlockedCharacters.has(c.id)?'解放済み':'解放費用 '+exact(c.cost)+' GOLD'}));
    if(tab==='synergies')return synergyPool.map(s=>({name:s.emoji+' '+s.name,desc:s.description,hint:'条件：'+Object.entries(s.requires).map(([id,n])=>byId[id].name+' ×'+n).concat(s.extraLabel?[s.extraLabel]:[]).join(' ＋ '),meta:synergyStatus(s)}));
    if(tab==='links')return enemyLinkCatalog.map(s=>({name:s.emoji+' '+s.name,desc:s.effect,hint:s.hint,meta:s.condition+' / 範囲38未満・同種は非重複'}));
    return strategyHints.map(([name,desc])=>({name,desc,hint:'戦闘中の攻略ヒントと敵連携表示も確認しよう。',meta:'攻略ヒント'}));
  }
  function renderLibrary() {
    const query=$('librarySearch').value.trim().toLocaleLowerCase(),entries=libraryEntries(libraryState.tab),shown=entries.filter(e=>(e.name+' '+e.desc+' '+e.hint+' '+e.meta).toLocaleLowerCase().includes(query));
    for(const button of $('libraryTabs').children)button.setAttribute('aria-pressed',String(button.dataset.libraryTab===libraryState.tab));
    setText($('libraryCount'),shown.length+' / '+entries.length+'件 · 全種類・未入手も表示');
    $('libraryList').innerHTML=shown.length?shown.map(e=>`<article class="library-entry${e.owned===false?' unowned':''}"><h3>${e.name}</h3><small>${e.meta}</small><p>${e.desc}</p><p class="strategy-note">💡 ${e.hint}</p></article>`).join(''):'<p class="library-empty">該当する項目はありません。検索語を短くしてみよう。</p>';
  }
  function openLibrary(tab='enemies') {
    if(state.modalOpen||state.decisionOpen||state.helpOpen)return;
    libraryState.tab=tab;libraryState.returnFocus=document.activeElement;$('librarySearch').value='';state.helpOpen=true;renderLibrary();$('libraryDialog').showModal();renderPauseState();$('librarySearch').focus();
  }
  $('libraryBtn').addEventListener('click',()=>openLibrary());
  for(const button of document.querySelectorAll('[data-library]'))button.addEventListener('click',()=>openLibrary(button.dataset.library));
  $('librarySearch').addEventListener('input',renderLibrary);
  $('libraryTabs').addEventListener('click',event=>{const button=event.target.closest('[data-library-tab]');if(button){libraryState.tab=button.dataset.libraryTab;$('librarySearch').value='';renderLibrary();$('libraryList').scrollTop=0;}});
  $('libraryCloseBtn').addEventListener('click',()=>$('libraryDialog').close());
  $('libraryDialog').addEventListener('close',()=>{state.helpOpen=false;renderPauseState();if(libraryState.returnFocus?.isConnected)libraryState.returnFocus.focus({preventScroll:true});});
  function positionLabel(n){return n?`WORLD ${Math.floor((n-1)/25)+1}-${Math.floor((n-1)%25/5)+1} / WAVE ${(n-1)%5+1}`:'未出撃';}
  function renderArchive() {
    if(state.ready)state.records[state.character]=Math.max(state.records[state.character]||0,progressPosition());
    const achievementHTML=achievements.map(a=>`<div class="achievement ${a.done()?'achieved':''}"><b>${a.done()?'✓ 達成':'○ 次の目標'} · ${a.label}</b><span>${a.goal}</span></div>`).join('');
    if($('achievementList').innerHTML!==achievementHTML)$('achievementList').innerHTML=achievementHTML;
    const recordHTML=characterPool.map(c=>`<span>${c.emoji} ${c.name}<br><b>${positionLabel(state.records[c.id]||0)}</b></span>`).join('');
    if($('characterRecords').innerHTML!==recordHTML)$('characterRecords').innerHTML=recordHTML;
    $('exportOpenBtn').disabled=!state.lastOpen;
  }
  async function exportImage(kind='build') {
    const opening=kind==='open';if(opening&&!state.lastOpen)return;
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=opening?1850:2050;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#111625';ctx.fillRect(0,0,canvas.width,canvas.height);
    let y=90;const line=(text,size=28,color='#e5eafa')=>{ctx.font=`${size}px "Yu Gothic",sans-serif`;ctx.fillStyle=color;ctx.fillText(text,60,y,1080);y+=size+20;};
    line('LOOTMOJI / OVERLOAD',48,'#d6ff73');
    line(`${session.guest?'ゲスト / ':''}${session.mode==='demo'?'DEMO体験（補給あり）':'通常プレイ'} / ${presets[session.preset].name}`,30,'#ffdaa9');
    line(opening?'今回の開封結果':'現在のビルド',38);line(`${positionLabel(progressPosition())} / ${currentCharacter().name}`);
    const result=state.lastOpen,stats=snapshotStats();
    if(opening){line(`開封 ${exact(result.amount)}個 · NEW ${result.newIds.length}種類`);line(rarityLabels.map(r=>`${r}: ${exact(result.counts[r])}`).join(' / '),24);}
    else{line(`GOLD ${fmt(state.gold)} / PACK ${fmt(state.packs)} / 挑戦Lv.${state.enemyLevel}`);line(`攻撃 ${fmt(stats.damage)} / 毎秒攻撃 ${stats.aps.toFixed(2)} / 軽減 ${Math.round(stats.armor*100)}%`);line(`HP ${fmt(state.hp)}/${fmt(state.maxHp)} / 防壁 ${fmt(state.shield)}/${fmt(stats.shieldMax)}`);line(`図鑑 ${state.discovered.size}/26 · ボス討伐 ${state.bossesDefeated}`);}
    for(const c of [...cardPool].sort((a,b)=>rarityRank[b.rarity]-rarityRank[a.rarity]))line(`${c.rarity.padEnd(6)} ${c.name}   ×${exact(opening?result.cardCounts.get(c.id)||0:state.cardCounts[c.id]||0)}${opening&&result.newIds.includes(c.id)?' NEW':''}`,25,state.discovered.has(c.id)?'#e5eafa':'#9ca9c1');
    line('ローカル保存 / 外部送信なし',24,'#a2b1ce');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(blob){downloadBlob(blob,`lootmoji-${session.mode}-${session.preset}-${kind}.png`);$('exportStatus').textContent='PNGを保存しました。';}else $('exportStatus').textContent='画像を生成できませんでした。';
  }
  $('exportBuildBtn').addEventListener('click',()=>exportImage('build'));
  $('exportOpenBtn').addEventListener('click',()=>exportImage('open'));
  function renderResultInventory(result=state.lastOpen) {
    if(!result)return;
    const all=cardPool.map(c=>({...c,count:result.cardCounts.get(c.id)||0,isNew:result.newIds.includes(c.id)}));
    const sort=$('resultSort').value;
    const visible=all.filter(c=>($('resultRarity').value==='all'||c.rarity===$('resultRarity').value)&&(!$('resultNew').checked||c.isNew)).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='count'?b.count-a.count||rarityRank[b.rarity]-rarityRank[a.rarity]:rarityRank[b.rarity]-rarityRank[a.rarity]||b.count-a.count);
    el.cardRows.innerHTML=visible.map(c=>`<div class="card-row rarity-${c.rarity}" data-help="card:${c.id}" tabindex="0"><small>${c.rarity}</small><span>${c.emoji} ${c.name}${c.isNew?'<em>NEW</em>':''}</span><b>×${exact(c.count)}</b></div>`).join('')||'<p>該当するカードはありません。</p>';
    const total=all.reduce((n,c)=>n+c.count,0),rarityTotal=Object.values(result.counts).reduce((a,b)=>a+b,0),shown=visible.reduce((n,c)=>n+c.count,0);
    el.detailCount.textContent=`${visible.length} / 26種類 · ${exact(result.amount)}枚`;
    $('resultAudit').textContent=`照合${total===result.amount&&rarityTotal===result.amount?'OK':'NG'}：全カード ${exact(total)}枚 ＝ レア別 ${exact(rarityTotal)}枚 ＝ 開封 ${exact(result.amount)}個。絞り込み表示：${exact(shown)}枚。0枚のカードも掲載。`;
  }
  for(const id of ['resultSort','resultRarity','resultNew'])$(id).addEventListener('change',()=>renderResultInventory());
  for(const key of ['fxFlash','fxShake','fxParticles','fxNumbers'])$(key).addEventListener('change',event=>{
    settings[key]=event.target.checked;if(!settings.fxFlash){state.flashPower=0;el.battleFlash.style.opacity=0;}if(!settings.fxShake)el.battlefield.classList.remove('shaking');if(!settings.fxParticles)juiceParticles.length=0;
    for(const [kind,queue] of Object.entries(effects))if(kind!=='projectile')for(const fx of queue)fx.el.style.display=(kind==='damage'?!settings.fxNumbers:!settings.fxParticles)?'none':'';saveProgress();
  });
  function resetEconomy(){state.earnedGold=0;state.earnedPacks=0;state.combatSeconds=0;}
  function compareCharacters() {
    const original=state.character;
    try{return characterPool.map(c=>{
      state.character=c.id;const stats=snapshotStats(),hit=stats.damage*(1+stats.crit*(state.critMult-1)),base=hit*stats.aps;
      return {id:c.id,single:base*(c.id==='nova'?2.2:1),group:base*(c.id==='nova'?7:c.id==='ranger'?1.65:1),counter:c.id==='counter'?stats.damage*4:0,incoming:100*(c.incoming||1)*(1-stats.armor),shield:stats.shieldMax,aps:stats.aps};
    });}finally{state.character=original;}
  }
  function renderCharacterComparison() {
    $('characterCompare').innerHTML='<thead><tr><th>キャラ</th><th>単体 / 秒</th><th>密集5体 / 秒</th><th>反撃 / 回</th><th>100被弾→軽減後</th><th>防壁上限</th></tr></thead><tbody>'+compareCharacters().map(c=>`<tr><th>${characterPool.find(p=>p.id===c.id).name}</th><td>${fmtDecimal(c.single)}</td><td>${fmtDecimal(c.group)}</td><td>${fmtDecimal(c.counter)}</td><td>${fmtDecimal(c.incoming)}</td><td>${fmt(c.shield)}</td></tr>`).join('')+'</tbody>';
  }
  $('characterCompare').closest('details').addEventListener('toggle',renderCharacterComparison);
  $('enemyLevelChoice').addEventListener('change',event=>{const level=Number(event.target.value);if(Number.isInteger(level)&&level>=0&&level<=state.unlockedEnemyLevel){state.pendingEnemyLevel=level;saveProgress();renderUI();}});
  // Versioned local checkpoints contain only data, never DOM nodes, timers or callbacks.
  const SAVE_KEY='lootmoji.progress.v1',SAVE_VERSION=1;
  const progressKeys=['world','stage','wave','kills','gold','packs','hp','maxHp','damage','aps','crit','critMult','packChance','splash','goldMult','doubleChance','magnetChance','chainChance','inferno','packBonus','infinityChance','infinityProcs','armor','shield','shieldMax','regen','blockChance','aegisCopies','chronoSlow','starfallCopies','enemyLevel','unlockedEnemyLevel','totalOpened','normalCards','bestRareBatch','waveTimeouts','bossesDefeated'];
  const slotKey=()=>session.mode+':'+session.preset;
  const presets={
    standard:{name:'通常',time:1,goldLoss:.18,packLoss:.1,timeoutLoss:.1,retryPause:false,description:'現在の強敵・制限時間を維持。撃破時：GOLD −18%・PACK −10%、1WORLD戻る。時間切れ：GOLD −10%、同じWAVE。自動再挑戦。'},
    relaxed:{name:'ゆったり',time:2,goldLoss:0,packLoss:0,timeoutLoss:0,retryPause:true,description:'制限時間2倍、敵と報酬は通常と同じ。撃破・時間切れの資源損失なし。同じWAVEで停止して再準備。完全放置ではありません。'},
    challenge:{name:'挑戦',time:.75,goldLoss:.18,packLoss:.1,timeoutLoss:.1,retryPause:true,description:'制限時間75%、敵と報酬は通常と同じ。損失は通常と同じ。失敗後は停止して再準備。到達記録は別枠。'},
  };
  function captureProgress() {
    if(state.ready)state.records[state.character]=Math.max(state.records[state.character]||0,progressPosition());
    const data={};for(const key of progressKeys)data[key]=state[key];
    return {...data,character:state.character,unlockedCharacters:[...state.unlockedCharacters],cardCounts:{...state.cardCounts},discovered:[...state.discovered],activeSynergies:[...state.activeSynergies],waveType:state.waveType,pendingEnemyLevel:state.pendingEnemyLevel,records:structuredClone(state.records),respawnRemaining:state.respawnRemaining};
  }
  function validProgress(raw) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('進行データの形式が不正です');
    const clean={};for(const key of progressKeys){const n=raw[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>MAX_STAT)throw Error('数値が不正：'+key);clean[key]=n;}
    clean.respawnRemaining=raw.respawnRemaining??0;
    if(typeof clean.respawnRemaining!=='number'||!Number.isFinite(clean.respawnRemaining)||clean.respawnRemaining<0||clean.respawnRemaining>10)throw Error('復帰時間が不正です');
    for(const key of ['world','stage','wave','kills','gold','packs','enemyLevel','unlockedEnemyLevel','totalOpened','normalCards','bestRareBatch','waveTimeouts','infinityProcs','aegisCopies','starfallCopies','bossesDefeated'])if(!Number.isSafeInteger(clean[key]))throw Error('整数が不正：'+key);
    if(clean.world<1||clean.stage<1||clean.stage>5||clean.wave<1||clean.wave>5||clean.maxHp<1||clean.hp>clean.maxHp||clean.aps<=0||clean.enemyLevel>MAX_ENEMY_LEVEL||clean.unlockedEnemyLevel>MAX_ENEMY_LEVEL||clean.enemyLevel>clean.unlockedEnemyLevel)throw Error('進行範囲が不正です');
    for(const key of ['crit','packChance','splash','doubleChance','magnetChance','chainChance','infinityChance','armor','blockChance','chronoSlow'])if(clean[key]>1)throw Error('割合が不正：'+key);
    const knownCharacters=new Set(characterPool.map(c=>c.id));
    const list=(value,allowed)=>{if(!Array.isArray(value)||value.length>allowed.size||new Set(value).size!==value.length||value.some(id=>!allowed.has(id)))throw Error('IDリストが不正です');return [...value];};
    clean.unlockedCharacters=list(raw.unlockedCharacters,knownCharacters);
    if(!clean.unlockedCharacters.includes('collector')||!clean.unlockedCharacters.includes(raw.character))throw Error('キャラクターが不正です');clean.character=raw.character;
    const knownCards=new Set(cardPool.map(c=>c.id));clean.discovered=list(raw.discovered,knownCards);clean.activeSynergies=list(raw.activeSynergies,new Set(synergyPool.map(s=>s.id)));
    if(!raw.cardCounts||typeof raw.cardCounts!=='object'||Array.isArray(raw.cardCounts))throw Error('カード枚数が不正です');
    clean.cardCounts={};for(const [id,n] of Object.entries(raw.cardCounts)){if(!knownCards.has(id)||!Number.isSafeInteger(n)||n<1||!clean.discovered.includes(id))throw Error('カード枚数が不正です');clean.cardCounts[id]=n;}
    if(clean.discovered.some(id=>!clean.cardCounts[id])||Math.min(MAX_RESOURCE,Object.values(clean.cardCounts).reduce((a,b)=>a+b,0))!==clean.totalOpened)throw Error('開封数とカード合計が一致しません');
    if(!['normal','rush','elite','swarm','boss'].includes(raw.waveType)||raw.waveType==='boss'&&clean.wave!==5)throw Error('WAVEが不正です');clean.waveType=raw.waveType;
    if(raw.pendingEnemyLevel!==null&&(!Number.isInteger(raw.pendingEnemyLevel)||raw.pendingEnemyLevel<0||raw.pendingEnemyLevel>clean.unlockedEnemyLevel))throw Error('挑戦Lvが不正です');clean.pendingEnemyLevel=raw.pendingEnemyLevel;
    clean.records={};if(!raw.records||typeof raw.records!=='object')throw Error('記録が不正です');
    for(const [id,n] of Object.entries(raw.records)){if(!knownCharacters.has(id)||!Number.isSafeInteger(n)||n<0)throw Error('到達記録が不正です');clean.records[id]=n;}
    return clean;
  }
  function validateSave(raw) {
    if(!raw||raw.version!==SAVE_VERSION||!raw.slots||typeof raw.slots!=='object'||Array.isArray(raw.slots))throw Error('対応しない保存形式です');
    const slots={};for(const [key,value] of Object.entries(raw.slots)){if(!/^(normal|demo):(standard|relaxed|challenge)$/.test(key))throw Error('保存枠が不正です');slots[key]=validProgress(value);}
    const prefs={...settings},incoming=raw.settings||{};
    for(const key of ['autoSlow','fxFlash','fxShake','fxParticles','fxNumbers','rareOnly','newOnly'])if(typeof incoming[key]==='boolean')prefs[key]=incoming[key];
    if([1,2,4].includes(incoming.speed))prefs.speed=incoming.speed;
    if([1,10,100,1000,10000,100000,1000000,'max'].includes(incoming.amount))prefs.amount=incoming.amount;
    for(const [key,values] of Object.entries({fxIntensity:['max','low'],fontScale:['normal','large'],targetPolicy:['standard','danger','boss'],animationPolicy:['luxury','special','quick']}))if(values.includes(incoming[key]))prefs[key]=incoming[key];
    const audio={enabled:raw.audio?.enabled!==false,volume:typeof raw.audio?.volume==='number'&&Number.isFinite(raw.audio.volume)?clamp(raw.audio.volume,0,1):.35};
    const active=/^(normal|demo):(standard|relaxed|challenge)$/.test(raw.active||'')?raw.active:'normal:standard';
    return {version:SAVE_VERSION,slots,settings:prefs,audio,active};
  }
  function saveEnvelope() {
    const audio=sound.inspect();return {version:SAVE_VERSION,active:slotKey(),slots:session.slots,settings:{...settings},audio:{enabled:audio.enabled,volume:audio.volume}};
  }
  function saveProgress() {
    if(session.guest||!session.storageReady)return false;
    session.slots[slotKey()]=captureProgress();
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(saveEnvelope()));session.saveStatus='自動保存済み · このブラウザ／ファイルの保存領域';return true;}
    catch{session.saveStatus='保存できません（容量・ブラウザ設定）。バックアップ保存をご利用ください。';return false;}
  }
  function syncPreferences() {
    for(const key of ['targetPolicy','fontScale','animationPolicy'])$(key).value=settings[key];
    for(const key of ['autoSlow','fxFlash','fxShake','fxParticles','fxNumbers'])$(key).checked=settings[key];
    state.speed=settings.speed;state.selectedOpen=settings.amount;el.rareOnly.checked=settings.rareOnly;el.newOnly.checked=settings.newOnly;
    setText(el.speedBtn,'⏩ ×'+state.speed);for(const button of el.amountButtons.children){const active=String(state.selectedOpen)===button.dataset.amount;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
    document.body.classList.toggle('large-type',settings.fontScale==='large');renderAVControls();
  }
  function restoreProgress(data) {
    resetGame(false);if(data){
      for(const enemy of [...state.enemies])removeEnemy(enemy);clearEffects();
      for(const key of progressKeys)state[key]=data[key];
      state.character=data.character;state.cardCounts={...data.cardCounts};state.discovered=new Set(data.discovered);state.unlockedCharacters=new Set(data.unlockedCharacters);state.activeSynergies=new Set(data.activeSynergies);
      state.records={...data.records};state.buildDirty=true;state.commandSignature='';state.synergySignature='';
      state.shield=Math.min(state.shield,shieldCapacity());startWave(false,data.waveType);state.pendingEnemyLevel=data.pendingEnemyLevel;state.respawnRemaining=data.respawnRemaining??0;
    }
    prepareBattle(data?'続きから再開しました。同じWAVEの冒頭から再挑戦。HP・防壁・資源・ビルドを保持しています。':'準備中は敵も制限時間も止まっています。');
    syncPreferences();
  }
  function initializeStorage() {
    try {
      const stored=localStorage.getItem(SAVE_KEY);
      if(stored){const data=validateSave(JSON.parse(stored));session.slots=data.slots;[session.mode,session.preset]=data.active.split(':');Object.assign(settings,data.settings);sound.setVolume(data.audio.volume);if(sound.inspect().enabled!==data.audio.enabled)sound.toggle();}
      session.storageReady=true;restoreProgress(session.slots[slotKey()]);saveProgress();
    } catch(error) {
      // Never overwrite an unreadable checkpoint automatically.
      session.storageReady=false;session.saveStatus='保存データを読み込めません：'+error.message+'。元データは保持しました。ゲスト試遊またはバックアップ復元をご利用ください。';prepareBattle();
    }
  }
  function switchSlot(mode,preset) {
    if(!['normal','demo'].includes(mode)||!presets[preset]||state.modalOpen)return;
    session.slots[slotKey()]=captureProgress();saveProgress();session.mode=mode;session.preset=preset;
    restoreProgress(session.slots[slotKey()]);saveProgress();renderUI();
  }
  function giveDemoPacks() {
    if(session.mode!=='demo')switchSlot('demo',session.preset);
    state.packs=addResource(state.packs,1e6);state.supplyUntil=state.effectTime+3;el.supplyNotice.textContent='DEMO枠へ 1,000,000 補給完了';saveProgress();renderUI();
  }
  function downloadBlob(blob,name) {
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  $('playMode').addEventListener('change',event=>{switchSlot(event.target.value,session.preset);focusSection('packPanel');});
  $('playPreset').addEventListener('change',event=>{switchSlot(session.mode,event.target.value);focusSection('packPanel');});
  let savedSession=null;
  $('guestBtn').addEventListener('click',()=>{
    if(!session.guest){saveProgress();savedSession={slots:structuredClone(session.slots),mode:session.mode,preset:session.preset,settings:{...settings},audio:sound.inspect()};session.guest=true;session.slots={};session.mode='normal';session.preset='standard';restoreProgress(null);}
    else {session.guest=false;session.slots=savedSession.slots;session.mode=savedSession.mode;session.preset=savedSession.preset;Object.assign(settings,savedSession.settings);sound.setVolume(savedSession.audio.volume);if(sound.inspect().enabled!==savedSession.audio.enabled)sound.toggle();restoreProgress(session.slots[slotKey()]);savedSession=null;}
    renderUI();
  });
  $('animationPolicy').addEventListener('change',event=>{settings.animationPolicy=event.target.value;saveProgress();});
  $('backupBtn').addEventListener('click',()=>{session.slots[slotKey()]=captureProgress();downloadBlob(new Blob([JSON.stringify(saveEnvelope(),null,2)],{type:'application/json'}),'lootmoji-backup.json');});
  $('restoreFile').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try {if(file.size>2000000)throw Error('2MB以下のバックアップを指定してください');const data=validateSave(JSON.parse(await file.text()));
      askDecision('バックアップを復元しますか？',`${Object.keys(data.slots).length}枠を復元します。現在の${session.guest?'ゲスト':'保存'}データを置き換えます。必要なら先にバックアップしてください。`,()=>{
        session.slots=data.slots;[session.mode,session.preset]=data.active.split(':');Object.assign(settings,data.settings);sound.setVolume(data.audio.volume);if(sound.inspect().enabled!==data.audio.enabled)sound.toggle();session.storageReady=true;restoreProgress(session.slots[slotKey()]);saveProgress();renderUI();
      });
    } catch(error){session.saveStatus='復元できません：'+error.message;$('saveStatus').textContent=session.saveStatus;}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveProgress();});
  window.addEventListener('pagehide',saveProgress);
  // A01–A05: preparation, combat explanations and deliberate actions.
  const damageTips={
    drain:['防壁吸収','🪫を優先撃破。防壁最大値の25%を削られるため、完全ガード・軽減も組み合わせよう。'],
    direct:['直撃','シールドを貫通。🥷を固定照準し、予告中に撃破。軽減・完全ガードは有効。'],
    poison:['毒','毒使いを先に撃破。回復量も低下します。軽減と防壁を組み合わせよう。'],
    bomb:['自爆','💣は接近中に固定照準。爆発前の撃破で解除できます。'],
    pierce:['貫通弾','防壁だけに頼らず、ARMOR・PARRYを強化。'],
    boss:['ボス攻撃','防壁再展開は1回。単体火力と防御を両立しよう。'],
    shot:['遠距離弾','射手を優先対象に。RANGERの2体射撃も有効。'],
    contact:['接触','右端に届く前に撃破。群れにはNOVAや範囲カード。'],
  };
  function recordDamage(kind,hp,shield,blocked) {
    state.damageHistory.push({kind,hp,shield,blocked,time:state.gameTime});
    if(state.damageHistory.length>12)state.damageHistory.shift();
  }
  function damageSummary() {
    const recent=state.damageHistory.filter(d=>state.gameTime-d.time<=15);
    if(!recent.length)return '被ダメージ履歴はまだありません。';
    const latest=recent[recent.length-1],totals={};for(const d of recent)totals[d.kind]=(totals[d.kind]||0)+d.hp;
    const main=Object.keys(totals).sort((a,b)=>totals[b]-totals[a])[0];
    return `直近：${damageTips[latest.kind][0]} · HP −${fmtDecimal(latest.hp)} / 防壁 −${fmtDecimal(latest.shield)}${latest.blocked?' / 完全ガード':''}。主なHP損失：${damageTips[main][0]}。${damageTips[main][1]}`;
  }
  const isUrgent=e=>e.alive&&(bossWindingUp(e)||e.bomber&&e.x>=55||e.berserk&&e.enraged&&e.x>=55||(e.direct||e.support&&e.support!=='anchor'||e.sniper)&&e.x>=e.stopX&&e.shotTimer>=e.cooldown-(e.direct||e.sniper?1.5:1));
  const threatScore=e=>(isUrgent(e)?100:0)+(e.linkRole?33:e.direct?30:e.bomber?25:e.sniper?29:e.support==='shield'?27:e.support==='haste'?26:e.support==='heal'?24:e.support==='summon'?23:e.shieldDrain?22:e.debuff?20:e.pierce?18:e.ranged?12:0)+e.x/100;
  const threatLabel=e=>e.boss?'👑 '+bossProfiles.find(b=>b.id===e.bossProfile).skill:e.direct?'🥷 直撃予告':e.bomber?'💣 自爆接近':e.support==='heal'?'🪷 回復予告':e.support==='summon'||e.support==='brood'?'🐝 召喚予告':e.support==='shield'?'🗿 防壁予告':e.support==='haste'?'🥁 加速予告':e.sniper?'🎯 狙撃予告':'🐗 激昂突進';
  function prepareBattle(message='準備中は敵も制限時間も止まっています。') {
    state.ready=false;$('readyMessage').textContent=message;renderPauseState();renderUI();
  }
  function focusSection(id){const node=$(id);node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView({block:'start',behavior:'instant'});hideHelp();}
  function startBattle(){if(state.respawnRemaining>0)return;state.ready=true;state.manualPause=false;state.lastDefeat='';renderPauseState();renderUI();saveProgress();focusSection('battlePanel');}
  let decisionAction=null,decisionFocus=null;
  function askDecision(title,body,action) {
    if(state.modalOpen||state.decisionOpen)return;
    hideHelp();state.decisionOpen=true;decisionAction=action;decisionFocus=document.activeElement;
    $('decisionTitle').textContent=title;$('decisionBody').textContent=body;$('decisionDialog').showModal();$('cancelDecision').focus();renderPauseState();
  }
  function characterPreview(id) {
    const c=characterPool.find(c=>c.id===id),original=state.character,before=snapshotStats();
    state.character=id;const after=snapshotStats();state.character=original;
    return `${c.name}：攻撃 ${fmtDecimal(before.damage)} → ${fmtDecimal(after.damage)}、毎秒攻撃 ${before.aps.toFixed(2)} → ${after.aps.toFixed(2)}、軽減 ${Math.round(before.armor*100)}% → ${Math.round(after.armor*100)}%、防壁上限 ${fmt(before.shieldMax)} → ${fmt(after.shieldMax)}。現在の防壁 ${fmt(state.shield)} → ${fmt(Math.min(state.shield,after.shieldMax))}（減った分は戻りません）。${c.merit}。弱点：${c.drawback}。${state.unlockedCharacters.has(id)?'交代は無料。':`解放費用 ${exact(c.cost)} GOLD。`}`;
  }
  function renderExperience() {
    renderArchive();
    setText($('combatVitals'),`♥ HP ${fmt(state.hp)} / ${fmt(state.maxHp)} · 🛡 防壁 ${fmt(state.shield)} / ${fmt(shieldCapacity())}`);
    setText($('modeBadge'),`${session.guest?'ゲスト · ':''}${session.mode==='demo'?'DEMO体験':'通常プレイ'} / ${presets[session.preset].name}`);
    $('playMode').value=session.mode;$('playPreset').value=session.preset;
    setText($('presetRules'),presets[session.preset].description+' 記録・カード・資源はこの枠専用。');
    setText($('saveStatus'),session.guest?'ゲスト試遊：ブラウザに保存しません。終了時に破棄。保存プレイのデータは保持。':session.saveStatus);
    setText($('guestBtn'),session.guest?'ゲストを終了・保存プレイに戻る':'保存しないゲスト試遊');
    setText(el.demoPackBtn,session.mode==='demo'?'＋1M PACKS（DEMO補給）':'DEMO枠へ移動＋1M補給');
    $('readyPanel').classList.toggle('hidden',state.ready);
    $('battleStartBtn').classList.toggle('hidden',state.ready);$('battleStartBtn').disabled=state.respawnRemaining>0;$('startBattleBtn').disabled=state.respawnRemaining>0;
    $('respawnStatus').classList.toggle('hidden',state.respawnRemaining<=0);
    setText($('respawnSeconds'),Math.ceil(state.respawnRemaining));
    $('readyOpenBtn').disabled=state.packs<=0;$('readyOpenBtn').textContent=state.totalOpened?'📦 追加のパックをMAX開封':'📦 最初のパックをMAX開封';
    setText($('waveGoal'),state.wave===5?'突破条件：ボスを討伐':`突破まであと ${Math.max(0,targetWaveKills()-state.waveKills)}体（${state.waveKills} / ${targetWaveKills()}）`);
    const locked=state.enemies.find(e=>e.id===state.targetId),urgent=state.enemies.filter(isUrgent);
    setText($('targetStatus'),locked?`⌖ 固定：${locked.emoji} ${locked.name}`:'照準：自動');
    setText($('threatAlert'),urgent.length?`⚠ ${urgent.map(threatLabel).join(' / ')} · 対象を選んで撃破！${settings.autoSlow?'（戦闘速度 ×0.5）':''}`:'予告監視中 · 回復役・召喚役も固定照準で先に撃破');
    const links=activeEnemyLinks(),uniqueLinks=[...new Map(links.map(l=>[l.role,l])).values()],boss=state.enemies.find(e=>e.boss);
    $('enemyLinksText').classList.toggle('hidden',!links.length);setText($('enemyLinksText'),'敵連携：'+uniqueLinks.map(l=>l.info.emoji+' '+l.info.name).join(' / '));
    for(const enemy of state.enemies)enemy.el.classList.toggle('link-active',links.some(l=>l.source===enemy));
    setText($('battleHint'),'💡 '+(boss&&bossWindingUp(boss)?'特殊行動の予告中！ボスの防壁を割ると中断＋3秒弱体。':uniqueLinks.length?uniqueLinks[0].info.hint:boss?bossProfiles.find(p=>p.id===boss.bossProfile).hint:isJammed()?'防壁回復が停止中。ジャマーを先に倒し、HPと軽減で耐えよう。':'厄介な支援役を固定照準。敵とボスの対策は「図鑑」から。'));
    const choices=$('targetChoices');
    for(const button of [...choices.children])if(!state.enemies.some(e=>String(e.id)===button.dataset.targetId))button.remove();
    for(const enemy of state.enemies) {
      let button=choices.querySelector(`[data-target-id="${enemy.id}"]`);
      if(!button){button=document.createElement('button');button.className='ghost-btn';button.dataset.targetId=enemy.id;choices.append(button);}
      setText(button,`${enemy.emoji} ${enemy.id}${isUrgent(enemy)?' ⚠ 危険':''}`);button.setAttribute('aria-label',`${enemy.name} ${enemy.id}に照準を固定`);button.setAttribute('aria-pressed',String(enemy.id===state.targetId));enemy.el.classList.toggle('target-locked',enemy.id===state.targetId);
    }
    setText($('damageReport'),state.lastDefeat?state.lastDefeat+'\n現在：'+damageSummary():damageSummary());

  }
  $('readyOpenBtn').addEventListener('click',()=>openPacks('max'));
  $('startBattleBtn').addEventListener('click',startBattle);
  $('battleStartBtn').addEventListener('click',startBattle);
  $('targetChoices').addEventListener('click',event=>{const button=event.target.closest('[data-target-id]');if(button){state.targetId=Number(button.dataset.targetId);renderUI();}});
  $('clearTargetBtn').addEventListener('click',()=>{state.targetId=null;renderUI();});
  $('targetPolicy').addEventListener('change',event=>{settings.targetPolicy=event.target.value;});
  $('autoSlow').addEventListener('change',event=>{settings.autoSlow=event.target.checked;});
  $('fontScale').addEventListener('change',event=>{settings.fontScale=event.target.value;document.body.classList.toggle('large-type',settings.fontScale==='large');});
  $('cancelDecision').addEventListener('click',()=>{$('decisionDialog').close();});
  $('confirmDecision').addEventListener('click',()=>{const action=decisionAction;decisionAction=null;$('decisionDialog').close();state.decisionOpen=false;action?.();renderPauseState();});
  $('decisionDialog').addEventListener('close',()=>{state.decisionOpen=false;decisionAction=null;renderPauseState();if(decisionFocus?.isConnected)decisionFocus.focus({preventScroll:true});});
  el.amountButtons.addEventListener('click',event=>{
    const button=event.target.closest('button[data-amount]');if(!button)return;
    state.selectedOpen=button.dataset.amount==='max'?'max':Number(button.dataset.amount);
    settings.amount=state.selectedOpen;saveProgress();
    for(const b of el.amountButtons.children){b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));}renderUI();
  });
  el.openBtn.addEventListener('click',()=>openPacks());
  el.openMaxBtn.addEventListener('click',()=>openPacks('max'));
  el.buyPackBtn.addEventListener('click',()=>{if(state.gold<100)return;state.gold-=100;state.packs=addResource(state.packs,10);sound.play('loot');renderUI();});
  el.demoPackBtn.addEventListener('click',giveDemoPacks);
  el.packResult.addEventListener('click',event=>{if(event.target.closest('[data-action="details"]'))showPackDetails();});
  el.skipBtn.addEventListener('click',finishPackAnimation);el.closeModalBtn.addEventListener('click',closeModal);
  el.dismissModalBtn.addEventListener('click',closeModal);
  el.packModal.addEventListener('click',event=>{if(event.target===el.packModal)closeModal();});
  el.speedBtn.addEventListener('click',()=>{state.speed=state.speed===1?2:state.speed===2?4:1;settings.speed=state.speed;setText(el.speedBtn,'⏩ ×'+state.speed);saveProgress();});
  el.pauseBtn.addEventListener('click',()=>{state.manualPause=!state.manualPause;renderPauseState();});
  el.resetBtn.addEventListener('click',()=>askDecision('この枠のプレイデータを初期化しますか？','選択中の体験／遊び方のカード・コイン・解放・到達記録を消去します。他の保存枠は保持します。',()=>{resetGame(false);prepareBattle();saveProgress();}));
  el.characterList.addEventListener('click',event=>{const button=event.target.closest('[data-select-character]');if(button)askDecision('キャラクターの変更',characterPreview(button.dataset.selectCharacter),()=>selectCharacter(button.dataset.selectCharacter));});
  function requestUpgrade(amount) {
    const quote=upgradeQuote(amount);if(!quote.count)return;
    const before=enemyModifiers(),after=enemyModifiers(quote.to);
    askDecision('🔥 Lv.'+state.enemyLevel+' → '+quote.to,exact(quote.cost)+' GOLD / '+quote.count+'段階を解放。敵HP ×'+fmtDecimal(after.hp/before.hp)+'、攻撃 ×'+fmtDecimal(after.attack/before.attack)+'、GOLD ×'+fmtDecimal(after.gold/before.gold)+'、PACK ×'+fmtDecimal(after.packs/before.packs)+'。今いる敵にも反映。解放済みLvへの変更は無料・次WAVEから。',()=>upgradeEnemies(quote.count));
  }
  el.upgradeEnemyBtn.addEventListener('click',()=>requestUpgrade(1));
  $('upgradeTenBtn').addEventListener('click',()=>requestUpgrade(10));
  $('upgradeMaxBtn').addEventListener('click',()=>requestUpgrade('max'));
  document.addEventListener('keydown',event=>{
    if(event.code==='Escape')hideHelp();
    if(!state.modalOpen&&!state.decisionOpen&&!state.helpOpen&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.closest('input,select,textarea,[contenteditable="true"]')) {
      if(event.code==='KeyP'){event.preventDefault();if(state.ready)el.pauseBtn.click();}
      if(event.code==='KeyM'){event.preventDefault();openPacks('max');}
      if(event.code==='KeyX'){event.preventDefault();state.targetId=null;renderUI();}
    }
    if(!state.modalOpen)return;
    if(event.code==='Escape'||(event.code==='Space'&&!['INPUT','BUTTON','SUMMARY'].includes(document.activeElement?.tagName))) {
      event.preventDefault();closeModal();
    }
    if(event.code==='Tab') {
      const focusable=[...el.packModal.querySelectorAll('button,summary,input,select')].filter(n=>n.getClientRects().length&&!n.disabled);
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  el.soundBtn.addEventListener('click',()=>sound.toggle());
  el.modalSoundBtn.addEventListener('click',()=>sound.toggle());
  el.volumeSlider.addEventListener('input',()=>sound.setVolume(Number(el.volumeSlider.value)/100));
  el.fxBtn.addEventListener('click',()=>{settings.fxIntensity=settings.fxIntensity==='max'?'low':'max';renderAVControls();sound.play('ui');});
  document.addEventListener('pointerdown',()=>sound.unlock(),{capture:true});
  document.addEventListener('keydown',()=>sound.unlock(),{capture:true});
  document.addEventListener('visibilitychange',()=>{lastFrame=null;sound.onVisibility();});
  initializeHelp();
  for(const key of ['rareOnly','newOnly'])el[key].addEventListener('change',()=>{settings[key]=el[key].checked;});
  document.addEventListener('change',event=>{if(event.target.matches('input,select')&&!event.target.matches('#restoreFile'))saveProgress();});
  document.addEventListener('click',event=>{if(event.target.closest('#soundBtn,#modalSoundBtn,#fxBtn,#buyPackBtn'))saveProgress();});
  resetGame(false);
  initializeStorage();
  // Opt-in harness injected by the local regression runner; no global debug API in normal play.
  if(window.__LOOTMOJI_TEST__)Object.assign(window.__LOOTMOJI_TEST__,{
    state,cardPool,rarityRates,synergyPool,effects,fxLimits,fmt,calculatePackResults,applyPackResults,
    snapshotStats,checkSynergies,payKingsTax,spawnEnemy,spawnGroup,maxEnemies,startWave,damageEnemy,
    triggerExplosion,triggerChainLightning,createBlackHole,updateAbilities,updateEnemies,attackEnemy,
    resetGame,step,renderUI,openPacks,closeModal,finishPackAnimation,removeEnemy,killEnemy,hurtPlayer,
    characterPool,selectCharacter,upgradeEnemies,enemyModifiers,enemyUpgradeCost,shieldCapacity,attack,
    upgradeQuote,rescaleEnemies,MAX_ENEMY_LEVEL,isJammed,fireEnemyProjectile,helpText,enemyDamage,applyDebuff,updateDebuffs,clearDebuffs,checkWaveDeadline,directStrike,detonateEnemy,castEnemySupport,enemyCatalog,
    activeEnemyLinks,enemyLinkEffects,enemyLinkCatalog,bossProfiles,bossWindingUp,executeBossSkill,libraryEntries,openLibrary,renderLibrary,
    showPackAnimation,updatePackAnimation,
    session,saveProgress,captureProgress,validateSave,validProgress,saveEnvelope,restoreProgress,switchSlot,giveDemoPacks,prepareBattle,startBattle,compareCharacters,characterPreview,renderResultInventory,renderArchive,exportImage,isUrgent,targetWaveKills,damageSummary,
    fireBossVolley,sound,settings,juiceParticles,juiceLimit,juiceStats,emitBurst,shockwave,updateJuice,
  });
  requestAnimationFrame(tick);
})();
