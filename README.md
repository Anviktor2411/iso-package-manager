# XP Flight Computer

A study-level flight computer for **X-Plane 12**. It reads the sim live, detects the aircraft you are flying, and gives you:

- **Live flight deck** — airspeeds (IAS, CAS, TAS, GS, Mach), altitudes (indicated, pressure, density, temperature-corrected), wind components, fuel endurance and range, stall margin at your current weight and bank. Every value is marked as either read from X-Plane or calculated by the app.
- **A study page for the aircraft you fly** — load any aircraft and it gets its own page: key numbers, its airspeed indicator with the colour arcs, stall speed against weight, how to fly it and a quiz. Airliners add V-speeds against weight, flap tables and a payload–range diagram. 52 types are in the library (from the Cessna 172 to the A380); anything else gets a page built from X-Plane’s own aircraft data.
- **35 calculators** — E6B-style tools: wind triangle, crosswind, airspeed converter, crossover altitude, ISA, pressure and density altitude, cold-temperature correction, METAR decoder, cloud base, top of descent, glide, turns, great circle, holding entries, DME slant range, ILS glide path, NDB bearings, true/magnetic/compass headings, optimum altitude and step climb, wake separation, manoeuvring speed, fuel, mass & balance, the **departure profile (NADP 1 / NADP 2 / engine failure)** and more. Each shows its working step by step, and “Follow sim” fills the inputs from X-Plane live.
- **Airliner performance**, which opens automatically when an airliner is detected: load sheet, fuel plan, take-off (V1/VR/V2, assumed temperature/FLEX, field length), **after take-off (thrust reduction, acceleration and engine-out acceleration heights as you would enter them in the Airbus MCDU or Boeing FMC, flap clean-up speeds, climb profile)**, landing (Vref/VLS, Vapp additives, landing distance, autobrake suggestion), crossover, top of descent, manoeuvre speeds. Runway data comes from X-Plane’s own airport database.
- **Study library** — 38 topics in 8 chapters (start here, principles of flight, atmosphere, airspeed, navigation, airliner performance, weather & operations, airliner procedures) with diagrams, numbered equations, worked examples computed live, the X-Plane datarefs behind each value, and a short quiz at the end of every page.
- **Every equation explained** — each of the 81 numbered equations has an **Explain** button: the equation in plain words, what every symbol means (with units and typical values), why it looks the way it does, and sliders to try it. New to equations? Topic **0.1 Reading the equations** covers Greek letters, subscripts, powers and roots, sine and cosine, units and rearranging.
- **Airliner procedures** — the take-off segments and flying an engine failure after V1, **NADP 1 and NADP 2** noise-abatement departures (with the energy equation behind them), stabilised approaches and continuous descent, and the go-around.
- **Phone or tablet as a second screen** — switch it on in Settings and scan the QR code.

> For flight simulation and study only. Not for real-world navigation or aircraft operation. Airliner figures are typical public data and estimates.

## Quick start (Windows)

1. Install **Python 3.8 or newer** from python.org (tick *Add python.exe to PATH*). Nothing else is needed — the app uses only the standard library.
2. Double-click **`start.bat`**. Your browser opens **http://127.0.0.1:8765**.
3. Start X-Plane 12 and load an aircraft. It appears on the Live page within a few seconds.

No X-Plane running? Press **Run the demo flight** to try everything with simulated data.

## Quick start (Linux)

1. Python 3 is usually installed already (`python3 --version`). If not: `sudo pacman -S python` (Arch) or `sudo apt install python3` (Debian/Ubuntu).
2. In the project folder run **`sh start.sh`** (or `python3 xpfc.py`). Open **http://127.0.0.1:8765** if the browser does not open by itself.
3. Start X-Plane 12 and load an aircraft. Native Linux X-Plane and Steam installs (including Flatpak Steam) are found automatically for runway data.

macOS works the same way with `sh start.sh`.

## How it connects to X-Plane

The app picks the best link on its own:

| X-Plane | Link | What to do |
|---|---|---|
| 12.1.1 or newer, same PC | Web API, port 8086 | Nothing — it is on by default. |
| Older 12.x, or the Web API is off | UDP, port 49000 | In X-Plane: **Settings → Network → Accept incoming connections**. |
| X-Plane on another PC | UDP | Run `python xpfc.py --xp-host 192.168.1.50` (the sim PC’s IP), or `--discover` to find it automatically. Enable *Accept incoming connections* on the sim PC. |

**Settings** in the app shows the live status of both links.

## Phone or tablet as a second screen

1. On the PC, open the app and go to **Settings → Phone & tablet** (or press the phone button in the top bar). Press **Allow phones & tablets**. It stays switched on the next time you start the app.
2. Scan the QR code with the phone’s camera, or type the address it shows, for example `http://192.168.1.20:8765`. The phone gets the whole app with live data.
3. Windows may ask whether Python can use the network: click **Allow access**. The card checks the Windows Firewall for you; if it says Python is blocked, press **Fix the Windows Firewall** (Windows asks for permission once). If that does not work, run **`allow_phone_firewall.bat`**.

