import React, { useState, useEffect, useCallback } from "react";
import {
  UserPlus, Search, RefreshCw, Mail, Phone,
  ShieldCheck, ShieldOff, Edit3, AlertTriangle,
  User, ChevronLeft, ChevronRight, Upload, Calendar
} from "lucide-react";
import * as XLSX from "xlsx";
import { apiCall, API_ENDPOINTS } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";

interface StaffMember {
  id: number;
  email: string;
  status: "Active" | "Banned";
  created_at: string;
  full_name: string;
  phone: string;
  avatar: string | null;
  joined_cinema_at?: string;
  dob?: string | null;
  cinema_id?: number | null;
}

interface StaffFormData {
  email: string;
  full_name: string;
  phone: string;
  dob: string;
  password?: string;
  cinema_id?: string;
}

const EMPTY_FORM: StaffFormData = {
  email: "",
  full_name: "",
  phone: "",
  dob: "",
  password: "",
  cinema_id: "",
};

const normalizePhone = (phone: string) => phone.replace(/\D/g, "").trim();
const isValidVietnamPhone = (phone: string) => /^0\d{9,10}$/.test(phone);

const getInitials = (name: string, email: string) => {
  const src = name || email || "?";
  return src.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
};

const avatarColors = [
  "from-orange-500 to-amber-500",
  "from-blue-500 to-indigo-500",
  "from-purple-500 to-violet-500",
  "from-emerald-500 to-teal-500",
  "from-pink-500 to-rose-500",
];
const getAvatarColor = (id: number) => avatarColors[id % avatarColors.length];

