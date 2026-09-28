#!/usr/bin/env python3
"""
XP Flight Computer - X-Plane 12 bridge and local web server.

Reads the aircraft and flight state from X-Plane 12 and serves the flight-computer web app.
Standard library only (Python 3.8+). Two ways to talk to X-Plane, chosen automatically:

  * X-Plane Web API (12.1.1+, localhost only, port 8086) - works out of the box.
  * UDP "RREF" (any X-Plane, same PC or LAN, port 49000) - needs
    Settings > Network > "Accept incoming connections" in X-Plane 12.

Run:  python xpfc.py   (Linux: sh start.sh)   then open http://127.0.0.1:8765
      Phones/tablets: switch on Settings > Phone & tablet in the app (or start with --lan)
      python xpfc.py --help     for all options
"""
import argparse
import base64
import ipaddress
import json
import math
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP = "XP Flight Computer"
VERSION = "1.2.0"

try:  # Windows consoles may not be UTF-8; never crash on a print
    sys.stdout.reconfigure(errors="replace")
    sys.stderr.reconfigure(errors="replace")
except Exception:
    pass


def app_dir():
    """Folder of the .exe (frozen) or of this script - where config and user files live."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def res_dir():
    """Folder holding bundled resources (PyInstaller unpacks to _MEIPASS)."""
    return getattr(sys, "_MEIPASS", app_dir())


WEB_ROOT = os.path.join(res_dir(), "web")
WEB = None          # the Web API source, once started (UDP stands by while it is live)
CONFIG_PATH = os.path.join(app_dir(), "xpfc_config.json")
PROFILES_PATH = os.path.join(app_dir(), "user_profiles.json")
DEBUG = False


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


def dbg(*a):
    if DEBUG:
        log("debug:", *a)


# --------------------------------------------------------------------------- datarefs
# (key, dataref, kind, n)   kind: f float | i int | d double | s string(n bytes) | a array element n
#                                 sum (sum of first n elements) | list (first n elements)
SLOW = [
    ("icao", "sim/aircraft/view/acf_ICAO", "s", 8),
    ("desc", "sim/aircraft/view/acf_descrip", "s", 64),
    ("tail", "sim/aircraft/view/acf_tailnum", "s", 12),
    ("author", "sim/aircraft/view/acf_author", "s", 32),
    ("engines", "sim/aircraft/engine/acf_num_engines", "i", None),
    ("engType", "sim/aircraft/prop/acf_en_type", "a", 0),
    ("oew", "sim/aircraft/weight/acf_m_empty", "f", None),
    ("mtow", "sim/aircraft/weight/acf_m_max", "f", None),
    ("maxFuel", "sim/aircraft/weight/acf_m_fuel_tot", "f", None),
    ("vso", "sim/aircraft/view/acf_Vso", "f", None),
    ("vs", "sim/aircraft/view/acf_Vs", "f", None),
    ("vfe", "sim/aircraft/view/acf_Vfe", "f", None),
    ("vno", "sim/aircraft/view/acf_Vno", "f", None),
    ("vne", "sim/aircraft/view/acf_Vne", "f", None),
    ("mmo", "sim/aircraft/view/acf_Mmo", "f", None),
    ("vle", "sim/aircraft/overflow/acf_Vle", "f", None),
    ("vmca", "sim/aircraft/overflow/acf_Vmca", "f", None),
    ("vyse", "sim/aircraft/overflow/acf_Vyse", "f", None),
    ("gearRetract", "sim/aircraft/gear/acf_gear_retract", "i", None),
    ("flapDetents", "sim/aircraft/controls/acf_flap_detents", "i", None),
    ("xpBuild", "sim/version/xplane_internal_version", "i", None),
] + [("flag_" + n, "sim/aircraft2/metadata/is_" + n, "i", None) for n in (
    "airliner", "general_aviation", "helicopter", "glider", "military", "cargo",
    "experimental", "ultralight", "seaplane", "vtol", "sci_fi")]

FAST = [
    ("lat", "sim/flightmodel/position/latitude", "d", None),
    ("lon", "sim/flightmodel/position/longitude", "d", None),
    ("elevM", "sim/flightmodel/position/elevation", "d", None),
    ("aglM", "sim/flightmodel/position/y_agl", "f", None),
    ("altInd", "sim/cockpit2/gauges/indicators/altitude_ft_pilot", "f", None),
    ("pa", "sim/flightmodel2/position/pressure_altitude", "d", None),
    ("ias", "sim/cockpit2/gauges/indicators/airspeed_kts_pilot", "f", None),
    ("cas", "sim/cockpit2/gauges/indicators/calibrated_airspeed_kts_pilot", "f", None),
    ("tasMs", "sim/flightmodel/position/true_airspeed", "f", None),
    ("gsMs", "sim/flightmodel/position/groundspeed", "f", None),
    ("mach", "sim/flightmodel/misc/machno", "f", None),
    ("vsFpm", "sim/flightmodel/position/vh_ind_fpm", "f", None),
    ("hdgT", "sim/flightmodel/position/psi", "f", None),
    ("hdgM", "sim/flightmodel/position/mag_psi", "f", None),
    ("trkT", "sim/flightmodel/position/hpath", "f", None),
    ("pitch", "sim/flightmodel/position/theta", "f", None),
    ("roll", "sim/flightmodel/position/phi", "f", None),
    ("aoa", "sim/flightmodel2/position/alpha", "f", None),
    ("oat", "sim/weather/aircraft/temperature_ambient_deg_c", "f", None),
    ("oat2", "sim/cockpit2/temperature/outside_air_temp_degc", "f", None),
    ("tat", "sim/weather/aircraft/temperature_leadingedge_deg_c", "f", None),
    ("tat2", "sim/cockpit2/temperature/outside_air_LE_temp_degc", "f", None),
    ("qnhPa", "sim/weather/aircraft/qnh_pas", "f", None),
    ("qnhInHg", "sim/weather/barometer_sealevel_inhg", "f", None),
    ("pStaticPa", "sim/weather/aircraft/barometer_current_pas", "f", None),
    ("baroInHg", "sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot", "f", None),
    ("windDirT", "sim/weather/aircraft/wind_now_direction_degt", "f", None),
    ("windMs", "sim/weather/aircraft/wind_now_speed_msc", "f", None),
    ("windDirM2", "sim/cockpit2/gauges/indicators/wind_heading_deg_mag", "f", None),
    ("windKt2", "sim/cockpit2/gauges/indicators/wind_speed_kts", "f", None),
    ("rho", "sim/weather/rho", "f", None),
    ("altTempErr", "sim/weather/aircraft/altimeter_temperature_error", "f", None),
    ("visSm", "sim/weather/aircraft/visibility_reported_sm", "f", None),
    ("rwyFriction", "sim/weather/region/runway_friction", "f", None),
    ("mass", "sim/flightmodel/weight/m_total", "f", None),
    ("fuel", "sim/flightmodel/weight/m_fuel_total", "f", None),
    ("payload", "sim/flightmodel/weight/m_fixed", "f", None),
    ("ffKgs", "sim/cockpit2/engine/indicators/fuel_flow_kg_sec", "sum", 8),
    ("n1", "sim/cockpit2/engine/indicators/N1_percent", "list", 4),
    ("flapReq", "sim/cockpit2/controls/flap_handle_request_ratio", "f", None),
    ("flapDep", "sim/cockpit2/controls/flap_handle_deploy_ratio", "f", None),
    ("gearDown", "sim/cockpit2/controls/gear_handle_down", "i", None),
    ("onGround", "sim/flightmodel/failures/onground_any", "i", None),
    ("paused", "sim/time/paused", "i", None),
    ("zulu", "sim/time/zulu_time_sec", "f", None),
    ("gpsDist", "sim/cockpit2/radios/indicators/gps_dme_distance_nm", "f", None),
    ("gpsBrgM", "sim/cockpit2/radios/indicators/gps_bearing_deg_mag", "f", None),
    ("todDist", "sim/cockpit2/radios/indicators/fms_distance_to_tod_pilot", "f", None),
    ("landingAlt", "sim/cockpit2/radios/indicators/landing_alt_pilot", "f", None),
]
CATALOG = [(k, p, kind, n, 1) for (k, p, kind, n) in SLOW] + [(k, p, kind, n, 5) for (k, p, kind, n) in FAST]


def decode_text(raw):
    if isinstance(raw, (bytes, bytearray)):
        raw = bytes(raw).split(b"\0", 1)[0]
        try:
            return raw.decode("utf-8").strip()
        except UnicodeDecodeError:
            return raw.decode("latin-1", "replace").strip()
    return str(raw or "").strip()


# ------------------------------------------------------------------------- config
DEFAULT_CONFIG = {"xpHost": "auto", "udpPort": 49000, "webApiPort": 8086,
                  "useWebApi": True, "useUdp": True, "xpRoot": "", "lan": False}


class Config:
    def __init__(self):
        self.lock = threading.Lock()
        self.data = dict(DEFAULT_CONFIG)
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
                saved = json.load(fh)
            for k in DEFAULT_CONFIG:
                if k in saved:
                    self.data[k] = saved[k]
        except FileNotFoundError:
            pass
        except Exception as e:
            log("Could not read", CONFIG_PATH, "-", e)

    def get(self, k):
        with self.lock:
            return self.data.get(k)

    def update(self, new, save=True):
        with self.lock:
            for k, v in new.items():
                if k not in DEFAULT_CONFIG:
                    continue
                if k in ("udpPort", "webApiPort"):
                    v = int(v)
                    if not 1 <= v <= 65535:
                        raise ValueError(k + " out of range")
                elif k in ("useWebApi", "useUdp", "lan"):
                    v = bool(v)
                else:
                    v = str(v).strip()
                self.data[k] = v
            snapshot = dict(self.data)
        if save:
            try:
                with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
                    json.dump(snapshot, fh, indent=2)
            except Exception as e:
                log("Could not save config:", e)
        return snapshot

    def public(self):
        with self.lock:
            return dict(self.data)


CONFIG = Config()


# ------------------------------------------------------------------ beacon (BECN)
class Beacon(threading.Thread):
    """Listens for X-Plane's multicast beacon to find the sim on this PC or the LAN."""
    GROUP, PORT = "239.255.1.1", 49707

    def __init__(self):
        super().__init__(daemon=True, name="beacon")
        self.found = None
        self.status = "starting"

    def run(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("", self.PORT))
            except OSError:
                s.bind((self.GROUP, self.PORT))
            mreq = struct.pack("4s4s", socket.inet_aton(self.GROUP), socket.inet_aton("0.0.0.0"))
            s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            s.settimeout(2.0)
        except OSError as e:
            self.status = "unavailable (%s)" % e
            return
        self.status = "listening"
        while True:
            try:
                data, addr = s.recvfrom(2048)
            except socket.timeout:
                continue
            except OSError:
                time.sleep(1)
                continue
            if data[:5] != b"BECN\0" or len(data) < 21:
                continue
            try:
                major, minor, host_id, version, role, port = struct.unpack_from("<BBiiIH", data, 5)
                name = decode_text(data[21:21 + 500])
            except struct.error:
                continue
            if host_id != 1:        # 1 = X-Plane, 2 = Plane Maker
                continue
            new = {"ip": addr[0], "port": port, "version": version, "role": role, "name": name, "seen": time.time()}
            if not self.found or self.found["ip"] != new["ip"]:
                log("X-Plane beacon: %s at %s:%d (build %d)" % (name or "X-Plane", addr[0], port, version))
            self.found = new

    def recent(self):
        f = self.found
        return f if f and time.time() - f["seen"] < 10 else None


