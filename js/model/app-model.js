/**
 * MVC - Model 層：應用程式資料模型、狀態管理、幾何與檔案資料處理 (AppModel)
 */
  const SAMPLE = {
    ground: [[0, 10], [20, 10], [40, 20], [55, 27], [80, 28]],
    layers: [
      { name: L('崩積層', 'Colluvium', '崩積土'), color: '#D8BE8A', gamma: 18, gammaSat: 20, c: 5, phi: 28, bedrock: false, top: null },
      { name: L('風化岩', 'Weathered rock', '風化岩'), color: '#B48462', gamma: 21, gammaSat: 22, c: 30, phi: 32, bedrock: false, top: [[0, 6], [20, 6], [40, 14], [55, 19], [80, 20]] },
      { name: L('岩盤', 'Bedrock', '基盤岩'), color: '#8C949A', gamma: 24, gammaSat: 24, c: 200, phi: 40, bedrock: true, top: [[0, 2], [40, 8], [80, 12]] }
    ],
    water: [[0, 10], [20, 10.2], [40, 16], [55, 22], [80, 24]],
    piezo: [],
    zBase: 0,
    reinf: [],
    walls: [],
    loads: [],
    trial: [],
    scenarios: defaultScenarios(),
    ctrl: defaultCtrl(),
    pileDesign: { PFs: 1.2 },
    wallCode: 'wsc',
    report: {},
    settings: DEF_SET
  };
  const NAIL = { type: 'nail', on: true, theta: 15, L: 9, Lfree: 0, Sh: 1.5, Tt: 180, q: 40, Tf: 150, P: 0 };
  const ANCHOR = { type: 'anchor', on: true, theta: 25, L: 20, Lfree: 8, Sh: 2.5, Tt: 600, q: 150, Tf: 0, P: 300 };
  // stabilizing pile (steel pipe), micropile and geosynthetic layer
  const PILE = { type: 'pile', on: true, L: 12, D: 2, N: 1, Do: 318.5, t: 10.3, grade: 'SKK490', term: 'long', ptype: 'wedge', load: 'tri', E0m: 15000, E0b: 60000, aE: 1, kEmb: 1.5, FSy: 2, a0: 2 };
  const MPILE = { type: 'mpile', on: true, theta: 80, L: 10, Sh: 1, Tt: 400, q: 60, Va: 40 };
  const GEO = { type: 'geo', on: true, kind: 'grid', L: 6, Tult: 80, rfID: 1.2, rfCR: 2, rfD: 1.1, Ci: 0.8, aS: 0.8, fsPo: 1.5, face: true, dir: 'h' };
  const TPL = { nail: NAIL, anchor: ANCHOR, pile: PILE, mpile: MPILE, geo: GEO };
  const STR_F = { grade: ['SKK400', 'SKK490', 'SM570'], term: ['long', 'short'], ptype: ['wedge', 'restrain'], load: ['tri', 'uni', 'rigid'], kind: ['grid', 'tex'], dir: ['h', 't'] };

  function save() { }
  /* pore pressure option of a layer: water table (default), piezometric line k, ru, or dry */
  function sanitizePore(p, npz) {
    if (!p || typeof p !== 'object') return { type: 'wt' };
    if (p.type === 'piezo' && Number.isInteger(+p.line) && +p.line >= 0 && +p.line < npz) return { type: 'piezo', line: +p.line };
    if (p.type === 'ru') return { type: 'ru', ru: isFinite(+p.ru) ? +p.ru : 0 };
    if (p.type === 'dry') return { type: 'dry' };
    return { type: 'wt' };
  }
  function sanitize(m) {
    if (!m || !Array.isArray(m.ground) || !Array.isArray(m.layers) || !m.layers.length) throw new Error(L('格式不符', 'invalid format', '形式が正しくありません'));
    const P = a => Array.isArray(a) ? a.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])).map(p => [+p[0], +p[1]]).sort((a, b) => a[0] - b[0]) : [];
    const pal = ['#D8BE8A', '#B48462', '#8C949A', '#A9B38B', '#C7A1A1', '#9FB4C7'];
    return {
      ground: P(m.ground),
      layers: m.layers.map((L, i) => ({
        name: String(L.name || L_(`土層 ${i + 1}`, `Layer ${i + 1}`, `地層 ${i + 1}`)), color: /^#[0-9a-f]{6}$/i.test(L.color) ? L.color : pal[i % pal.length],
        gamma: +L.gamma || 18, gammaSat: +L.gammaSat || +L.gamma || 20, c: +L.c || 0, phi: +L.phi || 0, bedrock: !!L.bedrock,
        top: i ? P(L.top) : null, pore: sanitizePore(L.pore, Array.isArray(m.piezo) ? m.piezo.length : 0)
      })),
      water: P(m.water),
      piezo: (Array.isArray(m.piezo) ? m.piezo : []).filter(q => q && typeof q === 'object').map((q, i) => ({ name: String(q.name || L_(`水壓線 ${i + 1}`, `Piezometric line ${i + 1}`, `水頭線 ${i + 1}`)), pts: P(q.pts) })),
      trial: P(m.trial),
      trialCircle: m.trialCircle && [m.trialCircle.xc, m.trialCircle.zc, m.trialCircle.R].every(v => isFinite(v)) && +m.trialCircle.R > 0 ? { xc: +m.trialCircle.xc, zc: +m.trialCircle.zc, R: +m.trialCircle.R } : null,
      reinf: (Array.isArray(m.reinf) ? m.reinf : []).filter(r => r && isFinite(r.x) && isFinite(r.z)).map(r => {
        const d = TPL[r.type] || NAIL, o = {};
        for (const k of Object.keys(d)) o[k] = k === 'type' ? d.type : k === 'on' ? r.on !== false : k === 'face' ? r.face !== false : STR_F[k] ? (STR_F[k].includes(r[k]) ? r[k] : d[k]) : (isFinite(+r[k]) && r[k] !== null && r[k] !== '' ? +r[k] : d[k]);
        o.x = +r.x; o.z = +r.z; return o;
      }),
      loads: (Array.isArray(m.loads) ? m.loads : []).filter(l => l && (l.type === 'line' ? isFinite(l.x) : isFinite(l.x1) && isFinite(l.x2))).map((l, i) => ({
        name: String(l.name || L_(`載重 ${i + 1}`, `Load ${i + 1}`, `荷重 ${i + 1}`)), type: l.type === 'line' ? 'line' : 'udl', on: l.on !== false, seis: l.seis !== false,
        x1: +l.x1, x2: +l.x2, x: +l.x, q: isFinite(+l.q) ? +l.q : 10, q2: (l.q2 === null || l.q2 === undefined || l.q2 === '' || !isFinite(+l.q2)) ? null : +l.q2, P: isFinite(+l.P) ? +l.P : 50
      })),
      walls: (Array.isArray(m.walls) ? m.walls : []).filter(w => w && (Array.isArray(w.poly) || (w.par && typeof w.par === 'object'))).map((w, i) => sanitizeWall(w, i)),
      wallCode: WALL_CODES[m.wallCode] ? m.wallCode : 'wsc',
      scenarios: sanitizeScen(m.scenarios),
      ctrl: sanitizeCtrl(m.ctrl),
      pileDesign: { PFs: m.pileDesign && +m.pileDesign.PFs > 0 ? +m.pileDesign.PFs : 1.2 },
      report: m.report && typeof m.report === 'object' ? { title: String(m.report.title || ''), project: String(m.report.project || ''), author: String(m.report.author || ''), note: String(m.report.note || '') } : {},
      zBase: isFinite(m.zBase) ? +m.zBase : Math.min(...P(m.ground).map(p => p[1])) - 10,
      settings: Object.assign({}, DEF_SET, m.settings || {})
    };
  }

  let model = clone(SAMPLE);
  let active = 'ground', mode = 'drag';
  let result = null, stale = false, running = false;
  let undoStack = [];
  let bounds = null, T = null;
  let drag = null, hover = null;

  /* ---------- lines ---------- */
  function lineDefs() {
    const a = [{ key: 'ground', label: L('地表線', 'Ground surface', '地表面'), kind: 'ground' }];
    model.layers.forEach((L, i) => { if (i) a.push({ key: 'L' + i, label: L_(`${L.name} 頂面`, `Top of ${L.name}`, `${L.name} の上面`), kind: 'bound', color: L.color }); });
    a.push({ key: 'water', label: L('地下水位線', 'Water table', '地下水位'), kind: 'water' });
    (model.piezo || []).forEach((q, k) => a.push({ key: 'P' + k, label: q.name, kind: 'piezo' }));
    a.push({ key: 'trial', label: L('指定滑動面（試算用）', 'Specified slip surface (trial)', '指定すべり面（試算用）'), kind: 'trial' });
    return a;
  }
  function getPts(key) {
    if (key === 'ground') return model.ground;
    if (key === 'water') return model.water;
    if (key === 'trial') return model.trial;
    if (key[0] === 'P') { const q = (model.piezo || [])[+key.slice(1)]; return q ? q.pts : null; }
    const L = model.layers[+key.slice(1)];
    return L ? L.top : null;
  }
  function setPts(key, P) {
    P.sort((a, b) => a[0] - b[0]);
    if (key === 'ground') model.ground = P; else if (key === 'water') model.water = P; else if (key === 'trial') model.trial = P; else if (key[0] === 'P') model.piezo[+key.slice(1)].pts = P; else model.layers[+key.slice(1)].top = P;
  }
  function minPts(key) { return key === 'water' || key === 'trial' || key[0] === 'P' ? 0 : 2; }

  function pushUndo() { undoStack.push(JSON.stringify(model)); if (undoStack.length > 60) undoStack.shift(); $('#btnUndo').disabled = false; }
  function doUndo() {
    if (!undoStack.length) return;
    model = JSON.parse(undoStack.pop());
    if (!getPts(active)) active = 'ground';
    $('#btnUndo').disabled = !undoStack.length;
    changed(true);
  }
  function changed(full) {
    stale = !!result; save();
    if (bkRes && !bkRes.stale) { bkRes.stale = true; renderBack(); }
    if (pd) renderPileDesign();
    renderWallChecks();
    if (scen && !scen.stale) { scen.stale = true; renderScen(); }
    if (full) { renderScenList(); renderRepInfo(); renderCtrl(); }
    if (full) { renderLines(); renderLayers(); renderSettings(); renderReinf(); renderWalls(); renderLoads(); }
    else renderLines();
    renderCoords(); draw(); renderResults(); renderGuide();
  }

  /* the part of a circle below the ground, from its first to its last ground crossing (the same span the engine uses),
     as a polyline of 24–120 points about 0.5 m apart; the ends lie on the ground or on the model edge */
  function genArc(xc, zc, R, ground) {
    const x0 = ground[0][0], x1 = ground[ground.length - 1][0], cl = v => Math.max(-1, Math.min(1, v));
    const tlo = 2 * Math.PI - Math.acos(cl((x0 - xc) / R)), thi = 2 * Math.PI - Math.acos(cl((x1 - xc) / R));
    if (!(thi > tlo)) return [];
    const pt = t => [xc + R * Math.cos(t), zc + R * Math.sin(t)], h = t => { const q = pt(t); return q[1] - interp(ground, Math.max(x0, Math.min(x1, q[0]))); };
    const m = 720; let ia = -1, ib = -1;
    for (let i = 0; i <= m; i++) if (h(tlo + (thi - tlo) * i / m) < -1e-9) { if (ia < 0) ia = i; ib = i; }
    if (ia < 0) return [];
    const bis = (a, b) => { let fa = h(a); for (let k = 0; k < 60; k++) { const c = (a + b) / 2, fc = h(c); if ((fa >= 0) === (fc >= 0)) { a = c; fa = fc; } else b = c; } return (a + b) / 2; };
    const ta = ia > 0 ? bis(tlo + (thi - tlo) * (ia - 1) / m, tlo + (thi - tlo) * ia / m) : tlo;
    const tb = ib < m ? bis(tlo + (thi - tlo) * (ib + 1) / m, tlo + (thi - tlo) * ib / m) : thi;
    const n = Math.max(24, Math.min(120, Math.round(R * (tb - ta) / 0.5)));
    const P = []; for (let i = 0; i <= n; i++) P.push(pt(ta + (tb - ta) * i / n));
    return P.map(p => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]).filter((p, i, A) => !i || p[0] > A[i - 1][0]);
  }
  // the circle stored with the model, if every point of the specified surface still lies on it
  function trialCircleNow() {
    const c = model.trialCircle; if (!c || model.trial.length < 3) return null;
    const T = model.trial, G = genArc(c.xc, c.zc, c.R, model.ground), near = (a, b) => b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 2e-3;
    return G.length && near(T[0], G[0]) && near(T[T.length - 1], G[G.length - 1]) && T.every(p => Math.abs(Math.hypot(p[0] - c.xc, p[1] - c.zc) - c.R) < 2e-3) ? c : null;
  }
  function parseCoords(txt) {
    const out = [];
    for (const line of txt.split(/\r?\n/)) {
      const t = line.trim(); if (!t) continue;
      const v = t.split(/[\s,;，]+/).map(Number).filter(n => isFinite(n));
      if (v.length >= 2) out.push([v[0], v[1]]);
    }
    return out;
  }

  /* ---------- reinforcement ---------- */
  const intoDir = () => { const g = model.ground; return g.length > 1 && g[0][1] > g[g.length - 1][1] ? -1 : 1; };
  const uT = () => gTF() ? 'tf' : 'kN', uQ = () => gTF() ? 'tf/m' : 'kN/m';
  function faceX(frac) {
    const g = model.ground; if (g.length < 2) return 0;
    const zs = g.map(p => p[1]), z0 = Math.min(...zs), zt = z0 + frac * (Math.max(...zs) - z0);
    let best = g[0][0], bd = Infinity;
    for (let i = 0; i <= 400; i++) { const x = g[0][0] + (g[g.length - 1][0] - g[0][0]) * i / 400, d = Math.abs(interp(g, x) - zt); if (d < bd) { bd = d; best = x; } }
    return Math.round(best * 10) / 10;
  }
  function midFaceX() {
    const g = model.ground; if (g.length < 2) return 0;
    const zs = g.map(p => p[1]), zm = (Math.min(...zs) + Math.max(...zs)) / 2;
    let best = g[0][0], bd = Infinity;
    for (let i = 0; i <= 400; i++) { const x = g[0][0] + (g[g.length - 1][0] - g[0][0]) * i / 400, d = Math.abs(interp(g, x) - zm); if (d < bd) { bd = d; best = x; } }
    return Math.round(best * 10) / 10;
  }
  const typeName = t => t === 'anchor' ? L('地錨', 'Anchor', 'アンカー') : t === 'pile' ? L('抑止樁', 'Stabilizing pile', '抑止杭') : t === 'mpile' ? L('微型樁', 'Micropile', 'マイクロパイル') : t === 'geo' ? L('地工合成材', 'Geosynthetic', 'ジオシンセティックス') : L('土釘', 'Soil nail', '鉄筋挿入工');
  const ptypeName = v => v === 'restrain' ? L('懸臂樁（抑え杭）', 'Restraint pile (cantilever)', '抑え杭') : L('楔形樁（くさび杭）', 'Wedge pile', 'くさび杭');
  const ptypeShort = v => v === 'restrain' ? L('懸臂樁', 'Restraint', '抑え杭') : L('楔形樁', 'Wedge', 'くさび杭');
  /* end points of a member in model coordinates: [x1, z1, x2, z2] */
  function memGeom(r) {
    const dir = intoDir();
    if (r.type === 'pile') { const zg = interp(model.ground, r.x); return [r.x, zg, r.x, zg - r.L]; }
    if (r.type === 'geo') return [r.x, r.z, r.x + dir * r.L, r.z];
    const th = (+r.theta || 0) * Math.PI / 180; return [r.x, r.z, r.x + dir * r.L * Math.cos(th), r.z - r.L * Math.sin(th)];
  }
  /* x of the slope face at elevation z (the point of the ground nearest to that elevation on the face) */
  function faceAt(z) {
    const g = model.ground; let best = g[0][0], bd = Infinity;
    for (let i = 0; i <= 800; i++) { const x = g[0][0] + (g[g.length - 1][0] - g[0][0]) * i / 800, d = Math.abs(interp(g, x) - z); if (d < bd - 1e-9) { bd = d; best = x; } }
    return Math.round(best * 100) / 100;
  }
  function addMember(tpl, x) {
    const o = clone(tpl); o.x = x; o.z = Math.round(interp(model.ground, x) * 100) / 100; o.on = true;
    model.reinf.push(o);
  }

  /* ---------- surface loads ---------- */
  const LOAD_TPL = {
    road: { name: ['道路車載', 'Traffic', '交通荷重'], type: 'udl', seis: false },
    bldg: { name: ['建築物', 'Building', '建築物'], type: 'udl', seis: true },
    pile: { name: ['堆置物', 'Stockpile', '盛土・資材置場'], type: 'udl', seis: true },
    wallL: { name: ['圍牆或構造物', 'Wall or structure', '塀・構造物'], type: 'line', seis: true }
  };
  function crestX() { return faceX(0.6); }
  function addLoad(tplKey) {
    const t = LOAD_TPL[tplKey] || LOAD_TPL.bldg, d = intoDir(), xc = crestX();
    const o = { name: L(t.name[0], t.name[1], t.name[2]), type: t.type, on: true, seis: t.seis, q: 10, P: 50, x1: r3(xc), x2: r3(xc + d * 6), x: r3(xc + d * 2) };
    model.loads.push(o);
  }

  /* ---------- retaining walls ---------- */
  function toeX() {
    const g = model.ground; if (g.length < 2) return 0;
    const zs = g.map(p => p[1]), z0 = Math.min(...zs), tol = 1e-3 * (Math.max(...zs) - z0 || 1);
    const xa = g[0][0], xb = g[g.length - 1][0], d = intoDir();
    let best = d > 0 ? xa : xb;
    for (let i = 0; i <= 1000; i++) { const x = xa + (xb - xa) * i / 1000; if (interp(g, x) <= z0 + tol) { if (d > 0 ? x > best : x < best) best = x; } }
    return Math.round(best * 100) / 100;
  }
  /* ---------- retaining walls: external stability (sliding, overturning, bearing) ---------- */
  // required values [normal, seismic]; eccentricity limits as fractions of B (null: not specified by the code)
  const WALL_CODES = {
    wsc: { name: () => L('水土保持技術規範 第 120 條', 'Soil and Water Conservation Technical Regulations Art. 120', '水土保持技術規範 第 120 条'), slide: [1.5, 1.2], ot: [2.0, 1.5], ecc: { soil: 1 / 6, rock: 1 / 4 }, bear: [3.0, 3.0] },
    bldg: { name: () => L('建築物基礎構造設計規範 7.4 節', 'Building Foundation Structure Design Code Sec. 7.4', '建築物基礎構造設計規範 7.4 節'), slide: [1.5, 1.2], ot: [2.0, 1.5], ecc: null, bear: [3.0, 2.0] },
    hwy: { name: () => L('公路橋梁設計規範 6.2.8 節', 'Highway Bridge Design Code Sec. 6.2.8', '公路橋梁設計規範 6.2.8 節'), slide: [1.5, 1.2], ot: [2.0, 1.5], ecc: null, bear: [3.0, 2.0] }
  };
  const WALL_PAR = {
    gravity: { H: 3, B: 2, b: 0.6 },
    cantilever: { H: 5, B: 3.2, tb: 0.5, toe: 0.8, ts1: 0.3, ts2: 0.45 },
    counterfort: { H: 8, B: 5, tb: 0.6, toe: 1, ts1: 0.3, ts2: 0.4, cs: 3, ct: 0.3 }
  };
  const WALL_EXT = { found: 'soil', delta: '', mu: '', bearMode: 'calc', qa: '', drained: false, passive: false, bPhi: '', bC: '', bG: '', fPhi: '', fC: '', fG: '' };
  const wallTypeName = t => t === 'cantilever' ? L('懸臂式', 'Cantilever', '片持ばり式') : t === 'counterfort' ? L('扶壁式', 'Counterfort', '控え壁式') : L('重力式', 'Gravity', '重力式');
  const wallCode = () => WALL_CODES[model.wallCode] || WALL_CODES.wsc;
  /* wall polygon in model coordinates from its parameters (null when the parameters are incomplete) */
  function wallPolyOf(w) {
    const loc = SSA.wallLocal(w); if (!loc) return null;
    const d = intoDir(), p = w.par;
    return loc.P.map(q => [r3(p.x0 + d * q[0]), r3(p.z0 + q[1])]);
  }
  function wallPoly(p) { return wallPolyOf({ type: 'gravity', par: p }) || []; }
  function sanitizeWall(w, i) {
    const t = ['gravity', 'cantilever', 'counterfort'].includes(w.type) ? w.type : 'gravity';
    const par = w.par && typeof w.par === 'object' ? Object.fromEntries(Object.entries(w.par).filter(([, v]) => isFinite(+v) && v !== null && v !== '').map(([k, v]) => [k, +v])) : null;
    const ext = Object.assign({}, WALL_EXT);
    if (w.ext && typeof w.ext === 'object') for (const k of Object.keys(WALL_EXT)) if (w.ext[k] !== undefined) ext[k] = typeof WALL_EXT[k] === 'boolean' ? !!w.ext[k] : w.ext[k] === '' || w.ext[k] === null ? '' : (k === 'found' || k === 'bearMode' ? String(w.ext[k]) : (isFinite(+w.ext[k]) ? +w.ext[k] : ''));
    return {
      name: String(w.name || L_(`擋土牆 ${i + 1}`, `Retaining wall ${i + 1}`, `擁壁 ${i + 1}`)), on: w.on !== false, gamma: +w.gamma > 0 ? +w.gamma : 23.5, type: t,
      poly: (w.poly || []).filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])).map(p => [+p[0], +p[1]]), par, ext
    };
  }
  /* load cases: the enabled check cases, or the current conditions when there are none */
  function wallCases() {
    const S = (model.scenarios || []).filter(s => s.on);
    const kh0 = +model.settings.kh || 0, kv0 = +model.settings.kv || 0;
    if (!S.length) return [{ name: L('目前條件', 'Current', '現在の条件'), m: currentModel(), kh: kh0, kv: kv0, seis: kh0 > 0 }];
    return S.map(s => {
      const miss = scenMissing(s);
      if (miss.length) return { name: s.name, err: L(`請在「檢核」頁填入 ${miss.join('、')}`, `Enter ${miss.join(', ')} on the Check tab`, `「照査」タブで ${miss.join('、')} を入力してください`) };
      const r = scenarioModel(s); if (r.err) return { name: s.name, err: r.err };
      return { name: s.name, m: r.m, kh: s.kh || 0, kv: s.kv || 0, seis: s.kind === 'eq' || (s.kh || 0) > 0 };
    });
  }
  let wallRes = [];   // per wall: { w, i, cases: [{ c, r, chk }] }
  function wallJudge(w, r, seis) {
    const C = wallCode(), k = seis ? 1 : 0, ex = w.ext || WALL_EXT, o = {};
    o.slide = { v: r.FSs, req: C.slide[k], ok: r.FSs >= C.slide[k] };
    o.ot = { v: r.FSo, req: C.ot[k], ok: r.FSo >= C.ot[k] };
    const lim = C.ecc ? C.ecc[ex.found === 'rock' ? 'rock' : 'soil'] : null;
    o.ecc = { v: Math.abs(r.e), lim: lim === null ? null : lim * r.B, ok: !r.out && (lim === null || Math.abs(r.e) <= lim * r.B + 1e-9) };
    if (ex.bearMode === 'qa') {
      const qa = +ex.qa, qe = qa * C.bear[0] / C.bear[k];
      o.bear = { mode: 'qa', v: r.qmax, lim: qe, ok: qa > 0 && !r.out && r.qmax <= qe };
    } else o.bear = { mode: 'calc', v: r.FSb, req: C.bear[k], ok: !r.out && r.FSb >= C.bear[k] };
    o.all = o.slide.ok && o.ot.ok && o.ecc.ok && o.bear.ok;
    return o;
  }
  function computeWalls() {
    wallRes = [];
    const ws = model.walls.map((w, i) => ({ w, i })).filter(q => q.w.on && q.w.par);
    if (!ws.length) return;
    const cases = wallCases();
    for (const { w, i } of ws) {
      const out = { w, i, cases: [] };
      for (const c of cases) {
        if (c.err) { out.cases.push({ c, err: c.err }); continue; }
        let r; try { r = SSA.wallCheck(c.m, w, { kh: c.kh, kv: c.kv, seismic: c.seis }); } catch (e) { r = { ok: false, msg: String(e && e.message || e) }; }
        out.cases.push({ c, r, chk: r.ok ? wallJudge(w, r, c.seis) : null });
      }
      wallRes.push(out);
    }
  }
  /* a small example section for checking a wall on its own */
  function loadWallExample() {
    pushUndo();
    const m = clone(SAMPLE);
    m.ground = [[0, 1], [11.5, 1], [11.7, 6], [40, 6]];
    m.layers = [
      { name: L('回填土', 'Backfill', '裏込め土'), color: '#D8BE8A', gamma: 19, gammaSat: 20, c: 0, phi: 30, bedrock: false, top: null },
      { name: L('基礎土層', 'Foundation soil', '支持層'), color: '#B48462', gamma: 19, gammaSat: 20, c: 5, phi: 35, bedrock: false, top: [[0, 1], [10, 1], [10.001, 0], [40, 0]] },
      { name: L('岩盤', 'Bedrock', '基盤岩'), color: '#8C949A', gamma: 24, gammaSat: 24, c: 200, phi: 40, bedrock: true, top: [[0, -6], [40, -6]] }
    ];
    m.water = [[0, -1], [40, -1]]; m.piezo = []; m.reinf = []; m.loads = [{ name: L('道路車載', 'Traffic', '交通荷重'), type: 'udl', on: true, seis: false, x1: 15, x2: 30, q: 10, q2: null, x: 0, P: 50 }];
    m.zBase = -8; m.trial = [];
    const w = { name: L('懸臂式擋土牆', 'Cantilever wall', '片持ばり式擁壁'), on: true, gamma: 24, type: 'cantilever', par: { x0: 10, z0: 0, H: 6, B: 5.8, tb: 0.6, toe: 1.5, ts1: 0.3, ts2: 0.5 }, ext: Object.assign({}, WALL_EXT, { mu: 0.6 }), poly: [] };
    model = sanitize(Object.assign(m, { walls: [w] }));
    model.walls[0].poly = wallPolyOf(model.walls[0]);
    model.scenarios.forEach(s => { if (s.kind === 'eq' && s.kh === null) s.kh = 0.15; if (s.water === 'raise' && s.dh === null) s.dh = 3; });
    result = null; stale = false; active = 'ground';
    fit(); changed(true);
    status(L('已載入擋土牆範例：6 m 懸臂式擋土牆、水平回填、地表載重與地下水位，底面摩擦係數取 0.6。外部穩定結果顯示於下方，也可按「計算最危險滑動面」做整體穩定。', 'Wall example loaded: a 6 m cantilever wall with level backfill, a surcharge and a water table, with base friction μ = 0.6. External stability is shown below; press “Find critical slip surface” for global stability.', '擁壁の例を読み込みました：高さ 6 m の片持ばり式擁壁、水平な裏込め、上載荷重と地下水位、底面摩擦係数 0.6。外的安定は下に表示されます。全体安定は「臨界すべり面を計算」で求めます。'));
  }
  /* ---------- search-grid guide ---------- */
  function gridInfo() {
    const g = model.ground, s = model.settings;
    if (g.length < 2) return null;
    const x0 = g[0][0], x1 = g[g.length - 1][0], L = x1 - x0;
    let H = 0;
    for (let q = 0; q <= 200; q++) {
      const x = x0 + L * q / 200;
      let prev = interp(g, x), zb = model.zBase;
      model.layers.forEach((Ly, i) => {
        const z = i ? Math.min(prev, Ly.top && Ly.top.length ? interp(Ly.top, x) : prev) : prev;
        if (Ly.bedrock && zb === model.zBase) zb = Math.max(model.zBase, z);
        prev = z;
      });
      H = Math.max(H, interp(g, x) - zb);
    }
    const N = Math.round(s.nCol), M = Math.round(s.nState), nSub = Math.max(1, Math.round(s.nSub));
    const dx = L / Math.max(1, N - 1), dz = H / Math.max(1, M - 4);
    const recN = Math.min(150, Math.max(40, Math.round(L / 1.5) + 1));
    const recM = Math.min(150, Math.max(60, Math.ceil(H / 0.3) + 4));
    const evals = (N - 1) * M * M * nSub;
    const sec = evals * 3.5e-8 * 6;
    return { L, H, N, M, dx, dz, recN, recM, sec, x0, x1 };
  }
  /* ---------- geometry frame ---------- */
  function allPts() {
    const a = [...model.ground, ...model.water];
    model.layers.forEach(L => { if (L.top) a.push(...L.top); });
    model.walls.forEach(w => a.push(...w.poly));
    return a;
  }
  function fit() {
    const pts = allPts();
    if (!pts.length) { bounds = { x0: 0, x1: 100, z0: 0, z1: 50 }; return; }
    let x0 = Math.min(...model.ground.map(p => p[0])), x1 = Math.max(...model.ground.map(p => p[0]));
    let z0 = Math.min(model.zBase, ...pts.map(p => p[1])), z1 = Math.max(...pts.map(p => p[1]));
    const dx = (x1 - x0) || 10, dz = (z1 - z0) || 10;
    bounds = { x0: x0 - dx * 0.03, x1: x1 + dx * 0.03, z0: z0 - dz * 0.04, z1: z1 + dz * 0.16 };
  }
  function setupT() {
    const svg = $('#cv');
    const W = svg.clientWidth || 800, H = svg.clientHeight || 450;
    const pad = { l: 50, r: 14, t: 34, b: 30 };
    const b = bounds, iw = Math.max(50, W - pad.l - pad.r), ih = Math.max(50, H - pad.t - pad.b);
    let sx = iw / (b.x1 - b.x0), sz = ih / (b.z1 - b.z0);
    let ox = pad.l, oy = pad.t + ih;
    if ($('#optEqual').checked) {
      const s = Math.min(sx, sz); sx = sz = s;
      ox = pad.l + (iw - s * (b.x1 - b.x0)) / 2;
      oy = pad.t + ih - (ih - s * (b.z1 - b.z0)) / 2;
    }
    T = {
      W, H, pad, sx, sz,
      X: x => ox + (x - b.x0) * sx, Z: z => oy - (z - b.z0) * sz,
      ix: px => b.x0 + (px - ox) / sx, iz: py => b.z0 + (oy - py) / sz,
      vx0: b.x0 + (pad.l - ox) / sx, vx1: b.x0 + (W - pad.r - ox) / sx,
      vz0: b.z0 + (oy - (H - pad.b)) / sz, vz1: b.z0 + (oy - pad.t) / sz
    };
  }
  function niceStep(range, px) {
    const raw = range / Math.max(2, px / 70);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  const interp = (P, x) => SSA.interp(P, x);

  function currentModel(noReinf, noLoad) {
    return { ground: model.ground, layers: model.layers, water: model.water.length >= 2 ? model.water : [], piezo: model.piezo || [], zBase: model.zBase, settings: model.settings, reinf: noReinf ? [] : model.reinf, walls: noReinf ? [] : model.walls, loads: noLoad ? [] : model.loads, ctrl: model.ctrl };
  }
  const hasLoads = () => model.loads.some(l => l.on && (l.type === 'line' ? l.P : (l.q || l.q2)));
  const hasReinf = () => model.reinf.some(r => r.on && r.L > 0 && (r.Sh > 0 || r.type === 'pile' || r.type === 'geo')) || model.walls.some(w => w.on && w.poly.length >= 3);
  let errors = [];
  const bk = { layer: 'auto', param: 'c', target: 1, curve: true };
  /* ---------- stabilizing pile design: required restraint force and pile checks ---------- */
  let pd = null;   // { res, result }
  const pdValid = () => pd && pd.result === result && !stale;
  let bkRes = null;
  /* ---------- file save (downloads capability, or plain download in the standalone file) ---------- */
  let dlCap = null;
  (async () => { try { if (window.claude && typeof window.claude.use === 'function') dlCap = await window.claude.use('downloads'); } catch (e) { dlCap = null; } })();
  async function saveFile(filename, text, btn) {
    if (typeof text !== 'string') {
      // binary file (Blob)
      if (dlCap) { try { await dlCap.save({ filename, data: text }); status(L(`已下載 ${filename}`, `Downloaded ${filename}`, `${filename} をダウンロードしました`)); return; } catch (e) { if (e && e.code === 'declined') { status(L('已取消下載', 'Download cancelled', 'ダウンロードを取り消しました')); return; } } }
      const url = URL.createObjectURL(text);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      status(L(`已下載 ${filename}`, `Downloaded ${filename}`, `${filename} をダウンロードしました`));
      return;
    }
    if (dlCap) {
      try { await dlCap.save({ filename, data: text }); status(L(`已下載 ${filename}`, `Downloaded ${filename}`, `${filename} をダウンロードしました`)); }
      catch (e) {
        if (e && e.code === 'declined') status(L('已取消下載', 'Download cancelled', 'ダウンロードを取り消しました'));
        else if (e && e.code === 'rate_limited') status(L('下載視窗已開啟，請先完成或關閉它。', 'A download dialog is already open; finish or close it first.', 'ダウンロード画面がすでに開いています。先に完了するか閉じてください。'));
        else { copyText(text, btn); status(L('無法下載檔案，已改為複製內容，請貼到文字編輯器後存檔。', 'Could not download the file, so its content was copied instead. Paste it into a text editor and save.', 'ファイルをダウンロードできなかったため、内容をコピーしました。テキストエディタに貼り付けて保存してください。')); }
      }
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: filename.endsWith('.json') ? 'application/json' : 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      status(L(`已下載 ${filename}（若沒有開始下載，請改用「複製」）`, `Downloaded ${filename} (if nothing happened, use “Copy” instead)`, `${filename} をダウンロードしました（始まらない場合は「コピー」を使ってください）`));
    } catch (e) { copyText(text, btn); }
  }
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

  /* ---------- CSV import ---------- */
  const CSV_DATA = '0,10,6,2,10\n20,10,6,,10.2\n40,20,14,8,16\n55,27,19,,22\n80,28,20,12,24\n';
  const csvFull = () => L('x,地表,風化岩頂面,岩盤頂面,地下水位\n', 'x,ground,weathered rock top,bedrock top,water table\n', 'x,地表,風化岩上面,基盤岩上面,地下水位\n') + CSV_DATA;
  const CSV_GROUND = 'x,z\n0,10\n20,10\n40,20\n55,27\n80,28\n';
  function decodeText(buf) {
    let t;
    try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { try { t = new TextDecoder('big5').decode(buf); } catch (e2) { t = new TextDecoder().decode(buf); } }
    return t.replace(/^\uFEFF/, '');
  }
  function importCSV(text) {
    const rows = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s*[,;\t]\s*|\s+(?=[-\d.])/));
    if (!rows.length) throw new Error(L('檔案是空的', 'the file is empty', 'ファイルが空です'));
    let header = null;
    if (!isFinite(parseFloat(rows[0][0]))) header = rows.shift();
    const data = rows.filter(r => isFinite(parseFloat(r[0])));
    if (data.length < 2) throw new Error(L('至少需要 2 列數值資料', 'at least 2 rows of numbers are needed', '数値の行が 2 行以上必要です'));
    const ncol = Math.max(...data.map(r => r.length), header ? header.length : 0);
    const col = j => data.filter(r => r[j] !== undefined && r[j] !== '' && isFinite(parseFloat(r[j]))).map(r => [parseFloat(r[0]), parseFloat(r[j])]).sort((a, b) => a[0] - b[0]);
    pushUndo();
    let msg;
    if (ncol <= 2) {
      const P = col(1);
      if (P.length < 2) throw new Error(L('x、z 兩欄至少需要 2 個點', 'the x and z columns need at least 2 points', 'x と z の列に 2 点以上必要です'));
      setPts(active, P);
      const d = lineDefs().find(x => x.key === active);
      msg = L(`已匯入 ${P.length} 點到「${d ? d.label : ''}」`, `Imported ${P.length} points into “${d ? d.label : ''}”`, `「${d ? d.label : ''}」に ${P.length} 点を取り込みました`);
    } else {
      const G = col(1);
      if (G.length < 2) throw new Error(L('第 2 欄（地表高程）至少需要 2 個點', 'column 2 (ground elevation) needs at least 2 points', '第 2 列（地表標高）に 2 点以上必要です'));
      model.ground = G;
      let li = 1, nb = 0, nw = 0;
      const pal = ['#D8BE8A', '#B48462', '#8C949A', '#A9B38B', '#C7A1A1', '#9FB4C7'];
      for (let j = 2; j < ncol; j++) {
        const P = col(j), name = header && header[j] ? header[j].trim() : '';
        if (P.length < 2) continue;
        if (/水|water|wt|gwl/i.test(name)) { model.water = P; nw = P.length; continue; }
        if (!model.layers[li]) {
          const nm = (name.replace(/頂面|頂界面|頂|上面|上端|top/gi, '').trim()) || L(`土層 ${li + 1}`, `Layer ${li + 1}`, `地層 ${li + 1}`);
          model.layers.push({ name: nm, color: pal[li % pal.length], gamma: 20, gammaSat: 21, c: 10, phi: 30, bedrock: false, top: P });
        } else model.layers[li].top = P;
        li++; nb++;
      }
      msg = L(`已匯入地表 ${G.length} 點、${nb} 條土層界面${nw ? `、地下水位 ${nw} 點` : ''}`, `Imported ${G.length} ground points, ${nb} layer boundaries${nw ? `, ${nw} water table points` : ''}`, `地表 ${G.length} 点、地層境界 ${nb} 本${nw ? `、地下水位 ${nw} 点` : ''}を取り込みました`);
      if (li < model.layers.length) msg += L(`（第 ${li + 1} 層以下沿用原本的界面）`, ` (layers ${li + 1} and below keep their existing boundaries)`, `（第 ${li + 1} 層以下は既存の境界を使用）`);
    }
    const zs = [...model.ground, ...model.water, ...model.layers.flatMap(L => L.top || [])].map(p => p[1]);
    const zg = Math.min(...model.ground.map(p => p[1]));
    if (!(model.zBase < zg)) { model.zBase = Math.floor(Math.min(...zs)) - 2; msg += L(`，模型底部高程已調為 ${model.zBase} m`, `; model base set to ${model.zBase} m`, `。モデル底面標高を ${model.zBase} m に調整しました`); }
    result = null; fit(); changed(true);
    status(msg);
  }

  function copyText(t, btn) {
    const done = () => { if (btn) { const o = btn.textContent; btn.textContent = L('已複製', 'Copied', 'コピーしました'); setTimeout(() => btn.textContent = o, 1400); } };
    const fb = () => { const f = $('#fallback'); f.value = t; f.classList.add('show'); f.focus(); f.select(); status(L('無法直接寫入剪貼簿，已選取下方文字，請按 Ctrl+C 複製。', 'Could not write to the clipboard. The text below is selected; press Ctrl+C to copy.', 'クリップボードに書き込めませんでした。下のテキストを選択したので Ctrl+C でコピーしてください。')); };
    try { navigator.clipboard.writeText(t).then(done, fb); } catch (e) { fb(); }
  }

  function importText(t) {
    try {
      const m = sanitize(JSON.parse(t));
      pushUndo(); model = m; active = 'ground'; result = null; fit(); changed(true); status(L('已載入模型', 'Model loaded', 'モデルを読み込みました')); run();
    } catch (e) { status(L('載入失敗：JSON 格式不正確或缺少地表線、土層資料。', 'Load failed: the JSON is invalid or lacks ground line or layer data.', '読み込みに失敗しました：JSON の形式が正しくないか、地表線・地層のデータがありません。')); }
  }

  /* ---------- usage counter (live GitHub Pages site only) ---------- */
  async function visitCounter() {
    const el = $('#visitCount');
    if (!el || !/(^|\.)github\.io$/i.test(location.hostname)) return;
    const base = 'https://abacus.jasoncameron.dev', ns = 'cychen59.github.io';
    const kUser = 'ssa-slope-stability-visitors', kView = 'ssa-slope-stability-views';
    let first = true;
    try { first = !localStorage.getItem('ssa-visited'); } catch (e) { }
    const get = url => fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    const [u, v] = await Promise.all([get(`${base}/${first ? 'hit' : 'get'}/${ns}/${kUser}`), get(`${base}/hit/${ns}/${kView}`)]);
    if (u && first) { try { localStorage.setItem('ssa-visited', String(Date.now())); } catch (e) { } }
    counts = { u: u && isFinite(u.value) ? u.value : null, v: v && isFinite(v.value) ? v.value : null };
    renderCounter();
  }
  let counts = null;
  /* ===================== slip surface control points ===================== */
  function defaultCtrl() { return { on: false, pts: [], toe: { on: false, x1: null, x2: null }, crest: { on: false, x1: null, x2: null } }; }
  function sanitizeCtrl(c) {
    const num = v => (v === null || v === undefined || v === '' || !isFinite(+v)) ? null : +v;
    if (!c || typeof c !== 'object') return defaultCtrl();
    const rg = o => ({ on: !!(o && o.on), x1: num(o && o.x1), x2: num(o && o.x2) });
    return {
      on: !!c.on,
      pts: (Array.isArray(c.pts) ? c.pts : []).filter(p => p && typeof p === 'object').map((p, i) => ({ name: String(p.name || `BH-${i + 1}`), on: p.on !== false, x: num(p.x), depth: num(p.depth), tol: num(p.tol) ?? 0.5 })),
      toe: rg(c.toe), crest: rg(c.crest)
    };
  }
  const ctrlZ = p => (isFinite(p.x) && isFinite(p.depth) && model.ground.length >= 2) ? interp(model.ground, p.x) - p.depth : NaN;
  // a specified slip surface through the toe range, the control points and the crest range (for trial and back analysis)
  function ctrlToTrial() {
    const C = model.ctrl, g = model.ground;
    const pts = C.pts.filter(p => p.on && isFinite(ctrlZ(p))).map(p => [p.x, ctrlZ(p)]);
    if (!pts.length) { status(L('請先輸入至少一個控制點的位置與深度。', 'Enter the position and depth of at least one control point first.', '少なくとも 1 つの制御点の位置と深さを入力してください。')); return; }
    const facesLeft = g[0][1] <= g[g.length - 1][1];      // toe on the left
    const mid = r => r && r.on && isFinite(r.x1) && isFinite(r.x2) ? (r.x1 + r.x2) / 2 : null;
    let xt = mid(C.toe), xc = mid(C.crest);
    if ((xt === null || xc === null) && result && result.ok) { const S = result.slip; const a = S[0][0], b = S[S.length - 1][0]; if (xt === null) xt = facesLeft ? a : b; if (xc === null) xc = facesLeft ? b : a; }
    if (xt === null || xc === null) { status(L('請設定坡趾出口與坡頂入口範圍，或先執行一次搜尋，以決定滑動面兩端的位置。', 'Set the toe and crest ranges, or run a search first, to fix the ends of the surface.', '末端と頭部の範囲を設定するか、先に探索を実行して、すべり面の両端を決めてください。')); return; }
    const P = [[xt, interp(g, xt)], ...pts, [xc, interp(g, xc)]].sort((a, b) => a[0] - b[0]).map(p => [r3(p[0]), r3(p[1])]);
    pushUndo(); model.trial = P; active = 'trial';
    $('#tab-geo').click(); changed(false); renderLines(); renderCoords();
    status(L('已以控制點建立指定滑動面（直線連接），可再拖曳修改，然後試算或反算。', 'A specified surface was created through the control points (straight segments). Edit it if needed, then check it or run a back analysis.', '制御点を通る指定すべり面（直線で接続）を作成しました。必要に応じて修正し、試算または逆算してください。'));
  }
  /* ===================== multi-scenario check ===================== */
  function defaultScenarios() {
    // required Fs defaults: 水土保持技術規範 Art. 73, permanent slopes (平時 1.5, 暴雨 1.2, 地震 1.1)
    const P = FS_PRESETS.wsc_perm;
    const sc = (nm, kind, water, kh) => ({ name: nm, kind, on: true, water, dh: null, kh, kv: 0, Freq: P.v[kind], loads: true, reinf: true, tcWet: kind === 'rain' });
    return [sc(L('常時', 'Normal', '常時'), 'normal', 'base', 0), sc(L('暴雨', 'Heavy rain', '豪雨時'), 'rain', 'raise', 0), sc(L('地震', 'Earthquake', '地震時'), 'eq', 'base', null)];
  }
  const kindName = k => k === 'normal' ? L('常時', 'Normal', '常時') : k === 'rain' ? L('暴雨／高水位', 'Heavy rain / high water', '豪雨時／高水位') : k === 'eq' ? L('地震', 'Earthquake', '地震時') : L('其他', 'Other', 'その他');
  const waterShort0 = sc => sc.water === 'none' ? L('無', 'dry', 'なし') : sc.water === 'ground' ? L('地表', 'ground', '地表面') : sc.water === 'raise' ? (sc.dh === null ? '+Δh' : `+${fmt(sc.dh, 1)} m`) : L('剖面', 'profile', '断面');
  const waterShort = sc => waterShort0(sc) + (model.settings.tcOn && sc.tcWet ? L('・裂縫水', ' · crack', '・亀裂水') : '');
  function sanitizeScen(a) {
    if (!Array.isArray(a)) return defaultScenarios();
    const num = v => (v === null || v === undefined || v === '' || !isFinite(+v)) ? null : +v;
    return a.filter(s => s && typeof s === 'object').map((s, i) => {
      const kind = ['normal', 'rain', 'eq', 'custom'].includes(s.kind) ? s.kind : ['常時', 'Normal'].includes(s.name) ? 'normal' : ['暴雨', 'Heavy rain', '豪雨時'].includes(s.name) ? 'rain' : ['地震', 'Earthquake', '地震時'].includes(s.name) ? 'eq' : 'custom';
      return {
        name: String(s.name || L_(`情境 ${i + 1}`, `Case ${i + 1}`, `ケース ${i + 1}`)), on: s.on !== false, kind,
        water: ['base', 'none', 'raise', 'ground'].includes(s.water) ? s.water : 'base',
        dh: num(s.dh), kh: num(s.kh), kv: num(s.kv), Freq: num(s.Freq), loads: s.loads !== false, reinf: s.reinf !== false,
        tcWet: s.tcWet === undefined ? kind === 'rain' : !!s.tcWet
      };
    });
  }
  let scen = null;            // { items: [{ sc, m, r, msg, Fj }], stale, method, useF0, ms }
  const waterName = w => w === 'none' ? L('無地下水', 'Dry', '地下水なし') : w === 'raise' ? L('剖面水位上升 Δh', 'Water table raised by Δh', '断面の水位を Δh 上昇') : w === 'ground' ? L('水位達地表', 'Water table at ground', '水位が地表面') : L('使用剖面水位', 'Water table of the profile', '断面の地下水位');
  // safety factor used for judgement: rigorous method, or Janbu (f0·Fs when "judge by corrected" is set)
  const judgeF = (r, s) => { const g = rigOf(r); return g && g.ok ? g.F : (s.useF0 ? r.Fc : r.F); };
  function scenMissing(sc) {
    const miss = [];
    if (sc.kh === null) miss.push('kh');
    if (sc.kv === null) miss.push('kv');
    if (sc.water === 'raise' && sc.dh === null) miss.push('Δh');
    return miss;
  }
  /* a water line raised by dh, not above the ground; parts already above the ground (ponded or artesian) are kept */
  function raiseLine(w, g, dh) {
    const xs = [...new Set([...w.map(p => p[0]), ...g.map(p => p[0]).filter(x => x > w[0][0] && x < w[w.length - 1][0])])].sort((a, b) => a - b);
    const f = x => interp(w, x) + dh - interp(g, x), f0 = x => interp(w, x) - interp(g, x), pts = [];
    const zAt = x => f0(x) > 0 ? interp(w, x) : Math.min(interp(w, x) + dh, interp(g, x));
    // also add the points where the raised and the original line meet the ground, so the clipped line stays exact
    for (let k = 0; k < xs.length; k++) {
      if (k) for (const h of [f, f0]) { const a = xs[k - 1], b = xs[k], fa = h(a), fb = h(b); if ((fa > 0) !== (fb > 0) && Math.abs(fb - fa) > 1e-12) { const x = a + (b - a) * fa / (fa - fb); pts.push([x, zAt(x)]); } }
      const x = xs[k]; pts.push([x, zAt(x)]);
    }
    return pts.sort((a, b) => a[0] - b[0]).filter((p, i, A) => !i || p[0] - A[i - 1][0] > 1e-9);
  }
  const usedPiezo = m => (m.piezo || []).some((q, k) => q.pts.length >= 2 && m.layers.some(Ly => !Ly.bedrock && Ly.pore && Ly.pore.type === 'piezo' && Ly.pore.line === k));
  function scenarioModel(sc) {
    const m = clone(currentModel(!sc.reinf, !sc.loads));
    m.settings = Object.assign({}, m.settings, { kh: sc.kh || 0, kv: sc.kv || 0 });
    if (m.settings.tcOn) m.settings.tcWater = !!sc.tcWet;
    const g = m.ground;
    if (sc.water === 'none') { m.water = []; m.layers.forEach(Ly => { Ly.pore = { type: 'dry' }; }); }
    else if (sc.water === 'ground') { m.water = clone(g); (m.piezo || []).forEach(q => { if (q.pts.length >= 2) q.pts = raiseLine(q.pts, g, 1e6); }); }
    else if (sc.water === 'raise') {
      if (model.water.length < 2 && !usedPiezo(model)) return { err: L('剖面沒有地下水位線或水壓線，無法使用「水位上升」。', 'The profile has no water table or piezometric line, so “raised” cannot be used.', '断面に地下水位線も水頭線もないため「水位上昇」は使えません。') };
      if (model.water.length >= 2) m.water = raiseLine(model.water, g, sc.dh);
      (m.piezo || []).forEach(q => { if (q.pts.length >= 2) q.pts = raiseLine(q.pts, g, sc.dh); });
    }
    return { m };
  }
  const verdict = it => {
    if (!it.r || !it.r.ok) return { cls: 'stale', txt: L('未計算', 'Not computed', '未計算') };
    if (it.sc.Freq === null) return { cls: 'stale', txt: L('未填要求值', 'No required value', '所要値未入力') };
    return it.Fj >= it.sc.Freq ? { cls: 'ok', txt: L('符合', 'OK', '満足') } : { cls: 'crit', txt: L('不符合', 'NG', '不満足') };
  };
  function scenTableRows(items) {
    return items.map(it => {
      const v = verdict(it), ok = it.r && it.r.ok;
      return { name: it.sc.name, water: waterName(it.sc.water) + (it.sc.water === 'raise' && it.sc.dh !== null ? ` ${fmt(it.sc.dh, 2)} m` : '') + (model.settings.tcOn ? (it.sc.tcWet ? L('，張力裂縫充水', ', water-filled crack', '、引張亀裂に水') : L('，張力裂縫乾', ', dry crack', '、引張亀裂は乾燥')) : ''), kh: it.sc.kh, kv: it.sc.kv,
        F: ok ? it.Fj : null, Freq: it.sc.Freq, v, msg: it.msg || '', area: ok ? it.r.area : null, it };
    });
  }
  /* ===================== verification report: the benchmark problems re-run with this version ===================== */
  const VDEF = { kh: 0, kv: 0, gw: 9.81, cos2: false, nCol: 100, nState: 120, nSub: 4, dmin: 1, convex: true, noBoundary: true, tol: 0.0001, maxIter: 30, F0: 2, Freq: 1.5, useF0: false, f0type: 'janbu', reinfMode: 'active', method: 'mp', optimize: true };
  const vM = o => Object.assign({ water: [], reinf: [], walls: [], loads: [], zBase: 0 }, o, { settings: Object.assign({}, VDEF, o.settings || {}) });
  const vL = (name, c, phi, g, top, extra) => Object.assign({ name, c, phi, gamma: g, gammaSat: g, bedrock: false, top }, extra || {});
  const vCirc = (xc, yc, R, xa, xb, n = 2000) => { const P = []; for (let i = 0; i <= n; i++) { const x = xa + (xb - xa) * i / n, d = R * R - (x - xc) ** 2; if (d >= 0) P.push([x, yc - Math.sqrt(d)]); } return P; };
  const tick = () => new Promise(r => setTimeout(r, 0));
  async function vSolve(m) { const it = SSA.solve(m); let q; do { q = it.next(); await tick(); } while (!q.done); return q.value; }
  const EX = { lo: -1e-6, hi: 1e-6 }, rel = (a, b) => ({ lo: -(b === undefined ? a : a), hi: b === undefined ? a : b });
  const M3 = r => [['Janbu', r.F], ['Spencer', r.rig.spencer.F], ['M–P', r.rig.mp.F]];

  /* benchmark list: each case returns rows { item, ref, val, tol: {lo, hi} (relative), src } */
  function verifyCases() {
    const L3 = (z, e, j) => L(z, e, j);
    const out = [];
    const add = (grp, name, run) => out.push({ grp, name, run });
    // ---- 1. closed-form planar slide
    const G1 = L3('平面滑動閉合解', 'Closed-form planar slide', '平面すべりの閉じた解');
    {
      const g = [[0, 0], [10, 0], [30, 15], [60, 15]], slip = [[10, 0], [34, 15]], c = 5, tp = Math.tan(Math.PI / 6), W = 600;
      const be = Math.atan2(15, 24), Lp = Math.hypot(24, 15), cb = Math.cos(be), sb = Math.sin(be), th = 20 * Math.PI / 180, T = 100;
      const anchor = { type: 'anchor', on: true, x: 20, z: 7.5, theta: 20, L: 20, Lfree: 6, Sh: 2, Tt: 500, q: 100, P: 200 };
      const load = [{ type: 'udl', x1: 30, x2: 34, q: 20, q2: 20, seis: true }];
      const cs = [
        [L3('無補強', 'No reinforcement', '補強なし'), {}, () => (c * Lp + W * cb * tp) / (W * sb)],
        [L3('地錨 T = 100 kN/m，主動法', 'Anchor T = 100 kN/m, active', 'アンカー T = 100 kN/m、主働法'), { reinf: [anchor] }, () => (c * Lp + (W * cb + T * Math.sin(th + be)) * tp) / (W * sb - T * Math.cos(th + be))],
        [L3('地錨 T = 100 kN/m，被動法', 'Anchor T = 100 kN/m, passive', 'アンカー T = 100 kN/m、受働法'), { reinf: [anchor], settings: { reinfMode: 'passive' } }, () => (c * Lp + (W * cb + T * Math.sin(th + be)) * tp + T * Math.cos(th + be)) / (W * sb)],
        ['kH = 0.15', { settings: { kh: 0.15 } }, () => (c * Lp + (W * cb - 0.15 * W * sb) * tp) / (W * sb + 0.15 * W * cb)],
        [L3('坡頂載重 q = 20 kPa', 'Crest load q = 20 kPa', '頭部荷重 q = 20 kPa'), { loads: load }, () => { const Wv = W + 80; return (c * Lp + Wv * cb * tp) / (Wv * sb); }],
        [L3('載重＋kH = 0.15', 'Load + kH = 0.15', '荷重＋kH = 0.15'), { loads: load, settings: { kh: 0.15 } }, () => { const Wv = W + 80; return (c * Lp + (Wv * cb - 0.15 * Wv * sb) * tp) / (Wv * sb + 0.15 * Wv * cb); }],
        [L3('地下水位（靜水壓）', 'Water table (hydrostatic)', '地下水位（静水圧）'), { water: [[0, 0], [10, 0], [30, 13.75], [34, 15], [60, 15]] }, () => { const Ul = 9.81 * 15 / cb; return (c * Lp + (W * cb - Ul) * tp) / (W * sb); }],
        [L3('坡外積水深 5 m', 'Ponded water 5 m deep', '湛水深 5 m'), { water: [[0, 5], [60, 5]] }, () => { const hw = 5, Fh = 0.5 * 9.81 * hw * hw, xf = 10 + hw / 0.75, Fv = 9.81 * (hw * (xf - 10) - 0.75 * (xf - 10) ** 2 / 2), U = 9.81 * 0.5 * hw * Math.hypot(8, 5); const N = (W + Fv) * cb + Fh * sb, D = (W + Fv) * sb - Fh * cb; return (c * Lp + (N - U) * tp) / D; }],
        [L3('張力裂縫深 2 m，乾', 'Tension crack 2 m, dry', '引張亀裂 2 m、乾燥'), { settings: { tcOn: true, tcMode: 'manual', tcDepth: 2, tcWater: false } }, () => { const xc = 10 + 13 / 0.625, Wc = 20 * (0.5 * 20 * 15 + 15 * (xc - 30) - 0.5 * (xc - 10) * 13 + 0 * 0) , Lb = Math.hypot(xc - 10, 13); return null; }],
      ];
      // tension crack closed forms are built like the others but need the cut wedge area
      const area = P => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
      const crackCF = wet => { const xc = 10 + 13 / 0.625, P = [[10, 0], [30, 15], [xc, 15], [xc, 13]], Wc = 20 * area(P), Lb = Math.hypot(xc - 10, 13), V = wet ? 0.5 * 9.81 * 4 : 0, n = [-sb, cb], t = [cb, sb], f = [-V, -Wc]; const N = -(f[0] * n[0] + f[1] * n[1]), D = -(f[0] * t[0] + f[1] * t[1]); return (c * Lb + N * tp) / D; };
      cs.pop();
      cs.push([L3('張力裂縫深 2 m，乾', 'Tension crack 2 m, dry', '引張亀裂 2 m、乾燥'), { settings: { tcOn: true, tcMode: 'manual', tcDepth: 2, tcWater: false } }, () => crackCF(false)]);
      cs.push([L3('張力裂縫深 2 m，充水', 'Tension crack 2 m, water-filled', '引張亀裂 2 m、水あり'), { settings: { tcOn: true, tcMode: 'manual', tcDepth: 2, tcWater: true } }, () => crackCF(true)]);
      for (const ru of [0.2, 0.4]) cs.push([`r<sub>u</sub> = ${ru}`.replace(/<\/?sub>/g, ''), { pore: { type: 'ru', ru } }, () => (c * Lp + (W * cb - ru * W / cb) * tp) / (W * sb)]);
      for (const [name, o, cf] of cs) add(G1, name, async () => {
        const lay = [vL('s', c, 30, 20, null, o.pore ? { pore: o.pore } : {})];
        const r = SSA.evaluate(vM(Object.assign({ ground: g, zBase: -10, layers: lay }, o)), slip, 400);
        const ref = cf(); return M3(r).map(([k, v]) => ({ item: k, ref, val: v, tol: EX, src: L3('閉合解', 'closed form', '閉じた解') }));
      });
    }
    // ---- 2. Fredlund and Krahn (1977), specified circle
    const G2 = L3('Fredlund and Krahn（1977）指定圓弧', 'Fredlund and Krahn (1977), specified circle', 'Fredlund and Krahn（1977）指定円弧');
    {
      const FKg = [[0, 60], [60, 60], [140, 20], [170, 20]], FKc = vCirc(120, 90, 80, 40, 200);
      const fk = (weak, wt, pore) => vM({ ground: FKg, zBase: 0, settings: { gw: 62.4 }, water: wt ? [[0, 40], [140, 20], [170, 20]] : [],
        layers: weak ? [vL('soil', 600, 20, 120, null, { pore }), vL('weak', 0, 10, 120, [[0, 16.6], [170, 16.6]], { pore }), vL('rock', 0, 45, 120, [[0, 16.5], [170, 16.5]], { bedrock: true })] : [vL('soil', 600, 20, 120, null, { pore })] });
      const surf = weak => weak ? FKc.map(([x, z]) => [x, Math.max(z, 16.5)]) : FKc;
      const ru = { type: 'ru', ru: 0.25 };
      const cs = [
        [L3('均質、乾燥', 'Homogeneous, dry', '均質、乾燥'), false, false, null, 2.075, 2.075],
        [L3('均質、r<sub>u</sub> = 0.25', 'Homogeneous, ru = 0.25', '均質、ru = 0.25').replace(/<\/?sub>/g, ''), false, false, ru, 1.761, 1.764],
        [L3('均質、地下水位', 'Homogeneous, water table', '均質、地下水位'), false, true, null, 1.830, 1.832],
        [L3('薄弱夾層、乾燥', 'Weak seam, dry', '弱層、乾燥'), true, false, null, 1.373, 1.370],
        [L3('薄弱夾層、ru = 0.25', 'Weak seam, ru = 0.25', '弱層、ru = 0.25'), true, false, ru, 1.118, 1.118],
        [L3('薄弱夾層、地下水位', 'Weak seam, water table', '弱層、地下水位'), true, true, null, 1.245, 1.245]
      ];
      for (const [name, weak, wt, pore, rs, rm] of cs) add(G2, name, async () => {
        const r = SSA.evaluate(fk(weak, wt, pore), surf(weak));
        return [{ item: 'Spencer', ref: rs, val: r.rig.spencer.F, tol: rel(0.02), src: 'Fredlund and Krahn (1977)' }, { item: 'M–P', ref: rm, val: r.rig.mp.F, tol: rel(0.02), src: 'Fredlund and Krahn (1977)' }];
      });
    }
    add(G2, L3('均質、乾燥（以圓心與半徑產生圓弧）', 'Homogeneous, dry (circle generated from centre and radius)', '均質、乾燥（中心と半径から円弧を作成）'), async () => {
      const FKg = [[0, 60], [60, 60], [140, 20], [170, 20]];
      const r = SSA.evaluate(vM({ ground: FKg, zBase: 0, settings: { gw: 62.4 }, layers: [vL('soil', 600, 20, 120, null)] }), genArc(120, 90, 80, FKg));
      return [{ item: 'Spencer', ref: 2.075, val: r.rig.spencer.F, tol: rel(0.02), src: 'Fredlund and Krahn (1977)' }, { item: 'M–P', ref: 2.075, val: r.rig.mp.F, tol: rel(0.02), src: 'Fredlund and Krahn (1977)' }];
    });
    const AWg = [[20, 27.75], [43, 27.75], [67.5, 40], [84, 40]];
    const aw = o => vM(Object.assign({ ground: AWg, zBase: 20, layers: [vL('soil', 28.5, 20, 18.84, null), vL('weak', 0, 10, 18.84, [[20, 27], [84, 27]]), vL('soil2', 28.5, 20, 18.84, [[20, 26.5], [84, 26.5]])], water: [[20, 26.5], [84, 26.5]] }, o));
    add(L3('ACADS 指定非圓弧滑動面', 'ACADS specified non-circular surface', 'ACADS 指定非円弧すべり面'), 'ACADS 3(b)', async () => {
      const r = SSA.evaluate(aw({}), [[41.85, 27.75], [44, 26.5], [63.5, 27], [73.31, 40]]);
      return [{ item: 'Spencer', ref: 1.277, val: r.rig.spencer.F, tol: rel(0.02), src: 'Slide2' }, { item: 'M–P', ref: 1.261, val: r.rig.mp.F, tol: rel(0.02), src: 'SLOPE/W' }];
    });
    // ---- 4. searches (non-circular, locally optimised; may be below circular references)
    const G4 = L3('ACADS 臨界滑動面搜尋（非圓弧）', 'ACADS critical surface search (non-circular)', 'ACADS 臨界すべり面探索（非円弧）');
    {
      const A1 = [[20, 25], [30, 25], [50, 35], [70, 35]];
      const a1 = o => vM(Object.assign({ ground: A1, zBase: 20, layers: [vL('s', 3, 19.6, 20, null)] }, o));
      const a1c = o => vM(Object.assign({ ground: A1, zBase: 20, layers: [vL('s1', 0, 38, 19.5, null), vL('s2', 5.3, 23, 19.5, [[20, 25], [30, 25], [40, 27], [50, 29], [54, 31], [70, 31]]), vL('s3', 7.2, 20, 19.5, [[20, 25], [30, 25], [40, 27], [50, 29], [52, 24], [70, 24]])] }, o));
      const SR = { lo: -0.06, hi: 0.02 };
      const cs = [['ACADS 1(a)', s => a1(s), 1.00], ['ACADS 1(c)', s => a1c(s), 1.39], ['ACADS 1(d) kH = 0.15', s => a1c(Object.assign(s, {})), 1.00], ['ACADS 3(a)', s => aw(s), 1.24]];
      for (const [name, mk, ref] of cs) add(G4, name, async () => {
        const rows = [];
        for (const meth of ['spencer', 'mp']) {
          const set = { settings: { method: meth, kh: name.includes('1(d)') ? 0.15 : 0 } };
          const r = await vSolve(mk(set));
          rows.push({ item: meth === 'spencer' ? 'Spencer' : 'M–P', ref, val: r.ok ? r.rig[meth].F : NaN, tol: SR, src: L3('ACADS 參考解（Giam and Donald, 1989）', 'ACADS referee (Giam and Donald, 1989)', 'ACADS 参考解（Giam and Donald, 1989）') });
        }
        return rows;
      });
    }
    // ---- 5. ponded water and tension cracks
    const G5 = L3('坡外積水與張力裂縫', 'Ponded water and tension cracks', '斜面外の湛水と引張亀裂');
    {
      const A1 = [[20, 25], [30, 25], [50, 35], [70, 35]];
      const sub = o => vM(Object.assign({ ground: A1, zBase: 20, layers: [vL('s', 3, 19.6, 20, null)], water: [[20, 40], [70, 40]] }, o));
      const dry = o => vM(Object.assign({ ground: A1, zBase: 20, layers: [vL('s', 3, 19.6, 20 - 9.81, null)] }, o));
      const C = vCirc(30, 53, 28, 2, 58, 600);
      add(G5, L3('完全淹沒＝浮單位重（指定圓弧）', 'Submerged = buoyant weight (specified circle)', '完全水没＝水中重量（指定円弧）'), async () => {
        const a = SSA.evaluate(sub({}), C), b = SSA.evaluate(dry({}), C);
        return M3(a).map(([k, v], i) => ({ item: k, ref: M3(b)[i][1], val: v, tol: i ? rel(0.001) : EX, src: L3('浮單位重計算', 'buoyant-weight run', '水中重量の計算') }));
      });
      add(G5, L3('完全淹沒＝浮單位重（DP 搜尋，簡易 Janbu）', 'Submerged = buoyant weight (DP search, simplified Janbu)', '完全水没＝水中重量（DP 探索、簡易 Janbu）'), async () => {
        const a = await vSolve(sub({ settings: { method: 'janbu' } })), b = await vSolve(dry({ settings: { method: 'janbu' } }));
        return [{ item: 'Janbu', ref: b.F, val: a.F, tol: rel(0.001), src: L3('浮單位重計算', 'buoyant-weight run', '水中重量の計算') }];
      });
      add(G5, L3('ACADS 1(b)，充水張力裂縫（非圓弧搜尋）', 'ACADS 1(b), water-filled crack (non-circular search)', 'ACADS 1(b)、水あり引張亀裂（非円弧探索）'), async () => {
        const rows = [];
        for (const meth of ['spencer', 'mp']) {
          const r = await vSolve(vM({ ground: A1, zBase: 20, layers: [vL('s', 32, 10, 20, null)], settings: { method: meth, tcOn: true, tcMode: 'auto', tcWater: true } }));
          rows.push({ item: meth === 'spencer' ? 'Spencer' : 'M–P', ref: 1.592, val: r.ok ? r.rig[meth].F : NaN, tol: { lo: -0.06, hi: 0.02 }, src: 'Slide2' });
        }
        return rows;
      });
    }
    // ---- 6. piezometric lines
    add(L3('分層水壓線', 'Piezometric lines per layer', '地層別の水頭線'), L3('水壓線與地下水位線位置相同', 'Piezometric line at the water table position', '水頭線が地下水位線と同じ位置'), async () => {
      const A1 = [[20, 25], [30, 25], [50, 35], [70, 35]], wt = [[20, 23], [40, 26], [70, 31]], C = vCirc(30, 53, 28, 2, 58, 600);
      const a = SSA.evaluate(vM({ ground: A1, zBase: 20, layers: [vL('s', 3, 19.6, 20, null)], water: wt }), C);
      const b = SSA.evaluate(vM({ ground: A1, zBase: 20, layers: [vL('s', 3, 19.6, 20, null, { pore: { type: 'piezo', line: 0 } })], piezo: [{ name: 'p', pts: wt }] }), C);
      return M3(b).map(([k, v], i) => ({ item: k, ref: M3(a)[i][1], val: v, tol: EX, src: L3('地下水位線計算', 'water-table run', '地下水位線の計算') }));
    });
    // ---- 7. reinforcement members
    const G7 = L3('抑止樁、微型樁與地工合成材', 'Stabilizing piles, micropiles and geosynthetics', '抑止杭、マイクロパイル、ジオシンセティックス');
    {
      const g = [[0, 0], [10, 0], [30, 15], [60, 15]], slip = [[10, 0], [34, 15]], c = 5, tp = Math.tan(Math.PI / 6), W = 600;
      const be = Math.atan2(15, 24), Lp = Math.hypot(24, 15), cb = Math.cos(be), sb = Math.sin(be), t = [cb, sb], nu = [-sb, cb], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
      const ev = o => SSA.evaluate(vM(Object.assign({ ground: g, zBase: -10, layers: [vL('s', c, 30, 20, null), vL('r', 200, 40, 24, [[0, -5], [60, -5]], { bedrock: true })] }, o)), slip, 400);
      const gen = f => (c * Lp + (W * cb - dot(f, nu)) * tp + dot(f, t)) / (W * sb), genA = f => (c * Lp + (W * cb - dot(f, nu)) * tp) / (W * sb - dot(f, t));
      const rows = (r, ref, tol) => M3(r).map(([k, v]) => ({ item: k, ref, val: v, tol: tol || EX, src: L3('閉合解', 'closed form', '閉じた解') }));
      const pile = { type: 'pile', on: true, x: 22, L: 8, D: 2, N: 1, Do: 318.5, t: 10.3, grade: 'SKK490', term: 'long', E0m: 20000, E0b: 80000, aE: 1, ptype: 'wedge', load: 'tri', kEmb: 1.5, FSy: 2, a0: 2 };
      add(G7, L3('楔形樁（容量由程式計算）', 'Wedge pile (capacity from the program)', 'くさび杭（耐力はプログラムで計算）'), async () => { const r = ev({ reinf: [pile] }), PR = r.members[0].H / (2 * cb); return rows(r, gen([PR * cb, PR * sb])); });
      add(G7, L3('懸臂樁', 'Restraint pile', '抑え杭'), async () => { const r = ev({ reinf: [Object.assign({}, pile, { ptype: 'restrain' })] }), PR = r.members[0].H / (2 * cb); return rows(r, gen([PR * cb, PR * sb])); });
      const mpF = (thd, x, z) => { const th = thd * Math.PI / 180, ax = [Math.cos(th), -Math.sin(th)], s0 = (z - 0.625 * (x - 10)) / (Math.sin(th) + 0.625 * Math.cos(th)), Na = Math.min(40 * (10 - s0), 300), sg = dot(ax, t) >= 0 ? 1 : -1, px = [-ax[1], ax[0]], sp = dot(px, t) >= 0 ? 1 : -1; return [(sg * Na * ax[0] + sp * 30 * px[0]) / 1.5, (sg * Na * ax[1] + sp * 30 * px[1]) / 1.5]; };
      for (const thd of [70, 110]) add(G7, L3(`微型樁 θ = ${thd}°`, `Micropile θ = ${thd}°`, `マイクロパイル θ = ${thd}°`), async () => rows(ev({ reinf: [{ type: 'mpile', on: true, x: 20, z: 7.5, theta: thd, L: 10, Sh: 1.5, Tt: 300, q: 40, Va: 30 }] }), gen(mpF(thd, 20, 7.5))));
      const geo = { type: 'geo', on: true, kind: 'grid', x: 10 + 4 / 0.75, z: 4, L: 12, Tult: 60, rfID: 1.2, rfCR: 1.5, rfD: 1.1, Ci: 0.8, aS: 0.8, fsPo: 1.5, face: true, dir: 'h' }, Tal = 60 / (1.2 * 1.5 * 1.1);
      add(G7, L3('地工格網，主動', 'Geogrid, active', 'ジオグリッド、主働'), async () => rows(ev({ reinf: [geo], settings: { reinfMode: 'active' } }), genA([Tal, 0])));
      add(G7, L3('地工格網，被動', 'Geogrid, passive', 'ジオグリッド、受働'), async () => rows(ev({ reinf: [geo], settings: { reinfMode: 'passive' } }), gen([Tal, 0])));
      add(G7, L3('地工格網，沿滑動面', 'Geogrid, along slip surface', 'ジオグリッド、すべり面方向'), async () => rows(ev({ reinf: [Object.assign({}, geo, { dir: 't' })], settings: { reinfMode: 'passive' } }), gen([Tal * cb, Tal * sb])));
      add(G7, L3('地工格網，拉拔控制', 'Geogrid, pullout governs', 'ジオグリッド、引抜きで決定'), async () => {
        const xa = 10 + 4 / 0.625, xb = geo.x + 12, I = 20 * ((0.375 * xb * xb - 11.5 * xb) - (0.375 * xa * xa - 11.5 * xa)), Tpo = 2 * 0.8 * tp * 0.8 * I / 1.5;
        return rows(ev({ reinf: [Object.assign({}, geo, { Tult: 1e5 })], settings: { reinfMode: 'passive' } }), gen([Tpo, 0]), rel(1e-4));
      });
      add(G7, L3('鋼管杭計算例（楔形樁）', 'Steel pipe pile example (wedge pile)', '鋼管杭の計算例（くさび杭）'), async () => {
        const p = { type: 'pile', on: true, x: 20, L: 11.5, D: 2, N: 1, Do: 300, t: 10, grade: 'SKK490', term: 'long', E0m: 22400, E0b: 42000, aE: 1, ptype: 'wedge', load: 'tri', kEmb: 1.5, FSy: 2, a0: 2 };
        const ctx = SSA._rig.prepare(vM({ ground: [[0, 10], [40, 10]], zBase: -20, layers: [vL('move', 50, 25, 18, null), vL('base', 50, 25, 18, [[0, 5], [40, 5]])], reinf: [p] }));
        const o = SSA.pileCheck(ctx.M, ctx.M.reinf[0], 111.11, 10 * Math.PI / 180, 5), T1 = rel(0.001), src = L3('鋼管杭設計軟體公開計算例', 'published steel pipe pile example', '鋼管杭設計ソフトの公開計算例');
        return [['H (kN)', 218.8, o.H], ['β₁', 0.6287, o.b1], ['β₂', 0.7477, o.b2], ['M₁ (kN·m)', -95.09, o.M1], ['M₂ (kN·m)', -112.99, o.M2], ['σ (kN/m²)', 181060, o.sigma], ['τ (kN/m²)', 48030, o.tau], ['Lrc (m)', 6.13, o.Lrc], ['Qp1 (kN)', 602.67, o.Qp1], ['Qp2 (kN)', 1529.41, o.Qp2]].map(([item, ref, val]) => ({ item, ref, val, tol: T1, src }));
      });
      add(G7, L3('必要抑止力：加入 Pr 後 Fs = 計畫安全率', 'Required restraint force: Fs = planned value with Pr', '必要抑止力：Pr を加えると Fs = 計画安全率'), async () => {
        const gg = [[0, 10], [20, 10], [40, 20], [55, 27], [80, 28]];
        const lay = [vL('a', 5, 28, 18, null, { gammaSat: 20 }), vL('b', 30, 32, 21, [[0, 6], [20, 6], [40, 14], [55, 19], [80, 20]], { gammaSat: 22 }), vL('r', 200, 40, 24, [[0, 2], [40, 8], [80, 12]], { bedrock: true })];
        const sl = [[19, 10], [25, 8.5], [32, 10], [38, 13], [44, 16.5], [50.5, 22]];
        const rowsR = [];
        for (const meth of ['janbu', 'spencer']) {
          const m = vM({ ground: gg, zBase: 0, layers: lay, water: [[0, 10], [20, 10.2], [40, 16], [55, 22], [80, 24]], settings: { method: meth }, reinf: [{ type: 'pile', on: true, x: 35, L: 14, D: 2, N: 1, Do: 318.5, t: 10.3, grade: 'SKK490', term: 'long', E0m: 15000, E0b: 60000, aE: 1, ptype: 'wedge', load: 'tri', kEmb: 1.5, FSy: 2, a0: 2 }] });
          // planned safety factor 0.2 above the factor of safety without piles, so that a restraint force is needed
          const d0 = SSA.pileDesign(m, sl, { PFs: 1 }), F0 = d0.piles[0] && d0.piles[0].ok ? d0.piles[0].F0 : NaN, PF = Math.round((F0 + 0.2) * 100) / 100;
          const d = SSA.pileDesign(m, sl, { PFs: PF }), q = d.piles[0];
          rowsR.push({ item: (meth === 'janbu' ? 'Janbu' : 'Spencer') + ` (PFs ${PF.toFixed(2)}, Pr ${q && q.ok ? q.Pr.toFixed(1) : '—'} kN/m)`, ref: PF, val: q && q.ok ? q.Fchk : NaN, tol: rel(1e-5), src: L3('定義', 'definition', '定義') });
        }
        return rowsR;
      });
    }
    // ---- 8. other functions
    const G8 = L3('其他功能', 'Other functions', 'その他の機能');
    add(G8, L3('反算 φ′ 與 c′（平面滑動閉合解）', 'Back analysis of φ′ and c′ (planar slide, closed form)', 'φ′ と c′ の逆算（平面すべり、閉じた解）'), async () => {
      const g = [[0, 0], [10, 0], [30, 15], [60, 15]], slip = [[10, 0], [34, 15]], be = Math.atan2(15, 24), Lp = Math.hypot(24, 15), W = 600;
      const phiCF = Math.atan(Math.tan(be) - 5 * Lp / (W * Math.cos(be))) * 180 / Math.PI, cCF = (W * Math.sin(be) - W * Math.cos(be) * Math.tan(Math.PI / 6)) / Lp, rows = [];
      for (const meth of ['janbu', 'spencer', 'mp']) {
        const m = vM({ ground: g, zBase: -10, layers: [vL('s', 5, 30, 20, null)], settings: { method: meth } });
        const a = SSA.backCalc(m, slip, { param: 'phi', target: 1, layer: 'auto' }), b = SSA.backCalc(m, slip, { param: 'c', target: 1, layer: 0 });
        const nm = meth === 'janbu' ? 'Janbu' : meth === 'spencer' ? 'Spencer' : 'M–P', src = L3('閉合解', 'closed form', '閉じた解');
        rows.push({ item: nm + ' φ′', ref: phiCF, val: a.value, tol: rel(1e-5), src }, { item: nm + ' c′', ref: cCF, val: b.value, tol: rel(1e-5), src });
      }
      return rows;
    });
    add(G8, L3('控制點 Δz = 0：滑動面通過控制高程', 'Control point Δz = 0: surface passes the control elevation', '制御点 Δz = 0：すべり面が制御標高を通過'), async () => {
      const r = await vSolve(aw({ settings: { method: 'janbu' }, ctrl: { on: true, pts: [{ name: 'I-1', x: 55, depth: SSA.interp(AWg, 55) - 26.75, tol: 0 }] } }));
      const p = r.ok && r.ctrl ? r.ctrl.pts[0] : null;
      return [{ item: 'z (m)', ref: 26.75, val: p ? p.zs : NaN, tol: rel(1e-7), src: L3('輸入值', 'input', '入力値') }];
    });
    add(G8, L3('坡面左右鏡射', 'Mirrored slope', '左右反転した斜面'), async () => {
      const g = [[0, 0], [10, 0], [30, 15], [60, 15]], f = P => P.map(([x, z]) => [-x, z]);
      const mk = mir => vM({ ground: mir ? f(g) : g, zBase: -10, water: mir ? f([[0, 5], [60, 5]]) : [[0, 5], [60, 5]], layers: [vL('s', 10, 25, 20, null, { gammaSat: 21 })], settings: { method: 'spencer', tcOn: true, tcMode: 'auto', tcWater: true } });
      const a = await vSolve(mk(false)), b = await vSolve(mk(true));
      return [{ item: 'Janbu', ref: a.F, val: b.F, tol: rel(1e-9), src: L3('原方向', 'original', '元の向き') }, { item: 'Spencer', ref: a.rig.spencer.F, val: b.rig.spencer.F, tol: rel(1e-9), src: L3('原方向', 'original', '元の向き') }];
    });
    // ---- 9. retaining wall external stability
    const G9 = L3('擋土牆外部穩定', 'Retaining wall external stability', '擁壁の外的安定');
    {
      const D = Math.PI / 180, tbl = L3('教科書表值', 'textbook table', '教科書の表値'), hand = L3('手算', 'hand calculation', '手計算'), cf = L3('閉合解', 'closed form', '閉じた解');
      add(G9, L3('土壓力係數', 'Earth pressure coefficients', '土圧係数'), async () => [
        { item: 'Coulomb Ka (30°, 20°, 0°)', ref: 0.2973, val: SSA.kaCoulomb(30 * D, 20 * D, 0), tol: rel(5e-4), src: tbl },
        { item: 'Rankine Ka (30°, β 10°)', ref: 0.3495, val: SSA.kaRankine(30 * D, 10 * D), tol: rel(5e-4), src: tbl },
        { item: 'Rankine Ka (30°, β 0°)', ref: 1 / 3, val: SSA.kaRankine(30 * D, 0), tol: rel(1e-9), src: cf },
        { item: 'M–O kh 0 = Coulomb', ref: SSA.kaCoulomb(30 * D, 20 * D, 0), val: SSA.kaMO(30 * D, 20 * D, 0, 0), tol: rel(1e-9), src: 'Coulomb' },
        { item: 'M–O KAE (30°, 0°, kh 0.2)', ref: 0.47326, val: SSA.kaMO(30 * D, 0, 0, Math.atan(0.2)), tol: rel(5e-5), src: cf }
      ]);
      add(G9, L3('承載力係數 φ = 30°', 'Bearing capacity factors φ = 30°', '支持力係数 φ = 30°'), async () => {
        const b = SSA.bearingQu(0, 30, 18, 0, 2, 0);
        return [{ item: 'Nq', ref: 18.40, val: b.Nq, tol: rel(5e-4), src: tbl }, { item: 'Nc', ref: 30.14, val: b.Nc, tol: rel(5e-4), src: tbl }, { item: 'Nγ', ref: 22.40, val: b.Ng, tol: rel(5e-4), src: tbl }];
      });
      add(G9, L3('講習範例（高雄市政府水利局）', 'Training example (Kaohsiung City Water Resources Bureau)', '講習会の例題（高雄市政府水利局）'), async () => {
        const o = SSA.wallStab(30.96, 11.17, 60.22, 21.94, 3.3, 0.6, 0), src = L3('講習範例', 'training example', '講習会の例題');
        return [{ item: 'FSo', ref: 2.74, val: o.FSo, tol: rel(0.01), src }, { item: 'FSs', ref: 1.66, val: o.FSs, tol: rel(0.01), src }, { item: 'e (m)', ref: 0.414, val: o.e, tol: rel(0.01), src }, { item: 'qmax', ref: 16.44, val: o.qmax, tol: rel(0.01), src }, { item: 'qmin', ref: 2.32, val: o.qmin, tol: rel(0.01), src }];
      });
      add(G9, L3('Tawfiq 例題 2', 'Tawfiq Example 2', 'Tawfiq 例題 2'), async () => {
        const o = SSA.wallStab(7990, 2732.4, 42365, 10929.6, 8, Math.tan(20 * D), 2760), src = 'Tawfiq';
        return [{ item: 'FSs', ref: 2.1, val: o.FSs, tol: rel(0.025), src }, { item: 'FSo', ref: 3.8, val: o.FSo, tol: rel(0.025), src }, { item: 'e (m)', ref: 0.0656, val: o.e, tol: rel(0.01), src }, { item: 'qmax', ref: 1047.8, val: o.qmax, tol: rel(0.001), src }, { item: 'qmin', ref: 949.6, val: o.qmin, tol: rel(0.001), src }];
      });
      const wl = (name, c, phi, g, top) => ({ name, c, phi, gamma: g, gammaSat: 20, bedrock: false, top });
      const lay = [wl('fill', 0, 30, 18, null), wl('base', 0, 30, 18, [[0, -0.001], [40, -0.001]])];
      const wm = (ground, water) => ({ ground, zBase: -10, water: water || [], loads: [], settings: { gw: 9.81 }, layers: lay });
      const grav = { type: 'gravity', on: true, gamma: 23.5, par: { x0: 8, z0: 0, H: 4, B: 2, b: 0.6 }, ext: { delta: 0 } };
      const gW = 23.5 * 5.2, gx = (2.4 * 1.7 + 2.8 * 1.4 * 2 / 3) / 5.2, gz = (2.4 * 2 + 2.8 * 4 / 3) / 5.2, mu = Math.tan(20 * D);
      add(G9, L3('懸臂式 6 m 牆，水平回填', 'Cantilever wall 6 m, level backfill', '片持ばり式 6 m、水平裏込め'), async () => {
        const w = { type: 'cantilever', on: true, gamma: 24, par: { x0: 10, z0: 0, H: 6, B: 4, tb: 0.6, toe: 1.0, ts1: 0.3, ts2: 0.5 }, ext: {} };
        const r = SSA.wallCheck(wm([[0, 1], [11.0, 1], [11.2, 6], [40, 6]]), w, { kh: 0, kv: 0 });
        const it = [[24 * 2.4, 2, 0.3], [24 * 1.62, 1.35, 3.3], [24 * 0.54, 3.4 / 3, 2.4], [18 * 13.5, 2.75, 3.3], [18 * 0.4, 0.5, 0.8], [18 * 0.04, 3.2 / 3, 7.6 / 3]];
        const V = it.reduce((a, q) => a + q[0], 0), Mr = it.reduce((a, q) => a + q[0] * q[1], 0), Pa = 0.5 * 18 * 36 / 3, Mo = Pa * 2, e = 2 - (Mr - Mo) / V;
        return [{ item: 'ΣV', ref: V, val: r.V, tol: rel(1e-5), src: hand }, { item: 'Pa', ref: Pa, val: r.Pa, tol: rel(1e-5), src: hand }, { item: 'FSo', ref: Mr / Mo, val: r.FSo, tol: rel(1e-5), src: hand },
          { item: 'FSs', ref: V * mu / Pa, val: r.FSs, tol: rel(1e-5), src: hand }, { item: 'qmax', ref: V / 4 * (1 + 6 * e / 4), val: r.qmax, tol: rel(1e-5), src: hand }];
      });
      add(G9, L3('重力式 4 m 牆，kh = 0.2', 'Gravity wall 4 m, kh = 0.2', '重力式 4 m、kh = 0.2'), async () => {
        const r = SSA.wallCheck(wm([[0, 0], [8, 0], [9.4, 4], [40, 4]]), grav, { kh: 0.2, kv: 0 });
        const K = 0.47326, Pa = 0.5 * 18 * 16 * SSA.kaMO(30 * D, 0, 0, Math.atan(0.2)), Hd = Pa + 0.2 * gW, Mo = Pa * 4 / 3 + 0.2 * gW * gz;
        return [{ item: 'KAE', ref: K, val: r.K, tol: rel(5e-5), src: cf }, { item: 'ΣH', ref: Hd, val: r.Hd, tol: rel(1e-5), src: hand }, { item: 'FSs', ref: gW * mu / Hd, val: r.FSs, tol: rel(1e-5), src: hand }, { item: 'FSo', ref: gW * gx / Mo, val: r.FSo, tol: rel(1e-5), src: hand }];
      });
      add(G9, L3('重力式 4 m 牆，牆後水位 2 m', 'Gravity wall 4 m, water 2 m behind', '重力式 4 m、背面水位 2 m'), async () => {
        const r = SSA.wallCheck(wm([[0, 0], [8, 0], [9.4, 4], [40, 4]], [[0, -1], [8, -1], [10, 2], [40, 2]]), grav, { kh: 0, kv: 0 });
        const gp = 20 - 9.81, p1 = 0.5 * 18 * 4, p2 = 18 * 2 * 2, p3 = 0.5 * gp * 4, Pa = (p1 + p2 + p3) / 3, Ma = (p1 * (2 + 2 / 3) + p2 * 1 + p3 * 2 / 3) / 3;
        const Pw = 0.5 * 9.81 * 4, U = 0.5 * 9.81 * 2 * 2, Mo = Ma + Pw * 2 / 3 + U * 4 / 3;
        return [{ item: 'Pa', ref: Pa, val: r.Pa, tol: rel(1e-5), src: hand }, { item: 'Pw', ref: Pw, val: r.Pw, tol: rel(1e-5), src: hand }, { item: 'U', ref: U, val: r.U, tol: rel(1e-5), src: hand },
          { item: 'FSs', ref: (gW - U) * mu / (Pa + Pw), val: r.FSs, tol: rel(1e-5), src: hand }, { item: 'FSo', ref: gW * gx / Mo, val: r.FSo, tol: rel(1e-5), src: hand }];
      });
    }
    return out;
  }

  let ver = null;   // { rows, ms, when, ua, running }
  /* ---------- language switch ---------- */
  function renameDefaults() {
    model.layers.forEach(Ly => { Ly.name = nameFor(Ly.name, LANG); });
    model.loads.forEach(l => { l.name = nameFor(l.name, LANG); });
    model.walls.forEach(w => { w.name = nameFor(w.name, LANG); });
    (model.scenarios || []).forEach(sc => { sc.name = nameFor(sc.name, LANG); });
  }

