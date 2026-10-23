"""Input checks of the recognition service. Run in the image: python -m unittest test_server"""

import io
import os
import unittest

from PIL import Image

import server


def png(width, height):
    buffer = io.BytesIO()
    Image.new("L", (width, height), 255).save(buffer, "PNG")
    return buffer.getvalue()


def jpeg(width, height):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (255, 255, 255)).save(buffer, "JPEG")
    return buffer.getvalue()


def pdf(pages):
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument.new()
    for _ in range(pages):
        document.new_page(595, 842)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def fake_homr(produces=True, code=0):
    calls = []

    def runner(input_path, timeout_s):
        calls.append(os.path.basename(input_path))
        if produces:
            with open(os.path.join(os.path.dirname(input_path), "score.musicxml"), "wb") as handle:
                handle.write(b"<score-partwise/>")
        return code, "log"

    runner.calls = calls
    return runner


class RecognizeTest(unittest.TestCase):
    def test_knows_files_by_their_bytes(self):
        self.assertEqual(server.sniff_kind(b"%PDF-1.7"), "pdf")
        self.assertEqual(server.sniff_kind(png(10, 10)), "png")
        self.assertEqual(server.sniff_kind(jpeg(10, 10)), "jpeg")
        self.assertIsNone(server.sniff_kind(b"<?xml"))
        with self.assertRaises(server.InputError) as caught:
            server.recognize(b"GIF89a....", runner=fake_homr())
        self.assertEqual((caught.exception.code, caught.exception.status), ("unsupported_type", 415))

    def test_runs_homr_on_a_photo_and_returns_its_musicxml(self):
        runner = fake_homr()
        musicxml, pages = server.recognize(jpeg(1200, 1600), runner=runner)
        self.assertEqual((musicxml, pages), (b"<score-partwise/>", 1))
        self.assertEqual(runner.calls, ["score.jpg"])

    def test_counts_pdf_pages_and_refuses_long_ones(self):
        musicxml, pages = server.recognize(pdf(2), runner=fake_homr())
        self.assertEqual(pages, 2)
        runner = fake_homr()
        with self.assertRaises(server.InputError) as caught:
            server.recognize(pdf(server.MAX_PDF_PAGES + 1), runner=runner)
        self.assertEqual(caught.exception.code, "too_many_pages")
        self.assertEqual(runner.calls, [])

    def test_refuses_images_too_small_or_too_large_before_running_homr(self):
        runner = fake_homr()
        with self.assertRaises(server.InputError) as small:
            server.recognize(png(400, 600), runner=runner)
        self.assertEqual(small.exception.code, "image_too_small")
        # 10000 x 6000 = 60 MP, as a tiny PNG of one colour.
        with self.assertRaises(server.InputError) as large:
            server.recognize(png(10000, 6000), runner=runner)
        self.assertEqual(large.exception.code, "image_too_large")
        self.assertEqual(runner.calls, [])

    def test_no_output_means_no_music(self):
        for runner in (fake_homr(produces=False), fake_homr(produces=True, code=1)):
            with self.assertRaises(server.InputError) as caught:
                server.recognize(png(1200, 1600), runner=runner)
            self.assertEqual(caught.exception.code, "no_music")

    def test_a_corrupt_pdf_is_unreadable_not_a_crash(self):
        with self.assertRaises(server.InputError) as caught:
            server.recognize(b"%PDF-1.7 not really", runner=fake_homr())
        self.assertEqual(caught.exception.code, "unreadable_pdf")


if __name__ == "__main__":
    unittest.main()
