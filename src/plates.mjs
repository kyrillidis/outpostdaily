// Generated "plates": original line-art diagrams in the manner of a recognition guide or a survey sheet.
// Deterministic per story id, painted only through the .p* classes in app.css (so they follow the theme and
// the domain colour), decorative (aria-hidden) and free of text. Drawn by code: no licence to track.
const SIZES = { card: [320, 240], lead: [640, 360], banner: [840, 360] };
export const MOTIFS = ['radar', 'orbit', 'topo', 'signal', 'graph', 'matrix', 'trajectory', 'uas', 'constellation', 'perimeter', 'chart'];

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const prng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const f = (x) => String(+x.toFixed(1));
const rad = (d) => (d * Math.PI) / 180;
const pol = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const rr = (rnd, a, b) => a + rnd() * (b - a);
const circ = (cx, cy, r, c = 'pi') => `<circle class="${c}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`;
const pth = (d, c = 'pi', x = '') => `<path class="${c}"${x} d="${d}"/>`;
const box = (x, y, w, h, c = 'pi') => `<rect class="${c}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`;
const seg = (x1, y1, x2, y2) => `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
const arrow = (x, y, deg, s, c = 'pa') => { const a = pol(x, y, s, deg), b = pol(x, y, s * .7, deg + 150), d = pol(x, y, s * .7, deg - 150); return pth(`M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}L${f(d[0])} ${f(d[1])}Z`, c); };

// shared furniture: faint grid (the neatline is drawn by CSS so any crop stays clean)
const grid = (W, H, s) => { let d = ''; for (let x = s; x < W; x += s) d += `M${x} 0V${H}`; for (let y = s; y < H; y += s) d += `M0 ${y}H${W}`; return pth(d, 'pl'); };

const DRAW = {
  radar({ W, H, rnd, u }) {
    const R = Math.min(W, H) * .37, cx = W * rr(rnd, .4, .6), cy = H * .5;
    let s = [.25, .5, .75].map((k) => circ(cx, cy, R * k, 'pl')).join('') + circ(cx, cy, R, 'pi');
    let t = '';
    for (let a = 0; a < 360; a += 10) { const [x1, y1] = pol(cx, cy, R, a), [x2, y2] = pol(cx, cy, R * (a % 30 ? 1.04 : 1.09), a); t += seg(x1, y1, x2, y2); }
    s += pth(t, 'pi') + pth(`M${f(cx - R * 1.12)} ${f(cy)}H${f(cx + R * 1.12)}M${f(cx)} ${f(cy - R * 1.12)}V${f(cy + R * 1.12)}`, 'pl');
    const a0 = rr(rnd, 0, 360), a1 = a0 + rr(rnd, 34, 58), [x0, y0] = pol(cx, cy, R, a0), [x1, y1] = pol(cx, cy, R, a1);
    s += pth(`M${f(cx)} ${f(cy)}L${f(x0)} ${f(y0)}A${f(R)} ${f(R)} 0 0 1 ${f(x1)} ${f(y1)}Z`, 'pa', ' fill-opacity=".2"') + pth(seg(cx, cy, x1, y1), 'ps');
    for (let i = 0, n = 5 + Math.floor(rnd() * 4); i < n; i++) { const [x, y] = pol(cx, cy, R * rr(rnd, .15, .93), rr(rnd, 0, 360)); s += circ(x, y, (1.8 + rnd() * 1.6) * u, 'pf'); }
    const [bx, by] = pol(cx, cy, R * rr(rnd, .45, .85), a0 + (a1 - a0) * rr(rnd, .25, .75));
    return s + circ(bx, by, 3.4 * u, 'pa') + circ(bx, by, 8 * u, 'ps') + circ(cx, cy, 2.4 * u, 'pf');
  },

  orbit({ W, H, rnd, u }) {
    const R = Math.min(W, H) * .31, cx = W * rr(rnd, .42, .58), cy = H * .5;
    let s = circ(cx, cy, R, 'pi');
    for (const a of [0, 30, 60, 90, 120, 150]) s += `<ellipse class="pl" cx="${f(cx)}" cy="${f(cy)}" rx="${f(Math.abs(R * Math.cos(rad(a))))}" ry="${f(R)}"/>`;
    let d = '';
    for (const p of [-60, -30, 0, 30, 60]) { const y = cy + R * Math.sin(rad(p)), h = R * Math.cos(rad(p)); d += `M${f(cx - h)} ${f(y)}H${f(cx + h)}`; }
    s += pth(d, 'pl');
    [{ rx: R * rr(rnd, 1.55, 1.9), ry: R * rr(rnd, .34, .5), rot: rr(rnd, -40, -10), c: 'pi' }, { rx: R * rr(rnd, 1.35, 1.7), ry: R * rr(rnd, .5, .75), rot: rr(rnd, 20, 55), c: 'pd' }].forEach((o, i) => {
      s += `<ellipse class="${o.c}" cx="${f(cx)}" cy="${f(cy)}" rx="${f(o.rx)}" ry="${f(o.ry)}" transform="rotate(${f(o.rot)} ${f(cx)} ${f(cy)})"/>`;
      for (let j = 0; j < 2; j++) {
        const t = rr(rnd, 0, Math.PI * 2), th = rad(o.rot), ex = o.rx * Math.cos(t), ey = o.ry * Math.sin(t);
        const x = cx + ex * Math.cos(th) - ey * Math.sin(th), y = cy + ex * Math.sin(th) + ey * Math.cos(th), hot = i === 0 && j === 0;
        s += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(o.rot)})">${box(-3 * u, -3 * u, 6 * u, 6 * u, hot ? 'pa' : 'pw')}${pth(`M${f(-11 * u)} 0H${f(-4 * u)}M${f(4 * u)} 0H${f(11 * u)}`, hot ? 'ps' : 'pi')}</g>`;
        if (hot) s += circ(x, y, 12 * u, 'ps');
      }
    });
    return s;
  },

  topo({ W, H, rnd, u }) {
    let s = '';
    for (const [px, py, sc] of [[W * rr(rnd, .32, .5), H * rr(rnd, .38, .6), 1], [W * rr(rnd, .62, .8), H * rr(rnd, .3, .7), .55]]) {
      const a = [rr(rnd, .06, .14), rr(rnd, .04, .1), rr(rnd, .02, .06)], p = [rr(rnd, 0, 6.3), rr(rnd, 0, 6.3), rr(rnd, 0, 6.3)];
      for (let i = sc === 1 ? 7 : 4; i >= 1; i--) {
        const r0 = Math.min(W, H) * .075 * i * sc;
        let d = '';
        for (let k = 0; k <= 28; k++) { const th = (k / 28) * Math.PI * 2, r = r0 * (1 + a[0] * Math.cos(2 * th + p[0]) + a[1] * Math.cos(3 * th + p[1]) + a[2] * Math.cos(4 * th + p[2])); d += (k ? 'L' : 'M') + Math.round(px + r * Math.cos(th) * 1.3) + ' ' + Math.round(py + r * Math.sin(th)); }
        s += pth(d + 'Z', i % 3 === 0 ? 'pi' : 'pc');
      }
      s += pth(`M${f(px - 4 * u)} ${f(py)}h${f(8 * u)}M${f(px)} ${f(py - 4 * u)}v${f(8 * u)}`, 'pi');
    }
    const y0 = H * rr(rnd, .25, .75), y1 = H * rr(rnd, .25, .75);
    return s + pth(`M0 ${f(y0)}Q${f(W * .3)} ${f(H * rr(rnd, .1, .9))} ${f(W * .55)} ${f((y0 + y1) / 2)}T${W} ${f(y1)}`, 'ps');
  },

  signal({ W, H, rnd }) {
    const x0 = 22, x1 = W - 22, mid = H * .38, A = H * .13, step = W > 500 ? 5 : 3.5;
    const bx = W * rr(rnd, .3, .6), bw = W * rr(rnd, .14, .24), fr = rr(rnd, .06, .11), ph = rr(rnd, 0, 6.3);
    let d = '';
    for (let x = x0; x <= x1; x += step) { let y = mid + A * Math.sin((x - x0) * fr + ph); if (x > bx && x < bx + bw) y += (rnd() - .5) * A * 2.6; d += (x === x0 ? 'M' : 'L') + f(x) + ' ' + f(y); }
    const yb = H * .86, hmax = H * .27;
    let bars = '', hot = '';
    for (let x = x0; x < x1 - 6; x += 9) { const burst = x > bx && x < bx + bw, h = hmax * (burst ? rr(rnd, .55, 1) : rr(rnd, .06, .32)), b = `M${x} ${f(yb)}v${f(-h)}h5v${f(h)}z`; if (burst) hot += b; else bars += b; }
    return box(bx, mid - A * 1.9, bw, A * 3.8, 'pa').replace('class="pa"', 'class="pa" fill-opacity=".13"') + pth(`M${f(bx)} ${f(mid - A * 2.1)}v-6h${f(bw)}v6`, 'ps') +
      pth(`M${x0} ${f(mid)}H${x1}`, 'pl') + pth(d, 'pi') + pth(`M${x0} ${f(yb)}H${x1}`, 'pi') + pth(bars, 'pf') + pth(hot, 'pa');
  },

  graph({ W, H, rnd, u }) {
    const cols = W > 500 ? 5 : 4, rows = 3, nodes = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) nodes.push([W * ((c + .5) / cols) + rr(rnd, -.06, .06) * W, H * ((r + .5) / rows) + rr(rnd, -.08, .08) * H]);
    const edges = new Set(), key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
    nodes.forEach((p, i) => nodes.map((q, j) => [Math.hypot(p[0] - q[0], p[1] - q[1]), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 2).forEach(([, j]) => edges.add(key(i, j))));
    let d = '';
    edges.forEach((e) => { const [a, b] = e.split('-').map(Number); d += seg(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1]); });
    let cur = Math.floor(rnd() * rows) * cols; const path = [cur];
    for (let k = 0; k < 4; k++) {
      const c = nodes.map((q, j) => [Math.hypot(nodes[cur][0] - q[0], nodes[cur][1] - q[1]), j]).filter(([, j]) => !path.includes(j) && nodes[j][0] > nodes[cur][0] - W * .02).sort((a, b) => a[0] - b[0]);
      if (!c.length) break;
      cur = c[rnd() > .5 ? Math.min(1, c.length - 1) : 0][1]; path.push(cur);
    }
    let s = pth(d, 'pc') + pth(path.map((i, k) => (k ? 'L' : 'M') + f(nodes[i][0]) + ' ' + f(nodes[i][1])).join(''), 'ps');
    nodes.forEach(([x, y], i) => { s += circ(x, y, (path.includes(i) ? 6 : 4.5) * u, 'pw'); });
    const [sx, sy] = nodes[path[0]], [ex, ey] = nodes[path[path.length - 1]];
    return s + circ(sx, sy, 6 * u, 'pa') + circ(sx, sy, 13 * u, 'ps') + box(ex - 5 * u, ey - 5 * u, 10 * u, 10 * u, 'pa');
  },

  matrix({ W, H, rnd, u }) {
    const cw = 29 * u, ch = 22 * u, cols = Math.floor((W - 52) / cw), rows = Math.floor((H - 52) / ch), gx = (W - cols * cw) / 2, gy = (H - rows * ch) / 2;
    let d = '';
    for (let c = 0; c <= cols; c++) d += `M${f(gx + c * cw)} ${f(gy)}v${f(rows * ch)}`;
    for (let r = 0; r <= rows; r++) d += `M${f(gx)} ${f(gy + r * ch)}h${f(cols * cw)}`;
    let soft = '', hot = '';
    for (let c = 0; c < cols; c++) soft += `M${f(gx + c * cw + 4)} ${f(gy + 5)}h${f(cw - 8)}v4h${f(8 - cw)}z`;
    const cells = new Set(), n = Math.round(cols * rows * .11);
    while (cells.size < n) cells.add((1 + Math.floor(rnd() * (rows - 1))) * cols + Math.floor(rnd() * cols));
    let k = 0;
    cells.forEach((i) => { const c = i % cols, r = Math.floor(i / cols), b = `M${f(gx + c * cw + 2)} ${f(gy + r * ch + 2)}h${f(cw - 4)}v${f(ch - 4)}h${f(4 - cw)}z`; if (k++ < 4) hot += b; else soft += b; });
    return pth(d, 'pl') + pth(`M${f(gx)} ${f(gy + ch)}h${f(cols * cw)}`, 'pi') + pth(soft, 'pk') + pth(hot, 'pa');
  },

  trajectory({ W, H, rnd, u }) {
    const lx = W * rr(rnd, .14, .2), ly = H * .76, ix = W * rr(rnd, .78, .86);
    let s = '';
    for (const k of [.22, .44, .66, .88]) s += circ(lx, ly, W * k, 'pl');
    let tk = ''; for (let x = 36; x < W - 12; x += 24) tk += `M${x} ${f(ly + 14)}v5`;
    s += pth(`M12 ${f(ly + 14)}H${W - 12}`, 'pi') + pth(tk, 'pi') + pth(`M22 20V${f(ly + 14)}`, 'pi');
    let at = ''; for (let y = 36; y < ly; y += 24) at += `M22 ${f(y)}h5`;
    s += pth(at, 'pi');
    let tail = '';
    for (const [x2, cy, c] of [[ix - W * .08, H * rr(rnd, .2, .3), 'pd'], [ix + W * .05, H * rr(rnd, .32, .44), 'pd'], [ix, H * rr(rnd, .08, .18), 'ps']]) {
      const mx = (lx + x2) / 2, qy = 2 * cy - ly;
      s += pth(`M${f(lx)} ${f(ly)}Q${f(mx)} ${f(qy)} ${f(x2)} ${f(ly)}`, c);
      if (c === 'ps') tail = arrow(x2, ly, (Math.atan2(2 * (ly - cy), x2 - mx) * 180) / Math.PI, 10 * u);
    }
    return s + tail + circ(ix, ly, 12 * u, 'ps') + pth(`M${f(ix - 6 * u)} ${f(ly - 6 * u)}l${f(12 * u)} ${f(12 * u)}M${f(ix + 6 * u)} ${f(ly - 6 * u)}l${f(-12 * u)} ${f(12 * u)}`, 'ps') +
      pth(`M${f(lx)} ${f(ly - 9 * u)}l${f(6 * u)} ${f(12 * u)}h${f(-12 * u)}z`, 'pf');
  },

  uas({ W, H, rnd, u }) {
    const R = Math.min(W, H) * .33, cx = W * rr(rnd, .42, .58), cy = H * .5, th = rr(rnd, 0, 90);
    let s = circ(cx, cy, R * 1.3, 'pl') + circ(cx, cy, R * 1.62, 'pd');
    const b = R * 1.12, g = R * .3;
    s += pth(`M${f(cx - b)} ${f(cy - b + g)}V${f(cy - b)}H${f(cx - b + g)}M${f(cx + b - g)} ${f(cy - b)}H${f(cx + b)}V${f(cy - b + g)}M${f(cx + b)} ${f(cy + b - g)}V${f(cy + b)}H${f(cx + b - g)}M${f(cx - b + g)} ${f(cy + b)}H${f(cx - b)}V${f(cy + b - g)}`, 'pi');
    for (let i = 0; i < 4; i++) {
      const a = th + 45 + i * 90, [x, y] = pol(cx, cy, R * .62, a), [b1x, b1y] = pol(x, y, R * .27, a + 30), [b2x, b2y] = pol(x, y, R * .27, a + 210);
      s += pth(seg(cx, cy, x, y), 'pi') + circ(x, y, R * .27, 'pw') + pth(seg(b1x, b1y, b2x, b2y), 'pi') + circ(x, y, 2 * u, 'pf');
    }
    const [px, py] = pol(cx, cy, R * 1.45, rr(rnd, 0, 360)), tx = Math.min(W - 34, Math.max(34, px)), ty = Math.min(H - 34, Math.max(34, py));
    return s + circ(cx, cy, R * .17, 'pw') + arrow(cx, cy, th, R * .12) + pth(seg(cx, cy, tx, ty), 'pad') + circ(tx, ty, 6 * u, 'pa') + circ(tx, ty, 13 * u, 'ps');
  },

  constellation({ W, H, rnd, u }) {
    const gx = W * rr(rnd, .4, .6), gy = H * .8, hr = W * 1.4, hc = H * .86 + hr, n = 6, hot = Math.floor(rnd() * n);
    let s = `<circle class="pi" cx="${f(W / 2)}" cy="${f(hc)}" r="${f(hr)}"/><circle class="pl" cx="${f(W / 2)}" cy="${f(hc)}" r="${f(hr + H * .07)}"/>`;
    for (let i = 0; i < n; i++) {
      const a = -72 + (144 * (i + rr(rnd, .15, .85))) / n, dist = H * rr(rnd, .5, .68), sx = Math.min(W - 36, Math.max(36, gx + Math.sin(rad(a)) * dist * 1.45)), sy = Math.max(34, gy - Math.cos(rad(a)) * dist * .98);
      s += pth(seg(sx, sy, gx, gy), i === hot ? 'pad' : 'pl') + `<g transform="translate(${f(sx)} ${f(sy)}) rotate(45)">${box(-3.5 * u, -3.5 * u, 7 * u, 7 * u, i === hot ? 'pa' : 'pw')}</g>` + pth(`M${f(sx - 13 * u)} ${f(sy)}H${f(sx - 6 * u)}M${f(sx + 6 * u)} ${f(sy)}H${f(sx + 13 * u)}`, 'pi');
      if (i === hot) { const mx = (sx + gx) / 2, my = (sy + gy) / 2; s += pth(`M${f(mx - 5 * u)} ${f(my - 5 * u)}l${f(10 * u)} ${f(10 * u)}M${f(mx + 5 * u)} ${f(my - 5 * u)}l${f(-10 * u)} ${f(10 * u)}`, 'ps'); }
    }
    return s + circ(gx, gy, 4.5 * u, 'pa') + circ(gx, gy, 11 * u, 'ps');
  },

  perimeter({ id, W, H, rnd, u }) {
    const pts = [], n = 9, x0 = W * rr(rnd, .42, .58);
    for (let i = 0; i <= n; i++) pts.push([x0 + rr(rnd, -.13, .13) * W, 12 + (i / n) * (H - 24)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join(''), pid = `${id}h`;
    let s = `<defs><pattern id="${pid}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path class="pc" d="M0 0V7"/></pattern></defs>` +
      pth(`${line}L12 ${H - 12}L12 12Z`, 'pz', ` fill="url(#${pid})"`) + pth(line, 'psd');
    for (let i = 0; i < 4; i++) { const x = rr(rnd, .12, .88) * W, y = rr(rnd, .15, .85) * H; s += i % 2 ? box(x - 3 * u, y - 3 * u, 6 * u, 6 * u, 'pw') : circ(x, y, 3.2 * u, 'pw'); }
    for (let i = 0; i < 2; i++) { const p = pts[2 + i * 4], sgn = i ? -1 : 1; s += pth(seg(p[0] - 40 * u * sgn, p[1], p[0] + 8 * u * sgn, p[1]), 'ps') + arrow(p[0] + 14 * u * sgn, p[1], i ? 180 : 0, 9 * u); }
    return s;
  },

  chart({ W, H, rnd, u }) {
    const j = () => rr(rnd, -.05, .05);
    let s = pth(`M12 12H${f(W * .64)}Q${f(W * (.6 + j()))} ${f(H * (.2 + j()))} ${f(W * .48)} ${f(H * (.26 + j()))}T${f(W * .3)} ${f(H * (.38 + j()))}T${f(W * .14)} ${f(H * (.5 + j()))}T12 ${f(H * .6)}Z`, 'pkc');
    for (let i = 0; i < 5; i++) {
      const y = H * (.46 + i * .095), w = rr(rnd, 36, 60) * u / 1.3, a = rr(rnd, 4, 9) * u;
      let d = `M12 ${f(y)}q${f(w / 2)} ${f(-a)} ${f(w)} 0`;
      for (let x = 12 + w; x < W - 12; x += w) d += `t${f(w)} 0`;
      s += pth(d, 'pc');
    }
    let snd = '';
    for (let i = 0; i < 14; i++) { const x = rr(rnd, .08, .92) * W, y = rr(rnd, .5, .92) * H; snd += `M${f(x - 3)} ${f(y)}h6M${f(x)} ${f(y - 3)}v6`; }
    s += pth(snd, 'pl');
    const tr = [[W * .1, H * rr(rnd, .72, .88)], [W * .3, H * rr(rnd, .6, .8)], [W * .52, H * rr(rnd, .66, .86)], [W * .72, H * rr(rnd, .56, .74)], [W * .9, H * rr(rnd, .5, .7)]];
    s += pth(tr.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join(''), 'psd');
    for (let i = 0; i < tr.length - 1; i++) s += arrow((tr[i][0] + tr[i + 1][0]) / 2, (tr[i][1] + tr[i + 1][1]) / 2, (Math.atan2(tr[i + 1][1] - tr[i][1], tr[i + 1][0] - tr[i][0]) * 180) / Math.PI, 6 * u);
    const e = tr[tr.length - 1];
    return s + arrow(e[0], e[1], -20, 11 * u) + circ(e[0], e[1], 14 * u, 'ps') + pth(`M24 ${H - 24}h60M24 ${H - 29}v10M54 ${H - 27}v6M84 ${H - 29}v10`, 'pi');
  },
};

const RULES = [
  ['uas', /\b(drones?|uavs?|uas|quadcopters?|fpv|loitering|swarms?|c-uas)\b/],
  ['trajectory', /\b(missiles?|hypersonic|ballistic|icbm|rockets?|interceptors?|munitions?|warheads?|artillery|salvo)\b/],
  ['radar', /\b(radars?|air defen[cs]e|iads|surveillance|early[- ]warning|patriot|s-400|sensors?|aegis)\b/],
  ['constellation', /\b(gps|gnss|galileo|beidou|glonass|pnt|navigation|spoof\w*)\b/],
  ['signal', /\b(electronic warfare|jamm\w*|spectrum|radio|signals?|sigint|frequenc\w*|interference|comms)\b/],
  ['orbit', /\b(satellites?|orbit\w*|space|starlink|satcom|spacecraft|launch\w*|leo)\b/],
  ['chart', /\b(ships?|vessels?|naval|navy|maritime|strait|ports?|sea|ais|tankers?|submarines?|fleets?|canal|shipping|warships?)\b/],
  ['matrix', /\b(cves?|vulnerabilit\w*|patch\w*|zero-day|exploit\w*|kev|rce|cvss|flaws?|bugs?)\b/],
  ['graph', /\b(ransomware|breach\w*|botnets?|phishing|malware|apt|campaigns?|hack\w*|attacks?|networks?|credentials?|leaks?|backdoor|c2|spyware)\b/],
  ['perimeter', /\b(borders?|sanctions?|treat(y|ies)|nato|summits?|ceasefire|elections?|diplomat\w*|negotiat\w*|alliance|territor\w*|frontier|kremlin|russia\w*|china|chinese|taiwan|iran\w*|israel\w*|ukrain\w*|gaza|putin)\b/],
  ['topo', /\b(maps?|terrain|geospatial|imagery|geoint|survey|arctic|mapping|osint)\b/],
];
const DEFAULTS = { cyber: ['graph', 'matrix'], warfare: ['radar', 'trajectory', 'uas'], geo: ['topo', 'perimeter', 'orbit'] };

// Picks a motif from the story's subject; ties are broken by the story id so neighbours rarely match.
export function motifFor({ section = 'cyber', title = '', tags = [], seed = '' }) {
  const text = `${title} ${tags.join(' ')}`.toLowerCase();
  const hits = RULES.filter(([, re]) => re.test(text)).map(([m]) => m);
  const h = hash(String(seed || title));
  if (hits.length) return hits[h % Math.min(hits.length, 2)];
  const d = DEFAULTS[section === 'world' ? 'geo' : section] ?? DEFAULTS.cyber;
  return d[h % d.length];
}

// variant: card 4:3, lead 16:9, banner 21:9. `motif` forces one (used for page banners). Returns a <figure> with an inline SVG.
export function plate({ id = 'x', section = 'cyber', title = '', tags = [], variant = 'card', motif: forced }) {
  const sec = section === 'world' ? 'geo' : DEFAULTS[section] ? section : 'cyber';
  const [W, H] = SIZES[variant] ?? SIZES.card;
  const motif = MOTIFS.includes(forced) ? forced : motifFor({ section: sec, title, tags, seed: id });
  const u = Math.min(W, H) / 240;
  const sid = String(id).replace(/[^\w-]/g, ''), body = DRAW[motif]({ id: sid, W, H, rnd: prng(hash(String(id) + motif)), u });
  const alert = /exploit|zero-day|ransomware|critical|\bkev\b/i.test(`${title} ${tags.join(' ')}`);
  return `<figure class="plate plate-${variant}" data-motif="${motif}" data-domain="${sec}"${alert ? ' data-alert="true"' : ''} aria-hidden="true"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false"><rect class="pp" width="${W}" height="${H}"/>${grid(W, H, Math.round(40 * u))}${body}</svg></figure>`;
}
