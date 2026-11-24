/* ===== SSA engine: Dynamic Programming search + Simplified Janbu, water table → pore pressure ===== */
const SSA = (() => {
  const sortP = P => (P || []).filter(p => isFinite(p[0]) && isFinite(p[1])).map(p => [+p[0], +p[1]]).sort((a, b) => a[0] - b[0]);

  function interp(P, x) {
    const n = P.length;
    if (!n) return NaN;
    if (x <= P[0][0]) return P[0][1];
    if (x >= P[n - 1][0]) return P[n - 1][1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][0] <= x) lo = m; else hi = m; }
    const x1 = P[lo][0], z1 = P[lo][1], x2 = P[hi][0], z2 = P[hi][1];
    return x2 === x1 ? z2 : z1 + (z2 - z1) * (x - x1) / (x2 - x1);
  }
  function slopeAt(P, x) {
    const n = P.length;
    if (n < 2 || x <= P[0][0] || x >= P[n - 1][0]) return 0;
    let i = 0; while (i < n - 2 && P[i + 1][0] <= x) i++;
    const dx = P[i + 1][0] - P[i][0];
    return dx > 0 ? (P[i + 1][1] - P[i][1]) / dx : 0;
  }

  function validate(model) {
    const err = [];
    const g = sortP(model.ground);
    if (g.length < 2) err.push('地表線至少需要 2 個點。');
    if (!model.layers || !model.layers.length) err.push('至少需要 1 個土層。');
    (model.layers || []).forEach((L, i) => {
      if (i > 0 && sortP(L.top).length < 2) err.push(`「${L.name}」的頂界面至少需要 2 個點。`);
      if (!(L.gamma > 0)) err.push(`「${L.name}」的單位重 γ 需大於 0。`);
      if (!(L.gammaSat > 0)) err.push(`「${L.name}」的飽和單位重 γsat 需大於 0。`);
      if (!(L.c >= 0)) err.push(`「${L.name}」的凝聚力 c' 不可為負。`);
      if (!(L.phi >= 0 && L.phi < 90)) err.push(`「${L.name}」的摩擦角 φ' 需介於 0–90°。`);
    });
    (model.walls || []).forEach((w, i) => {
      if (w.on === false) return;
      if (!Array.isArray(w.poly) || w.poly.length < 3) err.push(`擋土牆 ${i + 1} 的形狀至少需要 3 個頂點。`);
      if (!(+w.gamma > 0)) err.push(`擋土牆 ${i + 1} 的單位重需大於 0。`);
    });
    (model.reinf || []).forEach((r, i) => {
      if (r.on === false) return;
      if (r.type === 'pile') {
        if (!(+r.D > 0) || !(+r.L > 0)) err.push(`抑止樁 ${i + 1} 的樁長與間距需大於 0。`);
        if (!(+r.t > 0 && +r.Do > 2 * +r.t)) err.push(`抑止樁 ${i + 1} 的鋼管外徑需大於兩倍管厚。`);
        if (!(+r.E0b > 0)) err.push(`抑止樁 ${i + 1} 的穩定層變形係數 E0 需大於 0。`);
        if (r.ptype !== 'restrain' && !(+r.E0m > 0)) err.push(`抑止樁 ${i + 1}（楔形樁）的移動層變形係數 E0 需大於 0。`);
      }
      if (r.type === 'geo' && !(+r.Tult > 0)) err.push(`地工合成材 ${i + 1} 的極限拉力需大於 0。`);
    });
    const st = model.settings || {};
    const PZ = model.piezo || [];
    (model.layers || []).forEach(L => {
      const p = L.pore; if (!p) return;
      if (p.type === 'piezo') { const q = PZ[+p.line]; if (!q) err.push(`「${L.name}」指定的水壓線不存在。`); else if (!q.pts || q.pts.length < 2) err.push(`水壓線「${q.name}」至少需要 2 個點（「${L.name}」使用中）。`); }
      if (p.type === 'ru' && !(+p.ru >= 0 && +p.ru < 1)) err.push(`「${L.name}」的 ru 需介於 0 與 1 之間。`);
    });
    if (st.tcOn && st.tcMode === 'manual' && !(+st.tcDepth > 0)) err.push('張力裂縫的指定深度需大於 0。');
    if (g.length >= 2) {
      const zmin = Math.min(...g.map(p => p[1]));
      if (!(model.zBase < zmin)) err.push('模型底部高程需低於地表最低點。');
      const c = model.ctrl;
      if (c && c.on) {
        const gx0 = g[0][0], gx1 = g[g.length - 1][0];
        (c.pts || []).forEach((p, i) => {
          if (p.on === false) return;
          const nm = p.name || `C${i + 1}`;
          if (!(+p.x > gx0 && +p.x < gx1)) err.push(`控制點「${nm}」的 x 需在地表線範圍內。`);
          else if (!(+p.depth > 0)) err.push(`控制點「${nm}」的深度需大於 0。`);
          else if (!(+p.tol >= 0)) err.push(`控制點「${nm}」的容許範圍不可為負。`);
          else if (interp(g, +p.x) - +p.depth <= model.zBase) err.push(`控制點「${nm}」低於模型底部。`);
        });
        for (const [key, nm] of [['toe', '坡趾出口範圍'], ['crest', '坡頂入口範圍']]) {
          const rg = c[key];
          if (rg && rg.on && !(+rg.x2 > +rg.x1)) err.push(`${nm}的終點 x 需大於起點 x。`);
        }
      }
    }
    return err;
  }

  /* bring the model to the canonical orientation: crest on the right, mass slides toward -x */
  function prepare(model) {
    const s = model.settings;
    let ground = sortP(model.ground);
    const mirror = ground[0][1] > ground[ground.length - 1][1];
    const T = P => { const q = sortP(P); return mirror ? q.map(([x, z]) => [-x, z]).reverse() : q; };
    ground = T(ground);
    // pore pressure option of each layer: null = main water table, or { type: 'piezo', k } / { type: 'ru', ru } / { type: 'dry' }
    const npz = (model.piezo || []).length;
    const poreOf = L => {
      const p = L.pore; if (!p || !p.type || p.type === 'wt') return null;
      if (p.type === 'piezo') return +p.line >= 0 && +p.line < npz ? { type: 'piezo', k: +p.line } : null;
      if (p.type === 'ru') return { type: 'ru', ru: Math.max(0, +p.ru || 0) };
      return p.type === 'dry' ? { type: 'dry' } : null;
    };
    const layers = model.layers.map((L, i) => ({
      name: L.name, gamma: +L.gamma, gammaSat: +L.gammaSat, c: +L.c, phi: +L.phi,
      tanphi: Math.tan(+L.phi * Math.PI / 180), bedrock: !!L.bedrock, top: i ? T(L.top) : null, pore: poreOf(L)
    }));
    const water = T(model.water);
    const piezo = (model.piezo || []).map(p => { const P = p && p.pts && p.pts.length >= 2 ? T(p.pts) : []; return P; });
    const reinf = [];
    const passiveMode = s.reinfMode === 'passive';
    (model.reinf || []).forEach((r, idx) => {
      if (r.on === false || !(+r.L > 0)) return;
      const X0 = x => (mirror ? -x : +x), num = (v, d) => isFinite(+v) && v !== null && v !== '' ? +v : d;
      if (r.type === 'pile') {
        // steel pipe stabilizing pile, vertical from the ground surface; resistance per unit width along the slip surface
        if (!(+r.D > 0)) return;
        reinf.push({ idx, type: 'pile', name: r.name || '', hx: X0(r.x), hz: NaN, dx: 0, dz: -1, cos: 0, sin: 1, L: +r.L, Sh: +r.D / Math.max(1, Math.round(num(r.N, 1))), pas: true,
          D: +r.D, N: Math.max(1, Math.round(num(r.N, 1))), Do: num(r.Do, 318.5), t: num(r.t, 10.3), grade: r.grade || 'SKK490', term: r.term === 'short' ? 'short' : 'long',
          E0m: num(r.E0m, 0), E0b: num(r.E0b, 0), aE: num(r.aE, 1), ptype: r.ptype === 'restrain' ? 'restrain' : 'wedge', load: ['tri', 'uni', 'rigid'].includes(r.load) ? r.load : 'tri',
          kEmb: num(r.kEmb, 1.5), FSy: num(r.FSy, 2), a0: num(r.a0, 2) });
        return;
      }
      if (r.type === 'force') {   // internal: fixed tangential force PR (kN/m) at x, used to find the required restraint force
        reinf.push({ idx, type: 'force', name: '', hx: X0(r.x), hz: NaN, dx: 0, dz: -1, cos: 0, sin: 1, L: 1e6, Sh: 1, pas: true, PR: +r.PR || 0 });
        return;
      }
      if (r.type === 'geo') {
        // geogrid / geotextile layer: horizontal, from x into the slope, tension per unit width
        reinf.push({ idx, type: 'geo', name: r.name || '', hx: X0(r.x), hz: +r.z, dx: 1, dz: 0, cos: 1, sin: 0, L: +r.L, Sh: 1, pas: passiveMode,
          Tal: num(r.Tult, 0) / (Math.max(1, num(r.rfID, 1)) * Math.max(1, num(r.rfCR, 1)) * Math.max(1, num(r.rfD, 1))),
          Ci: num(r.Ci, 0.8), aS: num(r.aS, 0.8), fsPo: Math.max(1, num(r.fsPo, 1.5)), face: r.face !== false, dir: r.dir === 't' ? 't' : 'h' });
        return;
      }
      if (!(+r.Sh > 0)) return;
      const th = (+r.theta || 0) * Math.PI / 180;
      if (r.type === 'mpile') {
        reinf.push({ idx, type: 'mpile', name: r.name || '', hx: X0(r.x), hz: +r.z, dx: Math.cos(th), dz: -Math.sin(th), cos: Math.cos(th), sin: Math.sin(th),
          L: +r.L, Lf: 0, Sh: +r.Sh, pas: true, Tt: +r.Tt || 0, q: +r.q || 0, Va: +r.Va || 0 });
        return;
      }
      reinf.push({ pas: passiveMode,
        idx, type: r.type === 'anchor' ? 'anchor' : 'nail', name: r.name || '',
        hx: mirror ? -r.x : +r.x, hz: +r.z, dx: Math.cos(th), dz: -Math.sin(th), cos: Math.cos(th), sin: Math.sin(th),
        L: +r.L, Lf: r.type === 'anchor' ? Math.max(0, +r.Lfree || 0) : 0, Sh: +r.Sh,
        Tt: +r.Tt || 0, q: +r.q || 0, Tf: +r.Tf || 0, P: r.type === 'anchor' ? (+r.P || 0) : 0
      });
    });
    reinf.forEach(m => { if (m.type === 'pile' || m.type === 'force') m.hz = interp(ground, m.hx) + (m.type === 'force' ? 1e3 : 0); m.x0 = Math.min(m.hx, m.hx + m.L * m.dx); m.x1 = Math.max(m.hx, m.hx + m.L * m.dx); });
    const walls = [];
    (model.walls || []).forEach((w, idx) => {
      if (w.on === false || !Array.isArray(w.poly) || w.poly.length < 3 || !(+w.gamma > 0)) return;
      const P = w.poly.filter(p => isFinite(p[0]) && isFinite(p[1])).map(([x, z]) => [mirror ? -x : +x, +z]);
      if (P.length < 3) return;
      walls.push({ idx, name: w.name || '', g: +w.gamma, P, x0: Math.min(...P.map(p => p[0])), x1: Math.max(...P.map(p => p[0])) });
    });
    const loads = [];
    (model.loads || []).forEach((l, idx) => {
      if (l.on === false) return;
      const X = x => (mirror ? -x : +x);
      if (l.type === 'line') { if (isFinite(l.x) && +l.P) loads.push({ idx, type: 'line', x: X(l.x), P: +l.P, seis: l.seis !== false }); }
      else if (isFinite(l.x1) && isFinite(l.x2)) {
        const a = X(l.x1), b = X(l.x2), q1 = +l.q || 0, q2 = (l.q2 === undefined || l.q2 === '' || l.q2 === null || !isFinite(+l.q2)) ? q1 : +l.q2;
        if (Math.abs(b - a) > 1e-9 && (q1 || q2)) loads.push({ idx, type: 'udl', xa: Math.min(a, b), xb: Math.max(a, b), qa: a < b ? q1 : q2, qb: a < b ? q2 : q1, q: (q1 + q2) / 2, seis: l.seis !== false });
      }
    });
    const M = { mirror, ground, layers, water, piezo, zBase: +model.zBase, s, reinf, walls, loads };
    reinf.forEach(m => initMember(M, m, +s.gw));
    let N = Math.max(8, Math.round(s.nCol));
    const NS = Math.max(12, Math.round(s.nState)), nSub = Math.max(1, Math.round(s.nSub));
    const margin = 3;
    const x0 = ground[0][0], x1 = ground[ground.length - 1][0];
    // slip surface control points (e.g. shear zones measured in inclinometers) and entry/exit ranges
    const X = x => (mirror ? -x : +x);
    const cIn = model.ctrl && model.ctrl.on ? model.ctrl : null;
    const ctrl = { pts: [], toe: null, crest: null };
    if (cIn) {
      (cIn.pts || []).forEach((p, i) => {
        if (p.on === false || !isFinite(p.x) || !(+p.depth > 0)) return;
        const xi = X(+p.x); if (!(xi > x0 + 1e-6 && xi < x1 - 1e-6)) return;
        ctrl.pts.push({ x: xi, z: interp(ground, xi) - +p.depth, tol: Math.max(0, +p.tol || 0), name: p.name || `C${i + 1}`, i });
      });
      const rg = o => o && o.on && isFinite(o.x1) && isFinite(o.x2) ? [Math.min(X(o.x1), X(o.x2)), Math.max(X(o.x1), X(o.x2))] : null;
      ctrl.toe = rg(cIn.toe); ctrl.crest = rg(cIn.crest);
    }
    M.ctrl = ctrl;
    // columns: uniform, plus one column exactly at every control point
    let xl = [];
    for (let k = 0; k < N; k++) xl.push(x0 + (x1 - x0) * k / (N - 1));
    if (ctrl.pts.length) {
      const h = (x1 - x0) / (N - 1);
      xl = xl.filter((x, k) => k === 0 || k === N - 1 || ctrl.pts.every(c => Math.abs(x - c.x) > 0.3 * h));
      ctrl.pts.forEach(c => xl.push(c.x));
      xl = [...new Set(xl)].sort((a, b) => a - b);
      N = xl.length;
    }
    const xs = Float64Array.from(xl);

    const zmax = Math.max(...ground.map(p => p[1]));
    const Hmin = (zmax - M.zBase) * 0.02;
    const cols = [];
    for (let k = 0; k < N; k++) {
      const pr = profileAt(M, xs[k]);
      let dz = (pr.zs - pr.zb) / (NS - 1 - margin);
      if (!(dz > Hmin / NS)) dz = Hmin / NS;
      const z = new Float64Array(NS);
      const cp = ctrl.pts.find(c => Math.abs(c.x - xs[k]) < 1e-9);
      // at a control column the node grid is shifted so that one node lies exactly at the control elevation
      const off = cp && cp.z > pr.zb ? ((cp.z - pr.zb) % dz) : 0;
      for (let j = 0; j < NS; j++) z[j] = pr.zb + off + j * dz;
      const allow = new Uint8Array(NS);
      const edge = (k === 0 || k === N - 1) && s.noBoundary;
      for (let j = 0; j < NS; j++) allow[j] = edge ? (z[j] >= pr.zs - 1e-9 ? 1 : 0) : 1;
      if (cp) { cp.k = k; let n = 0; for (let j = 0; j < NS; j++) { allow[j] = Math.abs(z[j] - cp.z) <= cp.tol + 1e-6 && z[j] < pr.zg - 1e-6 && z[j] >= pr.zb - 1e-9 ? 1 : 0; n += allow[j]; } cp.nodes = n; }
      cols.push({ x: xs[k], zg: pr.zg, zb: pr.zb, z, allow, dz });
    }
    // tension crack: on every column the node nearest the crack depth is the place where the surface may turn into a vertical crack
    const tc = s.tcOn ? { water: !!s.tcWater } : null;
    if (tc) for (let k = 1; k < N - 1; k++) {
      const c = cols[k], d = crackDepth(M, s, c.x);
      if (!(d > 0)) continue;
      let ci = -1, best = Infinity;
      for (let j = 0; j < NS; j++) if (c.allow[j] && c.z[j] < c.zg - 1e-6 && c.z[j] >= c.zb - 1e-9) { const e = Math.abs(c.zg - d - c.z[j]); if (e < best) { best = e; ci = j; } }
      if (ci < 0) continue;
      c.ci = ci; c.crD = c.zg - c.z[ci]; c.Pw = tc.water ? 0.5 * (+s.gw) * c.crD * c.crD : 0;
    }
    const gaps = [];
    for (let k = 0; k < N - 1; k++) {
      const dx = xs[k + 1] - xs[k], b = dx / nSub, subs = [];
      for (let q = 0; q < nSub; q++) {
        const xc = xs[k] + (q + 0.5) * b;
        const ld = loadOn(M, xs[k] + q * b, xs[k] + (q + 1) * b, q === nSub - 1 && k === N - 2);
        const xa = xs[k] + q * b, xb = xs[k] + (q + 1) * b, zgL = interp(ground, xa), zgR = interp(ground, xb);
        const hasW = water.length >= 2, zwL = hasW ? interp(water, xa) : -Infinity, zwR = hasW ? interp(water, xb) : -Infinity;
        subs.push({ xc, off: (q + 0.5) * b, pr: profileAt(M, xc), Q: ld.Q, Qs: ld.Qs, dzg: zgR - zgL, zgL, zgR, zwL, zwR });
      }
      gaps.push({ dx, b, subs, mem: reinf.filter(m => m.x1 >= xs[k] - 1e-9 && m.x0 <= xs[k + 1] + 1e-9), walls: walls.filter(w => w.x1 >= xs[k] && w.x0 <= xs[k + 1]) });
    }
    // where the slip surface may cross the ground: per gap 2 = whole gap inside the range, 1 = gap contains a range end
    // (the crossing point is then checked), 0 = outside the range
    const cover = r => { const a = new Uint8Array(N); for (let k = 0; k < N - 1; k++) { const xa = xs[k], xb = xs[k + 1]; a[k] = !r ? 2 : (xa >= r[0] - 1e-9 && xb <= r[1] + 1e-9) ? 2 : (xb < r[0] - 1e-9 || xa > r[1] + 1e-9) ? 0 : 1; } return a; };
    return { M, N, NS, xs, cols, gaps, s, gw: +s.gw, inToe: cover(ctrl.toe), inCrest: cover(ctrl.crest), ctrl, tc };
  }

  /* tension crack depth at x: specified, or Rankine zc = 2c'/(γ√Ka) of the layer at the ground surface */
  function crackDepth(M, s, x) {
    if (s.tcMode === 'manual') return +s.tcDepth > 0 ? +s.tcDepth : 0;
    const pr = profileAt(M, x), v = pr.iv[0]; if (!v) return 0;
    const L = M.layers[v.L]; if (L.bedrock || !(L.c > 0)) return 0;
    const Ka = Math.pow(Math.tan((45 - L.phi / 2) * Math.PI / 180), 2);
    const d = 2 * L.c / (v.g * Math.sqrt(Ka));
    return Math.min(d, Math.max(0, pr.zg - pr.zb - 0.05));
  }
  const crackFor = (ctx, P) => {
    // crack at the crest end of polyline P (internal frame): its bottom is the last vertex
    if (!ctx.tc || !P || !P.length) return null;
    const e = P[P.length - 1], zg = interp(ctx.M.ground, e[0]), dw = zg - e[1];
    if (!(dw > 1e-6)) return null;
    return { x: e[0], zb: e[1], zg, dw, Pw: ctx.tc.water ? 0.5 * ctx.gw * dw * dw : 0 };
  };

  /* vertical profile at x: layer tops, water table, cumulative weight table */
  function profileAt(M, x) {
    const s = M.s;
    const zg = interp(M.ground, x);
    const nL = M.layers.length;
    const tops = [zg];
    for (let i = 1; i < nL; i++) tops[i] = Math.min(tops[i - 1], interp(M.layers[i].top, x));
    let zb = M.zBase;
    for (let i = 0; i < nL; i++) if (M.layers[i].bedrock) { zb = Math.max(zb, tops[i]); break; }
    zb = Math.min(zb, zg);
    const hasW = M.water.length >= 2;
    const zwr = hasW ? interp(M.water, x) : -Infinity;      // water level (may be above the ground: ponded water)
    const zw = Math.min(zwr, zg), zw0 = zw;
    const zp = zwr > zg ? zwr - zg : 0;                      // depth of water standing on the ground surface
    let cw = 1;
    if (hasW && s.cos2) { const t = slopeAt(M.water, x); cw = 1 / (1 + t * t); }
    // piezometric lines: level and inclination factor at x
    const PZ = M.piezo || [], pz = [], cwp = [];
    for (const P of PZ) { if (P.length >= 2) { pz.push(interp(P, x)); const t = s.cos2 ? slopeAt(P, x) : 0; cwp.push(1 / (1 + t * t)); } else { pz.push(-Infinity); cwp.push(1); } }
    // intervals, top-down
    const iv = [];
    for (let i = 0; i < nL; i++) {
      const zt = tops[i], zbot = i + 1 < nL ? tops[i + 1] : -1e9;
      if (zt - zbot <= 0) continue;
      const L = M.layers[i];
      // a layer on its own piezometric line is saturated below that line; the others below the water table
      const zw = L.pore && L.pore.type === 'piezo' ? Math.min(pz[L.pore.k], zg) : zw0;
      if (zw < zt && zw > zbot) {
        iv.push({ zt, zbot: zw, g: L.gamma, L: i });
        iv.push({ zt: zw, zbot, g: L.gammaSat, L: i });
      } else iv.push({ zt, zbot, g: zw >= zt ? L.gammaSat : L.gamma, L: i });
    }
    let cum = 0;
    for (const v of iv) { v.cum = cum; cum += v.g * (v.zt - Math.max(v.zbot, -1e6)); }
    // retaining walls: vertical intervals of each polygon at x
    const wiv = [];
    let zs = zg;
    for (const w of (M.walls || [])) {
      if (x < w.x0 || x > w.x1) continue;
      const zz = [], P = w.P, n = P.length;
      for (let i = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % n];
        if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) zz.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
      }
      zz.sort((p, q) => p - q);
      for (let i = 0; i + 1 < zz.length; i += 2) { wiv.push({ zlo: zz[i], zhi: zz[i + 1], g: w.g, idx: w.idx }); zs = Math.max(zs, zz[i + 1]); }
    }
    return { zg, zb, zw, zwr, zp, cw, iv, tops, wiv, zs, pz, cwp };
  }
  /* does the straight piece (ax,az)-(bx,bz) pass through the interior of polygon P? (touching an edge is allowed) */
  function segHitsPoly(P, ax, az, bx, bz) {
    const n = P.length, eps = 1e-7;
    const inside = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const onEdge = (x, z) => { for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez; const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2)) : 0; if (Math.hypot(x - a[0] - t * ex, z - a[1] - t * ez) < 1e-6) return true; } return false; };
    // sample the segment between all edge crossings; any interior sample point means it passes through
    const ts = [0, 1];
    const dx = bx - ax, dz = bz - az;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1];
      const det = dx * ez - dz * ex; if (Math.abs(det) < 1e-12) continue;
      const t = ((a[0] - ax) * ez - (a[1] - az) * ex) / det, u = ((a[0] - ax) * dz - (a[1] - az) * dx) / det;
      if (t > eps && t < 1 - eps && u >= -eps && u <= 1 + eps) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    for (let i = 0; i + 1 < ts.length; i++) {
      const t = (ts[i] + ts[i + 1]) / 2, x = ax + t * dx, z = az + t * dz;
      if (ts[i + 1] - ts[i] > 1e-9 && inside(x, z) && !onEdge(x, z)) return true;
    }
    return false;
  }
  /* external vertical load acting on the slice top between xl and xr (line loads counted once, at [xl, xr)) */
  function loadOn(M, xl, xr, lastIncl) {
    let Q = 0, Qs = 0;
    for (const l of (M.loads || [])) {
      let v = 0;
      if (l.type === 'line') { if (l.x >= xl && (l.x < xr || (lastIncl && l.x <= xr))) v = l.P; }
      else { const lo = Math.max(xl, l.xa), hi = Math.min(xr, l.xb); if (hi > lo) { const qx = x => l.qa + (l.qb - l.qa) * (x - l.xa) / (l.xb - l.xa); v = 0.5 * (qx(lo) + qx(hi)) * (hi - lo); } }
      Q += v; if (l.seis) Qs += v;
    }
    return { Q, Qs };
  }
  /* soil weight per unit width between the ground surface and elevation z */
  function soilCum(pr, z) {
    if (z >= pr.zg) return 0;
    for (let m = 0; m < pr.iv.length; m++) { const v = pr.iv[m]; if (z >= v.zbot) return v.cum + v.g * (v.zt - z); }
    const v = pr.iv[pr.iv.length - 1]; return v ? v.cum + v.g * (v.zt - z) : 0;
  }
  /* extra weight per unit width that walls add above elevation zc (wall weight minus the soil it replaces) */
  function wallExtra(pr, zc) {
    let e = 0;
    for (const w of pr.wiv) {
      const lo = Math.max(w.zlo, zc); if (w.zhi <= lo) continue;
      e += w.g * (w.zhi - lo);
      const sLo = lo, sHi = Math.min(w.zhi, pr.zg);
      if (sHi > sLo) e -= soilCum(pr, sLo) - soilCum(pr, sHi);
    }
    return e;
  }

  /* available force of a nail or anchor crossed at distance sAlong from its head */
  function memForce(m, sAlong) {
    const Le = m.L - Math.max(sAlong, m.Lf);
    if (!(Le > 0)) return { T: 0, Tm: 0, Le: Math.max(0, Le), ctrl: m.type === 'anchor' ? '錨碇段在滑動體內' : '未穿出滑動面' };
    const cand = [[m.q * Le, '拉拔']];
    if (m.Tt > 0) cand.push([m.Tt, '抗拉']);
    if (m.type === 'nail' && m.Tf > 0) cand.push([m.Tf, '面版']);
    if (m.type === 'anchor' && m.P > 0) cand.push([m.P, '設計錨力']);
    let best = cand[0];
    for (const c of cand) if (c[0] < best[0]) best = c;
    return { T: best[0], Tm: best[0] / m.Sh, Le, ctrl: best[1] };
  }

  /* ---------- steel pipe stabilizing piles (地すべり防止技術指針・地すべり鋼管杭設計要領) ---------- */
  // allowable stresses [σa, τa] in kN/m²
  const STEEL = { SKK400: { long: [140000, 80000], short: [210000, 120000] }, SKK490: { long: [185000, 105000], short: [280000, 160000] }, SM570: { long: [255000, 145000], short: [380000, 220000] } };
  function pileSection(m) {
    const D = m.Do / 1000, d = Math.max(0, D - 2 * m.t / 1000);
    const A = Math.PI / 4 * (D * D - d * d), I = Math.PI / 64 * (D ** 4 - d ** 4), Z = I / (D / 2), E = 2.0e8;
    const st = (STEEL[m.grade] || STEEL.SKK490)[m.term];
    return { D, d, A, I, Z, E, EI: E * I, sa: st[0], ta: st[1] };
  }
  // horizontal subgrade reaction kh = kh0 (Bh/0.3)^(-3/4), kh0 = αE0/0.3, Bh = √(D/β); β = (kh·D / 4EI)^(1/4) (道路橋示方書)
  function pileBeta(E0, aE, D, EI) {
    if (!(E0 > 0) || !(EI > 0)) return { kh: 0, beta: 0 };
    let beta = 0.5, kh = 0;
    for (let i = 0; i < 200; i++) { kh = aE * E0 / 0.3 * Math.pow(Math.sqrt(D / beta) / 0.3, -0.75); const b2 = Math.pow(kh * D / (4 * EI), 0.25); if (Math.abs(b2 - beta) < 1e-13) { beta = b2; break; } beta = b2; }
    return { kh, beta };
  }
  // くさび杭: load H at the slip surface, semi-infinite in the moving mass (β1) and in the stable ground (β2); moments per unit H
  function wedgeM(b1, b2) {
    const a1 = Math.atan(b2 / b1), a2 = Math.atan(b1 / b2), K3 = 1 / b1 - 1 / b2, K4 = 1 / b1 + 1 / b2;
    return { m1: 0.5 * Math.exp(-a1) * (K3 * Math.cos(a1) - K4 * Math.sin(a1)), x1: a1 / b1, m2: -0.5 * Math.exp(-a2) * (K3 * Math.cos(a2) + K4 * Math.sin(a2)), x2: a2 / b2 };
  }
  // 抑え杭: cantilever loaded at height h above the slip surface, semi-infinite in the stable ground (Chang); moment per unit H
  function changM(b, h) { const q = 1 + 2 * b * h; return { m: Math.sqrt(q * q + 1) * Math.exp(-Math.atan(1 / q)) / (2 * b), x: Math.atan(1 / q) / b }; }
  function layerAt(M, pr, z) { for (const v of pr.iv) if (z >= v.zbot) return M.layers[v.L]; return pr.iv.length ? M.layers[pr.iv[pr.iv.length - 1].L] : null; }

  /* member data that do not depend on the slip surface */
  function initMember(M, m, gw) {
    if (m.type === 'pile') {
      m.sec = pileSection(m); m.pr = profileAt(M, m.hx);
      const r1 = pileBeta(m.E0m, m.aE, m.sec.D, m.sec.EI), r2 = pileBeta(m.E0b, m.aE, m.sec.D, m.sec.EI);
      m.kh1 = r1.kh; m.b1 = r1.beta; m.kh2 = r2.kh; m.b2 = r2.beta;
      m.wm = m.ptype === 'wedge' && m.b1 > 0 && m.b2 > 0 ? wedgeM(m.b1, m.b2) : null;
    } else if (m.type === 'geo') {
      // pullout resistance 2·Ci·tanφ′·α·σv′ per metre, integrated along the layer (FHWA reinforced soil slopes)
      const n = 80, cum = new Float64Array(n + 1);
      let prev = 0;
      for (let i = 0; i <= n; i++) {
        const sA = m.L * i / n, x = m.hx + sA, pr = profileAt(M, x);
        let g = 0;
        if (m.hz < pr.zg) {
          let v = null; for (const w of pr.iv) if (m.hz >= w.zbot) { v = w; break; }
          if (v) {
            const L = M.layers[v.L], sv = v.cum + v.g * (v.zt - m.hz);
            const u = gw * poreHead({ M, gw }, pr, v, m.hz, pr.zwr, m.hz);
            g = 2 * m.Ci * L.tanphi * m.aS * Math.max(0, sv - u);
          }
        }
        if (i) cum[i] = cum[i - 1] + 0.5 * (prev + g) * m.L / n;
        prev = g;
      }
      m.cum = cum;
    }
  }
  const cumAt = (m, sA) => { const n = m.cum.length - 1, t = Math.max(0, Math.min(n, sA / m.L * n)), i = Math.min(n - 1, Math.floor(t)), f = t - i; return m.cum[i] * (1 - f) + m.cum[i + 1] * f; };

  /* allowable horizontal load H of one pile crossed at depth Le below its head; ta = tanθ of the slip surface */
  function pileH(M, m, Le, ta) {
    const sc = m.sec, Lr = m.L - Le, zs = m.hz - Le;
    if (!(Lr > 0)) return { H: 0, ctrl: '樁未穿過滑動面', Le, Lr: Math.max(0, Lr) };
    const cand = [];
    cand.push([sc.ta * sc.A / m.a0, '剪力']);
    let mH = 0, mx = 0;
    if (m.ptype === 'wedge') { if (m.wm) { mH = Math.max(Math.abs(m.wm.m1), Math.abs(m.wm.m2)); } }
    else if (m.b2 > 0) { const h = m.load === 'tri' ? Le / 3 : m.load === 'uni' ? Le / 2 : 0; mH = changM(m.b2, h).m; }
    if (mH > 0) cand.push([sc.sa / (mH / sc.Z + Math.abs(ta) / sc.A), '彎矩']);
    // passive resistance of the ground in front of the pile (道路土工 切土工・斜面安定工指針), safety factor FSy
    const L1 = layerAt(M, m.pr, m.hz - Le / 2), L2 = layerAt(M, m.pr, zs - Lr / 2), D = sc.D;
    const Kp = Lx => Math.pow(Math.tan((45 + Lx.phi / 2) * Math.PI / 180), 2);
    if (L1 && L2) {
      const k1 = Kp(L1), k2 = Kp(L2);
      if (m.ptype === 'wedge') cand.push([3 * D * (0.5 * L1.gamma * Le * Le * k1 + 2 * L1.c * Le * Math.sqrt(k1)) / m.FSy, '地盤（移動層）']);
      cand.push([3 * D * ((0.5 * L2.gamma * Lr * Lr + L1.gamma * Le * Lr) * k2 + 2 * L2.c * Lr * Math.sqrt(k2)) / m.FSy, '地盤（穩定層）']);
    }
    let best = cand[0]; for (const c of cand) if (c[0] < best[0]) best = c;
    return { H: Math.max(0, best[0]), ctrl: best[1], Le, Lr, mH };
  }

  /* force of a member on the sliding mass where it crosses the slip surface at distance sA from its head.
     (ca, sa) is the slip direction pointing up the surface (the resisting direction). Returns the force (fx, fz) and
     whether its tangential part counts as resistance (passive) */
  function memAct(M, m, sA, ca, sa) {
    if (m.type === 'nail' || m.type === 'anchor') { const f = memForce(m, sA); f.fx = f.Tm * m.dx; f.fz = f.Tm * m.dz; f.pas = m.pas; return f; }
    if (m.type === 'force') return { T: m.PR, Tm: m.PR, Le: sA, ctrl: '', fx: m.PR * ca, fz: m.PR * sa, pas: true };
    if (m.type === 'pile') {
      const h = pileH(M, m, sA, sa / ca);
      const PR = h.H * m.N / (m.D * ca);           // P = PR·cosθ·D / N
      return { T: h.H, Tm: PR, Le: sA, Lr: h.Lr, ctrl: h.ctrl, fx: PR * ca, fz: PR * sa, pas: true, H: h.H };
    }
    if (m.type === 'mpile') {
      // axial force (bond beyond the slip surface or bar strength) and shear across the pile, each acting against sliding
      const Le = m.L - sA, Na = Math.max(0, Math.min(m.q * Le, m.Tt > 0 ? m.Tt : Infinity)), ax = m.dx, az = m.dz;
      const sg = ax * ca + az * sa >= 0 ? 1 : -1, px = -az, pz = ax, sp = px * ca + pz * sa >= 0 ? 1 : -1;
      const fx = (sg * Na * ax + sp * m.Va * px) / m.Sh, fz = (sg * Na * az + sp * m.Va * pz) / m.Sh;
      const ctrl = !(Le > 0) ? '未穿出滑動面' : (m.Tt > 0 && m.Tt <= m.q * Le ? '抗拉' : '拉拔');
      return { T: Na, Tm: Math.hypot(fx, fz), Le, ctrl, fx, fz, pas: true, Na, V: m.Va };
    }
    if (m.type === 'geo') {
      const back = (cumAt(m, m.L) - cumAt(m, sA)) / m.fsPo, front = m.face ? Infinity : cumAt(m, sA) / m.fsPo;
      const cand = [[m.Tal, '容許拉力'], [back, '拉拔（後方）'], [front, '拉拔（前方）']];
      let best = cand[0]; for (const c of cand) if (c[0] < best[0]) best = c;
      const T = Math.max(0, best[0]);
      return { T, Tm: T, Le: m.L - sA, ctrl: best[1], fx: m.dir === 't' ? T * ca : T, fz: m.dir === 't' ? T * sa : 0, pas: m.pas };
    }
    return { T: 0, Tm: 0, Le: 0, ctrl: '', fx: 0, fz: 0, pas: false };
  }
  /* intersection of slip segment (ax,az)-(bx,bz), u in [0,1), with member m; returns distance along member or -1 */
  function crossMember(m, ax, az, bx, bz) {
    const ex = bx - ax, ez = bz - az;
    const det = -ex * m.dz + m.dx * ez;
    if (Math.abs(det) < 1e-12) return null;
    const rx = m.hx - ax, rz = m.hz - az;
    const u = (-rx * m.dz + m.dx * rz) / det;
    const sA = (ex * rz - ez * rx) / det;
    if (u < 0 || u >= 1 || sA <= 0 || sA > m.L) return null;
    return { u, s: sA, xi: ax + u * ex, zi: az + u * ez };
  }
  /* forces from all members crossing one straight piece of slip surface */
  function segForces(M, mems, ax, az, bx, bz, list) {
    const ex = bx - ax, ez = bz - az, Ls = Math.hypot(ex, ez) || 1, ca = ex / Ls, sa = ez / Ls;
    for (let i = 0; i < mems.length; i++) {
      const c = crossMember(mems[i], ax, az, bx, bz);
      if (!c) continue;
      const f = memAct(M, mems[i], c.s, ca, sa);
      if (f.Tm > 0 || list.detail) list.push({ m: mems[i], xi: c.xi, zi: c.zi, s: c.s, ...f, Px: f.fx, Py: -f.fz });
    }
  }
  /* split a member force into the tangential part counted as resistance (passive) and the rest, applied as an external force */
  function splitForce(f, ca, sa) {
    let fx = f.fx, fz = f.fz, pt = 0;
    if (f.pas) { pt = fx * ca + fz * sa; fx -= pt * ca; fz -= pt * sa; }
    return { px: fx, py: -fz, pt };
  }

  /* pressure head u/γw on the slip surface at elevation z in interval v (z0: the same point in the centre profile)
     main water table: (zw − z)·cos²θ; piezometric line: (zpz − z)·cos²θ; ru: ru·σv/γw with σv the soil weight above; dry: 0 */
  function poreHead(ctx, pr, v, z, zwr, z0) {
    const P = ctx.M.layers[v.L].pore;
    if (!P) return zwr > z ? (zwr - z) * pr.cw : 0;
    if (P.type === 'piezo') { const h = pr.pz[P.k]; return h > z ? (h - z) * pr.cwp[P.k] : 0; }
    if (P.type === 'ru') return P.ru * (v.cum + v.g * (v.zt - z0)) / ctx.gw;
    return 0;
  }

  /* one slice: returns resisting and driving terms (reinforcement Py added to weight, Px handled by caller) */
  function sliceTerm(ctx, pr, b, zc, t, ca, sa, F, Py, out, Q, Qs, dzg, pz) {
    // pz (optional): actual ground zg, water level zw and pond thrust Hw of a partial sub-slice at a ground crossing;
    // the soil column is then taken from the centre profile at the same depth below the ground
    Q = Q || 0; Qs = Qs || 0;
    const M = ctx.M, s = ctx.s;
    out.act = false;
    if (pr.wiv.length) for (const w of pr.wiv) if (zc > w.zlo - 1e-9 && zc < w.zhi + 1e-9) { out.ok = false; out.wall = true; return; }
    const zg = pz ? pz.zg : pr.zg, zwr = pz ? pz.zw : pr.zwr;
    if (zc >= zg) { out.ok = true; return; }
    out.act = true;
    const zcW = pz ? zc - (zg - pr.zg) : zc;
    if (zcW < pr.zb - 1e-6) { out.ok = false; return; }
    let v = null;
    for (let m = 0; m < pr.iv.length; m++) if (zcW >= pr.iv[m].zbot) { v = pr.iv[m]; break; }
    if (!v) { out.ok = false; return; }
    const L = M.layers[v.L];
    if (L.bedrock) { out.ok = false; return; }
    const W = b * (v.cum + v.g * (v.zt - zcW) + (pr.wiv.length ? wallExtra(pr, zcW) : 0));
    // ponded water: its weight on the slice top and the horizontal component of the pressure on a sloping surface
    const zp = zwr > zg ? zwr - zg : 0;
    const Qw = zp > 0 ? ctx.gw * zp * b : 0, Hw = pz ? pz.Hw : (zp > 0 ? ctx.gw * zp * (dzg || 0) : 0);
    const Wv = W * (1 + s.kv) + Py + Q + s.kv * Qs + Qw;
    const hw = poreHead(ctx, pr, v, zc, zwr, zcW);
    const U = ctx.gw * hw * b;
    const tp = L.tanphi;
    const ma = ca + sa * tp / F;
    if (sa < 0 && ma < 0.2) { out.ok = false; return; }
    out.ok = true; out.W = W; out.U = U; out.hw = hw; out.L = L; out.ma = ma; out.Q = Q; out.Qw = Qw; out.zg = zg;
    // member forces (Py) are point loads: they are not clipped with the weight, so a concentrated uplift is summed exactly
    out.res = (L.c * b + (Math.max(0, Wv - Py - U) + Py) * tp) / (ca * ma);
    out.drv = Wv * t + s.kh * (W + Qs) - Hw;
  }

  /* evaluate one straight segment of the slip surface between column k (zl) and k+1 (zr) */
  const _st = {}, _fl = [], _pz = {};
  function segEval(ctx, k, zl, zr, F, out, rows, mlist) {
    const gp = ctx.gaps[k], s = ctx.s;
    const t = (zr - zl) / gp.dx, ca = 1 / Math.sqrt(1 + t * t), sa = t * ca;
    let A = 0, B = 0, act = false;
    const b = gp.b, nq = gp.subs.length;
    if (gp.walls.length) for (const w of gp.walls) if (segHitsPoly(w.P, ctx.xs[k], zl, ctx.xs[k + 1], zr)) { out.ok = false; out.wall = true; return; }
    // reinforcement crossings on this segment
    let fl = null;
    if (gp.mem.length) {
      _fl.length = 0; _fl.detail = !!mlist;
      segForces(ctx.M, gp.mem, ctx.xs[k], zl, ctx.xs[k + 1], zr, _fl);
      if (_fl.length) fl = _fl;
    }
    let pyq = null, pxSum = 0;
    if (fl) {
      pyq = new Float64Array(nq);
      // assign each crossing to its sub-slice; move to nearest active sub-slice if needed
      for (const f of fl) {
        let q = Math.min(nq - 1, Math.max(0, Math.floor((f.xi - ctx.xs[k]) / b)));
        f.q = q;
      }
    }
    const pxq = fl ? new Float64Array(nq) : null, ptq = fl ? new Float64Array(nq) : null;
    if (fl) for (const f of fl) { const sp = splitForce(f, ca, sa); pyq[f.q] += sp.py; pxq[f.q] += sp.px; ptq[f.q] += sp.pt; }
    const shiftQ = q => { if (pxq && (pxq[q] || pyq[q] || ptq[q])) { const nq2 = q + 1 < nq ? q + 1 : q - 1; if (nq2 >= 0) { pxq[nq2] += pxq[q]; pyq[nq2] += pyq[q]; ptq[nq2] += ptq[q]; } pxq[q] = 0; pyq[q] = 0; ptq[q] = 0; } };
    for (let q = 0; q < nq; q++) {
      const sb = gp.subs[q];
      let zc = zl + sb.off * t, bq = b, pz = null;
      // sub-slice cut by the ground surface: keep only the part below the ground, so that the water pressures on the
      // base and on the ground surface close exactly over the sliding mass (matters with deep ponded water)
      const dL = sb.zgL - (zc - 0.5 * b * t), dR = sb.zgR - (zc + 0.5 * b * t);
      if ((dL > 0) !== (dR > 0)) {
        const f = dL > 0 ? dL / (dL - dR) : dR / (dR - dL);
        const u0 = dL > 0 ? 0 : 1 - f, um = u0 + 0.5 * f;                 // active part [u0, u0+f] of the sub-slice, centre um
        bq = f * b; zc = zc + (um - 0.5) * b * t;
        const zg = sb.zgL + um * (sb.zgR - sb.zgL), zw = sb.zwL + um * (sb.zwR - sb.zwL);
        pz = _pz; pz.zg = zg; pz.zw = isFinite(zw) ? zw : -Infinity; pz.Hw = pz.zw > zg ? ctx.gw * (pz.zw - zg) * f * sb.dzg : 0;
      } else if (dL <= 0 && dR <= 0) { shiftQ(q); continue; }
      else if (sb.zwL > sb.zgL || sb.zwR > sb.zgR) {
        // whole sub-slice below the ground: pond thrust from the mean ground of its two edges (exact for a kinked ground)
        const zw = 0.5 * (sb.zwL + sb.zwR), zg = 0.5 * (sb.zgL + sb.zgR);
        pz = _pz; pz.zg = sb.pr.zg; pz.zw = sb.pr.zwr; pz.Hw = zw > zg ? ctx.gw * (zw - zg) * sb.dzg : 0;
      }
      sliceTerm(ctx, sb.pr, bq, zc, t, ca, sa, F, pyq ? pyq[q] : 0, _st, sb.Q, sb.Qs, sb.dzg, pz);
      if (!_st.ok) { out.ok = false; return; }
      if (!_st.act) {
        // force landed on an above-ground sub-slice: shift it to the neighbour
        shiftQ(q);
        continue;
      }
      act = true;
      let res = _st.res, drv = _st.drv;
      const px = pxq ? pxq[q] : 0;
      // external horizontal force reduces the driving force; a tangential passive force R adds R/mα to the resistance
      if (px) drv -= px;
      if (ptq && ptq[q]) res += ptq[q] / _st.ma;
      A += res; B += drv;
      if (rows) rows.push({ Q: sb.Q, xc: sb.xc, b: bq, zc, zg: _st.zg, alpha: Math.atan(t) * 180 / Math.PI, W: _st.W, U: _st.U, u: _st.U / b, hw: _st.hw, c: _st.L.c, phi: _st.L.phi, layer: _st.L.name, ma: _st.ma, res, drv, Px: px, Py: pyq ? pyq[q] : 0 });
    }
    if (mlist && fl) for (const f of fl) mlist.push({ ...f });
    out.ok = true; out.act = act; out.A = A; out.B = B;
  }

  /* dynamic programming: minimise G = Σ(A − λB)
     phases 0 = not yet entered, 1 = inside (min depth not reached), 2 = inside (depth reached), 3 = exited */
  function dp(ctx, lam) {
    const { N, NS, cols, gaps, s, inToe, inCrest, ctrl } = ctx;
    const inR = (x, r) => x >= r[0] - 1e-9 && x <= r[1] + 1e-9;
    // ground crossing of the chord between (xa, zi) and (xb, zj), ground taken as linear within the gap
    const crossX = (ca, cb, zi, zj, dx) => { const dA = zi - ca.zg, dB = zj - cb.zg; if ((dA >= 0) === (dB >= 0)) return dA < 0 ? ca.x : cb.x; return ca.x + dx * dA / (dA - dB); };
    // state = (column, node, phase, slope class). Phases: 0 not entered, 1 inside (shallow), 2 inside (deep enough), 3 exited.
    // With the concavity constraint each phase-1/2 state is split into K classes of the steepest slope reached so far (m).
    // A step is allowed when its slope is not below m by more than the slope error caused by rounding both ends to the
    // node grid; m never decreases, so the tolerance cannot accumulate into a concave shape.
    const P = 4, K = s.convex ? 36 : 1, PK = P * K, S = NS * PK, INF = Infinity, dmin = Math.max(0, +s.dmin || 0);
    const g = new Float64Array(N * S).fill(INF);
    const pred = new Int32Array(N * S).fill(-1);
    const crk = ctx.tc ? new Uint8Array(N * S) : null;   // 1 = this exited state was reached through a tension crack
    const slp = K > 1 ? new Float64Array(N * S) : null;
    const act1 = new Int32Array(K), act2 = new Int32Array(K);
    const cls = sc => { const b = Math.floor((Math.atan(sc) / Math.PI + 0.5) * K); return b < 0 ? 0 : b >= K ? K - 1 : b; };
    for (let j = 0; j < NS; j++) if (cols[0].allow[j]) g[j * PK] = 0;
    const out = {};
    for (let k = 0; k < N - 1; k++) {
      const ca = cols[k], cb = cols[k + 1], base = k * S, nb = (k + 1) * S;
      const dx = gaps[k].dx;
      for (let i = 0; i < NS; i++) {
        const o = base + i * PK;
        let any = false;
        for (let q = 0; q < PK; q++) if (g[o + q] !== INF) { any = true; break; }
        if (!any) continue;
        const zi = ca.z[i];
        const g0 = g[o], g3 = g[o + 3 * K];
        // active slope classes of this node (most classes are empty), so the inner loop stays short
        let n1 = 0, n2 = 0;
        if (slp) for (let b = 0; b < K; b++) { if (g[o + K + b] !== INF) act1[n1++] = o + K + b; if (g[o + 2 * K + b] !== INF) act2[n2++] = o + 2 * K + b; }
        for (let j = 0; j < NS; j++) {
          if (!cb.allow[j]) continue;
          const zj = cb.z[j];
          segEval(ctx, k, zi, zj, lam, out, null);
          if (!out.ok) continue;
          const tj = nb + j * PK;
          if (out.act) {
            const c = out.A - lam * out.B;
            let okEnter = inToe[k] === 2;
            if (inToe[k] === 1) okEnter = inR(zi < ca.zg ? ca.x : crossX(ca, cb, zi, zj, dx), ctrl.toe);
            if (zj >= cb.zg - 1e-9 && inCrest[k] !== 2) { if (inCrest[k] === 0 || !inR(crossX(ca, cb, zi, zj, dx), ctrl.crest)) continue; }
            const deep = cb.zg - zj >= dmin || dmin === 0;
            const sc = (zj - zi) / dx, ph = deep ? 2 : 1;
            if (!slp) {
              const idA = tj + ph, idB = tj + 2;
              if (g0 !== INF && okEnter && g0 + c < g[idA]) { g[idA] = g0 + c; pred[idA] = i * PK; }
              const v1 = g[o + 1], v2 = g[o + 2];
              if (v1 !== INF && v1 + c < g[idA]) { g[idA] = v1 + c; pred[idA] = i * PK + 1; }
              if (v2 !== INF && v2 + c < g[idB]) { g[idB] = v2 + c; pred[idB] = i * PK + 2; }
              continue;
            }
            const tol = 0.5 * (ca.dz + cb.dz) / dx + 1e-9;
            { const id = tj + ph * K + cls(sc); if (g0 !== INF && okEnter && g0 + c < g[id]) { g[id] = g0 + c; pred[id] = i * PK; slp[id] = sc; } }
            for (let q = 0; q < n1; q++) {
              const o1 = act1[q], s1 = slp[o1];
              if (sc >= s1 - tol) { const v1 = g[o1], m = sc > s1 ? sc : s1, id = tj + ph * K + cls(m); if (v1 + c < g[id]) { g[id] = v1 + c; pred[id] = o1 - base; slp[id] = m; } }
            }
            for (let q = 0; q < n2; q++) {
              const o2 = act2[q], s2 = slp[o2];
              if (sc >= s2 - tol) { const v2 = g[o2], m = sc > s2 ? sc : s2, id = tj + 2 * K + cls(m); if (v2 + c < g[id]) { g[id] = v2 + c; pred[id] = o2 - base; slp[id] = m; } }
            }
          } else {
            let id = tj;
            if (g0 < g[id]) { g[id] = g0; pred[id] = i * PK; }
            id = tj + 3 * K;
            for (let b = 0; b < K; b++) { const v2 = g[o + 2 * K + b]; if (v2 < g[id]) { g[id] = v2; pred[id] = i * PK + 2 * K + b; if (crk) crk[id] = 0; } }
            if (g3 < g[id]) { g[id] = g3; pred[id] = i * PK + 3 * K; if (crk) crk[id] = 0; }
          }
        }
        // tension crack: from a deep-enough state at the crack node, leave the ground through a vertical crack at x_k
        if (crk && ca.ci === i && k > 0 && (!ctrl.crest || inR(ca.x, ctrl.crest))) {
          let j0 = -1; for (let j = 0; j < NS; j++) if (cb.allow[j] && cb.z[j] >= cb.zg) { j0 = j; break; }
          if (j0 >= 0) {
            const id = nb + j0 * PK + 3 * K, cost = -lam * (ca.Pw || 0);
            for (let b = 0; b < K; b++) { const v2 = g[o + 2 * K + b]; if (v2 !== INF && v2 + cost < g[id]) { g[id] = v2 + cost; pred[id] = i * PK + 2 * K + b; crk[id] = 1; } }
          }
        }
      }
    }
    let best = INF, bi = -1;
    const lb = (N - 1) * S;
    for (let j = 0; j < NS; j++) for (let q = 2 * K; q < 3 * K + 1; q++) {
      if (q < 3 * K && ctrl.crest && cols[N - 1].z[j] < cols[N - 1].zg && !inR(cols[N - 1].x, ctrl.crest)) continue;
      const v = g[lb + j * PK + q];
      if (v < best) { best = v; bi = j * PK + q; }
    }
    if (bi < 0) return null;
    const z = new Float64Array(N), idx = new Int32Array(N);
    let cur = bi, crackK = -1;
    for (let k = N - 1; k >= 0; k--) {
      idx[k] = (cur / PK) | 0; z[k] = cols[k].z[idx[k]];
      if (crk && k > 0 && crk[k * S + cur]) crackK = k - 1;
      if (k > 0) cur = pred[k * S + cur];
    }
    return { G: best, z, idx, crackK };
  }

  function sums(ctx, z, F, rows, crackK) {
    let A = 0, B = 0; const out = {};
    const kEnd = crackK >= 0 ? crackK : ctx.N - 1;
    for (let k = 0; k < kEnd; k++) {
      segEval(ctx, k, z[k], z[k + 1], F, out, rows);
      if (!out.ok) return null;
      A += out.A; B += out.B;
    }
    if (crackK >= 0) B += ctx.cols[crackK].Pw || 0;
    return { A, B };
  }
  function janbuF(ctx, z, F0, crackK) {
    let F = F0 > 0 ? F0 : 1;
    for (let it = 0; it < 300; it++) {
      const r = sums(ctx, z, F, null, crackK);
      if (!r || !(r.B > 0)) return NaN;
      const Fn = r.A / r.B;
      if (!isFinite(Fn) || Fn <= 0) return NaN;
      if (Math.abs(Fn - F) < 1e-8) return Fn;
      F = it > 50 ? 0.5 * (F + Fn) : Fn;
    }
    return F;
  }

  /* generator: yields progress after each DP pass, returns final result */
  function* solve(model) {
    const ctx = prepare(model);
    const s = ctx.s, hist = [];
    for (const c of ctx.ctrl.pts) if (!c.nodes) return { ok: false, msg: `控制點「${c.name}」位於岩盤、模型底部以下或地表以上，沒有可通過的節點。`, hist };
    let lam = +s.F0 > 0 ? +s.F0 : 2, best = null, worse = 0;
    for (let it = 1; it <= s.maxIter; it++) {
      const p = dp(ctx, lam);
      if (!p) break;
      const F = janbuF(ctx, p.z, lam, p.crackK);
      hist.push({ it, lam, F, G: p.G });
      yield { it, lam, F, max: s.maxIter };
      if (!isFinite(F)) { lam *= 2; continue; }
      if (!best || F < best.F - 1e-12) { best = { F, z: p.z, crackK: p.crackK }; worse = 0; } else worse++;
      if (Math.abs(F - lam) < s.tol || worse >= 3) break;
      lam = F;
    }
    if (!best) {
      const c = ctx.ctrl;
      if (c.pts.length || c.toe || c.crest) return { ok: false, msg: '找不到同時通過所有控制點且符合出入口範圍的滑動面。請檢查控制點位置與容許範圍、出入口範圍，或取消凹形限制後再試。', hist };
      return { ok: false, msg: '找不到可行的滑動面。請檢查幾何與參數，或放寬搜尋限制。', hist };
    }
    let out = finalize(ctx, best, hist);
    const pts = out._pts, crack0 = out._crack; delete out._pts; delete out._crack;
    attachRig(ctx, out, pts, null, null, crack0);
    const kind = out.method;
    if (kind !== 'janbu' && s.optimize !== false) {
      const rf = yield* refine(ctx, pts, kind, out.rig[kind], !!crack0);
      if (rf && isFinite(rf.F)) {
        const o2 = evalSlip(ctx, rf.pts, 400, 'search', null, null, crackFor(ctx, crack0 ? rf.pts : null));
        const F1 = out.rig[kind].ok ? out.rig[kind].F : Infinity;
        if (o2.ok && o2.rig[kind].ok && o2.rig[kind].F < F1) {
          o2.hist = out.hist; o2.path = out.path; o2.grid = out.grid;
          o2.dp = { F: out.F, Fc: out.Fc, Fr: F1, slip: out.slip };
          o2.optEvals = rf.evals;
          out = o2;
        }
      }
    }
    return out;
  }

  function finalize(ctx, best, hist) {
    const { M, N, cols, gaps, xs } = ctx, z = best.z, F = best.F;
    const ck = best.crackK >= 0 ? best.crackK : -1, kEnd = ck >= 0 ? ck : N - 1;
    const rows = [], mlist = [];
    let sm = { A: 0, B: 0 };
    { const o2 = {}; for (let k = 0; k < kEnd; k++) { segEval(ctx, k, z[k], z[k + 1], F, o2, rows, mlist); sm.A += o2.A; sm.B += o2.B; } }
    if (ck >= 0) sm.B += cols[ck].Pw || 0;
    const zgAt = x => interp(M.ground, x);
    const chord = (k, x) => z[k] + (z[k + 1] - z[k]) * (x - xs[k]) / gaps[k].dx;
    // active range
    const act = [];
    const o = {};
    for (let k = 0; k < kEnd; k++) { segEval(ctx, k, z[k], z[k + 1], F, o, null); act.push(o.act); }
    const k0 = act.indexOf(true), k1 = act.lastIndexOf(true);
    const root = (k, a, b) => {
      let fa = chord(k, a) - zgAt(a);
      for (let it = 0; it < 60; it++) {
        const m = 0.5 * (a + b), fm = chord(k, m) - zgAt(m);
        if ((fa >= 0) === (fm >= 0)) { a = m; fa = fm; } else b = m;
      }
      return 0.5 * (a + b);
    };
    const pts = [];
    // left end (toe side)
    if (z[k0] >= cols[k0].zg - 1e-9) {
      // search from the left end of gap k0 toward the right for the first crossing
      const n = 40; let xa = xs[k0];
      for (let q = 1; q <= n; q++) {
        const xb = xs[k0] + gaps[k0].dx * q / n;
        if (chord(k0, xb) < zgAt(xb)) { const xr = root(k0, xa, xb); pts.push([xr, zgAt(xr)]); break; }
        xa = xb;
      }
      if (!pts.length) pts.push([xs[k0], z[k0]]);
    } else { pts.push([xs[k0], cols[k0].zg]); pts.push([xs[k0], z[k0]]); }
    for (let k = k0 + 1; k <= k1; k++) if (z[k] < cols[k].zg) pts.push([xs[k], z[k]]);
    // right end (crest side): a tension crack ends the surface at the crack bottom
    if (ck >= 0) { if (pts[pts.length - 1][0] < xs[ck] - 1e-9) pts.push([xs[ck], z[ck]]); }
    else if (z[k1 + 1] >= cols[k1 + 1].zg - 1e-9) {
      const n = 40; let xb = xs[k1 + 1], found = false;
      for (let q = n - 1; q >= 0; q--) {
        const xa = xs[k1] + gaps[k1].dx * q / n;
        if (chord(k1, xa) < zgAt(xa)) { const xr = root(k1, xa, xb); pts.push([xr, zgAt(xr)]); found = true; break; }
        xb = xa;
      }
      if (!found) pts.push([xs[k1 + 1], z[k1 + 1]]);
    } else { pts.push([xs[k1 + 1], z[k1 + 1]]); pts.push([xs[k1 + 1], cols[k1 + 1].zg]); }

    const out = summarize(ctx, pts, rows, F, mlist);
    out.hist = hist; out.sumA = sm.A; out.sumB = sm.B; out.mode = 'search'; out._pts = pts;
    out._crack = ck >= 0 ? crackFor(ctx, pts) : null;
    crackOut(ctx, out, out._crack);
    pondOut(ctx, out, pts);
    ctrlReport(ctx, out, pts);
    out.path = mapOut(M, Array.from(z).map((zz, k) => [xs[k], zz]));
    out.grid = cols.map(c => ({ x: M.mirror ? -c.x : c.x, z: Array.from(c.z) }));
    return out;
  }

  function mapOut(M, P) { const q = P.map(([x, zz]) => [M.mirror ? -x : x, zz]); return M.mirror ? q.reverse() : q; }

  /* area, depth, f0 and output mapping, shared by the search and the specified-surface check */
  function summarize(ctx, slip, rows, F, mlist) {
    const M = ctx.M;
    const zgAt = x => interp(M.ground, x);
    const xa = slip[0][0], xb = slip[slip.length - 1][0];
    let area = 0, dmaxV = 0;
    const nA = 600;
    for (let q = 0; q < nA; q++) {
      const x = xa + (xb - xa) * (q + 0.5) / nA;
      const h = zgAt(x) - interp(slip, x);
      if (h > 0) { area += h * (xb - xa) / nA; dmaxV = Math.max(dmaxV, h); }
    }
    const pA = slip[0], pB = slip[slip.length - 1];
    const Lc = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
    let dperp = 0;
    for (const p of slip) {
      const d = Math.abs((pB[0] - pA[0]) * (pA[1] - p[1]) - (pA[0] - p[0]) * (pB[1] - pA[1])) / (Lc || 1);
      dperp = Math.max(dperp, d);
    }
    const cz = rows.every(r => r.c === 0), fz = rows.every(r => r.phi === 0);
    const b1 = cz ? 0.31 : fz ? 0.69 : 0.5;
    const dl = Lc > 0 ? dperp / Lc : 0;
    const f0type = ctx.s.f0type === 'janbu' ? 'janbu' : 'pwri';
    const f0 = f0type === 'janbu' ? 1 + b1 * (dl - 1.4 * dl * dl) : (dl > 0 ? Math.pow(50 * dl, 0.03) : 1);
    const X = x => (M.mirror ? -x : x);
    const rowsOut = rows.map(r => ({ ...r, xc: X(r.xc), alpha: M.mirror ? -r.alpha : r.alpha }));
    if (M.mirror) rowsOut.reverse();
    // members: one entry per member (first crossing from its head)
    const seen = new Map();
    for (const f of (mlist || [])) { const prev = seen.get(f.m.idx); if (!prev || f.s < prev.s) seen.set(f.m.idx, f); }
    const members = M.reinf.map(m => {
      const f = seen.get(m.idx);
      if (!f) return { idx: m.idx, type: m.type, name: m.name, crossed: false, T: 0, Tm: 0, Px: 0, Py: 0, ctrl: '未穿過滑動面' };
      return { idx: m.idx, type: m.type, name: m.name, crossed: true, xi: X(f.xi), zi: f.zi, s: f.s, Le: f.Le, T: f.T, Tm: f.Tm, ctrl: f.ctrl, Px: M.mirror ? -f.Px : f.Px, Py: f.Py, H: f.H, Lr: f.Lr, Na: f.Na, V: f.V };
    });
    const Qtot = rows.reduce((a, r) => a + (r.Q || 0), 0);
    return {
      ok: true, F, f0, f0type, Fc: F * f0, b1, dL: dl, area, dmaxV, Lc, Qtot, nLoads: (M.loads || []).length,
      slip: mapOut(M, slip), rows: rowsOut, members, mirror: M.mirror, reinfMode: ctx.s.reinfMode === 'passive' ? 'passive' : 'active',
      facing: M.mirror ? '坡面朝右（向右滑動）' : '坡面朝左（向左滑動）'
    };
  }

  /* ===================== rigorous methods: Spencer and Morgenstern–Price (GLE) ===================== */

  /* clip a polyline (internal frame) to the part below the ground surface; returns slip points or null */
  function clipSlip(M, poly) {
    const zgAt = x => interp(M.ground, x);
    const gx0 = M.ground[0][0], gx1 = M.ground[M.ground.length - 1][0];
    const px0 = Math.max(poly[0][0], gx0), px1 = Math.min(poly[poly.length - 1][0], gx1);
    const h = x => interp(poly, x) - zgAt(x);
    const ns = 4000; let ia = -1, ib = -1;
    for (let i = 0; i <= ns; i++) { const x = px0 + (px1 - px0) * i / ns; if (h(x) < -1e-9) { if (ia < 0) ia = i; ib = i; } }
    if (ia < 0) return null;
    const bis = (a, b) => { let fa = h(a); for (let k = 0; k < 60; k++) { const m = (a + b) / 2, fm = h(m); if ((fa >= 0) === (fm >= 0)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; };
    const xa = ia > 0 ? bis(px0 + (px1 - px0) * (ia - 1) / ns, px0 + (px1 - px0) * ia / ns) : px0;
    const xb = ib < ns ? bis(px0 + (px1 - px0) * (ib + 1) / ns, px0 + (px1 - px0) * ib / ns) : px1;
    const slip = [[xa, interp(poly, xa)], ...poly.filter(p => p[0] > xa + 1e-9 && p[0] < xb - 1e-9), [xb, interp(poly, xb)]];
    if (ia === 0) slip.unshift([xa, zgAt(xa)]);
    if (ib === ns) slip.push([xb, zgAt(xb)]);
    return slip;
  }

  /* slices along a polyline slip surface; split at every geometric break so piecewise-linear weights integrate exactly */
  function buildSlices(ctx, slip, nSlice) {
    const M = ctx.M;
    const xa = slip[0][0], xb = slip[slip.length - 1][0];
    const n = Math.max(20, nSlice || 400), h0 = (xb - xa) / n;
    const brk = new Set([xa, xb]);
    const addB = P => (P || []).forEach(p => { if (p[0] > xa && p[0] < xb) brk.add(p[0]); });
    addB(slip); addB(M.ground); addB(M.water); M.layers.forEach(L => addB(L.top)); M.walls.forEach(w => addB(w.P));
    M.loads.forEach(l => addB(l.type === 'line' ? [[l.x, 0]] : [[l.xa, 0], [l.xb, 0]]));
    const bx = [...brk].sort((p, q) => p - q), edges = [];
    for (let i = 0; i + 1 < bx.length; i++) { const m = Math.max(1, Math.ceil((bx[i + 1] - bx[i]) / h0 - 1e-9)); for (let q = 0; q < m; q++) edges.push(bx[i] + (bx[i + 1] - bx[i]) * q / m); }
    edges.push(xb);
    const sl = [];
    let j = 0;
    for (let i = 0; i + 1 < edges.length; i++) {
      const xc = (edges[i] + edges[i + 1]) / 2, bw = edges[i + 1] - edges[i];
      if (bw < 1e-9) continue;
      while (j < slip.length - 2 && slip[j + 1][0] <= xc) j++;
      const dxs = slip[j + 1][0] - slip[j][0];
      const t = dxs > 1e-12 ? (slip[j + 1][1] - slip[j][1]) / dxs : 0;
      const ld = loadOn(M, edges[i], edges[i + 1], i + 2 === edges.length);
      sl.push({ xc, b: bw, x0: edges[i], zc: interp(slip, xc), t, ca: 1 / Math.sqrt(1 + t * t), sa: t / Math.sqrt(1 + t * t), pr: profileAt(M, xc), Px: 0, Py: 0, Pt: 0, cross: null, Q: ld.Q, Qs: ld.Qs, dzg: interp(M.ground, edges[i + 1]) - interp(M.ground, edges[i]) });
    }
    const mlist = []; mlist.detail = true;
    if (M.reinf.length) for (let k = 0; k < slip.length - 1; k++) segForces(M, M.reinf, slip[k][0], slip[k][1], slip[k + 1][0], slip[k + 1][1], mlist);
    // keep the first crossing of each member (from its head)
    const first = new Map();
    for (const f of mlist) { const p = first.get(f.m.idx); if (!p || f.s < p.s) first.set(f.m.idx, f); }
    for (const f of first.values()) {
      let i = 0; while (i < sl.length - 1 && sl[i + 1].x0 <= f.xi) i++;
      // move the force to the nearest slice below ground
      let k = i; if (sl[k].zc >= sl[k].pr.zg) { for (let d = 1; d < sl.length; d++) { if (i - d >= 0 && sl[i - d].zc < sl[i - d].pr.zg) { k = i - d; break; } if (i + d < sl.length && sl[i + d].zc < sl[i + d].pr.zg) { k = i + d; break; } } }
      const sp = splitForce(f, sl[k].ca, sl[k].sa);
      sl[k].Px += sp.px; sl[k].Py += sp.py; sl[k].Pt += sp.pt; (sl[k].cross = sl[k].cross || []).push({ x: f.xi, z: f.zi, fx: f.fx, fz: f.fz, pas: f.pas });
    }
    return { sl, members: Array.from(first.values()) };
  }

  /* weight centroid elevation of a slice column above the base zc (soil and walls) */
  function colCentroid(pr, zc) {
    let w = 0, m = 0;
    for (const v of pr.iv) {
      const hi = v.zt, lo = Math.max(v.zbot, zc); if (hi <= lo) continue;
      w += v.g * (hi - lo); m += v.g * (hi - lo) * (hi + lo) / 2;
    }
    for (const wl of pr.wiv) {
      const lo = Math.max(wl.zlo, zc); if (wl.zhi <= lo) continue;
      w += wl.g * (wl.zhi - lo); m += wl.g * (wl.zhi - lo) * (wl.zhi + lo) / 2;
      // remove the soil the wall replaces
      for (const v of pr.iv) {
        const hi = Math.min(v.zt, wl.zhi, pr.zg), lo2 = Math.max(v.zbot, lo); if (hi <= lo2) continue;
        w -= v.g * (hi - lo2); m -= v.g * (hi - lo2) * (hi + lo2) / 2;
      }
    }
    return w > 0 ? m / w : zc;
  }

  /* per-slice data that do not depend on F; returns {ok, ...arrays} or {ok:false, why} */
  function rigPrep(ctx, sl, crack) {
    const M = ctx.M, s = ctx.s, kh = +s.kh || 0, kv = +s.kv || 0, passive = s.reinfMode === 'passive';
    const A = [];
    for (const c of sl) {
      const pr = c.pr, zc = c.zc, b = c.b;
      if (pr.wiv.length) for (const w of pr.wiv) if (zc > w.zlo - 1e-9 && zc < w.zhi + 1e-9) return { ok: false, why: 'wall' };
      if (zc >= pr.zg) continue;                       // above ground: not part of the sliding mass
      if (zc < pr.zb - 1e-6) return { ok: false, why: 'base' };
      let v = null;
      for (let m = 0; m < pr.iv.length; m++) if (zc >= pr.iv[m].zbot) { v = pr.iv[m]; break; }
      if (!v) return { ok: false, why: 'base' };
      const L = M.layers[v.L];
      if (L.bedrock) return { ok: false, why: 'base' };
      const W = b * (v.cum + v.g * (v.zt - zc) + (pr.wiv.length ? wallExtra(pr, zc) : 0));
      const hw = poreHead(ctx, pr, v, zc, pr.zwr, zc);
      const U = ctx.gw * hw * b;                       // pore force on the horizontal projection (u·b)
      const ca = c.ca, sa = c.sa;
      const yc = colCentroid(pr, zc);
      const Qw = pr.zp > 0 ? ctx.gw * pr.zp * b : 0, Hw = pr.zp > 0 ? ctx.gw * pr.zp * (c.dzg || 0) : 0;
      let Fx = -kh * (W + c.Qs) + Hw, Fy = -(W * (1 + kv) + c.Q + kv * c.Qs + Qw);
      let Mx = kh * W * (yc - zc) + kh * c.Qs * (pr.zs - zc) - (pr.zg - zc) * Hw;
      let Pt = 0;
      if (c.cross) for (const r of c.cross) {
        // member force on the sliding mass; its tangential part counts as resistance when passive
        let fx = r.fx, fy = r.fz;
        if (r.pas) { const pt = fx * ca + fy * sa; Pt += pt; fx -= pt * ca; fy -= pt * sa; }
        Fx += fx; Fy += fy; Mx += (r.x - c.xc) * fy - (r.z - zc) * fx;
      }
      A.push({ xl: c.x0, xr: c.x0 + b, xm: c.xc, zm: zc, b, ca, sa, cl: L.c * b / ca, Ul: U / ca, tp: L.tanphi, Fx, Fy, Mx, Pt, W, U, L, hw, Q: c.Q, Px: c.Px, Py: c.Py });
    }
    if (!A.length) return { ok: false, why: 'empty' };
    if (crack && crack.Pw > 0) {
      // water in the tension crack pushes the mass toward the toe; it acts at one third of the water depth
      const a = A[A.length - 1], za = crack.zb + crack.dw / 3;
      a.Fx -= crack.Pw; a.Mx += (za - a.zm) * crack.Pw;
    }
    let Ws = 0; for (const a of A) Ws += Math.abs(a.Fy) + Math.abs(a.Fx);
    return { ok: true, A, Ws, x0: A[0].xl, x1: A[A.length - 1].xr };
  }

  /* march through the slices for given F and λ; returns the force imbalance at the last slice and the moment residual */
  function gleMarch(P, F, lam, f, keep) {
    const A = P.A, n = A.length;
    let E = 0, X = 0, RM = 0;
    const Es = keep ? new Float64Array(n) : null, Xs = keep ? new Float64Array(n) : null, Ns = keep ? new Float64Array(n) : null;
    for (let i = 0; i < n; i++) {
      const a = A[i], tf = a.tp / F, cF = (a.cl - a.Ul * a.tp + a.Pt) / F;
      const a1 = -a.sa + tf * a.ca, a2 = a.ca + tf * a.sa;
      const r1 = -(E + a.Fx + cF * a.ca), r2 = -(X + a.Fy + cF * a.sa);
      const fi = f[i + 1], det = a2 - lam * fi * a1;
      if (!(Math.abs(det) > 1e-12)) return null;
      const N = (r2 - lam * fi * r1) / det;
      const En = a1 * N - r1, Xn = lam * fi * En;
      RM += a.Mx;
      if (i < n - 1) { const b2 = A[i + 1]; RM += En * (b2.zm - a.zm) - Xn * (b2.xm - a.xm); }
      if (keep) { Es[i] = En; Xs[i] = Xn; Ns[i] = N; }
      E = En; X = Xn;
    }
    return { En: E, RM, Es, Xs, Ns };
  }

  /* solve force and moment equilibrium for F and λ (Spencer: f = 1; Morgenstern–Price: half-sine f) */
  function gle(P, kind, F0, lam0, fast) {
    const A = P.A, n = A.length, Lx = Math.max(1e-6, P.x1 - P.x0), S1 = P.Ws, S2 = P.Ws * Lx;
    const f = new Float64Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const x = k < n ? A[k].xl : A[n - 1].xr;
      f[k] = kind === 'mp' ? Math.sin(Math.PI * Math.min(1, Math.max(0, (x - P.x0) / Lx))) : 1;
    }
    const res = (F, l) => { const r = gleMarch(P, F, l, f); return r ? [r.En / S1, r.RM / S2] : null; };
    const done = (F, l) => {
      const r = gleMarch(P, F, l, f, true);
      // reject solutions with a failing slice base (mα check as in the Janbu routine)
      // reject solutions where a slice base is near the singular state of the slice equations (generalised mα check)
      for (let i = 0; i < n; i++) {
        const a = A[i], tf = a.tp / F, d = (a.ca + tf * a.sa) - l * f[i + 1] * (-a.sa + tf * a.ca);
        if (d < 0.05 || (a.sa < 0 && a.ca + a.sa * tf < 0.2)) return { ok: false, F, lam: l, why: 'ma' };
      }
      return { ok: true, F, lam: l, E: r.Es, X: r.Xs, N: r.Ns, f };
    };
    // Newton iteration on (F, λ) with a backtracking line search
    const nrm = r => Math.hypot(r[0], r[1]);
    const newton = (F, l) => {
      let r = res(F, l); if (!r) return null;
      for (let it = 0; it < 60; it++) {
        if (Math.abs(r[0]) < 1e-10 && Math.abs(r[1]) < 1e-10) return [F, l];
        const hF = 1e-7 * Math.max(1, F), hl = 1e-7;
        const rF = res(F + hF, l), rl = res(F, l + hl); if (!rF || !rl) return null;
        const j11 = (rF[0] - r[0]) / hF, j12 = (rl[0] - r[0]) / hl, j21 = (rF[1] - r[1]) / hF, j22 = (rl[1] - r[1]) / hl;
        const det = j11 * j22 - j12 * j21; if (!(Math.abs(det) > 1e-300)) return null;
        let dF = -(r[0] * j22 - j12 * r[1]) / det, dl = -(j11 * r[1] - j21 * r[0]) / det;
        const sc = Math.max(1, Math.abs(dF) / (0.25 * F), Math.abs(dl) / 0.25);
        dF /= sc; dl /= sc;
        let t = 1, ok = false;
        for (let k = 0; k < 20; k++) {
          const F2 = F + t * dF, l2 = l + t * dl;
          if (F2 > 0.01 && Math.abs(l2) < 5) { const r2 = res(F2, l2); if (r2 && nrm(r2) < (1 - 1e-4 * t) * nrm(r)) { F = F2; l = l2; r = r2; ok = true; break; } }
          t /= 2;
        }
        if (!ok) return null;
      }
      return null;
    };
    const accept = sol => { if (!sol) return null; const d = done(sol[0], sol[1]); return d.ok ? d : null; };
    const F0g = F0 > 0 ? F0 : 1.5, l0 = isFinite(lam0) ? lam0 : 0.3;
    const starts = [[F0g, l0], [F0g, 0.3], [F0g * 1.05, 0.5], [F0g * 0.95, 0.15], [F0g, 0], [F0g * 1.15, 0.8], [F0g * 0.85, -0.2]];
    for (const [a, b] of (fast ? starts.slice(0, 3) : starts)) { const d = accept(newton(a, b)); if (d) return d; }
    if (fast) return { ok: false, why: 'noconv' };
    // fallback: for each λ take the force-equilibrium F nearest the start value, then bracket the moment residual in λ
    const Ff = lam => {
      const g = F => { const r = gleMarch(P, F, lam, f); return r ? r.En : NaN; };
      let best = null;
      for (const dir of [1, -1]) {
        let Fp = F0g, gp = g(Fp);
        for (let k = 1; k <= 120; k++) {
          const Fk = F0g * Math.pow(1.03, dir * k), gk = g(Fk);
          if (isFinite(gk) && isFinite(gp) && (gk > 0) !== (gp > 0)) { const br = dir > 0 ? [Fp, Fk] : [Fk, Fp]; if (!best || k < best.k) best = { k, br }; break; }
          Fp = Fk; gp = gk;
        }
      }
      if (!best) return NaN;
      let [lo, hi] = best.br, glo = g(lo);
      for (let k = 0; k < 80; k++) { const m = 0.5 * (lo + hi), gm = g(m); if (!isFinite(gm)) return NaN; if ((gm > 0) === (glo > 0)) { lo = m; glo = gm; } else hi = m; if (hi - lo < 1e-12 * hi) break; }
      return 0.5 * (lo + hi);
    };
    const gM = lam => { const Fl = Ff(lam); if (!isFinite(Fl)) return NaN; const r = gleMarch(P, Fl, lam, f); return r ? r.RM : NaN; };
    let pl = 0, pg = gM(0), found = null;
    for (let k = 1; k <= 80 && !found; k++) {
      for (const sg of [1, -1]) {
        const la = sg * (k - 1) * 0.025, lb = sg * k * 0.025, ga = gM(la), gb = gM(lb);
        if (isFinite(ga) && isFinite(gb) && (ga > 0) !== (gb > 0)) { found = [Math.min(la, lb), Math.max(la, lb)]; break; }
      }
    }
    if (!found) return { ok: false, why: 'noconv' };
    let [la, lb] = found, ga = gM(la);
    for (let k = 0; k < 60; k++) { const m = 0.5 * (la + lb), gm = gM(m); if (!isFinite(gm)) break; if ((gm > 0) === (ga > 0)) { la = m; ga = gm; } else lb = m; if (lb - la < 1e-10) break; }
    const lam = 0.5 * (la + lb), Fl = Ff(lam);
    if (!isFinite(Fl)) return { ok: false, why: 'noconv' };
    const d = accept(newton(Fl, lam));
    return d || { ok: false, why: 'noconv' };
  }

  /* rigorous factor of safety of one slip polyline (internal frame) */
  function rigF(ctx, slip, kind, n, warm, fast, crack) {
    const bs = buildSlices(ctx, slip, n);
    const P = rigPrep(ctx, bs.sl, crack);
    if (!P.ok) return { ok: false, why: P.why };
    return gle(P, kind, warm ? warm.F : 1.5, warm ? warm.lam : 0.3, fast);
  }

  /* Douglas–Peucker simplification of a polyline */
  function simplify(P, tol) {
    if (P.length <= 2) return P.slice();
    const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
    const st = [[0, P.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let dm = -1, im = -1;
      const ax = P[a][0], az = P[a][1], bx = P[b][0], bz = P[b][1], L = Math.hypot(bx - ax, bz - az) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (az - P[i][1]) - (ax - P[i][0]) * (bz - az)) / L; if (d > dm) { dm = d; im = i; } }
      if (dm > tol) { keep[im] = 1; st.push([a, im], [im, b]); }
    }
    return P.filter((_, i) => keep[i]);
  }

  /* local optimisation of the slip surface for a rigorous method (pattern search on vertex elevations and end points) */
  function* refine(ctx, pts0, kind, warm0, hasCrack) {
    const M = ctx.M, zgAt = x => interp(M.ground, x);
    const gx0 = M.ground[0][0], gx1 = M.ground[M.ground.length - 1][0];
    const depth = Math.max(0.5, Math.max(...pts0.map(p => zgAt(p[0]) - p[1])));
    // clean the start surface: strictly increasing x, interior vertices strictly below ground, end points on the ground
    const P0 = [];
    for (const p of pts0) { const q = [p[0], p[1]]; if (P0.length && q[0] <= P0[P0.length - 1][0] + 1e-3) { if (P0.length === 1) { P0[0] = q; continue; } q[0] = P0[P0.length - 1][0] + 1e-2; } P0.push(q); }
    if (P0.length < 2) return { pts: pts0, F: NaN, evals: 0 };
    const crackZ = x => zgAt(x) - crackDepth(M, ctx.s, x);
    P0[0][1] = zgAt(P0[0][0]); P0[P0.length - 1][1] = hasCrack ? P0[P0.length - 1][1] : zgAt(P0[P0.length - 1][0]);
    for (let i = 1; i < P0.length - 1; i++) P0[i][1] = Math.min(P0[i][1], zgAt(P0[i][0]) - 0.01);
    let P = simplify(P0, depth * 0.01);
    // keep a vertex at every control point
    for (const c of (ctx.ctrl ? ctx.ctrl.pts : [])) if (c.x > P[0][0] && c.x < P[P.length - 1][0] && !P.some(p => Math.abs(p[0] - c.x) < 1e-6)) { P.push([c.x, interp(P0, c.x)]); P.sort((a, b) => a[0] - b[0]); }
    // at least 8 vertices: add midpoints of the longest segments
    while (P.length < 8) { let k = 0, dm = -1; for (let i = 0; i + 1 < P.length; i++) { const d = P[i + 1][0] - P[i][0]; if (d > dm) { dm = d; k = i; } } P.splice(k + 1, 0, [(P[k][0] + P[k + 1][0]) / 2, (P[k][1] + P[k + 1][1]) / 2]); }
    const NS = 120;
    let warm = warm0 && warm0.ok ? { F: warm0.F, lam: warm0.lam } : null, evals = 0;
    // concavity: segment inclination should not decrease along x by more than the tolerance (or than the start surface does)
    const viol = Q => { let v = 0, prev = -Infinity; for (let i = 0; i + 1 < Q.length; i++) { const a = Math.atan2(Q[i + 1][1] - Q[i][1], Q[i + 1][0] - Q[i][0]); if (prev - a > v) v = prev - a; prev = Math.max(prev, a); } return v; };
    let vmax = Infinity;
    const C = ctx.ctrl || { pts: [] };
    const feasible = Q => {
      if (ctx.s.convex && viol(Q) > vmax) return false;
      for (const c of C.pts) { if (c.x <= Q[0][0] || c.x >= Q[Q.length - 1][0]) return false; if (Math.abs(interp(Q, c.x) - c.z) > c.tol + 1e-6) return false; }
      if (C.toe && (Q[0][0] < C.toe[0] - 1e-6 || Q[0][0] > C.toe[1] + 1e-6)) return false;
      if (C.crest && (Q[Q.length - 1][0] < C.crest[0] - 1e-6 || Q[Q.length - 1][0] > C.crest[1] + 1e-6)) return false;
      for (let i = 1; i < Q.length - 1; i++) if (!(Q[i][1] < zgAt(Q[i][0]) - 1e-3)) return false;
      for (let i = 0; i + 1 < Q.length; i++) if (!(Q[i + 1][0] > Q[i][0] + 1e-3)) return false;
      for (const w of M.walls) for (let i = 0; i + 1 < Q.length; i++) if (segHitsPoly(w.P, Q[i][0], Q[i][1], Q[i + 1][0], Q[i + 1][1])) return false;
      return true;
    };
    const obj = Q => {
      if (!feasible(Q)) return Infinity;
      evals++;
      const r = rigF(ctx, Q, kind, NS, warm, true, hasCrack ? crackFor(ctx, Q) : null);
      if (!r.ok || !(r.F > 0) || Math.abs(r.lam) > 3) return Infinity;
      warm = r; return r.F;
    };
    vmax = Math.max(3 * Math.PI / 180, viol(P) + 1e-9);
    let best = obj(P);
    if (!isFinite(best)) { warm = warm0 && warm0.ok ? { F: warm0.F, lam: warm0.lam } : null; best = obj(P); }
    if (!isFinite(best)) return { pts: pts0, F: NaN, evals };
    const span = P[P.length - 1][0] - P[0][0];
    for (let pass = 0; pass < 2; pass++) {
      let stepZ = depth * (pass ? 0.05 : 0.15), stepX = span * (pass ? 0.01 : 0.03);
      let round = 0;
      while (stepZ > depth * 0.002 && evals < 2500) {
        let improved = false;
        for (let i = 0; i < P.length; i++) {
          for (const sg of [1, -1]) {
            const Q = P.map(p => p.slice());
            if (i === 0 || i === P.length - 1) {
              const x = Math.min(gx1, Math.max(gx0, Q[i][0] + sg * stepX)); Q[i] = [x, i > 0 && hasCrack ? crackZ(x) : zgAt(x)];
            } else Q[i][1] += sg * stepZ;
            const v = obj(Q);
            if (v < best - 1e-7) { best = v; P = Q; improved = true; break; }
          }
        }
        if (!improved) { stepZ /= 2; stepX /= 2; }
        round++;
        if (round % 4 === 0) yield { it: round, F: best, opt: true };
      }
      if (pass === 0) {
        // refine the vertex set: add midpoints, then search again with smaller steps
        const R = [P[0]];
        for (let i = 1; i < P.length; i++) { if (P.length + R.length < 40) R.push([(P[i - 1][0] + P[i][0]) / 2, (P[i - 1][1] + P[i][1]) / 2]); R.push(P[i]); }
        if (feasible(R)) { const v = obj(R); if (isFinite(v)) { P = R; best = Math.min(best, v); } }
      }
    }
    return { pts: P, F: best, evals };
  }

  /* rigorous factors of safety on a slip polyline (internal frame), attached to an output object */
  function attachRig(ctx, out, slip, sl, only, crack) {
    const P = rigPrep(ctx, sl || buildSlices(ctx, slip, 400).sl, crack);
    const r0 = { ok: false, why: P.why };
    let sp = r0, mp = r0;
    if (P.ok) {
      const F0 = out.Fc > 0 ? out.Fc : out.F;
      if (!only || only === 'spencer') sp = gle(P, 'spencer', F0, 0);
      if (!only || only === 'mp') mp = gle(P, 'mp', sp.ok ? sp.F : F0, sp.ok ? sp.lam : 0);
    }
    const pick = g => g.ok ? { ok: true, F: g.F, lam: g.lam } : { ok: false, why: g.why || 'noconv' };
    out.rig = { spencer: pick(sp), mp: pick(mp) };
    out.method = ['spencer', 'mp'].includes(ctx.s.method) ? ctx.s.method : 'janbu';
    if (P.ok && out.rows && out.rows.length === P.A.length) {
      const g = out.method === 'mp' ? mp : sp;
      if (g.ok) { const n = P.A.length; out.rows.forEach((row, k) => { const i = ctx.M.mirror ? n - 1 - k : k; row.E = g.E[i]; row.X = ctx.M.mirror ? -g.X[i] : g.X[i]; }); }
    }
    return out;
  }

  /* Janbu, Spencer and Morgenstern–Price on one slip polyline (internal frame) */
  function evalSlip(ctx, slip, nSlice, mode, bs0, only, crack) {
    const M = ctx.M, s = ctx.s;
    for (const w of M.walls) for (let j = 0; j < slip.length - 1; j++) if (segHitsPoly(w.P, slip[j][0], slip[j][1], slip[j + 1][0], slip[j + 1][1])) return { ok: false, msg: '指定滑動面穿過擋土牆。擋土牆設為不可穿越，請讓滑動面從牆底下或牆後方通過。' };
    const bs = bs0 || buildSlices(ctx, slip, nSlice), sl = bs.sl;
    const st = {};
    const run = (F, rows) => {
      st.wall = false;
      let A = 0, B = 0;
      for (const c of sl) {
        sliceTerm(ctx, c.pr, c.b, c.zc, c.t, c.ca, c.sa, F, c.Py, st, c.Q, c.Qs, c.dzg);
        if (!st.ok) return null;
        if (!st.act) continue;
        let res = st.res, drv = st.drv;
        if (c.Px) drv -= c.Px;
        if (c.Pt) res += c.Pt / st.ma;
        A += res; B += drv;
        if (rows) rows.push({ Q: c.Q, xc: c.xc, b: c.b, zc: c.zc, zg: c.pr.zg, alpha: Math.atan(c.t) * 180 / Math.PI, W: st.W, U: st.U, u: st.U / c.b, hw: st.hw, c: st.L.c, phi: st.L.phi, layer: st.L.name, li: M.layers.indexOf(st.L), ma: st.ma, res, drv, Px: c.Px, Py: c.Py });
      }
      if (crack) B += crack.Pw;
      return { A, B };
    };
    let F = +s.F0 > 0 ? +s.F0 : 1.5, r = null;
    for (let it = 0; it < 500; it++) {
      r = run(F);
      if (!r) return { ok: false, msg: st.wall ? '指定滑動面穿過擋土牆。擋土牆設為不可穿越，請讓滑動面從牆底下或牆後方通過。' : '指定滑動面穿過岩盤、低於模型底部，或坡趾處切片的 mα 過小，無法計算。' };
      if (!(r.B > 0)) return { ok: false, msg: '這條滑動面的滑動力小於等於零（補強力大於滑動力），安全係數無意義。' };
      const Fn = r.A / r.B;
      if (Math.abs(Fn - F) < 1e-9) { F = Fn; break; }
      F = it > 50 ? 0.5 * (F + Fn) : Fn;
    }
    const rows = []; const fin = run(F, rows);
    const out = summarize(ctx, slip, rows, F, bs.members);
    out.sumA = fin.A; out.sumB = fin.B; out.hist = []; out.mode = mode || 'trial';
    attachRig(ctx, out, slip, sl, only, crack);
    ctrlReport(ctx, out, slip);
    crackOut(ctx, out, crack);
    pondOut(ctx, out, slip);
    return out;
  }
  function crackOut(ctx, out, crack) {
    if (!crack) return;
    out.crack = { x: ctx.M.mirror ? -crack.x : crack.x, zb: crack.zb, zg: crack.zg, d: crack.dw, water: !!(ctx.tc && ctx.tc.water), Pw: crack.Pw };
  }
  /* horizontal thrust of ponded water on the ground surface of the sliding mass (for the output only) */
  function pondOut(ctx, out, slip) {
    const M = ctx.M; if (M.water.length < 2 || !slip || slip.length < 2) return;
    const xa = slip[0][0], xb = slip[slip.length - 1][0], n = 400; let H = 0;
    for (let i = 0; i < n; i++) {
      const a = xa + (xb - xa) * i / n, b = xa + (xb - xa) * (i + 1) / n, za = interp(M.ground, a), zb = interp(M.ground, b), xm = 0.5 * (a + b);
      const d = interp(M.water, xm) - 0.5 * (za + zb); if (d > 0) H += ctx.gw * d * (zb - za);
    }
    if (Math.abs(H) > 1e-6) out.pond = Math.abs(H);
  }
  /* cut a slip polyline (internal frame) at the tension crack line near its crest end */
  function cutCrack(ctx, slip) {
    if (!ctx.tc) return { slip, crack: null };
    const M = ctx.M, xa = slip[0][0], xb = slip[slip.length - 1][0];
    const f = x => (interp(M.ground, x) - interp(slip, x)) - crackDepth(M, ctx.s, x);   // >= 0 where the surface is below the crack line
    const n = 400; let xc = null;
    for (let q = n - 1; q >= 0; q--) {
      const x = xa + (xb - xa) * q / n;
      if (f(x) >= 0) { let a = x, b = xa + (xb - xa) * (q + 1) / n; for (let it = 0; it < 60; it++) { const m = 0.5 * (a + b); if (f(m) >= 0) a = m; else b = m; } xc = a; break; }
    }
    if (xc === null || xc <= xa + 1e-6) return { slip, crack: null };
    const cut = [...slip.filter(p => p[0] < xc - 1e-9), [xc, interp(slip, xc)]];
    return { slip: cut, crack: crackFor(ctx, cut) };
  }

  /* how the slip surface passes the control points (output in user coordinates) */
  function ctrlReport(ctx, out, slip) {
    const c = ctx.ctrl || prepCtrl(ctx);
    if (!c || (!c.pts.length && !c.toe && !c.crest)) return;
    const M = ctx.M, X = x => (M.mirror ? -x : x);
    out.ctrl = {
      pts: c.pts.map(p => { const inside = p.x > slip[0][0] && p.x < slip[slip.length - 1][0], zs = inside ? interp(slip, p.x) : NaN; return { name: p.name, i: p.i, x: X(p.x), z: p.z, tol: p.tol, zs, dz: zs - p.z, ok: inside && Math.abs(zs - p.z) <= p.tol + 1e-3 }; }),
      toe: c.toe ? { r: M.mirror ? [-c.toe[1], -c.toe[0]] : c.toe, x: X(slip[0][0]), ok: slip[0][0] >= c.toe[0] - 1e-3 && slip[0][0] <= c.toe[1] + 1e-3 } : null,
      crest: c.crest ? { r: M.mirror ? [-c.crest[1], -c.crest[0]] : c.crest, x: X(slip[slip.length - 1][0]), ok: slip[slip.length - 1][0] >= c.crest[0] - 1e-3 && slip[slip.length - 1][0] <= c.crest[1] + 1e-3 } : null
    };
  }
  function prepCtrl(ctx) { return ctx.M.ctrl || null; }

  /* safety factor of one user-specified slip surface (no search) */
  function evaluate(model, polyIn, nSlice) {
    const ctx = prepare(Object.assign({}, model, { settings: Object.assign({}, model.settings, { nCol: 8, nState: 12 }) }));
    const M = ctx.M;
    let poly = sortP(polyIn);
    if (poly.length < 2) return { ok: false, msg: '指定滑動面至少需要 2 個點。' };
    if (M.mirror) poly = poly.map(([x, z]) => [-x, z]).reverse();
    const slip0 = clipSlip(M, poly);
    if (!slip0) return { ok: false, msg: '指定滑動面沒有低於地表的部分。' };
    const cc = cutCrack(ctx, slip0);
    return evalSlip(ctx, cc.slip, nSlice || 400, 'trial', null, null, cc.crack);
  }


  /* ===================== stabilizing piles: structural and ground checks for a given restraint force ===================== */
  // m: prepared pile member; Pr: restraint force per unit width along the slip surface (kN/m); th: slip angle at the pile (rad)
  function pileCheck(M, m, Pr, th, Le) {
    const sc = m.sec, Lr = m.L - Le, zs = m.hz - Le;
    const H = Pr * Math.cos(th) * m.D / m.N, V = Pr * Math.sin(th) * m.D / m.N;
    const o = { H, V, Le, Lr, sec: sc, kh1: m.kh1, b1: m.b1, kh2: m.kh2, b2: m.b2, ptype: m.ptype, load: m.load };
    if (m.ptype === 'wedge') {
      if (m.wm) { o.M1 = H * m.wm.m1; o.x1 = m.wm.x1; o.M2 = H * m.wm.m2; o.x2 = m.wm.x2; o.Mmax = Math.max(Math.abs(o.M1), Math.abs(o.M2)); }
      if (m.b1 > 0 && m.b2 > 0) o.Lrc = m.kEmb * (Math.atan((m.b1 - m.b2) / (m.b1 + m.b2)) + Math.PI) / m.b2;
      o.semi = [m.b1 * Le, m.b2 * Lr];
    } else {
      o.h = m.load === 'tri' ? Le / 3 : m.load === 'uni' ? Le / 2 : 0;
      if (m.b2 > 0) { const c = changM(m.b2, o.h); o.Mmax = H * c.m; o.x2 = c.x; o.Lrc = m.kEmb * Math.PI / m.b2; }
      o.semi = [NaN, m.b2 * Lr];
    }
    o.Lreq = isFinite(o.Lrc) ? Math.max(3, o.Lrc) : 3;
    o.sigma = isFinite(o.Mmax) ? o.Mmax / sc.Z + Math.abs(V) / sc.A : NaN;
    o.tau = m.a0 * H / sc.A;
    const L1 = layerAt(M, m.pr, m.hz - Le / 2), L2 = layerAt(M, m.pr, zs - Lr / 2), D = sc.D;
    const Kp = Lx => Math.pow(Math.tan((45 + Lx.phi / 2) * Math.PI / 180), 2);
    if (L1 && L2 && Lr > 0) {
      const k1 = Kp(L1), k2 = Kp(L2);
      o.Qp1 = m.ptype === 'wedge' ? 3 * D * (0.5 * L1.gamma * Le * Le * k1 + 2 * L1.c * Le * Math.sqrt(k1)) / m.FSy : NaN;
      o.Qp2 = 3 * D * ((0.5 * L2.gamma * Lr * Lr + L1.gamma * Le * Lr) * k2 + 2 * L2.c * Lr * Math.sqrt(k2)) / m.FSy;
      o.L1 = L1.name; o.L2 = L2.name;
    }
    o.ok = { sigma: o.sigma <= sc.sa, tau: o.tau <= sc.ta, emb: Lr >= o.Lreq - 1e-9, qp1: !(o.Qp1 < H), qp2: !(o.Qp2 < H) };
    o.allOk = Object.values(o.ok).every(Boolean) && isFinite(o.sigma);
    const cap = pileH(M, m, Le, Math.tan(th));
    o.Hallow = cap.H; o.ctrl = cap.ctrl; o.PRcap = cap.H * m.N / (m.D * Math.cos(th));
    return o;
  }

  /* required restraint force of each pile row on a given slip surface (Japanese practice: Fs reaches the planned safety factor PFs),
     then the pile checks for that force. Other reinforcement in the model is kept; the piles themselves are removed. */
  function pileDesign(model, polyIn, o) {
    const s = model.settings || {}, method = ['spencer', 'mp'].includes(s.method) ? s.method : 'janbu';
    const PFs = +o.PFs > 0 ? +o.PFs : 1.2;
    const piles = (model.reinf || []).map((r, i) => ({ r, i })).filter(q => q.r.type === 'pile' && q.r.on !== false);
    const others = (model.reinf || []).filter(r => r.type !== 'pile');
    const fsOf = r => !r || !r.ok ? NaN : method === 'janbu' ? (s.useF0 ? r.Fc : r.F) : (r.rig[method].ok ? r.rig[method].F : NaN);
    const only = method === 'janbu' ? 'none' : method;
    const out = { ok: true, method, useF0: !!s.useF0, PFs, piles: [] };
    for (const { r, i } of piles) {
      const set = Object.assign({}, s, { nCol: 8, nState: 12 });
      const ctx = prepare(Object.assign({}, model, { settings: set, reinf: [...others, { type: 'force', on: true, x: +r.x, L: 1, PR: 0 }] }));
      const M = ctx.M, fm = M.reinf.find(q => q.type === 'force');
      let poly = sortP(polyIn); if (M.mirror) poly = poly.map(([x, z]) => [-x, z]).reverse();
      const slip0 = clipSlip(M, poly); if (!slip0) { out.piles.push({ i, ok: false, msg: '指定滑動面沒有低於地表的部分。' }); continue; }
      const cc = cutCrack(ctx, slip0), slip = cc.slip, crack = cc.crack, x = fm.hx;
      if (!(x > slip[0][0] && x < slip[slip.length - 1][0])) { out.piles.push({ i, ok: false, msg: '樁不在滑動面範圍內。' }); continue; }
      const zsl = interp(slip, x), zg = interp(M.ground, x), Le = zg - zsl;
      let k = 0; while (k < slip.length - 2 && slip[k + 1][0] <= x) k++;
      const th = Math.atan2(slip[k + 1][1] - slip[k][1], slip[k + 1][0] - slip[k][0]);
      const F = P => { fm.PR = P; return fsOf(evalSlip(ctx, slip, 400, 'trial', null, only, crack)); };
      const F0 = F(0);
      if (!isFinite(F0)) { out.piles.push({ i, ok: false, msg: '這條滑動面無法計算安全係數。' }); continue; }
      let Pr = 0;
      if (F0 < PFs) {
        let lo = 0, hi = 50, fh = F(hi), n = 0;
        while (!(fh >= PFs) && n < 30) { lo = hi; hi *= 2; fh = F(hi); n++; }
        for (let it = 0; it < 60 && hi - lo > 1e-7 * hi; it++) { const mid = 0.5 * (lo + hi); if (F(mid) < PFs) lo = mid; else hi = mid; }
        Pr = 0.5 * (lo + hi);
      }
      const Fchk = F(Pr);
      // the real pile, prepared on its own for the section and the ground parameters
      const cp = prepare(Object.assign({}, model, { settings: set, reinf: [r] })), pm = cp.M.reinf[0];
      const chk = pm ? pileCheck(cp.M, pm, Pr, th, Le) : null;
      out.piles.push({ i, ok: true, x: +r.x, zs: zsl, zg, Le, th: th * 180 / Math.PI, F0, Pr, Fchk, chk });
    }
    return out;
  }

  /* ===================== back analysis: strength of one layer that gives a target Fs on a given slip surface ===================== */
  function backCalc(model, polyIn, o) {
    const s = model.settings || {}, method = ['spencer', 'mp'].includes(s.method) ? s.method : 'janbu';
    const target = +o.target > 0 ? +o.target : 1;
    const ctx = prepare(Object.assign({}, model, { settings: Object.assign({}, s, { nCol: 8, nState: 12 }) }));
    const M = ctx.M;
    let poly = sortP(polyIn);
    if (poly.length < 2) return { ok: false, msg: '指定滑動面至少需要 2 個點。' };
    if (M.mirror) poly = poly.map(([x, z]) => [-x, z]).reverse();
    const slip0 = clipSlip(M, poly);
    if (!slip0) return { ok: false, msg: '指定滑動面沒有低於地表的部分。' };
    const cc = cutCrack(ctx, slip0), slip = cc.slip, crack = cc.crack;
    const bs = buildSlices(ctx, slip, 400);
    const only = method === 'janbu' ? 'none' : method;
    const fsOf = r => !r || !r.ok ? NaN : method === 'janbu' ? (s.useF0 ? r.Fc : r.F) : (r.rig[method].ok ? r.rig[method].F : NaN);
    const r0 = evalSlip(ctx, slip, 400, 'trial', bs, only, crack);
    if (!r0.ok) return { ok: false, msg: r0.msg };
    // base length of the slip surface in each layer; the longest one is used when the layer is not specified
    const len = {};
    for (const row of r0.rows) len[row.li] = (len[row.li] || 0) + row.b / Math.cos(row.alpha * Math.PI / 180);
    let li = o.layer === 'auto' || o.layer === undefined || o.layer === null || o.layer === '' ? -1 : +o.layer;
    if (li < 0) { let best = -1; for (const k in len) if (len[k] > best) { best = len[k]; li = +k; } }
    if (!(len[li] > 0)) return { ok: false, msg: '指定滑動面沒有通過這個土層，無法反算。', li };
    const Ly = M.layers[li], c0 = Ly.c, p0 = Ly.phi;
    const set = (c, phi) => { Ly.c = c; Ly.phi = phi; Ly.tanphi = Math.tan(phi * Math.PI / 180); };
    const F = (c, phi) => { set(c, phi); const v = fsOf(evalSlip(ctx, slip, 400, 'trial', bs, only, crack)); return isFinite(v) ? v : -Infinity; };
    // smallest value of one parameter (other fixed) that reaches the target; Fs increases with c' and φ'
    const solveC = phi => {
      if (F(0, phi) >= target) return { ok: false, code: 'low', F: F(0, phi) };
      let lo = 0, hi = Math.max(10, 2 * c0), fh = F(hi, phi), k = 0;
      while (fh < target && k < 20) { lo = hi; hi *= 2; fh = F(hi, phi); k++; }
      if (fh < target) return { ok: false, code: 'high', F: fh };
      for (let it = 0; it < 60 && hi - lo > 1e-6 * Math.max(1, hi); it++) { const m = 0.5 * (lo + hi); if (F(m, phi) < target) lo = m; else hi = m; }
      return { ok: true, v: 0.5 * (lo + hi) };
    };
    const solvePhi = c => {
      if (F(c, 0) >= target) return { ok: false, code: 'low', F: F(c, 0) };
      let lo = 0, hi = 0, fh = -Infinity;
      while (fh < target && hi < 85) { lo = hi; hi = Math.min(85, hi + 5); fh = F(c, hi); }
      if (fh < target) return { ok: false, code: 'high', F: fh };
      for (let it = 0; it < 60 && hi - lo > 1e-6; it++) { const m = 0.5 * (lo + hi); if (F(c, m) < target) lo = m; else hi = m; }
      return { ok: true, v: 0.5 * (lo + hi) };
    };
    const param = o.param === 'phi' ? 'phi' : 'c';
    const main = param === 'c' ? solveC(p0) : solvePhi(c0);
    const out = { ok: main.ok, li, name: model.layers[li].name, param, method, useF0: !!s.useF0, target, len: len[li], c0, phi0: p0 };
    if (!main.ok) {
      out.code = main.code; out.Fend = main.F;
      out.msg = main.code === 'low' ? `即使 ${param === 'c' ? "c'" : "φ'"} = 0，Fs 仍達 ${main.F.toFixed(3)}，大於目標值，無法反算。可改反算其他土層或參數。` : `${param === 'c' ? "c'" : "φ'"} 提高到上限仍無法使 Fs 達到目標值，無法反算。`;
      set(c0, p0); return out;
    }
    out.value = main.v;
    out.F = param === 'c' ? F(main.v, p0) : F(c0, main.v);
    if (o.curve) {
      // c'–φ' pairs giving the same Fs, from φ' = 0 to the φ' needed with c' = 0
      const pm = solvePhi(0), phiMax = pm.ok ? pm.v : (pm.code === 'low' ? 0 : 60), pc = [];
      for (let k = 0, n = 8; k <= n; k++) {
        const ph = phiMax * k / n, sc = solveC(ph);
        if (sc.ok) pc.push({ phi: ph, c: sc.v }); else if (sc.code === 'low') pc.push({ phi: ph, c: 0 });
      }
      out.curve = pc; out.phiMax = phiMax;
    }
    set(c0, p0);
    return out;
  }

  /* ===================== retaining walls: external stability (sliding, overturning, bearing) ===================== */
  const D2R = Math.PI / 180;
  // Coulomb active coefficient, vertical back, backfill slope b, wall friction d (radians)
  function kaCoulomb(f, d, b) {
    const s = Math.sin(f + d) * Math.sin(f - b) / (Math.cos(d) * Math.cos(b));
    return Math.cos(f) ** 2 / (Math.cos(d) * (1 + Math.sqrt(Math.max(0, s))) ** 2);
  }
  // Rankine active coefficient for a backfill sloping at b (thrust parallel to the slope)
  function kaRankine(f, b) {
    const cb = Math.cos(b), r = Math.sqrt(Math.max(0, cb * cb - Math.cos(f) ** 2));
    return cb * (cb - r) / (cb + r);
  }
  // Mononobe–Okabe seismic active coefficient, vertical back; psi = atan(kh / (1 − kv))
  function kaMO(f, d, b, psi) {
    const s = Math.sin(f + d) * Math.sin(f - b - psi) / (Math.cos(d + psi) * Math.cos(b));
    return Math.cos(f - psi) ** 2 / (Math.cos(psi) * Math.cos(d + psi) * (1 + Math.sqrt(Math.max(0, s))) ** 2);
  }
  // Meyerhof bearing capacity with depth and inclination factors (Das); B is the effective width, inc the load inclination (radians)
  function bearingQu(c, phiDeg, gam, Df, B, inc) {
    const f = phiDeg * D2R, tf = Math.tan(f);
    const Nq = f > 0 ? Math.exp(Math.PI * tf) * Math.tan(Math.PI / 4 + f / 2) ** 2 : 1, Nc = f > 0 ? (Nq - 1) / tf : 5.14, Ng = 2 * (Nq + 1) * tf;
    const r = B > 0 ? Math.min(Df / B, 1) : 0;
    const Fqd = f > 0 ? 1 + 2 * tf * (1 - Math.sin(f)) ** 2 * r : 1, Fcd = f > 0 ? Fqd - (1 - Fqd) / (Nc * tf) : 1 + 0.4 * r, Fgd = 1;
    const id = inc / D2R, Fci = Math.max(0, 1 - id / 90) ** 2, Fgi = phiDeg > 0 ? Math.max(0, 1 - id / phiDeg) ** 2 : 0;
    const q = gam * Df;
    return { qu: c * Nc * Fcd * Fci + q * Nq * Fqd * Fci + 0.5 * gam * B * Ng * Fgd * Fgi, Nc, Nq, Ng, Fcd, Fqd, Fci, Fgi };
  }
  /* stability from resultant forces (per unit length): V vertical, Hd horizontal driving, Mr and Mo about the toe, B base width,
     mu base friction, Pp passive resistance counted in sliding */
  function wallStab(V, Hd, Mr, Mo, B, mu, Pp) {
    const o = { V, Hd, Mr, Mo, B };
    o.FSs = Hd > 0 ? (V * mu + (Pp || 0)) / Hd : Infinity;
    o.FSo = Mo > 0 ? Mr / Mo : Infinity;
    o.xr = (Mr - Mo) / V; o.e = B / 2 - o.xr;
    const ea = Math.abs(o.e);
    if (!(V > 0) || o.xr <= 0 || o.xr >= B) { o.qmax = Infinity; o.qmin = 0; o.out = true; }
    else if (ea <= B / 6) { o.qmax = V / B * (1 + 6 * ea / B); o.qmin = V / B * (1 - 6 * ea / B); }
    else { o.qmax = 2 * V / (3 * Math.min(o.xr, B - o.xr)); o.qmin = 0; }
    return o;
  }
  // polygon area and centroid
  function polyAC(P) {
    let A = 0, cx = 0, cz = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], cr = a[0] * b[1] - b[0] * a[1]; A += cr; cx += (a[0] + b[0]) * cr; cz += (a[1] + b[1]) * cr; }
    A /= 2; return { A: Math.abs(A), x: cx / (6 * A), z: cz / (6 * A) };
  }
  /* wall section in a local frame: toe at x = 0, heel at x = B (into the slope), base at z = 0 */
  function wallLocal(w) {
    const p = w.par || {}, t = w.type || 'gravity';
    if (t === 'gravity') {
      if (!(p.H > 0 && p.B > 0 && p.b > 0)) return null;
      const b = Math.min(p.b, p.B);
      return { t, B: p.B, H: p.H, P: [[0, 0], [p.B, 0], [p.B, p.H], [p.B - b, p.H]], top: x => x >= p.B - b ? p.H : p.H * x / (p.B - b) };
    }
    const tb = +p.tb, toe = +p.toe, ts1 = +p.ts1, ts2 = +p.ts2, B = +p.B, H = +p.H;
    if (!(H > tb && tb > 0 && B > 0 && ts2 > 0 && ts1 > 0 && toe >= 0 && toe + ts2 <= B + 1e-9)) return null;
    const xs = toe + ts2;
    const P = [[0, 0], [B, 0], [B, tb], [xs, tb], [xs, H], [xs - Math.min(ts1, ts2), H], [toe, tb], [0, tb]];
    const top = x => x < toe || x > xs ? tb : x >= xs - Math.min(ts1, ts2) ? H : tb + (H - tb) * (x - toe) / (xs - Math.min(ts1, ts2) - toe || 1);
    return { t, B, H, tb, toe, xs, ts1, ts2, P, top, cs: +p.cs || 0, ct: +p.ct || 0 };
  }
  /* external stability of wall w under one load case. cs: { kh, kv, seismic (bool) } */
  function wallCheck(model, w, cs) {
    const g = sortP(model.ground);
    if (g.length < 2) return { ok: false, msg: '地表線至少需要 2 個點。' };
    const loc = wallLocal(w);
    if (!loc) return { ok: false, msg: '外部穩定檢核只適用參數式斷面，請檢查擋土牆尺寸。' };
    const d = g[0][1] > g[g.length - 1][1] ? -1 : 1, x0 = +w.par.x0, z0 = +w.par.z0;
    const X = xl => x0 + d * xl;                                  // local → model x
    const gw = +(model.settings && model.settings.gw) || 9.81, ex = w.ext || {};
    const water = sortP(model.water || []), hasW = water.length >= 2 && !ex.drained;
    const zgL = xl => interp(g, X(xl)) - z0, zwL = xl => hasW ? interp(water, X(xl)) - z0 : -Infinity;
    // layered column at model x: unit weight of soil at elevation z
    const layers = model.layers || [];
    const layerAt = (x, z) => {
      let prev = interp(g, x), L = layers[0];
      for (let i = 0; i < layers.length; i++) { const zt = i ? Math.min(prev, layers[i].top && layers[i].top.length >= 2 ? interp(sortP(layers[i].top), x) : prev) : prev; if (z <= zt + 1e-9) L = layers[i]; else break; prev = zt; }
      return L;
    };
    const gamAt = (x, z) => { const L = layerAt(x, z); const zw = hasW ? interp(water, x) : -Infinity; return z < zw ? +L.gammaSat : +L.gamma; };
    // soil properties: backfill (override or the layer behind the wall at mid height) and foundation (below the base)
    const hb = Math.max(0, zgL(loc.B));
    const Lb = layerAt(X(loc.B), z0 + hb / 2), Lf = layerAt(X(loc.B / 2), z0 - 0.5);
    const num = (v, dflt) => (v === null || v === undefined || v === '' || !isFinite(+v)) ? dflt : +v;
    const bf = { phi: num(ex.bPhi, +Lb.phi), c: num(ex.bC, +Lb.c), g: num(ex.bG, +Lb.gamma), name: Lb.name };
    const fd = { phi: num(ex.fPhi, +Lf.phi), c: num(ex.fC, +Lf.c), g: num(ex.fG, +Lf.gamma), name: Lf.name };
    const kh = +cs.kh || 0, kv = +cs.kv || 0;
    // backfill slope from the ground over one wall height behind the back plane
    const Ls = Math.max(1, hb);
    let beta = Math.atan2(zgL(loc.B + Ls) - zgL(loc.B), Ls);
    const fb = bf.phi * D2R, warn = [];
    if (beta > fb - 0.5 * D2R) { beta = fb - 0.5 * D2R; warn.push('回填坡度大於背填土摩擦角，土壓力以 φ − 0.5° 的坡度計算。'); }
    if (beta < 0) beta = 0;
    // wall friction on the back: gravity walls use δ (default 2φ/3), cantilever walls the virtual back with δ = β (Rankine)
    const delta = loc.t === 'gravity' ? num(ex.delta, 2 / 3 * bf.phi) * D2R : beta;
    let K = loc.t === 'gravity' ? kaCoulomb(fb, delta, beta) : kaRankine(fb, beta), Ks = K;
    const psi = Math.atan2(kh, 1 - kv);
    if (kh > 0) { if (fb - beta - psi <= 0) warn.push('φ − β − θ ≤ 0，Mononobe–Okabe 公式失效，已取根號項為 0。'); K = kaMO(fb, delta, beta, psi) * (1 - kv); }
    // surcharge: uniform loads over the backfill within one wall height behind the back plane (the average is used)
    let q = 0;
    for (const l of (model.loads || [])) {
      if (l.on === false || l.type === 'line') continue;
      const a = d * (Math.min(l.x1, l.x2) - x0), b = d * (Math.max(l.x1, l.x2) - x0), lo = Math.max(Math.min(a, b), loc.B), hi = Math.min(Math.max(a, b), loc.B + Ls);
      if (hi > lo) q += (+l.q + (l.q2 === null || l.q2 === undefined ? +l.q : +l.q2)) / 2 * (hi - lo) / Ls;
    }
    // earth pressure on the back plane x = B, integrated over its height
    const n = 200, xb = X(loc.B);
    let Pa = 0, Ma = 0, sv = q;
    const zwB = zwL(loc.B);
    // the pressure is linear within each step, so force and moment are integrated exactly (trapezoid with its centroid)
    const sig = v => Math.max(0, K * v - 2 * bf.c * Math.sqrt(Ks));
    for (let i = 0; i < n; i++) {
      const zt = hb - hb * i / n, zbt = hb - hb * (i + 1) / n, zm = (zt + zbt) / 2, dz = zt - zbt;
      const gm = gamAt(xb, z0 + zm) - (zm < zwB ? gw : 0);
      const st1 = sig(sv), sb1 = sig(sv + gm * dz);
      Pa += (st1 + sb1) / 2 * dz; Ma += dz / 6 * (sb1 * (2 * zbt + zt) + st1 * (zbt + 2 * zt)); sv += gm * dz;
    }
    const za = Pa > 0 ? Ma / Pa : hb / 3;
    const Ph = Pa * Math.cos(delta), Pv = Pa * Math.sin(delta);
    const hw = Math.max(0, Math.min(hb, zwB)), Pw = 0.5 * gw * hw * hw, zPw = hw / 3;
    // weights: wall (and counterforts), soil resting on the wall (above heel and toe slabs, or over the wall top)
    const items = [];
    const ac = polyAC(loc.P), gc = +w.gamma;
    items.push({ k: 'wall', W: gc * ac.A, x: ac.x, z: ac.z });
    let Ws = 0, Msx = 0, Msz = 0;
    const m = 120;
    for (let i = 0; i < m; i++) {
      const xl = loc.B * (i + 0.5) / m, zt = zgL(xl), zl = loc.top(xl); if (!(zt > zl)) continue;
      const k = 8; for (let j = 0; j < k; j++) { const za2 = zl + (zt - zl) * (j + 0.5) / k, dw = gamAt(X(xl), z0 + za2) * (zt - zl) / k * loc.B / m; Ws += dw; Msx += dw * xl; Msz += dw * za2; }
    }
    if (Ws > 1e-9) items.push({ k: 'soil', W: Ws, x: Msx / Ws, z: Msz / Ws });
    if (loc.t === 'counterfort' && loc.cs > 0 && loc.ct > 0) {
      // counterforts: triangular plates between stem and heel; concrete replaces soil over the share ct / cs
      const A = 0.5 * (loc.B - loc.xs) * (loc.H - loc.tb), xc = loc.xs + (loc.B - loc.xs) / 3, zc = loc.tb + (loc.H - loc.tb) / 3;
      const dW = (gc - bf.g) * A * loc.ct / loc.cs;
      if (Math.abs(dW) > 0) items.push({ k: 'cf', W: dW, x: xc, z: zc });
    }
    // uplift under the base (linear between the water heads at toe and heel)
    const hT = Math.max(0, zwL(0)), hH = Math.max(0, zwL(loc.B));
    const U = 0.5 * gw * (hT + hH) * loc.B, xU = hT + hH > 0 ? loc.B * (hT + 2 * hH) / (3 * (hT + hH)) : loc.B / 2;
    // passive resistance in front (optional, reduced by 50 %)
    const Df = Math.max(0, zgL(0));
    const Pp = ex.passive ? 0.5 * 0.5 * fd.g * Df * Df * Math.tan(Math.PI / 4 + fd.phi * D2R / 2) ** 2 : 0;
    // sums about the toe
    let Wsum = 0, Mw = 0, Mi = 0;
    for (const it of items) { Wsum += it.W; Mw += it.W * it.x; Mi += it.W * it.z; }
    const V = Wsum * (1 - kv) + Pv - U;
    const Hd = Ph + Pw + kh * Wsum;
    const Mr = Mw * (1 - kv) + Pv * loc.B;
    const Mo = Ph * za + Pw * zPw + kh * Mi + U * xU;
    const mu = num(ex.mu, Math.tan(2 / 3 * fd.phi * D2R));
    const st = wallStab(V, Hd, Mr, Mo, loc.B, mu, Pp);
    // bearing: effective width, embedment and load inclination
    const zwF = zwL(loc.B / 2), gF = zwF > 0 ? fd.g - gw : fd.g;
    const Bp = Math.max(0, loc.B - 2 * Math.abs(st.e)), inc = Math.atan2(Hd, Math.max(V, 1e-9));
    const bc = bearingQu(fd.c, fd.phi, gF, Df, Bp, inc);
    st.qu = bc.qu; st.FSb = st.qmax > 0 ? bc.qu / st.qmax : Infinity; st.bc = bc; st.Bp = Bp;
    return Object.assign(st, {
      ok: true, warn, type: loc.t, loc, hb, beta: beta / D2R, delta: delta / D2R, K, Ks, kh, kv, seismic: kh > 0 || !!cs.seismic, q, Pa, Ph, Pv, za, Pw, hw, zPw, U, xU, Pp, Df, mu, items, Wsum,
      backfill: bf, found: fd, d, x0, z0
    });
  }

  return { solve, evaluate, backCalc, pileDesign, pileCheck, STEEL, wallCheck, wallStab, wallLocal, kaCoulomb, kaRankine, kaMO, bearingQu, validate, interp, sortP, profileAt, _rig: { prepare, buildSlices, rigPrep, gle, clipSlip, refine, rigF, evalSlip } };
})();
if (typeof module !== 'undefined') module.exports = SSA;

if (typeof window !== 'undefined') window.SSA = SSA;
