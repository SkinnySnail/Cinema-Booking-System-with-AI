import { apiCall, API_ENDPOINTS } from "@/lib/api";

export interface RecommendedMovie {
  id: number; title: string; poster_url: string; genres: string;
  age_rating: string; duration_minutes: number; reason: string;
}
export interface Recommendations {
  movies: RecommendedMovie[];
  concessions: { id: number; name: string; price: number; image_url: string; reason: string }[];
  mode: string; ai_available: boolean;
}
export interface ChatContext { movie_id?: number; cinema_id?: number; date?: string; date_to?: string; updated_at?: number }
export interface ChatReply {
  reply: string; links: { label: string; url: string }[];
  ai_available: boolean; context?: ChatContext; history_id?: number | null;
}
export interface ChatHistoryItem {
  id: number;
  user_message: string;
  assistant_reply: string;
  intent: string | null;
  model: string | null;
  links: { label: string; url: string }[];
  created_at: string;
  expires_at: string;
}
export interface ChatHistoryResponse {
  items: ChatHistoryItem[];
  retention_days: number;
  pagination: { page: number; limit: number; total: number; total_pages: number };
}
export interface Sentiment {
  id: number; label: "positive" | "negative" | "neutral";
  confidence: number; needs_review: boolean;
}
interface Response<T> { success: boolean; data: T }

export const aiService = {
  async recommendations(movieId?: number, cinemaId?: number) {
    const params = new URLSearchParams({ limit: "6" });
    if (movieId) params.set("movie_id", String(movieId));
    if (cinemaId) params.set("cinema_id", String(cinemaId));
    return (await apiCall<Response<Recommendations>>(`${API_ENDPOINTS.AI_RECOMMENDATIONS}?${params}`)).data;
  },
  async chat(message: string, context?: ChatContext) {
    return (await apiCall<Response<ChatReply>>(API_ENDPOINTS.AI_CHAT, {
      method: "POST", body: JSON.stringify({ message, context }),
    })).data;
  },
  async chatHistory(limit = 30) {
    return (await apiCall<Response<ChatHistoryResponse>>(`${API_ENDPOINTS.AI_CHAT_HISTORY}?limit=${limit}`)).data;
  },
  async clearChatHistory() {
    return (await apiCall<Response<{ deleted: number }>>(API_ENDPOINTS.AI_CHAT_HISTORY, {
      method: "DELETE",
    })).data;
  },
  async deleteChatHistoryItem(id: number) {
    return (await apiCall<Response<{ deleted: boolean; id: number }>>(API_ENDPOINTS.AI_CHAT_HISTORY_ITEM(id), {
      method: "DELETE",
    })).data;
  },
  async sentiments(reviewIds: number[]) {
    return (await apiCall<Response<{ items: Sentiment[] }>>(API_ENDPOINTS.AI_SENTIMENT, {
      method: "POST", body: JSON.stringify({ review_ids: reviewIds.slice(0, 100) }),
    })).data;
  },
};
