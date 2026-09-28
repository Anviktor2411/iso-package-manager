// Node tests for web/js/calc.js — run: node tests/test_calc.js
const C = require('../web/js/calc.js');
let pass = 0, fail = 0;
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: got ${Number(got).toFixed(4)} want ${want} ±${tol}`);
}
function eq(name, got, want) {
  const ok = got === want; if (ok) pass++; else fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: got ${got} want ${want}`);
}

// ISA — published standard-atmosphere table values
const isaTable = [
  [0, 15.0, 1013.25, 1.2250], [5000, 5.09, 843.07, 1.0555], [10000, -4.81, 696.82, 0.9046],
  [20000, -24.62, 465.63, 0.6527], [30000, -44.44, 300.90, 0.4583], [40000, -56.5, 187.54, 0.3016],
  [50000, -56.5, 115.97, 0.1865]
];
for (const [ft, t, p, rho] of isaTable) {
  const r = C.isa(ft);
  near(`ISA T @${ft}`, r.Tc, t, 0.02);
  near(`ISA P @${ft}`, r.hPa, p, 0.1);
  near(`ISA rho @${ft}`, r.rho, rho, 0.0005);
}
near('a0 (kt)', C.K.a0kt, 661.48, 0.01);
near('pressure alt of 1013.25', C.pressureAltFt(1013.25), 0, 0.01);
near('pressure alt of 696.82 hPa', C.pressureAltFt(696.82), 10000, 2);
near('pressure alt of 187.54 hPa', C.pressureAltFt(187.54), 40000, 3);
near('pressure alt of 50 hPa (strat 2)', C.pressureAltM(5000), 20576, 5); // 50 hPa ≈ 20.58 km
near('PA: elev 500 ft, QNH 1003 → ~779 ft', C.pressureAltitude(500, 1003), 500 + 280, 3);

// density altitude
const da = C.densityAltitude(5000, 30);
near('DA exact 5000 ft / 30°C', da.ft, 7800, 15);
near('DA approx 5000 ft / 30°C', da.approxFt, 7960, 10);
near('DA at ISA equals PA', C.densityAltitude(8000, C.isaTempC(8000)).ft, 8000, 0.5);

// airspeeds
const t1 = C.casToTas(250, 10000, C.isaTempC(10000));
near('CAS 250 @FL100 ISA → TAS', t1.tas, 288.7, 0.3);
near('CAS 250 @FL100 ISA → Mach', t1.mach, 0.4523, 0.0005);
near('M0.78 @FL350 ISA → CAS', C.machToCas(0.78, 35000), 264.4, 0.3);
near('M0.78 @FL350 ISA → TAS', C.machToTas(0.78, C.isaTempC(35000)), 449.6, 0.3);
near('round trip CAS→TAS→CAS', C.tasToCas(t1.tas, 10000, C.isaTempC(10000)).cas, 250, 1e-6);
near('CAS = TAS = EAS at SL ISA', C.casToTas(150, 0, 15).tas, 150, 1e-6);
near('Crossover 300/.78', C.crossoverAltitude(300, 0.78).ft, 29316, 20);
near('Crossover 280/.78', C.crossoverAltitude(280, 0.78).ft, 32465, 25);
near('TAT from SAT −50 °C at M0.8', C.tatFromSat(-50, 0.8), -21.44, 0.05);
near('SAT from TAT inverse', C.satFromTat(C.tatFromSat(-50, 0.8), 0.8), -50, 1e-9);

// wind
const w = C.windTriangle({ tas: 120, course: 90, windFrom: 40, windSpeed: 25 });
near('WT heading', w.heading, 80.82, 0.05);
near('WT GS', w.gs, 102.4, 0.1);
const fw = C.findWind({ tas: 120, heading: w.heading, gs: w.gs, track: 90 });
near('find wind dir', fw.windFrom, 40, 0.01);
near('find wind spd', fw.windSpeed, 25, 0.01);
const wc = C.windComponents(300, 20, 260);
near('XW comp (40° off, 20 kt)', wc.cross, 20 * Math.sin(C.rad(40)), 1e-9);
near('HW comp', wc.head, 20 * Math.cos(C.rad(40)), 1e-9);
eq('XW side', wc.side, 'right');
eq('XW side left', C.windComponents(220, 20, 260).side, 'left');

