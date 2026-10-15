#!/usr/bin/env python3
"""Bake portrait covers and weighted hue palettes. --check is always offline.

Default bake downloads missing originals into .cache/game-covers. --source-dir uses
<slug>.<extension> originals exclusively, for repeatable offline builds and tests.
The contrast order is a design suggestion; the live catalogue owns display order.
"""
import argparse
import colorsys
from hashlib import sha256
from io import BytesIO
import itertools
import json
import math
from pathlib import Path
import re
import sys
from urllib.request import Request, urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
WIDTHS = (320, 640)
BINS = 36
NEUTRAL = (0.36, 0.50, 0.62)


def luminance(rgb):
    return sum(c * w for c, w in zip(rgb, (0.2126, 0.7152, 0.0722)))


def hue(rgb):
    return colorsys.rgb_to_hsv(*rgb)[0] * 360


def hue_distance(a, b):
    return abs((a - b + 180) % 360 - 180)


def normalise(rgb):
    h, light, saturation = colorsys.rgb_to_hls(*rgb)
    colour = colorsys.hls_to_rgb(h, min(0.58, max(0.42, light)), min(0.90, max(0.55, saturation)))
    light = luminance(colour)
    # A common luminance keeps green, red and blue illumination equally strong.
    # Mixing towards white avoids clipping the saturated peak on a blue cover.
    if light < 0.45:
        amount = (0.45 - light) / (1 - light)
        colour = tuple(c + (1 - c) * amount for c in colour)
    else:
        colour = tuple(c * 0.45 / light for c in colour)
    return [round(c, 6) for c in colour]


def extract_theme(image):
    pixels = image.convert('RGBA').resize((48, 64), Image.Resampling.LANCZOS)
    bins = [0.0] * BINS
    sums = [[0.0] * 4 for _ in range(BINS)]
    data = pixels.get_flattened_data() if hasattr(pixels, 'get_flattened_data') else pixels.getdata()
    for red, green, blue, alpha in data:
        rgb = (red / 255, green / 255, blue / 255)
        maximum, minimum = max(rgb), min(rgb)
        delta = maximum - minimum
        if delta < 0.0001 or alpha == 0:
            continue
        weight = (delta / maximum) ** 1.5 * maximum ** 1.2 * alpha / 255
        index = int(hue(rgb) / 360 * BINS) % BINS
        bins[index] += weight
        for channel in range(3):
            sums[index][channel] += rgb[channel] * weight
        sums[index][3] += weight

    def strength(index):
        return bins[(index - 1) % BINS] * 0.5 + bins[index] + bins[(index + 1) % BINS] * 0.5

    def average(index):
        nearby = [sums[(index + step) % BINS] for step in (-1, 0, 1)]
        weight = sum(row[3] for row in nearby)
        return tuple(sum(row[c] for row in nearby) / weight for c in range(3)) if weight else NEUTRAL

    primary = max(range(BINS), key=strength)
    candidates = [index for index in range(BINS) if hue_distance(index * 10, primary * 10) > 50]
    secondary = max(candidates, key=strength)
    return {'primary': normalise(average(primary)), 'secondary': normalise(average(secondary))}


def read_roster(path, names=('GLADIATOR_SLOTS', 'METAWIN_ORIGINALS')):
    text = Path(path).read_text()
    cdn = re.search(r"const IMG_CDN = '([^']+)'", text)
    if not cdn:
        raise ValueError('Cannot find IMG_CDN in gameData.ts')
    entries = []
    for name in names:
        roster = re.search(r'export const ' + name + r'[^=]*=\s*\[(.*?)\n\];', text, re.S)
        if not roster:
            raise ValueError(f'Cannot find {name} in gameData.ts')
        for row in re.findall(r'\{\s*id:.*?(?=\n\s*\{|$)', roster.group(1), re.S):
            slug = re.search(r"\bslug:\s*'([^']+)'", row)
            image = re.search(r"\bimage:\s*([`'])(.*?)\1", row)
            if not image:
                continue
            if not slug or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug.group(1)):
                raise ValueError('Unsafe or missing cover slug')
            url = image.group(2).replace('${IMG_CDN}', cdn.group(1))
            if not url.startswith('https://') or '${' in url:
                raise ValueError('Unsupported cover URL expression')
            entries.append({'slug': slug.group(1), 'image': url})
    if not entries or len({entry['slug'] for entry in entries}) != len(entries):
        raise ValueError('Empty or duplicate curated cover roster')
    return entries