BEACON = Beacon()


def xp_host():
    """Host running X-Plane: config value, else the beacon's IP, else this PC."""
    h = CONFIG.get("xpHost") or "auto"
    if h.lower() != "auto":
        return h
    b = BEACON.recent()
    return b["ip"] if b else "127.0.0.1"


def is_local(host):
    if host in ("127.0.0.1", "localhost", "::1"):
        return True
    try:
        return host in socket.gethostbyname_ex(socket.gethostname())[2]
    except OSError:
        return False


# --------------------------------------------------------------------- UDP (RREF)
class UdpSource(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True, name="udp")
        self.raw = {}
        self.subs = []          # (index, path, freq)
        self.map = {}           # key -> list of indices
        idx = 1
        for key, path, kind, n, freq in CATALOG:
            if kind in ("s", "sum", "list"):
                ids = []
                for i in range(n):
                    self.subs.append((idx, "%s[%d]" % (path, i), freq))
                    ids.append(idx)
                    idx += 1
                self.map[key] = (kind, ids)
            elif kind == "a":
                self.subs.append((idx, "%s[%d]" % (path, n), freq))
                self.map[key] = (kind, [idx])
                idx += 1
            else:
                self.subs.append((idx, path, freq))
                self.map[key] = (kind, [idx])
                idx += 1
        self.target = None
        self.last_rx = 0.0
        self.status = "idle"
        self.lock = threading.Lock()
        self.sock = None
        self.sock_local = None

    def _socket_for(self, host):
        """Loopback-only socket when X-Plane runs on this PC (no firewall prompt), all interfaces otherwise."""
        local = is_local(host)
        if self.sock is not None and self.sock_local == local:
            return
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.bind(("127.0.0.1" if local else "0.0.0.0", 0))
        s.settimeout(0.5)
        if hasattr(socket, "SIO_UDP_CONNRESET"):      # Windows: ignore ICMP port-unreachable
            try:
                s.ioctl(socket.SIO_UDP_CONNRESET, False)
            except OSError:
                pass
        self.sock, self.sock_local = s, local

    def _send_all(self, freq_override=None):
        if not self.target or self.sock is None:
            return
        for idx, path, freq in self.subs:
            f = freq if freq_override is None else freq_override
            msg = struct.pack("<4sxii400s", b"RREF", f, idx, path.encode("ascii"))
            try:
                self.sock.sendto(msg, self.target)
            except OSError as e:
                self.status = "send failed: %s" % e
                return

    def stop(self):
        try:
            self._send_all(0)
        except Exception:
            pass

    def fresh(self):
        return time.time() - self.last_rx < 3.0

    def run(self):
        next_sub = 0.0
        while True:
            web_ok = WEB is not None and WEB.connected and (time.time() - WEB.last_rx < 5.0)
            if not CONFIG.get("useUdp") or web_ok:
                if self.target:
                    self._send_all(0)          # stop X-Plane sending UDP we don't need
                    self.target = None
                    self.last_rx = 0.0
                self.status = "off" if not CONFIG.get("useUdp") else "standby (Web API in use)"
                time.sleep(1)
                continue
            target = (xp_host(), int(CONFIG.get("udpPort") or 49000))
            if target != self.target:
                if self.target:
                    self._send_all(0)
                self._socket_for(target[0])
                self.target = target
                next_sub = 0.0
            now = time.time()
            if now >= next_sub and not self.fresh():
                self._send_all()
                next_sub = now + 4.0
                self.status = "requesting data from %s:%d" % target
            try:
                data, addr = self.sock.recvfrom(65535)
            except socket.timeout:
                continue
            except (ConnectionResetError, OSError):
                time.sleep(0.2)
                continue
            if data[:4] != b"RREF" or len(data) < 13:
                continue
            n = (len(data) - 5) // 8
            with self.lock:
                for i in range(n):
                    idx, val = struct.unpack_from("<if", data, 5 + 8 * i)
                    self.raw[idx] = val
            if not self.fresh():
                log("UDP: receiving data from X-Plane at %s:%d" % addr)
            self.last_rx = time.time()
            self.status = "receiving"

    def values(self):
        out = {}
        with self.lock:
            raw = dict(self.raw)
        for key, (kind, ids) in self.map.items():
            vals = [raw.get(i) for i in ids]
            if kind == "s":
                b = bytearray()
                for v in vals:
                    if v is None:
                        break
                    c = int(v)
                    if c <= 0:
                        break
                    b.append(c & 0xFF)
                out[key] = decode_text(b)
            elif kind == "sum":
                present = [v for v in vals if v is not None]
                out[key] = sum(present) if present else None
            elif kind == "list":
                out[key] = [v for v in vals if v is not None]
            else:
                out[key] = vals[0]
        return out


