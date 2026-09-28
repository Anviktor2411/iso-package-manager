/* XP Flight Computer — calculator definitions
 * Each calculator declares its inputs (with optional live-sim sources) and a run() that returns
 * results plus the worked steps as TeX, so every answer can show its working.
 * Input values arrive in canonical units: kt, ft, NM, °C, hPa, kg, m (runway), kg/h, litres.
 */
(function (root) {
  'use strict';
  const C = root.XFC.calc;
  const R = String.raw;
  const n = (x, d = 0) => (Number.isFinite(x) ? (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) : '?');
  const sgn = (x, d = 0) => (x >= 0 ? '+' : '') + n(x, d);
  const has = x => Number.isFinite(x);
  const H = x => C.norm360(x);   // the app prints 360 instead of 000 for north
  const qn = x => Math.round(x).toLocaleString('en-US');

  const list = [];
  const add = c => list.push(c);

  // ======================================================================== WIND
  add({
    id: 'wind-triangle', group: 'Wind', title: 'Wind triangle', study: 'wind-triangle',
    desc: 'Heading to steer and ground speed for a true course, given TAS and the wind.',
    inputs: [
      { k: 'tas', label: 'True airspeed', unit: 'kt', v: 120, live: s => s.tas },
      { k: 'crs', label: 'Course to fly (true)', unit: '°T', v: 90, live: s => s.trkT },
      { k: 'wdir', label: 'Wind from (true)', unit: '°T', v: 40, live: s => s.windDirT },
      { k: 'wspd', label: 'Wind speed', unit: 'kt', v: 25, live: s => s.windKt },
      { k: 'var', label: 'Magnetic variation (east +)', unit: '°', v: 8, live: s => s.magVar }
    ],
    run(v) {
      const r = C.windTriangle({ tas: v.tas, course: v.crs, windFrom: v.wdir, windSpeed: v.wspd });
      const rel = C.norm180(v.wdir - v.crs);
      if (!r.possible) return { error: 'No solution: the crosswind component is larger than the TAS, or the headwind is stronger than the aircraft is fast.' };
      return {
        results: [
          { label: 'Heading (true)', value: H(r.heading), fmt: 'hdg', main: true },
          { label: 'Heading (magnetic)', value: H(r.heading - v.var), fmt: 'hdg', main: true },
          { label: 'Ground speed', value: r.gs, unit: 'kt', main: true },
          { label: 'Wind correction angle', value: r.wca, unit: '°', d: 1, signed: true, note: r.wca >= 0 ? 'steer right of course' : 'steer left of course' },
          { label: r.headwind >= 0 ? 'Headwind component' : 'Tailwind component', value: Math.abs(r.headwind), unit: 'kt' },
          { label: 'Crosswind component', value: Math.abs(r.crosswind), unit: 'kt', note: r.crosswind >= 0 ? 'from the right' : 'from the left' }
        ],
        steps: [
          { t: 'Angle between wind and course', tex: R`\theta = \theta_w - \theta_c = ${n(v.wdir)}^\circ - ${n(v.crs)}^\circ = ${n(rel, 1)}^\circ` },
          { t: 'Wind correction angle (sine rule in the triangle)', tex: R`\mathrm{WCA} = \arcsin\!\left(\frac{V_w\sin\theta}{V_{TAS}}\right) = \arcsin\!\left(\frac{${n(v.wspd)}\,\sin(${n(rel, 1)}^\circ)}{${n(v.tas)}}\right) = ${n(r.wca, 2)}^\circ` },
          { t: 'Ground speed = along-track part of TAS minus the headwind', tex: R`GS = V_{TAS}\cos\mathrm{WCA} - V_w\cos\theta = ${n(v.tas)}\cos(${n(r.wca, 2)}^\circ) - ${n(v.wspd)}\cos(${n(rel, 1)}^\circ) = ${n(r.gs, 1)}\ \text{kt}` },
          { t: 'Heading', tex: R`\mathrm{HDG}_T = \theta_c + \mathrm{WCA} = ${n(v.crs)}^\circ ${r.wca >= 0 ? '+' : '-'} ${n(Math.abs(r.wca), 1)}^\circ = ${n(H(r.heading), 1)}^\circ \qquad \mathrm{HDG}_M = \mathrm{HDG}_T - \mathrm{VAR} = ${n(H(r.heading - v.var), 1)}^\circ` }
        ]
      };
    }
  });

  add({
    id: 'find-wind', group: 'Wind', title: 'Find the wind', study: 'wind-triangle',
    desc: 'Work out the wind from what the aircraft is doing: heading and TAS against track and ground speed.',
    inputs: [
      { k: 'hdg', label: 'Heading (true)', unit: '°T', v: 85, live: s => s.hdgT },
      { k: 'tas', label: 'True airspeed', unit: 'kt', v: 450, live: s => s.tas },
      { k: 'trk', label: 'Track (true)', unit: '°T', v: 81, live: s => s.trkT },
      { k: 'gs', label: 'Ground speed', unit: 'kt', v: 405, live: s => s.gs }
    ],
    run(v) {
      const r = C.findWind({ tas: v.tas, heading: v.hdg, gs: v.gs, track: v.trk });
      return {
        results: [
          { label: 'Wind from (true)', value: H(r.windFrom), fmt: 'hdg', main: true },
          { label: 'Wind speed', value: r.windSpeed, unit: 'kt', main: true },
          { label: 'Drift angle', value: r.drift, unit: '°', d: 1, signed: true, note: r.drift >= 0 ? 'drifting right' : 'drifting left' }
        ],
        steps: [
          { t: 'Air vector (heading, TAS) and ground vector (track, GS) as north/east parts', tex: R`A_N = ${n(v.tas)}\cos ${n(v.hdg)}^\circ,\ A_E = ${n(v.tas)}\sin ${n(v.hdg)}^\circ \qquad G_N = ${n(v.gs)}\cos ${n(v.trk)}^\circ,\ G_E = ${n(v.gs)}\sin ${n(v.trk)}^\circ` },
          { t: 'The wind is the difference between them', tex: R`\vec W = \vec G - \vec A \;\Rightarrow\; W_N = ${n(r.wN, 1)},\ W_E = ${n(r.wE, 1)}\ \text{kt}` },
          { t: 'Speed and direction (wind is reported as where it blows FROM)', tex: R`V_w = \sqrt{W_N^2 + W_E^2} = ${n(r.windSpeed, 1)}\ \text{kt} \qquad \theta_w = \operatorname{atan2}(W_E, W_N) + 180^\circ = ${n(H(r.windFrom), 0)}^\circ` }
        ]
      };
    }
  });

  add({
    id: 'crosswind', group: 'Wind', title: 'Runway wind components', study: 'crosswind',
    desc: 'Headwind, tailwind and crosswind for a runway, including gusts. Use the magnetic runway heading with a magnetic wind (ATIS/tower).',
    inputs: [
      { k: 'rwy', label: 'Runway heading (magnetic)', unit: '°M', v: 263, live: s => s.onGround ? s.hdgM : undefined },
      { k: 'wdir', label: 'Wind from (magnetic)', unit: '°M', v: 300, live: s => s.windDirM },
      { k: 'wspd', label: 'Wind speed', unit: 'kt', v: 18, live: s => s.windKt },
      { k: 'gust', label: 'Gusting to (0 = none)', unit: 'kt', v: 28 },
      { k: 'limit', label: 'Your crosswind limit', unit: 'kt', v: 25 }
    ],
    run(v) {
      const r = C.windComponents(v.wdir, v.wspd, v.rwy, v.gust);
      const xw = Math.abs(r.cross), gx = has(r.gustCross) ? Math.abs(r.gustCross) : xw;
      const tail = r.head < 0;
      return {
        results: [
          { label: tail ? 'Tailwind' : 'Headwind', value: Math.abs(r.head), unit: 'kt', main: true, tone: tail && Math.abs(r.head) > 10 ? 'bad' : tail ? 'warn' : null, note: tail ? 'most aircraft are limited to 10 kt' : '' },
          { label: 'Crosswind', value: xw, unit: 'kt', main: true, note: 'from the ' + r.side, tone: gx > v.limit ? 'bad' : xw > 0.8 * v.limit ? 'warn' : 'ok' },
          { label: 'Crosswind in gusts', value: gx, unit: 'kt', tone: gx > v.limit ? 'bad' : null },
          { label: 'Wind angle off the runway', value: Math.abs(r.angle), unit: '°' },
          { label: 'Clock-code estimate', value: v.wspd * Math.min(1, Math.abs(r.angle) / 60), unit: 'kt', note: 'angle/60 of the wind, max 1' }
        ],
        steps: [
          { t: 'Angle between wind and runway', tex: R`\alpha = ${n(v.wdir)}^\circ - ${n(v.rwy)}^\circ = ${n(r.angle)}^\circ` },
          { t: 'Split the wind vector', tex: R`HW = V_w\cos\alpha = ${n(v.wspd)}\cos(${n(r.angle)}^\circ) = ${n(r.head, 1)}\ \text{kt} \qquad XW = V_w\sin\alpha = ${n(v.wspd)}\sin(${n(r.angle)}^\circ) = ${n(r.cross, 1)}\ \text{kt}` },
          ...(has(r.gustCross) ? [{ t: 'Same split with the gust value', tex: R`XW_{gust} = ${n(v.gust)}\sin(${n(r.angle)}^\circ) = ${n(r.gustCross, 1)}\ \text{kt}` }] : [])
        ]
      };
    }
  });

  // ==================================================================== AIRSPEED
  add({
    id: 'airspeed', group: 'Airspeed', title: 'Airspeed converter (CAS · TAS · Mach · EAS)', study: 'airspeeds',
    desc: 'Exact compressible-flow conversion using the ISA pressure at your pressure altitude and the real outside air temperature.',
    inputs: [
      { k: 'mode', label: 'Start from', type: 'select', v: 'cas', options: [['cas', 'Calibrated airspeed (CAS)'], ['tas', 'True airspeed (TAS)'], ['mach', 'Mach number']] },
      { k: 'spd', label: 'Speed', unit: v => v.mode === 'mach' ? 'M' : 'kt', v: 250, step: v => v.mode === 'mach' ? 0.01 : 1,
        live: (s, v) => v.mode === 'cas' ? (s.cas ?? s.ias) : v.mode === 'tas' ? s.tas : s.mach },
      { k: 'pa', label: 'Pressure altitude', unit: 'ft', v: 10000, live: s => s.pa },
      { k: 'oat', label: 'Outside air temperature (SAT)', unit: '°C', v: -4.8, live: s => s.oat }
    ],
    run(v) {
      const isa = C.isa(v.pa);
      let r;
      if (v.mode === 'cas') r = C.casToTas(v.spd, v.pa, v.oat);
      else if (v.mode === 'tas') r = C.tasToCas(v.spd, v.pa, v.oat);
      else r = C.tasToCas(C.machToTas(v.spd, v.oat), v.pa, v.oat);
      const res = [
        { label: 'True airspeed', value: r.tas, unit: 'kt', d: 1, main: true },
        { label: 'Calibrated airspeed', value: r.cas, unit: 'kt', d: 1, main: true },
        { label: 'Mach number', value: r.mach, fmt: 'mach', main: true },
        { label: 'Equivalent airspeed', value: r.eas, unit: 'kt', d: 1, note: 'CAS − EAS = ' + n(r.cas - r.eas, 1) + ' kt compressibility' },
        { label: 'Speed of sound', value: r.a, unit: 'kt', d: 1 },
        { label: 'ISA deviation', value: v.oat - isa.Tc, unit: '°C', d: 1, signed: true },
        { label: 'Rule of thumb TAS', value: (v.mode === 'cas' ? v.spd : r.cas) * (1 + 0.02 * v.pa / 1000), unit: 'kt', note: 'CAS + 2 % per 1000 ft' }
      ];
      if (r.supersonic) return { error: 'Mach ≥ 1: these subsonic pitot formulas no longer apply.' };
      const steps = [
        { t: 'ISA static pressure at the pressure altitude', tex: R`P = P_0\left(1 - \frac{L h}{T_0}\right)^{5.2559} = ${n(isa.hPa, 1)}\ \text{hPa}` }
      ];
      if (v.mode === 'cas') {
        steps.push({ t: 'Impact pressure the pitot tube feels at this CAS', tex: R`q_c = P_0\left[\left(1 + 0.2\left(\tfrac{V_c}{a_0}\right)^2\right)^{3.5} - 1\right] = 1013.25\left[\left(1 + 0.2\left(\tfrac{${n(v.spd)}}{661.48}\right)^2\right)^{3.5} - 1\right] = ${n(r.qc / 100, 2)}\ \text{hPa}` });
        steps.push({ t: 'Mach number from impact and static pressure', tex: R`M = \sqrt{5\left[\left(\frac{q_c}{P} + 1\right)^{2/7} - 1\right]} = \sqrt{5\left[\left(\frac{${n(r.qc / 100, 2)}}{${n(isa.hPa, 1)}} + 1\right)^{2/7} - 1\right]} = ${n(r.mach, 4)}` });
      } else {
        steps.push({ t: 'Mach number', tex: v.mode === 'tas' ? R`M = \frac{V_{TAS}}{a} = \frac{${n(v.spd)}}{${n(r.a, 1)}} = ${n(r.mach, 4)}` : R`M = ${n(v.spd, 3)}` });
        steps.push({ t: 'Impact pressure at this Mach', tex: R`q_c = P\left[(1 + 0.2M^2)^{3.5} - 1\right] = ${n(r.qc / 100, 2)}\ \text{hPa}` });
        steps.push({ t: 'CAS is the speed giving that impact pressure at sea level', tex: R`V_c = a_0\sqrt{5\left[\left(\frac{q_c}{P_0} + 1\right)^{2/7} - 1\right]} = ${n(r.cas, 1)}\ \text{kt}` });
      }
      steps.push({ t: 'Speed of sound depends only on temperature', tex: R`a = \sqrt{\gamma R T} = \sqrt{1.4 \times 287.05 \times ${n(v.oat + 273.15, 2)}} = ${n(r.a, 1)}\ \text{kt}` });
      steps.push({ t: 'True airspeed', tex: R`V_{TAS} = M\,a = ${n(r.mach, 4)} \times ${n(r.a, 1)} = ${n(r.tas, 1)}\ \text{kt}` });
      steps.push({ t: 'Equivalent airspeed', tex: R`V_{EAS} = M\,a_0\sqrt{P/P_0} = ${n(r.eas, 1)}\ \text{kt}` });
      return { results: res, steps };
    }
  });

  add({
    id: 'tat-sat', group: 'Airspeed', title: 'TAT ⇄ SAT (ram rise)', study: 'mach',
    desc: 'Total air temperature on the probe versus the static (outside) air temperature at a Mach number.',
    inputs: [
      { k: 'mode', label: 'Convert', type: 'select', v: 'sat', options: [['sat', 'SAT → TAT'], ['tat', 'TAT → SAT']] },
      { k: 'temp', label: 'Temperature', unit: '°C', v: -50, live: (s, v) => v.mode === 'sat' ? s.oat : s.tat },
      { k: 'mach', label: 'Mach number', unit: 'M', v: 0.8, step: 0.01, live: s => s.mach },
      { k: 'r', label: 'Probe recovery factor', unit: '', v: 1.0, step: 0.01 }
    ],
    run(v) {
      const out = v.mode === 'sat' ? C.tatFromSat(v.temp, v.mach, v.r) : C.satFromTat(v.temp, v.mach, v.r);
      const sat = v.mode === 'sat' ? v.temp : out, tat = v.mode === 'sat' ? out : v.temp;
      return {
        results: [
          { label: v.mode === 'sat' ? 'Total air temperature' : 'Static air temperature', value: out, unit: '°C', d: 1, main: true },
          { label: 'Ram rise', value: tat - sat, unit: '°C', d: 1 }
        ],
        steps: [
          { t: 'Kinetic energy turns into heat when the air is stopped on the probe (Kelvin)', tex: R`T_{TAT} = T_{SAT}\,(1 + 0.2\,r\,M^2) = ${n(sat + 273.15, 2)}\,(1 + 0.2 \times ${n(v.r, 2)} \times ${n(v.mach, 3)}^2) = ${n(tat + 273.15, 2)}\ \text{K}` }
        ]
      };
    }
  });

  add({
    id: 'crossover', group: 'Airspeed', title: 'Crossover altitude', study: 'mach',
    desc: 'The altitude where a climb CAS and a cruise Mach give the same speed — above it you fly the Mach.',
    inputs: [
      { k: 'cas', label: 'Climb/descent CAS', unit: 'kt', v: 290 },
      { k: 'mach', label: 'Mach number', unit: 'M', v: 0.78, step: 0.01 }
    ],
    run(v) {
      const r = C.crossoverAltitude(v.cas, v.mach);
      const tas = C.machToTas(v.mach, C.isaTempC(r.ft));
      return {
        results: [
          { label: 'Crossover altitude', value: r.ft, unit: 'ft', main: true, note: 'FL' + String(Math.round(r.ft / 100)).padStart(3, '0') },
          { label: 'TAS at crossover (ISA)', value: tas, unit: 'kt' },
          { label: 'Static pressure there', value: r.P / 100, unit: 'hPa', d: 1 }
        ],
        steps: [
          { t: 'Impact pressure for the CAS (independent of altitude)', tex: R`q_c = P_0\left[\left(1+0.2(V_c/a_0)^2\right)^{3.5} - 1\right] = ${n(C.qcFromCas(v.cas) / 100, 2)}\ \text{hPa}` },
          { t: 'The Mach number needs the same impact pressure at a lower static pressure', tex: R`P_x = \frac{q_c}{(1 + 0.2M^2)^{3.5} - 1} = \frac{${n(C.qcFromCas(v.cas) / 100, 2)}}{${n(Math.pow(1 + 0.2 * v.mach * v.mach, 3.5) - 1, 4)}} = ${n(r.P / 100, 1)}\ \text{hPa}` },
          { t: 'Convert that pressure to a pressure altitude (ISA)', tex: R`h = \frac{T_0}{L}\left[1 - \left(\frac{P_x}{P_0}\right)^{0.1903}\right] = ${n(r.ft)}\ \text{ft}` }
        ]
      };
    }
  });

  // ================================================================== ATMOSPHERE
  add({
    id: 'isa', group: 'Atmosphere', title: 'Standard atmosphere (ISA)', study: 'isa',
    desc: 'ISA temperature, pressure, density and speed of sound at any pressure altitude, and your deviation from it.',
    inputs: [
      { k: 'pa', label: 'Pressure altitude', unit: 'ft', v: 35000, live: s => s.pa },
      { k: 'oat', label: 'Actual OAT (optional)', unit: '°C', v: -48, live: s => s.oat }
    ],
    run(v) {
      const r = C.isa(v.pa);
      return {
        results: [
          { label: 'ISA temperature', value: r.Tc, unit: '°C', d: 1, main: true },
          { label: 'Pressure', value: r.hPa, unit: 'hPa', d: 1, main: true, note: n(C.units.hPaToInHg(r.hPa), 2) + ' inHg' },
          { label: 'Density', value: r.rho, unit: 'kg/m³', d: 4 },
          { label: 'Density ratio σ', value: r.sigma, d: 4 },
          { label: 'Speed of sound', value: r.akt, unit: 'kt', d: 1 },
          { label: 'ISA deviation', value: v.oat - r.Tc, unit: '°C', d: 1, signed: true }
        ],
        steps: v.pa * C.K.FT <= 11000 ? [
          { t: 'Temperature falls 6.5 °C per km (1.98 °C per 1000 ft) in the troposphere', tex: R`T = T_0 - L h = 288.15 - 0.0065 \times ${n(v.pa * C.K.FT)} = ${n(r.T, 2)}\ \text{K}\ (${n(r.Tc, 1)}\ ^\circ\text{C})` },
          { t: 'Pressure from the hydrostatic equation', tex: R`P = P_0\left(\frac{T}{T_0}\right)^{g_0/(R L)} = 1013.25\left(\frac{${n(r.T, 2)}}{288.15}\right)^{5.2559} = ${n(r.hPa, 1)}\ \text{hPa}` },
          { t: 'Density from the gas law', tex: R`\rho = \frac{P}{R T} = \frac{${n(r.P)}}{287.05 \times ${n(r.T, 2)}} = ${n(r.rho, 4)}\ \text{kg/m}^3` }
        ] : [
          { t: 'Above 11 km (36 089 ft) the ISA temperature is constant', tex: R`T = 216.65\ \text{K}\ (-56.5\ ^\circ\text{C})` },
          { t: 'Pressure falls exponentially in an isothermal layer', tex: R`P = P_{11}\,e^{-g_0 (h - 11000)/(R T)} = ${n(r.hPa, 1)}\ \text{hPa}` },
          { t: 'Density', tex: R`\rho = P/(RT) = ${n(r.rho, 4)}\ \text{kg/m}^3` }
        ]
      };
    }
  });

  add({
    id: 'altitudes', group: 'Atmosphere', title: 'Pressure & density altitude', study: 'density-altitude',
    desc: 'From an altimeter reading (or airfield elevation) with its QNH, and the outside air temperature.',
    inputs: [
      { k: 'alt', label: 'Altimeter reading / field elevation', unit: 'ft', v: 1500, live: s => s.altInd },
      { k: 'qnh', label: 'Altimeter setting (QNH)', q: 'press', v: 1003, live: s => s.baro ?? s.qnh },
      { k: 'oat', label: 'Outside air temperature', unit: '°C', v: 28, live: s => s.oat }
    ],
    run(v) {
      const pa = C.pressureAltitude(v.alt, v.qnh);
      const da = C.densityAltitude(pa, v.oat);
      return {
        results: [
          { label: 'Pressure altitude', value: pa, unit: 'ft', main: true },
          { label: 'Density altitude', value: da.ft, unit: 'ft', main: true, tone: da.ft - v.alt > 3000 ? 'warn' : null },
          { label: 'Density altitude (rule of thumb)', value: da.approxFt, unit: 'ft', note: 'PA + 120 ft per °C off ISA' },
          { label: 'ISA temperature at PA', value: C.isaTempC(pa), unit: '°C', d: 1 },
          { label: 'ISA deviation', value: da.isaDev, unit: '°C', d: 1, signed: true },
          { label: 'Air density ratio σ', value: da.sigma, d: 3, note: n((1 - da.sigma) * 100, 1) + ' % thinner than ISA sea level' }
        ],
        steps: [
          { t: 'Pressure altitude = reading + the height of the QNH level in the standard atmosphere', tex: R`PA = h + 145\,366\left[1 - \left(\frac{${n(v.qnh, 1)}}{1013.25}\right)^{0.1903}\right] = ${n(v.alt)} ${sgn(C.pressureAltFt(v.qnh), 0)} = ${n(pa)}\ \text{ft}` },
          { t: 'Actual density (static pressure from PA, real temperature)', tex: R`\rho = \frac{P(PA)}{R\,T} = \frac{${n(C.isa(pa).P)}}{287.05 \times ${n(v.oat + 273.15, 2)}} = ${n(da.rho, 4)}\ \text{kg/m}^3` },
          { t: 'Density altitude is where ISA has that density', tex: R`DA = \frac{T_0}{L}\left[1 - \left(\frac{\rho}{\rho_0}\right)^{0.235}\right] = ${n(da.ft)}\ \text{ft}` },
          { t: 'Rule of thumb', tex: R`DA \approx PA + 118.8\,(OAT - T_{ISA}) = ${n(pa)} + 118.8 \times (${sgn(da.isaDev, 1)}) = ${n(da.approxFt)}\ \text{ft}` }
        ]
      };
    }
  });

  add({
    id: 'cold-temp', group: 'Atmosphere', title: 'Cold temperature correction', study: 'temperature-error',
    desc: 'How much to add to a published altitude when the aerodrome is colder than ISA (ICAO Doc 8168 method).',
    inputs: [
      { k: 'alt', label: 'Published altitude', unit: 'ft', v: 2000 },
      { k: 'elev', label: 'Aerodrome elevation', unit: 'ft', v: 131 },
      { k: 'temp', label: 'Aerodrome temperature', unit: '°C', v: -20 }
    ],
    run(v) {
      const H = v.alt - v.elev;
      if (H <= 0) return { error: 'The published altitude must be above the aerodrome elevation.' };
      const r = C.coldTempCorrection({ heightFt: H, aerodromeTempC: v.temp, aerodromeElevFt: v.elev });
      if (r.isaDev >= 0) return { results: [{ label: 'Correction', value: 0, unit: 'ft', main: true, note: 'warmer than ISA — no cold correction' }], steps: [] };
      const corrected = Math.ceil((v.alt + r.correctionFt) / 10) * 10;
      return {
        results: [
          { label: 'Add to the altitude', value: r.correctionFt, unit: 'ft', main: true },
          { label: 'Corrected altitude', value: corrected, unit: 'ft', main: true, note: 'rounded up to 10 ft' },
          { label: 'Simplified ICAO formula', value: r.simplifiedFt, unit: 'ft' },
          { label: 'Rule of thumb (4 % per 10 °C)', value: r.ruleOfThumbFt, unit: 'ft' },
          { label: 'ISA deviation at aerodrome', value: r.isaDev, unit: '°C', d: 1, signed: true }
        ],
        steps: [
          { t: 'Height above the altimeter-setting source', tex: R`H = ${n(v.alt)} - ${n(v.elev)} = ${n(H)}\ \text{ft}` },
          { t: 'ISA deviation at the aerodrome', tex: R`\Delta T = ${n(v.temp)} - T_{ISA}(${n(v.elev)}\ \text{ft}) = ${sgn(r.isaDev, 1)}\ ^\circ\text{C}` },
          { t: 'In cold air the layers are compressed: true height from indicated height (hypsometric equation)', tex: R`\Delta h_{true} = \Delta h_P + \frac{\Delta T}{\lambda}\ln\!\left(1 + \frac{\lambda\,\Delta h_P}{T_0 + \lambda h_{aero}}\right),\quad \lambda = -0.0065\ \text{K/m}` },
          { t: 'Solve for the indicated height that gives the required true height', tex: R`\Delta h_P = ${n(H + r.correctionFt)}\ \text{ft}\ \Rightarrow\ \text{correction} = ${n(r.correctionFt)}\ \text{ft}` },
          { t: 'Simplified PANS-OPS formula (t₀ = aerodrome temperature reduced to sea level)', tex: R`\text{corr} = H\,\frac{15 - t_0}{273 + t_0 - 0.5\,L_0\,(H + H_{ss})} = ${n(r.simplifiedFt)}\ \text{ft}` }
        ]
      };
    }
  });

  add({
    id: 'true-alt', group: 'Atmosphere', title: 'True altitude (temperature error)', study: 'temperature-error',
    desc: 'Your real height when the air is warmer or colder than ISA, with QNH set.',
    inputs: [
      { k: 'ind', label: 'Indicated altitude (QNH set)', unit: 'ft', v: 9000, live: s => s.altInd },
      { k: 'stn', label: 'Elevation of the QNH station', unit: 'ft', v: 0 },
      { k: 'dev', label: 'ISA deviation (assumed constant)', unit: '°C', v: -15, live: s => s.isaDev }
    ],
    run(v) {
      const dh = C.trueHeight(v.ind - v.stn, v.dev, v.stn);
      const ta = v.stn + dh;
      return {
        results: [
          { label: 'True altitude', value: ta, unit: 'ft', main: true },
          { label: 'Error (true − indicated)', value: ta - v.ind, unit: 'ft', signed: true, main: true, tone: ta < v.ind ? 'warn' : null },
          { label: 'Rule of thumb', value: v.ind + (v.ind - v.stn) * 0.004 * v.dev, unit: 'ft', note: '4 ft per 1000 ft per °C' }
        ],
        steps: [
          { t: 'Hypsometric equation with a constant ISA deviation ΔT', tex: R`\Delta h_{true} = \Delta h + \frac{\Delta T}{\lambda}\ln\!\left(1 + \frac{\lambda\,\Delta h}{T_0 + \lambda h_s}\right) = ${n(dh)}\ \text{ft above the station}` },
          { t: 'High to low (or hot to cold), look out below', tex: R`\text{TA} = ${n(v.stn)} + ${n(dh)} = ${n(ta)}\ \text{ft}` }
        ]
      };
    }
  });

  // ==================================================================== VERTICAL
  add({
    id: 'descent', group: 'Vertical', title: 'Top of descent', study: 'descent',
    desc: 'Where to start down to reach a target altitude, and the vertical speed that flies the path.',
    inputs: [
      { k: 'from', label: 'Cruise / current altitude', unit: 'ft', v: 36000, live: s => s.altInd },
      { k: 'to', label: 'Target altitude', unit: 'ft', v: 3000, live: s => has(s.landingAlt) && s.landingAlt > 0 ? s.landingAlt + 1500 : undefined },
      { k: 'gs', label: 'Average descent ground speed', unit: 'kt', v: 380, live: s => s.gs },
      { k: 'mode', label: 'Plan by', type: 'select', v: 'angle', options: [['angle', 'Path angle'], ['vs', 'Vertical speed']] },
      { k: 'ang', label: 'Path angle', unit: '°', v: 3, step: 0.1, show: v => v.mode === 'angle' },
      { k: 'vs', label: 'Vertical speed', unit: 'fpm', v: 2000, show: v => v.mode === 'vs' },
      { k: 'decel', label: 'Extra distance to slow down', unit: 'NM', v: 10, hint: 'about 1 NM per 10 kt of speed to lose' }
    ],
    run(v) {
      if (v.from <= v.to) return { error: 'The target must be below the starting altitude.' };
      const r = C.descent({ fromFt: v.from, toFt: v.to, gs: v.gs, angleDeg: v.mode === 'angle' ? v.ang : undefined, vsFpm: v.mode === 'vs' ? v.vs : undefined, decelNm: v.decel });
      return {
        results: [
          { label: 'Start descent this far out', value: r.distNm, unit: 'NM', d: 0, main: true },
          { label: v.mode === 'angle' ? 'Vertical speed to fly' : 'Resulting path angle', value: v.mode === 'angle' ? r.vs : r.angle, unit: v.mode === 'angle' ? 'fpm' : '°', d: v.mode === 'angle' ? 0 : 2, main: true },
          { label: 'Descent time', value: r.timeMin, fmt: 'min' },
          { label: 'Height lost per NM', value: r.ftPerNm, unit: 'ft/NM' },
          { label: '3 : 1 rule', value: r.rule3to1Nm + v.decel, unit: 'NM', note: '3 NM per 1000 ft + slowing down' }
        ],
        steps: [
          { t: 'Height to lose', tex: R`\Delta H = ${n(v.from)} - ${n(v.to)} = ${n(r.dh)}\ \text{ft}` },
          { t: 'Horizontal distance of the path (1 NM = 6076 ft)', tex: R`D = \frac{\Delta H}{6076\,\tan\gamma} = \frac{${n(r.dh)}}{6076 \times \tan ${n(r.angle, 2)}^\circ} = ${n(r.pathNm, 1)}\ \text{NM}` },
          { t: 'Vertical speed for that path at the ground speed', tex: R`VS = GS \times \frac{6076}{60}\tan\gamma = ${n(v.gs)} \times 101.3 \times ${n(Math.tan(C.rad(r.angle)), 4)} = ${n(r.vs)}\ \text{fpm}` },
          { t: 'Add the deceleration allowance', tex: R`D_{TOD} = ${n(r.pathNm, 1)} + ${n(v.decel)} = ${n(r.distNm, 1)}\ \text{NM}` }
        ]
      };
    }
  });

  add({
    id: 'vpath', group: 'Vertical', title: 'Vertical path to a fix', study: 'descent',
    desc: 'Live VNAV helper: the rate needed to cross a fix at an altitude, and whether you are above or below a 3° path.',
    inputs: [
      { k: 'alt', label: 'Current altitude', unit: 'ft', v: 12000, live: s => s.altInd },
      { k: 'tgt', label: 'Altitude at the fix', unit: 'ft', v: 3000 },
      { k: 'dist', label: 'Distance to the fix', unit: 'NM', v: 32, live: s => s.gpsDist },
      { k: 'gs', label: 'Ground speed', unit: 'kt', v: 280, live: s => s.gs }
    ],
    run(v) {
      if (!(v.dist > 0)) return { error: 'Enter a distance to the fix greater than zero.' };
      const dh = v.alt - v.tgt;
      const tmin = v.dist / v.gs * 60;
      const vsReq = dh / tmin;
      const ang = C.deg(Math.atan(dh / (v.dist * C.K.FT_PER_NM)));
      const onPath = v.tgt + v.dist * C.K.FT_PER_NM * Math.tan(C.rad(3));
      const dev = v.alt - onPath;
      return {
        results: [
          { label: dh >= 0 ? 'Required descent rate' : 'Required climb rate', value: Math.abs(vsReq), unit: 'fpm', main: true },
          { label: 'Required path angle', value: Math.abs(ang), unit: '°', d: 2, main: true, tone: Math.abs(ang) > 4 ? 'warn' : null },
          { label: '3° path altitude here', value: onPath, unit: 'ft' },
          { label: dev >= 0 ? 'Above the 3° path' : 'Below the 3° path', value: Math.abs(dev), unit: 'ft', tone: Math.abs(dev) > 1000 ? 'warn' : 'ok' },
          { label: 'Time to the fix', value: tmin, fmt: 'min' }
        ],
        steps: [
          { t: 'Time to go', tex: R`t = \frac{D}{GS} = \frac{${n(v.dist, 1)}}{${n(v.gs)}} \times 60 = ${n(tmin, 1)}\ \text{min}` },
          { t: 'Rate to lose the height in that time', tex: R`VS = \frac{\Delta H}{t} = \frac{${n(dh)}}{${n(tmin, 1)}} = ${n(vsReq)}\ \text{fpm}` },
          { t: '3° path: 318 ft per NM above the fix', tex: R`h_{3^\circ} = ${n(v.tgt)} + ${n(v.dist, 1)} \times 318.4 = ${n(onPath)}\ \text{ft}` }
        ]
      };
    }
  });

  add({
    id: 'climb-gradient', group: 'Vertical', title: 'Climb gradient ⇄ rate', study: 'descent',
    desc: 'Turn a departure procedure’s required gradient into a rate of climb at your ground speed.',
    inputs: [
      { k: 'mode', label: 'Gradient given as', type: 'select', v: 'pct', options: [['pct', 'Percent'], ['fpn', 'Feet per NM']] },
      { k: 'val', label: 'Gradient', unit: v => v.mode === 'pct' ? '%' : 'ft/NM', v: 3.3, step: 0.1 },
      { k: 'gs', label: 'Ground speed', unit: 'kt', v: 160, live: s => s.gs }
    ],
    run(v) {
      const r = C.climbGradient(v.mode === 'pct' ? { percent: v.val, gs: v.gs } : { ftPerNm: v.val, gs: v.gs });
      return {
        results: [
          { label: 'Rate of climb needed', value: r.rocFpm, unit: 'fpm', main: true },
          { label: 'Gradient', value: r.percent, unit: '%', d: 2 },
          { label: 'Feet per NM', value: r.ftPerNm, unit: 'ft/NM' },
          { label: 'Climb angle', value: r.angle, unit: '°', d: 2 }
        ],
        steps: [
          { t: '1 % of a nautical mile is 60.76 ft', tex: R`\text{ft/NM} = \frac{\%}{100} \times 6076 = ${n(r.percent, 2)} \times 60.76 = ${n(r.ftPerNm, 1)}` },
          { t: 'Rate = height per NM × NM per minute', tex: R`ROC = \text{ft/NM} \times \frac{GS}{60} = ${n(r.ftPerNm, 1)} \times \frac{${n(v.gs)}}{60} = ${n(r.rocFpm)}\ \text{fpm}` }
        ]
      };
    }
  });

  add({
    id: 'glide', group: 'Vertical', title: 'Glide distance', study: 'glide',
    desc: 'How far you can glide from a height with a given lift-to-drag ratio, with the wind’s effect.',
    inputs: [
      { k: 'h', label: 'Height above terrain', unit: 'ft', v: 4000, live: s => s.agl },
      { k: 'ld', label: 'Glide ratio (L/D)', unit: ': 1', v: 9, step: 0.5, hint: 'C172 ≈ 9, airliner ≈ 17, glider ≈ 40' },
      { k: 'tas', label: 'Best-glide TAS', unit: 'kt', v: 70 },
      { k: 'hw', label: 'Headwind component (− tailwind)', unit: 'kt', v: 10 }
    ],
    run(v) {
      const gs = v.tas - v.hw;
      const r = C.glide({ heightFt: v.h, ld: v.ld, tas: v.tas, gs });
      return {
        results: [
          { label: 'Glide distance with wind', value: r.distNm, unit: 'NM', d: 1, main: true },
          { label: 'Still-air distance', value: r.stillAirNm, unit: 'NM', d: 1 },
          { label: 'Glide angle', value: r.angle, unit: '°', d: 1 },
          { label: 'Sink rate', value: r.sinkFpm, unit: 'fpm' },
          { label: 'Time aloft', value: v.h / r.sinkFpm, fmt: 'min' }
        ],
        steps: [
          { t: 'Distance over the air = height × L/D', tex: R`D_0 = \frac{h \times L/D}{6076} = \frac{${n(v.h)} \times ${n(v.ld, 1)}}{6076} = ${n(r.stillAirNm, 2)}\ \text{NM}` },
          { t: 'Wind stretches or shrinks it by GS/TAS', tex: R`D = D_0\,\frac{GS}{TAS} = ${n(r.stillAirNm, 2)} \times \frac{${n(gs)}}{${n(v.tas)}} = ${n(r.distNm, 2)}\ \text{NM}` }
        ]
      };
    }
  });

  // ======================================================================= TURNS
  add({
    id: 'turn', group: 'Turns', title: 'Turn performance', study: 'turning',
    desc: 'Rate, radius and load factor of a level turn, and the bank for a standard-rate turn.',
    inputs: [
      { k: 'tas', label: 'True airspeed', unit: 'kt', v: 120, live: s => s.tas },
      { k: 'bank', label: 'Bank angle', unit: '°', v: 30, live: s => has(s.roll) ? Math.abs(s.roll) : undefined },
      { k: 'vs1', label: '1-g stall speed (optional)', unit: 'kt', v: 53, live: s => s.vsEst }
    ],
    run(v) {
      if (!(v.bank > 0 && v.bank < 90)) return { error: 'Use a bank angle between 0° and 90°.' };
      const r = C.turn({ tas: v.tas, bank: v.bank });
      const std = C.bankForRate(v.tas, 3);
      return {
        results: [
          { label: 'Rate of turn', value: r.rateDps, unit: '°/s', d: 2, main: true },
          { label: 'Turn radius', value: r.radiusNm, unit: 'NM', d: 2, main: true, note: n(r.radiusM) + ' m' },
          { label: 'Load factor', value: r.n, unit: 'g', d: 2 },
          { label: 'Time for 360°', value: r.time360s / 60, fmt: 'min' },
          { label: 'Stall speed in this turn', value: v.vs1 > 0 ? v.vs1 * r.stallFactor : NaN, unit: 'kt', note: '+' + n((r.stallFactor - 1) * 100) + ' %' },
          { label: 'Bank for rate one (3°/s)', value: std, unit: '°', d: 1, note: 'rule: TAS/10 + 7 = ' + n(v.tas / 10 + 7) + '°' }
        ],
        steps: [
          { t: 'Lift must hold the weight vertically: load factor', tex: R`n = \frac{1}{\cos\phi} = \frac{1}{\cos ${n(v.bank)}^\circ} = ${n(r.n, 3)}` },
          { t: 'The horizontal lift component provides the turn', tex: R`r = \frac{V^2}{g\tan\phi} = \frac{(${n(v.tas)} \times 0.5144)^2}{9.807 \times \tan ${n(v.bank)}^\circ} = ${n(r.radiusM)}\ \text{m}` },
          { t: 'Rate of turn', tex: R`\omega = \frac{g\tan\phi}{V} = ${n(r.rateDps, 2)}\ ^\circ/\text{s}` },
          { t: 'Stall speed rises with the square root of the load factor', tex: R`V_{S,turn} = V_S\sqrt{n} = ${n(v.vs1)}\sqrt{${n(r.n, 3)}} = ${n(v.vs1 * r.stallFactor, 1)}\ \text{kt}` }
        ]
      };
    }
  });

  // ================================================================== NAVIGATION
  add({
    id: 'great-circle', group: 'Navigation', title: 'Great-circle distance & course', study: 'great-circle',
    desc: 'Shortest distance and initial true course between two positions (decimal degrees, south/west negative).',
    inputs: [
      { k: 'lat1', label: 'From latitude', unit: '°', v: 59.4133, step: 0.0001, live: s => s.lat },
      { k: 'lon1', label: 'From longitude', unit: '°', v: 24.8328, step: 0.0001, live: s => s.lon },
      { k: 'lat2', label: 'To latitude', unit: '°', v: 60.3172, step: 0.0001 },
      { k: 'lon2', label: 'To longitude', unit: '°', v: 24.9633, step: 0.0001 },
      { k: 'gs', label: 'Ground speed (for time)', unit: 'kt', v: 250, live: s => s.gs }
    ],
    run(v) {
      const r = C.greatCircle(v.lat1, v.lon1, v.lat2, v.lon2);
      const dp = C.rad(v.lat2 - v.lat1), dl = C.rad(v.lon2 - v.lon1);
      return {
        results: [
          { label: 'Distance', value: r.distNm, unit: 'NM', d: 1, main: true, note: n(r.distKm, 1) + ' km' },
          { label: 'Initial true course', value: H(r.initial), fmt: 'hdg', main: true },
          { label: 'Final true course', value: H(r.final), fmt: 'hdg' },
          { label: 'Time en route', value: v.gs > 0 ? r.distNm / v.gs * 60 : NaN, fmt: 'min' }
        ],
        steps: [
          { t: 'Haversine of the central angle', tex: R`a = \sin^2\!\frac{\Delta\varphi}{2} + \cos\varphi_1\cos\varphi_2\sin^2\!\frac{\Delta\lambda}{2} = ${n(Math.sin(dp / 2) ** 2 + Math.cos(C.rad(v.lat1)) * Math.cos(C.rad(v.lat2)) * Math.sin(dl / 2) ** 2, 8)}` },
          { t: 'Distance on a sphere of radius 3440 NM', tex: R`d = 2R\,\operatorname{atan2}\!\left(\sqrt a, \sqrt{1-a}\right) = ${n(r.distNm, 2)}\ \text{NM}` },
          { t: 'Initial course', tex: R`\theta = \operatorname{atan2}\!\left(\sin\Delta\lambda\cos\varphi_2,\ \cos\varphi_1\sin\varphi_2 - \sin\varphi_1\cos\varphi_2\cos\Delta\lambda\right) = ${n(r.initial, 1)}^\circ` }
        ]
      };
    }
  });

  add({
    id: 'tsd', group: 'Navigation', title: 'Time · speed · distance', study: 'great-circle',
    desc: 'Any one of the three from the other two.',
    inputs: [
      { k: 'mode', label: 'Find', type: 'select', v: 'time', options: [['time', 'Time'], ['speed', 'Speed'], ['dist', 'Distance']] },
      { k: 'dist', label: 'Distance', unit: 'NM', v: 142, show: v => v.mode !== 'dist', live: s => s.gpsDist },
      { k: 'spd', label: 'Ground speed', unit: 'kt', v: 118, show: v => v.mode !== 'speed', live: s => s.gs },
      { k: 'time', label: 'Time', unit: 'min', v: 45, show: v => v.mode !== 'time' }
    ],
    run(v) {
      if (v.mode === 'time') {
        const t = v.dist / v.spd * 60;
        return { results: [{ label: 'Time', value: t, fmt: 'min', main: true }, { label: 'NM per minute', value: v.spd / 60, d: 2 }],
          steps: [{ t: 'Time = distance ÷ speed', tex: R`t = \frac{${n(v.dist, 1)}}{${n(v.spd)}} \times 60 = ${n(t, 1)}\ \text{min}` }] };
      }
      if (v.mode === 'speed') {
        const s = v.dist / (v.time / 60);
        return { results: [{ label: 'Ground speed', value: s, unit: 'kt', main: true }], steps: [{ t: 'Speed = distance ÷ time', tex: R`GS = \frac{${n(v.dist, 1)}}{${n(v.time, 1)}/60} = ${n(s, 1)}\ \text{kt}` }] };
      }
      const d = v.spd * v.time / 60;
      return { results: [{ label: 'Distance', value: d, unit: 'NM', d: 1, main: true }], steps: [{ t: 'Distance = speed × time', tex: R`D = ${n(v.spd)} \times \frac{${n(v.time, 1)}}{60} = ${n(d, 1)}\ \text{NM}` }] };
    }
  });

  add({
    id: 'holding', group: 'Navigation', title: 'Holding entry & timing', study: 'holding',
    desc: 'Which entry to fly from your heading at the fix, plus outbound heading and timing corrected for wind.',
    inputs: [
      { k: 'inb', label: 'Inbound course (magnetic)', unit: '°M', v: 90 },
      { k: 'hdg', label: 'Your heading to the fix', unit: '°M', v: 210, live: s => s.hdgM },
      { k: 'turn', label: 'Turns', type: 'select', v: 'R', options: [['R', 'Right (standard)'], ['L', 'Left (non-standard)']] },
      { k: 'alt', label: 'Holding altitude', unit: 'ft', v: 6000, live: s => s.altInd },
      { k: 'tas', label: 'True airspeed in the hold', unit: 'kt', v: 180, live: s => s.tas },
      { k: 'wdir', label: 'Wind from (magnetic)', unit: '°M', v: 180, live: s => s.windDirM },
      { k: 'wspd', label: 'Wind speed', unit: 'kt', v: 20, live: s => s.windKt }
    ],
    run(v) {
      const r = C.holdingEntry({ inbound: v.inb, heading: v.hdg, turn: v.turn });
      const sp = C.holdingSpeeds(v.alt);
      const w = C.windTriangle({ tas: v.tas, course: v.inb, windFrom: v.wdir, windSpeed: v.wspd });
      const wca = w.possible ? w.wca : 0;
      const outHdg = H(r.outbound - 3 * wca);
      const outTime = sp.legMin * 60 - (w.headwind || 0) * sp.legMin;
      const names = { direct: 'Direct', parallel: 'Parallel', teardrop: 'Teardrop (offset)' };
      const how = {
        direct: 'Cross the fix and turn ' + (v.turn === 'R' ? 'right' : 'left') + ' straight onto the outbound leg.',
        parallel: 'Cross the fix, turn to ' + n(H(r.outbound)) + '° parallel to the inbound course on the non-holding side for ' + sp.legMin + ' min, then turn back towards the holding side through more than 180° to the fix.',
        teardrop: 'Cross the fix, fly ' + n(H(r.teardropHeading)) + '° (30° into the holding side) for ' + sp.legMin + ' min, then turn ' + (v.turn === 'R' ? 'right' : 'left') + ' to intercept the inbound course.'
      };
      return {
        results: [
          { label: 'Entry', value: names[r.entry], fmt: 'text', main: true, note: r.nearBoundary ? 'within 5° of a sector edge — the neighbouring entry is also allowed' : '' },
          { label: 'Outbound course', value: H(r.outbound), fmt: 'hdg' },
          { label: 'Outbound heading (3 × drift)', value: outHdg, fmt: 'hdg', note: 'inbound WCA ' + sgn(wca, 1) + '°' },
          { label: 'Outbound time', value: outTime / 60, fmt: 'min', note: 'adjusted 1 s per kt of wind along the course' },
          { label: 'Leg time', value: sp.legMin, unit: 'min', d: 1, note: sp.legMin === 1 ? 'at or below 14 000 ft' : 'above 14 000 ft' },
          { label: 'Max holding speed', value: sp.icao, fmt: 'text', note: 'ICAO · FAA ' + sp.faa }
        ],
        notes: [how[r.entry]],
        steps: [
          { t: 'Your heading relative to the inbound course', tex: R`\Delta = \mathrm{HDG} - \mathrm{INB} = ${n(v.hdg)}^\circ - ${n(v.inb)}^\circ = ${n(r.diff)}^\circ` },
          { t: v.turn === 'R' ? 'Right-hand hold sectors: teardrop 110°–180°, parallel 180°–290°, direct otherwise' : 'Left-hand hold sectors: parallel 70°–180°, teardrop 180°–250°, direct otherwise', tex: R`\Delta = ${n(r.diff)}^\circ \Rightarrow \text{${names[r.entry]}}` },
          { t: 'Outbound drift correction is three times the inbound one', tex: R`\mathrm{HDG}_{out} = ${n(H(r.outbound))}^\circ - 3 \times (${sgn(wca, 1)}^\circ) = ${n(outHdg)}^\circ` }
        ]
      };
    }
  });

  add({
    id: 'one-in-sixty', group: 'Navigation', title: '1-in-60 track correction', study: 'great-circle',
    desc: 'Off track? The heading change to regain track at the destination, with the exact trigonometry alongside.',
    inputs: [
      { k: 'flown', label: 'Distance flown', unit: 'NM', v: 30 },
      { k: 'off', label: 'Distance off track', unit: 'NM', v: 3 },
      { k: 'togo', label: 'Distance to go', unit: 'NM', v: 60 }
    ],
    run(v) {
      const r = C.oneInSixty({ distFlown: v.flown, offTrack: v.off, distRemaining: v.togo });
      return {
        results: [
          { label: 'Turn back by', value: r.total, unit: '°', d: 1, main: true, note: 'to arrive at the destination' },
          { label: 'Track error', value: r.trackError, unit: '°', d: 1, note: 'turn this much to fly parallel' },
          { label: 'Closing angle', value: r.closing, unit: '°', d: 1 },
          { label: 'Exact (trigonometry)', value: r.totalExact, unit: '°', d: 1 }
        ],
        steps: [
          { t: '1 NM off track after 60 NM is 1°', tex: R`TE = \frac{${n(v.off, 1)}}{${n(v.flown, 1)}} \times 60 = ${n(r.trackError, 1)}^\circ \qquad CA = \frac{${n(v.off, 1)}}{${n(v.togo, 1)}} \times 60 = ${n(r.closing, 1)}^\circ` },
          { t: 'Total correction', tex: R`\Delta\mathrm{HDG} = TE + CA = ${n(r.total, 1)}^\circ \quad(\text{exact } ${n(r.totalExact, 1)}^\circ)` }
        ]
      };
    }
  });

  add({
    id: 'horizon', group: 'Navigation', title: 'Horizon & radio range', study: 'great-circle',
    desc: 'How far you can see, and how far VHF radios and navaids reach, from a height.',
    inputs: [{ k: 'h', label: 'Height above terrain/sea', unit: 'ft', v: 10000, live: s => s.agl }],
    run(v) {
      const r = C.horizon(Math.max(0, v.h));
      return {
        results: [
          { label: 'VHF radio line of sight', value: r.radioNm, unit: 'NM', main: true },
          { label: 'Visual horizon', value: r.visualNm, unit: 'NM' },
          { label: 'Geometric horizon', value: r.geometricNm, unit: 'NM' }
        ],
        steps: [{ t: 'Line of sight grows with the square root of height (refraction bends radio waves further)', tex: R`d_{radio} \approx 1.23\sqrt{h_{ft}} = 1.23\sqrt{${n(v.h)}} = ${n(r.radioNm)}\ \text{NM}` }]
      };
    }
  });

  // ======================================================================== FUEL
  add({
    id: 'fuel', group: 'Fuel', title: 'Fuel endurance & range', study: 'fuel',
    desc: 'How long and how far the fuel on board lasts at the current fuel flow, keeping a reserve.',
    inputs: [
      { k: 'fuel', label: 'Fuel on board', q: 'mass', v: 110, live: s => s.fuel },
      { k: 'ff', label: 'Total fuel flow', q: 'flow', v: 30, live: s => s.ff },
      { k: 'gs', label: 'Ground speed', unit: 'kt', v: 110, live: s => s.gs },
      { k: 'res', label: 'Reserve to keep', unit: 'min', v: 45 }
    ],
    run(v) {
      if (!(v.ff > 0)) return { error: 'Fuel flow must be above zero.' };
      const r = C.fuelBurn({ fuelKg: v.fuel, flowKgH: v.ff, gs: v.gs });
      const usable = v.fuel - v.ff * v.res / 60;
      return {
        results: [
          { label: 'Endurance', value: r.enduranceMin, fmt: 'min', main: true },
          { label: 'Endurance to reserve', value: Math.max(0, usable / v.ff * 60), fmt: 'min', main: true, tone: usable < 0 ? 'bad' : null },
          { label: 'Range', value: r.rangeNm, unit: 'NM' },
          { label: 'Range to reserve', value: Math.max(0, usable / v.ff * v.gs), unit: 'NM' },
          { label: 'Fuel per NM', value: r.kgPerNm, q: 'mass', d: 2, unitSuffix: '/NM' },
          { label: 'Reserve fuel', value: v.ff * v.res / 60, q: 'mass' }
        ],
        steps: [
          { t: 'Endurance = fuel ÷ flow', tex: R`t = \frac{${n(v.fuel, 1)}\ \text{kg}}{${n(v.ff, 1)}\ \text{kg/h}} = ${n(r.enduranceH, 2)}\ \text{h}` },
          { t: 'Range = endurance × ground speed', tex: R`R = ${n(r.enduranceH, 2)} \times ${n(v.gs)} = ${n(r.rangeNm)}\ \text{NM}` }
        ]
      };
    }
  });

  add({
    id: 'fuel-convert', group: 'Fuel', title: 'Fuel mass ⇄ volume', study: 'fuel',
    desc: 'Convert fuel between kilograms, pounds, litres and US gallons using its density.',
    inputs: [
      { k: 'type', label: 'Fuel', type: 'select', v: 'jet', options: [['jet', 'Jet A / Jet A-1 (0.80 kg/L)'], ['avgas', 'AvGas 100LL (0.72 kg/L)'], ['mogas', 'MoGas (0.74 kg/L)'], ['custom', 'Custom density']] },
      { k: 'rho', label: 'Density', unit: 'kg/L', v: 0.8, step: 0.005, show: v => v.type === 'custom' },
      { k: 'amt', label: 'Amount', unit: v => ({ kg: 'kg', lb: 'lb', L: 'L', usg: 'US gal' })[v.from], v: 5000 },
      { k: 'from', label: 'Unit of the amount', type: 'select', v: 'kg', options: [['kg', 'Kilograms'], ['lb', 'Pounds'], ['L', 'Litres'], ['usg', 'US gallons']] }
    ],
    run(v) {
      const rho = v.type === 'custom' ? v.rho : C.FUELS[v.type].kgPerL;
      let kg;
      if (v.from === 'kg') kg = v.amt; else if (v.from === 'lb') kg = C.units.lbToKg(v.amt);
      else if (v.from === 'L') kg = v.amt * rho; else kg = C.units.usgToL(v.amt) * rho;
      const L = kg / rho;
      return {
        results: [
          { label: 'Kilograms', value: kg, unit: 'kg', main: v.from !== 'kg' },
          { label: 'Pounds', value: C.units.kgToLb(kg), unit: 'lb', main: v.from !== 'lb' },
          { label: 'Litres', value: L, unit: 'L', main: v.from !== 'L' },
          { label: 'US gallons', value: C.units.lToUsg(L), unit: 'US gal', d: 1 },
          { label: 'Pounds per US gallon', value: rho / C.K.LB * C.K.USG, unit: 'lb/gal', d: 2 }
        ],
        steps: [{ t: 'Mass = volume × density', tex: R`m = V\rho \;\Rightarrow\; V = \frac{${n(kg, 1)}\ \text{kg}}{${n(rho, 3)}\ \text{kg/L}} = ${n(L, 1)}\ \text{L}` }]
      };
    }
  });

  // =============================================================== MASS & BALANCE
  const wbIn = [];
  [['Empty aircraft', 767, 0.99], ['Pilot & front passenger', 170, 0.94], ['Rear passengers', 80, 1.85], ['Baggage', 20, 2.41], ['Fuel', 110, 1.22]]
    .forEach(([name, m, arm], i) => {
      wbIn.push({ k: 'm' + i, label: name + ' — mass', q: 'mass', v: m, live: i === 4 ? s => s.fuel : undefined });
      wbIn.push({ k: 'a' + i, label: name + ' — arm', unit: 'm', v: arm, step: 0.01 });
    });
  wbIn.push({ k: 'fwd', label: 'Forward CG limit', unit: 'm', v: 0.89, step: 0.01 });
  wbIn.push({ k: 'aft', label: 'Aft CG limit', unit: 'm', v: 1.20, step: 0.01 });
  wbIn.push({ k: 'mtow', label: 'Maximum take-off mass', q: 'mass', v: 1157, live: s => s.mtow });
  wbIn.push({ k: 'lemac', label: 'Leading edge of MAC (0 = skip %MAC)', unit: 'm', v: 0, step: 0.01 });
  wbIn.push({ k: 'mac', label: 'MAC length', unit: 'm', v: 0, step: 0.01 });
  add({
    id: 'wb', group: 'Mass & balance', title: 'Mass & balance (CG)', study: 'mass-balance',
    desc: 'Centre of gravity from station masses and arms (distance aft of the datum). Example values resemble a four-seat trainer.',
    inputs: wbIn,
    run(v) {
      const st = [0, 1, 2, 3, 4].map(i => ({ mass: v['m' + i], arm: v['a' + i] }));
      const r = C.massBalance(st, v.mac > 0 ? { lemac: v.lemac, length: v.mac } : null);
      const inCg = r.cg >= v.fwd && r.cg <= v.aft, inM = r.mass <= v.mtow;
      const res = [
        { label: 'Total mass', value: r.mass, q: 'mass', main: true, tone: inM ? 'ok' : 'bad', note: inM ? 'within maximum' : 'over maximum by ' + n(r.mass - v.mtow) + ' kg' },
        { label: 'CG position', value: r.cg, unit: 'm', d: 3, main: true, tone: inCg ? 'ok' : 'bad', note: inCg ? 'inside the limits' : (r.cg < v.fwd ? 'forward of the limit' : 'aft of the limit') },
        { label: 'Total moment', value: r.moment, unit: 'kg·m', d: 1 }
      ];
      if (Number.isFinite(r.pctMac)) res.push({ label: 'CG in % MAC', value: r.pctMac, unit: '%', d: 1 });
      return {
        results: res,
        steps: [
          { t: 'Moment = mass × arm for each station, then add them up', tex: R`M = \sum m_i x_i = ${st.map(s => n(s.mass) + R`\times` + n(s.arm, 2)).join(' + ')} = ${n(r.moment, 1)}\ \text{kg·m}` },
          { t: 'CG = total moment ÷ total mass', tex: R`x_{CG} = \frac{\sum m_i x_i}{\sum m_i} = \frac{${n(r.moment, 1)}}{${n(r.mass)}} = ${n(r.cg, 3)}\ \text{m}` },
          ...(Number.isFinite(r.pctMac) ? [{ t: 'Percent of the mean aerodynamic chord', tex: R`\%\mathrm{MAC} = \frac{x_{CG} - x_{LEMAC}}{\bar c} \times 100 = ${n(r.pctMac, 1)}\ \%` }] : [])
        ]
      };
    }
  });

  // ==================================================================== GA RUNWAY
  add({
    id: 'ga-runway', group: 'Light aircraft', title: 'Take-off & landing distance (POH corrections)', study: 'density-altitude',
    desc: 'Correct a handbook distance for weight, elevation, temperature, wind, surface and slope using the UK CAA Safety Sense factors.',
    inputs: [
      { k: 'phase', label: 'Phase', type: 'select', v: 'to', options: [['to', 'Take-off (to 50 ft)'], ['ldg', 'Landing (from 50 ft)']] },
      { k: 'base', label: 'Handbook distance', q: 'rwy', v: 440 },
      { k: 'bElev', label: 'Handbook: elevation', unit: 'ft', v: 0 },
      { k: 'bTemp', label: 'Handbook: temperature', unit: '°C', v: 15 },
      { k: 'bMass', label: 'Handbook: mass', q: 'mass', v: 1157 },
      { k: 'elev', label: 'Actual: elevation', unit: 'ft', v: 1200, live: s => s.onGround ? s.altMsl : undefined },
      { k: 'temp', label: 'Actual: temperature', unit: '°C', v: 28, live: s => s.onGround ? s.oat : undefined },
      { k: 'mass', label: 'Actual: mass', q: 'mass', v: 1100, live: s => s.mass },
      { k: 'hw', label: 'Headwind (− tailwind)', unit: 'kt', v: 5 },
      { k: 'surf', label: 'Surface', type: 'select', v: 'dryGrass', options: [['paved', 'Paved, dry'], ['wetPaved', 'Paved, wet'], ['dryGrass', 'Dry grass'], ['wetGrass', 'Wet grass']] },
      { k: 'slope', label: 'Slope (+ uphill)', unit: '%', v: 0, step: 0.5 },
      { k: 'safety', label: 'Safety factor', type: 'select', v: 'yes', options: [['yes', 'Apply (×1.33 / ×1.43)'], ['no', 'Do not apply']] },
      { k: 'avail', label: 'Runway available', q: 'rwy', v: 800 }
    ],
    run(v) {
      const r = C.gaRunway({ phase: v.phase, base: v.base, baseElevFt: v.bElev, baseTempC: v.bTemp, baseMass: v.bMass, elevFt: v.elev, tempC: v.temp,
        mass: v.mass, headwind: v.hw, surface: v.surf, slopePct: v.slope, safety: v.safety === 'yes' });
      const fits = r.distance <= v.avail;
      const f = r.factors;
      return {
        results: [
          { label: v.phase === 'to' ? 'Take-off distance required' : 'Landing distance required', value: r.distance, q: 'rwy', main: true, tone: fits ? 'ok' : 'bad', note: fits ? 'fits the runway' : 'longer than the runway' },
          { label: 'Margin', value: v.avail - r.distance, q: 'rwy', tone: fits ? null : 'bad' },
          { label: 'Mass factor', value: f.mass, d: 2, unit: '×' }, { label: 'Elevation factor', value: f.elevation, d: 2, unit: '×' },
          { label: 'Temperature factor', value: f.temperature, d: 2, unit: '×' }, { label: 'Wind factor', value: f.wind, d: 2, unit: '×' },
          { label: 'Surface factor', value: f.surface, d: 2, unit: '×' }, { label: 'Slope factor', value: f.slope, d: 2, unit: '×' }
        ],
        steps: [
          { t: 'Each condition multiplies the distance', tex: R`D = D_{POH} \times f_{mass} \times f_{elev} \times f_{temp} \times f_{wind} \times f_{surf} \times f_{slope} \times f_{safety}` },
          { t: 'With your numbers', tex: R`D = ${n(v.base)} \times ${n(f.mass, 2)} \times ${n(f.elevation, 2)} \times ${n(f.temperature, 2)} \times ${n(f.wind, 2)} \times ${n(f.surface, 2)} \times ${n(f.slope, 2)} \times ${n(f.safety, 2)} = ${n(r.distance)}\ \text{m}` }
        ],
        notes: ['Factors: +10 % mass → ×' + (v.phase === 'to' ? '1.2' : '1.1') + '; +1000 ft → ×' + (v.phase === 'to' ? '1.1' : '1.05') + '; +10 °C → ×' + (v.phase === 'to' ? '1.1' : '1.05') + '; wind −10 % per 9 kt head, +10 % per 2 kt tail. Always prefer your POH tables.']
      };
    }
  });


  // ===================================================================== WEATHER
  const pad2 = x => String(x).padStart(2, '0');
  add({
    id: 'metar', group: 'Weather', title: 'METAR decoder', study: 'metar',
    desc: 'Paste a METAR (ICAO or US format) and get it in plain language, with the ceiling, flight category, humidity, cloud base, density altitude and the wind on your runway.',
    inputs: [
      { k: 'text', label: 'METAR', type: 'text', v: 'EETN 271420Z 24012G22KT 200V280 9999 -SHRA FEW025CB SCT040 BKN080 12/08 Q1009 NOSIG' },
      { k: 'rwy', label: 'Runway heading for the wind check (0 = skip)', unit: '°', v: 263, hint: 'METAR winds are true; for a precise check use the magnetic wind from ATIS' },
      { k: 'elev', label: 'Airfield elevation', unit: 'ft', v: 131, live: s => (s.onGround ? s.altMsl : undefined) }
    ],
    run(v) {
      const m = C.parseMetar(v.text);
      if (m.error) return { error: m.error };
      const res = [], notes = [], steps = [];
      if (m.station || m.time) res.push({ label: 'Station & time', value: (m.station || '') + (m.time ? ` · day ${m.time.day}, ${pad2(m.time.hour)}:${pad2(m.time.min)} UTC` : '') + (m.auto ? ' · automatic' : ''), fmt: 'text' });
      if (m.wind) {
        const w = m.wind;
        const t = w.calm ? 'calm' : (w.dir == null ? 'variable' : pad2(Math.round(w.dir)).padStart(3, '0') + '°') + ' ' + n(w.speed) + ' kt' + (w.gust ? ', gusts ' + n(w.gust) + ' kt' : '') + (w.varFrom != null ? ` (varying ${w.varFrom}°–${w.varTo}°)` : '');
        res.push({ label: 'Wind (true)', value: t, fmt: 'text', main: true });
      }
      if (m.visM != null) {
        const km = m.visM >= 5000 ? n(m.visM / 1000, 1).replace(/\.0$/, '') + ' km' : n(m.visM) + ' m';
        const sm = Number.isInteger(m.visSm) ? n(m.visSm) : n(m.visSm, 2).replace(/0$/, '');
        const vis = m.cavok ? '10 km or more (CAVOK)' : m.visUnit === 'SM' ? (m.visPlus ? 'more than ' : m.visLess ? 'less than ' : '') + sm + ' SM (' + km + ')' : m.visPlus ? '10 km or more' : km;
        res.push({ label: 'Visibility', value: vis, fmt: 'text', main: true });
      }
      res.push({ label: 'Weather', value: m.wx.length ? m.wx.map(x => x.text).join(', ') : m.cavok ? 'none' : 'none reported', fmt: 'text' });
      res.push({ label: 'Cloud', value: m.cavok ? 'no cloud below 5000 ft, no CB' : m.clouds.length ? m.clouds.map(c => (c.cover === 'VV' ? 'sky obscured, vertical visibility ' : c.cover + ' ') + (c.baseFt != null ? c.baseFt + ' ft' : 'height unknown') + (c.type ? ' ' + c.type : '')).join(' · ') : ({ NSC: 'no significant cloud', NCD: 'no cloud detected', SKC: 'sky clear', CLR: 'clear below 12 000 ft' }[m.noCloud] || 'not reported'), fmt: 'text' });
      res.push({ label: 'Ceiling', value: m.ceilingFt != null ? m.ceilingFt : NaN, unit: 'ft', note: 'lowest broken, overcast or obscured layer' });
      if (m.ceilingFt == null) res[res.length - 1] = { label: 'Ceiling', value: 'none (no BKN or OVC layer)', fmt: 'text' };
      if (m.category) res.push({ label: 'Flight category (US)', value: m.category, fmt: 'text', tone: m.category === 'VFR' ? 'ok' : m.category === 'MVFR' ? 'warn' : 'bad' });
      if (has(m.temp)) {
        const t = m.tempExact ?? m.temp, d = m.dewExact ?? m.dew;
        res.push({ label: 'Temperature / dew point', value: n(t, m.tempExact != null ? 1 : 0) + ' / ' + (has(d) ? n(d, m.dewExact != null ? 1 : 0) : '?') + ' °C', fmt: 'text' });
        if (has(d)) {
          const cb = C.cloudBase({ tempC: t, dewC: d, elevFt: v.elev });
          res.push({ label: 'Relative humidity', value: cb.rh, unit: '%' });
          res.push({ label: 'Cumulus base (estimate)', value: cb.aglFt, unit: 'ft AGL', note: '400 ft per °C of spread' });
          steps.push({ t: 'Cloud base from the temperature / dew-point spread', tex: R`h \approx 400 \times (${n(t, 1)} - ${n(d, 1)}) = ${n(cb.aglFt)}\ \text{ft}` });
        }
      }
      if (has(m.qnh)) {
        res.push({ label: 'QNH', value: m.qnh, q: 'press', d: m.altimeterInHg ? 1 : 0, note: m.altimeterInHg ? 'A' + (m.altimeterInHg * 100).toFixed(0) + ' = ' + m.altimeterInHg.toFixed(2) + ' inHg' : '' });
        if (has(m.temp)) {
          const pa = C.pressureAltitude(v.elev, m.qnh), da = C.densityAltitude(pa, m.tempExact ?? m.temp);
          res.push({ label: 'Density altitude at ' + n(v.elev) + ' ft', value: da.ft, unit: 'ft', tone: da.ft - v.elev > 2000 ? 'warn' : null });
          steps.push({ t: 'Pressure and density altitude of the airfield', tex: R`PA = ${n(v.elev)} + 145\,366\left[1 - \left(\tfrac{${n(m.qnh, 1)}}{1013.25}\right)^{0.1903}\right] = ${n(pa)}\ \text{ft} \qquad DA = ${n(da.ft)}\ \text{ft}` });
        }
      }
      if (m.wind && !m.wind.calm && m.wind.dir != null && v.rwy > 0) {
        const wc = C.windComponents(m.wind.dir, m.wind.speed, v.rwy, m.wind.gust || undefined);
        res.push({ label: `Runway ${pad2(Math.round(C.norm360(v.rwy) / 10) || 36)}: ${wc.head >= 0 ? 'head' : 'tail'}wind / crosswind`, value: n(Math.abs(wc.head)) + ' / ' + n(Math.abs(wc.cross)) + ' kt' + (has(wc.gustCross) ? ' (gusts ' + n(Math.abs(wc.gustCross)) + ')' : ''), fmt: 'text', tone: wc.head < -10 ? 'bad' : wc.head < 0 ? 'warn' : null, note: 'crosswind from the ' + wc.side });
        steps.push({ t: 'Runway wind components', tex: R`HW = ${n(m.wind.speed)}\cos(${n(m.wind.dir)}^\circ - ${n(v.rwy)}^\circ) = ${n(wc.head, 1)} \qquad XW = ${n(m.wind.speed)}\sin(\dots) = ${n(wc.cross, 1)}\ \text{kt}` });
      }
      if (m.rvr.length) notes.push('Runway visual range: ' + m.rvr.map(r => 'RWY ' + r.rwy + ' ' + (r.prefix === 'P' ? 'more than ' : r.prefix === 'M' ? 'less than ' : '') + r.value + (r.max ? '–' + r.max : '') + (r.ft ? ' ft' : ' m') + (r.trend ? { U: ' rising', D: ' falling', N: ' steady' }[r.trend] : '')).join(', ') + '.');
      if (m.recent) notes.push('Recent weather: ' + m.recent.join(', ') + '.');
      if (m.windshear) notes.push('Wind shear reported: ' + m.windshear.trim() + '.');
      if (m.trend) notes.push('Trend: ' + m.trend.replace('NOSIG', 'no significant change expected in the next 2 hours') + '.');
      if (m.remarks) notes.push('Remarks (not decoded): ' + m.remarks);
      if (m.unknown.length) notes.push('Not decoded: ' + m.unknown.join(' '));
      return { results: res, steps, notes };
    }
  });

  add({
    id: 'cloud-base', group: 'Weather', title: 'Cloud base, humidity & freezing level', study: 'clouds-icing',
    desc: 'Estimate the base of cumulus cloud and the freezing level from the surface temperature and dew point.',
    inputs: [
      { k: 't', label: 'Surface temperature', unit: '°C', v: 20, live: s => (s.onGround ? s.oat : undefined) },
      { k: 'td', label: 'Dew point', unit: '°C', v: 12 },
      { k: 'elev', label: 'Ground elevation', unit: 'ft', v: 0, live: s => (s.onGround ? s.altMsl : undefined) }
    ],
    run(v) {
      if (v.td > v.t + 0.05) return { error: 'The dew point cannot be higher than the temperature.' };
      const r = C.cloudBase({ tempC: v.t, dewC: v.td, elevFt: v.elev });
      return {
        results: [
          { label: 'Cumulus base above ground', value: r.aglFt, unit: 'ft', main: true },
          { label: 'Cloud base altitude', value: r.mslFt, unit: 'ft MSL', main: true },
          { label: 'Relative humidity', value: r.rh, unit: '%', tone: r.rh > 90 ? 'warn' : null, note: r.rh > 90 ? 'mist or fog likely, especially overnight' : '' },
          { label: 'Temperature / dew-point spread', value: r.spread, unit: '°C', d: 1 },
          { label: 'Freezing level (estimate)', value: v.t > 0 ? r.freezeMslFt : v.elev, unit: 'ft MSL', note: v.t > 0 ? 'average lapse 2 °C per 1000 ft' : 'freezing at the surface' },
          { label: 'Temperature at the cloud base', value: r.baseTempC, unit: '°C', d: 1, tone: r.baseTempC <= 0 && r.baseTempC > -20 ? 'warn' : null, note: r.baseTempC <= 0 ? 'icing possible in this cloud' : '' }
        ],
        steps: [
          { t: 'The spread closes about 2.5 °C per 1000 ft of rise (dry adiabatic 3 °C minus dew point 0.5 °C)', tex: R`h_{base} = \frac{T - T_d}{2.5} \times 1000 = \frac{${n(v.t, 1)} - ${n(v.td, 1)}}{2.5} \times 1000 = ${n(r.aglFt)}\ \text{ft}` },
          { t: 'Relative humidity (Magnus formula)', tex: R`RH = 100\,e^{\frac{17.625\cdot ${n(v.td, 1)}}{243.04 + ${n(v.td, 1)}} - \frac{17.625\cdot ${n(v.t, 1)}}{243.04 + ${n(v.t, 1)}}} = ${n(r.rh, 1)}\ \%` },
          { t: 'Freezing level with the standard lapse rate', tex: R`h_{0^\circ} = ${n(v.elev)} + \frac{${n(v.t, 1)}}{1.98} \times 1000 = ${n(r.freezeMslFt)}\ \text{ft}` }
        ],
        notes: ['Estimates for convective (cumulus) cloud; layer cloud and fronts do not follow this rule.']
      };
    }
  });

  // ============================================================ RADIO NAVIGATION
  add({
    id: 'dme', group: 'Radio navigation', title: 'DME slant range', study: 'radio-nav',
    desc: 'DME measures the straight line to the station. Get the distance over the ground from your height above the station.',
    inputs: [
      { k: 'dme', label: 'DME reading', unit: 'NM', v: 10, step: 0.1 },
      { k: 'alt', label: 'Aircraft altitude', unit: 'ft', v: 20000, live: s => s.altInd },
      { k: 'stn', label: 'Station elevation', unit: 'ft', v: 0 }
    ],
    run(v) {
      const h = Math.max(0, v.alt - v.stn), r = C.dmeGround({ dmeNm: v.dme, heightFt: h });
      return {
        results: [
          { label: 'Ground distance', value: r.groundNm, unit: 'NM', d: 2, main: true, note: r.overhead ? 'you are overhead: the DME shows your height' : '' },
          { label: 'Height above the station', value: r.heightNm, unit: 'NM', d: 2 },
          { label: 'Slant-range error', value: r.errorNm, unit: 'NM', d: 2, tone: r.errorPct > 5 ? 'warn' : null, note: n(r.errorPct, 1) + ' % of the reading' },
          { label: 'Error below 1 % from', value: r.heightNm * 7.1, unit: 'NM DME', d: 1, note: 'about 7 × the height' }
        ],
        steps: [
          { t: 'Height above the station in nautical miles', tex: R`h = \frac{${n(h)}}{6076} = ${n(r.heightNm, 3)}\ \text{NM}` },
          { t: 'Pythagoras: DME is the hypotenuse', tex: R`d = \sqrt{${n(v.dme, 2)}^2 - ${n(r.heightNm, 3)}^2} = ${n(r.groundNm, 3)}\ \text{NM}` }
        ]
      };
    }
  });

  add({
    id: 'ils', group: 'Radio navigation', title: 'ILS glide path heights', study: 'ils',
    desc: 'Height and altitude on the glide path at any distance from the threshold, and the descent rate for your ground speed.',
    inputs: [
      { k: 'd', label: 'Distance from the threshold', unit: 'NM', v: 5, step: 0.1 },
      { k: 'ang', label: 'Glide path angle', unit: '°', v: 3, step: 0.1 },
      { k: 'tch', label: 'Threshold crossing height', unit: 'ft', v: 50 },
      { k: 'thr', label: 'Threshold elevation', unit: 'ft', v: 131 },
      { k: 'gs', label: 'Ground speed', unit: 'kt', v: 140, live: s => s.gs },
      { k: 'da', label: 'Decision height above the threshold', unit: 'ft', v: 200 }
    ],
    run(v) {
      const g = C.glidePath({ distNm: v.d, angleDeg: v.ang, tchFt: v.tch, gs: v.gs, thrElevFt: v.thr });
      const dDa = Math.max(0, (v.da - v.tch) / g.ftPerNm);
      const table = [1, 2, 3, 4, 5, 6, 8, 10].map(d => d + ' NM ' + n(v.tch + d * g.ftPerNm) + ' ft').join(' · ');
      return {
        results: [
          { label: 'Height above the threshold', value: g.heightFt, unit: 'ft', main: true },
          { label: 'Altitude on the glide path', value: g.altFt, unit: 'ft', main: true },
          { label: 'Descent rate', value: g.vs, unit: 'fpm', main: true },
          { label: 'Glide path gradient', value: g.ftPerNm, unit: 'ft/NM' },
          { label: 'Decision height reached at', value: dDa, unit: 'NM', d: 2, note: n(dDa * 1852) + ' m before the threshold' }
        ],
        steps: [
          { t: 'Height gained per nautical mile on this path', tex: R`6076 \times \tan ${n(v.ang, 1)}^\circ = ${n(g.ftPerNm, 1)}\ \text{ft/NM}` },
          { t: 'Height above the threshold', tex: R`h = ${n(v.tch)} + ${n(v.d, 1)} \times ${n(g.ftPerNm, 1)} = ${n(g.heightFt)}\ \text{ft} \quad \Rightarrow \quad ${n(g.altFt)}\ \text{ft altitude}` },
          { t: 'Descent rate: ground speed in ft/min times the gradient', tex: R`VS = ${n(v.gs)} \times 101.3 \times \tan ${n(v.ang, 1)}^\circ = ${n(g.vs)}\ \text{fpm}` }
        ],
        notes: ['Heights above the threshold: ' + table + '.']
      };
    }
  });

  add({
    id: 'ndb', group: 'Radio navigation', title: 'NDB / ADF bearings', study: 'radio-nav',
    desc: 'The magnetic bearing to and from the beacon, from your heading and the ADF needle.',
    inputs: [
      { k: 'hdg', label: 'Magnetic heading', unit: '°M', v: 350, live: s => s.hdgM },
      { k: 'rb', label: 'Relative bearing (ADF needle)', unit: '°', v: 30, hint: 'clockwise from the nose, 0–360' }
    ],
    run(v) {
      const r = C.ndbBearing({ heading: v.hdg, relBearing: v.rb });
      const rb = C.norm360(v.rb), turn = rb <= 180 ? 'right ' + n(rb) : 'left ' + n(360 - rb);
      return {
        results: [
          { label: 'Bearing to the beacon (QDM)', value: H(r.qdm), fmt: 'hdg', main: true },
          { label: 'Bearing from the beacon (QDR)', value: H(r.qdr), fmt: 'hdg', main: true },
          { label: 'To head straight for it', value: 'turn ' + turn + '°', fmt: 'text', note: 'then keep the needle on the nose (no wind)' }
        ],
        steps: [{ t: 'The needle measures from the nose, so add the heading', tex: R`\text{QDM} = \text{MH} + \text{RB} = ${n(v.hdg)}^\circ + ${n(v.rb)}^\circ = ${n(H(r.qdm))}^\circ \qquad \text{QDR} = ${n(H(r.qdr))}^\circ` }]
      };
    }
  });

  add({
    id: 'compass', group: 'Navigation', title: 'True ⇄ magnetic ⇄ compass heading', study: 'compass',
    desc: 'Convert between true, magnetic and compass headings with variation and deviation (east is positive).',
    inputs: [
      { k: 'from', label: 'Start from', type: 'select', v: 'true', options: [['true', 'True heading'], ['mag', 'Magnetic heading'], ['compass', 'Compass heading']] },
      { k: 'val', label: 'Heading', unit: '°', v: 70, live: (s, v) => (v.from === 'true' ? s.hdgT : v.from === 'mag' ? s.hdgM : undefined) },
      { k: 'var', label: 'Variation (east +, west −)', unit: '°', v: 8, live: s => s.magVar },
      { k: 'dev', label: 'Deviation (east +, west −)', unit: '°', v: -3, hint: 'from the compass correction card' }
    ],
    run(v) {
      const r = C.headings({ from: v.from, value: v.val, variation: v.var, deviation: v.dev });
      return {
        results: [
          { label: 'True', value: H(r.trueHdg), fmt: 'hdg', main: v.from !== 'true' },
          { label: 'Magnetic', value: H(r.magHdg), fmt: 'hdg', main: v.from !== 'mag' },
          { label: 'Compass', value: H(r.compassHdg), fmt: 'hdg', main: v.from !== 'compass' }
        ],
        steps: [
          { t: 'True = magnetic + east variation (subtract east going the other way: “east is least”)', tex: R`${n(H(r.trueHdg))}^\circ = ${n(H(r.magHdg))}^\circ ${v.var >= 0 ? '+' : '-'} ${n(Math.abs(v.var), 1)}^\circ` },
          { t: 'Magnetic = compass + east deviation', tex: R`${n(H(r.magHdg))}^\circ = ${n(H(r.compassHdg))}^\circ ${v.dev >= 0 ? '+' : '-'} ${n(Math.abs(v.dev), 1)}^\circ` }
        ]
      };
    }
  });

  // ======================================================================== CRUISE
  add({
    id: 'step-climb', group: 'Cruise', title: 'Optimum altitude & step climb', study: 'cruise',
    desc: 'The altitude where the wing is most efficient for your weight and Mach, and how much fuel to burn before the next 2000 ft step.',
    inputs: [
      { k: 'ac', label: 'Aircraft', type: 'select', v: 'auto', options: () => [['auto', 'Detected aircraft (or 737-800)']].concat((root.XFC.aircraft ? root.XFC.aircraft.PROFILES : []).filter(p => p.cruiseMach).map(p => [p.id, p.name])) },
      { k: 'mass', label: 'Gross weight now', q: 'mass', v: 70000, live: s => s.mass },
      { k: 'mach', label: 'Cruise Mach', unit: 'M', v: 0.785, step: 0.01, live: s => (s.mach > 0.5 ? s.mach : undefined) },
      { k: 'fl', label: 'Cruising level now', unit: 'FL', v: 350, step: 10, live: s => (s.pa > 18000 ? Math.round(s.pa / 1000) * 10 : undefined) },
      { k: 'ff', label: 'Fuel flow (all engines)', q: 'flow', v: 2500, live: s => (s.ff > 0 ? s.ff : undefined) },
      { k: 'cl', label: 'Best cruise lift coefficient', unit: 'C_L', v: 0.52, step: 0.01, hint: 'about 0.5 for most jet transports' }
    ],
    run(v, ctx) {
      const A = root.XFC.aircraft;
      let p = v.ac !== 'auto' && A && A.byId[v.ac];
      if (!p) p = (ctx && ctx.det && ctx.det.profile && ctx.det.profile.cruiseMach ? ctx.det.profile : null) || (A && A.byId.B738);
      if (!p) return { error: 'No aircraft profile available.' };
      const o = C.optimumAltitude({ massKg: v.mass, wingArea: p.wingArea, mach: v.mach, clOpt: v.cl });
      const cur = v.fl * 100, next = cur + 2000;
      const pNext = C.isa(next - 1000).P;                         // step once the next level is ≤ 1000 ft above optimum
      const wStep = 0.7 * p.wingArea * v.mach * v.mach * v.cl * pNext / C.K.g0;
      const burn = Math.max(0, v.mass - wStep), tMin = v.ff > 0 ? burn / v.ff * 60 : NaN;
      const diff = o.ft - cur;
      const res = [
        { label: 'Optimum altitude', value: 'FL' + String(Math.round(o.ft / 100)).padStart(3, '0'), fmt: 'text', main: true, note: n(o.ft) + ' ft for ' + p.name },
        { label: 'Your level vs optimum', value: diff, unit: 'ft', signed: true, tone: Math.abs(diff) > 3000 ? 'warn' : 'ok', note: diff > 1000 ? 'optimum is above you' : diff < -1000 ? 'you are above optimum' : 'close to optimum' },
        { label: 'Next step: FL' + String(next / 100).padStart(3, '0') + ' after burning', value: burn, q: 'mass', note: burn > 0 ? 'at ' + qn(wStep) + ' kg gross weight' : 'the next level is already within 1000 ft of optimum' },
        { label: 'Time to the step at this fuel flow', value: tMin, fmt: 'min' }
      ];
      if (p.ceilingFt && o.ft > p.ceilingFt) res.push({ label: 'Certified ceiling', value: p.ceilingFt, unit: 'ft', tone: 'warn', note: 'optimum is above the ceiling: fly the ceiling or lower' });
      return {
        results: res,
        steps: [
          { t: 'Lift in terms of Mach and static pressure (½ρV² = 0.7 p M²)', tex: R`W = 0.7\,p\,S\,M^2 C_L \Rightarrow p_{opt} = \frac{${n(v.mass)} \times 9.807}{0.7 \times ${n(p.wingArea, 1)} \times ${n(v.mach, 3)}^2 \times ${n(v.cl, 2)}} = ${n(o.p)}\ \text{Pa}` },
          { t: 'The ISA altitude with that pressure', tex: R`h(${n(o.hPa, 1)}\ \text{hPa}) = ${n(o.ft)}\ \text{ft}` },
          { t: 'Weight at which FL' + next / 100 + ' is within 1000 ft of optimum', tex: R`W_{step} = \frac{0.7\,p(${n(next - 1000)}\ \text{ft})\,S\,M^2 C_L}{g} = ${n(wStep)}\ \text{kg}` }
        ],
        notes: ['Real maximum altitude is also limited by thrust and by a 1.3 g buffet margin; the FMS shows it as MAX ALT.']
      };
    }
  });

  // ==================================================================== OPERATIONS
  add({
    id: 'wake', group: 'Operations', title: 'Wake turbulence separation', study: 'wake',
    desc: 'ICAO wake categories from the maximum take-off mass, and the separation you need behind the aircraft ahead.',
    inputs: [
      { k: 'lead', label: 'Aircraft ahead', type: 'select', v: 'H', options: [['J', 'Super — A380'], ['H', 'Heavy — 136 t or more'], ['M', 'Medium — 7 t to 136 t'], ['L', 'Light — up to 7 t']] },
      { k: 'mtow', label: 'Your maximum take-off mass', q: 'mass', v: 79016, live: s => s.mtow }
    ],
    run(v) {
      const f = C.wakeCategory(v.mtow), r = C.wakeSeparation(v.lead, f);
      return {
        results: [
          { label: 'Your wake category', value: C.WAKE_NAMES[f], fmt: 'text', main: true },
          { label: 'Radar separation on approach', value: r.distanceNm || r.radarMinimumNm, unit: 'NM', main: true, tone: r.wakeApplies ? 'warn' : null, note: r.wakeApplies ? 'wake turbulence minimum' : 'no wake minimum: normal radar separation' },
          { label: 'Departure behind it', value: r.departureMin ? r.departureMin + ' minutes' : 'no wake interval', fmt: 'text' }
        ],
        steps: [],
        notes: ['ICAO Doc 4444. Categories: Light ≤ 7 000 kg, Medium < 136 000 kg, Heavy ≥ 136 000 kg, Super = A380. Europe’s RECAT-EU uses six categories with shorter distances.']
      };
    }
  });

  // ---------------------------------------------------------- departure profile (NADP / engine failure)
  const depAircraft = (v, ctx) => {
    const A = root.XFC.aircraft;
    const det = (ctx && ctx.det) || (root.XFC.app && root.XFC.app.live && root.XFC.app.live.det);
    return (v.ac !== 'auto' && A && A.byId[v.ac]) || (det && det.profile) || (A && A.byId.B738);
  };
  const DEP_NAME = { nadp1: 'NADP 1', nadp2: 'NADP 2', custom: 'Airline standard', eo: 'Engine failure', aeo: 'All engines' };
  add({
    id: 'nadp', group: 'Operations', title: 'Departure profile: NADP & engine failure', study: 'nadp',
    desc: 'Thrust reduction and acceleration for NADP 1, NADP 2 or your airline standard — or an engine failure at V1 — flown second by second with the energy equation for your aircraft, weight and airport. Gives the FMS entries and draws the climb.',
    inputs: [
      { k: 'ac', label: 'Aircraft', type: 'select', v: 'auto', options: () => [['auto', 'Detected aircraft (or 737-800)']].concat((root.XFC.aircraft ? root.XFC.aircraft.PROFILES : []).map(p => [p.id, p.name])) },
      { k: 'proc', label: 'Procedure', type: 'select', v: 'nadp2', options: [['nadp1', 'NADP 1 — close-in'], ['nadp2', 'NADP 2 — distant'], ['custom', 'Airline standard (your heights)'], ['eo', 'Engine failure at V1']] },
      { k: 'flap', label: 'Take-off flaps', type: 'select', v: 'def', options: v => { const p = depAircraft(v), pre = p.policy === 'airbus' ? 'CONF ' : 'Flaps ', d = p.takeoffFlaps.find(f => f.def) || p.takeoffFlaps[0]; return [['def', 'Type default (' + pre + d.id + ')']].concat(p.takeoffFlaps.map(f => [f.id, pre + f.id])); } },
      { k: 'mass', label: 'Take-off mass', q: 'mass', v: 70000, live: s => s.mass },
      { k: 'elev', label: 'Airport elevation', unit: 'ft', v: 131, live: s => (s.onGround ? s.altMsl : undefined) },
      { k: 'oat', label: 'Outside air temperature', unit: '°C', v: 15, live: s => s.oat },
      { k: 'qnh', label: 'QNH', q: 'press', v: 1013, live: s => s.qnh },
      { k: 'wind', label: 'Headwind (− tailwind)', unit: 'kt', v: 0 },
      { k: 'thr', label: 'Take-off thrust', unit: '% TOGA', v: 100, step: 1, hint: 'below 100 for a FLEX / assumed-temperature take-off' },
      { k: 'v2add', label: 'Initial climb speed V2 +', unit: 'kt', v: 15, step: 1, show: v => v.proc !== 'eo', hint: 'ICAO: 10 to 20 kt' },
      { k: 'thr1', label: 'Thrust reduction height', unit: 'ft AAL', v: 800, step: 100, show: v => v.proc === 'nadp1', hint: 'at least 800 ft; acceleration at 3000 ft' },
      { k: 'acc2', label: 'Acceleration height', unit: 'ft AAL', v: 800, step: 100, show: v => v.proc === 'nadp2', hint: 'at least 800 ft; thrust reduced with the first flap retraction' },
      { k: 'thrC', label: 'Thrust reduction height', unit: 'ft AAL', v: 1500, step: 100, show: v => v.proc === 'custom' },
      { k: 'accC', label: 'Acceleration height', unit: 'ft AAL', v: 1500, step: 100, show: v => v.proc === 'custom' },
      { k: 'accE', label: 'Engine-out acceleration height', unit: 'ft AAL', v: 1000, step: 100, show: v => v.proc === 'eo', hint: 'set for each runway (obstacles); at least 400 ft' },
      { k: 'cmp', label: 'Compare with', type: 'select', v: 'yes', options: v => [['yes', v.proc === 'nadp1' ? 'NADP 2' : v.proc === 'eo' ? 'all engines' : 'NADP 1'], ['no', 'nothing']] }
    ],
    run(v, ctx) {
      const P = root.XFC.perf, F = root.XFC.figures;
      if (!P) return { error: 'The performance model is not loaded.' };
      const p = depAircraft(v, ctx);
      const flap = p.takeoffFlaps.some(f => f.id === v.flap) ? v.flap : (p.takeoffFlaps.find(f => f.def) || p.takeoffFlaps[0]).id;
      const base = { mass: v.mass, flap, elevFt: v.elev, qnh: v.qnh, oatC: v.oat, thrustPct: v.thr, headwind: v.wind, v2Add: v.v2add };
      const set = { nadp1: { thrRedFt: v.thr1 }, nadp2: { accFt: v.acc2 }, custom: { thrRedFt: v.thrC, accFt: v.accC }, eo: { accFt: v.accE }, aeo: { thrRedFt: 1500, accFt: 1500 } };
      const fly = proc => P.departureProfile(p, Object.assign({ proc: proc === 'aeo' ? 'custom' : proc }, base, set[proc]));
      const r = fly(v.proc);
      const airbus = p.policy === 'airbus', cf = airbus ? 'CONF ' : 'flaps ';
      const msl = h => qn(Math.round((v.elev + h) / 10) * 10);
      const ev = (res, key) => res.events.find(e => e.key === key);
      const sp = r.speeds, cu = r.cleanup, pc = g => n(g * 100, 1);
      const clean = cu.steps.map(s => s.label + ' at ' + n(s.at)).join(' · ') + ' · ' + cu.cleanName + ' ' + n(cu.vClean) + ' kt';
      const notes = ['A study model: thrust lapses with Mach, altitude and temperature; drag comes from a simple polar for each flap stage; while accelerating 60 % of the spare energy goes into speed. Your aircraft’s FMS and your airline’s procedures are the reference.'];
      const kN = x => n(x / 1000, 1);
      if (v.proc === 'eo') {
        if (r.cannotClimb) {
          return { results: [{ label: 'One engine out', value: 'Cannot climb', fmt: 'text', main: true, tone: 'bad', note: 'gradient ' + pc(r.gradients.first) + ' % with the gear down' },
            { label: 'Aircraft', value: p.name + ', ' + qn(v.mass) + ' kg', fmt: 'text' }],
            steps: [], notes: ['Too heavy for this temperature and elevation: reduce the take-off mass, use more flap or full thrust, or wait for cooler air. This is the climb (WAT) limit.'].concat(notes) };
        }
        const g = r.gradients, acc = ev(r, 'acc'), mct = ev(r, 'mct'), aeo = v.cmp === 'yes' ? fly('aeo') : null;
        const s2 = g.secondAt || {}, sf = g.finalAt || {}, tTo = mct ? mct.t : r.time;
        const res = [
          { label: '2nd-segment gradient (gross)', value: g.second * 100, unit: '%', d: 1, main: true, tone: g.second >= r.minGrad.second ? 'ok' : 'bad', note: 'minimum ' + pc(r.minGrad.second) + ' % · net ' + pc(g.second - r.netCut) + ' %' },
          { label: airbus ? 'ENG OUT ACC (MCDU, ft above sea level)' : 'EO ACCEL HT (FMC, ft above the runway)', value: airbus ? msl(r.accFt) : qn(r.accFt) + ' FT', fmt: 'text', main: true, note: airbus ? r.accFt + ' ft above the airport' : 'altitude ' + msl(r.accFt) + ' ft' },
          { label: 'V2 — fly it (or up to V2 + 15)', value: sp.v2, unit: 'kt' },
          { label: '1st-segment gradient (gear down)', value: g.first * 100, unit: '%', d: 1, tone: g.first > r.minGrad.first ? 'ok' : 'bad', note: 'must be above ' + pc(r.minGrad.first) + ' %' },
          { label: 'Final-segment gradient (clean, MCT)', value: g.final * 100, unit: '%', d: 1, tone: g.final >= r.minGrad.final ? 'ok' : 'bad', note: 'minimum ' + pc(r.minGrad.final) + ' %' },
          { label: 'Clean-up', value: clean, fmt: 'text' },
          { label: 'Take-off thrust used for', value: tTo / 60, fmt: 'min', tone: tTo <= 600 ? 'ok' : 'bad', note: 'limit 10 min with an engine out' },
          { label: '1500 ft above the airport after', value: r.pts[r.pts.length - 1].x, unit: 'NM', d: 1, note: 'from brake release' }
        ];
        return {
          results: res,
          figure: F ? F.toSegments(r, aeo) : null,
          figCaption: 'The take-off flight path with one engine out: 1st segment (gear retracting), 2nd (V2, take-off flaps), 3rd (level acceleration, flaps up), final (clean, maximum continuous thrust).' + (aeo ? ' Dashed: all engines.' : ''),
          steps: [
            { t: '2nd segment: gear up, take-off flaps, V2, ' + (r.engines - 1) + ' of ' + r.engines + ' engines (7.2)', tex: R`\gamma = \frac{T - D}{W} = \frac{${kN(s2.T)} - ${kN(s2.D)}}{${kN(s2.W)}}\ \text{kN} = ${pc(g.second)}\,\% \;${g.second >= r.minGrad.second ? R`\ge` : '<'}\; ${pc(r.minGrad.second)}\,\%` },
            { t: 'Net gradient for obstacle clearance (7.4)', tex: R`\gamma_{net} = ${pc(g.second)} - ${pc(r.netCut)} = ${pc(g.second - r.netCut)}\,\%` },
            { t: 'Level acceleration at the EO acceleration height: all the spare energy goes into speed (7.5)', tex: R`\frac{1}{g}\frac{dV}{dt} = \frac{T - D}{W} \;\Rightarrow\; V_2 = ${n(sp.v2)} \to ${n(cu.vClean)}\ \text{kt in } ${n(mct && acc ? mct.t - acc.t : 0)}\ \text{s}` },
            { t: 'Final segment: clean, maximum continuous thrust', tex: R`\gamma = \frac{${kN(sf.T)} - ${kN(sf.D)}}{${kN(sf.W)}} = ${pc(g.final)}\,\% \;${g.final >= r.minGrad.final ? R`\ge` : '<'}\; ${pc(r.minGrad.final)}\,\%` }
          ],
          notes: ['Fly V2 (or the speed at the failure, up to V2 + 15), no flap change below 400 ft, level off at the engine-out acceleration height, clean up, then set maximum continuous thrust and climb at ' + cu.cleanName + '.'].concat(notes)
        };
      }
      // all engines: NADP 1, NADP 2 or the airline standard
      const other = v.cmp === 'yes' ? fly(v.proc === 'nadp1' ? 'nadp2' : 'nadp1') : null;
      const thrRed = ev(r, 'thrRed'), acc = ev(r, 'acc'), h3 = ev(r, 'h3000'), ref = r.at(3.51);
      const firstTo = cu.steps.length ? cu.steps[0].to : 'UP';
      const fms = v.proc === 'nadp1' ? [r.thrRedFt, 3000] : v.proc === 'nadp2' ? [r.accFt, r.accFt] : [r.thrRedFt, r.accFt];
      const res = [
        { label: airbus ? 'THR RED / ACC (MCDU, ft above sea level)' : 'THR REDUCTION / ACCEL HT (FMC, above the runway)', fmt: 'text', main: true,
          value: airbus ? msl(fms[0]) + ' / ' + msl(fms[1]) : (v.proc === 'nadp2' && p.maneuver ? 'FLAPS ' + firstTo : qn(fms[0]) + ' FT') + ' / ' + qn(fms[1]) + ' FT',
          note: airbus ? 'heights ' + qn(fms[0]) + ' / ' + qn(fms[1]) + ' ft above the airport' : 'altitudes ' + msl(fms[0]) + ' / ' + msl(fms[1]) + ' ft' },
        { label: 'V2 → initial climb', value: n(sp.v2) + ' → ' + n(r.vInit) + ' kt', fmt: 'text', main: true, note: 'V2 + ' + r.v2Add + ' kt with ' + cf + sp.flap },
        { label: 'Clean-up', value: clean, fmt: 'text', note: v.proc === 'nadp2' ? 'then ' + n(cu.vClean + 10) + ' kt to 3000 ft' : '' },
        { label: 'Over 6.5 km from brake release', value: ref ? ref.h : NaN, unit: 'ft', note: ref ? n(ref.v) + ' kt, ' + (ref.thr === 'TO' ? 'take-off thrust' : 'climb thrust') + ', ' + (ref.stage === 0 ? cf + sp.flap : ref.stage >= cu.steps.length ? 'clean' : 'flaps retracting') : '' },
        { label: '3000 ft above the airport after', value: h3 ? h3.x : NaN, unit: 'NM', d: 1, note: h3 ? n(h3.t) + ' s after lift-off' : '' },
        { label: 'Fuel to ' + qn(r.toFt) + ' ft and ' + n(Math.max(r.climbKt, cu.vClean + 10)) + ' kt', value: r.fuel, q: 'mass' }
      ];
      if (other) {
        const o = other.at(3.51), dh = ref && o ? ref.h - o.h : NaN, df = r.fuel - other.fuel;
        res.push({ label: 'Compared with ' + DEP_NAME[other.proc], value: (dh >= 0 ? '+' : '') + qn(dh) + ' ft at 6.5 km · ' + (df >= 0 ? '+' : '') + qn(df) + ' kg fuel', fmt: 'text' });
      }
      if ((v.proc === 'nadp1' && v.thr1 < 800) || (v.proc === 'nadp2' && v.acc2 < 800)) notes.unshift('ICAO: a noise-abatement procedure never starts below 800 ft above the airport.');
      if (v.proc === 'nadp1' && v.thr1 > 3000) notes.unshift('NADP 1 reduces thrust before 3000 ft, where it accelerates.');
      const a0 = r.gradients.aeoAt || {};
      const eh = kt => Math.pow(kt * C.K.KT, 2) / (2 * C.K.g0) / C.K.FT;
      const vTop = Math.max(r.climbKt, cu.vClean + 10);
      const runs = [{ r, cls: 'acc', label: DEP_NAME[v.proc] }].concat(other ? [{ r: other, cls: 'sel', label: DEP_NAME[other.proc], dash: true }] : []);
      return {
        results: res,
        figure: F ? F.depProfile(runs, { refNm: 3.5, refLabel: '6.5 km from brake release' }) : null,
        figCaption: 'Height and speed against distance from brake release. Markers: thrust reduction (THR RED), acceleration (ACC), each flap step and clean.' + (other ? ' Dashed: ' + DEP_NAME[other.proc] + ' for comparison.' : ''),
        steps: [
          { t: 'Speeds from the lift equation (topic 5.2): V2 ≥ 1.13 × the 1-g stall speed with ' + cf + sp.flap, tex: R`V_2 = ${n(sp.v2)}\ \text{kt} \qquad V_2 + ${r.v2Add} = ${n(r.vInit)}\ \text{kt}` },
          { t: 'Climb gradient with take-off thrust: spare thrust ÷ weight (7.1)', tex: R`\gamma = \frac{T - D}{W} = \frac{${kN(a0.T)} - ${kN(a0.D)}}{${kN(a0.W)}}\ \text{kN} = ${pc(r.gradients.aeo)}\,\% \;\Rightarrow\; VS \approx 101.3 \times ${n(a0.tas)} \times ${n(r.gradients.aeo, 3)} = ${qn(101.27 * a0.tas * r.gradients.aeo)}\ \text{fpm}` },
          { t: 'Thrust reduction: ' + (thrRed ? 'at ' + qn(thrRed.h) + ' ft — climb thrust is about 85 % of take-off thrust' : 'none'), tex: R`T_{CLB} \approx 0.85\,T_{TO}` },
          { t: 'Acceleration at ' + (acc ? qn(acc.h) + ' ft' : '—') + ': the spare energy is shared, 60 % into speed and 40 % into climb (7.5)', tex: R`\sin\gamma = 0.4\,\frac{T - D}{W}, \qquad \frac{1}{g}\frac{dV}{dt} = 0.6\,\frac{T - D}{W}` },
          { t: 'The whole acceleration costs this much energy height (7.6)', tex: R`\Delta h_E = \frac{V_{end}^2 - V_{start}^2}{2g} = ${qn(eh(vTop) - eh(r.vInit))}\ \text{ft} \quad (${n(r.vInit)} \to ${n(vTop)}\ \text{kt})` }
        ],
        notes
      };
    }
  });

  // ====================================================================== AIRSPEED
  add({
    id: 'va', group: 'Airspeed', title: 'Manoeuvring speed at your weight', study: 'vspeeds',
    desc: 'Va falls with the square root of weight: scale the handbook value to today’s mass, or derive it from the stall speed.',
    inputs: [
      { k: 'vaMax', label: 'Handbook Va (at maximum weight)', unit: 'kt', v: 105 },
      { k: 'mMax', label: 'Maximum weight', q: 'mass', v: 1157, live: s => (s.mtow > 0 ? s.mtow : undefined) },
      { k: 'm', label: 'Weight now', q: 'mass', v: 950, live: s => s.mass },
      { k: 'vs', label: 'Stall speed clean at maximum weight (Vs1)', unit: 'kt', v: 53 },
      { k: 'nlim', label: 'Category', type: 'select', v: '3.8', options: [['3.8', 'Normal (3.8 g)'], ['4.4', 'Utility (4.4 g)'], ['6', 'Aerobatic (6 g)'], ['2.5', 'Transport (2.5 g)']] }
    ],
    run(v) {
      const k = Math.sqrt(v.m / v.mMax), nl = +v.nlim;
      const va = v.vaMax * k, vsNow = v.vs * k;
      return {
        results: [
          { label: 'Va at this weight', value: va, unit: 'kt', main: true, tone: 'ok' },
          { label: 'From the stall speed: Vs√n', value: vsNow * Math.sqrt(nl), unit: 'kt', note: 'at this weight, ' + nl + ' g limit' },
          { label: 'Stall speed at this weight', value: vsNow, unit: 'kt' },
          { label: 'Change from the handbook value', value: (k - 1) * 100, unit: '%', d: 1, signed: true }
        ],
        steps: [
          { t: 'Speeds based on the stall scale with the square root of weight', tex: R`V_A = ${n(v.vaMax)}\sqrt{\frac{${n(v.m)}}{${n(v.mMax)}}} = ${n(va, 1)}\ \text{kt}` },
          { t: 'Definition: a full deflection reaches the stall at the limit load factor', tex: R`V_A = V_S\sqrt{n_{lim}} = ${n(vsNow, 1)}\sqrt{${nl}} = ${n(vsNow * Math.sqrt(nl), 1)}\ \text{kt}` }
        ],
        notes: ['Va protects against one full control deflection at a time, not rapid reversals. In turbulence fly at or below Va for your weight.']
      };
    }
  });

  // ======================================================================= UNITS
  const UNITS = {
    speed: { name: 'Speed', u: { kt: ['knots', 1], kmh: ['km/h', 1 / 1.852], mph: ['mph', 1.609344 / 1.852], ms: ['m/s', 3600 / 1852], mach: ['Mach (sea level ISA)', 661.4788] } },
    dist: { name: 'Distance', u: { nm: ['nautical miles', 1], km: ['kilometres', 1 / 1.852], sm: ['statute miles', 1.609344 / 1.852] } },
    alt: { name: 'Height', u: { ft: ['feet', 1], m: ['metres', 1 / 0.3048], fl: ['flight level', 100] } },
    press: { name: 'Pressure', u: { hPa: ['hPa / mbar', 1], inHg: ['inHg', 33.8638866667], mmHg: ['mmHg', 1.33322368], psi: ['psi', 68.9475729] } },
    mass: { name: 'Mass', u: { kg: ['kilograms', 1], lb: ['pounds', 0.45359237], t: ['tonnes', 1000] } },
    vol: { name: 'Volume', u: { L: ['litres', 1], usg: ['US gallons', 3.785411784], ig: ['imperial gallons', 4.54609] } },
    vs: { name: 'Vertical speed', u: { fpm: ['ft/min', 1], ms: ['m/s', 196.850394] } },
    temp: { name: 'Temperature', u: { c: ['°C'], f: ['°F'], k: ['K'] } }
  };
  add({
    id: 'units', group: 'Units', title: 'Unit converter', study: null,
    desc: 'Everyday aviation conversions.',
    inputs: [
      { k: 'cat', label: 'Quantity', type: 'select', v: 'press', options: Object.entries(UNITS).map(([k, u]) => [k, u.name]) },
      { k: 'from', label: 'From', type: 'select', v: 'inHg', options: v => Object.entries(UNITS[v.cat].u).map(([k, u]) => [k, u[0]]) },
      { k: 'val', label: 'Value', unit: '', v: 29.92, step: 0.01 }
    ],
    run(v) {
      const cat = UNITS[v.cat];
      if (!cat.u[v.from]) return { error: 'Pick a unit.' };
      if (v.cat === 'temp') {
        const c = v.from === 'c' ? v.val : v.from === 'f' ? C.units.fToC(v.val) : v.val - 273.15;
        return { results: [{ label: '°C', value: c, d: 2 }, { label: '°F', value: C.units.cToF(c), d: 2 }, { label: 'K', value: c + 273.15, d: 2 }], steps: [] };
      }
      const base = v.val * cat.u[v.from][1];
      return {
        results: Object.entries(cat.u).map(([k, u]) => ({ label: u[0], value: base / u[1], d: Math.abs(base / u[1]) < 10 ? 3 : Math.abs(base / u[1]) < 1000 ? 2 : 0, main: k !== v.from && false })),
        steps: []
      };
    }
  });

  root.XFC.calculators = list;
  root.XFC.calcGroups = ['Wind', 'Airspeed', 'Atmosphere', 'Weather', 'Vertical', 'Turns', 'Navigation', 'Radio navigation', 'Cruise', 'Fuel', 'Mass & balance', 'Light aircraft', 'Operations', 'Units'];
})(typeof self !== 'undefined' ? self : this);
