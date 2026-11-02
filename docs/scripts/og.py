import base64, json, math, random, struct, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

DOCS = Path(__file__).resolve().parent.parent
ROOT = DOCS.parent
FONT = DOCS / "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"
W, H, M = 1200, 630, 64
SS = 2
INK, INK2, BG = (245, 245, 247), (161, 161, 166), (0, 0, 0)
HEADER, SLOT, COLS = 224, 36, 36

def account() -> bytes:
    cfg = json.loads((ROOT / "web/src/data/devnet.json").read_text())
    col = next(c for c in cfg["collections"] if c["id"] == "genesis")
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "getAccountInfo",
                       "params": [col["address"], {"encoding": "base64"}]}).encode()
    try:
        req = urllib.request.Request(cfg["rpc"], body, {"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return base64.b64decode(json.load(r)["result"]["value"]["data"][0])
    except Exception as e:
        print(f"devnet unavailable ({e}); drawing a stand-in account")
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

def fade(y: float) -> float:
    t = y / H
    if t < 0.28:
        return 1.0
    if t < 0.56:
        return 1.0 - (t - 0.28) / 0.28 * 0.9
    return 0.1 - (t - 0.56) / 0.44 * 0.05

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
    dr.rounded_rectangle((x, y, x + 16 * u, y + 16 * u), radius=3.6 * u, fill=fill)
    dr.rounded_rectangle((x + 18.34 * u, y + 18.34 * u, x + 24 * u, y + 24 * u), radius=1.4 * u, fill=fill)

def card(data: bytes) -> Image.Image:
    img = Image.new("RGB", (W * SS, H * SS), BG)
    dr = ImageDraw.Draw(img)
    cell = W / COLS
    rows = math.ceil(H / cell)
    for r, c, v in cells(data, rows):
        cy = (r + 0.5) * cell
        a = fade(cy)
        if v is None:
            size, a = cell * 0.1, a * 0.22
        else:
            size = cell * (0.14 + 0.68 * math.sqrt(v / 255))
        if size < 0.6:
            continue
        cx = (c + 0.5) * cell
        shade = tuple(round(BG[k] + (INK[k] - BG[k]) * a) for k in range(3))
        h = size / 2
        dr.rounded_rectangle(((cx - h) * SS, (cy - h) * SS, (cx + h) * SS, (cy + h) * SS),
                             radius=size * 0.3 * SS, fill=shade)

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
