import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AppContext";
import { aiService, type ChatContext } from "@/services/ai.service";

type Message = { role: "user" | "assistant"; text: string; links?: { label: string; url: string }[] };
export default function CinemaAssistant() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [context, setContext] = useState<ChatContext>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { generation.current++; setMessages([]); setContext(undefined); setBusy(false); setError(""); }, [user?.id]);
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: "smooth" }); }, [messages, open]);
  if (/^\/(admin|manager|staff)(\/|$)/.test(pathname)) return null;
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const current = generation.current;
    setMessages(previous => [...previous.slice(-18), { role: "user", text: question }]);
    setInput(""); setBusy(true); setError("");
    try {
      const response = await aiService.chat(question, context);
      if (current !== generation.current) return;
      setContext(response.context);
      setMessages(previous => [...previous, { role: "assistant", text: response.reply, links: response.links }]);
    } catch { if (current === generation.current) { setError("Chưa gửi được câu hỏi. Bạn có thể thử lại."); setInput(question); } }
    finally { if (current === generation.current) setBusy(false); }
  };
  return (
    <div className="fixed bottom-5 right-4 z-50">
      {!open ? <Button onClick={() => setOpen(true)} className="rounded-full shadow-lg" aria-label="Mở trợ lý điện ảnh"><MessageCircle className="mr-2 h-5 w-5" />Trợ lý điện ảnh</Button> : (
        <section role="dialog" aria-label="Trợ lý điện ảnh" className="flex h-[min(34rem,80vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <header className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">Trợ lý điện ảnh</h2><Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Đóng trợ lý"><X className="h-4 w-4" /></Button></header>
          <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {!messages.length && <p className="text-sm text-muted-foreground">Mình có thể gợi ý phim, tra lịch chiếu, dự báo suất đông và phân tích bình luận. Thử “Dự báo suất đông tại Galaxy Nguyễn Du tối nay” hoặc “Phân tích bình luận: Phim hay và diễn xuất tốt”.</p>}
            {messages.map((message, index) => <div key={index} className={`rounded-xl p-3 text-sm ${message.role === "user" ? "ml-6 bg-primary text-primary-foreground" : "mr-3 bg-muted"}`}>
              <p className="whitespace-pre-line">{message.text}</p>
              {message.links?.filter(link => /^\/(movie\/\d+|schedule|movies|cinemas|concessions|profile|promotions|bookings|login)$/.test(link.url)).map((link, i) => (
                <Link key={i} to={link.url} onClick={() => setOpen(false)} className="mt-2 block rounded border border-primary/30 px-2 py-2 text-primary hover:bg-primary/10">{link.label}</Link>
              ))}
            </div>)}
            {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Đang tìm thông tin…</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t p-3"><Input aria-label="Câu hỏi cho trợ lý" placeholder="Bạn muốn xem phim gì?" value={input} onChange={e => setInput(e.target.value)} maxLength={1000} disabled={busy} /><Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Gửi câu hỏi"><Send className="h-4 w-4" /></Button></form>
        </section>
      )}
    </div>
  );
}
