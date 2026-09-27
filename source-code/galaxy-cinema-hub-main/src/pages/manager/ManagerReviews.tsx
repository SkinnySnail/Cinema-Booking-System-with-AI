import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Star,
  Trash2,
  CheckCircle,
  XCircle,
  Flag,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS, apiCall } from "@/lib/api";
import { useAuth } from "@/contexts/AppContext";
import { usePermissions } from "@/hooks/usePermissions";
import { AlertTriangle } from "lucide-react";

interface Review {
  id: number;
  movie_id: number;
  movie_title: string;
  user_id: number;
  email: string;
  full_name: string | null;
  avatar: string | null;
  rating: number;
  comment: string;
  created_at: string;
  status: "Approved" | "Pending" | "Rejected" | "Reported";
  helpful_count?: number;
}

const ManagerReviews: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canViewAll = hasPermission("reviews.view_all");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRating, setFilterRating] = useState("all");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    if (!canViewAll) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (filterRating !== "all") params.append("rating", filterRating);

      const response = await apiCall<{
        success: boolean;
        data: { reviews: Review[] };
      }>(
        `${API_ENDPOINTS.REVIEWS}${params.toString() ? `?${params.toString()}` : ""}`,
      );

      if (response.success && response.data) {
        setReviews(response.data.reviews || []);
      }
    } catch (error) {
      console.error("Error fetching reviews:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách đánh giá",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterRating, toast]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const filteredReviews = reviews.filter((review) => {
    const displayName = review.full_name || review.email;
    const matchesSearch =
      (review.movie_title?.toLowerCase() || "").includes(
        searchQuery.toLowerCase(),
      ) ||
      displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.comment.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "all" ||
      review.status.toLowerCase() === filterStatus.toLowerCase();
    const matchesRating =
      filterRating === "all" || review.rating.toString() === filterRating;
    return matchesSearch && matchesStatus && matchesRating;
  });

  const handleDelete = async (id: number, movieTitle: string) => {
    if (!confirm("Bạn có chắc muốn xóa đánh giá này?")) return;
    try {
      await apiCall(API_ENDPOINTS.REVIEW_DETAIL(id), { method: "DELETE" });
      setReviews(reviews.filter((r) => r.id !== id));
      toast({
        title: "Đã xóa đánh giá",
        description: `Đã xóa đánh giá cho phim "${movieTitle}"`,
      });
    } catch {
      toast({
        title: "Lỗi",
        description: "Không thể xóa đánh giá",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<
      string,
      { color: string; label: string; icon: React.ElementType }
    > = {
      Approved: { color: "bg-green-500", label: "Đã duyệt", icon: CheckCircle },
      Pending: { color: "bg-yellow-500", label: "Chờ duyệt", icon: Star },
      Rejected: { color: "bg-red-500", label: "Từ chối", icon: XCircle },
      Reported: { color: "bg-orange-500", label: "Báo cáo", icon: Flag },
    };
    const config = configs[status];
    if (!config) return <Badge>Unknown</Badge>;
    return (
      <Badge className={`${config.color} text-white gap-1`}>
        <config.icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const renderStars = (rating: number) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
        />
      ))}
    </div>
  );

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString("vi-VN");

  const avgRating =
    reviews.length > 0
      ? (
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        ).toFixed(1)
      : "0.0";

  if (!canViewAll) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-destructive/20 bg-destructive/5 space-y-4">
          <AlertTriangle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Truy Cập Bị Từ Chối
          </h2>
          <p className="text-slate-500 max-w-md text-sm">
            Vai trò hiện tại của bạn không có quyền duyệt hoặc quản lý đánh giá phim (yêu cầu quyền: <code className="text-destructive font-mono font-bold">reviews.view_all</code>).
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-orange-500" />
          Quản Lý Đánh Giá
        </h1>
        <p className="text-muted-foreground">
          Duyệt và quản lý đánh giá phim từ khách hàng
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Tổng đánh giá</p>
            <p className="text-2xl font-bold">{reviews.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Chờ duyệt</p>
            <p className="text-2xl font-bold text-yellow-600">
              {reviews.filter((r) => r.status === "Pending").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Đánh giá TB</p>
            <p className="text-2xl font-bold text-blue-600">{avgRating} ⭐</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Báo cáo</p>
            <p className="text-2xl font-bold text-orange-600">
              {reviews.filter((r) => r.status === "Reported").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="text-lg">Danh Sách Đánh Giá</CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="approved">Đã duyệt</SelectItem>
                  <SelectItem value="pending">Chờ duyệt</SelectItem>
                  <SelectItem value="rejected">Từ chối</SelectItem>
                  <SelectItem value="reported">Báo cáo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRating} onValueChange={setFilterRating}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue placeholder="Đánh giá" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả sao</SelectItem>
                  <SelectItem value="5">5 sao</SelectItem>
                  <SelectItem value="4">4 sao</SelectItem>
                  <SelectItem value="3">3 sao</SelectItem>
                  <SelectItem value="2">2 sao</SelectItem>
                  <SelectItem value="1">1 sao</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredReviews.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Không có đánh giá nào</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người Dùng</TableHead>
                    <TableHead>Phim</TableHead>
                    <TableHead>Đánh Giá</TableHead>
                    <TableHead>Nội Dung</TableHead>
                    <TableHead className="text-center">Hữu Ích</TableHead>
                    <TableHead>Trạng Thái</TableHead>
                    <TableHead>Thời Gian</TableHead>
                    <TableHead className="text-right">Thao Tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReviews.map((review) => {
                    const displayName = review.full_name || review.email;
                    return (
                      <TableRow key={review.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={review.avatar || undefined} />
                              <AvatarFallback>
                                {displayName.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm">
                              {displayName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium max-w-[150px] truncate">
                          {review.movie_title || "N/A"}
                        </TableCell>
                        <TableCell>{renderStars(review.rating)}</TableCell>
                        <TableCell>
                          <p className="text-sm max-w-[200px] line-clamp-2">
                            {review.comment}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          {review.helpful_count || 0}
                        </TableCell>
                        <TableCell>{getStatusBadge(review.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(review.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {user && review.user_id === Number(user.id) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleDelete(
                                    review.id,
                                    review.movie_title || "",
                                  )
                                }
                                title="Xóa"
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManagerReviews;
