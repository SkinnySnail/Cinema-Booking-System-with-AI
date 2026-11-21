# 🎬 Galaxy Cinema — Hệ Thống Đặt Vé Rạp Chiếu Phim Tích Hợp AI

> **Đồ án chuyên ngành** — Hệ thống quản lý và đặt vé trực tuyến cho chuỗi rạp chiếu phim, kết hợp 4 nhóm tính năng AI chạy hoàn toàn cục bộ.
>
> **Công nghệ:** React 18 + TypeScript · PHP 8 (MVC thuần) · MySQL 8.0 · FastAPI + scikit-learn + Ollama

---

## 1. Dự án này là gì?

**Galaxy Cinema** là hệ thống website đặt vé xem phim trực tuyến dành cho chuỗi rạp, mô phỏng lại toàn bộ vòng đời vận hành của một chuỗi rạp thật — từ khách hàng đặt vé online, đến nhân viên quầy bán vé (POS) và quét vé QR tại cổng, đến quản lý rạp, xếp lịch chiếu và ra báo cáo.

Điểm khác biệt của đồ án so với một hệ thống đặt vé thông thường là **tầng AI tích hợp sâu**: mô hình học máy không chỉ là gắn thêm ở giao diện, mà được đưa vào các quy trình nghiệp vụ thật — gợi ý phim cho khách, chatbot tra cứu lịch chiếu bằng tiếng Việt, phân tích cảm xúc đánh giá, và dự báo nhu cầu để hỗ trợ quản lý xếp lịch.

### Quy mô

| Hạng mục | Số liệu |
|---|---|
| Database | MySQL 8.0 — **38 bảng**, 43 khóa ngoại, InnoDB, utf8mb4 |
| Backend | PHP ~**27.000** dòng — 199 API routes, 25 controller, 34 model |
| Frontend | React + TypeScript ~**60.000** dòng |
| AI Service | Python ~**2.500** dòng (dịch vụ) + ~1.200 dòng (pipeline tune) |
| AI Tasks | 4 nhóm tính năng AI |
| Roles | 5 cấp phân quyền với RBAC động |

---

## 2. Kiến trúc hệ thống

```
┌──────────────────────────────────────────────────────────┐
│  REACT 18 + VITE + TYPESCRIPT                            │
│  shadcn/ui · Tailwind · React Query · Recharts           │
│  MapLibre · pdfmake · xlsx · Pusher · ZXing (QR)        │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTP/JSON · Bearer JWT
                        ▼
┌──────────────────────────────────────────────────────────┐
│  BACKEND PHP 8 — MVC thuần (không framework)            │
│  Router · Response · AuthMiddleware · JWT · Validator    │
│  Service layer: Booking · HoldSeat · Payment · AI · Pusher│
└───────────────────────┬──────────────────────────────────┘
                        │ PDO prepared statements
                        ▼
┌──────────────────────────────────────────────────────────┐
│  MySQL 8.0 — galaxy_cinema                               │
│  38 bảng · transaction ACID · JSON columns · utf8mb4     │
└───────────────────────┬──────────────────────────────────┘
                        │ X-AI-Key (internal only)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  AI SERVICE — FastAPI + scikit-learn                     │
│  engine.py · model_bundle.py · ollama_adapter.py         │
│  ↕ Ollama (qwen3-embedding 4B / 0.6B) — embeddings      │
└──────────────────────────────────────────────────────────┘
```

### Điểm kiến trúc đáng chú ý

**Tầng AI là "internal-only".** Trình duyệt không bao giờ chọn được URL model hay khóa dịch vụ. Backend PHP đóng vai trò cầu nối duy nhất (`backend/service/AIClient.php`), xác thực bằng header `X-AI-Key` so khớp HMAC. Khóa và URL chỉ nằm trong biến môi trường phía server, không bao giờ đưa vào `VITE_*`.

**Python không kết nối trực tiếp với database.** Luồng đúng là: PHP đọc MySQL → lọc/chuẩn hóa dữ liệu → đẩy sang Python qua HTTP. Dữ liệu chuyển sang tầng AI chỉ gồm **ID số, thuộc tính phim, văn bản đánh giá và số liệu tổng hợp** — không có tên, email, số điện thoại, mật khẩu hay thông tin thanh toán. Đây là quyết định thiết kế có chủ đích, được ghi rõ trong `docs/AI_INTEGRATION.md`.

**Mọi tính năng AI đều có cơ chế fallback.** Khi Ollama gián đoạn hoặc bundle không khớp phiên bản, dịch vụ tự động rơi về baseline TF-IDF dự phòng thay vì sập. Người dùng luôn nhận được câu trả lời.