# ------------------------------------------------------------ Web API (WebSocket)
class MiniWebSocket:
    """Minimal RFC 6455 client (text frames, ping/pong, fragmentation) - stdlib only."""

    def __init__(self, host, port, path, timeout=5.0):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        req = ("GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n") % (path, host, port, key)
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("WebSocket handshake: connection closed")
            buf += chunk
            if len(buf) > 65536:
                raise ConnectionError("WebSocket handshake: header too long")
        head, self.buf = buf.split(b"\r\n\r\n", 1)
        status = head.split(b"\r\n", 1)[0]
        if b" 101" not in status:
            raise ConnectionError("WebSocket handshake refused: %s" % status.decode("latin-1"))

    def _read(self, n, frame_start=False):
        """Read exactly n bytes. A timeout may only escape at the start of a frame (nothing consumed)."""
        deadline = None
        while len(self.buf) < n:
            try:
                chunk = self.sock.recv(max(4096, n - len(self.buf)))
            except socket.timeout:
                if frame_start and not self.buf:
                    raise
                deadline = deadline or time.time() + 10.0
                if time.time() > deadline:
                    raise ConnectionError("WebSocket stalled mid-frame")
                continue
            if not chunk:
                raise ConnectionError("WebSocket closed by X-Plane")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _frame(self, opcode, payload):
        head = bytearray([0x80 | opcode])
        n = len(payload)
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head.append(0x80 | 126)
            head += struct.pack(">H", n)
        else:
            head.append(0x80 | 127)
            head += struct.pack(">Q", n)
        mask = os.urandom(4)
        head += mask
        body = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
        self.sock.sendall(bytes(head) + body)

    def send_text(self, text):
        self._frame(0x1, text.encode("utf-8"))

    def recv_text(self):
        parts = []
        while True:
            b1, b2 = self._read(2, frame_start=not parts)
            opcode, n = b1 & 0x0F, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            mask = self._read(4) if b2 & 0x80 else None
            data = self._read(n)
            if mask:
                data = bytes(b ^ mask[i & 3] for i, b in enumerate(data))
            if opcode == 0x9:
                self._frame(0xA, data)
                continue
            if opcode == 0xA:
                continue
            if opcode == 0x8:
                raise ConnectionError("WebSocket closed by X-Plane")
            parts.append(data)
            if b1 & 0x80:
                return b"".join(parts).decode("utf-8", "replace")

    def close(self):
        try:
            self._frame(0x8, b"")
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass


def http_json(url, timeout=3.0):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


class WebApiSource(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True, name="webapi")
        self.connected = False
        self.status = "idle"
        self.version = None
        self.api = None
        self.vals = {}
        self.by_id = {}           # id -> (key, kind, n)
        self.last_rx = 0.0
        self.lock = threading.Lock()
        self.ws = None

    def _resolve(self, base):
        names = sorted({p for (_k, p, _kind, _n, _f) in CATALOG})
        found = {}

        def ask(chunk):
            q = "&".join("filter%5Bname%5D=" + urllib.parse.quote(n, safe="") for n in chunk)
            res = http_json("%s/datarefs?%s" % (base, q))
            for d in res.get("data", []):
                found[d["name"]] = (d["id"], d.get("value_type"))

        for i in range(0, len(names), 25):
            chunk = names[i:i + 25]
            try:
                ask(chunk)
            except urllib.error.HTTPError:
                for n in chunk:              # one bad name must not hide the others
                    try:
                        ask([n])
                    except Exception:
                        dbg("dataref not available:", n)
        return found

    def _connect_once(self, port):
        base_root = "http://127.0.0.1:%d/api" % port
        caps = http_json(base_root + "/capabilities", timeout=2.0)
        versions = caps.get("api", {}).get("versions", []) or ["v1"]
        api = sorted(versions, key=lambda v: int("".join(c for c in v if c.isdigit()) or 0))[-1]
        self.version = caps.get("x-plane", {}).get("version")
        self.api = api
        base = "%s/%s" % (base_root, api)
        found = self._resolve(base)
        subs, by_id = [], {}
        for key, path, kind, n, _freq in CATALOG:
            if path not in found:
                continue
            did, vtype = found[path]
            entry = {"id": did}
            if kind == "a":
                entry["index"] = [n]
            elif kind in ("sum", "list"):
                entry["index"] = list(range(n))
            subs.append(entry)
            by_id[str(did)] = (key, kind, n, vtype)
        if not subs:
            raise ConnectionError("no datarefs found")
        ws = MiniWebSocket("127.0.0.1", port, "/api/" + api)
        ws.sock.settimeout(1.0)
        ws.send_text(json.dumps({"req_id": 1, "type": "dataref_subscribe_values",
                                 "params": {"datarefs": subs}}))
        self.by_id = by_id
        return ws, len(subs)

    def _apply(self, data):
        with self.lock:
            for sid, val in data.items():
                meta = self.by_id.get(str(sid))
                if not meta:
                    continue
                key, kind, n, vtype = meta
                if kind == "s" or vtype == "data":
                    try:
                        self.vals[key] = decode_text(base64.b64decode(val)) if isinstance(val, str) else decode_text(bytes(val))
                    except Exception:
                        self.vals[key] = ""
                elif kind == "sum":
                    self.vals[key] = sum(v for v in (val if isinstance(val, list) else [val]) if v is not None)
                elif kind == "list":
                    self.vals[key] = list(val) if isinstance(val, list) else [val]
                elif kind == "a":
                    self.vals[key] = val[0] if isinstance(val, list) and val else val
                else:
                    self.vals[key] = val[0] if isinstance(val, list) and val else val

    def run(self):
        announced = False
        while True:
            host = xp_host()
            if not CONFIG.get("useWebApi"):
                self.status, self.connected = "off", False
                time.sleep(1)
                continue
            if not is_local(host):
                self.status, self.connected = "X-Plane is on another PC (Web API is local-only)", False
                time.sleep(2)
                continue
            port = int(CONFIG.get("webApiPort") or 8086)
            try:
                ws, n = self._connect_once(port)
            except Exception as e:
                self.connected = False
                self.status = "not available (%s)" % (e.__class__.__name__ if not str(e) else str(e)[:80])
                announced = False
                time.sleep(3)
                continue
            self.ws = ws
            self.connected = True
            self.status = "connected (%s, %d datarefs)" % (self.api, n)
            if not announced:
                log("Web API: connected to X-Plane %s (%s, %d datarefs)" % (self.version or "", self.api, n))
                announced = True
            try:
                while CONFIG.get("useWebApi"):
                    try:
                        msg = ws.recv_text()
                    except socket.timeout:
                        continue
                    m = json.loads(msg)
                    t = m.get("type")
                    if t == "dataref_update_values":
                        self._apply(m.get("data", {}))
                        self.last_rx = time.time()
                    elif t == "result" and not m.get("success", True):
                        log("Web API error:", m.get("error_message") or m)
            except Exception as e:
                log("Web API: connection lost (%s)" % e)
            finally:
                ws.close()
                self.connected = False
                self.ws = None
                with self.lock:
                    self.vals = {}
                time.sleep(2)

    def values(self):
        with self.lock:
            return dict(self.vals)


# ------------------------------------------------------------------ state builder
FLAGS = ("airliner", "general_aviation", "helicopter", "glider", "military", "cargo",
         "experimental", "ultralight", "seaplane", "vtol", "sci_fi")


def _num(x, nd=None):
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return round(x, nd) if nd is not None else x


def _pick(a, b):
    """Prefer the X-Plane 12 dataref a, fall back to the older b."""
    if a is None:
        return b
    if a == 0 and b not in (None, 0):
        return b
    return a


