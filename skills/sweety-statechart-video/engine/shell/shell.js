/* 格物 · shell.js — the player around the film page, shared by `scv.py preview` (served) and the HTML export (inlined).
 * Play / pause, prev / next step, a scrubber with chapter marks, speed, the step list, audio kept in sync, and a
 * step-through mode: one step at a time, the film glides to it, the active cards are spotlit (everything else dimmed)
 * and an optional microscope shows the active card up close.
 * window.SHELL = {audio: url | data URI | null, live: {version: url} | null}. Keys: space, ← →, S (steps), M (microscope).
 * Spotlight: if the engine sets K.Player.features.spotlight, the shell sets player.opts.spotlight = [state ids] and
 * draws nothing itself; otherwise it dims the frame with an overlay drawn from layoutReport() card boxes. */
(function () {
  const CFG = window.SHELL || {};
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const ease = u => .5 - Math.cos(Math.PI * Math.min(1, Math.max(0, u))) / 2;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  const ready = () => new Promise(res => { const tick = () => (window.ENGINE_READY || window.ENGINE_ERROR ? res() : setTimeout(tick, 30)); tick(); });
  ready().then(() => { if (window.ENGINE_ERROR) layout(null, window.ENGINE_ERROR); else mount(); })
    .catch(e => layout(null, (e && e.stack) || String(e)));

  /* ---------- page structure (also used to show an engine error while previewing) ---------- */
  function layout(P, error) {
    const cv = document.getElementById('cv');
    const shell = el('div', 'scv-shell'), stage = el('div', 'scv-stage'), frame = el('div', 'scv-frame'), list = el('aside', 'scv-list');
    cv.parentNode.insertBefore(shell, cv);
    frame.appendChild(cv); stage.appendChild(frame); shell.append(stage, list);
    const badge = el('div', 'scv-badge'); document.body.appendChild(badge);
    if (error) { const pre = el('pre', 'scv-error', 'engine error\n\n' + error); frame.appendChild(pre); frame.style.minHeight = '60vh'; frame.style.minWidth = '60vw'; }
    if (CFG.live) live(badge);
    return { shell, stage, frame, list, badge };
  }

  function live(badge) {                         // preview: reload when the job changes, keeping the time
    let seen = null;
    const poll = () => fetch(CFG.live.version, { cache: 'no-store' }).then(r => r.text()).then(v => {
      if (seen !== null && v !== seen) {
        badge.textContent = '重新载入…'; badge.classList.add('on');
        try { sessionStorage.setItem('scv-t', String(window.__shellTime || 0)); } catch (e) { /* private mode */ }
        location.reload();
        return;
      }
      seen = v; setTimeout(poll, 600);
    }).catch(() => setTimeout(poll, 1500));
    poll();
  }

  function mount() {
    const P = window.__player, film = window.__film, K = window.SCV, cv = document.getElementById('cv');
    const ui = layout(P, null), steps = P.steps, total = P.total, speed = film.speed || 2;
    const report = window.layoutReport ? window.layoutReport() : null;
    const nativeSpot = !!(K.Player && K.Player.features && K.Player.features.spotlight);
    let t = 0, playing = false, rate = 1, last = performance.now(), dirty = true, stepMode = false, scopeOn = false, glide = null, cur = -2;

    /* controls */
    const bar = el('div', 'scv-bar'), btn = (label, title, fn) => { const b = el('button', null, label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.onclick = fn; bar.appendChild(b); return b; };
    const playB = btn('▶', '播放 / 暂停（空格）', () => (playing ? pause() : play()));
    btn('⏮', '上一步（←）', () => go(-1));
    btn('⏭', '下一步（→）', () => go(1));
    const time = el('span', 'scv-time', '0:00 / ' + clock(total)); bar.appendChild(time);
    const track = el('div', 'scv-track'), fill = el('div', 'scv-fill'), knob = el('div', 'scv-knob');
    track.tabIndex = 0; track.setAttribute('role', 'slider'); track.setAttribute('aria-label', '进度'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(Math.round(total)));
    steps.forEach((s, i) => { const k = el('i', 'scv-tick' + (s.si === 0 ? ' ch' : '')); k.style.left = (100 * s.t0 / total) + '%'; k.title = tagOf(i); track.appendChild(k); });
    track.append(fill, knob); bar.appendChild(track);
    const rateS = el('select'); rateS.setAttribute('aria-label', '速度');
    [.5, .75, 1, 1.25, 1.5, 2].forEach(r => { const o = el('option', null, r + '×'); o.value = r; if (r === 1) o.selected = true; rateS.appendChild(o); });
    rateS.onchange = () => { rate = +rateS.value; if (audio) audio.playbackRate = rate; };
    bar.appendChild(rateS);
    const stepB = btn('逐步看', '逐步看：一步一步，亮出当前状态（S）', () => setStepMode(!stepMode));
    const scopeB = btn('放大镜', '放大当前卡片（M）', () => { scopeOn = !scopeOn; scopeB.setAttribute('aria-pressed', scopeOn); scope.hidden = !scopeOn; dirty = true; });
    scopeB.setAttribute('aria-pressed', 'false');
    ui.stage.appendChild(bar);

    /* step-through panel, spotlight and microscope */
    const panel = el('div', 'scv-step'), pTag = el('span', 'tag'), pNote = el('span', 'note');
    const pPrev = el('button', null, '← 上一步'), pNext = el('button', null, '下一步 →'), pClose = el('button', null, '退出');
    [pPrev, pNext, pClose].forEach(b => { b.type = 'button'; });
    pPrev.onclick = () => go(-1); pNext.onclick = () => go(1); pClose.onclick = () => setStepMode(false);
    panel.append(pTag, pNote, pPrev, pNext, pClose); ui.stage.appendChild(panel);
    const spot = el('canvas', 'scv-spot'); spot.width = cv.width; spot.height = cv.height; spot.style.opacity = 0; ui.frame.appendChild(spot);
    const scope = el('canvas', 'scv-scope'); scope.width = 600; scope.height = 450; scope.hidden = true; ui.frame.appendChild(scope);

    /* the step list */
    const h1 = el('h1', null, film.title || ''); ui.list.appendChild(h1);
    if (film.series && film.series !== film.title) ui.list.appendChild(el('p', 'series', film.series));
    const items = [];
    let ol = null;
    steps.forEach((s, i) => {
      if (s.si === 0) {
        const ch = film.chapters[s.ci], h = el('h2'); h.append(el('span', 'num', ROMAN[s.ci] || String(s.ci + 1)), document.createTextNode(ch.title || ''));
        ui.list.appendChild(h); ol = el('ol'); ui.list.appendChild(ol);
      }
      const li = el('li'); li.tabIndex = 0;
      li.append(el('span', 'tag', tagOf(i)), el('span', null, s.s.note || '（无字幕）'), el('span', 't', clock(s.t0)));
      li.onclick = () => (stepMode ? goTo(i) : seek(s.t0 + .001));
      li.onkeydown = e => { if (e.key === 'Enter') li.onclick(); };
      ol.appendChild(li); items.push(li);
    });
    ui.list.appendChild(el('p', 'keys', '空格 播放/暂停 · ← → 上一步/下一步 · S 逐步看 · M 放大镜'));

    /* audio */
    let audio = null;
    if (CFG.audio) { audio = new Audio(CFG.audio); audio.preload = 'auto'; audio.onended = () => { if (t >= total - .05) pause(); }; }

    /* scrubbing */
    const atX = x => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(total, (x - r.left) / r.width * total)); };
    track.onpointerdown = e => { track.setPointerCapture(e.pointerId); seek(atX(e.clientX)); track.onpointermove = m => seek(atX(m.clientX)); };
    track.onpointerup = () => { track.onpointermove = null; };
    track.onkeydown = e => { if (e.key === 'ArrowLeft') seek(t - 2); if (e.key === 'ArrowRight') seek(t + 2); };
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
      if (e.key === ' ') { e.preventDefault(); playing ? pause() : play(); }
      else if (e.key === 'ArrowLeft' && e.target !== track) { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight' && e.target !== track) { e.preventDefault(); go(1); }
      else if (e.key === 's' || e.key === 'S') setStepMode(!stepMode);
      else if (e.key === 'm' || e.key === 'M') scopeB.click();
    });

    function tagOf(i) { const s = steps[i]; return `${ROMAN[s.ci] || s.ci + 1}.${s.si + 1}`; }
    function settle(i) { const s = steps[i]; return s.t0 + Math.min(s.dur - .05, Math.max(.9, 1.4 / speed + .35)); }
    function stepAt(T) { let k = -1; for (let i = 0; i < steps.length; i++) { if (T >= steps[i].t0) k = i; else break; } return k; }
    function seek(T) { glide = null; t = Math.max(0, Math.min(total, T)); if (audio) { try { audio.currentTime = t; } catch (e) { /* not loaded yet */ } } dirty = true; }
    function play() {
      if (stepMode) setStepMode(false);
      if (t >= total - .05) seek(0);
      playing = true; playB.textContent = '❚❚'; last = performance.now();
      if (audio) { audio.currentTime = t; audio.playbackRate = rate; audio.play().catch(() => { /* no audio: the clock runs on */ }); }
    }
    function pause() { playing = false; playB.textContent = '▶'; if (audio) audio.pause(); dirty = true; }
    function go(d) {
      const i = stepAt(t + .001);
      if (stepMode) return goTo(Math.max(0, Math.min(steps.length - 1, (i < 0 ? -1 : i) + d)));
      const j = d < 0 && i >= 0 && t - steps[i].t0 > 1.2 ? i : Math.max(0, Math.min(steps.length - 1, i + d));
      seek(steps[j].t0 + .001);
    }
    function goTo(i) {                          // step mode: the film glides from here to the step, settled
      const to = settle(i), from = t;
      if (still.matches || Math.abs(to - from) < .02) { seek(to); return; }
      glide = { from, to, t0: performance.now(), dur: Math.min(900, 380 + 90 * Math.abs(to - from)) };
      spot.style.opacity = 0;
    }
    function setStepMode(on) {
      stepMode = on; stepB.setAttribute('aria-pressed', on); panel.classList.toggle('on', on);
      if (on) { pause(); const i = stepAt(t + .001); goTo(Math.max(0, i)); glideWindow(ui.stage); }
      else { spot.style.opacity = 0; if (nativeSpot) { P.opts.spotlight = null; } dirty = true; }
    }

    /* scrolling that glides (not the browser's smooth scroll): the window to the stage, the list to the step */
    let wg = null;
    function glideWindow(target) {
      const r = target.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= innerHeight) return;
      const from = scrollY, to = Math.max(0, r.top + scrollY - 12), t0 = performance.now(), dur = 450;
      if (still.matches) { scrollTo({ top: to, behavior: 'instant' }); return; }
      const g = wg = {};
      const f = now => { if (wg !== g) return; const u = (now - t0) / dur; scrollTo({ top: from + (to - from) * ease(u), behavior: 'instant' }); if (u < 1) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    }
    function glideList(li) {
      const box = ui.list, r = li.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (box.scrollHeight <= box.clientHeight + 2) { glideWindow(li); return; }
      if (r.top >= b.top + 8 && r.bottom <= b.bottom - 8) return;
      const from = box.scrollTop, to = Math.max(0, from + r.top - b.top - box.clientHeight * .35), t0 = performance.now();
      if (still.matches) { box.scrollTop = to; return; }
      const f = now => { const u = (now - t0) / 400; box.scrollTop = from + (to - from) * ease(u); if (u < 1) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    }

    /* the active cards, in canvas pixels at film time T */
    function cards(i, T) {
      if (!report || i < 0) return [];
      const s = steps[i], ch = report.chapters[s.ci], ids = s.s.on || [];
      const k = P.k, top = (s.ci * P.PH - P.camAt(T)) * k;
      return ids.map(id => ch.boxes[id]).filter(Boolean).map(b => ({ x0: b.x0 * k, x1: b.x1 * k, y0: top + b.y0 * k, y1: top + b.y1 * k }));
    }
    function drawSpot(i, T) {
      const g = spot.getContext('2d'), W = spot.width, H = spot.height, bar = P.bar || 0, pad = 14 * P.ui;
      g.clearRect(0, 0, W, H);
      const rs = cards(i, T);
      if (!rs.length) { spot.style.opacity = 0; return; }
      if (nativeSpot) { P.opts.spotlight = steps[i].s.on; spot.style.opacity = 0; return; }
      g.fillStyle = 'rgba(43, 32, 20, .5)'; g.fillRect(0, 0, W, H - bar);
      g.globalCompositeOperation = 'destination-out';
      rs.forEach(r => { g.beginPath(); g.roundRect(r.x0 - pad, r.y0 - pad, r.x1 - r.x0 + 2 * pad, r.y1 - r.y0 + 2 * pad, 18 * P.ui); g.fill(); });
      g.globalCompositeOperation = 'source-over';
      g.lineWidth = 3 * P.ui; g.strokeStyle = 'rgba(214, 51, 108, .9)';
      rs.forEach(r => { g.beginPath(); g.roundRect(r.x0 - pad, r.y0 - pad, r.x1 - r.x0 + 2 * pad, r.y1 - r.y0 + 2 * pad, 18 * P.ui); g.stroke(); });
      spot.style.opacity = 1;
    }
    function drawScope(i, T) {
      const g = scope.getContext('2d'), rs = cards(i, T);
      g.fillStyle = '#f5f1e8'; g.fillRect(0, 0, scope.width, scope.height);
      if (!rs.length) return;
      const x0 = Math.min(...rs.map(r => r.x0)), x1 = Math.max(...rs.map(r => r.x1)), y0 = Math.min(...rs.map(r => r.y0)), y1 = Math.max(...rs.map(r => r.y1));
      let w = Math.max((x1 - x0) * 1.9, 330 * P.ui), h = w * 3 / 4;
      if (h < (y1 - y0) * 1.9) { h = (y1 - y0) * 1.9; w = h * 4 / 3; }
      const cx = Math.max(w / 2, Math.min(cv.width - w / 2, (x0 + x1) / 2)), cy = Math.max(h / 2, Math.min(cv.height - P.bar - h / 2, (y0 + y1) / 2));
      g.imageSmoothingQuality = 'high';
      g.drawImage(cv, cx - w / 2, cy - h / 2, w, h, 0, 0, scope.width, scope.height);
    }

    /* the loop */
    let saved = null;
    try { saved = sessionStorage.getItem('scv-t'); sessionStorage.removeItem('scv-t'); } catch (e) { /* private mode */ }
    const hash = /t=([\d.]+)/.exec(location.hash);
    seek(saved != null ? +saved : hash ? +hash[1] : 0);
    function frameLoop(now) {
      const dt = (now - last) / 1000; last = now;
      if (glide) {
        const u = (now - glide.t0) / glide.dur;
        t = glide.from + (glide.to - glide.from) * ease(u);
        if (u >= 1) { t = glide.to; glide = null; if (audio) { try { audio.currentTime = t; } catch (e) { /* */ } } }
        dirty = true;
      } else if (playing) {
        t += dt * rate;
        if (audio && !audio.paused && !audio.ended && Math.abs(audio.currentTime - t) > .12 && audio.currentTime < audio.duration - .05) t = audio.currentTime;
        if (t >= total) { t = total; pause(); }
        dirty = true;
      }
      if (dirty) {
        dirty = false;
        window.renderAt(t);
        window.__shellTime = t;
        const i = stepAt(t + .0005);
        if (i !== cur) {
          if (items[cur]) items[cur].classList.remove('on');
          if (items[i]) { items[i].classList.add('on'); glideList(items[i]); }
          cur = i;
        }
        if (stepMode) {
          pTag.textContent = i >= 0 ? `${tagOf(i)} · ${i + 1}/${steps.length}` : '';
          pNote.textContent = i >= 0 ? (steps[i].s.note || '') : (film.title || '');
          if (!glide) drawSpot(i, t);
        }
        if (scopeOn) drawScope(i, t);
        const p = 100 * t / total;
        fill.style.width = p + '%'; knob.style.left = p + '%';
        track.setAttribute('aria-valuenow', String(Math.round(t)));
        time.textContent = clock(t) + ' / ' + clock(total);
      }
      requestAnimationFrame(frameLoop);
    }
    requestAnimationFrame(frameLoop);
    window.SCV_SHELL = { seek, play, pause, go, goTo, setStepMode, get time() { return t; }, get step() { return stepAt(t + .0005); }, steps: steps.length };
  }
})();
