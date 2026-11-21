# CI/CD — Galaxy Cinema

Tài liệu này hướng dẫn cấu hình và vận hành pipeline CI/CD của dự án.

---

## 1. Tổng quan

Dự án **chưa có** CI/CD trước khi cấu hình này. Đã bổ sung:

| File | Vai trò |
|---|---|
| `.github/workflows/ci.yml` | **CI** — kiểm tra tự động mỗi lần push / mở PR |
| `.github/workflows/cd.yml` | **CD** — build Docker image + deploy lên server production |
| `deploy.sh` | Script deploy chạy trên server (dùng tay hoặc SSH từ Actions) |
| `source-code/galaxy-cinema-hub-main/.eslint-baseline.json` | Baseline lint (cho phép nợ lint cũ, chặn lỗi mới) |
| `source-code/galaxy-cinema-hub-main/scripts/eslint-baseline-*.mjs` | Script kiểm tra / cập nhật baseline |

### Kiến trúc

```
push / PR  ──►  CI (ci.yml)           ──►  push main  ──►  CD (cd.yml)
                   │                                        │
                   ├─ frontend: lint + typecheck + test + build│
                   ├─ backend:  PHP syntax check + SQL files  │
                   ├─ ai-service: pytest (63 test)            │
                   ├─ docker:  build 3 image                  │
                   └─ security: gitleaks secret scan         │
                                                            ▼
                                              build → push GHCR → SSH deploy
                                                            │
                                                            ▼
                                              docker compose up + health check
```

---

## 2. CI (Continuous Integration)

File: `.github/workflows/ci.yml`

**Trigger:** push lên `main` / `develop`, mở PR vào `main` / `develop`, hoặc chạy tay (`workflow_dispatch`).

### Job `frontend`
| Bước | Lệnh | Ý nghĩa |
|---|---|---|
| Install | `npm ci` | Cài đúng version trong `package-lock.json` |
| Lint | `npm run lint:check` | So với `.eslint-baseline.json` — lỗi mới thì fail |
| Typecheck | `npm run typecheck` | `tsc --noEmit`, lỗi type = fail |
| Test | `npm run test` | Vitest (7 test hiện tại) |
| Build | `npm run build` | Vite production build → upload artifact |

### Job `backend`
- `php -l` trên **toàn bộ 146 file PHP** (dùng `-print0` để an toàn với tên file có ký tự đặc biệt).
- Kiểm tra 3 file SQL bắt buộc tồn tại: `schema.sql`, `seed_data.sql`, `auto_seed_current_showtimes.sql`.

> Dự án chưa có PHPUnit nên backend mới chỉ kiểm tra syntax. Khi thêm test, đưa `composer install` + `vendor/bin/phpunit` vào job này.

### Job `ai-service`
- `pip install -r requirements.txt` → `pytest tests/`
- Cài **PHP 8.2** và set `PHP_BIN=php` để `test_php_bridge.py` **chạy thật** thay vì skip.
  - Không có PHP: 53 test pass, 10 test skip.
  - Có PHP: **63 test pass, 0 skip** (đã kiểm chứng).

### Job `docker`
Build cả 3 image (không push) để chắc chắn Dockerfile không vỡ:
- `Dockerfile` (backend PHP)
- `source-code/galaxy-cinema-hub-main/Dockerfile` (frontend nginx)
- `ai-service/Dockerfile` (Python FastAPI)

Có GHA cache layer để build nhanh.

### Job `security`
- **gitleaks** quét secrets lỡ commit nhầm (biến `secrets.GITLEAKS_LICENSE` — bỏ trống thì job vẫn chạy ở chế độ free).
- Báo cáo SARIF upload lên Security tab.

### Job `ci-status`
Job tổng hợp — fail nếu bất kỳ job bắt buộc nào fail. Dùng làm **required check** khi bật branch protection.

---

## 3. Baseline lint — cách hoạt động

