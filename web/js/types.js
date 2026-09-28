/* XP Flight Computer — aircraft library for the per-aircraft study pages.
 * Facts are typical public figures, rounded ("about"). Speeds marked `poh` are published handbook
 * values (KIAS); everything else on the page comes from the aircraft profile or from X-Plane itself.
 * Airliner entries are keyed to the performance profiles in aircraft.js.
 */
(function (root) {
  'use strict';
  const list = [];
  const add = t => list.push(t);

  // =============================================================== AIRLINERS (profile-linked)
  const A = (id, o) => add(Object.assign({ id, profile: id, cat: 'airliner' }, o));

  A('B736', { family: 'Boeing 737 Next Generation', first: 1998, engines: '2 × CFM56-7B turbofans', seats: '108–130', rangeNm: 3000, spanM: 34.3, lengthM: 31.2,
    about: 'The shortest 737 Next Generation. It shares the NG wing, cockpit and CFM56-7B engines with its bigger sisters, so on a light load it climbs like a rocket and can use short runways.' });
  A('B737', { family: 'Boeing 737 Next Generation', first: 1997, engines: '2 × CFM56-7B turbofans', seats: '126–149', rangeNm: 3000, spanM: 35.8, lengthM: 33.6,
    about: 'The 737-700 was the first Next Generation 737 to fly. It is also the basis of the Boeing Business Jet and was the workhorse of Southwest Airlines for decades.' });
  A('B738', { family: 'Boeing 737 Next Generation', first: 1997, engines: '2 × CFM56-7B turbofans, about 117–121 kN each', seats: '162–189', rangeNm: 2900, spanM: 35.8, lengthM: 39.5,
    about: 'The best-selling Next Generation 737 and one of the most common airliners in the world. X-Plane 12 ships a detailed 737-800, and the Zibo mod is based on it. Mechanical flight controls with hydraulic boost, a conventional yoke and a thrust lever autothrottle — everything the pilot does, the aircraft shows.',
    notes: ['The Next Generation wing (1997) is bigger than the Classic’s and holds more fuel, lifting cruise to M0.78–0.79 and the ceiling to 41 000 ft.', 'Blended winglets, added from about 2001, save roughly 3–4 % fuel on longer sectors.', 'The main gear has no doors: the wheels sit in the belly and you can see the tyres from below.'] });
  A('B739', { family: 'Boeing 737 Next Generation', first: 2006, engines: '2 × CFM56-7B turbofans', seats: '177–220', rangeNm: 2950, spanM: 35.8, lengthM: 42.1,
    about: 'The 737-900ER stretched the NG to 42 m and added extra exits and fuel tanks. Its long fuselage makes tail strikes the thing to respect on rotation and flare.' });
  A('B38M', { family: 'Boeing 737 MAX', first: 2016, engines: '2 × CFM LEAP-1B turbofans', seats: '162–210', rangeNm: 3500, spanM: 35.9, lengthM: 39.5,
    about: 'The 737 MAX 8 keeps the 737 fuselage but uses the larger LEAP-1B engine, mounted further forward and higher. It burns roughly 14 % less fuel than the -800.' });
  A('B733', { family: 'Boeing 737 Classic', first: 1984, engines: '2 × CFM56-3 turbofans', seats: '126–149', rangeNm: 2250, spanM: 28.9, lengthM: 33.4,
    about: 'The Classic series (-300, -400, -500) brought the CFM56 engine to the 737 — hence the flattened “hamster pouch” nacelles, needed to fit a big fan under a low wing. Smaller wing and lower cruise speed than the NG.' });

  A('A319', { family: 'Airbus A320 family', first: 1995, engines: '2 × CFM56-5B or IAE V2500 turbofans', seats: '124–156', rangeNm: 3700, spanM: 35.8, lengthM: 33.8,
    about: 'A shortened A320 with the same wing and fly-by-wire cockpit. Light and powerful for its size, it is a favourite for high and hot airports and corporate conversions (ACJ).' });
  A('A320', { family: 'Airbus A320 family', first: 1987, engines: '2 × CFM56-5B or IAE V2500 turbofans', seats: '150–180', rangeNm: 3300, spanM: 35.8, lengthM: 37.6,
    about: 'The first airliner with digital fly-by-wire and side-sticks. Flight envelope protection keeps the aircraft inside its limits of load factor, pitch, bank, angle of attack and speed in normal law.',
    notes: ['The thrust levers do not move with autothrust: you set them in detents (CL, FLX/MCT, TOGA) and the computers command thrust.', 'VLS, green dot, F and S speeds are computed by the flight computers from the current weight and shown on the speed tape.', 'Sharklet wingtips (from about 2012) save roughly 4 % fuel on long sectors.'] });
  A('A20N', { family: 'Airbus A320neo family', first: 2014, engines: '2 × CFM LEAP-1A or Pratt & Whitney PW1100G geared turbofans', seats: '150–194', rangeNm: 3400, spanM: 35.8, lengthM: 37.6,
    about: 'The “new engine option” A320. Bigger, higher bypass engines burn about 15–20 % less fuel per seat and are noticeably quieter; the cockpit and handling stay A320.' });
  A('A321', { family: 'Airbus A320 family', first: 1993, engines: '2 × CFM56-5B or IAE V2500 turbofans', seats: '185–230', rangeNm: 3200, spanM: 35.8, lengthM: 44.5,
    about: 'The stretched A320. To carry the extra weight on the same wing it has double-slotted flaps, so its approach speeds are close to the A320’s despite being about 15 t heavier.' });
  A('A21N', { family: 'Airbus A320neo family', first: 2016, engines: '2 × CFM LEAP-1A or PW1100G geared turbofans', seats: '180–244', rangeNm: 4000, spanM: 35.8, lengthM: 44.5,
    about: 'The A321neo became the best-selling member of the family. The LR and XLR versions add fuel tanks for transatlantic flights on a narrowbody.' });

  A('A333', { family: 'Airbus A330', first: 1992, engines: '2 × GE CF6-80E1, PW4000 or Rolls-Royce Trent 700 turbofans', seats: '250–300 (up to 440)', rangeNm: 6350, spanM: 60.3, lengthM: 63.7,
    about: 'A long-range twin that shares its wing and cockpit with the four-engined A340. X-Plane 12 includes an A330-300, and the fly-by-wire and flight-management concepts are the A320’s, scaled up.',
    notes: ['The wing is large for the weight, so approach speeds are low for a widebody — typically in the 130s of knots.', 'A330 and A340 pilots share a common type rating.', 'Its ETOPS approvals let it fly oceanic routes far from diversion airports on two engines.'] });
  A('A346', { family: 'Airbus A340', first: 2001, engines: '4 × Rolls-Royce Trent 500 turbofans', seats: '320–380', rangeNm: 7800, spanM: 63.5, lengthM: 75.4,
    about: 'The longest A340, built for very long routes when four engines were still preferred over the ocean. Heavy for its thrust, it is known for long take-off runs and slow initial climbs.' });
  A('A359', { family: 'Airbus A350', first: 2013, engines: '2 × Rolls-Royce Trent XWB turbofans', seats: '300–350', rangeNm: 8100, spanM: 64.8, lengthM: 66.6,
    about: 'Airbus’s carbon-fibre long-haul twin. Its wing changes camber in flight with the flaps, and the cockpit uses large displays with A380-style interfaces.' });
  A('A388', { family: 'Airbus A380', first: 2005, engines: '4 × Rolls-Royce Trent 900 or Engine Alliance GP7200 turbofans', seats: '500–575 (certified for 853)', rangeNm: 8000, spanM: 79.8, lengthM: 72.7,
    about: 'The largest passenger airliner, with two full decks. Its wake is so strong that ICAO created a separate “Super” wake category for it. Production ended in 2021.' });
  A('A306', { family: 'Airbus A300', first: 1983, engines: '2 × GE CF6-80C2 or PW4000 turbofans', seats: '250–270', rangeNm: 4050, spanM: 44.8, lengthM: 54.1,
    about: 'The A300 (first flight 1972) was the first twin-engined widebody and Airbus’s first aircraft. The -600R has a two-crew cockpit and a tail fuel tank; most now fly as freighters.' });

  A('B752', { family: 'Boeing 757', first: 1982, engines: '2 × Rolls-Royce RB211-535 or Pratt & Whitney PW2000 turbofans', seats: '200–239', rangeNm: 3900, spanM: 38.1, lengthM: 47.3,
    about: 'A narrowbody with a big wing and a lot of thrust: the 757 climbs steeply and uses short runways, which is why it still flies from short, hot and high airports and on long, thin routes across the Atlantic.' });
  A('B763', { family: 'Boeing 767', first: 1986, engines: '2 × GE CF6-80C2, PW4000 or RB211-524 turbofans', seats: '218–269', rangeNm: 5980, spanM: 47.6, lengthM: 54.9,
    about: 'The 767 pioneered twin-engine transatlantic flying under ETOPS rules, and the -300ER made it a long-haul standard. Its cockpit is shared with the 757, so pilots can hold one rating for both.' });
  A('B772', { family: 'Boeing 777', first: 1996, engines: '2 × GE90, PW4000 or Rolls-Royce Trent 800 turbofans', seats: '301–400', rangeNm: 7065, spanM: 60.9, lengthM: 63.7,
    about: 'The 777 was Boeing’s first fly-by-wire airliner and the first designed entirely on computer. It kept a conventional yoke and moving thrust levers; envelope protections are softer than Airbus’s.' });
  A('B77W', { family: 'Boeing 777', first: 2003, engines: '2 × GE90-115B turbofans, about 513 kN (115 000 lbf) each', seats: '350–400', rangeNm: 7370, spanM: 64.8, lengthM: 73.9,
    about: 'The 777-300ER combines the long fuselage with raked wingtips and the GE90-115B — for years the most powerful jet engine in service. It became the standard long-haul twin of the 2000s and 2010s.' });
  A('B789', { family: 'Boeing 787 Dreamliner', first: 2013, engines: '2 × GEnx-1B or Rolls-Royce Trent 1000 turbofans', seats: '290–330', rangeNm: 7560, spanM: 60.1, lengthM: 62.8,
    about: 'A composite airframe with a flexible, high-aspect-ratio wing that visibly bends upward in flight. Electrical systems replace most bleed air, and the cabin is pressurised to a lower altitude than older jets.' });
  A('B744', { family: 'Boeing 747', first: 1988, engines: '4 × PW4000, GE CF6-80C2 or RB211-524 turbofans', seats: '416–524', rangeNm: 7260, spanM: 64.4, lengthM: 70.7,
    about: 'The 747-400 gave the Jumbo a two-crew glass cockpit, winglets and more range. The hump holds the flight deck and upper-deck cabin, and the nose of freighters swings up for loading.' });
  A('B748', { family: 'Boeing 747', first: 2010, engines: '4 × GEnx-2B turbofans', seats: '410–467', rangeNm: 7730, spanM: 68.4, lengthM: 76.3,
    about: 'The last and longest 747, with a new wing and 787-technology engines. The final 747 was delivered in 2023, over 54 years after the first flew.' });
  A('B722', { family: 'Boeing 727', first: 1967, engines: '3 × Pratt & Whitney JT8D turbofans', seats: '149–189', rangeNm: 2550, spanM: 32.9, lengthM: 46.7,
    about: 'A three-engined T-tail jet with a three-person cockpit: captain, first officer and flight engineer. Its powerful triple-slotted flaps let a big jet use short runways in the 1960s.' });

  A('MD82', { family: 'McDonnell Douglas MD-80', first: 1981, engines: '2 × Pratt & Whitney JT8D-200 turbofans', seats: '140–172', rangeNm: 2050, spanM: 32.9, lengthM: 45.1,
    about: 'A stretched DC-9 with rear engines and a T-tail. Nicknamed the “Mad Dog”, it has a long, narrow cabin and a famously quiet front cabin because the engines sit behind the wing.' });
  A('MD11', { family: 'McDonnell Douglas MD-11', first: 1990, engines: '3 × GE CF6-80C2 or PW4460 turbofans', seats: '285–410', rangeNm: 6700, spanM: 52.0, lengthM: 61.6,
    about: 'Developed from the DC-10 with winglets and a smaller tail that carries fuel. The small tail made it less stable, so a computer (LSAS) helps in pitch — landings need care, and most MD-11s now fly cargo.' });

  A('E175', { family: 'Embraer E-Jet', first: 2003, engines: '2 × GE CF34-8E turbofans', seats: '76–88', rangeNm: 2000, spanM: 26.0, lengthM: 31.7,
    about: 'A regional jet with a “double-bubble” fuselage that gives a four-abreast cabin with no middle seats. Fly-by-wire (with a yoke) and a Honeywell Primus Epic cockpit.' });
  A('E195', { family: 'Embraer E-Jet', first: 2004, engines: '2 × GE CF34-10E turbofans', seats: '100–124', rangeNm: 2300, spanM: 28.7, lengthM: 38.7,
    about: 'The largest first-generation E-Jet, with a bigger wing than the E170/175. It bridges regional and mainline flying.' });
  A('CRJ9', { family: 'Bombardier CRJ', first: 2001, engines: '2 × GE CF34-8C5 turbofans', seats: '76–90', rangeNm: 1550, spanM: 24.9, lengthM: 36.2,
    about: 'A stretched CRJ with rear engines and a T-tail. It has leading-edge slats (the CRJ200 does not), so its approach speeds are more moderate for its weight.' });
  A('CRJ2', { family: 'Bombardier CRJ', first: 1991, engines: '2 × GE CF34-3B1 turbofans', seats: '50', rangeNm: 1300, spanM: 21.2, lengthM: 26.8,
    about: 'Developed from the Challenger business jet, the 50-seat CRJ200 made regional jets common in the 1990s. A clean wing with no slats gives high approach speeds and a need for care with ice.' });
  A('DH8D', { family: 'De Havilland Canada Dash 8', first: 1998, engines: '2 × Pratt & Whitney Canada PW150A turboprops, about 5 000 shp each', seats: '68–90', rangeNm: 1100, spanM: 28.4, lengthM: 32.8,
    about: 'The fastest turboprop airliner in service: it cruises at about 360 kt, close to regional-jet times on short routes while burning much less fuel. Six-bladed propellers and active noise cancelling keep the cabin quiet.' });
  A('AT76', { family: 'ATR 72', first: 1988, engines: '2 × Pratt & Whitney Canada PW127M turboprops', seats: '68–78', rangeNm: 825, spanM: 27.1, lengthM: 27.2,
    about: 'The most widely used regional turboprop. It cruises at about 275 kt on very little fuel. In icing it needs care: a slow, heavy ATR can pick up ice on areas the boots do not protect.' });

  // ============================================================ GENERAL AVIATION & OTHERS
  add({ id: 'C172', cat: 'ga', kind: 'single', name: 'Cessna 172 Skyhawk', maker: 'Cessna', icao: ['C172'], match: ['\\b172', 'skyhawk'],
    first: 1955, engines: '1 × Lycoming IO-360 piston, 180 hp (172SP)', seats: '4', mtowKg: 1157, fuelL: 201, cruiseKt: 122, ceilingFt: 14000, rangeNm: 640, spanM: 11.0, lengthM: 8.3,
    poh: { vso: 48, vs1: 53, vr: 55, vx: 62, vy: 74, vg: 68, va: 105, vfe: 85, vno: 129, vne: 163 }, pohNote: 'Cessna 172S handbook, knots indicated. Va is at maximum weight; Vfe 85 kt is for flaps 10°–30° (110 kt with 10°).',
    about: 'The most-produced aircraft in history, with well over 40 000 built. A high wing, fixed tricycle gear and very gentle stall make it the classic trainer. X-Plane 12 includes the 172SP with steam gauges and with a G1000.',
    notes: ['Mixture: lean in the cruise for best power or economy; full rich for take-off at low airfields.', 'Flaps are electric: 10°, 20° and 30°. Use 0–10° for take-off.', 'The fuel selector should be on BOTH for take-off and landing.'],
    approach: { pattern: 80, final: 65, flaps: 'flaps 30°', shortField: 61 },
    quiz: [
      { q: 'What is the best-glide speed of the Cessna 172S at maximum weight?', a: ['55 kt', '68 kt', '85 kt', '105 kt'], c: 1, why: 'The handbook gives 68 KIAS. It gives the greatest distance per foot of height — roughly 9 NM from 6 000 ft above the ground.' },
      { q: 'Which arc on the airspeed indicator marks the normal flap operating range?', a: ['Green', 'Yellow', 'White', 'Red line'], c: 2, why: 'The white arc runs from Vso (stall with full flap) to Vfe (the top speed for full flap).' },
      { q: 'Why is manoeuvring speed (Va) lower when the aircraft is lighter?', a: ['The engine makes less power', 'A lighter aircraft reaches the limit load factor at a lower speed', 'The flaps are less effective', 'It isn’t — Va is fixed'], c: 1, why: 'Va = Vs·√n_limit. Stall speed falls with the square root of weight, so the speed at which a full deflection can reach the limit load factor falls too.' }
    ] });
  add({ id: 'C152', cat: 'ga', kind: 'single', name: 'Cessna 152', maker: 'Cessna', icao: ['C152', 'C150'], match: ['\\b15[02]\\b', 'cessna 15[02]'],
    first: 1977, engines: '1 × Lycoming O-235 piston, 110 hp', seats: '2', mtowKg: 757, cruiseKt: 107, ceilingFt: 14700, rangeNm: 415, spanM: 10.1, lengthM: 7.3,
    poh: { vso: 35, vx: 55, vy: 67, vg: 60, va: 104, vfe: 85, vno: 111, vne: 149 }, pohNote: 'Cessna 152 handbook, knots indicated (Va at maximum weight).',
    about: 'A two-seat trainer that taught generations to fly. Light and slow, it is easy to land but sensitive to gusts and to weight: two adults and full fuel is often over the limit.',
    approach: { pattern: 70, final: 60, flaps: 'flaps 30°', shortField: 54 } });
  add({ id: 'PA28', cat: 'ga', kind: 'single', name: 'Piper PA-28 Cherokee / Warrior', maker: 'Piper', icao: ['P28A', 'P28B', 'P28R', 'PA28'], match: ['pa-?28', 'cherokee', 'warrior', 'archer', 'arrow'],
    first: 1960, engines: '1 × Lycoming O-320 piston, 160 hp (Warrior II)', seats: '4', mtowKg: 1107, cruiseKt: 115, ceilingFt: 11000, spanM: 10.7, lengthM: 7.3,
    poh: { vso: 44, vs1: 50, vx: 63, vy: 79, vg: 73, va: 111, vfe: 103, vno: 126, vne: 160 }, pohNote: 'Typical PA-28-161 Warrior II handbook values, knots indicated (Va at maximum weight).',
    about: 'Piper’s low-wing four-seat family: Cherokee, Warrior, Archer and the retractable Arrow. The low wing gives more ground effect in the flare than a Cessna — expect it to float if you are fast.',
    approach: { pattern: 85, final: 66, flaps: 'full flaps (40°)' } });
  add({ id: 'SR22', cat: 'ga', kind: 'single', name: 'Cirrus SR22', maker: 'Cirrus', icao: ['SR22', 'SR20', 'S22T'], match: ['sr-?22', 'sr-?20', 'cirrus sr'],
    first: 2000, engines: '1 × Continental IO-550-N piston, 310 hp', seats: '4–5', cruiseKt: 180, spanM: 11.7, lengthM: 8.0,
    about: 'A fast composite single with side-stick controls, a glass cockpit and the Cirrus Airframe Parachute System (CAPS), which lowers the whole aircraft under a canopy in an emergency. Its wing is efficient but it stalls less gently than a 172.' });
  add({ id: 'BE58', cat: 'ga', kind: 'twin', name: 'Beechcraft Baron 58', maker: 'Beechcraft', icao: ['BE58', 'BE55'], match: ['baron'],
    first: 1969, engines: '2 × Continental IO-550-C pistons, 300 hp each', seats: '4–6', mtowKg: 2495, cruiseKt: 200, ceilingFt: 20000, spanM: 11.5, lengthM: 9.1,
    poh: { vmca: 84, vyse: 101, vno: 195, vne: 223 }, pohNote: 'Baron 58 handbook, knots indicated: red radial Vmca 84, blue line Vyse 101, Vno 195, Vne 223.',
    about: 'A fast piston twin used for multi-engine training and personal travel. X-Plane 12 includes one. With an engine out, the Baron’s speed and discipline matter: Vmca and the blue line are painted on the airspeed indicator for a reason.',
    notes: ['Identify, verify, feather: dead foot = dead engine; confirm with the throttle; then feather the propeller of the failed engine.', 'Bank about 5° towards the live engine to reduce sideslip and improve single-engine climb.'],
    approach: { pattern: 120, final: 95, flaps: 'full flaps' } });
  add({ id: 'BE9L', cat: 'turboprop', kind: 'twin', name: 'Beechcraft King Air C90', maker: 'Beechcraft', icao: ['BE9L', 'BE9T', 'BE20', 'B350'], match: ['king ?air'],
    first: 1964, engines: '2 × Pratt & Whitney Canada PT6A turboprops, 550 shp each (C90B)', seats: '5–7', mtowKg: 4580, cruiseKt: 225, ceilingFt: 30000, spanM: 15.3, lengthM: 10.8,
    about: 'The King Air family is the best-selling business turboprop. The PT6A is a free-turbine engine: the power turbine drives the propeller, so you set torque with the power lever and propeller RPM with the propeller lever. Watch ITT on start and in the climb.',
    approach: { pattern: 130, final: 105, flaps: 'full flaps' } });
  add({ id: 'TBM9', cat: 'turboprop', kind: 'single', name: 'Daher TBM 900 series', maker: 'Daher', icao: ['TBM9', 'TBM8', 'TBM7'], match: ['tbm'],
    first: 1988, engines: '1 × Pratt & Whitney Canada PT6A-66D turboprop, 850 shp', seats: '4–6', cruiseKt: 320, ceilingFt: 31000, spanM: 12.8, lengthM: 10.7,
    about: 'A pressurised single-engine turboprop that cruises above 300 kt. The powerful single engine means a strong left-turning tendency on take-off: lead with right rudder as the power comes up.' });
  add({ id: 'PC12', cat: 'turboprop', kind: 'single', name: 'Pilatus PC-12', maker: 'Pilatus', icao: ['PC12'], match: ['pc-?12'],
    first: 1991, engines: '1 × Pratt & Whitney Canada PT6A-67 turboprop, about 1 200 shp', seats: '6–9', cruiseKt: 280, ceilingFt: 30000, spanM: 16.3, lengthM: 14.4,
    about: 'A large single-engine turboprop used by air ambulances, bush and regional operators. Big flaps and a strong gear let it use short, rough strips while carrying a cabin of passengers.' });
  add({ id: 'C208', cat: 'turboprop', kind: 'single', name: 'Cessna 208 Caravan', maker: 'Cessna', icao: ['C208'], match: ['caravan', '\\b208'],
    first: 1982, engines: '1 × Pratt & Whitney Canada PT6A-114A turboprop, 675 shp', seats: '9–13', cruiseKt: 185, ceilingFt: 25000, spanM: 15.9, lengthM: 12.7,
    about: 'A rugged utility turboprop flown on floats, skis and wheels, for cargo and short-haul passengers. Slow and stable, with big flaps; the engine gives plenty of power for short strips.' });
  add({ id: 'C750', cat: 'bizjet', kind: 'jet', name: 'Cessna Citation X', maker: 'Cessna', icao: ['C750'], match: ['citation x', 'citation 750'],
    first: 1993, engines: '2 × Rolls-Royce AE 3007C turbofans', seats: '8–12', mtowKg: 16375, ceilingFt: 51000, rangeNm: 3200, spanM: 19.4, lengthM: 22.0, mmo: 0.92,
    about: 'One of the fastest civil aircraft ever certified: Mmo is 0.92, and it cruises above M0.90 at up to 51 000 ft. X-Plane 12 includes one. The highly swept wing makes it stable at speed but it lands fast.' });
  add({ id: 'SF50', cat: 'bizjet', kind: 'jet', name: 'Cirrus Vision Jet SF50', maker: 'Cirrus', icao: ['SF50'], match: ['vision ?jet', 'sf50'],
    first: 2008, engines: '1 × Williams FJ33-5A turbofan, about 8 kN (1 800 lbf)', seats: '5–7', cruiseKt: 300, ceilingFt: 31000, spanM: 11.8, lengthM: 9.4,
    about: 'A single-engine personal jet with the engine on top of the fuselage in a V-tail. Like the SR22 it carries a whole-aircraft parachute. X-Plane 12 includes one.' });
  add({ id: 'CL60', cat: 'bizjet', kind: 'jet', name: 'Bombardier Challenger 600 series', maker: 'Bombardier', icao: ['CL60', 'CL30', 'CL35'], match: ['challenger'],
    first: 1978, engines: '2 × GE CF34-3 turbofans (Challenger 604/650)', seats: '9–12', ceilingFt: 41000, rangeNm: 4000, spanM: 19.6, lengthM: 20.9,
    about: 'A wide-cabin business jet whose design was also stretched into the CRJ regional airliners. Rear engines, a T-tail and a supercritical wing.' });
  add({ id: 'EVOT', cat: 'ga', kind: 'single', name: 'Lancair Evolution', maker: 'Lancair', icao: ['EVOT', 'EVOP'], match: ['evolution'],
    first: 2008, engines: '1 × Pratt & Whitney Canada PT6A-135A turboprop, 750 shp', seats: '4', cruiseKt: 290, ceilingFt: 28000, spanM: 11.0, lengthM: 9.4,
    about: 'A pressurised four-seat kit aircraft with turboprop power — airliner altitudes in a light aircraft. Very clean aerodynamics: plan the descent early, because it does not like to slow down.' });
  add({ id: 'RV10', cat: 'ga', kind: 'single', name: 'Van’s RV-10', maker: 'Van’s Aircraft', icao: ['RV10'], match: ['rv-?10'],
    first: 2003, engines: '1 × Lycoming IO-540 piston, 260 hp', seats: '4', mtowKg: 1225, cruiseKt: 170, spanM: 9.6, lengthM: 7.5,
    about: 'Van’s four-seat kit plane, built by owners in garages around the world. Fast and roomy with gull-wing doors. X-Plane 12 includes one.' });
  add({ id: 'L5', cat: 'ga', kind: 'single', name: 'Stinson L-5 Sentinel', maker: 'Stinson', icao: ['L5', 'L-5', 'ST75'], match: ['stinson', 'sentinel', '\\bl-?5\\b'],
    engines: '1 × Lycoming O-435 piston, about 185 hp', seats: '2 (tandem)', spanM: 10.4, lengthM: 7.3,
    about: 'A Second World War liaison aircraft that carried messages, officers and casualties from small fields near the front. A tailwheel aircraft: keep it straight with the rudder all the way until it stops.',
    notes: ['On a tailwheel aircraft the centre of gravity is behind the main wheels, so any swing wants to grow: catch it early with rudder.'] });
  add({ id: 'AS21', cat: 'glider', kind: 'glider', name: 'Schleicher ASK 21', maker: 'Alexander Schleicher', icao: ['AS21'], match: ['ask ?21'],
    first: 1979, engines: 'none (glider)', seats: '2 (tandem)', mtowKg: 600, spanM: 17.0, lengthM: 8.4, ld: 34,
    poh: { vne: 151 }, pohNote: 'Vne 280 km/h (151 kt).',
    about: 'A robust two-seat glass-fibre glider used for training and basic aerobatics all over the world. Best glide ratio about 34 : 1 — it travels 34 m forward for every metre of height. X-Plane 12 includes one.',
    approach: { pattern: 55, final: 50, flaps: 'airbrakes as required' } });
  add({ id: 'S76', cat: 'helicopter', kind: 'heli', name: 'Sikorsky S-76', maker: 'Sikorsky', icao: ['S76'], match: ['s-?76'],
    first: 1977, engines: '2 × turboshafts (Turbomeca Arriel 2S2 on the S-76C++)', seats: '12–13 passengers', cruiseKt: 150, spanM: 13.4, lengthM: 16.0,
    about: 'A twin-turbine medium helicopter used for offshore oil-rig transport, air ambulance and VIP flights. Retractable gear and a clean shape make it fast for a helicopter. X-Plane 12 includes one.' });
  add({ id: 'R22', cat: 'helicopter', kind: 'heli', name: 'Robinson R22', maker: 'Robinson', icao: ['R22'], match: ['r-?22'],
    first: 1975, engines: '1 × Lycoming O-360 piston, derated (Beta II)', seats: '2', mtowKg: 621, cruiseKt: 96, spanM: 7.7, lengthM: 8.8,
    poh: { vne: 102 }, pohNote: 'Vne 102 KIAS (lower at high density altitude).',
    about: 'The most common training helicopter. Its light two-bladed rotor has little inertia, so rotor RPM decays quickly if power fails: lower the collective at once to enter autorotation. X-Plane 12 includes one.',
    notes: ['Low rotor RPM warning horn: lower collective and roll on throttle.', 'Avoid low-G (pushover) manoeuvres: they can cause mast bumping in a teetering rotor.'] });
  add({ id: 'F4', cat: 'military', kind: 'jet', name: 'McDonnell Douglas F-4 Phantom II', maker: 'McDonnell Douglas', icao: ['F4'], match: ['f-?4\\b', 'phantom'],
    first: 1958, engines: '2 × GE J79 turbojets with afterburner', seats: '2 (tandem)', spanM: 11.7, lengthM: 19.2,
    about: 'A Mach 2 interceptor and fighter-bomber from 1958; more than 5 000 were built. Anhedral tailplane and dihedral outer wings are its trademark. X-Plane 12 includes one.' });
  add({ id: 'UL', cat: 'ga', kind: 'ultralight', name: 'Ultralight (US Part 103)', maker: '—', icao: [], match: ['aerolite', 'part 103', 'ultralight'],
    about: 'US Part 103 ultralights need no pilot licence or registration, but have strict limits: one seat, at most 254 lb (115 kg) empty, 5 US gal of fuel, 55 kt full-power level speed and a power-off stall speed no higher than 24 kt.' });

  // ------------------------------------------------------------------- lookup
  const byId = {};
  for (const t of list) byId[t.id] = t;

  function find(ac, det) {
    if (det && det.profile && !det.profile.generic) {
      const t = byId[det.profile.id];
      if (t) return t;
    }
    const code = String((ac && ac.icao) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code) {
      for (const t of list) if (t.cat !== 'airliner' && (t.icao || []).includes(code)) return t;
    }
    const d = String((ac && ac.desc) || '').toLowerCase();
    if (d) {
      for (const t of list) {
        if (t.cat === 'airliner') continue;
        for (const m of (t.match || [])) { try { if (new RegExp(m, 'i').test(d)) return t; } catch (e) { /* ignore */ } }
      }
    }
    return null;
  }

  root.XFC = root.XFC || {};
  root.XFC.types = { list, byId, find };
})(typeof self !== 'undefined' ? self : this);
