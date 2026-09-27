import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Plus,
  Minus,
  Save,
  X,
  Trash2,
  Pencil,
  ChevronRight,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Sliders,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS, apiCall } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AppContext";
import { useTheme } from "@/hooks/use-theme";
import { CurvedCinemaScreen } from "@/components/cinema/CurvedCinemaScreen";
import { usePermissions } from "@/hooks/usePermissions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackendCinema {
  id: number;
  name: string;
}

interface BackendHall {
  id: number;
  name: string;
  total_seats: number;
  active_seats?: number;
}

interface SeatCell {
  row_code: string;
  number: number;
  seat_type_id: number;
  status?: string;
}

// ─── Constants & Limits ────────────────────────────────────────────────────────

const DEFAULT_ROWS = 10; // A–J
const DEFAULT_COLS = 12; // 1–12

export const SEAT_LIMITS = {
  MIN_ROWS: 4,
  MAX_ROWS: 24,
  MIN_COLS: 6,
  MAX_COLS: 38,
  MIN_SEATS: 20,
  MAX_SEATS: 350,
} as const;

export const PRESET_TEMPLATES: Record<
  string,
  { label: string; rows: number; cols: number; description: string }
> = {
  vip_small: {
    label: "VIP / Mini (6 × 8)",
    rows: 6,
    cols: 8,
    description: "Phòng VIP riêng tư cao cấp (48 ghế)",
  },
  standard_small: {
    label: "Standard Nhỏ (8 × 10)",
    rows: 8,
    cols: 10,
    description: "Phòng tiêu chuẩn cỡ nhỏ (80 ghế)",
  },
  standard: {
    label: "Standard Tiêu Chuẩn (10 × 12)",
    rows: 10,
    cols: 12,
    description: "Phòng thông dụng phổ biến (120 ghế)",
  },
  large: {
    label: "Large Rộng (12 × 16)",
    rows: 12,
    cols: 16,
    description: "Phòng chiếu sức chứa lớn (192 ghế)",
  },
  imax: {
    label: "IMAX / Starium (14 × 22)",
    rows: 14,
    cols: 22,
    description: "Khán phòng siêu lớn (308 ghế)",
  },
};

const getSeatTypes = (isLightMode: boolean) => [
  {
    id: 0,
    label: "Khoảng trống / Lối đi",
    shortLabel: "Lối đi",
    description: "Khoảng trống kiến trúc (tạo lối đi, hình thoi, hình vát)",
    color: isLightMode
      ? "bg-slate-100 border-slate-300 border-dashed"
      : "bg-gray-700/40 border-gray-600 border-dashed",
    activeColor: isLightMode
      ? "ring-2 ring-slate-400 bg-slate-200"
      : "ring-2 ring-gray-400 bg-gray-600/60",
    dotColor: isLightMode ? "bg-slate-400" : "bg-gray-400",
    textColor: isLightMode ? "text-slate-500" : "text-gray-400",
  },
  {
    id: 1,
    label: "Ghế thường",
    shortLabel: "Thường",
    description: "Ghế tiêu chuẩn (Standard)",
    color: isLightMode
      ? "bg-blue-100 border-blue-300"
      : "bg-blue-600 border-blue-500",
    activeColor: isLightMode
      ? "ring-2 ring-blue-500 bg-blue-200"
      : "ring-2 ring-blue-300 bg-blue-500",
    dotColor: isLightMode ? "bg-blue-500" : "bg-blue-400",
    textColor: isLightMode ? "text-blue-700" : "text-blue-300",
  },
  {
    id: 2,
    label: "Ghế VIP",
    shortLabel: "VIP",
    description: "Ghế VIP trung tâm góc nhìn đẹp",
    color: isLightMode
      ? "bg-purple-100 border-purple-300"
      : "bg-purple-600 border-purple-500",
    activeColor: isLightMode
      ? "ring-2 ring-purple-500 bg-purple-200"
      : "ring-2 ring-purple-300 bg-purple-500",
    dotColor: isLightMode ? "bg-purple-500" : "bg-purple-400",
    textColor: isLightMode ? "text-purple-700" : "text-purple-300",
  },
  {
    id: 3,
    label: "Sweetbox / Couple",
    shortLabel: "Couple",
    description: "Ghế đôi dành cho 2 người",
    color: isLightMode
      ? "bg-rose-100 border-rose-300"
      : "bg-rose-600 border-rose-500",
    activeColor: isLightMode
      ? "ring-2 ring-rose-500 bg-rose-200"
      : "ring-2 ring-rose-300 bg-rose-500",
    dotColor: isLightMode ? "bg-rose-500" : "bg-rose-400",
    textColor: isLightMode ? "text-rose-700" : "text-rose-300",
  },
  {
    id: 4,
    label: "Ghế bảo trì / Hỏng",
    shortLabel: "Bảo trì",
    description: "Ghế tạm thời bị hỏng/khóa không bán vé",
    color: isLightMode
      ? "bg-amber-100 border-amber-300"
      : "bg-amber-950/60 border-amber-600/80",
    activeColor: isLightMode
      ? "ring-2 ring-amber-500 bg-amber-200"
      : "ring-2 ring-amber-400 bg-amber-900/60",
    dotColor: isLightMode ? "bg-amber-500" : "bg-amber-400",
    textColor: isLightMode ? "text-amber-700" : "text-amber-400",
  },
];

const getSeatTypeGridColor = (isLightMode: boolean): Record<number, string> =>
  isLightMode
    ? {
        0: "bg-slate-100/70 border-dashed border-slate-300 text-slate-400 hover:bg-slate-200/60",
        1: "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100",
        2: "bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100",
        3: "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100",
        4: "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100",
      }
    : {
        0: "bg-gray-800/40 border-dashed border-gray-600 text-gray-500 hover:bg-gray-800/80",
        1: "bg-blue-900 border-blue-700 text-blue-200 hover:bg-blue-800",
        2: "bg-purple-900 border-purple-700 text-purple-200 hover:bg-purple-800",
        3: "bg-rose-900 border-rose-700 text-rose-200 hover:bg-rose-800",
        4: "bg-amber-950/70 border-amber-700 text-amber-300 hover:bg-amber-900",
      };

