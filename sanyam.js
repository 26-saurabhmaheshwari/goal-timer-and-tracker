/* ============================================================================
   sanyam.js — the Sanyam tab (habit trackers, as many as you want).

   WHY A SEPARATE FILE: loaded by index.html as a plain <script src> placed
   BEFORE the main inline <script>, so LS_SANYAM / loadSanyam / loadSanyamCfg
   already exist when SYNC_FIELDS is built. A classic <script src> is the only
   cross-file include Chrome allows on file:// (fetch and ES modules are both
   blocked, and an <iframe> gets an opaque origin and cannot call fbSyncPush).

   index.html owns only: the sidebar button, an empty #viewSanyam div, the
   setView() wiring, and two SYNC_FIELDS rows. Everything else is here —
   styles, markup, math.

   TWO KINDS of sanyam, each its own card on the list page; click opens it:
   - 'slip'    you log the days you SLIPPED. Every other day in the tracked
               window counts as clean. The streak is the absence of a log.
   - 'routine' one row per day: wake up, last meal, at bed. Sleep is bed of
               day d → wake of day d+1.

   STORAGE: LS_SANYAMCFG is a map {habitId: {name,kind,start,cur,at,deleted}}
   so the 'map' sync merge unions habits by id. LS_SANYAM rows carry h = habitId.
   Pre-multi data (top-level {name,start,cur}, rows without h) is habit 'main'.
   ========================================================================== */

const LS_SANYAM    = 'ptd_sanyam_v1';      // rows. slip {id,h,d,min,money,note} · routine {id:h_d,h,d,wake,meal,bed,note}
const LS_SANYAMCFG = 'ptd_sanyamcfg_v1';   // {habitId:{name,kind,start,cur,at,deleted}}

const SEED_SANYAMHABIT = { name:'', kind:'slip', start:'', cur:'₹', at:0 };

function loadSanyam(){
  try{ const v = JSON.parse(localStorage.getItem(LS_SANYAM)); return Array.isArray(v) ? v : []; }
  catch(e){ return []; }
}
function loadSanyamCfg(){
  let v = null;
  try{ v = JSON.parse(localStorage.getItem(LS_SANYAMCFG)); }catch(e){}
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
function saveSanyam(a){
  try{ localStorage.setItem(LS_SANYAM, JSON.stringify(a)); }catch(e){}
  if(window.fbSyncPush) fbSyncPush();
}
function saveSanyamCfg(o){
  try{ localStorage.setItem(LS_SANYAMCFG, JSON.stringify(o)); }catch(e){}
  if(window.fbSyncPush) fbSyncPush();
}

// the one-habit format becomes habit 'main'. Runs on render, not on load, and only writes when it changes something.
function syMigrate(){
  const c = loadSanyamCfg(); let ch = false;
  if('name' in c || 'start' in c || 'cur' in c){
    if(!c.main && (c.name || c.start)) c.main = { ...SEED_SANYAMHABIT, name:c.name||'', start:c.start||'', cur:c.cur||'₹' };
    delete c.name; delete c.start; delete c.cur; ch = true;
  }
  if(!c.main && loadSanyam().some(l => !l.h)){ c.main = { ...SEED_SANYAMHABIT }; ch = true; }
  if(ch) saveSanyamCfg(c);
}
const syHid = l => l.h || 'main';
// seed first, saved second — saved values must override the seed (same rule as COLORS/ICONS)
function syHabits(){
  const c = loadSanyamCfg();
  return Object.keys(c).filter(k => c[k] && typeof c[k] === 'object' && !c[k].deleted)
    .map(k => ({ ...SEED_SANYAMHABIT, ...c[k], id:k }))
    .sort((a,b)=> (a.at||0) - (b.at||0));
}
function syHabit(id){ return syHabits().find(h => h.id === id) || null; }

let syOpen = null;            // habit id on screen, null = the list
let syChart = null;

/* ---- date helpers (local midnights; Math.round absorbs DST 23h/25h days) ---- */
const syD    = s => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); };
const syS    = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const syToday= () => syS(new Date());
const syAdd  = (s,n) => { const d = syD(s); d.setDate(d.getDate()+n); return syS(d); };
const syDiff = (a,b) => Math.round((syD(b) - syD(a)) / 86400000);
const syEsc  = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const syHM   = m => { m = Math.round(+m||0); const h = Math.floor(m/60), mm = m%60; return h ? (mm ? h+'h '+mm+'m' : h+'h') : mm+'m'; };
const syMon  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const syMoney= (n,cur) => (cur||'') + Math.round(+n||0).toLocaleString();
const syPlural = (n,w) => n + ' ' + w + (n===1?'':'s');
const syQ    = id => '&quot;' + syEsc(id) + '&quot;';
function syNiceDate(s){ if(!s) return '—'; const d = syD(s); return d.getDate() + ' ' + syMon[d.getMonth()] + ' ' + d.getFullYear(); }

