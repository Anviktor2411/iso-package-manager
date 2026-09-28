// Plausibility tests for perf.js + aircraft.js — run: node tests/test_perf.js
const C = require('../web/js/calc.js');
const A = require('../web/js/aircraft.js');
const P = require('../web/js/perf.js');
let pass = 0, fail = 0;
function within(name, got, lo, hi) {
  const ok = got >= lo && got <= hi; if (ok) pass++; else fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${Number(got).toFixed(1)} (expect ${lo}…${hi})`);
}
function eq(name, got, want) { const ok = got === want; if (ok) pass++; else fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got} (want ${want})`); }

const b738 = A.byId.B738, a320 = A.byId.A320, a333 = A.byId.A333, b77w = A.byId.B77W, q400 = A.byId.DH8D;

// Detection
eq('detect B738 by ICAO', A.detect({ icao: 'B738', desc: 'Boeing 737-800', engType: 5, engines: 2, mtow: 79016, flags: { airliner: 1 } }).profile.id, 'B738');
eq('detect A20N by name', A.detect({ icao: '', desc: 'ToLiSS A320neo', engType: 7, engines: 2, mtow: 79000, flags: {} }).profile.id, 'A20N');
eq('detect A320 (not neo) by name', A.detect({ icao: '', desc: 'Airbus A320 CEO', engType: 7, engines: 2, mtow: 78000, flags: {} }).profile.id, 'A320');
eq('detect 737 MAX by name', A.detect({ icao: '', desc: 'Boeing 737-8 MAX', engType: 7, engines: 2, mtow: 82000, flags: {} }).profile.id, 'B38M');
eq('detect C172 → ga', A.detect({ icao: 'C172', desc: 'Cessna 172 SP', engType: 1, engines: 1, mtow: 1157, flags: { general_aviation: 1 } }).category, 'ga');
eq('detect R22 → helicopter', A.detect({ icao: 'R22', desc: 'Robinson R22', engType: 0, engines: 1, mtow: 621, flags: { helicopter: 1 } }).category, 'helicopter');
eq('detect unknown heavy jet → generic airliner', A.detect({ icao: 'ZZZZ', desc: 'Mystery Jet', engType: 7, engines: 2, mtow: 90000, flags: {} }).profile.id, 'GEN-JET');
eq('detect citation → bizjet', A.detect({ icao: 'C750', desc: 'Cessna Citation X', engType: 7, engines: 2, mtow: 16193, flags: { general_aviation: 1 } }).category, 'bizjet');
eq('detect airliner flag → commercial', A.detect({ icao: 'XXXX', desc: 'Some Liner', engType: 5, engines: 2, mtow: 50000, flags: { airliner: 1 } }).commercial, true);
eq('flap label 737 ratio 0.375 → 5', A.flapLabel(0.375, b738, 8), '5');
eq('flap label A320 ratio 1 → FULL', A.flapLabel(1, a320, 4), 'FULL');

// Take-off speeds (typical sim/FMC values)
const t1 = P.takeoffSpeeds(b738, 70000, '5');
within('B738 70 t F5 V2', t1.v2, 150, 156);
within('B738 70 t F5 VR', t1.vr, 144, 150);
within('B738 70 t F5 V1', t1.v1, 140, 149);
const t2 = P.takeoffSpeeds(a320, 73000, '1+F');
within('A320 73 t 1+F V2', t2.v2, 146, 154);
const t3 = P.takeoffSpeeds(b77w, 340000, '15');
within('B77W 340 t F15 V2', t3.v2, 168, 178);

