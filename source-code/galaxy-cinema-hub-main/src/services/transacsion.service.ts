import {
    apiClient,
    ApiResponse,
} from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";

export interface TransactionDetailResponse {
    id: string;
    booking_code: string;
    user_id: number;
    showtime_id: number;
    status: "Pending" | "Paid" | "Cancelled" | "Refunded";
    total_price: number;
    created_at: string;

    // Showtime details
    movie_id: number;
    movie_title: string;
    movie_poster?: string;
    movie_duration: number;
    movie_age_rating?: string;
    showtime_date: string;
    showtime_start_time: string;
    cinema_name: string;
    hall_name: string;

    // Seats
    seats: Array<{
        id: number;
        seat_code: string;
        row_number: string;
        seat_number: number;
        seat_type: string;
        price: number;
    }>;

    // Concessions (optional)
    concessions?: Array<{
        id: number;
        name: string;
        quantity: number;
        price: number;
        subtotal: number;
    }>;

    // Payment info
    payment_method?: string;
    payment_status?: string;
}

export interface PaymentRequest {
    booking_id: number;
}

export class TransactionService {
    static async getTransactionDetails(bookingId: string): Promise<ApiResponse<TransactionDetailResponse>> {
        return apiClient.get<TransactionDetailResponse>(API_ENDPOINTS.TRANSACTIONS.BY_BOOKING(bookingId));
    }

    static async vnpayPayment(data: PaymentRequest): Promise<ApiResponse<{ pay_url: string }>> {
        return apiClient.post<{ pay_url: string }>(API_ENDPOINTS.TRANSACTIONS.VNPAY, data);
    }

    static async visaPayment(data: PaymentRequest): Promise<ApiResponse<{ pay_url: string }>> {
        return apiClient.post<{ pay_url: string }>(API_ENDPOINTS.TRANSACTIONS.VISA, data);
    }

    /**
     * Thanh toán tiền mặt tại quầy — không cần cổng thanh toán online.
     * Giao dịch thành công ngay và booking được confirm luôn.
     */
    static async cashPayment(
        data: PaymentRequest & { received_amount?: number }
    ): Promise<
        ApiResponse<{
            transaction_code: string;
            booking_id: number;
            status: string;
            gateway: string;
            amount: number;
        }>
    > {
        return apiClient.post(API_ENDPOINTS.TRANSACTIONS.CASH, data);
    }
}
