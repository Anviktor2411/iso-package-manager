#!/usr/bin/env python3
"""
Fake X-Plane 12 for testing XP Flight Computer without the simulator.

Speaks the same protocols the bridge uses:
  * UDP RREF on port 49000 (subscribe by dataref name, receive index/float pairs)
  * Web API on port 8086: GET /api/capabilities, GET /api/v2/datarefs?filter[name]=...,
    WebSocket /api/v2 with dataref_subscribe_values -> dataref_update_values (changes only, 10 Hz)
  * optional BECN multicast beacon (--beacon)

A simple scripted flight runs for the chosen aircraft. Use --cycle N to switch aircraft every N seconds.
Run:  python tools/fake_xplane.py --aircraft B738            (then start xpfc.py)
"""
import argparse
import base64
import hashlib
import json
import math
import os
import socket
import struct
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import xpfc  # noqa: E402  (reuse the dataref catalog)

AIRCRAFT = {
    "B738": dict(icao="B738", desc="Boeing 737-800", tail="N738XP", author="Laminar Research", engines=2, engType=7,
                 mtow=79015.8, oew=41413.0, maxFuel=20894.0, vso=112, vs=140, vfe=162, vno=340, vne=340, mmo=0.82,
                 flags={"airliner": 1}, detents=8, alt=35000, mach=0.78, ias=None, hdg=83.0, mass=68500, fuel=9800, ff=2450,
                 lat=59.10, lon=21.20),
    "A333": dict(icao="A333", desc="Airbus A330-300", tail="LN-A330", author="Laminar Research", engines=2, engType=7,
                 mtow=242000.0, oew=124500.0, maxFuel=109185.0, vso=110, vs=150, vfe=196, vno=330, vne=330, mmo=0.86,
                 flags={"airliner": 1}, detents=4, alt=37000, mach=0.82, ias=None, hdg=250.0, mass=205000, fuel=52000, ff=5800,
                 lat=55.60, lon=12.60),
    "C172": dict(icao="C172", desc="Cessna 172 SP Skyhawk", tail="N172SP", author="Laminar Research", engines=1, engType=1,
                 mtow=1157.0, oew=767.0, maxFuel=145.0, vso=48, vs=53, vfe=85, vno=129, vne=163, mmo=0.0,
                 flags={"general_aviation": 1}, detents=3, alt=4500, mach=None, ias=105, hdg=140.0, mass=1050, fuel=110, ff=30,
                 lat=58.30, lon=26.70),
    "R22": dict(icao="R22", desc="Robinson R22 Beta II", tail="N22RB", author="Laminar Research", engines=1, engType=0,
                mtow=621.0, oew=390.0, maxFuel=66.0, vso=0, vs=0, vfe=0, vno=102, vne=102, mmo=0.0,
                flags={"helicopter": 1}, detents=0, alt=1500, mach=None, ias=80, hdg=10.0, mass=560, fuel=45, ff=35,
                lat=59.40, lon=24.80),
}


def isa(h_ft):
    h = h_ft * 0.3048
    if h <= 11000:
        T = 288.15 - 0.0065 * h
        P = 101325 * (T / 288.15) ** 5.25588
    else:
        T = 216.65
        P = 22632.06 * math.exp(-9.80665 * (h - 11000) / (287.05287 * T))
    return T, P


def cas_from_mach(M, P):
    qc = P * ((1 + 0.2 * M * M) ** 3.5 - 1)
    return 661.4786 * math.sqrt(5 * ((qc / 101325 + 1) ** (2 / 7) - 1))


def mach_from_cas(cas, P):
    qc = 101325 * ((1 + 0.2 * (cas / 661.4786) ** 2) ** 3.5 - 1)
    return math.sqrt(5 * ((qc / P + 1) ** (2 / 7) - 1))


