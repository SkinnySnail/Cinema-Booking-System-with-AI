import React, { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Package,
  Edit,
  AlertTriangle,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Minus,
  Sparkles,
  FileUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS, apiCall, getImageUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

interface ConcessionWithInventory {
  id: number;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  is_available: boolean;
  inventory_quantity: number;
}

const IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=500&auto=format&fit=crop&q=80";

const getCategoryLabel = (cat: string | null) => {
  const map: Record<string, string> = {
    combo: "Combo",
    popcorn: "Bắp",
    drink: "Nước",
    snack: "Snack",
  };
  return map[cat?.toLowerCase() || ""] || cat || "Khác";
};

const getCategoryBadgeClass = (cat: string | null) => {
  const c = cat?.toLowerCase() || "";
  if (c === "combo")
    return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20";
  if (c === "popcorn")
    return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
  if (c === "drink")
    return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20";
  if (c === "snack")
    return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20";
  return "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20";
};

const LOW_STOCK_THRESHOLD = 5;

const ManagerConcessions: React.FC = () => {
  const { toast } = useToast();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission([
    "concessions.update",
    "concessions.create",
    "concessions.import",
  ]);
  const canUpdate = hasPermission("concessions.update");
  const canImport =
    hasPermission("concessions.import") || hasPermission("concessions.create");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ConcessionWithInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const [editItem, setEditItem] = useState<ConcessionWithInventory | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Excel import state
  const [importing, setImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [importMode, setImportMode] = useState<"add" | "set">("add");
  const [previewData, setPreviewData] = useState<
    {
      name: string;
      quantity: number | null;
      price: number | null;
      category: string;
      image_url: string;
      currentStock: number | null;
      isExisting: boolean;
    }[]
  >([]);

  const fetchItems = useCallback(async (isSilent = false) => {
    if (!canManage) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      const res = await apiCall<{
        success: boolean;
        data: { concessions: ConcessionWithInventory[]; cinema_id: number };
      }>(API_ENDPOINTS.MANAGER_CONCESSIONS);

      if (res.success && res.data?.concessions) {
        setItems(res.data.concessions);
      }
    } catch (err: unknown) {
      toast({
        title: "Lỗi",
        description:
          err instanceof Error ? err.message : "Không thể tải danh sách bắp nước",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canManage, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleEditOpen = (item: ConcessionWithInventory) => {
    setEditItem(item);
    setEditQuantity(item.inventory_quantity);
    setEditDialogOpen(true);
  };

  const handleSaveInventory = async (customQty?: number) => {
    if (!editItem) return;
    const targetQty = customQty !== undefined ? customQty : editQuantity;
    try {
      setSaving(true);
      await apiCall(API_ENDPOINTS.MANAGER_CONCESSION_INVENTORY(editItem.id), {
        method: "POST",
        body: JSON.stringify({ quantity: targetQty }),
      });

      toast({
        title: "✅ Cập nhật thành công",
        description: `Tồn kho "${editItem.name}" đã được cập nhật: ${targetQty}`,
      });

      setEditDialogOpen(false);
      setEditItem(null);
      void fetchItems(true);
    } catch (err: unknown) {
      toast({
        title: "❌ Lỗi",
        description: err instanceof Error ? err.message : "Không thể cập nhật tồn kho",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Quick delta update directly from card (+1 / -1)
  const handleQuickAdjust = async (
    e: React.MouseEvent,
    item: ConcessionWithInventory,
    delta: number,
  ) => {
    e.stopPropagation();
    const newQty = Math.max(0, item.inventory_quantity + delta);
    if (newQty === item.inventory_quantity) return;

    // Optimistic UI update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, inventory_quantity: newQty } : i,
      ),
    );

    try {
      await apiCall(API_ENDPOINTS.MANAGER_CONCESSION_INVENTORY(item.id), {
        method: "POST",
        body: JSON.stringify({ quantity: newQty }),
      });
      toast({
        title: "✅ Đã lưu",
        description: `${item.name}: ${newQty} sản phẩm`,
      });
    } catch (err: unknown) {
      toast({
        title: "❌ Lỗi",
        description:
          err instanceof Error ? err.message : "Không thể cập nhật tồn kho",
        variant: "destructive",
      });
      void fetchItems(true); // Revert on failure
    }
  };

  // Handle Excel file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setFileName(file.name);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      if (!jsonData || jsonData.length === 0) {
        toast({
          title: "File trống",
          description: "File Excel không có dòng dữ liệu nào.",
          variant: "destructive",
        });
        return;
      }

      let detectedAddCol = false;

      const mapped = jsonData
        .map((row) => {
          const name = (
            row["Tên sản phẩm"] ||
            row["Tên món"] ||
            row["Tên bắp nước"] ||
            row["Tên"] ||
            row["Sản phẩm"] ||
            row["name"] ||
            ""
          )
            .toString()
            .trim();

          const hasAddCol =
            row["Số lượng nhập thêm"] !== undefined || row["Nhập thêm"] !== undefined;
          if (hasAddCol) detectedAddCol = true;

          const rawQty =
            row["Số lượng nhập thêm"] ??
            row["Nhập thêm"] ??
            row["Số lượng nhập"] ??
            row["Số lượng tồn kho"] ??
            row["Số lượng"] ??
            row["Tồn kho"] ??
            row["quantity"] ??
            row["qty"];

          const quantity =
            rawQty !== undefined && rawQty !== null && rawQty !== "" && !isNaN(Number(rawQty))
              ? Number(rawQty)
              : null;

          const rawPrice =
            row["Giá (VNĐ)"] ??
            row["Đơn giá (VNĐ)"] ??
            row["Giá"] ??
            row["Đơn giá"] ??
            row["price"];
          const price =
            rawPrice !== undefined && rawPrice !== null && rawPrice !== "" && !isNaN(Number(rawPrice))
              ? Number(rawPrice)
              : null;

          const rawCat = (
            row["Danh mục (Combo/Drink/Snack)"] ||
            row["Danh mục"] ||
            row["Phân loại"] ||
            row["category"] ||
            ""
          )
            .toString()
            .toLowerCase();

          let category = "combo";
          if (rawCat.includes("bắp") || rawCat.includes("popcorn")) category = "popcorn";
          else if (
            rawCat.includes("nước") ||
            rawCat.includes("drink") ||
            rawCat.includes("uống")
          )
            category = "drink";
          else if (rawCat.includes("snack") || rawCat.includes("ăn vặt"))
            category = "snack";
          else if (rawCat.includes("combo")) category = "combo";

          const imageUrl = (
            row["Link Ảnh sản phẩm (URL)"] ||
            row["Link ảnh"] ||
            row["Hình ảnh"] ||
            row["Ảnh"] ||
            row["image_url"] ||
            ""
          )
            .toString()
            .trim();

          const existing = items.find(
            (i) => i.name.trim().toLowerCase() === name.toLowerCase(),
          );

          return {
            name,
            quantity,
            price,
            category,
            image_url: imageUrl,
            currentStock: existing ? existing.inventory_quantity : null,
            isExisting: !!existing,
          };
        })
        .filter((item) => item.name.length > 0);

      if (mapped.length === 0) {
        toast({
          title: "Không tìm thấy dữ liệu hợp lệ",
          description: "Cần có cột 'Tên sản phẩm' trong file Excel.",
          variant: "destructive",
        });
        return;
      }

      setImportMode(detectedAddCol ? "add" : "add");
      setPreviewData(mapped);
      setImportDialogOpen(true);
    } catch (err: unknown) {
      toast({
        title: "Lỗi đọc file Excel",
        description:
          err instanceof Error ? err.message : "Không thể đọc file excel đã chọn",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Execute import to server
  const handleExecuteImport = async () => {
    if (previewData.length === 0) return;
    try {
      setImporting(true);
      const payload = {
        items: previewData.map((p) => ({
          name: p.name,
          quantity: p.quantity,
          mode: importMode,
          price: p.price,
          category: p.category,
          image_url: p.image_url,
        })),
        mode: importMode,
      };

      const res = await apiCall<{
        success: boolean;
        data: {
          message: string;
          success_count: number;
          created_count: number;
          updated_inventory_count: number;
          errors: string[];
        };
      }>(API_ENDPOINTS.MANAGER_CONCESSIONS_IMPORT, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.success) {
        toast({
          title: "🎉 Nhập hàng thành công!",
          description:
            res.data?.message ||
            `Đã cập nhật tồn kho thành công cho ${res.data?.updated_inventory_count || res.data?.success_count || 0} sản phẩm`,
        });

        if (res.data?.errors && res.data.errors.length > 0) {
          console.warn("Import warnings:", res.data.errors);
          toast({
            title: `Có ${res.data.errors.length} cảnh báo`,
            description: res.data.errors.slice(0, 3).join("; "),
            variant: "destructive",
          });
        }

        setImportDialogOpen(false);
        setPreviewData([]);
        await fetchItems(true);
      }
    } catch (err: unknown) {
      toast({
        title: "❌ Lỗi nhập hàng",
        description:
          err instanceof Error ? err.message : "Không thể nhập dữ liệu bắp nước",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  // Accurate stat calculation (fix duplicate low-stock vs out-of-stock counting bug)
  const totalProducts = items.length;
  const inStockItems = items.filter(
    (i) => i.inventory_quantity >= LOW_STOCK_THRESHOLD,
  ).length;
  const lowStockItems = items.filter(
    (i) =>
      i.inventory_quantity > 0 && i.inventory_quantity < LOW_STOCK_THRESHOLD,
  ).length;
  const outOfStockItems = items.filter((i) => i.inventory_quantity <= 0).length;

  // Filtered items
  const filtered = items.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" ||
      (item.category &&
        item.category.toLowerCase() === selectedCategory.toLowerCase());

    const isOutOfStock = item.inventory_quantity <= 0;
    const isLowStock =
      item.inventory_quantity > 0 &&
      item.inventory_quantity < LOW_STOCK_THRESHOLD;
    const isInStock = item.inventory_quantity >= LOW_STOCK_THRESHOLD;

    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "instock" && isInStock) ||
      (selectedStatus === "lowstock" && isLowStock) ||
      (selectedStatus === "outofstock" && isOutOfStock);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  if (!canManage) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-destructive/20 bg-destructive/5 space-y-4">
          <AlertTriangle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Truy Cập Bị Từ Chối
          </h2>
          <p className="text-slate-500 max-w-md text-sm">
            Vai trò hiện tại của bạn không có quyền quản lý tồn kho bắp nước (yêu cầu quyền: <code className="text-destructive font-mono font-bold">concessions.update</code> hoặc <code className="text-destructive font-mono font-bold">concessions.create</code>).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
            <span>Quản Lý Tồn Kho Bắp Nước</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Theo dõi, nhập hàng và cập nhật số lượng tồn kho sản phẩm tại rạp
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />

          {/* Nhập Excel (tương tự như bên admin) */}
          {canImport && (
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="rounded-xl border-orange-200 dark:border-orange-900/40 bg-orange-50/50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100/70 dark:hover:bg-orange-900/40 h-10 px-3.5 flex items-center gap-2 cursor-pointer text-xs sm:text-sm font-medium"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
              ) : (
                <FileUp className="w-4 h-4 text-orange-500" />
              )}
              <span>Nhập Excel</span>
            </Button>
          )}

          {/* Làm mới */}
          <Button
            variant="outline"
            onClick={() => fetchItems(true)}
            disabled={refreshing || loading}
            className="rounded-xl border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 h-10 px-3.5 flex items-center gap-2 cursor-pointer text-xs sm:text-sm"
          >
            <RefreshCw
              className={cn("w-4 h-4", refreshing && "animate-spin text-orange-500")}
            />
            <span className="hidden sm:inline">{refreshing ? "Đang đồng bộ..." : "Làm mới"}</span>
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {/* Total */}
        <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Tổng Sản Phẩm
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {totalProducts}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* In Stock */}
        <div className="p-4 rounded-2xl border border-emerald-500/20 dark:border-emerald-500/20 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Đủ Hàng ({`>= 5`})
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {inStockItems}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Low Stock */}
        <div className="p-4 rounded-2xl border border-amber-500/20 dark:border-amber-500/20 bg-amber-500/[0.03] dark:bg-amber-500/[0.04] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Sắp Hết Hàng (1 - 4)
            </p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {lowStockItems}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-500">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Out of Stock */}
        <div className="p-4 rounded-2xl border border-red-500/20 dark:border-red-500/20 bg-red-500/[0.03] dark:bg-red-500/[0.04] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              Hết Hàng (0)
            </p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
              {outOfStockItems}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center text-red-500">
            <XCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Tìm theo tên bắp, nước, combo..."
              className="pl-9 h-10 rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: "all", label: "Tất cả", count: totalProducts },
              { id: "instock", label: "Đủ hàng", count: inStockItems },
              { id: "lowstock", label: "Sắp hết", count: lowStockItems },
              { id: "outofstock", label: "Hết hàng", count: outOfStockItems },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setSelectedStatus(st.id)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5",
                  selectedStatus === st.id
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
                )}
              >
                <span>{st.label}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full",
                    selectedStatus === st.id
                      ? "bg-white/20 dark:bg-slate-900/20 text-current"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500",
                  )}
                >
                  {st.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 overflow-x-auto">
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 font-medium mr-1">
            Phân loại:
          </span>
          {[
            { id: "all", label: "Tất cả" },
            { id: "combo", label: "🍿🥤 Combo" },
            { id: "popcorn", label: "🍿 Bắp" },
            { id: "drink", label: "🥤 Nước" },
            { id: "snack", label: "🌭 Snack" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer",
                selectedCategory === cat.id
                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent",
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <p className="mt-3 text-sm font-medium">Đang tải danh sách bắp nước...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
          <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
            Không tìm thấy sản phẩm nào
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Thử thay đổi từ khóa tìm kiếm hoặc bỏ chọn bộ lọc trạng thái.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const isOutOfStock = item.inventory_quantity <= 0;
            const isLowStock =
              item.inventory_quantity > 0 &&
              item.inventory_quantity < LOW_STOCK_THRESHOLD;

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (canUpdate) handleEditOpen(item);
                }}
                className={cn(
                  "group relative rounded-2xl border transition-all duration-200 overflow-hidden",
                  canUpdate ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5" : "cursor-default",
                  "bg-white dark:bg-[#0f172a]",
                  isOutOfStock
                    ? "border-red-500/30 bg-red-500/[0.02] dark:border-red-500/30 dark:bg-red-500/[0.04]"
                    : isLowStock
                      ? "border-amber-500/30 bg-amber-500/[0.02] dark:border-amber-500/30 dark:bg-amber-500/[0.04]"
                      : "border-slate-200/80 dark:border-slate-800/80 hover:border-orange-500/40 dark:hover:border-orange-500/40",
                )}
              >
                <div className="p-4 flex gap-3.5 items-start">
                  {/* Thumbnail */}
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-800">
                    <img
                      src={getImageUrl(item.image_url) || IMAGE_FALLBACK}
                      alt={item.name}
                      className={cn(
                        "w-full h-full object-cover transition-transform duration-300",
                        canUpdate && "group-hover:scale-105"
                      )}
                      onError={(e) => {
                        e.currentTarget.src = IMAGE_FALLBACK;
                        e.currentTarget.onerror = null;
                      }}
                    />
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center">
                        <span className="text-[10px] uppercase font-bold text-white tracking-wider px-1 py-0.5 bg-red-600 rounded">
                          Hết hàng
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <h3 className={cn(
                        "font-semibold text-sm text-slate-800 dark:text-slate-100 truncate pr-1 transition-colors",
                        canUpdate && "group-hover:text-orange-500"
                      )}>
                        {item.name}
                      </h3>
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditOpen(item);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-500/10 transition-colors shrink-0"
                          title="Chỉnh sửa tồn kho"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-medium px-2 py-0 h-5 border",
                          getCategoryBadgeClass(item.category),
                        )}
                      >
                        {getCategoryLabel(item.category)}
                      </Badge>
                      <span className="text-xs font-semibold text-orange-500 dark:text-orange-400">
                        {Number(item.price).toLocaleString("vi-VN")}đ
                      </span>
                    </div>

                    {/* Stock Status Badge & Quick Controls */}
                    <div className="flex items-center justify-between gap-2 mt-3">
                      <div>
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-500/15 border border-red-500/20 px-2 py-0.5 rounded-lg">
                            <XCircle className="w-3 h-3" /> Hết hàng
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                            <AlertTriangle className="w-3 h-3" /> Còn: {item.inventory_quantity}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                            <CheckCircle2 className="w-3 h-3" /> Tồn kho: {item.inventory_quantity}
                          </span>
                        )}
                      </div>

                      {/* Quick Adjust +/- 5 buttons */}
                      {canUpdate && (
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg">
                          <button
                            type="button"
                            disabled={item.inventory_quantity <= 0}
                            onClick={(e) => handleQuickAdjust(e, item, -5)}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                            title="Giảm 5"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 min-w-6 text-center px-1">
                            {item.inventory_quantity}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleQuickAdjust(e, item, +5)}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-all cursor-pointer"
                            title="Tăng 5"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Inventory Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Cập Nhật Số Lượng Tồn Kho
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Điều chỉnh số lượng thực tế của sản phẩm tại rạp hiện tại
            </DialogDescription>
          </DialogHeader>

          {editItem && (
            <div className="space-y-4 py-2">
              {/* Product preview card */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <img
                  src={getImageUrl(editItem.image_url) || IMAGE_FALLBACK}
                  alt={editItem.name}
                  className="w-14 h-14 rounded-lg object-cover bg-white dark:bg-slate-900 shrink-0"
                  onError={(e) => {
                    e.currentTarget.src = IMAGE_FALLBACK;
                    e.currentTarget.onerror = null;
                  }}
                />
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {editItem.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-2 py-0 border",
                        getCategoryBadgeClass(editItem.category),
                      )}
                    >
                      {getCategoryLabel(editItem.category)}
                    </Badge>
                    <span className="text-xs font-semibold text-orange-500">
                      {Number(editItem.price).toLocaleString("vi-VN")}đ
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Tồn kho hiện tại:{" "}
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {editItem.inventory_quantity}
                    </span>
                  </p>
                </div>
              </div>

              {/* Quantity Input */}
              <div className="space-y-2">
                <Label htmlFor="inv-qty" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Số lượng tồn kho mới *
                </Label>
                <div className="relative">
                  <Input
                    id="inv-qty"
                    type="number"
                    min={0}
                    value={editQuantity}
                    onChange={(e) =>
                      setEditQuantity(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="h-11 text-base font-bold pl-4 pr-12 rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
                    sp
                  </span>
                </div>

                {/* Quick Preset Buttons */}
                <div className="pt-2">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Thao tác nhanh:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "+10", add: 10 },
                      { label: "+25", add: 25 },
                      { label: "+50", add: 50 },
                      { label: "+100", add: 100 },
                      { label: "Đặt về 0", set: 0 },
                    ].map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (p.set !== undefined) setEditQuantity(p.set);
                          else if (p.add) setEditQuantity((prev) => prev + p.add);
                        }}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-orange-500/50 hover:text-orange-500 transition-colors cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Warning Banners */}
                {editQuantity < LOW_STOCK_THRESHOLD && editQuantity > 0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Cảnh báo: Số lượng dưới {LOW_STOCK_THRESHOLD}, hệ thống sẽ đánh dấu "Sắp hết hàng".</span>
                  </div>
                )}
                {editQuantity === 0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>Sản phẩm sẽ bị đánh dấu <b>HẾT HÀNG</b> và không thể chọn khi đặt vé.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              className="rounded-xl border-slate-200 dark:border-slate-700 h-10 px-4 cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              onClick={() => handleSaveInventory()}
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium h-10 px-5 shadow-lg shadow-orange-500/20 hover:opacity-90 cursor-pointer"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Lưu Thay Đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel Import Preview & Confirmation Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                <FileUp className="w-4 h-4" />
              </div>
              <span>Nhập Hàng Bắp Nước Từ Excel</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Đã đọc <b>{previewData.length} sản phẩm</b> từ file{" "}
              <code className="text-orange-600 dark:text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                {fileName}
              </code>
              . Vui lòng chọn cách thức cập nhật kho:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 overflow-y-auto flex-1 pr-1">
            {/* Mode selection */}
            <div>
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 block">
                Phương thức nhập kho:
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Option: Add */}
                <div
                  onClick={() => setImportMode("add")}
                  className={cn(
                    "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between",
                    importMode === "add"
                      ? "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 ring-1 ring-emerald-500/50"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <Plus className="w-4 h-4" />
                        Cộng dồn vào kho
                      </span>
                      <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] border-emerald-500/30">
                        Khuyên dùng
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Tồn kho mới = <b>Hiện có + Số lượng trong file</b>. Thích hợp khi nhập thêm hàng mới về rạp.
                    </p>
                  </div>
                </div>

                {/* Option: Set */}
                <div
                  onClick={() => setImportMode("set")}
                  className={cn(
                    "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between",
                    importMode === "set"
                      ? "border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 ring-1 ring-blue-500/50"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        <Package className="w-4 h-4" />
                        Ghi đè tồn kho
                      </span>
                      <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] border-blue-500/30">
                        Kiểm kê
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Đặt tồn kho bằng <b>chính xác số lượng trong file</b>. Thích hợp khi kiểm kê hàng thực tế tại quầy.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Xem trước dữ liệu ({previewData.length} sản phẩm):
                </Label>
                <span className="text-[11px] text-slate-400">
                  {importMode === "add" ? "Chế độ: Cộng dồn (+)" : "Chế độ: Ghi đè (=)"}
                </span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 sticky top-0 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3 py-2">Sản phẩm</th>
                      <th className="px-2 py-2 text-center">Danh mục</th>
                      <th className="px-2 py-2 text-right">SL File</th>
                      <th className="px-2 py-2 text-right">Hiện có</th>
                      <th className="px-3 py-2 text-right">Dự kiến sau nhập</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {previewData.map((item, idx) => {
                      const curr = item.currentStock ?? 0;
                      const fileQty = item.quantity ?? 0;
                      const expected = importMode === "add" ? curr + fileQty : fileQty;

                      return (
                        <tr
                          key={idx}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                            <div>{item.name}</div>
                            {!item.isExisting && (
                              <span className="text-[10px] text-amber-500 font-normal">
                                (Món mới • {item.price ? `${item.price.toLocaleString("vi-VN")}đ` : "chưa có giá"})
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className="text-[11px] text-slate-500">
                              {getCategoryLabel(item.category)}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">
                            {item.quantity !== null ? item.quantity : "-"}
                          </td>
                          <td className="px-2 py-2 text-right text-slate-500">
                            {item.isExisting ? curr : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">
                            {item.quantity !== null ? (
                              importMode === "add" ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {expected}{" "}
                                  <span className="text-[10px] font-normal text-emerald-500">
                                    (+{fileQty})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-blue-600 dark:text-blue-400">
                                  {expected}
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400 text-[11px]">Không đổi</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 dark:border-slate-800 pt-3 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setImportDialogOpen(false);
                setPreviewData([]);
              }}
              disabled={importing}
              className="rounded-xl border-slate-200 dark:border-slate-700 h-10 px-4 cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              onClick={handleExecuteImport}
              disabled={importing || previewData.length === 0}
              className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium h-10 px-5 shadow-lg shadow-orange-500/20 hover:opacity-90 cursor-pointer"
            >
              {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <span>Xác nhận nhập {previewData.length} sản phẩm</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagerConcessions;
