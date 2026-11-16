// Token Radar's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, its filters, the model sandbox, a per-protocol detail panel with the model's own
// inputs and the protocol's farm plan, and the live-token set. No network: every byte it shows is
// in data.js. The farm plan is the same derivation main.ts writes to board.json: category, chains,
// TVL and age decide the action, the capital, the hold and every cost and time. No name is
// special-cased. The sandbox recomputes a row from the snapshot figures the row itself carries.
(function () {
  'use strict';

  var DEFAULT_GW = 0.6;
  var DEFAULT_MF = 0.6;
  var DATA = null;
  var displayMap = null;
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, sort: 'implied', dir: -1, selected: null, gw: DEFAULT_GW, mf: DEFAULT_MF };

  function $(id) { return document.getElementById(id); }

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function catName(r) { return r.category || 'Uncategorised'; }
  function isWatchlist(r) { return r.tvl_usd >= DATA.floor_usd; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  /* FARM-START: the farm plan, replicated from lib/model.ts so the page shows the same eight steps
     main.ts writes to board.json. Keep the text identical. */
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the lending position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the LP tokens.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Borrow a small amount against the deposit on ' + name + ', then repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return "Swap a small amount through " + name + "'s main pool on " + chain + ' and collect the fees.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount back and forth through ' + name + ' so both directions are used.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim the staking rewards on ' + name + ' and restake them the same day.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge on ' + name + ' and open a fresh one at a smaller size.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market on ' + name + ' and open the next one.';
    if (c.indexOf('stable') >= 0) return 'Redeem a small amount of the stable asset and mint it again through ' + name + '.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield accrual on ' + name + ' and top the position up by a small amount.';
    return 'Use ' + name + ' on ' + chain + ' once more that week, a deposit, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var action = actionFor(p, capital, chain);
    var weekly = weeklyActionFor(p, chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weekly, cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Open the protocol's own points or rewards page once a week and confirm the position still counts.", cost: 'no fee to check', time: '5 minutes a week' },
      { text: "Join the protocol's official Discord or forum and read the announcements channel before each weekly action.", cost: 'nothing', time: '5 minutes a week' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, never from a link in a direct message.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  /* FARM-END */

  function sandboxActive() { return state.gw !== DEFAULT_GW || state.mf !== DEFAULT_MF; }

  function clampedGrowth(row) {
    var m = DATA.model;
    var raw = (row.change_7d === null || row.change_7d === undefined) ? 0 : row.change_7d;
    return Math.min(m.growth_cap, Math.max(m.growth_floor, raw));
  }

  // The model's arithmetic, run in the page from the row's own stored figures: TVL x category ratio
  // x growth multiplier x maturity multiplier x chains multiplier. The sandbox changes only the two
  // dials; the submitted board is the same function at growth weight 0.6 and maturity floor 0.6.
  function recompute(row) {
    var m = DATA.model;
    var growthPct = clampedGrowth(row);
    var growthMult = 1 + (growthPct / 100) * state.gw;
    var age = (row.age_days === null || row.age_days === undefined) ? m.unknown_age_days : row.age_days;
    var maturity = state.mf + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var implied = Math.max(1, Math.round(row.tvl_usd * row.category_ratio * growthMult * maturity * row.chains_multiplier));
    return { implied: implied, growthPct: growthPct, growthMult: growthMult, maturity: maturity, age: age };
  }

  function computeDisplay() {
    var map = {};
    if (!sandboxActive()) {
      DATA.rows.forEach(function (r) {
        map[r.slug] = { implied: r.implied_value_usd, rank: r.rank, growthMult: r.growth_multiplier, maturity: r.maturity_multiplier, growthPct: clampedGrowth(r), age: r.age_days };
      });
      return map;
    }
    var scored = DATA.rows.map(function (r) {
      var d = recompute(r);
      return { slug: r.slug, implied: d.implied, growthMult: d.growthMult, maturity: d.maturity, growthPct: d.growthPct, age: d.age };
    });
    scored.sort(function (a, b) { return b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); });
    scored.forEach(function (s, i) {
      map[s.slug] = { implied: s.implied, rank: i + 1, growthMult: s.growthMult, maturity: s.maturity, growthPct: s.growthPct, age: s.age };
    });
    return map;
  }

  function viewRows() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.rows.filter(function (r) {
      if (state.watchOnly && !isWatchlist(r)) return false;
      if (state.category !== 'all' && catName(r) !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return (r.name + ' ' + r.slug + ' ' + catName(r)).toLowerCase().indexOf(q) >= 0;
    });
    var key = state.sort, dir = state.dir;
    list.sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = displayMap[a.slug].rank; bv = displayMap[b.slug].rank; }
      else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = displayMap[a.slug].implied; bv = displayMap[b.slug].implied; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
    return list;
  }

  function renderBoard() {
    var list = viewRows();
    var tbody = $('board-body');
    tbody.textContent = '';
    var max = 1;
    list.forEach(function (r) { if (displayMap[r.slug].implied > max) max = displayMap[r.slug].implied; });
    list.forEach(function (r) {
      var d = displayMap[r.slug];
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var watch = isWatchlist(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(d.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: catName(r) + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((d.implied / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(d.implied) })
        )),
        el('td', null, el('span', { class: watch ? 'pill watch' : 'pill early', text: watch ? 'WATCHLIST' : 'EARLY' }))
      );
      tbody.appendChild(tr);
    });
    $('board-empty').hidden = list.length !== 0;
    var count = $('count');
    count.textContent = '';
    count.appendChild(document.createTextNode('Showing ' + list.length + ' of ' + DATA.board_size + ' rows'));
    if (sandboxActive()) {
      count.appendChild(document.createTextNode(' · '));
      count.appendChild(el('b', { text: 'sandbox ranks' }));
    }
    var heads = document.querySelectorAll('#board thead th button');
    heads.forEach(function (btn) {
      var old = btn.querySelector('.arrow');
      if (old) old.remove();
      if (btn.getAttribute('data-sort') === state.sort) {
        btn.appendChild(el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }));
      }
    });
  }

  function renderLive() {
    var tbody = $('live-body');
    tbody.textContent = '';
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { text: catName(r) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'ratio', text: r.ratio === null ? 'n/a' : r.ratio.toFixed(2) + 'x' }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) })
      ));
    });
  }

  function ratioNote(row) {
    var key = row.category === null ? '(uncategorised)' : row.category;
    var own = DATA.category_ratios[key];
    if (own !== undefined && own === row.category_ratio) {
      return 'median mcap/TVL of live-token protocols in ' + catName(row);
    }
    return 'global median — fewer than 3 live-token protocols in ' + catName(row);
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    var d = displayMap[slug];
    var active = sandboxActive();
    var inner = $('detail-inner');
    inner.textContent = '';
    var rankLine = active
      ? 'Sandbox rank ' + d.rank + ' of ' + DATA.board_size + ' · submitted rank ' + row.rank
      : 'Rank ' + row.rank + ' of ' + DATA.board_size;
    inner.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rank-line', text: rankLine }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: catName(row) + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · ' + row.slug })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: closeDetail })
    ));
    var ageText = row.age_days === null ? 'unknown — 365 days assumed' : row.age_days + ' days';
    var rawGrowth = (row.change_7d === null || row.change_7d === undefined) ? 0 : row.change_7d;
    var growthNote = d.growthPct !== rawGrowth ? ' (clamped to ' + d.growthPct.toFixed(2) + '%)' : '';
    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Snapshot record' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day change' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'First listed' }), el('b', { text: row.listed_at || 'not recorded' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Token status' }), el('b', { text: 'no token recorded' })),
        el('div', null, el('span', { text: 'Market cap' }), el('b', { text: 'none recorded' }))
      )
    ));
    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Model breakdown — implied value' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: '× category ratio — ' + ratioNote(row) }), el('b', { text: row.category_ratio.toFixed(4) })),
        el('div', null, el('span', { text: '× growth — 7d ' + fmtPct(row.change_7d) + growthNote }), el('b', { text: d.growthMult.toFixed(4) })),
        el('div', null, el('span', { text: '× maturity — ' + ageText }), el('b', { text: d.maturity.toFixed(4) })),
        el('div', null, el('span', { text: '× chains — ' + Math.max(row.chains.length, 1) + ' chain' + (row.chains.length === 1 ? '' : 's') }), el('b', { text: row.chains_multiplier.toFixed(4) })),
        el('div', { class: 'total' }, el('span', { text: active ? '= implied value (sandbox)' : '= implied value' }), el('b', { text: fmtUsd(d.implied) }))
      ),
      active ? el('p', { class: 'note', text: 'Sandbox value: the submitted board carries ' + fmtUsd(row.implied_value_usd) + ' for this protocol at rank ' + row.rank + '.' }) : null,
      el('p', { class: 'note', text: 'Multipliers are shown rounded to 4 places. Model ' + DATA.model_version + ': the same function scores every protocol — TVL times the category ratio, then growth, maturity and chain breadth. An estimate, not a price.' })
    ));
    var steps = farmSteps(row);
    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — 8 steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'note', text: 'The plan is derived from this protocol’s own record — its category, chains, TVL and age — never from a hand-written list of names. Capital scales with TVL; younger protocols get a longer hold.' })
    ));
    $('detail').classList.add('open');
    $('detail').hidden = false;
    $('backdrop').hidden = false;
  }

  function closeDetail() {
    state.selected = null;
    $('detail').classList.remove('open');
    $('detail').hidden = true;
    $('backdrop').hidden = true;
    renderBoard();
  }

  // Deep links, so a state can be opened (and screenshotted) from a URL: #detail=<slug> opens one
  // protocol's detail panel, #watchlist shows only the watchlist, #category=<name> filters by category.
  function applyHash() {
    var h = location.hash || '';
    if (!h) return;
    var m = h.match(/^#detail=([A-Za-z0-9._-]+)$/);
    if (m) { openDetail(m[1]); return; }
    if (h === '#watchlist') {
      state.watchOnly = true;
      var w = $('watchonly');
      w.checked = true;
      w.closest('.toggle').classList.add('on');
      renderBoard();
      return;
    }
    var c = h.match(/^#category=(.+)$/);
    if (c) {
      var name = decodeURIComponent(c[1]);
      var found = false;
      DATA.rows.forEach(function (r) { if (catName(r) === name) found = true; });
      if (found) {
        state.category = name;
        $('cat').value = name;
        renderBoard();
      }
    }
  }

  function updateSandboxStatus() {
    var status = $('sandbox-status');
    if (!sandboxActive()) {
      status.textContent = 'Showing the submitted board.';
      status.classList.remove('on');
      return;
    }
    var moved = 0;
    DATA.rows.forEach(function (r) { if (displayMap[r.slug].rank !== r.rank) moved++; });
    status.textContent = 'Sandbox on: growth weight ' + state.gw.toFixed(2) + ', maturity floor ' + state.mf.toFixed(2) + ' — ' + moved + ' of ' + DATA.board_size + ' rows changed rank. The submitted board is unchanged.';
    status.classList.add('on');
  }

  function refreshSandbox() {
    displayMap = computeDisplay();
    updateSandboxStatus();
    renderBoard();
    if (state.selected) openDetail(state.selected);
  }

  function init(data) {
    DATA = data;
    displayMap = computeDisplay();
    $('meta-date').textContent = DATA.as_of;
    $('meta-model').textContent = DATA.model_version;
    $('foot-date').textContent = DATA.as_of;
    $('foot-floor').textContent = '$' + Math.round(DATA.floor_usd / 1e6) + 'M TVL';
    $('stat-watchlist').textContent = DATA.watchlist_size + ' / ' + DATA.watchlist_size;
    $('stat-rows').textContent = String(DATA.board_size);
    $('stat-early').textContent = String(DATA.early_size);
    $('stat-live').textContent = String(DATA.live_size);
    $('stat-ratio').textContent = DATA.global_ratio.toFixed(2) + 'x';

    var catSel = $('cat');
    var cats = Array.from(new Set(DATA.rows.map(catName))).sort();
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    var chainSel = $('chain');
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []))).sort();
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });

    $('q').addEventListener('input', function () { state.q = $('q').value; renderBoard(); });
    catSel.addEventListener('change', function () { state.category = catSel.value; renderBoard(); });
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; renderBoard(); });
    $('watchonly').addEventListener('change', function () {
      state.watchOnly = $('watchonly').checked;
      $('watchonly').closest('.toggle').classList.toggle('on', state.watchOnly);
      renderBoard();
    });
    $('clear-filters').addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false;
      $('q').value = ''; catSel.value = 'all'; chainSel.value = 'all'; $('watchonly').checked = false;
      $('watchonly').closest('.toggle').classList.remove('on');
      renderBoard();
    });
    document.querySelectorAll('#board thead th button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = (key === 'rank' || key === 'name') ? 1 : -1; }
        renderBoard();
      });
    });
    $('gw').addEventListener('input', function () {
      state.gw = parseFloat($('gw').value);
      $('gw-out').textContent = state.gw.toFixed(2);
      refreshSandbox();
    });
    $('mf').addEventListener('input', function () {
      state.mf = parseFloat($('mf').value);
      $('mf-out').textContent = state.mf.toFixed(2);
      refreshSandbox();
    });
    $('sandbox-reset').addEventListener('click', function () {
      state.gw = DEFAULT_GW; state.mf = DEFAULT_MF;
      $('gw').value = String(DEFAULT_GW); $('mf').value = String(DEFAULT_MF);
      $('gw-out').textContent = DEFAULT_GW.toFixed(2); $('mf-out').textContent = DEFAULT_MF.toFixed(2);
      refreshSandbox();
    });
    $('backdrop').addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.selected) closeDetail();
    });

    renderBoard();
    renderLive();
    applyHash();
  }

  // data.js may arrive through the fallback script the page injects when ../data.js is missing,
  // so wait for window.RADAR instead of assuming it is already there.
  function boot() {
    var tries = 0;
    (function wait() {
      if (window.RADAR) { init(window.RADAR); return; }
      if (++tries > 60) { $('data-error').hidden = false; return; }
      setTimeout(wait, 50);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
