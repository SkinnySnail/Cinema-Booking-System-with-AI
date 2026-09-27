import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Download, RefreshCw, TrendingUp, Users2, BarChart2,
  Calendar, DollarSign, Percent, FileSpreadsheet, FileText,
  CalendarDays
} from "lucide-react";
import { apiCall, API_ENDPOINTS } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions, Content, TableCell as PdfTableCell } from "pdfmake/interfaces";

let pdfFontsInitialized = false;
const ensurePdfMakeReady = () => {
  if (pdfFontsInitialized) return;
  const fontsData = pdfFonts as { vfs?: Record<string, string>; pdfMake?: { vfs?: Record<string, string> } };
  const vfs = fontsData.vfs ?? fontsData.pdfMake?.vfs;
  if (vfs) {
    if (typeof pdfMake.addVirtualFileSystem === "function") {
      pdfMake.addVirtualFileSystem(vfs);
    } else {
      (pdfMake as typeof pdfMake & { vfs?: Record<string, string> }).vfs = vfs;
    }
  }
  pdfMake.setFonts({
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });
  pdfFontsInitialized = true;
};

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
}

interface RevenueRow { label: string; revenue: number; booking_count: number; }

import { useTheme } from "@/hooks/use-theme";

// SVG Line chart for revenue
const RevenueLineChart: React.FC<{ data: RevenueRow[]; height?: number; isDark?: boolean }> = ({
  data,
  height = 200,
  isDark = false
}) => {
  if (!data.length) return null;
  const W = 600; const H = height;
  const PAD = { top: 20, right: 20, bottom: 32, left: 64 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const pts = data.map((d, i) => ({
    x: PAD.left + (i / Math.max(data.length - 1, 1)) * innerW,
    y: PAD.top + innerH - (d.revenue / maxRev) * innerH,
    ...d,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = [`M ${pts[0].x} ${PAD.top + innerH}`, ...pts.map(p => `L ${p.x} ${p.y}`), `L ${pts[pts.length - 1].x} ${PAD.top + innerH}`, "Z"].join(" ");
  const fmt = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ val: maxRev * f, y: PAD.top + innerH - f * innerH }));

  const gridStroke = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const textFill = isDark ? "rgba(148,163,184,0.7)" : "rgba(100,116,139,0.75)";
  const dotFill = isDark ? "#0f172a" : "#ffffff";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="rv-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity={isDark ? 0.35 : 0.25} />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="rv-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f97316" /><stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      {ticks.map(({ y }, i) => <line key={i} x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke={gridStroke} strokeDasharray="4 4" strokeWidth="1" />)}
      {ticks.map(({ val, y }, i) => (
        <text key={i} x={PAD.left - 8} y={y + 4} textAnchor="end" fill={textFill} fontSize="10" fontFamily="sans-serif">{fmt(val)}</text>
      ))}
      {pts.map((p, i) => (
        <text key={i} x={p.x} y={H - 4} textAnchor="middle" fill={i === pts.length - 1 ? "#f97316" : textFill} fontSize="9" fontFamily="sans-serif">
          {new Date(p.label).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
        </text>
      ))}
      <path d={areaD} fill="url(#rv-area)" />
      <path d={pathD} fill="none" stroke="url(#rv-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3.5} fill={dotFill} stroke="url(#rv-line)" strokeWidth="2" />
      ))}
    </svg>
  );
};

const PERIODS = [
  { label: "7 ngày", value: 7 },
  { label: "15 ngày", value: 15 },
  { label: "30 ngày", value: 30 },
];

const EXPORT_PERIODS = [
  { label: "7 ngày", value: 7 },
  { label: "15 ngày", value: 15 },
  { label: "30 ngày", value: 30 },
];

