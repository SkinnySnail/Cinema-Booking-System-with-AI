# Tune AI cục bộ cho Cinema Booking

Thư mục này dành riêng cho việc chuẩn bị dữ liệu, dò tham số, huấn luyện, đánh giá và xuất mô hình cho dịch vụ `ai-service/`. Có thể chạy trên CPU; không cần khóa OpenAI hay dịch vụ AI bên ngoài.

Phạm vi là các mô hình đang dùng trong hệ thống: sentiment/intent bằng TF-IDF + Logistic Regression, dự báo nhu cầu bằng Random Forest và bộ gợi ý hybrid TF-IDF/collaborative/SVD. Đây là tinh chỉnh mô hình ML và tham số gợi ý; chưa bao gồm fine-tune LLM bằng LoRA/QLoRA hoặc PhoBERT.

## Cấu trúc

```text
local-ai-tuning/
  tune.py                  # CLI chung
  configs/default.json     # Grid tham số và điều kiện xuất mô hình
  cinema_tuning/
    data.py                # Kiểm tra dữ liệu, khử trùng, chia tập
    training.py            # Tune, đánh giá, kiểm tra chất lượng, tạo bundle
    seed.py                # Dữ liệu mẫu tái lập được, luôn đánh dấu demo
    cli.py                 # prepare/tune/evaluate/bundle/inspect/demo
  export_database.php      # Xuất snapshot MySQL chỉ đọc
  templates/               # Mẫu CSV/JSON cho dữ liệu thật
  tests/                   # Kiểm thử pipeline và kết nối dịch vụ
  workspace/               # Dữ liệu, báo cáo, mô hình cục bộ; Git bỏ qua
```

Các file nối vào hệ thống: `ai-service/model_bundle.py`, `ai-service/engine.py`, `ai-service/app.py` và trường `cinema_id` trong snapshot dự báo của `backend/models/AIData.php`.

## Cài đặt

Chạy từ thư mục gốc repo bằng Python 3.11 hoặc 3.12:

```powershell
python -m venv local-ai-tuning/.venv
local-ai-tuning/.venv/Scripts/python.exe -m pip install -r local-ai-tuning/requirements.txt
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py --help
```

Môi trường tune dùng cùng requirements với dịch vụ AI. Manifest ghi phiên bản scikit-learn, NumPy và joblib; dịch vụ từ chối nạp bundle nếu khác các phiên bản này. Không cần activate venv nếu dùng đường dẫn Python đầy đủ như các lệnh bên dưới.

## Chạy thử toàn bộ

```powershell
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py demo --out local-ai-tuning/workspace/demo-01
```

Lệnh này tạo dữ liệu, chia tập, dò tham số, đánh giá và xuất đủ bốn tác vụ. Kết quả ở `workspace/demo-01/summary.json`, các model ở `workspace/demo-01/bundle/`. Thư mục đích phải chưa tồn tại để tránh ghi đè một lần chạy khác.

Sentiment/intent dùng câu mẫu khởi tạo; forecast/recommendation dùng dữ liệu tổng hợp. Các nguồn này được đánh dấu trong `provenance.json` và truyền theo báo cáo, bundle. **Kết quả demo chỉ chứng minh quy trình chạy được, không chứng minh độ chính xác trên khách hàng thật.** Lệnh demo ghi rõ việc vượt cổng chất lượng và cho phép dữ liệu mẫu; không tự kích hoạt bundle trong hệ thống.

## Chuẩn bị dữ liệu thật

Các template nằm trong `templates/`. File CSV dùng UTF-8, dấu phẩy và có header. Có thể tạo dữ liệu mẫu riêng để xem cách điền:

```powershell
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py seed --out local-ai-tuning/workspace/examples
```