// vertical
near('VS for 3° at 140 kt', C.vsForAngle(140, 3), 743.0, 0.5);
const d = C.descent({ fromFt: 35000, toFt: 3000, gs: 420, angleDeg: 3 });
near('3° path distance for 32 000 ft', d.pathNm, 100.5, 0.2);
near('climb gradient 3.3 % → ft/NM', C.climbGradient({ percent: 3.3 }).ftPerNm, 200.5, 0.2);
near('glide 5000 ft L/D 9 still air', C.glide({ heightFt: 5000, ld: 9 }).stillAirNm, 7.406, 0.01);

// turns
const tr = C.turn({ tas: 120, bank: 30 });
near('turn radius 120 kt 30°', tr.radiusM, 673.1, 0.5);
near('turn rate 120 kt 30°', tr.rateDps, 5.255, 0.005);
near('load factor 60°', C.turn({ tas: 120, bank: 60 }).n, 2, 1e-9);
near('std-rate bank 120 kt', C.bankForRate(120, 3), 18.24, 0.02);

// navigation
const gc = C.greatCircle(40.6398, -73.7789, 51.4700, -0.4543);
near('JFK–LHR great circle NM', gc.distNm, 2991, 10);
near('JFK–LHR initial bearing', gc.initial, 51.4, 0.6);
const s60 = C.oneInSixty({ distFlown: 30, offTrack: 3, distRemaining: 60 });
near('1-in-60 total', s60.total, 9, 1e-9);

// holding (right-hand)
eq('hold R inbound 090 hdg 210 → teardrop', C.holdingEntry({ inbound: 90, heading: 210, turn: 'R' }).entry, 'teardrop');
eq('hold R inbound 360 hdg 090 → direct', C.holdingEntry({ inbound: 360, heading: 90, turn: 'R' }).entry, 'direct');
eq('hold R inbound 360 hdg 270 → parallel', C.holdingEntry({ inbound: 360, heading: 270, turn: 'R' }).entry, 'parallel');
eq('hold R inbound 360 hdg 150 → teardrop', C.holdingEntry({ inbound: 360, heading: 150, turn: 'R' }).entry, 'teardrop');
eq('hold R inbound 360 hdg 210 → parallel', C.holdingEntry({ inbound: 360, heading: 210, turn: 'R' }).entry, 'parallel');
eq('hold L inbound 360 hdg 210 → teardrop', C.holdingEntry({ inbound: 360, heading: 210, turn: 'L' }).entry, 'teardrop');
eq('hold L inbound 360 hdg 150 → parallel', C.holdingEntry({ inbound: 360, heading: 150, turn: 'L' }).entry, 'parallel');
near('teardrop heading R', C.holdingEntry({ inbound: 360, heading: 150, turn: 'R' }).teardropHeading, 150, 1e-9);

// altimetry
const ct = C.coldTempCorrection({ heightFt: 1000, aerodromeTempC: -10, aerodromeElevFt: 0 });
near('cold temp accurate 1000 ft −10 °C', ct.correctionFt, 95.8, 0.5);
near('cold temp simplified', ct.simplifiedFt, 95.4, 0.5);
near('true height ISA dev 0', C.trueHeight(3000, 0, 0), 3000, 1e-6);
near('true height −20 °C dev ~7.5 % low', C.trueHeight(3000, -20, 0), 3000 * (1 - 0.0734), 25);

// mass & balance
const mb = C.massBalance([{ mass: 1000, arm: 2 }, { mass: 500, arm: 3.5 }], { lemac: 2.2, length: 1.5 });
near('W&B CG', mb.cg, 2.5, 1e-9);
near('W&B %MAC', mb.pctMac, 20, 1e-9);

// GA runway factors — 10 % heavier take-off ≈ ×1.21, landing ×1.1
near('GA TO weight factor', C.gaRunway({ phase: 'to', base: 1000, baseMass: 1000, mass: 1100, elevFt: 0, tempC: 15, safety: false }).distance, 1210, 1e-6);
near('GA LDG wet grass', C.gaRunway({ phase: 'ldg', base: 1000, elevFt: 0, tempC: 15, surface: 'wetGrass', safety: false }).distance, 1350, 1e-6);