const ManagerReports: React.FC = () => {
  const { toast } = useToast();
  const [period, setPeriod] = useState(7);
  const [revenueData, setRevenueData] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingType, setExportingType] = useState<"excel" | "pdf" | null>(null);
  const [cinemaName, setCinemaName] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState(7);

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);

  const formatVND = (v: number): string =>
    `${Math.round(Number(v) || 0).toLocaleString("vi-VN")}đ`;

  const formatNumber = (v: number) => Math.round(Number(v) || 0).toLocaleString("vi-VN");

  const formatDateTime = (dateStr: string) => new Date(dateStr).toLocaleString("vi-VN");
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("vi-VN");

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = { success: "Thành công", pending: "Đang xử lý", failed: "Thất bại", refunded: "Đã hoàn tiền" };
    return labels[status] || status;
  };

  const isCashMethod = (method?: string) => {
    const normalized = String(method || "").toLowerCase().trim();
    return normalized.includes("cash") || normalized.includes("tiền mặt");
  };

  const toPercent = (part: number, total: number) =>
    total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "0%";

  const computeDateRange = useCallback((customPeriod?: number) => {
    const p = customPeriod ?? period;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - p + 1);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }, [period]);

  const totalRevenue = revenueData.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const totalBookings = revenueData.reduce((s, r) => s + (Number(r.booking_count) || 0), 0);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = computeDateRange();
      const [rvRes, cinemaRes] = await Promise.all([
        apiCall<{ success: boolean; data: { total_revenue: number; items: RevenueRow[] } }>(
          `${API_ENDPOINTS.MANAGER_REPORT_REVENUE}?from=${from}&to=${to}&group_by=day`
        ),
        apiCall<{ success: boolean; data: { cinema: { id: number; name: string } } }>(
          API_ENDPOINTS.MANAGER_CINEMA_INFO
        ),
      ]);
      if (rvRes.success) setRevenueData(rvRes.data.items ?? []);
      if (cinemaRes.success) setCinemaName(cinemaRes.data.cinema?.name ?? "");
    } catch (e: unknown) {
      toast({ title: "Lỗi", description: e instanceof Error ? e.message : "Không thể tải báo cáo", variant: "destructive" });
    } finally { setLoading(false); }
  }, [period, toast, computeDateRange]);

  useEffect(() => { void fetchReports(); }, [fetchReports]);

  // ── Fetch transactions for export ──

  const fetchTransactionsForExport = async (customPeriod?: number): Promise<TransactionItem[]> => {
    const p = customPeriod ?? exportPeriod;
    const { from, to } = computeDateRange(p);
    const res = await apiCall<{ success: boolean; data: { items: TransactionItem[] } }>(
      `${API_ENDPOINTS.MANAGER_TRANSACTIONS}?limit=5000&date_from=${from}&date_to=${to}`
    );
    return res.data?.items || [];
  };

  const fetchTransactionDetailsForExport = async (customPeriod?: number): Promise<any[]> => {
    const p = customPeriod ?? exportPeriod;
    const { from, to } = computeDateRange(p);
    const res = await apiCall<{ success: boolean; data: { items: any[] } }>(
      `${API_ENDPOINTS.MANAGER_TRANSACTIONS_EXPORT_DETAILS}?date_from=${from}&date_to=${to}`
    );
    return res.data?.items || [];
  };

  // ── Export Excel (2 sheets: GiaoDich + ChiTietGiaoDich) ──

  const exportTransactionsExcel = async () => {
    if (exportingType) return;
    setExportingType("excel");
    setExportDialogOpen(false);
    try {
      const rows = await fetchTransactionsForExport(exportPeriod);
      if (rows.length === 0) {
        toast({ title: "Không có dữ liệu", description: `Không có giao dịch nào trong ${exportPeriod} ngày qua`, variant: "destructive" });
        return;
      }

      const detailRows = rows.map((t, i) => ({
        STT: i + 1,
        "Mã đặt vé": t.bookingCode,
        "Khách hàng": t.customerName,
        Email: t.customerEmail,
        Phim: t.movieTitle,
        Rạp: t.cinemaName,
        "Ngày chiếu": t.showDate ? formatDate(t.showDate) : "-",
        "Giờ chiếu": t.showTime || "-",
        "Số ghế": t.seatCount,
        "Số tiền": formatVND(Number(t.amount || 0)),
        "Phương thức TT": t.paymentMethod,
        "Trạng thái": getStatusLabel(t.status),
        "Thời gian giao dịch": t.transactionDate ? formatDateTime(t.transactionDate) : "-",
      }));

      const workbook = XLSX.utils.book_new();

      // Sheet tóm tắt
      const { from, to } = computeDateRange(exportPeriod);
      const headerInfo = [
        { "Thông tin": "Báo cáo giao dịch", "Giá trị": `${cinemaName || "Manager"}` },
        { "Thông tin": "Ngày xuất", "Giá trị": new Date().toLocaleString("vi-VN") },
        { "Thông tin": "Khoảng thời gian", "Giá trị": `${exportPeriod} ngày gần nhất (${from} → ${to})` },
        { "Thông tin": "Tổng giao dịch", "Giá trị": `${rows.length} giao dịch` },
        { "Thông tin": "Tổng doanh thu", "Giá trị": formatVND(rows.reduce((s, r) => s + Number(r.amount || 0), 0)) },
      ];
      const summarySheet = XLSX.utils.json_to_sheet(headerInfo);
      summarySheet["!cols"] = [{ wch: 24 }, { wch: 48 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "TomTat");

      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      detailSheet["!cols"] = [
        { wch: 6 }, { wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 32 },
        { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
        { wch: 14 }, { wch: 16 }, { wch: 24 },
      ];
      XLSX.utils.book_append_sheet(workbook, detailSheet, "GiaoDich");

      // Sheet 2: Chi tiết (Vé + Bắp nước)
      const detailsArray = await fetchTransactionDetailsForExport(exportPeriod);
      const itemDetailRows = detailsArray.map((item, i) => ({
        STT: i + 1,
        "Mã đặt vé": item.bookingCode,
        "Khách hàng": item.customerName,
        Loại: item.itemType,
        "Sản phẩm": item.itemName,
        "Đơn giá": formatVND(Number(item.unitPrice || 0)),
        "Số lượng": item.quantity,
        "Thành tiền": formatVND(Number(item.totalPrice || 0)),
        "Thời gian giao dịch": item.transactionDate && item.transactionDate !== "-" ? formatDateTime(item.transactionDate) : "-",
      }));

      const itemDetailSheet = XLSX.utils.json_to_sheet(itemDetailRows);
      itemDetailSheet["!cols"] = [
        { wch: 6 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 26 },
        { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 22 },
      ];
      XLSX.utils.book_append_sheet(workbook, itemDetailSheet, "ChiTietGiaoDich");

      const exportDate = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `giao-dich-${cinemaName || "manager"}-${exportPeriod}ngay-${exportDate}.xlsx`);
      toast({ title: "✅ Xuất thành công", description: `File Excel ${exportPeriod} ngày đã được tải về` });
    } catch (e: unknown) {
      toast({ title: "❌ Lỗi", description: e instanceof Error ? e.message : "Xuất Excel thất bại", variant: "destructive" });
    } finally { setExportingType(null); }
  };

  // ── Export PDF Report ──

  const exportRevenueReportPdf = async () => {
    if (exportingType) return;
    setExportingType("pdf");
    setExportDialogOpen(false);
    try {
      const rows = await fetchTransactionsForExport(exportPeriod);
      if (rows.length === 0) {
        toast({ title: "Không có dữ liệu", description: `Không có giao dịch nào trong ${exportPeriod} ngày qua`, variant: "destructive" });
        return;
      }

      ensurePdfMakeReady();

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const monthRows = rows.filter((row) => {
        if (!row.transactionDate) return false;
        const d = new Date(row.transactionDate);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
      });

      const totalTransactions = rows.length;
      const totalRevenueAmount = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const monthRevenue = monthRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const monthTickets = monthRows.reduce((sum, r) => sum + Number(r.seatCount || 0), 0);
      const avgOrderValue = totalTransactions ? totalRevenueAmount / totalTransactions : 0;

      const cashCount = monthRows.filter((r) => isCashMethod(r.paymentMethod)).length;
      const transferCount = Math.max(monthRows.length - cashCount, 0);

      const movieMap = new Map<string, { tickets: number; revenue: number }>();
      rows.forEach((r) => {
        const key = r.movieTitle || "(Không rõ phim)";
        const cur = movieMap.get(key) || { tickets: 0, revenue: 0 };
        cur.tickets += Number(r.seatCount || 0);
        cur.revenue += Number(r.amount || 0);
        movieMap.set(key, cur);
      });

      const topMovies = Array.from(movieMap.entries())
        .map(([movie, stats]) => ({ movie, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const statusCounters = {
        success: rows.filter((r) => r.status === "success").length,
        pending: rows.filter((r) => r.status === "pending").length,
        failed: rows.filter((r) => r.status === "failed").length,
        refunded: rows.filter((r) => r.status === "refunded").length,
      };

      const buildMetricCard = (label: string, value: string, hint?: string, fillColor = "#eef2ff") => {
        const stack: Content[] = [
          { text: label.toUpperCase(), style: "metricLabel" },
          { text: value, style: "metricValue" },
        ];
        if (hint) stack.push({ text: hint, style: "metricHint" });
        return {
          table: { widths: ["*"], body: [[{ stack, border: [false, false, false, false], fillColor }]] },
          layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12 },
        };
      };

      const paymentTableBody: PdfTableCell[][] = [
        [{ text: "Hình thức", style: "tableHeader" }, { text: "Số giao dịch", style: "tableHeader", alignment: "right" }, { text: "Tỷ lệ", style: "tableHeader", alignment: "right" }],
        [{ text: "Tiền mặt", style: "tableCell" }, { text: formatNumber(cashCount), style: "tableCell", alignment: "right" }, { text: toPercent(cashCount, monthRows.length), style: "tableCell", alignment: "right" }],
        [{ text: "Chuyển khoản", style: "tableCell" }, { text: formatNumber(transferCount), style: "tableCell", alignment: "right" }, { text: toPercent(transferCount, monthRows.length), style: "tableCell", alignment: "right" }],
      ] as unknown as PdfTableCell[][];

      const statusTableBody: PdfTableCell[][] = [
        [{ text: "Trạng thái", style: "tableHeader" }, { text: "Số lượng", style: "tableHeader", alignment: "right" }, { text: "Tỷ lệ", style: "tableHeader", alignment: "right" }],
        ...Object.entries(statusCounters).map(([key, value]) => [
          { text: getStatusLabel(key), style: "tableCell" },
          { text: formatNumber(value), style: "tableCell", alignment: "right" },
          { text: toPercent(value, totalTransactions), style: "tableCell", alignment: "right" },
        ]),
      ] as unknown as PdfTableCell[][];

      const movieTableBody: PdfTableCell[][] = [
        [{ text: "Hạng", style: "tableHeader", alignment: "center" }, { text: "Phim", style: "tableHeader" }, { text: "Vé bán", style: "tableHeader", alignment: "right" }, { text: "Doanh thu", style: "tableHeader", alignment: "right" }],
        ...topMovies.map((item, index) => [
          { text: `#${index + 1}`, style: "tableCell", alignment: "center" },
          { text: item.movie, style: "tableCell" },
          { text: formatNumber(item.tickets), style: "tableCell", alignment: "right" },
          { text: formatVND(item.revenue), style: "tableCell", alignment: "right" },
        ]),
      ] as unknown as PdfTableCell[][];

      if (topMovies.length === 0) {
        movieTableBody.push([{ text: "Chưa có dữ liệu", colSpan: 4, alignment: "center", style: "tableCellMuted" }, {}, {}, {}]);
      }

      const highlightItems = [
        topMovies.length > 0 ? `${topMovies[0].movie} dẫn đầu với ${formatNumber(topMovies[0].tickets)} vé (${formatVND(topMovies[0].revenue)}).` : "Chưa ghi nhận phim bán chạy.",
        `Tỷ trọng thanh toán: ${toPercent(cashCount, monthRows.length)} tiền mặt • ${toPercent(transferCount, monthRows.length)} chuyển khoản.`,
        `Giá trị trung bình mỗi giao dịch: ${formatVND(avgOrderValue)}.`,
        `Rạp: ${cinemaName}`,
      ];

      const metricBlocks = [
        buildMetricCard("Tổng doanh thu", formatVND(totalRevenueAmount), `${formatNumber(totalTransactions)} giao dịch`, "#eef2ff"),
        buildMetricCard(`Doanh thu tháng ${currentMonth}`, formatVND(monthRevenue), `${formatNumber(monthRows.length)} giao dịch trong tháng`, "#ecfdf5"),
        buildMetricCard("Giá trị TB/giao dịch", formatVND(avgOrderValue), "Trên toàn bộ dữ liệu", "#fff7ed"),
        buildMetricCard("Số vé tháng", formatNumber(monthTickets), `${formatNumber(movieMap.size)} phim đang được thống kê`, "#fdf2f8"),
      ];

      const metricRows: Content[] = [];
      for (let i = 0; i < metricBlocks.length; i += 2) {
        metricRows.push({ columns: metricBlocks.slice(i, i + 2), columnGap: 14, margin: [0, i === 0 ? 16 : 8, 0, 0] } as unknown as Content);
      }

      const tableLayout = {
        fillColor: (rowIndex: number) => (rowIndex === 0 ? "#0f172a" : rowIndex % 2 === 0 ? "#ffffff" : "#f9fafb"),
        hLineWidth: (rowIndex: number) => (rowIndex === 0 ? 0 : 0.5),
        vLineWidth: () => 0,
        hLineColor: () => "#e5e7eb",
        paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 6, paddingBottom: () => 6,
      };

      const exportDate = new Date().toISOString().slice(0, 10);
      const { from: exportFrom, to: exportTo } = computeDateRange(exportPeriod);
      const docDefinition: TDocumentDefinitions = {
        info: { title: `Báo cáo doanh thu ${cinemaName} - ${exportPeriod} ngày - ${exportDate}` },
        pageMargins: [40, 50, 40, 60],
        defaultStyle: { font: "Roboto", fontSize: 11, color: "#0f172a" },
        content: [
          { text: "BÁO CÁO DOANH THU GIAO DỊCH", style: "header" },
          { text: `Rạp: ${cinemaName}`, style: "meta" },
          { text: `Khoảng thời gian: ${exportPeriod} ngày gần nhất (${exportFrom} → ${exportTo})`, style: "meta" },
          { text: `Phạm vi: Tháng ${currentMonth}/${currentYear} • Tổng dữ liệu: ${formatNumber(totalTransactions)} giao dịch`, style: "meta" },
          { text: `Ngày xuất: ${new Date().toLocaleString("vi-VN")}`, style: "meta", margin: [0, 0, 0, 20] },
          ...metricRows,
          { text: "Chi tiết thanh toán", style: "sectionTitle" },
          { table: { widths: ["*", "auto", "auto"], body: paymentTableBody }, layout: tableLayout },
          { text: "Tình trạng giao dịch", style: "sectionTitle" },
          { table: { widths: ["*", "auto", "auto"], body: statusTableBody }, layout: tableLayout },
          { text: "Top 10 phim bán chạy", style: "sectionTitle" },
          { table: { widths: ["auto", "*", "auto", "auto"], body: movieTableBody }, layout: tableLayout },
          { text: "Điểm nhấn nổi bật", style: "sectionTitle" },
          { ul: highlightItems, style: "bulletList" },
        ],
        styles: {
          header: { fontSize: 20, bold: true, alignment: "center", color: "#111827" },
          meta: { fontSize: 11, color: "#4b5563", alignment: "center" },
          sectionTitle: { fontSize: 14, bold: true, color: "#111827", margin: [0, 24, 0, 10] },
          metricLabel: { fontSize: 10, color: "#6b7280" },
          metricValue: { fontSize: 18, bold: true, color: "#111827", margin: [0, 4, 0, 2] },
          metricHint: { fontSize: 10, color: "#4b5563" },
          tableHeader: { color: "#ffffff", bold: true },
          tableCell: { fontSize: 11, color: "#0f172a" },
          tableCellMuted: { fontSize: 11, color: "#6b7280" },
          bulletList: { margin: [0, 4, 0, 0] },
        },
      };

      pdfMake.createPdf(docDefinition).download(`bao-cao-${cinemaName || "manager"}-${exportPeriod}ngay-${exportDate}.pdf`);
      toast({ title: "✅ Xuất thành công", description: `File PDF báo cáo ${exportPeriod} ngày đã được tải về` });
    } catch (e: unknown) {
      toast({ title: "❌ Lỗi", description: e instanceof Error ? e.message : "Xuất báo cáo thất bại", variant: "destructive" });
    } finally { setExportingType(null); }
  };

  // ── Summary cards ──

  const summaryCards = [
    {
      label: `Tổng Doanh Thu (${period}N)`, value: fmtCurrency(totalRevenue),
      icon: DollarSign, color: "from-orange-500 to-amber-500", bg: "from-orange-500/10 to-amber-500/5", border: "border-orange-500/20",
    },
    {
      label: `Tổng Booking (${period}N)`, value: `${totalBookings.toLocaleString()} đơn`,
      icon: Users2, color: "from-blue-500 to-indigo-500", bg: "from-blue-500/10 to-indigo-500/5", border: "border-blue-500/20",
    },
    {
      label: "TB / Ngày", value: fmtCurrency(Math.round(totalRevenue / Math.max(period, 1))),
      icon: Percent, color: "from-purple-500 to-violet-500", bg: "from-purple-500/10 to-violet-500/5", border: "border-purple-500/20",
    },
    {
      label: "Rạp", value: cinemaName || "—",
      icon: BarChart2, color: "from-emerald-500 to-teal-500", bg: "from-emerald-500/10 to-teal-500/5", border: "border-emerald-500/20",
    },
  ];

  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <>
    <div className="p-4 lg:p-6 space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 dark:text-slate-100">Báo Cáo & Thống Kê</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Phân tích doanh thu và hiệu suất rạp</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => void fetchReports()}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-[#0f172a] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all border border-slate-200/80 dark:border-slate-800 cursor-pointer shadow-xs"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => setExportDialogOpen(true)}
            disabled={exportingType !== null}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 hover:scale-[1.02] cursor-pointer"
          >
            {exportingType ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exportingType ? "Đang xuất..." : "Xuất File"}
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3">
        <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
        <div className="flex gap-1 p-1 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                period === p.value
                  ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? [...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-white dark:bg-slate-800/60 animate-pulse border border-slate-200/80 dark:border-slate-800"
              />
            ))
          : summaryCards.map(card => (
            <div
              key={card.label}
              className={cn(
                "p-5 rounded-2xl border transition-all duration-200 bg-white dark:bg-[#0f172a] bg-gradient-to-br",
                card.bg,
                card.border,
                "shadow-xs hover:shadow-md"
              )}
            >
              <div className={cn("w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md mb-3", card.color)}>
                <card.icon className="w-4.5 h-4.5 text-white" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 font-semibold">{card.label}</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100 truncate">{card.value}</p>
            </div>
          ))
        }
      </div>

      {/* Revenue Chart */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-500 dark:text-orange-400" />
              Xu Hướng Doanh Thu
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{period} ngày gần nhất</p>
          </div>
          {!loading && revenueData.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-400 dark:text-slate-500">Trung bình / ngày</p>
              <p className="text-sm font-bold text-orange-500 dark:text-orange-400">{fmtCurrency(Math.round(totalRevenue / Math.max(period, 1)))}</p>
            </div>
          )}
        </div>
        {loading ? (
          <div className="h-48 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ) : revenueData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm">Chưa có dữ liệu doanh thu</div>
        ) : (
          <RevenueLineChart data={revenueData} height={200} isDark={isDark} />
        )}
      </div>

      {/* Revenue table by day */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-orange-500 dark:text-orange-400" />
          Chi Tiết Theo Ngày
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{period} ngày gần nhất</p>
        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-9 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />)}</div>
        ) : revenueData.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm">Chưa có dữ liệu</div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {[...revenueData].reverse().map((row, i) => {
              const ratio = totalRevenue > 0 ? (Number(row.revenue) || 0) / totalRevenue : 0;
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="w-20 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                    {new Date(row.label).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                  </div>
                  <div className="flex-1">
                    <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500" style={{ width: `${ratio * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{fmtCurrency(Number(row.revenue) || 0)}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{row.booking_count} đơn</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {/* ── Export Dialog ── */}
    {exportDialogOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5 animate-in fade-in zoom-in-95 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-500" />
              Xuất File Báo Cáo
            </h3>
            <button
              onClick={() => setExportDialogOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Period selector */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Chọn khoảng thời gian</label>
            <div className="grid grid-cols-3 gap-3">
              {EXPORT_PERIODS.map((ep) => (
                <button
                  key={ep.value}
                  onClick={() => setExportPeriod(ep.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all font-medium cursor-pointer",
                    exportPeriod === ep.value
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-xs"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  )}
                >
                  <CalendarDays className="w-5 h-5" />
                  <span className="text-sm">{ep.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Selected range info */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-3 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Sẽ xuất dữ liệu: </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {exportPeriod} ngày gần nhất ({computeDateRange(exportPeriod).from} → {computeDateRange(exportPeriod).to})
            </span>
          </div>

          {/* Action buttons */}
          <div className="border-t border-slate-200/80 dark:border-slate-800 pt-4 flex gap-3">
            <button
              onClick={() => void exportTransactionsExcel()}
              disabled={exportingType !== null}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              {exportingType === "excel" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              {exportingType === "excel" ? "Đang xuất..." : "Xuất Excel"}
            </button>
            <button
              onClick={() => void exportRevenueReportPdf()}
              disabled={exportingType !== null}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/20 cursor-pointer"
            >
              {exportingType === "pdf" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {exportingType === "pdf" ? "Đang xuất..." : "Xuất Báo Cáo PDF"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default ManagerReports;