/* ---- clock helpers for the routine kind --------------------------------- */
// "HH:MM" → minutes after midnight. Meal before 5am and bed before noon belong to the night before midnight, so +24h.
const syTM   = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s||''); return m ? (+m[1])*60 + (+m[2]) : null; };
const syMealN= s => { const m = syTM(s); return m===null ? null : m < 300 ? m + 1440 : m; };
const syBedN = s => { const m = syTM(s); return m===null ? null : m < 720 ? m + 1440 : m; };
function syClock(m){
  if(m===null || m===undefined || isNaN(m)) return '—';
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(m/60), mm = String(m%60).padStart(2,'0');
  return (h%12 || 12) + ':' + mm + (h < 12 ? ' am' : ' pm');
}
const syAvg  = a => { a = a.filter(x => x!==null && !isNaN(x)); return a.length ? a.reduce((s,x)=>s+x,0) / a.length : null; };
const sySpread = a => { a = a.filter(x => x!==null); return a.length > 1 ? Math.max(...a) - Math.min(...a) : null; };

/* ---- slip kind: the whole calculation, one pass ------------------------- */
function sanyamStats(hid){
  const cfg  = syHabit(hid) || { ...SEED_SANYAMHABIT, id:hid };
  const today= syToday();
  const logs = loadSanyam().filter(l => syHid(l) === hid).sort((a,b)=> a.d<b.d?-1 : a.d>b.d?1 : 0);

  // tracking window: user-set start, pushed back if an older slip exists, never in the future
  let start = cfg.start || (logs[0] && logs[0].d) || today;
  if(logs.length && logs[0].d < start) start = logs[0].d;
  if(start > today) start = today;

  // fold slips into days — several slips on one day are still ONE dirty day
  const byDay = {};
  let totMin = 0, totMoney = 0;
  logs.forEach(l => {
    const min = +l.min||0, money = +l.money||0;
    totMin += min; totMoney += money;
    if(l.d < start || l.d > today) return;            // future-dated rows skip the day math
    const b = byDay[l.d] || (byDay[l.d] = {min:0, money:0, n:0});
    b.min += min; b.money += money; b.n++;
  });

  // walk every day in the window; a day with no entry is a clean day
  const days = syDiff(start, today) + 1;
  const runs = [];
  let run = 0;
  for(let i=0; i<days; i++){
    const d = syAdd(start, i);
    if(byDay[d]){ if(run) runs.push({len:run, to:syAdd(d,-1), from:syAdd(d,-run)}); run = 0; }
    else run++;
  }
  if(run) runs.push({len:run, to:today, from:syAdd(today, -(run-1))});

  const slipDays  = Object.keys(byDay).length;
  const cleanDays = days - slipDays;
  const curStreak = byDay[today] ? 0 : run;
  const best      = runs.reduce((a,r)=> r.len > (a ? a.len : 0) ? r : a, null);
  const lastSlip  = logs.length ? logs[logs.length-1].d : '';

  // month-by-month rollup, newest first
  const months = {};
  for(let i=0; i<days; i++){
    const d = syAdd(start, i), k = d.slice(0,7);
    const M = months[k] || (months[k] = {ym:k, days:0, slipDays:0, slips:0, min:0, money:0});
    M.days++;
    const b = byDay[d];
    if(b){ M.slipDays++; M.slips += b.n; M.min += b.min; M.money += b.money; }
  }
  const monthRows = Object.values(months).sort((a,b)=> a.ym<b.ym ? 1 : -1);

  return { cfg, cur:cfg.cur, logs, byDay, start, today, days,
           slipDays, cleanDays, curStreak, runs, best, lastSlip,
           totMin, totMoney, slips:logs.length, monthRows };
}

/* ---- routine kind: one row a day, averages over the last 7 -------------- */
function syRoutineStats(hid){
  const cfg   = syHabit(hid) || { ...SEED_SANYAMHABIT, kind:'routine', id:hid };
  const today = syToday();
  const byDay = {};
  loadSanyam().filter(l => syHid(l) === hid && l.d <= today).forEach(r => { byDay[r.d] = r; });
  const days  = Object.keys(byDay).sort();
  // per-day derived numbers: sleep = bed of d → wake of d+1, gap = last meal → bed
  const rows = days.map(d => {
    const r = byDay[d], nx = byDay[syAdd(d,1)];
    const wake = syTM(r.wake), meal = syMealN(r.meal), bed = syBedN(r.bed);
    const wakeNext = nx ? syTM(nx.wake) : null;
    let sleep = (bed!==null && wakeNext!==null) ? wakeNext + 1440 - bed : null;
    if(sleep!==null && (sleep < 60 || sleep > 960)) sleep = null;       // a typo, not a night
    let gap = (bed!==null && meal!==null) ? bed - meal : null;
    if(gap!==null && gap < 0) gap = null;
    return { r, d, wake, meal, bed, sleep, gap };
  });
  // streak of logged days, ending today — or yesterday while today is still blank
  let streak = 0, d = byDay[today] ? today : syAdd(today,-1);
  while(byDay[d]){ streak++; d = syAdd(d,-1); }
  const wk  = rows.filter(x => x.d >= syAdd(today,-6));
  const pick= (a,k) => a.map(x => x[k]);
  return { cfg, today, byDay, rows, streak, logged:days.length, first:days[0]||'', wk,
           wake7:syAvg(pick(wk,'wake')), meal7:syAvg(pick(wk,'meal')), bed7:syAvg(pick(wk,'bed')),
           sleep7:syAvg(pick(wk,'sleep')), gap7:syAvg(pick(wk,'gap')),
           wakeAll:syAvg(pick(rows,'wake')), mealAll:syAvg(pick(rows,'meal')), bedAll:syAvg(pick(rows,'bed')),
           sleepAll:syAvg(pick(rows,'sleep')), gapAll:syAvg(pick(rows,'gap')),
           wakeSpread:sySpread(pick(wk,'wake')), bedSpread:sySpread(pick(wk,'bed')) };
}

