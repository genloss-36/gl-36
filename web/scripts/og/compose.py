import sys, math
from PIL import Image, ImageDraw, ImageFont

d, font_path, out, lang = sys.argv[1:5]
INK, INK2 = (235, 231, 224), (143, 140, 134)
W, H, M = 1200, 630, 72
PIECES = [5, 20, 11, 15, 28, 22, 13]
CJK = "/System/Library/Fonts/Hiragino Sans GB.ttc"
TEXT = {
    "en": ("A 5,000-piece mint on GL-36", ["Every NFT takes 36 bytes on Solana. Every image", "was saved as JPEG until it fell apart."]),
    "zh": ("基于 GL-36 的 5000 件铸造", ["每个 NFT 在 Solana 上只占 36 字节。", "每张图都被反复存成 JPEG，直到面目全非。"]),
}[lang]

def font(size, weight, width):
    f = ImageFont.truetype(font_path, size)
    f.set_variation_by_axes([weight, width])
    return f

def text(dr, x, y, s, f, fill, track=0.0, anchor="ls"):
    for ch in s:
        dr.text((x, y), ch, font=f, fill=fill, anchor=anchor)
        x += dr.textlength(ch, font=f) + track * f.size

cu = lambda k, n: (math.sqrt(0.5) if k == 0 else 1) * math.cos((2 * n + 1) * k * math.pi / 16)

card = Image.new("RGB", (W, H), "black")
dr = ImageDraw.Draw(card)

cell = 5
for i in range(64):
    x, y = i % 8, i // 8
    a = 0.08 + ((cu(1, y) * cu(2, x) + 1) / 2) * 0.92
    dr.rectangle([M + x * cell, M + y * cell, M + (x + 1) * cell - 1, M + (y + 1) * cell - 1], fill=tuple(int(c * a) for c in INK))
text(dr, M + 8 * cell + 16, M + 20, "GENLOSS", font(24, 800, 80), INK, 0.04, "lm")

if lang == "en":
    text(dr, M - 4, 222, TEXT[0], font(66, 600, 100), INK, -0.025)
    desc, track = font(28, 400, 100), -0.005
else:
    text(dr, M - 2, 222, TEXT[0], ImageFont.truetype(CJK, 60, index=2), INK)
    desc, track = ImageFont.truetype(CJK, 27, index=0), 0
for k, line in enumerate(TEXT[1]):
    text(dr, M, 280 + k * 38, line, desc, INK2, track)

n, size = len(PIECES), 136
gap = (W - 2 * M - n * size) / (n - 1)
for k, p in enumerate(PIECES):
    art = Image.frombytes("RGB", (256, 256), open(f"{d}/final-{p}.rgb", "rb").read())
    card.paste(art.resize((size, size), Image.LANCZOS), (round(M + k * (size + gap)), H - M - size))
card.save(out, optimize=True)