| Tác vụ | File và cột | Yêu cầu |
|---|---|---|
| Sentiment | CSV `text,label`; tùy chọn `group_id,source,rating,review_id` | Nhãn `positive`, `negative`, `neutral`; nhãn do người gán. Nội dung giống nhau sau chuẩn hóa chỉ giữ một bản; nhãn mâu thuẫn bị từ chối. |
| Intent | CSV `text,label`; tùy chọn `group_id,source` | Đủ 9 nhãn: `greeting`, `recommend`, `showtimes`, `booking`, `cinemas`, `concessions`, `loyalty`, `payment`, `cancel`. Không ghi tên, email hoặc thông tin thanh toán vào câu huấn luyện. |
| Forecast | CSV `showtime_id,timestamp,cinema_id,movie_id,capacity,sold` | Một hàng cho một suất đã kết thúc; số vé thanh toán, sức chứa dương, `0 <= sold <= capacity`; tối thiểu 40 suất tại rạp được chọn, train ít nhất 20. |
| Recommendation | CSV `user_id,movie_id,timestamp,weight` và `movies.json` | ID người dùng đã giả danh hóa nhưng vẫn là số nguyên dương; `weight` tùy chọn, mặc định 1. Catalog gồm 2–500 phim và chứa mọi movie ID trong tương tác. |

`movies.json` là danh sách object có `id,title` và tùy chọn `genres,director,cast,description,release_date`. Không đưa dữ liệu khách hàng vào catalog. Trình chuẩn bị loại bỏ `popularity` và `bookable` nếu có để không dùng độ phổ biến của tương lai làm đặc trưng đánh giá.

`timestamp` dùng ISO 8601 có ngày và giờ. Nếu thiếu múi giờ, công cụ hiểu là giờ Việt Nam UTC+7 và chuyển về UTC; không phụ thuộc múi giờ máy chạy. Mỗi tác vụ thời gian cần ít nhất 10 mốc thời gian khác nhau.

`group_id` gom các câu cùng nguồn, phim hoặc họ mẫu để không nằm ở nhiều tập. Sentiment/intent chia theo nhóm thành khoảng 60/20/20 và cố gắng giữ đủ mọi lớp ở cả ba tập. Cần ít nhất 5 nhóm độc lập mỗi lớp; dữ liệu quá ít sẽ bị từ chối. Các biến thể cùng câu khác dấu được ghép nhóm tự động. Forecast/recommendation chia **theo thời gian**, không xáo trộn; các hàng cùng thời điểm luôn ở cùng tập.

### Xuất từ MySQL (tùy chọn)

Exporter chỉ hoạt động qua CLI và dùng transaction `READ ONLY` với snapshot nhất quán. Nên dùng tài khoản DB chỉ có quyền SELECT. Công cụ không dùng cấu hình hay mật khẩu mặc định của backend:

```powershell
$env:TUNING_DB_DSN = 'mysql:host=127.0.0.1;port=3307;dbname=galaxy_cinema;charset=utf8mb4'
$env:TUNING_DB_USER = 'cinema_training_reader'
$env:TUNING_DB_PASSWORD = '<mat-khau-tai-khoan-chi-doc>'
$env:TUNING_ANON_KEY = local-ai-tuning/.venv/Scripts/python.exe -c "import secrets; print(secrets.token_hex(32))"
php local-ai-tuning/export_database.php --out=local-ai-tuning/workspace/export-01 --days=180 --cinema-id=1
```

Kết quả gồm `sentiment-unlabelled.csv`, `forecast.csv`, `interactions.csv`, `movies.json` và provenance/số hàng. Giới hạn 100.000 hàng mỗi truy vấn, 500 phim; nếu chạm giới hạn nên chia cửa sổ thời gian và kiểm tra lại độ bao phủ. Dùng cùng `TUNING_ANON_KEY` khi cần nối các đợt xuất; lưu khóa riêng ngoài Git. ID giả danh không dùng để truy ngược tài khoản từ mô hình phục vụ.

Điền nhãn cảm xúc thủ công vào cột `label`, lưu thành `sentiment-labelled.csv`. Sao đánh giá chỉ là gợi ý khi gán nhãn, không được tự coi là nhãn đúng. Exporter không tạo dữ liệu intent vì hệ thống chưa lưu bộ hội thoại đã được gán nhãn; cần thu thập và biên tập riêng. Nội dung đánh giá được che email/số điện thoại theo mẫu và chống công thức Excel, nhưng vẫn cần rà soát tên riêng hoặc thông tin nhạy cảm trước khi chia sẻ.

