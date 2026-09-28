/* ============================================================================
   sanyam.js — the Sanyam tab (bad-habit / abstinence tracker).

   WHY A SEPARATE FILE: loaded by index.html as a plain <script src> placed
   BEFORE the main inline <script>, so LS_SANYAM / loadSanyam / loadSanyamCfg
   already exist when SYNC_FIELDS is built. A classic <script src> is the only
   cross-file include Chrome allows on file:// (fetch and ES modules are both
   blocked, and an <iframe> gets an opaque origin and cannot call fbSyncPush).

   index.html owns only: the sidebar button, an empty #viewSanyam div, the
   setView() wiring, and two SYNC_FIELDS rows. Everything else is here —
   styles, markup, math.

   MODEL: you log the days you SLIPPED. Every other day in the tracked window
   counts as clean. That inversion is the whole point — the streak is the
   absence of a log, never a log of its own.
   ========================================================================== */

const LS_SANYAM    = 'ptd_sanyam_v1';      // array of slips   [{id,d,min,money,note}]
const LS_SANYAMCFG = 'ptd_sanyamcfg_v1';   // {name,start,cur} — what you're quitting, since when

const SEED_SANYAMCFG = { name:'', start:'', cur:'₹' };

function loadSanyam(){
  try{ const v = JSON.parse(localStorage.getItem(LS_SANYAM)); return Array.isArray(v) ? v : []; }
  catch(e){ return []; }
}
// seed first, saved second — saved values must override the seed (same rule as COLORS/ICONS)
function loadSanyamCfg(){
  let v = null;
  try{ v = JSON.parse(localStorage.getItem(LS_SANYAMCFG)); }catch(e){}
  return { ...SEED_SANYAMCFG, ...(v && typeof v === 'object' && !Array.isArray(v) ? v : {}) };
}
function saveSanyam(a){
  try{ localStorage.setItem(LS_SANYAM, JSON.stringify(a)); }catch(e){}
  if(window.fbSyncPush) fbSyncPush();
}
function saveSanyamCfg(o){
  try{ localStorage.setItem(LS_SANYAMCFG, JSON.stringify(o)); }catch(e){}
  if(window.fbSyncPush) fbSyncPush();
}

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
function syNiceDate(s){ if(!s) return '—'; const d = syD(s); return d.getDate() + ' ' + syMon[d.getMonth()] + ' ' + d.getFullYear(); }