def build_state(v, via, web, udp):
    ms_to_kt = 3600.0 / 1852.0
    ac = {
        "icao": v.get("icao") or "", "desc": v.get("desc") or "", "tail": v.get("tail") or "",
        "author": v.get("author") or "",
        "engines": int(v.get("engines") or 0), "engType": int(v["engType"]) if v.get("engType") is not None else -1,
        "mtow": _num(v.get("mtow"), 1), "oew": _num(v.get("oew"), 1), "maxFuel": _num(v.get("maxFuel"), 1),
        "vso": _num(v.get("vso"), 1), "vs": _num(v.get("vs"), 1), "vfe": _num(v.get("vfe"), 1),
        "vno": _num(v.get("vno"), 1), "vne": _num(v.get("vne"), 1), "mmo": _num(v.get("mmo"), 3),
        "vle": _num(v.get("vle"), 1), "vmca": _num(v.get("vmca"), 1), "vyse": _num(v.get("vyse"), 1),
        "gearRetract": bool(v.get("gearRetract")), "flapDetents": int(v.get("flapDetents") or 0),
        "flags": {n: bool(v.get("flag_" + n)) for n in FLAGS},
    }
    hdg_t, hdg_m = _num(v.get("hdgT")), _num(v.get("hdgM"))
    magvar = None
    if hdg_t is not None and hdg_m is not None:
        magvar = ((hdg_t - hdg_m + 540.0) % 360.0) - 180.0
    wind_dir_t, wind_kt = _num(v.get("windDirT")), None
    if v.get("windMs") is not None and wind_dir_t is not None:
        wind_kt = float(v["windMs"]) * ms_to_kt
    elif v.get("windKt2") is not None:
        wind_kt = _num(v.get("windKt2"))
        wdm = _num(v.get("windDirM2"))
        wind_dir_t = (wdm + (magvar or 0.0)) % 360.0 if wdm is not None else None
    qnh = None
    if (v.get("qnhPa") or 0) > 80000:
        qnh = float(v["qnhPa"]) / 100.0
    elif (v.get("qnhInHg") or 0) > 25:
        qnh = float(v["qnhInHg"]) * 33.8638866667
    baro = float(v["baroInHg"]) * 33.8638866667 if (v.get("baroInHg") or 0) > 25 else None
    elev = _num(v.get("elevM"))
    agl = _num(v.get("aglM"))
    f = {
        "lat": _num(v.get("lat"), 6), "lon": _num(v.get("lon"), 6),
        "altMsl": round(elev / 0.3048, 1) if elev is not None else None,
        "agl": round(agl / 0.3048, 1) if agl is not None else None,
        "altInd": _num(v.get("altInd"), 1), "pa": _num(v.get("pa"), 1),
        "ias": _num(v.get("ias"), 2), "cas": _num(v.get("cas"), 2),
        "tas": round(float(v["tasMs"]) * ms_to_kt, 2) if v.get("tasMs") is not None else None,
        "gs": round(float(v["gsMs"]) * ms_to_kt, 2) if v.get("gsMs") is not None else None,
        "mach": _num(v.get("mach"), 4), "vs": _num(v.get("vsFpm"), 1),
        "hdgT": _num(hdg_t, 2), "hdgM": _num(hdg_m, 2), "trkT": _num(v.get("trkT"), 2), "magVar": _num(magvar, 2),
        "pitch": _num(v.get("pitch"), 2), "roll": _num(v.get("roll"), 2), "aoa": _num(v.get("aoa"), 2),
        "oat": _num(_pick(v.get("oat"), v.get("oat2")), 2), "tat": _num(_pick(v.get("tat"), v.get("tat2")), 2),
        "qnh": _num(qnh, 2), "baro": _num(baro, 2),
        "pStatic": round(float(v["pStaticPa"]) / 100.0, 2) if (v.get("pStaticPa") or 0) > 0 else None,
        "windDirT": _num(wind_dir_t, 1), "windKt": _num(wind_kt, 1), "rho": _num(v.get("rho"), 5),
        "altTempErr": _num(v.get("altTempErr"), 1), "visSm": _num(v.get("visSm"), 2),
        "rwyFriction": _num(v.get("rwyFriction"), 0),
        "mass": _num(v.get("mass"), 1), "fuel": _num(v.get("fuel"), 1), "payload": _num(v.get("payload"), 1),
        "ff": round(float(v["ffKgs"]) * 3600.0, 1) if v.get("ffKgs") is not None else None,
        "n1": [round(float(x), 1) for x in (v.get("n1") or [])][: max(1, int(v.get("engines") or 1))],
        "flapReq": _num(v.get("flapReq"), 3), "flapDep": _num(v.get("flapDep"), 3),
        "gearDown": bool(v.get("gearDown")) if v.get("gearDown") is not None else None,
        "onGround": bool(v.get("onGround")) if v.get("onGround") is not None else None,
        "paused": bool(v.get("paused")), "zulu": _num(v.get("zulu"), 1),
        "gpsDist": _num(v.get("gpsDist"), 2), "gpsBrgM": _num(v.get("gpsBrgM"), 1),
        "todDist": _num(v.get("todDist"), 2), "landingAlt": _num(v.get("landingAlt"), 0),
    }
    build = int(v.get("xpBuild") or 0)
    version = (web.version if via == "Web API" and web.version else None)
    if not version and build:
        version = "build %d" % build
    b = BEACON.recent()
    conn = {
        "connected": via is not None, "via": via, "host": xp_host(), "version": version,
        "webapi": web.status, "udp": udp.status, "beacon": BEACON.status,
        "discovered": ({"ip": b["ip"], "name": b["name"], "build": b["version"]} if b else None),
    }
    return {"t": round(time.time(), 2), "app": VERSION, "xp": conn, "ac": ac if via else None, "f": f if via else None}


class Hub:
    """Chooses the live source (Web API preferred) and builds snapshots."""

    def __init__(self, web, udp):
        self.web, self.udp = web, udp
        self.last_ac = None

    def snapshot(self):
        if self.web.connected and self.web.values():
            vals, via = self.web.values(), "Web API"
        elif self.udp.fresh():
            vals, via = self.udp.values(), "UDP"
        else:
            vals, via = {}, None
        st = build_state(vals, via, self.web, self.udp)
        ac = st.get("ac")
        if ac:
            sig = (ac["icao"], ac["desc"], ac["tail"])
            if sig != self.last_ac and (ac["icao"] or ac["desc"]):
                log("Aircraft: %s  %s  %s" % (ac["icao"] or "????", ac["desc"], ("(" + ac["tail"] + ")") if ac["tail"] else ""))
                self.last_ac = sig
        return st


# --------------------------------------------------------------------- apt.dat
def _parse_vdf_paths(text):
    out = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('"path"'):
            parts = line.split('"')
            if len(parts) >= 4:
                out.append(parts[3].replace("\\\\", "\\"))
    return out


def find_xp_roots():
    """Best-effort search for X-Plane 12 installs (installer breadcrumbs, Steam libraries, common paths)."""
    cands = []
    for base in (os.environ.get("LOCALAPPDATA"), os.path.expanduser("~/Library/Preferences"), os.path.expanduser("~/.x-plane")):
        if base:
            f = os.path.join(base, "x-plane_install_12.txt")
            try:
                with open(f, "r", encoding="utf-8", errors="replace") as fh:
                    cands += [l.strip() for l in fh if l.strip()]
            except OSError:
                pass
    steam_roots = [r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam",
                   os.path.expanduser("~/.steam/steam"), os.path.expanduser("~/.local/share/Steam"),
                   os.path.expanduser("~/.var/app/com.valvesoftware.Steam/.local/share/Steam"),   # Flatpak Steam
                   os.path.expanduser("~/Library/Application Support/Steam")]
    libs = []
    for sr in steam_roots:
        vdf = os.path.join(sr, "steamapps", "libraryfolders.vdf")
        try:
            with open(vdf, "r", encoding="utf-8", errors="replace") as fh:
                libs += _parse_vdf_paths(fh.read())
        except OSError:
            pass
        libs.append(sr)
    if os.name == "nt":
        for d in "CDEFGH":
            libs += ["%s:\\SteamLibrary" % d, "%s:\\Steam" % d, "%s:\\Program Files (x86)\\Steam" % d]
            cands += ["%s:\\X-Plane 12" % d]
    for lib in libs:
        cands.append(os.path.join(lib, "steamapps", "common", "X-Plane 12"))
    seen, roots = set(), []
    for c in cands:
        c = os.path.normpath(c.strip().strip('"'))
        if c in seen:
            continue
        seen.add(c)
        if os.path.isdir(os.path.join(c, "Resources")) and os.path.isdir(os.path.join(c, "Global Scenery")):
            roots.append(c)
    return roots


