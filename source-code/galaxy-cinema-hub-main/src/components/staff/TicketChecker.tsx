/**
 * Ticket Checker Component - For Staff to Scan Tickets
 */

import React, { useEffect, useRef, useState } from "react";
import {
  QrCode,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  MapPin,
  Armchair,
  AlertTriangle,
  User,
  Mail,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TicketService } from "@/services/ticket.service";
import { CheckTicketResponse, TicketDetail, TicketScanUser } from "@/types/api";
import { ApiError } from "@/lib/api-client";

interface TicketCheckerProps {
  onSuccess?: (ticket: TicketDetail) => void;
  scannedCode?: string;
  autoCheckSignal?: number;
}

const TicketChecker: React.FC<TicketCheckerProps> = ({
  onSuccess,
  scannedCode,
  autoCheckSignal,
}) => {
  const [ticketCode, setTicketCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const lastAutoCheckedSignalRef = useRef<number>(0);
  // Lỗi (mã vé sai, hết hạn...) không có `ticket` — nên state dùng kiểu lỏng.
  const [result, setResult] = useState<
    (Omit<CheckTicketResponse, "ticket"> & {
      ticket?: TicketDetail;
      success: boolean;
    }) | null
  >(null);

  const checkTicketByCode = async (code: string) => {
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      setResult({
        success: false,
        message: "Vui lòng nhập mã vé",
      });
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const response = await TicketService.checkTicket({
        code: normalizedCode,
      });

      if (response.success && response.data) {
        setResult({
          code: normalizedCode,
          success: true,
          ticket: response.data.ticket,
          booking: response.data.booking,
          user: response.data.user,
          gate: response.data.gate,
          message: response.data.message || "Vé hợp lệ - Cho phép vào",
        });

        if (onSuccess) {
          onSuccess(response.data.ticket);
        }
      }
    } catch (err) {
      const error = err as ApiError;
      const payload = (error.data?.errors || error.errors || {}) as Record<
        string,
        any
      >;
      const payloadUser = (payload.user || payload) as TicketScanUser;

      setResult({
        code: normalizedCode,
        success: false,
        user: payloadUser,
        gate: payload.gate,
        booking: payload.booking,
        ticket: payload.ticket,
        message: error.message || "Có lỗi xảy ra khi kiểm tra vé",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveEntry = async () => {
    if (!result?.code || !result?.gate?.can_approve || approving) {
      return;
    }

    try {
      setApproving(true);
      const response = await TicketService.approveEntry({ code: result.code });

      if (response.success && response.data) {
        setResult({
          ...response.data,
          code: result.code,
          success: true,
          message: response.data.message || "Đã duyệt vào cổng",
        });

        if (response.data.ticket && onSuccess) {
          onSuccess(response.data.ticket);
        }
      }
    } catch (err) {
      const error = err as ApiError;
      setResult((prev) => ({
        ...(prev || { success: false }),
        success: false,
        message: error.message || "Không thể duyệt vào cổng",
      }));
    } finally {
      setApproving(false);
    }
  };

  const handleCheck = async () => {
    await checkTicketByCode(ticketCode);
  };

  useEffect(() => {
    if (!scannedCode) return;
    setTicketCode(scannedCode);
  }, [scannedCode]);

  useEffect(() => {
    if (!scannedCode || !autoCheckSignal) return;
    if (loading) return;
    if (autoCheckSignal <= lastAutoCheckedSignalRef.current) return;

    lastAutoCheckedSignalRef.current = autoCheckSignal;
    void checkTicketByCode(scannedCode);
  }, [autoCheckSignal, scannedCode, loading]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleCheck();
    }
  };

  const getTicketValue = (ticket: TicketDetail, camelKey: string, snakeKey: string) => {
    const source = ticket as unknown as Record<string, unknown>;
    const camelValue = source[camelKey];
    if (camelValue !== undefined && camelValue !== null && String(camelValue).trim() !== "") {
      return String(camelValue);
    }
    const snakeValue = source[snakeKey];
    if (snakeValue !== undefined && snakeValue !== null && String(snakeValue).trim() !== "") {
      return String(snakeValue);
    }
    return "";
  };

  const getShowtimeLabel = (ticket: TicketDetail) => {
    const raw = getTicketValue(ticket, "showtimeStart", "showtime_start");
    if (!raw) return "Đang cập nhật";

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;

    return parsed.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSeatLabel = (ticket: TicketDetail, booking?: CheckTicketResponse["booking"]) => {
    if (Array.isArray(booking?.seats) && booking.seats.length > 0) {
      return booking.seats.join(", ");
    }

    const row = getTicketValue(ticket, "rowNumber", "row_number");
    const number = getTicketValue(ticket, "seatNumber", "seat_number");
    const seatCode = `${row}${number}`.trim();
    return seatCode || "Đang cập nhật";
  };

  const getRoomLabel = (ticket: TicketDetail) => {
    return getTicketValue(ticket, "roomName", "room_name") || "Đang cập nhật";
  };

  const getSeatTypeLabel = (ticket: TicketDetail) => {
    return getTicketValue(ticket, "seatTypeName", "seat_type_name") || "Đang cập nhật";
  };

  const getMovieTitleLabel = (ticket: TicketDetail) => {
    return getTicketValue(ticket, "movieTitle", "movie_title") || "Không xác định";
  };

  const getCinemaNameLabel = (ticket: TicketDetail) => {
    return getTicketValue(ticket, "cinemaName", "cinema_name") || "Đang cập nhật";
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="w-6 h-6" />
            Quét Vé Tại Cổng
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Input Section */}
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Nhập mã vé hoặc quét QR code..."
              value={ticketCode}
              onChange={(e) => setTicketCode(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 h-12 text-lg"
              autoFocus
              disabled={loading}
            />
            <Button
              onClick={handleCheck}
              disabled={loading || !ticketCode.trim()}
              className="h-12 px-8"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Đang kiểm tra...
                </>
              ) : (
                <>
                  <QrCode className="w-5 h-5 mr-2" />
                  Kiểm tra
                </>
              )}
            </Button>
          </div>

          {/* Result Section */}
          {result && (
            <Alert
              variant={
                result.gate && result.gate.can_approve === false
                  ? "destructive"
                  : result.success
                    ? "default"
                    : "destructive"
              }
              className="animate-fade-in"
            >
              {result.gate && result.gate.can_approve === false ? (
                <XCircle className="h-5 w-5" />
              ) : result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <AlertDescription className="text-lg font-semibold">
                {result.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Approve Section */}
          {result?.ticket && (
            <div className="flex justify-end">
              <Button
                onClick={handleApproveEntry}
                disabled={
                  approving ||
                  loading ||
                  !result.code ||
                  result.gate?.can_approve !== true ||
                  result.gate?.approved === true
                }
                className="h-11 px-6"
              >
                {approving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang duyệt...
                  </>
                ) : result.gate?.approved ? (
                  "Đã duyệt vào cổng"
                ) : (
                  "Duyệt vào cổng"
                )}
              </Button>
            </div>
          )}

          {/* User Information Section - Display for both success and error */}
          {result?.user &&
            (result.user.user_full_name ||
              result.user.user_email ||
              result.user.user_phone) && (
              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 animate-fade-in">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    {result.user.user_avatar && (
                      <img
                        src={result.user.user_avatar}
                        alt="Customer Avatar"
                        className="w-16 h-16 rounded-full object-cover border-2 border-blue-300 dark:border-blue-600"
                      />
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
                        <User className="w-4 h-4" />
                        <div>
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            Khách hàng
                          </p>
                          <p className="font-semibold">
                            {result.user.user_full_name || "Không xác định"}
                          </p>
                        </div>
                      </div>
                      {result.user.user_email && (
                        <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                          <Mail className="w-4 h-4" />
                          <p className="text-sm">{result.user.user_email}</p>
                        </div>
                      )}
                      {result.user.user_phone && (
                        <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                          <Phone className="w-4 h-4" />
                          <p className="text-sm">{result.user.user_phone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          {result?.ticket && (
            <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 animate-fade-in">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-xl text-green-900 dark:text-green-100">
                      {getMovieTitleLabel(result.ticket)}
                    </h3>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {getCinemaNameLabel(result.ticket)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      result.gate?.approved
                        ? "bg-blue-600 text-white border-blue-700"
                        : result.gate?.can_approve
                          ? "bg-green-600 text-white border-green-700"
                          : "bg-orange-600 text-white border-orange-700"
                    }
                  >
                    {result.gate?.approved
                      ? "ĐÃ DUYỆT"
                      : result.gate?.can_approve
                        ? "CÓ THỂ DUYỆT"
                        : "CHƯA ĐẾN GIỜ"}
                  </Badge>
                </div>

                {result.booking && (
                  <div className="rounded-md border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-900 dark:text-green-100">
                    <p>
                      <span className="font-semibold">Mã booking:</span>{" "}
                      {result.booking.booking_code || "N/A"}
                    </p>
                    <p>
                      <span className="font-semibold">Số vé:</span>{" "}
                      {result.booking.ticket_count}
                    </p>
                    {Array.isArray(result.booking.seats) &&
                      result.booking.seats.length > 0 && (
                        <p>
                          <span className="font-semibold">Ghế:</span>{" "}
                          {result.booking.seats.join(", ")}
                        </p>
                      )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <Clock className="w-4 h-4" />
                    <div>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Giờ chiếu
                      </p>
                      <p className="font-semibold">{getShowtimeLabel(result.ticket)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <Armchair className="w-4 h-4" />
                    <div>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Ghế
                      </p>
                      <p className="font-semibold">{getSeatLabel(result.ticket, result.booking)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <MapPin className="w-4 h-4" />
                    <div>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Phòng
                      </p>
                      <p className="font-semibold">{getRoomLabel(result.ticket)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <QrCode className="w-4 h-4" />
                    <div>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Loại ghế
                      </p>
                      <p className="font-semibold">{getSeatTypeLabel(result.ticket)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Details for Invalid Tickets */}
          {result && result.message.includes("chưa mở cửa") && (
            <Alert
              variant="default"
              className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
            >
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                Khách hàng đến quá sớm. Vui lòng yêu cầu quay lại sau 30 phút
                trước giờ chiếu.
              </AlertDescription>
            </Alert>
          )}

          {/* Instructions */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2 text-sm">Hướng dẫn:</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Nhập mã vé hoặc quét QR code từ vé điện tử</li>
              <li>• Bước 1: Bấm "Kiểm tra" để xác minh mã vé và khung giờ</li>
              <li>
                • Bước 2: Chỉ khi trong khung cho phép, bấm "Duyệt vào cổng" để
                lưu lịch sử và cập nhật trạng thái vé
              </li>
              <li>
                • Khách được vào trước 30 phút và chậm nhất 15 phút sau giờ
                chiếu
              </li>
              <li>• Vé đã sử dụng không thể quét lại</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TicketChecker;