/* ---- the whole calculation, one pass ----------------------------------- */
function sanyamStats(){
  const cfg  = loadSanyamCfg();
  const today= syToday();
  const logs = loadSanyam().slice().sort((a,b)=> a.d<b.d?-1 : a.d>b.d?1 : 0);

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

/* ---- render ------------------------------------------------------------ */
function renderSanyam(){
  const el = document.getElementById('viewSanyam'); if(!el) return;
  const S = sanyamStats(), cfg = S.cfg;
  const name = cfg.name || 'the habit';
  const cleanPct = S.days ? Math.round(S.cleanDays / S.days * 100) : 0;
  const sinceLast = S.lastSlip ? syDiff(S.lastSlip, S.today) : null;
  const avgMin   = S.slips ? S.totMin / S.slips : 0;
  const avgMoney = S.slips ? S.totMoney / S.slips : 0;
  const perWeek  = S.days ? (S.slipDays / S.days * 7) : 0;

  const setup = !cfg.start ? '<div class="card sy-setup"><h2>Name it and date it</h2>' +
    '<div class="hint">Two things get this going: what you are staying away from, and the day you started counting. Set both at the bottom of this page.</div></div>' : '';

  const kpi = (lab, val, sub, tone) =>
    '<div class="kpi' + (tone ? ' sy-' + tone : '') + '"><div class="label">' + lab + '</div>' +
    '<div class="val">' + val + '</div><div class="delta">' + (sub||'') + '</div></div>';

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
          '<td>' + (l.note
            ? '<button class="sy-i" type="button" title="Show what happened" onclick="sanyamNote(this)">i</button><span class="sy-note" hidden>' + syEsc(l.note) + '</span>'
            : '<span class="sy-none">—</span>') + '</td>' +
          '<td><button class="btn-sm" onclick="sanyamDel(&quot;' + syEsc(String(l.id)) + '&quot;)">Delete</button></td></tr>'; }).join('') +
        '</table>'
      : '<div class="hint">Nothing logged. That is the best possible state of this table.</div>') + '</div>';

  const cfgCard = '<div class="card" style="margin-top:16px"><h2>What you are staying away from</h2>' +
    '<div class="hint">The start date is the day counting begins. Log an older slip and the start moves back on its own.</div>' +
    '<form class="form" onsubmit="sanyamCfgSave(event)">' +
      '<div class="frow" style="grid-template-columns:1fr 170px 110px auto;align-items:end">' +
        '<label>Habit <input id="syName" type="text" placeholder="e.g. late-night scrolling" value="' + syEsc(cfg.name) + '"></label>' +
        '<label>Counting since <input id="syStart" type="date" max="' + S.today + '" value="' + syEsc(cfg.start || S.start) + '"></label>' +
        '<label>Currency <input id="syCur" type="text" maxlength="3" value="' + syEsc(cfg.cur) + '"></label>' +
        '<button class="btn-sm" type="submit">Save</button>' +
      '</div>' +
    '</form></div>';

  el.innerHTML = setup +
    '<div class="sy-head">' + syEsc(name) + ' · counting since ' + syNiceDate(S.start) + '</div>' +
    '<div class="kpis">' + kpis1 + '</div><div class="kpis">' + kpis2 + '</div>' +
    form + heat + runsCard + monthsCard + listCard + cfgCard;
}

/* ---- actions ----------------------------------------------------------- */
function sanyamAdd(ev){
  ev.preventDefault();
  const d = document.getElementById('syDate').value;
  const msg = document.getElementById('syMsg');
  if(!d){ if(msg) msg.textContent = 'Pick a date.'; return; }
  if(d > syToday()){ if(msg) msg.textContent = 'That date is in the future.'; return; }
  const a = loadSanyam();
  a.push({ id: 'sy' + Date.now() + Math.random().toString(36).slice(2,6),
           d: d,
           min: Math.max(0, +document.getElementById('syMin').value || 0),
           money: Math.max(0, +document.getElementById('syMoneyIn').value || 0),
           note: (document.getElementById('syNote').value || '').trim() });
  saveSanyam(a);
  renderSanyam();
}
// the note is the one thing worth not having on screen by default. One click reveals one row.
function sanyamNote(btn){
  const s = btn.nextElementSibling; if(!s) return;
  s.hidden = !s.hidden;
  btn.classList.toggle('on', !s.hidden);
  btn.title = s.hidden ? 'Show what happened' : 'Hide it again';
}
function sanyamDel(id){
  if(!confirm('Delete this slip?')) return;
  saveSanyam(loadSanyam().filter(function(x){ return String(x.id) !== String(id); }));
  renderSanyam();
}
function sanyamCfgSave(ev){
  ev.preventDefault();
  saveSanyamCfg({ name: (document.getElementById('syName').value||'').trim(),
                  start: document.getElementById('syStart').value || '',
                  cur: (document.getElementById('syCur').value||'').trim() || '₹' });
  renderSanyam();
}

/* ---- styles (kept here so index.html stays untouched) ------------------- */
(function(){
  if(document.getElementById('sanyamCss')) return;
  const s = document.createElement('style');
  s.id = 'sanyamCss';
  s.textContent = [
    '#viewSanyam .sy-head{font-size:13px;color:var(--muted);font-weight:600;margin:-4px 0 16px}',
    '#viewSanyam .kpis{margin-bottom:14px}',
    '#viewSanyam .kpi.sy-good .val{color:#4d7c1f}',
    '#viewSanyam .kpi.sy-bad .val{color:#b3322d}',
    '#viewSanyam .sy-setup{border-left:4px solid var(--accent);margin-bottom:16px}',
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