/* ---- 26-week heatmap: one square per day, red = you logged it ----------- */
function syCell(d, S){
  let cls = 'sy-d', tip = syNiceDate(d);
  if(d > S.today)       { cls += ' sy-fut'; tip = ''; }
  else if(d < S.start)  { cls += ' sy-pre'; tip += ' — before you started'; }
  else {
    const b = S.byDay[d];
    if(b){
      cls += ' sy-s' + (b.min>120 ? 4 : b.min>60 ? 3 : b.min>30 ? 2 : 1);
      tip += ' — ' + syPlural(b.n,'slip') + ', ' + syHM(b.min) + (b.money ? ', ' + syMoney(b.money,S.cur) : '');
    } else { cls += ' sy-ok'; tip += ' — clean'; }
  }
  if(d === S.today) cls += ' sy-td';
  return '<i class="' + cls + '"' + (tip ? ' title="' + syEsc(tip) + '"' : '') + '></i>';
}
function syHeat(S){
  const WEEKS = 26;
  const dow = (syD(S.today).getDay() + 6) % 7;       // 0 = Monday
  const gridEnd   = syAdd(S.today, 6 - dow);         // finish on this week's Sunday
  const gridStart = syAdd(gridEnd, -(WEEKS*7 - 1));
  let cols = '', labs = '';
  for(let w=0; w<WEEKS; w++){
    let col = '';
    for(let r=0; r<7; r++) col += syCell(syAdd(gridStart, w*7 + r), S);
    cols += '<div class="sy-col">' + col + '</div>';
    const first = syAdd(gridStart, w*7);
    const lab = (+first.slice(8,10) <= 7) ? syMon[+first.slice(5,7)-1] : '';
    labs += '<div class="sy-col sy-lab">' + lab + '</div>';
  }
  return '<div class="sy-heat"><div class="sy-dows"><span>Mon</span><span>Wed</span><span>Fri</span></div>' +
         '<div><div class="sy-grid">' + labs + '</div><div class="sy-grid">' + cols + '</div></div></div>';
}
// last 28 days in one row, for the list cards
function syStrip(today, cellFn){
  let s = '';
  for(let i=27; i>=0; i--) s += cellFn(syAdd(today,-i));
  return '<div class="sy-strip">' + s + '</div>';
}

/* ---- render: list or one habit ----------------------------------------- */
function renderSanyam(){
  const el = document.getElementById('viewSanyam'); if(!el) return;
  syMigrate();
  if(syChart){ try{ syChart.destroy(); }catch(e){} syChart = null; }
  const h = syOpen ? syHabit(syOpen) : null;
  if(!h){ syOpen = null; el.innerHTML = syListView(); return; }
  if(h.kind === 'routine') syRoutineView(el, h);
  else el.innerHTML = sySlipView(h);
}

const syKpi = (lab, val, sub, tone) =>
  '<div class="kpi' + (tone ? ' sy-' + tone : '') + '"><div class="label">' + lab + '</div>' +
  '<div class="val">' + val + '</div><div class="delta">' + (sub||'') + '</div></div>';
const syBack = (h, line) =>
  '<div class="sy-top"><button class="btn-sm" type="button" onclick="sanyamOpen(null)">← All sanyams</button>' +
  '<span class="sy-head">' + syEsc(h.name || 'Unnamed') + ' · ' + line + '</span></div>';