const SELECTED_COLOR = "ring-2 ring-yellow-400 brightness-125";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeEmptyGrid = (
  rows: number = DEFAULT_ROWS,
  cols: number = DEFAULT_COLS,
): number[][] => Array.from({ length: rows }, () => Array(cols).fill(1));

const getRowsFromTotalSeats = (totalSeats?: number): number => {
  if (!totalSeats || totalSeats <= 0) return DEFAULT_ROWS;
  return Math.max(DEFAULT_ROWS, Math.ceil(totalSeats / DEFAULT_COLS));
};

// Tạo mã chữ cái cho hàng: A, B, C, ... Z, AA, AB, ...
const getRowLetter = (index: number): string => {
  let letter = "";
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
};

// Tính toán danh sách nhãn hàng (Row Labels)
// Hàng nào có ít nhất 1 ghế (typeId !== 0) -> được gán chữ cái theo thứ tự tăng dần A, B, C...
// Hàng nào 100% là lối đi (tất cả typeId === 0) -> không có chữ cái (""), chữ cái dời sang hàng có ghế kế tiếp
const computeRowLabels = (grid: number[][]): string[] => {
  let seatRowCounter = 0;
  return grid.map((row) => {
    const hasAnySeat = row.some((cell) => cell !== 0);
    if (!hasAnySeat) return "";
    const label = getRowLetter(seatRowCounter);
    seatRowCounter++;
    return label;
  });
};

// Tính toán danh sách nhãn cột (Column Labels)
// Cột nào có ít nhất 1 ghế (typeId !== 0) -> được gán số theo thứ tự tăng dần 1, 2, 3...
// Cột nào 100% là lối đi (tất cả các ô dọc cột đều là 0) -> không có số (null), số dời sang cột có ghế kế tiếp
const computeColLabels = (grid: number[][]): (number | null)[] => {
  const numCols = grid[0]?.length || 0;
  let seatColCounter = 1;
  const labels: (number | null)[] = [];
  for (let c = 0; c < numCols; c++) {
    const hasAnySeat = grid.some((row) => (row[c] ?? 0) !== 0);
    if (!hasAnySeat) {
      labels.push(null);
    } else {
      labels.push(seatColCounter);
      seatColCounter++;
    }
  }
  return labels;
};

const seatsToGrid = (
  seats: SeatCell[],
  fallbackRows: number = DEFAULT_ROWS,
  fallbackCols: number = DEFAULT_COLS,
): number[][] => {
  if (!seats || seats.length === 0) {
    return makeEmptyGrid(fallbackRows, fallbackCols);
  }

  // Gom nhóm ghế theo row_code bảo toàn thứ tự xuất hiện từ DB
  const rowsMap: Map<string, SeatCell[]> = new Map();
  seats.forEach((s) => {
    if (!rowsMap.has(s.row_code)) {
      rowsMap.set(s.row_code, []);
    }
    rowsMap.get(s.row_code)!.push(s);
  });

  const numRows = Math.max(fallbackRows, rowsMap.size);
  let maxColsInAnyRow = fallbackCols;
  rowsMap.forEach((rowSeats) => {
    maxColsInAnyRow = Math.max(maxColsInAnyRow, rowSeats.length);
  });

  const grid: number[][] = Array.from({ length: numRows }, () =>
    Array(maxColsInAnyRow).fill(0),
  );

  let rIdx = 0;
  rowsMap.forEach((rowSeats) => {
    rowSeats.forEach((s, cIdx) => {
      // Xác định vị trí cột c:
      // Ô lối đi có số dạng 1000 + cIdx; các ghế thực tế theo thứ tự cIdx
      let c = cIdx;
      if (s.number >= 1000) {
        c = s.number - 1000;
      }
      if (rIdx < numRows && c >= 0 && c < maxColsInAnyRow) {
        if (s.status === "Inactive") {
          grid[rIdx][c] = 0;
        } else if (s.status === "Broken") {
          grid[rIdx][c] = 4;
        } else {
          grid[rIdx][c] = s.seat_type_id;
        }
      }
    });
    rIdx++;
  });

  return grid;
};

const gridToSeats = (grid: number[][]): SeatCell[] => {
  const rowLabels = computeRowLabels(grid);
  const colLabels = computeColLabels(grid);
  const seats: SeatCell[] = [];

  grid.forEach((row, rIdx) => {
    const rowLabel = rowLabels[rIdx];
    const hasSeatInRow = row.some((c) => c !== 0);
    // Nếu hàng có ghế: dùng nhãn hàng được dời (A, B, J...)
    // Nếu hàng 100% lối đi: dùng mã hàng đặc biệt _R{rIdx} để phân biệt hàng vật lý và không trùng khóa DB
    const rowCode = hasSeatInRow
      ? rowLabel
      : `_R${String(rIdx).padStart(2, "0")}`;

    row.forEach((typeId, cIdx) => {
      let seat_type_id = typeId;
      let status = "Active";

      if (typeId === 0) {
        seat_type_id = 1;
        status = "Inactive";
      } else if (typeId === 4) {
        seat_type_id = 1;
        status = "Broken";
      }

      const colLabel = colLabels[cIdx];
      // Ghế thực tế (Active hoặc Broken) lấy số cột hiển thị (colLabel)
      // Ô lối đi (Inactive) lấy số 1000 + cIdx để không bao giờ xung đột với số ghế thực tế trong cùng hàng
      const seatNumber =
        typeId === 0
          ? 1000 + cIdx
          : colLabel !== null
            ? colLabel
            : cIdx + 1;

      seats.push({
        row_code: rowCode,
        number: seatNumber,
        seat_type_id,
        status,
      });
    });
  });
  return seats;
};


// ─── Component ────────────────────────────────────────────────────────────────