---

## 3. Tính năng nghiệp vụ lõi

### 3.1. Phân quyền RBAC động (5 cấp)

```
Admin (5) ──► toàn quyền: phim, rạp, user, cấu hình hệ thống
  │
Manager (4) ──► xếp lịch, báo cáo, quản lý staff, quản lý khách sạn
  │               (giới hạn theo rạp phụ trách qua bảng cinema_staff)
Staff (3) ──► POS bán vé, quét vé QR, quản lý khách vãng lai
  │
Member (2) ──► đặt vé, tích điểm, quản lý booking cá nhân, viết đánh giá
  │
Guest (1) ──► xem thông tin công khai, lịch chiếu, giá vé
```

Khác biệt so với RBAC cứng thường thấy: quyền nằm trong bảng `permissions` / `role_permissions`, gán được từ giao diện Admin, và **mọi thay đổi đều được audit** vào `permission_audit_logs` (lưu `old_value`/`new_value` dạng JSON native của MySQL 8).

### 3.2. Luồng đặt vé (nghiệp vụ cốt lõi)

```
Chọn phim → Chọn rạp → Chọn suất chiếu → Chọn ghế
    → Giữ ghế 5-10 phút (seat_holds)
    → Bắp nước (concessions) + Voucher + Promotion
    → Thanh toán (MoMo / VNPay / QR / tiền mặt tại quầy)
    → Vé QR sinh tự động + tích điểm loyalty
    → Staff quét QR tại cổng → vé chuyển SOLD → USED
```

- **Giữ ghế có timeout** — worker `HoldSeatWorker.php` dọn ghế hết hạn, tránh "ngồi giữ chỗ" rò rỉ.
- **Transaction ACID** — tạo booking + tickets phải atomic (`beginTransaction` / `commit` / `rollBack`).
- **Giờ giới nghiêm theo tuổi** — dưới 13 tuổi phải về trước 22:00, dưới 16 tuổi trước 23:00.
- **Quota phim Việt** — tối thiểu 15% số suất chiếu phải là phim Việt, kiểm tra cả trong thuật toán xếp lịch AI.
- **Rate limiting** — 100 request / 60 giây.

### 3.3. Các module khác

| Module | Mô tả |
|---|---|
| **Quản lý rạp** | Rạp, phòng chiếu, hàng ghế, loại ghế (Standard/VIP/Sweetbox), cấu hình giá theo suất |
| **Bắp nước (Concession)** | Menu đồ ăn/uống, quản lý tồn kho riêng theo từng rạp |
| **Khuyến mãi** | Promotion (giảm giá, theo ngày lễ) + Voucher (mã cá nhân, sinh nhật) |
| **Loyalty** | Tích điểm 10.000đ = 1 điểm, đổi voucher, hạng thành viên |
| **POS tại quầy** | Nhân viên bán vé trực tiếp, hỗ trợ khách vãng lai không cần tài khoản |
| **Quét vé QR** | ZXing browser, lịch sử quét, chống quét trùng |
| **Báo cáo** | Doanh thu, tỉ lệ lấp đầy, xu hướng theo biểu đồ Recharts |
| **Thông báo** | Realtime qua Pusher + hệ thống notification nội bộ |
| **Bản đồ rạp** | MapLibre GL + geocoding, hiển thị rạp gần vị trí người dùng |
| **Xuất báo cáo** | pdfmake (in vé, hóa đơn) + xlsx (import phim/hàng hóa) |
| **Email** | SMTP Gmail — xác minh tài khoản, đặt lại mật khẩu, gửi voucher |

---

## 4. 🔥 4 tính năng AI — phần "hot" nhất của đồ án

Đây là phần khác biệt rõ nhất so với các hệ thống đặt vé thông thường. Toàn bộ mô hình **chạy cục bộ, trên CPU, không cần khóa API của nhà cung cấp AI nào** (OpenAI/Gemini…).

### 4.1. Trợ lý điện ảnh (Chatbot) — 🏆 tính năng nổi bật nhất

**Vấn đề:** người dùng muốn hỏi "tối nay rạp Nguyễn Du còn suất nào?" — cần người thật trả lời.

