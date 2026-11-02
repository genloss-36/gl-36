import base64, json, math, random, struct, urllib.request
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

DOCS = Path(__file__).resolve().parent.parent
ROOT = DOCS.parent
FONT = next(p for p in (d / "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2" for d in (DOCS, ROOT)) if p.exists())
W, H, M = 1200, 630, 64
SS = 2
INK, INK2, BG, FIELD = (245, 245, 247), (161, 161, 166), (0, 0, 0), (72, 72, 74)
HEADER, SLOT, COLS = 224, 36, 36
MASK = ((0.0, 1.0), (0.34, 1.0), (0.70, 0.14), (1.0, 0.08))
SQUIRCLE = 1.4
CORNER = [(math.cos(t) ** 0.5, math.sin(t) ** 0.5) for t in (i / 16 * math.pi / 2 for i in range(17))]

def account() -> bytes:
    cfg = json.loads((ROOT / "deployments/mainnet.json").read_text())
    col = next((c for c in cfg["collections"] if c["project"] == "genloss" and c["id"] == "genesis"), None)
    try:
        if col is None:
            raise LookupError("no GENLOSS Genesis in the registry")
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "getAccountInfo",
                           "params": [col["address"], {"encoding": "base64"}]}).encode()
        req = urllib.request.Request(cfg["rpc"], body, {"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return base64.b64decode(json.load(r)["result"]["value"]["data"][0])
    except Exception as e:
        print(f"no live account ({e}); drawing a stand-in account")
        rnd = random.Random(36)
        minted = 12
        d = bytearray(HEADER + minted * SLOT)
        d[0:3] = b"\x01\x01\xfe"
        struct.pack_into("<HH H", d, 4, 5000, minted, 200)
        for off in (24, 56, 88, 184):
            d[off:off + 32] = bytes(rnd.randrange(256) for _ in range(32))
        owners = [bytes(rnd.randrange(256) for _ in range(32)) for _ in range(3)]
        for i in range(minted):
            d[HEADER + i * SLOT:HEADER + i * SLOT + 32] = owners[i % 3]
        return bytes(d)

def cells(data: bytes, rows: int):
    header_rows = math.ceil(HEADER / COLS)
    for r in range(rows):
        for c in range(COLS):
            if r < header_rows:
                i = r * COLS + c
                if i < HEADER:
                    yield r, c, data[i]
            else:
                i = HEADER + (r - header_rows) * SLOT + c
                yield r, c, data[i] if i < len(data) else None

def fade(t: float) -> float:
    for (a, va), (b, vb) in zip(MASK, MASK[1:]):
        if t <= b:
            return va + (vb - va) * (t - a) / (b - a)
    return MASK[-1][1]

def squircle(x0, y0, x1, y1, r):
    pts = []
    for cx, cy, sx, sy, rev in ((x0 + r, y0 + r, -1, -1, False), (x1 - r, y0 + r, 1, -1, True),
                                (x1 - r, y1 - r, 1, 1, False), (x0 + r, y1 - r, -1, 1, True)):
        arc = [(cx + sx * r * u, cy + sy * r * v) for u, v in CORNER]
        pts += arc[::-1] if rev else arc
    return pts

def font(size: int, weight: int):
    f = ImageFont.truetype(str(FONT), size * SS)
    f.set_variation_by_axes([weight])
    return f

def text(dr, x, y, s, f, fill, track):
    for a, b in zip(s, s[1:] + " "):
        dr.text((x, y), a, font=f, fill=fill, anchor="ls")
        x += f.getlength(a + b) - f.getlength(b) + track * f.size
    return x

def mark(dr, x, y, size, fill):
    u = size / 24
    for a, b, r in ((0, 16, 3.6), (18.34, 24, 1.4)):
        dr.polygon(squircle(x + a * u, y + a * u, x + b * u, y + b * u, r * SQUIRCLE * u), fill=fill)

def card(data: bytes) -> Image.Image:
    field = Image.new("L", (W * SS, H * SS), 0)
    fd = ImageDraw.Draw(field)
    cell = W / COLS
    rows = math.ceil(H / cell)
    for r, c, v in cells(data, rows):
        if v is None:
            size, a = cell * 0.1, 0.22
        else:
            size, a = cell * (0.14 + 0.68 * math.sqrt(v / 255)), 1.0
        cx, cy, h = (c + 0.5) * cell, (r + 0.5) * cell, size / 2
        fd.polygon(squircle((cx - h) * SS, (cy - h) * SS, (cx + h) * SS, (cy + h) * SS, size * 0.3 * SQUIRCLE * SS),
                   fill=round(255 * a))
    ramp = Image.new("L", (1, H * SS))
    ramp.putdata([round(255 * fade((y + 0.5) / (H * SS))) for y in range(H * SS)])
    alpha = ImageChops.multiply(field, ramp.resize(field.size, Image.NEAREST))
    img = Image.composite(Image.new("RGB", field.size, FIELD), Image.new("RGB", field.size, BG), alpha)
    dr = ImageDraw.Draw(img)

    display = font(132, 700)
    lead = 132 * 0.94
    base = H - M - 6
    text(dr, M * SS, (base - lead) * SS, "An NFT", display, INK, -0.03)
    text(dr, M * SS, base * SS, "is 36 bytes", display, INK, -0.03)

    small = font(28, 700)
    label = "GL-36"
    lw = sum(small.getlength(a + b) - small.getlength(b) for a, b in zip(label, label[1:] + " ")) / SS
    x = W - M - lw
    text(dr, x * SS, base * SS, label, small, INK, 0)
    mark(dr, (x - 38) * SS, (base - 22) * SS, 24 * SS, INK)
    sub = font(20, 500)
    caption = "An NFT standard for Solana"
    cw = sub.getlength(caption) / SS
    text(dr, (W - M - cw) * SS, (base - 46) * SS, caption, sub, INK2, 0)
    return img.resize((W, H), Image.LANCZOS)

def touch_icon() -> Image.Image:
    s = 180
    img = Image.new("RGB", (s * SS, s * SS), BG)
    mark(ImageDraw.Draw(img), 34 * SS, 34 * SS, 112 * SS, INK)
    return img.resize((s, s), Image.LANCZOS)

if __name__ == "__main__":
    out = DOCS / "public"
    card(account()).save(out / "og.png", optimize=True)
    touch_icon().save(out / "apple-touch-icon.png", optimize=True)
    print("wrote", out / "og.png", "and", out / "apple-touch-icon.png")