Dự án có sẵn **94 lỗi lint** (86 là `@typescript-eslint/no-explicit-any`) trải rộng 43 file. Sửa hết là việc lớn, không thuộc phạm vi CI/CD.

Thay vì để CI fail ngay lập tức (khiến CI vô dụng), tao dùng cơ chế **baseline**:

- `.eslint-baseline.json` ghi lại số lỗi của từng file theo từng rule.
- `npm run lint:check` so kết quả hiện tại với baseline:
  - Lỗi **đã có** trong baseline → bỏ qua.
  - Lỗi **mới** (file mới, hoặc file cũ phát sinh lỗi thêm) → **CI fail**.

```bash
cd source-code/galaxy-cinema-hub-main

npm run lint:check      # kiểm tra (dùng trong CI)
npm run lint:baseline   # cập nhật baseline sau khi sửa lỗi
npm run lint            # eslint thuần (94 lỗi cũ — để biết tổng)
```

Khi nợ lint được sửa dần, chạy `npm run lint:baseline` để **nén** baseline lại.

---

## 4. CD (Continuous Deployment)

File: `.github/workflows/cd.yml`

**Trigger:** push lên `main`, hoặc chạy tay qua `workflow_dispatch` với 2 option:
- `deploy_ai` — có deploy luôn AI service không (`true`/`false`)
- `skip_migrations` — có chạy script sinh lịch chiếu không (`true`/`false`)

### Job `build`
Build + push 3 image lên **GHCR** với tag theo commit SHA:

```
ghcr.io/SkinnySnail/Cinema-Booking-System-with-AI/backend:<sha>
ghcr.io/SkinnySnail/Cinema-Booking-System-with-AI/frontend:<sha>
ghcr.io/SkinnySnail/Cinema-Booking-System-with-AI/ai-service:<sha>
```

Frontend build với `build-args` lấy từ **Repository Variables** (`VITE_API_URL`, `VITE_PUSHER_KEY`, ...).

### Job `deploy`
1. Cấu hình SSH key + `known_hosts`.
2. SSH vào server, chạy script deploy:
   - `docker login ghcr.io`
   - **Backup `.env`** trước khi ghi (`/env.bak.<timestamp>`).
   - Ghi `BACKEND_IMAGE` / `FRONTEND_IMAGE` / `AI_IMAGE` vào `.env` (giữ nguyên các biến khác).
   - `docker pull` image mới.
   - Chạy migration (`auto_seed_current_showtimes.sql`).
   - `docker compose -f docker-compose.deploy.yml up -d --remove-orphans --no-build`.
3. **Health check** — poll `GET /api/health` tối đa 30 lần (mỗi lần 10s). Fail thì in log backend.
4. **Rollback tự động** nếu deploy lỗi: khôi phục `.env` từ backup rồi `up -d` lại.

Dùng `environment: production` → GitHub hiện màn hình **"Approve and deploy"** trước khi chạy (cần cấu hình protection rule trong Settings → Environments).

---

## 5. Cấu hình cần thiết trên GitHub

### 5.1. Repository Secrets (Settings → Secrets and variables → Actions)

> **Trạng thái hiện tại:** đã tạo sẵn 4 secret dưới đây nhưng **giá trị là placeholder** —
> cần thay bằng thông tin thật của server trước khi deploy lần đầu.

| Secret | Đã tạo | Giá trị placeholder | Mô tả |
|---|---|---|---|
| `DEPLOY_SSH_KEY` | ✅ | `REPLACE_ME_PUT_YOUR_PRIVATE_KEY_HERE` | Private key SSH để login server. Format PEM, kết thúc bằng `-----END OPENSSH PRIVATE KEY-----` |
| `DEPLOY_HOST` | ✅ | `REPLACE_ME` | IP hoặc domain server, ví dụ `203.0.113.10` |
| `DEPLOY_USER` | ✅ | `deploy` | User SSH, ví dụ `root` hoặc `deploy` |
| `DEPLOY_PATH` | ✅ | `/opt/galaxy-cinema` | Đường dẫn project trên server |
| `GITLEAKS_LICENSE` | ❌ | — | Key gitleaks (bỏ trống vẫn chạy free) |

