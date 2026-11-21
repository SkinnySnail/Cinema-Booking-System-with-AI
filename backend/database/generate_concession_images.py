"""Sinh ảnh cho bắp nước (concessions).

Tương tự generate_posters.py: không dùng ảnh thật của sản phẩm (bản quyền),
mà dựng ảnh dạng gradient + typography với tên món, đủ để giao diện hiển thị
đúng layout thay vì ảnh vỡ (broken image).

Kích thước 600x600 (vuông) vì thẻ bắp nước render ở w-28 h-28 / w-32 h-32
với object-cover.

Chạy:  python3 backend/database/generate_concession_images.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "uploads" / "concessions"
OUT.mkdir(parents=True, exist_ok=True)

# Ghi ra thư mục tạm rồi copy lại: thư mục uploads/concessions có thể do container
# (root) tạo nên không ghi trực tiếp được.
TMP = Path("/tmp/galaxy_concessions")
TMP.mkdir(parents=True, exist_ok=True)

W, H = 600, 600

# (file, tên hiển thị, màu chủ đạo, màu phụ, nhãn phụ)
CONCESSIONS = [
    ("popcorn-m.jpg", "BẮP RANG\nBƠ (M)", (58, 40, 20), (232, 176, 92), "BẮP RANG BƠ • SIZE M"),
    ("popcorn-l.jpg", "BẮP RANG\nBƠ (L)", (58, 40, 20), (232, 176, 92), "BẮP RANG BƠ • SIZE L"),
    ("coke-m.jpg", "COCA COLA\n(M)", (26, 52, 74), (96, 178, 224), "NƯỚC GIẢI KHÁT • SIZE M"),
    ("coke-l.jpg", "COCA COLA\n(L)", (26, 52, 74), (96, 178, 224), "NƯỚC GIẢI KHÁT • SIZE L"),
    ("combo1.jpg", "COMBO 1", (92, 34, 62), (232, 132, 176), "BẮP M + NƯỚC M"),
    ("combo2.jpg", "COMBO 2", (92, 34, 62), (232, 132, 176), "BẮP L + 2 NƯỚC M"),
    ("nachos.jpg", "NACHOS", (46, 54, 26), (168, 206, 96), "SNACK • TẨM SỐT"),
    ("hotdog.jpg", "HOT DOG", (66, 30, 24), (226, 130, 92), "SNACK • XÚC XÍCH"),
]

FONT_DIRS = [
    Path("/usr/share/fonts/truetype/dejavu"),
    Path("/usr/share/fonts/truetype/lato"),
    Path("/usr/share/fonts/truetype/liberation"),
]


def find_font(*names):
    for directory in FONT_DIRS:
        for name in names:
            candidate = directory / name
            if candidate.exists():
                return str(candidate)
    return None


BOLD = find_font("DejaVuSans-Bold.ttf", "Lato-Bold.ttf", "LiberationSans-Bold.ttf")
REGULAR = find_font("DejaVuSans.ttf", "Lato-Regular.ttf", "LiberationSans-Regular.ttf")


def gradient(size, top, bottom):
    width, height = size
    base = Image.new("RGB", (1, height))
    pixels = base.load()
    for y in range(height):
        t = y / max(1, height - 1)
        pixels[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return base.resize((width, height), Image.BILINEAR)


def make_image(filename, title, color_a, color_b, tag):
    image = gradient((W, H), color_a, tuple(max(0, c - 22) for c in color_a))
    draw = ImageDraw.Draw(image)

    # Vòng sáng toả tròn ở giữa gợi hình quang
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for radius, alpha in ((280, 26), (190, 40), (110, 60)):
        gdraw.ellipse(
            (W // 2 - radius, H // 2 - radius, W // 2 + radius, H // 2 + radius),
            fill=tuple(int(c * alpha / 60) for c in color_b),
        )
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    image = Image.blend(image, Image.blend(image, glow, 0.5), 0.55)
    draw = ImageDraw.Draw(image)

    # Nhấn tối ở chân ảnh để chữ nổi bật
    for y in range(int(H * 0.6), H):
        alpha = (y - H * 0.6) / (H * 0.4)
        draw.rectangle(
            [0, y, W, y + 1],
            fill=tuple(int(c * (1 - 0.4 * alpha)) for c in image.getpixel((W // 2, y))),
        )

    lines = title.split("\n")
    size = 66 if len(lines) <= 2 else 54
    font = ImageFont.truetype(BOLD, size) if BOLD else ImageFont.load_default()
    tag_font = ImageFont.truetype(REGULAR, 24) if REGULAR else ImageFont.load_default()

    # Tên món (canh giữa)
    y = H // 2 - (len(lines) * size * 1.18) // 2
    for line in lines:
        box = draw.textbbox((0, 0), line, font=font)
        draw.text(((W - (box[2] - box[0])) // 2, y), line, font=font, fill=(255, 255, 255))
        y += int(size * 1.18)

    # Nhãn phụ
    tag_box = draw.textbbox((0, 0), tag, font=tag_font)
    tag_w = tag_box[2] - tag_box[0]
    draw.rounded_rectangle(
        ((W - tag_w) // 2 - 16, y + 24, (W + tag_w) // 2 + 16, y + 24 + 42),
        radius=21,
        fill=(255, 255, 255, 30),
        outline=color_b,
        width=2,
    )
    draw.text(((W - tag_w) // 2, y + 32), tag, font=tag_font, fill=(240, 240, 245))

    # Logo Galaxy
    logo_font = ImageFont.truetype(BOLD, 24) if BOLD else ImageFont.load_default()
    draw.text((28, H - 50), "GALAXY CINEMA", font=logo_font, fill=(255, 255, 255))

    path = TMP / filename
    image.save(path, "JPEG", quality=88, optimize=True)
    return path


if __name__ == "__main__":
    import shutil

    for entry in CONCESSIONS:
        p = make_image(*entry)
        print(f"  {p.name}  ({p.stat().st_size // 1024} KB)")
    for entry in CONCESSIONS:
        src = TMP / entry[0]
        dst = OUT / entry[0]
        shutil.copyfile(src, dst)
    print(f"\nDone: {len(CONCESSIONS)} images -> {OUT}")
