/* XP Flight Computer — demo flight
 * Produces the same snapshot shape as the X-Plane bridge so the whole app can be tried without the sim.
 * The numbers are simulated; the page labels them DEMO everywhere.
 */
(function (root) {
  'use strict';
  const C = root.XFC.calc;

  const TYPES = {
    B738: { icao: 'B738', desc: 'Boeing 737-800', tail: 'ES-DMO', author: 'Demo flight', engines: 2, engType: 7,
      mtow: 79016, oew: 41413, maxFuel: 20820, vso: 112, vs: 140, vfe: 162, vno: 340, vne: 340, mmo: 0.82, vle: 270,
      flags: { airliner: true }, detents: 8, alt: 36000, mach: 0.785, hdg: 262, mass: 68400, fuel: 9600, ff: 2450,
      lat: 59.52, lon: 26.95, wind: [285, 42], gps: 210, dest: 131 },
    A333: { icao: 'A333', desc: 'Airbus A330-300', tail: 'ES-WDE', author: 'Demo flight', engines: 2, engType: 7,
      mtow: 242000, oew: 124500, maxFuel: 109185, vso: 110, vs: 150, vfe: 196, vno: 330, vne: 330, mmo: 0.86, vle: 250,
      flags: { airliner: true }, detents: 4, alt: 38000, mach: 0.82, hdg: 245, mass: 206000, fuel: 52000, ff: 5800,
      lat: 55.9, lon: 13.6, wind: [260, 65], gps: 640, dest: 0 },
    C172: { icao: 'C172', desc: 'Cessna 172 SP Skyhawk', tail: 'ES-CFK', author: 'Demo flight', engines: 1, engType: 1,
      mtow: 1157, oew: 767, maxFuel: 145, vso: 48, vs: 53, vfe: 85, vno: 129, vne: 163, mmo: 0, vle: 0,
      flags: { general_aviation: true }, detents: 3, alt: 4500, ias: 105, hdg: 138, mass: 1050, fuel: 110, ff: 30,
      lat: 58.31, lon: 26.69, wind: [240, 16], gps: 42, dest: 213 },
    R22: { icao: 'R22', desc: 'Robinson R22 Beta II', tail: 'ES-HRD', author: 'Demo flight', engines: 1, engType: 0,
      mtow: 621, oew: 390, maxFuel: 66, vso: 0, vs: 0, vfe: 0, vno: 102, vne: 102, mmo: 0, vle: 0,
      flags: { helicopter: true }, detents: 0, alt: 1200, ias: 82, hdg: 20, mass: 560, fuel: 45, ff: 36,
      lat: 59.43, lon: 24.75, wind: [200, 12], gps: 18, dest: 131 }
  };

  let timer = null, t0 = 0, type = 'B738', cb = null;

  function snapshot() {
    const a = TYPES[type];
    const t = (Date.now() - t0) / 1000;
    const jet = !!a.mach;
    // gentle scripted movement: a step climb for jets, a lazy cruise wobble for the others
    const alt = jet ? a.alt - 1000 + Math.min(1000, Math.max(0, (t - 20) * 25)) + 30 * Math.sin(t / 9)
                    : a.alt + 60 * Math.sin(t / 25);
    const vs = jet ? ((t > 20 && t < 60) ? 1500 : 0) + 30 * Math.cos(t / 9) : 60 * Math.cos(t / 25) / 25 * 60;
    const isaDev = jet ? 6 : 4;
    const oat = C.isaTempC(alt) + isaDev;
    let mach, cas;
    if (jet) { mach = a.mach + 0.003 * Math.sin(t / 13); cas = C.machToCas(mach, alt); }
    else { cas = a.ias + 2.5 * Math.sin(t / 7); mach = C.casToMach(cas, alt); }
    const tas = C.machToTas(mach, oat);
    const hdg = C.norm360(a.hdg + 3 * Math.sin(t / 40));
    const [wd, ws0] = a.wind;
    const ws = ws0 + 4 * Math.sin(t / 17);
    // ground vector = air vector + wind vector (wind blows toward wd + 180)
    const an = tas * Math.cos(C.rad(hdg)), ae = tas * Math.sin(C.rad(hdg));
    const wn = ws * Math.cos(C.rad(wd + 180)), we = ws * Math.sin(C.rad(wd + 180));
    const gn = an + wn, ge = ae + we;
    const gs = Math.hypot(gn, ge), trk = C.norm360(C.deg(Math.atan2(ge, gn)));
    const dist = gs * t / 3600;
    const lat = a.lat + dist / 60 * Math.cos(C.rad(trk));
    const lon = a.lon + dist / 60 * Math.sin(C.rad(trk)) / Math.cos(C.rad(lat));
    const magVar = 8.5;
    const qnh = 1009;
    const burnt = a.ff * t / 3600;
    const payload = a.mass - a.oew - a.fuel;
    const P = C.isa(alt).P;
    const f = {
      lat, lon, altMsl: alt + (jet ? 0 : 0), agl: jet ? alt - 120 : alt - 260, altInd: alt - (jet ? 0 : 0),
      pa: jet ? alt : alt + C.pressureAltFt(qnh), ias: cas - 0.5, cas, tas, gs, mach, vs,
      hdgT: hdg, hdgM: C.norm360(hdg - magVar), trkT: trk, magVar, pitch: jet ? 2.4 : 1.2, roll: 1.5 * Math.sin(t / 11), aoa: 2.3,
      oat, tat: C.tatFromSat(oat, mach), qnh, baro: jet ? 1013.25 : qnh, pStatic: P / 100,
      windDirT: wd, windKt: ws, rho: P / (C.K.R * (oat + 273.15)), altTempErr: null, visSm: 10, rwyFriction: 0,
      mass: a.mass - burnt, fuel: a.fuel - burnt, payload, ff: a.ff * (1 + 0.02 * Math.sin(t / 5)),
      n1: Array(a.engines).fill(jet ? 85.2 : 0), flapReq: 0, flapDep: 0, gearDown: !jet && a.engines === 1 && a.engType === 1 ? true : false,
      onGround: false, paused: false, zulu: (43200 + t) % 86400,
      gpsDist: Math.max(0, a.gps - dist), gpsBrgM: C.norm360(trk - magVar), todDist: jet ? Math.max(0, a.gps - 105 - dist) : null,
      landingAlt: a.dest
    };
    const ac = {
      icao: a.icao, desc: a.desc, tail: a.tail, author: a.author, engines: a.engines, engType: a.engType,
      mtow: a.mtow, oew: a.oew, maxFuel: a.maxFuel, vso: a.vso, vs: a.vs, vfe: a.vfe, vno: a.vno, vne: a.vne, mmo: a.mmo,
      vle: a.vle, vmca: 0, vyse: 0, gearRetract: a.engines > 1, flapDetents: a.detents,
      flags: Object.assign({ airliner: false, general_aviation: false, helicopter: false, glider: false, military: false,
        cargo: false, experimental: false, ultralight: false, seaplane: false, vtol: false, sci_fi: false }, a.flags)
    };
    return { t: Date.now() / 1000, app: 'demo', xp: { connected: true, via: 'Demo', host: 'this browser', version: 'simulated' }, ac, f };
  }

  root.XFC.demo = {
    TYPES,
    start(aircraft, onSnapshot) {
      if (aircraft && TYPES[aircraft]) type = aircraft;
      cb = onSnapshot; t0 = Date.now();
      if (timer) clearInterval(timer);
      timer = setInterval(() => cb && cb(snapshot()), 200);
      cb && cb(snapshot());
    },
    setType(aircraft) { if (TYPES[aircraft]) { type = aircraft; t0 = Date.now(); } },
    stop() { if (timer) clearInterval(timer); timer = null; },
    running() { return !!timer; },
    type() { return type; }
  };
})(typeof self !== 'undefined' ? self : this);
