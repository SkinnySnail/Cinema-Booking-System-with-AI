# Thử nghiệm AI cục bộ với Ollama

Các lệnh dưới đây chạy từ thư mục gốc repo. Dùng Python trong môi trường của bộ công cụ tune và chạy Ollama ở 127.0.0.1:11434. Qwen3-Embedding tạo vector đầu vào. Logistic Regression được huấn luyện trên các vector đó và được so sánh với TF-IDF trên cùng phân hoạch. Trọng số encoder được giữ cố định. [API embedding của Ollama](https://docs.ollama.com/api/embed) · [Qwen3-Embedding](https://ollama.com/library/qwen3-embedding)

Thư mục thực nghiệm nằm ở workspace/ollama-experiment trong local-ai-tuning. raw lưu nguồn tải, inputs lưu tập đã chuẩn bị và runs lưu báo cáo, bộ phân loại cùng cache vector. Git bỏ qua thư mục này. Các file joblib chứa bộ phân loại cục bộ. Chỉ mở file joblib từ lần chạy do mình tạo và kiểm soát.

| Nguồn | File trong raw | Cách dùng |
|---|---|---|
| [UIT-VSFC](https://huggingface.co/datasets/tridm/UIT-VSFC/tree/main) | uit-train.json, uit-valid.json, uit-test.json | Lấy mẫu train và validation, giữ test chính thức riêng. Khử trùng sau chuẩn hóa và giữ các câu neutral đủ điều kiện. |
| [MASSIVE 1.1](https://github.com/alexa/massive) | massive.tar.gz | Đọc vi-VN trong archive. Đưa một số mẫu chào hỏi và gợi ý phim thuộc train vào tập huấn luyện intent. |
| [PhoATIS](https://github.com/VinAIResearch/JointIDSF/tree/main/PhoATIS) | phoatis-sentences.txt, phoatis-labels.txt | Đối chiếu hai mẫu về truy vấn giờ bay trong train rồi chuyển cấu trúc câu sang truy vấn suất chiếu. Các mẫu được ghi nguồn ở intent.csv. |
| [Cinema Tickets](https://www.kaggle.com/datasets/arashnic/cinema-ticket) | cinema-ticket.zip | Huấn luyện riêng 5 rạp trên dữ liệu phim, rạp và ngày. Biến đích là ticket_use / capacity. Dùng tên forecast_daily.csv để giữ rõ đơn vị. |
| [MovieLens Small](https://grouplens.org/datasets/movielens/latest/) | movielens.zip | Dùng đánh giá từ 4 sao làm tín hiệu thích phim. Lấy tối đa 500 phim theo độ phổ biến ở phần lịch sử và ghép danh mục bằng movieId của MovieLens. |

Intent dùng các nhóm cách hỏi trong configs/cinema_intent_families.json. Cả nhóm đi vào cùng một tập train, validation hoặc test. Forecast và recommendation dùng phân hoạch theo thời gian. Mỗi benchmark có điều kiện khác dữ liệu rạp thực tế. Model dự báo ngày dùng mã rạp của Kaggle và gợi ý phim dùng danh mục MovieLens.

~~~powershell
ollama pull qwen3-embedding:0.6b
$tunePython = '.\local-ai-tuning\.venv\Scripts\python.exe'
$tuneWorkspace = 'local-ai-tuning/workspace/ollama-experiment'
& $tunePython local-ai-tuning/ollama_experiment.py sentiment --workspace $tuneWorkspace
& $tunePython local-ai-tuning/ollama_experiment.py intent --workspace $tuneWorkspace
& $tunePython local-ai-tuning/ollama_experiment.py forecast --workspace $tuneWorkspace
& $tunePython local-ai-tuning/ollama_experiment.py recommendation --workspace $tuneWorkspace
~~~

Thêm --model qwen3-embedding:4b cho lần chạy văn bản với biến thể 4B. Dùng --validation-only để sàng lọc cấu hình bằng validation trước khi đánh giá test. Các biến thể văn bản lưu ở thư mục run riêng theo tên model.

Thêm --text để dự đoán bằng bộ phân loại được chọn theo validation của một lần chạy đã lưu. Lệnh kiểm tra digest của model Ollama trước khi dùng bộ phân loại đã huấn luyện.

~~~powershell
& $tunePython local-ai-tuning/ollama_experiment.py intent --workspace $tuneWorkspace --text 'Tối nay rạp Nguyễn Du còn suất nào không?'
~~~

Báo cáo từng lần chạy nằm trong runs/<tác vụ>/report.json. Kết quả trên dữ liệu công khai và câu hỏi tổng hợp được dùng để so sánh phương pháp. Hệ thống cần dữ liệu mua vé, phản hồi, câu hỏi và suất chiếu của chính dự án để đánh giá chất lượng trong vận hành.
