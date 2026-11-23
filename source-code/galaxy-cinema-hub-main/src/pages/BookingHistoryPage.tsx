import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import {
  Calendar,
  Clock,
  MapPin,
  Ticket,
  CreditCard,
  Download,
  QrCode,
  Search,
  X,
  Copy,
  Check,
  ShoppingBag,
  Film,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AppContext";
import { API_ENDPOINTS, getImageUrl } from "@/lib/api";
import { qrDataUrl } from "@/lib/qr";
import { useToast } from "@/hooks/use-toast";

interface SeatDetail {
  row_code: string;
  number: number;
  price: number;
  seat_type?: string;
}

interface Concession {
  id: number;
  concession_name: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  category?: string;
}

interface BookingHistory {
  id: string;
  bookingCode: string;
  movie: {
    title: string;
    poster: string;
    duration: number;
    ageRating: string;
  };
  cinema: string;
  room: string;
  date: string;
  time: string;
  seats: string[];
  seatsDetail: SeatDetail[];
  seatPriceTotal: number;
  concessions: Concession[];
  concessionsTotal: number;
  originalPrice: number;
  discountAmount: number;
  totalPrice: number;
  status: "completed" | "upcoming" | "cancelled";
  paymentMethod: string;
  bookingDate: string;
  ticketCodes: string[];
  qrCode?: string;
}

const BookingHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedBooking, setSelectedBooking] = useState<BookingHistory | null>(
    null,
  );
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [bookings, setBookings] = useState<BookingHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloadingTicket, setIsDownloadingTicket] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Delay auth check by 1 render cycle to give AuthProvider time to read localStorage
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const fetchBookings = async () => {
      if (!user?.id) return;

      try {
        setIsLoading(true);
        const token = localStorage.getItem("token");
        const response = await fetch(
          API_ENDPOINTS.USER_BOOKINGS(Number(user.id)),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch bookings");
        }

        const result = await response.json();
        const sourceItems = Array.isArray(result?.data?.items)
          ? result.data.items
          : [];

        // Only include bookings that have completed payment or cancelled after paid
        const mappedBookings: BookingHistory[] = sourceItems
          .filter((booking: { status: string; payment_status?: string }) => {
            const paymentStatus = (booking.payment_status || "").toLowerCase();
            const isPaidBooking = booking.status === "Paid";
            const isCancelledAfterPaid =
              booking.status === "Cancelled" && paymentStatus === "success";
            return isPaidBooking || isCancelledAfterPaid;
          })
          .map(
            (booking: {
              id: number;
              booking_code?: string;
              movie_title: string;
              poster_url: string;
              duration_minutes: number;
              age_rating: string;
              start_time: string;
              status: string;
              cinema_name: string;
              hall_name: string;
              seats?: string;
              seats_detail?: Array<{
                row_code: string;
                number: number;
                price: string | number;
                seat_type?: string;
              }>;
              concessions?: Concession[];
              total_price?: string;
              discount_amount?: string;
              final_price?: string;
              payment_method?: string;
              payment_status?: string;
              ticket_codes?: string[];
              created_at: string;
              [key: string]: unknown;
            }) => {
              const startTime = new Date(booking.start_time);
              const bookingDate = booking.start_time.split(" ")[0]; // YYYY-MM-DD
              const bookingTime = startTime.toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              });

              // Determine booking status
              let status: "completed" | "upcoming" | "cancelled" = "upcoming";
              const now = new Date();
              if (booking.status === "Cancelled") {
                status = "cancelled";
              } else if (booking.status === "Paid" && startTime < now) {
                status = "completed";
              }

              const isPaymentSuccess =
                booking.status === "Paid" ||
                (booking.payment_status || "").toLowerCase() === "success";
              const paymentMethodText = booking.payment_method
                ? isPaymentSuccess
                  ? `${booking.payment_method} (Đã thanh toán)`
                  : booking.payment_method
                : isPaymentSuccess
                  ? "Đã thanh toán"
                  : "Chưa thanh toán";
              const ticketCodes = Array.isArray(booking.ticket_codes)
                ? booking.ticket_codes.filter(Boolean)
                : [];
              const qrPayload = booking.booking_code || ticketCodes[0] || "";
              const bookingLevelTicketCodes = qrPayload ? [qrPayload] : [];

              const concessions: Concession[] = Array.isArray(booking.concessions)
                ? booking.concessions
                : [];
              const rawSeatsDetail = Array.isArray(booking.seats_detail)
                ? booking.seats_detail
                : [];
              const seatsDetail: SeatDetail[] = rawSeatsDetail.map((s) => ({
                row_code: String(s.row_code || ""),
                number: Number(s.number || 0),
                price: parseFloat(String(s.price || 0)),
                seat_type: s.seat_type || "Thường",
              }));

              const concessionsTotal = concessions.reduce(
                (sum, c) =>
                  sum +
                  parseFloat(
                    String(
                      c.subtotal ||
                        parseFloat(String(c.unit_price || 0)) *
                          (c.quantity || 1),
                    ),
                  ),
                0,
              );

              const origPrice = parseFloat(String(booking.total_price || 0));
              const seatPriceTotal =
                seatsDetail.length > 0
                  ? seatsDetail.reduce((sum, s) => sum + s.price, 0)
                  : Math.max(0, origPrice - concessionsTotal);

              return {
                id: booking.id.toString(),
                bookingCode: booking.booking_code || "",
                movie: {
                  title: booking.movie_title,
                  poster: getImageUrl(booking.poster_url),
                  duration: booking.duration_minutes,
                  ageRating: booking.age_rating,
                },
                cinema: booking.cinema_name,
                room: booking.hall_name,
                date: bookingDate,
                time: bookingTime,
                seats: booking.seats ? booking.seats.split(", ") : [],
                seatsDetail,
                seatPriceTotal,
                concessions,
                concessionsTotal,
                originalPrice: origPrice,
                discountAmount: parseFloat(booking.discount_amount || "0"),
                totalPrice: parseFloat(
                  booking.final_price || booking.total_price || "0",
                ),
                status: status,
                paymentMethod: paymentMethodText,
                bookingDate: booking.created_at,
                ticketCodes: bookingLevelTicketCodes,
              };
            },
          );

        // Draw QR images locally (ticket codes are not sent to a QR web service).
        const bookingsWithQr = await Promise.all(
          mappedBookings.map(async (b) => ({
            ...b,
            qrCode: b.ticketCodes?.[0]
              ? await qrDataUrl(b.ticketCodes[0], 240)
              : undefined,
          })),
        );
        setBookings(bookingsWithQr);
      } catch (error) {
        console.error("Error fetching bookings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookings();
  }, [user, isAuthenticated, navigate, authChecked]);

  const upcomingCount = bookings.filter((b) => b.status === "upcoming").length;
  const completedCount = bookings.filter((b) => b.status === "completed").length;
  const cancelledCount = bookings.filter((b) => b.status === "cancelled").length;
  const totalCount = bookings.length;

  const filteredBookings = bookings.filter((booking) => {
    const matchesSearch =
      booking.movie.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      booking.bookingCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      booking.cinema.toLowerCase().includes(searchQuery.toLowerCase()) ||
      booking.seats.some((s) =>
        s.toLowerCase().includes(searchQuery.toLowerCase()),
      );

    if (activeTab === "upcoming")
      return booking.status === "upcoming" && matchesSearch;
    if (activeTab === "completed")
      return booking.status === "completed" && matchesSearch;
    if (activeTab === "cancelled")
      return booking.status === "cancelled" && matchesSearch;
    return matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "upcoming":
        return (
          <Badge className="bg-sky-500/15 text-sky-400 border border-sky-500/30 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
            Sắp chiếu
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Đã xem
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Đã hủy
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border border-border text-xs font-bold px-2.5 py-0.5 rounded-full">
            {status}
          </Badge>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({
      title: "Đã sao chép mã đặt vé",
      description: `Mã ${code} đã được lưu vào clipboard.`,
    });
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  const handleViewTicket = (booking: BookingHistory) => {
    setSelectedBooking(booking);
    setShowTicketDialog(true);
  };

  const handleViewDetail = (booking: BookingHistory) => {
    setSelectedBooking(booking);
    setShowDetailDialog(true);
  };

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

  const buildExportTicketNode = (booking: BookingHistory): HTMLDivElement => {
    const root = document.createElement("div");
    root.style.width = "760px";
    root.style.padding = "32px";
    root.style.borderRadius = "28px";
    root.style.background = "linear-gradient(150deg, #0b1a30, #051024)";
    root.style.border = "2px solid #f97316";
    root.style.color = "#ffffff";
    root.style.fontFamily = "Segoe UI, Arial, sans-serif";
    root.style.boxSizing = "border-box";

    const poster = booking.movie.poster
      ? `<img src="${booking.movie.poster}" crossorigin="anonymous" style="width:100%;height:220px;object-fit:cover;border-radius:18px;opacity:.9;" />`
      : "";
    const qr = booking.qrCode
      ? `<img src="${booking.qrCode}" crossorigin="anonymous" style="width:200px;height:200px;background:#fff;border-radius:16px;padding:12px;" />`
      : "";

    const concessionsHtml = booking.concessions.length
      ? `<div style="margin-top:14px;font-size:18px;line-height:1.45;color:#e2e8f0;"><div style="font-weight:700;color:#f97316;margin-bottom:4px;">Bắp nước đã chọn (${booking.concessionsTotal.toLocaleString("vi-VN")}đ):</div>${booking.concessions
          .map(
            (item) =>
              `<div>• ${item.quantity}x ${item.concession_name} - ${parseFloat(item.subtotal).toLocaleString("vi-VN")}đ</div>`,
          )
          .join("")}</div>`
      : "";

    const discountHtml =
      booking.discountAmount > 0
        ? `<div style="margin-top:12px;font-size:18px;color:#10b981;font-weight:700;">Đã tiết kiệm ${booking.discountAmount.toLocaleString("vi-VN")}đ</div>`
        : "";

    root.innerHTML = `
      <div style="display:flex;gap:28px;align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          ${poster}
          <div style="margin-top:18px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div>
              <div style="font-size:32px;font-weight:900;line-height:1.2;color:#ffffff;">${booking.movie.title}</div>
              <div style="margin-top:6px;font-size:20px;color:#cbd5e1;">Mã booking: <span style="font-family:Consolas, monospace;color:#f97316;font-weight:900;">${booking.bookingCode}</span></div>
            </div>
            <div style="padding:8px 16px;border-radius:999px;background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#10b981;font-weight:800;font-size:15px;">✓ VÉ HỢP LỆ</div>
          </div>

          <div style="margin-top:16px;padding-top:16px;border-top:1px dashed rgba(255,255,255,.28);display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:19px;line-height:1.4;">
            <div><span style="color:#94a3b8;">Rạp:</span> ${booking.cinema}</div>
            <div><span style="color:#94a3b8;">Phòng chiếu:</span> ${booking.room}</div>
            <div><span style="color:#94a3b8;">Ngày chiếu:</span> ${formatDate(booking.date)}</div>
            <div><span style="color:#94a3b8;">Suất chiếu:</span> ${booking.time}</div>
            <div style="grid-column:1 / -1;"><span style="color:#94a3b8;">Ghế đã chọn:</span> <span style="font-weight:800;color:#f97316;">${booking.seats.join(", ")} (${booking.seatPriceTotal.toLocaleString("vi-VN")}đ)</span></div>
          </div>

          ${concessionsHtml}
          ${discountHtml}

          <div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.2);font-size:26px;font-weight:900;color:#f97316;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:19px;color:#e2e8f0;font-weight:700;">Tổng thanh toán:</span>
            <span>${booking.totalPrice.toLocaleString("vi-VN")}đ</span>
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

  const handleDownloadTicket = async (booking: BookingHistory) => {
    if (isDownloadingTicket) return;

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.zIndex = "-1";

    const ticketNode = buildExportTicketNode(booking);
    container.appendChild(ticketNode);
    document.body.appendChild(container);

    try {
      setIsDownloadingTicket(true);
      await waitForImages(container);

      const canvas = await html2canvas(ticketNode, {
        scale: Math.min(4, Math.max(2.5, (window.devicePixelRatio || 1) * 2)),
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });

      const imageData = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = imageData;
      link.download = `galaxy-cinema-${booking.bookingCode}.png`;
      link.click();

      toast({
        title: "Đã tải vé thành công",
        description: "Ảnh vé xem phim đã được lưu về thiết bị của bạn.",
      });
    } catch (error) {
      console.error("Failed to download ticket image:", error);
      toast({
        title: "Không thể tải vé",
        description: "Vui lòng thử lại sau ít phút.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingTicket(false);
      container.remove();
    }
  };

  const handleRebook = () => {
    navigate("/movies");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      <Header />

      <main className="flex-1 pb-16 relative">
        {/* Subtle Ambient Top Glow matching other cinema pages */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 max-w-5xl h-64 bg-primary/[0.04] blur-3xl pointer-events-none -z-10 rounded-full" />

        {/* Hero Header Area - Consistent with /movies (CinemasPage) */}
        <div className="border-b border-border/40 bg-card/40 backdrop-blur-sm mb-8">
          <div className="container max-w-5xl mx-auto px-4 py-8 sm:py-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-3 shadow-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Galaxy E-Ticket Manager</span>
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight">
                  Lịch Sử Đặt Vé
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-xl">
                  Quản lý, xuất vé và tra cứu các vé xem phim đã thanh toán thành công
                </p>
              </div>

              {/* Quick Counter Badge */}
              <div className="flex items-center gap-2 self-start sm:self-auto bg-card border border-border px-4 py-2 rounded-2xl shadow-xs">
                <Ticket className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">
                  Tổng số vé:
                </span>
                <span className="font-mono font-extrabold text-primary text-sm">
                  {totalCount} vé
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Container */}
        <div className="container max-w-5xl mx-auto px-4">
          {/* Search & Tabs Controls */}
          <div className="space-y-4 mb-6">
            {/* Search Box */}
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm theo mã đặt vé, tên phim, rạp hoặc ghế..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-9 h-11 rounded-xl bg-card border-border text-foreground text-xs sm:text-sm focus-visible:ring-primary shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="space-y-6"
            >
              <div className="overflow-x-auto pb-1">
                <TabsList className="h-11 p-1 bg-card border border-border rounded-xl inline-flex w-auto min-w-full sm:min-w-0">
                  <TabsTrigger
                    value="all"
                    className="rounded-lg px-4 text-xs sm:text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-xs transition-all"
                  >
                    Tất cả ({totalCount})
                  </TabsTrigger>
                  <TabsTrigger
                    value="upcoming"
                    className="rounded-lg px-4 text-xs sm:text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-xs transition-all"
                  >
                    Sắp tới ({upcomingCount})
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="rounded-lg px-4 text-xs sm:text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-xs transition-all"
                  >
                    Đã xem ({completedCount})
                  </TabsTrigger>
                  <TabsTrigger
                    value="cancelled"
                    className="rounded-lg px-4 text-xs sm:text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-xs transition-all"
                  >
                    Đã hủy ({cancelledCount})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={activeTab} className="space-y-4 focus-visible:outline-none">
                {isLoading ? (
                  <div className="py-24 text-center rounded-3xl bg-card/60 border border-border backdrop-blur-sm">
                    <div className="inline-flex p-4 rounded-2xl bg-primary/10 text-primary mb-3 animate-spin">
                      <Film className="w-8 h-8" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">
                      Đang tải lịch sử đặt vé...
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Vui lòng đợi giây lát trong khi chúng tôi đồng bộ dữ liệu vé của bạn
                    </p>
                  </div>
                ) : filteredBookings.length > 0 ? (
                  <div className="space-y-4">
                    {filteredBookings.map((booking) => (
                      <Card
                        key={booking.id}
                        className="overflow-hidden bg-card border-border text-card-foreground rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 group"
                      >
                        <CardContent className="p-0">
                          <div className="flex flex-col md:flex-row">
                            {/* Movie Poster Stub */}
                            <div className="md:w-44 lg:w-48 relative overflow-hidden bg-slate-900 shrink-0">
                              <img
                                src={
                                  booking.movie.poster ||
                                  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=600&fit=crop"
                                }
                                alt={booking.movie.title}
                                crossOrigin="anonymous"
                                className="w-full h-48 md:h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-slate-950/80 via-transparent to-transparent pointer-events-none" />

                              {/* Age Rating Badge */}
                              {booking.movie.ageRating && (
                                <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-amber-400 border border-amber-400/30 text-[11px] font-black">
                                  {booking.movie.ageRating}
                                </div>
                              )}
                            </div>

                            {/* Center Ticket Information */}
                            <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between">
                              <div>
                                {/* Header: Title + Status Badge */}
                                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                      <h3 className="text-xl sm:text-2xl font-extrabold text-foreground break-words whitespace-normal leading-tight group-hover:text-primary transition-colors">
                                        {booking.movie.title}
                                      </h3>
                                      {getStatusBadge(booking.status)}
                                    </div>

                                    {/* Booking Code with Copy Action */}
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <span className="text-xs text-muted-foreground font-medium">
                                        Mã đặt vé:
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyCode(booking.bookingCode)}
                                        className="inline-flex items-center gap-1.5 font-mono text-xs font-extrabold text-primary hover:opacity-80 transition-opacity bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20"
                                        title="Nhấn để sao chép mã đặt vé"
                                      >
                                        <span>{booking.bookingCode}</span>
                                        {copiedCode === booking.bookingCode ? (
                                          <Check className="w-3 h-3 text-emerald-400" />
                                        ) : (
                                          <Copy className="w-3 h-3 text-primary" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Two Columns Grid Details */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-4 pt-3 border-t border-border/70 text-xs sm:text-sm">
                                  {/* Left Column: Venue & Showtime */}
                                  <div className="space-y-2.5">
                                    <div className="flex items-start gap-2.5 text-foreground/90">
                                      <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                      <span className="font-semibold break-words">
                                        {booking.cinema} {booking.room ? ` - ${booking.room}` : ""}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-foreground/90">
                                      <Calendar className="w-4 h-4 text-primary shrink-0" />
                                      <span className="font-semibold">
                                        {formatDate(booking.date)} - {booking.time}
                                      </span>
                                    </div>
                                    <div className="flex items-start gap-2.5 text-foreground/90">
                                      <Ticket className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                          <span className="text-xs text-muted-foreground">
                                            Ghế ({booking.seats.length} ghế):
                                          </span>
                                          <span className="font-mono font-bold text-foreground text-xs">
                                            {booking.seatPriceTotal.toLocaleString("vi-VN")}đ
                                          </span>
                                        </div>
                                        <div className="inline-flex flex-wrap gap-1 mt-1">
                                          {booking.seats.map((seat, sIdx) => (
                                            <span
                                              key={sIdx}
                                              className="px-1.5 py-0.2 rounded bg-primary/10 text-primary font-mono font-bold text-xs border border-primary/20"
                                            >
                                              {seat}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right Column: Payment & Timestamp */}
                                  <div className="space-y-2.5">
                                    <div className="flex items-center gap-2.5 text-foreground/90">
                                      <CreditCard className="w-4 h-4 text-primary shrink-0" />
                                      <span className="font-medium text-xs sm:text-sm">
                                        {booking.paymentMethod}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-foreground/90">
                                      <Clock className="w-4 h-4 text-primary shrink-0" />
                                      <span className="text-xs text-muted-foreground">
                                        Đặt lúc: {formatDateTime(booking.bookingDate)}
                                      </span>
                                    </div>
                                    {/* Concessions preview if any */}
                                    {booking.concessions.length > 0 && (
                                      <div className="flex items-start gap-2.5 text-foreground/90">
                                        <ShoppingBag className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-xs font-semibold text-muted-foreground">
                                              Bắp nước:
                                            </span>
                                            <span className="font-mono font-bold text-foreground text-xs">
                                              {booking.concessionsTotal.toLocaleString("vi-VN")}đ
                                            </span>
                                          </div>
                                          <span className="text-xs text-muted-foreground break-words block mt-0.5">
                                            {booking.concessions.map((c) => `${c.quantity}x ${c.concession_name}`).join(", ")}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                    {/* Total price highlight */}
                                    <div className="pt-1 flex items-baseline justify-between">
                                      <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                                        Tổng thanh toán:
                                      </span>
                                      <span className="text-xl sm:text-2xl font-black font-mono text-primary drop-shadow-sm">
                                        {booking.totalPrice.toLocaleString("vi-VN")}đ
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Actions Row */}
                              <div className="flex items-center gap-2.5 pt-3 border-t border-border/70 flex-wrap">
                                {booking.status === "upcoming" && (
                                  <>
                                    <Button
                                      onClick={() => handleViewTicket(booking)}
                                      className="h-9 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold text-xs shadow-xs active:scale-95 transition-all flex items-center gap-1.5"
                                    >
                                      <QrCode className="w-3.5 h-3.5" />
                                      <span>Xem vé</span>
                                    </Button>

                                    <Button
                                      variant="outline"
                                      onClick={() => handleDownloadTicket(booking)}
                                      disabled={isDownloadingTicket}
                                      className="h-9 px-4 rounded-xl border-border text-foreground font-bold text-xs hover:bg-muted flex items-center gap-1.5 shadow-xs"
                                    >
                                      <Download className="w-3.5 h-3.5 text-primary" />
                                      <span>{isDownloadingTicket ? "Đang tải..." : "Tải vé"}</span>
                                    </Button>
                                  </>
                                )}

                                {booking.status === "completed" && (
                                  <Button
                                    variant="outline"
                                    onClick={handleRebook}
                                    className="h-9 px-4 rounded-xl border-primary/30 text-primary font-bold text-xs hover:bg-primary/10 flex items-center gap-1.5"
                                  >
                                    <Film className="w-3.5 h-3.5" />
                                    <span>Đặt lại phim này</span>
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  onClick={() => handleViewDetail(booking)}
                                  className="h-9 px-3 rounded-xl text-muted-foreground hover:text-foreground font-bold text-xs"
                                >
                                  Chi tiết
                                </Button>
                              </div>
                            </div>

                            {/* Right Stub: Perforation & QR Code */}
                            {booking.status === "upcoming" && booking.qrCode && (
                              <div className="md:w-44 border-t md:border-t-0 md:border-l-2 md:border-dashed border-border/80 p-5 flex flex-col items-center justify-center bg-muted/20 relative shrink-0">
                                {/* Semicircle notches for cinema ticket tear line */}
                                <div className="hidden md:block absolute -top-3.5 -left-3.5 w-7 h-7 bg-background rounded-full border-b border-border" />
                                <div className="hidden md:block absolute -bottom-3.5 -left-3.5 w-7 h-7 bg-background rounded-full border-t border-border" />

                                <div className="p-2.5 rounded-xl bg-white shadow-md border border-slate-200">
                                  <img
                                    src={booking.qrCode}
                                    alt={`QR ${booking.bookingCode}`}
                                    crossOrigin="anonymous"
                                    className="w-24 h-24 object-contain"
                                  />
                                </div>
                                <span className="text-[11px] font-bold text-muted-foreground mt-2 uppercase tracking-wider">
                                  Quét vé tại rạp
                                </span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center rounded-3xl bg-card border border-border p-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                      <Ticket className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      Không tìm thấy vé xem phim nào
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                      {searchQuery
                        ? "Không có vé nào khớp với từ khóa tìm kiếm của bạn. Hãy thử kiểm tra lại mã vé hoặc tên phim."
                        : "Bạn chưa có đơn đặt vé nào trong mục này. Khám phá ngay các bộ phim bom tấn đang chiếu tại Galaxy Cinema!"}
                    </p>
                    <Button
                      onClick={() => navigate("/movies")}
                      className="h-11 px-6 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold shadow-sm active:scale-95 transition-all inline-flex items-center gap-2"
                    >
                      <span>Khám phá phim ngay</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Ticket Dialog (Xem vé điện tử) */}
      <Dialog open={showTicketDialog} onOpenChange={setShowTicketDialog}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-card border-border text-card-foreground rounded-3xl shadow-2xl">
          <DialogHeader className="p-5 pb-3 border-b border-border">
            <DialogTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
              <Ticket className="w-5 h-5 text-primary" />
              <span>Vé Điện Tử Galaxy Cinema</span>
            </DialogTitle>
          </DialogHeader>

          {selectedBooking && (
            <div className="p-5 space-y-4">
              {/* Movie Header */}
              <div className="text-center">
                <h3 className="text-xl font-black text-foreground break-words whitespace-normal leading-tight">
                  {selectedBooking.movie.title}
                </h3>
                <div className="flex items-center justify-center gap-2 mt-2">
                  {getStatusBadge(selectedBooking.status)}
                  <span className="font-mono text-xs font-extrabold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                    {selectedBooking.bookingCode}
                  </span>
                </div>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-muted/40 rounded-2xl border border-border">
                <div className="p-3 bg-white rounded-xl shadow-md border border-slate-200">
                  <img
                    src={selectedBooking.qrCode}
                    alt="QR Code"
                    crossOrigin="anonymous"
                    className="w-44 h-44 object-contain"
                  />
                </div>
                <p className="text-xs text-muted-foreground font-semibold mt-2.5">
                  Đưa mã QR này cho nhân viên soát vé tại rạp
                </p>
              </div>

              {/* Booking Info Specs */}
              <div className="space-y-2 text-xs sm:text-sm bg-muted/50 p-4 rounded-2xl border border-border/60">
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Rạp:</span>
                  <span className="font-bold text-foreground text-right break-words max-w-[200px]">
                    {selectedBooking.cinema}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Phòng chiếu:</span>
                  <span className="font-bold text-foreground">
                    {selectedBooking.room || "Đang cập nhật"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Ngày & Giờ:</span>
                  <span className="font-bold text-foreground">
                    {formatDate(selectedBooking.date)} - {selectedBooking.time}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Ghế đã chọn:</span>
                  <span className="font-mono font-bold text-primary">
                    {selectedBooking.seats.join(", ")}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Tiền vé ({selectedBooking.seats.length} ghế):</span>
                  <span className="font-mono font-bold text-foreground">
                    {selectedBooking.seatPriceTotal.toLocaleString("vi-VN")}đ
                  </span>
                </div>

                {/* Concessions if any */}
                {selectedBooking.concessions.length > 0 && (
                  <div className="pt-2 border-t border-border space-y-1">
                    <span className="text-xs font-bold text-muted-foreground block mb-0.5">
                      Bắp nước đã chọn:
                    </span>
                    {selectedBooking.concessions.map((item, index) => {
                      const unitPrice = parseFloat(String(item.unit_price || 0));
                      const subtotal = parseFloat(
                        String(item.subtotal || unitPrice * (item.quantity || 1)),
                      );
                      return (
                        <div key={index} className="flex justify-between items-start text-xs text-foreground/90 pl-2 gap-2">
                          <span className="break-words max-w-[240px]">
                            {item.quantity}x {item.concession_name}
                          </span>
                          <span className="font-mono font-semibold shrink-0">
                            {subtotal.toLocaleString("vi-VN")}đ
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Discount if any */}
                {selectedBooking.discountAmount > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-border text-emerald-400 font-bold">
                    <span>Đã tiết kiệm:</span>
                    <span>-{selectedBooking.discountAmount.toLocaleString("vi-VN")}đ</span>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-baseline pt-2 border-t border-border">
                  <span className="font-bold text-foreground">Tổng thanh toán:</span>
                  <span className="text-xl font-black font-mono text-primary">
                    {selectedBooking.totalPrice.toLocaleString("vi-VN")}đ
                  </span>
                </div>
              </div>

              {/* Download Ticket CTA */}
              <Button
                onClick={() => handleDownloadTicket(selectedBooking)}
                disabled={isDownloadingTicket}
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold text-sm shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>{isDownloadingTicket ? "Đang tạo ảnh vé..." : "Lưu Ảnh Vé Về Máy"}</span>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog (Chi Tiết Giao Dịch Đặt Vé) */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-card border-border text-card-foreground rounded-3xl shadow-2xl">
          <DialogHeader className="p-5 pb-3 border-b border-border">
            <DialogTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" />
              <span>Chi Tiết Giao Dịch Đặt Vé</span>
            </DialogTitle>
          </DialogHeader>

          {selectedBooking && (
            <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              {/* Movie Banner Overview */}
              <div className="flex gap-4 items-center bg-muted/40 p-3.5 rounded-2xl border border-border">
                <img
                  src={selectedBooking.movie.poster}
                  alt={selectedBooking.movie.title}
                  className="w-20 h-28 object-cover rounded-xl shadow-md shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-black text-foreground break-words leading-tight mb-1.5">
                    {selectedBooking.movie.title}
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {selectedBooking.movie.ageRating && (
                      <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold px-2 py-0.2">
                        {selectedBooking.movie.ageRating}
                      </Badge>
                    )}
                    {selectedBooking.movie.duration > 0 && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {selectedBooking.movie.duration} phút
                      </span>
                    )}
                    {getStatusBadge(selectedBooking.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mã booking:{" "}
                    <span className="font-mono font-bold text-primary">
                      {selectedBooking.bookingCode}
                    </span>
                  </p>
                </div>
              </div>

              {/* Two Info Blocks: Showtime & Payment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs sm:text-sm">
                {/* Showtime Block */}
                <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-2">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-primary">
                    Thông tin suất chiếu
                  </h4>
                  <div className="flex items-start gap-2 text-foreground/90">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{selectedBooking.cinema}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground/90">
                    <Ticket className="w-4 h-4 text-primary shrink-0" />
                    <span>{selectedBooking.room || "Phòng chiếu tiêu chuẩn"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground/90">
                    <Calendar className="w-4 h-4 text-primary shrink-0" />
                    <span>{formatDate(selectedBooking.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground/90">
                    <Clock className="w-4 h-4 text-primary shrink-0" />
                    <span>{selectedBooking.time}</span>
                  </div>
                </div>

                {/* Transaction Block */}
                <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-2">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-primary">
                    Thông tin thanh toán
                  </h4>
                  <div className="flex justify-between items-center text-foreground/90">
                    <span className="text-muted-foreground">Phương thức:</span>
                    <span className="font-semibold">{selectedBooking.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between items-center text-foreground/90">
                    <span className="text-muted-foreground">Thời gian đặt:</span>
                    <span>{formatDateTime(selectedBooking.bookingDate)}</span>
                  </div>
                  <div className="flex justify-between items-center text-foreground/90">
                    <span className="text-muted-foreground">Trạng thái:</span>
                    <span>{getStatusBadge(selectedBooking.status)}</span>
                  </div>
                </div>
              </div>

              {/* Itemized Order Details (Ghế & Bắp Nước) */}
              <div className="space-y-3 text-xs sm:text-sm">
                {/* Section 1: Chi tiết vé xem phim & Giá ghế cụ thể */}
                <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="font-extrabold text-foreground flex items-center gap-2 text-xs sm:text-sm">
                      <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Ticket className="w-4 h-4" />
                      </div>
                      <div>
                        <span>Chi tiết ghế đã đặt</span>
                        <span className="text-xs text-muted-foreground font-normal ml-1.5">
                          ({selectedBooking.seats.length} ghế)
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground mr-1.5 font-medium">
                        Tổng tiền ghế:
                      </span>
                      <span className="font-mono font-black text-foreground text-sm">
                        {selectedBooking.seatPriceTotal.toLocaleString("vi-VN")}đ
                      </span>
                    </div>
                  </div>

                  {/* List of seats with price and seat type */}
                  {selectedBooking.seatsDetail && selectedBooking.seatsDetail.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {selectedBooking.seatsDetail.map((seat, sIdx) => (
                        <div
                          key={sIdx}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/80 text-xs shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="px-2.5 py-1 rounded-md bg-primary/15 text-primary font-mono font-black text-xs border border-primary/30 shrink-0">
                              {seat.row_code}{seat.number}
                            </span>
                            <div className="min-w-0">
                              <span className="font-bold text-foreground block truncate">
                                {seat.seat_type === "VIP"
                                  ? "Ghế VIP"
                                  : seat.seat_type === "Couple"
                                    ? "Ghế Đôi"
                                    : "Ghế Thường (Standard)"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                Hàng {seat.row_code} • Ghế số {seat.number}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 pl-2">
                            <span className="font-mono font-extrabold text-foreground text-xs block">
                              {seat.price.toLocaleString("vi-VN")}đ
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selectedBooking.seats.map((seat, sIdx) => (
                        <div
                          key={sIdx}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-mono font-bold"
                        >
                          <span className="text-primary">{seat}</span>
                          {selectedBooking.seats.length > 0 && (
                            <span className="text-muted-foreground text-[11px] font-normal">
                              ({(selectedBooking.seatPriceTotal / selectedBooking.seats.length).toLocaleString("vi-VN")}đ)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 2: Bắp nước & Combo đã chọn */}
                <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="font-extrabold text-foreground flex items-center gap-2 text-xs sm:text-sm">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                      <div>
                        <span>Bắp nước & Combo đã chọn</span>
                        <span className="text-xs text-muted-foreground font-normal ml-1.5">
                          ({selectedBooking.concessions.reduce((acc, c) => acc + (c.quantity || 1), 0)} phần)
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground mr-1.5 font-medium">
                        Tổng bắp nước:
                      </span>
                      <span className="font-mono font-black text-foreground text-sm">
                        {selectedBooking.concessionsTotal.toLocaleString("vi-VN")}đ
                      </span>
                    </div>
                  </div>

                  {selectedBooking.concessions.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      {selectedBooking.concessions.map((item, idx) => {
                        const unitPrice = parseFloat(String(item.unit_price || 0));
                        const subtotal = parseFloat(
                          String(item.subtotal || unitPrice * (item.quantity || 1)),
                        );
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/80 text-xs shadow-xs"
                          >
                            <div className="min-w-0 flex-1 pr-3">
                              <div className="font-bold text-foreground text-xs sm:text-sm break-words flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 font-mono font-black text-xs border border-amber-500/30 shrink-0">
                                  {item.quantity}x
                                </span>
                                <span className="leading-snug">{item.concession_name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 pl-8">
                                {item.category && (
                                  <span className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-medium">
                                    {item.category}
                                  </span>
                                )}
                                <span>Đơn giá: {unitPrice.toLocaleString("vi-VN")}đ/phần</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-black text-foreground text-sm">
                                {subtotal.toLocaleString("vi-VN")}đ
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-card/60 border border-border/60 text-center text-xs text-muted-foreground italic">
                      Không chọn bắp nước trong đơn đặt vé này
                    </div>
                  )}
                </div>

                {/* Section 3: Bảng tổng kết thanh toán */}
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Tiền vé ghế ({selectedBooking.seats.length} ghế):</span>
                    <span className="font-mono font-bold text-foreground">
                      {selectedBooking.seatPriceTotal.toLocaleString("vi-VN")}đ
                    </span>
                  </div>

                  {selectedBooking.concessionsTotal > 0 && (
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>
                        Tiền bắp nước ({selectedBooking.concessions.reduce((acc, c) => acc + (c.quantity || 1), 0)} phần):
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        +{selectedBooking.concessionsTotal.toLocaleString("vi-VN")}đ
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-muted-foreground pt-1.5 border-t border-border/60">
                    <span>Tổng tạm tính:</span>
                    <span className="font-mono font-bold text-foreground">
                      {selectedBooking.originalPrice.toLocaleString("vi-VN")}đ
                    </span>
                  </div>

                  {selectedBooking.discountAmount > 0 && (
                    <div className="flex justify-between items-center text-emerald-400 font-bold">
                      <span>Giảm giá voucher / ưu đãi:</span>
                      <span className="font-mono">
                        -{selectedBooking.discountAmount.toLocaleString("vi-VN")}đ
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline pt-2.5 border-t border-primary/20 font-extrabold">
                    <span className="text-foreground text-sm sm:text-base">Tổng tiền thanh toán:</span>
                    <span className="text-2xl sm:text-3xl font-black font-mono text-primary drop-shadow-xs">
                      {selectedBooking.totalPrice.toLocaleString("vi-VN")}đ
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                {selectedBooking.status === "upcoming" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDetailDialog(false);
                        handleViewTicket(selectedBooking);
                      }}
                      className="rounded-xl border-border text-xs font-bold"
                    >
                      <QrCode className="w-3.5 h-3.5 mr-1.5 text-primary" />
                      <span>Xem mã QR</span>
                    </Button>
                    <Button
                      onClick={() => handleDownloadTicket(selectedBooking)}
                      disabled={isDownloadingTicket}
                      className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      <span>{isDownloadingTicket ? "Đang tải..." : "Tải vé"}</span>
                    </Button>
                  </>
                )}
                {selectedBooking.status === "completed" && (
                  <Button
                    onClick={handleRebook}
                    className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                  >
                    <span>Đặt lại phim</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default BookingHistoryPage;