function syListView(){
  const H = syHabits();
  const tiles = H.map(function(h){
    const open = ' onclick="sanyamOpen(' + syQ(h.id) + ')" onkeydown="if(event.key===&quot;Enter&quot;)sanyamOpen(' + syQ(h.id) + ')"';
    if(h.kind === 'routine'){
      const R = syRoutineStats(h.id);
      const done = R.byDay[R.today];
      return '<div class="card sy-tile" role="button" tabindex="0"' + open + '>' +
        '<div class="sy-tk">Daily times</div><div class="sy-tn">' + syEsc(h.name || 'Daily routine') + '</div>' +
        '<div class="sy-tv ' + (done ? 'sy-g' : '') + '">' + (done ? 'Today logged' : 'Today not logged yet') + '</div>' +
        '<div class="sy-ts">Last 7 days: wake ' + syClock(R.wake7) + ' · meal ' + syClock(R.meal7) + ' · bed ' + syClock(R.bed7) +
          (R.sleep7!==null ? ' · sleep ' + syHM(R.sleep7) : '') + '</div>' +
        syStrip(R.today, d => '<i class="sy-d ' + (d > R.today ? 'sy-fut' : R.byDay[d] ? 'sy-ok' : 'sy-miss') + (d===R.today ? ' sy-td' : '') +
          '" title="' + syEsc(syNiceDate(d) + (R.byDay[d] ? ' — logged' : ' — blank')) + '"></i>') +
        '</div>';
    }
    const S = sanyamStats(h.id);
    return '<div class="card sy-tile" role="button" tabindex="0"' + open + '>' +
      '<div class="sy-tk">Staying away</div><div class="sy-tn">' + syEsc(h.name || 'Unnamed habit') + '</div>' +
      '<div class="sy-tv ' + (S.curStreak ? 'sy-g' : 'sy-r') + '">' + syPlural(S.curStreak,'day') + ' clean</div>' +
      '<div class="sy-ts">Best ' + (S.best ? syPlural(S.best.len,'day') : '—') + ' · last slip ' + (S.lastSlip ? syNiceDate(S.lastSlip) : 'never') +
        ' · ' + syMoney(S.totMoney, S.cur) + '</div>' +
      syStrip(S.today, d => syCell(d, S)) +
      '</div>';
  }).join('');

  const add = '<div class="card" style="margin-top:16px"><h2>Add a sanyam</h2>' +
    '<div class="hint">Stay away = you log only the days you slipped, every other day is clean. Daily times = you log wake up, last meal and bed time each day.</div>' +
    '<form class="form" onsubmit="sanyamNew(event)">' +
      '<div class="frow" style="grid-template-columns:230px 1fr 170px auto;align-items:end">' +
        '<label>Kind <select id="syKind" onchange="syKindHint()"><option value="slip">Stay away from something</option><option value="routine">Daily times (wake, meal, bed)</option></select></label>' +
        '<label>Name <input id="syNewName" type="text" placeholder="e.g. late-night scrolling" required></label>' +
        '<label>Counting since <input id="syNewStart" type="date" max="' + syToday() + '" value="' + syToday() + '"></label>' +
        '<button class="btn" type="submit">Add</button>' +
      '</div>' +
    '</form></div>';

  return '<div class="sy-head">' + (H.length ? 'Click one to open it. Each keeps its own log.' : 'Nothing here yet. Add your first one below.') + '</div>' +
    (H.length ? '<div class="sy-tiles">' + tiles + '</div>' : '') + add;
}

