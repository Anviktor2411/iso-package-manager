from __future__ import annotations

import time
import urllib.error
import urllib.request

import ssl

from ipm_utils import ssl_context_for_https


def http_get_text(url: str, timeout: float = 20.0) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }

    last_err: Exception | None = None
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout, context=ssl_context_for_https()) as resp:
                data = resp.read()
            try:
                return data.decode("utf-8")
            except UnicodeDecodeError:
                return data.decode("latin-1", errors="replace")
        except urllib.error.HTTPError as e:
            last_err = e
            # Some hosts dislike non-browser UAs or need a retry.
            if attempt == 0 and e.code in (403, 429, 500, 502, 503, 504):
                time.sleep(1.0)
                continue
            raise RuntimeError(f"HTTP Error {e.code}: {e.reason}")
        except ssl.SSLCertVerificationError:
            raise RuntimeError("SSL certificate verification failed (your system cert store may be missing/blocked)")
        except Exception as e:
            last_err = e
            if attempt == 0:
                time.sleep(0.5)
                continue
            raise

    if last_err is not None:
        raise last_err
    raise RuntimeError("Request failed")
