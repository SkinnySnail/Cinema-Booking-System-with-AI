import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Flag,
  Loader2,
  Upload,
  X,
  FileUp,
  Download,
  Tag,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogTrigger,
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
import { cn } from "@/lib/utils";
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
  genres?: Genre[] | string; // Can be array from detail endpoint or string from list endpoint
  genre_ids?: string; // Comma-separated genre IDs from backend: "1,2,3"
  rating?: number;
}

const AdminMovies: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  // Form states for Add/Edit
  const [formData, setFormData] = useState({
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
  });

  // File upload state
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Genre management state
  const [genreLoading, setGenreLoading] = useState(false);
  const [showAddGenreModal, setShowAddGenreModal] = useState(false);
  const [showEditGenreModal, setShowEditGenreModal] = useState(false);
  const [editingGenre, setEditingGenre] = useState<Genre & { movie_count?: number } | null>(null);
  const [genreFormData, setGenreFormData] = useState({ name: "", description: "" });

  // Fetch movies from API
  useEffect(() => {
    fetchMovies();
    fetchGenres();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMovies = async () => {
    try {
      setLoading(true);
      const response = await apiCall<{
        success: boolean;
        data: { movies: Movie[] };
      }>(API_ENDPOINTS.MOVIES, {
        method: "GET",
      });
      if (response.success && response.data && response.data.movies) {
        setMovies(response.data.movies);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể tải danh sách phim";
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchGenres = async () => {
    try {
      const response = await apiCall<{
        success: boolean;
        data: { genres: (Genre & { movie_count?: number })[] };
      }>(API_ENDPOINTS.GENRES, {
        method: "GET",
      });
      if (response.success && response.data && response.data.genres) {
        setGenres(response.data.genres);
      }
    } catch (error: unknown) {
      console.error("Error fetching genres:", error);
    }
  };

  const handleCreateGenre = async () => {
    if (!genreFormData.name.trim()) {
      toast({ title: "Lỗi", description: "Tên thể loại không được để trống", variant: "destructive" });
      return;
    }
    try {
      setGenreLoading(true);
      const response = await apiCall<{ success: boolean; data: { message: string } }>(
        API_ENDPOINTS.GENRES,
        { method: "POST", body: JSON.stringify(genreFormData) }
      );
      if (response.success) {
        toast({ title: "Thành công", description: "Thêm thể loại thành công" });
        setShowAddGenreModal(false);
        setGenreFormData({ name: "", description: "" });
        fetchGenres();
      }
    } catch (error: unknown) {
      toast({ title: "Lỗi", description: error instanceof Error ? error.message : "Không thể thêm thể loại", variant: "destructive" });
    } finally {
      setGenreLoading(false);
    }
  };

  const handleUpdateGenre = async () => {
    if (!editingGenre || !genreFormData.name.trim()) {
      toast({ title: "Lỗi", description: "Tên thể loại không được để trống", variant: "destructive" });
      return;
    }
    try {
      setGenreLoading(true);
      const response = await apiCall<{ success: boolean; data: { message: string } }>(
        `${API_ENDPOINTS.GENRES}/${editingGenre.id}`,
        { method: "PUT", body: JSON.stringify(genreFormData) }
      );
      if (response.success) {
        toast({ title: "Thành công", description: "Cập nhật thể loại thành công" });
        setShowEditGenreModal(false);
        setEditingGenre(null);
        setGenreFormData({ name: "", description: "" });
        fetchGenres();
      }
    } catch (error: unknown) {
      toast({ title: "Lỗi", description: error instanceof Error ? error.message : "Không thể cập nhật", variant: "destructive" });
    } finally {
      setGenreLoading(false);
    }
  };

  const handleDeleteGenre = async (genre: Genre & { movie_count?: number }) => {
    if ((genre.movie_count ?? 0) > 0) {
      toast({
        title: "Không thể xóa",
        description: `Thể loại "${genre.name}" đang được gắn với ${genre.movie_count} phim. Hãy gỡ thể loại khỏi các phim trước.`,
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`Xóa thể loại "${genre.name}"? Thao tác này không thể hoàn tác.`)) return;
    try {
      setGenreLoading(true);
      const response = await apiCall<{ success: boolean }>(  
        `${API_ENDPOINTS.GENRES}/${genre.id}`,
        { method: "DELETE" }
      );
      if (response.success) {
        toast({ title: "Thành công", description: `Đã xóa thể loại "${genre.name}"` });
        fetchGenres();
      }
    } catch (error: unknown) {
      toast({ title: "Lỗi", description: error instanceof Error ? error.message : "Không thể xóa", variant: "destructive" });
    } finally {
      setGenreLoading(false);
    }
  };

  const filteredMovies = movies.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getAgeRatingClass = (rating: string) => {
    const classes: Record<string, string> = {
      P: "bg-green-500",
      T13: "bg-yellow-500",
      T16: "bg-orange-500",
      T18: "bg-red-500",
      C: "bg-gray-500",
    };
    return classes[rating] || "bg-gray-500";
  };

  const handleEdit = async (movie: Movie) => {
    try {
      setSelectedMovie(movie);

      // Fetch full movie detail to get genre IDs
      const detailResponse = await apiCall<{
        success: boolean;
        data: { movie: Movie };
      }>(API_ENDPOINTS.MOVIE_DETAIL(movie.id));

      let genreIds: number[] = [];
      if (detailResponse.success && detailResponse.data?.movie) {
        const fullMovie = detailResponse.data.movie;
        if (Array.isArray(fullMovie.genres)) {
          genreIds = fullMovie.genres.map((g: Genre) => g.id);
        } else if (
          typeof fullMovie.genre_ids === "string" &&
          fullMovie.genre_ids
        ) {
          // Parse genre_ids from "1,2,3" to [1, 2, 3]
          genreIds = fullMovie.genre_ids
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));
        }
      }

      const fullMovieData =
        detailResponse.success && detailResponse.data?.movie
          ? detailResponse.data.movie
          : movie;

      console.log("=== DEBUG handleEdit ===");
      console.log("fullMovieData.poster_url:", fullMovieData.poster_url);
      console.log("fullMovieData.director:", fullMovieData.director);
      console.log("fullMovieData.cast:", fullMovieData.cast);
      console.log("genreIds:", genreIds);

      setFormData({
        title: fullMovieData.title,
        duration: fullMovieData.duration.toString(),
        age_rating: fullMovieData.age_rating,
        origin: fullMovieData.origin,
        poster_url: fullMovieData.poster_url || "",
        trailer_url: fullMovieData.trailer_url || "",
        description: fullMovieData.description || "",
        release_date: fullMovieData.release_date,
        status: fullMovieData.status,
        director: fullMovieData.director || "",
        cast: fullMovieData.cast || "",
        genre_ids: genreIds,
      });

      setPosterFile(null);

      setShowEditModal(true);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể tải thông tin phim";
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (movieId: number) => {
    if (!confirm("Bạn có chắc muốn xóa phim này?")) return;

    try {
      setLoading(true);
      await apiCall(API_ENDPOINTS.MOVIE_DETAIL(movieId), {
        method: "DELETE",
      });

      toast({
        title: "Đã xóa phim",
        description: "Phim đã được xóa khỏi hệ thống",
      });

      await fetchMovies(); // Refresh list
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể xóa phim";
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const director = formData.director.trim();
      const cast = formData.cast.trim();

      // Validate required fields
      if (!formData.title || !formData.duration || !formData.release_date) {
        toast({
          title: "Lỗi",
          description: "Vui lòng điền đầy đủ thông tin bắt buộc",
          variant: "destructive",
        });
        return;
      }

      if (!director || !cast) {
        toast({
          title: "Thiếu thông tin bắt buộc",
          description: "Vui lòng nhập đầy đủ Đạo diễn và Diễn viên trước khi thêm phim",
          variant: "destructive",
        });
        return;
      }

      const duration = parseInt(formData.duration);
      if (isNaN(duration) || duration <= 0) {
        toast({
          title: "Lỗi",
          description: "Thời lượng phải là số dương",
          variant: "destructive",
        });
        return;
      }

      setLoading(true);
      const shouldUploadPosterUrl =
        !posterFile && isHttpUrl(formData.poster_url || "");

      // For create flow, movie must be created first to get a valid ID for poster upload.
      // If user selects a file, we upload it after creating the movie.
      const posterUrl = shouldUploadPosterUrl
        ? null
        : posterFile
          ? null
          : formData.poster_url || null;

      const payload = {
        title: formData.title,
        duration: duration,
        age_rating: formData.age_rating,
        origin: formData.origin,
        poster_url: posterUrl || null,
        trailer_url: formData.trailer_url || null,
        description: formData.description || null,
        release_date: formData.release_date,
        status: formData.status,
        director,
        cast,
        genre_ids: formData.genre_ids,
      };

      const createResponse = await apiCall<{
        success: boolean;
        data?: { movie?: Movie };
      }>(API_ENDPOINTS.MOVIES, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const createdMovieId = createResponse.data?.movie?.id;

      if (posterFile) {
        if (!createdMovieId || Number(createdMovieId) <= 0) {
          throw new Error(
            "Không lấy được ID phim sau khi tạo để upload poster",
          );
        }
        await uploadPosterFile(posterFile, Number(createdMovieId));
      } else if (shouldUploadPosterUrl) {
        if (!createdMovieId || Number(createdMovieId) <= 0) {
          throw new Error(
            "Không lấy được ID phim sau khi tạo để upload poster từ URL",
          );
        }
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
      const errorMessage =
        error instanceof Error ? error.message : "Không thể thêm phim";
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedMovie) return;

    try {
      const director = formData.director.trim();
      const cast = formData.cast.trim();

      // Validate required fields
      if (!formData.title || !formData.duration || !formData.release_date) {
        toast({
          title: "Lỗi",
          description: "Vui lòng điền đầy đủ thông tin bắt buộc",
          variant: "destructive",
        });
        return;
      }

      if (!director || !cast) {
        toast({
          title: "Thiếu thông tin bắt buộc",
          description: "Vui lòng nhập đầy đủ Đạo diễn và Diễn viên trước khi cập nhật phim",
          variant: "destructive",
        });
        return;
      }

      const duration = parseInt(formData.duration);
      if (isNaN(duration) || duration <= 0) {
        toast({
          title: "Lỗi",
          description: "Thời lượng phải là số dương",
          variant: "destructive",
        });
        return;
      }

      setLoading(true);

      // Upload poster if a new file is selected
      let posterUrl = formData.poster_url;
      if (posterFile) {
        console.log("=== UPLOADING POSTER ===");
        console.log("File:", posterFile.name, posterFile.size, "bytes");
        posterUrl = await uploadPosterFile(posterFile, selectedMovie.id);
        console.log("Upload result URL:", posterUrl);
      } else if (posterUrl && isHttpUrl(posterUrl)) {
        const uploadedPosterUrl = await uploadPosterFromUrl(
          posterUrl,
          selectedMovie.id,
        );
        if (uploadedPosterUrl) {
          posterUrl = uploadedPosterUrl;
        }
      }

      console.log("=== UPDATE PAYLOAD ===");
      console.log("poster_url in payload:", posterUrl);

      const payload = {
        title: formData.title,
        duration: duration,
        age_rating: formData.age_rating,
        origin: formData.origin,
        poster_url: posterUrl || null,
        trailer_url: formData.trailer_url || null,
        description: formData.description || null,
        release_date: formData.release_date,
        status: formData.status,
        director,
        cast,
        genre_ids: formData.genre_ids,
      };

      await apiCall(API_ENDPOINTS.MOVIE_DETAIL(selectedMovie.id), {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      toast({
        title: "Thành công",
        description: "Phim đã được cập nhật",
      });

      setShowEditModal(false);
      setSelectedMovie(null);
      resetForm();
      await fetchMovies();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể cập nhật phim";
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
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
      genre_ids: [],
    });
    setPosterFile(null);
  };

  const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value.trim());

  // Upload poster file
  const uploadPosterFile = async (
    file: File,
    movieId: number,
  ): Promise<string | null> => {
    if (!file) return null;
    if (!movieId || movieId <= 0) {
      throw new Error("ID phim không hợp lệ để upload poster");
    }

    try {
      setUploadingPoster(true);
      const formDataUpload = new FormData();
      formDataUpload.append("poster", file);

      console.log("=== UPLOAD API CALL ===");
      console.log("Movie ID:", movieId);
      console.log("API URL:", API_ENDPOINTS.MOVIE_UPLOAD_POSTER(movieId));

      const response = await fetch(API_ENDPOINTS.MOVIE_UPLOAD_POSTER(movieId), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formDataUpload,
      });

      const result = await response.json();
      console.log("Upload API response:", result);

      if (result.success && result.data?.poster_url) {
        // Remove leading slash if present to match database format
        let posterUrl = result.data.poster_url;
        if (posterUrl.startsWith("/")) {
          posterUrl = posterUrl.substring(1);
        }
        return posterUrl;
      } else {
        throw new Error(result.message || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
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
    if (!movieId || movieId <= 0) {
      throw new Error("ID phim không hợp lệ để upload poster từ URL");
    }

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
        let posterUrl = result.data.poster_url;
        if (posterUrl.startsWith("/")) {
          posterUrl = posterUrl.substring(1);
        }
        return posterUrl;
      }

      throw new Error(result.message || "Upload poster từ URL thất bại");
    } catch (error) {
      toast({
        title: "Lỗi upload poster URL",
        description:
          error instanceof Error ? error.message : "Không thể upload ảnh từ URL",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploadingPoster(false);
    }
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const mappedData = jsonData.map((row: any) => ({
        title: row["Tên phim"] || "",
        duration: row["Thời lượng (phút)"] || 0,
        age_rating: row["Phân loại (P/K/T13/T16/T18/C)"] || "P",
        origin: row["Nguồn gốc (Vietnam/International)"] === "International" ? "International" : "Vietnam",
        status: row["Trạng thái (Now Showing/Coming Soon/Ended)"] || "Coming Soon",
        director: row["Đạo diễn"] || "",
        cast: row["Diễn viên"] || "",
        release_date: row["Ngày phát hành (YYYY-MM-DD)"] || "",
        description: row["Tóm tắt phim"] || "",
        trailer_url: row["Link Trailer (URL)"] || "",
        poster_url: row["Link Poster (URL)"] || "",
      }));

      const response = await apiCall<{success: boolean, data: {message: string, success_count: number, errors: string[]}}>(
        `${API_ENDPOINTS.MOVIES}/import`,
        {
          method: "POST",
          body: JSON.stringify(mappedData),
        }
      );

      if (response.success) {
        toast({
          title: "Import thành công",
          description: response.data?.message || `Đã import thành công ${response.data?.success_count || 0} phim`,
        });
        if (response.data?.errors && response.data.errors.length > 0) {
          console.warn("Import warning:", response.data.errors);
          toast({
            title: "Có lỗi khi import một số dòng",
            description: "Xem chi tiết lỗi trong Console",
            variant: "destructive",
          });
        }
        await fetchMovies();
      }
    } catch (error: any) {
      toast({
        title: "Lỗi import",
        description: error.message || "Không thể đọc file excel",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownloadTemplate = () => {
    try {
      const templateData = [
        {
          "Tên phim": "Mai",
          "Thời lượng (phút)": 131,
          "Phân loại (P/K/T13/T16/T18/C)": "T18",
          "Nguồn gốc (Vietnam/International)": "Vietnam",
          "Trạng thái (Now Showing/Coming Soon/Ended)": "Now Showing",
          "Đạo diễn": "Trấn Thành",
          "Diễn viên": "Phương Anh Đào, Tuấn Trần, Trấn Thành",
          "Ngày phát hành (YYYY-MM-DD)": "2024-02-10",
          "Tóm tắt phim": "Câu chuyện tình yêu đầy trắc trở giữa Mai và Dương.",
          "Link Trailer (URL)": "https://www.youtube.com/watch?v=example",
          "Link Poster (URL)": "https://example.com/poster-mai.jpg",
        },
        {
          "Tên phim": "Dune: Hành Tinh Cát - Phần 2",
          "Thời lượng (phút)": 166,
          "Phân loại (P/K/T13/T16/T18/C)": "T16",
          "Nguồn gốc (Vietnam/International)": "International",
          "Trạng thái (Now Showing/Coming Soon/Ended)": "Now Showing",
          "Đạo diễn": "Denis Villeneuve",
          "Diễn viên": "Timothée Chalamet, Zendaya, Rebecca Ferguson",
          "Ngày phát hành (YYYY-MM-DD)": "2024-03-01",
          "Tóm tắt phim": "Hành trình báo thù và định mệnh của Paul Atreides trên hành tinh Arrakis.",
          "Link Trailer (URL)": "https://www.youtube.com/watch?v=example2",
          "Link Poster (URL)": "https://example.com/poster-dune2.jpg",
        },
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateData);
      worksheet["!cols"] = [
        { wch: 30 },
        { wch: 18 },
        { wch: 28 },
        { wch: 32 },
        { wch: 38 },
        { wch: 22 },
        { wch: 35 },
        { wch: 28 },
        { wch: 45 },
        { wch: 35 },
        { wch: 35 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "DanhSachPhim");
      XLSX.writeFile(workbook, "mau_nhap_phim.xlsx");
      toast({
        title: "📥 Đã tạo file mẫu",
        description: "File mẫu 'mau_nhap_phim.xlsx' đã được tải về máy của bạn.",
      });
    } catch (error: any) {
      toast({
        title: "Lỗi tạo file mẫu",
        description: error.message || "Không thể tạo file mẫu excel",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Quản Lý Phim</h1>
          <p className="text-muted-foreground">
            Danh sách và quản lý phim đang chiếu
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
            onClick={handleDownloadTemplate}
            title="Tải file Excel mẫu để nhập phim"
          >
            <Download className="w-4 h-4" />
            Tạo file mẫu
          </Button>

          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Nhập Excel
          </Button>

          <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
            <DialogTrigger asChild>
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={openAddModal}
              >
                <Plus className="w-4 h-4 mr-2" />
                Thêm Phim Mới
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Thêm Phim Mới</DialogTitle>
              <DialogDescription>
                Điền thông tin phim để thêm vào hệ thống
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Tên phim *</Label>
                <Input
                  id="title"
                  placeholder="VD: Mai"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="duration">Thời lượng (phút) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    placeholder="120"
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData({ ...formData, duration: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ageRating">Phân loại *</Label>
                  <Select
                    value={formData.age_rating}
                    onValueChange={(value) =>
                      setFormData({ ...formData, age_rating: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn" />
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
                    onValueChange={(value) =>
                      setFormData({ ...formData, origin: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn nguồn gốc" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vietnam">🇻🇳 Việt Nam</SelectItem>
                      <SelectItem value="International">🌍 Quốc Tế</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Trạng thái *</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) =>
                      setFormData({ ...formData, status: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn trạng thái" />
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
                <Label htmlFor="release_date">Ngày phát hành *</Label>
                <Input
                  id="release_date"
                  type="date"
                  value={formData.release_date}
                  onChange={(e) =>
                    setFormData({ ...formData, release_date: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="director">Đạo diễn *</Label>
                <Input
                  id="director"
                  placeholder="Trần Anh Hùng, Christopher Nolan..."
                  value={formData.director}
                  onChange={(e) =>
                    setFormData({ ...formData, director: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cast">Diễn viên (cách nhau bởi dấu phẩy) *</Label>
                <Textarea
                  id="cast"
                  placeholder="Trấn Thành, Lý Hải, Tom Cruise..."
                  rows={2}
                  value={formData.cast}
                  onChange={(e) =>
                    setFormData({ ...formData, cast: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="poster">Poster phim</Label>
                {formData.poster_url && !posterFile && (
                  <div className="relative">
                    <img
                      src={getImageUrl(formData.poster_url)}
                      alt="Preview"
                      className="w-32 h-48 object-cover rounded border"
                      onError={(e) => {
                        e.currentTarget.src =
                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300'%3E%3Crect fill='%23ddd' width='200' height='300'/%3E%3Ctext fill='%23999' font-size='14' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3ENo Image%3C/text%3E%3C/svg%3E";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, poster_url: "" })
                      }
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {posterFile && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">{posterFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setPosterFile(null)}
                      className="ml-auto text-red-500 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <Input
                  id="poster"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setPosterFile(file);
                      setFormData({ ...formData, poster_url: "" });
                    }
                  }}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Định dạng: PNG, JPG, WebP. Tối đa 5MB
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trailer">URL Trailer</Label>
                <Input
                  id="trailer"
                  placeholder="https://youtube.com/..."
                  value={formData.trailer_url}
                  onChange={(e) =>
                    setFormData({ ...formData, trailer_url: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Mô tả</Label>
                <Textarea
                  id="description"
                  placeholder="Mô tả phim..."
                  rows={3}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Thể loại</Label>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(genres) &&
                    genres.map((genre) => (
                      <label
                        key={genre.id}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.genre_ids.includes(genre.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                genre_ids: [...formData.genre_ids, genre.id],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                genre_ids: formData.genre_ids.filter(
                                  (id) => id !== genre.id,
                                ),
                              });
                            }
                          }}
                        />
                        <span>{genre.name}</span>
                      </label>
                    ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddModal(false)}
                disabled={loading}
              >
                Hủy
              </Button>
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Thêm Phim
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Tabs: Phim | Thể Loại */}
      <Tabs defaultValue="movies">
        <TabsList className="mb-4">
          <TabsTrigger value="movies">Danh Sách Phim</TabsTrigger>
          <TabsTrigger value="genres">
            <Tag className="w-4 h-4 mr-1" /> Thể Loại
          </TabsTrigger>
        </TabsList>

        {/* ---- Tab Phim ---- */}
        <TabsContent value="movies">
      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm phim..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Movies Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Poster</TableHead>
                <TableHead>Tên phim</TableHead>
                <TableHead className="w-[100px]">Thời lượng</TableHead>
                <TableHead className="w-[80px]">Phân loại</TableHead>
                <TableHead className="w-[100px]">Nguồn gốc</TableHead>
                <TableHead className="w-[100px]">Trạng thái</TableHead>
                <TableHead className="w-[120px] text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p>Đang tải dữ liệu...</p>
                  </TableCell>
                </TableRow>
              ) : filteredMovies.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-12 text-muted-foreground"
                  >
                    Không tìm thấy phim nào
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovies.map((movie) => (
                  <TableRow key={movie.id}>
                    <TableCell>
                      <img
                        src={
                          getImageUrl(movie.poster_url) ||
                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150' viewBox='0 0 100 150'%3E%3Crect fill='%23ddd' width='100' height='150'/%3E%3Ctext fill='%23999' font-family='sans-serif' font-size='12' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3ENo Poster%3C/text%3E%3C/svg%3E"
                        }
                        alt={movie.title}
                        className="w-12 h-18 object-cover rounded"
                        onError={(e) => {
                          e.currentTarget.src =
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150' viewBox='0 0 100 150'%3E%3Crect fill='%23ddd' width='100' height='150'/%3E%3Ctext fill='%23999' font-family='sans-serif' font-size='12' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3ENo Poster%3C/text%3E%3C/svg%3E";
                          e.currentTarget.onerror = null;
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{movie.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {typeof movie.genres === "string"
                            ? movie.genres || "Chưa có thể loại"
                            : Array.isArray(movie.genres)
                              ? movie.genres
                                .map((g: Genre) => g.name)
                                .join(", ")
                              : "Chưa có thể loại"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{movie.duration} phút</TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "text-white",
                          getAgeRatingClass(movie.age_rating),
                        )}
                      >
                        {movie.age_rating}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          movie.origin === "Vietnam"
                            ? "border-red-500 text-red-600"
                            : "border-blue-500 text-blue-600"
                        }
                      >
                        <Flag className="w-3 h-3 mr-1" />
                        {movie.origin === "Vietnam" ? "Việt Nam" : "Quốc Tế"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          movie.status === "Now Showing"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {movie.status === "Now Showing"
                          ? "Đang chiếu"
                          : movie.status === "Coming Soon"
                            ? "Sắp chiếu"
                            : "Đã kết thúc"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/admin/movies/${movie.id}`)}
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
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(movie.id)}
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Movie Dialog */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh Sửa Phim</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin phim {selectedMovie?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Tên phim *</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-duration">Thời lượng (phút) *</Label>
                <Input
                  id="edit-duration"
                  type="number"
                  value={formData.duration}
                  onChange={(e) =>
                    setFormData({ ...formData, duration: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-ageRating">Phân loại *</Label>
                <Select
                  value={formData.age_rating}
                  onValueChange={(value) =>
                    setFormData({ ...formData, age_rating: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P">P - Phổ biến</SelectItem>
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
                <Label htmlFor="edit-origin">Nguồn gốc *</Label>
                <Select
                  value={formData.origin}
                  onValueChange={(value) =>
                    setFormData({ ...formData, origin: value })
                  }
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
                <Label htmlFor="edit-status">Trạng thái *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
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
              <Label htmlFor="edit-release_date">Ngày phát hành *</Label>
              <Input
                id="edit-release_date"
                type="date"
                value={formData.release_date}
                onChange={(e) =>
                  setFormData({ ...formData, release_date: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-director">Đạo diễn</Label>
              <Input
                id="edit-director"
                placeholder="Trần Anh Hùng, Christopher Nolan..."
                value={formData.director}
                onChange={(e) =>
                  setFormData({ ...formData, director: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-cast">
                Diễn viên (cách nhau bởi dấu phẩy)
              </Label>
              <Textarea
                id="edit-cast"
                placeholder="Trấn Thành, Lý Hải, Tom Cruise..."
                rows={2}
                value={formData.cast}
                onChange={(e) =>
                  setFormData({ ...formData, cast: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-poster">Poster phim</Label>
              {formData.poster_url && !posterFile && (
                <div className="relative inline-block">
                  <img
                    src={getImageUrl(formData.poster_url)}
                    alt="Preview"
                    className="w-32 h-48 object-cover rounded border"
                    onError={(e) => {
                      e.currentTarget.src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300'%3E%3Crect fill='%23ddd' width='200' height='300'/%3E%3Ctext fill='%23999' font-size='14' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3ENo Image%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, poster_url: "" })}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {posterFile && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">{posterFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setPosterFile(null)}
                    className="ml-auto text-red-500 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <Input
                id="edit-poster"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPosterFile(file);
                    setFormData({ ...formData, poster_url: "" });
                  }
                }}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Định dạng: PNG, JPG, WebP. Tối đa 5MB
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-trailer_url">URL Trailer</Label>
              <Input
                id="edit-trailer_url"
                value={formData.trailer_url}
                onChange={(e) =>
                  setFormData({ ...formData, trailer_url: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Mô tả</Label>
              <Textarea
                id="edit-description"
                rows={3}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Thể loại</Label>
              <div className="flex flex-wrap gap-2">
                {Array.isArray(genres) &&
                  genres.map((genre) => (
                    <label
                      key={genre.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.genre_ids.includes(genre.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              genre_ids: [...formData.genre_ids, genre.id],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              genre_ids: formData.genre_ids.filter(
                                (id) => id !== genre.id,
                              ),
                            });
                          }
                        }}
                      />
                      <span>{genre.name}</span>
                    </label>
                  ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditModal(false)}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button onClick={handleUpdate} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Lưu Thay Đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>

        {/* ---- Tab Thể Loại ---- */}
        <TabsContent value="genres">
          <Card>
            <CardContent className="p-0">
              <div className="flex justify-between items-center px-4 py-3 border-b">
                <h2 className="font-semibold text-base">Danh sách thể loại phim</h2>
                <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => { setGenreFormData({ name: "", description: "" }); setShowAddGenreModal(true); }}>
                  <Plus className="w-4 h-4 mr-1" /> Thêm Thể Loại
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>Tên thể loại</TableHead>
                    <TableHead className="w-[120px] text-center">Số phim</TableHead>
                    <TableHead className="w-[120px] text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {genreLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : genres.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Chưa có thể loại nào
                      </TableCell>
                    </TableRow>
                  ) : (
                    (genres as (Genre & { movie_count?: number })[]).map((genre, idx) => (
                      <TableRow key={genre.id}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Tag className="w-3.5 h-3.5 text-primary" />
                            {genre.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${ (genre.movie_count ?? 0) > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground" }`}>
                            {genre.movie_count ?? 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                              onClick={() => {
                                setEditingGenre(genre);
                                setGenreFormData({ name: genre.name, description: (genre as any).description ?? "" });
                                setShowEditGenreModal(true);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleDeleteGenre(genre)}
                              disabled={(genre.movie_count ?? 0) > 0}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* --- Modal Thêm Thể Loại --- */}
      <Dialog open={showAddGenreModal} onOpenChange={setShowAddGenreModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm Thể Loại Mới</DialogTitle>
            <DialogDescription>Nhập tên thể loại phim mới</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="genre-name">Tên thể loại *</Label>
              <Input
                id="genre-name"
                placeholder="VD: Hành động, Tâm lý, Hoạt hình..."
                value={genreFormData.name}
                onChange={(e) => setGenreFormData({ ...genreFormData, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleCreateGenre()}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="genre-desc">Mô tả (tùy chọn)</Label>
              <Input
                id="genre-desc"
                placeholder="Mô tả ngắn..."
                value={genreFormData.description}
                onChange={(e) => setGenreFormData({ ...genreFormData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddGenreModal(false)} disabled={genreLoading}>Hủy</Button>
            <Button onClick={handleCreateGenre} disabled={genreLoading}>
              {genreLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Modal Sửa Thể Loại --- */}
      <Dialog open={showEditGenreModal} onOpenChange={setShowEditGenreModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sửa Thể Loại</DialogTitle>
            <DialogDescription>Cập nhật tên thể loại</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-genre-name">Tên thể loại *</Label>
              <Input
                id="edit-genre-name"
                value={genreFormData.name}
                onChange={(e) => setGenreFormData({ ...genreFormData, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleUpdateGenre()}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-genre-desc">Mô tả (tùy chọn)</Label>
              <Input
                id="edit-genre-desc"
                value={genreFormData.description}
                onChange={(e) => setGenreFormData({ ...genreFormData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditGenreModal(false)} disabled={genreLoading}>Hủy</Button>
            <Button onClick={handleUpdateGenre} disabled={genreLoading}>
              {genreLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMovies;
