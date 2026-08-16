/* =========================================================
   Word Islands — app.js  (v2)
   Vanilla JS, no build step, fully offline after first load.
   ========================================================= */
(function(){
  "use strict";

  var WORDS = window.FRY_WORDS || [];
  var PAGES = [1,2,3,4,5,6,7,8,9,10];
  var ISLAND_COLORS = {1:'--island-1',2:'--island-2',3:'--island-3',4:'--island-4',5:'--island-5',
                        6:'--island-6',7:'--island-7',8:'--island-8',9:'--island-9',10:'--island-10'};
  var MASTERY_THRESHOLD = 3; // net correct answers (tier) needed to count a word as mastered

  var byPage = {};
  var byId = {};
  WORDS.forEach(function(w){
    if(!byPage[w.page]) byPage[w.page] = [];
    byPage[w.page].push(w);
    byId[w.id] = w;
  });
  PAGES.forEach(function(p){ byPage[p].sort(function(a,b){return a.position_in_page-b.position_in_page;}); });

  var listNameFor = {};
  WORDS.forEach(function(w){ listNameFor[w.page] = w.list_name; });

  /* ---------------- storage ---------------- */
  var PROGRESS_KEY = 'fw_progress_v1';
  var META_KEY = 'fw_meta_v1';
  var SPEED_KEY = 'fw_speedread_v1';

  function loadProgress(){
    try{ return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }catch(e){ return {}; }
  }
  function saveProgress(p){ localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); }
  function loadMeta(){
    try{ return JSON.parse(localStorage.getItem(META_KEY)) || {stars:0}; }catch(e){ return {stars:0}; }
  }
  function saveMeta(m){ localStorage.setItem(META_KEY, JSON.stringify(m)); }
  function loadSpeed(){
    try{ return JSON.parse(localStorage.getItem(SPEED_KEY)) || {}; }catch(e){ return {}; }
  }
  function saveSpeed(s){ localStorage.setItem(SPEED_KEY, JSON.stringify(s)); }

  function getEntry(progress, id){
    return progress[id] || {tier:0, correct:0, incorrect:0, seen:0, lastSeen:0};
  }
  function isMastered(entry){ return entry.tier >= MASTERY_THRESHOLD; }
  function isStruggling(entry){
    var attempts = entry.correct + entry.incorrect;
    return attempts >= 2 && (entry.incorrect > entry.correct || entry.tier === 0);
  }

  function recordAnswer(id, correct){
    var progress = loadProgress();
    var e = getEntry(progress, id);
    e.seen += 1;
    e.lastSeen = Date.now();
    if(correct){
      e.correct += 1;
      e.tier = Math.min(MASTERY_THRESHOLD, e.tier + 1);
      addStars(1);
    } else {
      e.incorrect += 1;
      e.tier = Math.max(0, e.tier - 1);
    }
    progress[id] = e;
    saveProgress(progress);
    return e;
  }
  function markSeen(id){
    var progress = loadProgress();
    var e = getEntry(progress, id);
    e.seen += 1; e.lastSeen = Date.now();
    progress[id] = e;
    saveProgress(progress);
  }
  function addStars(n){
    var m = loadMeta(); m.stars = Math.max(0, (m.stars||0) + n); saveMeta(m); return m.stars;
  }

  function pageStats(p){
    var progress = loadProgress();
    var words = byPage[p];
    var mastered=0, struggling=0, seen=0;
    var strugglingWords = [];
    words.forEach(function(w){
      var e = getEntry(progress, w.id);
      if(isMastered(e)) mastered++;
      if(e.seen>0) seen++;
      if(isStruggling(e)){ struggling++; strugglingWords.push(w); }
    });
    return {mastered:mastered, struggling:struggling, seen:seen, total:words.length, strugglingWords:strugglingWords};
  }

  /* ---------------- helpers ---------------- */
  function $(sel){ return document.querySelector(sel); }
  function shuffle(arr){
    var a = arr.slice();
    for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; }
    return a;
  }
  function sample(arr, n){ return shuffle(arr).slice(0, Math.min(n, arr.length)); }
  function esc(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function jsQuote(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
  function speak(text){
    if(!('speechSynthesis' in window)) return;
    try{
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85; u.pitch = 1.05;
      window.speechSynthesis.speak(u);
    }catch(e){}
  }
  function sentenceWithBlank(word, sentence){
    var re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace("'", "['\u2019]") + '\\b', 'i');
    if(re.test(sentence)) return sentence.replace(re, '<span class="blank">&nbsp;</span>');
    return sentence + ' <span class="blank">&nbsp;</span>';
  }
  function fmtTime(seconds){
    var s = Math.max(0, seconds);
    var m = Math.floor(s/60);
    var rem = (s - m*60);
    return (m>0 ? m+':'+(rem<10?'0':'')+rem.toFixed(1) : rem.toFixed(1)+'s');
  }

  /* ---------------- router ---------------- */
  var state = { parentUnlocked:false, session:null, test:null };

  function navigate(hash){
    if(window.location.hash === hash){ render(); } else { window.location.hash = hash; }
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('load', render);

  var CATEGORIES = {
    learn:    {icon:'\ud83d\udcd6', label:'Learn',         sub:'Flip cards',              needsPage:true},
    spell:    {icon:'\u270f\ufe0f', label:'Spell It',       sub:'Build the word',          needsPage:true},
    meaning:  {icon:'\ud83e\udd14', label:'What Means?',    sub:'Pick the meaning',        needsPage:true},
    sentence: {icon:'\ud83d\udcdd', label:'Fill In',        sub:'Complete the sentence',   needsPage:true},
    sameopp:  {icon:'\u2696\ufe0f', label:'Same/Opposite',  sub:'Compare words',           needsPage:true},
    speedread:{icon:'\u23f1\ufe0f', label:'Speed Read',     sub:'Time yourself reading',   needsPage:true},
    spellmix: {icon:'\ud83c\udfb2', label:'Mix It Up',      sub:'Spelling, any list',      needsPage:false}
  };

  function render(){
    var hash = window.location.hash || '#/';
    var parts = hash.replace('#/','').split('/').filter(Boolean);
    window.scrollTo(0,0);
    if(parts.length===0) return renderHome();
    if(parts[0]==='pages') return renderPageSelect(parts[1]);
    if(parts[0]==='play') return startSession(parseInt(parts[1],10), parts[2]);
    if(parts[0]==='speed' && parts[1]) return renderSpeedRead(parseInt(parts[1],10));
    if(parts[0]==='spellmix') return renderSpellMixConfig();
    if(parts[0]==='parent' && !parts[1]) return renderParentGate();
    if(parts[0]==='parent' && parts[1]==='dash') return state.parentUnlocked ? renderDashboard() : renderParentGate();
    if(parts[0]==='parent' && parts[1]==='test') return state.parentUnlocked ? renderTestConfig() : renderParentGate();
    return renderHome();
  }

  /* ---------------- HOME (categories) ---------------- */
  function renderHome(){
    var meta = loadMeta();
    var totalMastered = 0;
    PAGES.forEach(function(p){ totalMastered += pageStats(p).mastered; });

    var cardsHtml = Object.keys(CATEGORIES).map(function(key){
      var c = CATEGORIES[key];
      var href = key==='spellmix' ? '#/spellmix' : '#/pages/'+key;
      return '<button class="mode-card" onclick="App.navigate(\''+href+'\')">' +
        '<div class="mode-card__icon">'+c.icon+'</div>' +
        '<div class="mode-card__label">'+c.label+'</div>' +
        '<div class="mode-card__sub">'+c.sub+'</div>' +
      '</button>';
    }).join('');

    $('#app').innerHTML =
      '<div class="topbar">' +
        '<div class="topbar__title">\ud83c\udf34 Word Islands</div>' +
        '<div class="topbar__stars">\u2b50 '+ (meta.stars||0) +'</div>' +
      '</div>' +
      '<div class="hero">' +
        '<h1>Hi Aadya! Ready to explore?</h1>' +
        '<p>You have mastered '+totalMastered+' of 1000 words. Pick a game to start!</p>' +
      '</div>' +
      '<div class="screen"><div class="mode-grid">'+cardsHtml+'</div></div>' +
      '<button class="parent-link" onclick="App.navigate(\'#/parent\')">Parent area</button>';
  }

  /* ---------------- PAGE SELECT (islands) ---------------- */
  function renderPageSelect(mode){
    var cat = CATEGORIES[mode];
    if(!cat){ return renderHome(); }
    var speed = loadSpeed();

    var islandsHtml = PAGES.map(function(p){
      var subtitle;
      if(mode==='speedread'){
        var best = speed[p];
        subtitle = '<div class="island__progress">'+(best!==undefined ? '\u23f1 '+fmtTime(best) : 'No time yet')+'</div>';
      } else {
        var stats = pageStats(p);
        subtitle = '<div class="island__progress">'+stats.mastered+'/'+stats.total+' \u2b50</div>';
      }
      var dest = mode==='speedread' ? '#/speed/'+p : '#/play/'+p+'/'+mode;
      return '' +
      '<button class="island" onclick="App.navigate(\''+dest+'\')">' +
        '<div class="island__blob" style="background:var('+ISLAND_COLORS[p]+')">'+p+'</div>' +
        '<div class="island__label">'+esc(listNameFor[p])+'</div>' +
        subtitle +
      '</button>';
    }).join('');

    $('#app').innerHTML =
      '<div class="screen">' +
        '<button class="back-btn" onclick="App.navigate(\'#/\')">\u2190 Games</button>' +
        '<div class="hero" style="padding-left:0;padding-right:0;">' +
          '<h1 style="font-size:22px;">'+cat.icon+' '+cat.label+'</h1>' +
          '<p>Choose a list to practice</p>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:22px 10px;">'+islandsHtml+'</div>' +
      '</div>';
  }

  /* ---------------- SESSION ENGINE (practice — covers ALL words in the list) ---------------- */
  function startSession(p, mode){
    if(!byPage[p] || !CATEGORIES[mode] || mode==='speedread' || mode==='spellmix') return renderHome();
    var words = byPage[p];
    var pool = words;
    if(mode==='sameopp'){
      pool = words.filter(function(w){ return (w.synonyms&&w.synonyms.length)||(w.antonyms&&w.antonyms.length); });
    }
    var picks = shuffle(pool);
    state.session = { page:p, mode:mode, words:picks, index:0, correct:0, incorrect:0, starsEarned:0 };
    renderQuestion();
  }

  function sessionProgressBar(){
    var s = state.session;
    var pct = Math.round(100*s.index/s.words.length);
    return '<div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div>' +
      '<div class="dash-sub" style="text-align:center;margin-bottom:14px;">Word '+(s.index+1)+' of '+s.words.length+
      (s.mode!=='learn' ? ' \u00b7 '+s.correct+' correct' : '') + '</div>';
  }

  function renderQuestion(){
    var s = state.session;
    if(s.index >= s.words.length) return renderSessionSummary();
    var w = s.words[s.index];
    if(s.mode==='learn') return renderLearnCard(w);
    if(s.mode==='spell') return renderSpellQuestion(w);
    if(s.mode==='meaning') return renderMeaningQuestion(w);
    if(s.mode==='sentence') return renderSentenceQuestion(w);
    if(s.mode==='sameopp') return renderSameOppQuestion(w);
  }

  function wrapGame(inner){
    $('#app').innerHTML =
      '<div class="game-wrap">' +
        '<button class="back-btn" onclick="App.exitSession()">\u2190 Exit practice</button>' +
        sessionProgressBar() +
        inner +
      '</div>' +
      '<div id="feedback" class="feedback-banner"></div>';
  }

  function showFeedback(correct, message){
    var el = $('#feedback');
    el.className = 'feedback-banner show ' + (correct?'correct':'incorrect');
    el.innerHTML = '<span>'+message+'</span><button class="btn-next" onclick="App.nextQuestion()">Next <span aria-hidden="true">\u2192</span></button>';
  }

  window.App = window.App || {};
  App.nextQuestion = function(){
    state.session.index += 1;
    renderQuestion();
  };
  App.navigate = navigate;
  App.exitSession = function(){ state.session=null; navigate('#/'); };

  /* --- Learn mode (flashcard flip) --- */
  function renderLearnCard(w){
    var tagsHtml = '';
    if(w.synonyms && w.synonyms.length) tagsHtml += w.synonyms.map(function(s){return '<span class="tag">like: '+esc(s)+'</span>';}).join('');
    if(w.antonyms && w.antonyms.length) tagsHtml += w.antonyms.map(function(s){return '<span class="tag">opposite: '+esc(s)+'</span>';}).join('');

    var inner =
      '<div class="flip-card" id="flipcard" onclick="App.flipCard()">' +
        '<div class="flip-card__inner">' +
          '<div class="flip-face flip-face--front">' +
            '<button class="speak-btn" onclick="event.stopPropagation(); App.speakWord(\''+jsQuote(w.word)+'\')">\ud83d\udd0a</button>' +
            '<div class="flip-word">'+esc(w.word)+'</div>' +
            '<div class="flip-hint">Tap to see the meaning</div>' +
          '</div>' +
          '<div class="flip-face flip-face--back">' +
            '<div class="flip-def">'+esc(w.definition)+'</div>' +
            '<div class="flip-sentence">\u201c'+esc(w.example_sentence)+'\u201d</div>' +
            '<div class="tag-row">'+tagsHtml+'</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn btn--leaf btn--block btn--lg" onclick="App.learnNext(\''+w.id+'\')">Got it! Next word \u2192</button>';
    wrapGame(inner);
  }
  App.flipCard = function(){
    var c = $('#flipcard');
    if(c) c.classList.toggle('flipped');
  };
  App.speakWord = function(word){ speak(word); };
  App.learnNext = function(id){
    markSeen(id);
    state.session.index += 1;
    renderQuestion();
  };

  /* --- Spell mode (also used by Mix It Up) --- */
  var spellState = null;
  function renderSpellQuestion(w){
    var letters = w.word.split('');
    var tiles = shuffle(letters.map(function(ch, i){ return {ch:ch, key:i, used:false}; }));
    spellState = { word:w, letters:letters, tiles:tiles, filled:[] };
    var blank = sentenceWithBlank(w.word, w.example_sentence);
    var inner =
      '<div class="question-prompt">' +
        '<div class="dash-sub">Spell this word:</div>' +
        '<div style="font-size:18px;margin:8px 0;">'+esc(w.definition)+'</div>' +
        '<div class="sentence-blank">'+blank+'</div>' +
        '<button class="btn btn--teal btn--sm" style="margin-top:10px" onclick="App.speakWord(\''+jsQuote(w.word)+'\')">\ud83d\udd0a Hear it</button>' +
      '</div>' +
      '<div id="answerSlots" class="tile-row"></div>' +
      '<div id="tileBank" class="tile-bank"></div>' +
      '<div style="display:flex;gap:10px;justify-content:center;margin-top:18px;">' +
        '<button class="btn btn--ghost" onclick="App.spellBackspace()">\u232b Delete</button>' +
        '<button class="btn btn--leaf" id="spellSubmit" onclick="App.spellSubmit()" disabled>Check</button>' +
      '</div>';
    wrapGame(inner);
    renderSpellTiles();
  }
  function renderSpellTiles(){
    var slots = spellState.letters.map(function(ch, i){
      var filled = spellState.filled[i];
      return '<div class="answer-slot">'+(filled!==undefined?esc(spellState.tiles[filled].ch):'')+'</div>';
    }).join('');
    $('#answerSlots').innerHTML = slots;
    $('#tileBank').innerHTML = spellState.tiles.map(function(t, i){
      return '<button class="tile" '+(t.used?'disabled':'')+' onclick="App.spellPick('+i+')">'+esc(t.ch)+'</button>';
    }).join('');
    $('#spellSubmit').disabled = spellState.filled.length !== spellState.letters.length;
  }
  App.spellPick = function(i){
    if(spellState.filled.length >= spellState.letters.length) return;
    if(spellState.tiles[i].used) return;
    spellState.tiles[i].used = true;
    spellState.filled.push(i);
    renderSpellTiles();
  };
  App.spellBackspace = function(){
    var last = spellState.filled.pop();
    if(last!==undefined) spellState.tiles[last].used = false;
    renderSpellTiles();
  };
  App.spellSubmit = function(){
    var attempt = spellState.filled.map(function(i){ return spellState.tiles[i].ch; }).join('');
    var correct = attempt.toLowerCase() === spellState.word.word.toLowerCase();
    recordAnswer(spellState.word.id, correct);
    if(correct){ state.session.correct++; state.session.starsEarned++; }
    else state.session.incorrect++;
    showFeedback(correct, correct ? 'Great spelling! \u2b50' : 'Correct spelling: '+esc(spellState.word.word));
  };

  /* --- Meaning match mode --- */
  function renderMeaningQuestion(w){
    var others = byPage[w.page].filter(function(x){ return x.id!==w.id; });
    var distractors = sample(others, 2).map(function(x){ return x.definition; });
    var choices = shuffle([w.definition].concat(distractors));
    var inner =
      '<div class="question-prompt">' +
        '<div class="dash-sub">What does this word mean?</div>' +
        '<div class="big-word">'+esc(w.word)+'</div>' +
        '<button class="btn btn--teal btn--sm" style="margin-top:10px" onclick="App.speakWord(\''+jsQuote(w.word)+'\')">\ud83d\udd0a Hear it</button>' +
      '</div>' +
      '<div class="choice-grid" id="choices">' +
        choices.map(function(c){ return '<button class="choice-btn" onclick="App.meaningPick(this, '+ (c===w.definition) +')">'+esc(c)+'</button>'; }).join('') +
      '</div>';
    wrapGame(inner);
    window._currentMeaningWord = w;
  }
  App.meaningPick = function(btn, correct){
    var w = window._currentMeaningWord;
    document.querySelectorAll('#choices .choice-btn').forEach(function(b){ b.onclick=null; });
    btn.classList.add(correct?'correct':'incorrect');
    recordAnswer(w.id, correct);
    if(correct){ state.session.correct++; state.session.starsEarned++; }
    else {
      state.session.incorrect++;
      document.querySelectorAll('#choices .choice-btn').forEach(function(b){
        if(b.textContent === w.definition) b.classList.add('correct');
      });
    }
    showFeedback(correct, correct ? 'Nice work! \u2b50' : 'That\u2019s okay \u2014 keep practicing!');
  };

  /* --- Sentence fill mode --- */
  function renderSentenceQuestion(w){
    var others = byPage[w.page].filter(function(x){ return x.id!==w.id; });
    var distractors = sample(others, 2).map(function(x){ return x.word; });
    var choices = shuffle([w.word].concat(distractors));
    var blank = sentenceWithBlank(w.word, w.example_sentence);
    var inner =
      '<div class="question-prompt">' +
        '<div class="dash-sub">Pick the word that completes the sentence:</div>' +
        '<div class="sentence-blank">'+blank+'</div>' +
      '</div>' +
      '<div class="choice-grid" id="choices">' +
        choices.map(function(c){ return '<button class="choice-btn" onclick="App.sentencePick(this, '+ (c===w.word) +')">'+esc(c)+'</button>'; }).join('') +
      '</div>';
    wrapGame(inner);
    window._currentSentenceWord = w;
  }
  App.sentencePick = function(btn, correct){
    var w = window._currentSentenceWord;
    document.querySelectorAll('#choices .choice-btn').forEach(function(b){ b.onclick=null; });
    btn.classList.add(correct?'correct':'incorrect');
    recordAnswer(w.id, correct);
    if(correct){ state.session.correct++; state.session.starsEarned++; }
    else {
      state.session.incorrect++;
      document.querySelectorAll('#choices .choice-btn').forEach(function(b){
        if(b.textContent === w.word) b.classList.add('correct');
      });
    }
    showFeedback(correct, correct ? 'Perfect! \u2b50' : 'The right word was "'+esc(w.word)+'"');
  };

  /* --- Same/Opposite mode --- */
  function renderSameOppQuestion(w){
    var useSyn = w.synonyms && w.synonyms.length && (Math.random()<0.5 || !(w.antonyms&&w.antonyms.length));
    var pairWord, correctAnswer;
    if(useSyn){ pairWord = w.synonyms[Math.floor(Math.random()*w.synonyms.length)]; correctAnswer='same'; }
    else { pairWord = w.antonyms[Math.floor(Math.random()*w.antonyms.length)]; correctAnswer='opposite'; }
    var inner =
      '<div class="question-prompt">' +
        '<div class="dash-sub">Are these words the same or opposite?</div>' +
        '<div class="big-word" style="font-size:32px;">'+esc(w.word)+' &nbsp;&harr;&nbsp; '+esc(pairWord)+'</div>' +
      '</div>' +
      '<div class="choice-grid" id="choices">' +
        '<button class="choice-btn" onclick="App.sameOppPick(this, \'same\')">\ud83d\ude42 Same meaning</button>' +
        '<button class="choice-btn" onclick="App.sameOppPick(this, \'opposite\')">\ud83d\udd04 Opposite meaning</button>' +
      '</div>';
    wrapGame(inner);
    window._currentSameOpp = { w:w, correctAnswer: correctAnswer };
  }
  App.sameOppPick = function(btn, picked){
    var ctx = window._currentSameOpp;
    var correct = picked === ctx.correctAnswer;
    document.querySelectorAll('#choices .choice-btn').forEach(function(b){ b.onclick=null; });
    btn.classList.add(correct?'correct':'incorrect');
    recordAnswer(ctx.w.id, correct);
    if(correct){ state.session.correct++; state.session.starsEarned++; }
    else state.session.incorrect++;
    showFeedback(correct, correct ? 'You got it! \u2b50' : 'It was '+ctx.correctAnswer+'.');
  };

  /* --- Session summary --- */
  function renderSessionSummary(){
    var s = state.session;
    var totalAnswered = s.correct + s.incorrect;
    var backHref = s.page==='mixed' ? '#/spellmix' : '#/pages/'+s.mode;
    $('#app').innerHTML =
      '<div class="game-wrap">' +
        '<div class="card summary-card">' +
          '<div class="summary-stars">\ud83c\udf89</div>' +
          '<h2>Great job, Aadya!</h2>' +
          (totalAnswered>0 ?
            '<div class="summary-stat"><span>Correct</span><span>'+s.correct+' / '+totalAnswered+'</span></div>' +
            '<div class="summary-stat"><span>Stars earned</span><span>\u2b50 '+s.starsEarned+'</span></div>'
            : '<div class="summary-stat"><span>Words reviewed</span><span>'+s.words.length+'</span></div>') +
          '<div style="display:flex;gap:10px;margin-top:20px;">' +
            '<button class="btn btn--ghost btn--block" onclick="App.navigate(\''+backHref+'\')">More games</button>' +
            '<button class="btn btn--block" onclick="App.navigate(\'#/\')">Home</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- SPEED READ ---------------- */
  var speedState = null;
  function renderSpeedRead(p){
    if(!byPage[p]) return renderHome();
    var best = loadSpeed()[p];
    speedState = { page:p, running:false, startTs:0, timerId:null };
    $('#app').innerHTML =
      '<div class="screen">' +
        '<button class="back-btn" onclick="App.navigate(\'#/pages/speedread\')">\u2190 Speed Read</button>' +
        '<div class="hero" style="padding-left:0;padding-right:0;">' +
          '<h1 style="font-size:22px;">\u23f1\ufe0f '+esc(listNameFor[p])+'</h1>' +
          '<p>Tap Start, read all 100 words out loud, then tap Stop.</p>' +
          (best!==undefined ? '<p style="margin-top:6px;font-weight:700;color:var(--teal-deep)">Best time: '+fmtTime(best)+'</p>' : '') +
        '</div>' +
        '<div id="speedTimer" style="text-align:center;font-family:var(--font-display);font-weight:800;font-size:40px;margin:10px 0 20px;">0.0s</div>' +
        '<div style="text-align:center;margin-bottom:20px;">' +
          '<button class="btn btn--lg" id="speedBtn" onclick="App.speedToggle()">\u25b6\ufe0f Start</button>' +
        '</div>' +
        '<div id="speedGrid" class="card" style="display:none;"></div>' +
      '</div>';
  }
  function speedGridHtml(p){
    var words = byPage[p];
    return '<div style="display:grid;grid-auto-flow:column;grid-template-rows:repeat(25,auto);grid-template-columns:repeat(4,1fr);gap:6px 14px;font-size:15px;font-weight:700;">' +
      words.map(function(w){ return '<div>'+esc(w.word)+'</div>'; }).join('') +
      '</div>';
  }
  App.speedToggle = function(){
    if(!speedState.running){
      speedState.running = true;
      speedState.startTs = Date.now();
      $('#speedGrid').style.display = 'block';
      $('#speedGrid').innerHTML = speedGridHtml(speedState.page);
      $('#speedBtn').textContent = '\u23f9\ufe0f Stop';
      speedState.timerId = setInterval(function(){
        var el = $('#speedTimer');
        if(el) el.textContent = fmtTime((Date.now()-speedState.startTs)/1000);
      }, 100);
    } else {
      speedState.running = false;
      clearInterval(speedState.timerId);
      var elapsedSec = (Date.now()-speedState.startTs)/1000;
      var speeds = loadSpeed();
      var isBest = speeds[speedState.page]===undefined || elapsedSec < speeds[speedState.page];
      if(isBest){ speeds[speedState.page] = elapsedSec; saveSpeed(speeds); }
      renderSpeedResult(speedState.page, elapsedSec, isBest);
    }
  };
  function renderSpeedResult(p, elapsedSec, isBest){
    $('#app').innerHTML =
      '<div class="screen">' +
        '<div class="card summary-card">' +
          '<div class="summary-stars">'+(isBest?'\ud83c\udfc6':'\u23f1\ufe0f')+'</div>' +
          '<h2>'+(isBest?'New best time!':'Time recorded')+'</h2>' +
          '<div class="summary-stat"><span>This try</span><span>'+fmtTime(elapsedSec)+'</span></div>' +
          '<div class="summary-stat"><span>Best time</span><span>'+fmtTime(loadSpeed()[p])+'</span></div>' +
          '<div style="display:flex;gap:10px;margin-top:20px;">' +
            '<button class="btn btn--ghost btn--block" onclick="App.navigate(\'#/speed/'+p+'\')">Try again</button>' +
            '<button class="btn btn--block" onclick="App.navigate(\'#/pages/speedread\')">Choose list</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- MIX IT UP (spelling, any list) ---------------- */
  function renderSpellMixConfig(){
    $('#app').innerHTML =
      '<div class="screen">' +
        '<button class="back-btn" onclick="App.navigate(\'#/\')">\u2190 Games</button>' +
        '<div class="hero" style="padding-left:0;padding-right:0;">' +
          '<h1 style="font-size:22px;">\ud83c\udfb2 Mix It Up</h1>' +
          '<p>Spelling practice with random words from all 10 lists.</p>' +
        '</div>' +
        '<div class="test-config">' +
          '<select class="form-select" id="mixCount">' +
            '<option value="10">10 words</option>' +
            '<option value="20" selected>20 words</option>' +
            '<option value="30">30 words</option>' +
            '<option value="50">50 words</option>' +
            '<option value="100">100 words</option>' +
          '</select>' +
        '</div>' +
        '<button class="btn btn--block btn--lg" onclick="App.beginSpellMix()">Start</button>' +
      '</div>';
  }
  App.beginSpellMix = function(){
    var n = parseInt($('#mixCount').value, 10);
    var picks = sample(WORDS, n);
    state.session = { page:'mixed', mode:'spell', words:picks, index:0, correct:0, incorrect:0, starsEarned:0 };
    renderQuestion();
  };

  /* ---------------- PARENT AREA ---------------- */
  function renderParentGate(){
    var a = 2 + Math.floor(Math.random()*8);
    var b = 2 + Math.floor(Math.random()*8);
    window._gateAnswer = a*b;
    $('#app').innerHTML =
      '<div class="gate-wrap">' +
        '<button class="back-btn" onclick="App.navigate(\'#/\')">\u2190 Back</button>' +
        '<h2>Parent Area</h2>' +
        '<p style="color:var(--ink-soft);margin-top:8px;">Quick check so this stays a parent-only area.</p>' +
        '<div class="gate-math">'+a+' \u00d7 '+b+' = ?</div>' +
        '<input type="number" inputmode="numeric" class="gate-input" id="gateInput">' +
        '<div id="gateError" style="color:var(--coral-deep);min-height:20px;font-size:13px;"></div>' +
        '<button class="btn btn--block" onclick="App.checkGate()">Enter</button>' +
      '</div>';
  }
  App.checkGate = function(){
    var val = parseInt($('#gateInput').value, 10);
    if(val === window._gateAnswer){
      state.parentUnlocked = true;
      navigate('#/parent/dash');
    } else {
      $('#gateError').textContent = 'Not quite — try again.';
    }
  };

  function renderDashboard(){
    var totalMastered=0, totalSeen=0, totalStruggling=0;
    PAGES.forEach(function(p){ var s=pageStats(p); totalMastered+=s.mastered; totalSeen+=s.seen; totalStruggling+=s.struggling; });

    var rowsHtml = PAGES.map(function(p){
      var s = pageStats(p);
      var pct = Math.round(100*s.mastered/s.total);
      var strugglingNames = s.strugglingWords.slice(0,8).map(function(w){return esc(w.word);}).join(', ');
      var best = loadSpeed()[p];
      return '' +
      '<div class="dash-row">' +
        '<div class="dash-row__top">' +
          '<div class="dash-row__name"><span class="dash-row__dot" style="background:var('+ISLAND_COLORS[p]+')"></span>'+esc(listNameFor[p])+'</div>' +
          '<div class="dash-sub">'+s.mastered+'/'+s.total+' mastered</div>' +
        '</div>' +
        '<div class="dash-row__bar"><div class="dash-row__bar-fill" style="width:'+pct+'%;background:var('+ISLAND_COLORS[p]+')"></div></div>' +
        '<div class="dash-row__meta">'+s.seen+' words practiced \u00b7 '+s.struggling+' currently struggling'+(best!==undefined?' \u00b7 best read: '+fmtTime(best):'')+'</div>' +
        (strugglingNames ? '<div class="struggling-list">Struggling: '+strugglingNames+(s.strugglingWords.length>8?'\u2026':'')+'</div>' : '') +
        '<div class="row-actions">' +
          '<button class="btn btn--ghost btn--sm" onclick="App.confirmReset('+p+')">Reset this list</button>' +
        '</div>' +
      '</div>';
    }).join('');

    $('#app').innerHTML =
      '<div class="dash">' +
        '<button class="back-btn" onclick="App.navigate(\'#/\')">\u2190 Kid view</button>' +
        '<h2>Aadya\u2019s Progress</h2>' +
        '<div class="dash-sub">A word counts as "mastered" once she\u2019s answered it correctly '+MASTERY_THRESHOLD+' more times than she\u2019s missed it.</div>' +
        '<div class="stat-grid">' +
          '<div class="stat-card"><div class="stat-card__num">'+totalMastered+'</div><div class="stat-card__label">Mastered</div></div>' +
          '<div class="stat-card"><div class="stat-card__num">'+totalSeen+'</div><div class="stat-card__label">Practiced</div></div>' +
          '<div class="stat-card"><div class="stat-card__num">'+totalStruggling+'</div><div class="stat-card__label">Struggling</div></div>' +
        '</div>' +
        '<button class="btn btn--teal btn--block" style="margin-bottom:20px;" onclick="App.navigate(\'#/parent/test\')">\u270f\ufe0f Create a quick test</button>' +
        rowsHtml +
      '</div>';
  }

  App.confirmReset = function(p){
    $('#app').insertAdjacentHTML('beforeend',
      '<div class="modal-backdrop" id="resetModal">' +
        '<div class="modal">' +
          '<h3>Reset '+esc(listNameFor[p])+'?</h3>' +
          '<p>This clears all mastery progress (and its stars) for these 100 words. This can\u2019t be undone.</p>' +
          '<div class="modal-actions">' +
            '<button class="btn btn--ghost" onclick="App.closeModal()">Cancel</button>' +
            '<button class="btn" style="background:var(--coral-deep)" onclick="App.doReset('+p+')">Reset</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  };
  App.closeModal = function(){ var m=$('#resetModal'); if(m) m.remove(); };
  App.doReset = function(p){
    var progress = loadProgress();
    var starsToRemove = 0;
    byPage[p].forEach(function(w){
      var e = progress[w.id];
      if(e) starsToRemove += (e.correct || 0);
      delete progress[w.id];
    });
    saveProgress(progress);
    if(starsToRemove > 0) addStars(-starsToRemove);
    App.closeModal();
    renderDashboard();
  };

  /* --- Quick test builder --- */
  function renderTestConfig(){
    var options = PAGES.map(function(p){ return '<option value="'+p+'">'+esc(listNameFor[p])+'</option>'; }).join('');
    $('#app').innerHTML =
      '<div class="dash">' +
        '<button class="back-btn" onclick="App.navigate(\'#/parent/dash\')">\u2190 Dashboard</button>' +
        '<h2>Quick Test</h2>' +
        '<div class="dash-sub">Pick a list and how many words to test.</div>' +
        '<div class="test-config">' +
          '<select class="form-select" id="testPage">'+options+'</select>' +
          '<select class="form-select" id="testCount">' +
            '<option value="5">5 words</option>' +
            '<option value="10" selected>10 words</option>' +
            '<option value="15">15 words</option>' +
            '<option value="20">20 words</option>' +
          '</select>' +
        '</div>' +
        '<button class="btn btn--block btn--lg" onclick="App.beginTest()">Start Test</button>' +
      '</div>';
  }

  App.beginTest = function(){
    var p = parseInt($('#testPage').value, 10);
    var n = parseInt($('#testCount').value, 10);
    var picks = sample(byPage[p], n);
    state.test = { page:p, words:picks, index:0, results:[] };
    renderTestQuestion();
  };

  function renderTestQuestion(){
    var t = state.test;
    if(t.index >= t.words.length) return renderTestResults();
    var w = t.words[t.index];
    var isSpelling = t.index % 2 === 0;
    var pct = Math.round(100*t.index/t.words.length);
    var header = '<div class="game-wrap"><button class="back-btn" onclick="App.navigate(\'#/parent/dash\')">\u2190 End test</button>' +
      '<div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div>';

    if(isSpelling){
      var letters = w.word.split('');
      var tiles = shuffle(letters.map(function(ch,i){ return {ch:ch, key:i, used:false}; }));
      spellState = { word:w, letters:letters, tiles:tiles, filled:[], isTest:true };
      $('#app').innerHTML = header +
        '<div class="question-prompt"><div class="dash-sub">Spell this word:</div>' +
        '<div style="font-size:18px;margin:8px 0;">'+esc(w.definition)+'</div></div>' +
        '<div id="answerSlots" class="tile-row"></div>' +
        '<div id="tileBank" class="tile-bank"></div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:18px;">' +
          '<button class="btn btn--ghost" onclick="App.spellBackspace()">\u232b Delete</button>' +
          '<button class="btn btn--leaf" id="spellSubmit" onclick="App.testSpellSubmit()" disabled>Check</button>' +
        '</div></div>';
      renderSpellTiles();
    } else {
      var others = byPage[w.page].filter(function(x){ return x.id!==w.id; });
      var distractors = sample(others, 2).map(function(x){ return x.definition; });
      var choices = shuffle([w.definition].concat(distractors));
      $('#app').innerHTML = header +
        '<div class="question-prompt"><div class="dash-sub">What does this word mean?</div>' +
        '<div class="big-word">'+esc(w.word)+'</div></div>' +
        '<div class="choice-grid" id="choices">' +
          choices.map(function(c){ return '<button class="choice-btn" onclick="App.testMeaningPick(this, '+(c===w.definition)+')">'+esc(c)+'</button>'; }).join('') +
        '</div></div>';
    }
    window._currentTestWord = w;
  }
  App.testSpellSubmit = function(){
    var attempt = spellState.filled.map(function(i){ return spellState.tiles[i].ch; }).join('');
    var correct = attempt.toLowerCase() === spellState.word.word.toLowerCase();
    finishTestQuestion(spellState.word, correct, 'spelling');
  };
  App.testMeaningPick = function(btn, correct){
    document.querySelectorAll('#choices .choice-btn').forEach(function(b){ b.onclick=null; });
    btn.classList.add(correct?'correct':'incorrect');
    finishTestQuestion(window._currentTestWord, correct, 'meaning');
  };
  function finishTestQuestion(w, correct, type){
    recordAnswer(w.id, correct);
    state.test.results.push({word:w.word, correct:correct, type:type});
    setTimeout(function(){
      state.test.index += 1;
      renderTestQuestion();
    }, 900);
  }

  function renderTestResults(){
    var t = state.test;
    var correctCount = t.results.filter(function(r){return r.correct;}).length;
    var rowsHtml = t.results.map(function(r){
      return '<div class="test-result-row"><span>'+esc(r.word)+' <span class="dash-sub">('+r.type+')</span></span>' +
        '<span class="result-pill '+(r.correct?'correct':'incorrect')+'">'+(r.correct?'Correct':'Missed')+'</span></div>';
    }).join('');
    $('#app').innerHTML =
      '<div class="dash">' +
        '<h2>Test Results</h2>' +
        '<div class="dash-sub">'+listNameFor[t.page]+'</div>' +
        '<div class="stat-grid" style="grid-template-columns:1fr 1fr;">' +
          '<div class="stat-card"><div class="stat-card__num">'+correctCount+'/'+t.results.length+'</div><div class="stat-card__label">Score</div></div>' +
          '<div class="stat-card"><div class="stat-card__num">'+Math.round(100*correctCount/t.results.length)+'%</div><div class="stat-card__label">Accuracy</div></div>' +
        '</div>' +
        '<div class="dash-row">'+rowsHtml+'</div>' +
        '<div style="display:flex;gap:10px;margin-top:16px;">' +
          '<button class="btn btn--ghost btn--block" onclick="App.navigate(\'#/parent/test\')">New test</button>' +
          '<button class="btn btn--block" onclick="App.navigate(\'#/parent/dash\')">Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  render();
})();
