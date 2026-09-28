/* XP Flight Computer — study library
 * Each topic renders HTML with figures, numbered equations, variable tables, a worked example
 * computed with the same functions the calculators use, and where the value lives in X-Plane.
 */
(function (root) {
  'use strict';
  const R = String.raw;
  const Fg = () => root.XFC.figures;

  const chapters = [
    { id: 'start', no: '0', title: 'Start here' },
    { id: 'pof', no: '1', title: 'Principles of flight' },
    { id: 'atm', no: '2', title: 'Atmosphere & altimetry' },
    { id: 'spd', no: '3', title: 'Airspeed' },
    { id: 'nav', no: '4', title: 'Navigation' },
    { id: 'perf', no: '5', title: 'Airliner performance' },
    { id: 'wx', no: '6', title: 'Weather & operations' },
    { id: 'proc', no: '7', title: 'Airliner procedures' }
  ];

  /** Plain text with inline TeX between $…$ (explanations are written this way). */
  const UNIT_GAP = /(\d) (%|°C|°|kt|ft|NM|kg|hPa|kN|fpm|m\/s²?|m²|m³|km|kW|min|Pa|m|t|g|s|h|W|N|L)(?![\w²³/])/g;
  const inlineTex = (ctx, s) => String(s == null ? '' : s).split('$')
    .map((seg, i) => (i % 2 ? ctx.tex(seg, false) : seg.replace(UNIT_GAP, '$1 $2'))).join('');   // keep "10 %" together
  /** Slider / result labels: escape, and turn C_L or V_S1g into proper subscripts. */
  const labelHTML = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\b([A-Za-z])_([A-Za-z0-9]+)/g, '$1<sub>$2</sub>');

  /**
   * The "Explain" panel under a numbered equation: the equation in plain words, what every symbol
   * means (with units and typical values), why it looks the way it does, and sliders to try it.
   * Text comes from explain.js; the sliders are wired up by the app after the page renders.
   */
  function explainHTML(ctx, no) {
    const E = root.XFC.explain && root.XFC.explain[no];
    if (!E) return '';
    const t = s => inlineTex(ctx, s);
    const id = 'eqx-' + String(no).replace(/\W/g, '-');
    const parts = (E.parts || []).map(([sym, what, unit]) =>
      `<tr><td class="sym">${ctx.tex(sym, false)}</td><td><span class="what">${t(what)}</span>${unit ? `<span class="unit">${t(unit)}</span>` : ''}</td></tr>`).join('');
    const why = (E.why || []).map(s => `<li>${t(s)}</li>`).join('');
    const play = E.play ? `<h4>Try it — move the sliders</h4><div class="eqx-play" data-no="${no}">
        <div class="eqx-ins">${E.play.inputs.map(i => `<div class="eqx-in"><label for="${id}-${i.k}">${labelHTML(i.label)}</label><output for="${id}-${i.k}"></output>
          <input type="range" id="${id}-${i.k}" data-k="${i.k}" data-unit="${i.unit || ''}" min="${i.min}" max="${i.max}" step="${i.step}" value="${i.v}"></div>`).join('')}
          <button type="button" class="eqx-reset">Reset</button></div>
        <div class="eqx-out" aria-live="polite"></div></div>` : '';
    return `<details class="eqx" id="${id}" data-no="${no}"><summary><span class="eqx-q" aria-hidden="true">?</span><span class="eqx-t">Explain (${no})</span><span class="eqx-sub">in plain words · every symbol · why${E.play ? ' · try it' : ''}</span></summary>
      <div class="eqx-body"><p class="eqx-words">${t(E.words)}</p>
        ${parts ? `<h4>What each symbol means</h4><table class="eqx-parts"><tbody>${parts}</tbody></table>` : ''}
        ${why ? `<h4>Why it looks like this</h4><ol class="eqx-why">${why}</ol>` : ''}
        ${play}</div></details>`;
  }

  /** Build small HTML helpers bound to the app context (tex renderer, formatters). */
  function kit(ctx) {
    let n = 0;
    const eqNo = [];
    return {
      p: s => `<p>${s}</p>`,
      lead: s => `<p class="lead">${s}</p>`,
      h: s => `<h2>${s}</h2>`,
      fig: (svg, cap) => `<figure class="fig"><div class="draw">${svg}</div><figcaption>${cap}</figcaption></figure>`,
      eq: (t, no) => { n++; eqNo.push(no); return `<div class="eqn"><div class="m">${ctx.tex(t, true)}</div><div class="no">${no ? '(' + no + ')' : ''}</div></div>` + (no ? explainHTML(ctx, no) : ''); },
      /** Inline TeX between $…$ inside a sentence. */
      t: s => inlineTex(ctx, s),
      m: t => ctx.tex(t, false),
      vars: rows => `<table class="vars"><tbody>${rows.map(([a, b]) => `<tr><td>${ctx.tex(a, false)}</td><td>${b}</td></tr>`).join('')}</tbody></table>`,
      box: (title, html, cls = '') => `<div class="box ${cls}"><h3>${title}</h3>${html}</div>`,
      ul: items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`,
      tryit: links => `<div class="tryit">${links.map(([id, l]) => `<a class="btn" href="${id[0] === '#' ? id : '#calc.' + id}">${l} →</a>`).join('')}</div>`,
      code: s => `<code>${s}</code>`,
      n: (x, d = 0) => ctx.num(x, d),
      /** Multiple-choice self-test. qs = [{ q, a: [options], c: index of the right one, why }] */
      quiz: (qs, title = 'Check yourself') => !qs || !qs.length ? '' : `<section class="quiz"><h2>${title}</h2><ol>${qs.map(q => `<li class="qz" data-c="${q.c}"><p class="qq">${q.q}</p>
        <div class="qa">${q.a.map((a, i) => `<button type="button" data-i="${i}"><span class="ql">${'ABCD'[i]}</span><span>${a}</span></button>`).join('')}</div>
        <p class="why" hidden>${q.why || ''}</p></li>`).join('')}</ol><p class="qscore" aria-live="polite"></p></section>`
    };
  }

  const topics = [];
  const T = t => topics.push(t);

  // ===================================================================== 1 · POF
  T({ id: 'forces', ch: 'pof', no: '1.1', title: 'The four forces and the lift equation', blurb: 'Lift, weight, thrust and drag — and the one equation behind them.',
    thumb: () => Fg().forces(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const isa = C.isa(35000), V = 450 * C.K.KT, W = 65000 * C.K.g0, S = 124.6;
      const q = 0.5 * isa.rho * V * V, cl = W / (q * S);
      return k.lead('An aircraft in steady flight is in balance: lift equals weight and thrust equals drag. Every performance number in this app starts from that balance.') +
        k.fig(Fg().forces(), '<b>Fig. 1.1</b> — The four forces. In unaccelerated level flight they cancel in pairs.') +
        k.p('Lift and drag both come from the air flowing past the aircraft. Their size depends on the air density, the square of the true airspeed, the wing area, and a coefficient that captures the wing’s shape and angle of attack:') +
        k.eq(R`L = \tfrac12\,\rho\,V^2\,S\,C_L`, '1.1') + k.eq(R`D = \tfrac12\,\rho\,V^2\,S\,C_D`, '1.2') +
        k.vars([[R`\rho`, 'air density, kg/m³ (1.225 at ISA sea level)'], ['V', 'true airspeed, m/s'], ['S', 'wing reference area, m²'], [R`C_L,\ C_D`, 'lift and drag coefficients (no units)'], [R`q = \tfrac12\rho V^2`, 'dynamic pressure, Pa — what the pitot tube feels']]) +
        k.p(`Because ${k.m(R`\tfrac12\rho V^2`)} appears in both, the ratio ${k.m('L/D')} depends only on the coefficients. A modern airliner cruises at ${k.m(R`L/D \approx 17`)}: to hold up 65 tonnes it needs only about 37 kN of thrust.`) +
        k.fig(Fg().airfoil(), '<b>Fig. 1.2</b> — Lift acts at right angles to the relative wind, drag along it. The angle between the chord and the relative wind is the angle of attack α.') +
        k.box('Worked example — 737-800 in cruise', k.p(`At FL350 (ISA density ${k.n(isa.rho, 4)} kg/m³), TAS 450 kt (${k.n(V, 1)} m/s), mass 65 t, wing area ${S} m²:`) +
          k.eq(R`q = \tfrac12 \times ${isa.rho.toFixed(4)} \times ${V.toFixed(1)}^2 = ${Math.round(q)}\ \text{Pa}`) +
          k.eq(R`C_L = \frac{W}{qS} = \frac{65\,000 \times 9.807}{${Math.round(q)} \times ${S}} = ${cl.toFixed(3)}`) +
          k.p('A cruise lift coefficient around 0.5 is typical — the wing flies at only a few degrees angle of attack.'), 'example') +
        k.box('In X-Plane', k.ul([
          `${k.code('sim/flightmodel/weight/m_total')} — the mass the lift has to carry (kg)`,
          `${k.code('sim/flightmodel/position/true_airspeed')} — V in m/s; ${k.code('sim/weather/rho')} — the density`,
          `${k.code('sim/flightmodel2/position/alpha')} — angle of attack. Watch it rise as you slow down in level flight.`]), 'xp');
    } });

  T({ id: 'lift-curve', ch: 'pof', no: '1.2', title: 'Angle of attack, flaps and the lift curve', blurb: 'Why slow flight needs a higher angle of attack, and what flaps and slats change.',
    thumb: () => Fg().liftCurve(),
    render(ctx) {
      const k = kit(ctx);
      return k.lead('For a given wing, the lift coefficient grows almost linearly with angle of attack — until the flow separates and the wing stalls.') +
        k.fig(Fg().liftCurve(), '<b>Fig. 1.3</b> — Lift curves. Flaps shift the curve up (more camber); slats let the wing reach a higher angle before it stalls.') +
        k.eq(R`C_L \approx a\,(\alpha - \alpha_0), \qquad a \approx 0.08\text{–}0.11\ \text{per degree}`, '1.3') +
        k.p(`Rearranging the lift equation for level flight (${k.m('L = W')}) shows why slow flight needs a high angle of attack:`) +
        k.eq(R`C_L = \frac{2W}{\rho V^2 S}`, '1.4') +
        k.p(`Halve the speed and ${k.m('C_L')} must quadruple. The highest value the wing can produce, ${k.m(R`C_{L\max}`)}, sets the stall speed. High-lift devices raise it:`) +
        k.ul(['Clean swept wing: about 1.3–1.6', 'Take-off flaps: about 1.8–2.2', 'Landing flaps with slats: about 2.3–3.0']) +
        k.p('The performance module uses effective values like these for each aircraft and flap setting, tuned so the speeds match typical published figures.') +
        k.box('In X-Plane', k.p(`Plot ${k.code('sim/flightmodel2/position/alpha')} against speed during a slow deceleration in level flight, then repeat with flaps: the same speed needs a lower α. The flap handle is ${k.code('sim/cockpit2/controls/flap_handle_request_ratio')}.`), 'xp');
    } });

  T({ id: 'stall', ch: 'pof', no: '1.3', title: 'Stall speed, weight and load factor', blurb: 'Stall speed rises with weight and with g — by the square root.',
    thumb: () => Fg().stallBank(),
    render(ctx) {
      const k = kit(ctx), s = ctx.s;
      const v1 = 48 * Math.sqrt(900 / 1157);
      const live = s && s.vsEst ? k.box('Right now in your aircraft', k.p(`Estimated stall speed ${k.n(s.vsEst)} kt at the current mass, ${k.n(s.vsTurn)} kt with the present bank (${k.n(s.nz, 2)} g). Indicated airspeed ${k.n(s.ias)} kt.`), 'xp') : '';
      return k.lead('The stall speed is the speed at which the wing, at its maximum lift coefficient, can just support the aircraft. It is not fixed.') +
        k.eq(R`V_S = \sqrt{\frac{2\,n\,W}{\rho_0\,S\,C_{L\max}}}`, '1.5') +
        k.vars([['n', 'load factor, g (1 in level flight)'], ['W', 'weight, N'], [R`\rho_0`, 'sea-level density — gives the speed as EAS ≈ CAS, which is why the stall IAS hardly changes with altitude'], [R`C_{L\max}`, 'maximum lift coefficient for the configuration']]) +
        k.h('Weight') + k.p('Only the square root of weight matters:') + k.eq(R`V_{S2} = V_{S1}\sqrt{W_2 / W_1}`, '1.6') +
        k.p(`A light single with ${k.m('V_{S0} = 48')} kt at 1157 kg stalls at ${k.n(v1, 1)} kt at 900 kg. Every airliner speed — V2, Vref, green dot — scales the same way.`) +
        k.h('Load factor') + k.p(`In a level turn the lift must be ${k.m(R`n = 1/\cos\phi`)} times the weight, so the stall speed grows by ${k.m(R`\sqrt n`)}:`) +
        k.fig(Fg().stallBank(), '<b>Fig. 1.4</b> — Load factor (magenta) and the stall-speed multiplier (blue) against bank angle, drawn to scale.') +
        k.ul(['30° bank: 1.15 g, stall speed +7 %', '45° bank: 1.41 g, stall speed +19 %', '60° bank: 2 g, stall speed +41 %']) +
        k.box('Certification speeds built on it', k.ul([`Take-off safety speed ${k.m(R`V_2 \ge 1.13\,V_{S1g}`)}`, `Landing reference speed ${k.m(R`V_{REF} = 1.23\,V_{S1g}`)} in the landing configuration`, 'Airbus VLS is the same 1.23 margin, computed live by the flight computers'])) +
        live + k.box('In X-Plane', k.p(`The app scales the aircraft file’s ${k.code('sim/aircraft/view/acf_Vs')} / ${k.code('acf_Vso')} (quoted at maximum weight) by ${k.m(R`\sqrt{W/W_{max}}`)} and the bank from ${k.code('sim/flightmodel/position/phi')}.`), 'xp') +
        k.tryit([['turn', 'Turn performance']]);
    } });

  T({ id: 'turning', ch: 'pof', no: '1.4', title: 'Turning flight', blurb: 'Rate, radius and the standard-rate turn.',
    thumb: () => Fg().turn(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const t = C.turn({ tas: 250, bank: 25 });
      return k.lead('To turn, the aircraft banks so that part of the lift pulls it sideways. The rest must still hold up the weight.') +
        k.fig(Fg().turn(), '<b>Fig. 1.5</b> — Left: the lift vector split into a vertical part that balances weight and a horizontal part that provides the turn. Right: the resulting circle.') +
        k.eq(R`L\cos\phi = W, \qquad L\sin\phi = \frac{m V^2}{r}`, '1.7') +
        k.p('Dividing one by the other removes the mass and gives the radius and rate of turn:') +
        k.eq(R`r = \frac{V^2}{g\tan\phi}, \qquad \omega = \frac{V}{r} = \frac{g\tan\phi}{V}`, '1.8') +
        k.p(`Radius grows with the square of speed: double the TAS and the circle is four times as wide. A rate-one (standard-rate) turn is ${k.m(R`3^\circ/\text{s}`)}, two minutes for a full circle; its bank angle is`) +
        k.eq(R`\phi_{3^\circ/s} = \arctan\!\left(\frac{3^\circ\cdot\frac{\pi}{180}\,V}{g}\right) \approx \frac{V_{TAS}}{10} + 7^\circ`, '1.9') +
        k.box('Worked example', k.p(`TAS 250 kt at 25° bank: radius ${k.n(t.radiusNm, 2)} NM (${k.n(t.radiusM)} m), rate ${k.n(t.rateDps, 2)} °/s, a full circle in ${k.n(t.time360s / 60, 1)} min, load factor ${k.n(t.n, 2)} g. Airliners limit bank to 25–30°, so above about 200 kt they turn slower than rate one.`), 'example') +
        k.tryit([['turn', 'Turn performance'], ['holding', 'Holding']]);
    } });

  T({ id: 'glide', ch: 'pof', no: '1.5', title: 'Gliding and the lift-to-drag ratio', blurb: 'How far you go from a height — and why weight does not change it.',
    thumb: () => Fg().glide(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const g = C.glide({ heightFt: 35000, ld: 17 });
      return k.lead('Without thrust, drag has to be balanced by a component of weight: the aircraft trades height for distance.') +
        k.fig(Fg().glide(), '<b>Fig. 1.6</b> — The glide triangle. The glide ratio is simply the lift-to-drag ratio.') +
        k.eq(R`\tan\gamma = \frac{D}{L} = \frac{1}{L/D} \quad\Rightarrow\quad d = h \cdot \frac{L}{D}`, '1.10') +
        k.p('Best range comes at the speed of maximum L/D (best-glide speed). A heavier aircraft has the same maximum L/D — it just reaches it at a higher speed — so still-air glide distance does not depend on weight. Wind changes the ground distance in proportion to GS/TAS.') +
        k.box('Worked example', k.p(`An airliner at 35 000 ft with ${k.m(R`L/D = 17`)} glides about ${k.n(g.distNm)} NM in still air, descending at ${k.n(g.angle, 1)}°.`), 'example') +
        k.tryit([['glide', 'Glide distance']]);
    } });

  // ===================================================================== 2 · ATM
  T({ id: 'isa', ch: 'atm', no: '2.1', title: 'The International Standard Atmosphere', blurb: 'The reference atmosphere every altimeter, airspeed indicator and chart assumes.',
    thumb: () => Fg().isa(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C, s = ctx.s;
      const i10 = C.isa(10000);
      const live = s && Number.isFinite(s.isaDev) ? k.box('Right now', k.p(`At pressure altitude ${k.n(s.pa)} ft ISA is ${k.n(s.isaT, 1)} °C; outside it is ${k.n(s.oat, 1)} °C, so ISA ${s.isaDev >= 0 ? '+' : ''}${k.n(s.isaDev, 1)} °C.`), 'xp') : '';
      return k.lead('ISA is an agreed model of an average atmosphere. Real air differs from it every day; the differences are exactly what the calculators correct for.') +
        k.fig(Fg().isa(), '<b>Fig. 2.1</b> — ISA temperature and pressure, plotted from the formulas below.') +
        k.ul(['Sea level: 15 °C, 1013.25 hPa, 1.225 kg/m³', 'Temperature falls 6.5 °C per km (1.98 °C per 1000 ft) up to the tropopause at 11 km (36 089 ft)', 'Above it, −56.5 °C constant to 20 km']) +
        k.h('Troposphere') + k.eq(R`T = T_0 - L\,h`, '2.1') + k.eq(R`P = P_0\left(\frac{T}{T_0}\right)^{\frac{g_0}{R L}} = P_0\left(1 - \frac{L h}{T_0}\right)^{5.2559}`, '2.2') +
        k.h('Above the tropopause') + k.eq(R`P = P_{11}\,\exp\!\left(-\frac{g_0\,(h - 11\,000)}{R\,T_{11}}\right)`, '2.3') +
        k.h('Density and the speed of sound') + k.eq(R`\rho = \frac{P}{R\,T}, \qquad a = \sqrt{\gamma R T}`, '2.4') +
        k.vars([['T_0,\ P_0', '288.15 K, 101 325 Pa'], ['L', 'lapse rate 0.0065 K/m'], ['R', '287.05 J/(kg·K), gas constant of dry air'], [R`g_0`, '9.80665 m/s²'], [R`\gamma`, '1.4 for air']]) +
        k.box('Worked example — 10 000 ft', k.p(`T = ${k.n(i10.Tc, 2)} °C, P = ${k.n(i10.hPa, 1)} hPa, ρ = ${k.n(i10.rho, 4)} kg/m³ (σ = ${k.n(i10.sigma, 3)}), speed of sound ${k.n(i10.akt, 1)} kt.`), 'example') +
        k.box('Rules of thumb', k.ul(['Pressure falls about 1 hPa per 27–30 ft near sea level', 'Pressure is half the sea-level value at about 18 000 ft', 'ISA temperature ≈ 15 − 2 × (altitude in thousands of feet)'])) +
        live + k.tryit([['isa', 'ISA at any altitude'], ['altitudes', 'Pressure & density altitude']]);
    } });

  T({ id: 'altimetry', ch: 'atm', no: '2.2', title: 'Altimeter settings: QNH, QFE and standard', blurb: 'What the altimeter really measures, and why the setting matters.',
    thumb: () => Fg().altimetry(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const pa = C.pressureAltitude(3000, 1003);
      return k.lead('An altimeter is a barometer with a scale in feet. It converts the static pressure to a height using the standard atmosphere, measured from whatever pressure level you set in the window.') +
        k.eq(R`h_{ind} = h_{ISA}(P_{static}) - h_{ISA}(P_{set}), \qquad h_{ISA}(P) = 145\,366\left[1 - \left(\tfrac{P}{1013.25}\right)^{0.1903}\right]\ \text{ft}`, '2.5') +
        k.fig(Fg().altimetry(), '<b>Fig. 2.2</b> — The same aircraft, three different readings depending on the setting.') +
        k.ul(['<b>QNH</b> — reads altitude above mean sea level (on the ground it shows airfield elevation). Used below the transition altitude.',
          '<b>QFE</b> — reads height above the airfield (zero on the runway).',
          '<b>Standard (1013.25 hPa / 29.92 inHg)</b> — reads pressure altitude; flight levels are pressure altitude in hundreds of feet. Used above the transition level so everyone shares one datum.']) +
        k.p(`Pressure altitude from an altimeter reading: ${k.m(R`PA = h_{ind} + h_{ISA}(\text{QNH})`)}. With QNH 1003 hPa and 3000 ft indicated, PA = ${k.n(pa)} ft — about 27 ft per hPa.`) +
        k.fig(Fg().highLow(), '<b>Fig. 2.3</b> — Flying towards low pressure without resetting the altimeter: the aircraft follows the sloping pressure surface down.') +
        k.box('In X-Plane', k.ul([`Your setting: ${k.code('sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot')}`, `Actual QNH at the aircraft: ${k.code('sim/weather/aircraft/qnh_pas')}`, `Pressure altitude: ${k.code('sim/flightmodel2/position/pressure_altitude')}`, 'Press B for standard in most aircraft; the live panel shows STD when it is set.']), 'xp') +
        k.tryit([['altitudes', 'Pressure & density altitude']]);
    } });

  T({ id: 'density-altitude', ch: 'atm', no: '2.3', title: 'Density altitude and performance', blurb: 'Hot and high: the altitude the wing and engine actually feel.',
    thumb: () => Fg().densityAlt(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const d = C.densityAltitude(5000, 30);
      return k.lead('Density altitude is the height in the standard atmosphere where the density equals what you actually have. Wings and engines respond to density, so this is the altitude your aircraft performs at.') +
        k.eq(R`\rho = \frac{P(PA)}{R\,(OAT + 273.15)}, \qquad DA = \frac{T_0}{L}\left[1 - \left(\frac{\rho}{\rho_0}\right)^{0.2350}\right]`, '2.6') +
        k.eq(R`DA \approx PA + 118.8\,(OAT - T_{ISA})\ \text{ft}`, '2.7') +
        k.fig(Fg().densityAlt(), '<b>Fig. 2.4</b> — Density altitude against temperature for five pressure altitudes, from equation 2.6.') +
        k.p('Higher density altitude means the wing needs more true airspeed for the same lift, a normally aspirated engine makes less power, and a propeller bites less air. Take-off roll and climb both suffer.') +
        k.box('Worked example — hot day at a high airfield', k.p(`Pressure altitude 5000 ft, OAT 30 °C (ISA +${k.n(d.isaDev, 1)}): density altitude ${k.n(d.ft)} ft exactly, ${k.n(d.approxFt)} ft by the rule of thumb. The air is ${k.n((1 - d.sigma) * 100, 1)} % thinner than at ISA sea level.`), 'example') +
        k.box('Light-aircraft rules (UK CAA Safety Sense 7)', k.ul(['+1000 ft elevation: take-off distance ×1.10, landing ×1.05', '+10 °C: take-off ×1.10, landing ×1.05', '+10 % mass: take-off ×1.20, landing ×1.10', 'Dry grass: take-off ×1.20; wet grass ×1.30'])) +
        k.tryit([['altitudes', 'Density altitude'], ['ga-runway', 'Runway distances']]);
    } });

  T({ id: 'temperature-error', ch: 'atm', no: '2.4', title: 'Temperature error and cold-weather corrections', blurb: 'Cold air squeezes the pressure levels together — and your true altitude drops.',
    thumb: () => Fg().tempError(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const ct = C.coldTempCorrection({ heightFt: 1000, aerodromeTempC: -10, aerodromeElevFt: 0 });
      return k.lead('The altimeter assumes the air column below you has ISA temperatures. Cold air is denser, so the same pressure difference spans fewer feet: you are lower than indicated.') +
        k.fig(Fg().tempError(), '<b>Fig. 2.5</b> — Three air columns, each with the altimeter reading 3000 ft. In cold air the aircraft is lower than a ridge the chart says it clears.') +
        k.p('Integrating the hydrostatic equation through a layer that is ΔT warmer or colder than ISA gives the true height above the station:') +
        k.eq(R`\Delta h_{true} = \Delta h + \frac{\Delta T}{\lambda}\ln\!\left(1 + \frac{\lambda\,\Delta h}{T_0 + \lambda h_s}\right), \qquad \lambda = -0.0065\ \text{K/m}`, '2.8') +
        k.p('ICAO Doc 8168 publishes the simplified correction to add to minimum altitudes when the aerodrome is cold:') +
        k.eq(R`\text{Correction} = H\,\frac{15 - t_0}{273 + t_0 - 0.5\,L_0\,(H + H_{ss})}`, '2.9') +
        k.vars([['H', 'height above the altimeter-setting source'], ['t_0', 'aerodrome temperature reduced to sea level, °C'], ['L_0', '0.0065 °C/m'], ['H_{ss}', 'elevation of the altimeter-setting source']]) +
        k.box('Worked example', k.p(`Aerodrome at sea level, −10 °C (ISA −25). For a height of 1000 ft the accurate correction is ${k.n(ct.correctionFt)} ft (simplified formula ${k.n(ct.simplifiedFt)} ft; rule of thumb 4 % per 10 °C gives ${k.n(ct.ruleOfThumbFt)} ft).`), 'example') +
        k.box('In X-Plane', k.p(`X-Plane 12 models a real, non-standard atmosphere, so this error appears in the sim. It even exposes it: ${k.code('sim/weather/aircraft/altimeter_temperature_error')}. Compare the altimeter with ${k.code('sim/flightmodel/position/elevation')} on a cold day.`), 'xp') +
        k.tryit([['cold-temp', 'Cold temperature correction'], ['true-alt', 'True altitude']]);
    } });

  // ===================================================================== 3 · SPEED
  T({ id: 'airspeeds', ch: 'spd', no: '3.1', title: 'IAS, CAS, EAS, TAS and ground speed', blurb: 'Five speeds, one aircraft — what each one is for.',
    thumb: () => Fg().speedChain(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C, s = ctx.s;
      const r = C.casToTas(250, 10000, C.isaTempC(10000));
      const live = s && Number.isFinite(s.tasCalc) ? k.box('Right now', k.p(`CAS ${k.n(s.cas ?? s.ias)} kt at PA ${k.n(s.pa)} ft and ${k.n(s.oat, 1)} °C gives TAS ${k.n(s.tasCalc)} kt; X-Plane reports ${k.n(s.tas)} kt.`), 'xp') : '';
      return k.lead('The airspeed indicator measures a pressure, not a speed. Turning that pressure into the speed you move through the air takes three corrections.') +
        k.fig(Fg().pitot(), '<b>Fig. 3.1</b> — The pitot tube senses total pressure, the static port static pressure; their difference is the impact pressure q<sub>c</sub>.') +
        k.fig(Fg().speedChain(), '<b>Fig. 3.2</b> — From indicated to ground speed.') +
        k.ul(['<b>IAS</b> — what the needle shows.', '<b>CAS</b> — IAS corrected for instrument and position error. The indicator is calibrated so that CAS = TAS at ISA sea level.',
          '<b>EAS</b> — CAS corrected for compressibility of the air in the pitot (noticeable above about 200 kt and 10 000 ft).',
          '<b>TAS</b> — the real speed through the air. Navigation and the wind triangle use TAS.', '<b>GS</b> — TAS plus the wind: speed over the ground.']) +
        k.h('The exact relationship') + k.p('Subsonic compressible flow (Saint-Venant) links impact pressure to CAS, using sea-level values:') +
        k.eq(R`q_c = P_0\left[\left(1 + 0.2\left(\frac{V_c}{a_0}\right)^2\right)^{3.5} - 1\right]`, '3.1') +
        k.p('and to the Mach number, using the actual static pressure:') +
        k.eq(R`M = \sqrt{5\left[\left(\frac{q_c}{P} + 1\right)^{2/7} - 1\right]}, \qquad V_{TAS} = M\,a = M\sqrt{\gamma R T}`, '3.2') +
        k.eq(R`V_{EAS} = V_{TAS}\sqrt{\rho/\rho_0}`, '3.3') +
        k.box('Worked example', k.p(`CAS 250 kt at FL100 in ISA: Mach ${r.mach.toFixed(4)}, TAS ${k.n(r.tas, 1)} kt, EAS ${k.n(r.eas, 1)} kt. The rule of thumb (TAS = CAS + 2 % per 1000 ft) gives 300 kt — close, but 11 kt high.`), 'example') +
        live + k.box('In X-Plane', k.ul([`${k.code('sim/cockpit2/gauges/indicators/airspeed_kts_pilot')} — IAS`, `${k.code('sim/cockpit2/gauges/indicators/calibrated_airspeed_kts_pilot')} — CAS`, `${k.code('sim/flightmodel/position/true_airspeed')} — TAS (m/s)`, `${k.code('sim/flightmodel/position/groundspeed')} — GS (m/s)`]), 'xp') +
        k.tryit([['airspeed', 'Airspeed converter']]);
    } });

  T({ id: 'mach', ch: 'spd', no: '3.2', title: 'Mach number, TAT and the crossover altitude', blurb: 'Why jets climb on CAS and cruise on Mach.',
    thumb: () => Fg().crossover(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const xo = C.crossoverAltitude(290, 0.78).ft;
      const a0 = C.speedOfSoundKt(15), a11 = C.speedOfSoundKt(-56.5);
      return k.lead('The speed of sound depends only on temperature. At high altitude it is lower, so the same TAS is a higher Mach number — and the wing’s limits are set by Mach.') +
        k.eq(R`a = \sqrt{\gamma R T} \;\approx\; 38.94\sqrt{T}\ \text{kt}, \qquad M = \frac{V_{TAS}}{a}`, '3.4') +
        k.p(`At ISA sea level ${k.m('a')} = ${k.n(a0, 1)} kt; at the tropopause (−56.5 °C) only ${k.n(a11, 1)} kt.`) +
        k.h('Crossover altitude') +
        k.p('Climbing at a constant CAS, the TAS rises while the speed of sound falls, so Mach climbs quickly. At some altitude the chosen Mach is reached; above it the aircraft holds Mach instead. Both speeds need the same impact pressure there, which gives a closed form:') +
        k.eq(R`P_x = \frac{P_0\left[\left(1 + 0.2 (V_c/a_0)^2\right)^{3.5} - 1\right]}{(1 + 0.2 M^2)^{3.5} - 1}`, '3.5') +
        k.fig(Fg().crossover(), `<b>Fig. 3.3</b> — Constant 290 kt CAS and constant M0.78, with the crossover at about FL${Math.round(xo / 100)}. Temperature does not move it: it is a pressure altitude.`) +
        k.h('Total air temperature') +
        k.p('A temperature probe brings the air to rest, turning kinetic energy into heat. It reads the total air temperature, higher than the static (outside) temperature:') +
        k.eq(R`TAT = SAT\,(1 + 0.2\,r\,M^2)\quad (\text{Kelvin, recovery factor } r \approx 1)`, '3.6') +
        k.p('At M0.80 and −50 °C, the ram rise is about 29 °C. The FMS needs SAT for TAS and performance, so it uses this equation in reverse.') +
        k.box('In X-Plane', k.ul([`${k.code('sim/flightmodel/misc/machno')} — Mach`, `${k.code('sim/weather/aircraft/temperature_ambient_deg_c')} — SAT`, `${k.code('sim/weather/aircraft/temperature_leadingedge_deg_c')} — close to TAT`]), 'xp') +
        k.tryit([['crossover', 'Crossover altitude'], ['tat-sat', 'TAT ⇄ SAT']]);
    } });

  // ===================================================================== 4 · NAV
  T({ id: 'wind-triangle', ch: 'nav', no: '4.1', title: 'The wind triangle', blurb: 'Heading, track, drift and ground speed — vector addition in the sky.',
    thumb: () => Fg().windTriangle(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const w = C.windTriangle({ tas: 120, course: 90, windFrom: 40, windSpeed: 25 });
      return k.lead('The aircraft moves through the air, and the air moves over the ground. Your path over the ground is the sum of the two vectors.') +
        k.fig(Fg().windTriangle(), '<b>Fig. 4.1</b> — Air vector (heading, TAS) plus wind vector equals ground vector (track, GS). Drawn to scale.') +
        k.p('Let θ be the angle between the wind direction (where it blows from) and the course. The sine rule in the triangle gives the wind correction angle, and the along-track components give the ground speed:') +
        k.eq(R`\mathrm{WCA} = \arcsin\!\left(\frac{V_w\sin(\theta_w - \theta_c)}{V_{TAS}}\right)`, '4.1') +
        k.eq(R`GS = V_{TAS}\cos\mathrm{WCA} - V_w\cos(\theta_w - \theta_c)`, '4.2') +
        k.eq(R`\mathrm{HDG} = \theta_c + \mathrm{WCA}, \qquad \text{drift} = \mathrm{TRK} - \mathrm{HDG}`, '4.3') +
        k.box('Worked example', k.p(`TAS 120 kt, course 090°, wind 040°/25 kt: WCA ${k.n(w.wca, 1)}°, heading ${ctx.hdg(w.heading)}, ground speed ${k.n(w.gs, 1)} kt. The largest drift this wind can cause is ${k.m(R`\arcsin(25/120)`)} = ${k.n(C.deg(Math.asin(25 / 120)), 1)}°.`), 'example') +
        k.box('Rules of thumb', k.ul(['Max drift ≈ wind speed × 60 / TAS (degrees)', 'Actual drift ≈ max drift × sin(wind angle)', 'Winds in METARs and forecasts are true; ATIS and tower winds are magnetic'])) +
        k.box('In X-Plane', k.p(`Heading ${k.code('sim/flightmodel/position/psi')} and track ${k.code('sim/flightmodel/position/hpath')} differ by the drift; the live panel shows it. The wind at the aircraft is ${k.code('sim/weather/aircraft/wind_now_direction_degt')} / ${k.code('wind_now_speed_msc')}.`), 'xp') +
        k.tryit([['wind-triangle', 'Wind triangle'], ['find-wind', 'Find the wind']]);
    } });

  T({ id: 'crosswind', ch: 'nav', no: '4.2', title: 'Headwind and crosswind components', blurb: 'Splitting the wind along and across the runway.',
    thumb: () => Fg().crosswind(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const w = C.windComponents(303, 20, 263);
      return k.lead('For take-off and landing only two parts of the wind matter: along the runway (head or tail) and across it.') +
        k.fig(Fg().crosswind(), '<b>Fig. 4.2</b> — Resolving a 20 kt wind 40° off the runway.') +
        k.eq(R`HW = V_w\cos\alpha, \qquad XW = V_w\sin\alpha`, '4.4') +
        k.p(`α is the angle between the wind and the runway heading. For wind 303°/20 kt on runway 26 (263°): headwind ${k.n(w.head, 1)} kt, crosswind ${k.n(w.cross, 1)} kt from the right. With gusts, use the gust value for the crosswind check.`) +
        k.ul(['Runway numbers are magnetic heading ÷ 10, rounded.', 'Most aircraft are limited to about 10 kt of tailwind; crosswind limits are in the flight manual (“maximum demonstrated”).', 'Airliner performance counts only 50 % of a headwind but 150 % of a tailwind — a built-in safety margin.']) +
        k.tryit([['crosswind', 'Runway wind components']]);
    } });

  T({ id: 'great-circle', ch: 'nav', no: '4.3', title: 'Great circles and the 1-in-60 rule', blurb: 'The shortest way round the Earth, and a mental-maths shortcut.',
    thumb: () => Fg().greatCircle(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const g = C.greatCircle(40.6398, -73.7789, 51.47, -0.4543);
      return k.lead('The shortest path between two points on a sphere is an arc of a great circle — a circle whose centre is the centre of the Earth. Its course changes as you fly it.') +
        k.fig(Fg().greatCircle(), '<b>Fig. 4.3</b> — On a Mercator chart the great circle bows towards the pole; the straight line (rhumb line) keeps one course but is longer.') +
        k.eq(R`a = \sin^2\frac{\Delta\varphi}{2} + \cos\varphi_1\cos\varphi_2\sin^2\frac{\Delta\lambda}{2}, \qquad d = 2R\,\operatorname{atan2}\!\left(\sqrt a, \sqrt{1-a}\right)`, '4.5') +
        k.eq(R`\theta_0 = \operatorname{atan2}\!\left(\sin\Delta\lambda\cos\varphi_2,\ \cos\varphi_1\sin\varphi_2 - \sin\varphi_1\cos\varphi_2\cos\Delta\lambda\right)`, '4.6') +
        k.vars([[R`\varphi,\ \lambda`, 'latitude, longitude'], ['R', 'mean Earth radius, 3440 NM'], ['1\\ \\text{NM}', '1852 m = one minute of latitude']]) +
        k.box('Worked example', k.p(`New York JFK to London Heathrow: ${k.n(g.distNm)} NM great circle, initial course ${ctx.hdg(g.initial)} true, arriving on ${ctx.hdg(g.final)}.`), 'example') +
        k.h('The 1-in-60 rule') + k.p(`Because ${k.m(R`\sin 1^\circ \approx 1/57`)}, an error of 1 NM after 60 NM is about 1°. To regain track at the destination, turn back by the track error plus the closing angle:`) +
        k.eq(R`\Delta\mathrm{HDG} = \frac{60\,x}{d_{flown}} + \frac{60\,x}{d_{to\,go}}`, '4.7') +
        k.tryit([['great-circle', 'Great-circle distance'], ['one-in-sixty', '1-in-60'], ['tsd', 'Time · speed · distance']]);
    } });

  T({ id: 'holding', ch: 'nav', no: '4.4', title: 'Holding patterns and entries', blurb: 'Racetracks, entry sectors, timing and wind correction.',
    thumb: () => Fg().holding(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const e = C.holdingEntry({ inbound: 90, heading: 210, turn: 'R' });
      return k.lead('A hold is a racetrack around a fix: an inbound leg to the fix, a 180° turn, an outbound leg and another turn. Standard holds turn right.') +
        k.fig(Fg().holding(), '<b>Fig. 4.4</b> — A right-hand hold with inbound course 360°. The shaded sectors show the direction you arrive <b>from</b> (your heading points from the sector to the fix). Within 5° of a boundary either entry is allowed.') +
        k.h('Choosing the entry') +
        k.p(`The entry depends on your heading when you reach the fix. Take the difference ${k.m(R`\Delta = \mathrm{HDG} - \mathrm{INB}`)} (0–360°). For a right-hand hold:`) +
        k.ul([`${k.m(R`110^\circ \le \Delta \le 180^\circ`)} — <b>teardrop</b>: fly outbound 30° into the holding side, then turn in.`, `${k.m(R`180^\circ < \Delta \le 290^\circ`)} — <b>parallel</b>: fly outbound on the non-holding side, then turn back through more than 180°.`, 'otherwise — <b>direct</b>: turn straight onto the outbound leg.']) +
        k.p('For a left-hand hold the picture is mirrored: parallel 70°–180°, teardrop 180°–250°. ICAO allows ±5° either side of a sector boundary.') +
        k.box('Worked example', k.p(`Right-hand hold, inbound 090°, arriving on heading 210°: Δ = ${k.n(e.diff)}°, so a ${e.entry} entry. Outbound course ${ctx.hdg(e.outbound)}, teardrop heading ${ctx.hdg(e.teardropHeading)}.`), 'example') +
        k.h('Timing, speed and wind') + k.ul(['Inbound leg 1 minute at or below 14 000 ft, 1½ minutes above (ICAO)', 'Maximum speeds (ICAO): 230 kt to 14 000 ft, 240 kt to 20 000 ft, 265 kt to 34 000 ft, then M0.83', 'Outbound heading: apply three times the inbound wind correction angle', 'Outbound time: adjust by about 1 s per knot of wind along the inbound course']) +
        k.tryit([['holding', 'Holding entry & timing']]);
    } });

  T({ id: 'descent', ch: 'nav', no: '4.5', title: 'Climb and descent planning', blurb: 'Top of descent, 3° paths and climb gradients.',
    thumb: () => Fg().descent(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const d = C.descent({ fromFt: 36000, toFt: 3000, gs: 380, angleDeg: 3, decelNm: 10 });
      return k.lead('A descent is a path in the vertical plane. Pick an angle, and the distance and the rate follow from the geometry.') +
        k.fig(Fg().descent(), '<b>Fig. 4.5</b> — Top of descent, a 3° path and a level segment to slow down.') +
        k.eq(R`D = \frac{\Delta H}{6076\,\tan\gamma}\ \text{NM}, \qquad VS = GS \cdot \frac{6076}{60}\tan\gamma\ \text{fpm}`, '4.8') +
        k.p(`For 3°, ${k.m(R`\tan 3^\circ = 0.0524`)}: 318 ft per NM, and ${k.m(R`VS \approx 5.3 \times GS`)}. That is where the “3 NM per 1000 ft” and “5 × ground speed” rules come from.`) +
        k.box('Worked example', k.p(`From FL360 to 3000 ft at 380 kt ground speed: the 3° path is ${k.n(d.pathNm)} NM; with 10 NM to slow down, start ${k.n(d.distNm)} NM out and descend at about ${k.n(d.vs)} fpm for ${k.n(d.timeMin)} minutes.`), 'example') +
        k.h('Climb gradients') + k.p('Departure procedures give a minimum climb gradient. Convert it to a rate for your ground speed:') +
        k.eq(R`\text{ft/NM} = \frac{\%}{100} \times 6076, \qquad ROC = \text{ft/NM} \times \frac{GS}{60}`, '4.9') +
        k.p('A 3.3 % gradient (the standard obstacle surface plus margin) is 200 ft/NM: 533 fpm at 160 kt.') +
        k.box('In X-Plane', k.p(`The default FMS publishes its distance to top of descent in ${k.code('sim/cockpit2/radios/indicators/fms_distance_to_tod_pilot')}; the live panel shows it next to the 3° rate for your current ground speed.`), 'xp') +
        k.tryit([['descent', 'Top of descent'], ['vpath', 'Vertical path to a fix'], ['climb-gradient', 'Climb gradient']]);
    } });

  // ===================================================================== 5 · PERF
  T({ id: 'mass-balance', ch: 'perf', no: '5.1', title: 'Mass and balance', blurb: 'Weights, limits and where the centre of gravity sits.',
    thumb: () => Fg().massBalance(),
    render(ctx) {
      const k = kit(ctx);
      return k.lead('Two questions before every flight: is the aircraft too heavy, and is the weight in the right place?') +
        k.fig(Fg().massBalance(), '<b>Fig. 5.1</b> — Each load acts at its arm from the datum. The CG is where the whole aircraft would balance.') +
        k.eq(R`x_{CG} = \frac{\sum m_i\,x_i}{\sum m_i}`, '5.1') + k.eq(R`\%\mathrm{MAC} = \frac{x_{CG} - x_{LEMAC}}{\bar c} \times 100`, '5.2') +
        k.p('A forward CG makes the aircraft more stable but needs more tail download, which raises the stall speed and fuel burn. An aft CG is lighter on the controls and less stable. Both have limits.') +
        k.h('Airliner weights') +
        k.ul(['<b>DOW</b> — dry operating weight: empty aircraft plus crew, catering, water', '<b>ZFW</b> — DOW + payload. Limited by <b>MZFW</b>: fuel in the wings relieves bending, so above this, extra weight must be fuel.', '<b>TOW</b> — ZFW + take-off fuel. Limited by <b>MTOW</b> (structure and performance).', '<b>LW</b> — TOW − trip fuel. Limited by <b>MLW</b> (landing gear and structure).']) +
        k.p('The allowed take-off weight is the smallest of MTOW, MZFW + take-off fuel and MLW + trip fuel; the gap to the actual weight is the underload you could still carry. EASA standard masses: 84 kg per adult passenger including hand baggage.') +
        k.tryit([['wb', 'Mass & balance']]) + '<div class="tryit"><a class="btn" href="#perf.load">Load sheet →</a></div>';
    } });

  T({ id: 'takeoff', ch: 'perf', no: '5.2', title: 'Take-off: V1, VR, V2 and field length', blurb: 'The speeds that decide go or stop, and how long the runway must be.',
    thumb: () => Fg().takeoff(),
    render(ctx) {
      const k = kit(ctx), P = ctx.P, p = ctx.profile;
      const m = Math.round(p.mtow * 0.88);
      const sp = P.takeoffSpeeds(p, m, null);
      return k.lead('A multi-engine take-off is planned so that an engine failure at any moment leaves a safe choice: stop on the runway, or continue and climb away.') +
        k.fig(Fg().takeoff(), '<b>Fig. 5.2</b> — Take-off speeds and what happens if an engine fails before or after V1.') +
        k.ul(['<b>V1</b> — decision speed. The fastest you can start a rejected take-off and stop in the distance available, and the slowest at which you can continue.', '<b>VR</b> — rotation speed.', '<b>V2</b> — take-off safety speed, reached by 35 ft with one engine out: at least 1.13 × the 1-g stall speed and 1.1 × VMCA.', '<b>VMCG / VMCA</b> — minimum control speeds on the ground and in the air with the critical engine failed.']) +
        k.eq(R`V_{S1g} = \sqrt{\frac{2W}{\rho_0 S C_{L\max,TO}}}, \qquad V_2 \ge 1.13\,V_{S1g}`, '5.3') +
        k.h('Field length') + k.p('The runway must cover the take-off distance (to 35 ft, all engines ×1.15 or one engine out) and the accelerate-stop distance. The ground roll grows with the square of lift-off speed and falls with acceleration, which gives the classic scaling the app uses:') +
        k.eq(R`\text{TOFL} \propto \frac{W^2}{\sigma\,S\,C_{L\max}\,T}`, '5.4') +
        k.ul(['Heavier: ×(W/W₀)² — 10 % heavier ≈ 21 % longer', 'Hot or high: thinner air needs more TAS and the engines give less thrust', 'More flap: lower speeds, shorter run (but worse climb)', 'Wind: 50 % of headwind, 150 % of tailwind; uphill slope and wet runways lengthen it']) +
        k.box(`Worked example — ${p.name}`, k.p(`At ${k.n(m / 1000, 1)} t with ${p.policy === 'airbus' ? 'CONF' : 'flaps'} ${sp.flap}: ${k.m(R`V_{S1g}`)} = ${k.n(sp.vs1g)} kt → V1 ${k.n(sp.v1)}, VR ${k.n(sp.vr)}, V2 ${k.n(sp.v2)} kt.`), 'example') +
        '<div class="tryit"><a class="btn" href="#perf.takeoff">Take-off calculator →</a></div>';
    } });

  T({ id: 'flex', ch: 'perf', no: '5.3', title: 'Reduced thrust: assumed temperature and FLEX', blurb: 'Using less thrust when the runway allows — and why it saves engines.',
    thumb: () => Fg().flex(),
    render(ctx) {
      const k = kit(ctx), P = ctx.P, p = ctx.profile;
      const fx = P.flexTemp(p, { mass: Math.round(p.mtow * 0.82), flap: null, elevFt: 0, qnh: 1013.25, oatC: 15, headwind: 5, slopePct: 0, surface: 'dry', toraM: Math.round(p.toflRef * 1.35) });
      return k.lead('Most take-offs do not need full thrust. Telling the engines it is hotter than it is gives exactly the thrust the runway requires — and much less engine wear.') +
        k.fig(Fg().flex(), '<b>Fig. 5.3</b> — A flat-rated engine gives constant thrust up to its flat-rating temperature, then less. The assumed temperature is where available thrust meets the thrust needed.') +
        k.p(`Jet engines are flat-rated: thrust is held constant up to a temperature (about ISA+15, 30 °C at sea level), then falls — roughly ${(P.THRUST_LAPSE_PER_C * 100).toFixed(2)} % per °C in this app’s model. The performance calculation is also done at the assumed temperature, so the thinner air makes it conservative.`) +
        k.eq(R`T_{flex} = \max\left\{T : \text{TOFL}(W, T) \le \text{TORA},\ \ 1 - \frac{\text{Thrust}(T)}{\text{Thrust}(OAT)} \le 25\,\%\right\}`, '5.5') +
        k.ul(['Must be above the OAT and the flat-rating temperature, and below T MAX FLEX (about ISA + 55)', 'Maximum reduction 25 % of full thrust', 'Not allowed on contaminated runways', 'Airbus calls it FLEX; Boeing uses assumed temperature, often combined with fixed derates (TO-1, TO-2)']) +
        k.box(`Worked example — ${p.name}`, k.p(fx.flex != null ? `At 82 % of MTOW on a ${k.n(Math.round(p.toflRef * 1.35))} m runway at sea level, 15 °C: full-thrust field length ${k.n(fx.toga.tofl)} m; assumed temperature ${fx.flex} °C cuts thrust by ${k.n(fx.reduction * 100)} % and still needs only ${k.n(fx.flexDist.tofl)} m (limited by ${fx.limitedBy}).` : 'No reduced thrust possible in this example.'), 'example') +
        '<div class="tryit"><a class="btn" href="#perf.takeoff">Take-off calculator →</a></div>';
    } });

  T({ id: 'landing', ch: 'perf', no: '5.4', title: 'Landing: Vref, Vapp and landing distance', blurb: 'Approach speeds, wind additives and stopping on the runway.',
    thumb: () => Fg().landing(),
    render(ctx) {
      const k = kit(ctx), P = ctx.P, p = ctx.profile;
      const m = Math.round(p.mlw * 0.9);
      const ls = P.landingSpeeds(p, m, null, { headwind: 15 });
      const ab = (p.autobrake || [])[1] || (p.autobrake || [])[0];
      const ld = P.landingDistance(p, { mass: m, flap: null, elevFt: 0, qnh: 1013.25, oatC: 15, headwind: 15, slopePct: 0, surface: 'dry', decel: ab ? ab.d : 2, reverse: true });
      return k.lead('Landing speeds are margins above the stall; landing distances are margins on top of physics.') +
        k.eq(R`V_{REF} = 1.23\,V_{S1g,\,LDG}`, '5.6') +
        k.p('Airbus calls this VLS. The approach speed adds a wind margin for gusts and shear:') +
        k.ul([`Boeing: ${k.m(R`V_{app} = V_{REF} + \max\!\left(5,\ \tfrac12 HW + \text{gust}\right)`)}, at most +20 kt`, `Airbus: ${k.m(R`V_{APP} = V_{LS} + \max\!\left(5,\ \tfrac13 HW\right)`)}, at most +15 kt`]) +
        k.fig(Fg().landing(), '<b>Fig. 5.4</b> — From 50 ft over the threshold to a stop.') +
        k.eq(R`\text{ALD} = d_{air} + d_{transition} + \frac{V_{td}^2}{2a}`, '5.7') +
        k.p('Autobrake holds a set deceleration, so reverse thrust only reduces brake wear — unless braking is already at the friction limit (MAX or manual on a slippery runway), where reversers do shorten the stop.') +
        k.ul(['<b>At dispatch</b>: certified distance ÷ 0.6 (×1.67) must fit; wet runway ×1.15 more', '<b>In flight</b>: actual landing distance × 1.15 must fit the runway']) +
        k.box(`Worked example — ${p.name}`, k.p(`At ${k.n(m / 1000, 1)} t, ${p.policy === 'airbus' ? 'CONF' : 'flaps'} ${ls.flap}, 15 kt headwind: ${ls.name} ${k.n(ls.vref)} kt + ${k.n(ls.add)} = ${k.n(ls.vapp)} kt. With ${ab ? ab.id : 'braking'} (${ab ? ab.d.toFixed(2) : '—'} m/s²) the actual landing distance is about ${k.n(ld.ald)} m (${k.n(ld.factored)} m with the 15 % margin).`), 'example') +
        '<div class="tryit"><a class="btn" href="#perf.landing">Landing calculator →</a></div>';
    } });

  T({ id: 'fuel', ch: 'perf', no: '5.5', title: 'Fuel planning', blurb: 'Trip, contingency, alternate, final reserve — and why each exists.',
    thumb: () => Fg().fuel(),
    render(ctx) {
      const k = kit(ctx), P = ctx.P, p = ctx.profile;
      const fp = P.fuelPlan(p, { distNm: 500, cruiseFt: Math.min(35000, p.ceilingFt - 3000), altNm: 100, contPct: 5, finalResMin: 30 });
      return k.lead('Fuel is planned in layers, each covering a different risk. ICAO Annex 6 and EASA use the same structure.') +
        k.fig(Fg().fuel(), '<b>Fig. 5.5</b> — Block fuel for a short 737 sector.') +
        k.ul(['<b>Taxi</b> — start-up and taxi to the runway', '<b>Trip</b> — take-off, climb, cruise, descent, approach and landing at destination', '<b>Contingency</b> — 5 % of trip (at least 5 min holding) for the unforeseen: winds, reroutes, levels', '<b>Alternate</b> — go-around at destination, climb, cruise and landing at the alternate', '<b>Final reserve</b> — 30 min holding at 1500 ft for turbine aircraft (45 min for piston)', '<b>Extra</b> — the commander’s choice: weather, traffic, tankering']) +
        k.eq(R`\text{Block} = \text{Taxi} + \text{Trip} + \text{Cont} + \text{Alt} + \text{Final} + \text{Extra}`, '5.8') +
        k.eq(R`\text{Trip} \approx t_{climb}\,\dot m_{climb} + \frac{D_{cruise}}{GS}\,\dot m_{cruise} + t_{desc}\,\dot m_{idle} + \text{approach}`, '5.9') +
        k.box(`Worked example — ${p.name}`, k.p(`500 NM with a 100 NM alternate: trip ${k.n(fp.trip.fuel)} kg in ${k.n(fp.trip.time)} min, contingency ${k.n(fp.contingency)} kg, alternate ${k.n(fp.alternate.fuel)} kg, final reserve ${k.n(fp.finalReserve)} kg, taxi ${k.n(fp.taxi)} kg → block ${k.n(fp.block)} kg.`), 'example') +
        k.box('Handy numbers', k.ul(['Jet fuel ≈ 0.80 kg/L (6.7 lb/US gal); AvGas ≈ 0.72 kg/L (6.0 lb/US gal)', 'Carrying extra fuel burns fuel: roughly 3–4 % of the extra per flight hour']), '') +
        k.box('In X-Plane', k.p(`Fuel on board ${k.code('sim/flightmodel/weight/m_fuel_total')} (kg) and flow ${k.code('sim/cockpit2/engine/indicators/fuel_flow_kg_sec')} (per engine) give the live endurance and range.`), 'xp') +
        '<div class="tryit"><a class="btn" href="#perf.fuel">Fuel plan →</a><a class="btn" href="#calc.fuel">Endurance & range →</a></div>';
    } });


  // ===================================================================== MORE TOPICS
  T({ id: 'drag', ch: 'pof', no: '1.6', title: 'Drag, the drag curve and best L/D', blurb: 'Parasite and induced drag, the minimum-drag speed, and why slower can need more thrust.',
    thumb: () => Fg().dragCurve(),
    render(ctx) {
      const k = kit(ctx);
      const vmd = Fg().jetVmd(), d = Fg().jetDrag(vmd), ld = 0.5 * Math.sqrt(Math.PI * 9.45 * 0.8 / 0.022);
      return k.lead('Drag has two parts that behave in opposite ways. Parasite drag grows with the square of speed; induced drag — the price of making lift — shrinks with it.') +
        k.fig(Fg().dragCurve(), '<b>Fig. 1.7</b> — Drag of a 65 t narrow-body at sea level (model: C<sub>D0</sub> = 0.022, aspect ratio 9.45, e = 0.8). The total is lowest where the two parts are equal.') +
        k.eq(R`C_D = C_{D0} + \frac{C_L^2}{\pi A e}`, '1.11') +
        k.vars([[R`C_{D0}`, 'zero-lift (parasite) drag coefficient: skin friction, form and interference drag'], ['A', 'aspect ratio b²/S — long, slender wings make less induced drag'], ['e', 'Oswald efficiency factor, about 0.7–0.85']]) +
        k.p(`Induced drag comes from the wingtip vortices. At low speed the wing needs a high ${k.m('C_L')}, so induced drag is large; at high speed it almost vanishes. Parasite drag does the opposite. The total is smallest at the <b>minimum-drag speed</b> ${k.m(R`V_{md}`)}, where the two are equal and the lift-to-drag ratio is highest:`) +
        k.eq(R`\left(\frac{L}{D}\right)_{\max} = \frac12\sqrt{\frac{\pi A e}{C_{D0}}}, \qquad C_{L,md} = \sqrt{\pi A e\,C_{D0}}`, '1.12') +
        k.box('Worked example', k.p(`For the model above ${k.m(R`(L/D)_{\max}`)} = ${k.n(ld, 1)}, reached at ${k.m(R`V_{md}`)} ≈ ${k.n(vmd)} kt EAS, where the drag is ${k.n(d.para + d.ind, 1)} kN — about 1/${k.n(ld)} of the 637 kN weight. A jet gets its best range at about ${k.m(R`1.32\,V_{md}`)}; a propeller aircraft at ${k.m(R`V_{md}`)} itself.`), 'example') +
        k.h('The back of the drag curve') +
        k.p(`Below ${k.m(R`V_{md}`)}, slowing down <i>increases</i> drag. If the speed drops, drag rises and the aircraft slows further unless you add thrust: the speed is unstable. That is why approaches are flown with autothrust or an active hand on the thrust levers, and why a low, slow approach can need surprising power.`) +
        k.box('In X-Plane', k.p(`Hold level flight at several speeds and note the thrust (N1 in ${k.code('sim/cockpit2/engine/indicators/N1_percent')}) it takes: it is lowest near ${k.m(R`V_{md}`)} — for an airliner about the clean manoeuvre speed; Airbus green dot is defined as the best lift-to-drag speed.`), 'xp') +
        k.tryit([['glide', 'Glide distance']]);
    },
    quiz: [
      { q: 'Parasite drag grows with…', a: ['the speed', 'the square of the speed', '1 / speed²', 'the weight only'], c: 1, why: 'D = ½ρV²S·C<sub>D0</sub>: double the speed, four times the parasite drag.' },
      { q: 'At the minimum-drag speed…', a: ['induced drag is zero', 'induced and parasite drag are equal', 'parasite drag is zero', 'the wing is at its stall angle'], c: 1, why: 'The two curves cross there, and L/D is at its maximum.' },
      { q: 'Below Vmd, if the speed drops a little and thrust stays the same…', a: ['drag falls and the aircraft speeds up again', 'drag rises and the aircraft keeps slowing down', 'nothing happens', 'the aircraft climbs'], c: 1, why: 'On the back of the drag curve the speed is unstable: slower means more drag.' }
    ] });

  T({ id: 'climb', ch: 'pof', no: '1.7', title: 'Climb performance: Vx and Vy', blurb: 'Steepest climb, fastest climb, and what excess thrust and power have to do with it.',
    thumb: () => Fg().climb(),
    render(ctx) {
      const k = kit(ctx), m = Fg().climbModel();
      return k.lead('An aircraft climbs with whatever thrust is left over after overcoming drag. How much is left over — and at which speed — decides how steeply and how fast it climbs.') +
        k.fig(Fg().climb(), '<b>Fig. 1.8</b> — Climb angle and rate of climb for a model light single (1157 kg, 180 hp, sea level). Vx gives the steepest path, Vy the most height per minute.') +
        k.eq(R`\sin\gamma = \frac{T - D}{W}`, '1.13') +
        k.eq(R`\text{ROC} = V\sin\gamma = \frac{T\,V - D\,V}{W} = \frac{P_{avail} - P_{req}}{W}`, '1.14') +
        k.p('<b>Vx</b> is the speed of greatest excess <i>thrust</i>: fly it to clear an obstacle. <b>Vy</b> is the speed of greatest excess <i>power</i>: fly it to gain height quickly. A propeller’s thrust falls as speed rises, so a propeller aircraft’s Vx is only a little above the stall; a jet’s thrust is nearly constant, so its Vx is near the minimum-drag speed and its Vy much higher.') +
        k.box('Worked example', k.p(`The model gives Vx ${k.n(m.vx.kt)} kt (${k.n(m.vx.angle, 1)}° climb) and Vy ${k.n(m.vy.kt)} kt (${k.n(m.vy.roc)} fpm). The Cessna 172S handbook: Vx 62 kt, Vy 74 kt, about 730 fpm at sea level.`), 'example') +
        k.h('Altitude and ceilings') +
        k.p('A normally aspirated engine loses power with height, so the excess power shrinks. Vx rises and Vy falls until they meet at the <b>absolute ceiling</b>, where the aircraft can no longer climb. The <b>service ceiling</b> is where the best rate of climb has fallen to 100 fpm.') +
        k.box('In X-Plane', k.p(`After take-off in the 172, try both speeds: at Vx the nose is high and the ground drops away steeply but slowly; at Vy the vertical speed (${k.code('sim/flightmodel/position/vh_ind_fpm')}) peaks.`), 'xp') +
        k.tryit([['climb-gradient', 'Climb gradient ⇄ rate']]);
    },
    quiz: [
      { q: 'To clear an obstacle after take-off you fly…', a: ['Vy', 'Vx', 'Vne', 'Vfe'], c: 1, why: 'Vx gives the most height per distance travelled: the steepest climb angle.' },
      { q: 'As you climb higher, Vx and Vy…', a: ['move further apart', 'come closer and meet at the absolute ceiling', 'stay exactly the same', 'both fall to zero'], c: 1, why: 'Excess power shrinks with height; at the absolute ceiling there is only one speed that holds level flight.' },
      { q: 'The service ceiling is where the rate of climb has fallen to…', a: ['0 fpm', '100 fpm', '500 fpm', '1000 fpm'], c: 1, why: 'For piston aircraft the service ceiling is defined at 100 fpm (jets often use 500 fpm).' }
    ] });

  T({ id: 'stability', ch: 'pof', no: '1.8', title: 'Stability, trim and the centre of gravity', blurb: 'Why the CG must sit ahead of the neutral point, and what the tail is really doing.',
    thumb: () => Fg().stability(),
    render(ctx) {
      const k = kit(ctx);
      const W = 1100, d = 0.10, lt = 4.5, tail = W * d / lt;
      return k.lead('A stable aircraft returns to its trimmed attitude after a gust. In pitch, that depends almost entirely on where the centre of gravity is.') +
        k.fig(Fg().stability(), '<b>Fig. 1.9</b> — Wing lift, weight and the tail load in balance. The distance from the CG to the neutral point is the static margin.') +
        k.p('Wing lift acts at the aerodynamic centre, about a quarter of the way back along the mean chord. With the CG ahead of it, the lift makes a nose-down moment that a small down-load on the tail balances. If a gust raises the nose, both the wing and the tail meet the air at a bigger angle; with the CG ahead of the <b>neutral point</b>, the tail’s extra lift wins and pushes the nose back down.') +
        k.eq(R`K_n = \frac{x_{NP} - x_{CG}}{\bar c}`, '1.15') +
        k.eq(R`L_t = \frac{W\,(x_{CG} - x_{ac})}{l_t} \qquad (\text{negative} = \text{down-load})`, '1.16') +
        k.vars([['K_n', 'static margin, fraction of the mean aerodynamic chord — positive means stable'], [R`x_{NP},\ x_{CG},\ x_{ac}`, 'positions of the neutral point, CG and wing aerodynamic centre'], ['l_t', 'tail arm, CG to the tail’s aerodynamic centre']]) +
        k.box('Worked example', k.p(`A ${W} kg single with its CG ${d} m ahead of the aerodynamic centre and a ${lt} m tail arm needs a tail down-load of about ${k.n(tail)} kg-force. The wing must now lift ${k.n(W + tail)} kg, so the stall speed rises by ${k.n((Math.sqrt((W + tail) / W) - 1) * 100, 1)} %. Move the CG to the forward limit and the effect doubles.`), 'example') +
        k.ul(['<b>Forward limit</b> — set by elevator power (can you still flare with idle power?) and nose-gear loads. Forward CG: more tail load, higher stall speed, more fuel burn.', '<b>Aft limit</b> — set by stability and stall recovery. Aft CG: light, twitchy pitch control; behind the neutral point the aircraft diverges by itself.', '<b>Trim</b> removes the control force for the chosen speed; it does not change how stable the aircraft is.']) +
        k.box('In X-Plane', k.p('In <b>Flight → Flight Configuration → Weight, Balance & Fuel</b>, move the CG slider and fly a few circuits: an aft CG makes pitch light and twitchy, a forward one makes the flare heavy. Airliners like the A330 and MD-11 pump fuel into a tail tank to cruise with an aft CG and less trim drag.'), 'xp') +
        k.tryit([['wb', 'Mass & balance']]);
    },
    quiz: [
      { q: 'For static stability in pitch the CG must be…', a: ['behind the neutral point', 'ahead of the neutral point', 'exactly on the neutral point', 'below the wing'], c: 1, why: 'A positive static margin (CG ahead of the neutral point) makes the aircraft return after a disturbance.' },
      { q: 'A forward CG…', a: ['lowers the stall speed', 'raises the stall speed and makes the flare heavier', 'has no effect on performance', 'makes the aircraft unstable'], c: 1, why: 'More tail down-load means the wing must lift more than the weight.' }
    ] });

  T({ id: 'vspeeds', ch: 'spd', no: '3.3', title: 'V-speeds and the airspeed indicator', blurb: 'What every V means, the colour arcs, and why manoeuvring speed drops with weight.',
    thumb: () => Fg().asi({ vso: 48, vs1: 53, vfe: 85, vno: 129, vne: 163 }),
    render(ctx) {
      const k = kit(ctx);
      const va = 53 * Math.sqrt(3.8), va2 = 105 * Math.sqrt(907 / 1157);
      return k.lead('V-speeds are the limits and targets every pilot learns by heart. The most important are painted on the airspeed indicator; the rest are on a card, in the FMS or in your head.') +
        k.fig(Fg().asi({ vso: 48, vs1: 53, vfe: 85, vno: 129, vne: 163, notes: ['Cessna 172S: Vx 62 · Vy 74 · best glide 68 · Va 105 kt'] }), '<b>Fig. 3.4</b> — The Cessna 172S airspeed indicator: white, green and yellow arcs and the red line.') +
        k.vars([[R`V_{SO}`, 'stall speed in the landing configuration — bottom of the white arc'], [R`V_{S1}`, 'stall speed in a specified (usually clean) configuration — bottom of the green arc'], [R`V_{FE}`, 'maximum speed with flaps extended — top of the white arc'],
          [R`V_{NO}`, 'maximum structural cruising speed — top of the green arc; above it, smooth air only'], [R`V_{NE}`, 'never-exceed speed — the red line'], [R`V_A`, 'manoeuvring speed: full, single control deflection will stall the wing before it overloads the structure'],
          [R`V_X,\ V_Y`, 'best angle and best rate of climb'], [R`V_{LO},\ V_{LE}`, 'maximum speed to operate the gear / to fly with it extended'], [R`V_{MCA},\ V_{YSE}`, 'twins: minimum control speed with one engine out (red radial) and best single-engine climb (blue line)'],
          [R`V_1,\ V_R,\ V_2`, 'jets: decision, rotation and take-off safety speeds'], [R`V_{REF}`, 'landing reference speed, 1.23 × the 1-g stall speed'], [R`V_{MO}/M_{MO}`, 'jets: maximum operating speed and Mach — the barber pole']]) +
        k.h('Manoeuvring speed') +
        k.eq(R`V_A = V_S\sqrt{n_{limit}}`, '3.7') + k.eq(R`V_{A2} = V_{A1}\sqrt{\frac{W_2}{W_1}}`, '3.8') +
        k.p(`At ${k.m('V_A')} a full pull reaches the stall exactly at the limit load factor — 3.8 g for a normal-category aeroplane. Slower, the wing stalls first and protects the structure; faster, the structure can break before the wing stalls. It protects against <i>one</i> full deflection: rapid reversals of the rudder can overload the fin even below ${k.m('V_A')}.`) +
        k.box('Worked example — Cessna 172S', k.p(`${k.m(R`V_{S1}`)} = 53 kt, so ${k.m(R`V_A = 53\sqrt{3.8}`)} = ${k.n(va)} kt — the handbook gives 105 kt at 1157 kg. At 907 kg it falls to ${k.m(R`105\sqrt{907/1157}`)} = ${k.n(va2)} kt: a lighter aircraft must be flown <i>slower</i> in turbulence.`), 'example') +
        k.box('In X-Plane', k.p(`The arcs come from Plane Maker: ${k.code('sim/aircraft/view/acf_Vso')}, ${k.code('acf_Vs')}, ${k.code('acf_Vfe')}, ${k.code('acf_Vno')}, ${k.code('acf_Vne')}. The <a href="#study.aircraft">aircraft study page</a> draws the indicator for whatever you fly.`), 'xp') +
        k.tryit([['va', 'Manoeuvring speed'], ['airspeed', 'Airspeed converter']]);
    },
    quiz: [
      { q: 'The green arc on the airspeed indicator runs from…', a: ['Vso to Vfe', 'Vs1 to Vno', 'Vno to Vne', 'Vx to Vy'], c: 1, why: 'Green is the normal operating range: clean stall speed up to the maximum structural cruising speed.' },
      { q: 'When the aircraft is lighter, manoeuvring speed…', a: ['rises', 'falls with the square root of the weight', 'stays the same', 'is no longer needed'], c: 1, why: 'The stall speed falls with √W, and Va = Vs·√n, so Va falls too.' },
      { q: 'On a twin, the blue line marks…', a: ['Vmca', 'Vyse, best rate of climb on one engine', 'Vne', 'Vfe'], c: 1, why: 'The red radial is Vmca; the blue line is Vyse.' }
    ] });

  T({ id: 'compass', ch: 'nav', no: '4.6', title: 'True, magnetic and compass headings', blurb: 'Variation, deviation, and the turning and acceleration errors of the magnetic compass.',
    thumb: () => Fg().northArrows(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C, s = ctx.s;
      const h = C.headings({ from: 'true', value: 70, variation: 8, deviation: 3 });
      const live = s && Number.isFinite(s.magVar) && Number.isFinite(s.hdgT) ? k.box('Right now', k.p(`True heading ${ctx.hdg(s.hdgT)}, magnetic ${ctx.hdg(s.hdgM)}: variation ${k.n(Math.abs(s.magVar), 1)}° ${s.magVar >= 0 ? 'east' : 'west'} here.`), 'xp') : '';
      return k.lead('There are three norths: true north, the pole the chart is drawn to; magnetic north, where a compass needle points; and compass north, where <i>your</i> compass points, pulled aside by the aircraft’s own metal and wiring.') +
        k.fig(Fg().northArrows(), '<b>Fig. 4.6</b> — Variation separates true and magnetic north; deviation separates magnetic and compass north. Angles exaggerated.') +
        k.eq(R`\text{True} = \text{Magnetic} + \text{VAR}_{E}`, '4.10') + k.eq(R`\text{Magnetic} = \text{Compass} + \text{DEV}_{E}`, '4.11') +
        k.p('Both are counted positive to the east. Variation depends on where you are — it passes 20° in parts of Canada and Scandinavia — and drifts slowly year by year. Deviation depends on the heading and the individual aircraft; it is written on the compass card in the cockpit.') +
        k.box('Worked example', k.p(`Course 070° true, variation 8° E, deviation 3° E: magnetic ${ctx.hdg(h.magHdg)}, compass ${ctx.hdg(h.compassHdg)}. With 3° W deviation instead, the compass heading would be 065°.`), 'example') +
        k.h('Compass errors') +
        k.ul(['<b>Acceleration error</b> (northern hemisphere): accelerate on an east or west heading and the compass swings towards north; decelerate and it swings south — <b>ANDS</b>.', '<b>Turning error</b>: turning onto north, roll out <i>before</i> the compass reads north; onto south, <i>after</i> it — <b>UNOS</b> (undershoot north, overshoot south).', 'Both come from the magnetic dip. They reverse in the southern hemisphere and vanish near the magnetic equator.']) +
        k.box('Which north is used where', k.ul(['Runway numbers, ATC headings and airways: magnetic (true in the far north of Canada).', 'METAR and TAF winds: true. ATIS and tower winds: magnetic.', 'Great-circle courses and GPS tracks: true, converted by the avionics.'])) +
        live + k.box('In X-Plane', k.p(`${k.code('sim/flightmodel/position/psi')} is the true heading, ${k.code('sim/flightmodel/position/mag_psi')} the magnetic one, and ${k.code('sim/cockpit2/gauges/indicators/compass_heading_deg_mag')} what the wet compass shows — with its errors.`), 'xp') +
        k.tryit([['compass', 'Heading converter']]);
    },
    quiz: [
      { q: 'True course 070°, variation 8° E. What is the magnetic course?', a: ['062°', '078°', '070°', '252°'], c: 0, why: 'True = magnetic + east variation, so magnetic = 070 − 8 = 062°. East is least.' },
      { q: 'Northern hemisphere, heading east, you accelerate. The compass shows…', a: ['a turn towards north', 'a turn towards south', 'no change', 'a turn to the east'], c: 0, why: 'ANDS: accelerate north, decelerate south.' },
      { q: 'Runway numbers are based on…', a: ['true headings', 'magnetic headings', 'compass headings', 'grid headings'], c: 1, why: 'Runway 26 has a magnetic heading of about 260° (true is used only in a few polar regions).' }
    ] });

  T({ id: 'radio-nav', ch: 'nav', no: '4.7', title: 'VOR, DME and NDB', blurb: 'Radials, DME slant range and relative bearings.',
    thumb: () => Fg().vorDme(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const d = C.dmeGround({ dmeNm: 10, heightFt: 20000 }), nb = C.ndbBearing({ heading: 350, relBearing: 30 });
      return k.lead('Before GPS every airway was built on ground beacons, and they remain the independent backup today.') +
        k.fig(Fg().vorDme(), '<b>Fig. 4.7</b> — Left: an aircraft on the 060 radial of a VOR, flying inbound on 240°. Right: DME measures the slant range, not the distance over the ground.') +
        k.h('VOR') + k.p('A VOR transmits two signals whose phase difference depends on the direction from the station, so the receiver knows which <b>radial</b> it is on — the magnetic bearing <i>from</i> the station, whatever the aircraft’s heading. The course deviation indicator shows how far you are from the selected course (full scale ±10°) and a TO/FROM flag.') +
        k.h('DME') + k.p('DME times a radio pulse to the station and back, so it measures the straight-line <b>slant range</b>:') +
        k.eq(R`d_{ground} = \sqrt{d_{DME}^{\,2} - h^2}, \qquad h\,[\text{NM}] = \frac{h\,[\text{ft}]}{6076}`, '4.12') +
        k.box('Worked example', k.p(`10 NM on the DME at FL200 (${k.n(d.heightNm, 2)} NM up): ${k.n(d.groundNm, 2)} NM over the ground, an error of ${k.n(d.errorNm, 2)} NM. Directly overhead at FL200 the DME still reads ${k.n(d.heightNm, 1)} NM. The error is small once you are further out than 1 NM per 1000 ft of height.`), 'example') +
        k.h('NDB and ADF') + k.p('An NDB is a simple beacon; the ADF needle points at it. The needle shows the <b>relative bearing</b>, measured clockwise from the nose, so the bearing to the station depends on your heading:') +
        k.eq(R`\text{QDM} = \text{MH} + \text{RB}, \qquad \text{QDR} = \text{QDM} \pm 180^\circ`, '4.13') +
        k.p(`Heading 350° with the needle 30° right of the nose: QDM ${ctx.hdg(nb.qdm)}, QDR ${ctx.hdg(nb.qdr)}.`) +
        k.box('Range', k.p(`VOR and DME are line-of-sight: about ${k.m(R`1.23\sqrt{h_{ft}}`)} NM — some 123 NM at 10 000 ft. NDBs follow the ground and reach further, but thunderstorms and dusk make them wander.`)) +
        k.box('In X-Plane', k.p(`Tune NAV1 to a VOR and watch ${k.code('sim/cockpit2/radios/indicators/nav1_hdef_dots_pilot')} (needle deflection in dots); the ADF needle is ${k.code('sim/cockpit2/radios/indicators/adf1_relative_bearing_deg')}.`), 'xp') +
        k.tryit([['dme', 'DME slant range'], ['ndb', 'NDB bearings'], ['horizon', 'Radio range']]);
    },
    quiz: [
      { q: 'A VOR radial is…', a: ['the magnetic bearing to the station', 'the magnetic bearing from the station', 'your heading when tuned', 'a true bearing'], c: 1, why: 'Radial 060 runs outbound from the station on 060° magnetic.' },
      { q: 'Directly over a DME station at FL180 the DME reads about…', a: ['0 NM', '3 NM', '18 NM', 'nothing'], c: 1, why: '18 000 ft ÷ 6076 ≈ 3 NM: DME measures slant range.' },
      { q: 'Heading 350°, ADF relative bearing 030°. The magnetic bearing to the NDB (QDM) is…', a: ['020°', '320°', '200°', '030°'], c: 0, why: 'QDM = MH + RB = 350 + 30 = 380 → 020°.' }
    ] });

  T({ id: 'ils', ch: 'nav', no: '4.8', title: 'The ILS and approach categories', blurb: 'Localiser and glide path, decision heights, and the A–E approach speed categories.',
    thumb: () => Fg().ils(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const g3 = C.glidePath({ distNm: 3, tchFt: 50, gs: 140 });
      const cats = [['CAT I', 'not below 200 ft', 'RVR ≥ 550 m (or visibility ≥ 800 m)'], ['CAT II', '100–200 ft', 'RVR ≥ 300 m'], ['CAT IIIA', 'below 100 ft or none', 'RVR ≥ 175 m'], ['CAT IIIB', 'below 50 ft or none', 'RVR 50–175 m']];
      const ac = [['A', 'below 91 kt', 'Cessna 172, light singles'], ['B', '91–120 kt', 'King Air, ATR 72'], ['C', '121–140 kt', 'most narrow-bodies: 737, A320'], ['D', '141–165 kt', 'large wide-bodies: 777, 747'], ['E', '166–210 kt', 'some military jets']];
      const tbl = (h, rows) => `<div class="scroll-x"><table class="t"><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      return k.lead('The instrument landing system gives a precise path to the runway: the localiser guides left and right, the glide slope up and down.') +
        k.fig(Fg().ils(), '<b>Fig. 4.8</b> — A 3° glide path from 5 NM: the height above the threshold at each mile, the CAT I decision altitude and the marker beacons.') +
        k.eq(R`h = \text{TCH} + d\cdot 6076\tan\theta \;\approx\; \text{TCH} + 318\,d`, '4.14') +
        k.eq(R`VS = GS \times 101.3\tan\theta \;\approx\; 5.3 \times GS`, '4.15') +
        k.ul(['<b>Localiser</b> — about four times as sensitive as a VOR: full scale is a few degrees either side of the centreline.', '<b>Glide slope</b> — usually 3°, full scale about ±0.7°.', '<b>Distances</b> — marker beacons, a DME or GPS confirm where you are on the path; a height check at a published distance catches a false glide slope.']) +
        k.box('Worked example', k.p(`At 3 NM on a 3° path with a 50 ft threshold crossing height you should be ${k.n(g3.heightFt)} ft above the threshold. At 140 kt ground speed that takes ${k.n(g3.vs)} fpm.`), 'example') +
        k.h('Minima') + tbl(['Category', 'Decision height', 'Visibility'], cats) +
        k.p('Below the decision height you continue only with the required visual references in sight; otherwise you go around. CAT II and III need special aircraft equipment, autoland (CAT III) and crew training.') +
        k.h('Approach speed categories') + tbl(['Category', 'Vat (1.3 Vso or 1.23 VS1g)', 'Typical aircraft'], ac) +
        k.p('The category sets the circling area, the missed-approach and visibility minima the chart gives you. It uses the speed at maximum landing weight, not your actual speed.') +
        k.box('In X-Plane', k.p(`Tune NAV1 to the localiser frequency and set the course; ${k.code('sim/cockpit2/radios/indicators/nav1_hdef_dots_pilot')} and ${k.code('nav1_vdef_dots_pilot')} are the needles in dots.`), 'xp') +
        k.tryit([['ils', 'Glide path heights'], ['vpath', 'Vertical path to a fix']]);
    },
    quiz: [
      { q: 'On a 3° glide path with a 50 ft TCH, what is your height at 4 NM?', a: ['about 700 ft', 'about 1320 ft', 'about 2000 ft', 'about 4000 ft'], c: 1, why: '50 + 4 × 318 ≈ 1320 ft above the threshold.' },
      { q: 'The CAT I decision height is not lower than…', a: ['50 ft', '100 ft', '200 ft', '500 ft'], c: 2, why: 'CAT I: DH ≥ 200 ft; CAT II 100–200 ft; CAT III below 100 ft or none.' },
      { q: 'An aircraft with Vat = 135 kt is in approach category…', a: ['A', 'B', 'C', 'D'], c: 2, why: 'C covers 121–140 kt.' }
    ] });

  T({ id: 'engines', ch: 'perf', no: '5.6', title: 'Jet engines and thrust', blurb: 'How a turbofan makes thrust, bypass ratio, N1 and EGT, and why thrust falls with height.',
    thumb: () => Fg().turbofan(),
    render(ctx) {
      const k = kit(ctx);
      const eta = (v0, vj) => 2 / (1 + vj / v0);
      return k.lead('A jet engine throws air backwards; the reaction pushes the aircraft forwards. A turbofan does most of that with a big fan and only a small, hot core.') +
        k.fig(Fg().turbofan(), '<b>Fig. 5.6</b> — A high-bypass turbofan. The core (compressor, combustor, turbines) drives the fan; most of the air bypasses the core.') +
        k.eq(R`F = \dot m\,(V_j - V_0) + (p_e - p_0)\,A_e`, '5.10') +
        k.eq(R`\eta_p = \frac{2}{1 + V_j/V_0}`, '5.11') +
        k.vars([[R`\dot m`, 'mass flow of air through the engine, kg/s'], [R`V_j,\ V_0`, 'jet speed and flight speed'], [R`\eta_p`, 'propulsive efficiency: how much of the jet’s energy moves the aircraft']]) +
        k.p('Thrust needs mass flow times a speed increase; efficiency needs the jet speed close to the flight speed. Accelerating a lot of air a little beats accelerating a little air a lot — that is why fans keep getting bigger and bypass ratios higher.') +
        k.box('Worked example', k.p(`Flying at 250 m/s, a jet leaving at 350 m/s has ${k.m(R`\eta_p`)} = ${k.n(eta(250, 350) * 100)} %; an old turbojet with a 600 m/s jet only ${k.n(eta(250, 600) * 100)} %.`), 'example') +
        k.ul(['<b>N1</b> — fan (low-pressure spool) speed in %: the thrust-setting parameter on CFM and GE engines. Older Pratt & Whitney and Rolls-Royce engines use <b>EPR</b>, the engine pressure ratio.', '<b>N2</b> — core (high-pressure spool) speed.', '<b>EGT</b> — exhaust gas temperature: the main limit, and a measure of engine health. The gap to the redline is the EGT margin.', '<b>Flat rating</b> — full thrust is available up to a temperature (about ISA + 15 °C); see <a href="#study.flex">reduced thrust</a>.']) +
        k.h('Thrust lapse') + k.p('Thrust falls with air density and with speed. At cruise altitude a turbofan gives only about a fifth to a quarter of its sea-level static thrust — enough, because cruise drag is only about 1/17 of the weight.') +
        k.box('In X-Plane', k.p(`${k.code('sim/cockpit2/engine/indicators/N1_percent')} and ${k.code('sim/cockpit2/engine/indicators/EGT_deg_C')} per engine; the live page shows N1 and fuel flow.`), 'xp');
    },
    quiz: [
      { q: 'Why are modern engine fans so large?', a: ['For looks', 'Moving more air a little is more efficient than a little air a lot', 'To carry fuel', 'To reduce weight'], c: 1, why: 'Propulsive efficiency 2/(1 + Vj/V0) is highest when the jet is only a little faster than the aircraft.' },
      { q: 'N1 is…', a: ['the core speed', 'the fan (low-pressure spool) speed', 'the exhaust temperature', 'the fuel flow'], c: 1, why: 'N1 is the low-pressure spool, which carries the fan; N2 is the core.' },
      { q: 'Compared with take-off, the thrust available at cruise altitude is…', a: ['the same', 'much lower', 'higher', 'unlimited'], c: 1, why: 'Thin air means less mass flow: roughly a fifth to a quarter of sea-level thrust.' }
    ] });

  T({ id: 'cruise', ch: 'perf', no: '5.7', title: 'Cruise: optimum altitude, step climbs and cost index', blurb: 'Why airliners climb as they get lighter, and how the cost index trades fuel for time.',
    thumb: () => Fg().optAlt(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const o70 = C.optimumAltitude({ massKg: 70000, wingArea: 124.6, mach: 0.785 }).ft, o60 = C.optimumAltitude({ massKg: 60000, wingArea: 124.6, mach: 0.785 }).ft;
      return k.lead('A jet is most efficient when its wing flies at one particular lift coefficient. As fuel burns off and the aircraft gets lighter, the only way to keep that coefficient is to climb.') +
        k.eq(R`L = \tfrac12\rho V^2 S\,C_L = 0.7\,p\,M^2 S\,C_L`, '5.12') +
        k.p(`Because ${k.m(R`\tfrac12\rho V^2 = \tfrac{\gamma}{2}\,p\,M^2`)}, lift at a fixed Mach and ${k.m('C_L')} is proportional to the static pressure. So the best pressure falls in step with the weight:`) +
        k.eq(R`p_{opt} = \frac{W}{0.7\,S\,M^2\,C_{L,opt}}`, '5.13') +
        k.fig(Fg().optAlt(), '<b>Fig. 5.7</b> — Optimum altitude of a 737-800 at M0.785 as fuel burns off, and the 2000 ft steps actually flown.') +
        k.box('Worked example', k.p(`737-800 at M0.785 (${k.m(R`C_{L,opt}`)} ≈ 0.52): optimum about FL${Math.round(o70 / 100)} at 70 t and FL${Math.round(o60 / 100)} at 60 t. Roughly 1000 ft higher for every 5 % of weight burned.`), 'example') +
        k.h('Step climbs') + k.p('Air traffic control does not allow a continuous cruise climb, so airliners step up: 2000 ft at a time under RVSM, keeping the same direction of flight, once the next level is at or only just above the optimum. Cruising 2000 ft below optimum costs about 1–2 % more fuel.') +
        k.h('Cost index') + k.p('The FMS chooses the cruise speed from the <b>cost index</b>: time-related costs (crew, maintenance, leases) divided by the fuel price. CI 0 flies the maximum-range speed; a high CI flies faster and burns more fuel to save minutes. Long-range cruise is a common compromise: 1 % less range than the maximum for a few percent more speed.') +
        k.eq(R`\text{specific range} = \frac{V_{TAS}}{\dot m_{fuel}}\ \ \text{NM per kg}`, '5.14') +
        k.box('In X-Plane', k.p(`Fly the same Mach at two levels and compare fuel flow (${k.code('sim/cockpit2/engine/indicators/fuel_flow_kg_sec')}) and true airspeed: the higher level, if it is within reach of the optimum, gives more miles per kilogram.`), 'xp') +
        k.tryit([['step-climb', 'Optimum altitude'], ['fuel', 'Fuel endurance & range']]);
    },
    quiz: [
      { q: 'As an airliner burns fuel, its optimum altitude…', a: ['falls', 'rises', 'stays the same', 'becomes the ceiling'], c: 1, why: 'Lighter needs less lift, so the same C<sub>L</sub> is found at a lower pressure — higher up.' },
      { q: 'Cost index 0 means…', a: ['fly as fast as possible', 'fly the maximum-range speed (minimum fuel)', 'no FMS', 'minimum time'], c: 1, why: 'With time costing nothing, only fuel counts.' },
      { q: 'About how much lighter must the aircraft get for the optimum to rise 1000 ft?', a: ['0.5 %', '5 %', '25 %', '50 %'], c: 1, why: 'Pressure falls about 3.5–5 % per 1000 ft at cruise levels, and p<sub>opt</sub> is proportional to weight.' }
    ] });

  T({ id: 'metar', ch: 'wx', no: '6.1', title: 'Reading METAR and TAF', blurb: 'The coded airport weather report and forecast, group by group.',
    thumb: () => Fg().metarFig(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const m = C.parseMetar('EETN 271420Z 24012G22KT 200V280 9999 -SHRA FEW025CB SCT040 BKN080 12/08 Q1009 NOSIG');
      const cb = C.cloudBase({ tempC: m.temp, dewC: m.dew });
      const cat = [['VFR', 'ceiling above 3000 ft and visibility above 5 SM'], ['MVFR', 'ceiling 1000–3000 ft or visibility 3–5 SM'], ['IFR', 'ceiling 500–999 ft or visibility 1–3 SM'], ['LIFR', 'ceiling below 500 ft or visibility below 1 SM']];
      return k.lead('A METAR is an airport’s routine weather observation, issued every 30 or 60 minutes in a compact code. A TAF is the forecast for the same airport, usually for 24 or 30 hours.') +
        k.fig(Fg().metarFig(), '<b>Fig. 6.1</b> — An example METAR, group by group.') +
        k.ul(['<b>Wind</b> — direction in degrees <i>true</i> and speed (KT or MPS); G = gusts; VRB = variable; 200V280 = varying between.', '<b>Visibility</b> — metres; 9999 means 10 km or more. US reports use statute miles: 10SM, 1 1/2SM.', '<b>Weather</b> — intensity (− light, + heavy, VC nearby), descriptor (SH showers, TS thunderstorm, FZ freezing, BL blowing…) and phenomenon (RA rain, SN snow, DZ drizzle, BR mist, FG fog…).', '<b>Cloud</b> — FEW 1–2 oktas, SCT 3–4, BKN 5–7, OVC 8, with the base in hundreds of feet above the aerodrome; CB and TCU mark convective cloud.', '<b>Temperature / dew point</b> — M means minus. <b>Q</b> gives QNH in hPa, <b>A</b> in inches.', '<b>Trend</b> — NOSIG, BECMG (becoming) or TEMPO (temporary) for the next two hours.', '<b>CAVOK</b> — visibility 10 km or more, no cloud below 5000 ft, no CB or TCU and no significant weather.']) +
        k.box('Decoded — computed live', k.p(`Wind ${m.wind.dir}° ${m.wind.speed} kt gusting ${m.wind.gust}, varying ${m.wind.varFrom}°–${m.wind.varTo}° · visibility 10 km or more · ${m.wx.map(w => w.text).join(', ')} · ${m.clouds.map(c => c.cover + ' ' + c.baseFt + ' ft' + (c.type ? ' ' + c.type : '')).join(', ')} · ceiling ${m.ceilingFt} ft · ${m.temp} °C, dew point ${m.dew} °C (humidity ${k.n(m.rh)} %, cumulus base ≈ ${k.n(cb.aglFt)} ft) · QNH ${m.qnh} hPa · ${m.category}.`), 'example') +
        k.h('Ceiling and flight categories') + k.p('The ceiling is the lowest BKN or OVC layer (or vertical visibility). US flight categories combine it with visibility:') +
        `<div class="scroll-x"><table class="t"><tbody>${cat.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td></tr>`).join('')}</tbody></table></div>` +
        k.h('TAF') + k.p('A TAF starts with its validity (for example 2712/2818: from the 27th at 12 UTC to the 28th at 18 UTC), then change groups: <b>FM</b> — from this time, a complete change; <b>BECMG</b> — changing gradually; <b>TEMPO</b> — temporary fluctuations, each under an hour and in total less than half the period; <b>PROB30/40</b> — probability in percent.') +
        k.box('In X-Plane', k.p(`With real weather on, X-Plane 12 builds its weather from METARs and forecasts. Decode your departure’s METAR with the calculator and compare with what the sim reports at the aircraft (${k.code('sim/weather/aircraft/qnh_pas')}, wind and temperature on the live page).`), 'xp') +
        k.tryit([['metar', 'METAR decoder'], ['cloud-base', 'Cloud base']]);
    },
    quiz: [
      { q: 'BKN025 means…', a: ['broken cloud at 250 ft', '5–7 oktas of cloud with its base 2500 ft above the aerodrome', '2 oktas at 25 000 ft', 'visibility 2.5 km'], c: 1, why: 'Cloud heights are in hundreds of feet above the aerodrome; BKN is 5–7 oktas.' },
      { q: 'A visibility group of 9999 means…', a: ['exactly 9999 m', '10 km or more', 'unknown', '9.9 NM'], c: 1, why: '9999 is the code for 10 km or more.' },
      { q: '12/M02 means…', a: ['12 °C, dew point −2 °C', '12 °C, dew point 2 °C', 'wind 12 kt gusting 2', 'QNH 1202'], c: 0, why: 'M means minus.' }
    ] });

  T({ id: 'clouds-icing', ch: 'wx', no: '6.2', title: 'Cloud base, humidity and icing', blurb: 'The 400 ft rule, relative humidity, the freezing level and where ice forms.',
    thumb: () => Fg().cloudBase(),
    render(ctx) {
      const k = kit(ctx), C = ctx.C;
      const cb = C.cloudBase({ tempC: 20, dewC: 12 }), fz = C.cloudBase({ tempC: 15, dewC: 5 });
      return k.lead('Clouds form where rising air cools to its dew point. The gap between temperature and dew point at the surface tells you roughly how high that is.') +
        k.fig(Fg().cloudBase(), '<b>Fig. 6.2</b> — A parcel of air rising from the surface: it cools at about 3 °C per 1000 ft while its dew point falls 0.5 °C per 1000 ft; where they meet, cloud forms.') +
        k.eq(R`h_{base} \approx 400\ \text{ft} \times (T - T_d) \qquad (\approx 125\ \text{m per }^\circ\text{C})`, '6.1') +
        k.eq(R`RH = 100\,\exp\!\left(\frac{17.625\,T_d}{243.04 + T_d} - \frac{17.625\,T}{243.04 + T}\right)\ \%`, '6.2') +
        k.box('Worked example', k.p(`Temperature 20 °C, dew point 12 °C: cumulus base about ${k.n(cb.aglFt)} ft above the ground, relative humidity ${k.n(cb.rh)} %. With 15 °C at the surface the freezing level is about ${k.n(Math.round(fz.freezeAglFt / 100) * 100)} ft (2 °C per 1000 ft).`), 'example') +
        k.h('Icing') +
        k.ul(['Airframe ice needs visible moisture — cloud, rain or drizzle — and a surface at or below 0 °C.', 'It is worst from 0 to about −10 °C with large drops; below about −20 °C most cloud is ice crystals that do not stick.', 'Freezing rain (rain falling from a warm layer into sub-zero air) is the most dangerous: clear ice builds fast, also behind the protected leading edges.', 'Carburettor icing needs no cloud: the carburettor cools the air, so it can happen on a humid day at +20 °C or more.']) +
        k.box('In X-Plane', k.p(`X-Plane 12 models airframe, propeller, pitot and carburettor ice. ${k.code('sim/flightmodel/failures/frm_ice')} shows the ice on the airframe (0–1); switch on ${k.code('sim/cockpit2/ice/ice_pitot_heat_on_pilot')} and the anti-ice before you enter cloud near the freezing level.`), 'xp') +
        k.tryit([['cloud-base', 'Cloud base & freezing level'], ['metar', 'METAR decoder']]);
    },
    quiz: [
      { q: 'Temperature 18 °C, dew point 10 °C. The cumulus base is about…', a: ['800 ft', '3200 ft', '8000 ft', '18 000 ft'], c: 1, why: '400 ft × (18 − 10) = 3200 ft.' },
      { q: 'Airframe icing is most likely in cloud between…', a: ['+10 and +20 °C', '0 and −10 °C', '−30 and −40 °C', 'only above 0 °C'], c: 1, why: 'Supercooled drops are most common and largest just below freezing.' },
      { q: 'Can carburettor icing happen at +20 °C?', a: ['No, never above 0 °C', 'Yes, in humid air', 'Only at night', 'Only in cloud'], c: 1, why: 'Fuel evaporation and the venturi cool the air by 20 °C or more.' }
    ] });

  T({ id: 'wake', ch: 'wx', no: '6.3', title: 'Wake turbulence and separation', blurb: 'Wingtip vortices, how they move and last, and the spacing ATC uses.',
    thumb: () => Fg().wake(),
    render(ctx) {
      const k = kit(ctx);
      const G = (m, v, b) => 4 * m * 9.80665 / (Math.PI * 1.225 * v * 0.514444 * b);
      const g737 = G(60000, 140, 35.8), g380 = G(380000, 140, 79.8);
      return k.lead('Every wing that makes lift leaves two counter-rotating vortices behind it. Behind a heavy aircraft they can roll a light one past the vertical.') +
        k.fig(Fg().wake(), '<b>Fig. 6.3</b> — Wingtip vortices seen from behind, and the ICAO separation minima on approach.') +
        k.eq(R`\Gamma_0 = \frac{4\,W}{\pi\,\rho\,V\,b}`, '6.3') +
        k.vars([[R`\Gamma_0`, 'circulation (strength) of the wake, m²/s'], ['W', 'weight, N'], ['V', 'true airspeed'], ['b', 'wingspan']]) +
        k.p('The strength grows with weight and falls with speed and span: the worst wake comes from a <b>heavy, clean, slow</b> aircraft — just after take-off and on the approach.') +
        k.box('Worked example', k.p(`At 140 kt, a 60 t 737 leaves a wake of about ${k.n(g737)} m²/s; a 380 t A380, despite its much bigger span, about ${k.n(g380)} m²/s — ${k.n(g380 / g737, 1)} times stronger.`), 'example') +
        k.ul(['Vortices sink about 300–500 fpm and level off some 500–900 ft below the flight path.', 'Near the ground they spread outwards at a few knots; a light crosswind of about 3–5 kt can hold the upwind one over the runway.', 'Behind a larger aircraft, stay at or above its path and land beyond its touchdown point; take off before its rotation point.']) +
        k.h('Categories and separation') + k.p('ICAO categories by maximum take-off mass: <b>Light</b> up to 7 000 kg, <b>Medium</b> up to 136 000 kg, <b>Heavy</b> above that, and <b>Super</b> for the A380. On approach, radar separation is 4–8 NM behind heavier aircraft (see the figure); departing light and medium aircraft wait 2 minutes behind a heavy. Europe’s RECAT-EU refines this into six categories with shorter spacing.') +
        k.box('In X-Plane', k.p('Every <a href="#study.aircraft">aircraft study page</a> shows the wake category of the aircraft you fly; the calculator gives the spacing for any pair.'), 'xp') +
        k.tryit([['wake', 'Wake separation']]);
    },
    quiz: [
      { q: 'The strongest wake comes from an aircraft that is…', a: ['light, fast, flaps out', 'heavy, clean and slow', 'light and slow', 'heavy and fast'], c: 1, why: 'Γ ∝ W / (V·b): heavy and slow; flaps and gear break up the vortices a little.' },
      { q: 'A medium aircraft following a heavy on approach needs radar separation of…', a: ['3 NM', '4 NM', '5 NM', '8 NM'], c: 2, why: 'ICAO: 5 NM medium behind heavy (6 NM light behind heavy).' },
      { q: 'Wake vortices from an aircraft in flight…', a: ['rise', 'sink about 300–500 fpm and level off below the path', 'stay at the same level', 'vanish at once'], c: 1, why: 'So stay at or above the path of the aircraft ahead.' }
    ] });

  // ===================================================================== 0 · START HERE
  T({ id: 'reading-equations', ch: 'start', no: '0.1', title: 'Reading the equations', blurb: 'Greek letters, subscripts, powers and roots, sine and cosine, units — how to read every equation in this library.',
    thumb: () => Fg().trig(),
    render(ctx) {
      const k = kit(ctx);
      return k.lead('Every equation in this library is a sentence written in shorthand. Learn to read the shorthand and most of the maths turns out to be multiplying and dividing. Under every numbered equation there is an <b>Explain</b> button: it says the equation in plain words, lists what each symbol means and lets you try it with sliders.') +
        k.h('An equation is a sentence') +
        k.p('Here is the lift equation from topic 1.1:') +
        k.eq(R`L = \tfrac12\,\rho\,V^2\,S\,C_L`, '0.1') +
        k.p('Read it aloud: <i>“lift equals one half, times rho, times V squared, times S, times C-L.”</i> Three rules make that possible:') +
        k.ul([
          `<b>Symbols written side by side are multiplied.</b> ${k.m(R`\rho V^2`)} means ${k.m(R`\rho \times V \times V`)} — the × sign is left out to keep things tidy.`,
          `<b>Every letter stands for a quantity with a unit.</b> ${k.m('V')} is a speed in metres per second, ${k.m('S')} an area in square metres. The Explain panel lists them all, with typical values.`,
          '<b>The = sign says both sides are the same amount.</b> Change something on the right and the left changes with it.']) +
        k.h('Greek letters and little labels') +
        k.p('Aviation borrows Greek letters for quantities whose Latin letter is already taken. These are the ones used in this library:') +
        k.vars([[R`\alpha`, '<b>alpha</b> — angle of attack'], [R`\gamma`, '<b>gamma</b> — climb or descent angle (and 1.4, a property of air, in the speed-of-sound formula)'],
          [R`\Delta`, '<b>Delta</b> (capital) — “a change in”: ΔH is a height difference'], [R`\theta`, '<b>theta</b> — an angle, for example between the wind and the runway'],
          [R`\rho`, '<b>rho</b> — air density'], [R`\sigma`, '<b>sigma</b> — density ratio, ρ ÷ ρ₀'], [R`\phi`, '<b>phi</b> — bank angle (latitude in navigation)'],
          [R`\lambda`, '<b>lambda</b> — longitude (and the temperature lapse rate)'], [R`\mu`, '<b>mu</b> — friction coefficient'], [R`\omega`, '<b>omega</b> — rate of turn'],
          [R`\pi`, '<b>pi</b> — 3.14159…, a circle’s circumference ÷ its diameter'], [R`\Gamma`, '<b>Gamma</b> (capital) — the strength of a wake vortex']]) +
        k.p(`A small letter or number written low after a symbol is a <b>subscript</b>. It is only a label, not maths: ${k.m('V_S')} is “the stall speed”, ${k.m('C_L')} “the lift coefficient”, ${k.m(R`\rho_0`)} “the density at sea level” (a 0 usually marks the standard or starting value), and ${k.m('W_1,\\ W_2')} are the weight before and after.`) +
        k.h('Powers, roots and how things scale') +
        k.p(`A small raised number is a <b>power</b>: ${k.m(R`V^2 = V \times V`)}. A <b>square root</b> undoes a square: ${k.m(R`\sqrt{9} = 3`)}. Powers that are not whole numbers, like the 3.5 in the airspeed equations, are smooth in-betweens — the app works them out for you.`) +
        k.p('The most useful skill is not calculating but <b>scaling</b>: if you know how one quantity depends on another, you can predict the change without the full equation.') +
        k.eq(R`y = k\,x^{\,n} \quad\Longrightarrow\quad \frac{y_2}{y_1} = \left(\frac{x_2}{x_1}\right)^{n}`, '0.2') +
        k.fig(Fg().scaling(), '<b>Fig. 0.1</b> — What doubling the input does to the output for the four shapes you meet most: squares grow fast, square roots slowly, “one over” shrinks.') +
        k.box('Worked example — weight, stall speed and runway', k.p(`Stall speed goes with the square root of weight (1.6). Load 21 % more and the stall speed rises by ${k.m(R`\sqrt{1.21} = 1.10`)} — only 10 %. Take-off distance goes roughly with weight squared (5.4): 10 % heavier needs ${k.m(R`1.1^2 = 1.21`)}, about 21 % more runway.`), 'example') +
        k.h('Sine, cosine and tangent') +
        k.p('Wind, climb and glide problems are all right-angled triangles. In such a triangle the ratios of the sides depend only on the angle; sine, cosine and tangent are simply the names of those ratios.') +
        k.fig(Fg().trig(), '<b>Fig. 0.2</b> — A 20 kt wind 30° off the runway: the wind is the hypotenuse, the headwind the adjacent side and the crosswind the opposite side.') +
        k.eq(R`\sin\theta = \frac{\text{opposite}}{\text{hypotenuse}}, \qquad \cos\theta = \frac{\text{adjacent}}{\text{hypotenuse}}, \qquad \tan\theta = \frac{\text{opposite}}{\text{adjacent}}`, '0.3') +
        k.eq(R`\text{crosswind} = W_s\sin\theta, \qquad \text{headwind} = W_s\cos\theta`, '0.4') +
        k.box('Worth remembering', k.ul([`${k.m(R`\sin 30^\circ = 0.5`)}, ${k.m(R`\sin 45^\circ \approx 0.71`)}, ${k.m(R`\sin 60^\circ \approx 0.87`)}, ${k.m(R`\sin 90^\circ = 1`)} — cosine is the same list backwards.`,
          'Clock code for crosswind: 15° off the runway → a quarter of the wind, 30° → half, 45° → three quarters, 60° or more → all of it.',
          `Small angles: ${k.m(R`\sin\theta \approx \tan\theta \approx \theta \div 57.3`)} (the angle in radians). That is the 1-in-60 rule: 1° is 1 unit across for every 60 along.`]), 'example') +
        k.h('Units: why the equations want metres and seconds') +
        k.p('Equations that contain physical constants — 1.225, 9.81, 287 — are written in SI units. Convert first, calculate, then convert the answer back:') +
        k.vars([[R`1\ \text{kt}`, '0.5144 m/s'], [R`1\ \text{ft}`, '0.3048 m'], [R`1\ \text{NM}`, '1852 m'], [R`1\ \text{hPa}`, '100 Pa'], [R`T\,[\text{K}]`, 'T [°C] + 273.15 — temperatures inside formulas are always kelvin'], [R`1\ \text{kg}`, 'weighs 9.81 N on Earth']]) +
        k.eq(R`W = m\,g, \qquad g = 9.81\ \text{m/s}^2`, '0.5') +
        k.p('Mass (kilograms) is how much aircraft there is; weight (newtons) is the force the wing has to hold up. The equations need the weight, so the first step is almost always “mass × 9.81”.') +
        k.h('Rearranging: asking an equation a different question') +
        k.p('The lift equation gives the lift at a given speed. Turn it round and it gives the speed needed to carry a given weight. Whatever you do to one side, do to the other:') +
        k.eq(R`W = \tfrac12\rho V^2 S C_L \;\Longrightarrow\; V^2 = \frac{2W}{\rho\,S\,C_L} \;\Longrightarrow\; V = \sqrt{\frac{2W}{\rho\,S\,C_L}}`, '0.6') +
        k.p('With the maximum lift coefficient this is the stall speed, equation (1.5). Most equations in the library are rearrangements like this one.') +
        k.h('e and ln') +
        k.p(`A few equations contain ${k.m('e^{x}')} or ${k.m(R`\ln`)}. The number ${k.m('e')} = 2.718… appears whenever something shrinks or grows by the same <i>fraction</i> for every equal step: above the tropopause air pressure halves about every 14 400 ft (2.3). ${k.m(R`\ln`)} answers the reverse question — how many steps did it take?`) +
        k.box('How to use the Explain panels', k.ul(['Tap <b>Explain</b> under an equation: the equation in one plain sentence, then every symbol with its unit and a typical value, then why it looks the way it does.', 'Move the sliders under <b>Try it</b> and watch the answer change — the quickest way to get a feel for an equation.', 'The button at the top of each page opens or closes all the explanations at once, and remembers your choice.']), 'xp');
    },
    quiz: [
      { q: 'In ρV², what joins ρ and V²?', a: ['Addition', 'Multiplication', 'It is a label', 'Division'], c: 1, why: 'Symbols side by side are multiplied: ρ × V × V.' },
      { q: 'What does the little S in V<sub>S</sub> mean?', a: ['V to the power S', 'V times S', 'A label: the stall speed', 'V divided by S'], c: 2, why: 'A subscript only names which V it is.' },
      { q: 'Lift goes with V². Fly 10 % faster at the same angle of attack and the lift is…', a: ['10 % more', 'about 21 % more', 'twice as much', 'the same'], c: 1, why: '1.1² = 1.21.' },
      { q: 'A 20 kt wind 30° off the runway gives a crosswind of…', a: ['5 kt', '10 kt', '17 kt', '20 kt'], c: 1, why: '20 × sin 30° = 20 × 0.5 = 10 kt.' },
      { q: '100 kt in metres per second is about…', a: ['19 m/s', '51 m/s', '100 m/s', '185 m/s'], c: 1, why: '100 × 0.5144 = 51.4 m/s.' }
    ] });

  // ===================================================================== 7 · AIRLINER PROCEDURES
  const DEP_REF = { mass: 70000, flap: '5', elevFt: 0, qnh: 1013.25, oatC: 15, headwind: 0 };   // 737-800 at 70 t, sea level, ISA
  const depRef = (ctx, o) => ctx.P.departureProfile(ctx.A.byId.B738, Object.assign({}, DEP_REF, o));
  const depThumb = o => root.XFC.perf.departureProfile(root.XFC.aircraft.byId.B738, Object.assign({}, DEP_REF, o));

  T({ id: 'climb-out', ch: 'proc', no: '7.1', title: 'Take-off climb and engine failure', blurb: 'The four take-off segments, minimum climb gradients, why twins have so much thrust, and flying an engine failure after V1.',
    thumb: () => Fg().toSegments(depThumb({ mass: 79000, proc: 'eo', accFt: 1000 })),
    render(ctx) {
      const k = kit(ctx);
      const eo = depRef(ctx, { mass: 79000, proc: 'eo', accFt: 1000 }), aeo = depRef(ctx, { mass: 79000, proc: 'custom', thrRedFt: 1500, accFt: 1500 });
      const g = eo.gradients, pc = x => (x * 100).toFixed(1);
      const ld = 11, tw2 = 2 * (1 / ld + 0.024), tw4 = 4 / 3 * (1 / ld + 0.030);
      return k.lead('An airliner is certified to lose an engine at the worst moment — just after V1 — and still climb away clear of every obstacle. The climb after take-off is split into segments, and each one has a minimum climb gradient.') +
        k.fig(Fg().toSegments(eo, aeo), `<b>Fig. 7.1</b> — Engine failure at V1, 737-800 at 79 t, sea level, ISA, flaps 5 — computed with this app’s departure model. <b>1st</b> (amber): gear retracting, gradient must be positive (${pc(g.first)} %). <b>2nd</b> (blue): V2 with take-off flaps up to the engine-out acceleration height (${pc(g.second)} %, minimum 2.4 %). <b>3rd</b> (green): level acceleration while the flaps come up. <b>Final</b> (magenta): clean at maximum continuous thrust to 1500 ft (${pc(g.final)} %, minimum 1.2 %). Dashed: the same aircraft with both engines.`) +
        k.h('Climb gradient: spare thrust ÷ weight') +
        k.p('In a steady climb, the thrust that is not needed to beat drag lifts the aircraft. For the small angles airliners fly, the gradient — height gained per distance flown — is simply that spare thrust as a fraction of the weight:') +
        k.eq(R`\gamma \approx \frac{T - D}{W}`, '7.1') +
        k.p(`With one of ${k.m('n')} engines failed only ${k.m(R`\tfrac{n-1}{n}`)} of the thrust is left, while the drag grows: the dead engine windmills and the rudder has to hold the aircraft straight.`) +
        k.eq(R`\gamma_{\text{OEI}} = \frac{\tfrac{n-1}{n}\,T - D - \Delta D_{\text{asym}}}{W}`, '7.2') +
        k.p(`That is why the loss is so dramatic: for the 737 in the figure, both engines give a gradient of about ${pc(aeo.gradients.aeo)} %, one engine only ${pc(g.second)} %. Half the thrust, but ${Math.round((1 - g.second / aeo.gradients.aeo) * 100)} % of the climb gone — because the drag did not halve.`) +
        k.h('The segments and their minimum gradients') +
        `<div class="scroll-x"><table class="t"><thead><tr><th>Segment</th><th>Configuration</th><th class="n">Twin</th><th class="n">Three</th><th class="n">Four</th></tr></thead><tbody>
          <tr><td>1st</td><td>gear retracting, take-off flaps, V<sub>LOF</sub> → V2</td><td class="n">&gt; 0 %</td><td class="n">0.3 %</td><td class="n">0.5 %</td></tr>
          <tr><td>2nd</td><td>gear up, take-off flaps, V2, take-off thrust</td><td class="n">2.4 %</td><td class="n">2.7 %</td><td class="n">3.0 %</td></tr>
          <tr><td>3rd</td><td>level (or slow climb), accelerating, flaps retracting</td><td class="n">—</td><td class="n">—</td><td class="n">—</td></tr>
          <tr><td>Final</td><td>clean, maximum continuous thrust, ≥ 1.18 V<sub>SR</sub></td><td class="n">1.2 %</td><td class="n">1.5 %</td><td class="n">1.7 %</td></tr>
          <tr><td>Net margin</td><td>subtracted from the gross gradient for obstacles</td><td class="n">0.8 %</td><td class="n">0.9 %</td><td class="n">1.0 %</td></tr></tbody></table></div>` +
        k.p('The second segment is usually the one that limits the weight — at a hot, high airport it can be tighter than the runway. The take-off path ends at 1500 ft above the runway or when the aircraft is clean, whichever is higher, and no flap may move below 400 ft.') +
        k.h('Why twins have so much spare thrust') +
        k.p('Turn (7.2) round and ask how much thrust the aircraft needs with all engines so that it still meets the second-segment gradient with one out:') +
        k.eq(R`\frac{T}{W} \ge \frac{n}{n-1}\left(\frac{1}{L/D} + \gamma_{\min}\right)`, '7.3') +
        k.box('Worked example', k.p(`With a lift-to-drag ratio of about ${ld} at V2: a twin needs ${k.m(R`T/W \ge 2 \times (0.091 + 0.024) = ${tw2.toFixed(2)}`)}, a four-engine aircraft only ${k.m(R`\tfrac43 \times (0.091 + 0.030) = ${tw4.toFixed(2)}`)}. With everything running, the twin has far more thrust than it needs — which is why a light 737 climbs away so steeply and a 747 more gently.`), 'example') +
        k.h('The net flight path and obstacles') +
        k.p('The certified (gross) gradient is what an average aircraft achieves. For obstacle clearance, planners use the net gradient, which is lower by a fixed margin, and the net path must clear every obstacle in the departure area by at least 35 ft:') +
        k.eq(R`\gamma_{\text{net}} = \gamma_{\text{gross}} - 0.8\,\% \;\;(\text{twin}), \qquad h_{\text{gained}} = \gamma_{\text{net}} \times d \;\ge\; h_{\text{obstacle}} + 35\ \text{ft}`, '7.4') +
        k.box('Worked example', k.p(`A mast 2 NM (3 704 m) beyond the end of the take-off distance, 200 ft high. With a gross gradient of 2.9 % the net gradient is 2.1 %: the net path gains ${k.m(R`0.021 \times 3704 = 78\ \text{m} = 255\ \text{ft}`)} — clear of 200 + 35 = 235 ft, just. A heavier or hotter departure would need a lower weight, or an engine-out procedure that turns away from the mast.`), 'example') +
        k.h('Flying an engine failure after V1') +
        k.ul(['<b>Continue.</b> After V1 the take-off goes on. Rotate at VR a little slower than normal and fly V2 — or the speed you have when it fails, if higher, up to about V2 + 15 kt.',
          '<b>Keep it straight.</b> Rudder against the yaw (the slip indicator centred; Airbus shows a blue β target), wings level or a few degrees toward the live engine.',
          '<b>Positive climb → gear up.</b> No flap change and no turn below 400 ft unless the engine-out procedure (EOSID) says so.',
          '<b>At the engine-out acceleration height</b> (EO ACC, typically 800–1500 ft, set for each runway): level off or reduce the climb, accelerate and retract the flaps on schedule.',
          '<b>Clean, at green dot / flaps-up speed:</b> set maximum continuous thrust — take-off thrust is limited to 5 minutes, or 10 with an engine out — and climb on the engine-out route.']) +
        k.box('In X-Plane', k.ul([`The Failures screen (Flight menu) can fail an engine at a chosen speed — set it to your V1. The dataref is ${k.code('sim/operation/failures/rel_engfai0')} for engine 1.`,
          `Watch ${k.code('sim/cockpit2/gauges/indicators/slip_deg')} (the ball) and ${k.code('sim/flightmodel/position/vh_ind_fpm')} (vertical speed): at V2 with one engine the climb is only a few hundred feet per minute.`,
          'The engine-failure profile in the calculator computes the segments for your aircraft, weight and airport.']), 'xp') +
        k.tryit([['nadp', 'Departure profile (NADP & engine failure)']]);
    },
    quiz: [
      { q: 'Which take-off segment usually limits the weight?', a: ['1st', '2nd', '3rd', 'Final'], c: 1, why: 'Gear up, take-off flaps, V2 and one engine: 2.4 % for a twin is hard to reach when it is hot and high.' },
      { q: 'The minimum 2nd-segment gross gradient for a twin is…', a: ['0 %', '1.2 %', '2.4 %', '3.0 %'], c: 2, why: '2.4 % (three engines 2.7 %, four 3.0 %).' },
      { q: 'Why do twins have more spare thrust than four-engine aircraft?', a: ['To cruise faster', 'Losing one of two engines halves the thrust; one of four only a quarter', 'Twins are heavier', 'The rules demand higher speeds'], c: 1, why: 'Equation (7.3): the factor n/(n−1) is 2 for a twin and 1.33 for a four-engine aircraft.' },
      { q: 'Below what height are flaps not retracted after take-off?', a: ['35 ft', '400 ft', '1500 ft', '3000 ft'], c: 1, why: 'Certification assumes no configuration change except the gear below 400 ft.' }
    ] });

  T({ id: 'nadp', ch: 'proc', no: '7.2', title: 'Noise abatement departures: NADP 1 and NADP 2', blurb: 'Climb steeply first or clean up early: the energy equation behind thrust reduction and acceleration altitudes, and what goes in the FMS.',
    thumb: () => Fg().depProfile([{ r: depThumb({ proc: 'nadp1' }), cls: 'sel', label: 'NADP 1', markers: false }, { r: depThumb({ proc: 'nadp2' }), cls: 'acc', label: 'NADP 2', markers: false }], { speed: false }),
    render(ctx) {
      const k = kit(ctx);
      const n1 = depRef(ctx, { proc: 'nadp1' }), n2 = depRef(ctx, { proc: 'nadp2' });
      const a1 = n1.at(3.5), a2 = n2.at(3.5);
      const e3 = r => r.events.find(e => e.key === 'h3000');
      const v1 = 160 * 0.514444, v2 = 250 * 0.514444, dh = (v2 * v2 - v1 * v1) / (2 * 9.80665) / 0.3048;
      const elev = 131;
      return k.lead('Close to the airport, noise comes from two things: how much thrust the engines make and how low the aircraft is. ICAO gives two ways to trade them. NADP 1 climbs steeply first to protect the houses close in; NADP 2 cleans up early to cut the noise further out — and saves fuel.') +
        k.h('The energy equation') +
        k.p('Spare thrust can be spent on climbing, on accelerating, or shared between the two. Divide every force along the flight path by the weight and you get:') +
        k.eq(R`\frac{T - D}{W} = \sin\gamma + \frac{1}{g}\frac{dV}{dt}`, '7.5') +
        k.p(`Hold the speed (${k.m(R`dV/dt = 0`)}) and all of it goes into climbing — equation (7.1). Lower the nose and part of it goes into speed. Speed is stored height: the <b>energy height</b> adds the height the aircraft could zoom up to if it traded all its speed:`) +
        k.eq(R`h_E = h + \frac{V^2}{2g}`, '7.6') +
        k.box('Worked example', k.p(`Accelerating from 160 kt to 250 kt needs ${k.m(R`\frac{(128.6)^2 - (82.3)^2}{2 \times 9.81} = ${Math.round(dh * 0.3048)}\ \text{m}`)} — about ${k.n(Math.round(dh / 10) * 10)} ft of climb. Every noise procedure is a decision about <i>where</i> to spend those ${k.n(Math.round(dh / 10) * 10)} ft.`), 'example') +
        k.fig(Fg().depProfile([{ r: n1, cls: 'sel', label: 'NADP 1 — close-in' }, { r: n2, cls: 'acc', label: 'NADP 2 — distant' }], { refNm: 3.5, refLabel: '6.5 km from brake release' }),
          `<b>Fig. 7.2</b> — NADP 1 and NADP 2 for a 737-800 at 70 t, sea level, ISA, flaps 5, computed with this app’s departure model. Over the noise-certification point 6.5 km from brake release, NADP 1 is ${k.n(a1.h - a2.h)} ft higher. NADP 2 is clean and at climb thrust much sooner, reaches 4000 ft at 250 kt ${k.n(n1.time - n2.time)} s earlier and burns about ${k.n(n1.fuel - n2.fuel)} kg less fuel on the way.`) +
        k.h('The two procedures') +
        `<div class="scroll-x"><table class="t"><thead><tr><th></th><th>NADP 1 — close-in</th><th>NADP 2 — distant</th></tr></thead><tbody>
          <tr><td>Take-off to 800 ft</td><td>take-off thrust, V2 + 10 to 20 kt, take-off flaps</td><td>take-off thrust, V2 + 10 to 20 kt, take-off flaps</td></tr>
          <tr><td>At 800 ft or above</td><td>reduce to climb thrust; keep V2 + 10–20 kt and the take-off flaps</td><td>lower the nose, accelerate towards the clean speed V<sub>ZF</sub> and retract flaps on schedule; reduce thrust at the first flap retraction (or when clean)</td></tr>
          <tr><td>Up to 3000 ft</td><td>climb steeply at V2 + 10–20 kt</td><td>climb clean at V<sub>ZF</sub> + 10–20 kt</td></tr>
          <tr><td>At 3000 ft</td><td>accelerate, retract flaps, go to en-route climb speed</td><td>accelerate to en-route climb speed</td></tr>
          <tr><td>Quieter for</td><td>communities close to the runway</td><td>communities further out</td></tr></tbody></table></div>` +
        k.ul(['A noise procedure never starts below 800 ft above the airport, and the initial climb is never slower than V2 + 10 kt.',
          'Where no NADP is required, airlines use their own standard — often thrust reduction and acceleration at 1000–1500 ft (the Airbus default is 1500 ft for both).',
          'The engine-out acceleration height is separate: it is set for obstacles, not noise (topic 7.1).',
          'In NADP 2 the aircraft still climbs while accelerating — ICAO asks for a positive rate of climb. This app gives 60 % of the spare energy to speed and 40 % to climb, like a typical flight director.']) +
        k.h('What goes in the FMS') +
        k.p(`Airbus enters these on the PERF TAKE OFF page as <b>altitudes above sea level</b>; Boeing on TAKEOFF REF page 2 as <b>heights above the runway</b>. For an airport at ${elev} ft:`) +
        `<div class="scroll-x"><table class="t"><thead><tr><th></th><th class="n">Airbus — THR RED / ACC</th><th class="n">Boeing — THR REDUCTION / ACCEL HT</th></tr></thead><tbody>
          <tr><td>NADP 1</td><td class="n">${k.n(elev + 800)} / ${k.n(elev + 3000)}</td><td class="n">800 / 3000</td></tr>
          <tr><td>NADP 2</td><td class="n">${k.n(elev + 800)} / ${k.n(elev + 800)}</td><td class="n">FLAPS 1 / 800</td></tr>
          <tr><td>Standard 1500 / 1500</td><td class="n">${k.n(elev + 1500)} / ${k.n(elev + 1500)}</td><td class="n">1500 / 1500</td></tr></tbody></table></div>` +
        k.p('Boeing can also reduce thrust at a flap setting (“FLAPS 1”), which is how NADP 2’s “reduce at the first flap retraction” is usually set. The Performance page’s take-off tab now shows these values for your aircraft and airport.') +
        k.box('In X-Plane', k.ul([`At thrust reduction the N1 drops a few percent — watch ${k.code('sim/cockpit2/engine/indicators/N1_percent')}.`,
          `At acceleration the pitch comes down several degrees (${k.code('sim/cockpit2/gauges/indicators/pitch_AHARS_deg_pilot')}) while the vertical speed (${k.code('sim/cockpit2/gauges/indicators/vvi_fpm_pilot')}) roughly halves.`,
          'Study-level aircraft (Zibo 737, ToLiSS, FlightFactor, PMDG) take these entries in their FMS; with the default aircraft, fly the profile by hand.']), 'xp') +
        k.tryit([['nadp', 'Departure profile calculator'], ['#perf.takeoff', 'Performance · take-off']]);
    },
    quiz: [
      { q: 'NADP 1 mainly protects…', a: ['communities close to the airport', 'communities far away', 'the engines', 'the fuel reserve'], c: 0, why: 'It stays slow and steep with take-off flaps up to 3000 ft, so it is higher close in.' },
      { q: 'The lowest height at which a noise-abatement thrust reduction may start is…', a: ['400 ft', '800 ft', '1500 ft', '3000 ft'], c: 1, why: 'ICAO: not below 800 ft (240 m) above the aerodrome.' },
      { q: 'In NADP 2, what happens at 800 ft?', a: ['Nothing', 'Lower the nose, accelerate and retract flaps', 'More thrust and a steeper climb', 'Level off'], c: 1, why: 'It cleans up early and reduces thrust with the first flap retraction.' },
      { q: 'Accelerating from 160 to 250 kt costs about as much energy as climbing…', a: ['160 ft', '1600 ft', '5000 ft', '16 000 ft'], c: 1, why: 'Energy height (7.6): (V₂² − V₁²) / 2g ≈ 500 m ≈ 1600 ft.' }
    ] });

  T({ id: 'stable-approach', ch: 'proc', no: '7.3', title: 'Stabilised approach and continuous descent', blurb: 'The 1000 ft and 500 ft gates, what “stable” means, and why a continuous idle descent is quieter.',
    thumb: () => Fg().stableApproach(),
    render(ctx) {
      const k = kit(ctx);
      const vs = gs => 101.27 * gs * Math.tan(3 * Math.PI / 180);
      const ld = 17, gam = Math.atan(1 / ld) * 180 / Math.PI, dec = 9.80665 / ld / 0.514444;
      return k.lead('Most landing accidents begin with an approach that was never under control. Airlines use simple gates: by 1000 ft above the runway — 500 ft in good weather — the aircraft must be stable, or it goes around.') +
        k.fig(Fg().stableApproach(), '<b>Fig. 7.3</b> — The stabilisation gates on a 3° approach and the criteria behind them (after the Flight Safety Foundation’s approach-and-landing guidance, which most airlines follow).') +
        k.p('The criteria are about energy: on the path, at the right speed, configured and with the engines already producing thrust. An aircraft that is fast, high or still configuring at 500 ft has too little time left to fix it — and the landing distance grows quickly with every extra knot.') +
        k.h('Sink rate on the glide path') +
        k.p('On a fixed path, the sink rate is set by the ground speed. For a 3° path in feet per minute with the ground speed in knots:') +
        k.eq(R`VS = 101.3 \times GS \times \tan\gamma \;\approx\; 5.3 \times GS \quad (3^\circ)`, '7.7') +
        k.box('Worked example', k.p(`At 140 kt ground speed a 3° path needs ${k.n(vs(140))} fpm. The same approach with a 20 kt tailwind (160 kt over the ground) needs ${k.n(vs(160))} fpm, and a fast, heavy aircraft at 180 kt ${k.n(vs(180))} fpm — close to the 1000 fpm limit. That is why tailwind approaches need extra care.`), 'example') +
        k.h('Continuous descent') +
        k.p('The quietest and cheapest descent keeps the engines near idle from the top of descent to the final approach, without level segments. Every level-off low down needs thrust, and thrust near the ground means noise and fuel.') +
        k.fig(Fg().cdo(), '<b>Fig. 7.4</b> — A continuous descent (magenta) against a stepped descent (blue). ICAO calls this continuous descent operations (CDO).') +
        k.p('How steep can an idle descent be? At idle and constant speed the energy equation (7.5) with ' + k.m(R`T \approx 0`) + ' leaves only drag:') +
        k.eq(R`\gamma_{\text{idle}} \approx -\frac{D}{W} = -\frac{1}{L/D}`, '7.8') +
        k.p(`A clean airliner with ${k.m(R`L/D \approx ${ld}`)} glides at ${k.m(R`\arctan(1/${ld}) = ${gam.toFixed(1)}^\circ`)} — just steeper than a 3° glide path. So a clean aircraft on the glide path needs a little thrust, and an aircraft that must also slow down has to add drag: speed brakes, flaps or gear.`) +
        k.p('Slowing down in level flight at idle works the same way — all the drag goes into deceleration:') +
        k.eq(R`\frac{dV}{dt} \approx -\,\frac{g}{L/D}`, '7.9') +
        k.box('Worked example', k.p(`With L/D ${ld}: ${k.m(R`9.81 / ${ld} = ${(9.80665 / ld).toFixed(2)}\ \text{m/s}^2`)}, about ${dec.toFixed(1)} kt per second. Slowing from 250 kt to 210 kt in level flight takes some ${k.n(40 / dec)} s — about 2.5 NM. That is where the planning rule “add 1 NM per 10 kt to lose” (topic 4.5) comes from.`), 'example') +
        k.box('In X-Plane', k.ul([`Fly an ILS and watch ${k.code('sim/cockpit2/gauges/indicators/vvi_fpm_pilot')}: it should settle near 5 × your ground speed.`,
          `Call out the gates with ${k.code('sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot')} — or use the altitude above the runway, as the airlines do.`,
          'Plan descents with the Climb & descent calculator and try to reach the final approach fix without levelling off.']), 'xp') +
        k.tryit([['descent', 'Top of descent'], ['ils', 'ILS glide path heights']]);
    },
    quiz: [
      { q: 'In IMC, by what height must an approach be stable?', a: ['200 ft', '500 ft', '1000 ft', '1500 ft'], c: 2, why: '1000 ft above the airport in IMC, 500 ft in VMC.' },
      { q: 'Unstable below the gate. What now?', a: ['Continue and fix it', 'Go around', 'Ask ATC', 'Extend full flaps'], c: 1, why: 'The rule is simple on purpose: go around.' },
      { q: 'A clean airliner at idle (L/D 17) descends at about…', a: ['1°', '3.4°', '6°', '10°'], c: 1, why: 'Equation (7.8): arctan(1/17) = 3.4°.' },
      { q: 'On a 3° glide path, a tailwind makes the sink rate…', a: ['smaller', 'larger', 'the same', 'zero'], c: 1, why: 'Sink rate = 5.3 × ground speed, and a tailwind raises the ground speed.' }
    ] });

  T({ id: 'go-around', ch: 'proc', no: '7.4', title: 'Go-around and missed approach', blurb: 'TOGA, pitch, flaps, gear: the go-around sequence, the height it costs, and the climb gradients behind it.',
    thumb: () => Fg().goAround(),
    render(ctx) {
      const k = kit(ctx);
      const loss = (vs, t) => 0.5 * vs / 60 * t;
      return k.lead('A go-around is a normal manoeuvre, practised on every simulator check — and still one of the most demanding: lots of thrust, a big pitch change and a busy cockpit, usually close to the ground and often unexpected.') +
        k.fig(Fg().goAround(), '<b>Fig. 7.5</b> — The go-around sequence. The missed-approach procedure is designed for a 2.5 % climb gradient (152 ft per NM) unless a higher gradient is published.') +
        k.h('The sequence') +
        k.ul(['<b>Go-around, flaps.</b> Thrust levers to TOGA (or press TO/GA), rotate to the go-around attitude (about 15°) and retract the flaps one step — FULL → 3 on an Airbus, 30 → 15 on a 737.',
          '<b>Positive climb → gear up.</b> Only when the altimeter and vertical speed both show a climb.',
          '<b>Follow the missed approach.</b> Engage the navigation mode, fly the published track and watch the level-off: the missed-approach altitude is often only 2000–3000 ft above the runway.',
          '<b>At the acceleration altitude</b> retract the flaps on schedule and set climb thrust — the same clean-up as after take-off (topic 7.2).']) +
        k.h('Height lost before the climb starts') +
        k.p('The descent does not stop the moment you decide. The pitch change and the engines take a few seconds; if the sink rate falls roughly evenly to zero over that time, the aircraft loses:') +
        k.eq(R`\Delta h \approx \tfrac12 \times \frac{VS}{60} \times t`, '7.10') +
        k.box('Worked example', k.p(`Descending at 750 fpm with 5 s to stop the descent: ${k.m(R`\tfrac12 \times \tfrac{750}{60} \times 5 = ${Math.round(loss(750, 5))}\ \text{ft}`)}. From a decision height of 200 ft the wheels stay well clear — but at 1000 fpm and 8 s it is already ${Math.round(loss(1000, 8))} ft. On a Category II or III approach the decision heights are lower and the aircraft may touch the runway during the go-around; that is allowed for.`), 'example') +
        k.h('The climb gradients behind it') +
        k.p('Certification makes sure the aircraft can always climb away from an approach — which limits the landing weight at hot and high airports:') +
        `<div class="scroll-x"><table class="t"><thead><tr><th>Case</th><th>Configuration</th><th class="n">Twin</th><th class="n">Three</th><th class="n">Four</th></tr></thead><tbody>
          <tr><td>Approach climb</td><td>one engine out, approach flaps, gear up</td><td class="n">2.1 %</td><td class="n">2.4 %</td><td class="n">2.7 %</td></tr>
          <tr><td>Landing climb</td><td>all engines, landing flaps, gear down, thrust 8 s after the levers move</td><td class="n">3.2 %</td><td class="n">3.2 %</td><td class="n">3.2 %</td></tr>
          <tr><td>Missed-approach design</td><td>obstacle clearance on the published procedure</td><td class="n" colspan="3">2.5 % unless published</td></tr></tbody></table></div>` +
        k.p('With all engines a go-around climb is easy: 2.5 % at 150 kt is only about 380 fpm (equation 4.9). The hard parts are human.') +
        k.h('Why go-arounds catch crews out') +
        k.ul(['<b>Pitch-up with the engines under the wing.</b> TOGA thrust pushes the nose up hard; with the stabiliser trimmed for the approach, it needs a firm push and retrimming.',
          '<b>The body lies.</b> Strong acceleration feels like pitching up (the somatogravic illusion), especially at night — crews have pushed the nose down into the ground. Trust the attitude indicator.',
          '<b>Quick level-off.</b> At high thrust and a low missed-approach altitude the aircraft arrives in seconds; speed and flap limits come quickly. Reduce thrust in time.',
          '<b>Surprise.</b> Go-arounds are rare in daily flying. Brief one on every approach, so it is a plan and not a surprise.']) +
        k.box('In X-Plane', k.ul(['Most airliners in X-Plane use a TO/GA button or detent: bind “TOGA power” to a joystick button so the go-around is one action.',
          `Watch ${k.code('sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot')} during a go-around from minimums to see the height you lose.`,
          `Gear handle: ${k.code('sim/cockpit2/controls/gear_handle_down')} — note how long you wait for a positive climb before it goes up.`]), 'xp') +
        k.tryit([['climb-gradient', 'Climb gradient ⇄ rate'], ['vpath', 'Vertical path to a fix']]);
    },
    quiz: [
      { q: 'The first actions of a go-around are…', a: ['gear up, then flaps', 'TOGA, pitch up, flaps one step', 'flaps fully up', 'idle and wait'], c: 1, why: 'Thrust and attitude first; flaps one step to cut drag but keep lift.' },
      { q: 'When does the gear come up in a go-around?', a: ['Immediately', 'With a positive rate of climb', 'At 1500 ft', 'After the flaps are up'], c: 1, why: 'Only once the aircraft is really climbing.' },
      { q: 'The default missed-approach climb gradient is…', a: ['1.2 %', '2.5 %', '5 %', '10 %'], c: 1, why: '2.5 % (152 ft/NM) unless the chart publishes a higher one.' },
      { q: 'Descending at 750 fpm and taking 5 s to stop the descent, you lose about…', a: ['3 ft', '30 ft', '300 ft', 'nothing'], c: 1, why: 'Equation (7.10): ½ × 12.5 ft/s × 5 s ≈ 31 ft.' }
    ] });

  // ------------------------------------------------------------ quizzes for the core topics
  const QUIZ = {
    forces: [
      { q: 'In steady, level flight which forces are equal?', a: ['Lift = thrust and weight = drag', 'Lift = weight and thrust = drag', 'All four are equal', 'Lift = drag and weight = thrust'], c: 1, why: 'Unaccelerated flight: the forces cancel in pairs, vertically and horizontally.' },
      { q: 'At the same density and C<sub>L</sub>, doubling the true airspeed makes lift…', a: ['double', 'four times as large', 'half as large', 'unchanged'], c: 1, why: 'L = ½ρV²S·C<sub>L</sub> — lift goes with the square of speed.' },
      { q: 'A typical airliner cruise lift coefficient is about…', a: ['0.05', '0.5', '1.5', '3'], c: 1, why: 'Worked out in the example: about 0.5 at FL350.' }
    ],
    'lift-curve': [
      { q: 'What happens beyond the critical angle of attack?', a: ['Lift keeps rising', 'The flow separates and lift falls: the wing stalls', 'Drag disappears', 'The aircraft climbs faster'], c: 1, why: 'The stall is an angle of attack, not a speed.' },
      { q: 'Halve the speed in level flight. The C<sub>L</sub> needed…', a: ['halves', 'doubles', 'quadruples', 'stays the same'], c: 2, why: 'C<sub>L</sub> = 2W / (ρV²S): half the speed, four times the C<sub>L</sub>.' },
      { q: 'Trailing-edge flaps mainly…', a: ['raise the lift curve (more camber), increasing C<sub>Lmax</sub>', 'reduce the weight', 'reduce drag', 'move the centre of gravity'], c: 0, why: 'More camber: more lift at every angle and a higher maximum.' }
    ],
    stall: [
      { q: 'A stall speed of 60 kt at maximum weight becomes, 25 % lighter, about…', a: ['45 kt', '52 kt', '60 kt', '69 kt'], c: 1, why: '60 × √0.75 = 52 kt.' },
      { q: 'In a level 60° banked turn the stall speed increases by about…', a: ['7 %', '19 %', '41 %', '100 %'], c: 2, why: 'n = 2 g, and √2 = 1.41.' },
      { q: 'Why does the indicated stall speed hardly change with altitude?', a: ['IAS measures dynamic pressure, which is what the wing responds to', 'Air density is the same everywhere', 'The engine compensates', 'It does change a lot'], c: 0, why: 'The wing and the airspeed indicator both feel ½ρV²; TAS rises with altitude, IAS does not.' }
    ],
    turning: [
      { q: 'Double the TAS at the same bank angle. The turn radius…', a: ['doubles', 'quadruples', 'halves', 'stays the same'], c: 1, why: 'r = V² / (g tan φ).' },
      { q: 'Bank for a rate-one turn at 120 kt TAS (rule of thumb)?', a: ['12°', '19°', '30°', '45°'], c: 1, why: 'TAS / 10 + 7 = 19°.' }
    ],
    glide: [
      { q: 'L/D 17, 6000 ft (about 1 NM) above the ground, still air. Glide distance?', a: ['6 NM', '17 NM', '34 NM', '102 NM'], c: 1, why: 'Distance = height × L/D = 1 NM × 17.' },
      { q: 'A heavier aircraft with the same maximum L/D glides…', a: ['a shorter distance', 'the same distance, at a higher speed', 'further', 'not at all'], c: 1, why: 'Weight changes the best-glide speed, not the glide ratio.' }
    ],
    isa: [
      { q: 'The ISA temperature at 10 000 ft is about…', a: ['+15 °C', '−5 °C', '−15 °C', '−56.5 °C'], c: 1, why: '15 − 2 × 10 = −5 °C (exactly −4.8 °C).' },
      { q: 'At about what altitude is the pressure half its sea-level value?', a: ['5 000 ft', '10 000 ft', '18 000 ft', '36 000 ft'], c: 2, why: 'About 500 hPa at 18 000 ft.' },
      { q: 'Above the tropopause (36 089 ft) ISA temperature…', a: ['keeps falling 2 °C per 1000 ft', 'stays at −56.5 °C', 'rises quickly', 'is 0 °C'], c: 1, why: 'Constant −56.5 °C up to 20 km.' }
    ],
    altimetry: [
      { q: 'With QNH set, on the ground the altimeter shows…', a: ['zero', 'the airfield elevation', 'the pressure altitude', 'the flight level'], c: 1, why: 'QNH gives altitude above mean sea level.' },
      { q: 'You fly from high to low pressure without resetting the altimeter. You are…', a: ['higher than indicated', 'lower than indicated', 'exactly where indicated', 'upside down'], c: 1, why: 'High to low, look out below.' },
      { q: 'Flight levels are…', a: ['heights above the ground', 'pressure altitudes with 1013.25 hPa set', 'QNH altitudes', 'true altitudes'], c: 1, why: 'Everyone above the transition level uses the same datum.' }
    ],
    'density-altitude': [
      { q: 'Pressure altitude 5000 ft, OAT 30 °C. Density altitude is about…', a: ['5 000 ft', '6 000 ft', '7 800 ft', '10 000 ft'], c: 2, why: 'ISA +25 °C: about 118.8 ft per °C more.' },
      { q: 'A high density altitude…', a: ['shortens the take-off', 'lengthens the take-off and reduces the climb', 'only matters for jets', 'lowers the true airspeed'], c: 1, why: 'Thinner air: less lift and power for the same speed.' }
    ],
    'temperature-error': [
      { q: 'On a very cold day the altimeter reads 3000 ft. You are…', a: ['higher than 3000 ft', 'lower than 3000 ft', 'exactly at 3000 ft', 'on the ground'], c: 1, why: 'Cold air is dense: the pressure levels are squeezed together.' },
      { q: 'The rule of thumb for the cold-temperature correction is…', a: ['4 % of the height per 10 °C below ISA', '1 % per °C above ISA', '10 ft per hPa', 'none is needed'], c: 0, why: 'Add about 4 % of the height above the station for every 10 °C below ISA.' }
    ],
    airspeeds: [
      { q: 'Which speed goes into the wind triangle?', a: ['IAS', 'CAS', 'TAS', 'EAS'], c: 2, why: 'Navigation needs the real speed through the air.' },
      { q: 'CAS 150 kt at 8000 ft. TAS by the rule of thumb?', a: ['150 kt', '174 kt', '198 kt', '230 kt'], c: 1, why: '+2 % per 1000 ft: 150 × 1.16 = 174 kt.' },
      { q: 'The pitot tube senses…', a: ['static pressure', 'total pressure (static + dynamic)', 'temperature', 'true airspeed'], c: 1, why: 'The instrument subtracts the static pressure to get the impact pressure.' }
    ],
    mach: [
      { q: 'Climbing at a constant CAS, the Mach number…', a: ['falls', 'rises', 'stays constant', 'becomes zero'], c: 1, why: 'TAS rises and the speed of sound falls.' },
      { q: 'The speed of sound depends only on…', a: ['pressure', 'temperature', 'humidity', 'the aircraft'], c: 1, why: 'a = √(γRT).' },
      { q: 'TAT reads warmer than SAT because…', a: ['the probe is heated', 'the air is brought to rest and heats up', 'of sunlight', 'of the engine exhaust'], c: 1, why: 'Ram rise: TAT = SAT(1 + 0.2M²).' }
    ],
    'wind-triangle': [
      { q: 'TAS 120 kt, 25 kt of wind straight across the course. Maximum drift is about…', a: ['5°', '12°', '25°', '45°'], c: 1, why: 'Wind × 60 / TAS = 25 × 60 / 120 = 12.5°.' },
      { q: 'Winds in METARs are given relative to…', a: ['magnetic north', 'true north', 'the runway', 'the aircraft'], c: 1, why: 'Forecasts and reports are true; ATIS and tower winds are magnetic.' }
    ],
    crosswind: [
      { q: '20 kt of wind at 30° to the runway. The crosswind is…', a: ['5 kt', '10 kt', '17 kt', '20 kt'], c: 1, why: '20 × sin 30° = 10 kt.' },
      { q: 'Clock code: at 45° off the runway, the crosswind is about … of the wind', a: ['¼', '½', '¾', 'all'], c: 2, why: '45 minutes past the hour = ¾ (sin 45° = 0.71).' }
    ],
    'great-circle': [
      { q: 'On a Mercator chart, a northern-hemisphere great circle…', a: ['is a straight line', 'curves towards the pole', 'curves towards the equator', 'is a spiral'], c: 1, why: 'The shortest path bows poleward on this projection.' },
      { q: '1-in-60: 3 NM off track after 60 NM. The track error is…', a: ['1°', '3°', '6°', '20°'], c: 1, why: '1 NM in 60 is 1°, so 3 NM is 3°.' }
    ],
    holding: [
      { q: 'Right-hand hold, inbound 360°, arriving on heading 150°. The entry is…', a: ['direct', 'teardrop', 'parallel', 'no entry allowed'], c: 1, why: 'Δ = 150°: between 110° and 180° → teardrop.' },
      { q: 'The ICAO maximum holding speed up to 14 000 ft is…', a: ['200 kt', '230 kt', '250 kt', '265 kt'], c: 1, why: '230 kt to 14 000 ft, 240 kt to 20 000 ft, 265 kt to 34 000 ft.' },
      { q: 'The inbound leg at or below 14 000 ft lasts…', a: ['30 s', '1 minute', '1½ minutes', '2 minutes'], c: 1, why: '1½ minutes above 14 000 ft.' }
    ],
    descent: [
      { q: 'How far out do you start a 3° descent to lose 30 000 ft?', a: ['30 NM', '60 NM', 'about 95 NM', '150 NM'], c: 2, why: '30 000 ÷ 318 ≈ 94 NM (3 NM per 1000 ft gives 90).' },
      { q: 'Vertical speed for a 3° path at 140 kt ground speed?', a: ['500 fpm', 'about 740 fpm', '1000 fpm', '1400 fpm'], c: 1, why: '5.3 × 140 ≈ 740 fpm.' }
    ],
    'mass-balance': [
      { q: 'Why is there a maximum zero-fuel mass?', a: ['To save tyres', 'Fuel in the wings relieves bending, so weight above MZFW must be fuel', 'Because of the landing gear', 'For passenger comfort'], c: 1, why: 'The wing root bending limit.' },
      { q: 'An aft CG makes the aircraft…', a: ['more stable and heavier in pitch', 'less stable and lighter in pitch', 'no different', 'stall at a higher speed'], c: 1, why: 'Less static margin: lighter controls, less stability.' }
    ],
    takeoff: [
      { q: 'An engine fails before V1. You…', a: ['continue the take-off', 'reject and stop', 'rotate early', 'raise the flaps'], c: 1, why: 'Below V1 the stop fits in the accelerate-stop distance available.' },
      { q: '10 % heavier: the take-off field length grows by about…', a: ['5 %', '10 %', '21 %', '50 %'], c: 2, why: 'It scales with W²: 1.1² = 1.21.' }
    ],
    flex: [
      { q: 'With an assumed temperature the engines…', a: ['are damaged', 'give less thrust than TOGA, saving wear', 'give more thrust', 'shut down'], c: 1, why: 'Only the thrust the runway needs.' },
      { q: 'The maximum reduction from full thrust is…', a: ['10 %', '25 %', '50 %', 'unlimited'], c: 1, why: '25 % of the full rated thrust.' },
      { q: 'Reduced thrust is not allowed on…', a: ['dry runways', 'contaminated runways', 'long runways', 'sea-level airports'], c: 1, why: 'Contaminated runways need full or specific derated thrust.' }
    ],
    landing: [
      { q: 'Vref is…', a: ['1.13 VS1g', '1.23 VS1g in the landing configuration', '1.5 Vs', 'V2 + 10'], c: 1, why: 'A 23 % margin above the 1-g stall speed.' },
      { q: 'Autobrake 2, dry runway: with reverse thrust the stopping distance is…', a: ['much shorter', 'about the same — autobrake holds the deceleration', 'longer', 'unpredictable'], c: 1, why: 'Reversers just let the brakes work less, unless braking is friction-limited.' },
      { q: 'In flight, the actual landing distance is multiplied by … to check it fits', a: ['1.0', '1.15', '1.67', '2.0'], c: 1, why: 'A 15 % margin in flight; dispatch uses ÷ 0.6.' }
    ],
    fuel: [
      { q: 'Final reserve fuel for a turbine aircraft is…', a: ['15 minutes', '30 minutes holding at 1500 ft', '45 minutes at cruise', '2 hours'], c: 1, why: 'Piston aircraft carry 45 minutes.' },
      { q: 'Contingency fuel is typically…', a: ['5 % of the trip fuel', '50 % of the trip fuel', 'the alternate fuel', 'the taxi fuel'], c: 0, why: 'At least 5 minutes of holding.' }
    ]
  };
  for (const t of topics) if (!t.quiz && QUIZ[t.id]) t.quiz = QUIZ[t.id];
  const chOrder = id => chapters.findIndex(c => c.id === id);
  const noKey = no => no.split('.').map(Number);
  topics.sort((a, b) => chOrder(a.ch) - chOrder(b.ch) || noKey(a.no)[1] - noKey(b.no)[1]);

  root.XFC.study = { chapters, topics, kit, explainHTML, labelHTML };
})(typeof self !== 'undefined' ? self : this);