Cập nhật lại giá trị:
```bash
gh secret set DEPLOY_SSH_KEY < ~/.ssh/galaxy_deploy
gh secret set DEPLOY_HOST --body "203.0.113.10"
gh secret set DEPLOY_USER --body "deploy"
gh secret set DEPLOY_PATH --body "/opt/galaxy-cinema"
```

Tạo SSH key:
```bash
ssh-keygen -t ed25519 -C "github-actions-galaxy" -f ~/.ssh/galaxy_deploy
cat ~/.ssh/galaxy_deploy          # -> copy vào DEPLOY_SSH_KEY
cat ~/.ssh/galaxy_deploy.pub      # -> thêm vào ~/.ssh/authorized_keys trên server
```

### 5.2. Repository Variables (Settings → Secrets and variables → Actions → Variables)

> **Trạng thái hiện tại:** đã tạo sẵn toàn bộ variables dưới đây (lấy từ `.env` của dự án).

| Variable | Đã tạo | Giá trị hiện tại | Mô tả |
|---|---|---|---|
| `VITE_API_URL` | ✅ | `http://localhost:8000` | API URL mà trình duyệt dùng — **đổi sang domain thật khi lên production** |
| `VITE_PUSHER_KEY` | ✅ | *(lấy từ `.env`)* | Pusher key |
| `VITE_PUSHER_CLUSTER` | ✅ | `ap1` | Pusher cluster |
| `VITE_MAPTILER_KEY` | ✅ | *(lấy từ `.env`)* | MapTiler key |
| `VITE_ORS_API_KEY` | ✅ | *(lấy từ `.env`)* | OpenRouteService key |
| `VITE_ORS_API_KEY_2` | ✅ | *(lấy từ `.env`)* | OpenRouteService key thứ 2 |
| `DEPLOY_URL` | ✅ | `http://REPLACE_ME` | URL production (hiển thị trên GitHub Environment) |

Cập nhật:
```bash
gh variable set VITE_API_URL --body "https://api.galaxy-cinema.vn"
gh variable set DEPLOY_URL --body "https://galaxy-cinema.vn"
```

> `GITHUB_TOKEN` do GitHub tự cấp, không cần tạo.

### 5.3. Branch protection (khuyến nghị)

> **Cần quyền admin** — tài khoản hiện tại (`hhhuuunnnggg-design`) chỉ có quyền `push`,
> nên phần này **phải tự làm trên web UI** hoặc nhờ owner `SkinnySnail` set.

Settings → Branches → Add rule:
- Branch name pattern: `main`
- Require status checks to pass: tick **`CI Status`**
- Require branches to be up to date: tick

Khi đó, PR không pass CI sẽ không merge được.

### 5.4. Environment `production`

> **Cần quyền admin** (đã thử qua API → `403 Must have admin rights to Repository`).

Settings → Environments → New environment → tên `production`:
- Tick **Required reviewers** → thêm bạn làm reviewer (deploy phải được duyệt).
- Tick **Prevent self-review** nếu muốn chặn tự duyệt.

Nếu **không** tạo environment, CD vẫn chạy nhưng **không có bước duyệt thủ công** —
deploy sẽ tự động chạy ngay khi push lên `main`.

---

## 6. Chuẩn bị server production

```bash
# 1. Cài Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo apt-get install -y docker-compose-plugin git

# 2. Tạo user deploy (không nên dùng root)
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy

# 3. Clone project
sudo mkdir -p /opt/galaxy-cinema && sudo chown deploy:deploy /opt/galaxy-cinema
sudo -u deploy git clone <repo-url> /opt/galaxy-cinema

# 4. Tạo file .env
cd /opt/galaxy-cinema
cp .env.deploy.example .env
nano .env          # đổi MYSQL_ROOT_PASSWORD, VITE_API_URL...

# 5. Tạo backend/.env
cp backend/.env.example backend/.env
nano backend/.env # đổi JWT_SECRET, DB_*, VNPay/MoMo credentials...

# 6. Build & chạy lần đầu
docker compose -f docker-compose.deploy.yml build
docker compose -f docker-compose.deploy.yml up -d
docker compose -f docker-compose.deploy.yml ps
```