def contrast_order(entries):
    """Maximise the weakest neighbouring hue contrast, fixing the first game.

    Exhaustive search is bounded to eight featured covers; additional covers keep
    their roster order. The tie break is deterministic and includes the seam.
    """
    keys = list(entries)
    if len(keys) < 3:
        return keys
    featured, rest = keys[:8], keys[8:]

    def score(order):
        distances = [hue_distance(hue(entries[a]['primary']), hue(entries[b]['primary']))
                     for a, b in zip(order, order[1:] + order[:1])]
        return min(distances), sum(distances)

    orders = ((featured[0], *tail) for tail in itertools.permutations(featured[1:]))
    return list(max(orders, key=score)) + rest


def digest(data):
    return sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2, ensure_ascii=True) + '\n').encode()


def download(url):
    with urlopen(Request(url, headers={'User-Agent': 'Gladiator-Cover-Baker/1'}), timeout=30) as response:
        return response.read()


def source_file(folder, slug):
    cached = folder / f'{slug}.source'
    if cached.is_file():
        return cached
    paths = sorted(path for path in folder.glob(f'{slug}.*') if path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.source'})
    return paths[0] if paths else None


def check_outputs(roster, output, sources, manifest_path, contrast_slugs):
    try:
        manifest = json.loads(manifest_path.read_bytes())
        signature = manifest.pop('manifestSha256', '')
        if signature != digest(encoded(manifest)):
            raise ValueError('Manifest content changed')
        if manifest['version'] != 1 or manifest['bakerSha256'] != digest(Path(__file__).read_bytes()) or manifest['roster'] != roster:
            raise ValueError('Baker or roster changed')
        if set(manifest['entries']) != {row['slug'] for row in roster}:
            raise ValueError('Cover roster changed')
        if manifest['contrastOrder'] != contrast_order({slug: manifest['entries'][slug] for slug in contrast_slugs}):
            raise ValueError('Featured contrast order changed')
        expected_files = set()
        for row in roster:
            slug = row['slug']
            entry = manifest['entries'][slug]
            original = source_file(sources, slug)
            if entry['source'] != row['image'] or (original and digest(original.read_bytes()) != entry['sourceSha256']):
                raise ValueError(f'Source changed: {slug}')
            for width in WIDTHS:
                size = entry['widths'][str(width)]
                name = f"{slug}-{width}-{size['sha256'][:8]}.webp"
                file = output / name
                expected_files.add(name)
                data = file.read_bytes()
                with Image.open(BytesIO(data)) as image:
                    if (image.width, image.height) != (width, size['height']) or image.format != 'WEBP':
                        raise ValueError(f'Wrong dimensions: {file.name}')
                if len(data) != size['bytes'] or digest(data) != size['sha256'] or size['url'] != f'/arena/games/{file.name}':
                    raise ValueError(f'Output changed: {file.name}')
        if {path.name for path in output.glob('*.webp')} != expected_files or (output / 'manifest.json').exists():
            raise ValueError('Stale public covers or manifest remain')
        return True
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError(f'Missing or stale cover bake: {error}') from error


def bake(roster, output, sources, check=False, allow_download=False, *, manifest_path, contrast_slugs=None):
    output, sources, manifest_path = Path(output), Path(sources), Path(manifest_path)
    contrast_slugs = [row['slug'] for row in roster] if contrast_slugs is None else contrast_slugs
    if check:
        return check_outputs(roster, output, sources, manifest_path, contrast_slugs)
    output.mkdir(parents=True, exist_ok=True)
    sources.mkdir(parents=True, exist_ok=True)
    entries = {}
    for row in roster:
        slug = row['slug']
        original = source_file(sources, slug)
        marker = sources / f'{slug}.url'
        if allow_download and original and (not marker.exists() or marker.read_text() != row['image']):
            original = None
        if original is None:
            if not allow_download:
                raise ValueError(f'Original missing: {slug}')
            original = sources / f'{slug}.source'
            original.write_bytes(download(row['image']))
            marker.write_text(row['image'])
        data = original.read_bytes()
        with Image.open(BytesIO(data)) as opened:
            image = ImageOps.exif_transpose(opened).convert('RGBA')
        entry = {'source': row['image'], 'sourceSha256': digest(data),
                 'sourceSize': {'width': image.width, 'height': image.height, 'bytes': len(data)},
                 **extract_theme(image), 'widths': {}}
        # Remove EXIF/ICC and use explicit encoding settings. Identical originals
        # on the same Pillow/libwebp version produce byte-identical output.
        for width in WIDTHS:
            height = max(1, math.floor(image.height * width / image.width + 0.5))
            resized = image.resize((width, height), Image.Resampling.LANCZOS)
            buffer = BytesIO()
            resized.save(buffer, format='WEBP', quality=72, method=6, exact=True)
            content = buffer.getvalue()
            name = f'{slug}-{width}-{digest(content)[:8]}.webp'
            (output / name).write_bytes(content)
            entry['widths'][str(width)] = {'url': f'/arena/games/{name}', 'width': width, 'height': height,
                                          'bytes': len(content), 'sha256': digest(content)}
        entries[slug] = entry
    # Only the slot roster supplies the hall's existing design order.
    manifest = {'version': 1, 'bakerSha256': digest(Path(__file__).read_bytes()), 'roster': roster,
                'entries': entries, 'contrastOrder': contrast_order({slug: entries[slug] for slug in contrast_slugs})}
    manifest['manifestSha256'] = digest(encoded(manifest))
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_bytes(encoded(manifest))
    expected_files = {size['url'].rsplit('/', 1)[-1] for entry in entries.values() for size in entry['widths'].values()}
    for path in output.glob('*.webp'):
        if path.name not in expected_files:
            path.unlink()
    (output / 'manifest.json').unlink(missing_ok=True)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Offline: verify roster, baker and output hashes; never download')
    parser.add_argument('--source-dir', type=Path, help='Offline originals named <slug>.<extension>')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'public/arena/games')
    parser.add_argument('--manifest-path', type=Path, default=ROOT / 'src/features/arena/gameCovers.json')
    parser.add_argument('--roster', type=Path, default=ROOT / 'src/api/gameData.ts')
    parser.add_argument('--refresh', action='store_true', help='Discard cached originals before downloading updated art')
    args = parser.parse_args()
    try:
        roster = read_roster(args.roster)
        sources = args.source_dir or ROOT / '.cache/game-covers'
        if args.refresh:
            if args.check or args.source_dir:
                raise ValueError('--refresh requires a download bake')
            for row in roster:
                original = source_file(sources, row['slug'])
                if original:
                    original.unlink()
        contrast_slugs = [row['slug'] for row in read_roster(args.roster, ('GLADIATOR_SLOTS',))]
        bake(roster, args.output_dir, sources, check=args.check, allow_download=args.source_dir is None,
             manifest_path=args.manifest_path, contrast_slugs=contrast_slugs)
    except (ValueError, OSError) as error:
        print(f'Cover bake failed: {error}', file=sys.stderr)
        return 1
    print('Cover bake is current.' if args.check else f'Baked {len(roster)} covers at 320/640 px into {args.output_dir}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
