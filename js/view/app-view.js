/**
 * MVC - View 層：側邊欄面板、分析結果與動態資訊渲染 (AppView)
 */
  /* ---------- sidebar ---------- */
  function renderLines() {
    const box = $('#lineList');
    box.innerHTML = lineDefs().map(d => {
      const n = (getPts(d.key) || []).length;
      const sw = d.kind === 'water' ? '<span class="sw water"></span>' : d.kind === 'piezo' ? '<span class="sw piezo"></span>' : d.kind === 'trial' ? '<span class="sw trial"></span>' : d.kind === 'bound' ? `<span class="sw bound" style="border-top-color:${d.color}"></span>` : '<span class="sw"></span>';
      return `<button class="lrow" type="button" data-key="${d.key}" aria-pressed="${d.key === active}">${sw}<span>${esc(d.label)}</span><span class="cnt">${n} ${L('點', n === 1 ? 'pt' : 'pts')}</span></button>`;
    }).join('');
    const d = lineDefs().find(x => x.key === active);
    $('#coordTitle').textContent = L(`座標：${d ? d.label : ''}（x　z）`, `Coordinates: ${d ? d.label : ''} (x　z)`, `座標：${d ? d.label : ''}（x　z）`);
    $('#btnClearLine').hidden = !(active === 'water' || active === 'trial');
    const isP = active[0] === 'P' && getPts(active);
    $('#piezoRow').hidden = !isP;
    if (isP) $('#piezoName').value = model.piezo[+active.slice(1)].name;
    $('#btnCopyCrit').hidden = !(active === 'trial' && result && result.ok);
    $('#circRow').hidden = active !== 'trial';
    if (active === 'trial' && model.trialCircle && document.activeElement && !document.activeElement.closest('#circRow')) { const c = model.trialCircle; $('#ciXc').value = c.xc; $('#ciZc').value = c.zc; $('#ciR').value = c.R; }
    $('#btnMakeWater').hidden = !(active === 'water' && !model.water.length);
    $('#activeInfo').textContent = L(`編輯中：${d ? d.label : ''}`, `Editing: ${d ? d.label : ''}`, `編集中：${d ? d.label : ''}`);
  }
  function renderCoords() {
    const P = getPts(active) || [];
    $('#coords').value = P.map(p => `${r3(p[0])}\t${r3(p[1])}`).join('\n');
  }
  function poreField(Ly) {
    const p = Ly.pore || { type: 'wt' }, val = p.type === 'piezo' ? 'p' + p.line : p.type;
    const opts = [['wt', L_('地下水位線', 'Water table', '地下水位線')], ...(model.piezo || []).map((q, k) => ['p' + k, q.name]), ['ru', L_('孔隙水壓比 ru', 'Pore pressure ratio ru', '間隙水圧比 ru')], ['dry', L_('不計（乾）', 'None (dry)', '考慮しない（乾燥）')]];
    return `<div class="grid2 pore-row"><div class="field"><label>${L_('孔隙水壓', 'Pore pressure', '間隙水圧')}</label><select data-f="poreType">${opts.map(([v, t]) => `<option value="${v}"${v === val ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      ${p.type === 'ru' ? `<div class="field"><label>ru <small>u = ru·σv</small></label><input type="number" step="0.05" min="0" max="0.95" value="${dispN(p.ru)}" data-f="ru"></div>` : '<div></div>'}</div>`;
  }
  const poreName = p => !p || p.type === 'wt' ? L('地下水位線', 'water table', '地下水位線') : p.type === 'piezo' ? ((model.piezo || [])[p.line] || {}).name || '?' : p.type === 'ru' ? `ru = ${fmt(p.ru, 2)}` : L('不計', 'none', 'なし');
  function renderLayers() {
    const box = $('#layerList');
    box.innerHTML = model.layers.map((L, i) => `
      <div class="layer" data-i="${i}">
        <div class="layer-head">
          <input type="color" value="${L.color}" data-f="color" aria-label="${L_('顏色', 'Colour', '色')}">
          <input type="text" value="${esc(L.name)}" data-f="name" aria-label="${L_('土層名稱', 'Layer name', '地層名')}">
          <button class="btn small ghost" data-del="${i}" type="button" ${model.layers.length < 2 ? 'disabled' : ''} title="${L_('刪除此層', 'Delete this layer', 'この地層を削除')}">${L_('刪除', 'Delete', '削除')}</button>
        </div>
        <div class="grid4">
          <div class="field"><label>γ <small>${uG()}</small></label><input type="number" step="${gTF() ? 0.01 : 0.1}" value="${dispN(toG(L.gamma))}" data-f="gamma"></div>
          <div class="field"><label>γsat <small>${uG()}</small></label><input type="number" step="${gTF() ? 0.01 : 0.1}" value="${dispN(toG(L.gammaSat))}" data-f="gammaSat"></div>
          <div class="field"><label>c' <small>${uC()}</small></label><input type="number" step="${cTF() ? 0.1 : 0.5}" value="${dispN(toC(L.c))}" data-f="c"></div>
          <div class="field"><label>φ' <small>°</small></label><input type="number" step="0.5" value="${L.phi}" data-f="phi"></div>
        </div>
        ${L.bedrock ? '' : poreField(L)}
        <label class="check"><input type="checkbox" data-f="bedrock" ${L.bedrock ? 'checked' : ''}><span>${L_('岩盤（滑動面不可穿越）', 'Bedrock (slip surface cannot enter)', '基盤岩（すべり面は通過しない）')}</span></label>
        <span class="idx">${L_(`第 ${i + 1} 層・頂面為${i ? '界面線 ' + i : '地表線'}`, `Layer ${i + 1} · top is ${i ? 'boundary line ' + i : 'the ground surface'}`, `第 ${i + 1} 層・上面は${i ? '境界線 ' + i : '地表面'}`)}</span>
      </div>`).join('');
  }
  function renderSettings() {
    $$('[data-s]').forEach(el => {
      const v = model.settings[el.dataset.s];
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.dataset.s === 'gw') el.value = dispN(toG(v));
      else el.value = v;
    });
    $('#lbl-gw').textContent = L(`水的單位重 γw (${uG()})`, `Unit weight of water γw (${uG()})`, `水の単位体積重量 γw (${uG()})`);
    $('#zBase').value = model.zBase;
    syncTc(); renderPileDesign(); renderWallCode();
    renderBack();
  }
  /* tension crack settings: show the details only when switched on, and the Rankine depth of the top layer */
  function syncTc() {
    const s = model.settings, box = $('#tcBox'); if (!box) return;
    box.hidden = !s.tcOn; $('#tcDepthF').hidden = s.tcMode !== 'manual';
    const Ly = model.layers[0], info = $('#tcInfo');
    if (s.tcMode === 'manual') { info.textContent = L('裂縫深度採指定值，但不超過該處土層底部。', 'The specified depth is used, limited to the soil above bedrock or the model base.', '指定した深さを用います（基盤岩またはモデル底面より上に限る）。'); return; }
    if (!Ly || Ly.bedrock || !(Ly.c > 0)) { info.textContent = L('地表土層的 c′ = 0，Rankine 深度為 0，不會產生張力裂縫。', 'The surface layer has c′ = 0, so the Rankine depth is zero and no crack forms.', '地表の地層は c′ = 0 のため、Rankine 深さは 0 で亀裂は生じません。'); return; }
    const Ka = Math.pow(Math.tan((45 - Ly.phi / 2) * Math.PI / 180), 2), zc = 2 * Ly.c / (Ly.gamma * Math.sqrt(Ka));
    info.textContent = L(`zc = 2c′/(γ√Ka)，以「${Ly.name}」計算：Ka = ${fmt(Ka, 3)}，zc = ${fmt(zc, 2)} m（地下水位以下改用 γsat）。坡頂各處依該處地表土層計算。`,
      `zc = 2c′/(γ√Ka). From “${Ly.name}”: Ka = ${fmt(Ka, 3)}, zc = ${fmt(zc, 2)} m (γsat is used below the water table). Each crest position uses the layer at the ground there.`,
      `zc = 2c′/(γ√Ka)、「${Ly.name}」で計算：Ka = ${fmt(Ka, 3)}、zc = ${fmt(zc, 2)} m（地下水位以下は γsat）。頭部の各位置ではその地点の地表の地層で計算します。`);
  }

  function renderReinf() {
    const box = $('#reinfList');
    if ($('#rbXa').value === '') { const a = faceX(0.15), b = faceX(0.85); $('#rbXa').value = Math.min(a, b); $('#rbXb').value = Math.max(a, b); }
    if (!model.reinf.length) { box.innerHTML = `<p class="hint">${L('尚未加入補強構件。按下方按鈕新增土釘、地錨、抑止樁、微型樁或地工合成材，或用「整排配置」一次加入多支。', 'No members yet. Use the buttons below to add soil nails, anchors, stabilizing piles, micropiles or geosynthetics, or “Place a row” to add several at once.', '補強材はまだありません。下のボタンで鉄筋挿入工、アンカー、抑止杭、マイクロパイル、ジオシンセティックスを追加するか、「列で配置」でまとめて追加してください。')}</p>`; return; }
    const crossed = result && result.ok && !stale && result.members ? result.members : null;
    const sel = (f, v, opts) => `<select data-f="${f}">${opts.map(([k, t]) => `<option value="${k}"${v === k ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    box.innerHTML = model.reinf.map((r, i) => {
      const fld = (f, lab, v, step, conv) => `<div class="field"><label>${lab}</label><input type="number" step="${step}" value="${dispN(conv === 'c' ? toC(v) : conv ? toG(v) : v)}" data-f="${f}"${conv ? ` data-conv="${conv}"` : ''}></div>`;
      const sfld = (lab, f, v, opts) => `<div class="field"><label>${lab}</label>${sel(f, v, opts)}</div>`;
      const m = crossed && crossed.find(c => c.idx === i);
      let info = '';
      if (m) {
        if (!m.crossed) info = L('未穿過臨界滑動面', 'Does not cross the critical surface', '臨界すべり面と交差しない');
        else if (r.type === 'pile') info = L(`滑動面以上 ${fmt(m.Le, 2)} m、根入 ${fmt(m.Lr, 2)} m・每支 H = ${fmt(toG(m.H), 1)} ${uT()}・抑止力 ${fmt(toG(m.Tm), 1)} ${uF()}（${tx(m.ctrl)}控制）`, `${fmt(m.Le, 2)} m above the slip surface, embedment ${fmt(m.Lr, 2)} m · H = ${fmt(toG(m.H), 1)} ${uT()} per pile · restraint ${fmt(toG(m.Tm), 1)} ${uF()} (governed by ${tx(m.ctrl)})`, `すべり面より上 ${fmt(m.Le, 2)} m、根入れ ${fmt(m.Lr, 2)} m・1 本当たり H = ${fmt(toG(m.H), 1)} ${uT()}・抑止力 ${fmt(toG(m.Tm), 1)} ${uF()}（${tx(m.ctrl)}で決定）`);
        else if (r.type === 'mpile') info = L(`穿過滑動面・軸力 ${fmt(toG(m.Na), 1)}、剪力 ${fmt(toG(m.V), 1)} ${uT()}/支・合力 ${fmt(toG(m.Tm), 2)} ${uF()}`, `Crosses slip surface · axial ${fmt(toG(m.Na), 1)}, shear ${fmt(toG(m.V), 1)} ${uT()} per pile · resultant ${fmt(toG(m.Tm), 2)} ${uF()}`, `すべり面と交差・軸力 ${fmt(toG(m.Na), 1)}、せん断 ${fmt(toG(m.V), 1)} ${uT()}/本・合力 ${fmt(toG(m.Tm), 2)} ${uF()}`);
        else info = L(`穿過滑動面・T = ${fmt(toG(m.Tm), 2)} ${uF()}（${m.ctrl}）`, `Crosses slip surface · T = ${fmt(toG(m.Tm), 2)} ${uF()} (${tx(m.ctrl)})`, `すべり面と交差・T = ${fmt(toG(m.Tm), 2)} ${uF()}（${tx(m.ctrl)}）`);
      }
      const types = ['nail', 'anchor', 'pile', 'mpile', 'geo'].map(t => `<option value="${t}"${r.type === t ? ' selected' : ''}>${typeName(t)}</option>`).join('');
      let body;
      if (r.type === 'pile') body = `<div class="grid3">
          ${fld('x', L('位置 x (m)', 'Position x (m)', '位置 x (m)'), r.x, 0.5)}${fld('L', L('樁長 L (m)', 'Length L (m)', '杭長 L (m)'), r.L, 0.5)}${fld('D', L('間距 D (m)', 'Spacing D (m)', '間隔 D (m)'), r.D, 0.1)}
          ${fld('N', L('排數 N', 'Rows N', '列数 N'), r.N, 1)}${fld('Do', L('鋼管外徑 (mm)', 'Outer diameter (mm)', '鋼管外径 (mm)'), r.Do, 0.1)}${fld('t', L('管厚 t (mm)', 'Wall t (mm)', '板厚 t (mm)'), r.t, 0.1)}
          ${sfld(L('鋼材', 'Steel', '鋼種'), 'grade', r.grade, [['SKK400', 'SKK400'], ['SKK490', 'SKK490'], ['SM570', 'SM570']])}${sfld(L('容許應力', 'Allowable stress', '許容応力'), 'term', r.term, [['long', L('長期', 'Long-term', '長期')], ['short', L('短期', 'Short-term', '短期')]])}${sfld(L('樁型', 'Pile type', '杭の形式'), 'ptype', r.ptype, [['wedge', ptypeShort('wedge')], ['restrain', ptypeShort('restrain')]])}
        </div>
        <div class="grid3">
          ${fld('E0m', L(`移動層 E0 (${uC()})`, `Moving mass E0 (${uC()})`, `移動層 E0 (${uC()})`), r.E0m, 500, 'c')}${fld('E0b', L(`穩定層 E0 (${uC()})`, `Stable ground E0 (${uC()})`, `不動層 E0 (${uC()})`), r.E0b, 500, 'c')}${fld('aE', L('E0 換算係數 α', 'E0 factor α', 'E0 の換算係数 α'), r.aE, 1)}
        </div>
        <details class="adv"><summary>${L('進階', 'Advanced', '詳細')}</summary><div class="grid3">
          ${r.ptype === 'restrain' ? sfld(L('荷重分布', 'Load distribution', '荷重分布'), 'load', r.load, [['tri', L('三角形 h = Le/3', 'Triangular h = Le/3', '三角形 h = Le/3')], ['uni', L('等分布 h = Le/2', 'Uniform h = Le/2', '等分布 h = Le/2')], ['rigid', L('剛體 h = 0', 'Rigid h = 0', '剛体 h = 0')]]) : ''}
          ${fld('kEmb', L('根入安全率', 'Embedment factor', '根入れの安全率'), r.kEmb, 0.1)}${fld('FSy', L('地盤降伏安全率', 'Ground yield FS', '地盤降伏の安全率'), r.FSy, 0.1)}${fld('a0', L('剪應力修正 α', 'Shear factor α', 'せん断応力補正 α'), r.a0, 0.1)}
        </div></details>`;
      else if (r.type === 'mpile') body = `<div class="grid3">
          ${fld('x', L('頭部 x (m)', 'Head x (m)', '頭部 x (m)'), r.x, 0.5)}${fld('z', L('頭部 z (m)', 'Head z (m)', '頭部 z (m)'), r.z, 0.5)}${fld('theta', L('傾角 θ (°)', 'Inclination θ (°)', '傾角 θ (°)'), r.theta, 1)}
          ${fld('L', L('總長 L (m)', 'Length L (m)', '全長 L (m)'), r.L, 0.5)}${fld('Sh', L('間距 Sh (m)', 'Spacing Sh (m)', '間隔 Sh (m)'), r.Sh, 0.1)}${fld('Tt', L(`軸向強度 (${uT()})`, `Axial strength (${uT()})`, `軸方向強度 (${uT()})`), r.Tt, 10, 1)}
          ${fld('q', L(`握裹 q (${uQ()})`, `Bond q (${uQ()})`, `周面摩擦 q (${uQ()})`), r.q, 5, 1)}${fld('Va', L(`容許剪力 Va (${uT()})`, `Shear Va (${uT()})`, `許容せん断 Va (${uT()})`), r.Va, 5, 1)}
        </div>`;
      else if (r.type === 'geo') body = `<div class="grid3">
          ${sfld(L('材料', 'Material', '材料'), 'kind', r.kind, [['grid', L('地工格網', 'Geogrid', 'ジオグリッド')], ['tex', L('地工織物', 'Geotextile', 'ジオテキスタイル')]])}${fld('x', L('坡面端 x (m)', 'Face end x (m)', 'のり面側 x (m)'), r.x, 0.5)}${fld('z', L('高程 z (m)', 'Elevation z (m)', '標高 z (m)'), r.z, 0.1)}
          ${fld('L', L('長度 L (m)', 'Length L (m)', '長さ L (m)'), r.L, 0.5)}${fld('Tult', L(`極限拉力 (${uQ()})`, `Ultimate strength (${uQ()})`, `引張強さ (${uQ()})`), r.Tult, 5, 1)}${fld('rfID', L('施工損傷 RF<sub>ID</sub>', 'RF<sub>ID</sub> installation', '施工時損傷 RF<sub>ID</sub>'), r.rfID, 0.05)}
          ${fld('rfCR', L('潛變 RF<sub>CR</sub>', 'RF<sub>CR</sub> creep', 'クリープ RF<sub>CR</sub>'), r.rfCR, 0.05)}${fld('rfD', L('耐久 RF<sub>D</sub>', 'RF<sub>D</sub> durability', '耐久性 RF<sub>D</sub>'), r.rfD, 0.05)}${fld('fsPo', L('拉拔安全係數', 'Pullout FS', '引抜きの安全率'), r.fsPo, 0.1)}
          ${fld('Ci', L('介面係數 Ci', 'Interaction Ci', '摩擦係数比 Ci'), r.Ci, 0.05)}${fld('aS', L('尺寸效應 α', 'Scale effect α', '寸法効果 α'), r.aS, 0.05)}${sfld(L('拉力方向', 'Force direction', '引張力の方向'), 'dir', r.dir, [['h', L('水平', 'Horizontal', '水平')], ['t', L('沿滑動面', 'Along slip surface', 'すべり面方向')]])}
        </div>
        <label class="check" style="font-size:12px"><input type="checkbox" data-f="face"${r.face ? ' checked' : ''}><span>${L('坡面端包覆或連結（前端不受拉拔控制）', 'Wrapped or connected at the face (no pullout at the front)', 'のり面で巻込みまたは連結（前方の引抜きを考慮しない）')}</span></label>`;
      else body = `<div class="grid3">
          ${fld('x', L('頭部 x (m)', 'Head x (m)', '頭部 x (m)'), r.x, 0.5)}${fld('z', L('頭部 z (m)', 'Head z (m)', '頭部 z (m)'), r.z, 0.5)}${fld('theta', L('傾角 θ (°)', 'Inclination θ (°)', '傾角 θ (°)'), r.theta, 1)}
          ${fld('L', L('總長 L (m)', 'Length L (m)', '全長 L (m)'), r.L, 0.5)}${fld('Sh', L('間距 Sh (m)', 'Spacing Sh (m)', '間隔 Sh (m)'), r.Sh, 0.1)}${fld('Tt', L(`抗拉 (${uT()})`, `Tension (${uT()})`, `引張 (${uT()})`), r.Tt, 10, 1)}
          ${fld('q', L(`拉拔 q (${uQ()})`, `Pullout q (${uQ()})`, `引抜き q (${uQ()})`), r.q, 5, 1)}
          ${r.type === 'anchor' ? fld('Lfree', L('自由段 (m)', 'Free length (m)', '自由長 (m)'), r.Lfree, 0.5) + fld('P', L(`錨力 P (${uT()})`, `Anchor load P (${uT()})`, `設計アンカー力 P (${uT()})`), r.P, 10, 1) : fld('Tf', L(`面版 (${uT()})`, `Facing (${uT()})`, `頭部・のり面工 (${uT()})`), r.Tf, 10, 1)}
        </div>`;
      return `<div class="rcard${r.on ? '' : ' off'}" data-r="${i}">
        <div class="rcard-head">
          <span class="no">${i + 1}</span>
          <select data-f="type" aria-label="${L('類型', 'Type', '種類')}">${types}</select>
          <label class="check" style="font-size:12px;align-items:center"><input type="checkbox" data-f="on"${r.on ? ' checked' : ''} style="margin:0"><span>${L('啟用', 'On', '有効')}</span></label>
          <span class="sp"></span>
          ${r.type === 'pile' ? '' : `<button class="btn small ghost" data-act="snap" type="button" title="${r.type === 'geo' ? L('把坡面端 x 移到該高程的坡面', 'Move the face end x to the slope face at this elevation', 'のり面側 x をこの標高ののり面に合わせる') : L('把頭部高程設為該處地表高程', 'Set the head elevation to the ground surface', '頭部標高をその位置の地表面に合わせる')}">${L('貼齊', 'Snap', '地表に合わせる')}</button>`}
          <button class="btn small ghost" data-act="dup" type="button">${L('複製', 'Duplicate', '複製')}</button>
          <button class="btn small ghost" data-act="del" type="button">${L('刪除', 'Delete', '削除')}</button>
        </div>
        ${body}
        ${info ? `<span class="idx">${info}</span>` : ''}
      </div>`;
    }).join('');
  }
  function renderLoads() {
    const box = $('#loadList');
    if (!model.loads.length) { box.innerHTML = `<p class="hint">${L('尚未加入載重。', 'No loads yet.', '荷重はまだありません。')}</p>`; return; }
    box.innerHTML = model.loads.map((l, i) => {
      const fld = (f, lab, v, step, kind) => `<div class="field"><label>${lab}</label><input type="number" step="${step}" value="${isFinite(v) ? dispN(kind === 'C' ? toC(v) : kind === 'G' ? toG(v) : v) : ''}" data-lf="${f}"${kind ? ` data-lk="${kind}"` : ''}></div>`;
      return `<div class="rcard${l.on ? '' : ' off'}" data-l="${i}">
        <div class="rcard-head">
          <span class="no">Q${i + 1}</span>
          <input type="text" value="${esc(l.name)}" data-lf="name" aria-label="${L('名稱', 'Name', '名称')}" style="flex:1;min-width:80px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;background:var(--canvas);font-size:13px">
          <select data-lf="type" aria-label="${L('類型', 'Type', '種類')}"><option value="udl"${l.type === 'udl' ? ' selected' : ''}>${L('均布／梯形', 'Distributed', '等分布／台形')}</option><option value="line"${l.type === 'line' ? ' selected' : ''}>${L('線載重', 'Line load', '線荷重')}</option></select>
          <button class="btn small ghost" data-lact="del" type="button">${L('刪除', 'Delete', '削除')}</button>
        </div>
        <div class="grid3">
          ${l.type === 'udl' ? fld('x1', L('起點 x (m)', 'Start x (m)', '始点 x (m)'), l.x1, 0.5) + fld('x2', L('終點 x (m)', 'End x (m)', '終点 x (m)'), l.x2, 0.5) + fld('q', L(`起點 q (${uC()})`, `Start q (${uC()})`, `始点 q (${uC()})`), l.q, 1, 'C') + fld('q2', L(`終點 q (${uC()})，空白＝均布`, `End q (${uC()}), blank = uniform`, `終点 q (${uC()})、空欄＝等分布`), l.q2 === null ? NaN : l.q2, 1, 'C') : fld('x', L('作用點 x (m)', 'Position x (m)', '作用点 x (m)'), l.x, 0.5) + fld('P', `P (${uF()})`, l.P, 5, 'G')}
        </div>
        <div class="row">
          <label class="check" style="font-size:12px;align-items:center"><input type="checkbox" data-lf="seis"${l.seis ? ' checked' : ''} style="margin:0"><span>${L('計入地震慣性力', 'Include seismic inertia', '地震慣性力を考慮')}</span></label>
          <label class="check" style="font-size:12px;align-items:center"><input type="checkbox" data-lf="on"${l.on ? ' checked' : ''} style="margin:0"><span>${L('啟用', 'On', '有効')}</span></label>
        </div>
      </div>`;
    }).join('');
  }
  function renderWallCode() {
    const sel = $('#wallCode'); if (!sel) return;
    sel.innerHTML = Object.keys(WALL_CODES).map(k => `<option value="${k}"${(model.wallCode || 'wsc') === k ? ' selected' : ''}>${WALL_CODES[k].name()}</option>`).join('');
    const t = $('#wallCodeTbl'), C = wallCode(), e = C.ecc;
    t.innerHTML = `<thead><tr><th class="t">${L('項目', 'Item', '項目')}</th><th>${L('常時', 'Normal', '常時')}</th><th>${L('地震時', 'Seismic', '地震時')}</th></tr></thead><tbody>
      <tr><td class="t">${L('滑動 Fs', 'Sliding Fs', '滑動 Fs')}</td><td>${C.slide[0].toFixed(1)}</td><td>${C.slide[1].toFixed(1)}</td></tr>
      <tr><td class="t">${L('傾倒 Fs', 'Overturning Fs', '転倒 Fs')}</td><td>${C.ot[0].toFixed(1)}</td><td>${C.ot[1].toFixed(1)}</td></tr>
      <tr><td class="t">${L('合力位置', 'Resultant', '合力位置')}</td><td colspan="2" class="t">${e ? L('土層 e ≤ B/6（中段三分之一），岩盤 e ≤ B/4（中段二分之一）', 'soil e ≤ B/6 (middle third), rock e ≤ B/4 (middle half)', '土質 e ≤ B/6（中央 1/3）、岩盤 e ≤ B/4（中央 1/2）') : L('未另規定，合力須在底面內', 'not specified; the resultant must lie within the base', '規定なし。合力は底面内')}</td></tr>
      <tr><td class="t">${L('承載力 Fs', 'Bearing Fs', '支持力 Fs')}</td><td>${C.bear[0].toFixed(1)}</td><td>${C.bear[1].toFixed(1)}</td></tr></tbody>`;
  }
  function renderWallChecks() {
    const box = $('#wallOut'); if (!box) return;
    computeWalls();
    const sel = $('#wallCode'); if (sel && sel.value !== (model.wallCode || 'wsc')) sel.value = model.wallCode || 'wsc';
    if (!model.walls.some(w => w.on)) { box.innerHTML = ''; draw(); return; }
    if (!wallRes.length) { box.innerHTML = `<p class="hint">${L('外部穩定檢核只適用參數式斷面；以頂點座標自訂形狀的擋土牆只計入整體穩定。', 'External stability is checked only for parametric sections; walls with custom vertices count in global stability only.', '外的安定の照査はパラメータ断面のみが対象です。頂点座標で形状を定めた擁壁は全体安定のみに考慮されます。')}</p>`; draw(); return; }
    const chip = ok => ok ? '<span class="chip ok">OK</span>' : '<span class="chip crit">NG</span>', f2 = v => !isFinite(v) ? '∞' : fmt(v, 2);
    let h = '';
    for (const R of wallRes) {
      const w = R.w;
      h += `<h4 class="wall-h">W${R.i + 1} ${esc(w.name)}${L('・', ' · ', '・')}${wallTypeName(w.type)}</h4>`;
      const bad = R.cases.find(q => q.r && !q.r.ok);
      if (bad) { h += `<p class="hint warnline">${esc(tx(bad.r.msg))}</p>`; continue; }
      const cs = R.cases;
      const row = (lab, fn) => `<tr><td class="t">${lab}</td>${cs.map(q => q.err ? '<td class="t">—</td>' : `<td class="t">${fn(q)}</td>`).join('')}</tr>`;
      h += `<div class="tblwrap"><table class="wall-tbl"><thead><tr><th class="t"></th>${cs.map(q => `<th class="t">${esc(q.c.name)}${q.c.seis ? `<small>kh ${fmt(q.c.kh, 2)}</small>` : ''}</th>`).join('')}</tr></thead><tbody>
        ${row(L('滑動 Fs', 'Sliding Fs', '滑動 Fs'), q => `${f2(q.r.FSs)} ≥ ${fmt(q.chk.slide.req, 1)} ${chip(q.chk.slide.ok)}`)}
        ${row(L('傾倒 Fs', 'Overturning Fs', '転倒 Fs'), q => `${f2(q.r.FSo)} ≥ ${fmt(q.chk.ot.req, 1)} ${chip(q.chk.ot.ok)}`)}
        ${row(L('偏心 |e|', 'Eccentricity |e|', '偏心 |e|'), q => `${fmt(Math.abs(q.r.e), 2)}${q.chk.ecc.lim === null ? '' : ` ≤ ${fmt(q.chk.ecc.lim, 2)}`} m ${chip(q.chk.ecc.ok)}`)}
        ${row(L('基底壓力 qmax／qmin', 'Base pressure qmax / qmin', '地盤反力 qmax／qmin'), q => q.r.out ? L('合力在底面外', 'resultant outside base', '合力が底面外') : `${fmt(toC(q.r.qmax), 1)} / ${fmt(toC(q.r.qmin), 1)} ${uC()}`)}
        ${row(L('承載力', 'Bearing', '支持力'), q => q.chk.bear.mode === 'qa' ? `qmax ≤ qa ${fmt(toC(q.chk.bear.lim), 0)} ${chip(q.chk.bear.ok)}` : `Fs ${f2(q.r.FSb)} ≥ ${fmt(q.chk.bear.req, 1)} ${chip(q.chk.bear.ok)}`)}
        <tr><td class="t"><b>${L('判定', 'Result', '判定')}</b></td>${cs.map(q => q.err ? `<td class="t"><small class="warnline">${esc(q.err)}</small></td>` : `<td class="t">${chip(q.chk.all)}</td>`).join('')}</tr>
      </tbody></table></div>`;
      const q0 = cs.find(q => q.r);
      if (q0) {
        const warns = [...new Set(cs.filter(q => q.r).flatMap(q => q.r.warn))];
        h += `<details><summary>${L('力系明細', 'Force details', '力の明細')}</summary><div class="tblwrap"><table class="wall-tbl"><tbody>
          ${row(L('背填土／基礎土', 'Backfill / foundation', '裏込め土／支持層'), q => `${esc(q.r.backfill.name)} φ ${fmt(q.r.backfill.phi, 1)}° / ${esc(q.r.found.name)} φ ${fmt(q.r.found.phi, 1)}°`)}
          ${row(L('回填坡度 β／牆背摩擦 δ', 'Backfill slope β / wall friction δ', '裏込め勾配 β／壁面摩擦 δ'), q => `${fmt(q.r.beta, 1)}° / ${fmt(q.r.delta, 1)}°`)}
          ${row(L('土壓係數 K', 'Earth pressure coeff. K', '土圧係数 K'), q => `${fmt(q.r.K, 4)}${q.r.kh > 0 ? ' (M–O)' : ''}`)}
          ${row(L('背面高 h／載重 q', 'Back height h / surcharge q', '背面高 h／上載 q'), q => `${fmt(q.r.hb, 2)} m / ${fmt(toC(q.r.q), 1)} ${uC()}`)}
          ${row(L('土壓力 Pa（作用高）', 'Earth thrust Pa (height)', '土圧合力 Pa（作用高）'), q => `${fmt(toG(q.r.Pa), 1)} ${uF()}（${fmt(q.r.za, 2)} m）`)}
          ${row(L('水壓 Pw／揚壓 U', 'Water Pw / uplift U', '水圧 Pw／揚圧力 U'), q => `${fmt(toG(q.r.Pw), 1)} / ${fmt(toG(q.r.U), 1)} ${uF()}`)}
          ${row(L('重量 ΣW（牆＋土）', 'Weight ΣW (wall + soil)', '重量 ΣW（壁体＋土）'), q => `${fmt(toG(q.r.Wsum), 1)} ${uF()}`)}
          ${row('ΣV / ΣH', q => `${fmt(toG(q.r.V), 1)} / ${fmt(toG(q.r.Hd), 1)} ${uF()}`)}
          ${row('Mr / Mo', q => `${fmt(toG(q.r.Mr), 1)} / ${fmt(toG(q.r.Mo), 1)}`)}
          ${row(L('底面摩擦 μ／被動 Pp', 'Base friction μ / passive Pp', '底面摩擦 μ／受働 Pp'), q => `${fmt(q.r.mu, 3)} / ${fmt(toG(q.r.Pp), 1)}`)}
          ${row(L('極限承載力 qu（B′）', 'Ultimate bearing qu (B′)', '極限支持力 qu（B′）'), q => `${fmt(toC(q.r.qu), 0)} ${uC()}（${fmt(q.r.Bp, 2)} m）`)}
        </tbody></table></div>${warns.length ? `<p class="hint warnline">${warns.map(t => esc(tx(t))).join('<br>')}</p>` : ''}</details>`;
      }
    }
    h += `<p class="hint">${L(`要求值依「${wallCode().name()}」。地震情境採地震時的要求值；以容許承載力 qa 檢核時，地震時的容許值依常時與地震時安全係數的比例放大。`, `Required values follow “${wallCode().name()}”. Seismic cases use the seismic values; with an allowable bearing pressure qa, the seismic allowable is scaled by the ratio of the normal to the seismic safety factor.`, `所要値は「${wallCode().name()}」による。地震ケースは地震時の値を用い、許容支持力 qa で照査する場合、地震時の許容値は常時と地震時の安全率の比で割り増す。`)}</p>`;
    box.innerHTML = h;
    draw();
  }
  function renderWalls() {
    const box = $('#wallList'), openD = new Set([...box.querySelectorAll('details[open][data-dk]')].map(d => d.dataset.dk));
    if (!model.walls.length) { box.innerHTML = `<p class="hint">${L('尚未加入擋土牆。', 'No retaining walls yet.', '擁壁はまだありません。')}</p>`; renderWallChecks(); return; }
    box.innerHTML = model.walls.map((w, i) => {
      const p = w.par || {}, ex = w.ext || WALL_EXT, t = w.type || 'gravity';
      const fld = (f, lab, v, step) => `<div class="field"><label>${lab}</label><input type="number" step="${step}" value="${isFinite(v) ? dispN(v) : ''}" data-p="${f}"></div>`;
      const xf = (f, lab, v, step, kind) => `<div class="field"><label>${lab}</label><input type="number" step="${step}" value="${v === '' || v === undefined || v === null ? '' : dispN(kind === 'C' ? toC(v) : kind === 'G' ? toG(v) : v)}" data-x="${f}"${kind ? ` data-xk="${kind}"` : ''} placeholder="${L('自動', 'auto', '自動')}"></div>`;
      const geo = t === 'gravity' ? fld('b', L('頂寬 b (m)', 'Top width b (m)', '天端幅 b (m)'), p.b, 0.1)
        : fld('tb', L('底版厚 (m)', 'Base slab (m)', '底版厚 (m)'), p.tb, 0.05) + fld('toe', L('趾長 (m)', 'Toe length (m)', 'つま先長 (m)'), p.toe, 0.1) + fld('ts1', L('牆身頂厚 (m)', 'Stem top (m)', '竪壁天端厚 (m)'), p.ts1, 0.05) + fld('ts2', L('牆身底厚 (m)', 'Stem bottom (m)', '竪壁基部厚 (m)'), p.ts2, 0.05)
          + (t === 'counterfort' ? fld('cs', L('扶壁間距 (m)', 'Counterfort spacing (m)', '控え壁間隔 (m)'), p.cs, 0.1) + fld('ct', L('扶壁厚 (m)', 'Counterfort thickness (m)', '控え壁厚 (m)'), p.ct, 0.05) : '');
      return `<div class="rcard${w.on ? '' : ' off'}" data-w="${i}">
        <div class="rcard-head">
          <span class="no">W${i + 1}</span>
          <input type="text" value="${esc(w.name)}" data-wf="name" aria-label="${L('名稱', 'Name', '名称')}" style="flex:1;min-width:80px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;background:var(--canvas);font-size:13px">
          <select data-wf="type" aria-label="${L('型式', 'Type', '形式')}">${['gravity', 'cantilever', 'counterfort'].map(k => `<option value="${k}"${t === k ? ' selected' : ''}>${wallTypeName(k)}</option>`).join('')}</select>
          <label class="check" style="font-size:12px;align-items:center"><input type="checkbox" data-wf="on"${w.on ? ' checked' : ''} style="margin:0"><span>${L('啟用', 'On', '有効')}</span></label>
          <button class="btn small ghost" data-wact="del" type="button">${L('刪除', 'Delete', '削除')}</button>
        </div>
        ${w.par ? '' : `<p class="hint warnline">${L('目前為自訂頂點形狀，只計入整體穩定。輸入下列尺寸即改回參數式斷面並做外部穩定檢核。', 'This wall uses custom vertices and counts in global stability only. Enter the dimensions below to return to a parametric section with external stability checks.', '現在は頂点座標による形状で、全体安定のみに考慮されます。下の寸法を入力するとパラメータ断面に戻り、外的安定を照査します。')}</p>`}
        <div class="grid3">
          ${fld('x0', L('前趾 x (m)', 'Toe x (m)', 'つま先 x (m)'), p.x0, 0.5)}${fld('z0', L('底面 z (m)', 'Base z (m)', '底面 z (m)'), p.z0, 0.5)}${fld('H', L('牆高 H (m)', 'Height H (m)', '壁高 H (m)'), p.H, 0.5)}
          ${fld('B', L('底寬 B (m)', 'Base width B (m)', '底幅 B (m)'), p.B, 0.1)}${geo}
          <div class="field"><label>${L('單位重', 'Unit weight', '単位体積重量')} (${uG()})</label><input type="number" step="${gTF() ? 0.01 : 0.1}" value="${dispN(toG(w.gamma))}" data-wf="gamma"></div>
          <div class="field"><label>${L('基礎', 'Foundation', '基礎地盤')}</label><select data-xs="found"><option value="soil"${ex.found !== 'rock' ? ' selected' : ''}>${L('土層', 'Soil', '土質')}</option><option value="rock"${ex.found === 'rock' ? ' selected' : ''}>${L('岩盤', 'Rock', '岩盤')}</option></select></div>
        </div>
        <details class="adv" data-dk="x${i}"${openD.has('x' + i) ? ' open' : ''}><summary>${L('外部穩定設定', 'External stability options', '外的安定の設定')}</summary>
          <div class="grid3">
            ${t === 'gravity' ? xf('delta', L('牆背摩擦角 δ (°)', 'Wall friction δ (°)', '壁面摩擦角 δ (°)'), ex.delta, 1) : ''}
            ${xf('mu', L('底面摩擦係數 μ', 'Base friction μ', '底面摩擦係数 μ'), ex.mu, 0.05)}
            <div class="field"><label>${L('承載力', 'Bearing', '支持力')}</label><select data-xs="bearMode"><option value="calc"${ex.bearMode !== 'qa' ? ' selected' : ''}>${L('計算極限承載力', 'Compute ultimate', '極限支持力を計算')}</option><option value="qa"${ex.bearMode === 'qa' ? ' selected' : ''}>${L('輸入容許承載力', 'Allowable qa', '許容支持力を入力')}</option></select></div>
            ${ex.bearMode === 'qa' ? xf('qa', L(`容許承載力 qa (${uC()})`, `Allowable qa (${uC()})`, `許容支持力 qa (${uC()})`), ex.qa, 10, 'C') : ''}
            ${xf('bPhi', L('背填土 φ′ (°)', 'Backfill φ′ (°)', '裏込め φ′ (°)'), ex.bPhi, 1)}${xf('bC', L(`背填土 c′ (${uC()})`, `Backfill c′ (${uC()})`, `裏込め c′ (${uC()})`), ex.bC, 1, 'C')}${xf('bG', L(`背填土 γ (${uG()})`, `Backfill γ (${uG()})`, `裏込め γ (${uG()})`), ex.bG, 0.1, 'G')}
            ${xf('fPhi', L('基礎土 φ′ (°)', 'Foundation φ′ (°)', '支持層 φ′ (°)'), ex.fPhi, 1)}${xf('fC', L(`基礎土 c′ (${uC()})`, `Foundation c′ (${uC()})`, `支持層 c′ (${uC()})`), ex.fC, 1, 'C')}${xf('fG', L(`基礎土 γ (${uG()})`, `Foundation γ (${uG()})`, `支持層 γ (${uG()})`), ex.fG, 0.1, 'G')}
          </div>
          <label class="check" style="font-size:12px"><input type="checkbox" data-xs="drained"${ex.drained ? ' checked' : ''}><span>${L('排水良好（不計牆後水壓與揚壓力）', 'Well drained (no water pressure behind the wall and no uplift)', '排水良好（背面水圧と揚圧力を考慮しない）')}</span></label>
          <label class="check" style="font-size:12px"><input type="checkbox" data-xs="passive"${ex.passive ? ' checked' : ''}><span>${L('滑動計入牆前被動土壓（折減 50%）', 'Count passive resistance in front for sliding (reduced 50%)', '滑動に前面の受働土圧を考慮（50% 低減）')}</span></label>
          <p class="hint">${L('留白的欄位依剖面自動取值：背填土取牆背中段的土層，基礎土取底面下方的土層；δ 預設 2φ′/3，μ 預設 tan(2φ′/3)。', 'Blank fields come from the profile: the backfill is the layer at mid-height behind the wall, the foundation the layer below the base; δ defaults to 2φ′/3 and μ to tan(2φ′/3).', '空欄は断面から自動設定します。裏込め土は背面中段の地層、支持層は底面下の地層です。δ の既定値は 2φ′/3、μ は tan(2φ′/3) です。')}</p>
        </details>
        <details class="adv" data-dk="v${i}"${openD.has('v' + i) ? ' open' : ''}><summary>${L('頂點座標（整體穩定用）', 'Vertices (for global stability)', '頂点座標（全体安定用）')}</summary>
          <textarea rows="4" spellcheck="false" data-wf="poly" aria-label="${L('擋土牆頂點座標', 'Retaining wall vertices', '擁壁の頂点座標')}">${w.poly.map(q => `${r3(q[0])}\t${r3(q[1])}`).join('\n')}</textarea>
          <div class="row"><button class="btn small" data-wact="apply" type="button">${L('套用頂點座標（改為自訂形狀）', 'Apply vertices (custom shape)', '頂点座標を適用（任意形状）')}</button></div>
        </details>
      </div>`;
    }).join('');
    renderWallChecks();
  }

  function renderGuide() {
    const gi = gridInfo(), box = $('#searchGuide'), chip = $('#gridChip');
    if (!gi) { box.innerHTML = ''; chip.textContent = ''; return; }
    const warns = [];
    if (gi.dx > 2.5) warns.push(L(`分割線間距 ${fmt(gi.dx, 2)} m 偏大，滑動面會較粗糙，Fs 可能偏高。`, `Line spacing ${fmt(gi.dx, 2)} m is large; the slip surface will be coarse and Fs may be overestimated.`, `分割線の間隔 ${fmt(gi.dx, 2)} m は大きすぎます。すべり面が粗くなり、Fs が高めに出るおそれがあります。`));
    if (gi.dz > 0.6) warns.push(L(`節點垂直間距 ${fmt(gi.dz, 2)} m 偏大，淺層滑動面可能抓不準。`, `Vertical node spacing ${fmt(gi.dz, 2)} m is large; shallow slip surfaces may be missed.`, `節点の鉛直間隔 ${fmt(gi.dz, 2)} m は大きすぎます。浅いすべり面を捉えきれないおそれがあります。`));
    const short = [];
    model.layers.forEach((Ly, i) => { if (i && Ly.top && Ly.top.length && (Ly.top[0][0] > gi.x0 + 1e-6 || Ly.top[Ly.top.length - 1][0] < gi.x1 - 1e-6)) short.push(L_(`${Ly.name} 頂面`, `top of ${Ly.name}`, `${Ly.name} の上面`)); });
    const w = model.water; if (w.length >= 2 && (w[0][0] > gi.x0 + 1e-6 || w[w.length - 1][0] < gi.x1 - 1e-6)) short.push(L('地下水位線', 'water table', '地下水位線'));
    if (short.length) warns.push(L(`${short.join('、')}沒有涵蓋地表線全長，超出部分會沿用端點高程，建議補上端點。`, `${short.join(', ')} ${short.length > 1 ? 'do' : 'does'} not span the full ground line; the end elevations are extended beyond. Adding end points is recommended.`, `${short.join('、')}が地表線の全長をカバーしていません。範囲外は端点の標高で延長されるため、端点の追加をおすすめします。`));
    if (gi.sec > 8) warns.push(L('網格很密，計算可能要十幾秒以上，可先用建議值試算。', 'The grid is dense and may take more than ten seconds. Try the recommended values first.', '格子が細かく、計算に十数秒以上かかる場合があります。まず推奨値で試算してください。'));
    const same = gi.N === gi.recN && gi.M === gi.recM;
    const t = gi.sec < 1 ? L('1 秒內', 'under 1 s', '1 秒以内') : L(`約 ${Math.ceil(gi.sec)} 秒`, `about ${Math.ceil(gi.sec)} s`, `約 ${Math.ceil(gi.sec)} 秒`);
    box.innerHTML = `
      <span class="gt">${L('目前模型的搜尋網格', 'Search grid for the current model', '現在のモデルの探索格子')}</span>
      <dl>
        <dt>${L('水平長度', 'Horizontal length', '水平長さ')}</dt><dd>${fmt(gi.L, 1)} m <em>${L(`（地表線 x = ${fmt(gi.x0, 1)} 到 ${fmt(gi.x1, 1)}）`, `(ground line x = ${fmt(gi.x0, 1)} to ${fmt(gi.x1, 1)})`, `（地表線 x = ${fmt(gi.x0, 1)} 〜 ${fmt(gi.x1, 1)}）`)}</em></dd>
        <dt>${L('最大土層厚度', 'Maximum soil thickness', '最大土層厚')}</dt><dd>${fmt(gi.H, 1)} m <em>${L('（地表到底部或岩盤）', '(ground to base or bedrock)', '（地表から底面または基盤岩まで）')}</em></dd>
        <dt>${L('分割線間距', 'Line spacing', '分割線の間隔')}</dt><dd>${fmt(gi.dx, 2)} m <em>${L('（建議 1–2 m）', '(1–2 m recommended)', '（推奨 1〜2 m）')}</em></dd>
        <dt>${L('節點垂直間距', 'Vertical node spacing', '節点の鉛直間隔')}</dt><dd>${L('最大', 'max', '最大')} ${fmt(gi.dz, 2)} m <em>${L('（建議 ≤ 0.5 m）', '(≤ 0.5 m recommended)', '（推奨 ≤ 0.5 m）')}</em></dd>
        <dt>${L('預估計算時間', 'Estimated time', '推定計算時間')}</dt><dd>${t}</dd>
      </dl>
      ${warns.length ? warns.map(w => `<p class="note warn">${w}</p>`).join('') : `<p class="note ok">${L('網格密度適當。', 'Grid density is adequate.', '格子の密度は適切です。')}</p>`}
      <div class="row"><button class="btn small" id="btnRec" type="button" ${same ? 'disabled' : ''}>${L(`套用建議值：分割線 ${gi.recN} 條、節點 ${gi.recM} 個`, `Apply recommended: ${gi.recN} lines, ${gi.recM} nodes`, `推奨値を適用：分割線 ${gi.recN} 本、節点 ${gi.recM} 個`)}</button></div>`;
    chip.textContent = L(`網格 ${gi.N}×${gi.M}・線距 ${fmt(gi.dx, 1)} m`, `Grid ${gi.N}×${gi.M} · spacing ${fmt(gi.dx, 1)} m`, `格子 ${gi.N}×${gi.M}・間隔 ${fmt(gi.dx, 1)} m`);
    chip.classList.toggle('warn', warns.length > 0);
    chip.title = warns.length ? warns.join('\n') : L('搜尋網格密度適當，點選查看設定', 'Search grid density is adequate; click to view settings', '探索格子の密度は適切です。クリックで設定を表示');
    $('#rangeInfo').textContent = L(`目前水平範圍 ${fmt(gi.x0, 1)} 到 ${fmt(gi.x1, 1)} m（長 ${fmt(gi.L, 1)} m），由地表線第一點與最後一點決定。要改長度，請改地表線端點的 x，並把界面線與水位線延伸到同一範圍。`, `The horizontal range is ${fmt(gi.x0, 1)} to ${fmt(gi.x1, 1)} m (length ${fmt(gi.L, 1)} m), set by the first and last points of the ground line. To change it, edit the x of the ground line end points and extend the boundary lines and water table to the same range.`, `現在の水平範囲は ${fmt(gi.x0, 1)} 〜 ${fmt(gi.x1, 1)} m（長さ ${fmt(gi.L, 1)} m）で、地表線の最初と最後の点で決まります。長さを変えるには地表線端点の x を変更し、境界線と地下水位線も同じ範囲まで延長してください。`);
    const br = $('#btnRec');
    if (br) br.onclick = () => {
      pushUndo(); model.settings.nCol = gi.recN; model.settings.nState = gi.recM;
      renderSettings(); stale = !!result; save(); renderGuide(); renderResults();
      status(L(`已套用建議值：分割線 ${gi.recN} 條、節點 ${gi.recM} 個`, `Applied recommended values: ${gi.recN} lines, ${gi.recM} nodes`, `推奨値を適用しました：分割線 ${gi.recN} 本、節点 ${gi.recM} 個`));
    };
  }

  function status(t) { $('#status').textContent = t; }
  function setBusy(on, label) {
    running = on;
    const btn = $('#btnRun'), bt = $('#btnTrial');
    btn.disabled = on; bt.disabled = on;
    btn.textContent = on && label ? label : L('計算最危險滑動面', 'Find critical slip surface', '臨界すべり面を計算');
  }
  function renderPileDesign() {
    const box = $('#pdOut'); if (!box) return;
    $('#pdPFs').value = (model.pileDesign && model.pileDesign.PFs) || 1.2;
    if (!pd) { box.innerHTML = ''; return; }
    const o = pd.res;
    if (!o.ok) { box.innerHTML = `<div class="msg">${esc(tx(o.msg))}</div>`; return; }
    const N = v => fmt(v / 1000, 1);
    const mLab = o.method === 'janbu' ? (o.useF0 ? L('簡易 Janbu（f0·Fs）', 'simplified Janbu (f0·Fs)', '簡易 Janbu（f0·Fs）') : L('簡易 Janbu（未修正）', 'simplified Janbu (uncorrected)', '簡易 Janbu（補正なし）')) : methName(o.method);
    let h = `${pdValid() ? '' : `<p class="hint warnline">${L('幾何、參數或計算結果已變更，以下為舊的結果，請重新計算。', 'The model or the result has changed; these results are out of date.', 'モデルまたは結果が変更されました。以下は古い結果です。')}</p>`}
      <p class="hint">${L(`計算方法：${mLab}。滑動面：${o.useBase ? '無補強措施的臨界滑動面' : '目前的臨界滑動面（未勾選「同時計算無補強措施的情況」）'}，其他補強構件照常計入。耗時 ${fmt(o.ms / 1000, 1)} 秒。`, `Method: ${mLab}. Surface: ${o.useBase ? 'critical surface without reinforcement' : 'current critical surface (“also compute without reinforcement” is off)'}; other members are included. ${fmt(o.ms / 1000, 1)} s.`, `計算方法：${mLab}。すべり面：${o.useBase ? '対策なしの臨界すべり面' : '現在の臨界すべり面（「対策なしも計算」が無効）'}。その他の補強材は考慮。計算時間 ${fmt(o.ms / 1000, 1)} 秒。`)}</p>`;
    for (const p of o.piles) {
      const r = model.reinf[p.i] || {};
      h += `<h4 style="margin:10px 0 4px;font-size:13px">#${p.i + 1} ${typeName('pile')}${p.ok ? `　x = ${fmt(p.x, 2)} m` : ''}</h4>`;
      if (!p.ok) { h += `<p class="hint warnline">${esc(tx(p.msg))}</p>`; continue; }
      const c = p.chk, sc = c.sec;
      const chip = ok => ok ? '<span class="chip ok">OK</span>' : '<span class="chip crit">NG</span>';
      const ml = L('（移動層／穩定層）', ' (moving / stable)', '（移動層／不動層）');
      const rows = [
        [L('無樁時 Fs → 計畫安全率', 'Fs without piles → planned', '杭なしの Fs → 計画安全率'), `${fmt(p.F0, 3)} → ${fmt(o.PFs, 2)}`],
        [L('必要抑止力 Pr', 'Required restraint force Pr', '必要抑止力 Pr'), p.Pr > 0 ? `<b>${fmt(toG(p.Pr), 1)}</b> ${uF()}` : L('不需要', 'not needed', '不要')],
        [L('滑動面傾角 θ', 'Slip angle θ', 'すべり面傾角 θ'), `${fmt(p.th, 1)}°`],
        [L('滑動面以上 Le／根入 Lr', 'Above slip Le / embedment Lr', 'すべり面上 Le／根入れ Lr'), `${fmt(c.Le, 2)} / ${fmt(c.Lr, 2)} m`],
        [L('每支 H／V', 'Per pile H / V', '1 本当たり H／V'), `${fmt(toG(c.H), 1)} / ${fmt(toG(c.V), 1)} ${uT()}`],
        ['kh' + (c.ptype === 'wedge' ? ml : ''), `${c.ptype === 'wedge' ? fmt(c.kh1, 0) + ' / ' : ''}${fmt(c.kh2, 0)} kN/m³`],
        ['β' + (c.ptype === 'wedge' ? ml : ''), `${c.ptype === 'wedge' ? fmt(c.b1, 4) + ' / ' : ''}${fmt(c.b2, 4)} m⁻¹`],
        [L('最大彎矩', 'Max. moment', '最大曲げモーメント') + (c.ptype === 'wedge' ? ml : ''), c.ptype === 'wedge' ? `${fmt(toG(Math.abs(c.M1)), 1)} / ${fmt(toG(Math.abs(c.M2)), 1)} ${uT()}·m` : `${fmt(toG(c.Mmax), 1)} ${uT()}·m（h = ${fmt(c.h, 2)} m）`],
        [L('彎曲應力 σ', 'Bending stress σ', '曲げ応力 σ'), `${N(c.sigma)} ≤ ${N(sc.sa)} N/mm² ${chip(c.ok.sigma)}`],
        [L('剪應力 τ', 'Shear stress τ', 'せん断応力 τ'), `${N(c.tau)} ≤ ${N(sc.ta)} N/mm² ${chip(c.ok.tau)}`],
        [L('根入長度', 'Embedment', '根入れ長'), `${fmt(c.Lr, 2)} ≥ ${fmt(c.Lreq, 2)} m ${chip(c.ok.emb)}`],
        ...(c.ptype === 'wedge' ? [[L('地盤降伏（移動層）', 'Ground yield (moving)', '地盤の降伏（移動層）'), `H ${fmt(toG(c.H), 1)} ≤ Qp1 ${fmt(toG(c.Qp1), 1)} ${chip(c.ok.qp1)}`]] : []),
        [L('地盤降伏（穩定層）', 'Ground yield (stable)', '地盤の降伏（不動層）'), `H ${fmt(toG(c.H), 1)} ≤ Qp2 ${fmt(toG(c.Qp2), 1)} ${chip(c.ok.qp2)}`],
        [`<b>${L('判定', 'Result', '判定')}</b>`, `${chip(c.allOk)} ${L(`可承受 H = ${fmt(toG(c.Hallow), 1)} ${uT()}（${tx(c.ctrl)}控制），相當於抑止力 ${fmt(toG(c.PRcap), 1)} ${uF()}`, `capacity H = ${fmt(toG(c.Hallow), 1)} ${uT()} (${tx(c.ctrl)}), i.e. ${fmt(toG(c.PRcap), 1)} ${uF()} of restraint`, `許容 H = ${fmt(toG(c.Hallow), 1)} ${uT()}（${tx(c.ctrl)}で決定）、抑止力 ${fmt(toG(c.PRcap), 1)} ${uF()} に相当`)}`]
      ];
      h += `<div class="tblwrap"><table class="pd-tbl"><tbody>${rows.map(([k, v]) => `<tr><td class="t">${k}</td><td class="t">${v}</td></tr>`).join('')}</tbody></table></div>`;
    }
    h += `<p class="hint">${L('加樁後請重新計算最危險滑動面，確認滑動面不會從樁底下方或樁的前、後方另外滑出。', 'After adding piles, search again to make sure no surface passes below the piles or slides out in front of or behind them.', '杭を入れた後は臨界すべり面を再計算し、杭の下や前後を通るすべりがないことを確認してください。')}</p>`;
    box.innerHTML = h;
  }

  function renderBack() {
    const sel = $('#bkLayer'); if (!sel) return;
    sel.innerHTML = `<option value="auto">${L('自動（滑動面通過最長的土層）', 'Auto (layer with the longest slip length)', '自動（すべり面の通過長が最長の地層）')}</option>` +
      model.layers.map((Ly, i) => Ly.bedrock ? '' : `<option value="${i}">${L_(`第 ${i + 1} 層`, `Layer ${i + 1}`, `第 ${i + 1} 層`)}：${esc(Ly.name)}</option>`).join('');
    if (bk.layer !== 'auto' && (!model.layers[+bk.layer] || model.layers[+bk.layer].bedrock)) bk.layer = 'auto';
    sel.value = bk.layer; $('#bkParam').value = bk.param; $('#bkTarget').value = bk.target; $('#bkCurve').checked = bk.curve;
    const box = $('#bkOut'), r = bkRes;
    if (!r) { box.innerHTML = ''; return; }
    if (!r.ok) {
      const pn = r.param === 'phi' ? "φ'" : "c'";
      const msg = r.code === 'low' ? L(`即使 ${pn} = 0，Fs 仍達 ${fmt(r.Fend, 3)}，高於目標值，無法反算。可改反算其他土層或參數。`, `Even with ${pn} = 0, Fs is ${fmt(r.Fend, 3)}, above the target, so it cannot be back-calculated. Try another layer or parameter.`, `${pn} = 0 でも Fs が ${fmt(r.Fend, 3)} で目標値を上回るため、逆算できません。他の地層またはパラメータを試してください。`)
        : r.code === 'high' ? L(`${pn} 提高到上限仍無法使 Fs 達到目標值，無法反算。`, `Fs does not reach the target even at the upper limit of ${pn}, so it cannot be back-calculated.`, `${pn} を上限まで上げても Fs が目標値に達しないため、逆算できません。`)
        : /沒有通過這個土層/.test(r.msg || '') ? L('指定滑動面沒有通過這個土層，無法反算。', 'The specified surface does not pass through this layer.', '指定すべり面がこの地層を通過していないため、逆算できません。') : tx(r.msg);
      box.innerHTML = `<div class="msg">${esc(msg)}</div>`; return;
    }
    const mName = r.method === 'janbu' ? (r.useF0 ? L('簡易 Janbu 法（f0·Fs）', 'simplified Janbu (f0·Fs)', '簡易 Janbu 法（f0·Fs）') : L('簡易 Janbu 法（未修正）', 'simplified Janbu (uncorrected)', '簡易 Janbu 法（補正なし）')) : methName(r.method) + L(' 法', '', ' 法');
    const cTxt = v => `${fmt(toC(v), cTF() ? 3 : 2)} ${uC()}`, pTxt = v => `${fmt(v, 2)}°`;
    const val = r.param === 'c' ? `c′ = <b>${cTxt(r.value)}</b>${L('（φ′ = ', ' (φ′ = ', '（φ′ = ')}${pTxt(r.phi0)}${L(' 固定）', ' fixed)', ' 固定）')}` : `φ′ = <b>${pTxt(r.value)}</b>${L('（c′ = ', ' (c′ = ', '（c′ = ')}${cTxt(r.c0)}${L(' 固定）', ' fixed)', ' 固定）')}`;
    let html = `${r.stale ? `<p class="chip stale">${L('模型已變更，請重新反算', 'The model has changed; please run again', 'モデルが変更されました。再度逆算してください')}</p>` : ''}
      <p class="bk-main">${L(`第 ${r.li + 1} 層「${esc(r.name)}」`, `Layer ${r.li + 1} “${esc(r.name)}”`, `第 ${r.li + 1} 層「${esc(r.name)}」`)}${L('：', ': ', '：')}${val}</p>
      <p class="hint">${L(`計算方法：${mName}，目標 Fs = ${fmt(r.target, 3)}，驗算 Fs = ${fmt(r.F, 4)}。滑動面通過此層約 ${fmt(r.len, 1)} m，耗時 ${fmt(r.ms / 1000, 2)} 秒。`, `Method: ${mName}; target Fs = ${fmt(r.target, 3)}, check Fs = ${fmt(r.F, 4)}. The surface runs about ${fmt(r.len, 1)} m in this layer; ${fmt(r.ms / 1000, 2)} s.`, `計算方法：${mName}、目標 Fs = ${fmt(r.target, 3)}、検算 Fs = ${fmt(r.F, 4)}。すべり面のこの地層内の長さは約 ${fmt(r.len, 1)} m、計算時間 ${fmt(r.ms / 1000, 2)} 秒。`)}</p>
      <div class="row"><button class="btn small" type="button" data-apply="main">${L('套用到土層並試算', 'Apply to the layer and evaluate', '地層に適用して試算')}</button></div>`;
    if (r.curve && r.curve.length > 1) {
      const pc = r.curve, W = 300, H = 170, pl = 46, pr = 20, pt = 10, pb = 34;
      const xm = Math.max(1, ...pc.map(p => p.phi)), ym = Math.max(1e-6, ...pc.map(p => toC(p.c)));
      const X = v => pl + (W - pl - pr) * v / xm, Y = v => H - pb - (H - pt - pb) * v / ym;
      const pts = pc.map(p => `${X(p.phi).toFixed(1)},${Y(toC(p.c)).toFixed(1)}`).join(' ');
      const cur = r.param === 'c' ? [r.phi0, r.value] : [r.value, r.c0];
      const ticks = n => Array.from({ length: n + 1 }, (_, k) => k / n);
      html += `<p class="hint" style="margin-top:10px">${L('同樣使 Fs 等於目標值的 c′–φ′ 組合（其他土層參數不變）：', 'c′–φ′ pairs giving the same target Fs (other layers unchanged):', '同じ目標 Fs となる c′–φ′ の組合せ（他の地層は変更なし）：')}</p>
        <svg class="bk-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="c′–φ′">
          ${ticks(4).map(t => `<line x1="${pl}" x2="${W - pr}" y1="${Y(t * ym)}" y2="${Y(t * ym)}" class="bk-grid"/><text x="${pl - 6}" y="${Y(t * ym) + 4}" text-anchor="end">${fmt(t * ym, ym < 10 ? 1 : 0)}</text>`).join('')}
          ${ticks(4).map(t => `<text x="${X(t * xm)}" y="${H - pb + 16}" text-anchor="middle">${fmt(t * xm, 1)}</text>`).join('')}
          <text x="${(pl + W - pr) / 2}" y="${H - 4}" text-anchor="middle">φ′ (°)</text>
          <text x="12" y="${(pt + H - pb) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(pt + H - pb) / 2})">c′ (${uC()})</text>
          <polyline points="${pts}" class="bk-line"/>
          ${pc.map(p => `<circle cx="${X(p.phi)}" cy="${Y(toC(p.c))}" r="2.5" class="bk-pt"/>`).join('')}
          ${cur[0] <= xm * 1.05 ? `<circle cx="${X(cur[0])}" cy="${Y(toC(cur[1]))}" r="5" class="bk-cur"/>` : ''}
        </svg>
        <div class="tblwrap"><table><thead><tr><th>φ′ (°)</th><th>c′ (${uC()})</th><th></th></tr></thead><tbody>
          ${pc.map(p => `<tr><td>${fmt(p.phi, 2)}</td><td>${fmt(toC(p.c), cTF() ? 3 : 2)}</td><td><button class="btn small" type="button" data-apply="pair" data-c="${p.c}" data-phi="${p.phi}">${L('套用', 'Apply', '適用')}</button></td></tr>`).join('')}
        </tbody></table></div>
        <p class="hint">${L('反算只能得到一條 c′–φ′ 組合曲線，需配合試驗、相近案例或多條崩塌面才能決定單一組參數。', 'A single surface only gives a c′–φ′ curve; tests, similar cases or several failure surfaces are needed to fix one pair.', '1 本のすべり面からは c′–φ′ の組合せ曲線しか得られません。1 組に決めるには試験、類似事例、複数の崩壊面が必要です。')}</p>`;
    }
    box.innerHTML = html;
  }

  function renderResults() {
    const box = $('#results');
    box.classList.toggle('stale', !!(stale && result));
    if (errors.length) {
      box.innerHTML = `<div class="msg"><strong>${L('無法計算，請先修正：', 'Cannot compute. Please fix:', '計算できません。次の点を修正してください：')}</strong><ul>${errors.map(e => `<li>${esc(tx(e))}</li>`).join('')}</ul></div>`;
      return;
    }
    if (!result) { box.innerHTML = `<p class="hint">${L('按「計算最危險滑動面」開始分析。', 'Press “Find critical slip surface” to start.', '「臨界すべり面を計算」を押すと解析を開始します。')}</p>`; return; }
    if (!result.ok) { box.innerHTML = `<div class="msg">${esc(tx(result.msg))}</div>`; return; }
    const r = result, s = model.settings;
    const rg = rigOf(r), rigOk = !!(rg && rg.ok);
    const Fj = rigOk ? rg.F : (s.useF0 ? r.Fc : r.F), req = +s.Freq;
    const fsx = g => g && g.ok ? fmt(g.F, 3) : L('未收斂', 'no convergence', '収束せず');
    let rigLines = '';
    if (r.rig) {
      if (!rg) rigLines += `<span class="base-line">${L('嚴密法對照', 'Rigorous methods', '厳密法の比較')}${L('：', ': ', '：')}Spencer <b>${fsx(r.rig.spencer)}</b>${L('・', ' · ', '・')}M–P <b>${fsx(r.rig.mp)}</b></span>`;
      else {
        if (!rigOk) rigLines += `<span class="base-line warnline">${L(`${methName(r.method)} 法在此滑動面未收斂，以下為簡易 Janbu 法結果。`, `The ${methName(r.method)} method did not converge on this surface; simplified Janbu results are shown.`, `${methName(r.method)} 法はこのすべり面で収束しなかったため、簡易 Janbu 法の結果を表示しています。`)}</span>`;
        const other = r.method === 'mp' ? 'spencer' : 'mp';
        rigLines += `<span class="base-line">${methName(other)} Fs = <b>${fsx(r.rig[other])}</b>${L('・', ' · ', '・')}${L('簡易 Janbu', 'Simplified Janbu', '簡易 Janbu')} Fs = <b>${fmt(r.F, 3)}</b>${L('（修正後 ', ' (corrected ', '（補正後 ')}${fmt(r.Fc, 3)}${L('）', ')', '）')}</span>`;
        if (r.dp && isFinite(r.dp.Fr)) rigLines += `<span class="base-line">${L(`DP 滑動面之 Fs = <b>${fmt(r.dp.Fr, 3)}</b>，局部最佳化後降低 <b>${fmt((1 - FS(r) / r.dp.Fr) * 100, 1)}%</b>`, `Fs on the DP surface = <b>${fmt(r.dp.Fr, 3)}</b>; local optimisation lowers it by <b>${fmt((1 - FS(r) / r.dp.Fr) * 100, 1)}%</b>`, `DP すべり面の Fs = <b>${fmt(r.dp.Fr, 3)}</b>、局所最適化で <b>${fmt((1 - FS(r) / r.dp.Fr) * 100, 1)}%</b> 低下`)}</span>`;
      }
    }
    let chip;
    if (stale) chip = `<span class="chip stale">${L('幾何或參數已變更，請重新計算', 'Geometry or parameters changed; please recompute', '形状またはパラメータが変更されました。再計算してください')}</span>`;
    else if (Fj < 1) chip = `<span class="chip crit">${L('不穩定（Fs &lt; 1.0）', 'Unstable (Fs &lt; 1.0)', '不安定（Fs &lt; 1.0）')}</span>`;
    else if (Fj < req) chip = `<span class="chip warn">${L('低於要求值', 'Below required', '所要値を下回る')} ${fmt(req, 2)}</span>`;
    else chip = `<span class="chip ok">${L('符合要求值', 'Meets required', '所要値を満たす')} ${fmt(req, 2)}</span>`;
    const hasEX = rigOk && r.rows.length && r.rows[0].E !== undefined;
    const S = r.slip, pA = S[0], pB = S[S.length - 1];
    const toe = r.mirror ? pB : pA, head = r.mirror ? pA : pB;
    box.innerHTML = `
      <div class="res-top">
        <div class="fsbox">
          <span class="lbl">${rigOk ? L(`安全係數 Fs（${methName(r.method)} 法）`, `Factor of safety Fs (${methName(r.method)})`, `安全率 Fs（${methName(r.method)} 法）`) : L('安全係數 Fs（簡易 Janbu）', 'Factor of safety Fs (simplified Janbu)', '安全率 Fs（簡易 Janbu 法）')}<span class="mode-chip">${r.mode === 'trial' ? L('指定滑動面', 'Specified surface', '指定すべり面') : L('自動搜尋', 'Search', '自動探索')}</span></span>
          <span class="big">${fmt(rigOk ? rg.F : r.F, 3)}</span>
          ${rigOk ? `<span class="sub">λ = <span class="num">${fmt(rg.lam, 3)}</span>${L('，', ', ', '、')}${r.method === 'mp' ? 'f(x) = sin(πx′)' : 'f(x) = 1'}</span>` : ''}
          <span class="sub"${rigOk ? ' hidden' : ''}>${L('修正後', 'Corrected', '補正後')} f0·Fs = <span class="num">${fmt(r.Fc, 3)}</span>${L('（', ' (', '（')}f0 = ${fmt(r.f0, 3)}${L('，', ', ', '、')}${r.f0type === 'janbu' ? L('Janbu 曲線', 'Janbu curve', 'Janbu 曲線') : '(50d/L)<sup>0.03</sup>'}${L('）', ')', '）')}</span>
          ${rigLines}
          ${r.baseLoad ? (r.baseLoad.ok ? L(`<span class="base-line">無載重 Fs = <b>${fmt(FS(r.baseLoad), 3)}</b>，加載後${FS(r) >= FS(r.baseLoad) ? '提高' : '降低'} <b>${fmt(Math.abs(FS(r) / FS(r.baseLoad) - 1) * 100, 1)}%</b></span>`, `<span class="base-line">Without loads Fs = <b>${fmt(FS(r.baseLoad), 3)}</b>; loads ${FS(r) >= FS(r.baseLoad) ? 'raise' : 'lower'} it by <b>${fmt(Math.abs(FS(r) / FS(r.baseLoad) - 1) * 100, 1)}%</b></span>`, `<span class="base-line">荷重なし Fs = <b>${fmt(FS(r.baseLoad), 3)}</b>、載荷により <b>${fmt(Math.abs(FS(r) / FS(r.baseLoad) - 1) * 100, 1)}%</b> ${FS(r) >= FS(r.baseLoad) ? '上昇' : '低下'}</span>`) : `<span class="base-line">${L('無載重情況：', 'Without loads: ', '荷重なしの場合：')}${esc(tx(r.baseLoad.msg) || L('無法計算', 'cannot compute', '計算できません'))}</span>`) : ''}
          ${r.base ? (r.base.ok ? L(`<span class="base-line">無補強措施 Fs = <b>${fmt(FS(r.base), 3)}</b>，補強後${FS(r) >= FS(r.base) ? '提高' : '降低'} <b>${fmt(Math.abs(FS(r) / FS(r.base) - 1) * 100, 1)}%</b></span>`, `<span class="base-line">Without reinforcement Fs = <b>${fmt(FS(r.base), 3)}</b>; reinforcement ${FS(r) >= FS(r.base) ? 'raises' : 'lowers'} it by <b>${fmt(Math.abs(FS(r) / FS(r.base) - 1) * 100, 1)}%</b></span>`, `<span class="base-line">補強なし Fs = <b>${fmt(FS(r.base), 3)}</b>、補強により <b>${fmt(Math.abs(FS(r) / FS(r.base) - 1) * 100, 1)}%</b> ${FS(r) >= FS(r.base) ? '上昇' : '低下'}</span>`) : `<span class="base-line">${L('無補強措施情況：', 'Without reinforcement: ', '補強なしの場合：')}${esc(tx(r.base.msg) || L('無法計算', 'cannot compute', '計算できません'))}</span>`) : ''}
          ${chip}
        </div>
        <dl class="stats">
          <div><dt>${L('滑動體面積', 'Sliding mass area', 'すべり土塊の面積')}</dt><dd>${fmt(r.area, 1)} m²</dd></div>
          <div><dt>${L('最大鉛直深度', 'Max vertical depth', '最大鉛直深さ')}</dt><dd>${fmt(r.dmaxV, 2)} m</dd></div>
          <div><dt>${L('坡趾出口 (x, z)', 'Toe exit (x, z)', '末端の出口 (x, z)')}</dt><dd>${fmt(toe[0], 2)}, ${fmt(toe[1], 2)}</dd></div>
          ${r.mode === 'trial' && trialCircleNow() ? `<div><dt>${L('圓弧 圓心／半徑', 'Circle centre / radius', '円弧 中心／半径')}</dt><dd>(${fmt(trialCircleNow().xc, 2)}, ${fmt(trialCircleNow().zc, 2)}) / ${fmt(trialCircleNow().R, 2)} m</dd></div>` : ''}
          <div><dt>${L('坡頂入口 (x, z)', 'Crest entry (x, z)', '頭部の入口 (x, z)')}</dt><dd>${fmt(head[0], 2)}, ${fmt(head[1], 2)}</dd></div>
          <div><dt>${L('ΣR 抵抗力', 'ΣR resisting', 'ΣR 抵抗力')}</dt><dd>${fmt(toG(r.sumA), gTF() ? 2 : 1)} ${uF()}</dd></div>
          <div><dt>${L('ΣD 滑動力', 'ΣD driving', 'ΣD 滑動力')}</dt><dd>${fmt(toG(r.sumB), gTF() ? 2 : 1)} ${uF()}</dd></div>
          ${r.nLoads ? `<div><dt>${L('滑動體上的載重 ΣQ', 'Load on sliding mass ΣQ', 'すべり土塊上の荷重 ΣQ')}</dt><dd>${fmt(toG(r.Qtot), gTF() ? 2 : 1)} ${uF()}</dd></div>` : ''}
          ${r.crack ? `<div><dt>${L('張力裂縫 x／深度', 'Tension crack x / depth', '引張亀裂 x／深さ')}</dt><dd>${fmt(r.crack.x, 2)} / ${fmt(r.crack.d, 2)} m</dd></div><div><dt>${L('裂縫水壓 Pw', 'Crack water force Pw', '亀裂水圧 Pw')}</dt><dd>${r.crack.water ? `${fmt(toG(r.crack.Pw), gTF() ? 2 : 1)} ${uF()}` : L('乾裂縫', 'dry crack', '乾燥亀裂')}</dd></div>` : s.tcOn ? `<div><dt>${L('張力裂縫', 'Tension crack', '引張亀裂')}</dt><dd>${L('無（不設裂縫的 Fs 較小）', 'none (lower Fs without a crack)', 'なし（亀裂なしの方が Fs が小さい）')}</dd></div>` : ''}
          ${r.pond ? `<div><dt>${L('坡外積水水平推力', 'Ponded water thrust', '斜面外の湛水の水平力')}</dt><dd>${fmt(toG(r.pond), gTF() ? 2 : 1)} ${uF()}</dd></div>` : ''}
          <div><dt>d / L</dt><dd>${fmt(r.dL, 3)}${r.f0type === 'janbu' ? L(`（b1 = ${fmt(r.b1, 2)}）`, ` (b1 = ${fmt(r.b1, 2)})`, `（b1 = ${fmt(r.b1, 2)}）`) : ''}</dd></div>
          <div><dt>${L('迭代・耗時', 'Iterations · time', '反復・計算時間')}</dt><dd>${r.mode === 'trial' ? L('單一滑動面', 'single surface', '単一すべり面') : r.hist.length + L(' 輪', ' rounds', ' 回')}・${fmt(r.ms / 1000, 2)} s</dd></div>
        </dl>
      </div>
      ${ctrlResultHTML(r)}
      ${r.members && r.members.length ? `<details open>
        <summary>${L(`補強構件（${r.members.filter(m => m.crossed && m.Tm > 0).length} / ${r.members.length} 支發揮作用・${r.reinfMode === 'passive' ? '被動法' : '主動法'}）`, `Members (${r.members.filter(m => m.crossed && m.Tm > 0).length} of ${r.members.length} effective · ${r.reinfMode === 'passive' ? 'passive' : 'active'} method)`, `補強材（${r.members.length} 本中 ${r.members.filter(m => m.crossed && m.Tm > 0).length} 本が有効・${r.reinfMode === 'passive' ? '受働法' : '主働法'}）`)}</summary>
        <div class="tblwrap"><table>
          <thead><tr><th>${L('編號', 'No.', '番号')}</th><th class="t">${L('類型', 'Type', '種類')}</th><th>${L('交點 x', 'Cross x', '交点 x')}</th><th>${L('交點 z', 'Cross z', '交点 z')}</th><th>${L('有效長 Le (m)', 'Effective Le (m)', '有効長 Le (m)')}</th><th>${L('可用力（每支）', 'Available force (each)', '使用可能な力（1 本）')} (${uT()})</th><th>${L('每公尺 T', 'T per metre', '1 m 当たり T')} (${uF()})</th><th class="t">${L('控制', 'Governed by', '支配条件')}</th><th>Px (${uF()})</th><th>Py (${uF()})</th></tr></thead>
          <tbody>${r.members.map(m => `<tr><td>${m.idx + 1}</td><td class="t">${typeName(m.type)}</td><td>${m.crossed ? fmt(m.xi, 2) : '—'}</td><td>${m.crossed ? fmt(m.zi, 2) : '—'}</td><td>${m.crossed ? fmt(m.Le, 2) : '—'}</td><td>${fmt(toG(m.T), 1)}</td><td>${fmt(toG(m.Tm), 2)}</td><td class="t">${esc(tx(m.ctrl))}</td><td>${fmt(toG(m.Px), 2)}</td><td>${fmt(toG(m.Py), 2)}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>` : ''}
      <details>
        <summary>${L(`切片明細（${r.rows.length} 片）`, `Slice details (${r.rows.length} slices)`, `スライス明細（${r.rows.length} 個）`)}</summary>
        <div class="row" style="margin-top:8px"><button class="btn small" id="btnCopyRows" type="button">${L('複製切片表 (CSV)', 'Copy slice table (CSV)', 'スライス表をコピー (CSV)')}</button><button class="btn small" id="btnCopySlip" type="button">${L('複製滑動面座標', 'Copy slip surface coordinates', 'すべり面座標をコピー')}</button></div>
        <div class="tblwrap"><table>
          <thead><tr><th>${L('x 中點', 'x mid', 'x 中点')}</th><th>${L('寬 b', 'Width b', '幅 b')}</th><th>${L('底部 z', 'Base z', '底面 z')}</th><th>α (°)</th><th>W (${uF()})</th><th>hw (m)</th><th>u (${uC()})</th><th>c' (${uC()})</th><th>φ' (°)</th><th class="t">${L('土層', 'Layer', '地層')}</th><th>mα</th>${r.nLoads ? `<th>Q (${uF()})</th>` : ''}<th>R (${uF()})</th><th>D (${uF()})</th>${r.members && r.members.length ? `<th>Px</th><th>Py</th>` : ''}${hasEX ? `<th>E (${uF()})</th><th>X (${uF()})</th>` : ''}</tr></thead>
          <tbody>${r.rows.map(x => `<tr><td>${fmt(x.xc, 2)}</td><td>${fmt(x.b, 2)}</td><td>${fmt(x.zc, 2)}</td><td>${fmt(x.alpha, 1)}</td><td>${fmt(toG(x.W), gTF() ? 2 : 1)}</td><td>${fmt(x.hw, 2)}</td><td>${fmt(toC(x.u), cTF() ? 2 : 1)}</td><td>${fmt(toC(x.c), cTF() ? 2 : 1)}</td><td>${fmt(x.phi, 1)}</td><td class="t">${esc(x.layer)}</td><td>${fmt(x.ma, 3)}</td>${r.nLoads ? `<td>${x.Q ? fmt(toG(x.Q), 2) : ''}</td>` : ''}<td>${fmt(toG(x.res), gTF() ? 2 : 1)}</td><td>${fmt(toG(x.drv), gTF() ? 2 : 1)}</td>${r.members && r.members.length ? `<td>${x.Px ? fmt(toG(x.Px), 2) : ''}</td><td>${x.Py ? fmt(toG(x.Py), 2) : ''}</td>` : ''}${hasEX ? `<td>${fmt(toG(x.E), gTF() ? 2 : 1)}</td><td>${fmt(toG(x.X), gTF() ? 2 : 1)}</td>` : ''}</tr>`).join('')}</tbody>
        </table></div>
      </details>
      <details${r.mode === 'trial' ? ' hidden' : ''}>
        <summary>${L('迭代紀錄', 'Iteration log', '反復記録')}</summary>
        <div class="tblwrap"><table>
          <thead><tr><th>${L('輪次', 'Round', '回')}</th><th>${L('搜尋用 F (λ)', 'Search F (λ)', '探索用 F (λ)')}</th><th>${L('該輪滑動面 Fs', 'Fs of this surface', 'その回のすべり面 Fs')}</th><th>${L('G 最小值', 'Minimum G', 'G の最小値')}</th></tr></thead>
          <tbody>${r.hist.map(h => `<tr><td>${h.it}</td><td>${fmt(h.lam, 4)}</td><td>${fmt(h.F, 4)}</td><td>${fmt(h.G, 1)}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>`;
    $('#btnCopyRows').onclick = ev => {
      const fu = gTF() ? 'tf_m' : 'kN_m', su = cTF() ? 'tf_m2' : 'kPa';
      const head = `x,b,z_base,alpha_deg,W_${fu},hw_m,u_${su},c_${su},phi_deg,layer,m_alpha,R_${fu},D_${fu},Px_${fu},Py_${fu},Q_${fu}` + (hasEX ? `,E_${fu},X_${fu}` : '');
      copyText([head, ...r.rows.map(x => [x.xc, x.b, x.zc, x.alpha, toG(x.W), x.hw, toC(x.u), toC(x.c), x.phi, x.layer, x.ma, toG(x.res), toG(x.drv), toG(x.Px || 0), toG(x.Py || 0), toG(x.Q || 0), ...(hasEX ? [toG(x.E), toG(x.X)] : [])].map(v => typeof v === 'number' ? r3(v) : v).join(','))].join('\n'), ev.currentTarget);
    };
    $('#btnCopySlip').onclick = ev => copyText(['x,z', ...r.slip.map(p => `${r3(p[0])},${r3(p[1])}`)].join('\n'), ev.currentTarget);
  }

  function renderCounter() {
    const el = $('#visitCount'); if (!el || !counts) return;
    const n = x => Number(x).toLocaleString(L('zh-TW', 'en-US', 'ja-JP'));
    const parts = [];
    if (counts.u != null) parts.push(L(`已有 <b>${n(counts.u)}</b> 位使用者`, `<b>${n(counts.u)}</b> users`, `利用者 <b>${n(counts.u)}</b> 人`));
    if (counts.v != null) parts.push(L(`累計開啟 <b>${n(counts.v)}</b> 次`, `<b>${n(counts.v)}</b> visits`, `累計 <b>${n(counts.v)}</b> 回`));
    if (!parts.length) return;
    el.innerHTML = parts.join('<span class="sep">｜</span>');
    el.hidden = false;
  }

  function renderCtrl() {
    const box = $('#ctrlList'); if (!box) return;
    const C = model.ctrl;
    $('#ctrlOn').checked = !!C.on;
    $('#ctrlSec').classList.toggle('off', !C.on);
    const nf = (f, lab, v, step) => `<div class="field"><label>${lab}</label><input type="number" step="${step}" value="${v === null || v === undefined ? '' : dispN(v)}" data-cf="${f}"></div>`;
    box.innerHTML = (C.pts.length ? C.pts.map((p, i) => {
      const z = ctrlZ(p);
      return `<div class="rcard${p.on ? '' : ' off'}" data-cp="${i}">
        <div class="rcard-head">
          <span class="no">C${i + 1}</span>
          <input type="text" value="${esc(p.name)}" data-cf="name" aria-label="${L('名稱（孔號）', 'Name (borehole)', '名称（孔番）')}" style="flex:1;min-width:70px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;background:var(--canvas);font-size:13px">
          <label class="check" style="font-size:12px;align-items:center;margin:0"><input type="checkbox" data-cf="on"${p.on ? ' checked' : ''} style="margin:0"><span>${L('啟用', 'On', '有効')}</span></label>
          <button class="btn small ghost" data-cact="del" type="button">${L('刪除', 'Delete', '削除')}</button>
        </div>
        <div class="grid3">
          ${nf('x', L('位置 x (m)', 'Position x (m)', '位置 x (m)'), p.x, 0.5)}
          ${nf('depth', L('地表下深度 (m)', 'Depth below ground (m)', '地表からの深さ (m)'), p.depth, 0.1)}
          ${nf('tol', L('容許 ±Δz (m)', 'Tolerance ±Δz (m)', '許容 ±Δz (m)'), p.tol, 0.1)}
        </div>
        <p class="hint" style="margin:2px 0 0">${isFinite(z) ? L(`控制點高程 z = ${fmt(z, 2)} m（地表 ${fmt(interp(model.ground, p.x), 2)} m）`, `Control elevation z = ${fmt(z, 2)} m (ground ${fmt(interp(model.ground, p.x), 2)} m)`, `制御点の標高 z = ${fmt(z, 2)} m（地表 ${fmt(interp(model.ground, p.x), 2)} m）`) : L('請輸入位置與深度', 'Enter position and depth', '位置と深さを入力してください')}</p>
      </div>`;
    }).join('') : `<p class="hint">${L('尚未加入控制點。', 'No control points yet.', '制御点はまだありません。')}</p>`) +
    ['toe', 'crest'].map(k => {
      const r = C[k];
      return `<div class="rcard${r.on ? '' : ' off'}" data-cr="${k}">
        <div class="rcard-head"><label class="check" style="font-size:13px;align-items:center;margin:0"><input type="checkbox" data-crf="on"${r.on ? ' checked' : ''} style="margin:0"><span>${k === 'toe' ? L('限制坡趾出口範圍', 'Limit the toe exit', '末端の出口範囲を制限') : L('限制坡頂入口（崩崖）範圍', 'Limit the crest entry (head scarp)', '頭部の入口（滑落崖）範囲を制限')}</span></label></div>
        <div class="grid2">
          <div class="field"><label>${L('起點 x (m)', 'From x (m)', '始点 x (m)')}</label><input type="number" step="0.5" value="${r.x1 === null ? '' : dispN(r.x1)}" data-crf="x1"></div>
          <div class="field"><label>${L('終點 x (m)', 'To x (m)', '終点 x (m)')}</label><input type="number" step="0.5" value="${r.x2 === null ? '' : dispN(r.x2)}" data-crf="x2"></div>
        </div>
      </div>`;
    }).join('');
  }
  function ctrlResultHTML(r) {
    if (!r || !r.ok || !r.ctrl) return '';
    const c = r.ctrl, yes = ok => `<span class="chip ${ok ? 'ok' : 'crit'}">${ok ? L('通過', 'passes', '通過') : L('未通過', 'misses', '未通過')}</span>`;
    return `<details open><summary>${L('控制點檢核', 'Control point check', '制御点の照査')}</summary><div class="tblwrap"><table>
      <thead><tr><th class="t">${L('控制點', 'Point', '制御点')}</th><th>x</th><th>${L('控制 z', 'Control z', '制御 z')}</th><th>±Δz</th><th>${L('滑動面 z', 'Surface z', 'すべり面 z')}</th><th>${L('差', 'Diff.', '差')}</th><th class="t"></th></tr></thead>
      <tbody>${c.pts.map(p => `<tr><td class="t">${esc(p.name)}</td><td>${fmt(p.x, 2)}</td><td>${fmt(p.z, 2)}</td><td>${fmt(p.tol, 2)}</td><td>${fmt(p.zs, 2)}</td><td>${fmt(p.dz, 2)}</td><td class="t">${yes(p.ok)}</td></tr>`).join('')}
      ${['toe', 'crest'].filter(k => c[k]).map(k => `<tr><td class="t">${k === 'toe' ? L('坡趾出口', 'Toe exit', '末端出口') : L('坡頂入口', 'Crest entry', '頭部入口')}</td><td>${fmt(c[k].x, 2)}</td><td colspan="4">${L('範圍', 'range', '範囲')} ${fmt(c[k].r[0], 2)} – ${fmt(c[k].r[1], 2)}</td><td class="t">${yes(c[k].ok)}</td></tr>`).join('')}
      </tbody></table></div></details>`;
  }

  function renderScenList() {
    const box = $('#scenList'); if (!box) return;
    const S = model.scenarios;
    if (!S.length) { box.innerHTML = `<p class="hint">${L('尚未建立情境。', 'No cases yet.', 'ケースはまだありません。')}</p>`; return; }
    const nf = (f, lab, v, step, extra) => `<div class="field"><label>${lab}</label><input type="number" step="${step}" value="${v === null ? '' : dispN(v)}" data-scf="${f}" placeholder="${L('必填', 'required', '必須')}"${extra || ''}></div>`;
    box.innerHTML = `<div class="row scen-preset"><select id="scenPreset" aria-label="${L('規範建議值', 'Code values', '基準の推奨値')}">${Object.keys(FS_PRESETS).map(k => `<option value="${k}">${FS_PRESETS[k].name()}（${FS_PRESETS[k].v.normal.toFixed(1)}／${FS_PRESETS[k].v.rain.toFixed(1)}／${FS_PRESETS[k].v.eq.toFixed(1)}）</option>`).join('')}</select><button class="btn small" id="btnPreset" type="button">${L('套用要求值', 'Apply required values', '所要値を適用')}</button></div>` + S.map((s, i) => `<div class="rcard${s.on ? '' : ' off'}" data-sc="${i}">
        <div class="rcard-head">
          <span class="no">S${i + 1}</span>
          <input type="text" value="${esc(s.name)}" data-scf="name" aria-label="${L('情境名稱', 'Case name', 'ケース名')}" style="flex:1;min-width:80px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;background:var(--canvas);font-size:13px">
          <button class="btn small ghost" data-scact="dup" type="button">${L('複製', 'Duplicate', '複製')}</button>
          <button class="btn small ghost" data-scact="del" type="button">${L('刪除', 'Delete', '削除')}</button>
        </div>
        <div class="grid2">
          <div class="field"><label>${L('情境類型', 'Case type', 'ケースの種類')}</label><select data-scf="kind">${['normal', 'rain', 'eq', 'custom'].map(k => `<option value="${k}"${s.kind === k ? ' selected' : ''}>${kindName(k)}</option>`).join('')}</select></div>
          <div></div>
          <div class="field"><label>${L('地下水位', 'Water table', '地下水位')}</label><select data-scf="water">${['base', 'raise', 'ground', 'none'].map(w => `<option value="${w}"${s.water === w ? ' selected' : ''}>${waterName(w)}</option>`).join('')}</select></div>
          ${s.water === 'raise' ? nf('dh', L('水位上升 Δh (m)', 'Rise Δh (m)', '水位上昇 Δh (m)'), s.dh, 0.1) : '<div></div>'}
          ${nf('kh', L('水平震度 kh', 'Horizontal kh', '水平震度 kh'), s.kh, 0.01)}
          ${nf('kv', L('垂直震度 kv', 'Vertical kv', '鉛直震度 kv'), s.kv, 0.01)}
          ${nf('Freq', L('要求安全係數', 'Required Fs', '所要安全率'), s.Freq, 0.05)}
        </div>
        <div class="row">
          <label class="check" style="font-size:12px;align-items:center"><input type="checkbox" data-scf="loads"${s.loads ? ' checked' : ''} style="margin:0"><span>${L('計入載重', 'Include loads', '荷重を考慮')}</span></label>
          <label class="check" style="font-size:12px;align-items:center"><input type="checkbox" data-scf="reinf"${s.reinf ? ' checked' : ''} style="margin:0"><span>${L('計入補強與擋土牆', 'Include reinforcement and walls', '補強・擁壁を考慮')}</span></label>
          ${model.settings.tcOn ? `<label class="check" style="font-size:12px;align-items:center"><input type="checkbox" data-scf="tcWet"${s.tcWet ? ' checked' : ''} style="margin:0"><span>${L('張力裂縫充水', 'Water-filled crack', '引張亀裂に水')}</span></label>` : ''}
          <label class="check" style="font-size:12px;align-items:center"><input type="checkbox" data-scf="on"${s.on ? ' checked' : ''} style="margin:0"><span>${L('啟用', 'On', '有効')}</span></label>
        </div>
        ${s.kind === 'normal' && (s.kh || s.kv) ? `<p class="hint warnline">${L('常時情境一般不計地震力，kh、kv 應為 0；目前的設定等同地震情境。', 'A normal case usually has no seismic load; kh and kv should be 0. The current values make it a seismic case.', '常時ケースは通常地震力を考慮しません。kh、kv は 0 とします。現在の値では地震時ケースと同じになります。')}</p>` : ''}
      </div>`).join('');
    const notes = [];
    if (model.layers.some(Ly => !Ly.bedrock && Ly.pore && Ly.pore.type === 'ru')) notes.push(L('以 ru 計算水壓的土層不隨情境的地下水位改變；選「無地下水」時各層一律不計水壓。', 'Layers with ru keep their pore pressure in every case; with “Dry” no layer has pore pressure.', 'ru で間隙水圧を計算する地層はケースの地下水位に影響されません。「地下水なし」ではすべての地層で水圧を考慮しません。'));
    if (usedPiezo(model)) notes.push(L('水壓線隨情境一起調整：「水位上升」同樣上升 Δh，「水位達地表」升到地表，原本高於地表的部分（受壓水頭）維持不變。', 'Piezometric lines follow the case: raised by Δh, or up to the ground for “at ground”; parts above the ground (artesian heads) stay as they are.', '水頭線もケースに合わせて調整されます。「水位上昇」では同じく Δh 上昇し、「地表面」では地表まで上げ、もともと地表より高い部分（被圧水頭）はそのままです。'));
    if (notes.length) box.insertAdjacentHTML('beforeend', notes.map(t => `<p class="hint">${t}</p>`).join(''));
  }
  function renderScen() {
    const box = $('#scenOut'); if (!box) return;
    if (!scen) { box.innerHTML = ''; return; }
    const rows = scenTableRows(scen.items);
    const mLab = scen.method === 'janbu' ? (scen.useF0 ? L('簡易 Janbu（f0·Fs）', 'simplified Janbu (f0·Fs)', '簡易 Janbu（f0·Fs）') : L('簡易 Janbu（未修正）', 'simplified Janbu (uncorrected)', '簡易 Janbu（補正なし）')) : methName(scen.method);
    box.innerHTML = `${scen.stale ? `<p class="chip stale">${L('模型或情境已變更，請重新計算', 'The model or cases changed; please recompute', 'モデルまたはケースが変更されました。再計算してください')}</p>` : ''}
      <h3 style="margin-top:12px">${L('檢核總表', 'Summary', '照査結果一覧')}</h3>
      <p class="hint">${L(`計算方法：${mLab}，每個情境各自搜尋臨界滑動面，並以各自的水位、kh、kv${model.settings.tcOn ? '、裂縫是否充水' : ' '}取代「設定」頁的值；主畫面的計算則使用「設定」頁的條件（目前 kh = ${fmt(model.settings.kh, 2)}、kv = ${fmt(model.settings.kv, 2)}、剖面水位）。耗時 ${fmt(scen.ms / 1000, 1)} 秒。`, `Method: ${mLab}. Each case searches its own critical surface and replaces the water table, kh${model.settings.tcOn ? ', kv and crack water' : ' and kv'} of the Settings tab with its own values; the main view uses the Settings tab (now kh = ${fmt(model.settings.kh, 2)}, kv = ${fmt(model.settings.kv, 2)}, profile water table). ${fmt(scen.ms / 1000, 1)} s.`, `計算方法：${mLab}。各ケースは臨界すべり面を個別に探索し、「設定」タブの水位、kh、kv${model.settings.tcOn ? '、亀裂の水' : ''} を各ケースの値に置き換えます。メイン画面は「設定」タブの条件（現在 kh = ${fmt(model.settings.kh, 2)}、kv = ${fmt(model.settings.kv, 2)}、断面の水位）で計算しています。計算時間 ${fmt(scen.ms / 1000, 1)} 秒。`)}</p>
      <div class="tblwrap" style="max-height:none"><table class="scen-tbl">
        <thead><tr><th class="t">${L('情境', 'Case', 'ケース')}</th><th class="t">${L('水位', 'Water', '水位')}</th><th>kh</th><th>Fs</th><th>${L('要求值', 'Req.', '所要値')}</th><th class="t">${L('判定', 'Result', '判定')}</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td class="t">${esc(r.name)}${r.msg ? `<br><small class="warnline">${esc(r.msg)}</small>` : ''}</td><td class="t">${waterShort(r.it.sc)}</td><td>${r.kh === null ? '—' : fmt(r.kh, 2)}</td><td>${fmt(r.F, 3)}</td><td>${r.Freq === null ? '—' : fmt(r.Freq, 2)}</td><td class="t"><span class="chip ${r.v.cls}">${r.v.txt}</span></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="row" style="margin-top:6px"><button class="btn small" id="btnScenCsv" type="button">${L('複製總表 (CSV)', 'Copy summary (CSV)', '一覧をコピー (CSV)')}</button></div>
      <details open><summary>${L('各情境的臨界滑動面', 'Critical surface of each case', '各ケースの臨界すべり面')}</summary>
        ${scen.items.filter(it => it.r && it.r.ok).map(it => `<figure class="scen-fig"><div>${reportSVG(it.m, it.r, { W: 640, H: 300, label: `Fs = ${fmt(it.Fj, 3)}` })}</div><figcaption>${esc(it.sc.name)}${L('：', ': ', '：')}Fs = ${fmt(it.Fj, 3)}${it.sc.Freq !== null ? L(`，要求值 ${fmt(it.sc.Freq, 2)}`, `, required ${fmt(it.sc.Freq, 2)}`, `、所要値 ${fmt(it.sc.Freq, 2)}`) : ''}</figcaption></figure>`).join('')}
      </details>`;
    $('#btnScenCsv').onclick = ev => copyText([L('情境,地下水位,kh,kv,Fs,要求值,判定', 'case,water table,kh,kv,Fs,required,result', 'ケース,地下水位,kh,kv,Fs,所要値,判定'),
      ...rows.map(r => [r.name, r.water, r.kh ?? '', r.kv ?? '', r.F === null ? '' : r3(r.F), r.Freq ?? '', r.v.txt].map(x => `"${String(x).replace(/"/g, '""')}"`).join(','))].join('\n'), ev.currentTarget);
  }

  function renderRepInfo() { const R = model.report || {}; ['title', 'project', 'author', 'note'].forEach(k => { const el = $('#rep-' + k); if (el) el.value = R[k] || ''; }); }

  const vFmt = v => !isFinite(v) ? '—' : Math.abs(v) >= 1000 ? v.toFixed(1) : Math.abs(v) >= 10 ? v.toFixed(3) : v.toFixed(5);
  const vPct = d => !isFinite(d) ? '—' : Math.abs(d) < 1e-6 ? (Math.abs(d) < 1e-12 ? '0' : d.toExponential(1)) : (d * 100).toFixed(2) + '%';
  const vTol = t => t.lo === -t.hi ? (t.hi < 1e-4 ? `±${t.hi.toExponential(0)}` : `±${+(t.hi * 100).toFixed(3)}%`) : `${+(t.lo * 100).toFixed(1)}% ~ +${+(t.hi * 100).toFixed(1)}%`;
  function renderVerify() {
    const box = $('#verOut'); if (!box || !ver || ver.running) return;
    const n = ver.rows.length, np = ver.rows.filter(r => r.pass).length;
    let h = `<p><span class="chip ${np === n ? 'ok' : 'crit'}">${L(`${np} / ${n} 項通過`, `${np} of ${n} checks passed`, `${n} 項目中 ${np} 項目合格`)}</span> <span class="hint">${L(`SSA v${SSA_VERSION}（${SSA_DATE}）・${fmt(ver.ms / 1000, 1)} 秒`, `SSA v${SSA_VERSION} (${SSA_DATE}) · ${fmt(ver.ms / 1000, 1)} s`, `SSA v${SSA_VERSION}（${SSA_DATE}）・${fmt(ver.ms / 1000, 1)} 秒`)}</span></p>`;
    const groups = [...new Set(ver.rows.map(r => r.grp))];
    h += `<div class="tblwrap"><table class="ver-tbl"><tbody>${groups.map(g => { const rs = ver.rows.filter(r => r.grp === g), k = rs.filter(r => r.pass).length; return `<tr><td class="t">${esc(g)}</td><td>${k} / ${rs.length}</td><td class="t">${k === rs.length ? '<span class="chip ok">OK</span>' : '<span class="chip crit">NG</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
    const bad = ver.rows.filter(r => !r.pass);
    if (bad.length) h += `<p class="hint warnline">${L('未通過：', 'Failed: ', '不合格：')}${bad.map(r => esc(`${r.name} ${r.item}（${vFmt(r.val)} / ${vFmt(r.ref)}）`)).join('；')}</p>`;
    let grp = null;
    h += `<details><summary>${L('明細', 'Details', '明細')}</summary><div class="tblwrap" style="max-height:460px"><table class="ver-tbl"><thead><tr><th class="t">${L('考題', 'Problem', '問題')}</th><th class="t">${L('項目', 'Item', '項目')}</th><th>${L('參考值', 'Reference', '参考値')}</th><th>${L('本工具', 'This tool', '本ツール')}</th><th>${L('差異', 'Diff.', '差')}</th><th class="t"></th></tr></thead><tbody>`;
    for (const r of ver.rows) {
      if (r.grp !== grp) { grp = r.grp; h += `<tr class="grp"><td class="t" colspan="6"><b>${esc(grp)}</b></td></tr>`; }
      h += `<tr><td class="t">${esc(r.name)}</td><td class="t">${esc(r.item)}</td><td>${vFmt(r.ref)}</td><td>${vFmt(r.val)}</td><td>${vPct(r.d)}</td><td class="t">${r.pass ? 'OK' : '<b class="warnline">NG</b>'}</td></tr>`;
    }
    h += `</tbody></table></div></details>`;
    box.innerHTML = h;
  }
  function renderVersion() {
    const t = $('#verTag'); if (t) { t.textContent = 'v' + SSA_VERSION; t.title = SSA_DATE; }
    const f = $('#verLine'); if (f) f.textContent = L(`SSA v${SSA_VERSION}（${SSA_DATE}）`, `SSA v${SSA_VERSION} (${SSA_DATE})`, `SSA v${SSA_VERSION}（${SSA_DATE}）`);
    const g = $('#verLog'); if (g) g.innerHTML = `<dl class="ver-log">${VERSIONS.map(v => `<div><dt>v${v[0]}<small>${v[1]}</small></dt><dd>${esc(L(v[2], v[3], v[4]))}</dd></div>`).join('')}</dl>`;
  }

window.AppView = {
  renderLines, renderCoords, renderLayers, renderSettings, syncTc,
  renderReinf, renderLoads, renderWallCode, renderWallChecks, renderWalls,
  renderGuide, status, setBusy, renderPileDesign, renderBack, renderResults,
  renderCounter, renderCtrl, ctrlResultHTML, renderScenList, renderScen,
  renderRepInfo, renderVerify, renderVersion
};