class AptDB:
    """Runway lookup from X-Plane's own apt.dat (indexed in the background on first use)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.root = None
        self.files = []
        self.index = {}       # ICAO -> (file, offset)
        self.coords = []      # (lat, lon, icao, name)
        self.state = "not configured"
        self.thread = None

    def configure(self, root):
        root = (root or "").strip()
        if not root:
            found = find_xp_roots()
            root = found[0] if found else ""
        files = []
        if root:
            for rel in (("Custom Scenery", "Global Airports"), ("Global Scenery", "Global Airports"),
                        ("Resources", "default scenery", "default apt dat")):
                f = os.path.join(root, *rel, "Earth nav data", "apt.dat")
                if os.path.isfile(f):
                    files.append(f)
        with self.lock:
            if root == self.root and files == self.files and self.state != "not configured":
                return
            self.root, self.files = root, files
            self.index, self.coords = {}, []
            self.state = "ready to index" if files else ("apt.dat not found under %s" % root if root else "X-Plane folder not found")
            self.thread = None
        if files:
            log("Airport data: %s" % files[0])

    def _ensure(self):
        with self.lock:
            if self.thread or not self.files or self.state == "ready":
                return
            self.state = "indexing"
            self.thread = threading.Thread(target=self._build, daemon=True, name="aptdat")
            self.thread.start()

    def _build(self):
        t0 = time.time()
        index, coords = {}, []
        for path in self.files:
            try:
                with open(path, "rb") as fh:
                    cur, code, cur_name, have_xy, off = None, None, "", False, 0
                    for line in fh:
                        pos = off
                        off += len(line)
                        c = line[:5]
                        if c.startswith((b"1 ", b"16 ", b"17 ")):
                            parts = line.split(None, 5)
                            if len(parts) >= 5:
                                cur = code = parts[4].decode("latin-1").upper()
                                cur_name = parts[5].decode("latin-1", "replace").strip() if len(parts) > 5 else ""
                                have_xy = False
                                if cur not in index:
                                    index[cur] = (path, pos)
                        elif cur and c.startswith(b"1302 "):
                            p = line.split()
                            if len(p) >= 3 and p[1] == b"icao_code":
                                code = p[2].decode("latin-1").upper()
                                if code != cur and code not in index:
                                    index[code] = index.get(cur)
                        elif cur and not have_xy and c.startswith(b"100 "):
                            p = line.split()
                            if len(p) >= 11:
                                try:
                                    coords.append((float(p[9]), float(p[10]), code or cur, cur_name))
                                    have_xy = True
                                except ValueError:
                                    pass
            except OSError as e:
                log("apt.dat read error:", e)
        with self.lock:
            self.index, self.coords = index, coords
            self.state = "ready"
        log("Airport data indexed: %d airports in %.1f s" % (len(index), time.time() - t0))

    def status(self):
        with self.lock:
            return {"state": self.state, "root": self.root, "airports": len(self.index)}

    def lookup(self, icao):
        self._ensure()
        icao = (icao or "").strip().upper()
        with self.lock:
            state, loc = self.state, self.index.get(icao)
        if state != "ready":
            return {"ok": False, "state": state}
        if not loc:
            return {"ok": False, "state": "ready", "error": "Airport %s not found in apt.dat" % icao}
        path, off = loc
        rows, name, elev = [], "", None
        with open(path, "rb") as fh:
            fh.seek(off)
            first = True
            for line in fh:
                if not first and line[:5].startswith((b"1 ", b"16 ", b"17 ", b"99")):
                    break
                if first:
                    p = line.split(None, 5)
                    elev = float(p[1])
                    name = p[5].decode("latin-1", "replace").strip() if len(p) > 5 else ""
                    first = False
                elif line.startswith(b"100 "):
                    rows.append(line.split())
        runways = []
        for p in rows:
            try:
                width, surface = float(p[1]), int(float(p[2]))
                ends = [(p[8].decode(), float(p[9]), float(p[10]), float(p[11])),
                        (p[17].decode(), float(p[18]), float(p[19]), float(p[20]))]
            except (IndexError, ValueError):
                continue
            length = _gc_m(ends[0][1], ends[0][2], ends[1][1], ends[1][2])
            for a, b in ((0, 1), (1, 0)):
                ident, lat, lon, disp = ends[a]
                other = ends[b]
                runways.append({
                    "id": ident, "lat": lat, "lon": lon, "widthM": width, "surface": surface,
                    "hdgTrue": round(_brg(lat, lon, other[1], other[2]), 1),
                    "lengthM": round(length), "toraM": round(length), "displacedM": round(disp),
                    "ldaM": round(length - disp),
                })
        return {"ok": True, "icao": icao, "name": name, "elevFt": elev, "runways": runways}

    def nearest(self, lat, lon, n=6):
        self._ensure()
        with self.lock:
            state, coords = self.state, self.coords
        if state != "ready":
            return {"ok": False, "state": state}
        cl = math.cos(math.radians(lat))
        best = sorted(coords, key=lambda c: (c[0] - lat) ** 2 + ((c[1] - lon) * cl) ** 2)[:n]
        return {"ok": True, "airports": [{"icao": c[2], "name": c[3], "distNm": round(_gc_m(lat, lon, c[0], c[1]) / 1852.0, 1)} for c in best]}


def _gc_m(la1, lo1, la2, lo2):
    p1, p2, dl = math.radians(la1), math.radians(la2), math.radians(lo2 - lo1)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371008.8 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _brg(la1, lo1, la2, lo2):
    p1, p2, dl = math.radians(la1), math.radians(la2), math.radians(lo2 - lo1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


APT = AptDB()


# --------------------------------------------------------------------- web server
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
        ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8"}


def load_user_profiles():
    try:
        with open(PROFILES_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else data.get("profiles", [])
    except FileNotFoundError:
        return []
    except Exception as e:
        log("user_profiles.json:", e)
        return []


# ---------------------------------------------------- phones & tablets on the LAN
FW_RULE = "XP Flight Computer"          # Windows Firewall rule name (display name)
CREATE_NO_WINDOW = 0x08000000


def _usable_ipv4(ip):
    try:
        a = ipaddress.IPv4Address(ip)
    except (ValueError, TypeError):
        return False
    return not (a.is_loopback or a.is_link_local or a.is_unspecified or a.is_multicast)


def _ip_rank(ip):
    """Home-network addresses first: 192.168.x, then 10.x, then 172.16-31.x, then anything else."""
    if ip.startswith("192.168."):
        return (0, ip)
    if ip.startswith("10."):
        return (1, ip)
    try:
        return (2 if ipaddress.IPv4Address(ip).is_private else 3, ip)
    except ValueError:
        return (4, ip)


def _linux_ipv4():
    out = []
    try:
        import fcntl
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            for _i, name in socket.if_nameindex():
                try:
                    res = fcntl.ioctl(s.fileno(), 0x8915, struct.pack("256s", name[:15].encode()))  # SIOCGIFADDR
                    out.append(socket.inet_ntoa(res[20:24]))
                except OSError:
                    pass
        finally:
            s.close()
    except Exception:
        pass
    return out


def local_ipv4():
    """(primary, all) IPv4 addresses of this PC a phone could use; primary = the default-route interface."""
    primary = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("192.0.2.1", 9))          # no packet is sent: the OS only picks the outgoing interface
            primary = s.getsockname()[0]
        finally:
            s.close()
    except OSError:
        pass
    ips = {primary} if primary else set()
    try:
        ips.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    if sys.platform.startswith("linux"):
        ips.update(_linux_ipv4())
    good = sorted((ip for ip in ips if ip and _usable_ipv4(ip)), key=_ip_rank)
    if primary not in good:
        primary = good[0] if good else None
    return primary, ([primary] if primary else []) + [ip for ip in good if ip != primary]


def device_name(ua):
    u = (ua or "").lower()
    if "iphone" in u:
        return "iPhone"
    if "ipad" in u:
        return "iPad"
    if "android" in u:
        return "Android phone" if "mobile" in u else "Android tablet"
    if "macintosh" in u:
        return "Mac or iPad"
    if "windows" in u:
        return "Windows PC"
    if "cros" in u:
        return "Chromebook"
    if "linux" in u:
        return "Linux PC"
    return "Browser"


def os_name():
    if os.name == "nt":
        return "windows"
    if sys.platform == "darwin":
        return "mac"
    return "linux"


# ----- Windows Firewall: read-only checks, and an elevated fix the user starts from Settings
def _powershell():
    root = os.environ.get("SystemRoot") or r"C:\Windows"
    p = os.path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    return p if os.path.isfile(p) else "powershell.exe"


def _ps_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def run_powershell(script, timeout=60):
    """Run a PowerShell script without a console window. Returns (exit code, stdout)."""
    enc = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    r = subprocess.run([_powershell(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
                       stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       timeout=timeout, creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)
    return r.returncode, r.stdout.decode("utf-8", "replace").lstrip("\ufeff").strip()


def process_paths():
    """Program paths Windows Firewall may know this app by: python.exe as started, the real image, or the .exe."""
    paths = {os.path.abspath(sys.executable)}
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes
            k32 = ctypes.windll.kernel32
            k32.GetCurrentProcess.restype = wintypes.HANDLE
            k32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR,
                                                        ctypes.POINTER(wintypes.DWORD)]
            buf = ctypes.create_unicode_buffer(32768)
            size = wintypes.DWORD(len(buf))
            if k32.QueryFullProcessImageNameW(k32.GetCurrentProcess(), 0, buf, ctypes.byref(size)):
                paths.add(buf.value)
        except Exception:
            pass
    seen, out = set(), []
    for p in sorted(paths):
        if p.lower() not in seen:
            seen.add(p.lower())
            out.append(p)
    return out


def _ps_list(items):
    return "@(" + ", ".join(_ps_str(i) for i in items) + ")"


WIN_CHECK_PS = r"""
$res = @{ ok = $true }
$res.profiles = @(Get-NetConnectionProfile | ForEach-Object { @{ alias = [string]$_.InterfaceAlias; name = [string]$_.Name; category = [string]$_.NetworkCategory } })
$res.fwOn = @(Get-NetFirewallProfile | Where-Object { [string]$_.Enabled -eq 'True' } | ForEach-Object { [string]$_.Name })
$res.ours = @()
foreach ($r in @(Get-NetFirewallRule -DisplayName 'XP Flight Computer')) {
  if ([string]$r.Enabled -ne 'True') { continue }
  $af = $r | Get-NetFirewallApplicationFilter
  $pf = $r | Get-NetFirewallPortFilter
  $res.ours += @{ program = [string]$af.Program; port = [string]$pf.LocalPort; protocol = [string]$pf.Protocol; profile = [string]$r.Profile }
}
$res.app = @()
foreach ($f in @(Get-NetFirewallApplicationFilter)) {
  $p = ([Environment]::ExpandEnvironmentVariables([string]$f.Program)).ToLower()
  if ($progs -notcontains $p) { continue }
  $r = Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $f
  if (-not $r) { continue }
  if ([string]$r.Enabled -ne 'True' -or [string]$r.Direction -ne 'Inbound' -or [string]$r.DisplayName -eq 'XP Flight Computer') { continue }
  $pf = $r | Get-NetFirewallPortFilter
  $res.app += @{ name = [string]$r.DisplayName; action = [string]$r.Action; profile = [string]$r.Profile; protocol = [string]$pf.Protocol; port = [string]$pf.LocalPort }
}
$res.thirdParty = @(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName FirewallProduct | ForEach-Object { [string]$_.displayName })
$res | ConvertTo-Json -Compress -Depth 5
"""

WIN_FIX_PS = r"""
try {
  Remove-NetFirewallRule -DisplayName 'XP Flight Computer' -ErrorAction SilentlyContinue
  foreach ($p in $create) {
    New-NetFirewallRule -DisplayName 'XP Flight Computer' -Description 'Lets phones and tablets on your local network open XP Flight Computer.' -Direction Inbound -Action Allow -Program $p -Protocol TCP -LocalPort $port -RemoteAddress LocalSubnet -Profile Any | Out-Null
  }
  $n = 0
  foreach ($f in @(Get-NetFirewallApplicationFilter)) {
    $p = ([Environment]::ExpandEnvironmentVariables([string]$f.Program)).ToLower()
    if ($progs -notcontains $p) { continue }
    $r = Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $f
    if ($r -and [string]$r.Direction -eq 'Inbound' -and [string]$r.Action -eq 'Block' -and [string]$r.Enabled -eq 'True') {
      Disable-NetFirewallRule -Name $r.Name
      $n++
    }
  }
  Set-Content -LiteralPath $out -Value ('ok ' + $n) -Encoding UTF8
  exit 0
} catch {
  Set-Content -LiteralPath $out -Value ('error ' + $_.Exception.Message) -Encoding UTF8
  exit 2
}
"""


def _as_list(x):
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def _fw_verdict(raw, port, paths):
    """Decide whether Windows Firewall lets a phone reach TCP `port` on each active network."""
    cat_map = {"DomainAuthenticated": "Domain", "Private": "Private", "Public": "Public"}
    profiles = _as_list(raw.get("profiles"))
    fw_on = set(_as_list(raw.get("fwOn")))
    progs = {p.lower() for p in paths}

    def covers(profile, cat):
        p = (profile or "Any").replace(" ", "")
        return p in ("Any", "") or cat in p.split(",")

    def port_ok(spec):
        spec = (spec or "Any").strip()
        if spec in ("Any", ""):
            return True
        for part in re.split(r"[,\s]+", spec):
            if "-" in part:
                a, _, b = part.partition("-")
                if a.isdigit() and b.isdigit() and int(a) <= port <= int(b):
                    return True
            elif part == str(port):
                return True
        return False

    def tcp(proto):
        return (proto or "Any") in ("Any", "TCP", "6")

    nets, worst = [], "allowed"
    rank = {"allowed": 0, "off": 0, "ask": 1, "blocked": 2}
    for pr in profiles:
        cat = cat_map.get(pr.get("category"), pr.get("category") or "Public")
        if cat not in fw_on:
            v = "off"
        else:
            app = [r for r in _as_list(raw.get("app")) if covers(r.get("profile"), cat) and port_ok(r.get("port")) and tcp(r.get("protocol"))]
            ours = [o for o in _as_list(raw.get("ours")) if covers(o.get("profile"), cat) and port_ok(o.get("port")) and tcp(o.get("protocol"))
                    and ((o.get("program") or "Any") == "Any" or (o.get("program") or "").lower() in progs)]
            if any(r.get("action") == "Block" for r in app):
                v = "blocked"
            elif ours or any(r.get("action") == "Allow" for r in app):
                v = "allowed"
            else:
                v = "ask"
        nets.append({"name": pr.get("name") or pr.get("alias") or "network", "alias": pr.get("alias"),
                     "category": pr.get("category"), "verdict": v})
        if rank[v] > rank[worst]:
            worst = v
    return {"verdict": worst if nets else "unknown", "networks": nets,
            "blockRules": sum(1 for r in _as_list(raw.get("app")) if r.get("action") == "Block"),
            "ourRule": bool(_as_list(raw.get("ours"))), "thirdParty": [t for t in _as_list(raw.get("thirdParty")) if t]}


def firewall_checks(port):
    kind = os_name()
    out = {"kind": kind}
    if kind == "windows":
        paths = process_paths()
        pre = ("$ErrorActionPreference = 'SilentlyContinue'\n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n"
               "$progs = %s\n" % _ps_list([p.lower() for p in paths]))
        try:
            code, text = run_powershell(pre + WIN_CHECK_PS, timeout=60)
            raw = json.loads(text[text.find("{"):]) if "{" in text else None
        except (OSError, ValueError, subprocess.TimeoutExpired) as e:
            raw, code = None, str(e)
        if not isinstance(raw, dict):
            out["error"] = "Could not read the Windows Firewall settings (%s)." % code
            return out
        out.update(_fw_verdict(raw, port, paths))
        out["programs"] = paths
    elif kind == "linux":
        for svc in ("ufw", "firewalld"):
            state = None
            if shutil.which("systemctl"):
                try:
                    r = subprocess.run(["systemctl", "is-active", svc], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5)
                    state = r.stdout.decode("utf-8", "replace").strip() or None
                except (OSError, subprocess.TimeoutExpired):
                    pass
            out[svc] = state
    else:
        try:
            r = subprocess.run(["/usr/libexec/ApplicationFirewall/socketfilterfw", "--getglobalstate"],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5)
            out["macFirewall"] = "enabled" if b"enabled" in r.stdout.lower() else "disabled"
        except (OSError, subprocess.TimeoutExpired):
            out["macFirewall"] = None
    return out


def firewall_fix(port):
    """Windows: add an allow rule for this app on `port` (local subnet only) and switch off Windows' block
    rules for this Python. Runs elevated, so Windows shows its permission prompt. Returns (state, message)."""
    paths = process_paths()
    d = tempfile.mkdtemp(prefix="xpfc-")
    script, result = os.path.join(d, "allow_phones.ps1"), os.path.join(d, "result.txt")
    try:
        head = ("$ErrorActionPreference = 'Stop'\n$create = %s\n$progs = %s\n$port = %d\n$out = %s\n"
                % (_ps_list(paths), _ps_list([p.lower() for p in paths]), int(port), _ps_str(result)))
        with open(script, "w", encoding="utf-8-sig") as fh:      # BOM: Windows PowerShell reads it as UTF-8
            fh.write(head + WIN_FIX_PS)
        args = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%s"' % script
        outer = ("try {\n  $p = Start-Process -FilePath %s -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList %s\n"
                 "  exit $p.ExitCode\n} catch { exit 1223 }\n") % (_ps_str(_powershell()), _ps_str(args))
        code, _ = run_powershell(outer, timeout=600)
        text = ""
        try:
            with open(result, "r", encoding="utf-8-sig") as fh:
                text = fh.read().strip()
        except OSError:
            pass
        if text.startswith("ok"):
            n = text.split()[1] if len(text.split()) > 1 else "0"
            return "done", ("Firewall rule added for port %d." % port) + (
                " Also switched off %s Windows rule(s) that were blocking Python." % n if n not in ("0", "") else "")
        if code == 1223:
            return "cancelled", "The Windows permission prompt was cancelled, so nothing was changed."
        if text.startswith("error"):
            return "failed", "Windows refused the change: " + text[6:]
        return "failed", "The firewall change did not run (exit code %s)." % code
    except subprocess.TimeoutExpired:
        return "failed", "Timed out waiting for the Windows permission prompt."
    except OSError as e:
        return "failed", "Could not start PowerShell: %s" % e
    finally:
        shutil.rmtree(d, ignore_errors=True)


class LanAccess:
    """Lets phones and tablets open the app. The main server always listens on 127.0.0.1 only; when this
    is switched on, extra listeners open on each of this PC's network addresses (same port). They can be
    switched on and off while the app runs, and follow address changes (Wi-Fi reconnects, DHCP)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.port = 8765
        self.enabled = False
        self.servers = {}            # ip -> server
        self.errors = {}             # ip -> bind error
        self.primary, self.ips = None, []
        self.clients = {}            # ip -> {"device", "seen"}
        self.checks = None
        self.checking = False
        self.fix = {"state": "idle", "message": ""}
        self.watcher = None
        self._names = set()

    def start(self, port, enabled):
        self.port = port
        self.set(enabled, save=False)

    def names(self):
        """Host names a phone may use for this PC (Host-header check)."""
        return self._names

    def own_ips(self):
        with self.lock:
            return set(self.ips)

    def set(self, on, save=True):
        with self.lock:
            changed = self.enabled != bool(on)
            self.enabled = bool(on)
        if save:
            CONFIG.update({"lan": bool(on)})
        self.refresh()
        if on:
            if self.watcher is None:
                self.watcher = threading.Thread(target=self._watch, daemon=True, name="lan-watch")
                self.watcher.start()
            if changed or self.checks is None:
                self.recheck()
        elif changed:
            log("Phones & tablets: switched off (only this PC can open the app).")

    def refresh(self):
        primary, ips = local_ipv4()
        hn = socket.gethostname().lower()
        self._names = {hn, hn + ".local", hn + ".lan", hn + ".home", socket.getfqdn().lower()}
        with self.lock:
            self.primary, self.ips = primary, ips
            want = set(ips) if self.enabled else set()
            stop = [(ip, s) for ip, s in self.servers.items() if ip not in want]
            for ip, _s in stop:
                del self.servers[ip]
            todo = [ip for ip in ips if ip in want and ip not in self.servers]
            self.errors = {k: v for k, v in self.errors.items() if self.enabled and k in ips}
        for _ip, s in stop:
            threading.Thread(target=_close_server, args=(s,), daemon=True).start()
        for ip in todo:
            try:
                s = ThreadingHTTPServer((ip, self.port), LanHandler)
            except OSError as e:
                with self.lock:
                    self.errors[ip] = str(e)
                log("Phones & tablets: cannot listen on %s:%d (%s)" % (ip, self.port, e))
                continue
            s.daemon_threads = True
            threading.Thread(target=s.serve_forever, kwargs={"poll_interval": 0.5}, daemon=True, name="lan-" + ip).start()
            with self.lock:
                self.servers[ip] = s
                self.errors.pop(ip, None)
            log(("Phones & tablets on your Wi-Fi can open:  http://%s:%d/" if ip == primary
                 else "   (other address on this PC:  http://%s:%d/)") % (ip, self.port))

    def _watch(self):
        while True:
            time.sleep(15)
            if self.enabled:
                try:
                    self.refresh()
                except Exception as e:
                    dbg("lan refresh:", e)
            with self.lock:
                now = time.time()
                self.clients = {k: v for k, v in self.clients.items() if now - v["seen"] < 3600}

    def seen(self, ip, ua):
        with self.lock:
            new = ip not in self.clients or time.time() - self.clients[ip]["seen"] > 600
            self.clients[ip] = {"device": device_name(ua), "seen": time.time()}
        if new:
            log("Phone/tablet connected: %s at %s" % (device_name(ua), ip))

    def recheck(self):
        with self.lock:
            if self.checking:
                return
            self.checking = True
        threading.Thread(target=self._check, daemon=True, name="lan-check").start()

    def _check(self):
        try:
            res = firewall_checks(self.port)
        except Exception as e:
            res = {"kind": os_name(), "error": "Check failed: %s" % e}
        res["t"] = time.time()
        with self.lock:
            self.checks, self.checking = res, False
        if res.get("verdict") == "blocked":
            log("Phones & tablets: Windows Firewall is blocking Python. Fix it in the app: Settings > Phone & tablet.")

    def start_fix(self):
        if os_name() != "windows":
            return False, "Only needed on Windows."
        with self.lock:
            if self.fix.get("state") == "running":
                return True, ""
            self.fix = {"state": "running", "message": "Waiting for you to approve the Windows permission prompt…", "t": time.time()}
        threading.Thread(target=self._fix, daemon=True, name="lan-fix").start()
        return True, ""

    def _fix(self):
        state, msg = firewall_fix(self.port)
        with self.lock:
            self.fix = {"state": state, "message": msg, "t": time.time()}
        log("Firewall: " + msg)
        self.recheck()

    def status(self, remote=False):
        now = time.time()
        with self.lock:
            st = {"enabled": self.enabled, "port": self.port, "primary": self.primary, "ips": list(self.ips),
                  "listening": [ip for ip in self.ips if ip in self.servers], "errors": dict(self.errors),
                  "clients": sorted(({"ip": ip, "device": c["device"], "ago": round(now - c["seen"])}
                                     for ip, c in self.clients.items() if now - c["seen"] < 3600), key=lambda c: c["ago"]),
                  "checks": self.checks, "checking": self.checking, "fix": dict(self.fix),
                  "os": os_name(), "remote": bool(remote), "hostname": socket.gethostname()}
        st["urls"] = ["http://%s:%d/" % (ip, self.port) for ip in st["ips"]]
        return st