// Weather: humidity, cloud base, METAR decoding
near('RH 20/10 °C (Magnus)', C.relHumidity(20, 10), 52.7, 0.3);
near('RH saturated', C.relHumidity(12, 12), 100, 1e-9);
near('cloud base 400 ft/°C', C.cloudBase({ tempC: 20, dewC: 12 }).aglFt, 3200, 1e-9);
near('freezing level 15 °C → ~7600 ft', C.cloudBase({ tempC: 15, dewC: 5 }).freezeAglFt, 7576, 1);
const mt = C.parseMetar('METAR EETN 271420Z 24012G22KT 200V280 9999 -SHRA FEW025CB SCT040 BKN080 12/08 Q1009 NOSIG');
eq('METAR station', mt.station, 'EETN');
eq('METAR wind dir', mt.wind.dir, 240);
eq('METAR gust', mt.wind.gust, 22);
eq('METAR variable from', mt.wind.varFrom, 200);
eq('METAR vis 9999 → 10 km', mt.visM, 10000);
eq('METAR wx', mt.wx[0].text, 'light showers of rain');
eq('METAR CB', mt.clouds[0].type, 'CB');
eq('METAR ceiling (BKN080)', mt.ceilingFt, 8000);
eq('METAR temp', mt.temp, 12);
eq('METAR QNH', mt.qnh, 1009);
eq('METAR trend', mt.trend, 'NOSIG');
eq('METAR category', mt.category, 'VFR');
eq('METAR no unknown groups', mt.unknown.length, 0);
const us = C.parseMetar('KJFK 271451Z 31015G25KT 1 1/2SM +TSRA BR BKN008 OVC015CB M02/M05 A2992 RMK AO2 T10171050');
eq('US vis 1 1/2SM', us.visSm, 1.5);
eq('US thunderstorm', us.wx[0].text, 'heavy thunderstorm with rain');
eq('US ceiling', us.ceilingFt, 800);
eq('US category IFR', us.category, 'IFR');
eq('US negative temp', us.temp, -2);
near('US altimeter → hPa', us.qnh, 1013.2, 0.1);
eq('US T-group precise temp', us.tempExact, -1.7);
eq('US T-group precise dew', us.dewExact, -5);
const mps = C.parseMetar('UUEE 271430Z 18005MPS CAVOK M10/M15 Q1030');
near('wind in m/s → kt', mps.wind.speed, 9.72, 0.01);
eq('CAVOK', mps.cavok, true);
eq('VCSH', C.decodeWx('VCSH'), 'showers in the vicinity');
eq('FZFG', C.decodeWx('FZFG'), 'freezing fog');
eq('LIFR by visibility', C.parseMetar('EGLL 271420Z 00000KT 0400 FG VV002 08/08 Q1022').category, 'LIFR');
eq('calm wind', C.parseMetar('EGLL 271420Z 00000KT 0400 FG VV002 08/08 Q1022').wind.calm, true);

// Radio navigation
near('DME overhead: 1 NM DME at 1 NM height', C.dmeGround({ dmeNm: 1, heightFt: C.K.FT_PER_NM }).groundNm, 0, 1e-9);
near('DME slant: 10 NM at 6076 ft', C.dmeGround({ dmeNm: 10, heightFt: 6076.12 }).groundNm, Math.sqrt(99), 1e-3);
near('glide path 3° at 5 NM, TCH 50', C.glidePath({ distNm: 5, angleDeg: 3, tchFt: 50 }).heightFt, 50 + 5 * 318.44, 0.5);
eq('true→mag→compass (VAR 5E, DEV 2W)', JSON.stringify(C.headings({ from: 'true', value: 100, variation: 5, deviation: -2 })), JSON.stringify({ trueHdg: 100, magHdg: 95, compassHdg: 97 }));
eq('compass→true', C.headings({ from: 'compass', value: 97, variation: 5, deviation: -2 }).trueHdg, 100);
eq('NDB QDM = MH + RB', C.ndbBearing({ heading: 350, relBearing: 30 }).qdm, 20);
eq('NDB QDR', C.ndbBearing({ heading: 350, relBearing: 30 }).qdr, 200);

// Operations
eq('wake cat 737', C.wakeCategory(79000), 'M');
eq('wake cat 777', C.wakeCategory(351534), 'H');
eq('wake cat C172', C.wakeCategory(1157), 'L');
eq('M behind H: 5 NM', C.wakeSeparation('H', 'M').distanceNm, 5);
eq('L behind J: 8 NM', C.wakeSeparation('J', 'L').distanceNm, 8);
eq('H behind M: none', C.wakeSeparation('M', 'H').wakeApplies, false);
const oa = C.optimumAltitude({ massKg: 65000, wingArea: 124.6, mach: 0.785, clOpt: 0.52 });
near('optimum altitude 737-800 at 65 t ≈ FL360', oa.ft, 36000, 900);
near('lighter → higher (4 % weight ≈ +1000 ft)', C.optimumAltitude({ massKg: 62400, wingArea: 124.6, mach: 0.785, clOpt: 0.52 }).ft - oa.ft, 1000, 250);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