function sySlipView(h){
  const S = sanyamStats(h.id), cfg = S.cfg;
  const cleanPct = S.days ? Math.round(S.cleanDays / S.days * 100) : 0;
  const sinceLast = S.lastSlip ? syDiff(S.lastSlip, S.today) : null;
  const avgMin   = S.slips ? S.totMin / S.slips : 0;
  const avgMoney = S.slips ? S.totMoney / S.slips : 0;
  const perWeek  = S.days ? (S.slipDays / S.days * 7) : 0;
  const kpi = syKpi;

  const setup = !cfg.start ? '<div class="card sy-setup"><h2>Name it and date it</h2>' +
    '<div class="hint">Two things get this going: what you are staying away from, and the day you started counting. Set both at the bottom of this page.</div></div>' : '';

  const kpis1 =
    kpi('Clean right now', syPlural(S.curStreak,'day'), S.curStreak ? 'since ' + syNiceDate(syAdd(S.today, -S.curStreak)) : 'you logged it today', S.curStreak ? 'good' : 'bad') +
    kpi('Best run', S.best ? syPlural(S.best.len,'day') : '—', S.best ? syNiceDate(S.best.from) + ' → ' + syNiceDate(S.best.to) : 'no clean run yet') +
    kpi('Clean days', S.cleanDays + ' / ' + S.days, cleanPct + '% of the days you tracked') +
    kpi('Money it cost', syMoney(S.totMoney, S.cur), S.slips ? syMoney(avgMoney, S.cur) + ' a slip' : 'nothing logged yet');

  const kpis2 =
    kpi('Time it cost', syHM(S.totMin), S.slips ? syHM(avgMin) + ' a slip' : 'nothing logged yet') +
    kpi('Slips logged', String(S.slips), syPlural(S.slipDays,'day') + ' out of ' + S.days) +
    kpi('Last slip', sinceLast===null ? 'never' : sinceLast===0 ? 'today' : syPlural(sinceLast,'day') + ' ago', S.lastSlip ? syNiceDate(S.lastSlip) : 'clean the whole way') +
    kpi('Rate', (Math.round(perWeek*10)/10) + ' / week', 'how often it happens on average');

  const form = '<div class="card">' +
    '<h2>Log a slip</h2>' +
    '<div class="hint">Only log the days it happened. Money can be zero. Every day you do not log is counted as a clean day, so there is nothing to tick off when you stay away.</div>' +
    '<form class="form" onsubmit="sanyamAdd(event)">' +
      '<div class="frow" style="grid-template-columns:160px 130px 130px 1fr auto;align-items:end">' +
        '<label>Date <input id="syDate" type="date" max="' + S.today + '" value="' + S.today + '" required></label>' +
        '<label>Minutes <input id="syMin" type="number" min="0" step="5" placeholder="0"></label>' +
        '<label>Money <input id="syMoneyIn" type="number" min="0" step="1" placeholder="0"></label>' +
        '<label>What happened <input id="syNote" type="text" placeholder="optional"></label>' +
        '<button class="btn" type="submit">Log it</button>' +
      '</div>' +
      '<div class="hint" id="syMsg" style="margin-top:10px"></div>' +
    '</form></div>';

  const heat = '<div class="card" style="margin-top:16px"><h2>Last 26 weeks</h2>' +
    '<div class="hint">One square a day. Pale green is a day you stayed away. Red is a day you logged, darker the longer it ran.</div>' +
    syHeat(S) +
    '<div class="sy-key"><span class="sy-d sy-ok"></span>clean<span class="sy-d sy-s1"></span>under 30m' +
    '<span class="sy-d sy-s2"></span>30m–60m<span class="sy-d sy-s3"></span>1–2h<span class="sy-d sy-s4"></span>over 2h' +
    '<span class="sy-d sy-pre"></span>before you started</div></div>';

  const topRuns = S.runs.slice().sort((a,b)=> b.len - a.len).slice(0,5);
  const runsCard = '<div class="card" style="margin-top:16px"><h2>Best clean runs</h2>' +
    '<div class="hint">Every unbroken stretch, longest first. The one touching today is still going.</div>' +
    (topRuns.length
      ? '<table class="sy-tbl"><tr><th>#</th><th>Length</th><th>From</th><th>To</th><th></th></tr>' +
        topRuns.map((r,i)=> '<tr><td>' + (i+1) + '</td><td><b>' + syPlural(r.len,'day') + '</b></td><td>' + syNiceDate(r.from) + '</td>' +
          '<td>' + syNiceDate(r.to) + '</td><td>' + (r.to===S.today ? '<span class="sy-live">running</span>' : '') + '</td></tr>').join('') +
        '</table>'
      : '<div class="hint">No clean run yet.</div>') + '</div>';

  const monthsCard = '<div class="card" style="margin-top:16px"><h2>Month by month</h2>' +
    (S.monthRows.length
      ? '<table class="sy-tbl"><tr><th>Month</th><th>Clean</th><th>Slip days</th><th>Slips</th><th>Time</th><th>Money</th></tr>' +
        S.monthRows.map(function(M){
          const pct = Math.round((M.days - M.slipDays) / M.days * 100);
          return '<tr><td>' + syMon[+M.ym.slice(5,7)-1] + ' ' + M.ym.slice(0,4) + '</td>' +
            '<td><span class="sy-bar"><span style="width:' + pct + '%"></span></span>' + pct + '%</td>' +
            '<td>' + M.slipDays + ' / ' + M.days + '</td><td>' + M.slips + '</td>' +
            '<td>' + syHM(M.min) + '</td><td>' + syMoney(M.money, S.cur) + '</td></tr>';
        }).join('') + '</table>'
      : '<div class="hint">Nothing tracked yet.</div>') + '</div>';

  const list = S.logs.slice().reverse();
  const listCard = '<div class="card" style="margin-top:16px"><h2>Everything you logged</h2>' +
    '<div class="hint">' + syPlural(S.slips,'slip') + ' on record. The note stays hidden — click the i to read it. Deleting a row turns that day clean again if it was the only entry.</div>' +
    (list.length
      ? '<table class="sy-tbl"><tr><th>Date</th><th>Time</th><th>Money</th><th>Note</th><th></th></tr>' +
        list.map(function(l){ return '<tr><td>' + syNiceDate(l.d) + '</td><td>' + syHM(l.min) + '</td><td>' + syMoney(l.money, S.cur) + '</td>' +
          '<td>' + syNoteCell(l.note) + '</td>' +
          '<td><button class="btn-sm" onclick="sanyamDel(' + syQ(String(l.id)) + ')">Delete</button></td></tr>'; }).join('') +
        '</table>'
      : '<div class="hint">Nothing logged. That is the best possible state of this table.</div>') + '</div>';

  const cfgCard = '<div class="card" style="margin-top:16px"><h2>What you are staying away from</h2>' +
    '<div class="hint">The start date is the day counting begins. Log an older slip and the start moves back on its own.</div>' +
    '<form class="form" onsubmit="sanyamCfgSave(event)">' +
      '<div class="frow" style="grid-template-columns:1fr 170px 110px auto auto;align-items:end">' +
        '<label>Habit <input id="syName" type="text" placeholder="e.g. late-night scrolling" value="' + syEsc(cfg.name) + '"></label>' +
        '<label>Counting since <input id="syStart" type="date" max="' + S.today + '" value="' + syEsc(cfg.start || S.start) + '"></label>' +
        '<label>Currency <input id="syCur" type="text" maxlength="3" value="' + syEsc(cfg.cur) + '"></label>' +
        '<button class="btn-sm" type="submit">Save</button>' +
        '<button class="btn-sm" type="button" onclick="sanyamRemove()">Remove</button>' +
      '</div>' +
    '</form></div>';

  return setup + syBack(cfg, 'counting since ' + syNiceDate(S.start)) +
    '<div class="kpis">' + kpis1 + '</div><div class="kpis">' + kpis2 + '</div>' +
    form + heat + runsCard + monthsCard + listCard + cfgCard;
}
function syNoteCell(note){
  return note
    ? '<button class="sy-i" type="button" title="Show what happened" onclick="sanyamNote(this)">i</button><span class="sy-note" hidden>' + syEsc(note) + '</span>'
    : '<span class="sy-none">—</span>';
}

