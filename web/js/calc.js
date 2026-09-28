/* XP Flight Computer — calculation core
 * Pure functions, no DOM. Works in the browser (window.XFC.calc) and in Node (require).
 * Canonical units unless a name says otherwise: knots, feet, nautical miles, hPa, °C, kg, litres, degrees.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (root) { root.XFC = root.XFC || {}; root.XFC.calc = mod; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  const K = {
    g0: 9.80665,            // standard gravity, m/s²
    R: 287.05287,           // specific gas constant of dry air, J/(kg·K)
    gamma: 1.4,             // ratio of specific heats
    T0: 288.15,             // ISA sea-level temperature, K
    P0: 101325,             // ISA sea-level pressure, Pa
    rho0: 1.225,            // ISA sea-level density, kg/m³
    L: 0.0065,              // tropospheric lapse rate, K/m
    FT: 0.3048,             // m per ft
    NM: 1852,               // m per NM
    KT: 1852 / 3600,        // m/s per kt
    LB: 0.45359237,         // kg per lb
    INHG: 33.8638866667,    // hPa per inHg
    USG: 3.785411784,       // L per US gallon
    EARTH_R_NM: 3440.065,   // mean Earth radius, NM
    FT_PER_NM: 1852 / 0.3048
  };
  K.a0 = Math.sqrt(K.gamma * K.R * K.T0);   // 340.294 m/s
  K.a0kt = K.a0 / K.KT;                     // 661.479 kt
  const EXP = K.g0 / (K.R * K.L);           // 5.25588
  const T11 = 216.65, H11 = 11000, H20 = 20000, H32 = 32000;
  const P11 = K.P0 * Math.pow(T11 / K.T0, EXP);                    // 22 632 Pa
  const P20 = P11 * Math.exp(-K.g0 * (H20 - H11) / (K.R * T11));   // 5 474.9 Pa
  const L3 = 0.001;                                                // K/m, 20–32 km (warming)

  // ------------------------------------------------------------------ helpers
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const norm360 = a => { a = a % 360; return a < 0 ? a + 360 : a; };
  const norm180 = a => { a = norm360(a); return a > 180 ? a - 360 : a; };
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const isNum = x => typeof x === 'number' && isFinite(x);

  const units = {
    ftToM: f => f * K.FT, mToFt: m => m / K.FT,
    ktToMs: k => k * K.KT, msToKt: m => m / K.KT, ktToKmh: k => k * 1.852, kmhToKt: k => k / 1.852,
    ktToMph: k => k * 1.852 / 1.609344, mphToKt: m => m * 1.609344 / 1.852,
    nmToKm: n => n * 1.852, kmToNm: k => k / 1.852, nmToSm: n => n * 1.852 / 1.609344, smToNm: s => s * 1.609344 / 1.852,
    hPaToInHg: h => h / K.INHG, inHgToHPa: i => i * K.INHG, paToHPa: p => p / 100,
    cToF: c => c * 9 / 5 + 32, fToC: f => (f - 32) * 5 / 9, cToK: c => c + 273.15, kToC: k => k - 273.15,
    kgToLb: k => k / K.LB, lbToKg: l => l * K.LB,
    lToUsg: l => l / K.USG, usgToL: g => g * K.USG,
    mpsToFpm: m => m / K.FT * 60, fpmToMps: f => f * K.FT / 60
  };

  // ------------------------------------------------------ ISA atmosphere (0–32 km)
  /** ISA properties at geopotential altitude h (metres). */
  function isaM(h) {
    let T, P;
    if (h <= H11) { T = K.T0 - K.L * h; P = K.P0 * Math.pow(T / K.T0, EXP); }
    else if (h <= H20) { T = T11; P = P11 * Math.exp(-K.g0 * (h - H11) / (K.R * T11)); }
    else { T = T11 + L3 * (h - H20); P = P20 * Math.pow(T / T11, -K.g0 / (K.R * L3)); }
    const rho = P / (K.R * T);
    const a = Math.sqrt(K.gamma * K.R * T);
    return { h, T, Tc: T - 273.15, P, hPa: P / 100, rho, a, akt: a / K.KT,
             theta: T / K.T0, delta: P / K.P0, sigma: rho / K.rho0 };
  }
  /** ISA properties at pressure altitude in feet. */
  const isa = ft => { const r = isaM(ft * K.FT); r.ft = ft; return r; };
  const isaTempC = ft => isa(ft).Tc;

  /** Pressure altitude (m) for a static pressure in Pa — inverse ISA. */
  function pressureAltM(P) {
    if (P >= P11) return (K.T0 / K.L) * (1 - Math.pow(P / K.P0, 1 / EXP));
    if (P >= P20) return H11 + (K.R * T11 / K.g0) * Math.log(P11 / P);
    const T = T11 * Math.pow(P / P20, -(K.R * L3) / K.g0);
    return H20 + (T - T11) / L3;
  }
  /** Pressure altitude (ft) for a pressure in hPa. */
  const pressureAltFt = hPa => pressureAltM(hPa * 100) / K.FT;

  /** Pressure altitude from an altimeter reading with a given setting (QNH / altimeter setting). */
  function pressureAltitude(indicatedFt, settingHPa) {
    return indicatedFt + pressureAltFt(settingHPa);
  }

  /** ISA altitude (m) at which ISA density equals rho — bisection, valid −2 km…32 km. */
  function densityAltM(rho) {
    let lo = -2000, hi = H32;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (isaM(mid).rho > rho) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  /** Density altitude (ft) from pressure altitude (ft) and outside air temperature (°C). */
  function densityAltitude(paFt, oatC) {
    const P = isa(paFt).P;
    const rho = P / (K.R * (oatC + 273.15));
    const exact = densityAltM(rho) / K.FT;
    const isaDev = oatC - isaTempC(paFt);
    return { ft: exact, rho, sigma: rho / K.rho0, isaDev, approxFt: paFt + 118.8 * isaDev };
  }

  // ------------------------------------------------------------------ airspeed
  /** Impact pressure (Pa) for a calibrated airspeed (kt), subsonic. */
  const qcFromCas = cas => K.P0 * (Math.pow(1 + 0.2 * Math.pow(cas / K.a0kt, 2), 3.5) - 1);
  const casFromQc = qc => K.a0kt * Math.sqrt(5 * (Math.pow(qc / K.P0 + 1, 2 / 7) - 1));
  const machFromQcP = (qc, P) => Math.sqrt(5 * (Math.pow(qc / P + 1, 2 / 7) - 1));
  const qcFromMachP = (M, P) => P * (Math.pow(1 + 0.2 * M * M, 3.5) - 1);

  function casToMach(casKt, paFt) { return machFromQcP(qcFromCas(casKt), isa(paFt).P); }
  function machToCas(M, paFt) { return casFromQc(qcFromMachP(M, isa(paFt).P)); }
  function speedOfSoundKt(oatC) { return Math.sqrt(K.gamma * K.R * (oatC + 273.15)) / K.KT; }

  /** CAS → Mach, TAS, EAS. Temperature only affects TAS (through the speed of sound). */
  function casToTas(casKt, paFt, oatC) {
    const P = isa(paFt).P;
    const qc = qcFromCas(casKt);
    const mach = machFromQcP(qc, P);
    const a = speedOfSoundKt(oatC);
    const tas = mach * a;
    const eas = mach * K.a0kt * Math.sqrt(P / K.P0);
    return { cas: casKt, mach, tas, eas, a, qc, P, supersonic: mach >= 1 };
  }
  /** TAS → CAS, Mach, EAS. */
  function tasToCas(tasKt, paFt, oatC) {
    const a = speedOfSoundKt(oatC);
    const mach = tasKt / a;
    const P = isa(paFt).P;
    const qc = qcFromMachP(mach, P);
    return { tas: tasKt, mach, cas: casFromQc(qc), eas: mach * K.a0kt * Math.sqrt(P / K.P0), a, qc, P, supersonic: mach >= 1 };
  }
  const machToTas = (M, oatC) => M * speedOfSoundKt(oatC);
  const tasToMach = (tas, oatC) => tas / speedOfSoundKt(oatC);
  /** Total air temperature from static (SAT) — recovery factor r (≈1 for TAT probes). */
  const tatFromSat = (satC, M, r = 1) => (satC + 273.15) * (1 + 0.2 * r * M * M) - 273.15;
  const satFromTat = (tatC, M, r = 1) => (tatC + 273.15) / (1 + 0.2 * r * M * M) - 273.15;

  /** Crossover altitude (ft) where a CAS and a Mach number give the same TAS (ISA pressure only). */
  function crossoverAltitude(casKt, mach) {
    const P = qcFromCas(casKt) / (Math.pow(1 + 0.2 * mach * mach, 3.5) - 1);
    return { ft: pressureAltM(P) / K.FT, P };
  }

  // ---------------------------------------------------------------------- wind
  /** Heading and ground speed to make good a course. windFrom is the direction the wind blows FROM. */
  function windTriangle({ tas, course, windFrom, windSpeed }) {
    const rel = rad(windFrom - course);
    const s = windSpeed * Math.sin(rel) / tas;
    const headwind = windSpeed * Math.cos(rel);
    const crosswind = windSpeed * Math.sin(rel);  // + = from the right
    if (!(tas > 0) || Math.abs(s) > 1) return { possible: false, headwind, crosswind };
    const wca = deg(Math.asin(s));
    const gs = tas * Math.cos(rad(wca)) - headwind;
    return { possible: gs > 0, wca, heading: norm360(course + wca), gs, headwind, crosswind,
             timeFactor: tas / gs };
  }
  /** Wind from heading/TAS (air vector) and track/GS (ground vector). */
  function findWind({ tas, heading, gs, track }) {
    const aN = tas * Math.cos(rad(heading)), aE = tas * Math.sin(rad(heading));
    const gN = gs * Math.cos(rad(track)), gE = gs * Math.sin(rad(track));
    const wN = gN - aN, wE = gE - aE;                 // vector the air mass moves TO
    const speed = Math.hypot(wN, wE);
    return { windFrom: speed < 1e-9 ? 0 : norm360(deg(Math.atan2(wE, wN)) + 180), windSpeed: speed,
             drift: norm180(track - heading), wN, wE };
  }
  /** Head/crosswind components relative to a runway or heading. + head = headwind, + cross = from right. */
  function windComponents(windFrom, windSpeed, refHeading, gust) {
    const ang = norm180(windFrom - refHeading);
    const head = windSpeed * Math.cos(rad(ang));
    const cross = windSpeed * Math.sin(rad(ang));
    const out = { angle: ang, head, cross, side: cross >= 0 ? 'right' : 'left' };
    if (isNum(gust) && gust > windSpeed) {
      out.gustHead = gust * Math.cos(rad(ang));
      out.gustCross = gust * Math.sin(rad(ang));
    }
    return out;
  }

  // ------------------------------------------------------ time, speed, distance
  function tsd({ distance, speed, timeMin }) {
    if (isNum(distance) && isNum(speed) && !isNum(timeMin)) return { distance, speed, timeMin: distance / speed * 60 };
    if (isNum(distance) && isNum(timeMin) && !isNum(speed)) return { distance, timeMin, speed: distance / (timeMin / 60) };
    if (isNum(speed) && isNum(timeMin) && !isNum(distance)) return { speed, timeMin, distance: speed * timeMin / 60 };
    return null;
  }

  // ------------------------------------------------------------------ vertical
  const FTNM = K.FT_PER_NM;
  /** Vertical speed (fpm) for a flight-path angle at a ground speed. */
  const vsForAngle = (gs, angleDeg) => gs * FTNM / 60 * Math.tan(rad(angleDeg));
  /** Flight-path angle (deg) from VS (fpm) and GS (kt). */
  const angleFromVs = (vs, gs) => deg(Math.atan2(vs, gs * FTNM / 60));

  /** Descent planning. Give angleDeg OR vsFpm. decelNm is extra distance for slowing down. */
  function descent({ fromFt, toFt, gs, angleDeg, vsFpm, decelNm = 0 }) {
    const dh = fromFt - toFt;
    let tanG;
    if (isNum(angleDeg)) tanG = Math.tan(rad(angleDeg));
    else tanG = vsFpm / (gs * FTNM / 60);
    const pathNm = dh / (FTNM * tanG);
    const vs = gs * FTNM / 60 * tanG;
    return { dh, pathNm, distNm: pathNm + (decelNm || 0), vs, timeMin: dh / vs,
             angle: deg(Math.atan(tanG)), rule3to1Nm: dh / 1000 * 3, ftPerNm: FTNM * tanG };
  }
  /** Climb gradient conversions. */
  function climbGradient({ percent, ftPerNm, gs }) {
    const fpn = isNum(ftPerNm) ? ftPerNm : percent / 100 * FTNM;
    const pct = fpn / FTNM * 100;
    return { percent: pct, ftPerNm: fpn, rocFpm: isNum(gs) ? fpn * gs / 60 : NaN, angle: deg(Math.atan(pct / 100)) };
  }
  /** Glide distance. */
  function glide({ heightFt, ld, tas, gs }) {
    const still = heightFt * ld / FTNM;
    const windFactor = (isNum(tas) && isNum(gs) && tas > 0) ? gs / tas : 1;
    return { stillAirNm: still, distNm: still * windFactor, angle: deg(Math.atan(1 / ld)), windFactor,
             sinkFpm: isNum(tas) ? tas * FTNM / 60 / ld : NaN };
  }

  // --------------------------------------------------------------------- turns
  function turn({ tas, bank }) {
    const v = tas * K.KT, phi = rad(bank);
    const n = 1 / Math.cos(phi);
    const r = v * v / (K.g0 * Math.tan(phi));
    const w = K.g0 * Math.tan(phi) / v;
    return { n, radiusM: r, radiusFt: r / K.FT, radiusNm: r / K.NM, rateDps: deg(w),
             time360s: 360 / deg(w), stallFactor: Math.sqrt(n) };
  }
  const bankForRate = (tas, rateDps = 3) => deg(Math.atan(rad(rateDps) * tas * K.KT / K.g0));

  // ---------------------------------------------------------------- navigation
  function greatCircle(lat1, lon1, lat2, lon2) {
    const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1), dp = p2 - p1;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const brg = (x1, y1, x2, y2, d) => deg(Math.atan2(Math.sin(d) * Math.cos(y2),
      Math.cos(y1) * Math.sin(y2) - Math.sin(y1) * Math.cos(y2) * Math.cos(d)));
    const initial = norm360(brg(lon1, p1, lon2, p2, dl));
    const final = norm360(brg(lon2, p2, lon1, p1, -dl) + 180);
    return { distNm: K.EARTH_R_NM * c, distKm: K.EARTH_R_NM * c * 1.852, initial, final, centralAngle: deg(c) };
  }
  /** 1-in-60 rule, plus the exact trigonometric answer. */
  function oneInSixty({ distFlown, offTrack, distRemaining }) {
    const te = offTrack * 60 / distFlown, ca = offTrack * 60 / distRemaining;
    const teX = deg(Math.atan(offTrack / distFlown)), caX = deg(Math.atan(offTrack / distRemaining));
    return { trackError: te, closing: ca, total: te + ca, trackErrorExact: teX, closingExact: caX, totalExact: teX + caX };
  }

  // ------------------------------------------------------------------- holding
  /** Holding entry from the aircraft heading on arrival at the fix (ICAO/FAA sectors, ±5° flexibility). */
  function holdingEntry({ inbound, heading, turn: dir = 'R' }) {
    const diff = norm360(heading - inbound);
    let entry;
    if (dir === 'R') {
      if (diff >= 110 && diff <= 180) entry = 'teardrop';
      else if (diff > 180 && diff <= 290) entry = 'parallel';
      else entry = 'direct';
    } else {
      if (diff >= 180 && diff <= 250) entry = 'teardrop';
      else if (diff >= 70 && diff < 180) entry = 'parallel';
      else entry = 'direct';
    }
    const bounds = dir === 'R' ? [110, 180, 290] : [70, 180, 250];
    const nearBoundary = bounds.some(b => Math.abs(norm180(diff - b)) <= 5);
    const outbound = norm360(inbound + 180);
    return { entry, diff, nearBoundary, outbound, teardropHeading: norm360(outbound + (dir === 'R' ? -30 : 30)) };
  }
  /** Maximum holding speeds (KIAS) for ICAO and FAA, and leg time. */
  function holdingSpeeds(altFt) {
    let icao;
    if (altFt <= 14000) icao = '230 KIAS';
    else if (altFt <= 20000) icao = '240 KIAS';
    else if (altFt <= 34000) icao = '265 KIAS';
    else icao = 'M0.83';
    let faa;
    if (altFt <= 6000) faa = '200 KIAS';
    else if (altFt <= 14000) faa = '230 KIAS';
    else faa = '265 KIAS';
    return { icao, faa, legMin: altFt <= 14000 ? 1 : 1.5 };
  }

  // ----------------------------------------------------------------- altimetry
  /**
   * True height above a station from indicated height, assuming the ISA deviation stays constant with height.
   * dhG = dhP + (dT/λ)·ln(1 + λ·dhP/(T0 + λ·hStation)),  λ = −0.0065 K/m  (hypsometric equation).
   */
  function trueHeight(indicatedAboveStationFt, isaDevC, stationFt = 0) {
    const lam = -K.L, dhP = indicatedAboveStationFt * K.FT, base = K.T0 + lam * stationFt * K.FT;
    const dhG = dhP + (isaDevC / lam) * Math.log(1 + lam * dhP / base);
    return dhG / K.FT;
  }
  /**
   * ICAO cold-temperature correction to ADD to a published height/altitude.
   * Accurate method (Doc 8168): solve the hypsometric equation for the pressure height that gives the
   * required true height. Also returns the simplified PANS-OPS formula and the 4 %/10 °C rule of thumb.
   */
  function coldTempCorrection({ heightFt, aerodromeTempC, aerodromeElevFt }) {
    const hAd = aerodromeElevFt * K.FT, H = heightFt * K.FT;
    const isaAd = K.T0 - K.L * hAd;
    const dT = aerodromeTempC + 273.15 - isaAd;
    const lam = -K.L, base = K.T0 + lam * hAd;
    let x = H;
    for (let i = 0; i < 30; i++) {
      const f = x + (dT / lam) * Math.log(1 + lam * x / base) - H;
      const fp = 1 + dT / (base + lam * x);
      const nx = x - f / fp;
      if (Math.abs(nx - x) < 1e-7) { x = nx; break; }
      x = nx;
    }
    const accurateFt = (x - H) / K.FT;
    const t0 = aerodromeTempC + K.L * hAd;                     // aerodrome temp reduced to sea level
    const simplifiedM = H * (15 - t0) / (273 + t0 - 0.5 * K.L * (H + hAd));
    return { isaDev: dT, correctionFt: accurateFt, simplifiedFt: simplifiedM / K.FT,
             ruleOfThumbFt: heightFt * 0.04 * (-dT / 10), correctedHeightFt: heightFt + accurateFt };
  }
  /** Visible (geometric) and radio horizon, NM, from height in ft. */
  const horizon = hFt => ({ geometricNm: 1.06 * Math.sqrt(hFt), visualNm: 1.17 * Math.sqrt(hFt), radioNm: 1.23 * Math.sqrt(hFt) });

  // ---------------------------------------------------------------------- fuel
  const FUELS = {
    jet: { name: 'Jet A / Jet A-1', kgPerL: 0.80 },
    avgas: { name: 'AvGas 100LL', kgPerL: 0.72 },
    mogas: { name: 'MoGas (car fuel)', kgPerL: 0.74 }
  };
  function fuelBurn({ fuelKg, flowKgH, gs }) {
    const endurH = fuelKg / flowKgH;
    return { enduranceH: endurH, enduranceMin: endurH * 60, rangeNm: isNum(gs) ? endurH * gs : NaN,
             kgPerNm: isNum(gs) && gs > 0 ? flowKgH / gs : NaN };
  }

  // ------------------------------------------------------------ mass & balance
  /** stations: [{name, mass, arm}] (arm in any consistent unit). mac: {lemac, length} optional. */
  function massBalance(stations, mac) {
    let m = 0, mom = 0;
    for (const s of stations) { if (isNum(s.mass) && isNum(s.arm)) { m += s.mass; mom += s.mass * s.arm; } }
    const cg = m > 0 ? mom / m : NaN;
    const out = { mass: m, moment: mom, cg };
    if (mac && isNum(mac.lemac) && isNum(mac.length) && mac.length > 0) out.pctMac = (cg - mac.lemac) / mac.length * 100;
    return out;
  }

  // ----------------------------------------------------- GA runway (POH) factors
  /**
   * Corrections to a POH distance using the UK CAA Safety Sense Leaflet 7 factors and the usual POH wind rule.
   * phase 'to' | 'ldg'. surface: paved | wetPaved | dryGrass | wetGrass. slopePct: + uphill (in the direction of travel).
   */
  function gaRunway({ phase, base, baseElevFt = 0, baseTempC = 15, baseMass, elevFt, tempC, mass, headwind = 0,
                      surface = 'paved', slopePct = 0, safety = true }) {
    const to = phase !== 'ldg';
    const f = {};
    f.mass = isNum(baseMass) && isNum(mass) && baseMass > 0 ? Math.pow(mass / baseMass, to ? 2 : 1) : 1;
    f.elevation = Math.pow(to ? 1.1 : 1.05, (elevFt - baseElevFt) / 1000);
    f.temperature = Math.pow(to ? 1.1 : 1.05, (tempC - baseTempC) / 10);
    const surf = to ? { paved: 1, wetPaved: 1, dryGrass: 1.2, wetGrass: 1.3 } : { paved: 1, wetPaved: 1.15, dryGrass: 1.15, wetGrass: 1.35 };
    f.surface = surf[surface] || 1;
    // slope: take-off uphill ×1.1 per 2 %; landing downhill ×1.1 per 2 %
    const s = to ? slopePct : -slopePct;
    f.slope = s > 0 ? Math.pow(1.1, s / 2) : 1;
    // wind: −10 % per 9 kt headwind; +10 % per 2 kt tailwind (POH convention)
    f.wind = headwind >= 0 ? Math.max(0.5, 1 - 0.10 * headwind / 9) : 1 + 0.10 * (-headwind) / 2;
    f.safety = safety ? (to ? 1.33 : 1.43) : 1;
    let d = base;
    for (const k of Object.keys(f)) d *= f[k];
    return { distance: d, factors: f };
  }

  // ------------------------------------------------------------------ weather
  /** Relative humidity (%) from temperature and dew point (Magnus formula, Alduchov & Eskridge constants). */
  function relHumidity(tC, tdC) {
    const a = 17.625, b = 243.04;
    return 100 * Math.exp(a * tdC / (b + tdC) - a * tC / (b + tC));
  }

  /**
   * Base of convective (cumulus) cloud. A rising unsaturated parcel cools at the dry adiabatic rate
   * (≈3 °C/1000 ft) while its dew point falls ≈0.5 °C/1000 ft, so the spread closes at ≈2.5 °C per 1000 ft:
   * base ≈ 400 ft per °C of spread. Freezing level uses the average environmental lapse (1.98 °C/1000 ft).
   */
  function cloudBase({ tempC, dewC, elevFt = 0 }) {
    const spread = tempC - dewC;
    const aglFt = Math.max(0, spread) / 2.5 * 1000;
    const freezeAglFt = tempC > 0 ? tempC / 1.98 * 1000 : 0;
    return { spread, aglFt, mslFt: elevFt + aglFt, rh: relHumidity(tempC, dewC), baseTempC: tempC - 2.98 * aglFt / 1000,
             freezeAglFt, freezeMslFt: elevFt + freezeAglFt };
  }

  const WX = {
    MI: 'shallow', PR: 'partial', BC: 'patches of', DR: 'low drifting', BL: 'blowing', SH: 'showers of', TS: 'thunderstorm', FZ: 'freezing',
    DZ: 'drizzle', RA: 'rain', SN: 'snow', SG: 'snow grains', IC: 'ice crystals', PL: 'ice pellets', GR: 'hail', GS: 'small hail', UP: 'unknown precipitation',
    BR: 'mist', FG: 'fog', FU: 'smoke', VA: 'volcanic ash', DU: 'dust', SA: 'sand', HZ: 'haze', PY: 'spray',
    PO: 'dust whirls', SQ: 'squalls', FC: 'funnel cloud', SS: 'sandstorm', DS: 'duststorm'
  };
  const COVER = { FEW: 'few (1–2 oktas)', SCT: 'scattered (3–4 oktas)', BKN: 'broken (5–7 oktas)', OVC: 'overcast (8 oktas)' };

  function decodeWx(g) {
    const m = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/.exec(g);
    if (!m || (!m[2] && !m[3])) return null;
    const ph = (m[3].match(/../g) || []).map(c => WX[c]);
    let s;
    if (m[2] === 'TS') s = 'thunderstorm' + (ph.length ? ' with ' + ph.join(' and ') : '');
    else if (m[2] === 'SH') s = ph.length ? 'showers of ' + ph.join(' and ') : 'showers';
    else s = [m[2] ? WX[m[2]] : '', ph.join(' and ')].filter(Boolean).join(' ');
    if (m[1] === '-') s = 'light ' + s; else if (m[1] === '+') s = 'heavy ' + s;
    if (m[1] === 'VC') s += ' in the vicinity';
    return s;
  }

  /** Visibility in statute miles from a US group like "10SM", "1 1/2SM", "M1/4SM", "P6SM". */
  function smValue(s) {
    let t = s.replace('SM', ''), less = false, more = false;
    if (t[0] === 'M') { less = true; t = t.slice(1); }
    if (t[0] === 'P') { more = true; t = t.slice(1); }
    let v = 0;
    for (const part of t.split(' ')) {
      if (part.includes('/')) { const [a, b] = part.split('/').map(Number); v += a / b; } else v += Number(part);
    }
    return { v, less, more };
  }

  /**
   * Decode a METAR (ICAO or US style). Returns the fields a pilot needs plus derived values
   * (ceiling, flight category, humidity). Groups it does not understand are listed in `unknown`.
   */
  function parseMetar(text) {
    const src = String(text || '').toUpperCase().replace(/[=\s]+$/g, '').replace(/\s+/g, ' ').trim();
    const out = { raw: src, wx: [], clouds: [], rvr: [], unknown: [], remarks: '', trend: '' };
    if (!src) return Object.assign(out, { error: 'Paste a METAR, for example: EETN 271420Z 24012G22KT 9999 -SHRA FEW025CB SCT040 12/08 Q1009' });
    let body = src;
    const rmk = body.indexOf(' RMK ');
    if (rmk >= 0) { out.remarks = body.slice(rmk + 5); body = body.slice(0, rmk); }
    const tr = /\s(NOSIG|BECMG|TEMPO)(\s|$)/.exec(body);
    if (tr) { out.trend = body.slice(tr.index + 1); body = body.slice(0, tr.index); }
    const tok = body.split(' ');
    // US visibility may be split: "1 1/2SM"
    for (let i = 0; i < tok.length - 1; i++) if (/^\d$/.test(tok[i]) && /^\d\/\dSM$/.test(tok[i + 1])) { tok.splice(i, 2, tok[i] + ' ' + tok[i + 1]); }
    let i = 0;
    if (tok[i] === 'METAR' || tok[i] === 'SPECI') out.type = tok[i++];
    if (/^[A-Z][A-Z0-9]{3}$/.test(tok[i] || '')) out.station = tok[i++];
    for (; i < tok.length; i++) {
      const g = tok[i];
      let m;
      if (!g) continue;
      if (!out.time && (m = /^(\d{2})(\d{2})(\d{2})Z$/.exec(g))) { out.time = { day: +m[1], hour: +m[2], min: +m[3] }; continue; }
      if (g === 'AUTO' || g === 'COR' || g === 'NIL') { out[g.toLowerCase()] = true; continue; }
      if (!out.wind && (m = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/.exec(g))) {
        const f = m[4] === 'MPS' ? 1.943844 : m[4] === 'KMH' ? 1 / 1.852 : 1;
        out.wind = { dir: m[1] === 'VRB' ? null : +m[1], speed: +m[2] * f, gust: m[3] ? +m[3] * f : null, unit: m[4], calm: +m[2] === 0 && m[1] !== 'VRB' };
        continue;
      }
      if (out.wind && (m = /^(\d{3})V(\d{3})$/.exec(g))) { out.wind.varFrom = +m[1]; out.wind.varTo = +m[2]; continue; }
      if (g === 'CAVOK') { out.cavok = true; out.visM = 10000; out.visSm = 10000 / 1609.344; continue; }
      if (out.visM == null && (m = /^(\d{4})(NDV|[NSEW]{1,2})?$/.exec(g))) { out.visM = +m[1] === 9999 ? 10000 : +m[1]; out.visSm = out.visM / 1609.344; out.visPlus = +m[1] === 9999; continue; }
      if (out.visM == null && /^[MP]?\d+(\s\d)?(\/\d)?SM$/.test(g)) { const s = smValue(g); out.visSm = s.v; out.visM = s.v * 1609.344; out.visPlus = s.more; out.visLess = s.less; out.visUnit = 'SM'; continue; }
      if ((m = /^R(\d{2}[LCR]?)\/([PM]?)(\d{4})(?:V([PM]?)(\d{4}))?(FT)?(?:\/?([UDN]))?$/.exec(g))) {
        out.rvr.push({ rwy: m[1], value: +m[3], max: m[5] ? +m[5] : null, ft: !!m[6], trend: m[7] || null, prefix: m[2] || '' });
        continue;
      }
      if ((m = /^(FEW|SCT|BKN|OVC)(\d{3}|\/\/\/)(CB|TCU|\/\/\/)?$/.exec(g))) {
        out.clouds.push({ cover: m[1], text: COVER[m[1]], baseFt: m[2] === '///' ? null : +m[2] * 100, type: m[3] && m[3] !== '///' ? m[3] : null });
        continue;
      }
      if ((m = /^VV(\d{3}|\/\/\/)$/.exec(g))) { out.vv = m[1] === '///' ? null : +m[1] * 100; out.clouds.push({ cover: 'VV', text: 'sky obscured, vertical visibility', baseFt: out.vv, type: null }); continue; }
      if (g === 'NSC' || g === 'NCD' || g === 'SKC' || g === 'CLR') { out.noCloud = g; continue; }
      if ((m = /^(M?\d{2})\/(M?\d{2})?$/.exec(g))) {
        const t = s => (s[0] === 'M' ? -Number(s.slice(1)) : Number(s));
        out.temp = t(m[1]); out.dew = m[2] ? t(m[2]) : null; continue;
      }
      if ((m = /^Q(\d{4})$/.exec(g))) { out.qnh = +m[1]; continue; }
      if ((m = /^A(\d{4})$/.exec(g))) { out.altimeterInHg = +m[1] / 100; out.qnh = out.altimeterInHg * K.INHG; continue; }
      if (/^RE[A-Z]{2,}$/.test(g)) { out.recent = (out.recent || []).concat(decodeWx(g.slice(2)) || g); continue; }
      if (g === 'WS' || /^(R\d{2}[LCR]?|ALL|RWY)$/.test(g)) { out.windshear = (out.windshear ? out.windshear + ' ' : 'wind shear ') + (g === 'WS' ? '' : g); continue; }
      const w = decodeWx(g);
      if (w) { out.wx.push({ code: g, text: w }); continue; }
      out.unknown.push(g);
    }
    // US remark T-group gives tenths: T01230045 → 12.3 / 4.5
    const tg = /\bT([01])(\d{3})([01])(\d{3})\b/.exec(out.remarks);
    if (tg) { out.tempExact = (tg[1] === '1' ? -1 : 1) * +tg[2] / 10; out.dewExact = (tg[3] === '1' ? -1 : 1) * +tg[4] / 10; }
    const ceil = out.clouds.filter(c => (c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'VV') && c.baseFt != null).map(c => c.baseFt);
    out.ceilingFt = ceil.length ? Math.min(...ceil) : null;
    const vis = out.visSm, cf = out.ceilingFt ?? Infinity;
    if (isNum(vis) || isFinite(cf)) {
      const v = isNum(vis) ? vis : 99;
      out.category = cf < 500 || v < 1 ? 'LIFR' : cf < 1000 || v < 3 ? 'IFR' : cf <= 3000 || v <= 5 ? 'MVFR' : 'VFR';
    }
    if (isNum(out.temp) && isNum(out.dew)) out.rh = relHumidity(out.tempExact ?? out.temp, out.dewExact ?? out.dew);
    if (!out.station && !out.wind && out.temp == null) out.error = 'That does not look like a METAR.';
    return out;
  }

  // ------------------------------------------------------------ radio navigation
  /** DME measures slant range. Ground distance = √(DME² − h²), h = height above the station in NM. */
  function dmeGround({ dmeNm, heightFt }) {
    const h = heightFt / K.FT_PER_NM;
    const overhead = dmeNm <= h;
    const ground = overhead ? 0 : Math.sqrt(dmeNm * dmeNm - h * h);
    return { heightNm: h, groundNm: ground, errorNm: dmeNm - ground, overhead, errorPct: dmeNm > 0 ? (dmeNm - ground) / dmeNm * 100 : 0 };
  }

  /** Glide path: height above the threshold at a distance, from the threshold crossing height (TCH). */
  function glidePath({ distNm, angleDeg = 3, tchFt = 50, gs, thrElevFt = 0 }) {
    const perNm = K.FT_PER_NM * Math.tan(rad(angleDeg));
    const h = tchFt + distNm * perNm;
    return { heightFt: h, altFt: h + thrElevFt, ftPerNm: perNm, vs: isNum(gs) ? vsForAngle(gs, angleDeg) : NaN };
  }

  /** True ⇄ magnetic ⇄ compass heading. Variation and deviation are east-positive (east is least, west is best). */
  function headings({ from, value, variation = 0, deviation = 0 }) {
    let t, m, c;
    if (from === 'true') { t = value; m = t - variation; c = m - deviation; }
    else if (from === 'mag') { m = value; t = m + variation; c = m - deviation; }
    else { c = value; m = c + deviation; t = m + variation; }
    return { trueHdg: norm360(t), magHdg: norm360(m), compassHdg: norm360(c) };
  }

  /** NDB/ADF: magnetic bearing to the station = magnetic heading + relative bearing (QDM); from = QDR. */
  function ndbBearing({ heading, relBearing }) {
    const qdm = norm360(heading + relBearing);
    return { qdm, qdr: norm360(qdm + 180) };
  }

  // ------------------------------------------------------------------ operations
  /** ICAO wake turbulence category from the maximum take-off mass (Super = A380). */
  function wakeCategory(mtowKg, isSuper) {
    if (isSuper) return 'J';
    return mtowKg >= 136000 ? 'H' : mtowKg > 7000 ? 'M' : 'L';
  }
  const WAKE_NAMES = { J: 'Super (A380)', H: 'Heavy', M: 'Medium', L: 'Light' };
  /** ICAO Doc 4444 wake separation on approach (radar, NM) and departure (minutes). */
  function wakeSeparation(lead, follow) {
    const nm = { J: { H: 6, M: 7, L: 8 }, H: { H: 4, M: 5, L: 6 }, M: { L: 5 } };
    const min = { J: { H: 2, M: 3, L: 3 }, H: { M: 2, L: 2 }, M: { L: 2 } };
    const d = (nm[lead] || {})[follow];
    const t = (min[lead] || {})[follow];
    return { distanceNm: d || null, departureMin: t || null, radarMinimumNm: 3, wakeApplies: !!(d || t) };
  }

  /**
   * Optimum cruise altitude: the pressure where the wing flies at its best cruise lift coefficient.
   * Lift written with Mach and static pressure: L = 0.7·p·S·M²·C_L  (0.7 = γ/2).
   */
  function optimumAltitude({ massKg, wingArea, mach, clOpt = 0.52 }) {
    const W = massKg * K.g0;
    const p = W / (0.7 * wingArea * mach * mach * clOpt);
    return { ft: pressureAltM(p) / K.FT, p, hPa: p / 100, delta: p / K.P0 };
  }

  return {
    relHumidity, cloudBase, parseMetar, decodeWx, WAKE_NAMES,
    dmeGround, glidePath, headings, ndbBearing, wakeCategory, wakeSeparation, optimumAltitude,
    K, rad, deg, norm360, norm180, clamp, isNum, units,
    isaM, isa, isaTempC, pressureAltM, pressureAltFt, pressureAltitude, densityAltitude, densityAltM,
    qcFromCas, casFromQc, casToMach, machToCas, speedOfSoundKt, casToTas, tasToCas, machToTas, tasToMach,
    tatFromSat, satFromTat, crossoverAltitude,
    windTriangle, findWind, windComponents, tsd,
    vsForAngle, angleFromVs, descent, climbGradient, glide, turn, bankForRate,
    greatCircle, oneInSixty, holdingEntry, holdingSpeeds,
    trueHeight, coldTempCorrection, horizon, FUELS, fuelBurn, massBalance, gaRunway
  };
});