// Landing speeds
within('B738 60 t F30 Vref', P.landingSpeeds(b738, 60000, '30').vref, 136, 142);
within('B738 60 t F40 Vref', P.landingSpeeds(b738, 60000, '40').vref, 130, 136);
within('A320 60 t FULL VLS', P.landingSpeeds(a320, 60000, 'FULL').vref, 121, 129);
within('A333 180 t FULL VLS', P.landingSpeeds(a333, 180000, 'FULL').vref, 128, 138);
eq('Airbus additive min 5', P.landingSpeeds(a320, 60000, 'FULL', { headwind: 6 }).add, 5);
eq('Airbus additive 1/3 HW', Math.round(P.landingSpeeds(a320, 60000, 'FULL', { headwind: 30 }).add), 10);
eq('Boeing additive ½HW+gust capped 20', P.landingSpeeds(b738, 60000, '30', { headwind: 24, windSpeed: 24, gust: 40 }).add, 20);

// Take-off field length
const tofl = P.takeoffDistance(b738, { mass: 79016, flap: '5', elevFt: 0, qnh: 1013.25, oatC: 15, headwind: 0, slopePct: 0, surface: 'dry' });
within('B738 MTOW SL ISA TOFL = reference', tofl.tofl, 2310, 2330);
const hot = P.takeoffDistance(b738, { mass: 79016, flap: '5', elevFt: 5000, qnh: 1013.25, oatC: 35, headwind: 0, slopePct: 0, surface: 'dry' });
within('B738 MTOW 5000 ft 35 °C (hot & high) longer', hot.tofl, 3000, 4200);
const light = P.takeoffDistance(b738, { mass: 60000, flap: '5', elevFt: 0, qnh: 1013.25, oatC: 15, headwind: 10, slopePct: 0, surface: 'dry' });
within('B738 60 t with 10 kt HW shorter', light.tofl, 1100, 1450);

// Flex
const fx = P.flexTemp(b738, { mass: 65000, flap: '5', elevFt: 131, qnh: 1013, oatC: 15, headwind: 5, slopePct: 0, surface: 'dry', toraM: 3000 });
console.log('     flex', fx.flex, 'reduction', (fx.reduction * 100).toFixed(1) + '%', 'limited by', fx.limitedBy, 'TOGA', fx.toga.tofl.toFixed(0), 'flex dist', fx.flexDist && fx.flexDist.tofl.toFixed(0));
within('B738 65 t 3000 m flex temp', fx.flex, 45, 70);
const fx2 = P.flexTemp(b738, { mass: 79016, flap: '5', elevFt: 0, qnh: 1013, oatC: 15, headwind: 0, slopePct: 0, surface: 'dry', toraM: 2000 });
eq('B738 MTOW on 2000 m → no flex (too short)', fx2.flex, null);

// Landing distance
const ld = P.landingDistance(b738, { mass: 60000, flap: '30', elevFt: 0, qnh: 1013.25, oatC: 15, headwind: 0, slopePct: 0, surface: 'dry', decel: 1.52 });
console.log('     B738 AB2 ALD', ld.ald.toFixed(0), 'air', ld.airDist.toFixed(0), 'trans', ld.trans.toFixed(0), 'brake', ld.braking.toFixed(0), 'LDR', ld.ldr.toFixed(0));
within('B738 60 t F30 AB2 ALD (m)', ld.ald, 1900, 2400);
within('B738 60 t F30 dispatch LDR (m)', ld.ldr, 1450, 1800);
const ldw = P.landingDistance(b738, { mass: 60000, flap: '30', elevFt: 0, qnh: 1013.25, oatC: 15, headwind: 0, slopePct: 0, surface: 'wet', decel: 4.27, reverse: true });
within('B738 wet MAX braking friction-limited', ldw.frictionLimited ? 1 : 0, 1, 1);
const rec = P.recommendAutobrake(b738, { mass: 60000, flap: '30', elevFt: 0, qnh: 1013.25, oatC: 15, headwind: 0, slopePct: 0, surface: 'dry' }, 2800);
eq('B738 autobrake pick on 2800 m', rec.pick && rec.pick.id, '2');

