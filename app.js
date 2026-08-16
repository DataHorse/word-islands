/* =========================================================
   Word Islands — app.js
   Vanilla JS, no build step, fully offline after first load.
   ========================================================= */
(function(){
  "use strict";

  var WORDS = window.FRY_WORDS || [];
  var PAGES = [1,2,3,4,5,6,7,8,9,10];
  var ISLAND_COLORS = {1:'--island-1',2:'--island-2',3:'--island-3',4:'--island-4',5:'--island-5',
                        6:'--island-6',7:'--island-7',8:'--island-8',9:'--island-9',10:'--island-10'};

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

  function loadProgress(){
    try{ return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }catch(e){ return {}; }
  }
  function saveProgress(p){ localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); }
  function loadMeta(){
    try{ return JSON.parse(localStorage.getItem(META_KEY)) || {stars:0}; }catch(e){ return {stars:0}; }
  }
  function saveMeta(m){ localStorage.setItem(META_KEY, JSON.stringify(m)); }

  function getEntry(progress, id){
    return progress[id] || {tier:0, correct:0, incorrect:0, seen:0, lastSeen:0};
  }
  function isMastered(entry){ return entry.tier >= 4; }
  function isStruggling(entry){
    var attempts = entry.correct + entry.incorrect;
    return attempts >= 2 && (entry.incorrect > entry.correct || entry.tier <= 1);
  }

  function recordAnswer(id, correct){
    var progress = loadProgress();
    var e = getEntry(progress, id);
    e.seen += 1;
    e.lastSeen = Date.now();
    if(correct){
      e.correct += 1;
      e.tier = Math.min(4, e.tier + 1);
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
    var m = loadMeta(); m.stars = (m.stars||0) + n; saveMeta(m); return m.stars;
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
  function weightedSample(words, n){
    var progress = loadProgress();
    var pool = words.map(function(w){
      var e = getEntry(progress, w.id);
      var weight = (5 - e.tier) + (e.seen===0 ? 2 : 0);
      return {w:w, weight: Math.max(weight, 0.5)};
    });
    var chosen = [];
    var attempts = 0;
    while(chosen.length < Math.min(n, words.length) && attempts < 2000){
      attempts++;
      var totalWeight = pool.reduce(function(s,x){return s+x.weight;},0);
      var r = Math.random() * totalWeight;
      var acc = 0;
      for(var i=0;i<pool.length;i++){
        acc += pool[i].weight;
        if(r <= acc){
          chosen.push(pool[i].w);
          pool.splice(i,1);
          break;
        }
      }
    }
    return chosen;
  }
  function esc(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
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

  /* ---------------- router ---------------- */
  var state = { parentUnlocked:false, session:null, test:null };

  function navigate(hash){ window.location.hash = hash; }
  window.addEventListener('hashchange', render);
  window.addEventListener('load', render);

  function render(){
    var hash = window.location.hash || '#/';
    var parts = hash.replace('#/','').split('/').filter(Boolean);
    window.scrollTo(0,0);
    if(parts.length===0) return renderHome();
    if(parts[0]==='list') return renderPageMenu(parseInt(parts[1],10));
    if(parts[0]==='play') return startSession(parseInt(parts[1],10), parts[2]);
    if(parts[0]==='parent' && !parts[1]) return renderParentGate();
    if(parts[0]==='parent' && parts[1]==='dash') return state.parentUnlocked ? renderDashboard() : renderParentGate();
    if(parts[0]==='parent' && parts[1]==='test') return state.parentUnlocked ? renderTestConfig() : renderParentGate();
    return renderHome();
  }

  /* ---------------- HOME ---------------- */
  function renderHome(){
    var meta = loadMeta();
    var totalMastered = 0;
    PAGES.forEach(function(p){ totalMastered += pageStats(p).mastered; });

    var islandsHtml = PAGES.map(function(p, idx){
      var stats = pageStats(p);
      var pct = Math.round(100*stats.mastered/stats.total);
      var badge = stats.mastered===stats.total ? '<span class="island__badge">\u2605</span>' : '';
      return '' +
      '<button class="island" onclick="App.navigate(\'#/list/'+p+'\')" aria-label="'+esc(listNameFor[p])+', '+pct+' percent mastered">' +
        '<div class="island__blob" style="background:var('+ISLAND_COLORS[p]+')">'+p+badge+'</div>' +
        '<div class="island__label">'+esc(listNameFor[p])+'</div>' +
        '<div class="island__progress">'+stats.mastered+'/'+stats.total+' \u2b50</div>' +
      '</button>';
    }).join('');

    $('#app').innerHTML =
      '<div class="topbar">' +
        '<div class="topbar__title">\ud83c\udf34 Word Islands</div>' +
        '<div class="topbar__stars">\u2b50 '+ (meta.stars||0) +'</div>' +
      '</div>' +
      '<div class="hero">' +
        '<h1>Hi Aadya! Ready to explore?</h1>' +
        '<p>You have mastered '+totalMastered+' of 1000 words. Tap an island to practice!</p>' +
      '</div>' +
      '<div class="trail-wrap"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:22px 10px;justify-items:center;padding:0 18px;">'+islandsHtml+'</div></div>' +
      '<button class="parent-link" onclick="App.navigate(\'#/parent\')">Parent area</button>';
  }

  /* ---------------- PAGE MENU ---------------- */
  var MODE_INFO = {
    learn:   {icon:'\ud83d\udcd6', label:'Learn', sub:'Flip cards'},
    spell:   {icon:'\u270f\ufe0f', label:'Spell It', sub:'Build the word'},
    meaning: {icon:'\ud83e\udd14', label:'What Means?', sub:'Pick the meaning'},
    sentence:{icon:'\ud83d\udcdd', label:'Fill In', sub:'Complete the sentence'},
    sameopp: {icon:'\u2696\ufe0f', label:'Same or Opposite', sub:'Compare words'}
  };

  function renderPageMenu(p){
    if(!byPage[p]) return renderHome();
    var stats = pageStats(p);
    var words = byPage[p];
    var specialCount = words.filter(function(w){ return (w.synonyms&&w.synonyms.length) || (w.antonyms&&w.antonyms.length); }).length;

    var modes = ['learn','spell','meaning','sentence'];
    if(specialCount >= 4) modes.push('sameopp');

    var modesHtml = modes.map(function(m){
      var info = MODE_INFO[m];
      return '<button class="mode-card" onclick="App.navigate(\'#/play/'+p+'/'+m+'\')">' +
        '<div class="mode-card__icon">'+info.icon+'</div>' +
        '<div class="mode-card__label">'+info.label+'</div>' +
        '<div class="mode-card__sub">'+info.sub+'</div>' +
      '</button>';
    }).join('');

    $('#app').innerHTML =
      '<div class="screen">' +
        '<button class="back-btn" onclick="App.navigate(\'#/\')">\u2190 Islands</button>' +
        '<div class="page-header">' +
          '<div class="page-header__blob" style="background:var('+ISLAND_COLORS[p]+')">'+p+'</div>' +
          '<div><h2>'+esc(listNameFor[p])+'</h2><div class="dash-sub">'+stats.mastered+' of '+stats.total+' words mastered</div></div>' +
        '</div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:'+Math.round(100*stats.mastered/stats.total)+'%;background:var('+ISLAND_COLORS[p]+')"></div></div>' +
        '<div class="mode-grid">'+modesHtml+'</div>' +
      '</div>';
  }

  /* ---------------- SESSION ENGINE ---------------- */
  var SESSION_LEN = 10;

  function startSession(p, mode){
    if(!byPage[p] || !MODE_INFO[mode]) return renderHome();
    var words = byPage[p];
    var pool = words;
    if(mode==='sameopp'){
      pool = words.filter(function(w){ return (w.synonyms&&w.synonyms.length)||(w.antonyms&&w.antonyms.length); });
    }
    var picks = mode==='learn' ? sample(pool, Math.min(SESSION_LEN, pool.length)) : weightedSample(pool, Math.min(SESSION_LEN, pool.length));
    state.session = { page:p, mode:mode, words:picks, index:0, correct:0, incorrect:0, starsEarned:0 };
    renderQuestion();
  }

  function sessionProgressBar(){
    var s = state.session;
    var pct = Math.round(100*s.index/s.words.length);
    return '<div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div>';
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

  function wrapGame(inner, showBack){
    $('#app').innerHTML =
      '<div class="game-wrap">' +
        '<button class="back-btn" onclick="App.exitSession()">\u2190 Exit practice</button>' +
        sessionProgressBar() +
        inner +
      '</div>' +
      '<div id="feedback" class="feedback-banner"></div>';
  }

  function showFeedback(correct, message, onNext){
    var el = $('#feedback');
    el.className = 'feedback-banner show ' + (correct?'correct':'incorrect');
    el.innerHTML = '<span>'+message+'</span><button class="btn btn--ghost btn--sm" style="color:#fff;border-color:rgba(255,255,255,.5)" onclick="App.nextQuestion()">Next \u2192</button>';
    window._pendingNext = onNext;
  }

  window.App = window.App || {};
  App.nextQuestion = function(){
    if(window._pendingNext) window._pendingNext();
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
            '<button class="speak-btn" onclick="event.stopPropagation(); App.speakWord(\''+esc(w.word).replace(/'/g,"\\'")+'\')">\ud83d\udd0a</button>' +
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

  /* --- Spell mode --- */
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
        '<button class="btn btn--teal btn--sm" style="margin-top:10px" onclick="App.speakWord(\''+esc(w.word).replace(/'/g,"\\'")+'\')">\ud83d\udd0a Hear it</button>' +
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
    if(correct){ state.session.correct++; state.session.starsEarned++; addStars(1); }
    else state.session.incorrect++;
    showFeedback(correct, correct ? 'Great spelling! \u2b50' : 'Correct spelling: '+spellState.word.word);
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
        '<button class="btn btn--teal btn--sm" style="margin-top:10px" onclick="App.speakWord(\''+esc(w.word).replace(/'/g,"\\'")+'\')">\ud83d\udd0a Hear it</button>' +
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
    if(correct){ state.session.correct++; state.session.starsEarned++; addStars(1); }
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
    if(correct){ state.session.correct++; state.session.starsEarned++; addStars(1); }
    else {
      state.session.incorrect++;
      document.querySelectorAll('#choices .choice-btn').forEach(function(b){
        if(b.textContent === w.word) b.classList.add('correct');
      });
    }
    showFeedback(correct, correct ? 'Perfect! \u2b50' : 'The right word was "'+w.word+'"');
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
    if(correct){ state.session.correct++; state.session.starsEarned++; addStars(1); }
    else state.session.incorrect++;
    showFeedback(correct, correct ? 'You got it! \u2b50' : 'It was '+ctx.correctAnswer+'.');
  };

  /* --- Session summary --- */
  function renderSessionSummary(){
    var s = state.session;
    var totalAnswered = s.correct + s.incorrect;
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
            '<button class="btn btn--ghost btn--block" onclick="App.navigate(\'#/list/'+s.page+'\')">More games</button>' +
            '<button class="btn btn--block" onclick="App.navigate(\'#/\')">Islands map</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

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
      return '' +
      '<div class="dash-row">' +
        '<div class="dash-row__top">' +
          '<div class="dash-row__name"><span class="dash-row__dot" style="background:var('+ISLAND_COLORS[p]+')"></span>'+esc(listNameFor[p])+'</div>' +
          '<div class="dash-sub">'+s.mastered+'/'+s.total+' mastered</div>' +
        '</div>' +
        '<div class="dash-row__bar"><div class="dash-row__bar-fill" style="width:'+pct+'%;background:var('+ISLAND_COLORS[p]+')"></div></div>' +
        '<div class="dash-row__meta">'+s.seen+' words practiced \u00b7 '+s.struggling+' currently struggling</div>' +
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
        '<div class="dash-sub">Overview across all 1000 words</div>' +
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
          '<p>This clears all mastery progress for these 100 words. This can\u2019t be undone.</p>' +
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
    byPage[p].forEach(function(w){ delete progress[w.id]; });
    saveProgress(progress);
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
    // alternate spelling and meaning questions for a well-rounded quick check
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
