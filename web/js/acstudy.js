/* XP Flight Computer — per-aircraft study pages.
 * One page for any aircraft: library notes when the type is known (types.js), X-Plane's own aircraft
 * file otherwise. Speeds, stall curves, payload-range and quiz answers are computed live with the same
 * functions the calculators and the performance module use.
 */
(function (root) {
  'use strict';
  const X = root.XFC;
  const Fg = () => X.figures;
  const isNum = x => typeof x === 'number' && isFinite(x);
  const r0 = x => Math.round(x);
  const pos = x => (isNum(x) && x > 0 ? x : null);

  const CAT_LABEL = { airliner: 'Airliner', ga: 'Light aircraft', turboprop: 'Turboprop', bizjet: 'Business jet', helicopter: 'Helicopter', glider: 'Glider', military: 'Military jet' };
  const GROUPS = [
    ['Airliners — Boeing', t => t.cat === 'airliner' && /^B7/.test(t.id)],
    ['Airliners — Airbus', t => t.cat === 'airliner' && /^A/.test(t.id)],
    ['Airliners — others', t => t.cat === 'airliner' && !/^B7|^A/.test(t.id)],
    ['Business jets & turboprops', t => t.cat === 'bizjet' || t.cat === 'turboprop'],
    ['Light aircraft', t => t.cat === 'ga'],
    ['Helicopters, gliders & military', t => t.cat === 'helicopter' || t.cat === 'glider' || t.cat === 'military']
  ];

  function profileOf(t) { return t.profile && X.aircraft.byId[t.profile] ? X.aircraft.byId[t.profile] : null; }
  function nameOf(t) { const p = profileOf(t); return t.name || (p ? p.name : t.id); }

  /** Library entry for the loaded aircraft, or a page built from X-Plane's data when it is unknown. */
  function forAircraft(ac, det) {
    const t = X.types.find(ac, det);
    if (t) return t;
    const kind = det ? det.kind : 'unknown';
    const cat = !det ? 'ga' : det.category === 'airliner' ? 'airliner' : det.category === 'bizjet' ? 'bizjet'
      : det.category === 'helicopter' ? 'helicopter' : det.category === 'glider' ? 'glider' : det.category === 'military' ? 'military'
        : kind === 'turboprop' ? 'turboprop' : 'ga';
    return { id: 'auto', auto: true, cat, kind: (ac && ac.engines >= 2 && kind === 'piston') ? 'twin' : kind === 'jet' ? 'jet' : 'single',
      name: (ac && (ac.desc || ac.icao)) || 'This aircraft', icao: ac && ac.icao ? [ac.icao] : [], genericProfile: det && det.profile && det.profile.generic ? det.profile : null };
  }

  // ------------------------------------------------------------------ helpers
  function seeded(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { h += 0x6D2B79F5; let x = h; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  /** A multiple-choice question from a number: the right value plus three plausible, distinct distractors. */
  function numQ(rnd, q, value, fmt, why, spread = [0.78, 1.18, 1.36]) {
    const opts = [value];
    for (const k of spread) {
      let v = value * k, n = 0;
      while (opts.some(o => fmt(o) === fmt(v)) && n++ < 6) v *= k > 1 ? 1.06 : 0.94;
      opts.push(v);
    }
    const order = opts.map((v, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    return { q, a: order.map(i => fmt(opts[i])), c: order.indexOf(0), why };
  }
  function shuffleQ(rnd, q) {
    const order = q.a.map((v, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    return { q: q.q, a: order.map(i => q.a[i]), c: order.indexOf(q.c), why: q.why };
  }
  const kg = m => (m >= 20000 ? (Math.round(m / 100) / 10).toLocaleString('en-US') + ' t' : Math.round(m).toLocaleString('en-US') + ' kg');
  const kt = v => Math.round(v) + ' kt';

  function wakeOf(t, mtow) {
    if (t.id === 'A388') return 'J';
    if (!(mtow > 0)) return null;
    return X.calc.wakeCategory(mtow);
  }

  // ------------------------------------------------------------------ airliner maths
  function defaultCruise(p) { return Math.min(p.ceilingFt - 2000, p.engine === 'turboprop' ? 24000 : p.cls === 'widebody' ? 37000 : p.cls === 'regional' ? 35000 : 36000); }
  function dowOf(p) { return p.oew + (p.cls === 'widebody' ? 1200 : p.cls === 'narrowbody' ? 500 : 300); }

  /** Payload–range from the app's fuel model; cruise fuel flow scales with the average mass. */
  function payloadRange(p) {
    const P = X.perf;
    const dow = dowOf(p), maxPl = Math.max(0, p.mzfw - dow);
    const cruiseFt = defaultCruise(p), altNm = p.cls === 'widebody' ? 200 : 100, ref = 0.8 * p.mtow;
    const plan = (D, pl) => {
      let ff = p.ffCruise, fp;
      for (let i = 0; i < 4; i++) {
        fp = P.fuelPlan(p, { distNm: D, cruiseFt, altNm, contPct: 5, finalResMin: 30, ffCruise: ff, ffHold: p.ffHold * ff / p.ffCruise, taxiKg: p.taxiKg });
        ff = p.ffCruise * (dow + pl + fp.takeoffFuel - fp.trip.fuel / 2) / ref;
      }
      return fp;
    };
    const ok = (D, pl) => { const fp = plan(D, pl); const tow = dow + pl + fp.takeoffFuel; return tow <= p.mtow && fp.block <= p.maxFuel && tow - fp.trip.fuel <= p.mlw; };
    const maxD = pl => {
      if (!ok(30, pl)) return 0;
      let lo = 30, hi = 12000;
      if (ok(hi, pl)) return hi;
      for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (ok(mid, pl)) lo = mid; else hi = mid; }
      return lo;
    };
    const pts = [{ range: 0, payload: maxPl }];
    for (let i = 0; i <= 24; i++) { const pl = maxPl * (1 - i / 24); pts.push({ range: maxD(pl), payload: pl }); }
    const a = pts[1], c = pts[pts.length - 1];
    const plB = p.mtow - dow - (p.maxFuel - p.taxiKg);
    const b = plB > 0 && plB < maxPl ? { range: maxD(plB), payload: plB } : null;
    return { pts, dow, maxPl, a, b, c, cruiseFt, altNm };
  }

  // ------------------------------------------------------------------ speeds for any type
  function speedsOf(t, ctx) {
    const ac = ctx.liveMatch ? ctx.ac : null;
    const poh = t.poh || {};
    const from = (k, simK) => (poh[k] != null ? [poh[k], 'handbook'] : ac && pos(ac[simK]) ? [ac[simK], 'X-Plane'] : [null, null]);
    const out = {}, src = new Set();
    for (const [k, simK] of [['vso', 'vso'], ['vs1', 'vs'], ['vfe', 'vfe'], ['vno', 'vno'], ['vne', 'vne'], ['vmca', 'vmca'], ['vyse', 'vyse'], ['vle', 'vle']]) {
      const [v, s] = from(k, simK); if (v != null) { out[k] = v; src.add(s); }
    }
    for (const k of ['vr', 'vx', 'vy', 'vg', 'va']) if (poh[k] != null) { out[k] = poh[k]; src.add('handbook'); }
    out.sources = Array.from(src);
    return out;
  }

  // ------------------------------------------------------------------ how to fly (by category)
  function howToFly(t, sp, ctx, p) {
    const n = x => (isNum(x) ? r0(x) : null);
    const ap = t.approach || {};
    const L = [];
    if (t.cat === 'airliner' && p) {
      const P = X.perf, C = X.calc;
      const toM = r0(p.mtow * 0.9 / 100) * 100, ldM = r0(p.mlw * 0.9 / 100) * 100;
      const to = P.takeoffSpeeds(p, toM, null), ld = P.landingSpeeds(p, ldM, null, { headwind: 10 });
      const xo = p.cruiseMach ? C.crossoverAltitude(p.engine === 'turboprop' ? 210 : 290, p.cruiseMach).ft : null;
      const pre = p.policy === 'airbus' ? 'CONF ' : 'flaps ';
      const man = P.maneuverSpeeds(p, ldM);
      L.push(['Plan', `Build the load sheet and fuel plan, then the take-off data for your runway on the <a href="#perf.takeoff">Performance</a> page. Enter the speeds and ${p.policy === 'airbus' ? 'FLEX temperature' : 'assumed temperature'} in the FMS.`]);
      L.push(['Take-off', `At ${Math.round(toM / 1000)} t with ${pre}${to.flap}: V1 ${n(to.v1)}, VR ${n(to.vr)}, V2 ${n(to.v2)} kt. Rotate smoothly at about 2–3° per second to roughly 15° nose-up, then fly V2 + 10–20 kt${p.engines > 2 ? '' : ' (V2 exactly if an engine fails)'}.`]);
      L.push(['Clean up', p.policy === 'airbus' ? `At acceleration altitude lower the nose, retract flaps at F and S speeds, and accelerate to ${p.greenDot ? 'green dot (≈' + n(P.greenDot(toM)) + ' kt at this weight)' : 'green dot'} and on to 250 kt.` : `Retract flaps on the speed schedule — each step at or above the manoeuvre speed for the next setting${man ? ' (flaps up ≈ ' + n(man[0].speed) + ' kt at ' + Math.round(ldM / 1000) + ' t)' : ''} — then 250 kt below 10 000 ft.`]);
      L.push(['Climb', p.cruiseMach ? `Above 10 000 ft climb at about 290 kt, then at M${p.cruiseMach.toFixed(2)} above the crossover altitude (≈ FL${Math.round(xo / 100)}).` : 'Above 10 000 ft climb at the published climb speed (about 200–210 kt for regional turboprops).']);
      L.push(['Cruise', `${p.cruiseMach ? 'M' + p.cruiseMach.toFixed(2) : (p.cruiseTas || 300) + ' kt TAS'} at a level that suits the weight: lighter aircraft cruise higher. Step climb as fuel burns off (see <a href="#study.cruise">Cruise and step climbs</a>).`]);
      L.push(['Descent', 'Start down about 3 NM per 1000 ft to lose, plus 10 NM to slow down; descend at M/CAS, then 250 kt below 10 000 ft.']);
      L.push(['Approach & landing', `At ${Math.round(ldM / 1000)} t with ${pre}${ld.flap}: ${ld.name} ${n(ld.vref)} kt, approach speed about ${n(ld.vapp)} kt with a 10 kt headwind. Fly a stable 3° path; flare at about ${p.cls === 'widebody' ? '30–40' : '20–30'} ft, idle, and let it settle. Autobrake and reversers stop it.`]);
      return L;
    }
    if (t.cat === 'helicopter') {
      return [
        ['Hover', 'Face into wind. Make small, early inputs: the cyclic tilts the disc, the collective changes power, the pedals hold the heading against the main-rotor torque.'],
        ['Transition', 'Accelerate gently. At about 16–24 kt the rotor reaches clean air (effective translational lift) and suddenly needs less power — expect the aircraft to pitch and roll slightly.'],
        ['Climb & cruise', `Climb at the best-rate speed (for most helicopters 55–75 kt). ${sp.vne ? 'Never exceed ' + n(sp.vne) + ' kt indicated; it falls with altitude and weight.' : 'Vne falls with altitude and weight.'}`],
        ['Approach', 'Aim for a steady angle, slowing so that you arrive at the hover spot at walking pace. Avoid descending faster than about 300–500 fpm below 30 kt: that is how vortex ring state starts.'],
        ['Autorotation', 'If power is lost, lower the collective at once to keep rotor RPM in the green, aim for about 60–70 kt, flare at about 40–50 ft to slow down, then cushion the landing with the remaining rotor energy.'],
        ['Height–velocity', 'Some combinations of low height and low speed leave no time to enter a safe autorotation (“the dead man’s curve”). Take off and land through it quickly.']
      ];
    }
    if (t.cat === 'glider') {
      return [
        ['Launch', 'On aerotow keep station behind and slightly above the tug; on a winch climb steeply only once safely airborne. Release at the planned height.'],
        ['Thermalling', 'Circle at 40–45° of bank at about the minimum-sink speed, centring on the strongest lift.'],
        ['Cruising', `Between thermals fly faster than best glide in sink and in headwinds (speed to fly). ${t.ld ? 'Best glide ratio is about ' + t.ld + ' : 1.' : ''}`],
        ['Circuit', `Approach at best glide speed plus half the headwind${ap.final ? ' (about ' + ap.final + ' kt in calm air)' : ''}. Control the glide path with the airbrakes, not the elevator.`],
        ['Landing', 'Hold off just above the ground, touch down slowly, keep the wings level with aileron as long as possible.']
      ];
    }
    if (t.cat === 'military') {
      return [
        ['Take-off', 'Afterburner (reheat) for take-off and climb; retract the gear promptly — gear and flap limit speeds are low for such a fast aircraft.'],
        ['Handling', 'At high angles of attack a swept-wing fighter can depart from controlled flight with little warning. Watch the AoA indication; use rudder rather than aileron to roll at very high AoA on older designs.'],
        ['Fuel', 'Afterburner multiplies fuel flow several times. Plan with the fuel flow the sim shows, not the endurance you would expect from a civil jet.'],
        ['Landing', `Fly a fast approach on angle of attack rather than speed${sp.vso ? ' (the stall speed is about ' + n(sp.vso) + ' kt)' : ''}; many types use a drag chute or arrester hook to stop.`]
      ];
    }
    if (t.cat === 'bizjet' || (t.kind === 'jet' && t.cat !== 'airliner')) {
      return [
        ['Plan', 'Take V-speeds for your weight and runway from the aircraft’s performance charts or FMS (the X-Plane aircraft often computes them).'],
        ['Take-off', 'Set take-off thrust, V1, rotate at VR, climb at V2 + 10–20 kt, then clean up flaps as speed builds.'],
        ['Climb & cruise', `250 kt below 10 000 ft, then the climb speed and Mach. ${t.mmo || (ctx.liveMatch && ctx.ac && ctx.ac.mmo > 0) ? 'Mmo is M' + Number(t.mmo || ctx.ac.mmo).toFixed(2) + ' — cruise a few hundredths below it.' : ''}`],
        ['Descent', 'Plan 3 NM per 1000 ft plus 10 NM to slow down; jets are clean and do not want to go down and slow down at the same time.'],
        ['Landing', 'Fly Vref + 5 kt on a stable 3° path, idle at about 20–30 ft, flare lightly, then brakes, spoilers and reversers.']
      ];
    }
    if (t.cat === 'turboprop') {
      return [
        ['Start', 'Watch the inter-turbine temperature (ITT) during light-off: a hot start is the classic turboprop mistake. Fuel (condition lever) on only once the gas generator is turning fast enough.'],
        ['Take-off', `Set take-off torque without exceeding the torque, ITT or Ng limits; expect a strong swing on a powerful single. ${sp.vr ? 'Rotate at about ' + n(sp.vr) + ' kt.' : ''}`],
        ['Climb & cruise', 'Set climb and cruise torque and propeller RPM from the power tables; the engine is limited by torque low down and by temperature higher up.'],
        ['Descent', 'Reduce torque gradually; pressurised types need a planned descent rate for cabin comfort (about 500 fpm in the cabin).'],
        ['Landing', `${ap.final ? 'Approach at about ' + ap.final + ' kt with ' + (ap.flaps || 'landing flap') + '. ' : ''}After touchdown bring the power levers into beta or reverse to use the propeller as a brake.`]
      ];
    }
    // light aircraft (single / twin / ultralight)
    const fin = ap.final || (sp.vso ? r0(sp.vso * 1.3) : null);
    L.push(['Before take-off', 'Check mass and balance, fuel for the flight plus reserve, controls free, trim set. Mixture rich (lean for best power at high airfields); flaps 0–10°.']);
    L.push(['Take-off', `Full power, keep straight with rudder${sp.vr ? ', rotate at about ' + n(sp.vr) + ' kt' : ''}${sp.vy ? ', climb at Vy ' + n(sp.vy) + ' kt' : ''}${sp.vx ? ' (Vx ' + n(sp.vx) + ' kt to clear an obstacle)' : ''}.`]);
    if (t.kind === 'twin') L.push(['Engine failure', `Keep control first: never below the red radial${sp.vmca ? ' (Vmca ' + n(sp.vmca) + ' kt)' : ''}. Pitch for the blue line${sp.vyse ? ' (Vyse ' + n(sp.vyse) + ' kt)' : ''}, full power, gear and flaps up, then identify (dead foot, dead engine), verify with the throttle, and feather.`]);
    L.push(['Cruise', `Set cruise power (typically 65–75 %), lean the mixture and trim.${t.cruiseKt ? ' Expect about ' + t.cruiseKt + ' kt true airspeed.' : ''}${sp.vno ? ' Stay out of the yellow arc (above ' + n(sp.vno) + ' kt) in turbulence.' : ''}`]);
    L.push(['Descent', 'Start down about 3 NM per 1000 ft; about 500 fpm is comfortable. Use carburettor heat if fitted.']);
    L.push(['Circuit & landing', `${ap.pattern ? 'Downwind at about ' + ap.pattern + ' kt, ' : ''}${fin ? 'final at about ' + fin + ' kt' : 'final at about 1.3 × the stall speed'}${ap.flaps ? ' with ' + ap.flaps : ''}${sp.vso && !ap.final ? ' (1.3 × Vso)' : ''}. Close the throttle over the threshold, flare and hold the nose off.`]);
    if (sp.vg) L.push(['Engine failure', `Best glide ${n(sp.vg)} kt, choose a field within reach, then trouble checks and a mayday.`]);
    else if (t.kind !== 'twin') L.push(['Engine failure', 'Pitch for best-glide speed, choose a field within reach, then trouble checks and a mayday.']);
    return L;
  }

  // ------------------------------------------------------------------ quiz
  function quizFor(t, sp, p, mtow) {
    const rnd = seeded(t.id + (t.name || ''));
    const qs = [];
    const name = nameOf(t);
    for (const q of (t.quiz || [])) qs.push(shuffleQ(rnd, q));
    const P = X.perf;
    if (p) {
      const ld = P.landingSpeeds(p, p.mlw, null);
      const to = P.takeoffSpeeds(p, p.mtow, null);
      qs.push(numQ(rnd, `About what is the ${ld.name} of the ${name} at maximum landing weight with ${p.policy === 'airbus' ? 'CONF' : 'flaps'} ${ld.flap}?`, ld.vref, kt,
        `${ld.name} = 1.23 × the 1-g stall speed. Here V<sub>S1g</sub> ≈ ${r0(ld.vs1g)} kt, so ${ld.name} ≈ ${r0(ld.vref)} kt. It falls with the square root of weight.`, [0.84, 1.14, 1.27]));
      qs.push(numQ(rnd, `What is the maximum take-off mass of the ${name}?`, p.mtow, kg,
        `MTOW is about ${kg(p.mtow)}. Maximum landing mass is lower (${kg(p.mlw)}) because the landing gear and wing must absorb the touchdown.`, [0.72, 1.22, 1.45]));
      qs.push(shuffleQ(rnd, { q: 'V2, the take-off safety speed, is at least…', a: ['1.05 × the stall speed', '1.13 × the 1-g stall speed', '1.3 × the stall speed', 'the same as VR'], c: 1, why: `CS/FAR 25.107: V2 ≥ 1.13 V<sub>S1g</sub> (and ≥ 1.1 VMCA). For the ${name} at MTOW that gives about ${r0(to.v2)} kt.` }));
    }
    if (sp.vne && t.cat !== 'airliner') qs.push(numQ(rnd, `What is the never-exceed speed (Vne) marked on the ${name}’s airspeed indicator?`, sp.vne, kt, 'Vne is the red line. Structural or flutter damage is possible above it.', [0.8, 1.17, 1.32]));
    if (sp.vso && sp.vfe && t.cat === 'ga') qs.push(shuffleQ(rnd, { q: 'Where does the white arc on the airspeed indicator start?', a: ['At Vs1, the clean stall speed', 'At Vso, the stall speed with landing flap', 'At Vfe', 'At Vx'], c: 1, why: `The white arc spans Vso (${r0(sp.vso)} kt) to Vfe (${r0(sp.vfe)} kt): the flap operating range.` }));
    if ((sp.vs1 || sp.vso) && t.cat !== 'airliner' && t.cat !== 'helicopter') {
      const v = sp.vs1 || sp.vso;
      qs.push(numQ(rnd, `If the stall speed is ${r0(v)} kt at maximum weight, about what is it 20 % lighter?`, v * Math.sqrt(0.8), kt, `Stall speed scales with √(mass): ${r0(v)} × √0.8 = ${r0(v * Math.sqrt(0.8))} kt.`, [0.8, 1.12, 1.25]));
    }
    const w = wakeOf(t, mtow);
    if (w && t.cat !== 'glider') {
      const names = { J: 'Super', H: 'Heavy', M: 'Medium', L: 'Light' };
      const opts = ['Light', 'Medium', 'Heavy', 'Super'];
      qs.push(shuffleQ(rnd, { q: `Which ICAO wake turbulence category is the ${name}?`, a: opts, c: opts.indexOf(names[w]), why: `By maximum take-off mass: Light ≤ 7 t, Medium up to 136 t, Heavy above; the A380 is Super. MTOW ${kg(mtow)} → ${names[w]}.` }));
    }
    if (t.cat === 'helicopter') qs.push(shuffleQ(rnd, { q: 'At about what speed does a helicopter gain effective translational lift?', a: ['5–8 kt', '16–24 kt', '45–55 kt', 'Only above Vy'], c: 1, why: 'Around 16–24 kt the rotor leaves its own downwash and meets clean air, so it suddenly needs less power.' }));
    if (t.cat === 'glider') qs.push(shuffleQ(rnd, { q: 'A glider with a glide ratio of 34 : 1 is at 1 000 m in still air. How far can it glide?', a: ['3.4 km', '34 km', '340 km', '17 km'], c: 1, why: 'Distance = height × L/D = 1 km × 34 = 34 km.' }));
    return qs.slice(0, 6);
  }

  // ------------------------------------------------------------------ page
  function page(t, ctx) {
    const k = X.study.kit(ctx), C = X.calc, P = X.perf;
    const esc = ctx.esc, num = ctx.num;
    const p = profileOf(t) || t.genericProfile || null;
    const ac = ctx.liveMatch ? ctx.ac : null;
    const s = ctx.liveMatch ? ctx.s : null;
    const name = nameOf(t);
    const sp = speedsOf(t, ctx);
    const mtow = p ? p.mtow : pos(t.mtowKg) || (ac && pos(ac.mtow));
    const oew = p ? p.oew : ac && pos(ac.oew);
    const heli = t.cat === 'helicopter';
    const chips = [
      `<span class="chip ${t.cat === 'airliner' ? 'accent' : ''}">${esc(CAT_LABEL[t.cat] || 'Aircraft')}</span>`,
      ...(t.icao || (p ? p.icao : []) || []).slice(0, 4).filter(Boolean).map(c => `<span class="chip plain mono">${esc(c)}</span>`),
      t.first ? `<span class="chip plain">first flight ${t.first}</span>` : '',
      ctx.liveMatch ? '<span class="chip live">loaded in X-Plane now</span>' : ''
    ].join('');

    // ---------------- key numbers
    const rows = [];
    const add = (a, b) => { if (b != null && b !== '') rows.push([a, b]); };
    add('Role', t.family ? t.family : CAT_LABEL[t.cat]);
    add('Engines', t.engines || (ac && ac.engines ? ac.engines + ' × ' + ({ piston: 'piston', turboprop: 'turboprop', jet: 'jet', electric: 'electric motor' }[X.aircraft.engineKind(ac.engType)] || 'engine') : null));
    add('Seats', t.seats);
    if (t.spanM) add(heli ? 'Rotor diameter' : 'Wingspan', num(t.spanM, 1) + ' m');
    if (t.lengthM) add('Length', num(t.lengthM, 1) + ' m');
    if (mtow) add('Maximum take-off mass', kg(mtow));
    if (p) { add('Maximum landing mass', kg(p.mlw)); add('Maximum zero-fuel mass', kg(p.mzfw)); }
    if (oew) add('Empty (operating) mass', kg(oew));
    if (p) add('Fuel capacity', kg(p.maxFuel));
    else if (t.fuelL) add('Fuel capacity', num(t.fuelL) + ' L');
    else if (ac && pos(ac.maxFuel)) add('Fuel capacity', kg(ac.maxFuel));
    if (p && p.wingArea) add('Wing area · wing loading', num(p.wingArea, 1) + ' m² · ' + num(p.mtow / p.wingArea) + ' kg/m²');
    if (p && p.thrustKN > 0) add('Thrust-to-weight at MTOW', num(p.thrustKN * 1000 * p.engines / (p.mtow * 9.80665), 2));
    if (p && p.cruiseMach) add('Typical cruise', 'M' + p.cruiseMach.toFixed(2) + ' (≈ ' + num(C.machToTas(p.cruiseMach, C.isaTempC(36000))) + ' kt TAS at FL360)');
    else if (p && p.cruiseTas) add('Typical cruise', p.cruiseTas + ' kt TAS');
    else if (t.cruiseKt) add('Typical cruise', 'about ' + t.cruiseKt + ' kt TAS');
    if (p) add('Vmo / Mmo', p.vmo + ' kt / M' + p.mmo.toFixed(2));
    else if (t.mmo) add('Mmo', 'M' + t.mmo.toFixed(2));
    const ceil = p ? p.ceilingFt : t.ceilingFt;
    if (ceil) add('Ceiling', num(ceil) + ' ft');
    if (t.rangeNm) add('Range (published, typical load)', 'about ' + num(t.rangeNm) + ' NM');
    const wk = wakeOf(t, mtow);
    if (wk && t.cat !== 'glider') add('Wake category (ICAO)', C.WAKE_NAMES[wk]);
    if (ac && ac.flapDetents > 0) add('Flap detents in X-Plane', ac.flapDetents + (p && p.flapDetents ? ' (' + p.flapDetents.join(' · ') + ')' : ''));
    const spec = `<dl class="spec">${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`;

    let html = k.lead(t.about ? esc(t.about) : `${esc(name)} is not in the library yet, so this page is built from X-Plane’s own aircraft file: the weights and V-speeds the aircraft author entered in Plane Maker.`);
    html += `<div class="chips-row">${chips}</div>`;
    html += k.h('Key numbers') + spec;
    if (t.notes && t.notes.length) html += k.box('Good to know', k.ul(t.notes.map(esc)));

    // ---------------- right now
    if (s) {
      const lines = [];
      if (isNum(s.mass)) lines.push(`Mass now ${kg(s.mass)}${mtow ? ' (' + num(s.mass / mtow * 100) + ' % of MTOW)' : ''}`);
      if (isNum(s.vsTurn)) lines.push(`stall speed at this mass, flap and bank ≈ ${num(s.vsTurn)} kt`);
      if (isNum(s.ias)) lines.push(`indicated airspeed ${num(s.ias)} kt`);
      if (p && isNum(s.mass)) {
        if (s.onGround) { const v = P.takeoffSpeeds(p, s.mass, null); lines.push(`take-off speeds for this mass: V1 ${num(v.v1)} · VR ${num(v.vr)} · V2 ${num(v.v2)} kt (${p.policy === 'airbus' ? 'CONF' : 'flaps'} ${v.flap})`); }
        else { const v = P.landingSpeeds(p, s.mass, null); lines.push(`${v.name} for this mass ${num(v.vref)} kt (${p.policy === 'airbus' ? 'CONF' : 'flaps'} ${v.flap})`); }
      }
      if (lines.length) html += k.box('Right now in X-Plane', k.p(esc(lines.join(' · ')) + '.'), 'xp');
    }

    // ---------------- speeds
    html += k.h('Speeds');
    if (t.cat === 'airliner' && p) {
      const ldM = P.landingSpeeds(p, p.mlw, null), toM = P.takeoffSpeeds(p, p.mtow, null);
      const man = P.maneuverSpeeds(p, 0.8 * p.mtow);
      const clean = p.greenDot ? P.greenDot(0.8 * p.mtow) : man ? man[0].speed : null;
      const climb = p.engine === 'turboprop' ? 210 : 290;
      const marks = [
        { v: ldM.vs1g, label: 'VS1g ' + r0(ldM.vs1g), cls: 'bad' }, { v: ldM.vref, label: ldM.name + ' ' + r0(ldM.vref), cls: 'warn' },
        { v: toM.v1, label: 'V1 ' + r0(toM.v1), cls: 'live' }, { v: toM.vr, label: 'VR ' + r0(toM.vr), cls: 'sel' }, { v: toM.v2, label: 'V2 ' + r0(toM.v2), cls: 'acc' },
        ...(clean ? [{ v: clean, label: (p.greenDot ? 'green dot ' : 'flaps up ') + r0(clean), cls: 'line' }] : []),
        ...(p.vmo > 260 ? [{ v: 250, label: '250 below FL100', cls: 'line' }] : []),
        { v: climb, label: 'climb ' + climb, cls: 'line' }, { v: p.vmo, label: 'Vmo ' + p.vmo, cls: 'bad' }
      ];
      const min = Math.floor(ldM.vs1g * 0.85 / 10) * 10, max = Math.ceil((p.vmo + 25) / 10) * 10;
      html += k.fig(Fg().speedBand({ min, max, marks, bands: [
        { from: min, to: ldM.vs1g, cls: 'fa-bad' }, { from: ldM.vs1g, to: ldM.vref, cls: 'fa-warn' }, { from: ldM.vref, to: p.vmo, cls: 'fa-live' }, { from: p.vmo, to: max, cls: 'fa-bad' }] }),
        `<b>Fig. A1</b> — The ${esc(name)}’s speeds on one scale: stall and ${ldM.name} at maximum landing weight (${p.policy === 'airbus' ? 'CONF' : 'flaps'} ${ldM.flap}), take-off speeds at maximum take-off weight (${p.policy === 'airbus' ? 'CONF' : 'flaps'} ${toM.flap}), and the limits. Computed from the lift equation with the app’s profile.`);
      html += k.fig(Fg().vspeedsWeight(p), `<b>Fig. A2</b> — Take-off and landing speeds grow with the square root of mass. This is why the FMS asks for the weight before it gives you V-speeds.`);
      const tf = p.takeoffFlaps.map(fl => { const v = P.takeoffSpeeds(p, p.mtow, fl.id); return `<tr><td>${esc((p.policy === 'airbus' ? 'CONF ' : 'Flaps ') + fl.id)}${fl.def ? ' <span class="small muted">(usual)</span>' : ''}</td><td class="n">${fl.cl.toFixed(2)}</td><td class="n">${r0(v.vs1g)}</td><td class="n">${r0(v.v2)}</td></tr>`; }).join('');
      const lf = p.landingFlaps.map(fl => { const v = P.landingSpeeds(p, p.mlw, fl.id); return `<tr><td>${esc((p.policy === 'airbus' ? 'CONF ' : 'Flaps ') + fl.id)}${fl.def ? ' <span class="small muted">(usual)</span>' : ''}</td><td class="n">${fl.cl.toFixed(2)}</td><td class="n">${r0(v.vs1g)}</td><td class="n">${r0(v.vref)}</td></tr>`; }).join('');
      html += `<div class="two-tables"><div class="scroll-x"><table class="t"><caption>Take-off flaps at MTOW</caption><thead><tr><th>Setting</th><th class="n">C<sub>Lmax</sub></th><th class="n">V<sub>S1g</sub></th><th class="n">V2</th></tr></thead><tbody>${tf}</tbody></table></div>
        <div class="scroll-x"><table class="t"><caption>Landing flaps at MLW</caption><thead><tr><th>Setting</th><th class="n">C<sub>Lmax</sub></th><th class="n">V<sub>S1g</sub></th><th class="n">${ldM.name}</th></tr></thead><tbody>${lf}</tbody></table></div></div>`;
      html += k.p(`More flap raises C<sub>Lmax</sub>, so the stall speed and every speed built on it fall — at the cost of more drag. Take-off uses little flap for a good climb; landing uses a lot for a slow, steep approach.`);
    } else if (heli) {
      html += k.p(sp.vne ? `Never-exceed speed ${r0(sp.vne)} kt indicated${t.pohNote ? ' (' + esc(t.pohNote) + ')' : ''}. Helicopters have no stall speed in the aeroplane sense — they can hover — but they have a Vne that falls with altitude and weight, because the retreating blade stalls at high speed.` :
        'Helicopters can hover, so there is no stall speed on the airspeed indicator. The limit is Vne, which falls with altitude and weight because the retreating blade stalls at high speed.');
    } else if (sp.vne || sp.vno || sp.vs1 || sp.vso || sp.vmca) {
      const notes = [];
      const extra = [['Vr', sp.vr], ['Vx', sp.vx], ['Vy', sp.vy], ['best glide', sp.vg], ['Va', sp.va]].filter(x => x[1]).map(([a, b]) => a + ' ' + r0(b));
      if (extra.length) notes.push(extra.join(' · ') + ' kt');
      if (!sp.vs1 && !sp.vso) notes.push('Load it in X-Plane to add the white and green arcs.');
      html += k.fig(Fg().asi(Object.assign({}, sp, { needle: s && isNum(s.ias) ? s.ias : null, notes })),
        `<b>Fig. A1</b> — Airspeed indicator of the ${esc(name)} with the certification colour arcs (${sp.sources.join(' and ')} values${s ? '; the orange needle is your IAS right now' : ''}).${t.pohNote ? ' ' + esc(t.pohNote) : ''}`);
      html += k.ul([
        '<b>White arc</b> — from Vso (stall, full flap) to Vfe: where the flaps may be used.',
        '<b>Green arc</b> — from Vs1 (stall, clean) to Vno: the normal operating range.',
        '<b>Yellow arc</b> — Vno to Vne: smooth air only, gently on the controls.',
        '<b>Red line</b> — Vne: never exceed.' + (t.kind === 'twin' ? ' Twins add a red radial at Vmca and a blue line at Vyse.' : '')]);
    } else {
      html += k.p(ctx.liveMatch ? 'X-Plane did not report V-speeds for this aircraft, so there is no airspeed indicator to draw. Its handbook speeds are the ones to learn.'
        : 'Load this aircraft in X-Plane and this section fills in from its aircraft file: the airspeed indicator arcs, stall speeds and a stall-speed chart.');
    }

    // ---------------- stall speed vs weight
    if (!heli) {
      let lines = null, mMin, mMax;
      if (p) {
        mMax = p.mtow; mMin = Math.max(p.oew, dowOf(p) + (p.mzfw - dowOf(p)) * 0.1);
        const f0 = p.takeoffFlaps.find(x => x.def) || p.takeoffFlaps[0];
        const fl = p.landingFlaps[p.landingFlaps.length - 1];
        lines = [
          { name: 'clean', vAtMax: P.stallSpeed(p.mtow, p.wingArea, 1.45), cls: 'sel' },
          { name: (p.policy === 'airbus' ? 'CONF ' : 'flaps ') + f0.id, vAtMax: P.stallSpeed(p.mtow, p.wingArea, f0.cl), cls: 'live' },
          { name: (p.policy === 'airbus' ? 'CONF ' : 'flaps ') + fl.id, vAtMax: P.stallSpeed(p.mtow, p.wingArea, fl.cl), cls: 'acc' }];
      } else if (mtow && (sp.vs1 || sp.vso)) {
        mMax = mtow; mMin = oew ? oew + Math.min(120, mtow * 0.1) : mtow * 0.62;
        lines = [];
        if (sp.vs1) lines.push({ name: 'clean · Vs1', vAtMax: sp.vs1, cls: 'sel' });
        if (sp.vso) lines.push({ name: 'landing flap · Vso', vAtMax: sp.vso, cls: 'acc' });
      }
      if (lines && lines.length && mMax > mMin) {
        const marks = [{ m: mMax, label: 'MTOW' }];
        if (s && isNum(s.mass) && s.mass > mMin && s.mass < mMax * 1.05) marks.push({ m: s.mass, label: 'now' });
        html += k.h('Stall speed and weight') + k.fig(Fg().stallWeight({ mMin, mMax, lines, marks }), `<b>Fig. A${t.cat === 'airliner' ? 3 : 2}</b> — Stall speed of the ${esc(name)} against mass: ${k.m(String.raw`V_S \propto \sqrt{m}`)}. A lighter aircraft stalls — and approaches — slower.`) +
          k.p(`Handbook speeds are quoted at maximum weight. At lighter weights the same wing needs less speed: ${k.m(String.raw`V_2 = V_1\sqrt{m_2/m_1}`)}. See <a href="#study.stall">Stall speed, weight and load factor</a>.`);
      }
    }

    // ---------------- payload-range (airliners)
    if (t.cat === 'airliner' && p && !p.generic) {
      const pr = payloadRange(p);
      const marks = [{ range: pr.a.range, payload: pr.a.payload, label: 'max payload ' + num(pr.a.range) + ' NM' }];
      if (pr.b) marks.push({ range: pr.b.range, payload: pr.b.payload, label: 'full tanks ' + num(pr.b.range) + ' NM' });
      marks.push({ range: pr.c.range, payload: 0, label: 'ferry ' + num(pr.c.range) + ' NM' });
      html += k.h('Payload and range') + k.fig(Fg().payloadRange(pr.pts, marks), `<b>Fig. A4</b> — Payload against range from this app’s fuel model (cruise at FL${Math.round(pr.cruiseFt / 100)}, ${pr.altNm} NM alternate, 30 min final reserve, 5 % contingency). Along the flat top the zero-fuel mass limits; then the take-off mass: every extra tonne of fuel costs a tonne of payload; after the knee the tanks are full.`) +
        k.p(`Maximum payload ${kg(pr.maxPl)} (MZFW − DOW). ${t.rangeNm ? 'The published range of about ' + num(t.rangeNm) + ' NM is with a typical passenger load, which is less than the maximum payload.' : ''} Estimates for simulation.`);
    }

    // ---------------- how to fly
    html += k.h('How to fly it') + `<ol class="howto">${howToFly(t, sp, ctx, p).map(([a, b]) => `<li><b>${esc(a)}.</b> ${b}</li>`).join('')}</ol>`;
    if (p && p.autobrake && p.autobrake.length && t.cat === 'airliner') {
      html += k.box(p.autobrake === X.aircraft.AB.manual ? 'Braking (no autobrake)' : 'Autobrake settings', k.p(p.autobrake.map(a => `<b>${esc(a.id)}</b> ${a.d.toFixed(2)} m/s²`).join(' · ') + '. Autobrake holds a deceleration, not a brake pressure: with more headwind or reverse thrust it simply brakes less.'));
    }

    // ---------------- in X-Plane
    const xp = [];
    if (ac && ac.author) xp.push(`This aircraft file is by ${esc(ac.author)}${ac.tail ? ', tail ' + esc(ac.tail) : ''}.`);
    xp.push(`Weights and fuel: <b>Flight → Flight Configuration → Weight, Balance & Fuel</b>. The app reads the result from ${k.code('sim/flightmodel/weight/m_total')}.`);
    if (t.cat === 'airliner') xp.push('The <a href="#perf">Performance</a> page opens by itself when this aircraft is loaded, with its load sheet, fuel plan and take-off and landing data.');
    xp.push(`The V-speeds on the airspeed indicator come from Plane Maker: ${k.code('sim/aircraft/view/acf_Vso')}, ${k.code('acf_Vs')}, ${k.code('acf_Vfe')}, ${k.code('acf_Vno')}, ${k.code('acf_Vne')}.`);
    if (ac && ac.flapDetents > 0) xp.push(`X-Plane reports the flap handle as 0–1 across ${ac.flapDetents} detent steps (${k.code('sim/cockpit2/controls/flap_handle_deploy_ratio')}); the live page turns that into the detent name.`);
    html += k.box('In X-Plane', k.ul(xp), 'xp');

    // ---------------- links & quiz
    const links = [];
    if (t.cat === 'airliner') links.push(['#perf.takeoff', 'Take-off calculator'], ['#perf.landing', 'Landing calculator'], ['#study.takeoff', 'Study: take-off speeds']);
    else if (heli) links.push(['#calc.altitudes', 'Density altitude'], ['#calc.turn', 'Turn performance']);
    else links.push(['#calc.ga-runway', 'Runway distances'], ['#calc.va', 'Manoeuvring speed'], ['#study.vspeeds', 'Study: V-speeds and the ASI']);
    html += `<div class="tryit">${links.map(([h, l]) => `<a class="btn" href="${h}">${esc(l)} →</a>`).join('')}</div>`;
    html += k.quiz(quizFor(t, sp, p && !p.generic ? p : null, mtow));
    return html;
  }

  X.acStudy = { forAircraft, page, nameOf, profileOf, GROUPS, CAT_LABEL, payloadRange };
})(typeof self !== 'undefined' ? self : this);
