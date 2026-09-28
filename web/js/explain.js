/* XP Flight Computer — plain-language explanations for every numbered equation in the study library.
 * Each entry: words (one-sentence meaning), parts ([symbol TeX, what it is, units / typical value]),
 * why (short steps: where the equation comes from and what it tells you), and optionally play:
 * sliders that recompute the equation live. Text may contain inline TeX between $…$.
 */
(function (root) {
  'use strict';
  const R = String.raw;
  const KT = 0.514444, FT = 0.3048, G = 9.80665;
  const E = {};
  const r1 = x => Math.round(x * 10) / 10, r0 = x => Math.round(x), r2 = x => Math.round(x * 100) / 100;
  const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const rhoAt = (C, ft) => C.isa(ft).rho;

  // ============================================================== 1 · PRINCIPLES OF FLIGHT
  E['1.1'] = {
    words: 'Lift = the push of the oncoming air (½ρV²) × the wing area (S) × a number that says how hard the wing is working ($C_L$).',
    parts: [['L', 'lift: the force from the wing at right angles to the airflow', 'newtons (N). To hold up 70 t you need 70 000 × 9.81 = 687 kN'],
      [R`\rho`, '“rho”: air density — the mass of one cubic metre of air', 'kg/m³: 1.225 at sea level, about 0.38 at FL350'],
      ['V', 'true airspeed', 'm/s in the formula (1 kt = 0.5144 m/s)'],
      ['S', 'wing area, seen from above', 'm²: 16.2 for a Cessna 172, 124.6 for a 737-800'],
      [R`C_L`, 'lift coefficient: how much lift the wing gets out of the air — it grows with angle of attack', 'no unit: about 0.5 in cruise, 2.5–3 with full flaps'],
      [R`\tfrac12\rho V^2`, 'dynamic pressure q: the push you feel with your hand out of a car window', 'pascals (Pa)']],
    why: ['Moving air carries energy. The kinetic energy in each cubic metre of air is $\\tfrac12\\rho V^2$ — the same $\\tfrac12 m v^2$ from school, with density in place of mass. That is the pressure the wing has to work with.',
      'Pressure × area = force, so multiplying by the wing area $S$ turns that pressure into a force.',
      'The wing only turns part of it into lift. How much depends on its shape and angle of attack; that number is $C_L$.',
      'Because $V$ is squared, double the speed gives four times the lift, and half the speed only a quarter. That is why slow flight needs a much higher angle of attack.'],
    play: { inputs: [{ k: 'v', label: 'True airspeed', unit: 'kt', min: 40, max: 500, step: 5, v: 150 }, { k: 'alt', label: 'Altitude (ISA)', unit: 'ft', min: 0, max: 41000, step: 1000, v: 0 },
      { k: 's', label: 'Wing area', unit: 'm²', min: 10, max: 850, step: 0.1, v: 124.6 }, { k: 'cl', label: 'Lift coefficient', unit: '', min: 0.1, max: 3, step: 0.05, v: 0.8 }],
      out: (v, C) => { const rho = rhoAt(C, v.alt), q = 0.5 * rho * Math.pow(v.v * KT, 2), L = q * v.s * v.cl;
        return [['Density ρ', fmt(rho, 3) + ' kg/m³'], ['Dynamic pressure q', fmt(q) + ' Pa'], ['Lift', fmt(L / 1000, 1) + ' kN'], ['Mass it can hold up', fmt(L / G / 1000, 1) + ' t']]; } }
  };
  E['1.2'] = {
    words: 'Drag has exactly the same form as lift: dynamic pressure × wing area × a coefficient — this time the drag coefficient $C_D$.',
    parts: [['D', 'drag: the force from the air that holds the aircraft back, along the airflow', 'newtons (N)'],
      [R`C_D`, 'drag coefficient: how “draggy” the aircraft is at this angle of attack', 'about 0.02–0.03 for an airliner in cruise'],
      [R`\rho,\ V,\ S`, 'density, true airspeed and wing area, as in the lift equation', '']],
    why: ['Drag comes from the same moving air as lift, so it also scales with $\\tfrac12\\rho V^2 S$.',
      'Divide lift by drag and everything cancels except the coefficients: $L/D = C_L/C_D$. The lift-to-drag ratio depends only on how the wing is being flown (its angle of attack), not directly on speed or height.',
      'Using the wing area as the reference is a convention: it lets you compare coefficients between aircraft of different sizes.'],
    play: { inputs: [{ k: 'v', label: 'True airspeed', unit: 'kt', min: 60, max: 500, step: 5, v: 250 }, { k: 'alt', label: 'Altitude (ISA)', unit: 'ft', min: 0, max: 41000, step: 1000, v: 10000 },
      { k: 'cd', label: 'Drag coefficient', unit: '', min: 0.015, max: 0.2, step: 0.005, v: 0.03 }],
      out: (v, C) => { const q = 0.5 * rhoAt(C, v.alt) * Math.pow(v.v * KT, 2), D = q * 124.6 * v.cd;
        return [['Dynamic pressure', fmt(q) + ' Pa'], ['Drag (737-size wing)', fmt(D / 1000, 1) + ' kN'], ['Thrust needed to hold speed', fmt(D / 1000, 1) + ' kN']]; } }
  };
  E['1.3'] = {
    words: 'Below the stall, the lift coefficient grows in a straight line with the angle of attack.',
    parts: [[R`\alpha`, '“alpha”: angle of attack — the angle between the wing’s chord line and the oncoming air', 'degrees'],
      [R`\alpha_0`, 'zero-lift angle: the angle at which the wing makes no lift. A cambered wing still lifts at 0°, so this is a little negative', 'about −2° clean, more negative with flaps'],
      ['a', 'lift-curve slope: how much $C_L$ rises per degree', 'about 0.1 per degree']],
    why: ['It is the equation of a straight line — the same as $y = m(x - x_0)$ from school.',
      'While the airflow stays attached to the wing, it deflects the air downwards in proportion to the angle, so lift grows in proportion too.',
      'The straight line stops at the critical angle, about 15–18° for a clean wing. Beyond it the flow separates from the top of the wing and lift falls: the stall. It happens at an angle, not a speed.',
      'Flaps add camber, moving the whole line up (they make $\\alpha_0$ more negative): more lift at every angle.'],
    play: { inputs: [{ k: 'a', label: 'Angle of attack α', unit: '°', min: -4, max: 22, step: 0.5, v: 5 }, { k: 'a0', label: 'Zero-lift angle α₀', unit: '°', min: -12, max: 0, step: 0.5, v: -2 }],
      out: v => { const cl = 0.1 * (v.a - v.a0), st = v.a > 16; return [['Lift coefficient', st ? 'stalled — lift is falling' : fmt(cl, 2)], ['Note', st ? 'past the critical angle (~16°)' : 'on the straight part of the curve']]; } }
  };
  E['1.4'] = {
    words: 'Turn the lift equation around: in level flight lift equals weight, so this is the lift coefficient the wing must produce at your weight and speed.',
    parts: [['W', 'weight = mass × g', 'newtons; g = 9.81 m/s²'], [R`\rho,\ V,\ S`, 'density, true airspeed, wing area', '']],
    why: ['Level flight means lift balances weight: $L = W$.',
      'Put that into the lift equation: $W = \\tfrac12\\rho V^2 S C_L$.',
      'Divide both sides by $\\tfrac12\\rho V^2 S$: $C_L = \\dfrac{W}{\\tfrac12\\rho V^2 S} = \\dfrac{2W}{\\rho V^2 S}$.',
      '$V^2$ is on the bottom: at half the speed the wing needs four times the $C_L$ — a much higher angle of attack. That is why slow flight is nose-high, and why there is a speed below which the wing cannot produce enough.'],
    play: { inputs: [{ k: 'm', label: 'Mass', unit: 't', min: 40, max: 80, step: 1, v: 65 }, { k: 'v', label: 'Indicated airspeed', unit: 'kt', min: 110, max: 330, step: 5, v: 250 }],
      out: v => { const cl = 2 * v.m * 1000 * G / (1.225 * Math.pow(v.v * KT, 2) * 124.6);
        return [['C_L needed (737-800 wing)', fmt(cl, 2)], ['Clean wing can give about', '1.5'], ['Verdict', cl > 1.5 ? 'too slow: stall without flaps' : cl > 1.1 ? 'close to the stall: extend flaps' : 'fine']]; } }
  };
  E['1.5'] = {
    words: 'The stall speed is the speed at which the wing, working at its maximum lift coefficient, can only just carry the weight — multiplied by the load factor.',
    parts: [[R`V_S`, 'stall speed', 'm/s in the formula; as indicated airspeed in practice'],
      ['n', 'load factor: how many g the wing must pull', '1 in level flight, 2 in a 60° banked turn'],
      [R`\rho_0`, 'sea-level density, 1.225 kg/m³. Using it gives the stall speed as an indicated (equivalent) airspeed — which is why the stall IAS hardly changes with altitude', ''],
      [R`C_{L\max}`, 'the highest lift coefficient the wing can reach', 'about 1.5 clean, 2.5 or more with landing flaps']],
    why: ['The wing must make lift $L = nW$: equal to the weight in straight flight, more in a turn or pull-up.',
      'The most lift it can make at speed $V$ is $\\tfrac12\\rho V^2 S C_{L\\max}$.',
      'Set the two equal and solve for $V$: $V^2 = \\dfrac{2nW}{\\rho S C_{L\\max}}$, then take the square root.',
      'The square root softens everything: 21 % more weight raises the stall speed only 10 %; doubling the g raises it 41 %.'],
    play: { inputs: [{ k: 'm', label: 'Mass', unit: 'kg', min: 700, max: 1300, step: 1, v: 1157 }, { k: 'cl', label: 'C_Lmax', unit: '', min: 1.2, max: 2.4, step: 0.05, v: 1.6 },
      { k: 'b', label: 'Bank angle', unit: '°', min: 0, max: 70, step: 5, v: 0 }],
      out: v => { const n = 1 / Math.cos(v.b * Math.PI / 180), vs = Math.sqrt(2 * n * v.m * G / (1.225 * 16.2 * v.cl)) / KT;
        return [['Load factor n', fmt(n, 2) + ' g'], ['Stall speed (172-size wing)', fmt(vs) + ' kt']]; } }
  };
  E['1.6'] = {
    words: 'Know the stall speed at one weight and you know it at any other: multiply by the square root of the weight ratio.',
    parts: [[R`V_{S1},\ W_1`, 'the stall speed at a known weight — usually the handbook value at maximum weight', ''], [R`V_{S2},\ W_2`, 'the stall speed at your weight', '']],
    why: ['Write equation 1.5 for both weights and divide one by the other. Everything that is the same — density, wing area, $C_{L\\max}$ — cancels.',
      'What remains: $\\dfrac{V_{S2}}{V_{S1}} = \\sqrt{\\dfrac{W_2}{W_1}}$.',
      'It works for every speed that is a fixed multiple of the stall speed: Vref, V2, green dot, best glide, manoeuvring speed.'],
    play: { inputs: [{ k: 'v1', label: 'Book stall speed', unit: 'kt', min: 40, max: 160, step: 1, v: 48 }, { k: 'w1', label: 'At weight', unit: 'kg', min: 500, max: 100000, step: 1, v: 1157 },
      { k: 'w2', label: 'Your weight', unit: 'kg', min: 400, max: 100000, step: 50, v: 900 }],
      out: v => [['Ratio W₂/W₁', fmt(v.w2 / v.w1, 3)], ['Square root', fmt(Math.sqrt(v.w2 / v.w1), 3)], ['Stall speed now', fmt(v.v1 * Math.sqrt(v.w2 / v.w1), 1) + ' kt']] }
  };
  E['1.7'] = {
    words: 'In a banked turn the lift is tilted. Its vertical part must still carry the weight; its horizontal part pulls the aircraft round the circle.',
    parts: [[R`\phi`, '“phi”: bank angle', 'degrees'], [R`L\cos\phi`, 'vertical part of the lift', ''], [R`L\sin\phi`, 'horizontal (sideways) part of the lift', ''],
      [R`\tfrac{mV^2}{r}`, 'centripetal force: what it takes to keep a mass $m$ moving in a circle of radius $r$ at speed $V$ — like the pull in a string when you swing a ball', 'newtons']],
    why: ['Split the tilted lift arrow into a vertical and a horizontal part with trigonometry (see “Reading the equations”): vertical $= L\\cos\\phi$, horizontal $= L\\sin\\phi$.',
      'No climbing or sinking, so the vertical part must equal the weight.',
      'Anything moving in a circle needs a force towards the centre, $mV^2/r$. The horizontal part of lift supplies it.',
      'From the first equation: $L = W/\\cos\\phi$. Because $\\cos 60^\\circ = 0.5$, a 60° turn needs twice the lift — 2 g.'],
    play: { inputs: [{ k: 'b', label: 'Bank angle', unit: '°', min: 0, max: 75, step: 1, v: 30 }],
      out: v => { const c = Math.cos(v.b * Math.PI / 180); return [['cos φ', fmt(c, 3)], ['Lift needed = load factor', fmt(1 / c, 2) + ' g'], ['Stall speed goes up by', fmt((Math.sqrt(1 / c) - 1) * 100) + ' %']]; } }
  };
  E['1.8'] = {
    words: 'The turn radius grows with the square of the speed and shrinks with more bank; the rate of turn is the speed divided by the radius.',
    parts: [['r', 'radius of the turn', 'metres'], ['g', 'gravity', '9.81 m/s²'], [R`\tan\phi`, 'tangent of the bank angle (tan 30° = 0.58, tan 45° = 1)', ''],
      [R`\omega`, '“omega”: rate of turn', 'radians per second; × 57.3 for degrees per second']],
    why: ['Divide the two parts of 1.7: $\\dfrac{L\\sin\\phi}{L\\cos\\phi} = \\dfrac{mV^2/r}{W}$. The lift cancels and $\\sin/\\cos = \\tan$.',
      'Weight is $W = mg$, so the mass cancels too: $\\tan\\phi = \\dfrac{V^2}{g\\,r}$. Solve for $r$.',
      'No mass in the answer: a 172 and a 747 at the same speed and bank fly exactly the same circle.',
      'Rate of turn = speed round the circle ÷ radius. Twice as fast at the same bank: twice the rate… no — half the rate, and four times the radius.'],
    play: { inputs: [{ k: 'v', label: 'True airspeed', unit: 'kt', min: 60, max: 480, step: 5, v: 250 }, { k: 'b', label: 'Bank angle', unit: '°', min: 5, max: 60, step: 1, v: 25 }],
      out: (v, C) => { const t = C.turn({ tas: v.v, bank: v.b }); return [['Radius', fmt(t.radiusNm, 2) + ' NM (' + fmt(t.radiusM) + ' m)'], ['Rate of turn', fmt(t.rateDps, 2) + ' °/s'], ['Full circle takes', fmt(t.time360s / 60, 1) + ' min']]; } }
  };
  E['1.9'] = {
    words: 'The bank angle for a standard-rate turn (3° per second, two minutes for a full circle) depends on the true airspeed; the rule of thumb is TAS ÷ 10 + 7.',
    parts: [[R`3^\circ\cdot\tfrac{\pi}{180}`, '3° per second converted to radians per second', '0.0524 rad/s'], [R`\arctan`, '“the angle whose tangent is …” — the reverse of tan', '']],
    why: ['From 1.8: $\\tan\\phi = \\omega V / g$. Put in $\\omega = 3^\\circ$/s = 0.0524 rad/s.',
      '$\\arctan$ turns the tangent back into an angle.',
      'At 100 kt (51.4 m/s): $\\tan\\phi = 0.0524 \\times 51.4 / 9.81 = 0.275$, so $\\phi = 15.4^\\circ$. The rule gives 17°.',
      'The rule of thumb is a straight line that fits the real curve well from about 90 to 250 kt.'],
    play: { inputs: [{ k: 'v', label: 'True airspeed', unit: 'kt', min: 60, max: 350, step: 5, v: 120 }],
      out: v => { const ex = Math.atan(0.05236 * v.v * KT / G) * 180 / Math.PI; return [['Exact bank', fmt(ex, 1) + '°'], ['Rule TAS/10 + 7', fmt(v.v / 10 + 7, 1) + '°']]; } }
  };
  E['1.10'] = {
    words: 'Gliding, the path angle is set by the lift-to-drag ratio: every foot of height buys L/D feet of distance.',
    parts: [[R`\gamma`, '“gamma”: glide path angle below the horizon', 'degrees'], [R`L/D`, 'lift-to-drag ratio = glide ratio', 'about 9 for a 172, 17 for an airliner, 35–60 for gliders'],
      ['h', 'height', ''], ['d', 'distance over the ground in still air', 'same unit as h']],
    why: ['With no thrust, the weight is balanced by lift (at right angles to the path) and drag (along it). Those three forces form a triangle, and its angle is the glide angle: $\\tan\\gamma = D/L$.',
      'The path is a triangle too: $\\tan\\gamma = h/d$.',
      'So $h/d = D/L$, which gives $d = h \\cdot L/D$.',
      'Weight is not in the answer: a heavier aircraft glides just as far, only faster.'],
    play: { inputs: [{ k: 'h', label: 'Height above the ground', unit: 'ft', min: 500, max: 40000, step: 500, v: 6000 }, { k: 'ld', label: 'Glide ratio L/D', unit: '', min: 5, max: 50, step: 1, v: 9 }],
      out: v => [['Glide distance', fmt(v.h * v.ld / 6076, 1) + ' NM'], ['Glide angle', fmt(Math.atan(1 / v.ld) * 180 / Math.PI, 1) + '°'], ['Height lost per NM', fmt(6076 / v.ld) + ' ft']] }
  };
  E['1.11'] = {
    words: 'Total drag coefficient = the drag the aircraft has even when making no lift, plus induced drag that grows with the square of the lift coefficient.',
    parts: [[R`C_{D0}`, 'zero-lift (parasite) drag coefficient: skin friction and the shape of fuselage, gear, antennas…', 'about 0.02 for an airliner, 0.03 for a light aircraft'],
      ['A', 'aspect ratio = span² ÷ wing area: how long and slender the wing is', 'about 7 for a 172, 9–10 for airliners, 20+ for gliders'],
      ['e', 'Oswald efficiency: how close the lift distribution is to ideal', '0.7–0.85'], [R`\pi`, 'pi', '3.1416']],
    why: ['Making lift means pushing air down. The wing leaves swirling tip vortices behind, and the energy in them is the induced drag.',
      'More lift coefficient means stronger vortices, and their drag grows with the square: $C_L^2$.',
      'A long, slender wing spreads the work over more air, so it needs to push each bit of air down less: less induced drag. That is why gliders have long wings.',
      'At high speed $C_L$ is small, so parasite drag dominates; at low speed induced drag does.'],
    play: { inputs: [{ k: 'cl', label: 'Lift coefficient', unit: '', min: 0.1, max: 1.6, step: 0.05, v: 0.5 }, { k: 'a', label: 'Aspect ratio', unit: '', min: 5, max: 30, step: 0.5, v: 9.5 },
      { k: 'cd0', label: 'C_D0', unit: '', min: 0.012, max: 0.05, step: 0.001, v: 0.022 }],
      out: v => { const ind = v.cl * v.cl / (Math.PI * v.a * 0.8), cd = v.cd0 + ind; return [['Induced part', fmt(ind, 4)], ['Total C_D', fmt(cd, 4)], ['L/D at this C_L', fmt(v.cl / cd, 1)]]; } }
  };
  E['1.12'] = {
    words: 'The best lift-to-drag ratio depends only on how slender and efficient the wing is and how clean the aircraft is.',
    parts: [[R`(L/D)_{\max}`, 'the best glide ratio', ''], [R`C_{L,md}`, 'the lift coefficient at which it happens (minimum drag)', '']],
    why: ['$L/D = C_L / C_D = \\dfrac{C_L}{C_{D0} + C_L^2/(\\pi A e)}$.',
      'This is largest exactly where induced drag equals parasite drag: $C_L^2/(\\pi A e) = C_{D0}$, so $C_{L,md} = \\sqrt{\\pi A e\\,C_{D0}}$.',
      'Put that back in: half of the drag is each kind, so $(L/D)_{\\max} = \\dfrac{C_{L,md}}{2C_{D0}} = \\tfrac12\\sqrt{\\pi A e / C_{D0}}$.',
      'Double the aspect ratio: L/D rises by √2 = 41 %. Halve the parasite drag: same gain.'],
    play: { inputs: [{ k: 'a', label: 'Aspect ratio', unit: '', min: 5, max: 30, step: 0.05, v: 9.45 }, { k: 'e', label: 'Efficiency e', unit: '', min: 0.6, max: 0.95, step: 0.01, v: 0.8 },
      { k: 'cd0', label: 'C_D0', unit: '', min: 0.01, max: 0.05, step: 0.001, v: 0.022 }],
      out: v => [['Best L/D', fmt(0.5 * Math.sqrt(Math.PI * v.a * v.e / v.cd0), 1)], ['at C_L', fmt(Math.sqrt(Math.PI * v.a * v.e * v.cd0), 2)]] }
  };
  E['1.13'] = {
    words: 'The climb angle is set by the spare thrust — thrust minus drag — as a fraction of the weight.',
    parts: [[R`\gamma`, 'climb angle', ''], ['T − D', 'excess thrust: what is left after overcoming drag', 'newtons'], ['W', 'weight', 'newtons']],
    why: ['Climbing, part of the weight pulls backwards along the path: $W\\sin\\gamma$.',
      'In a steady climb the thrust balances drag plus that backward pull: $T = D + W\\sin\\gamma$.',
      'Rearrange: $\\sin\\gamma = (T - D)/W$.',
      'Example: spare thrust 10 % of the weight → $\\sin\\gamma = 0.1$ → 5.7° or a 10 % gradient. Lose one of two engines and the spare thrust shrinks far more than half — see Take-off climb segments.'],
    play: { inputs: [{ k: 'tw', label: 'Thrust ÷ weight', unit: '', min: 0.05, max: 0.4, step: 0.01, v: 0.22 }, { k: 'ld', label: 'L/D (drag = weight ÷ L/D)', unit: '', min: 5, max: 20, step: 0.5, v: 10 }],
      out: v => { const s = v.tw - 1 / v.ld; return [['Excess thrust ÷ weight', fmt(s, 3)], ['Climb gradient', s > 0 ? fmt(s * 100, 1) + ' %' : 'cannot climb'], ['Climb angle', s > 0 ? fmt(Math.asin(Math.min(1, s)) * 180 / Math.PI, 1) + '°' : '—']]; } }
  };
  E['1.14'] = {
    words: 'Rate of climb = speed × sin(climb angle) = spare power ÷ weight.',
    parts: [['ROC', 'rate of climb (vertical speed)', 'm/s; × 196.85 for ft/min'], [R`P_{avail} = T\,V`, 'power available: thrust × speed', 'watts'], [R`P_{req} = D\,V`, 'power required to overcome drag', 'watts']],
    why: ['The vertical speed is the vertical part of the velocity: $V\\sin\\gamma$.',
      'Multiply equation 1.13 by $V$: $V\\sin\\gamma = (TV - DV)/W$.',
      'Force × speed is power, so the top line is spare power. The best rate of climb (Vy) is at the speed with the most spare power; the best angle (Vx) at the speed with the most spare thrust.'],
    play: { inputs: [{ k: 'p', label: 'Spare power', unit: 'kW', min: 5, max: 120, step: 1, v: 40 }, { k: 'm', label: 'Mass', unit: 'kg', min: 600, max: 2500, step: 1, v: 1157 }],
      out: v => [['Rate of climb', fmt(v.p * 1000 / (v.m * G) * 196.85) + ' fpm']] }
  };
  E['1.15'] = {
    words: 'The static margin is the distance from the centre of gravity forward to the neutral point, as a fraction of the wing chord. Positive means stable.',
    parts: [[R`K_n`, 'static margin', 'fraction or % of the mean chord'], [R`x_{NP}`, 'neutral point: the CG position at which the aircraft would be neutrally stable', ''],
      [R`x_{CG}`, 'centre of gravity position', ''], [R`\bar c`, 'mean aerodynamic chord (“c bar”)', 'metres']],
    why: ['If the nose rises, both wing and tail meet the air at a larger angle and make more lift. The extra lift acts at the neutral point.',
      'With the CG ahead of the neutral point, that extra lift is behind the CG and pushes the nose back down: stable.',
      'Dividing by the chord makes the number comparable between aircraft: typically 5–20 % of the chord.'],
    play: null
  };
  E['1.16'] = {
    words: 'The tail load needed for balance: the weight times how far the CG is from the wing’s lift point, divided by the tail arm.',
    parts: [[R`L_t`, 'tail lift (negative = pushing down)', 'newtons'], [R`x_{CG} - x_{ac}`, 'distance from the wing aerodynamic centre to the CG (negative when the CG is ahead)', 'metres'], [R`l_t`, 'tail arm: distance from the CG to the tail', 'metres']],
    why: ['Take moments (force × distance) about the wing’s aerodynamic centre. The weight, acting at the CG, turns the aircraft one way; the tail must turn it back.',
      'Moments balance when $L_t \\cdot l_t = W(x_{CG} - x_{ac})$.',
      'With the CG ahead of the aerodynamic centre the result is negative: the tail pushes down, and the wing has to carry that extra load as well as the weight. More forward CG → more down-load → higher stall speed.'],
    play: { inputs: [{ k: 'd', label: 'CG ahead of the lift point', unit: 'cm', min: 0, max: 40, step: 1, v: 10 }, { k: 'lt', label: 'Tail arm', unit: 'm', min: 3, max: 30, step: 0.5, v: 4.5 }],
      out: v => { const f = v.d / 100 / v.lt; return [['Tail down-load', fmt(f * 100, 1) + ' % of the weight'], ['Stall speed rises', fmt((Math.sqrt(1 + f) - 1) * 100, 1) + ' %']]; } }
  };

  // ================================================================= 2 · ATMOSPHERE
  E['2.1'] = {
    words: 'In the lower atmosphere the standard temperature falls by the same amount for every metre you climb.',
    parts: [['T', 'temperature at height h', 'kelvin (K = °C + 273.15)'], [R`T_0`, 'sea-level temperature', '288.15 K = 15 °C'],
      ['L', 'lapse rate', '0.0065 K per metre = 1.98 °C per 1000 ft'], ['h', 'height', 'metres']],
    why: ['It is a straight line: start at 15 °C and take off 6.5 °C per kilometre.',
      'The air is heated from the ground, and air that rises expands and cools, so on average it gets colder with height.',
      'It holds up to the tropopause at 11 km (36 089 ft), where it has reached −56.5 °C; above that ISA keeps the temperature constant.',
      'A real day is warmer or colder than this line; the difference is the ISA deviation the app uses everywhere.'],
    play: { inputs: [{ k: 'ft', label: 'Altitude', unit: 'ft', min: 0, max: 50000, step: 500, v: 10000 }],
      out: (v, C) => [['ISA temperature', fmt(C.isaTempC(v.ft), 1) + ' °C'], ['Rule 15 − 2 per 1000 ft', v.ft > 36089 ? 'n/a above the tropopause' : fmt(15 - 2 * v.ft / 1000, 1) + ' °C']] }
  };
  E['2.2'] = {
    words: 'Pressure falls with height because there is less air above you; with a steady temperature lapse it falls as a power of the temperature ratio.',
    parts: [['P', 'pressure at height h', 'pascals (hPa = Pa ÷ 100)'], [R`P_0`, 'sea-level pressure', '101 325 Pa = 1013.25 hPa'],
      [R`g_0`, 'standard gravity', '9.80665 m/s²'], ['R', 'gas constant of air', '287.05 J/(kg·K)'], ['5.2559', 'just $g_0/(R L)$ worked out', '']],
    why: ['Pressure is the weight of the air above you. Climb a thin slice $dh$ and you leave below you air weighing $\\rho g\\,dh$ per square metre: $dP = -\\rho g\\,dh$.',
      'The gas law links density to pressure and temperature: $\\rho = P/(RT)$. Thin, cold or high — each changes how much air a slice holds.',
      'Put the two together with temperature falling in a straight line (2.1) and add up all the slices (integrate): out comes this power law.',
      'In practice: pressure falls about 1 hPa per 27–30 ft near the ground and has halved by about 18 000 ft.'],
    play: { inputs: [{ k: 'ft', label: 'Altitude', unit: 'ft', min: 0, max: 36000, step: 500, v: 18000 }],
      out: (v, C) => { const i = C.isa(v.ft); return [['Pressure', fmt(i.hPa, 1) + ' hPa'], ['Fraction of sea level', fmt(i.hPa / 1013.25 * 100, 1) + ' %']]; } }
  };
  E['2.3'] = {
    words: 'Above the tropopause the temperature stays constant, and the pressure falls by the same fraction for every metre — an exponential.',
    parts: [[R`P_{11}`, 'pressure at 11 km', '22 632 Pa = 226.3 hPa'], [R`T_{11}`, 'temperature there', '216.65 K = −56.5 °C'], [R`\exp(x)`, 'e to the power x (e ≈ 2.718)', '']],
    why: ['Same slice-by-slice idea as 2.2, but now the temperature does not change with height.',
      'Then each metre removes the same fraction of the pressure — and “the same fraction per step” is exactly what an exponential does.',
      'The pressure divides by e every $RT_{11}/g_0$ = 6.34 km: 226 hPa at 36 089 ft, 116 hPa at 50 000 ft.'],
    play: { inputs: [{ k: 'ft', label: 'Altitude', unit: 'ft', min: 36100, max: 65000, step: 100, v: 45000 }],
      out: (v, C) => [['Pressure', fmt(C.isa(v.ft).hPa, 1) + ' hPa']] }
  };
  E['2.4'] = {
    words: 'Density follows from pressure and temperature (the gas law); the speed of sound depends only on temperature.',
    parts: [[R`\rho`, 'density', 'kg/m³'], ['P', 'pressure', 'Pa'], ['T', 'temperature', 'kelvin'], ['a', 'speed of sound', 'm/s'], [R`\gamma`, '“gamma”: 1.4 for air (ratio of specific heats)', '']],
    why: ['The ideal gas law: $P = \\rho R T$, rearranged. More pressure packs the air tighter; warmer air spreads out.',
      'Sound is a pressure wave passed from molecule to molecule. Warmer molecules move faster, so sound travels faster. Pressure does not matter.',
      'At 15 °C: $a = \\sqrt{1.4 \\times 287 \\times 288} = 340$ m/s = 661 kt. At −56.5 °C: 295 m/s = 573 kt.'],
    play: { inputs: [{ k: 'p', label: 'Pressure', unit: 'hPa', min: 150, max: 1050, step: 1, v: 1013 }, { k: 't', label: 'Temperature', unit: '°C', min: -60, max: 45, step: 1, v: 15 }],
      out: v => { const T = v.t + 273.15; return [['Density', fmt(v.p * 100 / (287.05 * T), 3) + ' kg/m³'], ['Speed of sound', fmt(Math.sqrt(1.4 * 287.05 * T) / KT, 1) + ' kt']]; } }
  };
  E['2.5'] = {
    words: 'An altimeter is a barometer. It turns the outside pressure into an ISA height and subtracts the ISA height of the pressure set in its window.',
    parts: [[R`h_{ind}`, 'what the altimeter shows', 'ft'], [R`h_{ISA}(P)`, 'the ISA height where the pressure is P (the formula on the right)', 'ft'], [R`P_{static}`, 'outside (static) pressure', 'hPa'],
      [R`P_{set}`, 'the setting: QNH, QFE or 1013.25', 'hPa'], ['0.1903', '1 ÷ 5.2559 — the pressure formula 2.2 turned inside out', '']],
    why: ['The right-hand formula is equation 2.2 solved for height: given a pressure, which ISA height has it?',
      'The altimeter measures how far the outside pressure is “above” the pressure you set, in ISA feet.',
      'QNH set: the zero is at sea level, so you read altitude. 1013.25 set: you read pressure altitude (flight levels).',
      'Near sea level 1 hPa ≈ 27 ft: set 10 hPa too high and the altimeter reads about 270 ft too high.'],
    play: { inputs: [{ k: 'pa', label: 'Pressure altitude', unit: 'ft', min: 0, max: 15000, step: 100, v: 3000 }, { k: 'set', label: 'Altimeter setting', unit: 'hPa', min: 950, max: 1050, step: 1, v: 1003 }],
      out: v => { const hs = 145366.45 * (1 - Math.pow(v.set / 1013.25, 0.190284)); return [['Height of the setting level', fmt(hs) + ' ft'], ['Altimeter reads', fmt(v.pa - hs) + ' ft']]; } }
  };
  E['2.6'] = {
    words: 'Work out the real density from pressure and temperature, then find the ISA altitude that has the same density.',
    parts: [[R`P(PA)`, 'pressure at your pressure altitude', 'Pa'], ['OAT', 'outside air temperature', '°C'], ['DA', 'density altitude', 'm or ft'],
      [R`T_0/L`, '288.15 ÷ 0.0065 = 44 331 m', ''], ['0.2350', '1 ÷ 4.2559 — the ISA density exponent turned inside out', '']],
    why: ['Wings, engines and propellers respond to density, so the useful “altitude” for performance is one that describes density.',
      'Step one is the gas law (2.4) with the real temperature.',
      'Step two inverts the ISA density profile: in ISA $\\rho/\\rho_0 = (T/T_0)^{4.2559}$; solve for the height.',
      'Hot air is thinner, so the same density is found higher in ISA: density altitude above pressure altitude.'],
    play: { inputs: [{ k: 'pa', label: 'Pressure altitude', unit: 'ft', min: 0, max: 12000, step: 100, v: 5000 }, { k: 't', label: 'OAT', unit: '°C', min: -20, max: 45, step: 1, v: 30 }],
      out: (v, C) => { const d = C.densityAltitude(v.pa, v.t); return [['ISA deviation', (d.isaDev >= 0 ? '+' : '') + fmt(d.isaDev, 1) + ' °C'], ['Density altitude', fmt(d.ft) + ' ft'], ['Rule of thumb (2.7)', fmt(d.approxFt) + ' ft']]; } }
  };
  E['2.7'] = {
    words: 'Rule of thumb: every degree warmer than standard raises the density altitude by about 120 ft.',
    parts: [[R`T_{ISA}`, 'standard temperature at that pressure altitude: 15 − 1.98 × PA/1000', '°C'], [R`OAT - T_{ISA}`, 'ISA deviation', '°C']],
    why: ['It is a straight-line version of 2.6 close to ISA.',
      '+10 °C → +1200 ft. At a 5000 ft airfield on a 30 °C day (ISA +25) that is +3000 ft: the aircraft performs as if it were at about 8000 ft.',
      'Good to within 100–200 ft in normal conditions.'],
    play: null
  };
  E['2.8'] = {
    words: 'The true height above a station is the indicated height corrected for how much colder or warmer the air column is than ISA.',
    parts: [[R`\Delta h`, 'height above the station that the altimeter shows', 'm'], [R`\Delta h_{true}`, 'real height above the station', 'm'],
      [R`\Delta T`, 'ISA deviation (negative when cold)', 'K'], [R`\lambda`, '“lambda”: the ISA lapse rate with its sign', '−0.0065 K/m'], [R`h_s`, 'station elevation', 'm'], [R`\ln`, 'natural logarithm', '']],
    why: ['The altimeter assumes every layer of air has ISA temperature. Cold air is denser, so its layers are thinner: the same pressure drop happens over fewer metres.',
      'Add up the thickness of every layer at its real temperature instead of the ISA one; the extra term is the difference.',
      'The logarithm appears because thickness is proportional to temperature and temperature changes up the column. For modest heights it is about $\\Delta h\\,\\Delta T / T$: roughly 4 % per 10 °C.',
      'Cold means $\\Delta T$ negative, so the true height is lower than indicated — dangerous near terrain.'],
    play: { inputs: [{ k: 'h', label: 'Indicated height above the station', unit: 'ft', min: 500, max: 10000, step: 100, v: 3000 }, { k: 'dt', label: 'ISA deviation', unit: '°C', min: -40, max: 30, step: 1, v: -20 }],
      out: (v, C) => { const t = C.trueHeight(v.h, v.dt, 0); return [['True height', fmt(t) + ' ft'], ['Difference', (t - v.h >= 0 ? '+' : '') + fmt(t - v.h) + ' ft']]; } }
  };
  E['2.9'] = {
    words: 'ICAO’s simplified cold-weather correction: how many feet to add to a published minimum altitude when the airfield is colder than ISA.',
    parts: [['H', 'height of the minimum altitude above the altimeter-setting source', 'm'], [R`t_0`, 'aerodrome temperature reduced to sea level', '°C'],
      [R`L_0`, 'lapse rate', '0.0065 °C/m'], [R`H_{ss}`, 'elevation of the altimeter-setting source (usually the airfield)', 'm']],
    why: ['It is a simplified form of 2.8 using the temperature measured at the airfield.',
      'The top, $15 - t_0$, is how much colder than ISA it is; multiplying by $H$ makes the correction grow with height.',
      'The bottom is the average temperature of the air column in kelvin: the error is the fraction $\\Delta T/T$ of the height.',
      'Rule of thumb: add 4 % of the height for every 10 °C below ISA.'],
    play: null
  };

  // ================================================================== 3 · AIRSPEED
  E['3.1'] = {
    words: 'The airspeed indicator really measures impact pressure. This is the pressure that belongs to each calibrated airspeed.',
    parts: [[R`q_c`, 'impact pressure: total (pitot) pressure minus static pressure', 'Pa'], [R`P_0,\ a_0`, 'sea-level pressure and speed of sound', '101 325 Pa, 661.47 kt'],
      [R`V_c`, 'calibrated airspeed (CAS)', 'kt'], ['0.2 and 3.5', 'numbers from γ = 1.4: (γ−1)/2 and γ/(γ−1)', '']],
    why: ['At low speed, impact pressure is simply $\\tfrac12\\rho V^2$ (Bernoulli). At higher speed the air is squeezed as it rams into the pitot tube, so the pressure rises a little faster; this formula includes that compressibility.',
      'The indicator is calibrated with sea-level ISA values. So CAS means “the speed that would give this impact pressure at sea level”.',
      'For speeds well below the speed of sound the bracket works out to almost exactly $\\tfrac12\\rho_0 V_c^2$.'],
    play: { inputs: [{ k: 'v', label: 'Calibrated airspeed', unit: 'kt', min: 50, max: 400, step: 5, v: 250 }],
      out: (v, C) => { const q = C.qcFromCas(v.v), b = 0.5 * 1.225 * Math.pow(v.v * KT, 2); return [['Impact pressure', fmt(q / 100, 1) + ' hPa'], ['½ρ₀V² (no compressibility)', fmt(b / 100, 1) + ' hPa'], ['Compressibility adds', fmt((q / b - 1) * 100, 1) + ' %']]; } }
  };
  E['3.2'] = {
    words: 'Impact pressure and the actual outside pressure give the Mach number; Mach × the local speed of sound is the true airspeed.',
    parts: [['M', 'Mach number: true airspeed ÷ speed of sound', ''], ['P', 'static pressure at your altitude', 'Pa'], ['2/7 and 5', 'more numbers from γ = 1.4', ''], ['a', 'local speed of sound, from the temperature', 'm/s']],
    why: ['It is the same compressible-flow relation as 3.1, written with the real static pressure $P$ instead of $P_0$ and solved for Mach.',
      'High up, $P$ is small, so the same impact pressure means a higher Mach.',
      'TAS = Mach × speed of sound, and the speed of sound comes from the real temperature. That is why converting CAS to TAS needs both pressure altitude and temperature.'],
    play: { inputs: [{ k: 'v', label: 'CAS', unit: 'kt', min: 100, max: 350, step: 5, v: 280 }, { k: 'pa', label: 'Pressure altitude', unit: 'ft', min: 0, max: 41000, step: 1000, v: 30000 },
      { k: 't', label: 'ISA deviation', unit: '°C', min: -20, max: 20, step: 1, v: 0 }],
      out: (v, C) => { const r = C.casToTas(v.v, v.pa, C.isaTempC(v.pa) + v.t); return [['Mach', 'M' + fmt(r.mach, 3)], ['TAS', fmt(r.tas) + ' kt'], ['TAS ÷ CAS', fmt(r.tas / v.v, 2)]]; } }
  };
  E['3.3'] = {
    words: 'Equivalent airspeed is the sea-level speed that would give the same dynamic pressure as your true airspeed does in thinner air.',
    parts: [[R`\rho/\rho_0`, 'density ratio σ (“sigma”)', '1 at sea level, about 0.31 at FL350']],
    why: ['Same dynamic pressure: $\\tfrac12\\rho_0 V_{EAS}^2 = \\tfrac12\\rho V_{TAS}^2$.',
      'Solve for $V_{EAS}$: multiply $V_{TAS}$ by $\\sqrt{\\rho/\\rho_0}$.',
      'Loads on the structure and the stall depend on dynamic pressure, so on EAS — which is why the indicated stall speed stays about the same at any height.'],
    play: { inputs: [{ k: 'v', label: 'TAS', unit: 'kt', min: 100, max: 520, step: 5, v: 450 }, { k: 'ft', label: 'Altitude (ISA)', unit: 'ft', min: 0, max: 41000, step: 1000, v: 35000 }],
      out: (v, C) => { const s = C.isa(v.ft).sigma; return [['σ', fmt(s, 3)], ['√σ', fmt(Math.sqrt(s), 3)], ['EAS', fmt(v.v * Math.sqrt(s)) + ' kt']]; } }
  };
  E['3.4'] = {
    words: 'The speed of sound depends only on temperature; Mach number is your true airspeed as a fraction of it.',
    parts: [['T', 'temperature', 'kelvin'], ['38.94', '√(1.4 × 287.05) ÷ 0.5144: turns √kelvin into knots', '']],
    why: ['$\\sqrt{\\gamma R} = 20.05$ m/s per √K; dividing by 0.5144 m/s per knot gives 38.94 kt per √K.',
      'At −50 °C (223 K): 38.94 × √223 = 581 kt. A jet doing 470 kt TAS there is at M0.81.',
      'Mach matters because the air speeds up over the wing; when it locally reaches Mach 1, shock waves form and drag rises sharply.'],
    play: { inputs: [{ k: 't', label: 'Outside air temperature', unit: '°C', min: -65, max: 40, step: 1, v: -50 }, { k: 'v', label: 'TAS', unit: 'kt', min: 100, max: 560, step: 5, v: 470 }],
      out: v => { const a = 38.94 * Math.sqrt(v.t + 273.15); return [['Speed of sound', fmt(a, 1) + ' kt'], ['Mach', 'M' + fmt(v.v / a, 3)]]; } }
  };
  E['3.5'] = {
    words: 'The crossover altitude is where a chosen CAS and a chosen Mach are the same speed — found as the pressure at which both need the same impact pressure.',
    parts: [[R`P_x`, 'static pressure at the crossover', 'Pa'], ['top line', 'impact pressure of the CAS (equation 3.1) — the same at every altitude', ''], ['bottom line', 'impact pressure per unit of static pressure for that Mach', '']],
    why: ['Equation 3.1: a CAS fixes the impact pressure $q_c$, whatever the altitude.',
      'Equation 3.2: a Mach number fixes $q_c/P$.',
      'Both at once: $q_c(\\text{CAS}) = P \\times [(1+0.2M^2)^{3.5} - 1]$. Divide to get $P_x$.',
      'Turn $P_x$ into an altitude with ISA. It is a pressure altitude, so temperature does not move it.'],
    play: { inputs: [{ k: 'v', label: 'Climb CAS', unit: 'kt', min: 250, max: 340, step: 5, v: 290 }, { k: 'm', label: 'Cruise Mach', unit: '', min: 0.6, max: 0.9, step: 0.01, v: 0.78 }],
      out: (v, C) => { const x = C.crossoverAltitude(v.v, v.m); return [['Crossover', 'FL' + String(Math.round(x.ft / 100)).padStart(3, '0') + ' (' + fmt(x.ft) + ' ft)']]; } }
  };
  E['3.6'] = {
    words: 'A temperature probe stops the air, and the air’s kinetic energy turns into heat — so the probe reads warmer than the outside air.',
    parts: [['TAT', 'total air temperature: what the probe reads', 'K'], ['SAT', 'static air temperature: the real outside temperature', 'K'], ['r', 'recovery factor: how much of the heating the probe captures', 'about 1']],
    why: ['Energy conservation: bringing air from speed $V$ to rest heats it by $\\Delta T = V^2/(2c_p)$.',
      'Write $V = Ma$ and $a^2 = \\gamma R T$: $\\Delta T = \\tfrac{\\gamma-1}{2} M^2 T = 0.2M^2T$.',
      'At M0.80 and −50 °C (223 K): TAT = 223 × 1.128 = 251.6 K = −21.5 °C. A 28.5 °C “ram rise”.'],
    play: { inputs: [{ k: 't', label: 'SAT', unit: '°C', min: -65, max: 20, step: 1, v: -50 }, { k: 'm', label: 'Mach', unit: '', min: 0, max: 0.95, step: 0.01, v: 0.8 }],
      out: v => { const T = (v.t + 273.15) * (1 + 0.2 * v.m * v.m) - 273.15; return [['TAT', fmt(T, 1) + ' °C'], ['Ram rise', '+' + fmt(T - v.t, 1) + ' °C']]; } }
  };
  E['3.7'] = {
    words: 'Manoeuvring speed is the stall speed times the square root of the limit load factor: at Va a full pull stalls the wing just as it reaches the structural limit.',
    parts: [[R`V_A`, 'manoeuvring speed', 'kt'], [R`n_{limit}`, 'limit load factor', '3.8 g normal category, 4.4 utility, 6 aerobatic, 2.5 transport']],
    why: ['At any speed, the most lift the wing can make is $C_{L\\max}$ at that dynamic pressure. Below $V_A$ that maximum is less than $n_{limit} W$: the wing stalls first and protects the structure.',
      'At exactly $V_A$: $\\tfrac12\\rho_0 V_A^2 S C_{L\\max} = n_{limit} W$. Compare with the 1-g stall, $\\tfrac12\\rho_0 V_S^2 S C_{L\\max} = W$, and divide: $V_A^2 = n_{limit} V_S^2$.',
      'Example: $V_S$ = 53 kt, $n$ = 3.8 → $V_A$ = 53 × 1.95 = 103 kt.'],
    play: { inputs: [{ k: 'vs', label: 'Stall speed', unit: 'kt', min: 40, max: 150, step: 1, v: 53 }, { k: 'n', label: 'Limit load factor', unit: 'g', min: 2.5, max: 6, step: 0.1, v: 3.8 }],
      out: v => [['√n', fmt(Math.sqrt(v.n), 3)], ['Va', fmt(v.vs * Math.sqrt(v.n), 1) + ' kt']] }
  };
  E['3.8'] = {
    words: 'Manoeuvring speed falls with the square root of weight, just like the stall speed it is built on.',
    parts: [[R`V_{A1},\ W_1`, 'handbook Va and the weight it is quoted for', ''], [R`V_{A2},\ W_2`, 'Va at your weight', '']],
    why: ['Va is a fixed multiple of the stall speed (3.7), and the stall speed scales with √weight (1.6).',
      'So a lighter aircraft must be flown slower in turbulence: with less weight, a gust or pull produces more g.'],
    play: { inputs: [{ k: 'va', label: 'Handbook Va', unit: 'kt', min: 80, max: 300, step: 1, v: 105 }, { k: 'w', label: 'Weight ÷ max weight', unit: '%', min: 50, max: 100, step: 1, v: 80 }],
      out: v => [['Va now', fmt(v.va * Math.sqrt(v.w / 100), 1) + ' kt']] }
  };

  // ================================================================ 4 · NAVIGATION
  E['4.1'] = {
    words: 'To stay on course you point the nose into the wind by the wind correction angle; its size depends on the crosswind compared with your airspeed.',
    parts: [['WCA', 'wind correction angle', 'degrees'], [R`V_w,\ \theta_w`, 'wind speed and the direction it blows FROM (true)', ''], [R`\theta_c`, 'course you want to fly (true)', ''],
      [R`V_w\sin(\theta_w - \theta_c)`, 'the crosswind component', 'kt'], [R`\arcsin`, '“the angle whose sine is …”', '']],
    why: ['The wind pushes you sideways with its crosswind component.',
      'To cancel it, part of your own airspeed must point into the wind: $V_{TAS}\\sin(\\text{WCA})$ = crosswind.',
      'Solve with arcsin.',
      'If the crosswind is stronger than your airspeed there is no solution — you cannot hold that course.'],
    play: { inputs: [{ k: 'tas', label: 'TAS', unit: 'kt', min: 60, max: 500, step: 5, v: 120 }, { k: 'c', label: 'Course', unit: '°', min: 0, max: 359, step: 1, v: 90 },
      { k: 'wd', label: 'Wind from', unit: '°', min: 0, max: 359, step: 1, v: 40 }, { k: 'ws', label: 'Wind speed', unit: 'kt', min: 0, max: 100, step: 1, v: 25 }],
      out: (v, C) => { const w = C.windTriangle({ tas: v.tas, course: v.c, windFrom: v.wd, windSpeed: v.ws }); if (!w.possible) return [['Result', 'no solution: wind too strong']];
        return [['Crosswind part', fmt(Math.abs(w.crosswind), 1) + ' kt'], ['WCA', (w.wca >= 0 ? '+' : '') + fmt(w.wca, 1) + '°'], ['Heading', fmt(C.norm360(w.heading)) + '°'], ['Ground speed', fmt(w.gs) + ' kt']]; } }
  };
  E['4.2'] = {
    words: 'Ground speed is the part of your airspeed that points along the course, minus the headwind part of the wind.',
    parts: [[R`V_{TAS}\cos\mathrm{WCA}`, 'the along-course part of your airspeed — a little less than TAS because you are crabbing', ''], [R`V_w\cos(\theta_w - \theta_c)`, 'headwind component (negative = tailwind)', '']],
    why: ['Along the course, your velocity and the wind’s simply add.',
      'The wind direction is where it comes from, so its along-course part is against you: minus.',
      'Crabbing costs a little: cos 10° = 0.985, so a 10° crab loses 1.5 % of your airspeed along the course.'],
    play: null
  };
  E['4.3'] = {
    words: 'Heading is where the nose points (course plus correction); drift is the angle between where you point and where you actually go.',
    parts: [['HDG', 'heading', ''], ['TRK', 'track: your path over the ground', ''], ['drift', 'positive = drifting right of the heading', '']],
    why: ['These are definitions. With the right WCA, the track equals the course and the drift equals minus the WCA.'], play: null
  };
  E['4.4'] = {
    words: 'Split the wind into the part along the runway (head- or tailwind) and the part across it (crosswind).',
    parts: [[R`\alpha`, 'angle between the wind direction and the runway heading', 'degrees'], [R`\cos\alpha`, 'gives the along-runway part', ''], [R`\sin\alpha`, 'gives the across-runway part', '']],
    why: ['Draw the wind as the long side of a right-angled triangle; along the runway and across it are the two short sides.',
      '$\\cos\\alpha$ = adjacent ÷ hypotenuse, so headwind = $V_w\\cos\\alpha$. $\\sin\\alpha$ = opposite ÷ hypotenuse, so crosswind = $V_w\\sin\\alpha$.',
      'Clock code: 30° off gives half the wind as crosswind (sin 30° = 0.5), 45° about three-quarters, 60° or more almost all of it.'],
    play: { inputs: [{ k: 'wd', label: 'Wind from', unit: '°', min: 0, max: 359, step: 1, v: 300 }, { k: 'ws', label: 'Wind speed', unit: 'kt', min: 0, max: 50, step: 1, v: 20 }, { k: 'r', label: 'Runway heading', unit: '°', min: 0, max: 359, step: 1, v: 263 }],
      out: (v, C) => { const w = C.windComponents(v.wd, v.ws, v.r); return [['Angle', fmt(Math.abs(w.angle)) + '°'], [w.head >= 0 ? 'Headwind' : 'Tailwind', fmt(Math.abs(w.head), 1) + ' kt'], ['Crosswind', fmt(Math.abs(w.cross), 1) + ' kt from the ' + w.side]]; } }
  };
  E['4.5'] = {
    words: 'The haversine formula gives the angle between two places as seen from the centre of the Earth; times the Earth’s radius, that is the shortest distance.',
    parts: [[R`\varphi_1,\ \varphi_2`, '“phi”: latitudes of the two places', 'radians'], [R`\Delta\varphi,\ \Delta\lambda`, 'differences in latitude and longitude (“lambda”)', 'radians'],
      ['R', 'mean Earth radius', '3440 NM'], ['a', 'a helper number between 0 and 1', ''], ['atan2', 'an arctangent that knows which quadrant the angle is in', '']],
    why: ['On a sphere the shortest path is part of a great circle, and its length is radius × the angle at the centre.',
      'The sin² of half-angles (the “haversine”) keeps the sum accurate for short and long distances alike.',
      '$\\cos\\varphi_1\\cos\\varphi_2$ is there because meridians converge towards the poles: a degree of longitude is 60 NM at the equator but only 30 NM at 60° latitude.',
      'One minute of that central angle is one nautical mile — that is how the nautical mile was defined.'],
    play: null
  };
  E['4.6'] = {
    words: 'The initial true course along the great circle. It changes as you fly — only the start is given here.',
    parts: [[R`\theta_0`, 'initial course, from true north', 'degrees'], ['atan2(y, x)', 'the direction of the vector (x, y), in the right quadrant', '']],
    why: ['The two parts of atan2 are the east–west and north–south components of the direction to the destination, worked out on the sphere.',
      'A great circle crosses every meridian at a different angle (except along the equator or a meridian), so the course keeps changing. On a long flight the FMS updates it continuously.'],
    play: null
  };
  E['4.7'] = {
    words: 'Track error in degrees ≈ distance off track × 60 ÷ distance flown. To reach the destination, also add the closing angle.',
    parts: [['x', 'distance off track', 'NM'], [R`d_{flown},\ d_{to\,go}`, 'distance flown so far and distance still to go', 'NM']],
    why: ['For small angles, sine of the angle ≈ the angle in radians, and one radian is 57.3° ≈ 60°. So angle in degrees ≈ 60 × opposite ÷ hypotenuse.',
      'Track error $= 60x/d_{flown}$: turning back by this much makes you fly parallel to the planned track.',
      'Closing angle $= 60x/d_{to\\,go}$: adding this makes you converge on the destination.'],
    play: { inputs: [{ k: 'x', label: 'Off track', unit: 'NM', min: 0.5, max: 10, step: 0.5, v: 3 }, { k: 'f', label: 'Flown', unit: 'NM', min: 10, max: 200, step: 5, v: 60 }, { k: 'g', label: 'To go', unit: 'NM', min: 10, max: 200, step: 5, v: 40 }],
      out: v => [['Track error', fmt(60 * v.x / v.f, 1) + '°'], ['Closing angle', fmt(60 * v.x / v.g, 1) + '°'], ['Turn by', fmt(60 * v.x / v.f + 60 * v.x / v.g, 1) + '°']] }
  };
  E['4.8'] = {
    words: 'Descent distance = height to lose ÷ height lost per mile; descent rate = height lost per mile × miles per minute.',
    parts: [[R`\Delta H`, 'height to lose', 'ft'], [R`\gamma`, 'path angle', 'degrees'], ['6076', 'feet in a nautical mile', ''], ['GS/60', 'nautical miles per minute', '']],
    why: ['$\\tan\\gamma$ = height ÷ distance. With both in feet: distance = $\\Delta H/\\tan\\gamma$; divide by 6076 for NM.',
      'For 3°, $\\tan 3^\\circ = 0.0524$: 6076 × 0.0524 = 318 ft per NM — the “3 NM per 1000 ft” rule.',
      'Each minute you cover GS/60 miles, losing 318 ft on each: VS = 318 × GS/60 = 5.3 × GS.'],
    play: { inputs: [{ k: 'h', label: 'Height to lose', unit: 'ft', min: 1000, max: 40000, step: 500, v: 33000 }, { k: 'gs', label: 'Ground speed', unit: 'kt', min: 80, max: 480, step: 5, v: 380 }, { k: 'a', label: 'Angle', unit: '°', min: 1, max: 6, step: 0.1, v: 3 }],
      out: v => { const t = Math.tan(v.a * Math.PI / 180); return [['Distance', fmt(v.h / (6076 * t)) + ' NM'], ['Vertical speed', fmt(v.gs * 6076 / 60 * t) + ' fpm']]; } }
  };
  E['4.9'] = {
    words: 'A climb gradient in percent → feet per nautical mile → feet per minute at your ground speed.',
    parts: [[R`\%`, 'height gained per 100 units of distance', ''], [R`\text{ft/NM}`, 'height gained per nautical mile', '']],
    why: ['1 % of a nautical mile is 60.76 ft, so % × 60.76 = ft per NM.', 'At ground speed GS you fly GS/60 miles a minute: ft/NM × GS/60 = ft per minute.', 'A 3.3 % gradient at 160 kt: 200 ft/NM × 2.67 = 533 fpm.'],
    play: { inputs: [{ k: 'p', label: 'Gradient', unit: '%', min: 1, max: 12, step: 0.1, v: 3.3 }, { k: 'gs', label: 'Ground speed', unit: 'kt', min: 60, max: 300, step: 5, v: 160 }],
      out: v => [['Feet per NM', fmt(v.p * 60.76)], ['Rate of climb', fmt(v.p * 60.76 * v.gs / 60) + ' fpm']] }
  };
  E['4.10'] = {
    words: 'True heading = magnetic heading + easterly variation.', parts: [['VAR', 'variation: angle between true and magnetic north at your position; east counts positive', '']],
    why: ['Magnetic north is not at the geographic pole, so a compass needle points a few degrees off true north.', 'East variation: magnetic north is east of true, so magnetic headings read smaller: “east is least”. West: “west is best” (bigger).'], play: null
  };
  E['4.11'] = {
    words: 'Magnetic heading = compass heading + easterly deviation.', parts: [['DEV', 'deviation: error of your particular compass, caused by the aircraft’s metal and electrics; different on each heading', '']],
    why: ['Each aircraft has its own compass card listing the deviation on various headings.', 'Same sign rule as variation: east positive.'], play: null
  };
  E['4.12'] = {
    words: 'DME measures the straight line to the station (slant range). Pythagoras gives the distance over the ground.',
    parts: [[R`d_{DME}`, 'the DME reading', 'NM'], ['h', 'height above the station', 'NM (ft ÷ 6076)'], [R`d_{ground}`, 'horizontal distance', 'NM']],
    why: ['Ground distance, height and slant range form a right-angled triangle, slant range being the long side.',
      'Pythagoras: $d_{DME}^2 = d_{ground}^2 + h^2$; rearrange for $d_{ground}$.',
      'Height must be in NM too. Overhead the station the DME reads your height (FL180 ≈ 3 NM).'],
    play: { inputs: [{ k: 'd', label: 'DME reading', unit: 'NM', min: 1, max: 60, step: 0.5, v: 10 }, { k: 'h', label: 'Height above the station', unit: 'ft', min: 1000, max: 41000, step: 1000, v: 20000 }],
      out: (v, C) => { const r = C.dmeGround({ dmeNm: v.d, heightFt: v.h }); return [['Height', fmt(r.heightNm, 2) + ' NM'], ['Ground distance', fmt(r.groundNm, 2) + ' NM'], ['Error', fmt(r.errorNm, 2) + ' NM']]; } }
  };
  E['4.13'] = {
    words: 'The bearing to an NDB is your heading plus the angle of the ADF needle from the nose.',
    parts: [['QDM', 'magnetic bearing TO the station', ''], ['MH', 'magnetic heading', ''], ['RB', 'relative bearing: needle angle clockwise from the nose', ''], ['QDR', 'magnetic bearing FROM the station', '']],
    why: ['The needle measures from the nose; the nose points along your heading. Add them to measure from magnetic north.', 'The bearing from the station is the opposite direction: ±180°.'], play: null
  };
  E['4.14'] = {
    words: 'The height on a glide path = the height over the threshold plus the slope × the distance.',
    parts: [['TCH', 'threshold crossing height: the path’s height over the runway threshold', 'about 50 ft'], ['d', 'distance from the threshold', 'NM'], [R`\theta`, 'glide path angle', 'usually 3°']],
    why: ['Same triangle as the descent planning (4.8): feet per NM = 6076 × tan θ = 318 for 3°.', 'Add the TCH because the path does not reach the ground at the threshold; it is aimed about 300 m past it.'],
    play: { inputs: [{ k: 'd', label: 'Distance', unit: 'NM', min: 0.5, max: 10, step: 0.5, v: 4 }, { k: 'a', label: 'Angle', unit: '°', min: 2.5, max: 4.5, step: 0.1, v: 3 }],
      out: v => [['Height above the threshold', fmt(50 + v.d * 6076 * Math.tan(v.a * Math.PI / 180)) + ' ft']] }
  };
  E['4.15'] = {
    words: 'On a glide path the rate of descent is ground speed × a constant: about 5.3 × GS for 3°.',
    parts: [['101.3', 'feet per minute per knot: 6076 ÷ 60', '']],
    why: ['Knots are NM per hour; × 6076 ÷ 60 gives feet per minute of horizontal speed. × tan θ turns that into vertical feet per minute.', 'That is why a headwind needs a smaller descent rate on the ILS: the ground speed is lower.'],
    play: null
  };

  // ============================================================= 5 · PERFORMANCE
  E['5.1'] = {
    words: 'The centre of gravity is the average position of all the mass on board, weighted by how heavy each item is.',
    parts: [[R`m_i`, 'mass of item i (pilot, fuel, bags…)', 'kg'], [R`x_i`, 'its arm: distance from a reference line (datum)', 'm'], [R`\sum`, 'add up over all items', ''], [R`m_i x_i`, 'moment of item i', 'kg·m']],
    why: ['Like a see-saw: the balance point is where the moments (mass × distance) on each side cancel.',
      'Total moment ÷ total mass gives the one position where all the mass could sit and produce the same moment.',
      'Load fuel or bags behind the CG and it moves aft; burn fuel that sits aft of it and it moves forward.'],
    play: { inputs: [{ k: 'p', label: 'Front seats', unit: 'kg', min: 60, max: 200, step: 5, v: 170 }, { k: 'r', label: 'Rear seats', unit: 'kg', min: 0, max: 200, step: 5, v: 80 }, { k: 'b', label: 'Baggage', unit: 'kg', min: 0, max: 54, step: 1, v: 20 }],
      out: (v, C) => { const r = C.massBalance([{ mass: 767, arm: 0.99 }, { mass: v.p, arm: 0.94 }, { mass: v.r, arm: 1.85 }, { mass: v.b, arm: 2.41 }, { mass: 110, arm: 1.22 }]);
        return [['Total mass', fmt(r.mass) + ' kg'], ['CG', fmt(r.cg, 3) + ' m aft of the datum']]; } }
  };
  E['5.2'] = {
    words: 'The CG position written as a percentage of the way along the wing’s mean aerodynamic chord.',
    parts: [[R`x_{LEMAC}`, 'position of the leading edge of the mean aerodynamic chord', 'm'], [R`\bar c`, 'length of the mean aerodynamic chord', 'm']],
    why: ['Using the wing chord makes CG limits comparable between aircraft of any size. Airliner limits are typically about 10 % to 35 % MAC.'], play: null
  };
  E['5.3'] = {
    words: 'Take-off speeds start from the 1-g stall speed with take-off flaps; V2 must be at least 13 % above it.',
    parts: [[R`V_{S1g}`, '1-g stall speed: the slowest speed at which the wing can still make lift equal to the weight', 'kt'], [R`C_{L\max,TO}`, 'maximum lift coefficient with take-off flaps', 'about 1.9–2.2'], ['1.13', 'the certification margin (CS/FAR 25.107)', '']],
    why: ['It is equation 1.5 with n = 1 and take-off flaps.',
      'At V2 the wing is using only $1/1.13^2$ = 78 % of its maximum lift, so it can pull 1.28 g (a 38° bank) before stalling — room for gusts and manoeuvring with an engine failed.',
      'Both speeds grow with √weight: that is why the FMS needs your take-off weight.'],
    play: { inputs: [{ k: 'm', label: 'Take-off mass', unit: 't', min: 50, max: 80, step: 0.5, v: 70 }, { k: 'cl', label: 'C_Lmax with take-off flaps', unit: '', min: 1.6, max: 2.4, step: 0.01, v: 1.85 }],
      out: v => { const vs = Math.sqrt(2 * v.m * 1000 * G / (1.225 * 124.6 * v.cl)) / KT; return [['V_S1g (737-800 wing)', fmt(vs) + ' kt'], ['V2 ≥ 1.13 × V_S1g', fmt(1.13 * vs) + ' kt']]; } }
  };
  E['5.4'] = {
    words: 'Take-off distance grows with the square of weight and shrinks with more air density, wing area, flap lift and thrust.',
    parts: [['TOFL', 'take-off field length', 'm'], [R`\sigma`, 'air density ratio: thin air on hot or high days', ''], ['T', 'thrust', ''], [R`\propto`, '“is proportional to”: changes in step with', '']],
    why: ['To accelerate from rest to lift-off speed with a steady acceleration $a$ takes a distance $d = V_{LOF}^2 / (2a)$ — school kinematics.',
      'Lift-off speed squared comes from the stall-speed equation: $V_{LOF}^2 \\propto W / (\\sigma S C_{L\\max})$ (true airspeed, so thin air needs more).',
      'Acceleration is thrust ÷ mass: $a \\propto T / W$.',
      'Put together: $d \\propto \\dfrac{W/(\\sigma S C_L)}{T/W} = \\dfrac{W^2}{\\sigma S C_L T}$. So 10 % heavier means about 21 % more runway.'],
    play: { inputs: [{ k: 'w', label: 'Weight vs reference', unit: '%', min: 70, max: 120, step: 1, v: 110 }, { k: 's', label: 'Density vs reference', unit: '%', min: 70, max: 105, step: 1, v: 100 }, { k: 't', label: 'Thrust vs reference', unit: '%', min: 70, max: 100, step: 1, v: 100 }],
      out: v => [['Field length vs reference', fmt(Math.pow(v.w / 100, 2) / (v.s / 100) / (v.t / 100) * 100) + ' %']] }
  };
  E['5.5'] = {
    words: 'The assumed (FLEX) temperature is the highest temperature at which the take-off still fits the runway, with at most 25 % less thrust.',
    parts: [[R`\max\{T : \dots\}`, '“the largest temperature T for which the conditions after the colon are true”', ''], ['TORA', 'take-off run available', 'm']],
    why: ['Above the flat-rating temperature a jet engine gives less thrust the hotter it is. Telling the FMS it is hotter makes the engines give the (smaller) thrust belonging to that temperature.',
      'The take-off is also computed as if the air were that hot and thin; the real air is denser, so there is extra margin built in.',
      'The limits: at most 25 % reduction, never below the real temperature, and not on contaminated runways.'],
    play: null
  };
  E['5.6'] = {
    words: 'The landing reference speed is 23 % above the 1-g stall speed with landing flaps.',
    parts: [[R`V_{REF}`, 'landing reference speed (Airbus: VLS)', 'kt'], [R`V_{S1g,LDG}`, '1-g stall speed in the landing configuration', 'kt']],
    why: ['At 1.23 × the stall speed the wing uses $1/1.23^2$ = 66 % of its maximum lift: it can take a 1.5 g gust or pull — enough for turbulence and the flare.', 'It falls with √weight, like every stall-based speed.'],
    play: { inputs: [{ k: 'm', label: 'Landing mass', unit: 't', min: 45, max: 67, step: 0.5, v: 60 }, { k: 'cl', label: 'C_Lmax, landing flaps', unit: '', min: 2, max: 3, step: 0.01, v: 2.28 }],
      out: v => { const vs = Math.sqrt(2 * v.m * 1000 * G / (1.225 * 124.6 * v.cl)) / KT; return [['V_S1g', fmt(vs) + ' kt'], ['Vref', fmt(1.23 * vs) + ' kt']]; } }
  };
  E['5.7'] = {
    words: 'Landing distance = distance in the air from 50 ft to touchdown + a short transition + the braking distance.',
    parts: [[R`V_{td}`, 'touchdown ground speed', 'm/s'], ['a', 'deceleration while braking', 'm/s²: about 1.5–3 with autobrake, up to ~4 on a dry runway'], [R`d_{air}`, 'air distance', 'm']],
    why: ['Braking at a steady deceleration $a$ from speed $V$ takes $V^2/(2a)$ — the same kinematics as the take-off run, backwards.',
      'Because of the square, 10 % faster at touchdown means 21 % more braking distance. That is why a fast approach eats runway.',
      'The air segment grows if you float: every extra second above the runway at 140 kt is about 70 m.'],
    play: { inputs: [{ k: 'v', label: 'Touchdown ground speed', unit: 'kt', min: 90, max: 170, step: 1, v: 135 }, { k: 'a', label: 'Deceleration', unit: 'm/s²', min: 1, max: 4.5, step: 0.1, v: 1.7 }],
      out: v => [['Braking distance', fmt(Math.pow(v.v * KT, 2) / (2 * v.a)) + ' m']] }
  };
  E['5.8'] = {
    words: 'Block fuel is the sum of layers, each covering a different risk.',
    parts: [['Taxi', 'start-up and taxi', ''], ['Trip', 'take-off to landing at the destination', ''], ['Cont', 'contingency: 5 % of trip for the unexpected', ''], ['Alt', 'missed approach and flight to the alternate', ''], ['Final', 'final reserve: 30 min holding (45 for pistons)', ''], ['Extra', 'the captain’s choice', '']],
    why: ['Each layer is used for one purpose only. Landing with less than the final reserve is an emergency (MAYDAY FUEL).'], play: null
  };
  E['5.9'] = {
    words: 'Trip fuel ≈ time in each phase × the fuel flow in that phase, added up.',
    parts: [[R`\dot m`, '“m dot”: fuel flow', 'kg per hour'], [R`D_{cruise}/GS`, 'cruise time: distance ÷ ground speed', 'hours']],
    why: ['Fuel used = fuel flow × time, phase by phase: the climb burns fast but is short, the cruise is long, the descent is nearly idle.', 'Wind changes the ground speed and therefore the cruise time — a 50 kt headwind on a 450 kt aircraft adds about 12 % to the cruise fuel.'],
    play: null
  };
  E['5.10'] = {
    words: 'Thrust = how much air goes through the engine each second × how much faster it leaves than it arrived.',
    parts: [['F', 'thrust', 'newtons'], [R`\dot m`, 'mass flow of air', 'kg/s'], [R`V_j,\ V_0`, 'jet speed and flight speed', 'm/s'], [R`(p_e - p_0)A_e`, 'extra push if the exhaust leaves above outside pressure; small for airliner engines', '']],
    why: ['Newton’s second law: force = rate of change of momentum. Each second the engine takes $\\dot m$ kg of air from $V_0$ to $V_j$.',
      'A lot of air a little faster, or a little air a lot faster, can give the same thrust — but they are not equally efficient (next equation).'],
    play: { inputs: [{ k: 'm', label: 'Mass flow', unit: 'kg/s', min: 50, max: 1500, step: 10, v: 350 }, { k: 'dv', label: 'Speed increase', unit: 'm/s', min: 10, max: 600, step: 10, v: 300 }],
      out: v => [['Thrust', fmt(v.m * v.dv / 1000, 1) + ' kN']] }
  };
  E['5.11'] = {
    words: 'Propulsive efficiency: the closer the jet speed is to the flight speed, the less energy is wasted in the exhaust.',
    parts: [[R`\eta_p`, '“eta p”: propulsive efficiency', '0–1']],
    why: ['Useful power = thrust × flight speed = $\\dot m(V_j - V_0)V_0$.',
      'Power put into the air = the gain in kinetic energy = $\\tfrac12\\dot m(V_j^2 - V_0^2)$.',
      'Divide: $\\eta_p = \\dfrac{2V_0}{V_j + V_0} = \\dfrac{2}{1 + V_j/V_0}$.',
      'That is why high-bypass engines move a lot of air only a little faster.'],
    play: { inputs: [{ k: 'v0', label: 'Flight speed', unit: 'm/s', min: 50, max: 260, step: 5, v: 250 }, { k: 'vj', label: 'Jet speed', unit: 'm/s', min: 260, max: 900, step: 10, v: 350 }],
      out: v => [['Efficiency', fmt(200 / (1 + v.vj / v.v0)) + ' %']] }
  };
  E['5.12'] = {
    words: 'The lift equation written with Mach number and static pressure instead of speed and density.',
    parts: [['p', 'static pressure at cruise level', 'Pa'], ['M', 'Mach', ''], ['0.7', 'γ/2 = 1.4/2', '']],
    why: ['$\\tfrac12\\rho V^2 = \\tfrac12\\rho M^2 a^2$, and $a^2 = \\gamma P/\\rho$ (from 2.4 with the gas law).',
      'The densities cancel: $\\tfrac12\\rho V^2 = \\tfrac{\\gamma}{2}pM^2 = 0.7\\,pM^2$.',
      'At a fixed Mach, lift is proportional to the static pressure — that is why jets think in pressure levels (flight levels).'], play: null
  };
  E['5.13'] = {
    words: 'The optimum cruise pressure is proportional to the weight: lighter aircraft cruise higher.',
    parts: [[R`p_{opt}`, 'static pressure at the optimum altitude', 'Pa'], [R`C_{L,opt}`, 'the lift coefficient where the wing is most efficient at cruise Mach', 'about 0.5']],
    why: ['Set lift (5.12) equal to weight and solve for $p$.', 'As fuel burns, $W$ falls, so $p_{opt}$ falls: the optimum moves up about 1000 ft for every 5 % of weight burned.'],
    play: { inputs: [{ k: 'm', label: 'Mass', unit: 't', min: 45, max: 80, step: 0.5, v: 70 }, { k: 'mach', label: 'Mach', unit: '', min: 0.7, max: 0.82, step: 0.005, v: 0.785 }],
      out: (v, C) => { const o = C.optimumAltitude({ massKg: v.m * 1000, wingArea: 124.6, mach: v.mach }); return [['Optimum pressure', fmt(o.hPa) + ' hPa'], ['Optimum altitude (737-800)', 'FL' + Math.round(o.ft / 100)]]; } }
  };
  E['5.14'] = {
    words: 'Specific range: how far each kilogram of fuel takes you.',
    parts: [[R`V_{TAS}`, 'true airspeed', 'NM per hour'], [R`\dot m_{fuel}`, 'fuel flow', 'kg per hour']],
    why: ['NM per hour ÷ kg per hour = NM per kg.', 'Flying higher raises TAS for the same fuel flow (up to the optimum); flying faster than the best-range speed raises fuel flow faster than TAS.'],
    play: { inputs: [{ k: 'v', label: 'TAS', unit: 'kt', min: 300, max: 520, step: 5, v: 450 }, { k: 'f', label: 'Fuel flow', unit: 'kg/h', min: 1500, max: 12000, step: 50, v: 2500 }],
      out: v => [['Specific range', fmt(v.v / v.f, 3) + ' NM/kg'], ['Per tonne', fmt(v.v / v.f * 1000) + ' NM']] }
  };

  // ======================================================================= 6 · WEATHER
  E['6.1'] = {
    words: 'Cumulus cloud base ≈ 400 ft for every degree between the temperature and the dew point.',
    parts: [['T', 'surface temperature', '°C'], [R`T_d`, 'dew point: the temperature at which the air would be saturated', '°C']],
    why: ['Rising air cools about 3 °C per 1000 ft while it is dry.', 'Its dew point also falls, but only about 0.5 °C per 1000 ft.', 'The gap closes by 2.5 °C per 1000 ft, so a gap of 1 °C closes in 400 ft. Where the gap is zero, the air is saturated: cloud forms.'],
    play: { inputs: [{ k: 't', label: 'Temperature', unit: '°C', min: -10, max: 40, step: 1, v: 20 }, { k: 'd', label: 'Dew point', unit: '°C', min: -20, max: 30, step: 1, v: 12 }],
      out: (v, C) => { if (v.d > v.t) return [['Result', 'dew point above temperature: not possible']]; const c = C.cloudBase({ tempC: v.t, dewC: v.d }); return [['Cloud base', fmt(c.aglFt) + ' ft'], ['Humidity', fmt(c.rh) + ' %']]; } }
  };
  E['6.2'] = {
    words: 'Relative humidity is how much water vapour the air holds compared with the most it could hold at that temperature.',
    parts: [['RH', 'relative humidity', '%'], ['exp', 'e to the power of …', ''], ['17.625, 243.04', 'fitted constants (Magnus formula)', '']],
    why: ['The most vapour air can hold (the saturation pressure) roughly doubles for every 10 °C of warming. The Magnus formula $6.1\\,e^{17.625T/(243.04+T)}$ hPa describes that curve.',
      'The dew point tells you how much vapour is actually there: the saturation pressure at $T_d$.',
      'RH = actual ÷ possible = $e_s(T_d)/e_s(T)$; dividing exponentials subtracts their powers.'], play: null
  };
  E['6.3'] = {
    words: 'Wake strength grows with weight and falls with speed, air density and wingspan.',
    parts: [[R`\Gamma_0`, '“Gamma”: circulation — how strongly the air swirls', 'm²/s'], ['W', 'weight', 'N'], [R`\rho`, 'air density', 'kg/m³'], ['V', 'true airspeed', 'm/s'], ['b', 'wingspan', 'm']],
    why: ['A wing makes lift by giving the air circulation; the lift per metre of span is $\\rho V \\Gamma$ (Kutta–Joukowski).',
      'For an ideal (elliptical) wing, all the lift adds up to $L = \\tfrac{\\pi}{4}\\rho V \\Gamma_0 b$. With $L = W$: $\\Gamma_0 = 4W/(\\pi\\rho V b)$.',
      'Heavy and slow means strong vortices — take-off and approach are the danger zones.'],
    play: { inputs: [{ k: 'm', label: 'Mass', unit: 't', min: 1, max: 560, step: 1, v: 60 }, { k: 'v', label: 'Speed', unit: 'kt', min: 60, max: 300, step: 5, v: 140 }, { k: 'b', label: 'Wingspan', unit: 'm', min: 8, max: 80, step: 0.1, v: 35.8 }],
      out: v => [['Circulation', fmt(4 * v.m * 1000 * G / (Math.PI * 1.225 * v.v * KT * v.b)) + ' m²/s']] }
  };

  // ============================================================== 0 · READING THE EQUATIONS
  E['0.1'] = {
    words: 'Read it as a sentence: “lift equals one half, times rho, times V squared, times S, times C-L.” Symbols written side by side are multiplied.',
    parts: [['L', 'lift — the quantity the equation works out', 'newtons (N)'], ['=', '“is the same amount as”', ''], [R`\tfrac12`, 'one half: 0.5', ''],
      [R`\rho`, '“rho”: air density', 'kg/m³ — 1.225 at sea level'], [R`V^2`, '“V squared”: the speed times itself', 'V in m/s; 50 m/s squared is 2 500'],
      ['S', 'wing area', 'm²'], [R`C_L`, '“C-L”: one quantity with a two-letter name, the lift coefficient — not C times L', 'no unit']],
    why: ['There is no × sign: $\\rho V^2$ means $\\rho \\times V \\times V$. Writing symbols side by side is shorthand for multiplying.',
      'The little 2 belongs only to $V$: $\\tfrac12\\rho V^2$ is half of $\\rho$ times $(V \\times V)$ — not $(\\rho V)$ squared.',
      'Multiplication does not care about order, so work left to right: square the speed, halve it, times density, times area, times $C_L$. The sliders do exactly that.'],
    play: { inputs: [{ k: 'v', label: 'Speed V', unit: 'm/s', min: 10, max: 150, step: 1, v: 50 }, { k: 'rho', label: 'Density ρ', unit: 'kg/m³', min: 0.3, max: 1.3, step: 0.005, v: 1.225 },
      { k: 's', label: 'Wing area S', unit: 'm²', min: 10, max: 500, step: 1, v: 125 }, { k: 'cl', label: 'Lift coefficient C_L', unit: '', min: 0.1, max: 2.5, step: 0.05, v: 1 }],
      out: v => { const v2 = v.v * v.v, q = 0.5 * v.rho * v2, f = q * v.s, L = f * v.cl;
        return [['V² = V × V', fmt(v2) + ' m²/s²'], ['½ × ρ × V²', fmt(q) + ' Pa'], ['… × S', fmt(f) + ' N'], ['… × C_L = lift', fmt(L / 1000, 1) + ' kN']]; } }
  };
  E['0.2'] = {
    words: 'If one quantity goes with a power of another, changing the input by some factor changes the output by that factor raised to the same power — whatever else is in the equation.',
    parts: [['y', 'the quantity you want — the output', ''], ['x', 'the quantity you change — the input', ''],
      ['n', 'the power: 2 for “squared”, ½ for “square root”, −1 for “one over”, 1 for “straight”', ''],
      ['k', 'everything else in the equation, which stays the same', ''], [R`y_2/y_1`, 'how many times bigger the new answer is than the old one', 'a ratio, no unit']],
    why: ['Write the equation twice, before and after: $y_1 = k\\,x_1^{\\,n}$ and $y_2 = k\\,x_2^{\\,n}$.',
      'Divide one by the other and $k$ cancels: $y_2/y_1 = (x_2/x_1)^n$. You never need to know $k$.',
      'Stall speed goes with $\\sqrt W$ ($n = \\tfrac12$), lift and turn radius with $V^2$ ($n = 2$), take-off distance roughly with $W^2$.',
      'For small changes, a power of ½ halves the percentage and a power of 2 doubles it: +10 % weight → about +5 % stall speed and about +21 % runway.'],
    play: { inputs: [{ k: 'f', label: 'Input changes by ×', unit: '', min: 0.5, max: 3, step: 0.05, v: 1.2 }, { k: 'n', label: 'Power n', unit: '', min: -1, max: 3, step: 0.5, v: 2 }],
      out: v => { const r = Math.pow(v.f, v.n), pc = (r - 1) * 100;
        return [['Output changes by', '×' + fmt(r, 3)], ['In percent', (pc >= 0 ? '+' : '') + fmt(pc, 1) + ' %']]; } }
  };
  E['0.3'] = {
    words: 'In a right-angled triangle the ratios between the sides depend only on the angle. Sine, cosine and tangent are the names of those ratios.',
    parts: [[R`\theta`, '“theta”: the angle you know (not the right angle)', 'degrees'], [R`\text{opposite}`, 'the side across from that angle', ''],
      [R`\text{adjacent}`, 'the side next to the angle (not the longest one)', ''], [R`\text{hypotenuse}`, 'the longest side, across from the right angle', ''],
      [R`\sin,\ \cos,\ \tan`, 'sine, cosine, tangent — ratios of two lengths, so they have no unit', 'sin and cos lie between 0 and 1 for angles up to 90°']],
    why: ['Make a triangle twice as big and its angles stay the same — so the ratios of its sides stay the same too. They depend only on the angle.',
      'Memory aid SOH-CAH-TOA: Sine = Opposite ÷ Hypotenuse, Cosine = Adjacent ÷ Hypotenuse, Tangent = Opposite ÷ Adjacent.',
      'At 0° the opposite side vanishes: $\\sin 0^\\circ = 0$ and $\\cos 0^\\circ = 1$. At 90° it is the other way round.',
      'For small angles all three are nearly the angle in radians ($\\theta \\div 57.3$) — the 1-in-60 rule.'],
    play: { inputs: [{ k: 'a', label: 'Angle θ', unit: '°', min: 0, max: 89, step: 1, v: 30 }],
      out: v => { const r = v.a * Math.PI / 180; return [['sin θ', fmt(Math.sin(r), 3)], ['cos θ', fmt(Math.cos(r), 3)], ['tan θ', fmt(Math.tan(r), 3)], ['Small-angle guess θ ÷ 57.3', fmt(v.a / 57.2958, 3)]]; } }
  };
  E['0.4'] = {
    words: 'Split the wind into the part along the runway (headwind) and the part across it (crosswind), using the angle between the wind and the runway.',
    parts: [[R`\text{crosswind}`, 'the part blowing across the runway', 'kt'], [R`\text{headwind}`, 'the part blowing straight down the runway towards you; negative means a tailwind', 'kt'],
      [R`W_s`, 'wind speed', 'kt'], [R`\theta`, 'angle between the wind direction and the runway heading', 'degrees']],
    why: ['The wind arrow is the hypotenuse, the runway direction is the adjacent side and straight across the runway is the opposite side.',
      'So headwind = wind × $\\cos\\theta$ and crosswind = wind × $\\sin\\theta$ — straight from (0.3).',
      'Clock code for a quick mental answer: 15° → a quarter of the wind is crosswind, 30° → half, 45° → three quarters, 60° or more → nearly all of it.'],
    play: { inputs: [{ k: 'ws', label: 'Wind speed', unit: 'kt', min: 0, max: 50, step: 1, v: 20 }, { k: 'th', label: 'Angle off the runway', unit: '°', min: 0, max: 180, step: 1, v: 30 }],
      out: v => { const r = v.th * Math.PI / 180, hw = v.ws * Math.cos(r), off = v.th <= 90 ? v.th : 180 - v.th;
        return [['Crosswind', fmt(v.ws * Math.sin(r), 1) + ' kt'], [hw >= 0 ? 'Headwind' : 'Tailwind', fmt(Math.abs(hw), 1) + ' kt'], ['Clock-code estimate', fmt(v.ws * Math.min(1, off / 60), 1) + ' kt across']]; } }
  };
  E['0.5'] = {
    words: 'Weight is the force with which gravity pulls on a mass: the mass in kilograms times 9.81 gives the weight in newtons.',
    parts: [['W', 'weight — a force', 'newtons (N)'], ['m', 'mass — how much aircraft there is', 'kilograms (kg)'], ['g', 'the acceleration of gravity', '9.81 m/s² at the Earth’s surface']],
    why: ['Everyday speech mixes the two (“it weighs 70 tonnes”). The equations need the force, in newtons.',
      '1 kg weighs 9.81 N, so 70 t = 70 000 kg weighs 686 700 N ≈ 687 kN.',
      'In a turn the mass stays the same but the wing has to pull harder: the load factor $n$ multiplies the weight (1.5).'],
    play: { inputs: [{ k: 'm', label: 'Mass', unit: 't', min: 0.5, max: 600, step: 0.5, v: 70 }],
      out: v => [['Mass', fmt(v.m * 1000) + ' kg'], ['Weight', fmt(v.m * 1000 * G / 1000, 1) + ' kN'], ['In pounds-force', fmt(v.m * 1000 * 2.20462) + ' lbf']] }
  };
  E['0.6'] = {
    words: 'The same equation answers a different question when you turn it round: how fast must the aircraft fly for the wing to carry its weight?',
    parts: [['V', 'the speed we are solving for', 'm/s — × 1.944 for knots'], ['W', 'weight', 'N'], [R`\rho`, 'air density', 'kg/m³'], ['S', 'wing area', 'm²'], [R`C_L`, 'the lift coefficient the wing is using', 'no unit']],
    why: ['Start from lift = weight: $W = \\tfrac12\\rho V^2 S C_L$.',
      'Divide both sides by $\\tfrac12\\rho S C_L$. Dividing by ½ is the same as multiplying by 2, which gives $V^2 = 2W/(\\rho S C_L)$.',
      'Undo the square with a square root: $V = \\sqrt{2W/(\\rho S C_L)}$.',
      'Use the maximum lift coefficient and this is the stall speed (1.5). A bigger $C_L$ — flaps out — means a slower speed.'],
    play: { inputs: [{ k: 'm', label: 'Mass', unit: 't', min: 1, max: 500, step: 1, v: 65 }, { k: 's', label: 'Wing area', unit: 'm²', min: 10, max: 850, step: 0.1, v: 124.6 },
      { k: 'cl', label: 'Lift coefficient', unit: '', min: 0.2, max: 3, step: 0.05, v: 1.5 }, { k: 'alt', label: 'Altitude (ISA)', unit: 'ft', min: 0, max: 41000, step: 1000, v: 0 }],
      out: (v, C) => { const rho = rhoAt(C, v.alt), V = Math.sqrt(2 * v.m * 1000 * G / (rho * v.s * v.cl));
        return [['V', fmt(V, 1) + ' m/s'], ['True airspeed', fmt(V / KT) + ' kt'], ['Indicated (≈ EAS)', fmt(V * Math.sqrt(rho / 1.225) / KT) + ' kt']]; } }
  };

  // ============================================================== 7 · AIRLINER PROCEDURES
  const G2 = { 2: 0.024, 3: 0.027, 4: 0.030 };
  E['7.1'] = {
    words: 'The climb gradient — height gained per distance flown — is the spare thrust (thrust minus drag) as a fraction of the weight.',
    parts: [[R`\gamma`, '“gamma”: the climb gradient (for small angles, the angle in radians)', 'usually in %: 3 % = 3 ft up per 100 ft along = 182 ft per NM'],
      ['T', 'thrust of all running engines', 'N'], ['D', 'drag', 'N'], ['W', 'weight', 'N']],
    why: ['Along the flight path thrust pushes forward, drag pulls back, and when you climb a slice of the weight, $W\\sin\\gamma$, pulls back too.',
      'In a steady climb they balance: $T = D + W\\sin\\gamma$, so $\\sin\\gamma = (T - D)/W$.',
      'For the small angles airliners fly, $\\sin\\gamma \\approx \\gamma$ — the gradient.',
      'Since lift ≈ weight, drag ÷ weight is simply $1/(L/D)$: a clean wing (high L/D) leaves more thrust for climbing.'],
    play: { inputs: [{ k: 'tw', label: 'Thrust ÷ weight', unit: '', min: 0.05, max: 0.4, step: 0.005, v: 0.25 }, { k: 'ld', label: 'Lift-to-drag ratio', unit: '', min: 6, max: 20, step: 0.5, v: 12 },
      { k: 'gs', label: 'Ground speed', unit: 'kt', min: 100, max: 250, step: 5, v: 160 }],
      out: v => { const g = v.tw - 1 / v.ld;
        return [['Drag ÷ weight', fmt(1 / v.ld, 3)], ['Climb gradient', fmt(g * 100, 1) + ' %'], ['Feet per NM', fmt(g * 6076)], ['Rate of climb', fmt(g * v.gs * 101.27) + ' fpm']]; } }
  };
  E['7.2'] = {
    words: 'With one engine failed only (n − 1)/n of the thrust is left, but the drag does not fall — it rises a little — so the climb gradient collapses.',
    parts: [[R`\gamma_{\text{OEI}}`, 'climb gradient with one engine inoperative', ''], ['n', 'number of engines', ''],
      [R`\tfrac{n-1}{n}T`, 'the thrust that is left: half for a twin, two thirds for three engines, three quarters for four', 'N'], ['D', 'drag of the aircraft', 'N'],
      [R`\Delta D_{\text{asym}}`, 'extra drag: the windmilling engine, the rudder and the sideslip', 'a few % of the total drag']],
    why: ['The same balance as (7.1), with less thrust and a little more drag.',
      'Because the drag stays, the gradient falls much further than the thrust: a twin climbing at 15 % on two engines is down to about 3 % on one. Half the thrust, four fifths of the climb gone.',
      'This is the number the second segment is checked against: at least 2.4 % for a twin, 2.7 % for three engines, 3.0 % for four.'],
    play: { inputs: [{ k: 'n', label: 'Engines', unit: '', min: 2, max: 4, step: 1, v: 2 }, { k: 'tw', label: 'Thrust ÷ weight, all engines', unit: '', min: 0.12, max: 0.4, step: 0.005, v: 0.25 },
      { k: 'ld', label: 'L/D with take-off flaps', unit: '', min: 8, max: 16, step: 0.5, v: 11 }],
      out: v => { const all = v.tw - 1 / v.ld, one = (v.n - 1) / v.n * v.tw - 1.05 / v.ld, need = G2[v.n];
        return [['Gradient, all engines', fmt(all * 100, 1) + ' %'], ['Gradient, one engine out', fmt(one * 100, 1) + ' %'], ['2nd-segment minimum', fmt(need * 100, 1) + ' %'],
          ['Verdict', one >= need ? 'meets the minimum' : 'too heavy, hot or high']]; } }
  };
  E['7.3'] = {
    words: 'Turn the engine-out climb round: the fewer engines an aircraft has, the more thrust each must give so that the rest can still climb.',
    parts: [['T/W', 'thrust ÷ weight with all engines running', 'no unit; about 0.25–0.35 for twins'], [R`\tfrac{n}{n-1}`, 'scale-up factor: 2 for a twin, 1.5 for three engines, 1.33 for four', ''],
      ['L/D', 'lift-to-drag ratio at V2 with take-off flaps', 'about 10–13'], [R`\gamma_{\min}`, 'required second-segment gradient', '0.024 twin, 0.027 three, 0.030 four']],
    why: ['With an engine out the gradient must reach $\\gamma_{\\min}$: $\\tfrac{n-1}{n}\\,T/W - 1/(L/D) \\ge \\gamma_{\\min}$.',
      'Move the drag term across and multiply by $n/(n-1)$: that is the thrust needed with all engines.',
      'For a twin the factor is 2 — it carries twice the thrust it needs on one engine. That is why twins climb so steeply on a normal day.'],
    play: { inputs: [{ k: 'n', label: 'Engines', unit: '', min: 2, max: 4, step: 1, v: 2 }, { k: 'ld', label: 'L/D at V2', unit: '', min: 8, max: 16, step: 0.5, v: 11 }],
      out: v => { const tw = v.n / (v.n - 1) * (1 / v.ld + G2[v.n]);
        return [['T/W needed', fmt(tw, 3)], ['All-engine climb that gives', fmt((tw - 1 / v.ld) * 100, 1) + ' %']]; } }
  };
  E['7.4'] = {
    words: 'For obstacles, planners use a gradient reduced by a safety margin, and that net path must pass every obstacle with at least 35 ft to spare.',
    parts: [[R`\gamma_{\text{net}}`, 'net gradient — what planners use', '%'], [R`\gamma_{\text{gross}}`, 'gross gradient — what an average aircraft achieves', '%'],
      [R`0.8\,\%`, 'margin for a twin (0.9 % for three engines, 1.0 % for four)', ''], ['d', 'distance from the end of the take-off distance to the obstacle', 'metres or feet'],
      [R`h_{\text{obstacle}}`, 'obstacle height above the runway', 'ft']],
    why: ['Real aircraft differ from the average: older engines, a pilot a little slow on the rudder. The margin covers that.',
      'Height gained = gradient × distance, as on any slope.',
      'If the net path does not clear an obstacle by 35 ft, the weight has to come down — or the engine-out procedure turns away from the obstacle.'],
    play: { inputs: [{ k: 'g', label: 'Gross gradient', unit: '%', min: 1.5, max: 8, step: 0.1, v: 2.9 }, { k: 'd', label: 'Distance to the obstacle', unit: 'NM', min: 0.5, max: 6, step: 0.1, v: 2 },
      { k: 'ob', label: 'Obstacle height', unit: 'ft', min: 0, max: 1000, step: 10, v: 200 }],
      out: v => { const net = v.g - 0.8, h = net / 100 * v.d * 6076, need = v.ob + 35;
        return [['Net gradient (twin)', fmt(net, 1) + ' %'], ['Net height gained', fmt(h) + ' ft'], ['Needed', fmt(need) + ' ft'], ['Margin', (h >= need ? '+' : '') + fmt(h - need) + ' ft']]; } }
  };
  E['7.5'] = {
    words: 'The spare thrust, per unit of weight, is spent on climbing, on accelerating, or on both — never more than there is.',
    parts: [['T - D', 'spare thrust', 'N'], ['W', 'weight', 'N'], [R`\sin\gamma`, 'the climbing part: sine of the flight-path angle', '≈ the climb gradient'],
      [R`\frac{1}{g}\frac{dV}{dt}`, 'the accelerating part: how fast the speed grows, as a fraction of g', 'dV/dt in m/s²; 1 kt per second = 0.51 m/s²']],
    why: ['Newton’s second law along the flight path: $T - D - W\\sin\\gamma = m\\,\\dfrac{dV}{dt}$.',
      'Divide by the weight $W = mg$ and you have (7.5).',
      'Both terms on the right draw on the same budget. Hold the speed and everything goes into climbing; level off and everything goes into speed.',
      'In NADP 2 the flight director splits it — typically about 60 % to speed and 40 % to climb — so the aircraft keeps climbing, only slower.'],
    play: { inputs: [{ k: 'ex', label: 'Spare thrust (T − D) ÷ W', unit: '%', min: 2, max: 30, step: 0.5, v: 18 }, { k: 'sh', label: 'Share put into speed', unit: '%', min: 0, max: 100, step: 5, v: 60 },
      { k: 'v', label: 'Speed', unit: 'kt', min: 140, max: 260, step: 5, v: 180 }],
      out: v => { const e = v.ex / 100, climb = e * (1 - v.sh / 100), acc = e * v.sh / 100 * G / KT;
        return [['Climb gradient', fmt(climb * 100, 1) + ' %'], ['Rate of climb', fmt(climb * v.v * 101.27) + ' fpm'], ['Acceleration', fmt(acc, 2) + ' kt/s'],
          ['Time to gain 50 kt', acc > 0.001 ? fmt(50 / acc) + ' s' : 'never']]; } }
  };
  E['7.6'] = {
    words: 'Energy height is the height the aircraft would reach if it traded all its speed for altitude — speed is stored height.',
    parts: [[R`h_E`, 'energy height', 'm or ft'], ['h', 'the actual height', ''], [R`\frac{V^2}{2g}`, 'the height “stored” in the speed', 'V is the true airspeed in m/s; the result is in metres'], ['g', 'gravity', '9.81 m/s²']],
    why: ['Kinetic energy is $\\tfrac12 mV^2$ and potential energy $mgh$. Divide both by $mg$ and both become heights: $V^2/(2g)$ and $h$.',
      'Their sum only changes when the engines add energy or drag takes it away. Trading one for the other costs nothing (apart from drag).',
      'Because $V$ is squared, the same 10 kt costs more height at high speed than at low speed.'],
    play: { inputs: [{ k: 'a', label: 'From', unit: 'kt', min: 100, max: 300, step: 5, v: 160 }, { k: 'b', label: 'To', unit: 'kt', min: 100, max: 350, step: 5, v: 250 }],
      out: v => { const hs = kt => Math.pow(kt * KT, 2) / (2 * G) / FT;
        return [['Stored in the first speed', fmt(hs(v.a)) + ' ft'], ['Stored in the second', fmt(hs(v.b)) + ' ft'], ['The change is worth', fmt(hs(v.b) - hs(v.a)) + ' ft of climb']]; } }
  };
  E['7.7'] = {
    words: 'On a fixed descent path the sink rate is set by the ground speed: faster over the ground means a higher sink rate.',
    parts: [['VS', 'vertical speed', 'ft/min'], ['GS', 'ground speed', 'kt'], [R`\gamma`, 'path angle', '3° on most ILS approaches'], ['101.3', 'turns knots into feet per minute: 1 kt = 6076 ft per 60 min', '']],
    why: ['Height lost per minute = distance flown per minute × the slope, $\\tan\\gamma$.',
      '1 kt is 6076 ft per hour, which is 101.3 ft per minute — hence the constant.',
      'For 3°: $101.3 \\times \\tan 3^\\circ = 5.3$, so VS ≈ 5.3 × GS, a quick cross-check on every approach.',
      'A tailwind raises the ground speed and with it the sink rate; the stable-approach limit is 1000 fpm.'],
    play: { inputs: [{ k: 'gs', label: 'Ground speed', unit: 'kt', min: 80, max: 220, step: 1, v: 140 }, { k: 'a', label: 'Path angle', unit: '°', min: 2, max: 5, step: 0.1, v: 3 }],
      out: v => { const vs = 101.27 * v.gs * Math.tan(v.a * Math.PI / 180);
        return [['Vertical speed', fmt(vs) + ' fpm'], ['Check', vs <= 1000 ? 'within the 1000 fpm limit' : 'over 1000 fpm — brief it or go around']]; } }
  };
  E['7.8'] = {
    words: 'At idle and constant speed the only force along the path is drag, so the aircraft descends at the angle whose tangent is 1 ÷ (L/D).',
    parts: [[R`\gamma_{\text{idle}}`, 'descent angle at idle thrust', 'degrees; negative means down'], ['D/W', 'drag as a fraction of the weight', ''],
      ['L/D', 'lift-to-drag ratio', 'about 17–19 clean for an airliner, 7–10 with gear and flaps down']],
    why: ['Put $T = 0$ and $dV/dt = 0$ into the energy equation (7.5): $\\sin\\gamma = -D/W$.',
      'In steady flight lift ≈ weight, so $D/W = 1/(L/D)$.',
      'Clean, the idle path is only a little steeper than 3°. You cannot descend steeply and slow down at the same time without extra drag — so start down early.'],
    play: { inputs: [{ k: 'ld', label: 'Lift-to-drag ratio', unit: '', min: 5, max: 20, step: 0.5, v: 17 }, { k: 'gs', label: 'Ground speed', unit: 'kt', min: 150, max: 450, step: 10, v: 300 }],
      out: v => [['Idle descent angle', fmt(Math.atan(1 / v.ld) * 180 / Math.PI, 1) + '°'], ['Height lost per NM', fmt(6076 / v.ld) + ' ft'], ['Descent rate', fmt(v.gs * 101.27 / v.ld) + ' fpm']] }
  };
  E['7.9'] = {
    words: 'In level flight at idle all the drag goes into slowing down: the deceleration is g divided by the lift-to-drag ratio.',
    parts: [[R`dV/dt`, 'how fast the speed changes', 'm/s² — 1 kt per second = 0.514 m/s²'], ['g', 'gravity', '9.81 m/s²'], ['L/D', 'lift-to-drag ratio', 'higher means slower to decelerate']],
    why: ['Put $T = 0$ and $\\gamma = 0$ into (7.5): $\\dfrac{1}{g}\\dfrac{dV}{dt} = -\\dfrac{D}{W} = -\\dfrac{1}{L/D}$.',
      'An airliner at L/D 17 slows by about 1.1 kt every second; with speed brakes or flaps (L/D about 10) nearly 2 kt per second.',
      'For planning, distance matters more than time: losing 40 kt around 230 kt takes some 2.5 NM.'],
    play: { inputs: [{ k: 'ld', label: 'Lift-to-drag ratio', unit: '', min: 5, max: 20, step: 0.5, v: 17 }, { k: 'a', label: 'From', unit: 'kt', min: 150, max: 320, step: 5, v: 250 },
      { k: 'b', label: 'To', unit: 'kt', min: 120, max: 300, step: 5, v: 210 }],
      out: v => { const dec = G / v.ld / KT, dv = Math.max(0, v.a - v.b), t = dv / dec;
        return [['Deceleration', fmt(dec, 2) + ' kt/s'], ['Time', fmt(t) + ' s'], ['Distance (still air)', fmt((v.a + v.b) / 2 * t / 3600, 1) + ' NM']]; } }
  };
  E['7.10'] = {
    words: 'If the sink rate falls evenly to zero over t seconds, the aircraft loses half the height it would have lost had it kept sinking.',
    parts: [[R`\Delta h`, 'height lost after starting the go-around', 'ft'], ['VS', 'sink rate when you start', 'ft/min — divide by 60 for ft per second'],
      ['t', 'time to stop the descent', 'seconds; about 3–8 s for an airliner']],
    why: ['At a constant sink rate the height lost would be $\\tfrac{VS}{60} \\times t$.',
      'The sink rate falls from $VS$ to zero, so on average it is half as big — the area of a triangle is half the rectangle.',
      'Decision heights leave room for this. A late go-around from a high sink rate eats the margin quickly.'],
    play: { inputs: [{ k: 'vs', label: 'Sink rate', unit: 'fpm', min: 300, max: 1500, step: 50, v: 750 }, { k: 't', label: 'Time to stop the descent', unit: 's', min: 1, max: 10, step: 0.5, v: 5 }],
      out: v => [['Height lost', fmt(0.5 * v.vs / 60 * v.t) + ' ft']] }
  };

  if (typeof module === 'object' && module.exports) module.exports = E;
  if (root) { root.XFC = root.XFC || {}; root.XFC.explain = E; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