class Sim:
    def __init__(self, ac, cycle):
        self.order = [ac] + [k for k in AIRCRAFT if k != ac]
        self.cycle = cycle
        self.t0 = time.time()
        self.lock = threading.Lock()
        self.state = {}
        self.update()

    def aircraft(self):
        if self.cycle > 0:
            return AIRCRAFT[self.order[int((time.time() - self.t0) // self.cycle) % len(self.order)]]
        return AIRCRAFT[self.order[0]]

    def update(self):
        a = self.aircraft()
        t = time.time() - self.t0
        alt = a["alt"] + 400 * math.sin(t / 40.0)
        vs = 400 * math.cos(t / 40.0) / 40.0 * 60
        T, P = isa(alt)
        oat = T - 273.15 + 5.0                                   # ISA+5
        a_kt = math.sqrt(1.4 * 287.05287 * (oat + 273.15)) / 0.514444
        if a["mach"]:
            M = a["mach"]
            cas = cas_from_mach(M, P)
        else:
            cas = a["ias"] + 3 * math.sin(t / 7.0)
            M = mach_from_cas(cas, P)
        tas = M * a_kt
        hdg = (a["hdg"] + 8 * math.sin(t / 60.0)) % 360
        wdir, wspd = 270.0, 35.0 if a["mach"] else 18.0
        # ground vector = air vector + wind (wind blows TO wdir+180)
        an, ae = tas * math.cos(math.radians(hdg)), tas * math.sin(math.radians(hdg))
        wn, we = wspd * math.cos(math.radians(wdir + 180)), wspd * math.sin(math.radians(wdir + 180))
        gn, ge = an + wn, ae + we
        gs = math.hypot(gn, ge)
        trk = math.degrees(math.atan2(ge, gn)) % 360
        dist_nm = gs * t / 3600.0
        lat = a["lat"] + dist_nm / 60.0 * math.cos(math.radians(trk))
        lon = a["lon"] + dist_nm / 60.0 * math.sin(math.radians(trk)) / math.cos(math.radians(lat))
        magvar = 7.0
        s = {
            "sim/aircraft/view/acf_ICAO": a["icao"], "sim/aircraft/view/acf_descrip": a["desc"],
            "sim/aircraft/view/acf_tailnum": a["tail"], "sim/aircraft/view/acf_author": a["author"],
            "sim/aircraft/engine/acf_num_engines": a["engines"], "sim/aircraft/prop/acf_en_type": [a["engType"]] * 8,
            "sim/aircraft/weight/acf_m_empty": a["oew"], "sim/aircraft/weight/acf_m_max": a["mtow"],
            "sim/aircraft/weight/acf_m_fuel_tot": a["maxFuel"],
            "sim/aircraft/view/acf_Vso": a["vso"], "sim/aircraft/view/acf_Vs": a["vs"], "sim/aircraft/view/acf_Vfe": a["vfe"],
            "sim/aircraft/view/acf_Vno": a["vno"], "sim/aircraft/view/acf_Vne": a["vne"], "sim/aircraft/view/acf_Mmo": a["mmo"],
            "sim/aircraft/overflow/acf_Vle": 270.0, "sim/aircraft/overflow/acf_Vmca": 0.0, "sim/aircraft/overflow/acf_Vyse": 0.0,
            "sim/aircraft/gear/acf_gear_retract": 1 if a["engines"] > 1 else 0,
            "sim/aircraft/controls/acf_flap_detents": a["detents"],
            "sim/version/xplane_internal_version": 121400,
            "sim/flightmodel/position/latitude": lat, "sim/flightmodel/position/longitude": lon,
            "sim/flightmodel/position/elevation": alt * 0.3048 + 40, "sim/flightmodel/position/y_agl": alt * 0.3048 - 30,
            "sim/cockpit2/gauges/indicators/altitude_ft_pilot": alt,
            "sim/flightmodel2/position/pressure_altitude": alt - 90,
            "sim/cockpit2/gauges/indicators/airspeed_kts_pilot": cas,
            "sim/cockpit2/gauges/indicators/calibrated_airspeed_kts_pilot": cas,
            "sim/flightmodel/position/true_airspeed": tas * 0.514444, "sim/flightmodel/position/groundspeed": gs * 0.514444,
            "sim/flightmodel/misc/machno": M, "sim/flightmodel/position/vh_ind_fpm": vs,
            "sim/flightmodel/position/psi": hdg, "sim/flightmodel/position/mag_psi": (hdg - magvar) % 360,
            "sim/flightmodel/position/hpath": trk, "sim/flightmodel/position/theta": 2.5, "sim/flightmodel/position/phi": 0.0,
            "sim/flightmodel2/position/alpha": 2.4,
            "sim/weather/aircraft/temperature_ambient_deg_c": oat, "sim/cockpit2/temperature/outside_air_temp_degc": oat,
            "sim/weather/aircraft/temperature_leadingedge_deg_c": (oat + 273.15) * (1 + 0.2 * M * M) - 273.15,
            "sim/weather/aircraft/qnh_pas": 101010.0, "sim/weather/aircraft/barometer_current_pas": P,
            "sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot": 29.92 if alt > 18000 else 29.83,
            "sim/weather/aircraft/wind_now_direction_degt": wdir, "sim/weather/aircraft/wind_now_speed_msc": wspd * 0.514444,
            "sim/cockpit2/gauges/indicators/wind_heading_deg_mag": (wdir - magvar) % 360,
            "sim/cockpit2/gauges/indicators/wind_speed_kts": wspd,
            "sim/weather/rho": P / (287.05287 * (oat + 273.15)), "sim/weather/aircraft/altimeter_temperature_error": 60.0,
            "sim/weather/aircraft/visibility_reported_sm": 10.0, "sim/weather/region/runway_friction": 0.0,
            "sim/flightmodel/weight/m_total": a["mass"] - a["ff"] * t / 3600.0,
            "sim/flightmodel/weight/m_fuel_total": a["fuel"] - a["ff"] * t / 3600.0,
            "sim/flightmodel/weight/m_fixed": a["mass"] - a["oew"] - a["fuel"],
            "sim/cockpit2/engine/indicators/fuel_flow_kg_sec": [a["ff"] / 3600.0 / a["engines"]] * a["engines"] + [0.0] * (8 - a["engines"]),
            "sim/cockpit2/engine/indicators/N1_percent": [86.5] * a["engines"] + [0.0] * (8 - a["engines"]),
            "sim/cockpit2/controls/flap_handle_request_ratio": 0.0, "sim/cockpit2/controls/flap_handle_deploy_ratio": 0.0,
            "sim/cockpit2/controls/gear_handle_down": 0, "sim/flightmodel/failures/onground_any": 0,
            "sim/time/paused": 0, "sim/time/zulu_time_sec": (43200 + t) % 86400,
            "sim/cockpit2/radios/indicators/gps_dme_distance_nm": max(0.0, 180 - dist_nm),
            "sim/cockpit2/radios/indicators/gps_bearing_deg_mag": (trk - magvar) % 360,
            "sim/cockpit2/radios/indicators/fms_distance_to_tod_pilot": max(0.0, 80 - dist_nm),
            "sim/cockpit2/radios/indicators/landing_alt_pilot": 131.0,
        }
        for n, v in a["flags"].items():
            s["sim/aircraft2/metadata/is_" + n] = v
        with self.lock:
            self.state = s

    def get(self, path):
        """Value for 'path' or 'path[i]' (UDP style). Unknown datarefs return None (not sent)."""
        idx = None
        if path.endswith("]") and "[" in path:
            path, i = path[:-1].split("[", 1)
            idx = int(i)
        with self.lock:
            v = self.state.get(path, None if not path.startswith("sim/aircraft2/metadata/") else 0)
        if v is None:
            return None
        if isinstance(v, str):
            b = v.encode()
            return float(b[idx]) if idx is not None and idx < len(b) else 0.0
        if isinstance(v, list):
            return float(v[idx]) if idx is not None and idx < len(v) else float(v[0])
        return float(v)

    def raw(self, path):
        with self.lock:
            return self.state.get(path, None if not path.startswith("sim/aircraft2/metadata/") else 0)


# ------------------------------------------------------------------ UDP RREF
def udp_server(sim, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("127.0.0.1", port))
    s.settimeout(0.05)
    subs = {}   # addr -> {idx: (path, freq, next_time)}
    last_send = 0.0
    while True:
        try:
            data, addr = s.recvfrom(1024)
            if data[:4] == b"RREF" and len(data) >= 413:
                freq, idx, raw = struct.unpack_from("<ii400s", data, 5)
                path = raw.split(b"\0", 1)[0].decode()
                table = subs.setdefault(addr, {})
                if freq <= 0:
                    table.pop(idx, None)
                else:
                    table[idx] = (path, freq, 0.0)
        except socket.timeout:
            pass
        now = time.time()
        if now - last_send < 0.05:
            continue
        last_send = now
        for addr, table in list(subs.items()):
            out = []
            for idx, (path, freq, nxt) in list(table.items()):
                if now >= nxt:
                    v = sim.get(path)
                    if v is not None:
                        out.append(struct.pack("<if", idx, v))
                    table[idx] = (path, freq, now + 1.0 / freq)
            for i in range(0, len(out), 180):
                s.sendto(b"RREF," + b"".join(out[i:i + 180]), addr)


# ------------------------------------------------------------------ Web API
TYPES = {}
IDS = {}
for n, (key, path, kind, cnt, _f) in enumerate(xpfc.CATALOG):
    vt = {"s": "data", "i": "int", "d": "double", "f": "float", "a": "int_array", "sum": "float_array", "list": "float_array"}[kind]
    TYPES[path] = vt
    IDS[path] = 1000 + n * 7
NAME_OF = {v: k for k, v in IDS.items()}
MISSING = {"sim/weather/barometer_sealevel_inhg"}      # pretend it was removed, like newer X-Plane builds


def ws_send(sock, text):
    p = text.encode()
    h = bytearray([0x81])
    if len(p) < 126:
        h.append(len(p))
    elif len(p) < 65536:
        h.append(126)
        h += struct.pack(">H", len(p))
    else:
        h.append(127)
        h += struct.pack(">Q", len(p))
    sock.sendall(bytes(h) + p)


def ws_recv(sock):
    def rd(n):
        b = b""
        while len(b) < n:
            c = sock.recv(n - len(b))
            if not c:
                raise ConnectionError
            b += c
        return b
    b1, b2 = rd(2)
    n = b2 & 0x7F
    if n == 126:
        n = struct.unpack(">H", rd(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", rd(8))[0]
    mask = rd(4) if b2 & 0x80 else b"\0\0\0\0"
    data = bytes(b ^ mask[i % 4] for i, b in enumerate(rd(n)))
    return b1 & 0x0F, data


class WebApi(BaseHTTPRequestHandler):
    sim = None

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path == "/api/capabilities":
            return self._json({"api": {"versions": ["v1", "v2"]}, "x-plane": {"version": "12.1.4"}})
        if u.path in ("/api/v1/datarefs", "/api/v2/datarefs"):
            names = urllib.parse.parse_qs(u.query).get("filter[name]", [])
            data = [{"id": IDS[n], "name": n, "value_type": TYPES[n]} for n in names if n in IDS and n not in MISSING]
            return self._json({"data": data})
        if u.path in ("/api/v1", "/api/v2") and self.headers.get("Upgrade", "").lower() == "websocket":
            return self._websocket()
        self._json({"error_code": "not_found"}, 404)

    def _websocket(self):
        key = self.headers["Sec-WebSocket-Key"]
        acc = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC11B85").encode()).digest()).decode()
        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", acc)
        self.end_headers()
        sock = self.connection
        subs, last = {}, {}
        lock = threading.Lock()
        alive = [True]

        def reader():
            try:
                while alive[0]:
                    op, data = ws_recv(sock)
                    if op == 8:
                        break
                    if op != 1:
                        continue
                    m = json.loads(data)
                    if m.get("type") == "dataref_subscribe_values":
                        with lock:
                            for d in m["params"]["datarefs"]:
                                subs[str(d["id"])] = d.get("index")
                        ws_send(sock, json.dumps({"req_id": m.get("req_id"), "type": "result", "success": True}))
            except Exception:
                pass
            alive[0] = False
        threading.Thread(target=reader, daemon=True).start()
        try:
            while alive[0]:
                time.sleep(0.1)
                out = {}
                with lock:
                    items = list(subs.items())
                for sid, index in items:
                    path = NAME_OF[int(sid)]
                    v = self.sim.raw(path)
                    if v is None:
                        continue
                    if TYPES[path] == "data":
                        v = base64.b64encode(str(v).encode().ljust(40 if path.endswith(("ICAO", "tailnum")) else 260, b"\0")).decode()
                    elif isinstance(v, list):
                        v = [v[i] for i in index] if index is not None else v
                    if last.get(sid) != v:
                        out[sid] = v
                        last[sid] = v
                if out:
                    ws_send(sock, json.dumps({"type": "dataref_update_values", "data": out}))
        except Exception:
            pass
        alive[0] = False


def beacon(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
    name = b"FAKE-XPLANE"
    pkt = b"BECN\0" + struct.pack("<BBiiIH", 1, 2, 1, 121400, 1, port) + name + b"\0" * (500 - len(name)) + struct.pack("<H", 0)
    while True:
        try:
            s.sendto(pkt, ("239.255.1.1", 49707))
        except OSError:
            pass
        time.sleep(1)


def main():
    ap = argparse.ArgumentParser(description="Fake X-Plane 12 for testing")
    ap.add_argument("--aircraft", default="B738", choices=sorted(AIRCRAFT))
    ap.add_argument("--cycle", type=float, default=0, help="switch aircraft every N seconds")
    ap.add_argument("--udp-port", type=int, default=49000)
    ap.add_argument("--web-port", type=int, default=8086)
    ap.add_argument("--no-udp", action="store_true")
    ap.add_argument("--no-web", action="store_true")
    ap.add_argument("--beacon", action="store_true")
    a = ap.parse_args()
    sim = Sim(a.aircraft, a.cycle)
    if not a.no_udp:
        threading.Thread(target=udp_server, args=(sim, a.udp_port), daemon=True).start()
    if not a.no_web:
        WebApi.sim = sim
        srv = ThreadingHTTPServer(("127.0.0.1", a.web_port), WebApi)
        srv.daemon_threads = True
        threading.Thread(target=srv.serve_forever, daemon=True).start()
    if a.beacon:
        threading.Thread(target=beacon, args=(a.udp_port,), daemon=True).start()
    print("Fake X-Plane running: aircraft=%s udp=%s web=%s" % (a.aircraft, "off" if a.no_udp else a.udp_port, "off" if a.no_web else a.web_port), flush=True)
    while True:
        sim.update()
        time.sleep(0.05)


if __name__ == "__main__":
    main()
