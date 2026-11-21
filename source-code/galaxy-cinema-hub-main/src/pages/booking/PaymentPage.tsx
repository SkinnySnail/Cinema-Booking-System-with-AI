import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CreditCard,
  Smartphone,
  Building2,
  Tag,
  Clock,
  QrCode,
  X,
  ArrowLeft,
  Ticket,
  Percent,
  BadgeCheck,
  Loader2,
  ShieldCheck,
  Check,
  ChevronRight,
  ShoppingBag,
  Banknote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useBooking } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AppContext";
import { movies } from "@/data/mockData";
import { API_ENDPOINTS, apiCall, getImageUrl } from "@/lib/api";
import { getPusherClient } from "@/lib/pusher";
import { PaymentMethod } from "@/types/cinema";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { BookingService } from "@/services/booking.service";
import { TicketService } from "@/services/ticket.service";
import { TransactionService } from "@/services/transacsion.service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useHoldTimer, formatHoldTime } from "@/hooks/useHoldTimer";

interface MovieInfo {
  id: string;
  title: string;
  poster: string;
}

interface MovieApiData {
  id: number;
  title: string;
  poster_url?: string;
}

interface PromotionItem {
  id: number;
  code: string;
  title?: string;
  description?: string;
  discount_type?: string;
  discount_value?: number;
  discount_amount?: number;
  min_order_value?: number;
  start_date: string;
  end_date: string;
  usage_limit?: number;
  used_count?: number;
  is_auto_apply?: boolean;
  status?: string;
}

interface VoucherItem extends PromotionItem {
  promo_code?: string;
  promotion_id?: number;
}

interface TierInfo {
  id: number;
  name: string;
  rank_name?: string;
  discount_rate: string;
}

interface TicketData {
  ticket_code?: string;
  ticketCode?: string;
}

interface BookingData {
  booking_code?: string;
  bookingCode?: string;
  booking_id?: number;
}

interface VoucherApplyResponse {
  success: boolean;
  message?: string;
  data?: {
    discount: number;
    voucher_id: number;
  };
}

const PaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    selectedMovie,
    selectedSeats,
    concessions,
    clearBooking,
    selectedShowtime,
  } = useBooking();

  const { timeLeft: holdTimeLeft, isActive: holdTimerActive } = useHoldTimer();
  const { pauseHoldTimer, resumeHoldTimer } = useBooking();
  const { theme } = useTheme();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("momo");
  const [promoCode, setPromoCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrTimeLeft, setQRTimeLeft] = useState(300); // 5 minutes
  const [isProcessing, setIsProcessing] = useState(false);
  const [momoQrImageUrl, setMomoQrImageUrl] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [currentBookingId, setCurrentBookingId] = useState<number | null>(null);
  const [currentBookingCode, setCurrentBookingCode] = useState<string | null>(
    null,
  );
  const [appliedVoucherId, setAppliedVoucherId] = useState<number | null>(null);
  const [showCancelPaymentConfirm, setShowCancelPaymentConfirm] =
    useState(false);
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [isVnpayMode, setIsVnpayMode] = useState(false);
  const [isVisaMode, setIsVisaMode] = useState(false);
  const vnpayPopupRef = useRef<Window | null>(null);
  const visaPopupRef = useRef<Window | null>(null);
  const paymentHandledRef = useRef(false);
  const timeoutHandledRef = useRef(false);

  // Promotions & vouchers for display
  const [activePromos, setActivePromos] = useState<PromotionItem[]>([]);
  const [userVouchers, setUserVouchers] = useState<VoucherItem[]>([]);
  const [userTier, setUserTier] = useState<TierInfo | null>(null);

  const [movie, setMovie] = useState<MovieInfo | null>(null);
  const [loadingMovie, setLoadingMovie] = useState(true);

  // Fetch movie from API
  useEffect(() => {
    const fetchMovie = async () => {
      if (!selectedMovie) {
        setLoadingMovie(false);
        return;
      }
      try {
        setLoadingMovie(true);
        const response = await apiCall<{
          success: boolean;
          data: { movie: MovieApiData };
        }>(API_ENDPOINTS.MOVIE_DETAIL(parseInt(selectedMovie)));
        if (response.success && response.data?.movie) {
          const m = response.data.movie;
          setMovie({
            id: String(m.id),
            title: m.title,
            poster: m.poster_url ? getImageUrl(m.poster_url) : "",
          });
        } else {
          // API succeeded but no movie data – use fallback
          setMovie({
            id: selectedMovie,
            title: `Phim #${selectedMovie}`,
            poster: "",
          });
        }
      } catch (error) {
        console.error("Failed to fetch movie:", error);
        // Use fallback so page is not stuck
        setMovie({
          id: selectedMovie,
          title: `Phim #${selectedMovie}`,
          poster: "",
        });
      } finally {
        setLoadingMovie(false);
      }
    };
    fetchMovie();
  }, [selectedMovie]);

  const { user } = useAuth();

  // Fetch active promotions, user vouchers, and membership tier
  useEffect(() => {
    const fetchPromosAndVouchers = async () => {
      try {
        const promoRes = await apiCall<{
          data?: { promotions?: PromotionItem[] };
          promotions?: PromotionItem[];
        }>(API_ENDPOINTS.PROMOTIONS_ACTIVE);
        const promos = promoRes?.data?.promotions || promoRes?.promotions || [];
        setActivePromos(promos);
      } catch {
        /* ignore */
      }

      if (user?.id) {
        try {
          // Fetch ALL vouchers (including expired, used) to show but disable ineligible ones
          const vRes = await apiCall<{
            data?: { vouchers?: VoucherItem[] };
            vouchers?: VoucherItem[];
          }>(`${API_ENDPOINTS.USER_VOUCHERS(parseInt(user.id))}?status=all`);
          const vouchers = vRes?.data?.vouchers || vRes?.vouchers || [];

          // Helper function to parse date string (YYYY-MM-DD) to local date
          const parseLocalDate = (dateStr: string) => {
            const [year, month, day] = dateStr.split("-").map(Number);
            return new Date(year, month - 1, day);
          };

          // Sort vouchers: ACTIVE+valid dates first, then others
          const sortedVouchers = [...vouchers].sort((a, b) => {
            // Check status
            const aActive = a.status === "ACTIVE";
            const bActive = b.status === "ACTIVE";

            // Check date validity for ACTIVE vouchers
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const aValidDate =
              aActive && a.start_date && a.end_date
                ? today >= parseLocalDate(a.start_date) &&
                  today <= parseLocalDate(a.end_date)
                : false;

            const bValidDate =
              bActive && b.start_date && b.end_date
                ? today >= parseLocalDate(b.start_date) &&
                  today <= parseLocalDate(b.end_date)
                : false;

            // ACTIVE + valid dates first
            if (aValidDate && !bValidDate) return -1;
            if (!aValidDate && bValidDate) return 1;

            // Then ACTIVE but expired
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;

            return 0;
          });

          setUserVouchers(sortedVouchers);
        } catch {
          /* ignore */
        }

        try {
          const tierRes = await apiCall<{ data?: { tier?: TierInfo } }>(
            API_ENDPOINTS.MEMBERSHIP_USER_TIER(parseInt(user.id)),
          );
          if (tierRes?.data?.tier) setUserTier(tierRes.data.tier);
        } catch {
          /* ignore */
        }
      }
    };
    fetchPromosAndVouchers();
  }, [user?.id]);

  const ticketTotal = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
  const concessionTotal = concessions.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const subtotal = ticketTotal + concessionTotal;
  const membershipDiscountRate = userTier
    ? parseFloat(userTier.discount_rate || "0")
    : 0;
  const membershipDiscountAmount = Math.round(
    subtotal * (membershipDiscountRate / 100),
  );
  const grandTotal = subtotal - discount - membershipDiscountAmount;
  const seatCodes = selectedSeats.map((s) => `${s.row}${s.number}`);

  const resetPaymentSession = () => {
    setShowQRModal(false);
    setMomoQrImageUrl(null);
    setPaymentUrl(null);
    setCurrentBookingId(null);
    setCurrentBookingCode(null);
    setQRTimeLeft(300);
    setIsVnpayMode(false);
    setIsVisaMode(false);
    paymentHandledRef.current = false;
    timeoutHandledRef.current = false;
    resumeHoldTimer();
  };

  const cancelPaymentSession = async (title: string, description: string) => {
    if (isCancellingPayment) {
      return;
    }

    setIsCancellingPayment(true);
    try {
      // Cancel the booking on server
      if (currentBookingId) {
        try {
          await BookingService.cancel(String(currentBookingId));
        } catch {
          // Ignore cancel errors: hold will still expire server-side.
        }
      }

      // Release held seats on server
      if (selectedShowtime) {
        try {
          const token =
            localStorage.getItem("token") || sessionStorage.getItem("token");
          if (token) {
            await fetch(
              API_ENDPOINTS.SHOWTIME_RELEASE_SEATS(
                parseInt(selectedShowtime.id),
              ),
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
              },
            );
          }
        } catch {
          // Ignore release errors
        }
      }

      // Reset modal state
      setShowQRModal(false);
      setMomoQrImageUrl(null);
      setPaymentUrl(null);
      setCurrentBookingId(null);
      setCurrentBookingCode(null);
      setQRTimeLeft(300);
      setIsVnpayMode(false);
      setIsVisaMode(false);
      paymentHandledRef.current = false;
      timeoutHandledRef.current = false;

      // Full reset: clear all booking state (seats, timer, concessions)
      clearBooking();

      toast({
        title,
        description,
        variant: "destructive",
      });

      // Navigate back to seat selection
      setTimeout(() => navigate("/booking/seats"), 150);
    } finally {
      setIsCancellingPayment(false);
    }
  };

  // QR Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showQRModal && qrTimeLeft > 0) {
      timer = setInterval(() => {
        setQRTimeLeft((prev) => Math.max(prev - 1, 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showQRModal, qrTimeLeft]);

  useEffect(() => {
    if (!showQRModal || qrTimeLeft > 0 || timeoutHandledRef.current) {
      return;
    }

    timeoutHandledRef.current = true;

    const releaseHoldOnTimeout = async () => {
      await cancelPaymentSession(
        "Thanh toán thất bại",
        "Đã hết 5 phút thanh toán. Ghế đã được giải phóng. Vui lòng chọn lại.",
      );
    };

    void releaseHoldOnTimeout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQRModal, qrTimeLeft, currentBookingId, toast]);

  // Guard against accidental leave while waiting for payment confirmation.
  /**
   * Hoàn tất thanh toán và chuyển tới trang thành công.
   * Dùng chung cho cổng thanh toán online (VNPay/MoMo/Visa) và tiền mặt.
   *
   * `bookingId` được truyền tường minh vì khi gọi ngay sau khi tạo booking,
   * state `currentBookingId` trong closure có thể còn null (stale closure).
   */
  const completeFromGateway = useCallback(async (bookingIdArg?: number | null) => {
    const bookingId = bookingIdArg ?? currentBookingId;
    if (!bookingId) {
      return;
    }
    if (paymentHandledRef.current) {
      return;
    }
    paymentHandledRef.current = true;

    toast({
      title: "Thanh toán thành công",
      description: "Đã nhận xác nhận thanh toán từ cổng thanh toán.",
    });

    let ticketCodes: string[] = [];
    let resolvedBookingCode: string | null = currentBookingCode;
    try {
      const ticketRes = await TicketService.getByBooking(String(bookingId));
      const rawTickets = Array.isArray(ticketRes?.data) ? ticketRes.data : [];
      ticketCodes = rawTickets
        .map(
          (ticket: TicketData) =>
            ticket?.ticket_code || ticket?.ticketCode || null,
        )
        .filter((code: string | null): code is string => Boolean(code));
    } catch {
      // Non-blocking: success page can still show booking info without ticket list.
    }

    if (!resolvedBookingCode) {
      try {
        const bookingRes = await BookingService.getById(String(bookingId));
        const bd = bookingRes?.data as unknown as BookingData;
        resolvedBookingCode = bd?.booking_code || bd?.bookingCode || null;
      } catch {
        // Ignore booking code fetch errors; we still have fallback ticket code.
      }
    }

    setShowQRModal(false);
    navigate("/booking/success", {
      state: {
        bookingId,
        bookingCode: resolvedBookingCode,
        ticketCode: resolvedBookingCode || ticketCodes[0] || null,
        ticketCodes,
        movie,
        seats: selectedSeats,
        concessions: (concessions || []).filter(
          (c: any) => (c.quantity || 0) > 0,
        ),
        total: grandTotal,
        discount: discount + membershipDiscountAmount,
        promoCode: discount > 0 ? promoCode : null,
        showtime: selectedShowtime,
      },
    });
    clearBooking();
    setCurrentBookingId(null);
    setShowCancelPaymentConfirm(false);
  }, [
    currentBookingId,
    currentBookingCode,
    toast,
    navigate,
    movie,
    selectedSeats,
    concessions,
    grandTotal,
    discount,
    membershipDiscountAmount,
    promoCode,
    selectedShowtime,
    clearBooking,
  ]);

  useEffect(() => {
    if (!showQRModal || !currentBookingId || paymentHandledRef.current) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (paymentHandledRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    const handlePopState = () => {
      if (paymentHandledRef.current) {
        return;
      }

      setShowCancelPaymentConfirm(true);
      window.history.pushState(
        { paymentGuard: true },
        "",
        window.location.href,
      );
    };

    // Insert a guarded history entry so browser Back triggers confirmation first.
    window.history.pushState({ paymentGuard: true }, "", window.location.href);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [showQRModal, currentBookingId]);

  useEffect(() => {
    if (!showQRModal || !currentBookingId || paymentHandledRef.current) {
      return;
    }

    const handlePaymentFailed = (msg?: string) => {
      if (paymentHandledRef.current) return;
      paymentHandledRef.current = true;
      setShowQRModal(false);
      setIsProcessing(false);
      setShowCancelPaymentConfirm(false);
      setCurrentBookingId(null);
      toast({
        title: "Thanh toán không thành công",
        description:
          msg ||
          "Giao dịch qua cổng thanh toán đã bị từ chối hoặc thất bại. Tồn kho và ưu đãi đã được hoàn trả, bạn có thể thử lại.",
        variant: "destructive",
      });
    };

    const pusher = getPusherClient();
    const channelName = `booking.${currentBookingId}`;
    const channel = pusher?.subscribe(channelName);
    const onPaymentUpdated = (payload: { status?: string }) => {
      const status = (payload?.status || "").toLowerCase();
      if (status === "success") {
        void completeFromGateway();
      } else if (status === "failed") {
        handlePaymentFailed("Giao dịch MoMo bị từ chối hoặc thất bại.");
      }
    };
    channel?.bind("payment-status-updated", onPaymentUpdated);

    const pollTimer = setInterval(async () => {
      if (paymentHandledRef.current || !currentBookingId) {
        return;
      }
      try {
        const tx = await TransactionService.getTransactionDetails(
          String(currentBookingId),
        );
        const txStatus = (tx?.data?.status || "").toLowerCase();
        if (txStatus === "success") {
          void completeFromGateway();
        } else if (txStatus === "failed") {
          handlePaymentFailed("Giao dịch thanh toán không thành công.");
        }
      } catch {
        // Ignore intermittent network errors while waiting for callback.
      }
    }, 3000);

    return () => {
      clearInterval(pollTimer);
      if (channel) {
        channel.unbind("payment-status-updated", onPaymentUpdated);
      }
      if (pusher && channelName) {
        pusher.unsubscribe(channelName);
      }
    };
  }, [
    showQRModal,
    currentBookingId,
    currentBookingCode,
    completeFromGateway,
    toast,
    navigate,
    movie,
    selectedSeats,
    grandTotal,
    discount,
    membershipDiscountAmount,
    promoCode,
    selectedShowtime,
    clearBooking,
  ]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const buildQrImageUrl = (payUrl: string) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(payUrl)}`;

  const normalizeQrPayload = (value: string) => {
    const raw = value.trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  const toPositiveInt = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      const parsed = Number(value);
      return parsed > 0 ? parsed : null;
    }
    return null;
  };

  const createBooking = async (): Promise<number | null> => {
    const showTimeId = toPositiveInt(selectedShowtime?.id);
    const seatIds = selectedSeats
      .map((s) => toPositiveInt(s.id))
      .filter((id): id is number => id !== null);
    const concessionsData = concessions
      .map((c) => ({
        concession_id: toPositiveInt(c.id),
        quantity: c.quantity,
      }))
      .filter(
        (c) =>
          c.concession_id !== null &&
          typeof c.concession_id === "number" &&
          c.quantity > 0,
      );
    const userId = toPositiveInt(user?.id);
    const validationErrors: string[] = [];
    if (!userId) validationErrors.push("Bạn cần đăng nhập để thanh toán.");
    if (!showTimeId) validationErrors.push("Không tìm thấy suất chiếu hợp lệ.");
    if (seatIds.length === 0)
      validationErrors.push("Vui lòng chọn ít nhất 1 ghế.");

    if (validationErrors.length > 0) {
      toast({
        title: "Thông tin không hợp lệ",
        description: validationErrors.join(" "),
        variant: "destructive",
      });
      return null;
    }
    const bookingRequest = {
      user_id: userId,
      showtime_id: showTimeId,
      seat_ids: seatIds,
      concessions: concessionsData,
      user_voucher_id: appliedVoucherId || undefined,
    };

    try {
      const existingBooking = await BookingService.getBookingByUserAndShowtime(
        userId,
        showTimeId,
      );

      if (
        existingBooking.success &&
        existingBooking.data?.status === "Pending"
      ) {
        const existingBookingId = toPositiveInt(existingBooking.data.id);
        if (existingBookingId) {
          const updateResponse = await BookingService.updateBooking(
            existingBookingId,
            {
              seat_ids: seatIds,
              concessions: concessionsData,
              user_voucher_id: appliedVoucherId || undefined,
            },
          );

          if (!updateResponse.success) {
            toast({
              title: "Cập nhật đơn giữ ghế thất bại",
              description:
                updateResponse.message ||
                "Không thể cập nhật đơn giữ ghế hiện tại.",
              variant: "destructive",
            });
            return null;
          }

          return existingBookingId;
        }
      }

      const response = await BookingService.create(bookingRequest);
      const createdBookingId = toPositiveInt(
        (response.data as unknown as BookingData)?.booking_id,
      );
      if (!response.success || !createdBookingId) {
        toast({
          title: "Đặt vé thất bại",
          description: response.message || "Có lỗi xảy ra khi đặt vé.",
          variant: "destructive",
        });
        return null;
      }
      return createdBookingId;
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      const errErrors = err?.errors as Record<string, string> | undefined;
      const fieldErrors = errErrors
        ? Object.values(errErrors).filter(Boolean).join(" ")
        : "";
      const detail =
        fieldErrors ||
        (err?.message as string) ||
        "Có lỗi xảy ra khi xử lý đơn hàng.";

      console.error("Create booking failed", {
        statusCode: err?.statusCode,
        message: err?.message,
        errors: err?.errors,
        payload: bookingRequest,
      });

      toast({
        title: "Lỗi hệ thống",
        description: detail,
        variant: "destructive",
      });
      return null;
    }
  };

  const processPayment = async (method: PaymentMethod) => {
    setIsProcessing(true);
    let bookingId: number | null = currentBookingId;
    try {
      paymentHandledRef.current = false;

      if (!bookingId) {
        bookingId = await createBooking();
        if (!bookingId) {
          return;
        }
        // Save booking ID for retrying payment without creating duplicate holds.
        setCurrentBookingId(bookingId);

        try {
          const bookingRes = await BookingService.getById(String(bookingId));
          const bd = bookingRes?.data as unknown as BookingData;
          const resolvedBookingCode =
            bd?.booking_code || bd?.bookingCode || null;
          setCurrentBookingCode(resolvedBookingCode);
        } catch {
          setCurrentBookingCode(null);
        }
      }

      if (method === "momo") {
        const momoResponse = await TransactionService.momoPayment({
          booking_id: bookingId,
        });
        const qrCodeUrl = momoResponse?.data?.qr_code_url;
        const payUrl = momoResponse?.data?.pay_url;
        const qrPayload = qrCodeUrl || payUrl;
        if (!qrPayload) {
          await BookingService.cancel(String(bookingId));
          setCurrentBookingId(null);
          toast({
            title: "Không tạo được mã QR MoMo",
            description:
              "Giao dịch đã được hủy vì hệ thống không trả về dữ liệu QR.",
            variant: "destructive",
          });
          return;
        }
        setMomoQrImageUrl(buildQrImageUrl(normalizeQrPayload(qrPayload)));
        if (payUrl) setPaymentUrl(payUrl);
        setShowQRModal(true);
        pauseHoldTimer();
        setQRTimeLeft(300);
        timeoutHandledRef.current = false;
      } else if (method === "atm") {
        // VNPay: tạo transaction để lấy pay_url, mở popup VNPay và hiển thị màn hình chờ
        const vnpayResponse = await TransactionService.vnpayPayment({
          booking_id: bookingId,
        });
        const payUrl = vnpayResponse?.data?.pay_url;
        if (!payUrl) {
          await BookingService.cancel(String(bookingId));
          setCurrentBookingId(null);
          toast({
            title: "Không tạo được mã VNPay",
            description:
              "Giao dịch đã được hủy vì hệ thống không trả về liên kết thanh toán.",
            variant: "destructive",
          });
          return;
        }
        // Mở popup VNPay ngay lập tức, hiển thị màn hình chờ xác nhận
        setIsVnpayMode(true);
        setPaymentUrl(payUrl);
        setShowQRModal(true);
        pauseHoldTimer();
        setQRTimeLeft(300);
        timeoutHandledRef.current = false;
        // Tự động mở popup VNPay
        const popup = window.open(
          payUrl,
          "vnpay_popup",
          "width=600,height=700,scrollbars=yes,resizable=yes,left=" +
            Math.round((window.screen.width - 600) / 2) +
            ",top=" +
            Math.round((window.screen.height - 700) / 2),
        );
        if (popup) {
          vnpayPopupRef.current = popup;
        } else {
          // Popup bị block — thông báo user
          toast({
            title: "Vui lòng cho phép popup",
            description:
              "Trình duyệt đã chặn cửa sổ thanh toán. Nhấn 'Mở lại VNPay' để thử lại.",
          });
        }
      } else if (method === "visa") {
        // Visa nội địa qua VNPAY — mở popup và hiển thị màn hình chờ giống VNPay
        const visaResponse = await TransactionService.visaPayment({
          booking_id: bookingId,
        });
        const payUrl = visaResponse?.data?.pay_url;
        if (!payUrl) {
          await BookingService.cancel(String(bookingId));
          setCurrentBookingId(null);
          toast({
            title: "Không tạo được liên kết thanh toán Visa",
            description:
              "Giao dịch đã được hủy vì hệ thống không trả về liên kết thanh toán.",
            variant: "destructive",
          });
          return;
        }
        // Mở popup Visa ngay lập tức, hiển thị màn hình chờ xác nhận
        setIsVisaMode(true);
        setIsVnpayMode(false);
        setPaymentUrl(payUrl);
        setShowQRModal(true);
        pauseHoldTimer();
        setQRTimeLeft(300);
        timeoutHandledRef.current = false;
        // Tự động mở popup Visa
        const visaPopup = window.open(
          payUrl,
          "visa_popup",
          "width=600,height=700,scrollbars=yes,resizable=yes,left=" +
            Math.round((window.screen.width - 600) / 2) +
            ",top=" +
            Math.round((window.screen.height - 700) / 2),
        );
        if (visaPopup) {
          visaPopupRef.current = visaPopup;
        } else {
          toast({
            title: "Vui lòng cho phép popup",
            description:
              "Trình duyệt đã chặn cửa sổ thanh toán. Nhấn 'Mở lại cửa sổ thanh toán' để thử lại.",
          });
        }
      } else if (method === "cash") {
        // Thanh toán tiền mặt tại quầy — không cần cổng thanh toán online.
        // Giao dịch thành công ngay lập tức nên đi thẳng sang trang thành công.
        const cashResponse = await TransactionService.cashPayment({
          booking_id: bookingId,
        });

        if (!cashResponse?.success) {
          await BookingService.cancel(String(bookingId));
          setCurrentBookingId(null);
          toast({
            title: "Không thể thanh toán tiền mặt",
            description:
              cashResponse?.message ||
              "Hệ thống không ghi nhận được giao dịch. Vui lòng thử lại hoặc liên hệ quầy.",
            variant: "destructive",
          });
          return;
        }

        // Đóng mọi cửa sổ thanh toán đang mở (nếu user thử VNPay trước đó)
        if (vnpayPopupRef.current && !vnpayPopupRef.current.closed) {
          vnpayPopupRef.current.close();
        }
        if (visaPopupRef.current && !visaPopupRef.current.closed) {
          visaPopupRef.current.close();
        }

        setShowQRModal(false);
        setIsVnpayMode(false);
        setIsVisaMode(false);
        setMomoQrImageUrl(null);
        setPaymentUrl(null);
        pauseHoldTimer();

        toast({
          title: "Thanh toán tiền mặt thành công",
          description:
            "Vui lòng xuất vé tại quầy và mang theo mã đơn hàng để nhân viên đối chiếu.",
        });

        // Đi thẳng sang trang thành công — dùng lại logic hoàn tất của gateway
        await completeFromGateway(bookingId);
      }
    } catch (error) {
      if (bookingId) {
        try {
          await BookingService.cancel(String(bookingId));
        } catch {
          // Ignore cancellation error in client-side recovery.
        }
      }
      setCurrentBookingId(null);
      setShowQRModal(false);
      setMomoQrImageUrl(null);
      setPaymentUrl(null);
      toast({
        title: "Thanh toán thất bại",
        description: "Không thể khởi tạo giao dịch. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyPromo = async (codeOverride?: string) => {
    const codeToApply = (codeOverride || promoCode).trim();
    if (!codeToApply) {
      toast({ title: "Vui lòng nhập mã giảm giá", variant: "destructive" });
      return;
    }
    try {
      const res = await apiCall<VoucherApplyResponse>(
        API_ENDPOINTS.APPLY_VOUCHER,
        {
          method: "POST",
          body: JSON.stringify({
            code: codeToApply,
            user_id: user?.id ? parseInt(user.id) : undefined,
            amount: subtotal,
          }),
        },
      );
      if (res.success && res.data) {
        setDiscount(res.data.discount || 0);
        setAppliedVoucherId(res.data.voucher_id || null);
        setPromoCode(codeToApply);
        toast({
          title: "Áp dụng thành công!",
          description: `Giảm ${Number(res.data.discount).toLocaleString("vi-VN")}đ cho đơn hàng`,
        });
      } else {
        toast({
          title: "Mã không hợp lệ",
          description: res.message || "Vui lòng kiểm tra lại",
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      const msg =
        ((err as Record<string, unknown>)?.message as string) ||
        "Vui lòng kiểm tra lại mã giảm giá";
      toast({
        title: "Không thể áp dụng",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleSelectPromoCard = (code: string) => {
    setPromoCode(code);
    handleApplyPromo(code);
  };

  const isVoucherValid = (voucher: VoucherItem) => {
    // Check if voucher status is ACTIVE
    if (voucher.status && voucher.status !== "ACTIVE") {
      return false;
    }

    // Check if voucher is within valid date range
    // Parse date strings (YYYY-MM-DD) to avoid timezone issues
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [sYear, sMonth, sDay] = voucher.start_date.split("-").map(Number);
    const startDate = new Date(sYear, sMonth - 1, sDay);

    const [eYear, eMonth, eDay] = voucher.end_date.split("-").map(Number);
    const endDate = new Date(eYear, eMonth - 1, eDay);

    return today >= startDate && today <= endDate;
  };

  const isPromoEligible = (promo: PromotionItem | VoucherItem) => {
    const minOrder = Number(promo.min_order_value || 0);
    return subtotal >= minOrder;
  };

  if (!selectedMovie) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">
          Không tìm thấy thông tin phim. Vui lòng quay lại trang chủ.
        </p>
      </div>
    );
  }

  if (loadingMovie) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  const paymentMethods = [
    {
      value: "momo",
      label: "Ví Điện Tử MoMo",
      subLabel: "Quét mã QR qua ứng dụng MoMo thanh toán tức thì",
      icon: Smartphone,
      badge: "Phổ biến",
      color: "bg-[#a50064] text-white",
      ringColor: "ring-[#a50064]/20 border-[#a50064]",
    },
    {
      value: "atm",
      label: "Cổng Thanh Toán VNPAY",
      subLabel: "Quét mã VNPAY-QR hoặc thẻ ATM / Internet Banking hơn 40 ngân hàng",
      icon: Building2,
      badge: "VNPAY-QR",
      color: "bg-[#005baa] text-white",
      ringColor: "ring-[#005baa]/20 border-[#005baa]",
    },
    {
      value: "visa",
      label: "Thẻ Quốc Tế & Thẻ Nội Địa",
      subLabel: "Hỗ trợ thẻ tín dụng, ghi nợ Visa, MasterCard, JCB",
      icon: CreditCard,
      badge: null,
      color: "bg-purple-600 text-white",
      ringColor: "ring-purple-500/20 border-purple-500",
    },
    {
      value: "cash",
      label: "Thanh Toán Tiền Mặt",
      subLabel:
        "Thanh toán tại quầy vé — không cần cổng thanh toán online, xác nhận tức thì",
      icon: Banknote,
      badge: "Tại quầy",
      color: "bg-emerald-600 text-white",
      ringColor: "ring-emerald-500/20 border-emerald-500",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070a10] text-slate-900 dark:text-white selection:bg-sky-500 selection:text-white dark:selection:text-black relative overflow-x-hidden transition-colors duration-300">
      {/* Background Ambient Lighting Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[350px] bg-gradient-to-b from-sky-500/10 via-purple-500/5 to-transparent blur-3xl opacity-60 dark:opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_20%,#f1f5f9_85%)] dark:bg-[radial-gradient(ellipse_at_top,transparent_20%,#05070c_80%)]" />
      </div>

      <Header />

      <main className="flex-1 container max-w-7xl mx-auto px-3 sm:px-6 py-4 relative z-10 flex flex-col">
        {/* Top Header Card: Stepper, Movie Summary & Hold Timer */}
        <div className="w-full mb-6 rounded-2xl bg-white/90 dark:bg-zinc-900/50 border border-slate-200/90 dark:border-white/10 backdrop-blur-xl p-4 sm:p-5 shadow-sm dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          {/* Booking Stepper */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 mb-4 pb-4 border-b border-slate-200/80 dark:border-white/5 text-xs sm:text-sm">
            {/* Step 1: Completed */}
            <button
              type="button"
              onClick={() => navigate("/booking/seats")}
              className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold hover:opacity-80 transition-opacity cursor-pointer"
              title="Nhấn để quay lại sơ đồ chọn ghế"
            >
              <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-black shadow-sm">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
              <span>1. Chọn Ghế</span>
            </button>

            <span className="w-8 sm:w-16 h-[2px] bg-emerald-500" />

            {/* Step 2: Completed */}
            <button
              type="button"
              onClick={() => navigate("/booking/concessions")}
              className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold hover:opacity-80 transition-opacity cursor-pointer"
              title="Nhấn để quay lại chọn bắp nước"
            >
              <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-black shadow-sm">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
              <span>2. Bắp Nước</span>
            </button>

            <span className="w-8 sm:w-16 h-[2px] bg-gradient-to-r from-emerald-500 to-sky-500" />

            {/* Step 3: Active */}
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold">
              <span className="w-6 h-6 rounded-full bg-sky-500 text-white dark:text-black flex items-center justify-center text-xs font-black shadow-[0_0_12px_rgba(56,189,248,0.7)] animate-pulse">
                3
              </span>
              <span>3. Thanh Toán</span>
            </div>
          </div>

          {/* Movie Details & Countdown Hold Timer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate("/booking/concessions")}
                className="shrink-0 h-10 w-10 rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10"
                title="Quay lại chọn bắp nước"
              >
                <ArrowLeft className="w-4 h-4 text-slate-700 dark:text-white" />
              </Button>

              <div className="relative group shrink-0">
                <img
                  src={
                    movie?.poster ||
                    "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&h=450&fit=crop"
                  }
                  alt={movie?.title || "Phim"}
                  className="w-12 h-16 sm:w-14 sm:h-20 object-cover rounded-xl shadow-md border border-slate-200 dark:border-white/15 transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-tr from-sky-500/20 to-purple-500/20 blur -z-10 opacity-70" />
              </div>

              <div>
                <h1 className="font-extrabold text-base sm:text-xl tracking-tight text-slate-900 dark:text-white drop-shadow-sm break-words whitespace-normal leading-snug">
                  {movie?.title || "Đang tải thông tin phim..."}
                </h1>

                <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 dark:text-zinc-400 mt-1.5 flex-wrap">
                  {selectedShowtime?.time && (
                    <span className="text-sky-600 dark:text-sky-400 font-bold text-sm bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800/40 font-mono">
                      {selectedShowtime.time}
                    </span>
                  )}
                  {selectedShowtime?.date && (
                    <>
                      <span>•</span>
                      <span className="text-slate-700 dark:text-zinc-300">
                        {new Date(selectedShowtime.date).toLocaleDateString("vi-VN", {
                          weekday: "long",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                    </>
                  )}
                  {(selectedShowtime?.hall || (selectedShowtime as unknown as { hall_name?: string })?.hall_name) && (
                    <>
                      <span>•</span>
                      <span className="text-slate-800 dark:text-zinc-200 font-semibold">
                        {selectedShowtime.hall || (selectedShowtime as unknown as { hall_name?: string })?.hall_name}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span className="font-mono font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-500/20">
                    {selectedSeats.length} ghế: {seatCodes.join(", ")}
                  </span>
                </div>
              </div>
            </div>

            {/* Countdown Hold Timer */}
            {holdTimerActive && !showQRModal && (
              <div
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2 rounded-xl font-mono text-sm font-bold border shrink-0 transition-all shadow-md",
                  holdTimeLeft <= 60
                    ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-400 dark:border-red-500/40 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                    : "bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-500/30 shadow-[0_0_20px_rgba(14,165,233,0.15)]",
                )}
              >
                <Clock className="w-4 h-4 animate-spin text-sky-600 dark:text-sky-400" style={{ animationDuration: "8s" }} />
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider block leading-none mb-0.5 font-sans font-medium">
                    Thời gian giữ ghế
                  </span>
                  <span className="text-base tracking-wider">{formatHoldTime(holdTimeLeft)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr,380px] gap-6 items-start pb-8">
          {/* Left Column: Payment Methods, Promo Code & Vouchers */}
          <div className="space-y-6">
            {/* Payment Methods Card */}
            <div className="rounded-2xl bg-white/95 dark:bg-zinc-900/70 border border-slate-200/90 dark:border-white/10 p-5 sm:p-6 shadow-sm backdrop-blur-md">
              <h2 className="font-extrabold text-base sm:text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
                <CreditCard className="w-5 h-5 text-sky-500" />
                <span>Phương Thức Thanh Toán</span>
              </h2>

              <RadioGroup
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                className="space-y-3"
              >
                {paymentMethods.map((method) => {
                  const isSelected = paymentMethod === method.value;
                  return (
                    <div
                      key={method.value}
                      onClick={() => setPaymentMethod(method.value as PaymentMethod)}
                      className={cn(
                        "group relative flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200",
                        isSelected
                          ? `bg-sky-50/60 dark:bg-sky-950/20 border-sky-500 shadow-md ring-2 ring-sky-500/20`
                          : "bg-white/70 dark:bg-zinc-800/40 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20",
                      )}
                    >
                      <RadioGroupItem value={method.value} id={method.value} className="shrink-0" />
                      <div
                        className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                          method.color,
                        )}
                      >
                        <method.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Label
                            htmlFor={method.value}
                            className="cursor-pointer font-bold text-sm sm:text-base text-slate-900 dark:text-white"
                          >
                            {method.label}
                          </Label>
                          {method.badge && (
                            <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30 text-[10px] font-black uppercase px-2 py-0.2">
                              {method.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 break-words whitespace-normal leading-relaxed">
                          {method.subLabel}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>

            {/* Promo Code Card */}
            <div className="rounded-2xl bg-white/95 dark:bg-zinc-900/70 border border-slate-200/90 dark:border-white/10 p-5 sm:p-6 shadow-sm backdrop-blur-md">
              <h2 className="font-extrabold text-base sm:text-lg mb-3 flex items-center gap-2 text-slate-900 dark:text-white">
                <Tag className="w-5 h-5 text-sky-500" />
                <span>Mã Giảm Giá</span>
              </h2>
              <div className="flex gap-2 sm:gap-3">
                <Input
                  placeholder="Nhập mã ưu đãi / voucher của bạn"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                  className="flex-1 h-11 rounded-xl border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-zinc-800/50 font-mono text-sm"
                />
                <Button
                  onClick={() => handleApplyPromo()}
                  className="h-11 px-6 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm shadow-sm"
                >
                  Áp dụng
                </Button>
              </div>
              {discount > 0 && (
                <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40">
                  <BadgeCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-sm text-emerald-800 dark:text-emerald-300 font-semibold break-words">
                    Đã áp dụng mã <span className="font-mono font-bold">{promoCode}</span> — Giảm{" "}
                    {discount.toLocaleString("vi-VN")}đ
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscount(0);
                      setPromoCode("");
                      setAppliedVoucherId(null);
                    }}
                    className="ml-auto p-1 text-emerald-700 hover:text-red-500 cursor-pointer"
                    title="Gỡ bỏ mã"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Available Promotions & Vouchers */}
            {(activePromos.length > 0 || userVouchers.length > 0) && (
              <div className="rounded-2xl bg-white/95 dark:bg-zinc-900/70 border border-slate-200/90 dark:border-white/10 p-5 sm:p-6 shadow-sm backdrop-blur-md">
                <h2 className="font-extrabold text-base sm:text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
                  <Ticket className="w-5 h-5 text-sky-500" />
                  <span>Khuyến Mãi & Voucher Của Bạn</span>
                </h2>
                <div className="space-y-3">
                  {/* User vouchers */}
                  {userVouchers.map((v) => {
                    const isUsed = v.status === "USED";
                    const isValid = isVoucherValid(v);
                    const meetsMinOrder = isPromoEligible(v);

                    const hasLimit = v.usage_limit && v.usage_limit > 0;
                    const remaining = hasLimit
                      ? Math.max(0, v.usage_limit - (v.used_count || 0))
                      : Infinity;
                    const isOutOfStock = hasLimit && remaining <= 0;

                    const eligible =
                      !isUsed && isValid && meetsMinOrder && !isOutOfStock;
                    const isApplied = appliedVoucherId
                      ? appliedVoucherId === Number(v.id)
                      : promoCode && promoCode === (v.code || v.promo_code);

                    let statusLabel = "";
                    if (isUsed) statusLabel = "Đã sử dụng";
                    else if (isOutOfStock) statusLabel = "Hết lượt";
                    else if (v.status === "EXPIRED" || !isValid)
                      statusLabel = "Hết hạn";
                    else if (!meetsMinOrder) statusLabel = "Chưa đủ điều kiện";

                    return (
                      <div
                        key={`uv-${v.id}`}
                        onClick={() =>
                          eligible &&
                          !isApplied &&
                          handleSelectPromoCard(v.code || v.promo_code)
                        }
                        style={{ pointerEvents: eligible ? "auto" : "none" }}
                        className={cn(
                          "relative flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200",
                          isApplied
                            ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-sm ring-1 ring-emerald-500/30"
                            : eligible
                              ? "border-slate-200 dark:border-white/10 hover:border-sky-400/60 dark:hover:border-sky-500/40 bg-white/70 dark:bg-zinc-800/40 cursor-pointer shadow-sm"
                              : "border-slate-200/60 dark:border-white/5 opacity-50 cursor-not-allowed bg-slate-100/50 dark:bg-zinc-800/20",
                        )}
                      >
                        <div
                          className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                            eligible ? "bg-gradient-to-tr from-amber-500 to-orange-500 text-white" : "bg-slate-300 dark:bg-zinc-700 text-slate-500",
                          )}
                        >
                          <Ticket className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                              {v.code || v.promo_code}
                            </span>
                            <Badge variant="outline" className="text-[11px] font-semibold">
                              Voucher
                            </Badge>
                            {isApplied && (
                              <BadgeCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            )}
                            {statusLabel && !isApplied && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              >
                                {statusLabel}
                              </Badge>
                            )}
                          </div>
                          {v.description && (
                            <p className="text-xs text-slate-500 dark:text-zinc-400 break-words whitespace-normal leading-relaxed mt-1">
                              {v.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="text-sm font-bold text-sky-600 dark:text-sky-400">
                              {v.discount_type === "PERCENT"
                                ? `Giảm ${v.discount_amount}%`
                                : `Giảm ${Number(v.discount_amount).toLocaleString("vi-VN")}đ`}
                            </span>
                            {Number(v.min_order_value) > 0 && (
                              <span className="text-xs text-slate-400 dark:text-zinc-500">
                                Đơn tối thiểu{" "}
                                {Number(v.min_order_value).toLocaleString("vi-VN")}đ
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Public active promotions */}
                  {activePromos
                    .filter((p) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const [sYear, sMonth, sDay] = p.start_date
                        .split("-")
                        .map(Number);
                      const startDate = new Date(sYear, sMonth - 1, sDay);
                      const [eYear, eMonth, eDay] = p.end_date
                        .split("-")
                        .map(Number);
                      const endDate = new Date(eYear, eMonth - 1, eDay);
                      return today >= startDate && today <= endDate;
                    })
                    .filter(
                      (p) =>
                        !userVouchers.some(
                          (v) =>
                            v.promotion_id === p.id || v.promo_code === p.code,
                        ),
                    )
                    .filter(
                      (p) =>
                        !p.is_auto_apply &&
                        !/^(REWARD_20K|REWARD_50K|TIER_|BIRTHDAY)/.test(p.code),
                    )
                    .map((p) => {
                      const hasLimit = p.usage_limit && p.usage_limit > 0;
                      const remaining = hasLimit
                        ? Math.max(0, p.usage_limit - (p.used_count || 0))
                        : Infinity;
                      const isOutOfStock = hasLimit && remaining <= 0;

                      const eligible = isPromoEligible(p) && !isOutOfStock;
                      const isApplied =
                        promoCode === p.code && !appliedVoucherId;
                      return (
                        <div
                          key={`promo-${p.id}`}
                          onClick={() =>
                            eligible &&
                            !isApplied &&
                            handleSelectPromoCard(p.code)
                          }
                          className={cn(
                            "relative flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200",
                            isApplied
                              ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-sm ring-1 ring-emerald-500/30"
                              : eligible
                                ? "border-slate-200 dark:border-white/10 hover:border-sky-400/60 dark:hover:border-sky-500/40 bg-white/70 dark:bg-zinc-800/40 cursor-pointer shadow-sm"
                                : "border-slate-200/60 dark:border-white/5 opacity-50 cursor-not-allowed bg-slate-100/50 dark:bg-zinc-800/20",
                          )}
                        >
                          <div
                            className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                              eligible ? "bg-gradient-to-tr from-sky-500 to-blue-600 text-white" : "bg-slate-300 dark:bg-zinc-700 text-slate-500",
                            )}
                          >
                            <Percent className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                                {p.code}
                              </span>
                              <Badge variant="secondary" className="text-[11px] font-semibold">
                                Khuyến mãi
                              </Badge>
                              {isApplied && (
                                <BadgeCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              )}
                            </div>
                            {p.description && (
                              <p className="text-xs text-slate-500 dark:text-zinc-400 break-words whitespace-normal leading-relaxed mt-1">
                                {p.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              <span className="text-sm font-bold text-sky-600 dark:text-sky-400">
                                {p.discount_type === "PERCENT"
                                  ? `Giảm ${p.discount_amount}%`
                                  : `Giảm ${Number(p.discount_amount).toLocaleString("vi-VN")}đ`}
                              </span>
                              {Number(p.min_order_value) > 0 && (
                                <span className="text-xs text-slate-400 dark:text-zinc-500">
                                  Đơn tối thiểu{" "}
                                  {Number(p.min_order_value).toLocaleString("vi-VN")}đ
                                </span>
                              )}
                            </div>
                          </div>
                          {!eligible && (
                            <span className="text-xs text-red-500 font-medium shrink-0">
                              Chưa đủ điều kiện
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Order Summary Sidebar */}
          <div className="sticky top-20 rounded-2xl bg-white/95 dark:bg-zinc-900/80 border border-slate-200/90 dark:border-white/10 backdrop-blur-2xl p-5 shadow-xl space-y-4 h-fit">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-sky-500" />
                <span>Chi Tiết Đơn Hàng</span>
              </h2>
            </div>

            {/* Movie Info */}
            <div className="flex gap-3.5 pb-4 border-b border-slate-200/80 dark:border-white/10">
              <img
                src={
                  movie?.poster ||
                  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&h=450&fit=crop"
                }
                alt={movie?.title || "Phim"}
                className="w-14 h-20 object-cover rounded-xl shrink-0 border border-slate-200 dark:border-white/10 shadow-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white break-words whitespace-normal leading-snug">
                  {movie?.title || "Phim đã chọn"}
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {selectedShowtime?.hall ||
                    (selectedShowtime as unknown as { hall_name?: string })?.hall_name ||
                    "Rạp"}{" "}
                  • {selectedShowtime?.time}
                </p>
                <p className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400 mt-1 break-words">
                  Ghế: {seatCodes.join(", ")}
                </p>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="space-y-2.5 text-xs sm:text-sm">
              <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                <span>Vé xem phim ({selectedSeats.length} ghế)</span>
                <span className="font-mono font-bold text-slate-900 dark:text-zinc-200">
                  {ticketTotal.toLocaleString("vi-VN")}đ
                </span>
              </div>

              {concessionTotal > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
                  <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                    <span>Combo & Bắp nước</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-zinc-200">
                      {concessionTotal.toLocaleString("vi-VN")}đ
                    </span>
                  </div>
                  {/* Detailed list of concessions if selected */}
                  <div className="pl-2 space-y-1 text-xs text-slate-500 dark:text-zinc-400">
                    {concessions
                      .filter((c) => c.quantity > 0)
                      .map((c) => (
                        <div key={c.id} className="flex justify-between items-center">
                          <span className="break-words max-w-[200px] leading-tight">
                            • {c.nameVi || c.name} x{c.quantity}
                          </span>
                          <span className="font-mono">
                            {(c.price * c.quantity).toLocaleString("vi-VN")}đ
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {discount > 0 && (
                <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-medium pt-1">
                  <span>Giảm giá ({promoCode})</span>
                  <span className="font-mono font-bold">-{discount.toLocaleString("vi-VN")}đ</span>
                </div>
              )}

              {userTier && membershipDiscountAmount > 0 && (
                <div className="flex justify-between items-center text-sky-600 dark:text-sky-400 font-medium">
                  <span>
                    Ưu đãi thành viên {userTier.rank_name} ({userTier.discount_rate}%)
                  </span>
                  <span className="font-mono font-bold">
                    -{membershipDiscountAmount.toLocaleString("vi-VN")}đ
                  </span>
                </div>
              )}
            </div>

            {/* Total */}
            <div className="border-t border-slate-200 dark:border-white/10 pt-4">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                  Tổng thanh toán
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold font-mono text-sky-600 dark:text-sky-400 drop-shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                  {grandTotal.toLocaleString("vi-VN")}đ
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 text-right">
                Đã bao gồm thuế GTGT
              </p>
            </div>

            <Button
              onClick={() => processPayment(paymentMethod)}
              disabled={isProcessing}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-sm sm:text-base shadow-[0_4px_20px_rgba(14,165,233,0.4)] hover:shadow-[0_6px_25px_rgba(14,165,233,0.6)] transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>
                    {paymentMethod === "cash"
                      ? "Đang xác nhận thanh toán tiền mặt..."
                      : "Đang kết nối cổng thanh toán..."}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {paymentMethod === "cash"
                      ? "Xác Nhận Thanh Toán Tiền Mặt"
                      : "Tiến Hành Thanh Toán"}
                  </span>
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-500 pt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Giao dịch bảo mật 100% qua cổng thanh toán</span>
            </div>
          </div>
        </div>
      </main>

      {/* QR Payment Modal */}
      <Dialog
        open={showQRModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowCancelPaymentConfirm(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {isVnpayMode
                  ? "Chờ Xác Nhận Thanh Toán VNPay"
                  : isVisaMode
                    ? "Chờ Xác Nhận Thanh Toán Visa"
                    : "Quét Mã QR Để Thanh Toán"}
              </DialogTitle>
              <div
                className={cn(
                  "flex items-center gap-1 px-3 py-1 rounded-full font-mono text-sm font-bold",
                  qrTimeLeft <= 60
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
                )}
              >
                <Clock className="w-4 h-4" />
                {formatTime(qrTimeLeft)}
              </div>
            </div>
            <DialogDescription>
              {isVnpayMode
                ? "Cửa sổ thanh toán VNPay đã được mở. Vui lòng hoàn tất thanh toán trong cửa sổ đó."
                : isVisaMode
                  ? "Cửa sổ thanh toán Visa đã được mở. Vui lòng chọn ngân hàng và hoàn tất thanh toán."
                  : "Mở ứng dụng MoMo và quét mã bên dưới"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-6">
            {isVnpayMode || isVisaMode ? (
              /* VNPay / Visa waiting screen */
              <div className="flex flex-col items-center gap-5 py-4">
                <div className="relative w-24 h-24">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    {isVisaMode ? (
                      <CreditCard className="w-10 h-10 text-primary" />
                    ) : (
                      <Building2 className="w-10 h-10 text-primary" />
                    )}
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-base font-semibold">
                    {isVisaMode
                      ? "Đang chờ xác nhận thanh toán Visa..."
                      : "Đang chờ xác nhận từ VNPay..."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isVisaMode
                      ? "Chọn ngân hàng và hoàn tất thanh toán trong cửa sổ đã mở"
                      : "Hoàn tất thanh toán trong cửa sổ VNPay đã mở"}
                  </p>
                </div>
                {paymentUrl && (
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-10",
                      isVisaMode
                        ? "border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                        : "border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20",
                    )}
                    onClick={() => {
                      if (isVisaMode) {
                        if (
                          visaPopupRef.current &&
                          !visaPopupRef.current.closed
                        ) {
                          visaPopupRef.current.focus();
                        } else {
                          const popup = window.open(
                            paymentUrl,
                            "visa_popup",
                            "width=600,height=700,scrollbars=yes,resizable=yes,left=" +
                              Math.round((window.screen.width - 600) / 2) +
                              ",top=" +
                              Math.round((window.screen.height - 700) / 2),
                          );
                          if (popup) visaPopupRef.current = popup;
                          else
                            window.open(
                              paymentUrl,
                              "_blank",
                              "noopener,noreferrer",
                            );
                        }
                      } else {
                        if (
                          vnpayPopupRef.current &&
                          !vnpayPopupRef.current.closed
                        ) {
                          vnpayPopupRef.current.focus();
                        } else {
                          const popup = window.open(
                            paymentUrl,
                            "vnpay_popup",
                            "width=600,height=700,scrollbars=yes,resizable=yes,left=" +
                              Math.round((window.screen.width - 600) / 2) +
                              ",top=" +
                              Math.round((window.screen.height - 700) / 2),
                          );
                          if (popup) vnpayPopupRef.current = popup;
                          else
                            window.open(
                              paymentUrl,
                              "_blank",
                              "noopener,noreferrer",
                            );
                        }
                      }
                    }}
                  >
                    {isVisaMode
                      ? "Mở lại cửa sổ thanh toán Visa"
                      : "Mở lại cửa sổ VNPay"}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Hệ thống tự động xác nhận sau khi cổng thanh toán phản hồi.
                </p>
              </div>
            ) : (
              /* MoMo QR screen */
              <>
                <div className="w-48 h-48 bg-white rounded-xl p-4 shadow-lg mb-4">
                  {momoQrImageUrl ? (
                    <img
                      src={momoQrImageUrl}
                      alt="MoMo QR"
                      className="w-full h-full object-contain rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-900 to-gray-700 rounded-lg flex items-center justify-center">
                      <QrCode className="w-24 h-24 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-lg font-bold text-primary">
                  {grandTotal.toLocaleString("vi-VN")}đ
                </p>
                <p className="text-sm text-muted-foreground">
                  Galaxy Cinema - {movie?.title}
                </p>
              </>
            )}
          </div>

          <div className="border-t border-border pt-4 flex flex-col gap-3">
            {/* Single switch payment method button */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-sm text-muted-foreground border border-border hover:bg-muted/50"
              onClick={() => {
                // Chỉ đóng modal và reset trạng thái UI — KHÔNG hủy booking.
                // Ghế vẫn được giữ, currentBookingId vẫn còn để tái sử dụng
                // khi user chọn phương thức khác và nhấn "Tiến hành thanh toán".
                setShowQRModal(false);
                setMomoQrImageUrl(null);
                setPaymentUrl(null);
                setIsVnpayMode(false);
                setIsVisaMode(false);
                paymentHandledRef.current = false;
                timeoutHandledRef.current = false;
                // Giữ nguyên: currentBookingId, currentBookingCode, qrTimeLeft
                // Resume hold timer so countdown continues
                resumeHoldTimer();
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Chọn phương thức thanh toán khác
            </Button>
            {!isVnpayMode && !isVisaMode && (
              <p className="text-xs text-muted-foreground text-center">
                Hệ thống sẽ tự động cập nhật khi MoMo xác nhận thanh toán.
              </p>
            )}
            <Button
              variant="outline"
              className="w-full text-muted-foreground"
              onClick={() => setShowCancelPaymentConfirm(true)}
            >
              Huỷ giao dịch
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showCancelPaymentConfirm}
        onOpenChange={setShowCancelPaymentConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn xác nhận huỷ giao dịch chứ?</AlertDialogTitle>
            <AlertDialogDescription>
              Nếu đồng ý, giao dịch sẽ bị hủy, ghế của bạn sẽ được giải phóng và
              bạn sẽ quay lại trang chọn ghế.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancellingPayment}>
              Không
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isCancellingPayment}
              onClick={async () => {
                setShowCancelPaymentConfirm(false);
                await cancelPaymentSession(
                  "Đã huỷ giao dịch",
                  "Bạn đã hủy giao dịch. Ghế đã được giải phóng.",
                );
              }}
            >
              {isCancellingPayment ? "Đang xử lý..." : "Đồng ý"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PaymentPage;
