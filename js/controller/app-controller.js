/**
 * MVC - Controller 層：使用者互動事件綁定、畫布指標控制與分析流程協調 (AppController)
 */
  /* ---------- pointer editing ---------- */
  function evtPt(e) {
    const r = $('#cv').getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }
  function snapV(v) {
    const s = +$('#snap').value;
    return s > 0 ? Math.round(v / s) * s : Math.round(v * 100) / 100;
  }
  function nearest(px, py, keys, tol = 11) {
    let best = null;
    for (const key of keys) {
      (getPts(key) || []).forEach((p, i) => {
        const d = Math.hypot(T.X(p[0]) - px, T.Z(p[1]) - py);
        if (d < tol && (!best || d < best.d)) best = { key, i, d };
      });
    }
    return best;
  }
  let ldrag = null;
  function nearestLoadHandle(px, py) {
    let best = null;
    model.loads.forEach((l, i) => {
      const keys = l.type === 'line' ? [['x', 40]] : [['x1', 28], ['x2', 28]];
      for (const [k, off] of keys) {
        const x = l[k], hx = T.X(x), hy = T.Z(interp(model.ground, x)) - off;
        const d = Math.hypot(hx - px, hy - py);
        if (d < 11 && (!best || d < best.d)) best = { i, k, d };
      }
    });
    return best;
  }
  function onDown(e) {
    if (running) return;
    const { px, py } = evtPt(e);
    const svg = $('#cv');
    if (mode === 'drag') {
      const lh = nearestLoadHandle(px, py);
      if (lh) { pushUndo(); ldrag = Object.assign(lh, { moved: false }); svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      let n = nearest(px, py, [active]);
      if (!n) { n = nearest(px, py, lineDefs().map(d => d.key)); if (n) { active = n.key; renderLines(); renderCoords(); } }
      if (n) { pushUndo(); drag = { key: n.key, i: n.i, moved: false }; svg.setPointerCapture(e.pointerId); draw(); }
    } else if (mode === 'add') {
      if (nearest(px, py, [active])) return;
      const x = snapV(T.ix(px)), z = snapV(T.iz(py));
      const P = (getPts(active) || []).slice();
      if (P.some(p => Math.abs(p[0] - x) < 1e-6)) { status(L('此 x 位置已有節點，請改用拖曳。', 'A vertex already exists at this x; drag it instead.', 'この x 位置にはすでに節点があります。ドラッグで移動してください。')); return; }
      pushUndo(); P.push([x, z]); setPts(active, P); changed(false);
      status(L(`已加入節點 (${r3(x)}, ${r3(z)})`, `Added vertex (${r3(x)}, ${r3(z)})`, `節点を追加しました (${r3(x)}, ${r3(z)})`));
    } else if (mode === 'del') {
      const n = nearest(px, py, [active]);
      if (!n) return;
      const P = getPts(active).slice();
      if (P.length <= minPts(active)) { status(L('這條線至少要保留 2 個點。', 'This line must keep at least 2 points.', 'この線には少なくとも 2 点が必要です。')); return; }
      pushUndo(); P.splice(n.i, 1); setPts(active, P); changed(false);
      status(L('已刪除節點', 'Vertex deleted', '節点を削除しました'));
    }
    e.preventDefault();
  }
  function onMove(e) {
    if (!T) return;
    const { px, py } = evtPt(e);
    $('#hud').textContent = `x ${fmt(T.ix(px), 2)}　z ${fmt(T.iz(py), 2)}`;
    if (ldrag) {
      const x = snapV(T.ix(px)); model.loads[ldrag.i][ldrag.k] = x; ldrag.moved = true;
      $('#hud').textContent = L(`載重位置 x = ${fmt(x, 2)}`, `Load position x = ${fmt(x, 2)}`, `荷重位置 x = ${fmt(x, 2)}`); stale = !!result; draw(); return;
    }
    if (drag) {
      const P = getPts(drag.key);
      let x = snapV(T.ix(px)), z = snapV(T.iz(py));
      const lo = drag.i > 0 ? P[drag.i - 1][0] + 0.01 : -Infinity, hi = drag.i < P.length - 1 ? P[drag.i + 1][0] - 0.01 : Infinity;
      x = Math.min(Math.max(x, lo), hi);
      P[drag.i] = [x, z]; drag.moved = true;
      $('#hud').textContent = L(`節點 (${fmt(x, 2)}, ${fmt(z, 2)})`, `Vertex (${fmt(x, 2)}, ${fmt(z, 2)})`, `節点 (${fmt(x, 2)}, ${fmt(z, 2)})`);
      stale = !!result; draw();
      return;
    }
    const n = nearest(px, py, [active]);
    const h = n ? { key: n.key, i: n.i } : null;
    if ((h && (!hover || hover.i !== h.i)) || (!h && hover)) { hover = h; draw(); }
  }
  function onUp() {
    if (ldrag) { const m = ldrag.moved; ldrag = null; if (m) { renderLoads(); renderResults(); draw(); } else { undoStack.pop(); $('#btnUndo').disabled = !undoStack.length; } return; }
    if (!drag) return;
    const moved = drag.moved; drag = null;
    if (moved) changed(false); else { undoStack.pop(); $('#btnUndo').disabled = !undoStack.length; draw(); }
  }

  function runSearch(m, tag, done) {
    let gen;
    try { gen = SSA.solve(clone(m)); } catch (e) { done({ ok: false, msg: String(e.message || e) }); return; }
    const step = () => {
      try {
        const n = gen.next();
        if (n.done) { done(n.value); return; }
        if (n.value.opt) status(L(`${tag}局部最佳化滑動面：F = ${fmt(n.value.F, 4)}`, `${tag}optimising the slip surface: F = ${fmt(n.value.F, 4)}`, `${tag}すべり面を局所最適化中：F = ${fmt(n.value.F, 4)}`));
        else status(L(`${tag}第 ${n.value.it} 輪：F = ${fmt(n.value.F, 4)}`, `${tag}round ${n.value.it}: F = ${fmt(n.value.F, 4)}`, `${tag}第 ${n.value.it} 回：F = ${fmt(n.value.F, 4)}`));
        setTimeout(step, 0);
      } catch (e) { done({ ok: false, msg: L('計算失敗：', 'Calculation failed: ', '計算に失敗しました：') + (e.message || e) }); }
    };
    setTimeout(step, 20);
  }
  function run() {
    if (running) return;
    errors = SSA.validate(currentModel());
    if (errors.length) { result = null; renderResults(); draw(); status(L('輸入有誤，請依提示修正', 'Input errors; please correct them as indicated', '入力に誤りがあります。表示に従って修正してください')); return; }
    setBusy(true, L('計算中…', 'Computing…', '計算中…'));
    const t0 = performance.now(), cmp = model.settings.compare && hasReinf(), cmpL = model.settings.compareLoad && hasLoads();
    const jobs = [];
    if (cmp) jobs.push(['base', currentModel(true, false), L('無補強措施：', 'Without reinforcement, ', '補強なし：')]);
    if (cmpL) jobs.push(['baseLoad', currentModel(false, true), L('無載重：', 'Without loads, ', '荷重なし：')]);
    const got = {};
    const next = () => {
      const j = jobs.shift();
      if (!j) { runSearch(currentModel(), jobs.length || cmp || cmpL ? L('目前條件：', 'Current model, ', '現在の条件：') : '', r => { Object.assign(r, got); finish(r, t0); }); return; }
      runSearch(j[1], j[2], r => { got[j[0]] = r; next(); });
    };
    next();
  }
  function runTrial() {
    if (running) return;
    errors = SSA.validate(currentModel());
    if (errors.length) { result = null; renderResults(); draw(); status(L('輸入有誤，請依提示修正', 'Input errors; please correct them as indicated', '入力に誤りがあります。表示に従って修正してください')); return; }
    if (model.trial.length < 2) {
      status(L('請先在「剖面」頁選「指定滑動面（試算用）」，畫出或貼上滑動面座標。', 'First select “Specified slip surface” on the Profile tab and draw or paste its coordinates.', 'まず「断面」タブで「指定すべり面（試算用）」を選び、すべり面の座標を描くか貼り付けてください。'));
      $('#tab-geo').click(); active = 'trial'; renderLines(); renderCoords(); draw(); return;
    }
    const t0 = performance.now();
    let r;
    try {
      r = SSA.evaluate(clone(currentModel()), model.trial);
      if (r.ok && model.settings.compare && hasReinf()) r.base = SSA.evaluate(clone(currentModel(true, false)), model.trial);
      if (r.ok && model.settings.compareLoad && hasLoads()) r.baseLoad = SSA.evaluate(clone(currentModel(false, true)), model.trial);
    } catch (e) { r = { ok: false, msg: L('計算失敗：', 'Calculation failed: ', '計算に失敗しました：') + (e.message || e) }; }
    finish(r, t0);
  }
  /* ---------- back analysis ---------- */
  function runPileDesign() {
    const piles = model.reinf.filter(r => r.type === 'pile' && r.on);
    if (!piles.length) { status(L('請先在上方加入抑止樁。', 'Add a stabilizing pile above first.', '先に上で抑止杭を追加してください。')); return; }
    if (!result || !result.ok || stale) { status(L('請先按「計算最危險滑動面」；幾何或參數變更後也要重新計算。', 'Press “Find critical slip surface” first, and again after any change.', '先に「臨界すべり面を計算」を押してください。変更後も再計算が必要です。')); return; }
    const PFs = parseFloat($('#pdPFs').value);
    if (!(PFs >= 1)) { status(L('計畫安全率需大於等於 1。', 'The planned safety factor must be at least 1.', '計画安全率は 1 以上にしてください。')); return; }
    model.pileDesign = { PFs }; save();
    const useBase = !!(result.base && result.base.ok), slip = useBase ? result.base.slip : result.slip, r0 = result;
    const btn = $('#btnPileDesign'); btn.disabled = true;
    $('#pdOut').innerHTML = `<p class="hint">${L('計算中…', 'Computing…', '計算中…')}</p>`;
    setTimeout(() => {
      try { const t0 = Date.now(); const o = SSA.pileDesign(currentModel(), slip, { PFs }); o.ms = Date.now() - t0; o.useBase = useBase; pd = { res: o, result: r0 }; }
      catch (e) { pd = { res: { ok: false, msg: String(e && e.message || e) }, result: r0 }; }
      btn.disabled = false; renderPileDesign();
    }, 30);
  }
  function runBack() {
    if (running) return;
    errors = SSA.validate(currentModel());
    if (errors.length) { result = null; renderResults(); draw(); status(L('輸入有誤，請依提示修正', 'Input errors; please correct them as indicated', '入力に誤りがあります。表示に従って修正してください')); return; }
    if (model.trial.length < 2) {
      status(L('請先在「剖面」頁選「指定滑動面（試算用）」，畫出或貼上實際崩塌面的座標。', 'First select “Specified slip surface” on the Profile tab and draw or paste the coordinates of the observed failure surface.', 'まず「断面」タブで「指定すべり面（試算用）」を選び、実際の崩壊面の座標を描くか貼り付けてください。'));
      $('#tab-geo').click(); active = 'trial'; renderLines(); renderCoords(); draw(); return;
    }
    $('#bkOut').innerHTML = `<p class="hint">${L('反算中…', 'Back-calculating…', '逆算中…')}</p>`;
    $('#btnBack').disabled = true;
    setTimeout(() => {
      const t0 = performance.now();
      try { bkRes = SSA.backCalc(clone(currentModel()), model.trial, { layer: bk.layer, param: bk.param, target: bk.target, curve: bk.curve }); }
      catch (e) { bkRes = { ok: false, msg: String(e.message || e) }; }
      bkRes.ms = performance.now() - t0;
      $('#btnBack').disabled = false;
      renderBack();
      if (bkRes.ok) status(L('反算完成', 'Back analysis done', '逆算が完了しました'));
    }, 30);
  }
  function finish(r, t0) {
    setBusy(false);
    r.ms = performance.now() - t0;
    result = r; stale = false;
    status(!r.ok ? (r.mode === 'trial' ? L('指定滑動面無法計算', 'The specified surface cannot be evaluated', '指定すべり面は計算できません') : L('未找到滑動面', 'No slip surface found', 'すべり面が見つかりません')) : r.mode === 'trial' ? L(`指定滑動面試算完成：Fs = ${fmt(FS(r), 3)}`, `Specified surface evaluated: Fs = ${fmt(FS(r), 3)}`, `指定すべり面の試算完了：Fs = ${fmt(FS(r), 3)}`) : L(`完成：${r.hist.length} 輪、${fmt(r.ms / 1000, 2)} 秒`, `Done: ${r.hist.length} rounds, ${fmt(r.ms / 1000, 2)} s`, `完了：${r.hist.length} 回、${fmt(r.ms / 1000, 2)} 秒`));
    draw(); renderResults(); renderReinf(); renderLines(); renderPileDesign();
  }

  /* ---------- wiring ---------- */
  function bind() {
    $$('.tabs button').forEach(b => b.addEventListener('click', () => {
      $$('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
      $$('.pane').forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
      if (b.dataset.tab === 'wall') renderWallChecks(); else draw();
    }));
    $('#lineList').addEventListener('click', e => {
      const b = e.target.closest('.lrow'); if (!b) return;
      active = b.dataset.key; renderLines(); renderCoords(); draw();
    });
    $('#btnApply').addEventListener('click', () => {
      const P = parseCoords($('#coords').value);
      if (P.length < minPts(active)) { status(L('至少需要 2 個點。', 'At least 2 points are needed.', '少なくとも 2 点が必要です。')); return; }
      pushUndo(); setPts(active, P); fit(); changed(false); status(L('已套用座標', 'Coordinates applied', '座標を適用しました'));
    });
    $('#btnClearLine').addEventListener('click', () => { pushUndo(); if (active === 'trial') model.trial = []; else model.water = []; changed(false); status(active === 'trial' ? L('已清除指定滑動面', 'Specified slip surface cleared', '指定すべり面を消去しました') : L('已清除地下水位線', 'Water table cleared', '地下水位線を消去しました')); });
    $('#btnAddPiezo').addEventListener('click', () => {
      pushUndo(); model.piezo = model.piezo || [];
      const k = model.piezo.length, g = model.ground;
      const pts = model.water.length >= 2 ? clone(model.water) : g.map(p => [p[0], Math.max(model.zBase, p[1] - 3)]);
      model.piezo.push({ name: L(`水壓線 ${k + 1}`, `Piezometric line ${k + 1}`, `水頭線 ${k + 1}`), pts });
      active = 'P' + k; changed(true);
      status(L('已新增水壓線，請在圖上調整，並到「土層」頁指定使用這條線的土層。', 'Piezometric line added. Adjust it on the drawing, then assign it to layers on the Soils tab.', '水頭線を追加しました。図で調整し、「土質」タブで使用する地層を指定してください。'));
    });
    $('#piezoName').addEventListener('change', e => { const k = +active.slice(1), q = model.piezo[k]; if (!q) return; const v = e.target.value.trim(); if (!v) { e.target.value = q.name; return; } pushUndo(); q.name = v; changed(true); });
    $('#btnDelPiezo').addEventListener('click', () => {
      const k = +active.slice(1); if (!model.piezo[k]) return;
      pushUndo(); model.piezo.splice(k, 1);
      // layers on the deleted line go back to the water table; later lines shift down by one
      model.layers.forEach(Ly => { const p = Ly.pore; if (p && p.type === 'piezo') { if (p.line === k) Ly.pore = { type: 'wt' }; else if (p.line > k) p.line--; } });
      active = 'ground'; changed(true);
    });
    $('#btnMakeWater').addEventListener('click', () => { pushUndo(); model.water = model.ground.map(p => [p[0], Math.max(model.zBase, p[1] - 2)]); changed(false); });
    $('#zBase').addEventListener('change', e => { const v = +e.target.value; if (!isFinite(v)) return; pushUndo(); model.zBase = v; fit(); changed(false); });

    $('#layerList').addEventListener('input', e => {
      const card = e.target.closest('.layer'), f = e.target.dataset.f; if (!card || !f) return;
      const L = model.layers[+card.dataset.i];
      if (f === 'name') L.name = e.target.value;
      else if (f === 'poreType') { const v = e.target.value; L.pore = v[0] === 'p' ? { type: 'piezo', line: +v.slice(1) } : v === 'ru' ? { type: 'ru', ru: 0.2 } : { type: v }; renderLayers(); renderLines(); }
      else if (f === 'ru') { const v = parseFloat(e.target.value); if (isFinite(v)) L.pore = { type: 'ru', ru: v }; }
      else if (f === 'color') L.color = e.target.value;
      else if (f === 'bedrock') { L.bedrock = e.target.checked; renderLayers(); }
      else { const v = parseFloat(e.target.value); if (isFinite(v)) L[f] = f === 'c' ? fromC(v) : (f === 'gamma' || f === 'gammaSat') ? fromG(v) : v; }
      stale = !!result; save(); draw(); renderResults(); if (f === 'bedrock') renderGuide();
      if (f === 'name' || f === 'color') renderLines();
    });
    $('#layerList').addEventListener('focusin', e => { if (e.target.dataset.f) { const s = JSON.stringify(model); if (undoStack[undoStack.length - 1] !== s) pushUndo(); } });
    $('#layerList').addEventListener('click', e => {
      const d = e.target.closest('[data-del]'); if (!d) return;
      const i = +d.dataset.del; if (model.layers.length < 2) return;
      pushUndo();
      model.layers.splice(i, 1);
      if (i === 0) model.layers[0].top = null;
      active = 'ground'; changed(true);
    });
    $('#btnAddLayer').addEventListener('click', () => {
      pushUndo();
      const n = model.layers.length, last = n > 1 ? model.layers[n - 1].top : model.ground;
      const pal = ['#D8BE8A', '#B48462', '#8C949A', '#A9B38B', '#C7A1A1', '#9FB4C7'];
      const top = last.map(p => [p[0], Math.max(model.zBase + 0.5, p[1] - 3)]);
      model.layers.push({ name: L(`土層 ${n + 1}`, `Layer ${n + 1}`, `地層 ${n + 1}`), color: pal[n % pal.length], gamma: 20, gammaSat: 21, c: 10, phi: 30, bedrock: false, top });
      active = 'L' + n; changed(true);
      status(L('已新增土層，頂面預設為上一層頂面往下 3 m，可在「剖面」頁調整。', 'Layer added. Its top is 3 m below the previous top by default; adjust it on the Profile tab.', '地層を追加しました。上面は既定で一つ上の上面から 3 m 下です。「断面」タブで調整してください。'));
    });
    $$('[data-s]').forEach(el => el.addEventListener('change', () => {
      const k = el.dataset.s;
      let v = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : (isFinite(parseFloat(el.value)) ? parseFloat(el.value) : model.settings[k]);
      if (k === 'gw' && typeof v === 'number') v = fromG(v);
      model.settings[k] = v;
      if (k.startsWith('tc')) { syncTc(); if (k === 'tcOn') renderScenList(); }
      renderWallChecks();
      if (k === 'unitG' || k === 'unitC') {
        renderLayers(); renderReinf(); renderWalls(); renderLoads(); renderSettings(); renderResults();
        status(L(`單位已切換為 ${uG()}、${uC()}，數值已自動換算`, `Units switched to ${uG()} and ${uC()}; values were converted`, `単位を ${uG()}、${uC()} に切り替え、数値を換算しました`));
        return;
      }
      if (k === 'Freq' || k === 'useF0') { save(); renderResults(); return; }
      stale = !!result; save(); renderResults(); draw(); renderGuide();
    }));
    $$('[data-mode]').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.mode; $$('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw();
    }));
    ['#optEqual', '#optSlices', '#optGrid'].forEach(s => $(s).addEventListener('change', draw));
    $('#btnFit').addEventListener('click', () => { fit(); draw(); });
    $('#btnRun').addEventListener('click', run);
    $('#btnTrial').addEventListener('click', runTrial);
    $('#btnBack').addEventListener('click', runBack);
    $('#btnPileDesign').addEventListener('click', runPileDesign);
    $('#btnVerify').addEventListener('click', runVerify);
    $('#btnVerDocx').addEventListener('click', e => exportVerifyDocx(e.currentTarget));
    $('#btnVerPrint').addEventListener('click', printVerify);
    $('#pdPFs').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v >= 1) { model.pileDesign = { PFs: v }; save(); } });
    $('#bkLayer').addEventListener('change', e => { bk.layer = e.target.value; });
    $('#bkParam').addEventListener('change', e => { bk.param = e.target.value; });
    $('#bkTarget').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) bk.target = v; e.target.value = bk.target; });
    $('#bkCurve').addEventListener('change', e => { bk.curve = e.target.checked; });
    $('#bkOut').addEventListener('click', e => {
      const b = e.target.closest('[data-apply]'); if (!b || !bkRes || !bkRes.ok) return;
      const Ly = model.layers[bkRes.li]; if (!Ly) return;
      pushUndo();
      if (b.dataset.apply === 'main') Ly[bkRes.param] = +bkRes.value.toFixed(bkRes.param === 'c' ? 3 : 3);
      else { Ly.c = +(+b.dataset.c).toFixed(3); Ly.phi = +(+b.dataset.phi).toFixed(3); }
      changed(true);
      bkRes.stale = false; renderBack();
      status(L(`已將反算值套用到「${Ly.name}」，並以指定滑動面試算`, `Back-calculated values applied to “${Ly.name}”; the specified surface is evaluated`, `逆算値を「${Ly.name}」に適用し、指定すべり面を試算しました`));
      runTrial();
    });
    $('#btnCircle').addEventListener('click', () => {
      const xc = parseFloat($('#ciXc').value), zc = parseFloat($('#ciZc').value), R = parseFloat($('#ciR').value), g = model.ground;
      if (![xc, zc, R].every(isFinite) || !(R > 0)) { status(L('請輸入圓心 x、z 與大於 0 的半徑。', 'Enter the centre x, z and a radius greater than 0.', '中心 x、z と 0 より大きい半径を入力してください。')); return; }
      const P = genArc(xc, zc, R, g);
      if (P.length < 2 || !P.some(p => p[1] < interp(g, p[0]) - 1e-6)) { status(L('這個圓弧沒有低於地表的部分，請檢查圓心與半徑。', 'This circle does not go below the ground; check the centre and radius.', 'この円弧は地表より下を通りません。中心と半径を確認してください。')); return; }
      pushUndo(); model.trial = P; model.trialCircle = { xc, zc, R }; active = 'trial'; changed(false);
      runTrial();
    });
    $('#btnCopyCrit').addEventListener('click', () => {
      if (!result || !result.ok) return;
      pushUndo(); model.trial = result.slip.map(p => [r3(p[0]), r3(p[1])]); changed(false);
      status(L('已把目前的臨界滑動面複製為指定滑動面，可再拖曳修改後按「試算指定滑動面」。', 'The current critical surface was copied as the specified surface. Drag to modify it, then press “Check specified surface”.', '現在の臨界すべり面を指定すべり面にコピーしました。ドラッグで修正してから「指定すべり面を試算」を押してください。'));
    });
    // reinforcement editing
    const rl = $('#reinfList');
    rl.addEventListener('focusin', e => { if (e.target.dataset.f) { const s = JSON.stringify(model); if (undoStack[undoStack.length - 1] !== s) pushUndo(); } });
    rl.addEventListener('input', e => {
      const card = e.target.closest('.rcard'), f = e.target.dataset.f; if (!card || !f || f === 'type' || f === 'on') return;
      const r = model.reinf[+card.dataset.r], v = parseFloat(e.target.value);
      if (!isFinite(v)) return;
      r[f] = e.target.dataset.conv === 'c' ? fromC(v) : e.target.dataset.conv ? fromG(v) : v;
      stale = !!result; draw(); renderResults();
    });
    rl.addEventListener('change', e => {
      const card = e.target.closest('.rcard'), f = e.target.dataset.f; if (!card) return;
      const r = model.reinf[+card.dataset.r];
      if (f === 'type') { const d = TPL[e.target.value] || NAIL; for (const k of Object.keys(r)) if (!['x', 'z', 'on'].includes(k)) delete r[k]; Object.assign(r, clone(d), { x: r.x, z: r.z, on: r.on }); if (r.type === 'geo') r.x = faceAt(r.z); }
      else if (f === 'on') r.on = e.target.checked;
      else if (f === 'face') r.face = e.target.checked;
      else if (f === 'kind') { r.kind = e.target.value; Object.assign(r, r.kind === 'tex' ? { Ci: 0.67, aS: 0.6 } : { Ci: 0.8, aS: 0.8 }); }
      else if (STR_F[f]) r[f] = e.target.value;
      else return;
      stale = !!result; renderReinf(); draw(); renderResults();
    });
    rl.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const i = +b.closest('.rcard').dataset.r, r = model.reinf[i];
      pushUndo();
      if (b.dataset.act === 'del') model.reinf.splice(i, 1);
      else if (b.dataset.act === 'dup') {
        const o = clone(r);
        if (r.type === 'geo') { o.z = r3(r.z + 0.6); o.x = faceAt(o.z); }
        else { o.x = r3(r.x + 2 * intoDir() * -1); o.z = r3(interp(model.ground, o.x)); }
        model.reinf.splice(i + 1, 0, o);
      }
      else if (b.dataset.act === 'snap') { if (r.type === 'geo') r.x = faceAt(r.z); else r.z = r3(interp(model.ground, r.x)); }
      stale = !!result; renderReinf(); draw(); renderResults();
    });
    const ll = $('#loadList');
    ll.addEventListener('focusin', e => { if (e.target.dataset.lf) { const s = JSON.stringify(model); if (undoStack[undoStack.length - 1] !== s) pushUndo(); } });
    ll.addEventListener('input', e => {
      const card = e.target.closest('.rcard'), f = e.target.dataset.lf; if (!card || !f || ['type', 'on', 'seis'].includes(f)) return;
      const l = model.loads[+card.dataset.l];
      if (f === 'name') l.name = e.target.value;
      else if (f === 'q2' && e.target.value.trim() === '') l.q2 = null;
      else { const v = parseFloat(e.target.value); if (!isFinite(v)) return; const k = e.target.dataset.lk; l[f] = k === 'C' ? fromC(v) : k === 'G' ? fromG(v) : v; }
      stale = !!result; draw(); renderResults();
    });
    ll.addEventListener('change', e => {
      const card = e.target.closest('.rcard'), f = e.target.dataset.lf; if (!card || !['type', 'on', 'seis'].includes(f)) return;
      const l = model.loads[+card.dataset.l];
      if (f === 'type') l.type = e.target.value; else l[f] = e.target.checked;
      stale = !!result; renderLoads(); draw(); renderResults();
    });
    ll.addEventListener('click', e => {
      const bt = e.target.closest('[data-lact]'); if (!bt) return;
      pushUndo(); model.loads.splice(+bt.closest('.rcard').dataset.l, 1);
      stale = !!result; renderLoads(); draw(); renderResults();
    });
    $('#btnAddLoad').addEventListener('click', () => {
      pushUndo(); addLoad($('#loadTpl').value); stale = !!result; renderLoads(); draw(); renderResults();
      status(L('已在坡肩附近加入載重，強度 10 為佔位數字，請依設計規範輸入。可在圖上拖曳載重端點調整範圍。', 'A load was added near the crest. Its magnitude of 10 is a placeholder; enter values per the design code. Drag the load ends on the drawing to adjust its range.', 'のり肩付近に荷重を追加しました。強度 10 は仮の値です。設計基準に従って入力してください。図上で荷重の端点をドラッグして範囲を調整できます。'));
    });
    const wl = $('#wallList');
    wl.addEventListener('focusin', e => { if (e.target.dataset.wf || e.target.dataset.p) { const s = JSON.stringify(model); if (undoStack[undoStack.length - 1] !== s) pushUndo(); } });
    wl.addEventListener('input', e => {
      const card = e.target.closest('.rcard'); if (!card) return;
      const w = model.walls[+card.dataset.w], f = e.target.dataset.wf, pf = e.target.dataset.p, xk = e.target.dataset.x;
      if (f === 'name') { w.name = e.target.value; renderWallChecks(); return; }
      else if (f === 'gamma') { const v = parseFloat(e.target.value); if (v > 0) w.gamma = fromG(v); else return; }
      else if (pf) {
        const v = parseFloat(e.target.value); if (!isFinite(v)) return;
        if (!w.par) {
          w.par = Object.assign({ x0: w.poly.length ? Math.min(...w.poly.map(q => q[0])) : 0, z0: w.poly.length ? Math.min(...w.poly.map(q => q[1])) : 0 }, WALL_PAR[w.type || 'gravity']);
          card.querySelectorAll('[data-p]').forEach(el => { if (el !== e.target && w.par[el.dataset.p] !== undefined) el.value = dispN(w.par[el.dataset.p]); });
          const wn = card.querySelector('p.warnline'); if (wn) wn.remove();
        }
        w.par[pf] = v;
        const P = wallPolyOf(w);
        if (P) { w.poly = P; const ta = card.querySelector('textarea'); if (ta) ta.value = P.map(q => `${r3(q[0])}\t${r3(q[1])}`).join('\n'); }
      } else if (xk) {
        const raw = e.target.value.trim(), v = parseFloat(raw), k = e.target.dataset.xk;
        w.ext = w.ext || Object.assign({}, WALL_EXT);
        w.ext[xk] = raw === '' || !isFinite(v) ? '' : k === 'C' ? fromC(v) : k === 'G' ? fromG(v) : v;
        save(); renderWallChecks(); return;
      } else return;
      stale = !!result; save(); draw(); renderResults(); renderWallChecks();
    });
    wl.addEventListener('change', e => {
      const card = e.target.closest('.rcard'); if (!card) return;
      const w = model.walls[+card.dataset.w], f = e.target.dataset.wf, xs = e.target.dataset.xs;
      if (f === 'on') { w.on = e.target.checked; stale = !!result; }
      else if (f === 'type') {
        pushUndo(); const t = e.target.value, p = w.par || {};
        w.type = t; w.par = Object.assign({}, WALL_PAR[t], { x0: p.x0, z0: p.z0, H: p.H || WALL_PAR[t].H, B: Math.max(p.B || 0, WALL_PAR[t].B * (p.H || WALL_PAR[t].H) / WALL_PAR[t].H) });
        const P = wallPolyOf(w); if (P) w.poly = P; stale = !!result;
      } else if (xs) { w.ext = w.ext || Object.assign({}, WALL_EXT); w.ext[xs] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; }
      else return;
      save(); renderWalls(); draw(); renderResults();
    });
    wl.addEventListener('click', e => {
      const bt = e.target.closest('[data-wact]'); if (!bt) return;
      const card = bt.closest('.rcard'), i = +card.dataset.w;
      if (bt.dataset.wact === 'del') { pushUndo(); model.walls.splice(i, 1); }
      else if (bt.dataset.wact === 'apply') {
        const P = parseCoords(card.querySelector('textarea').value);
        if (P.length < 3) { status(L('擋土牆至少需要 3 個頂點。', 'A retaining wall needs at least 3 vertices.', '擁壁には 3 点以上の頂点が必要です。')); return; }
        pushUndo(); model.walls[i].poly = P; model.walls[i].par = null;
        status(L('已套用擋土牆頂點座標，此牆只計入整體穩定。', 'Wall vertices applied; this wall counts in global stability only.', '擁壁の頂点座標を適用しました。この擁壁は全体安定のみに考慮されます。'));
      }
      stale = !!result; save(); fit(); renderWalls(); draw(); renderResults();
    });
    const addWall = t => {
      pushUndo();
      const d = intoDir(), toe = toeX(), par0 = WALL_PAR[t];
      const x0 = r3(toe - d * par0.B), z0 = r3(interp(model.ground, x0) - 1);
      const w = { name: `${wallTypeName(t)}${L('擋土牆', '', '擁壁')} ${model.walls.length + 1}`.replace(/  +/g, ' ').trim(), on: true, gamma: t === 'gravity' ? 23.5 : 24.5, type: t, par: Object.assign({ x0, z0 }, par0), ext: Object.assign({}, WALL_EXT) };
      w.poly = wallPolyOf(w);
      model.walls.push(w);
      stale = !!result; save(); fit(); renderWalls(); draw(); renderResults();
      status(L(`已在坡趾前加入一座${wallTypeName(t)}擋土牆（埋入 1 m）。若牆後有回填，請同步修改地表線，讓地表通過牆頂。`, `A ${wallTypeName(t).toLowerCase()} wall (embedded 1 m) was added in front of the toe. If there is backfill behind it, edit the ground line so that it passes over the wall top.`, `のり尻の前に${wallTypeName(t)}擁壁（根入れ 1 m）を追加しました。背面に裏込めがある場合は、地表線が擁壁天端を通るように修正してください。`));
    };
    $('#btnAddWall').addEventListener('click', () => addWall('gravity'));
    $('#btnAddWallC').addEventListener('click', () => addWall('cantilever'));
    $('#btnAddWallF').addEventListener('click', () => addWall('counterfort'));
    $('#btnWallEx').addEventListener('click', loadWallExample);
    $('#wallCode').addEventListener('change', e => { model.wallCode = e.target.value; save(); renderWallCode(); renderWallChecks(); });
    $('#btnAddNail').addEventListener('click', () => { pushUndo(); addMember(NAIL, midFaceX()); stale = !!result; renderReinf(); draw(); renderResults(); status(L('已加入一支土釘，請調整位置與參數。', 'Soil nail added; adjust its position and parameters.', '鉄筋挿入工を 1 本追加しました。位置とパラメータを調整してください。')); });
    $('#btnAddPile').addEventListener('click', () => { pushUndo(); addMember(PILE, faceX(0.55)); stale = !!result; renderReinf(); draw(); renderResults(); status(L('已加入一排抑止樁，請調整位置、樁長與斷面。', 'Stabilizing pile row added; adjust its position, length and section.', '抑止杭を 1 列追加しました。位置、杭長、断面を調整してください。')); });
    $('#btnAddMpile').addEventListener('click', () => { pushUndo(); addMember(MPILE, midFaceX()); stale = !!result; renderReinf(); draw(); renderResults(); status(L('已加入一排微型樁，請調整位置與參數。', 'Micropile row added; adjust its position and parameters.', 'マイクロパイルを 1 列追加しました。位置とパラメータを調整してください。')); });
    $('#btnAddGeo').addEventListener('click', () => { pushUndo(); const x = faceX(0.2); addMember(GEO, x); stale = !!result; renderReinf(); draw(); renderResults(); status(L('已加入一層地工合成材，可用「複製」往上加層，或用「整排配置」一次配置多層。', 'Geosynthetic layer added. Use “Duplicate” to add the next layer up, or “Place a row” for several layers.', 'ジオシンセティックスを 1 層追加しました。「複製」で上の層を追加するか、「列で配置」でまとめて配置できます。')); });
    $('#btnAddAnchor').addEventListener('click', () => { pushUndo(); addMember(ANCHOR, midFaceX()); stale = !!result; renderReinf(); draw(); renderResults(); status(L('已加入一支地錨，請調整位置與參數。', 'Anchor added; adjust its position and parameters.', 'アンカーを 1 本追加しました。位置とパラメータを調整してください。')); });
    const batch = replace => {
      const xa = parseFloat($('#rbXa').value), xb = parseFloat($('#rbXb').value), n = Math.round(+$('#rbN').value);
      if (!isFinite(xa) || !isFinite(xb) || !(n >= 1)) { status(L('請輸入整排配置的起點 x、終點 x 與支數。', 'Enter the start x, end x and count for the row.', '列配置の始点 x、終点 x と本数を入力してください。')); return; }
      const tpl = model.reinf.length ? model.reinf[model.reinf.length - 1] : NAIL;
      pushUndo();
      if (replace) model.reinf = [];
      for (let i = 0; i < n; i++) addMember(tpl, r3(n === 1 ? xa : xa + (xb - xa) * i / (n - 1)));
      stale = !!result; renderReinf(); draw(); renderResults();
      status(L(`已配置 ${n} 支${typeName(tpl.type)}，參數沿用範本。`, `Placed ${n} × ${typeName(tpl.type)} using the template parameters.`, `${typeName(tpl.type)}を ${n} 本配置しました。パラメータはテンプレートを使用しています。`));
    };
    $('#btnBatchAdd').addEventListener('click', () => batch(false));
    $('#btnBatchReplace').addEventListener('click', () => batch(true));
    $('#btnCite').addEventListener('click', e => copyText($('#citeText').textContent.trim(), e.currentTarget));
    $('#btnCiteEn').addEventListener('click', e => copyText($('#citeTextEn').textContent.trim(), e.currentTarget));
    $('#btnBib').addEventListener('click', e => copyText(`@article{chen2014bedrock,
  author  = {Chen, Chen-Yu and Fujita, Masaharu and Tsutsumi, Daizo},
  title   = {The Influence of Bedrock Location and Soil Characteristics on Rainfall-Runoff and Large-Scale Landslides},
  journal = {Journal of Chinese Soil and Water Conservation},
  volume  = {45},
  number  = {4},
  pages   = {243--256},
  year    = {2014},
  note    = {in Chinese},
  url     = {https://www.cswcs.org.tw/AllDataPos/JournalPos/VOL45/NO4/jcswc45(4)243-256_04.pdf}
}`, e.currentTarget));
    $('#gridChip').addEventListener('click', () => { $('#tab-set').click(); $('#searchGuide').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    $('#btnUndo').addEventListener('click', doUndo);
    $('#btnSample').addEventListener('click', () => { pushUndo(); model = clone(SAMPLE); renameDefaults(); active = 'ground'; fit(); changed(true); run(); });
    document.querySelectorAll('.theme-seg button[data-theme]').forEach(b => b.addEventListener('click', () => { if (b.dataset.theme !== THEME) setTheme(b.dataset.theme); }));
    document.querySelectorAll('.lang-seg button[data-lang]').forEach(b => b.addEventListener('click', () => { if (b.dataset.lang !== LANG) setLang(b.dataset.lang); }));
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); doUndo(); }
    });
    const svg = $('#cv');
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('pointerleave', () => { $('#hud').textContent = 'x —　z —'; if (hover && !drag) { hover = null; draw(); } });

    $('#csvSampleFull').textContent = csvFull();
    $('#csvSampleGround').textContent = CSV_GROUND;
    $('#btnDlFull').addEventListener('click', e => saveFile(L('SSA-剖面範例.csv', 'SSA-profile-example.csv', 'SSA-断面例.csv'), '\uFEFF' + csvFull(), e.currentTarget));
    $('#btnDlGround').addEventListener('click', e => saveFile(L('SSA-地表線範例.csv', 'SSA-ground-example.csv', 'SSA-地表線例.csv'), '\uFEFF' + CSV_GROUND, e.currentTarget));
    $('#btnCpFull').addEventListener('click', e => copyText(csvFull(), e.currentTarget));
    $('#btnCpGround').addEventListener('click', e => copyText(CSV_GROUND, e.currentTarget));
    $('#csvIn').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { try { importCSV(decodeText(rd.result)); } catch (err) { status(L('CSV 匯入失敗：' + err.message + '。請對照範例檔的格式。', 'CSV import failed: ' + err.message + '. Compare with the example file format.')); } };
      rd.readAsArrayBuffer(f); e.target.value = '';
    });
    $('#btnSaveJson').addEventListener('click', e => saveFile(`SSA-model-${stamp()}.json`, JSON.stringify(Object.assign({ ssaVersion: SSA_VERSION }, model), null, 1), e.currentTarget));
    $('#btnGoSave').addEventListener('click', () => { $('#tab-set').click(); $('#saveSec').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    $('#btnExport').addEventListener('click', () => { $('#jsonBox').value = JSON.stringify(Object.assign({ ssaVersion: SSA_VERSION }, model), null, 1); });
    $('#btnCopyJson').addEventListener('click', e => { if (!$('#jsonBox').value) $('#jsonBox').value = JSON.stringify(Object.assign({ ssaVersion: SSA_VERSION }, model), null, 1); copyText($('#jsonBox').value, e.currentTarget); });
    $('#btnImport').addEventListener('click', () => importText($('#jsonBox').value));
    $('#fileIn').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { $('#jsonBox').value = rd.result; importText(rd.result); renderSettings(); };
      rd.readAsText(f); e.target.value = '';
    });
    let rt = 0;
    new ResizeObserver(() => { cancelAnimationFrame(rt); rt = requestAnimationFrame(draw); }).observe($('.canvas-wrap'));
  }
  function bindCtrl() {
    $('#ctrlOn').addEventListener('change', e => { pushUndo(); model.ctrl.on = e.target.checked; changed(false); renderCtrl(); });
    $('#btnCtrlAdd').addEventListener('click', () => {
      pushUndo();
      const g = model.ground, xm = g.length >= 2 ? (g[0][0] + g[g.length - 1][0]) / 2 : 0;
      model.ctrl.pts.push({ name: `BH-${model.ctrl.pts.length + 1}`, on: true, x: r3(xm), depth: null, tol: 0.5 });
      model.ctrl.on = true; changed(false); renderCtrl();
    });
    $('#btnCtrlTrial').addEventListener('click', ctrlToTrial);
    $('#ctrlList').addEventListener('click', e => {
      const b = e.target.closest('[data-cact="del"]'); if (!b) return;
      pushUndo(); model.ctrl.pts.splice(+b.closest('[data-cp]').dataset.cp, 1); changed(false); renderCtrl();
    });
    $('#ctrlList').addEventListener('change', e => {
      const el = e.target, cp = el.closest('[data-cp]'), cr = el.closest('[data-cr]');
      pushUndo();
      if (cp) {
        const p = model.ctrl.pts[+cp.dataset.cp], f = el.dataset.cf;
        if (f === 'on') p.on = el.checked; else if (f === 'name') p.name = el.value.trim() || p.name; else { const v = parseFloat(el.value); p[f] = isFinite(v) ? v : null; }
      } else if (cr) {
        const r = model.ctrl[cr.dataset.cr], f = el.dataset.crf;
        if (f === 'on') r.on = el.checked; else { const v = parseFloat(el.value); r[f] = isFinite(v) ? v : null; }
      }
      changed(false); renderCtrl();
    });
  }
  function runScenarios() {
    if (running) return;
    errors = SSA.validate(currentModel());
    if (errors.length) { result = null; renderResults(); draw(); status(L('輸入有誤，請依提示修正', 'Input errors; please correct them as indicated', '入力に誤りがあります。表示に従って修正してください')); return; }
    const list = model.scenarios.filter(s => s.on);
    if (!list.length) { status(L('請至少啟用一個情境。', 'Enable at least one case.', 'ケースを 1 つ以上有効にしてください。')); return; }
    const items = list.map(sc => ({ sc: clone(sc) })), t0 = performance.now();
    setBusy(true, L('情境計算中…', 'Computing cases…', 'ケース計算中…'));
    let k = 0;
    const next = () => {
      if (k >= items.length) {
        setBusy(false);
        scen = { items, stale: false, method: model.settings.method || 'janbu', useF0: !!model.settings.useF0, ms: performance.now() - t0 };
        renderScen(); renderResults();
        status(L(`完成 ${items.length} 個情境的計算`, `${items.length} cases computed`, `${items.length} ケースの計算が完了しました`));
        return;
      }
      const it = items[k++], miss = scenMissing(it.sc);
      if (miss.length) { it.msg = L(`請輸入 ${miss.join('、')}`, `Enter ${miss.join(', ')}`, `${miss.join('、')} を入力してください`); next(); return; }
      const v = scenarioModel(it.sc);
      if (v.err) { it.msg = v.err; next(); return; }
      it.m = v.m;
      runSearch(v.m, L(`情境 ${k}/${items.length}「${it.sc.name}」`, `Case ${k}/${items.length} “${it.sc.name}”, `, `ケース ${k}/${items.length}「${it.sc.name}」`), r => {
        it.r = r;
        if (r.ok) it.Fj = judgeF(r, model.settings); else it.msg = tx(r.msg);
        next();
      });
    };
    next();
  }
  async function runVerify() {
    if (ver && ver.running) return;
    const cases = verifyCases(), btn = $('#btnVerify'), box = $('#verOut');
    ver = { rows: [], running: true, when: new Date(), ua: navigator.userAgent };
    btn.disabled = true; $('#btnVerDocx').disabled = true; $('#btnVerPrint').disabled = true;
    const t0 = performance.now();
    for (let i = 0; i < cases.length; i++) {
      const cs = cases[i];
      box.innerHTML = `<p class="hint">${L(`執行中 ${i + 1} / ${cases.length}：${cs.grp}・${cs.name}`, `Running ${i + 1} of ${cases.length}: ${cs.grp} · ${cs.name}`, `実行中 ${i + 1} / ${cases.length}：${cs.grp}・${cs.name}`)}</p><div class="ver-bar"><i style="width:${(100 * i / cases.length).toFixed(1)}%"></i></div>`;
      await tick();
      let rows;
      try { rows = await cs.run(); } catch (e) { rows = [{ item: L('錯誤', 'error', 'エラー'), ref: NaN, val: NaN, tol: EX, src: String(e && e.message || e) }]; }
      for (const r of rows) { const d = r.val / r.ref - 1; ver.rows.push(Object.assign({ grp: cs.grp, name: cs.name, d, pass: isFinite(d) && d >= r.tol.lo - 1e-12 && d <= r.tol.hi + 1e-12 }, r)); }
    }
    ver.ms = performance.now() - t0; ver.running = false;
    btn.disabled = false; $('#btnVerDocx').disabled = false; $('#btnVerPrint').disabled = false;
    renderVerify();
  }
  function bindCase() {
    $('#btnScenAdd').addEventListener('click', () => { pushUndo(); model.scenarios.push({ name: L_(`情境 ${model.scenarios.length + 1}`, `Case ${model.scenarios.length + 1}`, `ケース ${model.scenarios.length + 1}`), kind: 'custom', on: true, water: 'base', dh: null, kh: 0, kv: 0, Freq: null, loads: true, reinf: true }); scenChanged(true); });
    $('#btnScenReset').addEventListener('click', () => { pushUndo(); model.scenarios = defaultScenarios(); scenChanged(true); });
    $('#btnScenRun').addEventListener('click', runScenarios);
    $('#scenList').addEventListener('click', e => {
      if (e.target.closest('#btnPreset')) {
        const P = FS_PRESETS[$('#scenPreset').value]; if (!P) return;
        pushUndo(); let n = 0;
        model.scenarios.forEach(sc => { if (P.v[sc.kind] !== undefined) { sc.Freq = P.v[sc.kind]; n++; } });
        scenChanged(true);
        status(L(`已套用「${P.name()}」的要求值到 ${n} 個情境（類型為「其他」的情境不變）`, `Applied “${P.name()}” to ${n} cases (cases of type “Other” are unchanged)`, `「${P.name()}」の所要値を ${n} ケースに適用しました（種類「その他」は変更なし）`));
        return;
      }
      const b = e.target.closest('[data-scact]'); if (!b) return;
      const i = +b.closest('[data-sc]').dataset.sc; pushUndo();
      if (b.dataset.scact === 'del') model.scenarios.splice(i, 1);
      else model.scenarios.splice(i + 1, 0, Object.assign(clone(model.scenarios[i]), { name: model.scenarios[i].name + L(' 複本', ' copy', ' コピー') }));
      scenChanged(true);
    });
    $('#scenList').addEventListener('change', e => {
      const el = e.target, f = el.dataset.scf; if (!f) return;
      const i = +el.closest('[data-sc]').dataset.sc, sc = model.scenarios[i];
      if (el.type === 'checkbox') sc[f] = el.checked;
      else if (f === 'name') sc.name = el.value.trim() || sc.name;
      else if (f === 'water') sc.water = el.value;
      else if (f === 'kind') sc.kind = el.value;
      else { const v = parseFloat(el.value); sc[f] = isFinite(v) ? v : null; }
      scenChanged(f === 'water' || f === 'on' || f === 'kind' || f === 'kh' || f === 'kv');
    });
    ['title', 'project', 'author', 'note'].forEach(k => $('#rep-' + k).addEventListener('input', e => { model.report = model.report || {}; model.report[k] = e.target.value.trim(); }));
    $('#btnRepDocx').addEventListener('click', e => exportDocx(e.currentTarget));
    $('#btnRepPrint').addEventListener('click', printReport);
  }
  function scenChanged(rerender) { if (scen && !scen.stale) { scen.stale = true; renderScen(); } if (rerender) renderScenList(); renderWallChecks(); }

  function setTheme(theme, silent) {
    THEME = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', THEME);
    try { localStorage.setItem('ssa-theme', THEME); } catch (e) { }
    document.querySelectorAll('.theme-seg button[data-theme]').forEach(b => {
      const on = b.dataset.theme === THEME;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    });
    if (!silent) {
      draw();
      status(THEME === 'dark' ? L('已切換為黑色背景主題', 'Switched to dark theme', '黒背景テーマに切り替えました') : L('已切換為白色背景主題', 'Switched to light theme', '白背景テーマに切り替えました'));
    }
  }

  function setLang(lang) {
    LANG = lang === 'en' || lang === 'ja' ? lang : 'zh';
    try { localStorage.setItem('ssa-lang', LANG); } catch (e) { }
    try { const u = new URL(location.href); u.searchParams.set('lang', LANG); history.replaceState(null, '', u); } catch (e) { }
    renameDefaults();
    applyStatic();
    $('#csvSampleFull').textContent = csvFull();
    setBusy(running, running ? L('計算中…', 'Computing…', '計算中…') : '');
    renderLines(); renderCoords(); renderLayers(); renderSettings(); renderReinf(); renderWalls(); renderLoads(); draw(); renderResults(); renderGuide(); renderCounter();
    renderScenList(); renderScen(); renderCtrl(); renderVersion(); renderVerify();
    status(L('已切換為中文介面', 'Switched to English', '日本語に切り替えました'));
  }

  setTheme(THEME, true);
  applyStatic();
  renameDefaults();
  renderVersion();
  bind();
  bindCase(); renderScenList(); renderRepInfo();
  bindCtrl(); renderCtrl();
  visitCounter();
  $('#btnUndo').disabled = true;
  fit(); renderLines(); renderCoords(); renderLayers(); renderSettings(); renderReinf(); renderWalls(); renderLoads(); draw(); renderResults(); renderGuide();
  run();

window.AppController = {
  bind, bindCase, bindCtrl, onDown, onMove, onUp,
  run, runTrial, runBack, runPileDesign, runScenarios, runVerify,
  setLang, setTheme, scenChanged
};
