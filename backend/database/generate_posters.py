"""Sinh poster cho các phim trong seed_movies_current.sql.

Không dùng ảnh thật của phim (bản quyền). Thay vào đó dựng poster dạng
gradient + typography với tên phim, đủ để giao diện hiển thị đúng layout
thay vì ảnh vỡ (broken image).

Chạy:  python3 backend/database/generate_posters.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "uploads" / "posters"
OUT.mkdir(parents=True, exist_ok=True)

# Ghi ra thư mục tạm rồi copy lại: thư mục uploads/posters có thể do container
# (root) tạo nên không ghi trực tiếp được.
TMP = Path("/tmp/galaxy_posters")
TMP.mkdir(parents=True, exist_ok=True)

W, H = 600, 900

# (file, tiêu đề hiển thị trên poster, màu chủ đạo, màu phụ, nhãn phụ)
POSTERS = [
    ("bo-sua-bay.jpg", "BÒ SỮA\nBAY", (34, 92, 74), (126, 200, 160), "PHIM VIỆT • T18"),
    ("ngay-con-con-me.jpg", "NGÀY CON\nCÒN MẸ", (120, 42, 66), (226, 140, 160), "PHIM VIỆT • T16"),
    ("trai-giam-hanh-phuc.jpg", "TRẠI GIAM\nHẠNH PHÚC", (58, 58, 70), (168, 168, 180), "PHIM VIỆT • T16"),
    ("chi-chi-em-em-3.jpg", "CHỊ CHỊ\nEM EM 3", (92, 26, 48), (214, 116, 132), "PHIM VIỆT • T18"),
    ("an-mang-karaoke.jpg", "ÁN MẠNG\nKARAOKE", (46, 22, 72), (168, 116, 224), "PHIM VIỆT • T13"),
    ("trai-buon-nguoi.jpg", "TRẠI BUÔN\nNGƯỜI", (28, 40, 66), (110, 148, 200), "PHIM VIỆT • T18"),
    ("hunger-games-sunrise.jpg", "ĐẤU TRƯỜNG\nSINH TỬ", (86, 40, 18), (226, 156, 78), "PHIM QUỐC TẾ • T13"),
    ("godzilla-minus-zero.jpg", "GODZILLA\nTRỪ KHÔNG", (22, 48, 66), (92, 166, 208), "PHIM QUỐC TẾ • T18"),
    ("cat-in-the-hat.jpg", "CHÀNG MÈO\nMANG MŨ", (140, 30, 40), (240, 140, 150), "PHIM QUỐC TẾ • P"),
    ("clayface.jpg", "CLAYFACE", (58, 26, 32), (216, 88, 78), "PHIM QUỐC TẾ • T18"),
    ("ebenezer.jpg", "EBENEZER\nPHÉP MÀU ĐÊM\nGIÁNG SINH", (26, 42, 34), (120, 190, 132), "PHIM QUỐC TẾ • T13"),
    ("ramayana.jpg", "RAMAYANA", (96, 52, 18), (238, 178, 86), "PHIM QUỐC TẾ • T13"),
    ("me-min.jpg", "MẸ MÌN\nGIAO KÈO\nVỚI QUỶ", (44, 16, 58), (188, 96, 216), "SẮP CHIẾU • T18"),
    ("kumanthong.jpg", "KUMANTHONG\nQUỶ THẮP\nNHANG", (30, 28, 30), (176, 168, 160), "SẮP CHIẾU • T16"),
    ("gap-go-thong-gia.jpg", "GẶP GỠ\nTHÔNG GIA", (128, 62, 20), (240, 186, 120), "SẮP CHIẾU • P"),
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


def make_poster(filename, title, color_a, color_b, tag):
    image = gradient((W, H), color_a, tuple(max(0, c - 28) for c in color_a))
    draw = ImageDraw.Draw(image)

    # Vòng sáng toả tròn gợi hình quang
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for radius, alpha in ((300, 26), (210, 40), (130, 60)):
        gdraw.ellipse(
            (W // 2 - radius, 300 - radius, W // 2 + radius, 300 + radius),
            fill=tuple(int(c * alpha / 60) for c in color_b),
        )
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    image = Image.blend(image, Image.blend(image, glow, 0.5), 0.55)
    draw = ImageDraw.Draw(image)

    # Nhấn tối ở chân poster để chữ nổi bật
    for y in range(int(H * 0.55), H):
        alpha = (y - H * 0.55) / (H * 0.45)
        draw.rectangle([0, y, W, y + 1],
                       fill=tuple(int(c * (1 - 0.45 * alpha)) for c in image.getpixel((W // 2, y))))

    lines = title.split("\n")
    size = 64 if len(lines) <= 2 else 50
    font = ImageFont.truetype(BOLD, size) if BOLD else ImageFont.load_default()
    tag_font = ImageFont.truetype(REGULAR, 22) if REGULAR else ImageFont.load_default()

    # Tên phim (canh giữa)
    y = H // 2 - (len(lines) * size * 1.18) // 2 + 30
    for line in lines:
        box = draw.textbbox((0, 0), line, font=font)
        draw.text(((W - (box[2] - box[0])) // 2, y), line, font=font, fill=(255, 255, 255))
        y += int(size * 1.18)

    # Nhãn phụ
    tag_box = draw.textbbox((0, 0), tag, font=tag_font)
    tag_w = tag_box[2] - tag_box[0]
    draw.rounded_rectangle(
        ((W - tag_w) // 2 - 16, y + 26, (W + tag_w) // 2 + 16, y + 26 + 40),
        radius=20, fill=(255, 255, 255, 30), outline=color_b, width=2,
    )
    draw.text(((W - tag_w) // 2, y + 34), tag, font=tag_font, fill=(240, 240, 245))

    # Logo Galaxy
    logo_font = ImageFont.truetype(BOLD, 26) if BOLD else ImageFont.load_default()
    draw.text((34, H - 56), "GALAXY CINEMA", font=logo_font, fill=(255, 255, 255))

    path = TMP / filename
    image.save(path, "JPEG", quality=88, optimize=True)
    return path


if __name__ == "__main__":
    for entry in POSTERS:
        p = make_poster(*entry)
        print(f"  {p.name}  ({p.stat().st_size // 1024} KB)")
    import shutil
    for entry in POSTERS:
        src = TMP / entry[0]
        dst = OUT / entry[0]
        shutil.copyfile(src, dst)
    print(f"\nDone: {len(POSTERS)} posters -> {OUT}")