The card also shows which devices have connected, so you can see the moment your phone gets through.

**Phone still can’t connect?**

- The phone must be on the **same Wi-Fi** as the PC — not a guest network, and not on mobile data. Turn off VPN apps on the phone while testing.
- The phone’s Wi-Fi address should start the same way as the PC’s (for example both `192.168.1.x`). If not, they are on different networks or routers.
- Type the address with **`http://`**, not https.
- iPhone with Chrome, Edge or Firefox: allow **Settings → (browser) → Local Network**. Safari works without it.
- The claude.ai preview link is a demo only; it can never show your sim. Use the address from the Phone & tablet card.
- Some routers keep devices apart (“AP isolation” / “client isolation”). Turn it off, or connect both to the same router.
- Linux with a firewall: `sudo ufw allow 8765/tcp` (ufw) or `sudo firewall-cmd --add-port=8765/tcp --permanent && sudo firewall-cmd --reload` (firewalld). The card tells you if one is running.

Sharing listens on the PC’s addresses on your home network (behind your router), and settings can only be changed on the PC itself. The Windows rule the Fix button adds allows the app’s port from the local network only. Switch sharing off in the same card when you don’t need it.

## Runway data

The app finds X-Plane 12 in your Steam libraries automatically and reads `Global Scenery/Global Airports/Earth nav data/apt.dat`. The first lookup indexes it (10–20 s). If your install is not found, set the folder in **Settings → Runway data**, or start with:

```
python xpfc.py --xp-root "D:\SteamLibrary\steamapps\common\X-Plane 12"
```

## Build a single .exe

Run **`build_exe.bat`** (installs PyInstaller, then builds `dist\XP-FlightComputer.exe`). The exe contains the web app; keep `user_profiles.json` next to it if you use one.

## Your own aircraft profiles

Copy `user_profiles.example.json` to **`user_profiles.json`** next to `xpfc.py` (or the exe) and edit it:

- Same `id` as a built-in profile (for example `B738`) → changes only the fields you list.
- New `id` → adds an aircraft. It is detected by its ICAO code (`icao`) or by words in its name (`match`).

Speeds come from the lift equation, so the key numbers are the wing area and the effective CLmax per flap setting. If the app’s V-speeds for your aircraft come out a few knots fast, raise the CLmax values slightly; if slow, lower them.

Built-in performance profiles: 737-600/700/800/900ER, 737 MAX 8, 737-300, A319, A320, A320neo, A321, A321neo, A330, A340-600, A350-900, A380, A300-600R, 757-200, 767-300ER, 777-200ER, 777-300ER, 787-9, 747-400, 747-8, 727-200, MD-82, MD-11, E175, E195, CRJ900, CRJ200, Dash 8 Q400, ATR 72-600. Unknown airliners get a generic profile built from X-Plane’s own weights.

## Command-line options

```
python xpfc.py [--port 8765] [--lan] [--xp-host IP] [--discover] [--xp-root PATH]
               [--no-webapi] [--no-udp] [--no-browser] [--debug]
```

`--lan` switches phone sharing on for this run (the same as the switch in Settings; `start_lan.bat` does this).

## Troubleshooting

- **“No sim” / waiting for X-Plane** — check the X-Plane version (12.1.1+ for the Web API) or enable *Accept incoming connections*. Settings shows what each link reports.
- **Port 8765 in use** — another copy is running, or use `--port 8766`.
- **Aircraft not recognised as an airliner** — open Performance and pick the type manually, or add it to `user_profiles.json`.
- **Phone cannot connect** — see *Phone or tablet as a second screen* above.

## For developers

- `tools/fake_xplane.py` is a stand-in for X-Plane that speaks both the Web API and UDP RREF, with a scripted flight. `python tools/fake_xplane.py --aircraft B738 --cycle 30` switches aircraft every 30 s.
- `node tests/test_calc.js` and `node tests/test_perf.js` check the maths against published ISA tables and reference values, and the METAR decoder against sample reports.
- The web app is plain HTML/CSS/JS (no build step): `web/js/calc.js` holds the aviation formulas, `web/js/perf.js` the airliner performance and departure (NADP) model, `web/js/study.js` the study topics, `web/js/explain.js` the plain-language explanation of every numbered equation, `web/js/types.js` the aircraft library and `web/js/acstudy.js` the aircraft pages.

## Credits

Equations rendered with [KaTeX](https://katex.org) (MIT). QR codes by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT). Typefaces: **B612** and **B612 Mono** (SIL Open Font License), designed for Airbus cockpit displays, and **Source Serif 4** (SIL Open Font License). License texts are in `web/vendor`.
