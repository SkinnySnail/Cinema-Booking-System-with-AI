import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CinemaAssistant from "./CinemaAssistant";
import RecommendationsSection from "./RecommendationsSection";
import SentimentInsights from "./SentimentInsights";
import AISchedulingOption from "./AISchedulingOption";

const mocks = vi.hoisted(() => ({ chat: vi.fn(), recommendations: vi.fn(), sentiments: vi.fn(), user: undefined as { id: string } | undefined }));
vi.mock("@/contexts/AppContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/services/ai.service", () => ({ aiService: mocks }));
vi.mock("@/lib/api", () => ({ getImageUrl: (url: string) => url }));

beforeEach(() => { vi.resetAllMocks(); mocks.user = undefined; });
afterEach(cleanup);
const wrap = (node: React.ReactNode, path = "/") => <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>;

describe("Cinema assistant", () => {
  it("passes conversation context and renders only allowed internal links", async () => {
    mocks.chat.mockResolvedValueOnce({ reply: "Suất ngày mai", context: { movie_id: 4, date: "2026-10-28" }, links: [
      { label: "Xem phim", url: "/movie/4" }, { label: "Unsafe", url: "javascript:alert(1)" },
    ] }).mockResolvedValueOnce({ reply: "Đã tìm", links: [] });
    render(wrap(<CinemaAssistant />));
    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý điện ảnh" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho trợ lý"), { target: { value: "Lịch ngày mai" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    expect(await screen.findByRole("link", { name: "Xem phim" })).toHaveAttribute("href", "/movie/4");
    expect(screen.queryByText("Unsafe")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Câu hỏi cho trợ lý"), { target: { value: "Ở rạp khác" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    await waitFor(() => expect(mocks.chat).toHaveBeenLastCalledWith("Ở rạp khác", { movie_id: 4, date: "2026-10-28" }));
  });

  it("discards an in-flight answer after the signed-in user changes", async () => {
    let resolve!: (value: unknown) => void;
    mocks.chat.mockImplementation(() => new Promise(r => { resolve = r; }));
    const view = render(wrap(<CinemaAssistant />));
    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý điện ảnh" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho trợ lý"), { target: { value: "Gợi ý phim" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    mocks.user = { id: "8" };
    view.rerender(wrap(<CinemaAssistant />));
    await act(async () => resolve({ reply: "Kết quả người cũ", links: [] }));
    expect(screen.queryByText("Kết quả người cũ")).not.toBeInTheDocument();
  });

  it("does not overlay management screens", () => {
    render(wrap(<CinemaAssistant />, "/manager/reviews"));
    expect(screen.queryByRole("button", { name: "Mở trợ lý điện ảnh" })).not.toBeInTheDocument();
  });
});

it("hides recommendations gracefully on service failure", async () => {
  mocks.recommendations.mockRejectedValue(new Error("offline"));
  const view = render(wrap(<RecommendationsSection />));
  await waitFor(() => expect(mocks.recommendations).toHaveBeenCalled());
  expect(view.container.querySelector("section")).toBeNull();
});

it("clears sentiment results when the filtered reviews change", async () => {
  mocks.sentiments.mockResolvedValue({ items: [{ id: 1, label: "negative", confidence: .51, needs_review: true }] });
  const view = render(<SentimentInsights reviews={[{ id: 1, comment: "Ghế không thoải mái" }]} />);
  fireEvent.click(screen.getByRole("button", { name: "Phân tích trang hiện tại" }));
  expect(await screen.findByText(/Cần xem xét thêm/)).toBeInTheDocument();
  view.rerender(<SentimentInsights reviews={[{ id: 2, comment: "Phim hay" }]} />);
  expect(screen.queryByText("Ghế không thoải mái")).not.toBeInTheDocument();
  expect(screen.queryByText(/Cần xem xét thêm/)).not.toBeInTheDocument();
});

it("labels sparse-data forecasts separately from learned forecasts", () => {
  render(<AISchedulingOption enabled onChange={() => {}} forecast={{ requested: true, used: true, mode: "smoothed_prior", training_samples: 3 }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Dữ liệu còn ít");
  expect(screen.getByRole("status")).not.toHaveTextContent("Đã dùng dự báo");
});