Timestamp tương tác hiện lấy `bookings.updated_at` của đơn Paid làm mốc xấp xỉ ghi nhận mua. Khi có bảng sự kiện thanh toán bất biến, nên xuất từ thời điểm thanh toán thật. Sức chứa/metadata phim lấy ở snapshot hiện tại, chưa tái dựng toàn bộ phiên bản lịch sử; cần ghi nhận giới hạn này khi đánh giá offline.

## Tune bằng dữ liệu đã gán nhãn

Ví dụ sentiment; mọi lệnh chạy từ gốc repo:

```powershell
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py prepare --task sentiment --input local-ai-tuning/workspace/export-01/sentiment-labelled.csv --out local-ai-tuning/workspace/prepared-sentiment-01
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py tune --data local-ai-tuning/workspace/prepared-sentiment-01 --out local-ai-tuning/workspace/run-sentiment-01
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py evaluate --run local-ai-tuning/workspace/run-sentiment-01 --data local-ai-tuning/workspace/prepared-sentiment-01
```

Intent làm tương tự với `--task intent`. Forecast và recommendation có thêm tham số:

```powershell
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py prepare --task forecast --cinema-id 1 --input local-ai-tuning/workspace/export-01/forecast.csv --out local-ai-tuning/workspace/prepared-forecast-01
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py prepare --task recommendation --input local-ai-tuning/workspace/export-01/interactions.csv --movies local-ai-tuning/workspace/export-01/movies.json --out local-ai-tuning/workspace/prepared-rec-01
```

Sau `prepare`, chạy `tune` rồi `evaluate` như sentiment. Mỗi rạp cần một run forecast riêng. Các run có thể gom vào cùng bundle và được chọn theo `cinema_id` lúc phục vụ.

Chỉnh grid hoặc ngưỡng trong một bản sao `configs/default.json`, rồi truyền `tune --config <file.json>`. Tối đa 36 tổ hợp/run, Random Forest chạy một luồng, ma trận gợi ý tối đa 1.000 người dùng, đánh giá tối đa 500 người/run (mặc định 100); CPU không bị tự chạy một thử nghiệm không giới hạn.

## Chỉ số và điều kiện xuất

| Tác vụ | Dò tham số trên validation | Báo cáo test / cổng mặc định |
|---|---|---|
| Sentiment/intent | Macro-F1; analyzer từ/ngữ cảnh ký tự và C | Accuracy, macro-F1, từng lớp, confusion matrix, lỗi theo hàng; macro-F1 ≥ 0,70, tối thiểu 5 mẫu test/lớp. Ngưỡng tin cậy được chọn trên validation; test phải đạt accuracy trong nhóm chấp nhận ≥ 0,80 và coverage ≥ 0,20. |
| Forecast | MAE; độ sâu, số cây, số mẫu tối thiểu/lá | MAE/RMSE theo tỷ lệ lấp đầy; MAE ≤ 0,25 và không kém dự báo tỷ lệ trung bình từ train; ít nhất 20 suất test. |
| Recommendation | NDCG@K; trọng số content/collaborative/popularity và số chiều SVD | Precision@K, Recall@K, NDCG@K, độ phủ catalog và số người mới; NDCG ≥ 0,10 và không kém baseline phổ biến, ít nhất 10 người test. |

Model chỉ fit **train**, chọn tham số và ngưỡng từ **validation**; không refit sau khi nhìn test. `evaluate` chỉ ghi test một lần cho mỗi run. Khi cần thử tiếp sau khi đã xem test, nên dành một tập test mới độc lập, không sửa dữ liệu hoặc ngưỡng chỉ để làm đẹp kết quả.

Recommendation dùng tương tác train cho cả validation và test; không thêm phản hồi validation vào lịch sử. Độ phổ biến được tính lại chỉ từ train. Đánh giá dùng catalog cố định của snapshot và mọi người trong holdout (có thống kê cold-start), chưa tái dựng catalog/tồn suất chính xác ở từng thời điểm. Combo vẫn dùng lịch sử mua/độ phổ biến tại runtime; chưa có bộ tune combo riêng.

