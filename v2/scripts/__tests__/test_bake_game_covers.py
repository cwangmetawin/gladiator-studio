"""Synthetic fixtures only: these tests never download a cover."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

BAKER = Path(__file__).resolve().parents[1] / 'bake-game-covers.py'
spec = importlib.util.spec_from_file_location('baker', BAKER)
baker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baker)


class PaletteTests(unittest.TestCase):
    def test_weighted_peak_secondary_and_brightness(self):
        image = Image.new('RGB', (48, 64), (0, 0, 0))
        for x in range(48):
            for y in range(64):
                image.putpixel((x, y), (20, 180, 45) if x < 30 else (220, 100, 20))
        theme = baker.extract_theme(image)
        p, s = theme['primary'], theme['secondary']
        self.assertGreater(p[1], p[0] * 1.5)
        self.assertGreater(s[0], s[2] * 1.5)
        self.assertGreater(baker.hue_distance(baker.hue(p), baker.hue(s)), 50)
        self.assertAlmostEqual(baker.luminance(p), baker.luminance(s), places=5)
        self.assertEqual(theme, baker.extract_theme(image))

    def test_grayscale_transparency_and_dark_colours_are_finite(self):
        for colour in [(0, 0, 0, 255), (255, 255, 255, 255), (230, 30, 30, 0), (0, 0, 5, 255)]:
            theme = baker.extract_theme(Image.new('RGBA', (12, 12), colour))
            for rgb in theme.values():
                self.assertTrue(all(0 <= c <= 1 for c in rgb))
                self.assertAlmostEqual(baker.luminance(rgb), 0.45, places=5)

    def test_hue_wrap_and_contrast_order_are_deterministic(self):
        self.assertEqual(baker.hue_distance(355, 5), 10)
        entries = {key: {'primary': rgb} for key, rgb in [('green', [0, 1, 0]), ('blue-a', [0, .3, 1]), ('pink', [1, 0, .4]), ('blue-b', [0, .4, 1])]}
        order = baker.contrast_order(entries)
        self.assertEqual(order[0], 'green')
        self.assertEqual(set(order), set(entries))
        self.assertEqual(order, baker.contrast_order(entries))
        self.assertNotIn(['blue-a', 'blue-b'], [order[i:i+2] for i in range(len(order) - 1)])


class BakeTests(unittest.TestCase):
    def test_curated_parser_reads_slots_and_originals_and_resolves_template_urls(self):
        roster = baker.read_roster(BAKER.parents[1] / 'src/api/gameData.ts')
        self.assertEqual(len(roster), 38)
        self.assertEqual(roster[0]['slug'], 'gladiator-eyes-of-medusa')
        self.assertTrue(all(row['image'].startswith('https://content.prod.platform.mwapp.io/games/') for row in roster))

    def test_offline_bake_is_deterministic_and_check_rejects_stale_outputs_roster_and_sources(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            sources, out = root / 'sources', root / 'output'
            manifest_path = root / 'src/gameCovers.json'
            sources.mkdir()
            roster = [{'slug': 'test-slot', 'image': 'https://example.com/vertical.jpg'}]
            image = sources / 'test-slot.png'
            Image.new('RGB', (80, 110), (20, 150, 50)).save(image)
            out.mkdir()
            (out / 'test-slot-320.webp').write_bytes(b'old')
            (out / 'test-slot-640-deadbeef.webp').write_bytes(b'stale')
            (out / 'manifest.json').write_text('{}')
            with patch.object(baker, 'download', side_effect=AssertionError('network forbidden')):
                first = baker.bake(roster, out, sources, check=False, manifest_path=manifest_path)
                raw = manifest_path.read_bytes()
                self.assertEqual(baker.bake(roster, out, sources, check=False, manifest_path=manifest_path), first)
                self.assertEqual(manifest_path.read_bytes(), raw)
                self.assertTrue(baker.bake(roster, out, sources, check=True, manifest_path=manifest_path))
                manifest = json.loads(raw)
                self.assertFalse((out / 'manifest.json').exists())
                self.assertEqual(len(list(out.iterdir())), 2)
                (out / 'test-slot-320.webp').write_bytes(b'stale')
                with self.assertRaises(ValueError):
                    baker.bake(roster, out, sources, check=True, manifest_path=manifest_path)
                baker.bake(roster, out, sources, manifest_path=manifest_path)
                for width in [320, 640]:
                    size = manifest['entries']['test-slot']['widths'][str(width)]
                    target = out / size['url'].split('/')[-1]
                    self.assertRegex(target.name, rf'^test-slot-{width}-[a-f0-9]{{8}}\.webp$')
                    self.assertTrue(target.name.endswith(f"-{baker.digest(target.read_bytes())[:8]}.webp"))
                    with Image.open(target) as cover:
                        self.assertEqual(cover.width, width)
                    self.assertEqual(manifest['entries']['test-slot']['widths'][str(width)]['bytes'], target.stat().st_size)
                (out / manifest['entries']['test-slot']['widths']['320']['url'].split('/')[-1]).write_bytes(b'changed')
                with self.assertRaises(ValueError):
                    baker.bake(roster, out, sources, check=True, manifest_path=manifest_path)
                baker.bake(roster, out, sources, check=False, manifest_path=manifest_path)
                edited = json.loads(manifest_path.read_bytes())
                edited['entries']['test-slot']['primary'] = [1, 0, 1]
                manifest_path.write_text(json.dumps(edited))
                with self.assertRaises(ValueError):
                    baker.bake(roster, out, sources, check=True, manifest_path=manifest_path)
                baker.bake(roster, out, sources, check=False, manifest_path=manifest_path)
                Image.new('RGB', (80, 110), (190, 40, 50)).save(image)
                with self.assertRaises(ValueError):
                    baker.bake(roster, out, sources, check=True, manifest_path=manifest_path)
                with self.assertRaises(ValueError):
                    baker.bake([*roster, {'slug': 'added', 'image': 'https://example.com/new.jpg'}], out, sources, check=True, manifest_path=manifest_path)


if __name__ == '__main__':
    unittest.main()