def _close_server(s):
    try:
        s.shutdown()
        s.server_close()
    except Exception:
        pass


LAN = LanAccess()


# ------------------------------------------------------------------ request handler
class Handler(BaseHTTPRequestHandler):
    server_version = "XPFlightComputer/" + VERSION
    hub = None
    is_lan = False        # True on the listeners that phones and tablets use

    def log_message(self, fmt, *args):
        if DEBUG:
            log("http:", fmt % args)

    def _host_ok(self):
        """Blocks DNS-rebinding: the Host header must be this PC by address (or its own name)."""
        host = (self.headers.get("Host") or "").strip().lower()
        if host.startswith("["):
            host = host[1:].split("]", 1)[0]
        elif host.count(":") == 1:
            host = host.rsplit(":", 1)[0]
        if host in ("127.0.0.1", "localhost", "::1", ""):
            return True
        return self.is_lan and (_usable_ipv4(host) or host in LAN.names())

    def _client_local(self):
        ip = self.client_address[0]
        return ip.startswith("127.") or ip == "::1" or ip in LAN.own_ips()

    def _send(self, code, body, ctype="application/json; charset=utf-8", cache=False):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "max-age=86400" if cache else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, separators=(",", ":")))

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self._host_ok():
            return self._send(403, '{"error":"forbidden host"}')
        local = self._client_local()
        if self.is_lan and not local:
            LAN.seen(self.client_address[0], self.headers.get("User-Agent"))
        url = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(url.query)
        path = url.path
        try:
            if path == "/api/state":
                return self._json(self.hub.snapshot())
            if path == "/api/stream":
                return self._stream()
            if path == "/api/config":
                cfg = CONFIG.public()
                if not local:                      # other devices don't need this PC's folders
                    cfg.pop("xpRoot", None)
                return self._json({"config": cfg, "airports": APT.status() if local else {"state": APT.status()["state"]},
                                   "xpRoots": find_xp_roots() if local else [], "lan": LAN.enabled,
                                   "remote": not local, "version": VERSION})
            if path == "/api/lan":
                return self._json(LAN.status(remote=not local))
            if path == "/api/profiles":
                return self._json(load_user_profiles())
            if path == "/api/airport":
                return self._json(APT.lookup(q.get("icao", [""])[0]))
            if path == "/api/nearest":
                return self._json(APT.nearest(float(q["lat"][0]), float(q["lon"][0])))
        except (KeyError, ValueError) as e:
            return self._json({"ok": False, "error": "bad request: %s" % e}, 400)
        return self._static(path)

    def do_POST(self):
        if not self._host_ok():
            return self._send(403, '{"error":"forbidden host"}')
        if not self._client_local():
            return self._json({"ok": False, "error": "Change settings on the PC that runs XP Flight Computer."}, 403)
        if (self.headers.get("Content-Type") or "").split(";")[0].strip() != "application/json":
            return self._json({"ok": False, "error": "JSON required"}, 415)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(min(n, 65536)).decode("utf-8") or "{}")
        except ValueError:
            return self._json({"ok": False, "error": "invalid JSON"}, 400)
        if not isinstance(body, dict):
            return self._json({"ok": False, "error": "JSON object required"}, 400)
        path = urllib.parse.urlsplit(self.path).path
        if path == "/api/config":
            try:
                cfg = CONFIG.update({k: v for k, v in body.items() if k != "lan"})
            except (ValueError, TypeError) as e:
                return self._json({"ok": False, "error": str(e)}, 400)
            if "xpRoot" in body:
                APT.configure(cfg.get("xpRoot"))
            return self._json({"ok": True, "config": cfg, "airports": APT.status()})
        if path == "/api/lan":
            LAN.set(bool(body.get("enabled")))
            return self._json({"ok": True, "lan": LAN.status()})
        if path == "/api/lan/recheck":
            LAN.recheck()
            return self._json({"ok": True, "lan": LAN.status()})
        if path == "/api/lan/fix":
            ok, err = LAN.start_fix()
            return self._json({"ok": ok, "error": err, "lan": LAN.status()}, 200 if ok else 400)
        return self._json({"ok": False, "error": "not found"}, 404)

    def _stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.close_connection = True          # the stream ends by closing the connection
        try:
            self.wfile.write(b"retry: 2000\n\n")
            while not (self.is_lan and not LAN.enabled):      # phones are cut off when sharing is switched off
                data = json.dumps(self.hub.snapshot(), separators=(",", ":"))
                self.wfile.write(("data: %s\n\n" % data).encode("utf-8"))
                self.wfile.flush()
                time.sleep(0.2)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            return

    def _static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        rel = urllib.parse.unquote(path).lstrip("/").replace("\\", "/")
        full = os.path.normpath(os.path.join(WEB_ROOT, rel))
        if not full.startswith(os.path.normpath(WEB_ROOT) + os.sep) or not os.path.isfile(full):
            return self._send(404, "Not found", "text/plain; charset=utf-8")
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as fh:
            body = fh.read()
        self._send(200, body, MIME.get(ext, "application/octet-stream"), cache=ext in (".woff2", ".woff", ".ttf"))


