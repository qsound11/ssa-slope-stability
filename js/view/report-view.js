/**
 * MVC - View 層：計算書與驗證報告產生器 (SVG / HTML Print / Word DOCX) (ReportView)
 */
  /* ===================== clean figure for reports (explicit colours, no CSS variables) ===================== */
  function reportSVG(m, r, o) {
    o = o || {};
    const W = o.W || 900, H = o.H || 420, pad = { l: 46, r: 14, t: 14, b: 34 };
    const g = m.ground; if (g.length < 2) return '';
    const gx0 = g[0][0], gx1 = g[g.length - 1][0];
    const zs = [...g.map(p => p[1]), ...(m.walls || []).filter(w => w.on).flatMap(w => w.poly.map(p => p[1]))];
    const zmin = m.zBase, zmax = Math.max(...zs) + Math.max(1, (Math.max(...zs) - m.zBase) * 0.12);
    const sx = (W - pad.l - pad.r) / (gx1 - gx0), sz = (H - pad.t - pad.b) / (zmax - zmin), sc = Math.min(sx, sz);
    const ox = pad.l + ((W - pad.l - pad.r) - (gx1 - gx0) * sc) / 2, oz = H - pad.b - ((H - pad.t - pad.b) - (zmax - zmin) * sc) / 2;
    const X = x => ox + (x - gx0) * sc, Z = z => oz - (z - zmin) * sc;
    const P = A => A.map(p => `${X(p[0]).toFixed(1)},${Z(p[1]).toFixed(1)}`).join(' ');
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, 'Microsoft JhengHei', 'Noto Sans TC', sans-serif" font-size="11">`,
      `<defs><pattern id="rh" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#555" stroke-width="0.8"/></pattern></defs>`,
      `<rect width="${W}" height="${H}" fill="#fff"/>`];
    // axes
    const step = (span, px) => { const raw = span / Math.max(2, px / 70), p = Math.pow(10, Math.floor(Math.log10(raw))); for (const k of [1, 2, 5, 10]) if (k * p >= raw) return k * p; return 10 * p; };
    const stx = step(gx1 - gx0, (gx1 - gx0) * sc), stz = step(zmax - zmin, (zmax - zmin) * sc);
    for (let x = Math.ceil(gx0 / stx) * stx; x <= gx1 + 1e-9; x += stx) out.push(`<line x1="${X(x)}" x2="${X(x)}" y1="${Z(zmin)}" y2="${Z(zmax)}" stroke="#e3e3e3"/><text x="${X(x)}" y="${Z(zmin) + 14}" text-anchor="middle" fill="#444">${+x.toFixed(6)}</text>`);
    for (let z = Math.ceil(zmin / stz) * stz; z <= zmax + 1e-9; z += stz) out.push(`<line x1="${X(gx0)}" x2="${X(gx1)}" y1="${Z(z)}" y2="${Z(z)}" stroke="#e3e3e3"/><text x="${X(gx0) - 5}" y="${Z(z) + 4}" text-anchor="end" fill="#444">${+z.toFixed(6)}</text>`);
    out.push(`<text x="${X(gx1)}" y="${H - 4}" text-anchor="end" fill="#444">x (m)</text><text x="${X(gx0) - 40}" y="${Z(zmax) - 2}" fill="#444">z (m)</text>`);
    // layers
    const xsSet = new Set(); [g, m.water, ...m.layers.map(Ly => Ly.top || [])].forEach(A => (A || []).forEach(p => { if (p[0] >= gx0 && p[0] <= gx1) xsSet.add(p[0]); }));
    for (let q = 0; q <= 200; q++) xsSet.add(gx0 + (gx1 - gx0) * q / 200);
    const xs = [...xsSet].sort((a, b) => a - b), tops = m.layers.map(() => []);
    xs.forEach(x => { let prev = interp(g, x); m.layers.forEach((Ly, i) => { const z = i ? Math.min(prev, Ly.top && Ly.top.length ? interp(Ly.top, x) : prev) : prev; tops[i].push([x, Math.max(z, m.zBase)]); prev = z; }); });
    const base = xs.map(x => [x, m.zBase]);
    m.layers.forEach((Ly, i) => {
      const bot = i + 1 < m.layers.length ? tops[i + 1] : base, A = [...tops[i], ...bot.slice().reverse()];
      out.push(`<polygon points="${P(A)}" fill="${Ly.color}" fill-opacity="0.55" stroke="none"/>`);
      if (Ly.bedrock) out.push(`<polygon points="${P(A)}" fill="url(#rh)"/>`);
      if (i) out.push(`<polyline points="${P(tops[i])}" fill="none" stroke="#6b5a40" stroke-width="0.8"/>`);
    });
    out.push(`<line x1="${X(gx0)}" x2="${X(gx1)}" y1="${Z(m.zBase)}" y2="${Z(m.zBase)}" stroke="#333" stroke-width="1.2"/>`);
    // layer names at the right edge
    m.layers.forEach((Ly, i) => { const zt = tops[i][tops[i].length - 1][1], zb = (i + 1 < m.layers.length ? tops[i + 1] : base)[xs.length - 1][1]; if (zt - zb > 1.2 / sc * 12) out.push(`<text x="${X(gx1) - 4}" y="${Z((zt + zb) / 2) + 4}" text-anchor="end" fill="#333">${esc(Ly.name)}</text>`); });
    // slip mass and surface
    if (r && r.ok) {
      const S = r.slip, xa = S[0][0], xb = S[S.length - 1][0];
      const topP = [[xa, interp(g, xa)], ...g.filter(p => p[0] > xa && p[0] < xb), [xb, interp(g, xb)]];
      out.push(`<polygon points="${P([...S, ...topP.reverse()])}" fill="#d9482b" fill-opacity="0.22" stroke="none"/>`);
    }
    // water table
    if (m.water && m.water.length >= 2) {
      pondPolys(g, m.water).forEach(A => out.push(`<polygon points="${P(A)}" fill="#7fb3e0" fill-opacity="0.45" stroke="none"/>`));
      out.push(`<polyline points="${P(m.water)}" fill="none" stroke="#1f6fb2" stroke-width="1.6" stroke-dasharray="6 4"/>`);
      const xm = m.water[0][0] + (m.water[m.water.length - 1][0] - m.water[0][0]) * 0.1, px = X(xm), py = Z(interp(m.water, xm));
      out.push(`<path d="M${px - 6},${py - 10} L${px + 6},${py - 10} L${px},${py - 2} Z" fill="#1f6fb2"/>`);
    }
    (m.piezo || []).forEach(q => { if (q.pts.length >= 2) out.push(`<polyline points="${P(q.pts)}" fill="none" stroke="#1b8a8a" stroke-width="1.5" stroke-dasharray="2 4" stroke-linecap="round"/><text x="${X(q.pts[0][0]) + 4}" y="${Z(q.pts[0][1]) - 5}" fill="#1b8a8a" font-size="10.5">${esc(q.name)}</text>`); });
    // walls
    (m.walls || []).forEach(w => { if (w.on && w.poly.length >= 3) out.push(`<polygon points="${P(w.poly)}" fill="#b9b9b9" stroke="#444" stroke-width="1"/>`); });
    // loads
    (m.loads || []).forEach(l => {
      if (!l.on) return;
      const arrow = x => { const px = X(x), py = Z(interp(g, x)); return `<line x1="${px}" x2="${px}" y1="${py - 18}" y2="${py - 3}" stroke="#7a3b9a" stroke-width="1.2"/><path d="M${px - 3},${py - 7} L${px + 3},${py - 7} L${px},${py - 1} Z" fill="#7a3b9a"/>`; };
      if (l.type === 'line') out.push(arrow(l.x));
      else { const a = Math.min(l.x1, l.x2), b = Math.max(l.x1, l.x2), n = Math.max(2, Math.round((b - a) * sc / 14)); for (let k = 0; k <= n; k++) out.push(arrow(a + (b - a) * k / n)); }
    });
    // reinforcement
    (m.reinf || []).forEach(rf => { if (!rf.on) return; const G = memGeom(rf); out.push(`<line x1="${X(G[0])}" y1="${Z(G[1])}" x2="${X(G[2])}" y2="${Z(G[3])}" stroke="${rf.type === 'geo' ? '#1d6b3a' : '#222'}" stroke-width="${rf.type === 'pile' ? 4 : 1.6}"${rf.type === 'geo' ? ' stroke-dasharray="6 3"' : ''}/>`); });
    out.push(ctrlSVG(m, X, Z, r, true));
    out.push(`<polyline points="${P(g)}" fill="none" stroke="#111" stroke-width="1.8"/>`);
    if (r && r.ok) {
      out.push(`<polyline points="${P(r.slip)}" fill="none" stroke="#c0281b" stroke-width="2.4" stroke-linejoin="round"/>`);
      out.push(crackSVG(r, X, Z, true));
      if (o.label) {
        const S = r.slip, xm = (S[0][0] + S[S.length - 1][0]) / 2, w = o.label.length * 6.6 + 12;
        let px = X(xm), py = Z(interp(g, xm)) - 26; px = Math.min(Math.max(px, pad.l + w / 2), W - pad.r - w / 2); py = Math.max(py, pad.t + 12);
        out.push(`<rect x="${px - w / 2}" y="${py - 11}" width="${w}" height="18" rx="3" fill="#fff" stroke="#c0281b"/><text x="${px}" y="${py + 3}" text-anchor="middle" fill="#c0281b" font-weight="bold">${esc(o.label)}</text>`);
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  /* ===================== report (calculation sheet) ===================== */
  function buildReport() {
    const s = model.settings, r = result, B = [];
    const h1 = t => B.push({ t: 'h1', text: t }), h2 = t => B.push({ t: 'h2', text: t }), p = (t, o) => B.push(Object.assign({ t: 'p', text: t }, o || {}));
    const tbl = (head, rows, o) => B.push(Object.assign({ t: 'table', head, rows }, o || {}));
    const fig = (svg, w, h, cap) => B.push({ t: 'img', svg, w, h, cap });
    const n = (v, d) => (v === null || v === undefined || !isFinite(v)) ? '—' : (+v).toFixed(d);
    const G = v => n(toG(v), gTF() ? 3 : 2), C = v => n(toC(v), cTF() ? 3 : 2);
    const mFull = k => k === 'spencer' ? L('Spencer 法', 'Spencer method', 'Spencer 法') : k === 'mp' ? L('Morgenstern–Price 法（半正弦 f(x)）', 'Morgenstern–Price method (half-sine f(x))', 'Morgenstern–Price 法（半正弦 f(x)）') : L('簡易 Janbu 法', 'simplified Janbu method', '簡易 Janbu 法');
    const meth = s.method || 'janbu';
    const info = model.report || {};
    const today = new Date(), dstr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    B.push({ t: 'title', text: info.title || L('邊坡穩定分析計算書', 'Slope Stability Calculation Report', '斜面安定計算書') });
    tbl(null, [
      [L('案名', 'Project', '件名'), info.project || '—'],
      [L('分析者', 'Prepared by', '作成者'), info.author || '—'],
      [L('日期', 'Date', '日付'), dstr],
      [L('分析程式', 'Software', '解析プログラム'), `SSA ${L('邊坡穩定分析（網頁版）', 'Slope Stability Analysis (web edition)', '斜面安定解析（Web 版）')} ${verStr()}, https://cychen59.github.io/ssa-slope-stability/`],
      [L('計算方法', 'Method', '計算方法'), mFull(meth) + (meth === 'janbu' ? (s.useF0 ? L('，以修正後 f0·Fs 判定', ', judged by corrected f0·Fs', '、補正後の f0·Fs で判定') : L('，以未修正 Fs 判定', ', judged by uncorrected Fs', '、補正前の Fs で判定')) : '')],
      ...(info.note ? [[L('備註', 'Notes', '備考'), info.note]] : [])
    ], { kv: true, widths: [1, 3] });

    h1(L('1. 分析方法', '1. Method of analysis', '1. 解析方法'));
    p(L('本計算以二維極限平衡切片法分析邊坡穩定。臨界滑動面以動態規劃（DP）搜尋任意形狀的非圓弧滑動面（中村・久保田，1987；Baker，1980），入口與出口位置由計算決定。孔隙水壓由地下水位換算 u = γw·hw，地震力以擬靜態法（水平震度 kh、垂直震度 kv）考慮。',
      'Slope stability is analysed by the two-dimensional limit equilibrium method of slices. The critical slip surface of arbitrary shape is searched by dynamic programming (DP) (Nakamura and Kubota, 1987; Baker, 1980), with entry and exit points determined by the computation. Pore pressure is obtained from the water table, u = γw·hw, and earthquake loading by the pseudo-static method with horizontal and vertical coefficients kh and kv.',
      '本計算は二次元極限平衡分割法により斜面の安定を解析する。臨界すべり面は動的計画法（DP）により任意形状の非円弧すべり面として探索し（中村・久保田、1987；Baker、1980）、入口と出口の位置も計算で決まる。間隙水圧は地下水位から u = γw·hw として求め、地震力は震度法（水平震度 kh、鉛直震度 kv）で考慮する。'));
    if (meth === 'janbu') p(L('安全係數以簡易 Janbu 法計算，只滿足力平衡；修正係數 f0 依所選公式計算。', 'The factor of safety is computed by the simplified Janbu method, which satisfies force equilibrium only; the correction factor f0 follows the selected formula.', '安全率は力のつり合いのみを満たす簡易 Janbu 法で計算し、補正係数 f0 は選択した式による。'));
    else p(L(`安全係數以${mFull(meth)}計算，同時滿足力與力矩平衡，切片間剪力假設為 X = λ f(x) E。DP 先以簡易 Janbu 法找出臨界滑動面${s.optimize !== false ? '，再以樣式搜尋局部最佳化，使所選方法的 Fs 最小' : ''}。`,
      `The factor of safety is computed by the ${mFull(meth)}, which satisfies both force and moment equilibrium with interslice shear X = λ f(x) E. DP first finds the critical surface with simplified Janbu${s.optimize !== false ? ', and a pattern search then optimises it locally to minimise Fs of the selected method' : ''}.`,
      `安全率は力とモーメントのつり合いを同時に満たす${mFull(meth)}で計算し、スライス間せん断力を X = λ f(x) E と仮定する。DP はまず簡易 Janbu 法で臨界すべり面を求め${s.optimize !== false ? '、パターンサーチで局所最適化して選んだ方法の Fs を最小にする' : 'る'}。`));

    if (pondPolys(model.ground, model.water).length) p(L('地下水位線高於地表的部分視為坡外積水：水重作用在切片頂面，斜坡面上的水壓水平分量抵抗滑動，滑動面上的孔隙水壓由積水面起算。',
      'Where the water line lies above the ground it is treated as ponded water: its weight acts on the slice tops, the horizontal component of the water pressure on the sloping ground resists sliding, and the pore pressure on the slip surface is measured from the pond surface.',
      '地下水位線が地表より高い区間は斜面外の湛水とする。水の重さをスライス上面に作用させ、斜面上の水圧の水平成分は滑動に抵抗し、すべり面の間隙水圧は湛水面から算定する。'));
    if (model.layers.some(Ly => !Ly.bedrock && Ly.pore && Ly.pore.type !== 'wt')) p(L('各土層的孔隙水壓依其設定計算：使用地下水位線或指定水壓線者 u = γw·(水位 − z)，該層在水位以下採飽和單位重；使用孔隙水壓比者 u = ru·σv，σv 為滑動面以上的土柱重量；設為不計者 u = 0。各層設定見 2.2 節。',
      'Pore pressure in each layer follows its setting: with the water table or an assigned piezometric line, u = γw·(level − z) and the layer is saturated below that level; with the pore pressure ratio, u = ru·σv, where σv is the weight of the soil column above the slip surface; with none, u = 0. The settings are listed in Section 2.2.',
      '各地層の間隙水圧は設定に従って計算する。地下水位線または指定した水頭線を用いる地層では u = γw·（水位 − z）とし、その水位以下は飽和単位体積重量とする。間隙水圧比を用いる地層では u = ru·σv（σv はすべり面より上の土柱の重さ）、考慮しない地層では u = 0 とする。各地層の設定は 2.2 節に示す。'));
    if (s.tcOn) p(L(`坡頂考慮張力裂縫：滑動面在坡頂端改為鉛直裂縫，裂縫深度${s.tcMode === 'manual' ? `採指定值 ${n(s.tcDepth, 2)} m` : '依 Rankine 公式 zc = 2c′/(γ√Ka) 以該處地表土層計算'}，裂縫內的土不提供抗剪強度${s.tcWater ? '；裂縫充水，水壓 Pw = ½γw·zc² 水平推向坡外，作用在裂縫底以上 zc/3' : '；裂縫為乾裂縫'}。裂縫位置由搜尋決定。`,
      `A tension crack is considered at the crest: the slip surface ends in a vertical crack whose depth is ${s.tcMode === 'manual' ? `the specified ${n(s.tcDepth, 2)} m` : 'the Rankine depth zc = 2c′/(γ√Ka) of the surface layer at that point'}; the soil in the crack carries no shear${s.tcWater ? '. The crack is water-filled; the force Pw = ½γw·zc² pushes out of the slope at zc/3 above the crack bottom' : '. The crack is dry'}. Its position is found by the search.`,
      `頭部に引張亀裂を考慮する。すべり面の頭部側は鉛直の亀裂とし、亀裂深さは${s.tcMode === 'manual' ? `指定値 ${n(s.tcDepth, 2)} m` : 'その地点の地表の地層による Rankine 式 zc = 2c′/(γ√Ka)'}、亀裂内の土はせん断抵抗を持たない${s.tcWater ? '。亀裂には水が満たされ、水圧 Pw = ½γw·zc² が亀裂底から zc/3 の高さで斜面外向きに作用する' : '。亀裂は乾燥とする'}。亀裂の位置は探索で決まる。`));

    h1(L('2. 輸入資料', '2. Input data', '2. 入力データ'));
    h2(L('2.1 剖面幾何', '2.1 Geometry', '2.1 断面形状'));
    const ptsTxt = A => (A || []).map(q => `(${n(q[0], 2)}, ${n(q[1], 2)})`).join('  ');
    tbl([L('線別', 'Line', '線'), L('座標點 (x, z)（m）', 'Points (x, z) (m)', '座標 (x, z)（m）')], [
      [L('地表線', 'Ground surface', '地表面'), ptsTxt(model.ground)],
      ...model.layers.slice(1).map(Ly => [L(`${Ly.name} 頂面`, `Top of ${Ly.name}`, `${Ly.name} の上面`), ptsTxt(Ly.top)]),
      [L('地下水位線', 'Water table', '地下水位線'), model.water.length >= 2 ? ptsTxt(model.water) : L('無', 'none', 'なし')],
      ...(model.piezo || []).map(q => [q.name, ptsTxt(q.pts)]),
      [L('模型底部高程', 'Model base elevation', 'モデル底面標高'), n(model.zBase, 2) + ' m']
    ], { widths: [1, 4] });
    h2(L('2.2 土層參數', '2.2 Soil properties', '2.2 土質定数'));
    tbl([L('土層', 'Layer', '地層'), `γ (${uG()})`, `γsat (${uG()})`, `c′ (${uC()})`, 'φ′ (°)', L('孔隙水壓', 'Pore pressure', '間隙水圧'), L('岩盤', 'Bedrock', '基盤岩')],
      model.layers.map(Ly => [Ly.name, G(Ly.gamma), G(Ly.gammaSat), C(Ly.c), n(Ly.phi, 1), Ly.bedrock ? '—' : poreName(Ly.pore), Ly.bedrock ? L('是', 'yes', 'はい') : '—']), { widths: [2, 1, 1, 1, 1, 1.6, 0.8] });
    const lds = model.loads.filter(l => l.on), rfs = model.reinf.filter(x => x.on), wls = model.walls.filter(w => w.on);
    let sub = 3;
    if (lds.length) {
      h2(L(`2.${sub++} 地表載重`, `2.${sub - 1} Surface loads`, `2.${sub - 1} 地表荷重`));
      tbl([L('名稱', 'Name', '名称'), L('類型', 'Type', '種類'), L('位置 x (m)', 'Position x (m)', '位置 x (m)'), L('強度', 'Magnitude', '強度'), L('地震慣性力', 'Seismic inertia', '地震慣性力')],
        lds.map(l => [l.name, l.type === 'line' ? L('線載重', 'Line load', '線荷重') : L('分布載重', 'Distributed', '分布荷重'), l.type === 'line' ? n(l.x, 2) : `${n(l.x1, 2)} – ${n(l.x2, 2)}`,
          l.type === 'line' ? `${G(l.P)} ${uF()}` : `${C(l.q)}${l.q2 !== null && l.q2 !== l.q ? ' → ' + C(l.q2) : ''} ${uC()}`, l.seis ? L('計入', 'yes', '考慮') : L('不計', 'no', '考慮しない')]), { widths: [2, 1.4, 1.6, 1.6, 1.2] });
    }
    if (rfs.length) {
      h2(L(`2.${sub++} 補強構件（${s.reinfMode === 'passive' ? '被動法' : '主動法'}）`, `2.${sub - 1} Reinforcement (${s.reinfMode === 'passive' ? 'passive' : 'active'} method)`, `2.${sub - 1} 補強材（${s.reinfMode === 'passive' ? '受働法' : '主働法'}）`));
      const no = x => String(model.reinf.indexOf(x) + 1);
      const na = rfs.filter(x => x.type === 'nail' || x.type === 'anchor' || x.type === 'mpile');
      if (na.length) tbl([L('編號', 'No.', '番号'), L('類型', 'Type', '種類'), L('頭部 (x, z)', 'Head (x, z)', '頭部 (x, z)'), 'θ (°)', 'L (m)', 'Sh (m)', L('容量', 'Capacities', '耐力')],
        na.map(x => [no(x), typeName(x.type), `${n(x.x, 2)}, ${n(x.z, 2)}`, n(x.theta, 1), n(x.L, 2), n(x.Sh, 2),
          x.type === 'anchor' ? `Tt ${G(x.Tt)}, q ${G(x.q)}, P ${G(x.P)}, Lf ${n(x.Lfree, 1)} m` : x.type === 'mpile' ? `${L('軸向', 'axial', '軸')} ${G(x.Tt)}, q ${G(x.q)}, Va ${G(x.Va)}` : `Tt ${G(x.Tt)}, q ${G(x.q)}, Tf ${G(x.Tf)}`]), { widths: [0.6, 1, 1.4, 0.7, 0.7, 0.7, 3] });
      const pl = rfs.filter(x => x.type === 'pile');
      if (pl.length) tbl([L('編號', 'No.', '番号'), L('位置 x (m)', 'x (m)', '位置 x (m)'), 'L (m)', 'D / N', L('鋼管', 'Steel pipe', '鋼管'), L('樁型', 'Type', '形式'), `E0 (${uC()})`],
        pl.map(x => [no(x), n(x.x, 2), n(x.L, 2), `${n(x.D, 2)} m / ${x.N}`, `φ${n(x.Do, 1)}×${n(x.t, 1)} ${x.grade}（${x.term === 'short' ? L('短期', 'short-term', '短期') : L('長期', 'long-term', '長期')}）`, ptypeName(x.ptype), `${x.ptype === 'wedge' ? n(toC(x.E0m), 0) + ' / ' : ''}${n(toC(x.E0b), 0)}（α = ${n(x.aE, 1)}）`]), { widths: [0.6, 0.9, 0.7, 1, 2.2, 1.6, 1.8] });
      const gs = rfs.filter(x => x.type === 'geo');
      if (gs.length) tbl([L('編號', 'No.', '番号'), L('材料', 'Material', '材料'), L('坡面端 (x, z)', 'Face end (x, z)', 'のり面側 (x, z)'), 'L (m)', `Tult (${uQ()})`, 'RF ID / CR / D', 'Ci / α / FS', L('方向', 'Direction', '方向')],
        gs.map(x => [no(x), x.kind === 'tex' ? L('地工織物', 'Geotextile', 'ジオテキスタイル') : L('地工格網', 'Geogrid', 'ジオグリッド'), `${n(x.x, 2)}, ${n(x.z, 2)}`, n(x.L, 2), G(x.Tult), `${n(x.rfID, 2)} / ${n(x.rfCR, 2)} / ${n(x.rfD, 2)}`, `${n(x.Ci, 2)} / ${n(x.aS, 2)} / ${n(x.fsPo, 2)}`, (x.dir === 't' ? L('沿滑動面', 'along slip', 'すべり面方向') : L('水平', 'horizontal', '水平')) + (x.face ? '' : L('，前端拉拔', ', front pullout', '、前方引抜き'))]), { widths: [0.6, 1, 1.4, 0.6, 0.9, 1.3, 1.3, 1.2] });
      if (pl.length || rfs.some(x => x.type === 'mpile')) p(L('抑止樁與微型樁的抵抗力一律計入抵抗側（被動）。', 'Piles and micropiles always count as resistance (passive).', '抑止杭とマイクロパイルの抵抗力は常に抵抗側（受働）に計上する。'), { small: true });
    }
    if (wls.length) {
      h2(L(`2.${sub++} 擋土牆`, `2.${sub - 1} Retaining walls`, `2.${sub - 1} 擁壁`));
      const dimTxt = w => { const q = w.par; if (!q) return L('自訂頂點形狀', 'custom vertices', '任意形状'); const t = w.type || 'gravity';
        return `H ${n(q.H, 2)}, B ${n(q.B, 2)}` + (t === 'gravity' ? `, b ${n(q.b, 2)}` : `, ${L('底版厚', 'slab', '底版厚')} ${n(q.tb, 2)}, ${L('趾長', 'toe', 'つま先')} ${n(q.toe, 2)}, ${L('牆身', 'stem', '竪壁')} ${n(q.ts1, 2)}–${n(q.ts2, 2)}` + (t === 'counterfort' ? `, ${L('扶壁', 'counterforts', '控え壁')} ${n(q.ct, 2)} @ ${n(q.cs, 2)}` : '')) + ` m；${L('前趾', 'toe at', 'つま先')} (${n(q.x0, 2)}, ${n(q.z0, 2)})`; };
      tbl([L('名稱', 'Name', '名称'), L('型式', 'Type', '形式'), `γ (${uG()})`, L('尺寸', 'Dimensions', '寸法'), L('頂點 (x, z)（m）', 'Vertices (x, z) (m)', '頂点 (x, z)（m）')], wls.map(w => [w.name, wallTypeName(w.type), G(w.gamma), dimTxt(w), ptsTxt(w.poly)]), { widths: [1.2, 0.8, 0.7, 2.4, 2.6], small: true });
    }
    const Cc = model.ctrl;
    if (Cc && Cc.on && (Cc.pts.some(q => q.on) || Cc.toe.on || Cc.crest.on)) {
      h2(L(`2.${sub++} 滑動面控制點`, `2.${sub - 1} Slip surface control points`, `2.${sub - 1} すべり面の制御点`));
      p(L('搜尋的滑動面須通過下列控制點（例如傾斜管量測的剪動位置），並落在指定的出入口範圍內。', 'The searched slip surface must pass through the control points below (for example shear zones measured in inclinometers) and cross the ground within the given ranges.', '探索するすべり面は下記の制御点（例：孔内傾斜計で測定したせん断位置）を通り、指定した出入口範囲内で地表と交わるものとした。'));
      tbl([L('控制點', 'Point', '制御点'), 'x (m)', L('地表下深度 (m)', 'Depth (m)', '深さ (m)'), 'z (m)', '±Δz (m)'],
        Cc.pts.filter(q => q.on).map(q => [q.name, n(q.x, 2), n(q.depth, 2), n(ctrlZ(q), 2), n(q.tol, 2)]).concat(
          ['toe', 'crest'].filter(k => Cc[k].on).map(k => [k === 'toe' ? L('坡趾出口範圍', 'Toe exit range', '末端出口範囲') : L('坡頂入口範圍', 'Crest entry range', '頭部入口範囲'), `${n(Cc[k].x1, 2)} – ${n(Cc[k].x2, 2)}`, '—', '—', '—'])), { widths: [1.6, 1.4, 1.2, 1, 1] });
    }
    h2(L(`2.${sub++} 分析設定`, `2.${sub - 1} Analysis settings`, `2.${sub - 1} 解析設定`));
    tbl(null, [
      [L('水平震度 kh／垂直震度 kv', 'Seismic kh / kv', '水平震度 kh／鉛直震度 kv'), `${n(s.kh, 3)} / ${n(s.kv, 3)}`],
      [L('水的單位重 γw', 'Unit weight of water γw', '水の単位体積重量 γw'), `${G(s.gw)} ${uG()}`],
      [L('水位線傾斜修正 cos²θ', 'Inclined water table correction', '水位傾斜補正 cos²θ'), s.cos2 ? L('是', 'yes', 'あり') : L('否', 'no', 'なし')],
      ...(pondPolys(model.ground, model.water).length ? [[L('坡外積水', 'Ponded water', '斜面外の湛水'), L('地下水位線高於地表的部分視為積水，計入水重與水壓', 'Where the water line is above the ground it is treated as ponded water; its weight and pressure are included', '地下水位線が地表より高い区間は湛水とし、水の重さと水圧を考慮')]] : []),
      [L('張力裂縫', 'Tension crack', '引張亀裂'), s.tcOn ? (s.tcMode === 'manual' ? L(`指定深度 ${n(s.tcDepth, 2)} m`, `specified depth ${n(s.tcDepth, 2)} m`, `指定深さ ${n(s.tcDepth, 2)} m`) : L('Rankine 深度 zc = 2c′/(γ√Ka)', 'Rankine depth zc = 2c′/(γ√Ka)', 'Rankine 深さ zc = 2c′/(γ√Ka)')) + (s.tcWater ? L('，充水', ', water-filled', '、水あり') : L('，乾裂縫', ', dry', '、乾燥')) : L('不考慮', 'not considered', '考慮しない')],
      [L('搜尋網格（分割線 × 節點）', 'Search grid (lines × nodes)', '探索格子（分割線 × 節点）'), `${s.nCol} × ${s.nState}${L('，每段切片 ', ', slices per segment ', '、区間スライス ')}${s.nSub}`],
      [L('最小滑動深度', 'Minimum slip depth', '最小すべり深さ'), `${n(s.dmin, 2)} m`],
      [L('凹形限制／不穿越左右邊界', 'Concavity / no boundary crossing', '凹形制約／左右境界を通過しない'), `${s.convex ? '✓' : '—'} / ${s.noBoundary ? '✓' : '—'}`],
      [L('容許誤差 ΔF／最大迭代', 'Tolerance ΔF / max iterations', '許容誤差 ΔF／最大反復'), `${s.tol} / ${s.maxIter}`],
      [L('修正係數 f0 公式', 'Correction factor f0', '補正係数 f0'), s.f0type === 'janbu' ? 'f0 = 1 + b1[d/L − 1.4(d/L)²]' : 'f0 = (50d/L)^0.03'],
      [L('要求安全係數（目前條件）', 'Required Fs (current model)', '所要安全率（現在の条件）'), n(s.Freq, 2)]
    ], { kv: true, widths: [2, 3] });

    let sec = 3;
    computeWalls();
    if (wallRes.length) {
      h1(L(`${sec}. 擋土牆外部穩定`, `${sec}. External stability of retaining walls`, `${sec}. 擁壁の外的安定`));
      p(L('擋土牆外部穩定把牆體與底版上方的土體視為剛體，依力的平衡檢核滑動、傾倒、合力位置與基礎承載力。重力式擋土牆以 Coulomb 公式計算牆背的主動土壓力；懸臂式與扶壁式擋土牆以通過踵端的鉛直假想背面計算，採 Rankine 公式（δ = β），底版上方的土重計入牆體。地震時以 Mononobe–Okabe 公式計算土壓力，並計入牆體與土體的慣性力 kh·W。牆後水壓與底面揚壓力依地下水位計算，基礎承載力以 Meyerhof 公式計算（有效寬度 B′ = B − 2e，含深度與荷重傾斜係數）。',
        'External stability treats the wall and the soil above its base slab as a rigid body and checks sliding, overturning, the position of the resultant and bearing capacity from force equilibrium. For gravity walls the active earth pressure on the back is computed by the Coulomb formula; for cantilever and counterfort walls it acts on a vertical virtual back through the heel, by the Rankine formula (δ = β), with the soil above the base slab counted in the wall weight. In seismic cases the earth pressure follows the Mononobe–Okabe formula and the inertia kh·W of the wall and soil is included. Water pressure behind the wall and uplift on the base follow the water table; bearing capacity is computed by the Meyerhof formula (effective width B′ = B − 2e, with depth and load inclination factors).',
        '擁壁の外的安定は擁壁と底版上の土を剛体とみなし、力のつり合いから滑動・転倒・合力位置・支持力を照査する。重力式擁壁は背面の主働土圧を Coulomb 式で求める。片持ばり式と控え壁式は踵を通る鉛直な仮想背面に Rankine 式（δ = β）で土圧を作用させ、底版上の土の重量を擁壁に含める。地震時は物部・岡部式で土圧を求め、擁壁と土の慣性力 kh·W を考慮する。背面水圧と底面の揚圧力は地下水位から求め、支持力は Meyerhof 式（有効幅 B′ = B − 2e、根入れ係数と荷重傾斜係数を含む）で求める。'));
      const C0 = wallCode();
      p(L(`要求值依「${C0.name()}」：滑動 Fs ≥ ${C0.slide[0].toFixed(1)}（地震時 ${C0.slide[1].toFixed(1)}），傾倒 Fs ≥ ${C0.ot[0].toFixed(1)}（地震時 ${C0.ot[1].toFixed(1)}），承載力 Fs ≥ ${C0.bear[0].toFixed(1)}（地震時 ${C0.bear[1].toFixed(1)}）${C0.ecc ? '；合力位置在土層須位於底面中間三分之一（e ≤ B/6），岩盤須位於中間二分之一（e ≤ B/4）' : '；合力須位於底面內'}。`,
        `Required values follow “${C0.name()}”: sliding Fs ≥ ${C0.slide[0].toFixed(1)} (seismic ${C0.slide[1].toFixed(1)}), overturning Fs ≥ ${C0.ot[0].toFixed(1)} (seismic ${C0.ot[1].toFixed(1)}), bearing Fs ≥ ${C0.bear[0].toFixed(1)} (seismic ${C0.bear[1].toFixed(1)})${C0.ecc ? '; the resultant must lie in the middle third of the base on soil (e ≤ B/6) and in the middle half on rock (e ≤ B/4)' : '; the resultant must lie within the base'}.`,
        `所要値は「${C0.name()}」による。滑動 Fs ≥ ${C0.slide[0].toFixed(1)}（地震時 ${C0.slide[1].toFixed(1)}）、転倒 Fs ≥ ${C0.ot[0].toFixed(1)}（地震時 ${C0.ot[1].toFixed(1)}）、支持力 Fs ≥ ${C0.bear[0].toFixed(1)}（地震時 ${C0.bear[1].toFixed(1)}）${C0.ecc ? '。合力位置は土質地盤で底面の中央 1/3（e ≤ B/6）、岩盤で中央 1/2（e ≤ B/4）以内' : '。合力は底面内'}。`));
      const ok = b => b ? 'OK' : 'NG', f2 = v => !isFinite(v) ? '∞' : n(v, 2);
      wallRes.forEach((R, wi) => {
        h2(L(`${sec}.${wi + 1} W${R.i + 1} ${R.w.name}（${wallTypeName(R.w.type)}）`, `${sec}.${wi + 1} W${R.i + 1} ${R.w.name} (${wallTypeName(R.w.type)})`, `${sec}.${wi + 1} W${R.i + 1} ${R.w.name}（${wallTypeName(R.w.type)}）`));
        const bad = R.cases.find(q => q.r && !q.r.ok);
        if (bad) { p(tx(bad.r.msg)); return; }
        const cs = R.cases, cell = fn => cs.map(q => q.err ? '—' : fn(q));
        const head = [L('項目', 'Item', '項目'), ...cs.map(q => q.c.name + (q.c.seis ? `（kh ${n(q.c.kh, 2)}）` : ''))];
        const rows = [
          [L('滑動 Fs', 'Sliding Fs', '滑動 Fs'), ...cell(q => `${f2(q.r.FSs)} ≥ ${n(q.chk.slide.req, 1)} ${ok(q.chk.slide.ok)}`)],
          [L('傾倒 Fs', 'Overturning Fs', '転倒 Fs'), ...cell(q => `${f2(q.r.FSo)} ≥ ${n(q.chk.ot.req, 1)} ${ok(q.chk.ot.ok)}`)],
          [L('偏心 |e| (m)', 'Eccentricity |e| (m)', '偏心 |e| (m)'), ...cell(q => `${n(Math.abs(q.r.e), 3)}${q.chk.ecc.lim === null ? '' : ` ≤ ${n(q.chk.ecc.lim, 3)}`} ${ok(q.chk.ecc.ok)}`)],
          [L(`qmax／qmin (${uC()})`, `qmax / qmin (${uC()})`, `qmax／qmin (${uC()})`), ...cell(q => q.r.out ? L('合力在底面外', 'resultant outside base', '合力が底面外') : `${C(q.r.qmax)} / ${C(q.r.qmin)}`)],
          [L('承載力', 'Bearing', '支持力'), ...cell(q => q.chk.bear.mode === 'qa' ? `qmax ≤ qa ${C(q.chk.bear.lim)} ${ok(q.chk.bear.ok)}` : `Fs ${f2(q.r.FSb)} ≥ ${n(q.chk.bear.req, 1)} ${ok(q.chk.bear.ok)}`)],
          [L('判定', 'Result', '判定'), ...cs.map(q => q.err ? q.err : q.chk.all ? L('符合', 'OK', '満足') : L('不符合', 'NG', '不満足'))],
          [L('背填土／基礎土 φ′', 'Backfill / foundation φ′', '裏込め／支持層 φ′'), ...cell(q => `${q.r.backfill.name} ${n(q.r.backfill.phi, 1)}° / ${q.r.found.name} ${n(q.r.found.phi, 1)}°`)],
          [L('β／δ／K', 'β / δ / K', 'β／δ／K'), ...cell(q => `${n(q.r.beta, 1)}° / ${n(q.r.delta, 1)}° / ${n(q.r.K, 4)}${q.r.kh > 0 ? ' (M–O)' : ''}`)],
          [L(`h (m)／q (${uC()})`, `h (m) / q (${uC()})`, `h (m)／q (${uC()})`), ...cell(q => `${n(q.r.hb, 2)} / ${C(q.r.q)}`)],
          [L(`Pa (${uF()})／作用高 (m)`, `Pa (${uF()}) / height (m)`, `Pa (${uF()})／作用高 (m)`), ...cell(q => `${G(q.r.Pa)} / ${n(q.r.za, 2)}`)],
          [L(`Pw／U (${uF()})`, `Pw / U (${uF()})`, `Pw／U (${uF()})`), ...cell(q => `${G(q.r.Pw)} / ${G(q.r.U)}`)],
          [L(`ΣW／ΣV／ΣH (${uF()})`, `ΣW / ΣV / ΣH (${uF()})`, `ΣW／ΣV／ΣH (${uF()})`), ...cell(q => `${G(q.r.Wsum)} / ${G(q.r.V)} / ${G(q.r.Hd)}`)],
          [L(`Mr／Mo (${uF()}·m)`, `Mr / Mo (${uF()}·m)`, `Mr／Mo (${uF()}·m)`), ...cell(q => `${G(q.r.Mr)} / ${G(q.r.Mo)}`)],
          [L(`μ／Pp (${uF()})`, `μ / Pp (${uF()})`, `μ／Pp (${uF()})`), ...cell(q => `${n(q.r.mu, 3)} / ${G(q.r.Pp)}`)],
          [L(`qu (${uC()})／B′ (m)`, `qu (${uC()}) / B′ (m)`, `qu (${uC()})／B′ (m)`), ...cell(q => `${C(q.r.qu)} / ${n(q.r.Bp, 2)}`)]
        ];
        tbl(head, rows, { small: true, widths: [1.6, ...cs.map(() => 1.6)] });
        const warns = [...new Set(cs.filter(q => q.r).flatMap(q => q.r.warn))];
        if (warns.length) p(warns.map(t => tx(t)).join(' '), { small: true });
      });
      p(L('力矩以前趾為中心；ΣH 含土壓力水平分量、水壓與地震慣性力，ΣV 已扣除揚壓力。', 'Moments are about the toe; ΣH includes the horizontal earth thrust, water pressure and seismic inertia, and ΣV is net of uplift.', 'モーメントはつま先回りとする。ΣH は土圧の水平成分・水圧・地震慣性力を含み、ΣV は揚圧力を差し引いた値である。'), { small: true });
      sec++;
    }
    h1(L(`${sec}. 計算結果（目前條件）`, `${sec}. Results (current model)`, `${sec}. 計算結果（現在の条件）`));
    if (!r || !r.ok) p(L('尚無有效的計算結果。', 'No valid result is available.', '有効な計算結果がありません。'));
    else {
      const Fj = judgeF(r, s), rg = rigOf(r);
      fig(reportSVG(model, r, { W: 900, H: 420, label: `Fs = ${n(Fj, 3)}` }), 900, 420, L(`圖 1　剖面與臨界滑動面（${r.mode === 'trial' ? '指定滑動面' : '自動搜尋'}）`, `Figure 1  Cross-section and critical slip surface (${r.mode === 'trial' ? 'specified surface' : 'search'})`, `図 1　断面と臨界すべり面（${r.mode === 'trial' ? '指定すべり面' : '自動探索'}）`));
      const S = r.slip, toe = r.mirror ? S[S.length - 1] : S[0], head = r.mirror ? S[0] : S[S.length - 1];
      tbl(null, [
        [L('判定用安全係數 Fs', 'Factor of safety for judgement', '判定用安全率 Fs'), `${n(Fj, 3)}（${rg && rg.ok ? mFull(meth) : (s.useF0 ? 'f0·Fs' : L('簡易 Janbu 未修正', 'simplified Janbu, uncorrected', '簡易 Janbu 補正なし'))}）`],
        [L('要求安全係數／判定', 'Required Fs / result', '所要安全率／判定'), `${n(s.Freq, 2)} / ${Fj >= s.Freq ? L('符合', 'OK', '満足') : L('不符合', 'NG', '不満足')}`],
        [L('簡易 Janbu Fs／修正後 f0·Fs', 'Simplified Janbu Fs / f0·Fs', '簡易 Janbu Fs／補正後 f0·Fs'), `${n(r.F, 3)} / ${n(r.Fc, 3)}（f0 = ${n(r.f0, 3)}）`],
        [L('Spencer 法 Fs（λ）', 'Spencer Fs (λ)', 'Spencer 法 Fs（λ）'), r.rig && r.rig.spencer.ok ? `${n(r.rig.spencer.F, 3)}（${n(r.rig.spencer.lam, 3)}）` : L('未收斂', 'no convergence', '収束せず')],
        [L('Morgenstern–Price 法 Fs（λ）', 'Morgenstern–Price Fs (λ)', 'Morgenstern–Price 法 Fs（λ）'), r.rig && r.rig.mp.ok ? `${n(r.rig.mp.F, 3)}（${n(r.rig.mp.lam, 3)}）` : L('未收斂', 'no convergence', '収束せず')],
        [L('滑動體面積／最大鉛直深度', 'Sliding mass area / max depth', 'すべり土塊面積／最大鉛直深さ'), `${n(r.area, 1)} m² / ${n(r.dmaxV, 2)} m`],
        [L('坡趾出口／坡頂入口 (x, z)', 'Toe exit / crest entry (x, z)', '末端出口／頭部入口 (x, z)'), `(${n(toe[0], 2)}, ${n(toe[1], 2)}) / (${n(head[0], 2)}, ${n(head[1], 2)})`],
        ...(r.mode === 'trial' && trialCircleNow() ? [[L('指定滑動面', 'Specified surface', '指定すべり面'), L(`圓弧，圓心 (${n(trialCircleNow().xc, 2)}, ${n(trialCircleNow().zc, 2)})，半徑 ${n(trialCircleNow().R, 2)} m`, `circle, centre (${n(trialCircleNow().xc, 2)}, ${n(trialCircleNow().zc, 2)}), radius ${n(trialCircleNow().R, 2)} m`, `円弧、中心 (${n(trialCircleNow().xc, 2)}, ${n(trialCircleNow().zc, 2)})、半径 ${n(trialCircleNow().R, 2)} m`)]] : []),
        ...(r.crack ? [[L('張力裂縫 x／深度／水壓 Pw', 'Tension crack x / depth / Pw', '引張亀裂 x／深さ／水圧 Pw'), `${n(r.crack.x, 2)} m / ${n(r.crack.d, 2)} m / ${r.crack.water ? `${G(r.crack.Pw)} ${uF()}` : L('乾裂縫', 'dry', '乾燥')}`]] : s.tcOn ? [[L('張力裂縫', 'Tension crack', '引張亀裂'), L('臨界滑動面不含裂縫', 'none on the critical surface', '臨界すべり面に亀裂なし')]] : []),
        ...(r.pond ? [[L('坡外積水水平推力', 'Ponded water thrust', '湛水の水平力'), `${G(r.pond)} ${uF()}`]] : []),
        ...(r.base && r.base.ok ? [[L('無補強措施 Fs', 'Fs without reinforcement', '補強なし Fs'), n(judgeF(r.base, s), 3)]] : []),
        ...(r.baseLoad && r.baseLoad.ok ? [[L('無載重 Fs', 'Fs without loads', '荷重なし Fs'), n(judgeF(r.baseLoad, s), 3)]] : [])
      ], { kv: true, widths: [2, 3] });
      if (r.ctrl) tbl([L('控制點', 'Point', '制御点'), 'x', L('控制 z', 'Control z', '制御 z'), '±Δz', L('滑動面 z', 'Surface z', 'すべり面 z'), L('判定', 'Result', '判定')],
        r.ctrl.pts.map(q => [q.name, n(q.x, 2), n(q.z, 2), n(q.tol, 2), n(q.zs, 2), q.ok ? L('通過', 'passes', '通過') : L('未通過', 'misses', '未通過')]).concat(
          ['toe', 'crest'].filter(k => r.ctrl[k]).map(k => [k === 'toe' ? L('坡趾出口', 'Toe exit', '末端出口') : L('坡頂入口', 'Crest entry', '頭部入口'), n(r.ctrl[k].x, 2), `${n(r.ctrl[k].r[0], 2)} – ${n(r.ctrl[k].r[1], 2)}`, '—', '—', r.ctrl[k].ok ? L('符合', 'OK', '満足') : L('不符合', 'NG', '不満足')])), { widths: [1.4, 1, 1.4, 0.8, 1, 1] });
      p(L('臨界滑動面座標 (x, z)：', 'Critical slip surface (x, z):', '臨界すべり面の座標 (x, z)：') + ptsTxt(S.filter((_, i) => S.length <= 60 || i % Math.ceil(S.length / 60) === 0 || i === S.length - 1)), { small: true });
      if (r.members && r.members.length) {
        tbl([L('構件', 'Member', '補強材'), L('交點 (x, z)', 'Crossing (x, z)', '交点 (x, z)'), 'Le (m)', `T (${uF()})`, L('控制條件', 'Governed by', '支配条件')],
          r.members.map(mm => [`${mm.idx + 1} ${typeName(mm.type)}`, mm.crossed ? `${n(mm.xi, 2)}, ${n(mm.zi, 2)}` : '—', mm.crossed ? n(mm.Le, 2) : '—', mm.crossed ? G(mm.Tm) : '0', tx(mm.ctrl) || '—']), { widths: [1.3, 1.5, 0.8, 1, 1.6] });
      }
      if (pdValid() && pd.res.ok) {
        const o = pd.res, N = v => n(v / 1000, 1), ok = b => b ? 'OK' : 'NG';
        p(L(`抑止樁設計（地すべり防止技術指針）：在${o.useBase ? '無補強措施的' : '目前的'}臨界滑動面上，以 ${o.method === 'janbu' ? '簡易 Janbu 法' : mFull(o.method)} 求使 Fs 達到計畫安全率 ${n(o.PFs, 2)} 的必要抑止力 Pr，每支樁設計荷重 H = Pr·cosθ·D/N。`,
          `Stabilizing pile design (Japanese landslide prevention guideline): on the ${o.useBase ? 'critical surface without reinforcement' : 'current critical surface'}, the required restraint force Pr that raises Fs (${o.method === 'janbu' ? 'simplified Janbu' : mFull(o.method)}) to the planned safety factor ${n(o.PFs, 2)}; design load per pile H = Pr·cosθ·D/N.`,
          `抑止杭の設計（地すべり防止技術指針）：${o.useBase ? '対策なしの' : '現在の'}臨界すべり面で、Fs（${o.method === 'janbu' ? '簡易 Janbu 法' : mFull(o.method)}）を計画安全率 ${n(o.PFs, 2)} にする必要抑止力 Pr を求め、1 本当たり設計荷重 H = Pr·cosθ·D/N とする。`));
        for (const q of o.piles) {
          if (!q.ok) { p(`#${q.i + 1}：${tx(q.msg)}`); continue; }
          const c = q.chk;
          tbl(null, [
            [L(`抑止樁 #${q.i + 1}（x = ${n(q.x, 2)} m）`, `Pile #${q.i + 1} (x = ${n(q.x, 2)} m)`, `抑止杭 #${q.i + 1}（x = ${n(q.x, 2)} m）`), `${ptypeName(c.ptype)}`],
            [L('無樁時 Fs → 計畫安全率', 'Fs without piles → planned', '杭なしの Fs → 計画安全率'), `${n(q.F0, 3)} → ${n(o.PFs, 2)}`],
            [L('必要抑止力 Pr', 'Required restraint force Pr', '必要抑止力 Pr'), `${G(q.Pr)} ${uF()}`],
            [L('θ／Le／Lr', 'θ / Le / Lr', 'θ／Le／Lr'), `${n(q.th, 1)}° / ${n(c.Le, 2)} m / ${n(c.Lr, 2)} m`],
            [L('每支 H／V', 'Per pile H / V', '1 本当たり H／V'), `${G(c.H)} / ${G(c.V)} ${uT()}`],
            ['kh / β', `${c.ptype === 'wedge' ? `${n(c.kh1, 0)} / ${n(c.b1, 4)}；` : ''}${n(c.kh2, 0)} kN/m³ / ${n(c.b2, 4)} m⁻¹`],
            [L('最大彎矩', 'Maximum moment', '最大曲げモーメント'), c.ptype === 'wedge' ? `M1 ${G(Math.abs(c.M1))}（${n(c.x1, 2)} m）／M2 ${G(Math.abs(c.M2))}（${n(c.x2, 2)} m） ${uT()}·m` : `${G(c.Mmax)} ${uT()}·m（h = ${n(c.h, 2)} m）`],
            [L('彎曲應力 σ／σa', 'Bending σ / σa', '曲げ応力 σ／σa'), `${N(c.sigma)} / ${N(c.sec.sa)} N/mm² ${ok(c.ok.sigma)}`],
            [L('剪應力 τ／τa', 'Shear τ / τa', 'せん断応力 τ／τa'), `${N(c.tau)} / ${N(c.sec.ta)} N/mm² ${ok(c.ok.tau)}`],
            [L('根入長度／需要', 'Embedment / required', '根入れ長／必要'), `${n(c.Lr, 2)} / ${n(c.Lreq, 2)} m ${ok(c.ok.emb)}`],
            [L('地盤降伏 H／Qp', 'Ground yield H / Qp', '地盤の降伏 H／Qp'), `${G(c.H)} / ${c.ptype === 'wedge' ? `Qp1 ${G(c.Qp1)} ${ok(c.ok.qp1)}，` : ''}Qp2 ${G(c.Qp2)} ${ok(c.ok.qp2)}`],
            [L('判定', 'Result', '判定'), `${c.allOk ? 'OK' : 'NG'}${L(`（容許 H = ${G(c.Hallow)} ${uT()}，${tx(c.ctrl)}控制）`, ` (allowable H = ${G(c.Hallow)} ${uT()}, ${tx(c.ctrl)})`, `（許容 H = ${G(c.Hallow)} ${uT()}、${tx(c.ctrl)}で決定）`)}`]
          ], { kv: true, widths: [2, 3] });
        }
        p(L(`力為 ${uT()}，彎矩為 ${uT()}·m，應力為 N/mm²，長度為 m。`, `Forces in ${uT()}, moments in ${uT()}·m, stresses in N/mm², lengths in m.`, `力は ${uT()}、モーメントは ${uT()}·m、応力は N/mm²、長さは m。`), { small: true });
      }
      h2(L(`${sec}.1 切片明細`, `${sec}.1 Slice details`, `${sec}.1 スライス明細`));
      const ex = rg && rg.ok && r.rows.length && r.rows[0].E !== undefined;
      const nr = r.rows.length, stp = Math.max(1, Math.ceil(nr / 50)), rowsR = r.rows.filter((_, i) => i % stp === 0 || i === nr - 1);
      if (stp > 1) p(L(`共 ${nr} 片，下表每 ${stp} 片列出 1 片；完整切片表可在網頁「切片明細」複製為 CSV。`, `${nr} slices in total; every ${stp}th slice is listed below. The full table can be copied as CSV from “Slice details” on the web page.`, `スライスは全 ${nr} 個で、下表では ${stp} 個ごとに 1 個を示す。全スライスの表は Web ページの「スライス明細」から CSV でコピーできる。`), { small: true });
      tbl(['x (m)', 'b (m)', 'z (m)', 'α (°)', `W (${uF()})`, `u (${uC()})`, `c′ (${uC()})`, 'φ′ (°)', L('土層', 'Layer', '地層'), ...(ex ? [`E (${uF()})`, `X (${uF()})`] : [`R (${uF()})`, `D (${uF()})`])],
        rowsR.map(x => [n(x.xc, 2), n(x.b, 2), n(x.zc, 2), n(x.alpha, 1), G(x.W), C(x.u), C(x.c), n(x.phi, 1), x.layer, ...(ex ? [G(x.E), G(x.X)] : [G(x.res), G(x.drv)])]), { small: true, widths: [1, 0.8, 1, 0.8, 1.1, 1, 0.9, 0.8, 1.5, 1.1, 1.1] });
    }

    if (scen && !scen.stale && scen.items.some(it => it.r && it.r.ok)) {
      sec++;
      h1(L(`${sec}. 多情境檢核`, `${sec}. Multi-case check`, `${sec}. 複数ケースの照査`));
      p(L('各情境的地下水位、震度與要求安全係數如下表，要求安全係數預設採水土保持技術規範第 73 條（永久性），分析者可依適用規範修改。每個情境各自搜尋臨界滑動面。', 'Water table, seismic coefficients and required factor of safety of each case are listed below; required values default to Art. 73 of the Soil and Water Conservation Technical Regulations (permanent slopes) and may be changed by the analyst according to the applicable code. The critical surface is searched separately for each case.', '各ケースの地下水位、震度、所要安全率を下表に示す。所要安全率の既定値は水土保持技術規範第 73 条（永久）とし、解析者が適用基準に応じて変更できる。臨界すべり面はケースごとに探索した。'));
      const rows = scenTableRows(scen.items);
      tbl([L('情境', 'Case', 'ケース'), L('地下水位', 'Water table', '地下水位'), 'kh', 'kv', L('載重／補強', 'Loads / reinf.', '荷重／補強'), 'Fs', L('要求值', 'Required', '所要値'), L('判定', 'Result', '判定')],
        rows.map(x => [x.name, x.water, n(x.kh, 3), n(x.kv, 3), `${x.it.sc.loads ? '✓' : '—'} / ${x.it.sc.reinf ? '✓' : '—'}`, n(x.F, 3), x.Freq === null ? '—' : n(x.Freq, 2), x.v.txt + (x.msg ? `（${x.msg}）` : '')]), { widths: [1.3, 2, 0.7, 0.7, 1, 0.8, 0.9, 1.2] });
      let k = 2;
      scen.items.forEach(it => { if (it.r && it.r.ok) fig(reportSVG(it.m, it.r, { W: 900, H: 380, label: `Fs = ${n(it.Fj, 3)}` }), 900, 380, L(`圖 ${k}　情境「${it.sc.name}」的臨界滑動面`, `Figure ${k}  Critical slip surface, case “${it.sc.name}”`, `図 ${k}　ケース「${it.sc.name}」の臨界すべり面`)), k++; });
    }
    sec++;
    h1(L(`${sec}. 附註`, `${sec}. Notes`, `${sec}. 注記`));
    p(L('本計算為二維平面應變極限平衡分析，不考慮基質吸力，孔隙水壓以水位線（靜水壓）或 ru 計算，不做滲流分析，坡外積水以靜水壓處理；補強構件只承受拉力；擋土牆外部穩定把牆體當作剛體，牆後土壓力只計均布載重，牆身與底版的結構強度應另行檢核。計算結果僅供參考，工程判斷與設計應由專業人員依現地調查與相關規範負責。',
      'This is a two-dimensional plane-strain limit equilibrium analysis; matric suction is not considered, pore pressure comes from water lines (hydrostatic) or ru without seepage analysis, and ponded water is treated as hydrostatic. Reinforcement carries tension only. External wall stability treats the wall as a rigid body and the earth pressure behind it includes uniform loads only; the structural strength of the stem and base slab must be checked separately. Results are for reference; engineering judgement and design remain the responsibility of qualified professionals based on site investigation and the applicable codes.',
      '本計算は二次元平面ひずみの極限平衡解析であり、サクションは考慮せず、間隙水圧は水位線（静水圧）または ru で算定し浸透流解析は行わず、斜面外の湛水は静水圧として扱う。補強材は引張のみを受け持つ。擁壁の外的安定は擁壁を剛体として扱い、背面土圧には等分布荷重のみを考慮する。竪壁と底版の部材強度は別途照査すること。計算結果は参考値であり、工学的判断と設計は現地調査と関連基準に基づき有資格の技術者が責任を負う。'));
    p(L('參考文獻：陳振宇、藤田正治、堤大三（2014），中華水土保持學報，45(4)，243-256；中村浩之、久保田哲也（1987），土木研究所資料第 2425 號；Spencer (1967)；Morgenstern and Price (1965)；Janbu (1973)；Baker (1980)' + (wallRes.length ? '；Coulomb (1776)；Rankine (1857)；Okabe (1926)；Mononobe and Matsuo (1929)；Meyerhof (1963)' : '') + '。',
      'References: Chen, Fujita and Tsutsumi (2014), J. Chinese Soil and Water Conservation 45(4), 243-256; Nakamura and Kubota (1987), PWRI Technical Memorandum 2425; Spencer (1967); Morgenstern and Price (1965); Janbu (1973); Baker (1980)' + (wallRes.length ? '; Coulomb (1776); Rankine (1857); Okabe (1926); Mononobe and Matsuo (1929); Meyerhof (1963)' : '') + '.',
      '参考文献：陳振宇・藤田正治・堤大三（2014）、中華水土保持学報 45(4)、243-256；中村浩之・久保田哲也（1987）、土木研究所資料第 2425 号；Spencer (1967)；Morgenstern and Price (1965)；Janbu (1973)；Baker (1980)' + (wallRes.length ? '；Coulomb (1776)；Rankine (1857)；岡部 (1926)；物部・松尾 (1929)；Meyerhof (1963)' : '') + '。'), { small: true });
    p(L(`本計算書由 SSA v${SSA_VERSION}（${SSA_DATE}）產生。此版本的驗證報告可在網頁「說明」頁執行並下載。`, `Generated by SSA v${SSA_VERSION} (${SSA_DATE}). The verification report of this version can be run and downloaded on the Help tab.`, `本計算書は SSA v${SSA_VERSION}（${SSA_DATE}）で作成。この版の検証報告書は「説明」タブで実行・保存できます。`), { small: true });
    return B;
  }
  /* ---- HTML (print / PDF) ---- */
  function reportHTML(B) {
    const e = s => esc(s);
    const body = B.map(b => {
      if (b.t === 'title') return `<h1 class="title">${e(b.text)}</h1>`;
      if (b.t === 'h1') return `<h2>${e(b.text)}</h2>`;
      if (b.t === 'h2') return `<h3>${e(b.text)}</h3>`;
      if (b.t === 'p') return `<p${b.small ? ' class="small"' : ''}>${e(b.text)}</p>`;
      if (b.t === 'img') return `<figure>${b.svg.replace('<svg ', '<svg style="width:100%;height:auto" ')}<figcaption>${e(b.cap)}</figcaption></figure>`;
      if (b.t === 'table') {
        const tot = (b.widths || []).reduce((a, c) => a + c, 0);
        const cols = b.widths ? `<colgroup>${b.widths.map(w => `<col style="width:${(100 * w / tot).toFixed(1)}%">`).join('')}</colgroup>` : '';
        return `<table class="${b.kv ? 'kv' : ''}${b.small ? ' small' : ''}">${cols}${b.head ? `<thead><tr>${b.head.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${b.rows.map(r => `<tr>${r.map((c, i) => b.kv && i === 0 ? `<th>${e(c)}</th>` : `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
      return '';
    }).join('\n');
    const lang = LANG === 'zh' ? 'zh-Hant' : LANG;
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${e(B[0].text)}</title><style>
      @page{size:A4;margin:18mm 16mm}
      body{font-family:"Noto Sans TC","Microsoft JhengHei","PingFang TC","Noto Sans JP","Yu Gothic",Arial,sans-serif;font-size:10.5pt;line-height:1.55;color:#111;margin:0}
      h1.title{font-size:18pt;text-align:center;margin:0 0 10px}
      h2{font-size:13pt;margin:16px 0 6px;border-bottom:1px solid #999;padding-bottom:2px;break-after:avoid}
      h3{font-size:11pt;margin:12px 0 4px;break-after:avoid}
      p{margin:4px 0}.small{font-size:8.5pt}
      table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:9pt}
      table.small{font-size:7.5pt}
      th,td{border:1px solid #888;padding:2px 5px;text-align:left;vertical-align:top;word-break:break-word}
      thead th{background:#e8eee9}
      table.kv th{background:#f2f4f2;font-weight:600;width:auto}
      thead{display:table-header-group}tr{break-inside:avoid}
      figure{margin:8px 0;break-inside:avoid;text-align:center}figcaption{font-size:9pt;margin-top:2px}
    </style></head><body>${body}</body></html>`;
  }
  function printHTML(html, name) {
    let fr = document.getElementById('printFrame');
    if (fr) fr.remove();
    fr = document.createElement('iframe'); fr.id = 'printFrame';
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const d = fr.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { saveFile(`${name}-${stamp()}.html`, html); } }, 400);
    status(L('已開啟列印視窗，可選「另存為 PDF」。', 'The print dialog is open; choose “Save as PDF” to get a PDF.', '印刷画面を開きました。「PDF に保存」を選べます。'));
  }
  function printReport() {
    if (!result || !result.ok || stale) { status(L('請先完成計算（結果需為最新）再輸出計算書。', 'Run the analysis first (results must be up to date) before exporting the report.', '計算書を出力する前に計算を実行してください（結果が最新である必要があります）。')); return; }
    printHTML(reportHTML(buildReport()), 'SSA-report');
  }


  /* ---- DOCX (Office Open XML, written directly; images rendered from SVG to PNG) ---- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zipStore(files) {
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cen.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cenSize = cen.reduce((a, u) => a + u.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cenSize, true); e.setUint32(16, off, true);
    const all = [...parts, ...cen, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((a, u) => a + u.length, 0));
    let p = 0; for (const u of all) { out.set(u, p); p += u.length; }
    return out;
  }
  function svgToPng(svg, w, h, scale) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? b.arrayBuffer().then(a => res(new Uint8Array(a))) : rej(new Error('png')), 'image/png');
      };
      img.onerror = () => rej(new Error('svg'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  async function reportDOCX(B) {
    const X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const run = (t, o) => `<w:r>${o ? `<w:rPr>${o.b ? '<w:b/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
    const para = (t, o) => { o = o || {}; return `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.tight ? '<w:spacing w:before="0" w:after="0"/>' : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${t === '' ? '' : run(t, o.r)}</w:p>`; };
    const TW = 9638, media = [], body = [];
    let imgN = 0;
    for (const b of B) {
      if (b.t === 'title') body.push(para(b.text, { style: 'Title' }));
      else if (b.t === 'h1') body.push(para(b.text, { style: 'Heading1' }));
      else if (b.t === 'h2') body.push(para(b.text, { style: 'Heading2' }));
      else if (b.t === 'p') body.push(para(b.text, { r: b.small ? { sz: 17 } : null }));
      else if (b.t === 'img') {
        imgN++;
        const png = await svgToPng(b.svg, b.w, b.h, 2);
        media.push({ name: `word/media/image${imgN}.png`, data: png });
        const cx = 6120000, cy = Math.round(cx * b.h / b.w);
        body.push(`<w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${imgN}" name="Figure ${imgN}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imgN}" name="image${imgN}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${imgN}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
        body.push(para(b.cap, { style: 'Caption', jc: 'center' }));
      } else if (b.t === 'table') {
        const ncol = (b.head || b.rows[0]).length, wts = b.widths && b.widths.length >= ncol ? b.widths.slice(0, ncol) : Array(ncol).fill(1), tot = wts.reduce((a, c) => a + c, 0);
        const ws = wts.map(w => Math.round(TW * w / tot)), sz = b.small ? 15 : 18;
        const cell = (t, i, hd) => `<w:tc><w:tcPr><w:tcW w:w="${ws[i]}" w:type="dxa"/>${hd ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EEE9"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${run(t, { sz, b: hd })}</w:p></w:tc>`;
        const bd = s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="888888"/>`;
        let x = `<w:tbl><w:tblPr><w:tblW w:w="${TW}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(bd).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${ws.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
        if (b.head) x += `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.head.map((h, i) => cell(h, i, true)).join('')}</w:tr>`;
        for (const r of b.rows) x += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, i, b.kv && i === 0)).join('')}</w:tr>`;
        body.push(x + '</w:tbl>', para('', { tight: true }));
      }
    }
    const ea = LANG === 'ja' ? 'Yu Gothic' : 'Microsoft JhengHei', lang = LANG === 'ja' ? 'ja-JP' : LANG === 'en' ? 'en-US' : 'zh-TW';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}<w:sectPr><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const st = (id, name, ppr, rpr, extra) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra || ''}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="${ea}" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="${lang}" w:eastAsia="${lang}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${st('Title', 'Title', '<w:spacing w:before="0" w:after="240"/><w:jc w:val="center"/>', '<w:b/><w:sz w:val="36"/><w:szCs w:val="36"/>')}
${st('Heading1', 'heading 1', '<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/>', '<w:b/><w:sz w:val="28"/><w:szCs w:val="28"/>')}
${st('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="23"/><w:szCs w:val="23"/>')}
${st('Caption', 'caption', '<w:spacing w:before="40" w:after="200"/><w:jc w:val="center"/>', '<w:sz w:val="18"/><w:szCs w:val="18"/>')}
${st('Footer', 'footer', '<w:spacing w:after="0"/><w:jc w:val="center"/>', '<w:sz w:val="16"/><w:szCs w:val="16"/>')}
</w:styles>`;
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>${run(B[0].text + ' — SSA v' + SSA_VERSION + ' — ')}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
    const drels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.png"/>`).join('')}</Relationships>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(B[0].text)}</dc:title><dc:creator>${X((model.report && model.report.author) || 'SSA')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`;
    return zipStore([{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rels }, { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }, { name: 'word/footer1.xml', data: footer }, { name: 'word/_rels/document.xml.rels', data: drels }, { name: 'docProps/core.xml', data: core }, ...media]);
  }
  async function exportDocx(btn) {
    if (!result || !result.ok || stale) { status(L('請先完成計算（結果需為最新）再輸出計算書。', 'Run the analysis first (results must be up to date) before exporting the report.', '計算書を出力する前に計算を実行してください（結果が最新である必要があります）。')); return; }
    btn.disabled = true; status(L('正在產生 Word 檔…', 'Creating the Word file…', 'Word ファイルを作成中…'));
    try {
      const bytes = await reportDOCX(buildReport());
      await saveFile(`SSA-report-${stamp()}.docx`, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), btn);
    } catch (e) { status(L('Word 檔產生失敗：', 'Could not create the Word file: ', 'Word ファイルを作成できませんでした：') + (e.message || e)); }
    btn.disabled = false;
  }
  function buildVerifyReport() {
    const B = [], h1 = t => B.push({ t: 'h1', text: t }), p = (t, o) => B.push(Object.assign({ t: 'p', text: t }, o || {})), tbl = (head, rows, o) => B.push(Object.assign({ t: 'table', head, rows }, o || {}));
    const n = ver.rows.length, np = ver.rows.filter(r => r.pass).length, d = ver.when;
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    B.push({ t: 'title', text: L('SSA 邊坡穩定分析　驗證報告', 'SSA Slope Stability Analysis — Verification Report', 'SSA 斜面安定解析　検証報告書') });
    tbl(null, [
      [L('程式', 'Software', 'プログラム'), `SSA ${L('邊坡穩定分析（網頁版）', 'Slope Stability Analysis (web edition)', '斜面安定解析（Web 版）')} ${verStr()}`],
      [L('網址', 'URL', 'URL'), 'https://cychen59.github.io/ssa-slope-stability/'],
      [L('執行時間', 'Run at', '実行日時'), ds],
      [L('執行環境', 'Environment', '実行環境'), ver.ua],
      [L('結果', 'Result', '結果'), L(`${n} 項檢核中 ${np} 項通過`, `${np} of ${n} checks passed`, `${n} 項目中 ${np} 項目合格`)],
      [L('計算時間', 'Run time', '計算時間'), `${fmt(ver.ms / 1000, 1)} ${L('秒', 's', '秒')}`]
    ], { kv: true, widths: [1, 3] });
    h1(L('1. 說明', '1. Scope', '1. 概要'));
    p(L('本報告由網頁版 SSA 在使用者的瀏覽器中即時重算下列考題產生，所用的計算核心與一般分析完全相同，因此可作為此版本計算正確性的證明。各項以「本工具／參考值 − 1」計算差異，落在容許範圍內即為通過。',
      'This report was produced by re-running the problems below in the user’s browser with the same calculation core used for ordinary analyses, so it documents the correctness of this version. The difference is “this tool / reference − 1”; a check passes when it lies within the tolerance.',
      '本報告書は、Web 版 SSA が利用者のブラウザで下記の問題を再計算して作成したもので、通常の解析と同じ計算核を用いているため、この版の計算の正しさを示すものです。差は「本ツール／参考値 − 1」とし、許容範囲内なら合格とします。'));
    p(L('容許範圍：閉合解與互相等價的計算 ±10⁻⁶（數值積分的拉拔一例 ±0.01%）；指定滑動面與文獻比較 ±2%；計算例 ±0.1%；土壓力與承載力係數表值 ±0.05%，擋土牆計算例依原文有效位數 ±1% 至 ±2.5%；臨界滑動面搜尋為非圓弧並經局部最佳化，通常比圓弧參考解低數個百分比，容許 −6% 至 +2%。',
      'Tolerances: ±10⁻⁶ for closed forms and equivalent calculations (±0.01% for the numerically integrated pullout case); ±2% for specified surfaces against the literature; ±0.1% for the pile example; ±0.05% for tabulated earth pressure and bearing capacity factors and ±1% to ±2.5% for the retaining wall examples, according to the digits given in the sources; −6% to +2% for critical surface searches, which are non-circular and locally optimised and therefore usually a few per cent below circular references.',
      '許容範囲：閉じた解と等価な計算は ±10⁻⁶（数値積分による引抜きの例は ±0.01%）、指定すべり面と文献の比較は ±2%、計算例は ±0.1%、土圧係数と支持力係数の表値は ±0.05%、擁壁の計算例は原典の有効桁数に応じて ±1%〜±2.5%、臨界すべり面探索は非円弧かつ局所最適化のため円弧の参考解より数 % 低いのが普通で、−6%〜+2% とします。'));
    h1(L('2. 結果', '2. Results', '2. 結果'));
    const groups = [...new Set(ver.rows.map(r => r.grp))];
    groups.forEach((g, i) => {
      B.push({ t: 'h2', text: `2.${i + 1} ${g}` });
      tbl([L('考題', 'Problem', '問題'), L('項目', 'Item', '項目'), L('參考值', 'Reference', '参考値'), L('來源', 'Source', '出典'), L('本工具', 'This tool', '本ツール'), L('差異', 'Diff.', '差'), L('容許', 'Tolerance', '許容'), L('判定', 'Result', '判定')],
        ver.rows.filter(r => r.grp === g).map(r => [r.name, r.item, vFmt(r.ref), r.src, vFmt(r.val), vPct(r.d), vTol(r.tol), r.pass ? 'OK' : 'NG']), { widths: [2.2, 1.1, 1, 1.6, 1, 0.9, 1, 0.6], small: true });
    });
    h1(L('3. 參考文獻', '3. References', '3. 参考文献'));
    for (const t of ['Fredlund, D. G. and Krahn, J. (1977): Comparison of slope stability methods of analysis, Canadian Geotechnical Journal, 14(3), 429–439.',
      'Giam, P. S. K. and Donald, I. B. (1989): Example problems for testing soil slope stability programs, Civil Engineering Research Report No. 8/1989, Monash University.',
      'Rocscience (2023): Slide2 Slope Stability Verification Manual; Seequent (2022): GeoStudio Slope Stability Verification Manual.',
      '國土交通省砂防部（2008）：地すべり防止技術指針及び同解説；地すべり対策技術協会：新版 地すべり鋼管杭設計要領。',
      'Berg, R. R., Christopher, B. R. and Samtani, N. C. (2009): Design of Mechanically Stabilized Earth Walls and Reinforced Soil Slopes, FHWA-NHI-10-025.',
      'Das, B. M.: Principles of Foundation Engineering (earth pressure and bearing capacity factor tables).',
      '高雄市政府水利局（2020）：擋土牆設計講習資料，https://wrb.kcg.gov.tw/FileDownLoad/FileUpload/20200507145137995210.pdf',
      'Tawfiq, K.: Retaining walls, Foundation Engineering lecture notes, Example 2, FAMU–FSU College of Engineering.']) p(t, { small: true });
    p(L('各考題的幾何、參數與推導見網頁「原理與公式」第十至十六節。', 'Geometry, parameters and derivations are given in sections 10–16 of the theory page.', '各問題の形状、定数、導出は理論ページの第十〜十六節を参照。'), { small: true });
    return B;
  }
  async function exportVerifyDocx(btn) {
    if (!ver || ver.running || !ver.rows.length) return;
    btn.disabled = true;
    try { const bytes = await reportDOCX(buildVerifyReport()); await saveFile(`SSA-verification-v${SSA_VERSION}-${stamp()}.docx`, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), btn); }
    catch (e) { status(L('Word 檔產生失敗：', 'Could not create the Word file: ', 'Word ファイルを作成できませんでした：') + (e.message || e)); }
    btn.disabled = false;
  }
  function printVerify() {
    if (!ver || ver.running || !ver.rows.length) return;
    printHTML(reportHTML(buildVerifyReport()), `SSA-verification-v${SSA_VERSION}`);
  }


window.ReportView = {
  reportSVG, buildReport, reportHTML, printHTML, printReport,
  reportDOCX, exportDocx, buildVerifyReport, exportVerifyDocx, printVerify
};