function syRoutineView(el, h){
  const R = syRoutineStats(h.id), kpi = syKpi;
  const all = (v, f) => v===null ? 'no data yet' : 'all-time ' + f(v);
  const kpis1 =
    kpi('Days logged', String(R.logged), R.streak ? syPlural(R.streak,'day') + ' in a row' : 'no run going', R.byDay[R.today] ? 'good' : '') +
    kpi('Wake up', syClock(R.wake7), 'avg last 7 days · ' + all(R.wakeAll, syClock)) +
    kpi('Last meal', syClock(R.meal7), 'avg last 7 days · ' + all(R.mealAll, syClock)) +
    kpi('At bed', syClock(R.bed7), 'avg last 7 days · ' + all(R.bedAll, syClock));
  const kpis2 =
    kpi('Sleep', R.sleep7===null ? '—' : syHM(R.sleep7), 'avg last 7 nights · ' + all(R.sleepAll, syHM)) +
    kpi('Meal to bed', R.gap7===null ? '—' : syHM(R.gap7), 'avg last 7 days · ' + all(R.gapAll, syHM)) +
    kpi('Wake-up moves', R.wakeSpread===null ? '—' : syHM(R.wakeSpread), 'earliest to latest, last 7 days') +
    kpi('Bed time moves', R.bedSpread===null ? '—' : syHM(R.bedSpread), 'earliest to latest, last 7 days');

  const t = R.byDay[R.today] || {};
  const tIn = (id, lab, v) => '<label>' + lab + ' <span class="sy-now" onclick="event.preventDefault();syNow(&quot;' + id + '&quot;)">now</span>' +
    '<input id="' + id + '" type="time" value="' + syEsc(v||'') + '"></label>';
  const form = '<div class="card">' +
    '<h2>Log a day</h2>' +
    '<div class="hint">Fill it as the day goes — wake up in the morning, the rest at night. Saving the same date again updates that day. At bed is the night of that date, past midnight still counts.</div>' +
    '<form class="form" onsubmit="sanyamRtSave(event)">' +
      '<div class="frow" style="grid-template-columns:160px 130px 130px 130px 1fr auto;align-items:end">' +
        '<label>Date <input id="syRtDate" type="date" max="' + R.today + '" value="' + R.today + '" onchange="syRtFill()" required></label>' +
        tIn('syWake', 'Wake up', t.wake) + tIn('syMeal', 'Last meal', t.meal) + tIn('syBed', 'At bed', t.bed) +
        '<label>Note <input id="syRtNote" type="text" placeholder="optional" value="' + syEsc(t.note||'') + '"></label>' +
        '<button class="btn" type="submit">Save</button>' +
      '</div>' +
      '<div class="hint" id="syMsg" style="margin-top:10px"></div>' +
    '</form></div>';

  const chart = '<div class="card" style="margin-top:16px"><h2>Last 30 days</h2>' +
    '<div class="hint">Each line is one time of day. Flat lines mean a steady routine.</div>' +
    '<div style="position:relative;height:260px"><canvas id="syRtChart"></canvas></div></div>';

  const list = R.rows.slice().reverse().slice(0, 90);
  const listCard = '<div class="card" style="margin-top:16px"><h2>Every day you logged</h2>' +
    '<div class="hint">Sleep is that night: bed on this date to wake up the next day. Newest first, last 90 days shown.</div>' +
    (list.length
      ? '<table class="sy-tbl"><tr><th>Date</th><th>Wake up</th><th>Last meal</th><th>At bed</th><th>Sleep</th><th>Meal to bed</th><th>Note</th><th></th></tr>' +
        list.map(x => '<tr><td>' + syNiceDate(x.d) + '</td><td>' + syClock(x.wake) + '</td><td>' + syClock(x.meal) + '</td><td>' + syClock(x.bed) + '</td>' +
          '<td>' + (x.sleep===null ? '—' : syHM(x.sleep)) + '</td><td>' + (x.gap===null ? '—' : syHM(x.gap)) + '</td>' +
          '<td>' + syNoteCell(x.r.note) + '</td>' +
          '<td style="white-space:nowrap"><button class="btn-sm" onclick="sanyamRtEdit(' + syQ(x.d) + ')">Edit</button> ' +
          '<button class="btn-sm" onclick="sanyamDel(' + syQ(String(x.r.id)) + ')">Delete</button></td></tr>').join('') +
        '</table>'
      : '<div class="hint">Nothing logged yet. Start with today\'s wake-up time above.</div>') + '</div>';

  const cfgCard = '<div class="card" style="margin-top:16px"><h2>Name</h2>' +
    '<form class="form" onsubmit="sanyamCfgSave(event)">' +
      '<div class="frow" style="grid-template-columns:1fr auto auto;align-items:end">' +
        '<label>Name <input id="syName" type="text" value="' + syEsc(h.name) + '"></label>' +
        '<button class="btn-sm" type="submit">Save</button>' +
        '<button class="btn-sm" type="button" onclick="sanyamRemove()">Remove</button>' +
      '</div>' +
    '</form></div>';

  el.innerHTML = syBack(h, R.first ? 'logging since ' + syNiceDate(R.first) : 'daily times') +
    '<div class="kpis">' + kpis1 + '</div><div class="kpis">' + kpis2 + '</div>' +
    form + chart + listCard + cfgCard;
  syRtChart(R);
}
function syRtChart(R){
  const cv = document.getElementById('syRtChart'); if(!cv || !window.Chart) return;
  const labels = [], wake = [], meal = [], bed = [];
  for(let i=29; i>=0; i--){
    const d = syAdd(R.today, -i), r = R.byDay[d];
    labels.push(syD(d).getDate() + ' ' + syMon[syD(d).getMonth()]);
    wake.push(r ? syTM(r.wake) : null); meal.push(r ? syMealN(r.meal) : null); bed.push(r ? syBedN(r.bed) : null);
  }
  const ds = (label, data, c) => ({ label, data, borderColor:c, backgroundColor:c, spanGaps:true, tension:.25, pointRadius:3, borderWidth:2 });
  try{
    syChart = new Chart(cv, {
      type:'line',
      data:{ labels, datasets:[ ds('Wake up', wake, '#e0a33a'), ds('Last meal', meal, '#6fa531'), ds('At bed', bed, '#5b6bbf') ] },
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ ticks:{ stepSize:120, callback:v => syClock(v) } } },
        plugins:{ tooltip:{ callbacks:{ label:c => c.dataset.label + ': ' + syClock(c.parsed.y) } } } }
    });
  }catch(e){}
}

