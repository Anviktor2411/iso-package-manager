/* XP Flight Computer — airliner performance models
 * First-principles estimates tuned to typical published figures. For simulation and study only.
 * Masses kg, speeds kt (CAS unless noted), distances m (runway) / NM (route), temperatures °C.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const calc = isNode ? require('./calc.js') : root.XFC.calc;
  const mod = factory(calc);
  if (isNode) module.exports = mod;
  if (root) { root.XFC = root.XFC || {}; root.XFC.perf = mod; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function (C) {
  'use strict';
  const K = C.K;
  const G = K.g0;
  const THRUST_LAPSE_PER_C = 0.0063;   // thrust loss per °C above the flat-rating temperature
  const MAX_FLEX_REDUCTION = 0.25;     // assumed-temperature thrust reduction limit
  const MAX_FLEX_ISA_PLUS = 55;        // typical T_MAX FLEX = ISA + 55 °C
  const SURFACE = {
    dry: { name: 'Dry', mu: 0.40, toF: 1.0 },
    wet: { name: 'Wet', mu: 0.20, toF: 1.10 },
    contaminated: { name: 'Contaminated (snow/slush/water)', mu: 0.12, toF: 1.25 }
  };

  const flapOf = (list, id) => (list || []).find(f => f.id === id) || (list || []).find(f => f.def) || (list || [])[0];

  /** 1-g stall speed (kt EAS≈CAS) from the lift equation: Vs = √(2W / (ρ0·S·CLmax)). */
  function stallSpeed(massKg, wingArea, cl) {
    return Math.sqrt(2 * massKg * G / (K.rho0 * wingArea * cl)) / K.KT;
  }

  /** Field air density from elevation, QNH and temperature. */
  function fieldAir(elevFt, qnhHPa, tempC) {
    const pa = C.pressureAltitude(elevFt, qnhHPa);
    const P = C.isa(pa).P;
    const rho = P / (K.R * (tempC + 273.15));
    return { pa, P, delta: P / K.P0, rho, sigma: rho / K.rho0, isaT: C.isaTempC(pa) };
  }

  // ------------------------------------------------------------------ take-off
  function takeoffSpeeds(p, mass, flapId, opts = {}) {
    const f = flapOf(p.takeoffFlaps, flapId);
    const vs = stallSpeed(mass, p.wingArea, f.cl);
    const vmcg = p.vmcg || 100, vmca = vmcg + 5;
    const v2 = Math.max(1.13 * vs, 1.10 * vmca);
    const vr = Math.max(v2 - (p.vr || 5), 1.05 * vmca);
    let v1 = vr - (opts.wet ? (p.v1Wet ?? 6) : (p.v1Dry ?? 2));
    const vmcgLimited = v1 < vmcg;
    v1 = Math.min(vr, Math.max(v1, vmcg));
    return { flap: f.id, cl: f.cl, vs1g: vs, v1, vr, v2, vmcg, vmcgLimited, vlof: vr + 0.5 * (v2 - vr) };
  }

  /** Relative thrust at a temperature (1 = flat-rated thrust at sea level). */
  function thrustRatio(p, air, thrustTempC) {
    const kink = air.isaT + ((p.flatC ?? 30) - 15);
    const tempF = thrustTempC > kink ? Math.max(0.3, 1 - THRUST_LAPSE_PER_C * (thrustTempC - kink)) : 1;
    return { ratio: air.delta * tempF, tempF, kink };
  }

  /**
   * Take-off field length estimate by similarity scaling from the profile's reference field length
   * (MTOW, sea level, ISA, default take-off flap):  TOFL ∝ W² / (σ · CL · T)
   */
  function takeoffDistance(p, o) {
    const surface = SURFACE[o.surface] || SURFACE.dry;
    const f = flapOf(p.takeoffFlaps, o.flap);
    const fRef = flapOf(p.takeoffFlaps, null);
    const perfTemp = Number.isFinite(o.assumedC) ? o.assumedC : o.oatC;
    const air = fieldAir(o.elevFt, o.qnh, perfTemp);
    const thr = thrustRatio(p, air, perfTemp);
    const spd = takeoffSpeeds(p, o.mass, f.id, { wet: o.surface !== 'dry' });
    const fMass = Math.pow(o.mass / p.mtow, 2);
    const fDensity = 1 / air.sigma;
    const fThrust = 1 / thr.ratio;
    const fFlap = fRef.cl / f.cl;
    const vlofTas = spd.vlof / Math.sqrt(air.sigma);
    const hw = o.headwind || 0;
    const vwEff = hw >= 0 ? 0.5 * hw : 1.5 * hw;          // 50 % headwind / 150 % tailwind (regulatory)
    const fWind = 0.15 + 0.85 * Math.pow(Math.max(0.2, (vlofTas - vwEff) / vlofTas), 2);
    const fSlope = Math.max(0.85, 1 + 0.045 * (o.slopePct || 0));
    const fSurface = surface.toF;
    const tofl = p.toflRef * fMass * fDensity * fThrust * fFlap * fWind * fSlope * fSurface;
    return { tofl, air, thrust: thr, speeds: spd, vlofTas,
             factors: { mass: fMass, density: fDensity, thrust: fThrust, flap: fFlap, wind: fWind, slope: fSlope, surface: fSurface } };
  }

  /** Highest assumed temperature (FLEX) that still fits the runway, within the thrust-reduction limit. */
  function flexTemp(p, o) {
    const toga = takeoffDistance(p, Object.assign({}, o, { assumedC: undefined }));
    const res = { toga, flex: null, tMax: null, reduction: 0, limitedBy: null, allowed: o.surface !== 'contaminated' };
    const airOat = toga.air;
    res.tMax = Math.round(airOat.isaT + MAX_FLEX_ISA_PLUS);
    if (toga.tofl > o.toraM) { res.limitedBy = 'runway too short for full thrust'; return res; }
    if (!res.allowed) { res.limitedBy = 'reduced thrust not allowed on a contaminated runway'; return res; }
    const thrOat = toga.thrust.ratio;
    const start = Math.max(Math.ceil(o.oatC) + 1, Math.ceil(toga.thrust.kink) + 1);
    let best = null;
    for (let t = start; t <= res.tMax; t++) {
      const d = takeoffDistance(p, Object.assign({}, o, { assumedC: t }));
      const red = 1 - d.thrust.ratio / thrOat;
      if (red > MAX_FLEX_REDUCTION) { res.limitedBy = 'maximum 25 % thrust reduction'; break; }
      if (d.tofl > o.toraM) { res.limitedBy = 'runway length'; break; }
      best = { t, d, red };
    }
    if (best) { res.flex = best.t; res.flexDist = best.d; res.reduction = best.red; if (!res.limitedBy) res.limitedBy = 'T MAX FLEX (ISA+55)'; }
    else if (!res.limitedBy) res.limitedBy = 'OAT above flat-rating — no margin for flex';
    return res;
  }

  // ------------------------------------------------------------------- landing
  function landingSpeeds(p, mass, flapId, o = {}) {
    const f = flapOf(p.landingFlaps, flapId);
    const vs = stallSpeed(mass, p.wingArea, f.cl);
    const vref = 1.23 * vs;
    const hw = Math.max(0, o.headwind || 0);
    const gustInc = Math.max(0, (o.gust || 0) - (o.windSpeed || 0));
    let add, rule;
    if (p.policy === 'airbus') {
      add = Math.min(15, Math.max(5, hw / 3));
      rule = 'VAPP = VLS + max(5, ⅓ headwind), max +15 kt';
    } else {
      add = Math.min(20, Math.max(5, hw / 2 + gustInc));
      rule = 'Vapp = Vref + max(5, ½ headwind + gust), max +20 kt';
    }
    return { flap: f.id, cl: f.cl, vs1g: vs, vref, add, vapp: vref + add, rule,
             name: p.policy === 'airbus' ? 'VLS' : 'Vref' };
  }

  /**
   * Landing distance from 50 ft.  ALD = air + transition + braking.  Autobrake holds a target
   * deceleration; reverse thrust only shortens the roll when braking is friction-limited (MAX / manual).
   */
  function landingDistance(p, o) {
    const surface = SURFACE[o.surface] || SURFACE.dry;
    const air = fieldAir(o.elevFt, o.qnh, o.oatC);
    const spd = landingSpeeds(p, o.mass, o.flap, o);
    const tasF = 1 / Math.sqrt(air.sigma);
    const hw = o.headwind || 0;
    const muLimit = surface.mu * G;
    const slopeA = G * (o.slopePct || 0) / 100;                  // uphill (+) helps
    const target = o.decel;                                      // m/s², autobrake target or manual effort
    const frictionLimited = !(target < muLimit);
    const aBrake = (frictionLimited ? muLimit + (o.reverse ? 0.8 : 0) : target) + slopeA;
    const vtd = spd.vapp - 5;
    const gsApp = (spd.vapp * tasF - hw) * K.KT;
    const gsTd = Math.max(5, (vtd * tasF - hw)) * K.KT;
    const airDist = 305 + 1.0 * gsApp;
    const trans = 2 * gsTd;
    const braking = gsTd * gsTd / (2 * Math.max(0.3, aBrake));
    const ald = airDist + trans + braking;
    // Dispatch (certified-style) distance: Vref, max manual braking on dry, 50 % headwind / 150 % tailwind
    const hwReg = hw >= 0 ? 0.5 * hw : 1.5 * hw;
    const gsCert = Math.max(5, ((spd.vref - 3) * tasF - hwReg)) * K.KT;
    const cert = 305 + gsCert + gsCert * gsCert / (2 * (4.4 + slopeA));
    const ldr = cert / 0.6 * (o.surface === 'dry' ? 1 : 1.15);
    return { speeds: spd, air, ald, factored: ald * 1.15, ldr, airDist, trans, braking, aBrake, frictionLimited,
             gsTdKt: gsTd / K.KT, muLimit };
  }

  /** Lowest autobrake setting whose factored distance (ALD × 1.15) fits the landing distance available. */
  function recommendAutobrake(p, o, ldaM) {
    const list = p.autobrake || [];
    const rows = list.map(ab => {
      const d = landingDistance(p, Object.assign({}, o, { decel: ab.d }));
      return { id: ab.id, decel: ab.d, achieved: d.aBrake, ald: d.ald, factored: d.factored, fits: d.factored <= ldaM, frictionLimited: d.frictionLimited };
    });
    const pick = rows.find(r => r.fits) || null;
    return { rows, pick };
  }

  // ------------------------------------------------------------ speeds & rules
  /** Airbus green-dot rule of thumb (A320 family): 2 × mass(t) + 85 kt, +1 kt per 1000 ft above FL200. */
  const greenDot = (massKg, altFt = 0) => 2 * massKg / 1000 + 85 + Math.max(0, (altFt - 20000) / 1000);

  /** Boeing flap manoeuvre speeds from the profile table (Vref of the reference flap + additive). */
  function maneuverSpeeds(p, massKg) {
    if (!p.maneuver) return null;
    const ref = landingSpeeds(p, massKg, p.maneuver.ref).vref;
    const list = Array.isArray(p.maneuver.add) ? p.maneuver.add : Object.entries(p.maneuver.add);
    return list.map(([flap, add]) => ({ flap, speed: ref + add }));
  }

  // ------------------------------------------------------ departure & NADP profile
  const CL_CLEAN = 1.45;          // effective clean CLmax used for the clean manoeuvre speeds
  const ENERGY_SHARE = 0.6;       // share of the spare energy put into speed while accelerating (typical flight-director split)
  const CLB_THRUST = 0.85;        // climb thrust ≈ 85 % of take-off thrust at low altitude
  const MCT_THRUST = 0.92;        // maximum continuous ≈ 92 % of take-off thrust
  const TSFC = 0.037;             // kg of fuel per newton of thrust per hour at take-off power (high-bypass turbofan)
  const machLapse = (p, m) => (p.engine === 'turboprop' ? Math.max(0.3, 1 - 1.7 * m + 0.9 * m * m) : Math.max(0.5, 1 - 0.9 * m + 0.6 * m * m));
  /** Take-off thrust of one engine (N). Profiles without a thrust figure get T/W ≈ 0.3 at MTOW. */
  const engineThrust = p => (p.thrustKN > 0 ? p.thrustKN * 1000 : 0.3 * p.mtow * G / (p.engines || 2));
  /** Drag polar by configuration: stage 0 = take-off flaps, then each retraction step, last = clean.
   *  [CD0 take-off flaps, CD0 clean, k with flaps, k clean] — turboprops have long, efficient wings. */
  function polar(p, stages, stage) {
    const c = p.engine === 'turboprop' ? [0.030, 0.022, 0.034, 0.032] : p.cls === 'widebody' ? [0.028, 0.016, 0.038, 0.038] : [0.030, 0.018, 0.040, 0.040];
    const frac = stages ? Math.min(1, stage / stages) : 1;
    return { cd0: c[0] - (c[0] - c[1]) * frac, k: stage >= stages ? c[3] : c[2] };
  }

  /**
   * Flap clean-up after take-off. Boeing (manoeuvre-speed table): select the next flap as the speed passes
   * the current flap's manoeuvre speed. Airbus: CONF 2/3 → 1 at F speed, 1 → 0 at S speed, then green dot.
   * Others: a generic schedule from the stall speeds.
   */
  function cleanupSpeeds(p, massKg, flapId) {
    const f = flapOf(p.takeoffFlaps, flapId);
    const vsClean = stallSpeed(massKg, p.wingArea, p.engine === 'turboprop' ? 1.6 : CL_CLEAN);
    const tp = p.engine === 'turboprop';
    let steps = [], vClean, cleanName;
    if (p.policy === 'airbus') {
      const first = p.takeoffFlaps.reduce((a, b) => (b.cl < a.cl ? b : a));   // CONF 1+F
      if (f.id !== first.id) steps.push({ at: 1.18 * stallSpeed(massKg, p.wingArea, first.cl), to: '1', label: 'CONF 1', name: 'F speed' });
      steps.push({ at: 1.25 * vsClean, to: '0', label: 'CONF 0', name: 'S speed' });
      vClean = p.greenDot ? greenDot(massKg) : 1.45 * vsClean;
      cleanName = 'green dot';
    } else if (p.maneuver) {
      const man = maneuverSpeeds(p, massKg);                   // ordered UP, 1, 5, 10, 15, 25
      const idx = man.findIndex(m => m.flap === f.id);
      const seq = man.slice(0, idx < 0 ? 1 : idx + 1).reverse().filter((m, i) => i === 0 || !['10', '2'].includes(m.flap));
      for (let i = 0; i < seq.length - 1; i++) {
        const st = { at: seq[i].speed, to: seq[i + 1].flap, label: 'flaps ' + seq[i + 1].flap, name: 'flaps ' + seq[i].flap + ' speed' };
        const last = steps[steps.length - 1];
        if (last && Math.abs(last.at - st.at) < 0.5) { last.to = st.to; last.label = st.label; } else steps.push(st);
      }
      vClean = man[0].speed;
      cleanName = 'flaps-up speed';
    } else {
      const vsTo = stallSpeed(massKg, p.wingArea, f.cl);
      steps.push({ at: Math.max(1.3 * vsTo, 1.13 * vsTo + 15), to: tp ? '0' : 'intermediate', label: tp ? 'flaps up' : 'first flap step', name: 'first retraction' });
      if (!tp) steps.push({ at: 1.25 * vsClean, to: 'UP', label: 'flaps up', name: 'clean-up speed' });
      vClean = (tp ? 1.3 : 1.45) * vsClean;
      cleanName = 'clean minimum speed';
    }
    steps.forEach(s => { s.at = Math.max(s.at, 1.13 * stallSpeed(massKg, p.wingArea, f.cl) + 5); });
    return { flap: f.id, steps, vClean: Math.max(vClean, steps.length ? steps[steps.length - 1].at + 5 : 0), cleanName, vsClean };
  }

  /** The procedures the departure model knows. Heights are above the airport (AAL). */
  const DEPARTURES = {
    nadp1: { name: 'NADP 1 — close-in', thrRedFt: 800, accFt: 3000, hold: null },
    nadp2: { name: 'NADP 2 — distant', thrRedFt: null, accFt: 800, hold: 3000 },
    custom: { name: 'Airline standard', thrRedFt: 1500, accFt: 1500, hold: null },
    eo: { name: 'Engine failure', thrRedFt: null, accFt: 1000, hold: null }
  };

  /**
   * Climb-out after lift-off, flown one second at a time with the energy equation
   *     (T − D) / W = sin γ + (1/g)·dV/dt
   * While holding a speed all the spare energy goes into climbing; while accelerating ENERGY_SHARE of it
   * goes into speed (engine failure: level acceleration). Thrust lapses with Mach, altitude and temperature;
   * drag comes from a simple polar for each flap stage.
   * o: { mass, flap, elevFt, qnh, oatC, thrustPct (take-off thrust, % of TOGA), headwind, proc,
   *      thrRedFt, accFt (AAL), v2Add (10–20 kt), climbKt, toFt (stop height AAL) }
   */
  function departureProfile(p, o) {
    const proc = DEPARTURES[o.proc] ? o.proc : 'nadp2', def = DEPARTURES[proc];
    const eo = proc === 'eo', n = p.engines || 2, nOp = eo ? n - 1 : n;
    const air0 = fieldAir(o.elevFt || 0, o.qnh || 1013.25, Number.isFinite(o.oatC) ? o.oatC : 15);
    const isaDev = (Number.isFinite(o.oatC) ? o.oatC : 15) - air0.isaT;
    const sp = takeoffSpeeds(p, o.mass, o.flap);
    const cu = cleanupSpeeds(p, o.mass, sp.flap);
    const W = o.mass * G, T1 = engineThrust(p);
    const toRating = Math.min(1, Math.max(0.5, (o.thrustPct || 100) / 100));
    const clbRating = Math.min(CLB_THRUST, toRating);
    const v2Add = eo ? 0 : Math.min(20, Math.max(10, Number.isFinite(o.v2Add) ? o.v2Add : 15));
    const vInit = sp.v2 + v2Add;
    const climbKt = o.climbKt || (p.engine === 'turboprop' ? 180 : 250);
    const thrRedFt = def.thrRedFt == null ? null : Math.max(400, Number.isFinite(o.thrRedFt) ? o.thrRedFt : def.thrRedFt);
    const accFt = proc === 'nadp1' ? 3000 : Math.max(400, Number.isFinite(o.accFt) ? o.accFt : def.accFt);   // no configuration change below 400 ft
    const toFt = o.toFt || (eo ? 1500 : 4000);
    const hw = o.headwind || 0;
    const stages = cu.steps.length;
    // ground run + air to 35 ft (all engines), from the field-length model without its 15 % factor
    const tod = takeoffDistance(p, { mass: o.mass, flap: sp.flap, elevFt: o.elevFt || 0, qnh: o.qnh || 1013.25, oatC: Number.isFinite(o.oatC) ? o.oatC : 15, headwind: hw, surface: 'dry' });
    let x = tod.tofl / 1.15 / toRating, h = 35, v = eo ? sp.v2 : Math.min(vInit, sp.v2 + 10), t = 0;
    let stage = 0, thr = 'TO', accel = false, fuel = 0, pts = [], events = [], cannotClimb = false;
    const ev = (key, label) => events.push({ key, label, t, x: x / K.NM, h, v });
    const seg = {};                                              // gradients at the certification points
    for (let i = 0; i < 1800; i++) {
      const pa = air0.pa + h;
      const is = C.isa(pa), T = is.T + isaDev, rho = is.P / (K.R * T), sig = rho / K.rho0;
      const veas = v * K.KT, vtas = veas / Math.sqrt(sig), mach = vtas / Math.sqrt(K.gamma * K.R * T);
      const kink = is.Tc + ((p.flatC ?? 30) - 15);
      const tempF = T - 273.15 > kink ? Math.max(0.3, 1 - THRUST_LAPSE_PER_C * (T - 273.15 - kink)) : 1;
      const rating = thr === 'TO' ? toRating : thr === 'MCT' ? MCT_THRUST : clbRating;
      const thrust = nOp * T1 * rating * machLapse(p, mach) * Math.pow(is.delta, 0.8) * tempF;
      const q = 0.5 * K.rho0 * veas * veas, cl = W / (q * p.wingArea);
      const pol = polar(p, stages, stage);
      const gear = t < 11 ? 0.015 : 0, asym = eo ? 0.004 : 0;
      const drag = q * p.wingArea * (pol.cd0 + gear + asym + pol.k * cl * cl);
      const ps = (thrust - drag) * vtas / W;                    // specific excess power, m/s
      // targets
      let vt;
      if (!accel) vt = eo ? sp.v2 : vInit;
      else if (def.hold && h < def.hold) vt = cu.vClean + 10;    // NADP 2: VZF + 10 kt up to 3000 ft
      else vt = eo ? cu.vClean : Math.max(climbKt, cu.vClean + 10);   // heavy jets may need more than 250 kt clean
      const speeding = v < vt - 0.3;
      const share = !speeding ? 0 : eo && accel ? 1 : accel ? ENERGY_SHARE : 0.5;
      const grad = (thrust - drag) / W;                         // climb gradient if all went into climbing
      const snap = () => ({ T: thrust, D: drag, W, v, tas: vtas / K.KT, grad });
      if (i === 0) seg.first = grad;
      if (!seg.second && t >= 11 && !accel) { seg.second = grad; seg.secondAt = snap(); }
      if (!seg.final && eo && thr === 'MCT') { seg.final = grad; seg.finalAt = snap(); }
      if (!seg.aeo && !eo && t >= 11) { seg.aeo = grad; seg.aeoAt = snap(); }
      if (i % 2 === 0) pts.push({ t, x: x / K.NM, h, v, thr, stage, vs: (1 - share) * ps / K.FT * 60, grad });
      if (h >= toFt && !speeding) break;
      // integrate one second
      const dt = 1;
      if (ps <= 0) { cannotClimb = true; ev('noclimb', accel ? 'cannot accelerate' : 'cannot climb'); break; }
      h += (1 - share) * ps * dt / K.FT;
      v = Math.min(vt, v + share * ps * G / vtas * dt * Math.sqrt(sig) / K.KT);
      x += Math.max(0, vtas - hw * K.KT) * dt;
      fuel += thrust * TSFC / 3600 * dt;
      t += dt;
      // events
      if (thr === 'TO' && !eo && thrRedFt != null && h >= thrRedFt) { thr = 'CLB'; ev('thrRed', 'thrust reduction'); }
      if (!accel && h >= accFt) { accel = true; ev('acc', eo ? 'engine-out acceleration' : 'acceleration'); }
      if (accel && stage < stages && v >= cu.steps[stage].at) {
        if (proc === 'nadp2' && stage === 0 && thr === 'TO') { thr = 'CLB'; ev('thrRed', 'thrust reduction'); }
        ev('flap', cu.steps[stage].label);
        stage++;
        if (stage === stages) ev('clean', 'clean');
      }
      if (eo && stage >= stages && thr === 'TO' && v >= cu.vClean - 0.5) { thr = 'MCT'; ev('mct', 'maximum continuous thrust'); }
      if (!events.some(e => e.key === 'h3000') && h >= 3000) ev('h3000', '3000 ft');
    }
    const at = xNm => { // height and speed over a point on the ground
      for (let i = 1; i < pts.length; i++) if (pts[i].x >= xNm) {
        const a = pts[i - 1], b = pts[i], f = (xNm - a.x) / Math.max(1e-9, b.x - a.x);
        return { h: a.h + f * (b.h - a.h), v: a.v + f * (b.v - a.v), thr: b.thr, stage: b.stage };
      }
      return null;
    };
    const minGrad = { first: [0, 0, 0, 0.003, 0.005][n] ?? 0, second: [0, 0, 0.024, 0.027, 0.030][n] ?? 0.024, final: [0, 0, 0.012, 0.015, 0.017][n] ?? 0.012 };
    const netCut = [0, 0, 0.008, 0.009, 0.010][n] ?? 0.008;
    return { proc, name: def.name, eo, speeds: sp, cleanup: cu, vInit, v2Add, climbKt, thrRedFt, accFt, holdFt: def.hold, toFt,
             elevFt: o.elevFt || 0, pts, events, fuel, time: t, groundNm: tod.tofl / 1.15 / toRating / K.NM, at,
             gradients: seg, minGrad, netCut, cannotClimb, thrustPct: toRating * 100, engines: n };
  }

  // ---------------------------------------------------------------------- fuel
  /** Cruise TAS: the planned Mach, but never faster than the cruise CAS (≈290 kt for jets) at lower levels. */
  function cruiseTas(p, altFt, isaDev, mach, tasKt) {
    if (Number.isFinite(tasKt) && tasKt > 0) return tasKt;
    const m = Number.isFinite(mach) && mach > 0 ? mach : p.cruiseMach;
    const oat = C.isaTempC(altFt) + (isaDev || 0);
    if (m) {
      const byMach = C.machToTas(m, oat);
      const byCas = C.casToTas(p.cruiseCas || 290, altFt, oat).tas;
      return Math.min(byMach, byCas);
    }
    return p.cruiseTas || 250;
  }

  function sector(p, o) {
    const tp = p.engine === 'turboprop';
    const roc = o.rocFpm || (tp ? 1300 : 2000);
    const climbF = tp ? 1.35 : 1.45, descF = 0.35;
    let alt = o.altFt;
    const build = altFt => {
      const tas = cruiseTas(p, altFt, o.isaDev, o.mach, o.tas);
      const cTime = altFt / roc;                                // min
      const cDist = cTime / 60 * (0.75 * tas + o.wind);
      const dDist = altFt / 1000 * 3;
      const dTime = dDist / (0.8 * tas + o.wind) * 60;
      return { tas, cTime, cDist, dDist, dTime };
    };
    let b = build(alt), reduced = false;
    for (let i = 0; i < 12 && b.cDist + b.dDist > o.distNm * 0.95; i++) {
      alt = Math.max(3000, Math.round(alt * 0.8 / 1000) * 1000);
      b = build(alt); reduced = true;
      if (alt === 3000) break;
    }
    const crDist = Math.max(0, o.distNm - b.cDist - b.dDist);
    const gs = b.tas + o.wind;
    const crTime = crDist / gs * 60;
    const fClimb = b.cTime / 60 * o.ff * climbF;
    const fCruise = crTime / 60 * o.ff;
    const fDesc = b.dTime / 60 * o.ff * descF;
    const fAppr = 5 / 60 * o.ffHold;                            // approach & landing allowance
    const time = b.cTime + crTime + b.dTime + 5;
    return { altFt: alt, reduced, tas: b.tas, gs,
             climb: { time: b.cTime, dist: b.cDist, fuel: fClimb },
             cruise: { time: crTime, dist: crDist, fuel: fCruise },
             descent: { time: b.dTime, dist: b.dDist, fuel: fDesc },
             approach: { time: 5, fuel: fAppr },
             time, fuel: fClimb + fCruise + fDesc + fAppr };
  }

  /** Fuel plan (EASA/ICAO structure): taxi + trip + contingency + alternate + final reserve + extra. */
  function fuelPlan(p, o) {
    const ff = o.ffCruise || p.ffCruise, ffHold = o.ffHold || p.ffHold;
    const trip = sector(p, { distNm: o.distNm, altFt: o.cruiseFt, wind: o.windKt || 0, mach: o.mach, tas: o.tas, isaDev: o.isaDev, ff, ffHold });
    const contPct = o.contPct ?? 5;
    const contingency = Math.max(trip.fuel * contPct / 100, 5 / 60 * ffHold);
    const alternate = o.altNm > 0
      ? sector(p, { distNm: o.altNm, altFt: Math.min(o.altAltFt || 20000, o.cruiseFt), wind: 0, mach: o.mach, tas: o.tas, isaDev: o.isaDev, ff, ffHold })
      : null;
    if (alternate) {                                            // go-around and climb-out at destination
      alternate.missed = 3 / 60 * ff * (p.engine === 'turboprop' ? 1.35 : 1.45);
      alternate.fuel += alternate.missed;
      alternate.time += 3;
    }
    const finalReserve = (o.finalResMin ?? 30) / 60 * ffHold;
    const extra = o.extraKg || 0;
    const taxi = o.taxiKg ?? p.taxiKg;
    const takeoffFuel = trip.fuel + contingency + (alternate ? alternate.fuel : 0) + finalReserve + extra;
    const block = takeoffFuel + taxi;
    return { trip, contingency, alternate, finalReserve, extra, taxi, takeoffFuel, block,
             landingFuel: takeoffFuel - trip.fuel, ff, ffHold, overCapacity: block > p.maxFuel };
  }

  // ---------------------------------------------------------------- load sheet
  function loadsheet(p, o) {
    const dow = o.oew + (o.crewKg || 0);
    const paxMass = (o.pax || 0) * (o.paxKg || 84);
    const bagMass = (o.pax || 0) * (o.bagKg || 0);
    const payload = paxMass + bagMass + (o.cargoKg || 0);
    const zfw = dow + payload;
    const tow = zfw + o.takeoffFuel;
    const lw = tow - o.tripKg;
    const lims = [
      { key: 'MTOW', value: p.mtow },
      { key: 'MZFW + take-off fuel', value: p.mzfw + o.takeoffFuel },
      { key: 'MLW + trip fuel', value: p.mlw + o.tripKg }
    ];
    const lim = lims.reduce((a, b) => (b.value < a.value ? b : a));
    return { dow, paxMass, bagMass, payload, zfw, tow, lw, maxTow: lim.value, limitedBy: lim.key,
             underload: lim.value - tow,
             checks: { zfw: zfw <= p.mzfw, tow: tow <= p.mtow, lw: lw <= p.mlw, fuel: o.takeoffFuel + (o.taxiKg || 0) <= p.maxFuel } };
  }

  return { SURFACE, THRUST_LAPSE_PER_C, MAX_FLEX_REDUCTION, MAX_FLEX_ISA_PLUS, stallSpeed, fieldAir, takeoffSpeeds, thrustRatio,
           takeoffDistance, flexTemp, landingSpeeds, landingDistance, recommendAutobrake, greenDot, maneuverSpeeds,
           cleanupSpeeds, departureProfile, DEPARTURES, ENERGY_SHARE, CLB_THRUST,
           cruiseTas, sector, fuelPlan, loadsheet, flapOf };
});
