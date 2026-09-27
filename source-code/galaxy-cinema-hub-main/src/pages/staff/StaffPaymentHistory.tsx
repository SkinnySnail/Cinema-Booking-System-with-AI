import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCcw,
  ReceiptText,
  Printer,
  Download,
} from "lucide-react";
import { API_ENDPOINTS, apiCall } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AppContext";
import StaffAccessDenied from "@/components/staff/StaffAccessDenied";
import * as XLSX from "xlsx";

interface PosPaymentHistoryItem {
  id: number;
  booking_code: string;
  booking_status: string;
  payment_status?: string;
  payment_method?: string;
  movie_title: string;
  cinema_name: string;
  hall_name: string;
  start_time: string;
  seats?: string;
  customer_phone: string;
  customer_name?: string;
  user_id?: number | null;
  customer_type?: "guest" | "registered";
  final_price: number;
  created_at: string;
}

interface BookingDetailResponse {
  success: boolean;
  data: {
    id: number;
    booking_code: string;
    final_price: number;
    total_price: number;
    tickets?: Array<{
      ticket_code: string;
      row_code?: string;
      number?: number;
    }>;
    movie_title?: string;
    cinema_name?: string;
    hall_name?: string;
    start_time?: string;
    concessions?: Array<{
      name?: string;
      quantity?: number;
      price?: number;
    }>;
  };
}