Các ngưỡng là tiêu chí khởi đầu có thể chỉnh theo nhu cầu, không phải cam kết chất lượng. Không có mức ngưỡng nào thay thế được dữ liệu thật độc lập và kiểm tra lỗi nghiệp vụ.

Mỗi run lưu `run.json` (dữ liệu hash, config, seed, các trial và phiên bản), `model.joblib`, `evaluation.json` (test và quyết định chất lượng). File prepared có hash để phát hiện dữ liệu bị sửa sau khi chia tập. Báo cáo lỗi mặc định chỉ lưu số thứ tự hàng/nhãn/xác suất, không sao chép nội dung riêng tư sang báo cáo.

## Xuất và dùng trong hệ thống

```powershell
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py bundle --runs local-ai-tuning/workspace/run-sentiment-01 --out local-ai-tuning/workspace/bundle-01
local-ai-tuning/.venv/Scripts/python.exe local-ai-tuning/tune.py inspect local-ai-tuning/workspace/bundle-01
```

`--runs` nhận nhiều đường dẫn để gom sentiment, intent, recommendation và nhiều forecast theo rạp. Thiếu `evaluation.json`, khác hash, phiên bản không khớp hoặc chất lượng không đạt sẽ bị từ chối. Dữ liệu bootstrap/synthetic phải được cho phép rõ bằng `--allow-demo`; kết quả không đạt ngưỡng cần `--allow-below-threshold`. Hai lựa chọn này được ghi vào manifest để người dùng bundle nhận biết.

Khởi động dịch vụ bằng môi trường tune cũng được, với khóa dịch vụ riêng giống backend:

```powershell
$env:AI_MODEL_DIR = (Resolve-Path local-ai-tuning/workspace/bundle-01).Path
# AI_SERVICE_KEY phải là cùng khóa riêng đã cấp cho backend.
Set-Location ai-service
../local-ai-tuning/.venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 8001
```

`GET /health` cho biết bundle ID và các tác vụ đã nạp. File joblib có thể thực thi mã khi nạp: chỉ dùng bundle tự tạo hoặc tin cậy; SHA-256 kiểm tra hỏng/thay đổi file, không chứng minh nguồn đáng tin. Đường dẫn vượt ra ngoài thư mục bundle và phiên bản không khớp bị từ chối. Cấu hình sai làm dịch vụ dừng khi khởi động để không âm thầm dùng nhầm model.

Không đặt `AI_MODEL_DIR`: dịch vụ giữ baseline hiện tại. Bundle có thể chỉ chứa một vài tác vụ; phần còn lại dùng baseline. Với forecast, chỉ model đúng rạp mới được dùng; rạp khác dùng luồng dự báo cũ. Đổi hoặc bỏ `AI_MODEL_DIR` rồi khởi động lại để rollback; không có hot reload tự động.

Docker hiện chỉ đóng gói `ai-service/`; muốn dùng bundle trong container cần mount thư mục model tin cậy ở chế độ chỉ đọc và đặt `AI_MODEL_DIR` trỏ tới đường dẫn **bên trong container**. Bộ công cụ không tự sửa cấu hình triển khai hoặc công khai dịch vụ.

## Kiểm thử

```powershell
local-ai-tuning/.venv/Scripts/python.exe -m pytest -c local-ai-tuning/pytest.ini local-ai-tuning/tests ai-service/tests -q
php -l local-ai-tuning/export_database.php
```

Các ca PHP bridge trong `ai-service/tests` cần `PHP_BIN` và cURL như hướng dẫn `docs/AI_INTEGRATION.md`. Kiểm thử không gọi DB thật hoặc gateway thanh toán. Exporter cần được kiểm tra thêm với MySQL có schema/dữ liệu thực trước khi dùng cho một đợt huấn luyện chính thức.

Khi bổ sung bộ công cụ này đã chạy qua **44 ca kiểm thử** (22 ca tuning/integration mới và 22 ca AI/PHP có sẵn), `pip check` và PHP syntax check. Lệnh demo đủ bốn tác vụ cũng đã chạy thành công. Các kết quả này xác nhận quy trình và kết nối; chưa xác nhận chất lượng mô hình trên dữ liệu người dùng thật hoặc SQL exporter với MySQL đang chạy.
