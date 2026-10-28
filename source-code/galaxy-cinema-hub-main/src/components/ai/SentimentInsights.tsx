import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiService, type Sentiment } from "@/services/ai.service";

const labels = { positive: "Tích cực", negative: "Tiêu cực", neutral: "Trung tính" };
export default function SentimentInsights({ reviews }: { reviews: { id: number; comment: string }[] }) {
  const [items, setItems] = useState<Sentiment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = reviews.map(r => `${r.id}:${r.comment}`).join("|");
  const generation = useRef(0);
  useEffect(() => { generation.current++; setItems([]); setError(""); setBusy(false); }, [key]);
  const analyze = async () => {
    const current = generation.current;
    setBusy(true); setError("");
    try { const result = await aiService.sentiments(reviews.map(r => r.id)); if (current === generation.current) setItems(result.items); }
    catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "Không thể phân tích đánh giá."); }
    finally { if (current === generation.current) setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Phân tích cảm xúc đánh giá">
    <p className="text-xs text-muted-foreground">Mô hình thử nghiệm từ tập câu mẫu nhỏ; cần đối chiếu nội dung gốc khi kiểm duyệt.</p>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Cảm xúc từ đánh giá</h2><p className="text-sm text-muted-foreground">Kết quả tham khảo; quyết định kiểm duyệt vẫn do bạn xác nhận.</p></div>
      <Button variant="outline" onClick={analyze} disabled={busy || !reviews.length}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Phân tích trang hiện tại</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {reviews.length > 100 && <p className="text-xs text-muted-foreground">Mỗi lượt phân tích tối đa 100 đánh giá đầu tiên trong kết quả lọc.</p>}
    {!!items.length && <><div className="flex flex-wrap gap-3 text-sm">{Object.entries(labels).map(([key, label]) => <span key={key} className="rounded-lg bg-muted px-3 py-2">{label}: <strong>{items.filter(i => i.label === key).length}</strong></span>)}</div>
      <ul className="space-y-2">{items.map(item => <li key={item.id} className="rounded border p-3 text-sm"><p className="line-clamp-2">{reviews.find(r => r.id === item.id)?.comment}</p><p className="mt-1 text-xs text-muted-foreground">{labels[item.label]} · {Math.round(item.confidence * 100)}%{item.needs_review ? " · Cần xem xét thêm" : ""}</p></li>)}</ul></>}
  </section>;
}
