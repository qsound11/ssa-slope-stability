/**
 * MVC - View 層：SVG 剖面互動畫布渲染模組 (CanvasView)
 */
  /* force diagram on the drawing while the wall tab is open: weights, earth thrust, resultant on the base and its middle third */
  function wallForceSVG(T) {
    const pane = document.querySelector('[data-pane="wall"]');
    if (!pane || pane.hidden || !wallRes.length) return '';
    const out = [];
    for (const R of wallRes) {
      const q = R.cases.find(c => c.r && c.r.ok); if (!q) continue;
      const r = q.r, d = r.d, P = (xl, zl) => [T.X(r.x0 + d * xl), T.Z(r.z0 + zl)], s = 14 / Math.max(1, Math.sqrt(r.Wsum));
      const arrow = (x1, y1, x2, y2, cls) => { const a = Math.atan2(y2 - y1, x2 - x1), h = 7; return `<line class="wf ${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><path class="wf-h ${cls}" d="M${x2},${y2} L${x2 - h * Math.cos(a - 0.4)},${y2 - h * Math.sin(a - 0.4)} L${x2 - h * Math.cos(a + 0.4)},${y2 - h * Math.sin(a + 0.4)} Z"/>`; };
      // weights
      for (const it of r.items) { if (!(it.W > 0)) continue; const [x, y] = P(it.x, it.z), Ln = Math.max(14, Math.min(60, it.W * s)); out.push(arrow(x, y - Ln / 2, x, y + Ln / 2, 'w'), `<text class="wf-lbl" x="${x + 4}" y="${y - Ln / 2 + 10}">W</text>`); }
      // earth thrust on the back plane, pointing toward the toe
      if (r.Pa > 0) { const [x, y] = P(r.loc.B, r.za), Ln = 46, dx = -d * Math.cos(r.delta * Math.PI / 180), dy = Math.sin(r.delta * Math.PI / 180); out.push(arrow(x - dx * Ln * 0.2 + d * 40, y - dy * Ln, x, y, 'p'), `<text class="wf-lbl" x="${x + d * 26 - 8}" y="${y - dy * Ln - 6}">Pa</text>`); }
      // base: middle third and resultant
      const [b0x, by] = P(0, 0), [b1x] = P(r.loc.B, 0), [m0x] = P(r.loc.B / 3, 0), [m1x] = P(2 * r.loc.B / 3, 0);
      out.push(`<line class="wf-base" x1="${b0x}" y1="${by + 6}" x2="${b1x}" y2="${by + 6}"/><line class="wf-mid" x1="${m0x}" y1="${by + 6}" x2="${m1x}" y2="${by + 6}"/>`);
      if (!r.out) { const [rx] = P(r.xr, 0); out.push(arrow(rx, by + 34, rx, by + 8, 'r'), `<text class="wf-lbl" x="${rx + 5}" y="${by + 30}">R・|e| = ${fmt(Math.abs(r.e), 2)} m</text>`); }
    }
    return out.join('');
  }
  /* ---------- drawing ---------- */
  function poly(P) { return P.map(p => `${T.X(p[0]).toFixed(1)},${T.Z(p[1]).toFixed(1)}`).join(' '); }
  /* ponded water: parts of the water line above the ground, as closed polygons */
  function pondPolys(g, w) {
    if (!w || w.length < 2 || g.length < 2) return [];
    const x0 = Math.max(g[0][0], w[0][0]), x1 = Math.min(g[g.length - 1][0], w[w.length - 1][0]); if (!(x1 > x0)) return [];
    const base = [...new Set([x0, x1, ...[...g, ...w].map(p => p[0]).filter(x => x > x0 && x < x1)])].sort((a, b) => a - b);
    const d = x => interp(w, x) - interp(g, x), xs = [];
    base.forEach((x, i) => { if (i) { const a = base[i - 1], da = d(a), db = d(x); if ((da > 0) !== (db > 0) && Math.abs(da - db) > 1e-12) xs.push(a + (x - a) * da / (da - db)); } xs.push(x); });
    const out = []; let run = [];
    const flush = () => { if (run.length > 1 && run.some(x => d(x) > 1e-3)) out.push([...run.map(x => [x, interp(w, x)]), ...run.slice().reverse().map(x => [x, interp(g, x)])]); run = []; };
    xs.forEach(x => { if (d(x) >= -1e-9) run.push(x); else flush(); });
    flush();
    return out;
  }
  /* tension crack of a result: vertical line from the ground to the crack bottom, water-filled part marked */
  function crackSVG(r, Xf, Zf, explicit) {
    if (!r || !r.ok || !r.crack) return '';
    const c = r.crack, px = Xf(c.x), y0 = Zf(c.zg), y1 = Zf(c.zb), out = [];
    if (c.water) out.push(explicit ? `<rect x="${px - 3}" y="${y0}" width="6" height="${y1 - y0}" fill="#1f6fb2" fill-opacity="0.45"/>` : `<rect class="crack-w" x="${px - 3}" y="${y0}" width="6" height="${y1 - y0}"/>`);
    out.push(explicit ? `<line x1="${px}" x2="${px}" y1="${y0}" y2="${y1}" stroke="#c0281b" stroke-width="2" stroke-dasharray="5 3"/>` : `<line class="crack" x1="${px}" x2="${px}" y1="${y0}" y2="${y1}"/>`);
    const lab = L('張力裂縫', 'tension crack', '引張亀裂') + ` ${fmt(c.d, 2)} m`;
    out.push(explicit ? `<text x="${px + 6}" y="${y0 - 6}" fill="#c0281b" font-size="10.5">${lab}</text>` : `<text class="crack-lbl" x="${px + 6}" y="${y0 - 6}">${lab}</text>`);
    return out.join('');
  }
  function draw() {
    if (!bounds) fit();
    setupT();
    const svg = $('#cv'), out = [];
    const { W, H, pad } = T;
    out.push(`<defs>
      <pattern id="hatchRock" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)" class="hatch"><line x1="0" y1="0" x2="0" y2="8"/></pattern>
      <pattern id="hatchBase" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)" class="hatch"><line x1="0" y1="0" x2="0" y2="7"/></pattern>
      <pattern id="hatchWall" width="6" height="6" patternUnits="userSpaceOnUse" class="hatch"><circle cx="1.5" cy="1.5" r=".7" class="dot"/><circle cx="4.5" cy="4.5" r=".5" class="dot"/></pattern>
      <clipPath id="clipIn"><rect x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}"/></clipPath>
    </defs>`);
    // axes & grid
    const ax = [];
    const stx = niceStep(T.vx1 - T.vx0, W - pad.l - pad.r), stz = niceStep(T.vz1 - T.vz0, H - pad.t - pad.b);
    for (let x = Math.ceil(T.vx0 / stx) * stx; x <= T.vx1 + 1e-9; x += stx) {
      const px = T.X(x).toFixed(1);
      ax.push(`<line x1="${px}" x2="${px}" y1="${pad.t}" y2="${H - pad.b}"/><text x="${px}" y="${H - pad.b + 16}" text-anchor="middle">${+x.toFixed(6)}</text>`);
    }
    for (let z = Math.ceil(T.vz0 / stz) * stz; z <= T.vz1 + 1e-9; z += stz) {
      const py = T.Z(z).toFixed(1);
      ax.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${py}" y2="${py}"/><text x="${pad.l - 6}" y="${(+py + 4)}" text-anchor="end">${+z.toFixed(6)}</text>`);
    }
    out.push(`<g class="ax">${ax.join('')}<rect class="frame" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}"/>
      <text x="${W - pad.r}" y="${H - 4}" text-anchor="end">x (m)</text><text x="4" y="${pad.t - 8}">z (m)</text></g>`);

    out.push('<g clip-path="url(#clipIn)">');
    const g = model.ground;
    if (g.length >= 2) {
      // x samples
      const gx0 = g[0][0], gx1 = g[g.length - 1][0];
      const xsSet = new Set();
      allPts().forEach(p => { if (p[0] >= gx0 && p[0] <= gx1) xsSet.add(p[0]); });
      for (let q = 0; q <= 240; q++) xsSet.add(gx0 + (gx1 - gx0) * q / 240);
      const xs = [...xsSet].sort((a, b) => a - b);
      const tops = model.layers.map(() => []);
      xs.forEach(x => {
        let prev = interp(g, x);
        model.layers.forEach((L, i) => {
          const z = i ? Math.min(prev, L.top && L.top.length ? interp(L.top, x) : prev) : prev;
          tops[i].push([x, Math.max(z, model.zBase)]); prev = z;
        });
      });
      const base = xs.map(x => [x, model.zBase]);
      model.layers.forEach((L, i) => {
        const top = tops[i], bot = i + 1 < model.layers.length ? tops[i + 1] : base;
        const P = [...top, ...bot.slice().reverse()];
        out.push(`<polygon points="${poly(P)}" fill="${L.color}" fill-opacity=".62"/>`);
        if (L.bedrock) out.push(`<polygon points="${poly(P)}" fill="url(#hatchRock)"/>`);
      });
      // base
      const bx0 = T.X(gx0), bx1 = T.X(gx1), by = T.Z(model.zBase);
      out.push(`<rect x="${bx0}" y="${by}" width="${bx1 - bx0}" height="10" fill="url(#hatchBase)"/><line class="basel" x1="${bx0}" x2="${bx1}" y1="${by}" y2="${by}"/>`);
      // boundaries (effective)
      for (let i = 1; i < model.layers.length; i++) out.push(`<polyline class="bound" points="${poly(tops[i])}"/>`);
    }
    // water (ponded water above the ground is filled)
    if (model.water.length >= 2) {
      pondPolys(g, model.water).forEach(P => out.push(`<polygon class="pond" points="${poly(P)}"/>`));
      out.push(`<polyline class="wline" points="${poly(model.water)}"/>`);
      const w = model.water, xm = w[0][0] + (w[w.length - 1][0] - w[0][0]) * 0.12;
      const px = T.X(xm), py = T.Z(interp(w, xm));
      out.push(`<g class="wsym"><path d="M${px - 7},${py - 11} L${px + 7},${py - 11} L${px},${py - 2} Z"/><line x1="${px - 8}" x2="${px + 8}" y1="${py + 4}" y2="${py + 4}"/><line x1="${px - 5}" x2="${px + 5}" y1="${py + 8}" y2="${py + 8}"/></g>`);
    }
    // piezometric lines
    (model.piezo || []).forEach(q => { if (q.pts.length >= 2) { out.push(`<polyline class="pzline" points="${poly(q.pts)}"/>`); const p0 = q.pts[0]; out.push(`<text class="pz-lbl" x="${T.X(p0[0]) + 4}" y="${T.Z(p0[1]) - 5}">${esc(q.name)}</text>`); } });
    // search grid
    if (result && result.ok && $('#optGrid').checked) {
      let d = '';
      result.grid.forEach(c => c.z.forEach(z => { d += `M${T.X(c.x).toFixed(1)},${T.Z(z).toFixed(1)}h1.6v1.6h-1.6z`; }));
      out.push(`<path class="gridpts" d="${d}"/>`);
    }
    // baseline (no reinforcement) slip surface
    if (result && result.ok && result.base && result.base.ok) out.push(`<polyline class="slip-base" points="${poly(result.base.slip)}"/>`);
    if (result && result.ok && result.baseLoad && result.baseLoad.ok) out.push(`<polyline class="slip-base2" points="${poly(result.baseLoad.slip)}"/>`);
    // result
    if (result && result.ok) {
      const S = result.slip;
      const xa = S[0][0], xb = S[S.length - 1][0];
      const gpart = model.ground.filter(p => p[0] > xa && p[0] < xb);
      const top = [[xa, interp(model.ground, xa)], ...gpart, [xb, interp(model.ground, xb)]];
      out.push(`<polygon class="mass" points="${poly([...S, ...top.reverse()])}"/>`);
      if ($('#optSlices').checked) {
        let d = '';
        result.rows.forEach(r => {
          const x = r.xc - r.b / 2;
          if (x <= xa || x >= xb) return;
          const zs = interp(S, x), zg = interp(model.ground, x);
          if (zg > zs) d += `M${T.X(x).toFixed(1)},${T.Z(zs).toFixed(1)}V${T.Z(zg).toFixed(1)}`;
        });
        out.push(`<path class="slice" d="${d}"/>`);
      }
      out.push(`<polyline class="slip" points="${poly(S)}"/>`);
      out.push(crackSVG(result, x => T.X(x), z => T.Z(z), false));
    }
    // retaining walls
    model.walls.forEach(w => { if (w.poly.length >= 3) out.push(`<polygon class="wall${w.on ? '' : ' off'}" points="${poly(w.poly)}"/><polygon points="${poly(w.poly)}" fill="url(#hatchWall)" opacity="${w.on ? 1 : .4}"/>`); });
    out.push(wallForceSVG(T));
    // surface loads
    model.loads.forEach((l, i) => {
      const cls = `load${l.on ? '' : ' off'}`, AL = 28;
      const tip = x => [T.X(x), T.Z(interp(model.ground, x))];
      const arrow = (x, len, w) => { const [px, py] = tip(x); return `<line class="${cls}" x1="${px}" y1="${py - len}" x2="${px}" y2="${py - 3}" stroke-width="${w}"/><path class="${cls} head" d="M${px - 4},${py - 9} L${px + 4},${py - 9} L${px},${py - 1} Z"/>`; };
      if (l.type === 'line') {
        out.push(arrow(l.x, AL + 12, 2.6));
        const [px, py] = tip(l.x);
        out.push(`<text class="load-lbl" x="${px + 6}" y="${py - AL - 4}">${esc(l.name)}　P = ${fmt(toG(l.P), 1)} ${uF()}</text><circle class="lhandle" cx="${px}" cy="${py - AL - 12}" r="4.5"/>`);
      } else {
        const xa = Math.min(l.x1, l.x2), xb = Math.max(l.x1, l.x2);
        const n = Math.max(2, Math.round((T.X(xb) - T.X(xa)) / 16));
        let topPts = [];
        const trap = l.q2 !== null && l.q2 !== undefined && l.q2 !== l.q, qm = Math.max(Math.abs(l.q), Math.abs(trap ? l.q2 : l.q)) || 1;
        const qAt = x => trap ? l.q + (l.q2 - l.q) * (x - l.x1) / ((l.x2 - l.x1) || 1) : l.q;
        for (let k = 0; k <= n; k++) { const x = xa + (xb - xa) * k / n, len = trap ? Math.max(10, AL * Math.abs(qAt(x)) / qm) : AL; out.push(arrow(x, len, 1.3)); const [px, py] = tip(x); topPts.push(`${px},${py - len}`); }
        out.push(`<polyline class="${cls}" fill="none" stroke-width="1.6" points="${topPts.join(' ')}"/>`);
        const [mx, my] = tip((xa + xb) / 2);
        out.push(`<text class="load-lbl" x="${mx}" y="${my - AL - 6}" text-anchor="middle">${esc(l.name)}　q = ${fmt(toC(l.q), 1)}${trap ? ' → ' + fmt(toC(l.q2), 1) : ''} ${uC()}</text>`);
        const [ax, ay] = tip(l.x1), [bx, by] = tip(l.x2);
        out.push(`<circle class="lhandle" cx="${ax}" cy="${ay - AL}" r="4.5"/><circle class="lhandle" cx="${bx}" cy="${by - AL}" r="4.5"/>`);
      }
    });
    // specified slip surface
    if (model.trial.length >= 2) out.push(`<polyline class="tline" points="${poly(model.trial)}"/>`);
    // reinforcement members
    if (model.reinf.length) {
      const dir = intoDir(), mem = result && result.ok && !stale && result.members ? result.members : [];
      model.reinf.forEach((r, i) => {
        const G = memGeom(r), ux = (G[2] - G[0]) / (r.L || 1), uz = (G[3] - G[1]) / (r.L || 1);
        const P = s => [G[0] + ux * s, G[1] + uz * s];
        const m = mem.find(c => c.idx === i), on = m && m.crossed && m.Tm > 0;
        const cls = `mem ${r.type}${on ? ' on' : ''}${r.on ? '' : ' off'}`;
        const a = P(0), f = P(r.type === 'anchor' ? Math.min(r.Lfree, r.L) : 0), e = P(r.L);
        if (r.type === 'anchor' && r.Lfree > 0) out.push(`<line class="${cls}" x1="${T.X(a[0])}" y1="${T.Z(a[1])}" x2="${T.X(f[0])}" y2="${T.Z(f[1])}"/>`);
        out.push(`<line class="${cls}${r.type === 'anchor' ? ' bond' : ''}" x1="${T.X(f[0])}" y1="${T.Z(f[1])}" x2="${T.X(e[0])}" y2="${T.Z(e[1])}"/>`);
        out.push(`<text class="mem-lbl" x="${T.X(a[0]) - (dir > 0 ? 12 : -4)}" y="${T.Z(a[1]) - 3}">${i + 1}</text>`);
        if (on) out.push(`<circle class="mem-x" cx="${T.X(m.xi)}" cy="${T.Z(m.zi)}" r="3.6"/>`);
        if (on && r.type === 'pile') out.push(`<line class="mem pile emb" x1="${T.X(m.xi)}" y1="${T.Z(m.zi)}" x2="${T.X(e[0])}" y2="${T.Z(e[1])}"/><text class="mem-lbl" x="${T.X(m.xi) + 6}" y="${T.Z(m.zi) - 4}">H=${fmt(toG(m.H), 0)}</text>`);
      });
    }
    // control points and entry/exit ranges
    out.push(ctrlSVG(model, x => T.X(x), z => T.Z(z), stale ? null : result, false));
    // ground on top
    if (g.length >= 2) out.push(`<polyline class="ground" points="${poly(g)}"/>`);
    out.push('</g>');
    // Fs label
    if (result && result.ok) {
      const S = result.slip, xm = (S[0][0] + S[S.length - 1][0]) / 2;
      let px = T.X(xm), py = T.Z(interp(model.ground, xm)) - 22;
      const txt = `Fs = ${fmt(FS(result), 3)}`, w = txt.length * 7.8 + 14;
      px = Math.min(Math.max(px, pad.l + w / 2 + 4), W - pad.r - w / 2 - 4); py = Math.max(py, pad.t + 14);
      out.push(`<g class="fslabel"${stale ? ' opacity=".5"' : ''}><rect x="${px - w / 2}" y="${py - 12}" width="${w}" height="22" rx="4"/><text x="${px}" y="${py + 4}" text-anchor="middle">${txt}</text></g>`);
    }
    // active vertices
    const def = lineDefs().find(d => d.key === active);
    const AP = getPts(active) || [];
    const stroke = def && def.kind === 'water' ? 'var(--water)' : def && def.kind === 'trial' ? 'var(--slip)' : def && def.kind === 'bound' ? 'var(--ink)' : 'var(--ink)';
    AP.forEach((p, i) => {
      const isHot = (drag && drag.i === i) || (hover && hover.key === active && hover.i === i);
      out.push(`<circle class="vtx${isHot ? ' hot' : ''}" cx="${T.X(p[0]).toFixed(1)}" cy="${T.Z(p[1]).toFixed(1)}" r="${isHot ? 6.5 : 5}" stroke="${stroke}"/>`);
    });
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out.join('');
    svg.className.baseVal = mode === 'add' ? 'm-add' : mode === 'del' ? 'm-del' : '';
  }

  // drawing helpers (canvas and report figure)
  function ctrlSVG(m, Xf, Zf, r, explicit) {
    const C = m.ctrl; if (!C || !C.on || m.ground.length < 2) return '';
    const g = m.ground, out = [];
    const col = { bh: explicit ? '#555' : null, ok: explicit ? '#1a7f37' : null, ng: explicit ? '#c0281b' : null, rg: explicit ? '#b06a00' : null };
    C.pts.forEach((p, i) => {
      if (!p.on || !isFinite(p.x) || !isFinite(p.depth)) return;
      const zg = interp(g, p.x), z = zg - p.depth, tol = p.tol || 0;
      const chk = r && r.ok && r.ctrl && r.ctrl.pts.find(q => q.i === i);
      const state = chk ? (chk.ok ? 'ok' : 'ng') : '';
      const px = Xf(p.x);
      out.push(explicit ? `<line x1="${px}" x2="${px}" y1="${Zf(zg)}" y2="${Zf(z - Math.max(1, tol) )}" stroke="${col.bh}" stroke-width="1.2" stroke-dasharray="4 3"/>` : `<line class="ctrl-bh" x1="${px}" x2="${px}" y1="${Zf(zg)}" y2="${Zf(z - Math.max(1, tol))}"/>`);
      if (tol > 0) out.push(explicit ? `<line x1="${px}" x2="${px}" y1="${Zf(z + tol)}" y2="${Zf(z - tol)}" stroke="${col.rg}" stroke-width="4" stroke-opacity="0.45"/>` : `<line class="ctrl-tol" x1="${px}" x2="${px}" y1="${Zf(z + tol)}" y2="${Zf(z - tol)}"/>`);
      const fill = explicit ? (state === 'ng' ? col.ng : col.ok) : '';
      out.push(explicit ? `<path d="M${px - 6},${Zf(z)} L${px},${Zf(z) - 6} L${px + 6},${Zf(z)} L${px},${Zf(z) + 6} Z" fill="#fff" stroke="${fill}" stroke-width="2"/>` : `<path class="ctrl-pt ${state}" d="M${px - 6},${Zf(z)} L${px},${Zf(z) - 6} L${px + 6},${Zf(z)} L${px},${Zf(z) + 6} Z"/>`);
      out.push(explicit ? `<text x="${px + 8}" y="${Zf(z) - 6}" fill="#333" font-size="11">${esc(p.name)}</text>` : `<text class="ctrl-lbl" x="${px + 8}" y="${Zf(z) - 6}">${esc(p.name)}</text>`);
    });
    for (const k of ['toe', 'crest']) {
      const rg = C[k]; if (!rg.on || !isFinite(rg.x1) || !isFinite(rg.x2) || rg.x2 <= rg.x1) continue;
      const n = 24, pts = []; for (let q = 0; q <= n; q++) { const x = rg.x1 + (rg.x2 - rg.x1) * q / n; pts.push(`${Xf(x).toFixed(1)},${(Zf(interp(g, x)) - 3).toFixed(1)}`); }
      out.push(explicit ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${col.rg}" stroke-width="5" stroke-opacity="0.55"/>` : `<polyline class="ctrl-rg" points="${pts.join(' ')}"/>`);
      const xm = (rg.x1 + rg.x2) / 2, lab = k === 'toe' ? L('出口範圍', 'exit range', '出口範囲') : L('入口範圍', 'entry range', '入口範囲');
      out.push(explicit ? `<text x="${Xf(xm)}" y="${Zf(interp(g, xm)) - 10}" text-anchor="middle" fill="${col.rg}" font-size="10.5">${lab}</text>` : `<text class="ctrl-rlbl" x="${Xf(xm)}" y="${Zf(interp(g, xm)) - 10}" text-anchor="middle">${lab}</text>`);
    }
    return out.join('');
  }

window.CanvasView = {
  draw, poly, pondPolys, crackSVG, wallForceSVG, ctrlSVG
};
