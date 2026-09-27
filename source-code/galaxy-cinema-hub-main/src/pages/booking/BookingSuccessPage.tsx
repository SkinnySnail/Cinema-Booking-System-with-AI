import React, { useState, useEffect } from "react";
import { useLocation, Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  Check,
  Calendar,
  MapPin,
  Clock,
  Download,
  Home,
  Loader2,
  Ticket,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import html2canvas from "html2canvas";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS, API_BASE_URL } from "@/lib/api-config";
import { useAuth } from "@/contexts/AppContext";

const BookingSuccessPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();

  const isPosCallback =
    searchParams.get("is_pos") === "1" ||
    searchParams.has("pos") ||
    user?.role === "Staff" ||
    user?.role === "Manager";

  const urlStatus = searchParams.get("status");
  const hasUrlParams =
    !location.state &&
    (searchParams.has("booking_id") ||
      searchParams.has("status") ||
      searchParams.has("transaction_code"));
  const isFailedCallback =
    hasUrlParams && urlStatus !== null && urlStatus !== "Success";
  const gateway = searchParams.get("gateway");
  const isGatewaySuccessCallback =
    hasUrlParams &&
    urlStatus === "Success" &&
    (gateway === "VNPay" || gateway === "Visa");

  useEffect(() => {
    if (isFailedCallback) {
      const failedParams = new URLSearchParams();
      if (isPosCallback) failedParams.set("is_pos", "1");
      const failQuery = failedParams.toString() ? `?${failedParams.toString()}` : "";
      navigate(`/booking/failed${failQuery}`, { replace: true });
      return;
    }
    if (isGatewaySuccessCallback) {
      if (isPosCallback) {
        if (window.opener && !window.opener.closed) {
          window.close();
          return;
        }
        toast({
          title: "Thanh toán tại quầy thành công!",
          description: "Giao dịch POS đã được xác nhận thành công.",
        });
        // Never navigate staff to customer /bookings!
        return;
      }

      if (window.opener && !window.opener.closed) {
        window.close();
        return;
      }
      toast({
        title: "Thanh toán thành công!",
        description:
          "Vé đã được xác nhận. Bạn có thể xem vé hoặc lưu ảnh vé dưới đây.",
      });
    }
  }, [isFailedCallback, isGatewaySuccessCallback, isPosCallback, navigate, toast]);

  const [bookingData, setBookingData] = useState<any>(location.state || null);
  const [isLoading, setIsLoading] = useState(
    !location.state &&
      searchParams.has("booking_id") &&
      !isFailedCallback,
  );

  useEffect(() => {
    const fetchBookingDetails = async () => {
      if (location.state) return;

      const bookingId = searchParams.get("booking_id");
      if (!bookingId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const token =
          localStorage.getItem("token") ||
          localStorage.getItem("galaxy_cinema_token");
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(
          `${API_BASE_URL}${API_ENDPOINTS.BOOKINGS.DETAIL(bookingId)}`,
          {
            method: "GET",
            headers,
          },
        );

        if (response.ok) {
          const res = await response.json();
          if (res.success && res.data) {
            const b = res.data;
            setBookingData({
              bookingCode: b.booking_code,
              ticketCode: b.tickets?.[0]?.ticket_code || null,
              movie: {
                title: b.movie_title,
                poster: b.poster_url || b.movie_poster || "",
                backdrop: b.poster_url || b.movie_poster || "",
              },
              seats: b.tickets || b.seats || [],
              concessions: b.concessions || [],
              total: b.final_price || b.total_price,
              discount: b.discount_amount || 0,
              promoCode: b.promotion_code || null,
              showtime: {
                date: b.start_time
                  ? b.start_time.split(" ")[0]
                  : b.showtime_date,
                time: b.start_time
                  ? b.start_time.split(" ")[1]?.slice(0, 5)
                  : b.showtime_start_time,
                cinema: b.cinema_name,
                hall: b.hall_name,
              },
            });
          }
        }
      } catch (err) {
        console.error("Error fetching booking details:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookingDetails();
  }, [location.state, searchParams]);

  const {
    bookingCode,
    ticketCode,
    movie,
    seats,
    concessions,
    total,
    discount,
    promoCode,
    showtime,
  } = bookingData || {};
  const [isSavingImage, setIsSavingImage] = useState(false);

  const activeTicketCode = bookingCode || ticketCode || null;

  const qrImageUrl = activeTicketCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(activeTicketCode)}`
    : null;

  const getSeatCode = (seat: any, idx: number) => {
    if (!seat) return `Ghế ${idx + 1}`;
    if (seat.row_code && seat.number) return `${seat.row_code}${seat.number}`;
    if (seat.row && seat.number) return `${seat.row}${seat.number}`;
    if (seat.seat_number) return `${seat.seat_number}`;
    if (typeof seat === "string") return seat;
    return seat.id ? `Ghế ${seat.id}` : `Ghế ${idx + 1}`;
  };

  const seatText = Array.isArray(seats)
    ? seats
        .map((seat: any, idx: number) => getSeatCode(seat, idx))
        .filter(Boolean)
        .join(", ")
    : "";

  const showtimeDate = showtime?.date || showtime?.start_time || null;
  const showtimeHall =
    showtime?.hall ||
    showtime?.hall_name ||
    showtime?.room ||
    showtime?.room_name ||
    "";
  const showtimeCinema =
    showtime?.cinema || showtime?.cinema_name || showtime?.cinemaName || "";
  const showtimeTime = showtime?.time || "";
  const showtimeTimeText =
    showtimeTime && showtimeHall
      ? `${showtimeTime} - ${showtimeHall}`
      : showtimeTime || showtimeHall || "Đang cập nhật";
  const cinemaText = showtimeCinema || "Galaxy Cinema";

  const concessionsList = Array.isArray(concessions) ? concessions : [];

  const waitForImages = async (container: HTMLElement) => {
    const images = Array.from(container.querySelectorAll("img"));
    if (images.length === 0) return;

    await Promise.all(
      images.map((img) => {
        if (img.complete) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          const cleanup = () => {
            img.removeEventListener("load", cleanup);
            img.removeEventListener("error", cleanup);
            resolve();
          };
          img.addEventListener("load", cleanup);
          img.addEventListener("error", cleanup);
          setTimeout(cleanup, 2500);
        });
      }),
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const buildExportTicketNode = (): HTMLDivElement => {
    const root = document.createElement("div");
    root.style.width = "760px";
    root.style.padding = "32px";
    root.style.borderRadius = "28px";
    root.style.background = "linear-gradient(150deg, #0b1120, #030712)";
    root.style.border = "2px solid #f97316";
    root.style.color = "#ffffff";
    root.style.fontFamily = "Segoe UI, Arial, sans-serif";
    root.style.boxSizing = "border-box";

    const posterUrl = movie?.backdrop || movie?.poster || "";
    const poster = posterUrl
      ? `<img src="${posterUrl}" crossorigin="anonymous" style="width:100%;height:220px;object-fit:cover;border-radius:18px;opacity:.9;" />`
      : "";
    const qr = qrImageUrl
      ? `<img src="${qrImageUrl}" crossorigin="anonymous" style="width:200px;height:200px;background:#fff;border-radius:16px;padding:12px;" />`
      : "";

    const discountHtml =
      Number(discount) > 0
        ? `<div style="margin-top:12px;font-size:18px;line-height:1.45;color:#f97316;">Bạn đã tiết kiệm ${Number(discount).toLocaleString("vi-VN")}đ${promoCode ? ` với mã ${promoCode}` : ""}</div>`
        : "";

    const concessionsHtml =
      concessionsList.length > 0
        ? `<div style="grid-column:1 / -1;"><span style="color:#94a3b8;">Bắp nước:</span> ${concessionsList.map((c: any) => `${c.quantity || 1}x ${c.name || c.concession_name || "Bắp nước"}`).join(", ")}</div>`
        : "";

    root.innerHTML = `
      <div style="display:flex;gap:28px;align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          ${poster}
          <div style="margin-top:18px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div>
              <div style="font-size:32px;font-weight:900;line-height:1.2;color:#ffffff;">${movie?.title || "Vé xem phim"}</div>
              <div style="margin-top:6px;font-size:20px;color:#cbd5e1;">Mã booking: <span style="font-family:Consolas, monospace;color:#f97316;font-weight:900;">${activeTicketCode || "N/A"}</span></div>
            </div>
            <div style="padding:8px 16px;border-radius:999px;background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#10b981;font-weight:800;font-size:15px;letter-spacing:0.5px;">✓ VÉ HỢP LỆ</div>
          </div>

          <div style="margin-top:16px;padding-top:16px;border-top:1px dashed rgba(255,255,255,.28);display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:19px;line-height:1.4;">
            <div><span style="color:#94a3b8;">Rạp:</span> ${cinemaText}</div>
            <div><span style="color:#94a3b8;">Suất chiếu:</span> ${showtimeTimeText || "Đang cập nhật"}</div>
            <div><span style="color:#94a3b8;">Ngày chiếu:</span> ${showtimeDate ? formatDate(showtimeDate) : formatDate(new Date().toISOString())}</div>
            <div><span style="color:#94a3b8;">Ghế đã chọn:</span> <span style="font-weight:800;color:#f97316;">${seatText || "Đang cập nhật"}</span></div>
            ${concessionsHtml}
          </div>

          ${discountHtml}

          <div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.2);font-size:26px;font-weight:900;color:#f97316;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:19px;color:#e2e8f0;font-weight:700;">Tổng thanh toán:</span>
            <span>${Number(total || 0).toLocaleString("vi-VN")}đ</span>
          </div>
        </div>
        <div style="width:220px;display:flex;flex-direction:column;align-items:center;">
          ${qr}
          <div style="margin-top:12px;font-size:13px;color:#94a3b8;text-align:center;">Quét mã tại cổng soát vé</div>
        </div>
      </div>
    `;

    return root;
  };

  const handleSaveTicketImage = async () => {
    if (!activeTicketCode || isSavingImage) {
      return;
    }

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.zIndex = "-1";

    const ticketNode = buildExportTicketNode();
    container.appendChild(ticketNode);
    document.body.appendChild(container);

    try {
      setIsSavingImage(true);

      await waitForImages(container);

      const exportScale = Math.min(
        4,
        Math.max(2.5, (window.devicePixelRatio || 1) * 2),
      );

      const canvas = await html2canvas(ticketNode, {
        scale: exportScale,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });

      const imageData = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = imageData;
      link.download = `galaxy-cinema-${activeTicketCode}.png`;
      link.click();

      toast({
        title: "Đã lưu ảnh vé",
        description: "Ảnh vé đã được tải xuống thiết bị của bạn thành công.",
      });
    } catch (error) {
      console.error("Failed to save ticket image:", error);
      toast({
        title: "Không thể lưu ảnh vé",
        description: "Vui lòng thử lại sau ít phút.",
        variant: "destructive",
      });
    } finally {
      setIsSavingImage(false);
      container.remove();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070a10] text-slate-900 dark:text-white">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <Loader2 className="h-10 w-10 animate-spin text-orange-500 mb-4" />
            <p className="text-slate-600 dark:text-zinc-300 font-semibold text-lg">
              Đang tải thông tin vé...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!activeTicketCode) {
    if (searchParams.get("status") === "Success") {
      return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070a10] text-slate-900 dark:text-white transition-colors duration-300">
          <Header />
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="w-full max-w-md text-center p-8 rounded-3xl bg-white/95 dark:bg-zinc-900/80 border border-slate-200/90 dark:border-white/10 shadow-2xl backdrop-blur-xl">
              <div className="w-20 h-20 mx-auto bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-6">
                <Check className="w-10 h-10 text-white stroke-[3]" />
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-3">
                {isPosCallback ? "Thanh Toán Tại Quầy Thành Công!" : "Giao Dịch Thành Công!"}
              </h1>
              <p className="text-slate-600 dark:text-zinc-300 text-base leading-relaxed mb-6">
                {isPosCallback
                  ? "Giao dịch bán vé POS đã hoàn tất và được xác nhận trên hệ thống. Vé đã được ghi nhận."
                  : "Chân thành cảm ơn quý khách. Vé của bạn đã được xác nhận thành công trên hệ thống."}
              </p>
              <div className="space-y-3">
                {isPosCallback ? (
                  <>
                    <Button
                      onClick={() => navigate("/staff/pos")}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold shadow-lg shadow-orange-500/25"
                    >
                      Quay Lại Bán Vé Tại Quầy
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate("/staff/payment-history")}
                      className="w-full h-12 rounded-xl border-slate-200 dark:border-white/10"
                    >
                      Xem Lịch Sử Thanh Toán POS
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => window.close()}
                      className="w-full h-11 text-muted-foreground hover:text-foreground"
                    >
                      Đóng cửa sổ này
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/bookings" className="block">
                      <Button className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold shadow-lg shadow-orange-500/25">
                        Xem Lịch Sử Đặt Vé
                      </Button>
                    </Link>
                    <Link to="/" className="block">
                      <Button variant="outline" className="w-full h-12 rounded-xl border-slate-200 dark:border-white/10">
                        Về Trang Chủ
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070a10] text-slate-900 dark:text-white">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center p-8 rounded-3xl bg-white/95 dark:bg-zinc-900/80 border border-slate-200 dark:border-white/10 shadow-xl max-w-md">
            <h1 className="text-2xl font-bold mb-3 text-slate-900 dark:text-white">
              Không tìm thấy thông tin vé
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">
              Có thể liên kết đã hết hạn hoặc không tìm thấy mã đặt chỗ tương ứng.
            </p>
            <Link to="/">
              <Button className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold px-6">
                Về trang chủ
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      <Header />

      <main className="flex-1 container max-w-xl mx-auto px-4 py-8 relative flex flex-col items-center">
        {/* Subtle Ambient Top Glow matching standard cinema pages */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 max-w-5xl h-64 bg-primary/[0.04] blur-3xl pointer-events-none -z-10 rounded-full" />

        {/* POS notification banner if opened by staff or POS flow */}
        {isPosCallback && (
          <div className="w-full mb-4 p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3 text-xs sm:text-sm text-blue-600 dark:text-blue-400 font-semibold shadow-xs">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-blue-500" />
              <span>Giao dịch bán vé tại quầy (POS) đã hoàn tất và in bill</span>
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/staff/pos")}
                className="h-8 text-xs border-blue-500/40 hover:bg-blue-500/10 cursor-pointer"
              >
                Về Bán Vé
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.close()}
                className="h-8 text-xs hover:bg-blue-500/10 cursor-pointer"
              >
                Đóng tab
              </Button>
            </div>
          </div>
        )}

        {/* Top Header Card: 3-Step Completion Stepper */}
        <div className="w-full mb-6 rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between sm:justify-center gap-2 sm:gap-6 text-xs sm:text-sm">
            {/* Step 1: Chọn Ghế (Tech Blue) */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-cyan-500 font-bold">
              <span className="w-6 h-6 rounded-full bg-cyan-500 text-white flex items-center justify-center text-xs font-black shadow-xs">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
              <span>1. Chọn Ghế</span>
            </div>

            {/* Connector 1 -> 2: Tech Blue */}
            <span className="flex-1 max-w-[50px] sm:max-w-[70px] h-[2px] bg-gradient-to-r from-cyan-500 to-sky-500 rounded-full" />

            {/* Step 2: Bắp Nước (Tech Blue) */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-sky-500 font-bold">
              <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-black shadow-xs">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
              <span>2. Bắp Nước</span>
            </div>

            {/* Connector 2 -> 3: Tech Blue transitioning into Galaxy Orange */}
            <span className="flex-1 max-w-[50px] sm:max-w-[70px] h-[2px] bg-gradient-to-r from-sky-500 via-blue-500 to-primary rounded-full" />

            {/* Step 3: Hoàn Tất (Touch of Galaxy Orange with Cyber Blue Glow ring) */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-primary font-extrabold">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shadow-xs ring-2 ring-cyan-400/40 animate-pulse">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
              <span>3. Hoàn Tất</span>
            </div>
          </div>
        </div>

        {/* Success Header Message */}
        <div className="text-center mb-6">
          <div className="relative inline-block mb-3">
            <div className="w-20 h-20 mx-auto bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Check className="w-10 h-10 text-white stroke-[3]" />
            </div>
            <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Đặt Vé Thành Công!
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-1">
            Vé của bạn đã được xác nhận
          </p>
        </div>

        {/* Cinema E-Ticket Card - Galaxy Orange Branding */}
        <div className="w-full rounded-3xl overflow-hidden bg-card border border-border text-card-foreground shadow-lg relative">
          {/* Movie Banner Header */}
          <div className="relative h-36 sm:h-44 bg-slate-900 overflow-hidden">
            <img
              src={
                movie?.backdrop ||
                movie?.poster ||
                "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=700&h=300&fit=crop"
              }
              alt={movie?.title || "Phim"}
              crossOrigin="anonymous"
              className="w-full h-full object-cover opacity-65 scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />

            <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-black text-white drop-shadow-md break-words whitespace-normal leading-tight">
                  {movie?.title || "Vé xem phim"}
                </h2>
              </div>
              <Badge className="bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider shrink-0 shadow-xs backdrop-blur-xs">
                ✓ VÉ HỢP LỆ
              </Badge>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="flex flex-col items-center py-6 px-4 bg-muted/20">
            <div className="bg-white rounded-2xl p-4 shadow-md border border-slate-200">
              {qrImageUrl ? (
                <img
                  src={qrImageUrl}
                  alt="QR vé xem phim"
                  crossOrigin="anonymous"
                  className="w-36 h-36 sm:w-40 sm:h-40 object-contain"
                />
              ) : (
                <div className="w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center bg-slate-100 text-slate-400">
                  <Ticket className="w-12 h-12" />
                </div>
              )}
            </div>

            {/* Ticket Code Display */}
            <div className="text-center mt-3.5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
                Mã booking
              </p>
              <p className="text-2xl sm:text-3xl font-mono font-black text-primary tracking-wider">
                {activeTicketCode}
              </p>
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                <span>✓ VÉ HỢP LỆ</span>
              </div>
            </div>
          </div>

          {/* Ticket Perforation Tear Line with Semicircle Notches */}
          <div className="relative my-1">
            <div className="border-t-2 border-dashed border-border/80 mx-6" />
            <div className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-background rounded-full border-r border-border" />
            <div className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-background rounded-full border-l border-border" />
          </div>

          {/* Ticket Details Grid (Strictly real data from database) */}
          <div className="p-5 sm:p-6 space-y-4 text-sm">
            {/* Cinema Location */}
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground font-medium">Rạp</p>
                <p className="font-bold text-foreground break-words">{cinemaText}</p>
              </div>
            </div>

            {/* Showtime Date */}
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground font-medium">Ngày chiếu</p>
                <p className="font-bold text-foreground">
                  {showtimeDate ? formatDate(showtimeDate) : formatDate(new Date().toISOString())}
                </p>
              </div>
            </div>

            {/* Showtime Time & Hall */}
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground font-medium">Suất chiếu</p>
                <p className="font-bold text-foreground">
                  {showtimeTimeText || "Đang cập nhật"}
                </p>
              </div>
            </div>

            {/* Seats */}
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Ticket className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-primary text-primary-foreground font-black text-xs flex items-center justify-center">
                    {Array.isArray(seats) ? seats.length : 1}
                  </span>
                  <p className="text-xs text-muted-foreground font-medium">
                    Ghế ({Array.isArray(seats) ? seats.length : 1} ghế)
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {Array.isArray(seats) && seats.length > 0 ? (
                    seats.map((s: any, idx: number) => {
                      const code = getSeatCode(s, idx);
                      return (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary font-mono font-bold text-xs border border-primary/20"
                        >
                          {code}
                        </span>
                      );
                    })
                  ) : (
                    <span className="font-bold text-foreground">
                      {seatText || "Đang cập nhật"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Concessions Section (Only if user ordered concessions) */}
            {concessionsList.length > 0 && (
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground font-medium">
                    Bắp nước đã chọn
                  </p>
                  <div className="space-y-1 mt-1">
                    {concessionsList.map((c: any, idx: number) => {
                      const name =
                        c.name || c.concession_name || c.title || "Bắp nước";
                      const qty = c.quantity || 1;
                      return (
                        <p
                          key={idx}
                          className="font-bold text-foreground text-xs sm:text-sm break-words"
                        >
                          <span className="text-primary font-extrabold">{qty}x</span>{" "}
                          {name}
                        </p>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Total Paid Box - Galaxy Orange Brand Color */}
            <div className="pt-3 border-t border-border">
              <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                    Tổng thanh toán
                  </span>
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono text-primary drop-shadow-xs">
                    {Number(total || 0).toLocaleString("vi-VN")}đ
                  </span>
                </div>
                {Number(discount) > 0 && (
                  <p className="text-xs font-semibold text-emerald-400 mt-1.5 flex items-center gap-1">
                    <span>🎉 Đã tiết kiệm {Number(discount).toLocaleString("vi-VN")}đ</span>
                    {promoCode && <span>với mã {promoCode}</span>}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons (Galaxy Orange Main Brand) */}
        <div className="w-full mt-6 space-y-3">
          {/* Primary Action: Download ticket image */}
          <Button
            onClick={handleSaveTicketImage}
            disabled={isSavingImage}
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold text-sm sm:text-base shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSavingImage ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Đang tạo ảnh vé...</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>Lưu Ảnh Vé Về Máy</span>
              </>
            )}
          </Button>

          {/* Secondary Actions Row */}
          <div className="grid grid-cols-2 gap-3">
            {isPosCallback ? (
              <>
                <Button
                  onClick={() => navigate("/staff/pos")}
                  className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Ticket className="w-4 h-4" />
                  <span>Bán Vé Mới</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => navigate("/staff/payment-history")}
                  className="w-full h-11 rounded-xl border-border hover:bg-muted text-foreground font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Clock className="w-4 h-4" />
                  <span>Lịch Sử POS</span>
                </Button>
              </>
            ) : (
              <>
                <Link to="/bookings" className="block">
                  <Button
                    variant="outline"
                    className="w-full h-11 rounded-xl border-border hover:bg-muted text-foreground font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Ticket className="w-4 h-4 text-primary" />
                    <span>Xem Vé Của Tôi</span>
                  </Button>
                </Link>

                <Link to="/" className="block">
                  <Button
                    variant="outline"
                    className="w-full h-11 rounded-xl border-border hover:bg-muted text-muted-foreground hover:text-foreground font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Home className="w-4 h-4" />
                    <span>Về Trang Chủ</span>
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default BookingSuccessPage;