**Cách hoạt động:**
1. Bộ phân loại ý định **TF-IDF char n-gram (2-5) + Logistic Regression** nhận câu hỏi tiếng Việt không dấu, phân ra 9 intent: `greeting, recommend, showtimes, booking, cinemas, concessions, loyalty, payment, cancel`.
2. Có thể thay classifier bằng **Ollama qwen3-embedding 4B** (hybrid) nếu tune được.
3. Entity extraction: nhận diện **tên phim** (tra danh mục), **tên rạp**, và **ngày/giờ** (sáng/trưa/chiều/tối/đêm mai, "cuối tuần", "từ 12/11 đến 15/11").
4. PHP truy vấn **suất chiếu thật** trong MySQL, lọc theo rạp/ngày/giờ/thể loại, trả kèm link điều hướng.

**Xử lý ngôn ngữ khó** (chi tiết đáng chú ý trong code):
- Phân biệt **"chiếu"** (chiếu phim) với **"chiều"** (chiều mai) — accent folding làm hai từ này giống nhau, cần negative lookbehind `(?<!lich )\b...`.
- Tên phim **"MAI"** không bị nhầm với "mai" (ngày mai) — chỉ strip date mention khi title thực sự là "mai".
- Tên phim ngắn nằm trong tên phim dài không bị tính thành 2 phim.
- Câu hợp nhất: *"Tối nay rạp Nguyễn Du còn suất nào không? Muốn xem phim hành động nên xem phim nào"* → vừa tra lịch, vừa gợi ý, lấy thể loại từ danh mục.
- Lọc thể loại chấp nhận có/không dấu, hỗ trợ **loại trừ** ("không thích phim kinh dị").
- Cụm "cặp đôi", "hẹn hò" → `audience: "couple"`, ưu tiên phim tình cảm/hài.
- Nếu không có suất đúng điều kiện → chatbot **báo không tìm thấy** thay vì gợi ý phim sai thể loại/sai ngày.

**Ngữ cảnh hội thoại:** PHP lưu ngữ cảnh phim/rạp/ngày, có TTL (mặc định 15 phút). Câu hợp nhất giữ được ngữ cảnh lượt trước; câu hỏi chung thì bỏ bộ lọc cũ.

**Cấu hình được** trong Admin → Cấu hình hệ thống → Cấu Hình Chatbot (bảng `system_configs`): số ngày tra cứu (1–7), số suất hiển thị/ngày, policy khi rỗng, TTL context, chính sách ambiguity.

### 4.2. Gợi ý phim & combo — 🎯 cá nhân hóa

**Mô hình hybrid 3 tầng:**
- **TF-IDF content-based** — so khớp phim dựa trên nội dung/thể loại
- **Collaborative filtering** — ma trận tương tác người–phim
- **TruncatedSVD** — giảm chiều ma trận, tính điểm tương đồng

Khi có Ollama, phim được embed bằng `qwen3-embedding:4b` và kết hợp với ranker đã tune. Khách mới (cold start) → độ phổ biến.

**Bộ lọc nghiệp vụ chặt chẽ:**
- Chỉ trả phim **có suất chiếu tương lai**, chưa ngừng chiếu
- Loại phim phân loại **C** (18+)
- **Áp dụng giới hạn tuổi** nếu hồ sơ có ngày sinh (kết hợp giờ giới nghiêm)
- Combo bắp nước xếp theo lịch sử mua + độ phổ biến, có kiểm tra tồn kho, lọc theo rạp

### 4.3. Phân tích cảm xúc đánh giá — 📊 giúp nhà quản lý

- Admin/Manager bấm "phân tích" trên tối đa 100 đánh giá đang lọc
- Trả **nhãn** (tích cực/tiêu cực/trung tính) + **xác suất mô hình** + **cờ `needs_review`** khi confidence thấp
- Manager chỉ đọc được đánh giá của phim **từng chiếu tại rạp mình phụ trách**
- **Không tự động sửa/xóa/ẩn** đánh giá — công cụ chỉ hỗ trợ, quyết định vẫn thuộc con người
- Corpus bootstrap ~3.200 mẫu có nhãn; có thể thay bằng Ollama 0.6B

### 4.4. Dự báo nhu cầu & sinh lịch — 📈 quản trị vận hành

- Mục tiêu dự báo: **tỉ lệ lấp đầy** = số vé đã thanh toán / số ghế hoạt động
- **RandomForestRegressor** với đặc trưng: phim, thứ trong tuần, khung giờ
- Lấy tối đa **180 ngày** lịch sử; train model **riêng cho từng rạp** (`cinema_id`), chỉ dùng model đúng rạp đó
- **Chỉ điều chỉnh thứ tự** chọn trong nhóm phim hợp lệ — không tự ý xếp lịch
- Giữ đầy đủ các ràng buộc nghiệp vụ: thời lượng phim, ngày phát hành, phân loại, trùng phòng, giờ hoạt động, quota phim Việt
- Có **xem trước → xác nhận → lưu** (preview trước khi ghi)

