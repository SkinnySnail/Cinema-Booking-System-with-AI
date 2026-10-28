export interface ForecastInfo { requested: boolean; used: boolean; mode: string; training_samples: number }
export default function AISchedulingOption({ enabled, onChange, forecast }: {
  enabled: boolean; onChange: (enabled: boolean) => void; forecast?: ForecastInfo;
}) {
  const description = !enabled ? "Phân bổ theo trọng số phim và các ràng buộc lịch chiếu."
    : !forecast ? "Ước lượng nhu cầu từ lịch sử bán vé của rạp. Bạn xem trước và xác nhận trước khi lưu."
    : !forecast.used ? "Chưa kết nối được AI; bản lịch này dùng phân bổ theo trọng số."
    : forecast.mode === "smoothed_prior" ? "Dữ liệu còn ít; bản lịch dùng tỷ lệ lấp đầy trung bình có điều chỉnh."
    : `Đã dùng dự báo từ ${forecast.training_samples} suất chiếu trong lịch sử.`;
  return <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} />Ưu tiên lịch theo dự báo nhu cầu</label>
    <p className="text-xs text-muted-foreground" role="status">{description}</p>
  </div>;
}
