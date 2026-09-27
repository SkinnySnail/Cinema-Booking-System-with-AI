import React, { useState, useEffect, useCallback } from "react";
import {
  DollarSign, Ticket, Clock, Users, TrendingUp, TrendingDown,
  Film, RefreshCw, ArrowRight, ChevronRight, Armchair,
  Package, MessageSquare, BarChart3, Sparkles, CheckCircle2,
  AlertCircle, ShieldCheck
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiCall, API_ENDPOINTS } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";

interface DashboardStats {
  cinema_id: number;
  cinema_name: string;
  today_revenue: number;
  today_tickets: number;
  today_shows: number;
  occupancy_rate: number;
  changes: { revenue: number };
}

interface RevenueItem {
  date: string;
  day: string;
  revenue: number;
}

interface UpcomingShow {
  id: number;
  movie_title: string;
  hall_name: string;
  start_time: string;
  total_seats: number;
  sold_seats: number;
}

interface CinemaHall {
  id: number;
  name: string;
  total_seats?: number;
  seat_count?: number;
  cinema_id?: number;
}

// SVG Line Chart component with full Dark/Light theme adaptability
const LineChart: React.FC<{ data: RevenueItem[]; height?: number; isDark?: boolean }> = ({
  data,
  height = 180,
  isDark = false
}) => {
  if (!data.length) return null;
  const W = 600;
  const H = height;
  const PAD = { top: 20, right: 20, bottom: 32, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data.map(d => d.revenue), 1);
  const minVal = 0;
  const pts = data.map((d, i) => ({
    x: PAD.left + (i / Math.max(data.length - 1, 1)) * innerW,
    y: PAD.top + innerH - ((d.revenue - minVal) / (maxVal - minVal)) * innerH,
    revenue: d.revenue,
    day: d.day,
    date: d.date,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = [
    `M ${pts[0].x} ${PAD.top + innerH}`,
    ...pts.map(p => `L ${p.x} ${p.y}`),
    `L ${pts[pts.length - 1].x} ${PAD.top + innerH}`,
    'Z'
  ].join(' ');

  // Y-axis ticks
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = (maxVal / yTicks) * i;
    return { val, y: PAD.top + innerH - (i / yTicks) * innerH };
  });

  const fmt = (v: number) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1000
      ? `${(v / 1000).toFixed(0)}K`
      : `${v}`;

  const gridStroke = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(100, 116, 139, 0.15)";
  const textFill = isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(100, 116, 139, 0.75)";
  const dotFill = isDark ? "#0f172a" : "#ffffff";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="mgr-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity={isDark ? 0.35 : 0.22} />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="mgr-line-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" />
        </filter>
      </defs>

      {/* Grid lines */}
      {yLabels.map(({ y }, i) => (
        <line
          key={i}
          x1={PAD.left}
          y1={y}
          x2={PAD.left + innerW}
          y2={y}
          stroke={gridStroke}
          strokeDasharray="4 4"
          strokeWidth="1"
        />
      ))}

      {/* Y labels */}
      {yLabels.map(({ val, y }, i) => (
        <text
          key={i}
          x={PAD.left - 8}
          y={y + 3.5}
          textAnchor="end"
          fill={textFill}
          fontSize="10"
          fontFamily="sans-serif"
        >
          {fmt(val)}
        </text>
      ))}

      {/* X labels */}
      {pts.map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={H - 6}
          textAnchor="middle"
          fill={i === pts.length - 1 ? "#f97316" : textFill}
          fontSize="11"
          fontFamily="sans-serif"
          fontWeight={i === pts.length - 1 ? "700" : "500"}
        >
          {p.day}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaD} fill="url(#mgr-area-grad)" />

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="url(#mgr-line-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r="4.5"
            fill={dotFill}
            stroke="#f97316"
            strokeWidth="2"
          />
          {i === pts.length - 1 && (
            <circle cx={p.x} cy={p.y} r="3" fill="#f97316" filter="url(#glow)" />
          )}
        </g>
      ))}
    </svg>
  );
};

const ManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueItem[]>([]);
  const [upcomingShows, setUpcomingShows] = useState<UpcomingShow[]>([]);
  const [halls, setHalls] = useState<CinemaHall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(v);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, rRes, uRes, hRes] = await Promise.all([
        apiCall<{ success: boolean; data: DashboardStats }>(API_ENDPOINTS.MANAGER_DASHBOARD_STATS),
        apiCall<{ success: boolean; data: { items: RevenueItem[] } }>(API_ENDPOINTS.MANAGER_DASHBOARD_REVENUE),
        apiCall<{ success: boolean; data: { upcoming_shows: UpcomingShow[] } }>(API_ENDPOINTS.MANAGER_DASHBOARD_UPCOMING),
        apiCall<{ success: boolean; data: { halls: CinemaHall[] } }>(API_ENDPOINTS.MANAGER_CINEMA_HALLS).catch(() => ({ success: false, data: { halls: [] } })),
      ]);
      if (sRes.success) setStats(sRes.data);
      if (rRes.success) setRevenueData(rRes.data.items ?? []);
      if (uRes.success) setUpcomingShows(uRes.data.upcoming_shows ?? []);
      if (hRes.success && hRes.data?.halls) setHalls(hRes.data.halls);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const kpiCards = stats
    ? [
        {
          label: "Doanh Thu Hôm Nay",
          value: formatCurrency(stats.today_revenue),
          sub: `${stats.changes.revenue >= 0 ? "+" : ""}${stats.changes.revenue}% so với hôm qua`,
          trend: stats.changes.revenue >= 0,
          icon: DollarSign,
          gradient: "from-amber-500 to-orange-500",
          cardBg: "from-amber-500/10 via-orange-500/5 to-transparent dark:from-amber-500/15 dark:via-orange-500/5 dark:to-transparent",
          cardBorder: "border-amber-200/70 dark:border-amber-900/40",
          iconBg: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
        },
        {
          label: "Vé Đã Bán",
          value: `${stats.today_tickets} vé`,
          sub: "Đã xuất trong hôm nay",
          trend: null,
          icon: Ticket,
          gradient: "from-blue-500 to-indigo-500",
          cardBg: "from-blue-500/10 via-indigo-500/5 to-transparent dark:from-blue-500/15 dark:via-indigo-500/5 dark:to-transparent",
          cardBorder: "border-blue-200/70 dark:border-blue-900/40",
          iconBg: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
        },
        {
          label: "Tỷ Lệ Lấp Đầy",
          value: `${stats.occupancy_rate}%`,
          sub:
            stats.occupancy_rate >= 70
              ? "Hiệu suất xuất sắc 🎉"
              : stats.occupancy_rate >= 40
              ? "Hiệu suất tốt 👍"
              : "Cần tối ưu suất chiếu",
          trend: null,
          icon: Users,
          gradient: "from-purple-500 to-violet-500",
          cardBg: "from-purple-500/10 via-violet-500/5 to-transparent dark:from-purple-500/15 dark:via-violet-500/5 dark:to-transparent",
          cardBorder: "border-purple-200/70 dark:border-purple-900/40",
          iconBg: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
        },
        {
          label: "Suất Chiếu Hôm Nay",
          value: `${stats.today_shows} suất`,
          sub: new Date().toLocaleDateString("vi-VN"),
          trend: null,
          icon: Clock,
          gradient: "from-emerald-500 to-teal-500",
          cardBg: "from-emerald-500/10 via-teal-500/5 to-transparent dark:from-emerald-500/15 dark:via-teal-500/5 dark:to-transparent",
          cardBorder: "border-emerald-200/70 dark:border-emerald-900/40",
          iconBg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-2xl bg-white dark:bg-slate-800/60 animate-pulse border border-slate-200/80 dark:border-slate-800"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 rounded-2xl bg-white dark:bg-slate-800/60 animate-pulse border border-slate-200/80 dark:border-slate-800" />
          <div className="h-72 rounded-2xl bg-white dark:bg-slate-800/60 animate-pulse border border-slate-200/80 dark:border-slate-800" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 flex items-center justify-between">
          <span className="text-sm font-medium">⚠️ {error}</span>
          <button
            onClick={() => void fetchAll()}
            className="text-xs px-3 py-1.5 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded-lg transition-colors font-medium"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Dashboard Quản Lý
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {stats?.cinema_name
              ? `🎬 ${stats.cinema_name} · Hôm nay ${new Date().toLocaleDateString("vi-VN")}`
              : "Trung tâm điều hành & vận hành cụm rạp"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchAll()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0f172a] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs sm:text-sm font-medium transition-all border border-slate-200/80 dark:border-slate-800 shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={cn(
              "relative overflow-hidden rounded-2xl border p-5 transition-all duration-300",
              "bg-white dark:bg-[#0f172a] bg-gradient-to-br",
              card.cardBg,
              card.cardBorder,
              "hover:shadow-md hover:scale-[1.01]"
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shadow-xs",
                  card.iconBg
                )}
              >
                <card.icon className="w-5 h-5" />
              </div>
              {card.trend !== null && (
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border",
                    card.trend
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50"
                      : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50"
                  )}
                >
                  {card.trend ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span>{stats?.changes.revenue ?? 0}%</span>
                </div>
              )}
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
              {card.label}
            </p>
            <p className="text-xl lg:text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
              {card.value}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-medium truncate">
              {card.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Chart + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Line Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                Doanh Thu 7 Ngày Gần Nhất
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Đơn vị: VNĐ</p>
            </div>
            {revenueData.length > 0 && (
              <div className="text-right">
                <p className="text-xs text-slate-400 dark:text-slate-500">Hôm nay</p>
                <p className="text-sm font-bold text-orange-500 dark:text-orange-400">
                  {formatCurrency(revenueData[revenueData.length - 1]?.revenue ?? 0)}
                </p>
              </div>
            )}
          </div>
          {revenueData.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm">
              Chưa có dữ liệu doanh thu
            </div>
          ) : (
            <LineChart data={revenueData} height={180} isDark={isDark} />
          )}
        </div>

        {/* Upcoming Shows */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 flex flex-col shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                Suất Chiếu Sắp Tới
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {new Date().toLocaleDateString("vi-VN")}
              </p>
            </div>
            <button
              onClick={() => navigate("/manager/showtimes")}
              className="text-xs font-semibold text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              Xem tất cả <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-56 pr-1">
            {upcomingShows.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 text-sm py-8 gap-2">
                <Film className="w-8 h-8 opacity-30" />
                <p>Không có suất chiếu sắp tới trong ngày</p>
              </div>
            ) : (
              upcomingShows.map((show) => {
                const occ =
                  show.total_seats > 0
                    ? Math.round((show.sold_seats / show.total_seats) * 100)
                    : 0;
                const occColor =
                  occ >= 70
                    ? "bg-emerald-500"
                    : occ >= 40
                    ? "bg-amber-400"
                    : "bg-orange-500";
                const occText =
                  occ >= 70
                    ? "text-emerald-600 dark:text-emerald-400"
                    : occ >= 40
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-500 dark:text-slate-400";
                return (
                  <div
                    key={show.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100/90 dark:hover:bg-slate-800/70 border border-slate-200/60 dark:border-slate-800 transition-colors"
                  >
                    <div className="shrink-0 text-center w-12">
                      <div className="text-sm font-bold text-orange-500 dark:text-orange-400">
                        {new Date(show.start_time).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {show.hall_name}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {show.movie_title}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", occColor)}
                            style={{ width: `${Math.max(occ, 3)}%` }}
                          />
                        </div>
                        <span className={cn("text-xs font-bold shrink-0", occText)}>
                          {occ}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Module 1: Tình Trạng & Công Suất Phòng Chiếu Trực Tiếp */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <Armchair className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                Tình Trạng & Công Suất Phòng Chiếu Trực Tiếp
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Theo dõi tình trạng phòng chiếu, lịch phim tiếp theo và tỷ lệ lấp đầy ghế
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/manager/seats")}
            className="text-xs font-medium text-orange-500 hover:text-orange-600 dark:text-orange-400 flex items-center gap-1 transition-colors self-start sm:self-auto cursor-pointer"
          >
            Quản lý sơ đồ ghế <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {halls.length === 0 ? (
            <div className="col-span-full py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
              Đang tải danh sách phòng chiếu...
            </div>
          ) : (
            halls.map((hall) => {
              // Find the next upcoming show for this specific hall
              const nextShow = upcomingShows.find(
                (s) => s.hall_name.toLowerCase().trim() === hall.name.toLowerCase().trim()
              );
              const seatCapacity = hall.seat_count || hall.total_seats || 180;
              const sold = nextShow ? nextShow.sold_seats : 0;
              const occPct = nextShow
                ? Math.round((sold / (nextShow.total_seats || seatCapacity)) * 100)
                : 0;

              return (
                <div
                  key={hall.id}
                  className="rounded-xl border border-slate-200/70 dark:border-slate-800 p-4 bg-slate-50/60 dark:bg-slate-900/40 hover:border-orange-500/30 dark:hover:border-orange-500/30 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header info */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                          {hall.name}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                          {seatCapacity} ghế
                        </span>
                      </div>
                      {nextShow ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/40 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Sắp chiếu
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                          Trống lịch
                        </span>
                      )}
                    </div>

                    {/* Movie or Idle status */}
                    {nextShow ? (
                      <div className="space-y-2 mb-3">
                        <div className="text-xs">
                          <span className="text-slate-400 dark:text-slate-500">Phim: </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {nextShow.movie_title}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            Giờ chiếu:{" "}
                            <strong className="text-orange-500 dark:text-orange-400">
                              {new Date(nextShow.start_time).toLocaleTimeString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </strong>
                          </span>
                          <span>
                            Đã đặt: <strong>{sold}</strong>/{nextShow.total_seats || seatCapacity}
                          </span>
                        </div>
                        {/* Capacity meter */}
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              occPct >= 70 ? "bg-emerald-500" : occPct >= 40 ? "bg-amber-400" : "bg-orange-500"
                            )}
                            style={{ width: `${Math.max(occPct, 4)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="py-3 text-center text-xs text-slate-400 dark:text-slate-500 mb-3 bg-white/50 dark:bg-slate-800/20 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                        Chưa có suất chiếu tiếp theo hôm nay
                      </div>
                    )}
                  </div>

                  {/* Hall Quick Links */}
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center gap-2">
                    <button
                      onClick={() => navigate("/manager/seats")}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Armchair className="w-3 h-3 text-orange-500" />
                      Sơ đồ ghế
                    </button>
                    <button
                      onClick={() => navigate("/manager/showtimes")}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-900/40 border border-orange-200/70 dark:border-orange-800/40 text-[11px] font-semibold text-orange-600 dark:text-orange-400 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Clock className="w-3 h-3" />
                      Lịch chiếu
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Module 2: Trung Tâm Vận Hành & Điều Phối Ca Trực */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-xs">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
              Trung Tâm Điều Hành & Vận Hành Ca Trực
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Các quy trình tác nghiệp và kiểm soát chất lượng dịch vụ rạp chiếu
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: "Quầy Bắp Nước & Tồn Kho",
              desc: "Kiểm tra tồn kho combo bắp rang, nước ngọt & vật phẩm sẵn sàng bán",
              badge: "Sẵn sàng",
              badgeStyle: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/40",
              btnLabel: "Quản lý tồn kho",
              icon: Package,
              iconColor: "text-amber-500 bg-amber-500/10",
              path: "/manager/concessions",
            },
            {
              title: "Nhân Sự & Phân Ca",
              desc: "Theo dõi danh sách nhân viên trực quầy vé POS & soát vé ca hôm nay",
              badge: "Đang trực ca",
              badgeStyle: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/40",
              btnLabel: "Điều phối nhân viên",
              icon: Users,
              iconColor: "text-blue-500 bg-blue-500/10",
              path: "/manager/staff",
            },
            {
              title: "Đánh Giá Khách Hàng",
              desc: "Xem phản hồi, chấm điểm chất lượng âm thanh, hình ảnh & dịch vụ",
              badge: "Mới nhất",
              badgeStyle: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/40",
              btnLabel: "Xem đánh giá",
              icon: MessageSquare,
              iconColor: "text-purple-500 bg-purple-500/10",
              path: "/manager/reviews",
            },
            {
              title: "Báo Cáo & Đối Soát Ca",
              desc: "Tổng kết doanh thu bán vé, hóa đơn POS & xuất file chốt ca trực",
              badge: "Đối soát",
              badgeStyle: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40",
              btnLabel: "Xuất báo cáo",
              icon: BarChart3,
              iconColor: "text-emerald-500 bg-emerald-500/10",
              path: "/manager/reports",
            },
          ].map((op) => (
            <div
              key={op.title}
              className="p-4 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-white dark:hover:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between group shadow-2xs hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", op.iconColor)}>
                    <op.icon className="w-4 h-4" />
                  </div>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", op.badgeStyle)}>
                    {op.badge}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-1 group-hover:text-orange-500 dark:group-hover:text-orange-400 transition-colors">
                  {op.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 leading-relaxed">
                  {op.desc}
                </p>
              </div>

              <button
                onClick={() => navigate(op.path)}
                className="w-full py-2 px-3 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:border-orange-300 dark:group-hover:border-orange-800/50 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all flex items-center justify-between cursor-pointer"
              >
                <span>{op.btnLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;