---

## 5. Pipeline huấn luyện AI cục bộ (`local-ai-tuning/`)

Đây là phần "học thuật" của đồ án — tách riêng khỏi dịch vụ runtime để có thể tune offline rồi xuất **bundle** cho hệ thống nạp.

```
prepare → tune → evaluate → bundle → inspect → demo
```

| Thành phần | Vai trò |
|---|---|
| `cinema_tuning/data.py` | Kiểm tra dữ liệu, khử trùng, chia tập train/val/test (60/20/20 theo nhóm) |
| `cinema_tuning/training.py` | Grid search, đánh giá, **cổng chất lượng**, tạo bundle |
| `cinema_tuning/public_data.py` / `public_tabular.py` | Bộ dữ liệu công khai (MovieLens) cho thử nghiệm |
| `export_database.php` | Xuất snapshot MySQL **chỉ đọc** (transaction `READ ONLY`, nên dùng tài khoản chỉ có quyền SELECT) |
| `export_ollama_bundle.py` | Xuất bundle Ollama |

**Nguyên tắc thiết kế quan trọng:**
- **Chia theo nhóm** (`group_id`) cho sentiment/intent — câu cùng nguồn/phim/họ mẫu không nằm ở nhiều tập → tránh rò rỉ dữ liệu.
- **Chia theo thời gian** cho forecast/recommendation — không xáo trộn; các hàng cùng thời điểm luôn cùng tập.
- **Cổng chất lượng** (`min_macro_f1`, `review_precision`, `max_mae`, `min_ndcg`) — không xuất bundle nếu chưa đạt ngưỡng.
- **Provenance tracking** — mọi bundle ghi lại nguồn dữ liệu, số lượng mẫu, phiên bản scikit-learn/NumPy/joblib. Dịch vụ **từ chối nạp** bundle lệch phiên bản.
- Dữ liệu huấn luyện **không chứa** tên/email/thông tin thanh toán khách hàng.

**Grid tham số hiện tại** (`configs/default.json`):

| Task | Grid |
|---|---|
| sentiment | analyzer × C ∈ {0.5, 2.0, 8.0} |
| intent | analyzer × C ∈ {1.0, 4.0, 12.0} |
| forecast | max_depth × min_samples_leaf × n_estimators=60 |
| recommendation | weights (3 tổ hợp) × svd_rank ∈ {8, 16}, k=6 |

---

## 6. Cấu trúc thư mục

```text
├── backend/                     # PHP API (MVC thuần)
│   ├── index.php                # Cửa chính — 199 routes
│   ├── core/                    # Router · Response
│   ├── middleware/              # AuthMiddleware (JWT+RBAC) · CorsMiddleware
│   ├── controllers/             # 25 controller
│   ├── models/                  # 34 model
│   ├── service/                 # Booking · HoldSeat · Payment · AIClient · Pusher
│   ├── worker/HoldSeatWorker.php
│   ├── database/                # schema.sql + 26 migration
│   └── utils/                   # JWT · Validator · EmailService · CloudinaryUploader
│
├── source-code/galaxy-cinema-hub-main/   # React frontend
│   └── src/
│       ├── pages/{admin,manager,staff}/  # Theo vai trò
│       ├── components/ai/       # CinemaAssistant · Recommendations · Sentiment · AIScheduling
│       ├── services/            # api clients · permissions.ts
│       └── contexts/            # AppContext · ThemeContext
│
├── ai-service/                  # FastAPI + sklearn
│   ├── app.py                   # 5 endpoint nội bộ
│   ├── engine.py                # Baseline + tuned models
│   ├── model_bundle.py          # Nạp bundle có kiểm tra version
│   ├── ollama_adapter.py        # Embeddings + Classifier cho Ollama
│   └── data/sentiment.csv
│
├── local-ai-tuning/             # Pipeline tune offline
├── docs/                        # ERD, đặc tả, luận văn, hướng dẫn Docker
└── docker*.yml                  # Bộ compose: dev / AI / Ollama / deploy
```

---

## 7. Chạy dự án

### Docker (đầy đủ, có AI)

```bash
docker compose -f docker.yml -f docker-compose.ai.yml -f docker-compose.ollama.yml --profile ai up -d --build
```