Sau đó đăng nhập GHCR trên server (để `deploy.sh` pull được):
```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

---

## 7. Chạy thử CI/CD

### Chạy CI giống hết ở local
```bash
# Frontend
cd source-code/galaxy-cinema-hub-main
npm ci && npm run lint:check && npm run typecheck && npm run test && npm run build

# Backend (cần PHP 8.2)
find backend -name '*.php' -not -path '*/vendor/*' -print0 \
  | xargs -0 -n1 php -l | grep -v "No syntax errors" || echo "PHP OK"

# AI service
cd ai-service && pip install -r requirements.txt && python -m pytest tests/ -v

# Docker
docker build -t galaxy-cinema-backend:ci .
docker build -t galaxy-cinema-frontend:ci ./source-code/galaxy-cinema-hub-main
docker build -t galaxy-cinema-ai:ci ./ai-service
```

### Deploy bằng tay (không qua Actions)
```bash
./deploy.sh
```

### Chạy workflow bằng GitHub CLI
```bash
gh workflow run ci.yml
gh workflow run cd.yml -f deploy_ai=true -f skip_migrations=false
gh run list
gh run view <run-id> --log
```

---

## 8. Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| `lint:check` fail với lỗi cũ | File cũ phát sinh lỗi mới | Sửa lỗi, hoặc `npm run lint:baseline` nếu chấp nhận |
| `typecheck` fail | Lỗi TypeScript mới | Sửa trong `src/` |
| `docker login` fail trên server | Chưa login GHCR | `echo "$TOKEN" \| docker login ghcr.io -u <user> --password-stdin` |
| Deploy fail ở bước health check | Container backend crash | `docker compose -f docker-compose.deploy.yml logs --tail=100 backend` |
| Health check timeout 5 phút | DB chưa healthy | Kiểm tra `docker compose ps`, xem log `db` |
| `Permission denied (publickey)` | SSH key sai | Kiểm tra `DEPLOY_SSH_KEY` có đủ dòng BEGIN/END không |
| Job `security` báo lỗi nhưng không chặn | `continue-on-error: true` | Cố ý — gitleaks chỉ cảnh báo, không block PR |

---

## 9. Ghi chú quan trọng

### Secrets trong repo
`.gitignore` đã loại `.env` và `backend/.env`. Nhưng các key như `VITE_ORS_API_KEY`, `VITE_MAPTILER_KEY` **đang nằm trong `.env.deploy.example`** (file được commit) — chúng là key công khai dùng cho frontend nên về mặt kỹ thuật không bí mật, nhưng nên rotate nếu đã bị lộ.

`backend/.env.example` chứa `JWT_SECRET=galaxy_cinema_secret_key_2026_change_this_in_production` — **phải đổi** trên production.

### AI service không nằm trong compose deploy
`docker-compose.deploy.yml` chỉ có `db`, `backend`, `frontend`. AI service nằm ở `docker-compose.ai.yml` với profile `ai` (dùng cho local dev). Trong CD, job `deploy` chỉ deploy AI khi `deploy_ai=true`; nếu muốn AI chạy production, cần thêm service `ai` vào `docker-compose.deploy.yml` và bỏ `profiles: [ai]`.

### `backend/uploads/` bị gitignore
Thư mục này chứa ảnh poster và ảnh bắp nước do `generate_posters.py` / `generate_concession_images.py` sinh ra. Deploy script **không** sinh lại ảnh — cần chạy:
```bash
python3 backend/database/generate_posters.py
python3 backend/database/generate_concession_images.py
```
trên server sau khi clone (ảnh sẽ mất khi deploy lần đầu nếu volume không được mount).
