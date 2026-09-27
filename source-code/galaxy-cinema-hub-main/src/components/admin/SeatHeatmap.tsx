import React from "react";
import { cn } from "@/lib/utils";
import { Armchair } from "lucide-react";
import { CurvedCinemaScreen } from "@/components/cinema/CurvedCinemaScreen";

interface SeatHeatmapProps {
  className?: string;
  items: HeatmapSeat[];
  stats?: {
    max_booking_count?: number;
    zero_booking_seats?: number;
    average_booking_count?: number;
  };
}

interface HeatmapSeat {
  row: string;
  number: number;
  booking_count: number;
}

const SeatHeatmap: React.FC<SeatHeatmapProps> = ({
  className,
  items,
  stats,
}) => {
  // Xử lý và chuẩn hóa toàn bộ lưới hiển thị theo tối đa hàng và cột
  const { gridRows, colNumbers, maxBookings, totalSeatsCount } = React.useMemo(() => {
    const merged = new Map<string, HeatmapSeat>();
    let highestCol = 0;
    const rowSet = new Set<string>();

    (items || []).forEach((seat) => {
      // Loại bỏ các ô tạm thời, lối đi nội bộ (_R...) hoặc số giả lập (>= 1000)
      if (!seat.row || seat.row.startsWith("_") || seat.number >= 1000) {
        return;
      }
      const key = `${seat.row}-${seat.number}`;
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, { ...seat });
      } else {
        existing.booking_count += seat.booking_count;
      }

      rowSet.add(seat.row);
      if (seat.number > highestCol) {
        highestCol = seat.number;
      }
    });

    // Sắp xếp các chữ cái hàng và tìm chữ cái hàng xa nhất
    const sortedRowCodes = Array.from(rowSet).sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      return a.localeCompare(b);
    });

    // Tạo danh sách liên tục từ hàng 'A' đến chữ cái hàng tối đa
    let allRows: string[] = [];
    if (sortedRowCodes.length > 0) {
      const lastRow = sortedRowCodes[sortedRowCodes.length - 1];
      const maxCharCode = lastRow.charCodeAt(0);
      if (lastRow.length === 1 && maxCharCode >= 65 && maxCharCode <= 90) {
        for (let code = 65; code <= maxCharCode; code++) {
          allRows.push(String.fromCharCode(code));
        }
      } else {
        allRows = sortedRowCodes;
      }
    }

    // Xác định số cột tối đa (tối thiểu 10 hoặc số cột lớn nhất của rạp)
    const targetMaxCol = Math.max(highestCol, 10);
    const cols = Array.from({ length: targetMaxCol }, (_, i) => i + 1);

    // Xây dựng ma trận lưới chữ nhật toàn vẹn (mọi hàng đều có đủ số cột tối đa)
    const fullGrid: Record<string, HeatmapSeat[]> = {};
    let maxCount = 0;

    allRows.forEach((row) => {
      fullGrid[row] = cols.map((colNum) => {
        const found = merged.get(`${row}-${colNum}`);
        const count = found ? found.booking_count : 0;
        if (count > maxCount) {
          maxCount = count;
        }
        return (
          found || {
            row,
            number: colNum,
            booking_count: 0,
          }
        );
      });
    });

    return {
      gridRows: fullGrid,
      colNumbers: cols,
      maxBookings: maxCount,
      totalSeatsCount: allRows.length * cols.length,
    };
  }, [items]);

  if (Object.keys(gridRows).length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground py-8 text-center", className)}>
        Chưa có dữ liệu ghế trong 7 ngày gần đây.
      </div>
    );
  }

  // Thuật toán tính màu sắc và nhãn mức độ phổ biến hợp lý:
  const getHeatLevel = (count: number): {
    color: string;
    label: string;
  } => {
    if (count === 0) {
      return {
        label: "Chưa đặt",
        color: "bg-gray-100 border-gray-200 dark:bg-zinc-800 dark:border-zinc-700 text-gray-400",
      };
    }

    if (maxBookings <= 5) {
      if (count === 1) {
        return {
          label: "Ít",
          color: "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-950/60 dark:border-blue-700 dark:text-blue-300",
        };
      }
      if (count === 2) {
        return {
          label: "Khá ít",
          color: "bg-green-100 border-green-300 text-green-800 dark:bg-green-950/60 dark:border-green-700 dark:text-green-300",
        };
      }
      if (count === 3) {
        return {
          label: "Trung bình",
          color: "bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-950/60 dark:border-yellow-700 dark:text-yellow-300",
        };
      }
      if (count === 4) {
        return {
          label: "Phổ biến",
          color: "bg-orange-200 border-orange-400 text-orange-800 dark:bg-orange-950/60 dark:border-orange-700 dark:text-orange-300",
        };
      }
      return {
        label: "Rất phổ biến",
        color: "bg-red-300 border-red-500 text-red-800 dark:bg-red-950/70 dark:border-red-600 dark:text-red-300",
      };
    }

    const ratio = count / maxBookings;
    if (count < 2 || ratio < 0.2) {
      return {
        label: "Ít",
        color: "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-950/60 dark:border-blue-700 dark:text-blue-300",
      };
    }
    if (count < 4 || ratio < 0.4) {
      return {
        label: "Khá ít",
        color: "bg-green-100 border-green-300 text-green-800 dark:bg-green-950/60 dark:border-green-700 dark:text-green-300",
      };
    }
    if (count < 7 || ratio < 0.6) {
      return {
        label: "Trung bình",
        color: "bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-950/60 dark:border-yellow-700 dark:text-yellow-300",
      };
    }
    if (count < 10 || ratio < 0.8) {
      return {
        label: "Phổ biến",
        color: "bg-orange-200 border-orange-400 text-orange-800 dark:bg-orange-950/60 dark:border-orange-700 dark:text-orange-300",
      };
    }
    return {
      label: "Rất phổ biến",
      color: "bg-red-300 border-red-500 text-red-800 dark:bg-red-950/70 dark:border-red-600 dark:text-red-300",
    };
  };

  const maxBookingCount = stats?.max_booking_count ?? maxBookings;
  const flatSeats = Object.values(gridRows).flat();
  const zeroBookingSeats = flatSeats.filter((s) => s.booking_count === 0).length;
  const totalBookingsSum = flatSeats.reduce((sum, s) => sum + s.booking_count, 0);
  const averageBookingCount = totalSeatsCount > 0 ? totalBookingsSum / totalSeatsCount : 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-foreground">Mức độ phổ biến:</span>
          {[
            {
              label: "Chưa đặt",
              color: "bg-gray-100 border-gray-200 dark:bg-zinc-800 dark:border-zinc-700",
            },
            {
              label: "Ít",
              color: "bg-blue-100 border-blue-300 dark:bg-blue-950/60 dark:border-blue-700",
            },
            {
              label: "Khá ít",
              color: "bg-green-100 border-green-300 dark:bg-green-950/60 dark:border-green-700",
            },
            {
              label: "Trung bình",
              color: "bg-yellow-100 border-yellow-300 dark:bg-yellow-950/60 dark:border-yellow-700",
            },
            {
              label: "Phổ biến",
              color: "bg-orange-200 border-orange-400 dark:bg-orange-950/60 dark:border-orange-700",
            },
            {
              label: "Rất phổ biến",
              color: "bg-red-300 border-red-500 dark:bg-red-950/70 dark:border-red-600",
            },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={cn("w-3.5 h-3.5 rounded border", color)} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground">
          Khung ma trận: <span className="font-bold text-foreground">{Object.keys(gridRows).length}</span> hàng × <span className="font-bold text-foreground">{colNumbers.length}</span> cột ({totalSeatsCount} vị trí)
        </div>
      </div>

      {/* Screen & Seat Map Container */}
      <div className="w-full flex flex-col items-center justify-center pt-2">
        {/* Centered Curved Cinema Screen */}
        <CurvedCinemaScreen compact className="mx-auto my-3" />

        {/* Seat Map */}
        <div className="space-y-1.5 w-full flex flex-col items-center overflow-x-auto py-2">
          {/* Header hiển thị toàn bộ số cột tối đa */}
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 text-center text-[10px] font-bold text-muted-foreground select-none" />
            <div className="flex gap-1.5 justify-center">
              {colNumbers.map((col) => (
                <span
                  key={`top-col-${col}`}
                  className="w-7 text-center text-[11px] font-semibold text-muted-foreground select-none"
                >
                  {col}
                </span>
              ))}
            </div>
            <span className="w-6 text-center text-[10px] font-bold text-muted-foreground select-none" />
          </div>

          {/* Toàn bộ các hàng ghế (từ hàng A đến hàng tối đa) */}
          {Object.entries(gridRows).map(([row, seats]) => (
            <div key={row} className="flex items-center gap-2">
              <span className="w-6 text-xs font-bold text-muted-foreground text-center select-none">
                {row}
              </span>
              <div className="flex gap-1.5 justify-center">
                {seats.map((seat) => {
                  const heat = getHeatLevel(seat.booking_count);
                  return (
                    <div
                      key={`${row}-${seat.number}`}
                      className={cn(
                        "relative w-7 h-7 rounded border flex items-center justify-center text-[10px] font-medium cursor-pointer transition-all hover:scale-110 group",
                        heat.color,
                      )}
                      title={`Ghế ${seat.row}${seat.number}: ${seat.booking_count} lượt đặt - ${heat.label}`}
                    >
                      <Armchair className="w-3.5 h-3.5 opacity-50" />

                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-md">
                        {seat.row}{seat.number}: {seat.booking_count} lượt ({heat.label})
                      </div>
                    </div>
                  );
                })}
              </div>
              <span className="w-6 text-xs font-bold text-muted-foreground text-center select-none">
                {row}
              </span>
            </div>
          ))}

          {/* Footer hiển thị số cột để dễ theo dõi khi nhiều hàng ghế */}
          {Object.keys(gridRows).length > 8 && (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-6 text-center text-[10px] font-bold text-muted-foreground select-none" />
              <div className="flex gap-1.5 justify-center">
                {colNumbers.map((col) => (
                  <span
                    key={`bottom-col-${col}`}
                    className="w-7 text-center text-[11px] font-semibold text-muted-foreground select-none"
                  >
                    {col}
                  </span>
                ))}
              </div>
              <span className="w-6 text-center text-[10px] font-bold text-muted-foreground select-none" />
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t">
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">{maxBookingCount}</p>
          <p className="text-xs text-muted-foreground">Lượt đặt nhiều nhất / ghế</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">{zeroBookingSeats}</p>
          <p className="text-xs text-muted-foreground">Vị trí chưa đặt lần nào</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">
            {averageBookingCount.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">Trung bình lượt đặt / vị trí</p>
        </div>
      </div>
    </div>
  );
};

export default SeatHeatmap;
