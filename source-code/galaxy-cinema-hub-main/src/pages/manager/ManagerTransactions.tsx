import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Loader2,
  Wrench,
  Film,
  MapPin,
  Calendar,
  Armchair,
  Popcorn,
  Ticket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_BASE_URL, API_ENDPOINTS, apiCall } from "@/lib/api";

interface TransactionItem {
  id: string;
  bookingCode: string;
  customerName: string;
  customerEmail: string;
  movieTitle: string;
  cinemaName: string;
  showDate: string;
  showTime: string;
  seatCount: number;
  amount: number;
  paymentMethod: string;
  status: "success" | "pending" | "failed" | "refunded";
  transactionDate: string;
  bookingId?: number;
}

interface TicketDetail {
  ticket_code: string;
  row_code: string;
  number: number;
  seat_type: string;
  price: number;
  status: string;
}

interface ConcessionDetail {
  name: string;
  quantity: number;
  price: number;
  image_url?: string;
}

interface BookingDetail {
  id: number;
  booking_code: string;
  customer_name: string;
  customer_email: string;
  movie_title: string;
  cinema_name: string;
  hall_name: string;
  show_date: string;
  show_time: string;
  total_price: number;
  discount_amount: number;
  final_price: number;
  status: string;
  payment_method: string;
  payment_status: string;
  start_time?: string;
  transaction?: {
    payment_method: string;
    status: string;
  };
  tickets: TicketDetail[];
  concessions: ConcessionDetail[];
}