const AdminSeatManagement: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canCreateHall = hasPermission("halls.create");
  const canUpdateHall = hasPermission("halls.update");
  const canDeleteHall = hasPermission("halls.delete");
  const canManageLayout = hasPermission("halls.manage_layout");

  const isManagerMode = user?.role === "manager";
  const isLightManagerTheme = isManagerMode && theme === "light";
  const seatTypes = getSeatTypes(isLightManagerTheme);
  const seatTypeGridColor = getSeatTypeGridColor(isLightManagerTheme);

  // ── State ──
  const [cinemas, setCinemas] = useState<BackendCinema[]>([]);
  const [halls, setHalls] = useState<BackendHall[]>([]);
  const [selectedCinemaId, setSelectedCinemaId] = useState<string>("");
  const [selectedHallId, setSelectedHallId] = useState<string>("");
  const [selectedHallName, setSelectedHallName] = useState<string>("");

  const [grid, setGrid] = useState<number[][]>(makeEmptyGrid());
  const [activeMode, setActiveMode] = useState<number>(1); // seat type being painted
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set()); // "r,c" keys
  const [isDragging, setIsDragging] = useState(false);

  // Dynamic smart row and column labels:
  // Nếu cả hàng/cột là lối đi (toàn bộ ô là 0) -> ẩn chữ cái/số và dời sang hàng/cột có ghế kế tiếp
  const rowLabels = useMemo(() => computeRowLabels(grid), [grid]);
  const colLabels = useMemo(() => computeColLabels(grid), [grid]);

  // Dialogs & Form State
  const [isAddHallOpen, setIsAddHallOpen] = useState(false);
  const [isRenameHallOpen, setIsRenameHallOpen] = useState(false);
  const [hallNameInput, setHallNameInput] = useState("");
  const [addHallMode, setAddHallMode] = useState<"preset" | "custom">("preset");
  const [newHallTemplate, setNewHallTemplate] = useState<string>("standard");
  const [customRows, setCustomRows] = useState<number>(10);
  const [customCols, setCustomCols] = useState<number>(12);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Load cinemas ──
  useEffect(() => {
    if (isManagerMode) {
      apiCall<{ success: boolean; data: { cinema: BackendCinema } }>(
        API_ENDPOINTS.MANAGER_CINEMA_INFO,
      )
        .then((res) => {
          const managerCinema = res.data?.cinema;
          if (!managerCinema) {
            throw new Error("Không tìm thấy rạp của manager");
          }
          setCinemas([managerCinema]);
          setSelectedCinemaId(String(managerCinema.id));
        })
        .catch(() =>
          toast({
            title: "Lỗi",
            description:
              "Không tải được thông tin rạp quản lý. Vui lòng liên hệ Admin.",
            variant: "destructive",
          }),
        );
      return;
    }

    apiCall<{ success: boolean; data: { cinemas: BackendCinema[] } }>(
      API_ENDPOINTS.CINEMAS,
    )
      .then((res) => setCinemas(res.data?.cinemas || []))
      .catch(() =>
        toast({
          title: "Lỗi",
          description: "Không tải được danh sách rạp",
          variant: "destructive",
        }),
      );
  }, [isManagerMode, toast]);

  // ── Handle URL query params (from AdminCinemas) ──
  useEffect(() => {
    if (isManagerMode) {
      const qHall = searchParams.get("hallId");
      if (qHall) setSelectedHallId(qHall);
      return;
    }

    const qCinema = searchParams.get("cinemaId");
    const qHall = searchParams.get("hallId");
    if (qCinema) setSelectedCinemaId(qCinema);
    if (qHall) setSelectedHallId(qHall);
  }, [searchParams, isManagerMode]);

  // ── Load halls when cinema changes ──
  useEffect(() => {
    if (!selectedCinemaId) {
      setHalls([]);
      return;
    }

    const hallsEndpoint = isManagerMode
      ? API_ENDPOINTS.MANAGER_CINEMA_HALLS
      : API_ENDPOINTS.CINEMA_HALLS(Number(selectedCinemaId));

    apiCall<{ success: boolean; data: { halls: BackendHall[] } }>(hallsEndpoint)
      .then((res) => {
        const h = res.data?.halls || [];
        setHalls(h);
        // If we came from URL and have a hall id, pre-select
        if (searchParams.get("hallId") && !selectedHallId) {
          setSelectedHallId(searchParams.get("hallId")!);
        }
      })
      .catch(() =>
        toast({
          title: "Lỗi",
          description: "Không tải được phòng chiếu",
          variant: "destructive",
        }),
      );
  }, [selectedCinemaId, isManagerMode, searchParams, selectedHallId, toast]);

  // ── Load seat layout when hall changes ──
  useEffect(() => {
    if (!selectedHallId) {
      setGrid(makeEmptyGrid());
      setSelectedHallName("");
      return;
    }
    setLoading(true);
    apiCall<{
      success: boolean;
      data: { hall: { name: string; seats: SeatCell[] } };
    }>(API_ENDPOINTS.HALL_DETAIL(Number(selectedHallId)))
      .then((res) => {
        const hall = res.data?.hall;
        if (hall) {
          const hallMeta = halls.find((h) => String(h.id) === selectedHallId);
          const fallbackRows = getRowsFromTotalSeats(hallMeta?.total_seats);
          setSelectedHallName(hall.name);
          setGrid(seatsToGrid(hall.seats || [], fallbackRows, DEFAULT_COLS));
          setSelectedCells(new Set());
        }
      })
      .catch(() =>
        toast({
          title: "Lỗi",
          description: "Không tải được sơ đồ ghế",
          variant: "destructive",
        }),
      )
      .finally(() => setLoading(false));
  }, [selectedHallId, halls, toast]);

  // Update hall name from halls list
  useEffect(() => {
    if (selectedHallId) {
      const hall = halls.find((h) => String(h.id) === selectedHallId);
      if (hall) setSelectedHallName(hall.name);
    }
  }, [halls, selectedHallId]);

  // ── Cell interaction ──
  const cellKey = (r: number, c: number) => `${r},${c}`;

  const handleCellDown = (r: number, c: number) => {
    setIsDragging(true);
    toggleCell(r, c);
  };

  const handleCellEnter = (r: number, c: number) => {
    if (isDragging) toggleCell(r, c);
  };

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const toggleCell = (r: number, c: number) => {
    const key = cellKey(r, c);
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Helpers ──
  const validateCoupleSeats = (
    cells: Set<string>,
  ): { valid: boolean; message?: string } => {
    const arr = [...cells].map((k) => {
      const [r, c] = k.split(",").map(Number);
      return { r, c };
    });

    // Must be even number
    if (arr.length % 2 !== 0) {
      return {
        valid: false,
        message: `Ghế Couple phải chọn số chẵn (hiện đang chọn ${arr.length} ghế)`,
      };
    }

    // Group by row
    const byRow: Record<number, number[]> = {};
    arr.forEach(({ r, c }) => {
      if (!byRow[r]) byRow[r] = [];
      byRow[r].push(c);
    });

    // Each row's selected columns must form complete adjacent pairs (c, c+1)
    for (const row of Object.keys(byRow)) {
      const rNum = Number(row);
      const rLabel = rowLabels[rNum] ? `Hàng ${rowLabels[rNum]}` : `Hàng ${rNum + 1}`;
      const cols = byRow[rNum].sort((a, b) => a - b);
      if (cols.length % 2 !== 0) {
        return {
          valid: false,
          message: `${rLabel} có số lẻ ghế được chọn. Ghế Couple phải chọn từng cặp liền kề.`,
        };
      }
      // Check pairs: cols[0]&cols[1], cols[2]&cols[3], ...
      for (let i = 0; i < cols.length; i += 2) {
        if (cols[i + 1] !== cols[i] + 1) {
          return {
            valid: false,
            message: `${rLabel}: ghế ${cols[i] + 1} và ${cols[i + 1] + 1} không kề nhau. Ghế Couple phải chọn các cặp liền kề nhau.`,
          };
        }
      }
    }

    return { valid: true };
  };

  // ── Actions ──
  const handleConfirm = () => {
    if (!selectedHallId) return;

    // Validate couple seat selection
    if (activeMode === 3 && selectedCells.size > 0) {
      const validation = validateCoupleSeats(selectedCells);
      if (!validation.valid) {
        toast({
          title: "Lỗi chọn ghế Couple",
          description: validation.message,
          variant: "destructive",
        });
        return;
      }
    }

    // Apply selected type to selected cells
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      selectedCells.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        next[r][c] = activeMode;
      });
      return next;
    });
    setSelectedCells(new Set());
    toast({
      title: "Đã áp dụng",
      description: "Nhấn Lưu sơ đồ để lưu vào cơ sở dữ liệu",
    });
  };

  const handleDelete = () => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      selectedCells.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        next[r][c] = 0;
      });
      return next;
    });
    setSelectedCells(new Set());
    toast({
      title: "Đã xóa",
      description: "Các ô đã được đặt thành khu vực không ngồi",
    });
  };

  const handleCancel = () => {
    setSelectedCells(new Set());
  };

  // ── Grid Dimension Actions & Selection ──
  const handleAddRow = () => {
    if (grid.length >= SEAT_LIMITS.MAX_ROWS) {
      toast({
        title: "Đã đạt giới hạn",
        description: `Tối đa ${SEAT_LIMITS.MAX_ROWS} hàng ghế (từ hàng A đến hàng ${String.fromCharCode(64 + SEAT_LIMITS.MAX_ROWS)})`,
        variant: "destructive",
      });
      return;
    }
    const cols = grid[0]?.length || DEFAULT_COLS;
    setGrid((prev) => [...prev, Array(cols).fill(1)]);
    toast({
      title: "Đã thêm hàng",
      description: `Đã mở rộng thêm hàng ${grid.length + 1}`,
    });

  };

  const handleRemoveRow = () => {
    if (grid.length <= SEAT_LIMITS.MIN_ROWS) {
      toast({
        title: "Đã đạt giới hạn",
        description: `Tối thiểu ${SEAT_LIMITS.MIN_ROWS} hàng ghế`,
        variant: "destructive",
      });
      return;
    }
    setGrid((prev) => prev.slice(0, -1));
    toast({ title: "Đã bớt hàng", description: "Đã xóa hàng cuối" });
  };

  const handleAddCol = () => {
    const currentCols = grid[0]?.length || 0;
    if (currentCols >= SEAT_LIMITS.MAX_COLS) {
      toast({
        title: "Đã đạt giới hạn",
        description: `Tối đa ${SEAT_LIMITS.MAX_COLS} cột ghế`,
        variant: "destructive",
      });
      return;
    }
    setGrid((prev) => prev.map((row) => [...row, 1]));
    toast({
      title: "Đã thêm cột",
      description: `Đã mở rộng thêm cột ${currentCols + 1}`,
    });
  };

  const handleRemoveCol = () => {
    const currentCols = grid[0]?.length || 0;
    if (currentCols <= SEAT_LIMITS.MIN_COLS) {
      toast({
        title: "Đã đạt giới hạn",
        description: `Tối thiểu ${SEAT_LIMITS.MIN_COLS} cột ghế`,
        variant: "destructive",
      });
      return;
    }
    setGrid((prev) => prev.map((row) => row.slice(0, -1)));
    toast({ title: "Đã bớt cột", description: "Đã xóa cột cuối" });
  };

  const toggleRow = (rIdx: number) => {
    const cols = grid[rIdx]?.length || 0;
    setSelectedCells((prev) => {
      const next = new Set(prev);
      const rowKeys = Array.from({ length: cols }, (_, c) => cellKey(rIdx, c));
      const allSelected = rowKeys.every((k) => next.has(k));
      if (allSelected) {
        rowKeys.forEach((k) => next.delete(k));
      } else {
        rowKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const toggleColumn = (cIdx: number) => {
    const rows = grid.length;
    setSelectedCells((prev) => {
      const next = new Set(prev);
      const colKeys = Array.from({ length: rows }, (_, r) => cellKey(r, cIdx));
      const allSelected = colKeys.every((k) => next.has(k));
      if (allSelected) {
        colKeys.forEach((k) => next.delete(k));
      } else {
        colKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedHallId) {
      toast({ title: "Chưa chọn phòng", variant: "destructive" });
      return;
    }

    // Đếm số ghế thực tế (Active + Broken, loại trừ Inactive/lối đi)
    const realSeatsCount = grid.flat().filter((t) => t !== 0).length;

    if (
      realSeatsCount < SEAT_LIMITS.MIN_SEATS ||
      realSeatsCount > SEAT_LIMITS.MAX_SEATS
    ) {
      toast({
        title: "Không thể lưu sơ đồ",
        description: `Số lượng ghế thực tế phải từ ${SEAT_LIMITS.MIN_SEATS} đến ${SEAT_LIMITS.MAX_SEATS} ghế (hiện có ${realSeatsCount} ghế). Vui lòng điều chỉnh lại.`,
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const seats = gridToSeats(grid);
      await apiCall(API_ENDPOINTS.HALL_LAYOUT(Number(selectedHallId)), {
        method: "POST",
        body: JSON.stringify({ seats }),
      });
      toast({
        title: "Lưu thành công",
        description: `Đã lưu sơ đồ ghế phòng ${selectedHallName} (${realSeatsCount} ghế thực tế)`,
      });
      // Refresh halls to update seat count
      if (selectedCinemaId) {
        const hallsEndpoint = isManagerMode
          ? API_ENDPOINTS.MANAGER_CINEMA_HALLS
          : API_ENDPOINTS.CINEMA_HALLS(Number(selectedCinemaId));
        const res = await apiCall<{ data: { halls: BackendHall[] } }>(
          hallsEndpoint,
        );
        setHalls(res.data?.halls || []);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Có thể phòng đang có suất chiếu sắp tới";
      toast({
        title: "Lỗi lưu sơ đồ",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Hall CRUD ──
  const handleAddHall = async () => {
    if (!hallNameInput.trim() || !selectedCinemaId) return;

    let targetRows = customRows;
    let targetCols = customCols;

    if (addHallMode === "preset") {
      const preset =
        PRESET_TEMPLATES[newHallTemplate] || PRESET_TEMPLATES.standard;
      targetRows = preset.rows;
      targetCols = preset.cols;
    }

    const initialTotalSeats = targetRows * targetCols;
    if (
      initialTotalSeats < SEAT_LIMITS.MIN_SEATS ||
      initialTotalSeats > SEAT_LIMITS.MAX_SEATS
    ) {
      toast({
        title: "Kích thước không hợp lệ",
        description: `Tổng số ghế ban đầu phải từ ${SEAT_LIMITS.MIN_SEATS} đến ${SEAT_LIMITS.MAX_SEATS} ghế (hiện tại: ${initialTotalSeats} ghế).`,
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await apiCall<{ data: { id: number } }>(API_ENDPOINTS.HALLS, {
        method: "POST",
        body: JSON.stringify({
          cinema_id: Number(selectedCinemaId),
          name: hallNameInput.trim(),
          total_seats: initialTotalSeats,
        }),
      });
      toast({
        title: "Thành công",
        description: `Đã thêm phòng ${hallNameInput} (${targetRows} hàng × ${targetCols} cột)`,
      });
      setIsAddHallOpen(false);
      setHallNameInput("");
      setAddHallMode("preset");
      setNewHallTemplate("standard");

      // Refresh halls and auto-select new one with initialized grid
      const hallsEndpoint = isManagerMode
        ? API_ENDPOINTS.MANAGER_CINEMA_HALLS
        : API_ENDPOINTS.CINEMA_HALLS(Number(selectedCinemaId));
      const hallsRes = await apiCall<{ data: { halls: BackendHall[] } }>(
        hallsEndpoint,
      );
      setHalls(hallsRes.data?.halls || []);
      if (res.data?.id) {
        setSelectedHallId(String(res.data.id));
        setGrid(makeEmptyGrid(targetRows, targetCols));
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể thêm phòng";
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleRenameHall = async () => {
    if (!hallNameInput.trim() || !selectedHallId) return;
    try {
      await apiCall(API_ENDPOINTS.HALL_DETAIL(Number(selectedHallId)), {
        method: "PUT",
        body: JSON.stringify({ name: hallNameInput.trim() }),
      });
      toast({ title: "Thành công", description: "Đã đổi tên phòng" });
      setIsRenameHallOpen(false);
      setHallNameInput("");
      setSelectedHallName(hallNameInput.trim());
      if (selectedCinemaId) {
        const hallsEndpoint = isManagerMode
          ? API_ENDPOINTS.MANAGER_CINEMA_HALLS
          : API_ENDPOINTS.CINEMA_HALLS(Number(selectedCinemaId));
        const res = await apiCall<{ data: { halls: BackendHall[] } }>(
          hallsEndpoint,
        );
        setHalls(res.data?.halls || []);
      }
    } catch {
      toast({
        title: "Lỗi",
        description: "Không thể đổi tên phòng",
        variant: "destructive",
      });
    }
  };

  const handleDeleteHall = async () => {
    if (!selectedHallId) return;
    if (
      !window.confirm(
        `Xóa phòng "${selectedHallName}"? Hành động này không thể hoàn tác.`,
      )
    )
      return;
    try {
      await apiCall(API_ENDPOINTS.HALL_DETAIL(Number(selectedHallId)), {
        method: "DELETE",
      });
      toast({ title: "Đã xóa phòng" });
      setSelectedHallId("");
      setGrid(makeEmptyGrid());
      setSelectedCells(new Set());
      if (selectedCinemaId) {
        const hallsEndpoint = isManagerMode
          ? API_ENDPOINTS.MANAGER_CINEMA_HALLS
          : API_ENDPOINTS.CINEMA_HALLS(Number(selectedCinemaId));
        const res = await apiCall<{ data: { halls: BackendHall[] } }>(
          hallsEndpoint,
        );
        setHalls(res.data?.halls || []);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Phòng có thể đang có suất chiếu";
      toast({
        title: "Không thể xóa",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // ── Stats ──
  const realSeatsCount = useMemo(
    () => grid.flat().filter((t) => t !== 0).length,
    [grid],
  );
  const activeSeatsCount = useMemo(
    () => grid.flat().filter((t) => t === 1 || t === 2 || t === 3).length,
    [grid],
  );
  const brokenSeatsCount = useMemo(
    () => grid.flat().filter((t) => t === 4).length,
    [grid],
  );
  const walkwayCount = useMemo(
    () => grid.flat().filter((t) => t === 0).length,
    [grid],
  );

  const seatCounts = seatTypes.map((st) => ({
    ...st,
    count: grid.flat().filter((t) => t === st.id).length,
  }));

  // ── Render ──
  return (
    <div className="p-6 space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black dark:text-black">
            Quản Lý Chỗ Ngồi
          </h1>
          <p className="text-muted-foreground">
            {isManagerMode
              ? "Quản lý sơ đồ ghế cho các phòng chiếu thuộc rạp của bạn"
              : "Thiết kế và quản lý sơ đồ ghế cho từng phòng chiếu"}
          </p>
        </div>
      </div>

      {/* Cinema & Hall selectors */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Cinema */}
            <div className="space-y-1 min-w-[200px]">
              <Label>Rạp chiếu</Label>
              <Select
                value={selectedCinemaId}
                onValueChange={(v) => {
                  if (isManagerMode) return;
                  setSelectedCinemaId(v);
                  setSelectedHallId("");
                }}
                disabled={isManagerMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn rạp..." />
                </SelectTrigger>
                <SelectContent>
                  {cinemas.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Hall */}
            <div className="space-y-1 min-w-[180px]">
              <Label>Phòng chiếu</Label>
              <Select
                value={selectedHallId}
                onValueChange={setSelectedHallId}
                disabled={!selectedCinemaId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedCinemaId ? "Chọn phòng..." : "Chọn rạp trước"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {halls.map((h) => (
                    <SelectItem key={h.id} value={String(h.id)}>
                      {h.name}{" "}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({h.active_seats ?? h.total_seats} ghế)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Hall CRUD buttons */}
            <div className="flex items-center gap-2 ml-auto">
              {canCreateHall && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setHallNameInput("");
                    setNewHallTemplate("standard");
                    setIsAddHallOpen(true);
                  }}
                  disabled={!selectedCinemaId}
                >
                  <Plus className="w-4 h-4" /> Thêm phòng
                </Button>
              )}
              {canUpdateHall && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setHallNameInput(selectedHallName);
                    setIsRenameHallOpen(true);
                  }}
                  disabled={!selectedHallId}
                >
                  <Pencil className="w-4 h-4" /> Đổi tên
                </Button>
              )}
              {canDeleteHall && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive"
                  onClick={handleDeleteHall}
                  disabled={!selectedHallId}
                >
                  <Trash2 className="w-4 h-4" /> Xóa phòng
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editor Area */}
      {selectedHallId ? (
        <div
          className={cn("grid gap-6 items-start", "lg:grid-cols-[1fr_300px]")}
        >
          {/* Matrix */}
          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    Sơ đồ ghế:
                    <Badge variant="outline" className="text-sm font-semibold">
                      {selectedHallName}
                    </Badge>
                  </CardTitle>
                  <Badge
                    className={cn(
                      "text-xs font-bold px-2.5 py-0.5 shadow-sm text-white",
                      realSeatsCount >= SEAT_LIMITS.MIN_SEATS &&
                        realSeatsCount <= SEAT_LIMITS.MAX_SEATS
                        ? "bg-emerald-600 hover:bg-emerald-600"
                        : "bg-red-600 hover:bg-red-600 animate-pulse",
                    )}
                  >
                    {realSeatsCount} ghế thực tế / {SEAT_LIMITS.MAX_SEATS}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    ({grid.length} hàng × {grid[0]?.length || 0} cột)
                  </span>
                  {loading && (
                    <span className="text-xs text-muted-foreground animate-pulse ml-2">
                      Đang tải...
                    </span>
                  )}
                </div>

                {/* Resizing controls */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border">
                    <span className="text-[11px] text-muted-foreground font-medium px-1">
                      Hàng:
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleRemoveRow}
                      disabled={grid.length <= SEAT_LIMITS.MIN_ROWS}
                      title={`Bớt hàng cuối (Tối thiểu ${SEAT_LIMITS.MIN_ROWS})`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-xs font-mono font-bold w-5 text-center">
                      {grid.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleAddRow}
                      disabled={grid.length >= SEAT_LIMITS.MAX_ROWS}
                      title={`Thêm hàng mới (Tối đa ${SEAT_LIMITS.MAX_ROWS})`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border">
                    <span className="text-[11px] text-muted-foreground font-medium px-1">
                      Cột:
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleRemoveCol}
                      disabled={(grid[0]?.length || 0) <= SEAT_LIMITS.MIN_COLS}
                      title={`Bớt cột cuối (Tối thiểu ${SEAT_LIMITS.MIN_COLS})`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-xs font-mono font-bold w-5 text-center">
                      {grid[0]?.length || 0}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleAddCol}
                      disabled={(grid[0]?.length || 0) >= SEAT_LIMITS.MAX_COLS}
                      title={`Thêm cột mới (Tối đa ${SEAT_LIMITS.MAX_COLS})`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-auto pt-6">
              <div className="flex flex-col items-center gap-4 min-w-max pb-4">
                {/* Curved Cinema Screen */}
                <CurvedCinemaScreen className="max-w-2xl mb-2" />

                {/* Column Selection Header */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 text-[10px] text-muted-foreground text-center font-mono font-medium">
                    Hàng
                  </span>
                  <div className="flex gap-1.5">
                    {grid[0]?.map((_, cIdx) => {
                      const colNum = colLabels[cIdx];
                      const isWalkwayCol = colNum === null;
                      return (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => toggleColumn(cIdx)}
                          title={
                            isWalkwayCol
                              ? `Cột lối đi dọc (Click để chọn toàn bộ cột)`
                              : `Click để chọn/bỏ chọn cột ${colNum}`
                          }
                          className={cn(
                            "w-8 h-5 rounded text-[10px] font-semibold transition-colors flex items-center justify-center cursor-pointer select-none",
                            isWalkwayCol
                              ? "text-muted-foreground/30 hover:bg-primary/20 hover:text-foreground border border-dashed border-border/50"
                              : "text-muted-foreground hover:bg-primary/20 hover:text-foreground bg-muted/30",
                          )}
                        >
                          {colNum !== null ? colNum : ""}
                        </button>
                      );
                    })}
                  </div>
                  <span className="w-6 text-[10px] text-muted-foreground text-center font-mono font-medium">
                    Hàng
                  </span>
                </div>

                {/* Grid */}
                <div className="space-y-1.5">
                  {grid.map((row, rIdx) => {
                    const rowLabel = rowLabels[rIdx];
                    const isWalkwayRow = !rowLabel;

                    return (
                      <div key={rIdx} className="flex items-center gap-2">
                        {/* Row label left */}
                        <button
                          type="button"
                          onClick={() => toggleRow(rIdx)}
                          title={
                            isWalkwayRow
                              ? `Hàng lối đi ngang (Click để chọn toàn bộ hàng)`
                              : `Click để chọn/bỏ chọn hàng ${rowLabel}`
                          }
                          className={cn(
                            "w-6 h-8 rounded text-xs font-bold transition-colors flex items-center justify-center cursor-pointer select-none",
                            isWalkwayRow
                              ? "text-muted-foreground/30 hover:bg-primary/20 hover:text-foreground border border-dashed border-border/50"
                              : "text-muted-foreground hover:bg-primary/20 hover:text-foreground",
                          )}
                        >
                          {rowLabel}
                        </button>

                        <div className="flex gap-1.5">
                          {row.map((typeId, cIdx) => {
                            const key = cellKey(rIdx, cIdx);
                            const isSelected = selectedCells.has(key);
                            const seatTypeObj = seatTypes.find(
                              (s) => s.id === typeId,
                            );
                            const colLabel = colLabels[cIdx];
                            const seatNumberDisplay =
                              colLabel !== null ? colLabel : cIdx + 1;
                            const cellTitle =
                              typeId === 0
                                ? "Lối đi / Khoảng trống"
                                : `${rowLabel || "?"}${seatNumberDisplay} (${seatTypeObj?.label || ""})`;

                            return (
                              <div
                                key={cIdx}
                                onMouseDown={() => handleCellDown(rIdx, cIdx)}
                                onMouseEnter={() => handleCellEnter(rIdx, cIdx)}
                                className={cn(
                                  "w-8 h-8 rounded border flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer select-none",
                                  seatTypeGridColor[typeId] ??
                                    seatTypeGridColor[0],
                                  isSelected && SELECTED_COLOR,
                                )}
                                title={cellTitle}
                              >
                                {typeId === 0
                                  ? "·"
                                  : typeId === 4
                                    ? "!"
                                    : seatNumberDisplay}
                              </div>
                            );
                          })}
                        </div>

                        {/* Row label right */}
                        <button
                          type="button"
                          onClick={() => toggleRow(rIdx)}
                          title={
                            isWalkwayRow
                              ? `Hàng lối đi ngang (Click để chọn toàn bộ hàng)`
                              : `Click để chọn/bỏ chọn hàng ${rowLabel}`
                          }
                          className={cn(
                            "w-6 h-8 rounded text-xs font-bold transition-colors flex items-center justify-center cursor-pointer select-none",
                            isWalkwayRow
                              ? "text-muted-foreground/30 hover:bg-primary/20 hover:text-foreground border border-dashed border-border/50"
                              : "text-muted-foreground hover:bg-primary/20 hover:text-foreground",
                          )}
                        >
                          {rowLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 pt-4 border-t w-full justify-center">
                  {seatTypes.map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <div className={cn("w-4 h-4 rounded border", st.color)} />
                      <span className="text-muted-foreground">{st.label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-4 h-4 rounded border border-yellow-400 ring-2 ring-yellow-400 bg-blue-900" />
                    <span className="text-muted-foreground">Đang chọn</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Side Panel */}
          <div className="space-y-4">
            {/* Seat type mode selector */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Chọn loại ghế để sơn</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {seatTypes.find((s) => s.id === activeMode)?.shortLabel}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {seatTypes.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setActiveMode(st.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left",
                      activeMode === st.id
                        ? "border-yellow-400 bg-yellow-400/10 text-foreground ring-1 ring-yellow-400/50"
                        : "border-border hover:border-muted-foreground/50 text-muted-foreground",
                    )}
                  >
                    <div
                      className={cn(
                        "w-3.5 h-3.5 rounded flex-shrink-0 border",
                        st.color,
                      )}
                    />
                    <div className="truncate flex-1">
                      <p className="font-semibold text-xs leading-none mb-0.5">{st.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {st.description}
                      </p>
                    </div>
                    {activeMode === st.id && (
                      <ChevronRight className="w-4 h-4 ml-auto text-yellow-500 shrink-0" />
                    )}
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Action buttons */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Thao tác ({selectedCells.size} ô đang chọn)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full gap-2"
                  onClick={handleConfirm}
                  disabled={selectedCells.size === 0}
                >
                  <Save className="w-4 h-4" />
                  Áp dụng cọ ({selectedCells.size} ô)
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2 text-destructive hover:text-destructive"
                  onClick={handleDelete}
                  disabled={selectedCells.size === 0}
                >
                  <Trash2 className="w-4 h-4" />
                  Đặt thành Lối đi
                </Button>
                <Button
                  variant="ghost"
                  className="w-full gap-2"
                  onClick={handleCancel}
                  disabled={selectedCells.size === 0}
                >
                  <X className="w-4 h-4" />
                  Hủy chọn
                </Button>
                <div className="border-t pt-2 space-y-2">
                  {canManageLayout ? (
                    <Button
                      className={cn(
                        "w-full gap-2 text-white font-bold",
                        realSeatsCount >= SEAT_LIMITS.MIN_SEATS &&
                          realSeatsCount <= SEAT_LIMITS.MAX_SEATS
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-red-600 hover:bg-red-700",
                      )}
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? "Đang lưu..." : "Lưu sơ đồ"}
                    </Button>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-muted text-xs text-muted-foreground text-center">
                      Chế độ chỉ xem sơ đồ ghế (cần quyền <code className="font-bold">halls.manage_layout</code> để lưu chỉnh sửa).
                    </div>
                  )}
                  {(realSeatsCount < SEAT_LIMITS.MIN_SEATS ||
                    realSeatsCount > SEAT_LIMITS.MAX_SEATS) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-destructive font-medium bg-destructive/10 p-2 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Yêu cầu: từ {SEAT_LIMITS.MIN_SEATS} đến{" "}
                        {SEAT_LIMITS.MAX_SEATS} ghế thực tế (hiện có:{" "}
                        {realSeatsCount})
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Thống kê chi tiết</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {grid.length} × {grid[0]?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="font-semibold text-foreground">
                    Ghế thực tế:
                  </span>
                  <span
                    className={cn(
                      "font-bold font-mono",
                      realSeatsCount >= SEAT_LIMITS.MIN_SEATS &&
                        realSeatsCount <= SEAT_LIMITS.MAX_SEATS
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-500",
                    )}
                  >
                    {realSeatsCount} / {SEAT_LIMITS.MAX_SEATS}
                  </span>
                </div>
                {seatCounts.map((sc) => (
                  <div
                    key={sc.id}
                    className="flex justify-between items-center py-0.5"
                  >
                    <span className={cn("flex items-center gap-1.5", sc.textColor)}>
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full inline-block",
                          sc.dotColor,
                        )}
                      />
                      {sc.label}
                    </span>
                    <span className="font-mono font-medium">{sc.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-lg">
              Vui lòng chọn rạp và phòng chiếu để xem sơ đồ ghế
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Hall Dialog */}
      <Dialog open={isAddHallOpen} onOpenChange={setIsAddHallOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm Phòng Chiếu Mới</DialogTitle>
            <DialogDescription>
              Tạo phòng chiếu với mẫu có sẵn hoặc tùy biến số hàng & số cột tự do
              (từ {SEAT_LIMITS.MIN_SEATS} đến {SEAT_LIMITS.MAX_SEATS} ghế).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="font-semibold">Tên phòng chiếu</Label>
              <Input
                value={hallNameInput}
                onChange={(e) => setHallNameInput(e.target.value)}
                placeholder="VD: Phòng 1, IMAX Laser, Gold Class..."
                onKeyDown={(e) => e.key === "Enter" && handleAddHall()}
              />
            </div>

            {/* Mode Selector */}
            <div className="space-y-2">
              <Label className="font-semibold">Kiểu thiết lập kích thước</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAddHallMode("preset")}
                  className={cn(
                    "flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-semibold transition-all",
                    addHallMode === "preset"
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border hover:bg-muted/50 text-muted-foreground",
                  )}
                >
                  <Sliders className="w-4 h-4 mb-1" />
                  Mẫu gợi ý nhanh
                </button>
                <button
                  type="button"
                  onClick={() => setAddHallMode("custom")}
                  className={cn(
                    "flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-semibold transition-all",
                    addHallMode === "custom"
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border hover:bg-muted/50 text-muted-foreground",
                  )}
                >
                  <Plus className="w-4 h-4 mb-1" />
                  Tùy chỉnh số hàng & cột
                </button>
              </div>
            </div>

            {addHallMode === "preset" ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Chọn mẫu phòng ban đầu
                </Label>
                <Select
                  value={newHallTemplate}
                  onValueChange={setNewHallTemplate}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn mẫu phòng..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRESET_TEMPLATES).map(([key, template]) => (
                      <SelectItem key={key} value={key}>
                        <div className="py-0.5">
                          <span className="font-semibold">{template.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({template.rows * template.cols} ghế)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {PRESET_TEMPLATES[newHallTemplate]?.description}
                </p>
              </div>
            ) : (
              <div className="space-y-3 p-3 bg-muted/40 rounded-xl border">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Số hàng ghế (Rows)
                    </Label>
                    <Input
                      type="number"
                      min={SEAT_LIMITS.MIN_ROWS}
                      max={SEAT_LIMITS.MAX_ROWS}
                      value={customRows}
                      onChange={(e) =>
                        setCustomRows(
                          Math.max(
                            1,
                            Math.min(
                              SEAT_LIMITS.MAX_ROWS,
                              Number(e.target.value) || 1,
                            ),
                          ),
                        )
                      }
                    />
                    <span className="text-[10px] text-muted-foreground">
                      Từ {SEAT_LIMITS.MIN_ROWS} đến {SEAT_LIMITS.MAX_ROWS} hàng
                      (A - {String.fromCharCode(64 + customRows)})
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Ghế mỗi hàng (Cols)
                    </Label>
                    <Input
                      type="number"
                      min={SEAT_LIMITS.MIN_COLS}
                      max={SEAT_LIMITS.MAX_COLS}
                      value={customCols}
                      onChange={(e) =>
                        setCustomCols(
                          Math.max(
                            1,
                            Math.min(
                              SEAT_LIMITS.MAX_COLS,
                              Number(e.target.value) || 1,
                            ),
                          ),
                        )
                      }
                    />
                    <span className="text-[10px] text-muted-foreground">
                      Từ {SEAT_LIMITS.MIN_COLS} đến {SEAT_LIMITS.MAX_COLS} cột
                    </span>
                  </div>
                </div>

                {/* Calculation preview */}
                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <span className="text-muted-foreground">Tổng số ô ban đầu:</span>
                  <span
                    className={cn(
                      "font-mono font-bold text-sm",
                      customRows * customCols >= SEAT_LIMITS.MIN_SEATS &&
                        customRows * customCols <= SEAT_LIMITS.MAX_SEATS
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-500",
                    )}
                  >
                    {customRows * customCols} ô
                  </span>
                </div>
              </div>
            )}

            {/* Validation alert */}
            {(() => {
              const count =
                addHallMode === "preset"
                  ? (PRESET_TEMPLATES[newHallTemplate]?.rows || 10) *
                    (PRESET_TEMPLATES[newHallTemplate]?.cols || 12)
                  : customRows * customCols;
              if (count < SEAT_LIMITS.MIN_SEATS) {
                return (
                  <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Số lượng ghế quá ít (tối thiểu {SEAT_LIMITS.MIN_SEATS} ghế).
                  </p>
                );
              }
              if (count > SEAT_LIMITS.MAX_SEATS) {
                return (
                  <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Số lượng ghế vượt quá giới hạn (tối đa {SEAT_LIMITS.MAX_SEATS} ghế).
                  </p>
                );
              }
              return (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Kích thước hợp lệ ({count} ô). Sau khi tạo có thể tô lối đi và phân loại ghế.
                </p>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddHallOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleAddHall}
              disabled={
                !hallNameInput.trim() ||
                (addHallMode === "custom" &&
                  (customRows * customCols < SEAT_LIMITS.MIN_SEATS ||
                    customRows * customCols > SEAT_LIMITS.MAX_SEATS))
              }
            >
              Thêm phòng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Hall Dialog */}
      <Dialog open={isRenameHallOpen} onOpenChange={setIsRenameHallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi Tên Phòng</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Tên mới</Label>
            <Input
              value={hallNameInput}
              onChange={(e) => setHallNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameHall()}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRenameHallOpen(false)}
            >
              Hủy
            </Button>
            <Button onClick={handleRenameHall} disabled={!hallNameInput.trim()}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSeatManagement;