class LanHandler(Handler):
    is_lan = True


def main():
    global DEBUG
    ap = argparse.ArgumentParser(description=APP + " - X-Plane 12 bridge and web app")
    ap.add_argument("--port", type=int, default=8765, help="web app port (default 8765)")
    ap.add_argument("--lan", action="store_true", help="let phones/tablets on your network open the app (same as the switch in Settings)")
    ap.add_argument("--xp-host", help="IP of the PC running X-Plane (default: auto)")
    ap.add_argument("--discover", action="store_true", help="listen for X-Plane's network beacon to find it on another PC")
    ap.add_argument("--xp-root", help="X-Plane 12 folder, for runway data (default: auto-detect)")
    ap.add_argument("--no-webapi", action="store_true", help="do not use the X-Plane Web API")
    ap.add_argument("--no-udp", action="store_true", help="do not use UDP RREF")
    ap.add_argument("--no-browser", action="store_true", help="do not open the browser")
    ap.add_argument("--debug", action="store_true", help="verbose logging")
    a = ap.parse_args()
    DEBUG = a.debug

    over = {}
    if a.xp_host:
        over["xpHost"] = a.xp_host
    if a.xp_root:
        over["xpRoot"] = a.xp_root
    if a.no_webapi:
        over["useWebApi"] = False
    if a.no_udp:
        over["useUdp"] = False
    if over:
        CONFIG.update(over, save=False)

    if not os.path.isfile(os.path.join(WEB_ROOT, "index.html")):
        log("ERROR: web files not found in", WEB_ROOT)
        sys.exit(1)

    print("=" * 64)
    print("  %s %s  -  X-Plane 12 companion" % (APP, VERSION))
    print("=" * 64)
    global WEB
    if a.discover:
        BEACON.start()
    else:
        BEACON.status = "off (use --discover to find X-Plane on another PC)"
    web, udp = WebApiSource(), UdpSource()
    WEB = web
    web.start()
    udp.start()
    APT.configure(CONFIG.get("xpRoot"))
    Handler.hub = Hub(web, udp)

    try:
        srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    except OSError as e:
        log("ERROR: cannot open port %d (%s). Is the app already running? Try --port 8766" % (a.port, e))
        sys.exit(1)
    srv.daemon_threads = True
    url = "http://127.0.0.1:%d/" % a.port
    log("Open the app:  " + url)
    LAN.start(a.port, a.lan or bool(CONFIG.get("lan")))
    if not LAN.enabled:
        log("Phone or tablet: in the app open Settings > Phone & tablet and switch it on.")
    log("Waiting for X-Plane (Web API on port %d, UDP on port %d)..." % (CONFIG.get("webApiPort"), CONFIG.get("udpPort")))
    log("Press Ctrl+C to quit.")
    if not a.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        udp.stop()
        log("Bye.")


if __name__ == "__main__":
    main()