const ManagerStaff: React.FC = () => {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canView = hasPermission("users.view_all");
  const canCreate = hasPermission("users.create");
  const canUpdate = hasPermission("users.update_all");

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Dialog States
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<StaffFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [toggleConfirm, setToggleConfirm] = useState<StaffMember | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubmitting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
      
      if (!jsonData || jsonData.length === 0) {
        throw new Error("File Excel rỗng hoặc không có dữ liệu");
      }

      const res = await apiCall<{success: boolean; data: {message: string, success_count: number, errors: string[]}}>(
        API_ENDPOINTS.MANAGER_STAFF_IMPORT, 
        { method: "POST", body: JSON.stringify(jsonData) }
      );
      
      if (res.data?.message) {
        toast({ 
          title: res.data?.success_count > 0 ? "✅ Import hoàn tất" : "⚠️ Cảnh báo", 
          description: res.data?.message,
          duration: 5000
        });
        if (res.data?.errors && res.data.errors.length > 0) {
          console.warn("Import lỗi một số dòng:", res.data.errors);
        }
      }
      void fetchStaff();
    } catch (err: unknown) {
      toast({ 
        title: "Lỗi", 
        description: err instanceof Error ? err.message : "Không thể xử lý file Excel", 
        variant: "destructive" 
      });
    } finally {
      setSubmitting(false);
      e.target.value = "";
    }
  };

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("limit", "10");
      const res = await apiCall<{
        success: boolean;
        data: { staff: StaffMember[]; pagination: { total: number; total_pages: number } }
      }>(`${API_ENDPOINTS.MANAGER_STAFF}?${params.toString()}`);
      if (res.success) {
        setStaff(res.data.staff ?? []);
        setTotal(res.data.pagination?.total ?? 0);
        setTotalPages(res.data.pagination?.total_pages ?? 1);
      }
    } catch (e: unknown) {
      toast({ title: "Lỗi", description: e instanceof Error ? e.message : "Không thể tải dữ liệu", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page, toast]);

  useEffect(() => {
    const t = setTimeout(() => { void fetchStaff(); }, 300);
    return () => clearTimeout(t);
  }, [fetchStaff]);

  const handleOpenCreate = () => {
    setSelectedStaff(null);
    setForm(EMPTY_FORM);
    setIsCreateDialogOpen(true);
  };

  const handleOpenEdit = (member: StaffMember) => {
    setSelectedStaff(member);
    setForm({
      email: member.email,
      full_name: member.full_name || "",
      phone: member.phone || "",
      dob: member.dob ? member.dob.split("T")[0] : "",
      password: "",
      cinema_id: member.cinema_id ? member.cinema_id.toString() : "",
    });
    setIsEditDialogOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedFullName = form.full_name.trim();
    const normalizedPhone = normalizePhone(form.phone);

    if (!form.email || !trimmedFullName || !form.dob) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng điền đầy đủ Email, Họ và tên và Ngày sinh bắt buộc.",
        variant: "destructive",
      });
      return;
    }

    if (!isValidVietnamPhone(normalizedPhone)) {
      toast({
        title: "Số điện thoại không hợp lệ",
        description: "Số điện thoại Việt Nam phải bắt đầu bằng 0 và có 10-11 số",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        email: form.email.trim(),
        full_name: trimmedFullName,
        phone: normalizedPhone,
        dob: form.dob,
      };

      await apiCall(API_ENDPOINTS.MANAGER_STAFF, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast({
        title: "✅ Tạo thành công",
        description: `Đã tạo tài khoản cho ${trimmedFullName}. Mật khẩu mặc định là ngày sinh (ddmmyyyy).`,
      });

      setIsCreateDialogOpen(false);
      setForm(EMPTY_FORM);
      void fetchStaff();
    } catch (e: unknown) {
      toast({
        title: "❌ Lỗi tạo nhân viên",
        description: e instanceof Error ? e.message : "Thao tác thất bại",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;

    const trimmedFullName = form.full_name.trim();
    const normalizedPhone = normalizePhone(form.phone);

    if (!trimmedFullName) {
      toast({
        title: "Thiếu thông tin",
        description: "Họ và tên không được để trống",
        variant: "destructive",
      });
      return;
    }

    if (normalizedPhone && !isValidVietnamPhone(normalizedPhone)) {
      toast({
        title: "Số điện thoại không hợp lệ",
        description: "Số điện thoại Việt Nam phải bắt đầu bằng 0 và có 10-11 số",
        variant: "destructive",
      });
      return;
    }

    if (form.password && form.password.length < 6) {
      toast({
        title: "Mật khẩu không hợp lệ",
        description: "Mật khẩu mới phải có ít nhất 6 ký tự",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: trimmedFullName,
        phone: normalizedPhone,
        dob: form.dob || null,
      };
      if (form.password) {
        payload.password = form.password;
      }

      await apiCall(API_ENDPOINTS.MANAGER_STAFF_DETAIL(selectedStaff.id), {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      toast({
        title: "✅ Thành công",
        description: `Đã cập nhật thông tin nhân viên ${trimmedFullName}`,
      });

      setIsEditDialogOpen(false);
      setSelectedStaff(null);
      setForm(EMPTY_FORM);
      void fetchStaff();
    } catch (e: unknown) {
      toast({
        title: "❌ Lỗi cập nhật",
        description: e instanceof Error ? e.message : "Thao tác thất bại",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (member: StaffMember) => {
    try {
      const res = await apiCall<{ success: boolean; data: { new_status: string; message: string } }>(
        API_ENDPOINTS.MANAGER_STAFF_TOGGLE(member.id),
        { method: "PATCH" }
      );
      if (res.success) {
        toast({ title: "✅ Thành công", description: res.data.message });
        setToggleConfirm(null);
        void fetchStaff();
      }
    } catch (e: unknown) {
      toast({
        title: "❌ Lỗi",
        description: e instanceof Error ? e.message : "Thao tác thất bại",
        variant: "destructive",
      });
    }
  };

  const activeCount = staff.filter(s => s.status === "Active").length;
  const bannedCount = staff.filter(s => s.status === "Banned").length;

  if (!canView) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-destructive/20 bg-destructive/5 space-y-4">
          <AlertTriangle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Truy Cập Bị Từ Chối
          </h2>
          <p className="text-slate-500 max-w-md text-sm">
            Vai trò hiện tại của bạn không có quyền xem hoặc quản lý danh sách nhân sự của rạp (yêu cầu quyền: <code className="text-destructive font-mono font-bold">users.view_all</code>).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 dark:text-slate-100">
            Quản Lý Nhân Viên
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Quản lý tài khoản nhân viên của rạp
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              id="excel-upload"
              onChange={handleFileUpload}
            />
            <label
              htmlFor="excel-upload"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] text-slate-800 dark:text-slate-200 font-medium text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4" /> Nhập Excel
            </label>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium text-sm hover:opacity-90 transition-all shadow-lg shadow-orange-500/20 hover:scale-[1.02] cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Thêm Nhân Viên
            </button>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tổng nhân viên", value: total, color: "text-slate-800 dark:text-slate-100" },
          { label: "Đang hoạt động", value: activeCount, color: "text-emerald-500 dark:text-emerald-400" },
          { label: "Vô hiệu hóa", value: bannedCount, color: "text-red-500 dark:text-red-400" },
        ].map(s => (
          <div
            key={s.label}
            className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] text-center shadow-xs"
          >
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            placeholder="Tìm theo tên, email, SĐT..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50 transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:border-orange-500/50 transition-colors [&>option]:bg-white dark:[&>option]:bg-slate-800"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="Active">Đang hoạt động</option>
          <option value="Banned">Vô hiệu hóa</option>
        </select>
        {(search || statusFilter) && (
          <button
            onClick={() => { setSearch(""); setStatusFilter(""); }}
            className="px-3 h-9 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Xóa lọc
          </button>
        )}
      </div>

      {/* Staff List */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-orange-500 dark:text-orange-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Danh Sách Nhân Viên
            </span>
            {!loading && (
              <span className="px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200/60 dark:border-orange-800/40 text-xs font-semibold">
                {total} người
              </span>
            )}
          </div>
          {loading && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
        </div>

        <div className="p-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : staff.length === 0 ? (
            <div className="py-16 text-center">
              <User className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-slate-400 dark:text-slate-500 text-sm">
                Không tìm thấy nhân viên nào
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {staff.map(member => (
                <div
                  key={member.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all gap-3 group",
                    member.status === "Active"
                      ? "border-slate-200/70 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700"
                      : "border-slate-200/70 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20 opacity-60 hover:opacity-80"
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className={cn("w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 shadow-md", getAvatarColor(member.id))}>
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.full_name} className="w-full h-full rounded-xl object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-white">{getInitials(member.full_name, member.email)}</span>
                      )}
                    </div>
                    {/* Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                          {member.full_name || "Chưa có tên"}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-semibold",
                          member.status === "Active"
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                            : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40"
                        )}>
                          {member.status === "Active" ? "● Hoạt động" : "○ Vô hiệu hóa"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />{member.email}
                        </span>
                        {member.phone && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />{member.phone}
                          </span>
                        )}
                        {member.dob && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(member.dob).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {canUpdate && (
                    <div className="flex items-center gap-2 shrink-0 transition-opacity">
                      <button
                        onClick={() => handleOpenEdit(member)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200/80 dark:border-slate-700 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Sửa
                      </button>
                      <button
                        onClick={() => setToggleConfirm(member)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border cursor-pointer",
                          member.status === "Active"
                            ? "text-amber-500 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 border-amber-200 dark:border-amber-800/40"
                            : "text-emerald-500 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40"
                        )}
                      >
                        {member.status === "Active"
                          ? <><ShieldOff className="w-3.5 h-3.5" /> Vô hiệu hóa</>
                          : <><ShieldCheck className="w-3.5 h-3.5" /> Kích hoạt</>
                        }
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 pb-4 pt-2 border-t border-slate-200/80 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Trang {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE STAFF DIALOG (Styled exactly like Admin) */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (open) {
            setSelectedStaff(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="max-w-md bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Thêm Nhân Viên Mới</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              Tạo tài khoản nhân viên mới cho rạp
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={e => void handleCreateSubmit(e)} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="create-email">Email *</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="nhanvien@example.com"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-fullName">Họ và Tên *</Label>
              <Input
                id="create-fullName"
                placeholder="Nguyễn Văn A"
                value={form.full_name}
                onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-phone">Số Điện Thoại *</Label>
              <Input
                id="create-phone"
                placeholder="0901234567"
                value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                maxLength={11}
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                Số điện thoại Việt Nam: bắt đầu bằng 0, gồm 10-11 số.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-dob">Ngày Sinh *</Label>
              <Input
                id="create-dob"
                type="date"
                value={form.dob}
                onChange={(e) => setForm(f => ({ ...f, dob: e.target.value }))}
                max={new Date().toISOString().split("T")[0]}
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                Mật khẩu mặc định sẽ là ngày sinh theo định dạng ddmmyyyy.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-role">Vai Trò</Label>
              <Select disabled value="staff">
                <SelectTrigger id="create-role" className="bg-slate-100 dark:bg-slate-800/80 cursor-not-allowed text-slate-700 dark:text-slate-300">
                  <SelectValue placeholder="Nhân viên" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Nhân viên</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tài khoản tạo bởi Quản lý có vai trò mặc định là Nhân viên trực thuộc rạp.
              </p>
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={submitting}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Đang tạo...
                  </>
                ) : (
                  "Tạo Tài Khoản"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT STAFF DIALOG (Styled exactly like Admin) */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setSelectedStaff(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="max-w-md bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Chỉnh Sửa Nhân Viên</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              Cập nhật thông tin nhân viên {selectedStaff?.email}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={e => void handleEditSubmit(e)} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName">Họ và Tên *</Label>
              <Input
                id="edit-fullName"
                value={form.full_name}
                onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Số Điện Thoại</Label>
              <Input
                id="edit-phone"
                value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                maxLength={11}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Số điện thoại Việt Nam: bắt đầu bằng 0, gồm 10-11 số.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-dob">Ngày Sinh</Label>
              <Input
                id="edit-dob"
                type="date"
                value={form.dob}
                onChange={(e) => setForm(f => ({ ...f, dob: e.target.value }))}
                max={new Date().toISOString().split("T")[0]}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-role">Vai Trò</Label>
              <Select disabled value="staff">
                <SelectTrigger id="edit-role" className="bg-slate-100 dark:bg-slate-800/80 cursor-not-allowed text-slate-700 dark:text-slate-300">
                  <SelectValue placeholder="Nhân viên" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Nhân viên</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-password">Đổi Mật Khẩu (Tùy chọn)</Label>
              <Input
                id="edit-password"
                type="password"
                placeholder="Để trống nếu không muốn đổi"
                value={form.password || ""}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                minLength={form.password ? 6 : 0}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Chỉ nhập nếu muốn cấp lại mật khẩu mới cho nhân viên (tối thiểu 6 ký tự).
              </p>
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={submitting}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Đang lưu...
                  </>
                ) : (
                  "Cập Nhật"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* TOGGLE STATUS CONFIRM DIALOG */}
      <Dialog
        open={!!toggleConfirm}
        onOpenChange={(open) => {
          if (!open) setToggleConfirm(null);
        }}
      >
        <DialogContent className="max-w-sm bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-center">
          <div className="pt-2">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border",
              toggleConfirm?.status === "Active"
                ? "bg-amber-500/10 border-amber-500/20 text-amber-500 dark:text-amber-400"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 dark:text-emerald-400"
            )}>
              {toggleConfirm?.status === "Active" ? (
                <ShieldOff className="w-7 h-7" />
              ) : (
                <ShieldCheck className="w-7 h-7" />
              )}
            </div>
            <DialogTitle className="text-base font-bold text-center">
              {toggleConfirm?.status === "Active" ? "Vô hiệu hóa tài khoản?" : "Kích hoạt tài khoản?"}
            </DialogTitle>
            <DialogDescription className="text-sm text-center text-slate-500 dark:text-slate-400 mt-1 mb-4">
              {toggleConfirm?.full_name} ({toggleConfirm?.email})
            </DialogDescription>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setToggleConfirm(null)}
              className="flex-1"
            >
              Hủy
            </Button>
            <Button
              onClick={() => toggleConfirm && void handleToggle(toggleConfirm)}
              className={cn(
                "flex-1 text-white",
                toggleConfirm?.status === "Active"
                  ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
                  : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
              )}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagerStaff;
