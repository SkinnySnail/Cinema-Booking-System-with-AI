import React, { useState, useEffect } from "react";
import {
  Search,
  Star,
  Trash2,
  CheckCircle,
  XCircle,
  Flag,
  Loader2,
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
import SentimentInsights from "@/components/ai/SentimentInsights";

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

const AdminReviews: React.FC = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRating, setFilterRating] = useState("all");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (filterRating !== "all") params.append("rating", filterRating);

      const response = await apiCall<{
        success: boolean;
        data: {
          reviews: Review[];
        };
      }>(
        `${API_ENDPOINTS.REVIEWS}${params.toString() ? `?${params.toString()}` : ""}`,
        {
          method: "GET",
        },
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
  };

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

  const handleApprove = async (id: number, movieTitle: string) => {
    try {
      await apiCall(API_ENDPOINTS.REVIEW_APPROVE(id), {
        method: "PUT",
      });

      setReviews(
        reviews.map((r) =>
          r.id === id ? { ...r, status: "Approved" as const } : r,
        ),
      );
      toast({
        title: "Đã duyệt đánh giá",
        description: `Đánh giá cho phim "${movieTitle}" đã được phê duyệt`,
      });
    } catch (error) {
      console.error("Error approving review:", error);
      toast({
        title: "Lỗi",
        description: "Không thể duyệt đánh giá",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (id: number, movieTitle: string) => {
    try {
      await apiCall(API_ENDPOINTS.REVIEW_REJECT(id), {
        method: "PUT",
      });

      setReviews(
        reviews.map((r) =>
          r.id === id ? { ...r, status: "Rejected" as const } : r,
        ),
      );
      toast({
        title: "Đã từ chối đánh giá",
        description: `Đánh giá cho phim "${movieTitle}" đã bị từ chối`,
        variant: "destructive",
      });
    } catch (error) {
      console.error("Error rejecting review:", error);
      toast({
        title: "Lỗi",
        description: "Không thể từ chối đánh giá",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number, movieTitle: string) => {
    try {
      await apiCall(API_ENDPOINTS.REVIEW_DETAIL(id), {
        method: "DELETE",
      });

      setReviews(reviews.filter((r) => r.id !== id));
      toast({
        title: "Đã xóa đánh giá",
        description: `Đã xóa đánh giá cho phim "${movieTitle}"`,
      });
    } catch (error) {
      console.error("Error deleting review:", error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa đánh giá",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const configs = {
      Approved: { color: "bg-green-500", label: "Đã duyệt", icon: CheckCircle },
      Pending: { color: "bg-yellow-500", label: "Chờ duyệt", icon: Star },
      Rejected: { color: "bg-red-500", label: "Từ chối", icon: XCircle },
      Reported: { color: "bg-orange-500", label: "Báo cáo", icon: Flag },
    };
    const config = configs[status as keyof typeof configs];
    if (!config) {
      return <Badge>Unknown</Badge>;
    }
    return (
      <Badge className={`${config.color} text-white gap-1`}>
        <config.icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("vi-VN");
  };

  const avgRating =
    reviews.length > 0
      ? (
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        ).toFixed(1)
      : "0.0";

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quản Lý Đánh Giá</h1>
          <p className="text-muted-foreground">
            Duyệt và quản lý đánh giá phim từ khách hàng
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tổng đánh giá</p>
                <p className="text-2xl font-bold">{reviews.length}</p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Star className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Chờ duyệt</p>
                <p className="text-2xl font-bold">
                  {reviews.filter((r) => r.status === "Pending").length}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center">
                <Star className="w-6 h-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Đánh giá trung bình
                </p>
                <p className="text-2xl font-bold">{avgRating} ⭐</p>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center">
                <Star className="w-6 h-6 text-blue-500 fill-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Báo cáo</p>
                <p className="text-2xl font-bold">
                  {reviews.filter((r) => r.status === "Reported").length}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center">
                <Flag className="w-6 h-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <SentimentInsights reviews={filteredReviews} />
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle>Danh Sách Đánh Giá</CardTitle>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Người Dùng</TableHead>
                <TableHead>Phim</TableHead>
                <TableHead>Đánh Giá</TableHead>
                <TableHead>Nội Dung</TableHead>
                <TableHead>Hữu Ích</TableHead>
                <TableHead>Trạng Thái</TableHead>
                <TableHead>Thời Gian</TableHead>
                <TableHead className="text-right">Thao Tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReviews.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    Không có đánh giá nào
                  </TableCell>
                </TableRow>
              ) : (
                filteredReviews.map((review) => {
                  const displayName = review.full_name || review.email;
                  return (
                    <TableRow key={review.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={review.avatar || undefined} />
                            <AvatarFallback>
                              {displayName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{displayName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {review.movie_title || "N/A"}
                      </TableCell>
                      <TableCell>{renderStars(review.rating)}</TableCell>
                      <TableCell>
                        <p className="text-sm max-w-md line-clamp-2">
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
                        <div className="flex items-center justify-end gap-2">
                          {review.status === "Pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleApprove(
                                    review.id,
                                    review.movie_title || "",
                                  )
                                }
                              >
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleReject(
                                    review.id,
                                    review.movie_title || "",
                                  )
                                }
                              >
                                <XCircle className="w-4 h-4 text-red-500" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleDelete(review.id, review.movie_title || "")
                            }
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminReviews;