| Service | Cổng |
|---|---|
| Frontend | 8080 / 8081 |
| Backend API | 8000 |
| AI Service | nội bộ (không public) |
| MySQL | 3307 / 3308 |

### Windows — 1 click

```powershell
# Nhấp đúp start-chatbot.cmd, hoặc:
.\start-chatbot.ps1
```

Script tự: kiểm tra bundle → mở Docker Desktop + Ollama → tải encoder còn thiếu → khởi động 4 dịch vụ → làm nóng model → kiểm tra endpoint → mở trình duyệt tại `http://localhost:8081/?chat=1`.

Tuỳ chọn: `-NoBrowser`, `-WebPort`, `-ApiPort`, `-DatabasePort`, `-BundleDirectory`, `-SeedShowtimes`, `-NoBuild`.

### Chạy tay (không Docker)

```bash
# AI service
pip install -r ai-service/requirements.txt
AI_SERVICE_KEY=<random-hex> AI_MODEL_DIR=<bundle> uvicorn app:app --host 127.0.0.1 --port 8001

# Backend — cùng AI_SERVICE_KEY
php -S localhost:8000 -t backend backend/index.php

# Frontend
cd source-code/galaxy-cinema-hub-main && npm ci && npm run dev
```

### Tài khoản mặc định

| Role | Email | Password |
|---|---|---|
| Admin | admin@galaxy.vn | password |
| Manager | manager@galaxy.vn | password |
| Staff | staff@galaxy.vn | password |

---

## 8. Tóm tắt điểm mạnh

1. **AI chạy thật, không phải đồ trang trí** — 4 mô hình được huấn luyện, đánh giá, có cổng chất lượng và nằm trong quy trình nghiệp vụ thật (gợi ý phim, chatbot tra suất chiếu, phân tích đánh giá, xếp lịch).
2. **Toàn bộ cục bộ** — không cần khóa API trả phí, chạy được trên CPU, có thể tune lại bằng dữ liệu riêng của rạp.
3. **Thiết kế fallback kỹ** — mất Ollama thì hệ thống vẫn chạy, chỉ giảm chất lượng.
4. **RBAC động có audit** — gán quyền từ UI, mọi thay đổi được ghi log dạng JSON.
5. **Tách biệt tầng AI an toàn** — dữ liệu khách hàng không rời khỏi backend; Python chỉ nhận số liệu tổng hợp.
6. **Nghiệp vụ chặt chẽ** — giờ giới nghiêm, quota phim Việt, giữ ghế timeout, transaction atomic cho booking.
7. **Stack hiện đại** — React Query (cache), Pusher (realtime), MapLibre (bản đồ), ZXing (QR), recharts (biểu đồ), pdfmake/xlsx (import-export).

---

## 9. Ghi chú kỹ thuật cần lưu ý

> Các mục dưới đây là **vấn đề cần xử lý**, không phải tính năng.

| Vấn đề | Vị trí | Mức độ |
|---|---|---|
| **Secret hardcode** — SMTP password, JWT secret, MoMo/VNPay credentials nằm trong `Config.php` và `.env` đã commit | `backend/config/Config.php`, `backend/.env` | 🔴 Cao |
| **Mật khẩu DB `root` / `12345678`** mặc định ở cả 3 file compose | `docker.yml`, `docker-compose.deploy.yml`, `.env` | 🔴 Cao |
| File debug/test tạm nằm trong thư mục production (`debug_*.php`, `test_*.php`, `check_*.php` — hàng chục file) | `backend/` | 🟡 Trung bình |
| Migration **không tự động** — 26 file phải chạy tay từng cái một | `backend/database/migrations/` | 🟡 Trung bình |
| Tài liệu trùng lặp — 5 file .md đều nói về RBAC | root | 🟢 Thấp |
| File rác ở root repo (`check_*.php`, `*.json` output, `db_out.txt`) | root | 🟢 Thấp |

**Khuyến nghị trước khi nộp bài / đưa lên production:**
- Gỡ toàn bộ secret khỏi code, đọc từ biến môi trường, rotate các key đã lộ.
- Dùng tài khoản MySQL riêng cho từng vai trò (app user, tuning reader chỉ SELECT).
- Tách file debug/test sang thư mục riêng hoặc thêm vào `.gitignore`.

---

*Tài liệu được tổng hợp từ mã nguồn trong repo. Xem `docs/AI_INTEGRATION.md` cho chi tiết tích hợp AI, `docs/ERD.docx` cho lược đồ CSDL, `AUTHORIZATION_SYSTEM.md` cho hệ thống phân quyền.*
