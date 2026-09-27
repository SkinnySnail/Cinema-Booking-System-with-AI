import React from "react";
import {
  Ticket,
  Users,
  DollarSign,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Film,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import SeatHeatmap from "@/components/admin/SeatHeatmap";
import { API_ENDPOINTS, apiCall } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DashboardStats {
  today_revenue: number;
  today_tickets: number;
  today_fill_rate: number;
  vn_ratio: number;
  vn_count: number;
  international_count: number;
  changes: {
    revenue: number;
    tickets: number;
    fill_rate: number;
  };
}

interface RevenueItem {
  day: string;
  date: string;
  revenue: number;
}

interface HeatmapItem {
  row: string;
  number: number;
  booking_count: number;
}

interface HeatmapStats {
  max_booking_count: number;
  zero_booking_seats: number;
  average_booking_count: number;
}

interface RecentTransaction {
  transaction_code: string;
  customer_name: string;
  customer_phone: string;
  payment_method: string;
  amount: number;
  status: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [revenueData, setRevenueData] = React.useState<RevenueItem[]>([]);
  const [heatmapItems, setHeatmapItems] = React.useState<HeatmapItem[]>([]);
  const [heatmapStats, setHeatmapStats] = React.useState<
    HeatmapStats | undefined
  >(undefined);
  const [transactions, setTransactions] = React.useState<RecentTransaction[]>(
    [],
  );
  const [allHalls, setAllHalls] = React.useState<
    Array<{ id: number; name: string; cinema_name: string }>
  >([]);
  const [selectedHallId, setSelectedHallId] = React.useState<string>("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadDashboardData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [statsRes, revenueRes, heatmapRes, txRes, cinemasRes] = await Promise.all([
        apiCall<ApiResponse<DashboardStats>>(API_ENDPOINTS.ADMIN_STATS),
        apiCall<ApiResponse<{ items: RevenueItem[] }>>(
          API_ENDPOINTS.ADMIN_REVENUE,
        ),
        apiCall<ApiResponse<{ items: HeatmapItem[]; stats: HeatmapStats }>>(
          API_ENDPOINTS.ADMIN_SEAT_HEATMAP,
        ),
        apiCall<ApiResponse<{ items: RecentTransaction[] }>>(
          API_ENDPOINTS.ADMIN_RECENT_TRANSACTIONS,
        ),
        apiCall<ApiResponse<{ cinemas: Array<{ id: number; name: string; halls: Array<{ id: number; name: string }> }> }>>(
          API_ENDPOINTS.CINEMAS,
        ).catch(() => ({ data: { cinemas: [] } })),
      ]);

      setStats(statsRes.data);
      setRevenueData(
        (revenueRes.data.items || []).map((item) => ({
          ...item,
          revenue: Number(item.revenue) || 0,
        })),
      );
      setHeatmapItems(heatmapRes.data.items || []);
      setHeatmapStats(heatmapRes.data.stats);
      setTransactions(txRes.data.items || []);

      const hallsList = (cinemasRes.data.cinemas || []).flatMap((c) =>
        (c.halls || []).map((h) => ({
          id: h.id,
          name: h.name,
          cinema_name: c.name,
        })),
      );
      setAllHalls(hallsList);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không tải được dữ liệu dashboard",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleHallChange = async (hallId: string) => {
    setSelectedHallId(hallId);
    try {
      const url =
        hallId !== "all"
          ? `${API_ENDPOINTS.ADMIN_SEAT_HEATMAP}?hall_id=${hallId}`
          : API_ENDPOINTS.ADMIN_SEAT_HEATMAP;
      const res = await apiCall<
        ApiResponse<{ items: HeatmapItem[]; stats: HeatmapStats }>
      >(url);
      setHeatmapItems(res.data.items || []);
      setHeatmapStats(res.data.stats);
    } catch (err) {
      console.error("Lỗi tải bản đồ nhiệt phòng:", err);
    }
  };

  React.useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  if (loading) {
    return <div className="p-6">Đang tải dữ liệu dashboard...</div>;
  }

  if (error || !stats) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-destructive font-medium">Không thể tải Dashboard</p>
        <p className="text-sm text-muted-foreground">
          {error || "Dữ liệu không hợp lệ"}
        </p>
      </div>
    );
  }

  const vnRatio = stats.vn_ratio;
  const isVNRatioLow = vnRatio < 15;

  const statCards = [
    {
      title: "Tổng Doanh Thu",
      value: `${Math.round(stats.today_revenue).toLocaleString("vi-VN")}đ`,
      change: `${stats.changes.revenue >= 0 ? "+" : ""}${stats.changes.revenue.toFixed(1)}%`,
      trend: stats.changes.revenue >= 0 ? "up" : "down",
      icon: DollarSign,
      color: "bg-green-500",
    },
    {
      title: "Tổng Vé Đã Bán",
      value: String(stats.today_tickets),
      change: `${stats.changes.tickets >= 0 ? "+" : ""}${stats.changes.tickets.toFixed(1)}%`,
      trend: stats.changes.tickets >= 0 ? "up" : "down",
      icon: Ticket,
      color: "bg-blue-500",
    },
    {
      title: "Tỷ Lệ Lấp Đầy Tổng",
      value: `${stats.today_fill_rate.toFixed(1)}%`,
      change: `${stats.changes.fill_rate >= 0 ? "+" : ""}${stats.changes.fill_rate.toFixed(1)}%`,
      trend: stats.changes.fill_rate >= 0 ? "up" : "down",
      icon: Users,
      color: "bg-purple-500",
    },
    {
      title: "Phim Việt Nam",
      value: `${vnRatio.toFixed(0)}%`,
      change: vnRatio >= 15 ? "Đạt chuẩn" : "Chưa đạt",
      trend: vnRatio >= 15 ? "up" : "down",
      icon: Film,
      color: vnRatio >= 15 ? "bg-green-500" : "bg-red-500",
      alert: isVNRatioLow,
    },
  ];

  const maxRevenue = Math.max(...revenueData.map((d) => d.revenue), 1);
  const hasRevenue = revenueData.some((d) => d.revenue > 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Tổng quan hoạt động kinh doanh</p>
      </div>

      {/* VN Movie Alert */}
      {isVNRatioLow && (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl animate-pulse">
          <AlertTriangle className="w-6 h-6 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">
              Cảnh báo: Tỷ lệ phim Việt Nam thấp!
            </p>
            <p className="text-sm text-muted-foreground">
              Tỷ lệ hiện tại: {vnRatio.toFixed(1)}%. Yêu cầu tối thiểu: 15% theo
              quy định.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card
            key={index}
            className={cn(
              "relative overflow-hidden",
              stat.alert && "border-destructive",
            )}
          >
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <div
                    className={cn(
                      "flex items-center gap-1 text-sm mt-1",
                      stat.trend === "up" ? "text-green-600" : "text-red-600",
                    )}
                  >
                    {stat.trend === "up" ? (
                      <ArrowUp className="w-4 h-4" />
                    ) : (
                      <ArrowDown className="w-4 h-4" />
                    )}
                    {stat.change}
                  </div>
                </div>
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    stat.color,
                  )}
                >
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-[2fr,1fr] gap-6">
        {/* Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle>7 Mốc Doanh Thu Gần Nhất</CardTitle>
            <CardDescription>Triệu VND (toàn bộ thời gian)</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasRevenue && (
              <div className="text-sm text-muted-foreground mb-3">
                Chưa có doanh thu ở các mốc hiện tại.
              </div>
            )}
            <div className="flex items-end justify-between gap-2 h-48">
              {revenueData.map((item, index) => (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center gap-2"
                >
                  {/** Use pixel height so bars always render even when parent height is auto. */}
                  {(() => {
                    const ratio =
                      maxRevenue > 0 ? item.revenue / maxRevenue : 0;
                    const barHeightPx =
                      item.revenue > 0 ? Math.max(ratio * 160, 12) : 2;

                    return (
                      <div
                        className="w-full bg-emerald-100 hover:bg-emerald-200 rounded-t-lg transition-colors relative group"
                        style={{ height: `${barHeightPx}px` }}
                      >
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t-lg transition-all"
                          style={{ height: "100%" }}
                        />
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {(item.revenue / 1_000_000).toFixed(2)}M
                        </div>
                      </div>
                    );
                  })()}
                  <span className="text-xs text-muted-foreground">
                    {item.day}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* VN Movie Ratio Donut */}
        <Card>
          <CardHeader>
            <CardTitle>Tỷ Lệ Phim Việt</CardTitle>
            <CardDescription>Theo quy định ≥15%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-40 h-40 mx-auto">
              <svg
                className="w-full h-full transform -rotate-90"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  className="text-muted"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${vnRatio * 2.51} 251`}
                  className={
                    isVNRatioLow ? "text-destructive" : "text-green-500"
                  }
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className={cn(
                    "text-3xl font-bold",
                    isVNRatioLow ? "text-destructive" : "text-green-600",
                  )}
                >
                  {vnRatio.toFixed(0)}%
                </span>
                <span className="text-xs text-muted-foreground">Phim Việt</span>
              </div>
            </div>
            <div className="flex justify-center gap-4 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm">Phim Việt ({stats.vn_count})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted" />
                <span className="text-sm">
                  Quốc tế ({stats.international_count})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seat Heatmap */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
          <div>
            <CardTitle>Bản Đồ Nhiệt Ghế Ngồi</CardTitle>
            <CardDescription>
              Thống kê mức độ phổ biến theo toàn bộ ma trận tối đa hàng và cột
            </CardDescription>
          </div>
          {allHalls.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                Phòng chiếu:
              </span>
              <Select value={selectedHallId} onValueChange={handleHallChange}>
                <SelectTrigger className="w-[230px] h-8 text-xs bg-background">
                  <SelectValue placeholder="Tất cả phòng chiếu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    Tất cả phòng (Khung tối đa)
                  </SelectItem>
                  {allHalls.map((h) => (
                    <SelectItem key={h.id} value={String(h.id)}>
                      {h.name} - {h.cinema_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <SeatHeatmap items={heatmapItems} stats={heatmapStats} />
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Giao Dịch Gần Đây</CardTitle>
          <CardDescription>10 giao dịch mới nhất</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Mã GD
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Khách hàng
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Thanh toán
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Số tiền
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr
                    key={tx.transaction_code}
                    className="border-b border-border hover:bg-muted/50"
                  >
                    <td className="py-3 px-4 font-mono text-sm">
                      {tx.transaction_code}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{tx.customer_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {tx.customer_phone}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="uppercase">
                        {tx.payment_method}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-medium">
                      {tx.amount.toLocaleString("vi-VN")}đ
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        className={cn(
                          tx.status === "Success" &&
                            "bg-green-100 text-green-700 hover:bg-green-100",
                          tx.status === "Pending" &&
                            "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
                          tx.status === "Failed" &&
                            "bg-red-100 text-red-700 hover:bg-red-100",
                        )}
                      >
                        {tx.status === "Success"
                          ? "Thành công"
                          : tx.status === "Pending"
                            ? "Đang xử lý"
                            : "Thất bại"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td
                      className="py-6 px-4 text-center text-muted-foreground"
                      colSpan={5}
                    >
                      Chưa có giao dịch nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