const ManagerTransactions: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [allItems, setAllItems] = useState<TransactionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<BookingDetail | null>(
    null,
  );

  const [fixDialogOpen, setFixDialogOpen] = useState(false);
  const [fixTargetTransaction, setFixTargetTransaction] =
    useState<TransactionItem | null>(null);
  const [fixingStatus, setFixingStatus] = useState<
    "confirm" | "cancel" | "refund" | null
  >(null);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (paymentMethod !== "all") params.set("payment_method", paymentMethod);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const url = params.toString()
        ? `${API_ENDPOINTS.MANAGER_TRANSACTIONS}?${params.toString()}`
        : API_ENDPOINTS.MANAGER_TRANSACTIONS;

      const res = await apiCall<{
        success: boolean;
        data: { items: TransactionItem[] };
      }>(url);
      setAllItems(res.data?.items || []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể tải dữ liệu giao dịch";
      setError(message);
      setAllItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, filterStatus, paymentMethod, dateFrom, dateTo]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  // Frontend pagination
  const totalItems = allItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * limit;
    return allItems.slice(start, start + limit);
  }, [allItems, page, limit]);

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    const numbers: number[] = [];
    for (let i = start; i <= end; i++) numbers.push(i);
    return numbers;
  }, [totalPages, page]);

  // Summary stats computed from full list
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let successCount = 0;
    let pendingCount = 0;
    let failedOrRefundedCount = 0;
    for (const t of allItems) {
      totalRevenue += Number(t.amount || 0);
      if (t.status === "success") successCount++;
      else if (t.status === "pending") pendingCount++;
      else failedOrRefundedCount++;
    }
    return { totalRevenue, successCount, pendingCount, failedOrRefundedCount };
  }, [allItems]);

  const getStatusBadge = (status: string) => {
    const configs = {
      success: {
        color: "bg-green-500",
        label: "Thành công",
        icon: CheckCircle,
      },
      pending: { color: "bg-yellow-500", label: "Đang xử lý", icon: Clock },
      failed: { color: "bg-red-500", label: "Thất bại", icon: XCircle },
      refunded: {
        color: "bg-gray-500",
        label: "Đã hoàn tiền",
        icon: CreditCard,
      },
    };
    const config = configs[status as keyof typeof configs];
    if (!config) return <Badge>{status}</Badge>;
    return (
      <Badge className={`${config.color} text-white gap-1`}>
        <config.icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString("vi-VN");

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("vi-VN");

  const formatVND = (value: number): string =>
    `${Math.round(Number(value) || 0).toLocaleString("vi-VN")}đ`;

  const openDetail = async (transaction: TransactionItem) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      const bookingId = transaction.bookingId ?? Number(transaction.id);
      const res = await apiCall<{ success: boolean; data: BookingDetail }>(
        `${API_BASE_URL}/api/bookings/${bookingId}`,
      );
      if (res.success && res.data) {
        setSelectedDetail(res.data);
      } else {
        throw new Error("Không tìm thấy chi tiết booking");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi tải chi tiết";
      setSelectedDetail({
        id: 0,
        booking_code: transaction.bookingCode,
        customer_name: transaction.customerName,
        customer_email: transaction.customerEmail,
        movie_title: transaction.movieTitle,
        cinema_name: transaction.cinemaName,
        hall_name: "",
        show_date: transaction.showDate,
        show_time: transaction.showTime,
        total_price: transaction.amount,
        discount_amount: 0,
        final_price: transaction.amount,
        status: transaction.status,
        payment_method: transaction.paymentMethod,
        payment_status: transaction.status,
        tickets: [],
        concessions: [],
        _error: msg,
      } as BookingDetail & { _error?: string });
    } finally {
      setDetailLoading(false);
    }
  };

  const isShowtimeActive = (transaction: TransactionItem): boolean => {
    if (!transaction.showDate || !transaction.showTime) return false;
    const dateStr = `${transaction.showDate}T${transaction.showTime}`;
    const showDateTime = new Date(dateStr);
    return showDateTime > new Date();
  };

  const handleFixStatus = async (action: "confirm" | "cancel" | "refund") => {
    if (!selectedDetail || fixingStatus) return;
    const bookingId = selectedDetail.id;
    if (!bookingId) return;
    setFixingStatus(action);
    try {
      await apiCall(API_ENDPOINTS.ADMIN_FORCE_BOOKING_STATUS(bookingId), {
        method: "PUT",
        body: JSON.stringify({ action }),
      });
      const res = await apiCall<{ success: boolean; data: BookingDetail }>(
        `${API_BASE_URL}/api/bookings/${bookingId}`,
      );
      if (res.success && res.data) setSelectedDetail(res.data);
      await loadTransactions();
    } catch (err) {
      console.error("Lỗi cập nhật trạng thái:", err);
    } finally {
      setFixingStatus(null);
    }
  };

  const handleTableFix = async (action: "confirm" | "cancel" | "refund") => {
    if (!fixTargetTransaction || fixingStatus) return;
    const bookingId =
      fixTargetTransaction.bookingId ?? Number(fixTargetTransaction.id);
    if (!bookingId) return;
    setFixingStatus(action);
    try {
      await apiCall(API_ENDPOINTS.ADMIN_FORCE_BOOKING_STATUS(bookingId), {
        method: "PUT",
        body: JSON.stringify({ action }),
      });
      setFixDialogOpen(false);
      setFixTargetTransaction(null);
      await loadTransactions();
    } catch (err) {
      console.error("Lỗi cập nhật trạng thái:", err);
    } finally {
      setFixingStatus(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Quản Lý Giao Dịch</h1>
        <p className="text-muted-foreground">
          Theo dõi và quản lý các giao dịch thanh toán tại rạp
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tổng doanh thu</p>
                <p className="text-2xl font-bold">
                  {summary.totalRevenue.toLocaleString("vi-VN")}đ
                </p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Giao dịch thành công
                </p>
                <p className="text-2xl font-bold">{summary.successCount}</p>
              </div>
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Đang xử lý</p>
                <p className="text-2xl font-bold">{summary.pendingCount}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Thất bại/Hoàn</p>
                <p className="text-2xl font-bold">
                  {summary.failedOrRefundedCount}
                </p>
              </div>
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle>Danh Sách Giao Dịch</CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Mã GD/khách/phim..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              <Select
                value={filterStatus}
                onValueChange={(value) => {
                  setFilterStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="success">Thành công</SelectItem>
                  <SelectItem value="pending">Đang xử lý</SelectItem>
                  <SelectItem value="failed">Thất bại</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={paymentMethod}
                onValueChange={(value) => {
                  setPaymentMethod(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Thanh toán" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="vnpay">VNPay</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-40"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-40"
              />
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                  setPaymentMethod("all");
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
              >
                Xóa lọc
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã Đặt Vé</TableHead>
                <TableHead>Khách Hàng</TableHead>
                <TableHead>Phim</TableHead>
                <TableHead>Ngày/Giờ Chiếu</TableHead>
                <TableHead>Số Ghế</TableHead>
                <TableHead>Số Tiền</TableHead>
                <TableHead>Thanh Toán</TableHead>
                <TableHead>Trạng Thái</TableHead>
                <TableHead>Thời Gian</TableHead>
                <TableHead className="text-center">Thao Tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Đang tải dữ liệu giao dịch...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && error && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-8 text-red-500"
                  >
                    {error}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !error && paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Không có giao dịch phù hợp
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                !error &&
                paginatedItems.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-mono font-medium">
                      {transaction.bookingCode}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {transaction.customerName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {transaction.customerEmail}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {transaction.movieTitle}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="text-muted-foreground">
                          {transaction.showDate
                            ? `${formatDate(transaction.showDate)} - ${transaction.showTime}`
                            : "-"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {transaction.seatCount}
                    </TableCell>
                    <TableCell className="font-bold text-primary">
                      {transaction.amount.toLocaleString("vi-VN")}đ
                    </TableCell>
                    <TableCell>{transaction.paymentMethod}</TableCell>
                    <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {transaction.transactionDate
                        ? formatDateTime(transaction.transactionDate)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-7 px-2 text-xs hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
                          onClick={() => openDetail(transaction)}
                        >
                          <Eye className="w-3 h-3" />
                          Chi tiết
                        </Button>
                        {transaction.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7 px-2 text-xs hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-400 border-yellow-300 text-yellow-700"
                            onClick={() => {
                              setFixTargetTransaction(transaction);
                              setFixDialogOpen(true);
                            }}
                          >
                            <Wrench className="w-3 h-3" />
                            Xử lý
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          {!isLoading && !error && totalItems > 0 && (
            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Hiển thị {(page - 1) * limit + 1} -{" "}
                {Math.min(page * limit, totalItems)} / {totalItems} giao dịch
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={String(limit)}
                  onValueChange={(value) => {
                    setLimit(Number(value));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / trang</SelectItem>
                    <SelectItem value="20">20 / trang</SelectItem>
                    <SelectItem value="50">50 / trang</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Trước
                </Button>

                {pageNumbers.map((num) => (
                  <Button
                    key={num}
                    size="sm"
                    variant={num === page ? "default" : "outline"}
                    onClick={() => setPage(num)}
                  >
                    {num}
                  </Button>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages, prev + 1))
                  }
                >
                  Sau
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================== TRANSACTION DETAIL DIALOG ===================== */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Ticket className="w-5 h-5 text-blue-500" />
              Chi Tiết Giao Dịch
            </DialogTitle>
          </DialogHeader>

          {detailLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm text-muted-foreground">
                Đang tải chi tiết...
              </p>
            </div>
          )}

          {!detailLoading && selectedDetail && (
            <div className="space-y-5">
              {/* Booking info */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Thông Tin Đặt Vé
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Mã đặt vé:</span>
                    <p className="font-mono font-bold text-primary">
                      {selectedDetail.booking_code}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Trạng thái:</span>
                    <p className="font-medium capitalize">
                      {selectedDetail.status}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Khách hàng:</span>
                    <p className="font-medium">
                      {selectedDetail.customer_name || "(Khách vãng lai)"}
                    </p>
                  </div>
                  {selectedDetail.customer_email &&
                  selectedDetail.customer_email !== "-" &&
                  !selectedDetail.customer_email.includes("@guest.local") ? (
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                      <p className="text-xs break-all">
                        {selectedDetail.customer_email}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <span className="text-muted-foreground">Thanh toán:</span>
                    <p className="font-medium">
                      {selectedDetail.transaction?.payment_method ||
                        selectedDetail.payment_method ||
                        "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      TT thanh toán:
                    </span>
                    <p className="font-medium">
                      {selectedDetail.transaction?.status ||
                        selectedDetail.payment_status ||
                        "-"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Show info */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Suất Chiếu
                </h3>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="font-semibold">
                      {selectedDetail.movie_title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>
                      {selectedDetail.cinema_name}
                      {selectedDetail.hall_name
                        ? ` — ${selectedDetail.hall_name}`
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-green-500 shrink-0" />
                    <span>
                      {selectedDetail.start_time ? (
                        <>
                          {formatDate(selectedDetail.start_time)} lúc{" "}
                          {new Date(
                            selectedDetail.start_time,
                          ).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </>
                      ) : (
                        <>
                          {selectedDetail.show_date
                            ? formatDate(selectedDetail.show_date)
                            : "-"}
                          {selectedDetail.show_time
                            ? ` lúc ${selectedDetail.show_time}`
                            : ""}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tickets */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Armchair className="w-4 h-4" /> Vé (
                  {selectedDetail.tickets?.length ?? 0})
                </h3>
                {selectedDetail.tickets && selectedDetail.tickets.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">
                            Ghế
                          </th>
                          <th className="text-left px-3 py-2 font-medium">
                            Loại
                          </th>
                          <th className="text-right px-3 py-2 font-medium">
                            Giá vé
                          </th>
                          <th className="text-center px-3 py-2 font-medium">
                            Trạng thái
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDetail.tickets.map((ticket, idx) => (
                          <tr
                            key={ticket.ticket_code ?? idx}
                            className="border-t"
                          >
                            <td className="px-3 py-2 font-mono font-bold">
                              {ticket.row_code}
                              {ticket.number}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {ticket.seat_type}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-primary">
                              {formatVND(ticket.price)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant="outline" className="text-xs">
                                {ticket.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic pl-1">
                    Không có thông tin vé
                  </p>
                )}
              </div>

              {/* Concessions */}
              {selectedDetail.concessions &&
                selectedDetail.concessions.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Popcorn className="w-4 h-4" /> Bắp Nước (
                      {selectedDetail.concessions.length})
                    </h3>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">
                              Sản phẩm
                            </th>
                            <th className="text-center px-3 py-2 font-medium">
                              SL
                            </th>
                            <th className="text-right px-3 py-2 font-medium">
                              Đơn giá
                            </th>
                            <th className="text-right px-3 py-2 font-medium">
                              Thành tiền
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDetail.concessions.map((item, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="px-3 py-2 font-medium">
                                {item.name}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {item.quantity}
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">
                                {formatVND(item.price)}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold">
                                {formatVND(item.price * item.quantity)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* Price summary */}
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Tổng vé + bắp nước:
                  </span>
                  <span>{formatVND(selectedDetail.total_price)}</span>
                </div>
                {selectedDetail.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Giảm giá / voucher:</span>
                    <span>- {formatVND(selectedDetail.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base">
                  <span>Thanh toán:</span>
                  <span className="text-primary">
                    {formatVND(selectedDetail.final_price)}
                  </span>
                </div>
              </div>

              {/* Fix pending status actions */}
              {selectedDetail.status?.toLowerCase() === "pending" && (
                <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800 p-4 space-y-3">
                  <h3 className="font-semibold text-sm text-yellow-700 dark:text-yellow-400 uppercase tracking-wide flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Xử Lý Giao Dịch Đang Chờ
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Giao dịch này đang ở trạng thái{" "}
                    <span className="font-semibold text-yellow-600">
                      Đang xử lý
                    </span>
                    . Bạn có thể xác nhận thủ công hoặc đánh dấu thất bại.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      size="sm"
                      className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                      disabled={fixingStatus !== null}
                      onClick={() => handleFixStatus("confirm")}
                    >
                      {fixingStatus === "confirm" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      Xác nhận thành công
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-2"
                      disabled={fixingStatus !== null}
                      onClick={() => handleFixStatus("cancel")}
                    >
                      {fixingStatus === "cancel" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                      Đánh dấu thất bại
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===================== FIX STATUS DIALOG ===================== */}
      <Dialog open={fixDialogOpen} onOpenChange={setFixDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Wrench className="w-5 h-5 text-yellow-500" />
              Xử Lý Giao Dịch Đang Chờ
            </DialogTitle>
          </DialogHeader>

          {fixTargetTransaction && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1.5">
                <div>
                  <span className="text-muted-foreground">Mã đặt vé: </span>
                  <span className="font-mono font-bold text-primary">
                    {fixTargetTransaction.bookingCode}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Khách hàng: </span>
                  <span className="font-medium">
                    {fixTargetTransaction.customerName}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Phim: </span>
                  <span>{fixTargetTransaction.movieTitle}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Suất chiếu: </span>
                  <span>
                    {fixTargetTransaction.showDate
                      ? `${formatDate(fixTargetTransaction.showDate)} – ${fixTargetTransaction.showTime}`
                      : "-"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Số tiền: </span>
                  <span className="font-bold text-primary">
                    {fixTargetTransaction.amount.toLocaleString("vi-VN")}đ
                  </span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Chọn hành động để cập nhật trạng thái giao dịch:
              </p>

              <div className="flex flex-col gap-2">
                {/* Đã hoàn tiền */}
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-12 border-orange-300 text-orange-700 hover:bg-orange-50 hover:border-orange-400"
                  disabled={fixingStatus !== null}
                  onClick={() => handleTableFix("refund")}
                >
                  {fixingStatus === "refund" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  <div className="text-left">
                    <div className="font-semibold">Đã hoàn tiền</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      Đánh dấu đã hoàn trả tiền cho khách
                    </div>
                  </div>
                </Button>

                {/* Thất bại */}
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-12 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
                  disabled={fixingStatus !== null}
                  onClick={() => handleTableFix("cancel")}
                >
                  {fixingStatus === "cancel" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  <div className="text-left">
                    <div className="font-semibold">Thất bại</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      Đánh dấu giao dịch không thành công
                    </div>
                  </div>
                </Button>

                {/* Thành công – chỉ hiện nếu suất chiếu chưa qua */}
                {isShowtimeActive(fixTargetTransaction) && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3 h-12 border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400"
                    disabled={fixingStatus !== null}
                    onClick={() => handleTableFix("confirm")}
                  >
                    {fixingStatus === "confirm" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    <div className="text-left">
                      <div className="font-semibold">Thành công</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        Xác nhận thanh toán thành công
                      </div>
                    </div>
                  </Button>
                )}
              </div>

              <div className="pt-1">
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={fixingStatus !== null}
                  onClick={() => setFixDialogOpen(false)}
                >
                  Hủy
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagerTransactions;
