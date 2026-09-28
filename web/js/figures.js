/* XP Flight Computer — study figures (inline SVG, theme-aware)
 * Charts are plotted from the same calc functions the calculators use, so they are drawn to scale.
 */
(function (root) {
  'use strict';
  const C = root.XFC.calc;
  let uid = 0;

  const svg = (w, h, label, body) => {
    const id = 'fg' + (++uid);
    const marks = ['acc', 'sel', 'live', 'warn', 'bad', 'line'].map(c =>
      `<marker id="${id}-${c}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="f-${c}"/></marker>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><defs>${marks}</defs>${body(id)}</svg>`;
  };
  const arrow = (id, x1, y1, x2, y2, c = 'line', extra = '') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="s-${c}" marker-end="url(#${id}-${c})" ${extra}/>`;
  const dbl = (id, x1, y1, x2, y2, c = 'line') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="s-${c}" marker-start="url(#${id}-${c})" marker-end="url(#${id}-${c})"/>`;
  const text = (x, y, s, cls = 't', anchor = 'start', extra = '') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" ${extra}>${s}</text>`;
  const line = (x1, y1, x2, y2, cls = 's-line') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
  const f = (x, d = 1) => Number(x).toFixed(d);
  const arcPath = (cx, cy, r, a0, a1) => { // angles in screen degrees, 0 = +x, clockwise positive
    const p = a => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
    return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${large} ${sweep} ${f(x1)} ${f(y1)}`;
  };
  const brg = (cx, cy, b, r) => [cx + r * Math.sin(b * Math.PI / 180), cy - r * Math.cos(b * Math.PI / 180)];

  /** Generic chart frame. xs/ys: {min,max,ticks:[...], label}. Returns helpers + svg pieces. */
  function frame(W, H, m, xs, ys) {
    const X = v => m.l + (v - xs.min) / (xs.max - xs.min) * (W - m.l - m.r);
    const Y = v => H - m.b - (v - ys.min) / (ys.max - ys.min) * (H - m.t - m.b);
    let g = '';
    for (const t of xs.ticks) g += line(f(X(t)), m.t, f(X(t)), H - m.b, 's-grid') + (xs.noTickLabels ? '' : text(f(X(t)), H - m.b + 16, xs.fmt ? xs.fmt(t) : t, 't tm', 'middle'));
    for (const t of ys.ticks) g += line(m.l, f(Y(t)), W - m.r, f(Y(t)), 's-grid') + text(m.l - 6, f(Y(t) + 4), ys.fmt ? ys.fmt(t) : t, 't tm', 'end');
    g += line(m.l, H - m.b, W - m.r, H - m.b, 's-thin') + line(m.l, m.t, m.l, H - m.b, 's-thin');
    if (xs.label) g += text((m.l + W - m.r) / 2, H - 6, xs.label, 't', 'middle');
    g += `<text x="14" y="${(m.t + H - m.b) / 2}" class="t" text-anchor="middle" transform="rotate(-90 14 ${(m.t + H - m.b) / 2})">${ys.label}</text>`;
    const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + f(X(p[0])) + ' ' + f(Y(p[1]))).join(' ');
    return { X, Y, grid: g, path };
  }
  const range = (a, b, s) => { const o = []; for (let v = a; v <= b + 1e-9; v += s) o.push(+v.toFixed(6)); return o; };
  const kft = v => (v === 0 ? '0' : (v / 1000) + 'k');
  /** Break a label into lines of at most n characters (SVG text does not wrap). */
  const wrap = (s, n) => {
    const out = []; let cur = '';
    for (const w of String(s).split(' ')) { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) out.push(cur);
    return out;
  };

  const airlinerSide = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M-128 -9 H98 Q126 -5 130 0 Q126 6 98 9 H-122 Q-134 7 -136 0 Q-134 -7 -128 -9 Z" class="f-soft s-line"/>
      <path d="M-122 -9 L-106 -52 H-92 L-96 -9 Z" class="f-soft s-line"/>
      <path d="M-122 -2 L-150 -4 L-150 2 L-122 3 Z" class="f-soft s-line"/>
      <path d="M-18 1 L46 1 L30 7 L-22 7 Z" class="f-line"/>
      <rect x="-8" y="7" width="30" height="11" rx="5.5" class="f-soft s-line"/>
      ${range(-100, 90, 12).map(v => `<circle cx="${v}" cy="-3" r="1.6" class="f-muted"/>`).join('')}
      <path d="M104 -6 L116 -6 L121 -1 L106 -1 Z" class="f-muted"/>
    </g>`;

  const F = {};

  // ---------------------------------------------------------------- 1.1 four forces
  F.forces = () => svg(640, 300, 'Four forces on an aircraft in flight', id => `
    <rect x="0" y="0" width="640" height="300" class="f-sky" rx="8"/>
    ${airlinerSide(320, 152, 1.25)}
    ${arrow(id, 330, 132, 330, 34, 'acc')}${text(342, 44, 'Lift  L = ½ρV²S·C<tspan baseline-shift="sub" font-size="9">L</tspan>', 't-acc')}
    ${arrow(id, 330, 172, 330, 272, 'bad')}${text(342, 268, 'Weight  W = mg', 't-bad')}
    ${arrow(id, 492, 152, 606, 152, 'live')}${text(600, 140, 'Thrust T', 't-live', 'end')}
    ${arrow(id, 126, 152, 30, 152, 'warn')}${text(40, 140, 'Drag  D = ½ρV²S·C<tspan baseline-shift="sub" font-size="9">D</tspan>', 't-warn')}
    <circle cx="330" cy="152" r="5" class="f-surface s-line"/><circle cx="330" cy="152" r="2" class="f-line"/>
    ${text(20, 286, 'Steady, level flight: L = W and T = D. Change any one and the aircraft accelerates, climbs or descends.', 't')}`);

  // ---------------------------------------------------------------- 1.1 airfoil & AoA
  F.airfoil = () => svg(640, 270, 'Airfoil at an angle of attack to the relative wind', id => {
    const ax = 210, ay = 140, c = 300, a = 8, m = 0.02, pp = 0.4, t = 0.15;
    const up = [], lo = [];
    for (let i = 0; i <= 40; i++) {
      const x = (1 - Math.cos(Math.PI * i / 40)) / 2;
      const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
      const yc = x < pp ? m / (pp * pp) * (2 * pp * x - x * x) : m / ((1 - pp) ** 2) * ((1 - 2 * pp) + 2 * pp * x - x * x);
      up.push([ax + x * c, ay - (yc + yt) * c]); lo.push([ax + x * c, ay - (yc - yt) * c]);
    }
    const d = 'M' + up.map(q => f(q[0]) + ' ' + f(q[1])).join(' L') + ' L' + lo.reverse().map(q => f(q[0]) + ' ' + f(q[1])).join(' L') + ' Z';
    const cp = [ax + 0.27 * c * Math.cos(a * Math.PI / 180), ay + 0.27 * c * Math.sin(a * Math.PI / 180)];
    return `
    ${[96, 140, 184].map(y => arrow(id, 24, y, 130, y, 'line', 'opacity="0.5"')).join('')}
    ${text(24, 214, 'Relative wind', 'tb')}${text(24, 230, 'the airflow the wing meets', 't')}
    <g transform="rotate(${a} ${ax} ${ay})"><path d="${d}" class="f-soft s-line"/><line x1="${ax}" y1="${ay}" x2="${ax + c}" y2="${ay}" class="s-dash"/></g>
    <line x1="${ax}" y1="${ay}" x2="${ax + c + 30}" y2="${ay}" class="s-thin" stroke-dasharray="2 4"/>
    <path d="${arcPath(ax, ay, 190, 0, a)}" class="s-acc nf"/>${text(ax + 198, ay + 20, 'α', 't-acc')}
    ${text(ax + c - 10, ay + 62, 'chord line', 't', 'end')}
    ${arrow(id, f(cp[0]), f(cp[1] - 22), f(cp[0]), 24, 'acc')}${text(f(cp[0] + 10), 34, 'Lift — at 90° to the relative wind', 't-acc')}
    ${arrow(id, 540, 214, 616, 214, 'warn')}${text(616, 236, 'Drag — along the relative wind', 't-warn', 'end')}
    ${text(24, 262, 'Lift grows with α up to the critical angle (≈15–18° clean); beyond it the flow separates and the wing stalls.', 't')}`;
  });

  // ---------------------------------------------------------------- 1.1 lift curve
  F.liftCurve = () => {
    const fr = frame(640, 300, { l: 54, r: 20, t: 16, b: 38 },
      { min: -4, max: 24, ticks: range(-4, 24, 4), label: 'Angle of attack α (degrees)' },
      { min: -0.4, max: 3.0, ticks: range(0, 3, 0.5), label: 'Lift coefficient C_L', fmt: v => v.toFixed(1) });
    const curve = (a0, as, clmax) => {
      const pts = [];
      for (let a = -4; a <= 24; a += 0.25) {
        const lin = 0.1 * (a - a0), L = 0.1 * (as - 3 - a0);
        let cl;
        if (a <= as - 3) cl = lin;
        else if (a <= as) cl = clmax - (clmax - L) * Math.pow((as - a) / 3, 2);
        else cl = clmax - 0.09 * (a - as) - 0.004 * Math.pow(a - as, 2);
        if (cl > -0.4 && cl < 3.05) pts.push([a, cl]);
      }
      return pts;
    };
    const sets = [[-10, 18, 2.72, 'acc', 'Landing flaps + slats'], [-8, 13, 2.05, 'live', 'Take-off flaps'], [-2, 15, 1.55, 'sel', 'Clean wing']];
    const lx = fr.X(-3.4), ly = fr.Y(2.86);
    return svg(640, 300, 'Lift coefficient against angle of attack', id => fr.grid + sets.map(([a0, as, cm, c]) =>
      `<path d="${fr.path(curve(a0, as, cm))}" class="s-${c} nf"/><circle cx="${f(fr.X(as))}" cy="${f(fr.Y(cm))}" r="4.5" class="f-${c}"/>`).join('') +
      `<rect x="${f(lx - 8)}" y="${f(ly - 16)}" width="236" height="80" rx="6" class="f-surface s-thin"/>` +
      sets.map(([, , cm, c, name], i) => line(f(lx), f(ly + i * 22), f(lx + 22), f(ly + i * 22), 's-' + c) +
        text(f(lx + 30), f(ly + i * 22 + 4), name + ' · C<tspan baseline-shift="sub" font-size="9">Lmax</tspan> ' + cm.toFixed(2), 't-' + c)).join('') +
      text(fr.X(23.6), fr.Y(-0.22), 'Typical swept-wing airliner shapes (illustrative)', 't', 'end'));
  };

  // ---------------------------------------------------------------- 1.2 stall speed vs bank
  F.stallBank = () => {
    const fr = frame(640, 290, { l: 54, r: 24, t: 16, b: 38 },
      { min: 0, max: 75, ticks: range(0, 75, 15), label: 'Bank angle φ in a level turn (degrees)' },
      { min: 1, max: 4, ticks: range(1, 4, 0.5), label: 'Multiplier', fmt: v => v.toFixed(1) + '×' });
    const n = [], vs = [];
    for (let b = 0; b <= 75; b += 1) { const k = 1 / Math.cos(b * Math.PI / 180); n.push([b, k]); vs.push([b, Math.sqrt(k)]); }
    const marks = [30, 45, 60].map(b => {
      const k = 1 / Math.cos(b * Math.PI / 180);
      return `<circle cx="${f(fr.X(b))}" cy="${f(fr.Y(k))}" r="4" class="f-acc"/>${text(f(fr.X(b) - 6), f(fr.Y(k) - 9), k.toFixed(2) + ' g', 't-acc', 'end')}
        <circle cx="${f(fr.X(b))}" cy="${f(fr.Y(Math.sqrt(k)))}" r="4" class="f-sel"/>${b > 30 ? text(f(fr.X(b) + 9), f(fr.Y(Math.sqrt(k)) + 6), '+' + ((Math.sqrt(k) - 1) * 100).toFixed(0) + ' %', 't-sel') : ''}`;
    }).join('');
    return svg(640, 290, 'Load factor and stall speed multiplier against bank angle', id => fr.grid +
      `<path d="${fr.path(n)}" class="s-acc nf"/><path d="${fr.path(vs)}" class="s-sel nf"/>` + marks +
      text(fr.X(52), fr.Y(3.55), 'Load factor n = 1 / cos φ', 't-acc') + text(fr.X(55), fr.Y(1.62), 'Stall speed × √n', 't-sel'));
  };

  // ---------------------------------------------------------------- 1.3 turning flight
  F.turn = () => svg(640, 300, 'Forces in a banked turn and turn radius', id => {
    const cx = 170, cy = 170, phi = 30;
    const up = [Math.sin(phi * Math.PI / 180), -Math.cos(phi * Math.PI / 180)];
    const Lx = cx + up[0] * 120, Ly = cy + up[1] * 120;
    return `
    <g transform="rotate(${phi} ${cx} ${cy})">
      <ellipse cx="${cx}" cy="${cy}" rx="16" ry="16" class="f-soft s-line"/>
      <path d="M${cx - 110} ${cy + 2} L${cx - 14} ${cy - 4} L${cx + 14} ${cy - 4} L${cx + 110} ${cy + 2} L${cx + 110} ${cy + 6} L${cx - 110} ${cy + 6} Z" class="f-soft s-line"/>
      <path d="M${cx - 3} ${cy - 16} L${cx} ${cy - 48} L${cx + 3} ${cy - 16} Z" class="f-soft s-line"/>
      <line x1="${cx}" y1="${cy - 60}" x2="${cx}" y2="${cy + 40}" class="s-dash"/>
    </g>
    ${arrow(id, cx, cy, f(Lx), f(Ly), 'acc')}${text(f(Lx + 6), f(Ly - 4), 'Lift L', 't-acc')}
    ${arrow(id, cx, cy, cx, f(cy - 120 * Math.cos(phi * Math.PI / 180)), 'live')}${text(cx - 8, f(cy - 110), 'L cos φ = W', 't-live', 'end')}
    ${arrow(id, cx, cy, f(Lx), cy, 'sel')}${text(f(Lx + 6), cy + 16, 'L sin φ', 't-sel')}
    ${line(f(Lx), f(Ly), f(Lx), cy, 's-dash')}
    ${arrow(id, cx, cy + 20, cx, cy + 100, 'bad')}${text(cx + 8, cy + 96, 'W', 't-bad')}
    <path d="${arcPath(cx, cy, 58, -90, -90 + phi)}" class="s-line nf"/>${text(cx + 16, cy - 64, 'φ', 'tb')}
    ${text(40, 290, 'Rear view: the tilted lift both holds the weight and pulls the aircraft round.', 't')}
    <circle cx="470" cy="150" r="100" class="s-dash nf"/>
    <circle cx="470" cy="150" r="3" class="f-line"/>${line(470, 150, 570, 150, 's-line')}${text(515, 143, 'r', 'tb', 'middle')}
    <g transform="translate(570 150) rotate(180)"><path d="M0 -12 L6 6 L0 2 L-6 6 Z" class="f-acc"/></g>
    ${arrow(id, 570, 162, 570, 242, 'acc')}${text(580, 236, 'V', 't-acc')}${text(470, 40, 'right turn, seen from above', 't', 'middle')}
    ${arrow(id, 562, 150, 486, 150, 'sel')}
    ${text(470, 272, 'Top view:  r = V² / (g tan φ)   ·   ω = g tan φ / V', 't', 'middle')}`;
  });

  // ---------------------------------------------------------------- 1.4 glide
  F.glide = () => svg(640, 240, 'Glide distance and the glide ratio', id => `
    <rect x="30" y="196" width="600" height="30" class="f-ground" rx="4"/>
    ${line(30, 196, 630, 196, 's-line')}
    <g transform="translate(70 46) rotate(8)"><path d="M-18 -3 H14 Q22 0 14 3 H-18 Z M-2 -1 L4 -14 L8 -14 L6 -1 Z M-14 -2 L-20 -9 L-16 -9 L-10 -2 Z" class="f-line"/></g>
    <path d="M78 52 L560 196" class="s-acc nf"/>${text(330, 110, 'still air: distance = h × L/D', 't-acc')}
    <path d="M78 52 L440 196" class="s-warn nf" stroke-dasharray="7 5"/>${text(258, 166, 'into a headwind: shorter', 't-warn', 'middle')}
    ${dbl(id, 52, 52, 52, 196)}${text(44, 128, 'h', 'tb', 'end')}
    ${dbl(id, 78, 214, 560, 214)}${text(320, 212, 'd', 'tb', 'middle')}
    <path d="${arcPath(560, 196, 60, 180, 196.6)}" class="s-line nf"/>${text(488, 188, 'γ', 'tb')}
    ${text(628, 30, 'L/D = d / h = 1 / tan γ', 'tb', 'end')}${text(628, 48, 'C172 ≈ 9 : 1 · A320 ≈ 17 : 1 · glider ≈ 40 : 1', 't', 'end')}`);

  // ---------------------------------------------------------------- 2.1 ISA
  F.isa = () => {
    const alts = range(0, 65000, 500);
    const fT = frame(310, 300, { l: 50, r: 10, t: 14, b: 38 }, { min: -70, max: 20, ticks: [-60, -40, -20, 0, 20], label: 'Temperature (°C)' },
      { min: 0, max: 65000, ticks: range(0, 60000, 10000), label: 'Pressure altitude (ft)', fmt: kft });
    const fP = frame(310, 300, { l: 50, r: 14, t: 14, b: 38 }, { min: 0, max: 1050, ticks: [0, 250, 500, 750, 1000], label: 'Pressure (hPa)' },
      { min: 0, max: 65000, ticks: range(0, 60000, 10000), label: 'Pressure altitude (ft)', fmt: kft });
    const tp = C.isa(36089);
    return svg(640, 300, 'ISA temperature and pressure against altitude', id => `
      <g>${fT.grid}<path d="${fT.path(alts.map(a => [C.isa(a).Tc, a]))}" class="s-sel nf"/>
        ${line(fT.X(-70), f(fT.Y(36089)), fT.X(20), f(fT.Y(36089)), 's-dash')}${text(f(fT.X(-66)), f(fT.Y(36089) - 6), 'tropopause 36 089 ft', 't')}
        <circle cx="${f(fT.X(15))}" cy="${f(fT.Y(0))}" r="4" class="f-sel"/>${text(f(fT.X(15) - 6), f(fT.Y(0) - 8), '+15 °C', 't-sel', 'end')}
        ${text(f(fT.X(-55)), f(fT.Y(50000)), '−56.5 °C', 't-sel')}${text(f(fT.X(-24)), f(fT.Y(18000)), '−1.98 °C / 1000 ft', 't-sel')}</g>
      <g transform="translate(330 0)">${fP.grid}<path d="${fP.path(alts.map(a => [C.isa(a).hPa, a]))}" class="s-acc nf"/>
        ${line(fP.X(0), f(fP.Y(36089)), fP.X(1050), f(fP.Y(36089)), 's-dash')}
        <circle cx="${f(fP.X(1013.25))}" cy="${f(fP.Y(0))}" r="4" class="f-acc"/>${text(f(fP.X(1013.25) - 6), f(fP.Y(0) - 8), '1013.25', 't-acc', 'end')}
        <circle cx="${f(fP.X(C.isa(18000).hPa))}" cy="${f(fP.Y(18000))}" r="4" class="f-acc"/>${text(f(fP.X(C.isa(18000).hPa) + 8), f(fP.Y(18000) + 4), 'half at 18 000 ft', 't-acc')}
        ${text(f(fP.X(tp.hPa) + 8), f(fP.Y(36089) + 16), f(tp.hPa, 0) + ' hPa', 't-acc')}</g>`);
  };

  // ---------------------------------------------------------------- 2.2 altimetry
  F.altimetry = () => svg(640, 300, 'QFE, QNH and standard pressure settings', id => `
    <rect x="0" y="0" width="640" height="300" class="f-sky" rx="8"/>
    <path d="M0 250 L60 244 L110 226 L150 214 L330 214 L360 222 L420 232 L470 246 L640 250 L640 300 L0 300 Z" class="f-ground"/>
    ${line(150, 214, 330, 214, 's-line')}${text(240, 208, 'Airfield', 'tb', 'middle')}${line(330, 214, 430, 214, 's-dash')}
    ${line(0, 250, 640, 250, 's-dash')}${text(8, 244, 'Mean sea level', 't')}
    <line x1="0" y1="270" x2="640" y2="270" class="s-bad" stroke-dasharray="3 5" style="stroke-width:1.5"/>${text(8, 288, '1013.25 hPa level — below sea level on a low-pressure day', 't-bad')}
    ${line(0, 118, 640, 118, 's-thin')}${text(8, 112, 'Transition altitude: QNH below, standard above', 't')}
    <g transform="translate(520 72)"><path d="M-22 -3 H16 Q24 0 16 3 H-22 Z M-4 -1 L2 -12 L7 -12 L5 -1 Z M-18 -2 L-23 -9 L-19 -9 L-13 -2 Z" class="f-line"/></g>
    ${dbl(id, 430, 84, 430, 214, 'live')}${text(422, 150, 'QFE', 't-live', 'end')}${text(422, 166, 'height', 't', 'end')}
    ${dbl(id, 525, 84, 525, 250, 'sel')}${text(517, 186, 'QNH', 't-sel', 'end')}${text(517, 202, 'altitude', 't', 'end')}
    ${dbl(id, 620, 84, 620, 270, 'bad')}${text(612, 214, 'STD', 't-bad', 'end')}${text(612, 230, 'flight level', 't', 'end')}`);

  // ---------------------------------------------------------------- 2.2 high to low
  F.highLow = () => svg(640, 250, 'Flying from high to low pressure', id => `
    <rect x="30" y="205" width="580" height="20" class="f-ground" rx="4"/>${line(30, 205, 610, 205, 's-line')}
    <path d="M40 70 C 200 72, 420 120, 600 132" class="s-sel nf"/>${text(236, 108, '700 hPa pressure surface', 't-sel', 'middle')}
    <path d="M40 30 C 200 32, 420 80, 600 92" class="s-thin nf"/>
    ${text(50, 190, 'H', 'tl')}${text(580, 190, 'L', 'tl')}
    ${[[90, 70], [330, 94], [560, 128]].map(([x, y]) => `<g transform="translate(${x} ${y - 6})"><path d="M-16 -2 H12 Q18 0 12 2 H-16 Z M-3 -1 L2 -9 L6 -9 L4 -1 Z" class="f-line"/></g>`).join('')}
    ${dbl(id, 90, 70, 90, 205, 'live')}${text(98, 150, 'true 10 000 ft', 't-live')}
    ${dbl(id, 560, 124, 560, 205, 'bad')}${text(552, 172, 'true ≈ 8 800 ft', 't-bad', 'end')}
    ${text(320, 30, 'Altimeter setting unchanged: it reads 10 000 ft the whole way', 'tb', 'middle')}
    ${text(320, 242, 'High to low (or hot to cold), look out below', 't', 'middle')}`);

  // ---------------------------------------------------------------- 2.3 density altitude chart
  F.densityAlt = () => {
    const fr = frame(640, 300, { l: 58, r: 70, t: 14, b: 38 }, { min: -10, max: 40, ticks: range(-10, 40, 10), label: 'Outside air temperature (°C)' },
      { min: -2000, max: 14000, ticks: range(-2000, 14000, 2000), label: 'Density altitude (ft)', fmt: v => v / 1000 + 'k' });
    const pas = [0, 2000, 4000, 6000, 8000];
    return svg(640, 300, 'Density altitude against temperature for several pressure altitudes', id => fr.grid + pas.map((pa, i) => {
      const pts = range(-10, 40, 1).map(t => [t, C.densityAltitude(pa, t).ft]);
      const isaT = C.isaTempC(pa);
      const c = i === 2 ? 'acc' : 'sel';
      return `<path d="${fr.path(pts)}" class="s-${c} nf" ${i === 2 ? '' : 'opacity="0.7"'}/>` +
        `<circle cx="${f(fr.X(isaT))}" cy="${f(fr.Y(pa))}" r="3.5" class="f-surface s-line"/>` +
        text(f(fr.X(40) + 6), f(fr.Y(pts[pts.length - 1][1]) + 4), 'PA ' + pa, 't-' + c);
    }).join('') + text(fr.X(-8), fr.Y(12600), 'Circles: ISA temperature — there, density altitude equals pressure altitude', 't'));
  };

  // ---------------------------------------------------------------- 2.4 temperature error
  F.tempError = () => {
    const base = 250, s = 0.055;
    const cols = [[-20, 'Cold (ISA −20)', 'bad'], [0, 'ISA', 'line'], [20, 'Warm (ISA +20)', 'warn']];
    return svg(640, 300, 'Air column height in cold, standard and warm air', id => `
      <rect x="20" y="${base}" width="600" height="36" class="f-ground" rx="4"/>${line(20, base, 620, base, 's-line')}
      ${cols.map(([dev, name, c], i) => {
        const x = 90 + i * 190;
        const top = C.trueHeight(3000, dev, 0);
        const y = base - top * s;
        return `<rect x="${x - 40}" y="${f(y)}" width="80" height="${f(base - y)}" class="fa-sel s-thin"/>
          ${[1000, 2000, 3000].map(h => { const yy = base - C.trueHeight(h, dev, 0) * s; return line(x - 40, f(yy), x + 40, f(yy), 's-thin') + text(x + 46, f(yy + 4), h, 't tm'); }).join('')}
          <g transform="translate(${x} ${f(y - 10)})"><path d="M-16 -2 H12 Q18 0 12 2 H-16 Z M-3 -1 L2 -9 L6 -9 L4 -1 Z" class="f-${c === 'line' ? 'line' : c}"/></g>
          ${text(x, 286, name, 'tb', 'middle')}${text(x, f(y - 26), 'true ' + Math.round(top) + ' ft', c === 'line' ? 'tb' : 't-' + c, 'middle')}`;
      }).join('')}
      <path d="M172 ${base} L204 ${base - 2850 * s} L236 ${base}" class="f-ground s-line"/>${text(204, base - 2850 * s - 8, 'ridge 2850 ft', 't', 'middle')}
      ${text(20, 20, 'Every column shows the altimeter reading 3000 ft (QNH set at sea level).', 't')}`);
  };

  // ---------------------------------------------------------------- 3.1 airspeed chain
  F.speedChain = () => svg(640, 190, 'From indicated airspeed to ground speed', id => {
    const boxes = [['IAS', 'indicated', 'line'], ['CAS', 'calibrated', 'sel'], ['EAS', 'equivalent', 'sel'], ['TAS', 'true', 'acc'], ['GS', 'ground', 'live']];
    const notes = ['instrument &\nposition error', 'compressibility\n(high speed)', 'density\n× √(ρ₀/ρ)', 'wind'];
    return boxes.map(([k, s, c], i) => {
      const x = 14 + i * 126;
      return `<rect x="${x}" y="40" width="96" height="64" rx="10" class="f-surface s-${c === 'line' ? 'line' : c}"/>${text(x + 48, 72, k, c === 'line' ? 'tl' : 'tl', 'middle', `style="fill:var(--${c === 'line' ? 'text' : c === 'sel' ? 'sel' : c === 'acc' ? 'accent' : 'live'})"`)}${text(x + 48, 92, s, 't', 'middle')}` +
        (i < 4 ? arrow(id, x + 98, 72, x + 124, 72) + notes[i].split('\n').map((l, j) => text(x + 111, 128 + j * 15, l, 't', 'middle')).join('') : '');
    }).join('') + text(320, 22, 'Each step removes one error or effect', 'tb', 'middle') + text(320, 182, 'Low and slow: IAS ≈ CAS ≈ EAS. High and fast they all differ — the calculators do it exactly.', 't', 'middle');
  });

  // ---------------------------------------------------------------- 3.1 pitot static
  F.pitot = () => svg(640, 230, 'Pitot-static system and the airspeed indicator', id => `
    ${[60, 90].map(y => arrow(id, 20, y, 90, y, 'line', 'opacity="0.5"')).join('')}${text(20, 120, 'airflow', 't')}
    <path d="M100 70 H230 V80 H100 Z" class="f-soft s-line"/><circle cx="100" cy="75" r="4" class="f-acc"/>${text(100, 56, 'Pitot tube: total pressure P<tspan baseline-shift="sub" font-size="9">t</tspan>', 't-acc')}
    <path d="M40 170 H260" class="s-line"/><circle cx="150" cy="170" r="5" class="f-sel"/>${text(150, 196, 'Static port: static pressure P<tspan baseline-shift="sub" font-size="9">s</tspan>', 't-sel', 'middle')}
    <path d="M230 75 H420 V120" class="s-acc nf"/><path d="M155 165 V150 H520 V130" class="s-sel nf"/>
    <circle cx="470" cy="125" r="58" class="f-surface s-line"/>
    <path d="M440 125 q15 -22 30 0 q15 22 30 0" class="s-acc nf"/>${text(470, 100, 'capsule', 't', 'middle')}
    <line x1="470" y1="125" x2="505" y2="92" class="s-line"/><circle cx="470" cy="125" r="4" class="f-line"/>
    ${text(470, 205, 'q<tspan baseline-shift="sub" font-size="9">c</tspan> = P<tspan baseline-shift="sub" font-size="9">t</tspan> − P<tspan baseline-shift="sub" font-size="9">s</tspan> moves the needle → IAS', 'tb', 'middle')}
    ${text(600, 40, 'Blocked pitot: acts like an altimeter', 't', 'end')}${text(600, 58, 'Blocked static: freezes altimeter & VSI', 't', 'end')}`);

  // ---------------------------------------------------------------- 3.2 crossover chart
  F.crossover = () => {
    const cas = 290, M = 0.78;
    const xo = C.crossoverAltitude(cas, M).ft;
    const fr = frame(640, 300, { l: 58, r: 20, t: 14, b: 38 }, { min: 250, max: 520, ticks: range(250, 500, 50), label: 'True airspeed (kt, ISA)' },
      { min: 0, max: 42000, ticks: range(0, 40000, 10000), label: 'Pressure altitude (ft)', fmt: kft });
    const alts = range(0, 42000, 500);
    const casL = alts.map(a => [C.casToTas(cas, a, C.isaTempC(a)).tas, a]);
    const machL = alts.map(a => [C.machToTas(M, C.isaTempC(a)), a]);
    const flown = alts.map(a => [a <= xo ? C.casToTas(cas, a, C.isaTempC(a)).tas : C.machToTas(M, C.isaTempC(a)), a]);
    const xt = C.machToTas(M, C.isaTempC(xo));
    return svg(640, 300, 'Constant CAS and constant Mach lines crossing at the crossover altitude', id => fr.grid +
      `<path d="${fr.path(casL)}" class="s-sel nf" stroke-dasharray="6 5"/><path d="${fr.path(machL)}" class="s-live nf" stroke-dasharray="6 5"/>
       <path d="${fr.path(flown)}" class="s-acc nf" style="stroke-width:4"/>
       <circle cx="${f(fr.X(xt))}" cy="${f(fr.Y(xo))}" r="5" class="f-acc"/>${text(f(fr.X(xt) - 10), f(fr.Y(xo) + 4), 'crossover ≈ FL' + Math.round(xo / 100), 't-acc', 'end')}
       ${text(f(fr.X(C.casToTas(cas, 8000, C.isaTempC(8000)).tas) + 8), f(fr.Y(8000)), cas + ' KCAS', 't-sel')}
       ${text(f(fr.X(C.machToTas(M, C.isaTempC(38000))) + 8), f(fr.Y(38000)), 'M' + M.toFixed(2), 't-live')}
       ${text(fr.X(254), fr.Y(40000), 'Bold: the speed you actually fly on a 290 kt / M0.78 climb', 't')}`);
  };

  // ---------------------------------------------------------------- 4.1 wind triangle
  F.windTriangle = () => svg(640, 300, 'The wind triangle', id => {
    const O = [100, 240], s = 3.4;
    const tas = 120, hd = 80.8, ws = 25, wfrom = 40;
    const A = [O[0] + tas * s * Math.sin(hd * Math.PI / 180), O[1] - tas * s * Math.cos(hd * Math.PI / 180)];
    const to = wfrom + 180;
    const G = [A[0] + ws * s * Math.sin(to * Math.PI / 180), A[1] - ws * s * Math.cos(to * Math.PI / 180)];
    return `
      ${arrow(id, 40, 120, 40, 50, 'line')}${text(40, 42, 'N', 'tb', 'middle')}
      ${arrow(id, O[0], O[1], f(A[0]), f(A[1]), 'sel')}${text(290, 184, 'Heading 081° · TAS 120 kt', 't-sel', 'middle', 'transform="rotate(-9 290 184)"')}
      ${arrow(id, f(A[0]), f(A[1]), f(G[0]), f(G[1]), 'warn')}${text(f(A[0] + 14), f((A[1] + G[1]) / 2), 'Wind 040° / 25 kt', 't-warn')}
      ${arrow(id, O[0], O[1], f(G[0]), f(G[1]), 'acc')}${text(290, 262, 'Track 090° · GS 102 kt', 't-acc', 'middle')}
      <path d="${arcPath(O[0], O[1], 120, -9.2, 0)}" class="s-line nf"/>${text(O[0] + 128, O[1] - 4, 'WCA 9°', 'tb')}
      ${text(20, 24, 'Air vector + wind vector = ground vector', 'tb')}
      ${text(620, 290, 'Crab into the wind by the WCA to hold the track', 't', 'end')}`;
  });

  // ---------------------------------------------------------------- 4.2 crosswind
  F.crosswind = () => svg(640, 300, 'Headwind and crosswind components on a runway', id => {
    const rx = 250, top = 24, bottom = 276;
    const P = [352, 214], Lw = 150, a = 40;
    const dir = [-Math.sin(a * Math.PI / 180), Math.cos(a * Math.PI / 180)];
    const T = [P[0] - Lw * dir[0], P[1] - Lw * dir[1]];
    return `
      <rect x="${rx - 26}" y="${top}" width="52" height="${bottom - top}" class="f-soft s-line"/>
      ${range(0, 8, 1).map(i => line(rx, bottom - 24 - i * 28, rx, bottom - 38 - i * 28, 's-line')).join('')}
      ${text(rx, bottom + 18, 'RWY 26 · 263°', 'tb', 'middle')}
      ${arrow(id, rx, 250, rx, 150, 'line')}${text(rx - 34, 204, 'landing', 't', 'end')}
      ${arrow(id, f(T[0]), f(T[1]), P[0], P[1], 'warn')}${text(f(T[0] + 10), f(T[1] - 4), 'Wind 303° / 20 kt', 't-warn')}
      ${arrow(id, f(T[0]), f(T[1]), f(T[0]), P[1], 'acc')}${text(f(T[0] + 10), f((T[1] + P[1]) / 2 + 20), 'Headwind = V cos α', 't-acc')}
      ${arrow(id, f(T[0]), P[1], P[0], P[1], 'sel')}${text(f((T[0] + P[0]) / 2), P[1] + 20, 'Crosswind = V sin α', 't-sel', 'middle')}
      <path d="${arcPath(T[0], T[1], 44, 90, 90 + a)}" class="s-line nf"/>${text(f(T[0] - 12), f(T[1] + 58), 'α', 'tb', 'end')}
      <g transform="translate(96 70)">${text(0, 0, 'Clock code', 'tb', 'middle')}
        ${[['15°', '¼'], ['30°', '½'], ['45°', '¾'], ['60°+', 'all']].map(([ang, k], i) => text(-66, 28 + i * 22, ang, 't tm') + text(66, 28 + i * 22, k + ' of the wind', 't', 'end')).join('')}
        ${text(0, 132, 'minutes past the hour', 't', 'middle')}${text(0, 148, '= fraction of an hour', 't', 'middle')}</g>`;
  });

  // ---------------------------------------------------------------- 4.3 great circle & 1-in-60
  F.greatCircle = () => svg(640, 300, 'Great circle versus rhumb line, and the 1-in-60 rule', id => {
    const W = 380, H = 240, x0 = 20, y0 = 30;
    const lon0 = -80, lon1 = 10, lat0 = 30, lat1 = 70;
    const merc = la => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
    const PX = lo => x0 + (lo - lon0) / (lon1 - lon0) * W;
    const PY = la => y0 + H - (merc(la) - merc(lat0)) / (merc(lat1) - merc(lat0)) * H;
    const a = [40.64, -73.78], b = [51.47, -0.45];
    const toV = (la, lo) => [Math.cos(la * Math.PI / 180) * Math.cos(lo * Math.PI / 180), Math.cos(la * Math.PI / 180) * Math.sin(lo * Math.PI / 180), Math.sin(la * Math.PI / 180)];
    const va = toV(...a), vb = toV(...b);
    const om = Math.acos(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]);
    const gc = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, k1 = Math.sin((1 - t) * om) / Math.sin(om), k2 = Math.sin(t * om) / Math.sin(om);
      const v = [k1 * va[0] + k2 * vb[0], k1 * va[1] + k2 * vb[1], k1 * va[2] + k2 * vb[2]];
      const la = Math.asin(v[2]) * 180 / Math.PI, lo = Math.atan2(v[1], v[0]) * 180 / Math.PI;
      gc.push((i ? 'L' : 'M') + f(PX(lo)) + ' ' + f(PY(la)));
    }
    let grid = '';
    for (let lo = -80; lo <= 10; lo += 15) grid += line(f(PX(lo)), y0, f(PX(lo)), y0 + H, 's-grid');
    for (let la = 30; la <= 70; la += 10) grid += line(x0, f(PY(la)), x0 + W, f(PY(la)), 's-grid') + text(x0 + W - 4, f(PY(la) - 3), la + '°N', 't', 'end');
    const d = C.greatCircle(a[0], a[1], b[0], b[1]);
    return `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" class="f-sky" rx="6"/>${grid}
      <path d="M${f(PX(a[1]))} ${f(PY(a[0]))} L${f(PX(b[1]))} ${f(PY(b[0]))}" class="s-sel nf" stroke-dasharray="7 5"/>
      <path d="${gc.join(' ')}" class="s-acc nf"/>
      <circle cx="${f(PX(a[1]))}" cy="${f(PY(a[0]))}" r="5" class="f-line"/>${text(f(PX(a[1]) - 4), f(PY(a[0]) + 20), 'New York', 'tb')}
      <circle cx="${f(PX(b[1]))}" cy="${f(PY(b[0]))}" r="5" class="f-line"/>${text(f(PX(b[1])), f(PY(b[0]) + 20), 'London', 'tb', 'end')}
      ${text(x0 + 8, y0 + 18, 'Great circle ' + Math.round(d.distNm) + ' NM (curves north on this chart)', 't-acc')}
      ${text(f(PX(-28)), f(PY(40.2)), 'Rhumb line: one course, longer', 't-sel', 'middle')}
      <g transform="translate(422 60)">${text(80, 0, '1-in-60 rule', 'tb', 'middle')}
        <path d="M0 150 L160 150 L160 122 Z" class="fa-acc s-line"/>${text(80, 170, '60 NM flown', 't', 'middle')}${text(166, 140, '1 NM', 't')}
        <path d="${arcPath(0, 150, 60, -9.5, 0)}" class="s-acc nf"/>${text(66, 144, '1°', 't-acc')}
        ${text(80, 200, 'Off track 1 NM after 60 NM', 't', 'middle')}${text(80, 216, '= 1° of track error', 't', 'middle')}</g>`;
  });

  // ---------------------------------------------------------------- 4.4 holding
  F.holding = () => svg(640, 360, 'Right-hand holding pattern and entry sectors', id => {
    const fx = 300, fy = 190, r = 26, L = 90, R0 = 160;
    const pts = b => brg(fx, fy, b, R0);
    const p0 = pts(0), p110 = pts(110), p290 = pts(290);
    const lab = (b, rr, s, c) => { const [x, y] = brg(fx, fy, b, rr); return text(f(x), f(y), s, c, 'middle'); };
    const ex0 = brg(fx, fy, 318, 150), ex1 = brg(fx, fy, 318, 16);
    return `
      <path d="M${fx} ${fy} L${f(p0[0])} ${f(p0[1])} A${R0} ${R0} 0 0 1 ${f(p110[0])} ${f(p110[1])} Z" class="fa-warn"/>
      <path d="M${fx} ${fy} L${f(p290[0])} ${f(p290[1])} A${R0} ${R0} 0 0 1 ${f(p0[0])} ${f(p0[1])} Z" class="fa-sel"/>
      <path d="M${fx} ${fy} L${f(p110[0])} ${f(p110[1])} A${R0} ${R0} 0 0 1 ${f(p290[0])} ${f(p290[1])} Z" class="fa-live"/>
      ${line(fx, fy, f(p0[0]), f(p0[1]), 's-dash')}${line(f(p110[0]), f(p110[1]), f(p290[0]), f(p290[1]), 's-dash')}
      ${lab(52, 110, 'PARALLEL · 110°', 't-warn')}${lab(338, 102, 'TEARDROP · 70°', 't-sel')}${lab(222, 138, 'DIRECT · 180°', 't-live')}
      <path d="${arcPath(fx, fy, 38, 290 - 90, 360 - 90)}" class="s-thin nf"/>${lab(325, 50, '70°', 't')}
      <path d="M${fx} ${fy + L} V${fy} A${r} ${r} 0 0 1 ${fx + 2 * r} ${fy} V${fy + L} A${r} ${r} 0 0 1 ${fx} ${fy + L}" class="s-acc nf"/>
      ${arrow(id, fx, fy + 62, fx, fy + 38, 'acc')}${arrow(id, fx + 2 * r, fy + 38, fx + 2 * r, fy + 62, 'acc')}
      <circle cx="${fx}" cy="${fy}" r="6" class="f-surface s-line"/><path d="M${fx - 3} ${fy} L${fx} ${fy - 3} L${fx + 3} ${fy} L${fx} ${fy + 3} Z" class="f-line"/>
      ${text(fx - 12, fy + 4, 'FIX', 'tb', 'end')}${text(fx - 10, fy + 74, 'inbound', 't', 'end')}${text(fx + 2 * r + 10, fy + 74, 'outbound · 1 min', 't')}
      ${arrow(id, 30, 52, 30, 18, 'line')}${text(42, 32, 'N · inbound course 360°', 't')}
      ${arrow(id, f(ex0[0]), f(ex0[1]), f(ex1[0]), f(ex1[1]), 'line', 'stroke-dasharray="4 4"')}${text(f(ex0[0] - 6), f(ex0[1] - 6), 'arriving from here: teardrop', 't', 'end')}`;
  });

  // ---------------------------------------------------------------- 4.5 descent profile
  F.descent = () => svg(640, 250, 'Top of descent and a 3° descent path', id => `
    <rect x="20" y="214" width="600" height="22" class="f-ground" rx="4"/>
    ${line(20, 214, 620, 214, 's-line')}
    <path d="M30 50 H230" class="s-sel nf"/>${text(40, 42, 'Cruise FL360', 't-sel')}
    <path d="M230 50 L500 176" class="s-acc nf"/>${text(360, 102, '3° path · 318 ft per NM', 't-acc', 'middle', 'transform="rotate(25 360 102)"')}
    <path d="M500 176 H600" class="s-live nf"/>${text(550, 168, 'slow down', 't-live', 'middle')}
    <circle cx="230" cy="50" r="5" class="f-acc"/>${text(230, 34, 'TOD', 'tb', 'middle')}
    ${dbl(id, 612, 50, 612, 176)}${text(606, 116, 'ΔH', 'tb', 'end')}
    ${dbl(id, 230, 196, 500, 196)}${text(365, 192, 'D = ΔH / 318', 'tb', 'middle')}
    ${dbl(id, 500, 196, 600, 196)}${text(550, 192, '+ decel', 't', 'middle')}
    ${text(30, 244, 'Rules of thumb: D ≈ 3 NM per 1000 ft · VS ≈ 5 × ground speed · add ~1 NM per 10 kt to lose', 't')}`);

  // ---------------------------------------------------------------- 5.1 mass & balance
  F.massBalance = () => svg(640, 300, 'Weights acting at their arms from the datum, and the centre of gravity', id => {
    const x0 = 60, sc = 200, yb = 150;
    const st = [['Front seats', 0.94, 170], ['Empty aircraft', 0.99, 767], ['Fuel', 1.22, 110], ['Rear seats', 1.85, 80], ['Baggage', 2.41, 20]];
    const r = C.massBalance(st.map(([, a, m]) => ({ mass: m, arm: a })));
    const X = a => x0 + a * sc;
    const rows = [0, 1, 2, 0, 1];
    return `
      ${line(x0, 24, x0, 270, 's-line')}${text(x0 + 6, 34, 'Datum', 'tb')}
      <rect x="${x0}" y="${yb - 4}" width="${2.7 * sc}" height="8" class="f-soft s-line"/>
      ${st.map(([n, a, m], i) => {
        const len = 18 + 3.2 * Math.sqrt(m), ly = yb + 34 + rows[i] * 22;
        return arrow(id, f(X(a)), f(yb - 6 - len), f(X(a)), yb - 6, 'sel') +
          line(f(X(a)), yb + 6, f(X(a)), ly - 12, 's-thin') + text(f(X(a)), ly, n + ' ' + m + ' kg', 't', 'middle');
      }).join('')}
      <path d="M${f(X(r.cg))} ${yb + 5} l-10 18 h20 z" class="f-acc"/>
      ${dbl(id, x0, 258, f(X(r.cg)), 258, 'acc')}${text(f(X(r.cg) + 10), 262, 'CG ' + r.cg.toFixed(2) + ' m aft of datum', 't-acc')}
      ${[0, 1, 2].map(i => line(f(X(i)), 274, f(X(i)), 280, 's-thin') + text(f(X(i)), 293, i + ' m', 't tm', 'middle')).join('')}
      ${text(628, 34, 'CG = Σ(mass × arm) ÷ Σ mass', 'tb', 'end')}${text(628, 52, 'arrow length ∝ √mass', 't', 'end')}`;
  });

  // ---------------------------------------------------------------- 5.2 take-off
  F.takeoff = () => svg(640, 320, 'Take-off speeds and distances', id => `
    ${text(24, 28, 'V1 ≤ VR ≤ V2 · V2 ≥ 1.13 V<tspan baseline-shift="sub" font-size="9">S1g</tspan> · balanced field: V1 chosen so the go and stop distances match', 'tb')}
    <rect x="30" y="196" width="520" height="16" class="f-soft s-line"/>${text(290, 208, 'TORA — take-off run available', 't', 'middle')}
    <rect x="550" y="196" width="64" height="16" class="fa-sel s-thin"/>${text(582, 230, 'clearway', 't-sel', 'middle')}
    ${line(30, 186, 30, 222, 's-line')}
    ${line(300, 110, 300, 222, 's-dash')}${text(300, 104, 'V1', 'tl', 'middle')}${text(300, 88, 'decision', 't', 'middle')}
    ${line(370, 110, 370, 222, 's-dash')}${text(370, 104, 'VR', 'tl', 'middle')}${text(370, 88, 'rotate', 't', 'middle')}
    <path d="M30 196 H400 Q470 194 604 150" class="s-acc nf"/>
    ${line(604, 150, 604, 196, 's-line')}${text(596, 176, '35 ft', 't', 'end')}${text(604, 138, 'V2', 'tl', 'middle')}
    <g transform="translate(96 190)"><path d="M-16 -2 H12 Q18 0 12 2 H-16 Z M-3 -1 L2 -9 L6 -9 L4 -1 Z" class="f-line"/></g>
    ${arrow(id, 300, 262, 612, 262, 'live')}${text(456, 254, 'engine fails after V1: continue, 35 ft by the end of TODA', 't-live', 'middle')}
    ${arrow(id, 300, 296, 548, 296, 'bad')}${text(424, 288, 'fails before V1: reject, stop within ASDA', 't-bad', 'middle')}`);

  // ---------------------------------------------------------------- 5.3 landing
  F.landing = () => svg(640, 250, 'Landing distance segments', id => `
    <rect x="110" y="180" width="500" height="16" class="f-soft s-line"/>${text(360, 192, 'LDA — landing distance available', 't', 'middle')}
    <path d="M10 108 L120 150 Q170 174 240 180" class="s-acc nf"/>
    ${line(120, 150, 120, 180, 's-line')}${text(126, 146, '50 ft at Vref', 't-acc')}
    <circle cx="240" cy="180" r="4" class="f-acc"/>${text(240, 170, 'touchdown', 't', 'middle')}
    ${dbl(id, 120, 214, 240, 214, 'sel')}${text(180, 232, 'air distance', 't-sel', 'middle')}
    ${dbl(id, 240, 214, 290, 214, 'warn')}${text(265, 246, 'transition', 't-warn', 'middle')}
    ${dbl(id, 290, 214, 520, 214, 'bad')}${text(405, 232, 'braking  V² / 2a', 't-bad', 'middle')}
    ${line(520, 170, 520, 222, 's-line')}${text(520, 164, 'stop', 'tb', 'middle')}
    ${text(20, 30, 'Actual landing distance (ALD) = air + transition + braking', 'tb')}
    ${text(20, 50, 'In flight: ALD × 1.15 must fit · At dispatch: certified distance ÷ 0.6 (wet × 1.15)', 't')}`);

  // ---------------------------------------------------------------- 5.4 fuel stack
  F.fuel = () => svg(640, 200, 'Components of block fuel', id => {
    const parts = [['Taxi', 200, 'f-muted'], ['Trip', 3130, 'f-acc'], ['Cont.', 183, 'f-warn'], ['Alternate', 1098, 'f-sel'], ['Final reserve', 1100, 'f-bad']];
    const tot = parts.reduce((a, p) => a + p[1], 0);
    let x = 20; const W = 600;
    const bars = parts.map(([n, v, c]) => { const w = v / tot * W; const s = `<rect x="${f(x)}" y="60" width="${f(w)}" height="44" class="${c}"/>` + (w > 52 ? text(f(x + w / 2), 87, n, 'tb', 'middle', 'style="fill:var(--surface)"') : text(f(x + w / 2), 122, n, 't', 'middle')); x += w; return s; }).join('');
    const tx = 20 + 200 / tot * W;
    return `${bars}${dbl(id, f(tx), 142, 620, 142, 'line')}${text(f((tx + 620) / 2), 160, 'take-off fuel', 't', 'middle')}
      ${dbl(id, 20, 180, 620, 180, 'line')}${text(320, 196, 'block fuel (at the gate)', 'tb', 'middle')}
      ${text(20, 36, 'Example: 737-800, 500 NM, 100 NM alternate — kg', 't')}`;
  });

  // ---------------------------------------------------------------- 5.5 flex
  F.flex = () => {
    const fr = frame(640, 300, { l: 54, r: 20, t: 16, b: 38 }, { min: 0, max: 75, ticks: range(0, 75, 15), label: 'Temperature (°C) at sea level' },
      { min: 55, max: 105, ticks: range(60, 100, 10), label: 'Thrust available (% of rated)', fmt: v => v + '%' });
    const thr = t => (t <= 30 ? 100 : 100 * (1 - 0.0063 * (t - 30)));
    const pts = range(0, 75, 1).map(t => [t, thr(t)]);
    const need = 83, tf = 30 + (1 - need / 100) / 0.0063;
    return svg(640, 300, 'Thrust against temperature and the assumed temperature', id => fr.grid +
      `<path d="${fr.path(pts)}" class="s-sel nf"/>
       ${line(fr.X(0), f(fr.Y(need)), fr.X(75), f(fr.Y(need)), 's-dash')}${text(fr.X(1), f(fr.Y(need) - 6), 'thrust this runway and weight actually need', 't')}
       ${line(fr.X(0), f(fr.Y(75)), fr.X(75), f(fr.Y(75)), 's-thin')}${text(fr.X(1), f(fr.Y(75) + 14), '25 % reduction limit', 't')}
       <circle cx="${f(fr.X(15))}" cy="${f(fr.Y(100))}" r="5" class="f-live"/>${text(f(fr.X(15)), f(fr.Y(100) - 10), 'OAT 15 °C: full thrust', 't-live', 'middle')}
       <circle cx="${f(fr.X(tf))}" cy="${f(fr.Y(need))}" r="5" class="f-acc"/>${text(f(fr.X(tf) + 8), f(fr.Y(need) - 8), 'assumed ' + tf.toFixed(0) + ' °C', 't-acc')}
       ${text(f(fr.X(31)), f(fr.Y(101.5)), 'flat-rated to 30 °C', 't-sel')}`);
  };

  // ================================================================ MORE TOPICS
  /** Drag model of a 65 t narrow-body (CD0 0.022, aspect ratio 9.45, e 0.8) at sea level, EAS. */
  const JET = { W: 65000 * 9.80665, S: 124.6, cd0: 0.022, k: 1 / (Math.PI * 9.45 * 0.8) };
  F.jetDrag = v => {
    const q = 0.5 * 1.225 * Math.pow(v * 0.514444, 2), cl = JET.W / (q * JET.S);
    return { para: q * JET.S * JET.cd0 / 1000, ind: q * JET.S * JET.k * cl * cl / 1000 };
  };
  F.jetVmd = () => Math.sqrt(2 * JET.W / (1.225 * JET.S) * Math.sqrt(JET.k / JET.cd0)) / 0.514444;

  // ---------------------------------------------------------------- 1.6 drag curve
  F.dragCurve = () => {
    const fr = frame(640, 300, { l: 56, r: 24, t: 16, b: 40 }, { min: 120, max: 400, ticks: range(120, 400, 40), label: 'Equivalent airspeed (kt) — 65 t narrow-body' },
      { min: 0, max: 80, ticks: range(0, 80, 20), label: 'Drag (kN)' });
    const vs = range(120, 400, 4);
    const pts = k => vs.map(v => { const d = F.jetDrag(v); return [v, k === 'tot' ? d.para + d.ind : d[k]]; }).filter(p => p[1] <= 82);
    const vmd = F.jetVmd(), dmd = F.jetDrag(vmd), vr = vmd * Math.pow(3, 0.25);
    return svg(640, 300, 'Drag against speed: parasite, induced and total', id => fr.grid +
      `<rect x="${fr.X(120)}" y="16" width="${f(fr.X(vmd) - fr.X(120))}" height="244" class="fa-warn"/>
       <path d="${fr.path(pts('para'))}" class="s-sel nf"/><path d="${fr.path(pts('ind'))}" class="s-live nf"/><path d="${fr.path(pts('tot'))}" class="s-acc nf" style="stroke-width:3.4"/>
       ${line(f(fr.X(vmd)), f(fr.Y(dmd.para + dmd.ind)), f(fr.X(vmd)), 260, 's-dash')}<circle cx="${f(fr.X(vmd))}" cy="${f(fr.Y(dmd.para + dmd.ind))}" r="5" class="f-acc"/>
       ${text(f(fr.X(vmd)), f(fr.Y(dmd.para + dmd.ind) + 22), 'Vmd ' + Math.round(vmd) + ' kt · best L/D', 't-acc', 'middle')}
       ${line(f(fr.X(vr)), 150, f(fr.X(vr)), 260, 's-dash')}${text(f(fr.X(vr) + 6), 160, '1.32 Vmd ≈ ' + Math.round(vr) + ' kt', 't')}${text(f(fr.X(vr) + 6), 176, 'best range (jet)', 't')}
       <g transform="translate(${f(fr.X(232))} ${f(fr.Y(78))})"><rect x="-10" y="-14" width="178" height="62" rx="6" class="f-surface s-thin"/>
         ${line(0, 0, 24, 0, 's-acc')}${text(32, 4, 'total drag', 't-acc')}${line(0, 18, 24, 18, 's-sel')}${text(32, 22, 'parasite ∝ V²', 't-sel')}${line(0, 36, 24, 36, 's-live')}${text(32, 40, 'induced ∝ 1/V²', 't-live')}</g>
       ${text(fr.X(124), fr.Y(75), 'slower than Vmd:', 't-warn')}${text(fr.X(124), fr.Y(70.5), 'speed unstable', 't-warn')}`);
  };

  // ---------------------------------------------------------------- 1.7 climb: Vx and Vy
  F.climbModel = () => {
    const g = 9.80665, W = 1157 * g, S = 16.2, cd0 = 0.031, k = 1 / (Math.PI * 7.32 * 0.72), Pw = 128000;
    const eta = V => 0.82 * (1 - Math.exp(-V / 28));
    const pts = [];
    for (let kt = 50; kt <= 125; kt += 0.5) {
      const V = kt * 0.514444, q = 0.5 * 1.225 * V * V, cl = W / (q * S), D = q * S * (cd0 + k * cl * cl), T = eta(V) * Pw / V;
      pts.push({ kt, angle: Math.asin(Math.max(-1, Math.min(1, (T - D) / W))) * 180 / Math.PI, roc: (T - D) * V / W * 196.85 });
    }
    const vx = pts.reduce((a, b) => (b.angle > a.angle ? b : a)), vy = pts.reduce((a, b) => (b.roc > a.roc ? b : a));
    return { pts, vx, vy };
  };
  F.climb = () => {
    const m = F.climbModel();
    const fr = frame(640, 300, { l: 56, r: 56, t: 16, b: 40 }, { min: 50, max: 125, ticks: range(50, 125, 10), label: 'Indicated airspeed (kt) — light single, sea level, maximum weight' },
      { min: 0, max: 900, ticks: range(0, 900, 150), label: 'Rate of climb (fpm)' });
    const aY = a => fr.Y(a / 6 * 900);
    const angPath = m.pts.map((p, i) => (i ? 'L' : 'M') + f(fr.X(p.kt)) + ' ' + f(aY(p.angle))).join(' ');
    let right = '';
    for (let a = 0; a <= 6; a += 1) right += text(f(fr.X(125) + 8), f(aY(a) + 4), a + '°', 't tm');
    return svg(640, 300, 'Climb angle and rate of climb against speed', id => fr.grid + right +
      `<path d="${fr.path(m.pts.map(p => [p.kt, p.roc]))}" class="s-acc nf"/><path d="${angPath}" class="s-sel nf" stroke-dasharray="7 5"/>
       <circle cx="${f(fr.X(m.vx.kt))}" cy="${f(aY(m.vx.angle))}" r="5" class="f-sel"/>${text(f(fr.X(m.vx.kt)), f(aY(m.vx.angle) - 9), 'Vx', 't-sel', 'middle')}
       <circle cx="${f(fr.X(m.vy.kt))}" cy="${f(fr.Y(m.vy.roc))}" r="5" class="f-acc"/>${text(f(fr.X(m.vy.kt)), f(fr.Y(m.vy.roc) + 20), 'Vy', 't-acc', 'middle')}
       ${line(f(fr.X(m.vx.kt)), f(aY(m.vx.angle)), f(fr.X(m.vx.kt)), 260, 's-dash')}${line(f(fr.X(m.vy.kt)), f(fr.Y(m.vy.roc) + 26), f(fr.X(m.vy.kt)), 260, 's-dash')}
       <g transform="translate(${f(fr.X(80))} ${f(fr.Y(260))})"><rect x="-8" y="-16" width="232" height="46" rx="6" class="f-surface s-thin"/>
         ${text(0, 0, 'Vx ' + Math.round(m.vx.kt) + ' kt — steepest, ' + m.vx.angle.toFixed(1) + '°', 't-sel')}${text(0, 20, 'Vy ' + Math.round(m.vy.kt) + ' kt — fastest, ' + Math.round(m.vy.roc) + ' fpm', 't-acc')}</g>
       ${text(f(fr.X(125) + 46), f((16 + 260) / 2), 'Climb angle', 't-sel', 'middle', `transform="rotate(90 ${f(fr.X(125) + 46)} ${f((16 + 260) / 2)})"`)}
       ${text(fr.X(124), fr.Y(20), 'solid: rate · dashed: angle', 't', 'end')}`);
  };

  // ---------------------------------------------------------------- 1.8 stability & CG
  F.stability = () => svg(640, 290, 'Longitudinal balance: lift, weight, tail load and the static margin', id => {
    const y = 138;
    return `<path d="M58 ${y} Q70 ${y - 16} 110 ${y - 18} H520 L560 ${y - 44} H584 L578 ${y - 6} Q540 ${y + 10} 500 ${y + 12} H110 Q66 ${y + 12} 58 ${y} Z" class="f-soft s-line"/>
      <path d="M190 ${y + 4} L330 ${y + 4} L318 ${y + 13} L196 ${y + 13} Z" class="f-line"/>
      <path d="M520 ${y - 8} L596 ${y - 8} L592 ${y - 2} L524 ${y - 2} Z" class="f-line"/>
      ${text(229, y + 94, 'CG range', 't-sel', 'middle')}<rect x="202" y="${y + 102}" width="54" height="12" class="fa-sel"/>
      ${line(202, y + 98, 202, y + 118, 's-sel')}${line(256, y + 98, 256, y + 118, 's-sel')}${text(198, y + 134, 'forward limit', 't', 'end')}${text(260, y + 134, 'aft limit', 't')}
      ${arrow(id, 262, y - 4, 262, 44, 'acc')}${text(314, 58, 'Wing lift at the', 't-acc')}${text(314, 74, 'aerodynamic centre', 't-acc')}
      ${arrow(id, 232, y + 20, 232, y + 72, 'bad')}<circle cx="232" cy="${y + 6}" r="7" class="f-surface s-line"/><path d="M232 ${y - 1} A7 7 0 0 1 239 ${y + 6} H232 Z M232 ${y + 13} A7 7 0 0 1 225 ${y + 6} H232 Z" class="f-line"/>
      ${text(222, y + 58, 'Weight', 't-bad', 'end')}${text(222, y + 74, 'at the CG', 't-bad', 'end')}
      ${arrow(id, 558, y - 12, 558, y + 44, 'warn')}${text(548, y + 40, 'tail down-load', 't-warn', 'end')}
      <path d="M298 ${y - 10} l6 -10 l6 10 z" class="f-live"/>${text(312, y - 14, 'neutral point', 't-live')}
      ${dbl(id, 232, 26, 304, 26, 'live')}${text(268, 18, 'static margin', 't-live', 'middle')}${line(232, 30, 232, y - 8, 's-dash')}${line(304, 30, 304, y - 22, 's-dash')}
      ${text(620, 206, 'CG ahead of the neutral point = stable:', 'tb', 'end')}${text(620, 224, 'a gust that lifts the nose makes', 't', 'end')}${text(620, 240, 'a nose-down moment.', 't', 'end')}
      ${text(620, 262, 'Forward CG: heavier, higher stall speed.', 't', 'end')}${text(620, 280, 'Aft CG: lighter, less stable.', 't', 'end')}`;
  });

  // ---------------------------------------------------------------- 4.6 true / magnetic / compass
  F.northArrows = () => svg(640, 300, 'True, magnetic and compass north with variation and deviation', id => {
    const O = [150, 262], L = 206;
    const aM = 26, aC = 40, aH = 74;                  // drawn angles (exaggerated): VAR 8° E, DEV 3° E, heading 070° T
    const P = (b, r) => brg(O[0], O[1], b, r);
    const tN = P(0, L), mN = P(aM, L - 6), cN = P(aC, L - 18), h = P(aH, L - 10);
    const lab = (b, r) => P(b, r).map(v => f(v));
    return `${arrow(id, O[0], O[1], f(tN[0]), f(tN[1]), 'line')}${text(f(tN[0]), f(tN[1] - 8), 'True north', 'tb', 'middle')}
      ${arrow(id, O[0], O[1], f(mN[0]), f(mN[1]), 'sel')}${text(f(mN[0] + 8), f(mN[1] + 4), 'Magnetic north', 't-sel')}
      ${arrow(id, O[0], O[1], f(cN[0]), f(cN[1]), 'warn')}${text(f(cN[0] + 8), f(cN[1] + 8), 'Compass north', 't-warn')}
      ${arrow(id, O[0], O[1], f(h[0]), f(h[1]), 'acc')}${text(f(h[0] - 6), f(h[1] + 22), 'Heading 070°T', 't-acc', 'end')}
      <path d="${arcPath(O[0], O[1], 96, -90, -90 + aM)}" class="s-sel nf"/>${text(...lab(aM / 2, 108), 'VAR 8°E', 't-sel', 'middle')}
      <path d="${arcPath(O[0], O[1], 150, -90 + aM, -90 + aC)}" class="s-warn nf"/>${text(...lab(aC + 4, 150), 'DEV 3°E', 't-warn')}
      <circle cx="${O[0]}" cy="${O[1]}" r="4" class="f-line"/>${text(O[0] - 10, O[1] + 4, 'angles exaggerated', 't', 'end')}
      <g transform="translate(372 50)">${text(0, 0, 'From true to compass', 'tb')}
        ${[['TRUE', '070°', 'line'], ['− VAR 8°E', '', 'sel'], ['MAGNETIC', '062°', 'sel'], ['− DEV 3°E', '', 'warn'], ['COMPASS', '059°', 'warn']].map(([a, b, c], i) =>
          (b ? `<rect x="0" y="${14 + i * 30}" width="240" height="26" rx="6" class="f-surface s-thin"/>${text(12, 32 + i * 30, a, 't')}${text(228, 32 + i * 30, b, c === 'line' ? 'tb' : 't-' + c, 'end')}` : text(24, 33 + i * 30, a, 't-' + c))).join('')}
        ${text(0, 186, 'East is least, west is best:', 'tb')}${text(0, 204, 'subtract easterly variation and', 't')}${text(0, 222, 'deviation going towards compass,', 't')}${text(0, 240, 'add westerly.', 't')}</g>`;
  });

  // ---------------------------------------------------------------- 4.7 VOR / DME
  F.vorDme = () => svg(640, 300, 'VOR radials and DME slant range', id => {
    const O = [150, 150], R = 112;
    let rose = '';
    for (let b = 0; b < 360; b += 10) { const [x0, y0] = brg(O[0], O[1], b, R), [x1, y1] = brg(O[0], O[1], b, R - (b % 30 ? 6 : 12)); rose += line(f(x0), f(y0), f(x1), f(y1), 's-thin'); }
    for (const [b, s] of [[0, '36'], [90, '9'], [180, '18'], [270, '27']]) { const [x, y] = brg(O[0], O[1], b, R - 26); rose += text(f(x), f(y + 5), s, 'tb', 'middle'); }
    const A = brg(O[0], O[1], 60, 84);
    return `<circle cx="${O[0]}" cy="${O[1]}" r="${R}" class="f-surface s-line"/>${rose}
      ${arrow(id, O[0], O[1], ...brg(O[0], O[1], 60, R + 26).map(v => f(v)), 'sel')}${text(252, 70, 'radial 060', 't-sel')}
      <g transform="translate(${f(A[0])} ${f(A[1])}) rotate(240)"><path d="M0 -12 L4 -2 L14 4 L14 7 L3 4 L2 11 L6 14 L6 16 L0 14 L-6 16 L-6 14 L-2 11 L-3 4 L-14 7 L-14 4 L-4 -2 Z" class="f-acc"/></g>
      ${text(f(A[0] + 12), f(A[1] + 30), 'inbound 240°', 't-acc')}
      <path d="M${O[0] - 7} ${O[1]} L${O[0]} ${O[1] - 7} L${O[0] + 7} ${O[1]} L${O[0]} ${O[1] + 7} Z" class="f-line"/>
      ${text(O[0], 290, 'A radial is the magnetic bearing FROM the station', 't', 'middle')}
      <g transform="translate(330 0)">
        <rect x="10" y="236" width="290" height="10" class="f-ground"/>${line(10, 236, 300, 236, 's-line')}
        <path d="M34 236 l-8 -16 h16 z" class="f-line"/>${text(34, 262, 'DME', 'tb', 'middle')}
        <g transform="translate(262 70)"><path d="M-16 -2 H12 Q18 0 12 2 H-16 Z M-3 -1 L2 -9 L6 -9 L4 -1 Z" class="f-line"/></g>
        ${line(34, 220, 262, 74, 's-acc')}${text(128, 136, 'slant range', 't-acc', 'middle', 'transform="rotate(-32 128 136)"')}${text(150, 154, '(what the DME shows)', 't', 'middle', 'transform="rotate(-32 150 154)"')}
        ${dbl(id, 262, 78, 262, 232, 'sel')}${text(270, 160, 'height', 't-sel')}
        ${dbl(id, 38, 226, 258, 226, 'live')}${text(150, 220, 'ground distance', 't-live', 'middle')}
        ${text(10, 30, 'ground = √(DME² − height²)', 'tb')}${text(10, 48, 'height in NM = feet ÷ 6076', 't')}
        ${text(10, 290, 'Error is small when ≥ 1 NM per 1000 ft of height', 't')}</g>`;
  });

  // ---------------------------------------------------------------- 4.8 ILS glide path
  F.ils = () => svg(640, 300, 'ILS glide path heights, decision altitude and markers', id => {
    const xT = 560, yG = 250, pxNm = 96, pxFt = 0.104;
    const X = d => xT - d * pxNm, Y = h => yG - h * pxFt;
    const h = d => 50 + d * 318.4;
    const pts = [0, 5.25].map(d => `${f(X(d))} ${f(Y(h(d)))}`);
    const da = (200 - 50) / 318.4;
    let marks = '';
    for (let d = 1; d <= 5; d++) marks += `<circle cx="${f(X(d))}" cy="${f(Y(h(d)))}" r="3.5" class="f-acc"/>` + text(f(X(d) + 6), f(Y(h(d)) - 8), d + ' NM · ' + Math.round(h(d)) + ' ft', 't-acc', 'start') + line(f(X(d)), yG, f(X(d)), yG + 6, 's-thin');
    return `<rect x="20" y="${yG}" width="600" height="18" class="f-ground" rx="3"/>${line(20, yG, 620, yG, 's-line')}
      <rect x="${xT}" y="${yG - 3}" width="70" height="6" class="f-line"/>${text(xT + 4, yG + 36, 'runway', 't')}
      <path d="M${pts[0]} L${pts[1]}" class="s-acc nf" style="stroke-width:3"/>${marks}
      ${line(40, f(Y(200)), 620, f(Y(200)), 's-bad')}${text(44, f(Y(200) - 6), 'DA 200 ft (CAT I)', 't-bad')}
      <circle cx="${f(X(da))}" cy="${f(Y(200))}" r="4.5" class="f-bad"/>${text(430, f(Y(200) - 8), 'at the DA: land or go around', 't-bad', 'end')}
      ${line(f(X(4.6)), yG - 30, f(X(4.6)), yG, 's-dash')}${text(f(X(4.6)), yG + 36, 'outer marker ~4–7 NM', 't', 'middle')}
      ${line(f(X(0.6)), yG - 30, f(X(0.6)), yG, 's-dash')}${text(f(X(0.6) - 10), yG + 36, 'middle marker', 't', 'end')}
      ${text(620, 24, '3° glide path: height = TCH + 318 ft per NM', 'tb', 'end')}${text(620, 42, 'TCH (threshold crossing height) ≈ 50 ft · vertical scale exaggerated', 't', 'end')}`;
  });

  // ---------------------------------------------------------------- 5.6 turbofan
  F.turbofan = () => svg(640, 290, 'High-bypass turbofan cross-section', id => {
    const cy = 145;
    const sym = (d, cls) => `<path d="${d}" class="${cls}"/><path d="${d}" class="${cls}" transform="translate(0 ${2 * cy}) scale(1 -1)"/>`;
    return `${sym(`M60 ${cy - 96} Q70 ${cy - 106} 110 ${cy - 106} H420 Q470 ${cy - 100} 500 ${cy - 84} L500 ${cy - 74} Q460 ${cy - 86} 420 ${cy - 90} H112 Q84 ${cy - 90} 76 ${cy - 82} Z`, 'f-soft s-line')}
      ${sym(`M140 ${cy - 26} H520 L560 ${cy - 16} L520 ${cy - 22} H140 Z`, 'f-muted')}
      ${sym(`M150 ${cy - 30} Q160 ${cy - 40} 200 ${cy - 42} H380 L470 ${cy - 30} L560 ${cy - 22} L560 ${cy - 18} L470 ${cy - 26} L380 ${cy - 36} H200 Q170 ${cy - 36} 160 ${cy - 26} Z`, 'f-soft s-line')}
      <path d="M96 ${cy - 86} L104 ${cy + 86} L112 ${cy + 86} L104 ${cy - 86} Z" class="f-sel"/>${text(104, cy - 116, 'fan (N1)', 't-sel', 'middle')}
      ${[0, 1, 2].map(i => `<rect x="${168 + i * 10}" y="${cy - 32}" width="4" height="64" class="f-sel"/>`).join('')}${text(186, cy + 50, 'booster', 't', 'middle')}
      ${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${226 + i * 11}" y="${cy - 30 + i * 3}" width="4" height="${60 - i * 6}" class="f-live"/>`).join('')}${text(254, cy + 68, 'HP compressor (N2)', 't-live', 'middle')}
      <rect x="298" y="${cy - 30}" width="52" height="60" rx="8" class="f-warn" opacity="0.85"/>${text(324, cy + 50, 'combustor', 't-warn', 'middle')}
      ${[0, 1].map(i => `<rect x="${360 + i * 11}" y="${cy - 26}" width="4" height="52" class="f-bad"/>`).join('')}
      ${[0, 1, 2, 3].map(i => `<rect x="${396 + i * 12}" y="${cy - 24}" width="4" height="48" class="f-acc"/>`).join('')}${text(418, cy + 68, 'turbines · EGT', 't-acc', 'middle')}
      <path d="M470 ${cy - 16} L560 ${cy} L470 ${cy + 16} Z" class="f-muted"/>
      ${arrow(id, 20, cy - 66, 90, cy - 66, 'sel')}${arrow(id, 440, cy - 66, 540, cy - 66, 'sel')}${text(480, cy - 50, 'cold bypass air', 't-sel', 'middle')}
      ${arrow(id, 520, cy + 8, 612, cy + 8, 'bad')}${text(612, cy + 30, 'hot core jet', 't-bad', 'end')}
      ${text(20, 284, 'Bypass ratio = bypass air ÷ core air: about 5 : 1 on a CFM56, 10 : 1 or more on new engines.', 't')}`;
  });

  // ---------------------------------------------------------------- 5.7 optimum altitude & step climb
  F.optAlt = () => {
    const S = 124.6, M = 0.785, cl = 0.52;
    const opt = m => C.optimumAltitude({ massKg: m * 1000, wingArea: S, mach: M, clOpt: cl }).ft;
    const fr = frame(640, 300, { l: 60, r: 24, t: 16, b: 40 }, { min: 78, max: 56, ticks: range(56, 78, 4).reverse(), label: 'Mass (tonnes) — falling as fuel burns →' },
      { min: 30000, max: 42000, ticks: range(30000, 42000, 2000), label: 'Altitude (ft)', fmt: v => 'FL' + v / 100 });
    const ms = range(56, 78, 0.25).reverse();
    const optPts = ms.map(m => [m, opt(m)]).filter(p => p[1] <= 42000);
    let lvl = null, stairs = [];
    for (const m of ms) {
      const o = opt(m);
      const L = Math.floor((o + 2000) / 2000) * 2000 - 1000;     // highest odd level ≤ optimum + 1000 ft
      if (lvl == null) lvl = Math.min(L, 41000);
      else if (L > lvl) lvl = Math.min(L, 41000);
      stairs.push([m, lvl]);
    }
    return svg(640, 300, 'Optimum altitude against mass with step climbs', id => fr.grid +
      `<path d="${fr.path(optPts)}" class="s-acc nf"/><path d="${fr.path(stairs)}" class="s-sel nf" style="stroke-width:3"/>
       ${text(fr.X(76.5), fr.Y(opt(76.5)) + 22, 'optimum altitude', 't-acc')}${text(fr.X(71), fr.Y(34000) + 22, 'flown: 2000 ft steps', 't-sel')}
       ${text(fr.X(77.6), fr.Y(41400), '737-800 at M0.785 (CL ≈ 0.52)', 't')}`);
  };

  // ---------------------------------------------------------------- 6.1 METAR anatomy
  F.metarFig = () => svg(640, 190, 'The groups of a METAR', id => {
    const g = [['EETN', 'station', 'line'], ['271420Z', 'day 27, 14:20 UTC', 'line'], ['24012G22KT', 'wind 240° 12 kt, gusts 22', 'sel'], ['9999', 'visibility 10 km+', 'live'],
      ['-SHRA', 'light rain showers', 'warn'], ['FEW025CB', 'few CB at 2500 ft', 'bad'], ['SCT040', 'scattered 4000 ft', 'warn'], ['12/08', 'temp 12 °C, dew point 8', 'acc'], ['Q1009', 'QNH 1009 hPa', 'acc'], ['NOSIG', 'no change expected', 'line']];
    let x = 14, out = '';
    g.forEach(([s, lab, c], i) => {
      const w = s.length * 8.1 + 10;
      const cls = c === 'line' ? 'tb' : 't-' + c;
      out += `<rect x="${f(x)}" y="30" width="${f(w)}" height="30" rx="5" class="f-surface s-thin"/><text x="${f(x + w / 2)}" y="50" text-anchor="middle" class="${cls}" style="font-family:var(--font-mono);font-size:13px">${s}</text>`;
      const ly = i % 2 ? 132 : 92;
      out += line(f(x + w / 2), 62, f(x + w / 2), ly - 14, c === 'line' ? 's-thin' : 's-' + c) + wrap(lab, 16).map((t, j) => text(f(x + w / 2), ly + j * 15, t, j ? 't' : cls, 'middle')).join('');
      x += w + 4;
    });
    return out + text(14, 184, 'Heights of cloud are above the aerodrome in hundreds of feet: 025 = 2500 ft. CB = cumulonimbus.', 't');
  });

  // ---------------------------------------------------------------- 6.2 cloud base & freezing level
  F.cloudBase = () => {
    const T0 = 20, Td0 = 12, base = (T0 - Td0) / 2.5 * 1000, Tb = T0 - 2.98 * base / 1000;
    const fr = frame(640, 300, { l: 60, r: 24, t: 16, b: 40 }, { min: -20, max: 30, ticks: range(-20, 30, 10), label: 'Temperature (°C)' },
      { min: 0, max: 14000, ticks: range(0, 14000, 2000), label: 'Height (ft)', fmt: kft });
    const dry = [[T0, 0], [Tb, base]], dew = [[Td0, 0], [Tb, base]];
    const frz = base + Tb / 1.5 * 1000, i20 = base + (Tb + 10) / 1.5 * 1000;
    const sat = [[Tb, base], [Tb - 1.5 * (14000 - base) / 1000, 14000]];
    return svg(640, 300, 'Rising air, dew point and cloud base', id => fr.grid +
      `<rect x="${fr.X(-20)}" y="${f(fr.Y(i20))}" width="${f(fr.X(30) - fr.X(-20))}" height="${f(fr.Y(frz) - fr.Y(i20))}" class="fa-sel"/>
       ${text(fr.X(29), fr.Y((frz + i20) / 2) + 4, 'icing most likely: 0 to −10 °C in cloud', 't-sel', 'end')}
       <path d="${fr.path(dry)}" class="s-acc nf"/><path d="${fr.path(dew)}" class="s-live nf" stroke-dasharray="7 5"/><path d="${fr.path(sat)}" class="s-acc nf" style="opacity:.7"/>
       ${line(fr.X(-20), f(fr.Y(base)), fr.X(30), f(fr.Y(base)), 's-dash')}${text(fr.X(29), f(fr.Y(base) - 6), 'cloud base ≈ ' + Math.round(base / 100) * 100 + ' ft', 'tb', 'end')}
       ${line(fr.X(0), 16, fr.X(0), 260, 's-thin')}
       ${text(f(fr.X(T0) + 6), f(fr.Y(0) - 8), 'air 20 °C', 't-acc')}${text(f(fr.X(Td0) - 8), f(fr.Y(0) - 8), 'dew point 12 °C', 't-live', 'end')}
       ${text(f(fr.X((T0 + Tb) / 2) + 12), f(fr.Y(base / 2) + 4), '−3 °C per 1000 ft', 't-acc')}${text(f(fr.X((Td0 + Tb) / 2) - 12), f(fr.Y(base / 2) + 4), '−0.5 °C per 1000 ft', 't-live', 'end')}
       ${text(f(fr.X(Tb - 5) + 8), f(fr.Y(base + 2600)), 'in cloud ≈ −1.5 °C per 1000 ft', 't-acc')}
       ${text(fr.X(-19), f(fr.Y(frz) + 16), 'freezing level ≈ ' + Math.round(frz / 100) * 100 + ' ft', 't')}`);
  };

  // ---------------------------------------------------------------- 6.3 wake turbulence
  F.wake = () => svg(640, 300, 'Wake vortices behind an aircraft', id => {
    const spiral = (cx, cy, dir) => { let d = ''; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 5, r = 3 + i * 0.42; d += (i ? 'L' : 'M') + f(cx + dir * r * Math.cos(a)) + ' ' + f(cy + r * Math.sin(a)); } return `<path d="${d}" class="s-sel nf" style="stroke-width:1.6"/>`; };
    return `<g transform="translate(160 80)"><path d="M-110 0 L-14 -4 L14 -4 L110 0 L110 4 L-110 4 Z" class="f-line"/><ellipse cx="0" cy="0" rx="14" ry="16" class="f-soft s-line"/><path d="M-3 -16 L0 -40 L3 -16 Z" class="f-line"/></g>
      ${spiral(52, 96, 1)}${spiral(268, 96, -1)}${text(160, 30, 'Seen from behind', 'tb', 'middle')}
      ${arrow(id, 70, 120, 110, 120, 'sel')}${arrow(id, 250, 120, 210, 120, 'sel')}${text(160, 146, 'air rolls up around the wingtips', 't-sel', 'middle')}
      ${arrow(id, 52, 160, 52, 240, 'warn')}${arrow(id, 268, 160, 268, 240, 'warn')}${text(160, 206, 'sinks ~300–500 fpm', 't-warn', 'middle')}${text(160, 222, 'levels off 500–900 ft below', 't-warn', 'middle')}
      <rect x="20" y="266" width="280" height="10" class="f-ground"/>${arrow(id, 110, 258, 30, 258, 'line')}${arrow(id, 210, 258, 290, 258, 'line')}${text(160, 294, 'near the ground they spread out', 't', 'middle')}
      <g transform="translate(330 30)">${text(0, 0, 'ICAO separation on approach (radar)', 'tb')}
        ${[['Leader', 'Follower', 'Distance'], ['Super (A380)', 'Heavy', '6 NM'], ['Super (A380)', 'Medium', '7 NM'], ['Super (A380)', 'Light', '8 NM'], ['Heavy', 'Heavy', '4 NM'], ['Heavy', 'Medium', '5 NM'], ['Heavy', 'Light', '6 NM'], ['Medium', 'Light', '5 NM']].map((r, i) =>
          `${i ? line(0, 14 + i * 26, 290, 14 + i * 26, 's-grid') : ''}${text(0, 32 + i * 26, r[0], i ? 't' : 'tb')}${text(120, 32 + i * 26, r[1], i ? 't' : 'tb')}${text(290, 32 + i * 26, r[2], i ? 't-acc' : 'tb', 'end')}`).join('')}
        ${text(0, 236, 'Departures: 2 min for light and medium', 't')}${text(0, 252, 'aircraft behind a heavy (3 min behind', 't')}${text(0, 268, 'an A380). Otherwise 3 NM radar minimum.', 't')}</g>`;
  });

  // ================================================================ AIRCRAFT PAGES
  const niceStep = span => (span > 260 ? 40 : span > 130 ? 20 : 10);

  /**
   * Airspeed indicator with the certification colour arcs, drawn like the real instrument (always a dark
   * face). o = { vso, vs1, vfe, vno, vne, vmca, vyse, needle, notes: [text...], title }
   */
  F.asi = o => {
    const vne = o.vne || (o.vno ? o.vno * 1.26 : 160);
    const v0 = Math.max(0, Math.floor(((o.vso || o.vs1 || vne * 0.3) * 0.7) / 10) * 10);
    const v1 = Math.ceil(vne * 1.12 / 10) * 10;
    const cx = 168, cy = 166, R = 146;
    const th = v => -150 + (Math.min(v1, Math.max(v0, v)) - v0) / (v1 - v0) * 300;
    const P = (v, r) => brg(cx, cy, th(v), r);
    const arc = (a, b, r, col, w) => {
      if (!(a > 0) || !(b > a)) return '';
      const [x0, y0] = P(a, r), [x1, y1] = P(b, r);
      const large = th(b) - th(a) > 180 ? 1 : 0;
      return `<path d="M${f(x0)} ${f(y0)} A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
    };
    const radial = (v, col, r0, r1, w = 4) => { if (!(v > 0)) return ''; const [x0, y0] = P(v, r0), [x1, y1] = P(v, r1); return `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`; };
    const step = niceStep(v1 - v0);
    let ticks = '';
    for (let v = Math.ceil(v0 / 10) * 10; v <= v1; v += 10) {
      const major = v % step === 0;
      const [x0, y0] = P(v, R - 2), [x1, y1] = P(v, R - (major ? 17 : 11));
      ticks += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="#E8EEF2" stroke-width="${major ? 2 : 1}"/>`;
      if (major) { const [tx, ty] = P(v, R - 42); ticks += `<text x="${f(tx)}" y="${f(ty + 5)}" text-anchor="middle" fill="#E8EEF2" style="font:700 14px var(--font-num)">${v}</text>`; }
    }
    const WHITE = '#F4F7F9', GREEN = '#35C26A', YELLOW = '#F0BE2A', RED = '#EF4B4B', BLUE = '#3E93F0';
    const vfeTop = o.vfe && o.vso ? o.vfe : null;
    const needle = o.needle > 0 ? (() => { const [x, y] = P(o.needle, R - 22); return `<line x1="${cx}" y1="${cy}" x2="${f(x)}" y2="${f(y)}" stroke="#FF9F1C" stroke-width="4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="8" fill="#FF9F1C"/>`; })() : `<circle cx="${cx}" cy="${cy}" r="6" fill="#56636D"/>`;
    const rows = [];
    if (vfeTop) rows.push([WHITE, 'White arc', `Vso ${Math.round(o.vso)} – Vfe ${Math.round(o.vfe)} kt · flap operating range`]);
    if (o.vs1 && o.vno) rows.push([GREEN, 'Green arc', `Vs1 ${Math.round(o.vs1)} – Vno ${Math.round(o.vno)} kt · normal operation`]);
    if (o.vno && vne) rows.push([YELLOW, 'Yellow arc', `${Math.round(o.vno)} – ${Math.round(vne)} kt · smooth air only`]);
    if (o.vne) rows.push([RED, 'Red line', `Vne ${Math.round(o.vne)} kt · never exceed`]);
    if (o.vmca) rows.push([RED, 'Red radial', `Vmca ${Math.round(o.vmca)} kt · min. control, engine out`]);
    if (o.vyse) rows.push([BLUE, 'Blue line', `Vyse ${Math.round(o.vyse)} kt · best climb, engine out`]);
    const legend = rows.map(([c, k, t], i) => `<rect x="352" y="${34 + i * 38}" width="18" height="8" rx="2" fill="${c}" stroke="var(--fig-line)" stroke-width="0.6"/>${text(378, 42 + i * 38, k, 'tb')}${text(378, 58 + i * 38, t, 't')}`).join('');
    const noteLines = (o.notes || []).flatMap(t => wrap(t, 44));
    const notes = noteLines.map((t, i) => text(352, 60 + rows.length * 38 + i * 17, t, 't')).join('');
    return svg(640, 332, 'Airspeed indicator with colour arcs', id => `
      <circle cx="${cx}" cy="${cy}" r="${R + 6}" fill="#2B3640"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="#10171E"/>
      ${arc(o.vso, vfeTop, R - 19, WHITE, 6)}${arc(o.vs1, o.vno, R - 8, GREEN, 8)}${arc(o.vno, o.vne ? vne : null, R - 8, YELLOW, 8)}
      ${radial(o.vne, RED, R - 26, R - 1, 5)}${radial(o.vmca, RED, R - 26, R - 1, 4)}${radial(o.vyse, BLUE, R - 26, R - 1, 4)}
      ${ticks}
      <text x="${cx}" y="${cy + 46}" text-anchor="middle" fill="#9FB0BC" style="font:700 11px var(--font-ui);letter-spacing:.14em">AIRSPEED</text>
      <text x="${cx}" y="${cy + 62}" text-anchor="middle" fill="#9FB0BC" style="font:700 11px var(--font-ui);letter-spacing:.14em">KNOTS</text>
      ${needle}${legend}${notes}
      ${o.title ? text(352, 18, o.title, 'tb') : ''}`);
  };

  /** Speed band for jets: coloured ranges and labelled marks on one axis. o = { min, max, bands, marks, caption } */
  F.speedBand = o => {
    const W = 640, x0 = 30, x1 = 612;
    const X = v => x0 + (v - o.min) / (o.max - o.min) * (x1 - x0);
    const placed = [], ends = [];
    for (const m of (o.marks || []).slice().sort((a, b) => a.v - b.v)) {
      const x = X(m.v), w = m.label.length * 6.9 + 12;
      let r = ends.findIndex(e => e < x - w / 2);
      if (r < 0) { r = ends.length; ends.push(-1e9); }
      ends[r] = x + w / 2;
      placed.push({ m, x, r });
    }
    const rows = Math.max(1, ends.length), y = 30 + rows * 22 + 12, H = y + 64;
    const bands = (o.bands || []).map(b => `<rect x="${f(X(b.from))}" y="${y - 12}" width="${f(Math.max(1, X(b.to) - X(b.from)))}" height="24" class="${b.cls}"/>`).join('');
    let ticks = '';
    const st = o.max - o.min > 200 ? 20 : 10;
    for (let v = Math.ceil(o.min / st) * st; v <= o.max; v += st) ticks += line(f(X(v)), y + 12, f(X(v)), y + (v % (st * 2) === 0 ? 20 : 16), 's-thin') + (v % (st * 2) === 0 ? text(f(X(v)), y + 34, v, 't tm', 'middle') : '');
    const marks = placed.map(({ m, x, r }) => {
      const ly = y - 26 - r * 22, cls = m.cls || 'acc', neutral = cls === 'line';
      return `<line x1="${f(x)}" y1="${ly + 5}" x2="${f(x)}" y2="${y - 12}" class="s-${neutral ? 'thin' : cls}" style="stroke-width:1.4"/>
        <circle cx="${f(x)}" cy="${y}" r="4.5" class="f-${neutral ? 'line' : cls}"/>${text(f(x), ly, m.label, neutral ? 'tb' : 't-' + cls, 'middle')}`;
    }).join('');
    return svg(W, H, o.title || 'Speed band', id => `${bands}<rect x="${x0}" y="${y - 12}" width="${x1 - x0}" height="24" fill="none" class="s-thin"/>${ticks}${marks}
      ${text(W / 2, H - 6, o.caption || 'knots indicated (CAS)', 't', 'middle')}`);
  };

  /** Stall speed against mass for several configurations: Vs ∝ √mass. o = { mMin, mMax, lines:[{name, vAtMax, cls}], marks:[{m, label}] } */
  F.stallWeight = o => {
    const vs = o.lines.flatMap(l => [l.vAtMax * Math.sqrt(o.mMin / o.mMax), l.vAtMax]);
    const lo = Math.floor(Math.min(...vs) * 0.9 / 10) * 10, hi = Math.ceil(Math.max(...vs) * 1.06 / 10) * 10;
    const t = o.mMax > 20000;
    const sc = t ? 1000 : 1;
    const fr = frame(640, 290, { l: 56, r: 26, t: 16, b: 40 }, { min: o.mMin / sc, max: o.mMax / sc, ticks: range(Math.ceil(o.mMin / sc / (t ? 10 : 100)) * (t ? 10 : 100), o.mMax / sc, t ? (o.mMax > 200000 ? 50 : 10) : 100), label: t ? 'Mass (tonnes)' : 'Mass (kg)' },
      { min: lo, max: hi, ticks: range(lo, hi, hi - lo > 80 ? 20 : 10), label: 'Stall speed (kt)' });
    const lines = o.lines.map((l, i) => {
      const pts = range(o.mMin, o.mMax, (o.mMax - o.mMin) / 40).map(m => [m / sc, l.vAtMax * Math.sqrt(m / o.mMax)]);
      const end = pts[pts.length - 1];
      return `<path d="${fr.path(pts)}" class="s-${l.cls} nf"/>${text(f(fr.X(end[0]) - 12), f(fr.Y(end[1]) + (i % 2 ? 18 : -9)), l.name + ' ' + Math.round(l.vAtMax) + ' kt', 't-' + l.cls, 'end')}`;
    }).join('');
    const marks = (o.marks || []).map(m => { const x = fr.X(m.m / sc), right = x > 560; return line(f(x), 16, f(x), 250, 's-dash') + text(f(x + (right ? -5 : 5)), 30, m.label, 't', right ? 'end' : 'start'); }).join('');
    return svg(640, 290, 'Stall speed against mass', id => fr.grid + marks + lines);
  };

  /** Airliner V-speeds against mass (lift equation, default flaps). p = performance profile. */
  F.vspeedsWeight = p => {
    const P = root.XFC.perf;
    const mMin = Math.round((p.oew + (p.mzfw - p.oew) * 0.15) / 1000) * 1000, mMax = p.mtow;
    const ms = range(mMin, mMax, (mMax - mMin) / 40);
    const to = ms.map(m => [m, P.takeoffSpeeds(p, m, null)]);
    const ld = ms.filter(m => m <= p.mlw * 1.001).map(m => [m, P.landingSpeeds(p, m, null)]);
    const all = to.flatMap(([, s]) => [s.v1, s.v2]).concat(ld.map(([, s]) => s.vref));
    const lo = Math.floor(Math.min(...all) * 0.95 / 10) * 10, hi = Math.ceil(Math.max(...all) * 1.04 / 10) * 10;
    const big = mMax > 200000;
    const fr = frame(640, 300, { l: 56, r: 24, t: 16, b: 40 }, { min: mMin / 1000, max: mMax / 1000, ticks: range(Math.ceil(mMin / 1000 / (big ? 50 : 10)) * (big ? 50 : 10), mMax / 1000, big ? 50 : 10), label: 'Mass (tonnes)' },
      { min: lo, max: hi, ticks: range(lo, hi, hi - lo > 90 ? 20 : 10), label: 'Speed (kt)' });
    const pl = (pts, k) => fr.path(pts.map(([m, s]) => [m / 1000, s[k]]));
    const last = (pts, k) => { const [m, s] = pts[pts.length - 1]; return [fr.X(m / 1000), fr.Y(s[k])]; };
    const lab = (pts, k, s, cls, dy) => { const [x, y] = last(pts, k); return text(f(x - 4), f(y + dy), s, 't-' + cls, 'end'); };
    const fTo = to[0][1].flap, fLd = ld.length ? ld[0][1].flap : '';
    const pre = p.policy === 'airbus' ? 'CONF ' : 'flaps ';
    return svg(640, 300, 'Take-off and landing speeds against mass', id => fr.grid +
      `<path d="${pl(to, 'v2')}" class="s-acc nf"/><path d="${pl(to, 'vr')}" class="s-sel nf"/><path d="${pl(to, 'v1')}" class="s-live nf"/>
       ${ld.length > 1 ? `<path d="${pl(ld, 'vref')}" class="s-warn nf" stroke-dasharray="7 5"/>` : ''}
       ${lab(to, 'v2', 'V2', 'acc', -8)}${lab(to, 'vr', 'VR', 'sel', -8)}${lab(to, 'v1', 'V1', 'live', 16)}
       ${line(f(fr.X(p.mlw / 1000)), 16, f(fr.X(p.mlw / 1000)), 260, 's-dash')}${text(f(fr.X(p.mlw / 1000) - 5), 30, 'MLW', 't', 'end')}
       ${text(f(fr.X(mMin / 1000) + 8), 32, 'Take-off ' + pre + fTo, 't')}
       ${ld.length > 1 ? `<line x1="${f(fr.X(mMin / 1000) + 8)}" y1="46" x2="${f(fr.X(mMin / 1000) + 34)}" y2="46" class="s-warn" stroke-dasharray="7 5"/>` + text(f(fr.X(mMin / 1000) + 40), 50, (p.policy === 'airbus' ? 'VLS ' : 'Vref ') + pre + fLd + ' (up to MLW)', 't-warn') : ''}`);
  };

  /** Payload–range diagram. pts = [{range, payload}], marks = [{range, payload, label}] */
  F.payloadRange = (pts, marks, o = {}) => {
    const maxR = Math.max(...pts.map(q => q.range)), maxP = Math.max(...pts.map(q => q.payload));
    const rStep = maxR > 6000 ? 2000 : maxR > 2500 ? 1000 : 500;
    const t = maxP > 3000, sc = t ? 1000 : 1;
    const pStep = t ? (maxP > 60000 ? 20 : maxP > 25000 ? 5 : 2) : 200;
    const fr = frame(640, 300, { l: 56, r: 26, t: 18, b: 40 }, { min: 0, max: Math.ceil(maxR * 1.08 / rStep) * rStep, ticks: range(0, Math.ceil(maxR * 1.08 / rStep) * rStep, rStep), label: 'Range (NM, still air, with reserves)', fmt: v => v.toLocaleString('en-US') },
      { min: 0, max: Math.ceil(maxP / sc * 1.15 / pStep) * pStep, ticks: range(0, Math.ceil(maxP / sc * 1.15 / pStep) * pStep, pStep), label: t ? 'Payload (tonnes)' : 'Payload (kg)' });
    const path = fr.path(pts.map(q => [q.range, q.payload / sc]));
    const area = path + ` L${f(fr.X(pts[pts.length - 1].range))} ${f(fr.Y(0))} L${f(fr.X(0))} ${f(fr.Y(0))} Z`;
    const mk = (marks || []).map((m, i) => `<circle cx="${f(fr.X(m.range))}" cy="${f(fr.Y(m.payload / sc))}" r="4.5" class="f-acc"/>` +
      text(f(fr.X(m.range) + (i === 2 ? -8 : 8)), f(fr.Y(m.payload / sc) - 9), m.label, 't-acc', i === 2 ? 'end' : 'start')).join('');
    return svg(640, 300, 'Payload against range', id => fr.grid + `<path d="${area}" class="fa-acc"/><path d="${path}" class="s-acc nf"/>` + mk +
      (o.note ? text(f(fr.X(0) + 10), 34, o.note, 't') : ''));
  };

  // ================================================================ 0 · READING THE EQUATIONS
  F.trig = () => svg(640, 270, 'Right-angled triangle: a 20 kt wind at 30 degrees split into headwind and crosswind', id => {
    const ox = 60, oy = 226, ax = 300, by = oy - 240 * Math.tan(Math.PI / 6);
    const mx = (ox + ax) / 2 - 7, my = (oy + by) / 2 - 11;
    return `<path d="M${ox} ${oy} L${ax} ${oy} L${ax} ${f(by)} Z" class="fa-sel"/>
      ${arrow(id, ox, oy, ax - 3, oy, 'sel')}${arrow(id, ax, oy, ax, f(by + 4), 'live')}${arrow(id, ox, oy, ax - 3, f(by + 2), 'acc')}
      <path d="M${ax - 13} ${oy} V${oy - 13} H${ax}" class="s-thin nf"/>
      <path d="${arcPath(ox, oy, 52, -30, 0)}" class="s-line nf"/>${text(ox + 58, oy - 8, 'θ', 'tl')}
      ${text(f(mx), f(my), 'hypotenuse — wind 20 kt', 't-acc', 'middle', `transform="rotate(-30 ${f(mx)} ${f(my)})"`)}
      ${text((ox + ax) / 2, oy + 22, 'adjacent — headwind 20 × cos 30° = 17.3 kt', 't-sel', 'middle')}
      ${text(ax + 10, f(by + 44), 'opposite —', 't-live')}${text(ax + 10, f(by + 62), 'crosswind', 't-live')}${text(ax + 10, f(by + 84), '20 × sin 30°', 't')}${text(ax + 10, f(by + 102), '= 10 kt', 't')}
      <g transform="translate(440 52)"><rect x="-14" y="-24" width="198" height="190" rx="8" class="f-surface s-thin"/>
        ${text(0, 0, 'SOH · CAH · TOA', 'tb')}
        ${text(0, 28, 'sin θ = opposite ÷ hyp', 't-live')}${text(0, 48, 'cos θ = adjacent ÷ hyp', 't-sel')}${text(0, 68, 'tan θ = opposite ÷ adj', 'tb')}
        ${text(0, 98, 'sin 30° = 0.50', 't tm')}${text(0, 116, 'cos 30° = 0.87', 't tm')}${text(0, 134, 'tan 30° = 0.58', 't tm')}${text(0, 156, 'tan 3° = 0.052 → 318 ft/NM', 't tm')}</g>`;
  });

  F.scaling = () => {
    const fr = frame(640, 300, { l: 50, r: 150, t: 16, b: 40 }, { min: 0, max: 2.2, ticks: [0, 0.5, 1, 1.5, 2], label: 'Change the input by this factor', fmt: v => '×' + v },
      { min: 0, max: 4.4, ticks: [0, 1, 2, 3, 4], label: 'The output changes by', fmt: v => '×' + v });
    const xs = range(0.01, 2, 0.01);
    const P = (fn, lo = 0) => fr.path(xs.filter(x => x >= lo).map(x => [x, fn(x)]).filter(p => p[1] <= 4.4));
    const mk = (y, cls, label) => `<circle cx="${f(fr.X(2))}" cy="${f(fr.Y(y))}" r="4.5" class="f-${cls}"/>${text(f(fr.X(2) + 10), f(fr.Y(y) + 4), label, 't-' + cls)}`;
    return svg(640, 300, 'How squares, square roots and one-over change the answer', id => fr.grid +
      `<path d="${P(x => x * x)}" class="s-acc nf"/><path d="${P(x => x)}" class="s-sel nf"/><path d="${P(Math.sqrt)}" class="s-live nf"/><path d="${P(x => 1 / x, 0.23)}" class="s-warn nf"/>
       ${line(f(fr.X(1)), f(fr.Y(4.4)), f(fr.X(1)), f(fr.Y(0)), 's-dash')}${line(f(fr.X(2)), f(fr.Y(4.4)), f(fr.X(2)), f(fr.Y(0)), 's-dash')}
       <circle cx="${f(fr.X(1))}" cy="${f(fr.Y(1))}" r="4.5" class="f-line"/>
       ${text(f(fr.X(1) + 8), f(fr.Y(1) + 38), 'all four meet at ×1', 't')}
       ${mk(4, 'acc', '×4 — squared, x²')}${mk(2, 'sel', '×2 — straight, x')}${mk(Math.SQRT2, 'live', '×1.41 — root, √x')}${mk(0.5, 'warn', '×½ — one over, 1/x')}`);
  };

  // ================================================================ 7 · AIRLINER PROCEDURES
  const niceTicks = (max, want) => { const raw = max / want, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; const s = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; return s; };
  const withGround = r => [[0, 0], [r.groundNm, 35]].concat(r.pts.map(q => [q.x, q.h]));
  const fmtFt = v => Math.round(v).toLocaleString('en-US') + ' ft';

  /**
   * Departure profiles from perf.departureProfile: height (and speed) against distance from brake release.
   * runs: [{ r, cls: 'acc'|'sel'|'live'|'warn', label }]. o: { xMax, hMax, speed (panel, default true), refNm, line3000 }
   */
  F.depProfile = (runs, o = {}) => {
    const W = 640, speedPanel = o.speed !== false, H = speedPanel ? 430 : 300;
    const lastX = Math.max(...runs.map(q => q.r.pts.length ? q.r.pts[q.r.pts.length - 1].x : 1));
    const xMax = o.xMax || Math.ceil(lastX + 0.4);
    const hTop = Math.max(...runs.map(q => Math.max(35, ...q.r.pts.filter(p => p.x <= xMax).map(p => p.h))));
    const hStep = niceTicks(hTop, 5), hMax = o.hMax || Math.ceil(hTop * 1.08 / hStep) * hStep;
    const xStep = xMax > 12 ? 2 : 1;
    const top = frame(W, H, { l: 60, r: 18, t: 16, b: speedPanel ? H - 250 : 40 },
      { min: 0, max: xMax, ticks: range(0, xMax, xStep), label: speedPanel ? '' : 'Distance from brake release (NM)', noTickLabels: speedPanel },
      { min: 0, max: hMax, ticks: range(0, hMax, hStep), label: 'Height above the airport (ft)', fmt: v => v.toLocaleString('en-US') });
    let body = top.grid;
    // the highest line gets its labels above-left, the others below-right, so labels never sit between two lines
    const meanH = q => { const ps = q.r.pts.filter(p => p.x <= xMax); return ps.reduce((a, p) => a + p.h, 0) / Math.max(1, ps.length); };
    const highest = runs.map((q, i) => [i, meanH(q)]).sort((a, b) => b[1] - a[1])[0][0];
    const isHigh = i => i === highest;
    const placed = [];
    const put = (x0, x1, y, dir) => { for (let k = 0; k < 8 && placed.some(b => x0 < b[1] + 4 && x1 > b[0] - 4 && Math.abs(y - b[2]) < 15); k++) y += dir * 15; placed.push([x0, x1, y]); return y; };
    if (o.line3000 !== false && hMax >= 3000) body += line(top.X(0), f(top.Y(3000)), top.X(xMax), f(top.Y(3000)), 's-dash') + text(top.X(xMax) - 4, f(top.Y(3000) - 5), '3000 ft', 't', 'end');
    if (o.refNm && o.refNm < xMax) {
      body += line(f(top.X(o.refNm)), 16, f(top.X(o.refNm)), f(top.Y(0)), 's-dash') + text(f(top.X(o.refNm) + 5), 30, o.refLabel || (o.refNm + ' NM'), 't');
      runs.forEach((q, i) => {
        const a = q.r.at(o.refNm); if (!a) return;
        const hi = isHigh(i), s = fmtFt(a.h), w = s.length * 6.9, X = top.X(o.refNm) + (hi ? -7 : 7), Y = top.Y(a.h) + (hi ? -7 : 16);
        placed.push([hi ? X - w : X, hi ? X : X + w, Y]);
        body += `<circle cx="${f(top.X(o.refNm))}" cy="${f(top.Y(a.h))}" r="4" class="f-${q.cls}"/>` + text(f(X), f(Y), s, 't-' + q.cls, hi ? 'end' : 'start');
      });
    }
    const clip = pts => pts.filter(p => p[0] <= xMax + 0.05);
    runs.forEach(q => { body += `<path d="${top.path(clip(withGround(q.r)))}" class="s-${q.cls} nf"${q.dash ? ' stroke-dasharray="7 5"' : ''}/>`; });
    // event markers on the height lines; labels for events close together are merged, and moved apart if they would touch
    const LBL = { thrRed: 'THR RED', acc: o.eoLabels ? 'EO ACC' : 'ACC', clean: 'clean', mct: 'MCT' };
    runs.forEach((q, i) => {
      if (q.markers === false) return;
      const evs = q.r.events.filter(e => (LBL[e.key] || e.key === 'flap') && e.x <= xMax);
      evs.forEach(e => { body += `<circle cx="${f(top.X(e.x))}" cy="${f(top.Y(e.h))}" r="${LBL[e.key] ? 4.5 : 3}" class="f-${q.cls}"/>`; });
      const hasMct = evs.some(z => z.key === 'mct'), groups = [];
      evs.filter(e => LBL[e.key] && !(e.key === 'clean' && hasMct)).forEach(e => { const g = groups[groups.length - 1]; if (g && e.x - g[0].x < 0.45 && Math.abs(e.h - g[0].h) < 400) g.push(e); else groups.push([e]); });
      groups.forEach(g => {
        const e = g[0], s = g.map(z => LBL[z.key]).join(' + ') + ' ' + fmtFt(e.h), w = s.length * 6.9;
        let above = isHigh(i);
        if (above && top.X(e.x) - 6 - w < top.X(0) + 4) above = false;           // would run into the axis: put it below-right
        const X = top.X(e.x) + (above ? -6 : 6), Y = put(above ? X - w : X, above ? X : X + w, top.Y(e.h) + (above ? -8 : 17), above ? -1 : 1);
        body += text(f(X), f(Y), s, 't-' + q.cls, above ? 'end' : 'start');
      });
    });
    // legend
    const lw = Math.max(...runs.map(q => q.label.length)) * 6.9 + 50;
    body += `<g transform="translate(${top.X(0) + 12} 30)"><rect x="-6" y="-12" width="${f(lw)}" height="${runs.length * 19 + 6}" rx="6" class="f-surface s-thin"/>` +
      runs.map((q, i) => line(0, i * 19, 24, i * 19, 's-' + q.cls) + text(32, i * 19 + 4, q.label, 't-' + q.cls)).join('') + '</g>';
    if (speedPanel) {
      const vs = runs.flatMap(q => q.r.pts.filter(p => p.x <= xMax).map(p => p.v));
      const vMin = Math.floor((Math.min(...vs) - 10) / 20) * 20, vMax = Math.ceil((Math.max(...vs) + 10) / 20) * 20;
      const bot = frame(W, H, { l: 60, r: 18, t: 274, b: 40 }, { min: 0, max: xMax, ticks: range(0, xMax, xStep), label: 'Distance from brake release (NM)' },
        { min: vMin, max: vMax, ticks: range(vMin, vMax, vMax - vMin > 100 ? 40 : 20), label: 'Speed (kt)' });
      body += bot.grid;
      runs.forEach(q => { body += `<path d="${bot.path(clip(q.r.pts.map(p => [p.x, p.v])))}" class="s-${q.cls} nf"${q.dash ? ' stroke-dasharray="7 5"' : ''}/>`; });
    }
    return svg(W, H, o.title || 'Departure climb profile', () => body);
  };

  /** Take-off flight path with one engine out (FAR/CS 25.111–25.121 segments), from an engine-failure run. */
  F.toSegments = (eo, aeo) => {
    const n = eo.engines, ev = k => eo.events.find(e => e.key === k);
    const acc = ev('acc'), clean = ev('clean'), mct = ev('mct');
    const gearUp = eo.pts.find(p => p.t >= 11) || eo.pts[0];
    const end = eo.pts[eo.pts.length - 1];
    const xMax = Math.ceil(end.x + 0.6), hMax = 1800;
    const fr = frame(640, 320, { l: 60, r: 18, t: 16, b: 40 }, { min: 0, max: xMax, ticks: range(0, xMax, xMax > 12 ? 2 : 1), label: 'Distance from brake release (NM) — ' + (eo.name ? 'engine failure at V1' : '') },
      { min: 0, max: hMax, ticks: range(0, hMax, 300), label: 'Height (ft)', fmt: v => v.toLocaleString('en-US') });
    const pct = g => (g * 100).toFixed(1) + ' %';
    const band = (x0, x1, cls) => `<rect x="${f(fr.X(x0))}" y="16" width="${f(Math.max(0, fr.X(x1) - fr.X(x0)))}" height="${f(fr.Y(0) - 16)}" class="${cls}"/>`;
    const segs = [
      [eo.groundNm, gearUp.x, 'fa-warn', '1st', 'gear up', '> ' + (eo.minGrad.first * 100).toFixed(1) + ' %'],
      [gearUp.x, acc ? acc.x : end.x, 'fa-sel', '2nd', 'V2, take-off flaps', '≥ ' + (eo.minGrad.second * 100).toFixed(1) + ' %'],
      [acc ? acc.x : end.x, mct ? mct.x : end.x, 'fa-live', '3rd', 'level, flaps up', 'accelerate'],
      [mct ? mct.x : end.x, end.x, 'fa-acc', 'final', 'clean, MCT', '≥ ' + (eo.minGrad.final * 100).toFixed(1) + ' %']
    ];
    let b = fr.grid + segs.map(s => band(s[0], s[1], s[2])).join('');
    b += line(fr.X(0), f(fr.Y(400)), fr.X(xMax), f(fr.Y(400)), 's-dash') + text(fr.X(xMax) - 4, f(fr.Y(400) - 5), '400 ft: no flap change below', 't', 'end');
    b += line(fr.X(0), f(fr.Y(1500)), fr.X(xMax), f(fr.Y(1500)), 's-dash') + text(fr.X(xMax) - 4, f(fr.Y(1500) - 5), '1500 ft: end of the take-off path', 't', 'end');
    if (aeo) {
      const pa = aeo.pts.find(q => q.h >= 1650) || aeo.pts[aeo.pts.length - 1];
      b += `<path d="${fr.path(withGround(aeo).filter(p => p[1] <= hMax))}" class="s-thin nf" stroke-dasharray="6 5"/>` + text(f(fr.X(pa.x) + 8), f(fr.Y(1650) + 4), 'all engines', 't');
    }
    b += `<path d="${fr.path(withGround(eo))}" class="s-line nf" style="stroke-width:2.6"/>`;
    segs.forEach((s, i) => {
      const cx = (fr.X(s[0]) + fr.X(s[1])) / 2, wide = fr.X(s[1]) - fr.X(s[0]) > 90;
      if (i === 0 && !wide) { b += text(f(cx), 32, '1st', 'tb', 'middle'); return; }   // narrow: the caption explains it
      const y0 = i === 3 ? 150 : 70;
      b += text(f(cx), y0, s[3] + ' segment', 'tb', 'middle') + text(f(cx), y0 + 16, s[4], 't', 'middle') + text(f(cx), y0 + 32, s[5], 't tm', 'middle');
    });
    if (acc) b += `<circle cx="${f(fr.X(acc.x))}" cy="${f(fr.Y(acc.h))}" r="4.5" class="f-sel"/>` + text(f(fr.X(acc.x) - 6), f(fr.Y(acc.h) - 9), 'EO ACC ' + fmtFt(acc.h), 't-sel', 'end');
    if (mct) b += `<circle cx="${f(fr.X(mct.x))}" cy="${f(fr.Y(mct.h))}" r="4.5" class="f-acc"/>`;
    return svg(640, 320, 'Engine-out take-off flight path and its four segments', () => b);
  };

  F.cdo = () => svg(640, 250, 'Continuous descent compared with a stepped descent', id => `
    <rect x="20" y="214" width="600" height="22" class="f-ground" rx="4"/>${line(20, 214, 620, 214, 's-line')}
    <rect x="540" y="208" width="72" height="6" class="f-muted"/>${text(576, 232, 'runway', 't', 'middle')}
    <path d="M40 40 C200 70 360 150 540 208" class="s-acc nf"/>
    <path d="M40 40 L130 96 H270 L330 140 H420 L452 160 L540 208" class="s-sel nf" stroke-dasharray="7 5"/>
    <circle cx="40" cy="40" r="5" class="f-line"/>${text(50, 30, 'top of descent', 'tb')}
    ${text(250, 58, 'Continuous descent: near-idle thrust all the way', 't-acc')}
    ${text(60, 150, 'Stepped descent: every level-off needs thrust —', 't-sel')}${text(60, 168, 'more noise and fuel close to the ground', 't-sel')}
    ${text(200, 113, 'level', 't', 'middle')}${text(385, 132, 'level', 't', 'middle')}`);

  F.stableApproach = () => svg(640, 280, 'Stabilised approach gates on a 3 degree final approach', id => {
    const X = nm => 600 - 60 * nm, Y = ft => 236 - 0.12 * ft;
    const gate = (ft, lbl, sub) => { const nm = ft / 318.4; return line(f(X(nm)), f(Y(ft)), f(X(nm)), 236, 's-dash') + `<circle cx="${f(X(nm))}" cy="${f(Y(ft))}" r="5" class="f-warn"/>` + text(f(X(nm) + 10), f(Y(ft) - (sub ? 22 : 8)), lbl, 't-warn') + (sub ? text(f(X(nm) + 10), f(Y(ft) - 6), sub, 't') : ''); };
    return `<rect x="20" y="236" width="600" height="20" class="f-ground" rx="4"/>${line(20, 236, 620, 236, 's-line')}
      <rect x="600" y="231" width="30" height="5" class="f-muted"/>
      <path d="M${f(X(5))} ${f(Y(5 * 318.4))} L${X(0)} ${Y(0)}" class="s-acc nf"/>${text(f(X(4.6) + 14), f(Y(4.6 * 318.4) - 12), '3° glide path', 't-acc')}
      ${gate(1000, '1000 ft — IMC gate', 'not stable? go around')}${gate(500, '500 ft — VMC gate', '')}
      <g transform="translate(34 40)"><rect x="-12" y="-24" width="252" height="200" rx="8" class="f-surface s-thin"/>
        ${text(0, 0, 'Stable means all of these:', 'tb')}
        ${['on the correct flight path', 'only small heading and pitch changes', 'speed Vref to Vref + 20 kt', 'landing configuration set', 'sink rate ≤ 1000 fpm', 'thrust spooled up for the config', 'briefings and checklists done', 'ILS: within one dot'].map((s, i) => text(0, 24 + i * 19, '✓ ' + s, 't')).join('')}</g>`;
  });

  F.goAround = () => svg(640, 260, 'Go-around from the decision altitude', id => {
    const mk = (x, y, n, cls = 'live') => `<circle cx="${x}" cy="${y}" r="9" class="f-${cls}"/>${text(x, y + 4, n, 'tb', 'middle', 'style="fill:var(--surface)"')}`;
    return `<rect x="20" y="222" width="600" height="20" class="f-ground" rx="4"/>${line(20, 222, 620, 222, 's-line')}
      <rect x="560" y="217" width="60" height="5" class="f-muted"/>
      <path d="M30 140 L300 186" class="s-acc nf"/><path d="M300 186 L560 222" class="s-thin nf" stroke-dasharray="5 5"/>
      <path d="M300 186 Q318 196 350 190 L610 74" class="s-live nf"/>
      ${text(294, 210, 'height loss ≈ ½ · VS · t', 't', 'end')}
      ${mk(300, 186, '1', 'warn')}${mk(352, 190, '2')}${mk(440, 150, '3')}${mk(560, 96, '4')}
      <g transform="translate(34 30)">
        ${text(0, 0, '1  Decision altitude — not visual: go around', 't-warn')}
        ${text(0, 20, '2  TOGA, pitch up, flaps one step', 't-live')}
        ${text(0, 40, '3  Positive climb → gear up', 't-live')}
        ${text(0, 60, '4  Acceleration altitude → flaps up', 't-live')}</g>`;
  });

  root.XFC.figures = F;
})(typeof self !== 'undefined' ? self : this);
