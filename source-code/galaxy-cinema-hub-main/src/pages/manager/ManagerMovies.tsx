import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Search,
  Edit,
  Eye,
  Loader2,
  Film,
  Calendar,
  Clock,
  Star,
  Trash2,
  FileUp,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { API_ENDPOINTS, apiCall, getImageUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Genre {
  id: number;
  name: string;
}

interface Movie {
  id: number;
  title: string;
  duration: number;
  age_rating: string;
  origin: string;
  poster_url: string | null;
  trailer_url: string | null;
  description: string | null;
  release_date: string;
  status: string;
  director?: string | null;
  cast?: string | null;
  genres?: Genre[] | string;
  genre_ids?: string;
  rating?: number;
}

const emptyForm = {
  title: "",
  duration: "",
  age_rating: "P",
  origin: "Vietnam",
  poster_url: "",
  trailer_url: "",
  description: "",
  release_date: "",
  status: "Coming Soon",
  director: "",
  cast: "",
  genre_ids: [] as number[],
};

const ManagerMovies: React.FC = () => {
  const { toast } = useToast();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  // File upload & import state
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const fetchMovies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiCall<{
        success: boolean;
        data: { movies: Movie[] };
      }>(API_ENDPOINTS.MOVIES);
      if (response.success && response.data?.movies) {
        setMovies(response.data.movies);
      }
    } catch (error: unknown) {
      toast({
        title: "Lỗi",
        description:
          error instanceof Error
            ? error.message
            : "Không thể tải danh sách phim",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchGenres = useCallback(async () => {
    try {
      const response = await apiCall<{
        success: boolean;
        data: { genres: Genre[] };
      }>(API_ENDPOINTS.GENRES);
      if (response.success && response.data?.genres) {
        setGenres(response.data.genres);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchMovies();
    fetchGenres();
  }, [fetchMovies, fetchGenres]);

  // ── Filters ──
  const filteredMovies = movies.filter((m) => {
    const matchSearch = m.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Helpers ──
  const getAgeRatingColor = (rating: string) => {
    const map: Record<string, string> = {
      P: "bg-green-500",
      K: "bg-blue-400",
      T13: "bg-yellow-500",
      T16: "bg-orange-500",
      T18: "bg-red-500",
      C: "bg-gray-500",
    };
    return map[rating] || "bg-gray-500";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Now Showing":
        return <Badge className="bg-green-500 text-white">Đang chiếu</Badge>;
      case "Coming Soon":
        return <Badge className="bg-blue-500 text-white">Sắp chiếu</Badge>;
      case "Ended":
        return <Badge variant="secondary">Đã kết thúc</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const resetForm = () => {
    setFormData({ ...emptyForm });
    setPosterFile(null);
  };

  const isHttpUrl = (value: string): boolean =>
    /^https?:\/\//i.test(value.trim());

  const uploadPosterFile = async (
    file: File,
    movieId: number,
  ): Promise<string | null> => {
    if (!file || !movieId || movieId <= 0) return null;
    try {
      setUploadingPoster(true);
      const fd = new FormData();
      fd.append("poster", file);
      const response = await fetch(API_ENDPOINTS.MOVIE_UPLOAD_POSTER(movieId), {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: fd,
      });
      const result = await response.json();
      if (result.success && result.data?.poster_url) {
        let url = result.data.poster_url;
        if (url.startsWith("/")) url = url.substring(1);
        return url;
      }
      throw new Error(result.message || "Upload failed");
    } catch (error) {
      toast({
        title: "Lỗi upload poster",
        description:
          error instanceof Error ? error.message : "Không thể upload ảnh",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploadingPoster(false);
    }
  };

  const uploadPosterFromUrl = async (
    imageUrl: string,
    movieId: number,
  ): Promise<string | null> => {
    if (!movieId || movieId <= 0) return null;
    try {
      setUploadingPoster(true);
      const response = await fetch(
        API_ENDPOINTS.MOVIE_UPLOAD_POSTER_FROM_URL(movieId),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ image_url: imageUrl }),
        },
      );
      const result = await response.json();
      if (result.success && result.data?.poster_url) {
        let url = result.data.poster_url;
        if (url.startsWith("/")) url = url.substring(1);
        return url;
      }
      throw new Error(result.message || "Upload poster từ URL thất bại");
    } catch (error) {
      toast({
        title: "Lỗi upload poster URL",
        description:
          error instanceof Error
            ? error.message
            : "Không thể upload ảnh từ URL",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploadingPoster(false);
    }
  };

  const handleDelete = async (movieId: number) => {
    if (!confirm("Bạn có chắc muốn xóa phim này?")) return;
    try {
      setLoading(true);
      await apiCall(API_ENDPOINTS.MOVIE_DETAIL(movieId), { method: "DELETE" });
      toast({
        title: "Đã xóa phim",
        description: "Phim đã được xóa khỏi hệ thống",
      });
      await fetchMovies();
    } catch (error: unknown) {
      toast({
        title: "Lỗi",
        description:
          error instanceof Error ? error.message : "Không thể xóa phim",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setImporting(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<
        string,
        unknown
      >[];

      const mappedData = jsonData.map((row) => ({
        title: row["Tên phim"] || "",
        duration: row["Thời lượng (phút)"] || 0,
        age_rating: row["Phân loại (P/K/T13/T16/T18/C)"] || "P",
        origin:
          row["Nguồn gốc (Vietnam/International)"] === "International"
            ? "International"
            : "Vietnam",
        status:
          row["Trạng thái (Now Showing/Coming Soon/Ended)"] || "Coming Soon",
        director: row["Đạo diễn"] || "",
        cast: row["Diễn viên"] || "",
        release_date: row["Ngày phát hành (YYYY-MM-DD)"] || "",
        description: row["Tóm tắt phim"] || "",
        trailer_url: row["Link Trailer (URL)"] || "",
        poster_url: row["Link Poster (URL)"] || "",
      }));

      const response = await apiCall<{
        success: boolean;
        data: { message: string; success_count: number; errors: string[] };
      }>(`${API_ENDPOINTS.MOVIES}/import`, {
        method: "POST",
        body: JSON.stringify(mappedData),
      });

      if (response.success) {
        toast({
          title: "Import thành công",
          description:
            response.data?.message ||
            `Đã import ${response.data?.success_count || 0} phim`,
        });
        if (response.data?.errors?.length) {
          toast({
            title: "Có lỗi khi import một số dòng",
            description: "Xem chi tiết lỗi trong Console",
            variant: "destructive",
          });
        }
        await fetchMovies();
      }
    } catch (error: unknown) {
      toast({
        title: "Lỗi import",
        description:
          error instanceof Error ? error.message : "Không thể đọc file excel",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleViewDetail = async (movie: Movie) => {
    try {
      const res = await apiCall<{
        success: boolean;
        data: { movie: Movie };
      }>(API_ENDPOINTS.MOVIE_DETAIL(movie.id));
      if (res.success && res.data?.movie) {
        setSelectedMovie(res.data.movie);
      } else {
        setSelectedMovie(movie);
      }
    } catch {
      setSelectedMovie(movie);
    }
    setShowDetailModal(true);
  };

  const handleEdit = async (movie: Movie) => {
    try {
      const res = await apiCall<{
        success: boolean;
        data: { movie: Movie };
      }>(API_ENDPOINTS.MOVIE_DETAIL(movie.id));

      const full = res.success && res.data?.movie ? res.data.movie : movie;

      let genreIds: number[] = [];
      if (Array.isArray(full.genres)) {
        genreIds = full.genres.map((g: Genre) => g.id);
      } else if (typeof full.genre_ids === "string" && full.genre_ids) {
        genreIds = full.genre_ids
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      }

      setSelectedMovie(full);
      setFormData({
        title: full.title,
        duration: full.duration.toString(),
        age_rating: full.age_rating,
        origin: full.origin,
        poster_url: full.poster_url || "",
        trailer_url: full.trailer_url || "",
        description: full.description || "",
        release_date: full.release_date,
        status: full.status,
        director: full.director || "",
        cast: full.cast || "",
        genre_ids: genreIds,
      });
      setPosterFile(null);
      setShowEditModal(true);
    } catch (error: unknown) {
      toast({
        title: "Lỗi",
        description:
          error instanceof Error
            ? error.message
            : "Không thể tải thông tin phim",
        variant: "destructive",
      });
    }
  };

  const validateForm = (): boolean => {
    if (!formData.title || !formData.duration || !formData.release_date) {
      toast({
        title: "Thiếu thông tin",
        description:
          "Vui lòng điền đầy đủ: Tên phim, Thời lượng, Ngày phát hành",
        variant: "destructive",
      });
      return false;
    }
    if (!formData.director.trim() || !formData.cast.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập Đạo diễn và Diễn viên",
        variant: "destructive",
      });
      return false;
    }
    const dur = parseInt(formData.duration);
    if (isNaN(dur) || dur <= 0) {
      toast({
        title: "Lỗi",
        description: "Thời lượng phải là số dương",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const buildPayload = () => ({
    title: formData.title,
    duration: parseInt(formData.duration),
    age_rating: formData.age_rating,
    origin: formData.origin,
    poster_url: formData.poster_url || null,
    trailer_url: formData.trailer_url || null,
    description: formData.description || null,
    release_date: formData.release_date,
    status: formData.status,
    director: formData.director.trim(),
    cast: formData.cast.trim(),
    genre_ids: formData.genre_ids,
  });

  const handleCreate = async () => {
    if (!validateForm()) return;
    try {
      setLoading(true);
      const payload = buildPayload();
      const shouldUploadPosterUrl =
        !posterFile && isHttpUrl(formData.poster_url || "");
      if (posterFile || shouldUploadPosterUrl) {
        payload.poster_url = null;
      }

      const createResponse = await apiCall<{
        success: boolean;
        data?: { movie?: Movie };
      }>(API_ENDPOINTS.MOVIES, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const createdMovieId = createResponse.data?.movie?.id;
      if (posterFile && createdMovieId) {
        await uploadPosterFile(posterFile, Number(createdMovieId));
      } else if (shouldUploadPosterUrl && createdMovieId) {
        await uploadPosterFromUrl(formData.poster_url, Number(createdMovieId));
      }

      toast({
        title: "Thành công",
        description: "Phim đã được thêm vào hệ thống",
      });
      setShowAddModal(false);
      resetForm();
      await fetchMovies();
    } catch (error: unknown) {
      toast({
        title: "Lỗi",
        description:
          error instanceof Error ? error.message : "Không thể thêm phim",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedMovie || !validateForm()) return;
    try {
      setLoading(true);

      let posterUrl = formData.poster_url;
      if (posterFile) {
        posterUrl =
          (await uploadPosterFile(posterFile, selectedMovie.id)) || posterUrl;
      } else if (posterUrl && isHttpUrl(posterUrl)) {
        const uploaded = await uploadPosterFromUrl(posterUrl, selectedMovie.id);
        if (uploaded) posterUrl = uploaded;
      }

      const payload = {
        ...buildPayload(),
        poster_url: posterUrl || null,
      };

      await apiCall(API_ENDPOINTS.MOVIE_DETAIL(selectedMovie.id), {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast({ title: "Thành công", description: "Phim đã được cập nhật" });
      setShowEditModal(false);
      setSelectedMovie(null);
      resetForm();
      await fetchMovies();
    } catch (error: unknown) {
      toast({
        title: "Lỗi",
        description:
          error instanceof Error ? error.message : "Không thể cập nhật phim",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Movie Form (shared between Add & Edit) ──
  const renderMovieForm = () => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label>Tên phim *</Label>
        <Input
          placeholder="VD: Mai"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Thời lượng (phút) *</Label>
          <Input
            type="number"
            placeholder="120"
            value={formData.duration}
            onChange={(e) =>
              setFormData({ ...formData, duration: e.target.value })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label>Phân loại *</Label>
          <Select
            value={formData.age_rating}
            onValueChange={(v) => setFormData({ ...formData, age_rating: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="P">P - Phổ biến</SelectItem>
              <SelectItem value="K">K - Trẻ em</SelectItem>
              <SelectItem value="T13">T13 - Từ 13 tuổi</SelectItem>
              <SelectItem value="T16">T16 - Từ 16 tuổi</SelectItem>
              <SelectItem value="T18">T18 - Từ 18 tuổi</SelectItem>
              <SelectItem value="C">C - Cấm</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Nguồn gốc *</Label>
          <Select
            value={formData.origin}
            onValueChange={(v) => setFormData({ ...formData, origin: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Vietnam">🇻🇳 Việt Nam</SelectItem>
              <SelectItem value="International">🌍 Quốc Tế</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Trạng thái *</Label>
          <Select
            value={formData.status}
            onValueChange={(v) => setFormData({ ...formData, status: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Coming Soon">Sắp chiếu</SelectItem>
              <SelectItem value="Now Showing">Đang chiếu</SelectItem>
              <SelectItem value="Ended">Đã kết thúc</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Ngày phát hành *</Label>
        <Input
          type="date"
          value={formData.release_date}
          onChange={(e) =>
            setFormData({ ...formData, release_date: e.target.value })
          }
        />
      </div>

      <div className="grid gap-2">
        <Label>Đạo diễn *</Label>
        <Input
          placeholder="Trần Anh Hùng, Christopher Nolan..."
          value={formData.director}
          onChange={(e) =>
            setFormData({ ...formData, director: e.target.value })
          }
        />
      </div>

      <div className="grid gap-2">
        <Label>Diễn viên (cách nhau bởi dấu phẩy) *</Label>
        <Textarea
          placeholder="Trấn Thành, Lý Hải, Tom Cruise..."
          rows={2}
          value={formData.cast}
          onChange={(e) => setFormData({ ...formData, cast: e.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label>Poster</Label>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={posterInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPosterFile(file);
              setFormData({
                ...formData,
                poster_url: URL.createObjectURL(file),
              });
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => posterInputRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          {posterFile ? posterFile.name : "Chọn ảnh poster..."}
        </Button>
        {(formData.poster_url || posterFile) && (
          <img
            src={
              posterFile
                ? URL.createObjectURL(posterFile)
                : getImageUrl(formData.poster_url)
            }
            alt="Preview"
            className="w-24 h-36 object-cover rounded border mt-1"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
      </div>

      <div className="grid gap-2">
        <Label>URL Trailer</Label>
        <Input
          placeholder="https://youtube.com/..."
          value={formData.trailer_url}
          onChange={(e) =>
            setFormData({ ...formData, trailer_url: e.target.value })
          }
        />
      </div>

      <div className="grid gap-2">
        <Label>Mô tả</Label>
        <Textarea
          placeholder="Mô tả phim..."
          rows={3}
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
        />
      </div>

      {genres.length > 0 && (
        <div className="grid gap-2">
          <Label>Thể loại</Label>
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <label
                key={genre.id}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={formData.genre_ids.includes(genre.id)}
                  onChange={(e) => {
                    const ids = e.target.checked
                      ? [...formData.genre_ids, genre.id]
                      : formData.genre_ids.filter((id) => id !== genre.id);
                    setFormData({ ...formData, genre_ids: ids });
                  }}
                  className="rounded"
                />
                <span className="text-sm">{genre.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── Render ──
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Film className="w-6 h-6 text-orange-500" />
            Quản Lý Phim
          </h1>
          <p className="text-muted-foreground">
            Danh sách phim và quản lý thông tin phim
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileUp className="w-4 h-4" />
            )}
            Nhập Excel
          </Button>
          <Button
            onClick={openAddModal}
            className="bg-orange-500 hover:bg-orange-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            Thêm Phim Mới
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Tổng phim</p>
            <p className="text-2xl font-bold">{movies.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Đang chiếu</p>
            <p className="text-2xl font-bold text-green-600">
              {movies.filter((m) => m.status === "Now Showing").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Sắp chiếu</p>
            <p className="text-2xl font-bold text-blue-600">
              {movies.filter((m) => m.status === "Coming Soon").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Đã kết thúc</p>
            <p className="text-2xl font-bold text-gray-500">
              {movies.filter((m) => m.status === "Ended").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Danh Sách Phim</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm phim..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="Now Showing">Đang chiếu</SelectItem>
                <SelectItem value="Coming Soon">Sắp chiếu</SelectItem>
                <SelectItem value="Ended">Đã kết thúc</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : filteredMovies.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Không tìm thấy phim nào</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Poster</TableHead>
                    <TableHead>Tên phim</TableHead>
                    <TableHead className="text-center">Phân loại</TableHead>
                    <TableHead className="text-center">Thời lượng</TableHead>
                    <TableHead className="text-center">Trạng thái</TableHead>
                    <TableHead className="text-center">
                      Ngày phát hành
                    </TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovies.map((movie) => (
                    <TableRow key={movie.id}>
                      <TableCell>
                        {movie.poster_url ? (
                          <img
                            src={getImageUrl(movie.poster_url)}
                            alt={movie.title}
                            className="w-10 h-14 object-cover rounded"
                            onError={(e) => {
                              e.currentTarget.src =
                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='56'%3E%3Crect fill='%23ddd' width='40' height='56' rx='4'/%3E%3C/svg%3E";
                            }}
                          />
                        ) : (
                          <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                            <Film className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {movie.title}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={`${getAgeRatingColor(movie.age_rating)} text-white text-xs`}
                        >
                          {movie.age_rating}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {movie.duration} phút
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(movie.status)}
                      </TableCell>
                      <TableCell className="text-center">
                        {new Date(movie.release_date).toLocaleDateString(
                          "vi-VN",
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewDetail(movie)}
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(movie)}
                            title="Chỉnh sửa"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(movie.id)}
                            title="Xóa phim"
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add Movie Dialog ── */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm Phim Mới</DialogTitle>
            <DialogDescription>
              Điền thông tin phim để thêm vào hệ thống
            </DialogDescription>
          </DialogHeader>
          {renderMovieForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleCreate}
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Thêm Phim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Movie Dialog ── */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh Sửa Phim</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin phim: {selectedMovie?.title}
            </DialogDescription>
          </DialogHeader>
          {renderMovieForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Lưu Thay Đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail Modal ── */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi Tiết Phim</DialogTitle>
          </DialogHeader>
          {selectedMovie && (
            <div className="space-y-4">
              {/* Poster */}
              {selectedMovie.poster_url && (
                <div className="flex justify-center">
                  <img
                    src={getImageUrl(selectedMovie.poster_url)}
                    alt={selectedMovie.title}
                    className="w-40 h-60 object-cover rounded-lg shadow"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}

              <h2 className="text-xl font-bold text-center">
                {selectedMovie.title}
              </h2>

              <div className="flex justify-center gap-2">
                <Badge
                  className={`${getAgeRatingColor(selectedMovie.age_rating)} text-white`}
                >
                  {selectedMovie.age_rating}
                </Badge>
                {getStatusBadge(selectedMovie.status)}
                <Badge variant="outline">{selectedMovie.origin}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>{selectedMovie.duration} phút</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {new Date(selectedMovie.release_date).toLocaleDateString(
                      "vi-VN",
                    )}
                  </span>
                </div>
                {selectedMovie.rating != null && (
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span>{selectedMovie.rating}/10</span>
                  </div>
                )}
              </div>

              {selectedMovie.director && (
                <div>
                  <Label className="text-muted-foreground">Đạo diễn</Label>
                  <p className="font-medium">{selectedMovie.director}</p>
                </div>
              )}

              {selectedMovie.cast && (
                <div>
                  <Label className="text-muted-foreground">Diễn viên</Label>
                  <p className="font-medium">{selectedMovie.cast}</p>
                </div>
              )}

              {Array.isArray(selectedMovie.genres) &&
                selectedMovie.genres.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground">Thể loại</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedMovie.genres.map((g: Genre) => (
                        <Badge key={g.id} variant="secondary">
                          {g.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {selectedMovie.description && (
                <div>
                  <Label className="text-muted-foreground">Mô tả</Label>
                  <p className="text-sm mt-1 whitespace-pre-line">
                    {selectedMovie.description}
                  </p>
                </div>
              )}

              {selectedMovie.trailer_url && (
                <div>
                  <Label className="text-muted-foreground">Trailer</Label>
                  <a
                    href={selectedMovie.trailer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:underline block mt-1 truncate"
                  >
                    {selectedMovie.trailer_url}
                  </a>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>
              Đóng
            </Button>
            {selectedMovie && (
              <Button
                onClick={() => {
                  setShowDetailModal(false);
                  handleEdit(selectedMovie);
                }}
                className="bg-orange-500 hover:bg-orange-600"
              >
                <Edit className="w-4 h-4 mr-2" />
                Chỉnh sửa
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagerMovies;
