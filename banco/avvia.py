#!/usr/bin/env python3
"""Lettore MRZ dello sportello.

Il telefono legge le righe. Questo PC le riceve e le mette negli appunti,
pronte per «Incolla dagli appunti» nel gestionale.
"""

from __future__ import annotations

import json
import secrets
import socket
import ssl
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
CERT_DIR = ROOT / "certs"
sys.path.insert(0, str(ROOT))

from mrz import parse  # noqa: E402

HTTP_PORT = 8080
HTTPS_PORT = 8443
MAX_BODY = 16000

LOCK = threading.Lock()
LATEST = {"id": 0, "lines": None, "parsed": None}
CODE = f"{secrets.randbelow(9000) + 1000:04d}"

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".gz": "application/octet-stream",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}


def lan_ips() -> list[str]:
    found: set[str] = set()
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        found.add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                found.add(ip)
    except OSError:
        pass
    return sorted(found)


def ensure_cert(ips: list[str]) -> tuple[Path, Path]:
    CERT_DIR.mkdir(exist_ok=True)
    cert = CERT_DIR / "cert.pem"
    key = CERT_DIR / "key.pem"
    stamp = CERT_DIR / "ips.txt"
    wanted = ",".join(ips)
    if cert.exists() and key.exists() and stamp.exists() and stamp.read_text(encoding="utf-8") == wanted:
        return cert, key
    san = ["DNS:localhost", "IP:127.0.0.1", *[f"IP:{ip}" for ip in ips]]
    subprocess.run(
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048",
            "-keyout", str(key), "-out", str(cert),
            "-days", "825", "-nodes",
            "-subj", "/CN=sportello",
            "-addext", "subjectAltName=" + ",".join(san),
        ],
        check=True,
        capture_output=True,
    )
    stamp.write_text(wanted, encoding="utf-8")
    return cert, key


def copy_clipboard(text: str) -> None:
    try:
        if sys.platform == "win32":
            subprocess.run("clip", input=text, text=True, check=False)
            return
        if sys.platform == "darwin":
            subprocess.run(["pbcopy"], input=text, text=True, check=False)
            return
        for command in (["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]):
            try:
                subprocess.run(command, input=text, text=True, check=True)
                return
            except (OSError, subprocess.CalledProcessError):
                continue
    except Exception:
        return


def make_handler(default_page: str, local_only_config: bool):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt: str, *args) -> None:
            sys.stderr.write("banco  " + (fmt % args) + "\n")

        def do_GET(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path == "/api/ultimo":
                self._send_json(200, _public_latest())
                return
            if path == "/api/config":
                if local_only_config and not self._local():
                    self._send_json(404, {"errore": "no"})
                    return
                ips = lan_ips()
                phone = f"https://{ips[0]}:{HTTPS_PORT}/" if ips else f"https://127.0.0.1:{HTTPS_PORT}/"
                self._send_json(200, {"code": CODE, "phoneUrl": phone})
                return
            if path in ("/", ""):
                path = "/" + default_page
            self._send_file(path)

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path == "/api/azzera":
                if not self._local():
                    self._send_json(403, {"errore": "Solo dal PC dello sportello."})
                    return
                with LOCK:
                    LATEST["id"] = 0
                    LATEST["lines"] = None
                    LATEST["parsed"] = None
                self._send_json(200, _public_latest())
                return
            if path != "/api/scans":
                self._send_json(404, {"errore": "no"})
                return
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length <= 0 or length > MAX_BODY:
                self._send_json(400, {"errore": "Richiesta vuota."})
                return
            try:
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeError, json.JSONDecodeError):
                self._send_json(400, {"errore": "Testo non valido."})
                return
            if not secrets.compare_digest(str(payload.get("code", "")), CODE):
                self._send_json(403, {"errore": "Codice dello sportello non valido."})
                return
            lines = payload.get("lines")
            if not isinstance(lines, list) or not all(isinstance(line, str) for line in lines):
                self._send_json(400, {"errore": "Righe mancanti."})
                return
            parsed = parse("\n".join(lines))
            if parsed is None:
                self._send_json(422, {"errore": "Cifre di controllo non valide. Inquadra di nuovo."})
                return
            with LOCK:
                LATEST["id"] = int(LATEST["id"]) + 1
                LATEST["lines"] = parsed["lines"]
                LATEST["parsed"] = parsed
                current_id = LATEST["id"]
            copy_clipboard("\n".join(parsed["lines"]))
            self._send_json(200, _public_latest())
            sys.stderr.write(f"banco  lettura {current_id} accettata\n")

        def _local(self) -> bool:
            return self.client_address[0] in ("127.0.0.1", "::1")

        def _send_json(self, status: int, obj: dict) -> None:
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_file(self, url_path: str) -> None:
            rel = url_path.lstrip("/")
            file_path = (WEB / rel).resolve()
            if not str(file_path).startswith(str(WEB.resolve())) or not file_path.is_file():
                self._send_json(404, {"errore": "File non trovato."})
                return
            data = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", TYPES.get(file_path.suffix, "application/octet-stream"))
            self.send_header("Content-Length", str(len(data)))
            if file_path.suffix == ".html":
                self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

    return Handler


def _public_latest() -> dict:
    with LOCK:
        parsed = LATEST["parsed"] or {}
        return {
            "id": LATEST["id"],
            "lines": LATEST["lines"],
            "format": parsed.get("format"),
            "kind": parsed.get("kind"),
            "issuer": parsed.get("issuer"),
            "documentNumber": parsed.get("documentNumber"),
            "surname": parsed.get("surname"),
            "givenNames": parsed.get("givenNames"),
            "birthDate": parsed.get("birthDate"),
            "sex": parsed.get("sex"),
            "expiryDate": parsed.get("expiryDate"),
            "nationality": parsed.get("nationality"),
        }


def main() -> None:
    ips = lan_ips()
    cert, key = ensure_cert(ips)
    httpd = ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), make_handler("banco.html", True))
    httpsd = ThreadingHTTPServer(("0.0.0.0", HTTPS_PORT), make_handler("index.html", True))
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(cert, key)
    httpsd.socket = context.wrap_socket(httpsd.socket, server_side=True)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    threading.Thread(target=httpsd.serve_forever, daemon=True).start()
    phone = f"https://{ips[0]}:{HTTPS_PORT}/" if ips else "(nessun indirizzo di rete)"
    print("Sportello pronto.")
    print(f"  Su questo PC apri  http://127.0.0.1:{HTTP_PORT}/")
    print(f"  Sul telefono apri  {phone}")
    print(f"  Codice             {CODE}")
    print("Ctrl+C per chiudere. Le letture restano solo in memoria.")
    webbrowser.open(f"http://127.0.0.1:{HTTP_PORT}/")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print("\nChiuso.")


if __name__ == "__main__":
    main()