// Fuel plan
const fp = P.fuelPlan(b738, { distNm: 500, cruiseFt: 35000, windKt: 0, contPct: 5, altNm: 100, finalResMin: 30 });
console.log('     B738 500 NM trip', fp.trip.fuel.toFixed(0), 'kg', fp.trip.time.toFixed(0), 'min; block', fp.block.toFixed(0));
within('B738 500 NM trip fuel (kg)', fp.trip.fuel, 2900, 3600);
within('B738 500 NM block fuel (kg)', fp.block, 5500, 7000);
const fpShort = P.fuelPlan(b738, { distNm: 120, cruiseFt: 37000, windKt: 0, altNm: 0 });
eq('short trip reduces cruise level', fpShort.trip.reduced, true);

// Load sheet
const ls = P.loadsheet(b738, { oew: 41413, crewKg: 500, pax: 160, paxKg: 84, bagKg: 15, cargoKg: 1500, takeoffFuel: 6000, tripKg: 3100, taxiKg: 200 });
within('B738 ZFW', ls.zfw, 59252, 59254);
eq('B738 limited by', ls.limitedBy, 'MZFW + take-off fuel');

// Departure profiles (NADP / engine failure)
const cu = P.cleanupSpeeds(b738, 65000, '5');
const vref40 = P.landingSpeeds(b738, 65000, '40').vref;
within('B738 flaps 5 → 1 at the flaps 5 manoeuvre speed (Vref40 + 30)', cu.steps[0].at - vref40, 29.9, 30.1);
eq('B738 flaps 5 clean-up has two steps', cu.steps.map(s => s.to).join(','), '1,UP');
within('B738 flaps-up speed = Vref40 + 70', cu.vClean - vref40, 69.9, 70.1);
eq('A320 CONF 1+F clean-up goes straight to CONF 0 at S', P.cleanupSpeeds(a320, 65000, '1+F').steps.map(s => s.to).join(','), '0');
within('A320 clean speed is green dot', P.cleanupSpeeds(a320, 65000, '1+F').vClean, P.greenDot(65000) - 0.1, P.greenDot(65000) + 0.1);
const dep = { mass: 70000, flap: '5', elevFt: 0, qnh: 1013.25, oatC: 15, headwind: 0 };
const n1 = P.departureProfile(b738, Object.assign({ proc: 'nadp1' }, dep)), n2 = P.departureProfile(b738, Object.assign({ proc: 'nadp2' }, dep));
within('B738 all-engine climb gradient (%)', n1.gradients.aeo * 100, 12, 25);
within('NADP 1 thrust reduction height (ft)', n1.events.find(e => e.key === 'thrRed').h, 800, 900);
within('NADP 1 accelerates at 3000 ft', n1.events.find(e => e.key === 'acc').h, 3000, 3100);
within('NADP 2 accelerates at 800 ft', n2.events.find(e => e.key === 'acc').h, 800, 900);
eq('NADP 1 is higher over the close-in point (3.5 NM)', n1.at(3.5).h > n2.at(3.5).h + 300, true);
eq('NADP 2 burns less fuel to 4000 ft / 250 kt', n2.fuel < n1.fuel, true);
const eo = P.departureProfile(b738, Object.assign({}, dep, { mass: 79000, proc: 'eo', accFt: 1000 }));
within('B738 MTOW engine-out 2nd segment gradient (%) ≥ 2.4', eo.gradients.second * 100, 2.4, 6);
within('B738 engine-out final segment gradient (%) ≥ 1.2', eo.gradients.final * 100, 1.2, 8);
within('Engine-out acceleration is level (ft)', eo.events.find(e => e.key === 'mct').h - eo.events.find(e => e.key === 'acc').h, -1, 5);
eq('Engine-out take-off thrust inside the 10-minute limit', eo.events.find(e => e.key === 'mct').t < 600, true);
eq('Hot and high at MTOW: cannot climb on one engine', P.departureProfile(b738, Object.assign({}, dep, { mass: 79000, proc: 'eo', elevFt: 5400, oatC: 40 })).cannotClimb, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