/* ---- actions ----------------------------------------------------------- */
function sanyamOpen(id){ syOpen = id; renderSanyam(); window.scrollTo(0,0); }
function syKindHint(){
  const k = document.getElementById('syKind'), n = document.getElementById('syNewName'); if(!k || !n) return;
  n.placeholder = k.value === 'routine' ? 'e.g. Daily routine' : 'e.g. late-night scrolling';
  if(k.value === 'routine' && !n.value) n.value = 'Daily routine';
}
function sanyamNew(ev){
  ev.preventDefault();
  const name = (document.getElementById('syNewName').value || '').trim(); if(!name) return;
  const c = loadSanyamCfg(), id = 'sh' + Date.now().toString(36);
  c[id] = { ...SEED_SANYAMHABIT, name, kind: document.getElementById('syKind').value === 'routine' ? 'routine' : 'slip',
            start: document.getElementById('syNewStart').value || syToday(), at: Date.now() };
  saveSanyamCfg(c);
  sanyamOpen(id);
}
function sanyamRemove(){
  const h = syHabit(syOpen); if(!h) return;
  if(!confirm('Remove "' + (h.name || 'this one') + '"? It disappears from the list. Its log stays in your backup.')) return;
  const c = loadSanyamCfg();
  c[h.id] = { ...c[h.id], deleted:true, deletedAt:Date.now() };
  saveSanyamCfg(c);
  sanyamOpen(null);
}
function sanyamAdd(ev){
  ev.preventDefault();
  const d = document.getElementById('syDate').value;
  const msg = document.getElementById('syMsg');
  if(!d){ if(msg) msg.textContent = 'Pick a date.'; return; }
  if(d > syToday()){ if(msg) msg.textContent = 'That date is in the future.'; return; }
  const a = loadSanyam();
  a.push({ id: 'sy' + Date.now() + Math.random().toString(36).slice(2,6),
           h: syOpen,
           d: d,
           min: Math.max(0, +document.getElementById('syMin').value || 0),
           money: Math.max(0, +document.getElementById('syMoneyIn').value || 0),
           note: (document.getElementById('syNote').value || '').trim() });
  saveSanyam(a);
  renderSanyam();
}
// routine: one row per habit per day, id = habit_date, so saving a date again replaces it (and syncs as one row)
function sanyamRtSave(ev){
  ev.preventDefault();
  const d = document.getElementById('syRtDate').value, msg = document.getElementById('syMsg');
  if(!d){ if(msg) msg.textContent = 'Pick a date.'; return; }
  if(d > syToday()){ if(msg) msg.textContent = 'That date is in the future.'; return; }
  const v = id => (document.getElementById(id).value || '').trim();
  const row = { id: syOpen + '_' + d, h: syOpen, d, wake: v('syWake'), meal: v('syMeal'), bed: v('syBed'), note: v('syRtNote') };
  const a = loadSanyam().filter(x => String(x.id) !== row.id);
  if(row.wake || row.meal || row.bed || row.note) a.push(row);
  saveSanyam(a);
  renderSanyam();
}
function syRtFill(){
  const d = document.getElementById('syRtDate').value;
  const r = loadSanyam().find(x => String(x.id) === syOpen + '_' + d) || {};
  [['syWake','wake'],['syMeal','meal'],['syBed','bed'],['syRtNote','note']].forEach(([id,k]) => { document.getElementById(id).value = r[k] || ''; });
}
function sanyamRtEdit(d){
  const el = document.getElementById('syRtDate'); if(!el) return;
  el.value = d; syRtFill();
  el.scrollIntoView({behavior:'smooth', block:'center'});
}
function syNow(id){
  const n = new Date(), el = document.getElementById(id);
  if(el) el.value = String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
}
// the note is the one thing worth not having on screen by default. One click reveals one row.
function sanyamNote(btn){
  const s = btn.nextElementSibling; if(!s) return;
  s.hidden = !s.hidden;
  btn.classList.toggle('on', !s.hidden);
  btn.title = s.hidden ? 'Show what happened' : 'Hide it again';
}
function sanyamDel(id){
  if(!confirm('Delete this row?')) return;
  saveSanyam(loadSanyam().filter(function(x){ return String(x.id) !== String(id); }));
  renderSanyam();
}
function sanyamCfgSave(ev){
  ev.preventDefault();
  const c = loadSanyamCfg(), h = c[syOpen]; if(!h) return;
  const g = id => document.getElementById(id);
  h.name = (g('syName').value || '').trim();
  if(g('syStart')) h.start = g('syStart').value || '';
  if(g('syCur'))   h.cur   = (g('syCur').value || '').trim() || '₹';
  saveSanyamCfg(c);
  renderSanyam();
}