const StaffPaymentHistory: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [accessDenied, setAccessDenied] = useState(false);

  // Kiểm tra quyền xem lịch sử thanh toán
  const hasHistoryPermission = useMemo(() => {
    if (!user) return true;
    if (user.role === "admin" || user.base_role === "admin") return true;

    if (user.permissions && Array.isArray(user.permissions)) {
      return (
        user.permissions.includes("bookings.pos") ||
        user.permissions.includes("transactions.view_all") ||
        user.permissions.includes("bookings.view_all")
      );
    }
    return true;
  }, [user]);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PosPaymentHistoryItem[]>([]);
  const [error, setError] = useState("");
  const [reprintingBookingId, setReprintingBookingId] = useState<number | null>(
    null,
  );

  const [filters, setFilters] = useState({
    phone: "",
    booking_code: "",
    movie_title: "",
    booking_status: "",
    payment_status: "",
    date_from: "",
    date_to: "",
  });

  const fetchHistory = async (nextFilters = filters) => {
    if (!hasHistoryPermission) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "100");

      Object.entries(nextFilters).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        }
      });

      const res = await apiCall<{
        success: boolean;
        data?: { items?: PosPaymentHistoryItem[] };
        items?: PosPaymentHistoryItem[];
      }>(`${API_ENDPOINTS.POS_BOOKING_HISTORY}?${params.toString()}`);

      const rows = res.data?.items || res.items || [];
      setItems(rows);
      setAccessDenied(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Không thể tải lịch sử thanh toán";
      if (
        message.includes("Không có quyền") ||
        message.includes("403") ||
        message.includes("Insufficient")
      ) {
        setAccessDenied(true);
      } else {
        setError(message);
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasHistoryPermission) {
      setAccessDenied(false);
      void fetchHistory();
    } else {
      setAccessDenied(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHistoryPermission, user?.permissions, user?.role_id]);

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    void fetchHistory(filters);
  };

  const clearFilters = () => {
    const empty = {
      phone: "",
      booking_code: "",
      movie_title: "",
      booking_status: "",
      payment_status: "",
      date_from: "",
      date_to: "",
    };
    setFilters(empty);
    void fetchHistory(empty);
  };

  const exportExcel = () => {
    if (items.length === 0) {
      return;
    }

    const exportRows = items.map((item) => ({
      "Mã booking": item.booking_code || "",
      Khách: item.customer_name || "Khách vãng lai",
      "Loại khách": item.customer_type === "registered" ? "Đã có tài khoản" : "Khách vãng lai",
      "SĐT khách": item.customer_phone || "",
      Phim: item.movie_title || "",
      Rạp: item.cinema_name || "",
      Phòng: item.hall_name || "",
      "Suất chiếu": item.start_time
        ? new Date(item.start_time.replace(" ", "T")).toLocaleString("vi-VN")
        : "",
      Ghế: item.seats || "-",
      "Tổng tiền": `${Number(item.final_price || 0).toLocaleString("vi-VN")}đ`,
      "PT thanh toán": item.payment_method || "",
      "TT đơn": item.booking_status || "",
      "TT thanh toán": item.payment_status || "",
      "Thời gian tạo": item.created_at
        ? new Date(item.created_at.replace(" ", "T")).toLocaleString("vi-VN")
        : "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = [
      { wch: 18 },
      { wch: 24 },
      { wch: 18 },
      { wch: 14 },
      { wch: 28 },
      { wch: 20 },
      { wch: 14 },
      { wch: 22 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 22 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "LichSuThanhToan");

    const exportDate = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `lich-su-thanh-toan-${exportDate}.xlsx`);
  };

  const printReceipt = (booking: BookingDetailResponse["data"]) => {
    const ticketRowsHtml =
      booking.tickets && booking.tickets.length > 0
        ? booking.tickets
            .map(
              (ticket, idx) => `
                <tr>
                  <td style="padding:6px 0; border-bottom:1px dashed #ddd;">#${idx + 1}</td>
                  <td style="padding:6px 0; border-bottom:1px dashed #ddd;">${ticket.row_code || ""}${ticket.number || ""}</td>
                  <td style="padding:6px 0; border-bottom:1px dashed #ddd; font-family:monospace;">${ticket.ticket_code}</td>
                </tr>`,
            )
            .join("")
        : `<tr><td colspan="3" style="padding:8px 0; color:#666;">Không có dữ liệu vé</td></tr>`;

    const qrImagesHtml = `
      <div style="text-align:center; margin:10px 0; page-break-inside:avoid;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(booking.booking_code)}" style="width:200px;height:200px;border:1px solid #ddd;padding:6px;" />
        <div style="font-family:monospace; font-size:12px; margin-top:6px;"><b>${booking.booking_code}</b></div>
      </div>
    `;

    const concessions = booking.concessions || [];

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>In lại bill ${booking.booking_code}</title>
          <meta charset="UTF-8" />
        </head>
        <body style="font-family:Arial,sans-serif; padding:20px; color:#111;">
          <h2 style="margin:0 0 10px;">GALAXY CINEMA - IN LẠI VÉ</h2>
          <div style="font-size:13px; margin-bottom:12px;">
            <div>Mã booking: <b>${booking.booking_code}</b></div>
            <div>Phim: <b>${booking.movie_title || "-"}</b></div>
            <div>Rạp/Phòng: <b>${booking.cinema_name || "-"} / ${booking.hall_name || "-"}</b></div>
            <div>Suất chiếu: <b>${booking.start_time || "-"}</b></div>
            <div>Thời gian in lại: ${new Date().toLocaleString("vi-VN")}</div>
          </div>

          <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:10px;">
            <thead>
              <tr style="text-align:left; border-bottom:1px solid #000;">
                <th style="padding:6px 0;">STT</th>
                <th style="padding:6px 0;">Ghế</th>
                <th style="padding:6px 0;">Mã vé QR</th>
              </tr>
            </thead>
            <tbody>${ticketRowsHtml}</tbody>
          </table>

          ${
            concessions.length > 0
              ? `
          <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:10px;">
            <thead>
              <tr style="text-align:left; border-bottom:1px solid #000;">
                <th style="padding:6px 0;">Bắp nước</th>
                <th style="padding:6px 0; text-align:right;">Giá</th>
                <th style="padding:6px 0; text-align:right;">SL</th>
                <th style="padding:6px 0; text-align:right;">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${concessions
                .map(
                  (con) => `
                <tr style="border-bottom:1px dashed #ddd;">
                  <td style="padding:6px 0;">${con.name || "Combo"}</td>
                  <td style="padding:6px 0; text-align:right;">${Number(con.price || 0).toLocaleString("vi-VN")}đ</td>
                  <td style="padding:6px 0; text-align:right;">${Number(con.quantity || 0)}</td>
                  <td style="padding:6px 0; text-align:right; font-weight:bold;">${(Number(con.price || 0) * Number(con.quantity || 0)).toLocaleString("vi-VN")}đ</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
          `
              : ""
          }

          <div style="font-size:16px; font-weight:bold; margin:10px 0 16px; text-align:right;">
            Tổng thanh toán: ${(booking.final_price || booking.total_price || 0).toLocaleString("vi-VN")}đ
          </div>

          <div style="border-top:1px dashed #999; padding-top:10px;">
            <h3 style="margin:0 0 8px;">Mã QR để nhân viên quét vé:</h3>
            ${qrImagesHtml}
          </div>

          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleReprintBooking = async (bookingId: number) => {
    setReprintingBookingId(bookingId);
    try {
      const bookingDetail = await apiCall<BookingDetailResponse>(
        API_ENDPOINTS.BOOKING_DETAIL(bookingId),
      );

      if (bookingDetail?.data) {
        printReceipt(bookingDetail.data);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể in lại vé";
      toast({
        title: "Lỗi in lại vé",
        description: message,
        variant: "destructive",
      });
    } finally {
      setReprintingBookingId(null);
    }
  };

  if (!hasHistoryPermission || accessDenied) {
    return (
      <StaffAccessDenied
        title="Bạn không có quyền xem Lịch Sử Thanh Toán"
        requiredPermission="bookings.pos"
        returnPath="/staff/scanner"
        returnLabel="Chuyển sang Quét Vé"
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="w-5 h-5" />
              Lịch Sử Thanh Toán Tại Quầy
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={exportExcel}
                disabled={loading || items.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Xuất Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => void fetchHistory(filters)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCcw className="w-4 h-4 mr-2" />
                )}
                Tải lại
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="SĐT khách"
              value={filters.phone}
              onChange={(e) => handleFilterChange("phone", e.target.value)}
            />
            <Input
              placeholder="Mã booking"
              value={filters.booking_code}
              onChange={(e) =>
                handleFilterChange("booking_code", e.target.value)
              }
            />
            <Input
              placeholder="Tên phim"
              value={filters.movie_title}
              onChange={(e) =>
                handleFilterChange("movie_title", e.target.value)
              }
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filters.booking_status}
              onChange={(e) =>
                handleFilterChange("booking_status", e.target.value)
              }
            >
              <option value="">Tất cả trạng thái đơn</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filters.payment_status}
              onChange={(e) =>
                handleFilterChange("payment_status", e.target.value)
              }
            >
              <option value="">Tất cả trạng thái thanh toán</option>
              <option value="Success">Success</option>
              <option value="Pending">Pending</option>
              <option value="Failed">Failed</option>
            </select>
            <Input
              type="date"
              value={filters.date_from}
              onChange={(e) => handleFilterChange("date_from", e.target.value)}
            />
            <Input
              type="date"
              value={filters.date_to}
              onChange={(e) => handleFilterChange("date_to", e.target.value)}
            />
          </div>

          <div className="mb-4 flex items-center gap-2">
            <Button onClick={applyFilters} disabled={loading}>
              Áp dụng bộ lọc
            </Button>
            <Button variant="outline" onClick={clearFilters} disabled={loading}>
              Xóa lọc
            </Button>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">Mã booking</th>
                  <th className="px-2 py-2">Khách</th>
                  <th className="px-2 py-2">Phim</th>
                  <th className="px-2 py-2">Ghế</th>
                  <th className="px-2 py-2">Tổng tiền</th>
                  <th className="px-2 py-2">TT thanh toán</th>
                  <th className="px-2 py-2">Thời gian</th>
                  <th className="px-2 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-2 py-6 text-center text-muted-foreground"
                    >
                      Chưa có dữ liệu lịch sử thanh toán
                    </td>
                  </tr>
                )}

                {items.map((item) => {
                  const canReprint =
                    (item.booking_status || "").toLowerCase() === "paid" ||
                    (item.payment_status || "").toLowerCase() === "success";

                  return (
                    <tr key={item.id} className="border-b">
                      <td className="px-2 py-2 font-medium">
                        {item.booking_code}
                      </td>
                      <td className="px-2 py-2">
                        <div>{item.customer_name || "Khách vãng lai"}</div>
                        <div className="text-xs text-emerald-600">
                          {item.customer_type === "registered"
                            ? "Đã có tài khoản"
                            : "Khách vãng lai"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.customer_phone}
                        </div>
                      </td>
                      <td className="px-2 py-2">{item.movie_title}</td>
                      <td className="px-2 py-2">{item.seats || "-"}</td>
                      <td className="px-2 py-2 font-semibold text-primary">
                        {Number(item.final_price || 0).toLocaleString("vi-VN")}đ
                      </td>
                      <td className="px-2 py-2">
                        <Badge
                          className={
                            canReprint ? "bg-green-600" : "bg-gray-500"
                          }
                        >
                          {item.payment_status || item.booking_status}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">
                        {new Date(
                          item.created_at.replace(" ", "T"),
                        ).toLocaleString("vi-VN")}
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            !canReprint || reprintingBookingId === item.id
                          }
                          onClick={() => void handleReprintBooking(item.id)}
                        >
                          {reprintingBookingId === item.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Printer className="w-3 h-3 mr-1" />
                          )}
                          In lại
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffPaymentHistory;
