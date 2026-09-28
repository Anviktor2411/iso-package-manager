/* XP Flight Computer — aircraft profiles and detection
 * Profile numbers are typical public figures and calibrated estimates for simulation use.
 * Speeds are derived from the lift equation using the effective CLmax values below,
 * so they scale correctly with weight. Edit or add aircraft in user_profiles.json.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (root) { root.XFC = root.XFC || {}; root.XFC.aircraft = mod; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // Typical autobrake / braking deceleration targets (m/s²)
  const AB = {
    boeingNB: [{ id: '1', d: 1.22 }, { id: '2', d: 1.52 }, { id: '3', d: 2.19 }, { id: 'MAX', d: 4.27 }],
    boeingWB: [{ id: '1', d: 1.22 }, { id: '2', d: 1.52 }, { id: '3', d: 1.83 }, { id: '4', d: 2.29 }, { id: 'MAX AUTO', d: 3.35 }],
    airbus: [{ id: 'LO', d: 1.7 }, { id: 'MED', d: 3.0 }],
    md80: [{ id: 'MIN', d: 1.2 }, { id: 'MED', d: 2.0 }, { id: 'MAX', d: 3.4 }],
    regional: [{ id: 'LO', d: 1.5 }, { id: 'MED', d: 2.5 }, { id: 'HI', d: 3.3 }],
    manual: [{ id: 'Light', d: 1.5 }, { id: 'Medium', d: 2.5 }, { id: 'Firm', d: 3.3 }]
  };
  const DET = {
    b737: ['UP', '1', '2', '5', '10', '15', '25', '30', '40'],
    airbus: ['0', '1', '2', '3', 'FULL'],
    boeingWB: ['UP', '1', '5', '15', '20', '25', '30'],
    b787: ['UP', '1', '5', '10', '15', '17', '18', '20', '25', '30'],
    b747: ['UP', '1', '5', '10', '20', '25', '30'],
    ejet: ['0', '1', '2', '3', '4', '5', 'FULL'],
    crj2: ['0', '8', '20', '30', '45'],
    crj9: ['0', '1', '8', '20', '30', '45'],
    q400: ['0', '5', '10', '15', '35'],
    atr: ['0', '15', '30']
  };

  // sorted by lift so '1+F' comes before '2' (object keys that look like numbers would otherwise come first)
  const flaps = (spec, def) => Object.entries(spec).map(([id, cl]) => ({ id, cl, def: id === def })).sort((a, b) => a.cl - b.cl);

  // Family templates ---------------------------------------------------------
  const B737NG = {
    maker: 'Boeing', cls: 'narrowbody', policy: 'boeing', engines: 2, engine: 'turbofan', wingArea: 124.6,
    vmo: 340, mmo: 0.82, cruiseMach: 0.785, ceilingFt: 41000, flatC: 30,
    takeoffFlaps: flaps({ '1': 1.74, '5': 1.85, '10': 1.93, '15': 1.98, '25': 2.06 }, '5'),
    landingFlaps: flaps({ '15': 1.96, '30': 2.28, '40': 2.49 }, '30'),
    vr: 6, v1Dry: 2, v1Wet: 6, vmcg: 107, autobrake: AB.boeingNB, flapDetents: DET.b737,
    maneuver: { ref: '40', add: [['UP', 70], ['1', 50], ['5', 30], ['10', 30], ['15', 20], ['25', 10]] }
  };
  const A320F = {
    maker: 'Airbus', cls: 'narrowbody', policy: 'airbus', engines: 2, engine: 'turbofan', wingArea: 122.6,
    vmo: 350, mmo: 0.82, cruiseMach: 0.78, ceilingFt: 39800, flatC: 30,
    takeoffFlaps: flaps({ '1+F': 2.04, '2': 2.16, '3': 2.25 }, '1+F'),
    landingFlaps: flaps({ '3': 2.69, 'FULL': 2.87 }, 'FULL'),
    vr: 4, v1Dry: 2, v1Wet: 6, vmcg: 108, autobrake: AB.airbus, flapDetents: DET.airbus, greenDot: true
  };
  const BOEING_WB = { maker: 'Boeing', cls: 'widebody', policy: 'boeing', engines: 2, engine: 'turbofan', flatC: 30,
    vr: 7, v1Dry: 3, v1Wet: 8, autobrake: AB.boeingWB, flapDetents: DET.boeingWB };
  const AIRBUS_WB = { maker: 'Airbus', cls: 'widebody', policy: 'airbus', engines: 2, engine: 'turbofan', flatC: 30,
    vr: 5, v1Dry: 3, v1Wet: 8, autobrake: AB.airbus, flapDetents: DET.airbus };

  const P = (base, o) => Object.assign({}, base, o);

  const PROFILES = [
    // ---------------- Boeing 737
    P(B737NG, { id: 'B736', name: 'Boeing 737-600', icao: ['B736'], match: ['737-600', '737-6'],
      mtow: 65540, mlw: 55130, mzfw: 51710, oew: 36380, maxFuel: 20820, thrustKN: 101, toflRef: 1800,
      ffCruise: 2200, ffHold: 1900, taxiKg: 180, vmcg: 104 }),
    P(B737NG, { id: 'B737', name: 'Boeing 737-700', icao: ['B737'], match: ['737-700', '737-7'],
      mtow: 70080, mlw: 58600, mzfw: 55200, oew: 37650, maxFuel: 20820, thrustKN: 101, toflRef: 2040,
      ffCruise: 2300, ffHold: 2000, taxiKg: 180, vmcg: 104 }),
    P(B737NG, { id: 'B738', name: 'Boeing 737-800', icao: ['B738', 'B38F'], match: ['737-800', '737-8(?!.*max)', 'zibo', 'b738'],
      mtow: 79016, mlw: 66361, mzfw: 62732, oew: 41413, maxFuel: 20820, thrustKN: 117, toflRef: 2320,
      ffCruise: 2500, ffHold: 2200, taxiKg: 200 }),
    P(B737NG, { id: 'B739', name: 'Boeing 737-900ER', icao: ['B739'], match: ['737-900'],
      mtow: 85139, mlw: 71350, mzfw: 67721, oew: 44676, maxFuel: 23170, thrustKN: 121, toflRef: 2600,
      ffCruise: 2650, ffHold: 2300, taxiKg: 200, vmcg: 110 }),
    P(B737NG, { id: 'B38M', name: 'Boeing 737 MAX 8', icao: ['B38M', 'B37M', 'B39M'], match: ['737 max', '737-8 max', 'max 8'],
      wingArea: 127, mtow: 82191, mlw: 69309, mzfw: 65952, oew: 45070, maxFuel: 20730, thrustKN: 130, toflRef: 2500,
      ffCruise: 2150, ffHold: 1950, taxiKg: 200, cruiseMach: 0.79 }),
    P(B737NG, { id: 'B733', name: 'Boeing 737-300', icao: ['B733', 'B734', 'B735'], match: ['737-300', '737-400', '737-500', 'ixeg'],
      wingArea: 91.04, mtow: 62820, mlw: 51710, mzfw: 48300, oew: 32700, maxFuel: 16150, thrustKN: 89, toflRef: 2000,
      ffCruise: 2500, ffHold: 2100, taxiKg: 180, cruiseMach: 0.745, ceilingFt: 37000, vmcg: 100,
      takeoffFlaps: flaps({ '1': 2.10, '5': 2.25, '15': 2.41 }, '5'),
      landingFlaps: flaps({ '15': 2.36, '30': 2.72, '40': 2.89 }, '30') }),

    // ---------------- Airbus A320 family
    P(A320F, { id: 'A319', name: 'Airbus A319', icao: ['A319', 'A19N'], match: ['a319'],
      mtow: 75500, mlw: 62500, mzfw: 58500, oew: 40800, maxFuel: 18730, thrustKN: 98, toflRef: 1950,
      ffCruise: 2200, ffHold: 1900, taxiKg: 180, vmcg: 106 }),
    P(A320F, { id: 'A320', name: 'Airbus A320', icao: ['A320'], match: ['a320(?!.*neo)', 'a320ceo'],
      mtow: 78000, mlw: 66000, mzfw: 62500, oew: 42600, maxFuel: 18730, thrustKN: 120, toflRef: 2100,
      ffCruise: 2450, ffHold: 2100, taxiKg: 200 }),
    P(A320F, { id: 'A20N', name: 'Airbus A320neo', icao: ['A20N'], match: ['a320neo', 'a320 neo'],
      mtow: 79000, mlw: 67400, mzfw: 64300, oew: 44300, maxFuel: 18730, thrustKN: 120, toflRef: 1950,
      ffCruise: 2100, ffHold: 1900, taxiKg: 200 }),
    P(A320F, { id: 'A321', name: 'Airbus A321', icao: ['A321'], match: ['a321(?!.*neo)'],
      mtow: 93500, mlw: 77800, mzfw: 73800, oew: 48500, maxFuel: 18650, thrustKN: 147, toflRef: 2300,
      ffCruise: 2850, ffHold: 2400, taxiKg: 220, vmcg: 112,
      takeoffFlaps: flaps({ '1+F': 2.20, '2': 2.33, '3': 2.43 }, '2'),
      landingFlaps: flaps({ '3': 2.90, 'FULL': 3.10 }, 'FULL') }),
    P(A320F, { id: 'A21N', name: 'Airbus A321neo', icao: ['A21N'], match: ['a321neo', 'a321 neo'],
      mtow: 97000, mlw: 79200, mzfw: 75600, oew: 50500, maxFuel: 18650, thrustKN: 143, toflRef: 2300,
      ffCruise: 2450, ffHold: 2200, taxiKg: 220, vmcg: 112,
      takeoffFlaps: flaps({ '1+F': 2.20, '2': 2.33, '3': 2.43 }, '2'),
      landingFlaps: flaps({ '3': 2.90, 'FULL': 3.10 }, 'FULL') }),

    // ---------------- Airbus widebodies
    P(AIRBUS_WB, { id: 'A333', name: 'Airbus A330-300', icao: ['A333', 'A332', 'A339', 'A338'], match: ['a330'],
      wingArea: 361.6, mtow: 242000, mlw: 187000, mzfw: 175000, oew: 124500, maxFuel: 109185, thrustKN: 316, toflRef: 2700,
      vmo: 330, mmo: 0.86, cruiseMach: 0.82, ceilingFt: 41450, ffCruise: 5700, ffHold: 5000, taxiKg: 400, vmcg: 120,
      takeoffFlaps: flaps({ '1+F': 1.96, '2': 2.09, '3': 2.21 }, '2'),
      landingFlaps: flaps({ '3': 2.42, 'FULL': 2.58 }, 'FULL') }),
    P(AIRBUS_WB, { id: 'A346', name: 'Airbus A340-600', icao: ['A346', 'A345', 'A343', 'A342'], match: ['a340'], engines: 4,
      wingArea: 439.4, mtow: 380000, mlw: 265000, mzfw: 251000, oew: 177000, maxFuel: 155040, thrustKN: 249, toflRef: 3100,
      vmo: 330, mmo: 0.86, cruiseMach: 0.83, ceilingFt: 41450, ffCruise: 8500, ffHold: 7500, taxiKg: 500, vmcg: 115,
      takeoffFlaps: flaps({ '1+F': 2.07, '2': 2.19, '3': 2.30 }, '2'),
      landingFlaps: flaps({ '3': 2.33, 'FULL': 2.48 }, 'FULL') }),
    P(AIRBUS_WB, { id: 'A359', name: 'Airbus A350-900', icao: ['A359', 'A35K'], match: ['a350'],
      wingArea: 442, mtow: 283000, mlw: 207000, mzfw: 195700, oew: 142400, maxFuel: 111000, thrustKN: 375, toflRef: 2600,
      vmo: 340, mmo: 0.89, cruiseMach: 0.85, ceilingFt: 43100, ffCruise: 5800, ffHold: 5000, taxiKg: 400, vmcg: 120,
      takeoffFlaps: flaps({ '1+F': 1.95, '2': 2.05, '3': 2.15 }, '2'),
      landingFlaps: flaps({ '3': 2.10, 'FULL': 2.22 }, 'FULL') }),
    P(AIRBUS_WB, { id: 'A388', name: 'Airbus A380-800', icao: ['A388'], match: ['a380'], engines: 4,
      wingArea: 845, mtow: 575000, mlw: 394000, mzfw: 369000, oew: 277000, maxFuel: 254000, thrustKN: 311, toflRef: 3000,
      vmo: 340, mmo: 0.89, cruiseMach: 0.85, ceilingFt: 43000, ffCruise: 11500, ffHold: 10000, taxiKg: 700, vmcg: 125,
      takeoffFlaps: flaps({ '1+F': 1.80, '2': 1.88, '3': 1.97 }, '2'),
      landingFlaps: flaps({ '3': 2.13, 'FULL': 2.26 }, 'FULL') }),
    P(AIRBUS_WB, { id: 'A306', name: 'Airbus A300-600R', icao: ['A306', 'A30B', 'A310', 'A3ST'], match: ['a300', 'a310'],
      wingArea: 260, mtow: 171700, mlw: 140000, mzfw: 130000, oew: 90100, maxFuel: 54500, thrustKN: 262, toflRef: 2400,
      vmo: 335, mmo: 0.82, cruiseMach: 0.80, ceilingFt: 40000, ffCruise: 5500, ffHold: 4800, taxiKg: 350, vmcg: 112,
      takeoffFlaps: flaps({ '15/0': 1.95, '15/15': 2.10, '15/20': 2.18 }, '15/15'),
      landingFlaps: flaps({ '20/20': 2.30, '30/40': 2.55 }, '30/40'), flapDetents: null }),

    // ---------------- Boeing widebodies
    P(BOEING_WB, { id: 'B752', name: 'Boeing 757-200', icao: ['B752', 'B753'], match: ['757'], cls: 'narrowbody',
      wingArea: 185.25, mtow: 115680, mlw: 89815, mzfw: 83460, oew: 57840, maxFuel: 34000, thrustKN: 178, toflRef: 2000,
      vmo: 350, mmo: 0.86, cruiseMach: 0.80, ceilingFt: 42000, ffCruise: 3300, ffHold: 2900, taxiKg: 250, vmcg: 100,
      takeoffFlaps: flaps({ '1': 1.90, '5': 2.08, '15': 2.23, '20': 2.33 }, '5'),
      landingFlaps: flaps({ '25': 2.30, '30': 2.45 }, '30') }),
    P(BOEING_WB, { id: 'B763', name: 'Boeing 767-300ER', icao: ['B763', 'B762', 'B764'], match: ['767'],
      wingArea: 283.3, mtow: 186880, mlw: 136080, mzfw: 126100, oew: 90010, maxFuel: 73400, thrustKN: 267, toflRef: 2650,
      vmo: 360, mmo: 0.86, cruiseMach: 0.80, ceilingFt: 43100, ffCruise: 4900, ffHold: 4300, taxiKg: 350, vmcg: 108,
      takeoffFlaps: flaps({ '1': 1.78, '5': 1.92, '15': 2.04, '20': 2.13 }, '5'),
      landingFlaps: flaps({ '25': 2.03, '30': 2.14 }, '30') }),
    P(BOEING_WB, { id: 'B772', name: 'Boeing 777-200ER', icao: ['B772', 'B77L'], match: ['777-200', '777-2', '777f', '777 f'],
      wingArea: 427.8, mtow: 297550, mlw: 213180, mzfw: 195045, oew: 138100, maxFuel: 137460, thrustKN: 400, toflRef: 2900,
      vmo: 330, mmo: 0.87, cruiseMach: 0.84, ceilingFt: 43100, ffCruise: 6800, ffHold: 6000, taxiKg: 450, vmcg: 120,
      takeoffFlaps: flaps({ '5': 1.86, '15': 2.03, '20': 2.13 }, '15'),
      landingFlaps: flaps({ '25': 2.12, '30': 2.24 }, '30') }),
    P(BOEING_WB, { id: 'B77W', name: 'Boeing 777-300ER', icao: ['B77W', 'B773'], match: ['777-300', '777-3', '77w'],
      wingArea: 436.8, mtow: 351534, mlw: 251290, mzfw: 237683, oew: 167800, maxFuel: 145538, thrustKN: 513, toflRef: 3050,
      vmo: 330, mmo: 0.89, cruiseMach: 0.84, ceilingFt: 43100, ffCruise: 7500, ffHold: 6600, taxiKg: 500, vmcg: 125,
      takeoffFlaps: flaps({ '5': 1.86, '15': 2.03, '20': 2.13 }, '15'),
      landingFlaps: flaps({ '25': 2.12, '30': 2.24 }, '30') }),
    P(BOEING_WB, { id: 'B789', name: 'Boeing 787-9', icao: ['B789', 'B788', 'B78X'], match: ['787'],
      wingArea: 360.5, mtow: 254011, mlw: 192777, mzfw: 181437, oew: 128850, maxFuel: 101345, thrustKN: 320, toflRef: 2800,
      vmo: 360, mmo: 0.90, cruiseMach: 0.85, ceilingFt: 43100, ffCruise: 5600, ffHold: 4800, taxiKg: 400, vmcg: 115,
      takeoffFlaps: flaps({ '5': 1.78, '15': 1.89, '20': 1.96 }, '15'),
      landingFlaps: flaps({ '25': 2.07, '30': 2.17 }, '30'), flapDetents: DET.b787 }),
    P(BOEING_WB, { id: 'B744', name: 'Boeing 747-400', icao: ['B744', 'B742', 'B743', 'B74F', 'B74S'], match: ['747-400', '747-200', '747-100', '747-2', '747-4', 'felis'], engines: 4,
      wingArea: 525, mtow: 396890, mlw: 285760, mzfw: 246070, oew: 178756, maxFuel: 173000, thrustKN: 252, toflRef: 3200,
      vmo: 365, mmo: 0.92, cruiseMach: 0.85, ceilingFt: 45100, ffCruise: 11000, ffHold: 9500, taxiKg: 700, vmcg: 125,
      takeoffFlaps: flaps({ '10': 1.83, '20': 1.98 }, '10'),
      landingFlaps: flaps({ '25': 1.89, '30': 2.01 }, '30'), flapDetents: DET.b747 }),
    P(BOEING_WB, { id: 'B748', name: 'Boeing 747-8', icao: ['B748'], match: ['747-8'], engines: 4,
      wingArea: 554, mtow: 447700, mlw: 312100, mzfw: 295100, oew: 220128, maxFuel: 193000, thrustKN: 296, toflRef: 3100,
      vmo: 365, mmo: 0.90, cruiseMach: 0.855, ceilingFt: 43100, ffCruise: 10000, ffHold: 8800, taxiKg: 700, vmcg: 125,
      takeoffFlaps: flaps({ '10': 1.86, '20': 2.01 }, '10'),
      landingFlaps: flaps({ '25': 1.92, '30': 2.05 }, '30'), flapDetents: DET.b747 }),
    P(BOEING_WB, { id: 'B722', name: 'Boeing 727-200', icao: ['B722', 'B721', 'B727'], match: ['727'], engines: 3, cls: 'narrowbody',
      wingArea: 157.9, mtow: 95000, mlw: 72600, mzfw: 62600, oew: 46200, maxFuel: 30600, thrustKN: 71, toflRef: 2900,
      vmo: 390, mmo: 0.90, cruiseMach: 0.81, ceilingFt: 42000, ffCruise: 4500, ffHold: 3800, taxiKg: 300, vmcg: 105,
      takeoffFlaps: flaps({ '5': 1.70, '15': 1.85, '20': 1.95 }, '15'),
      landingFlaps: flaps({ '30': 2.40, '40': 2.55 }, '30'), autobrake: AB.manual, flapDetents: null }),

    // ---------------- McDonnell Douglas
    { id: 'MD82', name: 'McDonnell Douglas MD-82', maker: 'McDonnell Douglas', icao: ['MD82', 'MD81', 'MD83', 'MD87', 'MD88', 'MD90'], match: ['md-8', 'md8', 'md-90'],
      cls: 'narrowbody', policy: 'boeing', engines: 2, engine: 'turbofan', wingArea: 112.3,
      mtow: 67812, mlw: 58967, mzfw: 55338, oew: 35369, maxFuel: 17760, thrustKN: 89, toflRef: 2300, flatC: 30,
      vmo: 340, mmo: 0.84, cruiseMach: 0.76, ceilingFt: 37000, ffCruise: 3000, ffHold: 2500, taxiKg: 200,
      takeoffFlaps: flaps({ '5': 1.80, '11': 2.00, '15': 2.10 }, '11'),
      landingFlaps: flaps({ '28': 2.35, '40': 2.52 }, '40'), vr: 5, v1Dry: 2, v1Wet: 6, vmcg: 105, autobrake: AB.md80, flapDetents: null },
    { id: 'MD11', name: 'McDonnell Douglas MD-11', maker: 'McDonnell Douglas', icao: ['MD11'], match: ['md-11', 'md11'],
      cls: 'widebody', policy: 'boeing', engines: 3, engine: 'turbofan', wingArea: 338.9,
      mtow: 286000, mlw: 207700, mzfw: 195000, oew: 128800, maxFuel: 117000, thrustKN: 274, toflRef: 3100, flatC: 30,
      vmo: 365, mmo: 0.87, cruiseMach: 0.83, ceilingFt: 42000, ffCruise: 8000, ffHold: 7000, taxiKg: 500,
      takeoffFlaps: flaps({ '10': 1.82, '15': 1.90, '20': 1.97 }, '15'),
      landingFlaps: flaps({ '35': 1.97, '50': 2.10 }, '35'), vr: 7, v1Dry: 3, v1Wet: 8, vmcg: 120, autobrake: AB.boeingWB, flapDetents: null },

    // ---------------- Regional jets
    { id: 'E175', name: 'Embraer E175', maker: 'Embraer', icao: ['E175', 'E170', 'E75L', 'E75S'], match: ['e170', 'e175', 'e-170', 'e-175', 'erj-170', 'erj-175'],
      cls: 'regional', policy: 'boeing', engines: 2, engine: 'turbofan', wingArea: 72.7,
      mtow: 38790, mlw: 34000, mzfw: 31700, oew: 21890, maxFuel: 9335, thrustKN: 63, toflRef: 2240, flatC: 30,
      vmo: 320, mmo: 0.82, cruiseMach: 0.78, ceilingFt: 41000, ffCruise: 1550, ffHold: 1350, taxiKg: 120,
      takeoffFlaps: flaps({ '1': 2.01, '2': 2.16, '4': 2.26 }, '2'),
      landingFlaps: flaps({ '5': 2.30, 'FULL': 2.46 }, 'FULL'), vr: 4, v1Dry: 2, v1Wet: 6, vmcg: 100, autobrake: AB.regional, flapDetents: DET.ejet },
    { id: 'E195', name: 'Embraer E195', maker: 'Embraer', icao: ['E195', 'E190', 'E290', 'E295'], match: ['e190', 'e195', 'e-190', 'e-195', 'erj-190', 'erj-195'],
      cls: 'regional', policy: 'boeing', engines: 2, engine: 'turbofan', wingArea: 92.5,
      mtow: 52290, mlw: 45000, mzfw: 42500, oew: 28970, maxFuel: 12971, thrustKN: 89, toflRef: 2180, flatC: 30,
      vmo: 320, mmo: 0.82, cruiseMach: 0.78, ceilingFt: 41000, ffCruise: 2050, ffHold: 1750, taxiKg: 150,
      takeoffFlaps: flaps({ '1': 2.07, '2': 2.18, '4': 2.28 }, '2'),
      landingFlaps: flaps({ '5': 2.35, 'FULL': 2.52 }, 'FULL'), vr: 4, v1Dry: 2, v1Wet: 6, vmcg: 105, autobrake: AB.regional, flapDetents: DET.ejet },
    { id: 'CRJ9', name: 'Bombardier CRJ900', maker: 'Bombardier', icao: ['CRJ9', 'CRJ7', 'CRJX'], match: ['crj-?900', 'crj-?700', 'crj-?1000'],
      cls: 'regional', policy: 'boeing', engines: 2, engine: 'turbofan', wingArea: 70.6,
      mtow: 38330, mlw: 33340, mzfw: 31751, oew: 21845, maxFuel: 8822, thrustKN: 64.5, toflRef: 1940, flatC: 30,
      vmo: 335, mmo: 0.85, cruiseMach: 0.78, ceilingFt: 41000, ffCruise: 1550, ffHold: 1350, taxiKg: 120,
      takeoffFlaps: flaps({ '8': 1.58, '20': 1.75 }, '20'),
      landingFlaps: flaps({ '30': 2.05, '45': 2.18 }, '45'), vr: 4, v1Dry: 2, v1Wet: 6, vmcg: 105, autobrake: AB.manual, flapDetents: DET.crj9 },
    { id: 'CRJ2', name: 'Bombardier CRJ200', maker: 'Bombardier', icao: ['CRJ2', 'CRJ1'], match: ['crj-?200', 'crj-?100'],
      cls: 'regional', policy: 'boeing', engines: 2, engine: 'turbofan', wingArea: 48.35,
      mtow: 24041, mlw: 21319, mzfw: 19958, oew: 13835, maxFuel: 6489, thrustKN: 38.8, toflRef: 1920, flatC: 30,
      vmo: 335, mmo: 0.85, cruiseMach: 0.74, ceilingFt: 41000, ffCruise: 1200, ffHold: 1050, taxiKg: 100,
      takeoffFlaps: flaps({ '8': 1.63, '20': 1.82 }, '8'),
      landingFlaps: flaps({ '45': 2.03 }, '45'), vr: 3, v1Dry: 2, v1Wet: 6, vmcg: 100, autobrake: AB.manual, flapDetents: DET.crj2 },

    // ---------------- Regional turboprops
    { id: 'DH8D', name: 'De Havilland Dash 8 Q400', maker: 'De Havilland Canada', icao: ['DH8D'], match: ['q400', 'dash 8-400', 'dhc-8-400', 'dash8'],
      cls: 'turboprop', policy: 'boeing', engines: 2, engine: 'turboprop', wingArea: 63.08,
      mtow: 29574, mlw: 28123, mzfw: 25855, oew: 17819, maxFuel: 5318, thrustKN: 0, toflRef: 1425, flatC: 30,
      vmo: 286, mmo: 0.60, cruiseTas: 350, ceilingFt: 27000, ffCruise: 1100, ffHold: 850, taxiKg: 80,
      takeoffFlaps: flaps({ '5': 2.27, '10': 2.47, '15': 2.64 }, '10'),
      landingFlaps: flaps({ '15': 2.39, '35': 2.72 }, '15'), vr: 4, v1Dry: 1, v1Wet: 4, vmcg: 90, autobrake: AB.manual, flapDetents: DET.q400 },
    { id: 'AT76', name: 'ATR 72-600', maker: 'ATR', icao: ['AT76', 'AT75', 'AT72', 'AT73'], match: ['atr 72', 'atr72', 'atr-72'],
      cls: 'turboprop', policy: 'boeing', engines: 2, engine: 'turboprop', wingArea: 61,
      mtow: 23000, mlw: 22350, mzfw: 21000, oew: 13500, maxFuel: 5000, thrustKN: 0, toflRef: 1370, flatC: 30,
      vmo: 250, mmo: 0.55, cruiseTas: 275, ceilingFt: 25000, ffCruise: 750, ffHold: 600, taxiKg: 60,
      takeoffFlaps: flaps({ '15': 2.20 }, '15'),
      landingFlaps: flaps({ '15': 2.47, '30': 2.75 }, '30'), vr: 5, v1Dry: 1, v1Wet: 4, vmcg: 85, autobrake: AB.manual, flapDetents: DET.atr }
  ];

  // Generic profiles built from the sim's own numbers when the type is unknown
  function genericProfile(ac, kind) {
    const tp = kind === 'turboprop';
    const mtow = ac.mtow > 0 ? ac.mtow : (tp ? 20000 : 70000);
    return {
      id: tp ? 'GEN-TP' : 'GEN-JET', generic: true,
      name: tp ? 'Generic regional turboprop' : 'Generic jet transport', maker: '—',
      cls: tp ? 'turboprop' : 'narrowbody', policy: 'boeing', engines: ac.engines || 2, engine: tp ? 'turboprop' : 'turbofan',
      wingArea: mtow / (tp ? 420 : 620), mtow, mlw: mtow * 0.86, mzfw: mtow * 0.80, oew: ac.oew > 0 ? ac.oew : mtow * 0.55,
      maxFuel: ac.maxFuel > 0 ? ac.maxFuel : mtow * 0.25, thrustKN: 0, toflRef: tp ? 1400 : 2300, flatC: 30,
      vmo: ac.vne > 0 ? ac.vne : (tp ? 250 : 340), mmo: ac.mmo > 0 ? ac.mmo : (tp ? 0.55 : 0.82),
      cruiseMach: tp ? undefined : 0.78, cruiseTas: tp ? 280 : undefined, ceilingFt: tp ? 25000 : 39000,
      ffCruise: Math.round(mtow * (tp ? 0.035 : 0.028) / 50) * 50, ffHold: Math.round(mtow * (tp ? 0.028 : 0.024) / 50) * 50,
      taxiKg: Math.round(mtow * 0.0025 / 10) * 10,
      takeoffFlaps: flaps(tp ? { 'T/O': 2.2 } : { 'T/O': 2.0 }, 'T/O'),
      landingFlaps: flaps(tp ? { 'LDG': 2.6 } : { 'LDG': 2.5 }, 'LDG'),
      vr: 5, v1Dry: 2, v1Wet: 6, vmcg: tp ? 85 : 105, autobrake: tp ? AB.manual : AB.regional, flapDetents: null
    };
  }

  const byId = {}, byIcao = {};
  function index(list) {
    for (const p of list) {
      byId[p.id] = p;
      for (const c of (p.icao || [])) byIcao[String(c).toUpperCase()] = p;
    }
  }
  index(PROFILES);

  /** Merge user profiles (from user_profiles.json via the bridge). Same id replaces, new id adds. */
  function addUserProfiles(list) {
    if (!Array.isArray(list)) return 0;
    let n = 0;
    for (const raw of list) {
      if (!raw || !raw.id) continue;
      const base = byId[raw.id] || byId[raw.basedOn] || {};
      const p = Object.assign({ policy: 'boeing', engine: 'turbofan', engines: 2, cls: 'narrowbody', flatC: 30, vr: 5, v1Dry: 2, v1Wet: 6,
        vmcg: 100, autobrake: AB.manual, flapDetents: null, maker: '—' }, base, raw, { user: true });
      if (raw.takeoffFlaps && !Array.isArray(raw.takeoffFlaps)) p.takeoffFlaps = flaps(raw.takeoffFlaps, raw.takeoffFlapDefault);
      if (raw.landingFlaps && !Array.isArray(raw.landingFlaps)) p.landingFlaps = flaps(raw.landingFlaps, raw.landingFlapDefault);
      if (typeof raw.autobrake === 'string' && AB[raw.autobrake]) p.autobrake = AB[raw.autobrake];
      const need = ['name', 'wingArea', 'mtow', 'mlw', 'mzfw', 'oew', 'maxFuel', 'toflRef', 'ffCruise', 'ffHold', 'takeoffFlaps', 'landingFlaps'];
      const missing = need.filter(k => p[k] == null);
      if (missing.length) { if (typeof console !== 'undefined') console.warn('user profile ' + raw.id + ' skipped, missing: ' + missing.join(', ')); continue; }
      if (!p.cruiseMach && !p.cruiseTas) p.cruiseMach = 0.78;
      if (!p.ceilingFt) p.ceilingFt = 39000;
      if (!p.taxiKg) p.taxiKg = Math.round(p.mtow * 0.0025);
      const i = PROFILES.findIndex(x => x.id === p.id);
      if (i >= 0) PROFILES[i] = p; else PROFILES.push(p);
      n++;
    }
    index(PROFILES);
    return n;
  }

  const clean = s => String(s || '').replace(/\0/g, '').trim();

  function engineKind(t) {
    if (t === 0 || t === 1) return 'piston';
    if (t === 2 || t === 8 || t === 9 || t === 10) return 'turboprop';
    if (t === 4 || t === 5 || t === 7) return 'jet';
    if (t === 3) return 'electric';
    if (t === 6) return 'rocket';
    return 'unknown';
  }

  function matchProfile(icao, desc) {
    const code = clean(icao).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code && byIcao[code]) return { profile: byIcao[code], via: 'ICAO code' };
    const d = clean(desc).toLowerCase();
    if (d) {
      for (const p of PROFILES) {
        for (const m of (p.match || [])) {
          try { if (new RegExp(m, 'i').test(d)) return { profile: p, via: 'aircraft name' }; } catch (e) { /* bad user regex */ }
        }
      }
    }
    return null;
  }

  /**
   * Classify the loaded aircraft. ac = { icao, desc, tail, author, engines, engType, mtow, oew, maxFuel, flags{...} }
   * Returns { category, label, commercial, kind, profile, via }.
   */
  function detect(ac) {
    ac = ac || {};
    const flags = ac.flags || {};
    const kind = engineKind(ac.engType);
    const m = matchProfile(ac.icao, ac.desc);
    const mtow = ac.mtow || 0;
    let category, label, commercial = false, profile = m ? m.profile : null, via = m ? m.via : null;

    if (flags.helicopter || flags.vtol) { category = 'helicopter'; label = flags.vtol && !flags.helicopter ? 'VTOL' : 'Helicopter'; profile = null; }
    else if (flags.glider) { category = 'glider'; label = 'Glider'; profile = null; }
    else if (profile) { category = 'airliner'; label = profile.label || (profile.cls === 'turboprop' ? 'Regional airliner' : 'Airliner'); commercial = true; }
    else if (flags.airliner || (flags.cargo && mtow >= 30000)) {
      category = 'airliner'; label = flags.cargo ? 'Cargo airliner' : 'Airliner'; commercial = true;
      profile = genericProfile(ac, kind === 'turboprop' ? 'turboprop' : 'jet'); via = 'generic (from sim data)';
    }
    else if (flags.military) { category = 'military'; label = 'Military'; }
    else if (kind === 'jet' && mtow >= 30000) {
      category = 'airliner'; label = 'Jet transport'; commercial = true;
      profile = genericProfile(ac, 'jet'); via = 'generic (from sim data)';
    }
    else if (kind === 'jet') { category = 'bizjet'; label = 'Business jet'; }
    else if (kind === 'turboprop' && mtow >= 12000 && (ac.engines || 0) >= 2) {
      category = 'airliner'; label = 'Regional turboprop'; commercial = true;
      profile = genericProfile(ac, 'turboprop'); via = 'generic (from sim data)';
    }
    else if (flags.ultralight) { category = 'ga'; label = 'Ultralight'; }
    else if (flags.experimental) { category = 'ga'; label = 'Experimental'; }
    else if (flags.seaplane) { category = 'ga'; label = 'Seaplane'; }
    else { category = 'ga'; label = kind === 'turboprop' ? 'Turboprop (GA)' : 'General aviation'; }

    return { category, label, commercial, kind, profile, via };
  }

  /** Flap handle ratio → detent label using the profile's detent list (X-Plane spaces detents evenly). */
  function flapLabel(ratio, profile, simDetents) {
    if (!(ratio >= 0)) return null;
    const list = profile && profile.flapDetents;
    if (list && list.length > 1 && (!simDetents || simDetents === list.length - 1 || simDetents === list.length)) {
      const i = Math.round(ratio * (list.length - 1));
      return list[Math.max(0, Math.min(list.length - 1, i))];
    }
    return Math.round(ratio * 100) + '%';
  }

  return { PROFILES, AB, byId, byIcao, detect, matchProfile, genericProfile, engineKind, addUserProfiles, flapLabel, clean };
});