/* ---- styles (kept here so index.html stays untouched) ------------------- */
(function(){
  if(document.getElementById('sanyamCss')) return;
  const s = document.createElement('style');
  s.id = 'sanyamCss';
  s.textContent = [
    '#viewSanyam .sy-head{font-size:13px;color:var(--muted);font-weight:600;margin:-4px 0 16px}',
    '#viewSanyam .sy-top{display:flex;align-items:center;gap:12px;margin:-4px 0 16px}',
    '#viewSanyam .sy-top .sy-head{margin:0}',
    '#viewSanyam .kpis{margin-bottom:14px}',
    '#viewSanyam .kpi.sy-good .val{color:#4d7c1f}',
    '#viewSanyam .kpi.sy-bad .val{color:#b3322d}',
    '#viewSanyam .sy-setup{border-left:4px solid var(--accent);margin-bottom:16px}',
    '.sy-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}',
    '.sy-tile{cursor:pointer;transition:border-color .15s,transform .15s}',
    '.sy-tile:hover,.sy-tile:focus{border-color:var(--accent);transform:translateY(-1px);outline:none}',
    '.sy-tk{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700}',
    '.sy-tn{font-size:17px;font-weight:700;color:var(--ink);margin:2px 0 8px}',
    '.sy-tv{font-size:22px;font-weight:700;color:var(--ink)}',
    '.sy-tv.sy-g{color:#4d7c1f}.sy-tv.sy-r{color:#b3322d}',
    '.sy-ts{font-size:12px;color:var(--muted);margin:4px 0 10px}',
    '.sy-strip{display:flex;gap:3px;flex-wrap:wrap}',
    '.sy-miss{background:#ece7db}',
    '.sy-now{font-size:10px;font-weight:700;color:var(--accent);cursor:pointer;margin-left:4px}',
    '.sy-heat{display:flex;gap:8px;align-items:flex-end;overflow-x:auto;padding:4px 0 2px}',
    '.sy-grid{display:flex;gap:3px}',
    '.sy-col{display:flex;flex-direction:column;gap:3px}',
    '.sy-col.sy-lab{font-size:10px;color:var(--muted);font-weight:600;height:12px;justify-content:flex-end;white-space:nowrap}',
    '.sy-dows{display:flex;flex-direction:column;justify-content:space-between;font-size:10px;color:var(--muted);font-weight:600;height:81px;padding-bottom:2px}',
    '.sy-d{display:block;width:11px;height:11px;border-radius:3px;background:#e6dfcf}',
    '.sy-ok{background:#cfe0b4}',
    '.sy-pre{background:#ece7db}',
    '.sy-fut{background:transparent}',
    '.sy-s1{background:#f2b3b0}.sy-s2{background:#e8837e}.sy-s3{background:#d4514b}.sy-s4{background:#a82b26}',
    '.sy-td{outline:2px solid var(--ink);outline-offset:1px}',
    '.sy-key{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--muted);margin-top:12px}',
    '.sy-key .sy-d{margin-left:10px}',
    '.sy-tbl{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}',
    '.sy-tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--line)}',
    '.sy-tbl td{padding:7px 8px;border-bottom:1px solid rgba(0,0,0,.05);vertical-align:middle}',
    '.sy-tbl tr:last-child td{border-bottom:0}',
    '.sy-bar{display:inline-block;width:70px;height:6px;border-radius:3px;background:#e6dfcf;margin-right:8px;vertical-align:middle;overflow:hidden}',
    '.sy-bar>span{display:block;height:100%;background:#8DC63F}',
    '.sy-live{font-size:11px;font-weight:700;color:#4d7c1f}',
    '.sy-i{width:18px;height:18px;padding:0;border:1px solid var(--line);border-radius:50%;background:transparent;color:var(--muted);font:italic 700 11px/16px Georgia,serif;cursor:pointer}',
    '.sy-i:hover{border-color:var(--accent);color:var(--accent)}',
    '.sy-i.on{background:var(--accent);border-color:var(--accent);color:#fff}',
    '.sy-note{margin-left:8px;color:var(--ink)}',
    '.sy-none{color:var(--muted)}',
    '@media(max-width:880px){#viewSanyam .kpis{grid-template-columns:1fr 1fr}}'
  ].join('\n');
  document.head.appendChild(s);
})();