window.AppModel = {
  get model() { return model; },
  set model(v) { model = v; },
  get active() { return active; },
  set active(v) { active = v; },
  get mode() { return mode; },
  set mode(v) { mode = v; },
  get result() { return result; },
  set result(v) { result = v; },
  get stale() { return stale; },
  set stale(v) { stale = v; },
  get running() { return running; },
  set running(v) { running = v; },
  get undoStack() { return undoStack; },
  get bounds() { return bounds; },
  set bounds(v) { bounds = v; },
  get T() { return T; },
  set T(v) { T = v; },
  get wallRes() { return wallRes; },
  get scen() { return scen; },
  set scen(v) { scen = v; },
  get pd() { return pd; },
  set pd(v) { pd = v; },
  get bk() { return bk; },
  get bkRes() { return bkRes; },
  set bkRes(v) { bkRes = v; },
  get ver() { return ver; },
  set ver(v) { ver = v; },
  SAMPLE, DEF_SET, NAIL, ANCHOR, PILE, MPILE, GEO, TPL, STR_F, LOAD_TPL, WALL_CODES, WALL_PAR, WALL_EXT,
  sanitize, pushUndo, doUndo, changed, lineDefs, getPts, setPts, minPts,
  genArc, trialCircleNow, parseCoords, memGeom, addMember, addLoad,
  computeWalls, loadWallExample, gridInfo, fit, setupT, currentModel,
  importCSV, importText, defaultCtrl, sanitizeCtrl, ctrlToTrial,
  defaultScenarios, sanitizeScen, scenarioModel, verifyCases
};
