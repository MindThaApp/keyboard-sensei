"""Sheet-music recognition service: a PDF or a photo of printed music in, MusicXML out.

    POST /recognize   body: the PDF/PNG/JPEG bytes
                      200 -> MusicXML (uncompressed), header x-omr-pages
                      4xx/5xx -> {"error": {"code", "message"}}
    GET  /health      200 {"ok": true, "busy": bool}

homr runs as a child process, one file at a time. Only the Midivory API calls this,
over a Docker network with no route out; the API owns the job queue, the users and the
storage. Nothing is kept between requests. Error messages are written for the person who
uploaded the file: the API passes them on.
"""

import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_INPUT_BYTES = 20 * 1024 * 1024
MAX_PDF_PAGES = 6
# 50 megapixels: a 600 dpi A4 page, or a 48 MP phone photo.
MAX_IMAGE_PIXELS = 50_000_000
# Below this the staff lines are too close together to read.
MIN_IMAGE_SIDE = 800

HOMR_BIN = os.environ.get("HOMR_BIN", "homr")
ORT_PATCH_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ortpatch")
PORT = int(os.environ.get("PORT", "8090"))
# homr needs 10-20 s a page on two cores; six pages with headroom.
TIMEOUT_S = int(os.environ.get("OMR_TIMEOUT_S", "240"))

NO_MUSIC = "No sheet music was recognised. Use a sharp, evenly lit photo taken straight on, or the original PDF."


class InputError(Exception):
    def __init__(self, code, message, status=422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def sniff_kind(data):
    """'pdf', 'png' or 'jpeg' by the magic bytes (never the name or content type), else None."""
    if data[:5] == b"%PDF-":
        return "pdf"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    return None


def check_image(path):
    """Reads only the header, so a small file can't decompress into an image that fills memory."""
    from PIL import Image

    try:
        with Image.open(path) as image:
            width, height = image.size
    except Exception as error:
        raise InputError("unreadable_image", "That image could not be read") from error
    if width * height > MAX_IMAGE_PIXELS:
        raise InputError("image_too_large", f"That image is {width}×{height}; the limit is 50 megapixels")
    if max(width, height) < MIN_IMAGE_SIDE:
        raise InputError(
            "image_too_small",
            f"That image is only {width}×{height} pixels, too small to read the notes. Use a photo at full resolution.",
        )


def pdf_page_count(path):
    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(path)
    except Exception as error:
        raise InputError("unreadable_pdf", "That PDF could not be read") from error
    try:
        return len(pdf)
    finally:
        pdf.close()


def homr_env():
    """homr's environment: our sitecustomize (ortpatch/) sizes its ONNX Runtime thread pools."""
    env = dict(os.environ, OMR_ORT_PATCH=os.environ.get("OMR_ORT_PATCH", "1"))
    env["PYTHONPATH"] = os.pathsep.join(filter(None, [ORT_PATCH_DIR, env.get("PYTHONPATH")]))
    return env


def run_homr(input_path, timeout_s):
    """Runs homr in its own process group, killing the whole group at the deadline."""
    process = subprocess.Popen(
        [HOMR_BIN, input_path],
        cwd=os.path.dirname(input_path),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        env=homr_env(),
    )
    try:
        output, _ = process.communicate(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise InputError("timeout", "Recognition took too long. Try fewer pages, or one page at a time.", 504)
    return process.returncode, output.decode("utf-8", "replace")[-4000:]


def recognize(data, timeout_s=TIMEOUT_S, runner=run_homr):
    """Returns (musicxml bytes, page count) or raises InputError."""
    kind = sniff_kind(data)
    if kind is None:
        raise InputError("unsupported_type", "Send a PDF, or a photo as JPEG or PNG", 415)
    with tempfile.TemporaryDirectory(prefix="omr-") as work:
        input_path = os.path.join(work, "score." + ("jpg" if kind == "jpeg" else kind))
        with open(input_path, "wb") as handle:
            handle.write(data)
        pages = 1
        if kind == "pdf":
            pages = pdf_page_count(input_path)
            if pages == 0:
                raise InputError("unreadable_pdf", "That PDF has no pages")
            if pages > MAX_PDF_PAGES:
                raise InputError("too_many_pages", f"That PDF has {pages} pages; the beta reads up to {MAX_PDF_PAGES}")
        else:
            check_image(input_path)
        code, log = runner(input_path, timeout_s)
        output_path = os.path.join(work, "score.musicxml")
        if code != 0 or not os.path.exists(output_path):
            print(f"homr exit {code}, no MusicXML\n{log}", file=sys.stderr, flush=True)
            raise InputError("no_music", NO_MUSIC)
        with open(output_path, "rb") as handle:
            return handle.read(), pages


class Handler(BaseHTTPRequestHandler):
    busy = threading.Lock()

    def log_message(self, format, *args):  # noqa: A002 - the base class's name
        print(f"{self.address_string()} {format % args}", file=sys.stderr, flush=True)

    def send_json(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_error_json(self, status, code, message):
        self.send_json(status, {"error": {"code": code, "message": message}})

    def do_GET(self):  # noqa: N802 - http.server's naming
        if self.path == "/health":
            self.send_json(200, {"ok": True, "busy": self.busy.locked()})
        else:
            self.send_error_json(404, "not_found", "Not found")

    def do_POST(self):  # noqa: N802
        if self.path != "/recognize":
            return self.send_error_json(404, "not_found", "Not found")
        length = int(self.headers.get("content-length") or 0)
        if length > MAX_INPUT_BYTES:
            return self.send_error_json(413, "too_large", "That file is larger than 20 MB")
        if length == 0:
            return self.send_error_json(400, "empty", "Send the file's bytes as the request body")
        # One recognition at a time: the API queues, this is the backstop.
        if not self.busy.acquire(blocking=False):
            return self.send_error_json(503, "busy", "Already recognising a score")
        try:
            data = self.rfile.read(length)
            musicxml, pages = recognize(data)
        except InputError as error:
            return self.send_error_json(error.status, error.code, error.message)
        except Exception as error:  # noqa: BLE001 - never let a bad file take the service down
            print(f"recognition failed: {error!r}", file=sys.stderr, flush=True)
            return self.send_error_json(500, "omr_failed", "Recognition failed")
        finally:
            self.busy.release()
        self.send_response(200)
        self.send_header("content-type", "application/vnd.recordare.musicxml+xml")
        self.send_header("content-length", str(len(musicxml)))
        self.send_header("x-omr-pages", str(pages))
        self.end_headers()
        self.wfile.write(musicxml)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"omr service on :{PORT}", file=sys.stderr, flush=True)
    server.serve_forever()
