import React, { useState, useEffect, useMemo } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  User,
  Plus,
  Search,
  Filter,
  History,
  Key,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Lock,
  Unlock,
  Eye,
  Edit2,
  Trash2,
  RotateCcw,
  Save,
  Loader2,
  ArrowRight,
  Check,
  X,
  Calendar,
  Clock,
  Info,
  RefreshCw,
  FileText,
  Film,
  Building,
  Layout,
  Coffee,
  Ticket,
  QrCode,
  BarChart3,
  Tag,
  Star,
  CreditCard,
  Settings,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AppContext";
import { permissionsService } from "@/services/permissions";
import type {
  Permission,
  Role,
  UserWithRoles,
  AuditLog,
  CreateRoleData,
  UpdateRoleData,
} from "@/types/permission";

// ============================================
// CONFIG & CONSTANTS
// ============================================

const MODULE_META: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  movies: { label: "Quản lý Phim", color: "bg-purple-500", icon: Film },
  showtimes: { label: "Suất chiếu & Lịch chiếu", color: "bg-amber-500", icon: Calendar },
  cinemas: { label: "Cụm rạp & Chi nhánh", color: "bg-cyan-500", icon: Building },
  halls: { label: "Phòng chiếu & Sơ đồ ghế", color: "bg-indigo-500", icon: Layout },
  concessions: { label: "Bắp nước & Combo", color: "bg-violet-500", icon: Coffee },
  bookings: { label: "Đặt vé & Bán tại quầy (POS)", color: "bg-green-500", icon: Ticket },
  tickets: { label: "Soát vé & Vào phòng", color: "bg-orange-500", icon: QrCode },
  users: { label: "Người dùng & Khách hàng", color: "bg-blue-500", icon: Users },
  reports: { label: "Báo cáo & Doanh thu", color: "bg-pink-500", icon: BarChart3 },
  promotions: { label: "Khuyến mãi & Voucher", color: "bg-rose-500", icon: Tag },
  reviews: { label: "Đánh giá & Bình luận", color: "bg-lime-500", icon: Star },
  transactions: { label: "Giao dịch & Thanh toán", color: "bg-emerald-500", icon: CreditCard },
  system: { label: "Cấu hình Hệ thống", color: "bg-red-500", icon: Settings },
};

const BASE_ROLE_INFO: Record<
  string,
  { label: string; badgeClass: string; description: string }
> = {
  admin: {
    label: "Quản trị viên (Admin)",
    badgeClass: "bg-red-500/10 text-red-500 border-red-500/30",
    description: "Toàn quyền quản trị hệ thống, dữ liệu và nhân sự",
  },
  manager: {
    label: "Quản lý rạp (Manager)",
    badgeClass: "bg-purple-500/10 text-purple-500 border-purple-500/30",
    description: "Quản lý vận hành cụm rạp, suất chiếu, bắp nước và nhân viên",
  },
  staff: {
    label: "Nhân viên (Staff)",
    badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    description: "Nhân viên vận hành, thu ngân POS, soát vé và phục vụ khách",
  },
  member: {
    label: "Thành viên (Member)",
    badgeClass: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    description: "Khách hàng có tài khoản thành viên tích điểm và đặt vé",
  },
  guest: {
    label: "Khách vãng lai (Guest)",
    badgeClass: "bg-gray-500/10 text-gray-400 border-gray-500/30",
    description: "Người dùng vãng lai chưa đăng nhập",
  },
};

// Scope restriction logic matching backend RoleController::getScopeRestrictions
const SCOPE_RESTRICTIONS: Record<
  string,
  { disallowed_modules: string[]; disallowed_prefixes: string[] }
> = {
  guest: {
    disallowed_modules: [
      "system",
      "reports",
      "halls",
      "cinemas",
      "users",
      "tickets",
      "concessions",
      "bookings",
    ],
    disallowed_prefixes: [
      "movies.create",
      "movies.update",
      "movies.delete",
      "movies.upload_poster",
      "movies.import",
      "showtimes.create",
      "showtimes.update",
      "showtimes.delete",
      "showtimes.auto_generate",
      "promotions.create",
      "promotions.update",
      "promotions.delete",
      "reviews.create",
      "reviews.update_own",
      "reviews.delete_own",
      "reviews.delete_any",
      "reviews.approve",
      "reviews.reject",
      "reviews.report",
      "reviews.view_all",
      "transactions.",
    ],
  },
  member: {
    disallowed_modules: [
      "system",
      "reports",
      "halls",
      "cinemas",
      "users",
      "tickets",
      "concessions",
    ],
    disallowed_prefixes: [
      "movies.create",
      "movies.update",
      "movies.delete",
      "movies.upload_poster",
      "movies.import",
      "showtimes.create",
      "showtimes.update",
      "showtimes.delete",
      "showtimes.auto_generate",
      "promotions.create",
      "promotions.update",
      "promotions.delete",
      "bookings.pos",
      "bookings.view_all",
      "bookings.refund",
      "bookings.update",
      "reviews.view_all",
      "reviews.delete_any",
      "reviews.approve",
      "reviews.reject",
      "transactions.view_all",
      "transactions.process",
    ],
  },
  staff: {
    disallowed_modules: ["system", "reports"],
    disallowed_prefixes: [
      "cinemas.create",
      "cinemas.update",
      "cinemas.delete",
      "halls.create",
      "halls.update",
      "halls.delete",
      "halls.manage_layout",
      "movies.create",
      "movies.update",
      "movies.delete",
      "movies.upload_poster",
      "movies.import",
      "showtimes.create",
      "showtimes.update",
      "showtimes.delete",
      "showtimes.auto_generate",
      "users.create",
      "users.update_all",
      "users.delete",
      "users.change_role",
      "users.view_all",
      "promotions.create",
      "promotions.update",
      "promotions.delete",
      "concessions.create",
      "concessions.update",
      "concessions.delete",
      "concessions.import",
      "reviews.view_all",
      "reviews.delete_any",
      "reviews.approve",
      "reviews.reject",
      "bookings.refund",
    ],
  },
  manager: {
    disallowed_modules: ["system"],
    disallowed_prefixes: [
      "cinemas.create",
      "cinemas.delete",
      "movies.delete",
      "users.create",
      "users.update_all",
      "users.delete",
      "users.change_role",
      "concessions.create",
      "concessions.delete",
      "concessions.import",
      "promotions.delete",
      "tickets.scan",
      "tickets.approve_entry",
    ],
  },
  admin: {
    disallowed_modules: [],
    disallowed_prefixes: [],
  },
};

function checkPermissionRestriction(
  perm: Permission,
  baseRole: string
): { restricted: boolean; reason?: string } {
  const scope = SCOPE_RESTRICTIONS[baseRole] || SCOPE_RESTRICTIONS.staff;
  if (scope.disallowed_modules.includes(perm.module)) {
    return {
      restricted: true,
      reason: `Module '${perm.module}' vượt thẩm quyền của nhóm '${baseRole.toUpperCase()}'`,
    };
  }
  for (const prefix of scope.disallowed_prefixes) {
    if (perm.name === prefix || perm.name.startsWith(prefix)) {
      return {
        restricted: true,
        reason: `Quyền nhạy cảm cấp cao, không khả dụng cho nhóm '${baseRole.toUpperCase()}'`,
      };
    }
  }
  return { restricted: false };
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function AdminRolePermissions() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Root state
  const [activeTab, setActiveTab] = useState<"roles" | "users" | "audit">("roles");
  const [loading, setLoading] = useState(true);

  // Core Data
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<
    Record<string, Permission[]>
  >({});

  // --------------------------------------------
  // TAB 1: Roles & Permission Matrix State
  // --------------------------------------------
  const [selectedRoleId, setSelectedRoleId] = useState<number>(2); // Default Member or Staff
  const [roleSearchTerm, setRoleSearchTerm] = useState("");
  const [roleFilterType, setRoleFilterType] = useState<"all" | "system" | "custom">("all");

  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<number>>(new Set());
  const [originalPermissionIds, setOriginalPermissionIds] = useState<Set<number>>(new Set());
  const [permSearchTerm, setPermSearchTerm] = useState("");
  const [permModuleFilter, setPermModuleFilter] = useState("all");
  const [openAccordionModules, setOpenAccordionModules] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);
  const [savePermsDialogOpen, setSavePermsDialogOpen] = useState(false);
  const [savePermsReason, setSavePermsReason] = useState("");

  // Create Role Dialog
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [createRoleForm, setCreateRoleForm] = useState<CreateRoleData>({
    name: "",
    code: "",
    display_name: "",
    description: "",
    base_role: "staff",
    is_active: 1,
    reason: "",
  });

  // Edit Role Info Dialog
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [editRoleForm, setEditRoleForm] = useState<{
    name: string;
    display_name: string;
    description: string;
    is_active: number;
    reason: string;
  }>({
    name: "",
    display_name: "",
    description: "",
    is_active: 1,
    reason: "",
  });

  // Delete Role Dialog
  const [isDeleteRoleOpen, setIsDeleteRoleOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState(false);
  const [deleteRoleReason, setDeleteRoleReason] = useState("");

  // --------------------------------------------
  // TAB 2: User Role Assignment State
  // --------------------------------------------
  const [usersWithRoles, setUsersWithRoles] = useState<UserWithRoles[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserWithRoles | null>(null);
  const [userAssignedRoleIds, setUserAssignedRoleIds] = useState<Set<number>>(new Set());
  const [originalUserAssignedRoleIds, setOriginalUserAssignedRoleIds] = useState<Set<number>>(
    new Set()
  );
  const [userRoleAssignReason, setUserRoleAssignReason] = useState("");
  const [savingUserRoles, setSavingUserRoles] = useState(false);
  const [loadingUserRolesDetail, setLoadingUserRolesDetail] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userBaseRoleFilter, setUserBaseRoleFilter] = useState("all");

  // --------------------------------------------
  // TAB 3: Audit Logs State
  // --------------------------------------------
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit] = useState(15);
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFromDate, setAuditFromDate] = useState("");
  const [auditToDate, setAuditToDate] = useState("");
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);
  const [isAuditDetailOpen, setIsAuditDetailOpen] = useState(false);

  // ============================================
  // LOAD INITIAL DATA
  // ============================================

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [permsRes, rolesRes] = await Promise.all([
        permissionsService.getAllPermissions(),
        permissionsService.getAllRoles(),
      ]);

      const rawRoles = rolesRes.data.roles || [];
      const validRoles = rawRoles.filter(
        (r: Role) => r.id !== 1 && r.base_role !== "guest"
      );
      setRoles(validRoles);
      setAllPermissions(permsRes.data.permissions || []);
      setGroupedPermissions(permsRes.data.grouped || {});
      setOpenAccordionModules(Object.keys(permsRes.data.grouped || {}));

      if (validRoles.length > 0) {
        // Find existing selected role or default to first
        const found = validRoles.find((r) => r.id === selectedRoleId);
        const targetId = found ? found.id : validRoles[0].id;
        setSelectedRoleId(targetId);
        loadRolePermissions(targetId);
      }
    } catch (err: unknown) {
      toast({
        title: "Lỗi tải dữ liệu phân quyền",
        description: err instanceof Error ? err.message : "Vui lòng thử lại",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load role permissions when selectedRoleId changes
  const loadRolePermissions = async (roleId: number) => {
    try {
      const res = await permissionsService.getRolePermissions(roleId);
      const permIds = new Set(res.data.permissions.map((p) => p.id));
      setSelectedPermissionIds(permIds);
      setOriginalPermissionIds(new Set(permIds));
    } catch (err: unknown) {
      toast({
        title: "Lỗi tải quyền của vai trò",
        description: err instanceof Error ? err.message : "Vui lòng thử lại",
        variant: "destructive",
      });
    }
  };

  const handleSelectRole = (roleId: number) => {
    setSelectedRoleId(roleId);
    loadRolePermissions(roleId);
  };

  // --------------------------------------------
  // TAB 1 HELPERS & ACTIONS
  // --------------------------------------------

  const currentRole = useMemo(() => {
    return roles.find((r) => r.id === selectedRoleId) || null;
  }, [roles, selectedRoleId]);

  const hasPermChanges = useMemo(() => {
    if (selectedPermissionIds.size !== originalPermissionIds.size) return true;
    for (const id of selectedPermissionIds) {
      if (!originalPermissionIds.has(id)) return true;
    }
    return false;
  }, [selectedPermissionIds, originalPermissionIds]);

  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      const matchSearch =
        r.name.toLowerCase().includes(roleSearchTerm.toLowerCase()) ||
        r.display_name.toLowerCase().includes(roleSearchTerm.toLowerCase()) ||
        (r.code && r.code.toLowerCase().includes(roleSearchTerm.toLowerCase()));
      if (!matchSearch) return false;

      if (roleFilterType === "system") return r.is_system === 1;
      if (roleFilterType === "custom") return r.is_system === 0;
      return true;
    });
  }, [roles, roleSearchTerm, roleFilterType]);

  const handleTogglePermission = (permId: number) => {
    if (!currentRole || currentRole.is_system === 1) return;

    // Check scope restriction
    const perm = allPermissions.find((p) => p.id === permId);
    if (perm && checkPermissionRestriction(perm, currentRole.base_role).restricted) {
      toast({
        title: "Quyền vượt thẩm quyền",
        description: `Quyền này không thể gán cho vai trò nhóm '${currentRole.base_role.toUpperCase()}'.`,
        variant: "destructive",
      });
      return;
    }

    const next = new Set(selectedPermissionIds);
    if (next.has(permId)) {
      next.delete(permId);
    } else {
      next.add(permId);
    }
    setSelectedPermissionIds(next);
  };

  const handleToggleModuleAll = (moduleName: string) => {
    if (!currentRole || currentRole.is_system === 1) return;

    const modulePerms = (groupedPermissions[moduleName] || []).filter((p) => {
      return !checkPermissionRestriction(p, currentRole.base_role).restricted;
    });
    if (modulePerms.length === 0) return;

    const moduleIds = modulePerms.map((p) => p.id);
    const allSelected = moduleIds.every((id) => selectedPermissionIds.has(id));

    const next = new Set(selectedPermissionIds);
    if (allSelected) {
      moduleIds.forEach((id) => next.delete(id));
    } else {
      moduleIds.forEach((id) => next.add(id));
    }
    setSelectedPermissionIds(next);
  };

  const handleSelectAllPerms = () => {
    if (!currentRole || currentRole.is_system === 1) return;
    const validPermIds = allPermissions
      .filter((p) => !checkPermissionRestriction(p, currentRole.base_role).restricted)
      .map((p) => p.id);
    setSelectedPermissionIds(new Set(validPermIds));
  };

  const handleDeselectAllPerms = () => {
    if (!currentRole || currentRole.is_system === 1) return;
    setSelectedPermissionIds(new Set());
  };

  const handleResetPerms = () => {
    setSelectedPermissionIds(new Set(originalPermissionIds));
  };

  const handleSavePermsSubmit = async () => {
    if (!currentRole) return;
    if (currentRole.is_system === 1) {
      toast({
        title: "Không thể chỉnh sửa",
        description: "Vai trò hệ thống mặc định là chỉ đọc và được bảo vệ vĩnh viễn.",
        variant: "destructive",
      });
      return;
    }
    if (!savePermsReason.trim()) {
      toast({
        title: "Thiếu lý do thay đổi",
        description: "Vui lòng nhập lý do thay đổi để lưu nhật ký kiểm toán hệ thống.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSavingPerms(true);
      await permissionsService.syncPermissions(currentRole.id, {
        permission_ids: Array.from(selectedPermissionIds),
      });

      toast({
        title: "Lưu thành công",
        description: `Đã cập nhật ma trận quyền cho vai trò '${currentRole.display_name}'.`,
      });

      setSavePermsDialogOpen(false);
      setSavePermsReason("");
      setOriginalPermissionIds(new Set(selectedPermissionIds));

      // Refresh roles to update counts
      const rolesRes = await permissionsService.getAllRoles();
      setRoles(rolesRes.data.roles || []);
    } catch (err: unknown) {
      toast({
        title: "Lỗi cập nhật quyền",
        description: err instanceof Error ? err.message : "Vui lòng thử lại",
        variant: "destructive",
      });
    } finally {
      setSavingPerms(false);
    }
  };

  // Create Role Handler
  const handleCreateRoleSubmit = async () => {
    if (!createRoleForm.name.trim()) {
      toast({
        title: "Thiếu tên vai trò",
        description: "Vui lòng nhập tên vai trò tự do theo nhu cầu.",
        variant: "destructive",
      });
      return;
    }

    try {
      setCreatingRole(true);
      const code =
        createRoleForm.code?.trim() ||
        `${createRoleForm.base_role.toUpperCase()}_${createRoleForm.name
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "_")
          .substring(0, 20)}`;

      const res = await permissionsService.createRole({
        name: createRoleForm.name.trim(),
        code,
        display_name: createRoleForm.display_name.trim() || createRoleForm.name.trim(),
        description: createRoleForm.description,
        base_role: createRoleForm.base_role,
        is_active: createRoleForm.is_active,
        reason: createRoleForm.reason || "Tạo vai trò mới qua trang quản trị",
      });

      toast({
        title: "Tạo vai trò thành công",
        description: `Vai trò '${res.data.role.display_name}' đã được khởi tạo.`,
      });

      setIsCreateRoleOpen(false);
      setCreateRoleForm({
        name: "",
        code: "",
        display_name: "",
        description: "",
        base_role: "staff",
        is_active: 1,
        reason: "",
      });

      // Reload roles and select the new role
      const rolesRes = await permissionsService.getAllRoles();
      setRoles(rolesRes.data.roles || []);
      if (res.data.role?.id) {
        setSelectedRoleId(res.data.role.id);
        loadRolePermissions(res.data.role.id);
      }
    } catch (err: unknown) {
      toast({
        title: "Lỗi tạo vai trò",
        description: err instanceof Error ? err.message : "Vui lòng kiểm tra lại",
        variant: "destructive",
      });
    } finally {
      setCreatingRole(false);
    }
  };

  // Edit Role Info Handler
  const openEditRoleDialog = () => {
    if (!currentRole) return;
    setEditRoleForm({
      name: currentRole.name,
      display_name: currentRole.display_name,
      description: currentRole.description || "",
      is_active: Number(currentRole.is_active) === 1 ? 1 : 0,
      reason: "",
    });
    setIsEditRoleOpen(true);
  };

  const handleEditRoleSubmit = async () => {
    if (!currentRole) return;
    try {
      setEditingRole(true);
      const res = await permissionsService.updateRole(currentRole.id, {
        name: editRoleForm.name.trim(),
        display_name: editRoleForm.display_name.trim(),
        description: editRoleForm.description.trim(),
        is_active: editRoleForm.is_active,
        reason: editRoleForm.reason || "Cập nhật thông tin vai trò",
      });

      toast({
        title: "Cập nhật thành công",
        description: `Đã lưu thay đổi cho vai trò '${res.data.role.display_name}'.`,
      });

      setIsEditRoleOpen(false);
      const rolesRes = await permissionsService.getAllRoles();
      setRoles(rolesRes.data.roles || []);
    } catch (err: unknown) {
      toast({
        title: "Lỗi cập nhật vai trò",
        description: err instanceof Error ? err.message : "Vui lòng thử lại",
        variant: "destructive",
      });
    } finally {
      setEditingRole(false);
    }
  };

  // Delete Role Handler
  const handleDeleteRoleSubmit = async () => {
    if (!currentRole) return;
    if (currentRole.is_system === 1) {
      toast({
        title: "Không thể xóa",
        description: "Vai trò hệ thống mặc định được bảo vệ và không thể xóa.",
        variant: "destructive",
      });
      return;
    }

    try {
      setDeletingRole(true);
      await permissionsService.deleteRole(
        currentRole.id,
        deleteRoleReason.trim() || "Xóa vai trò tùy chỉnh qua quản trị"
      );

      toast({
        title: "Đã xóa vai trò",
        description: `Vai trò '${currentRole.display_name}' đã được xóa an toàn khỏi hệ thống.`,
      });

      setIsDeleteRoleOpen(false);
      setDeleteRoleReason("");

      // Reload roles and reset selected
      const rolesRes = await permissionsService.getAllRoles();
      setRoles(rolesRes.data.roles || []);
      if (rolesRes.data.roles && rolesRes.data.roles.length > 0) {
        const nextId = rolesRes.data.roles[0].id;
        setSelectedRoleId(nextId);
        loadRolePermissions(nextId);
      }
    } catch (err: unknown) {
      toast({
        title: "Lỗi xóa vai trò",
        description: err instanceof Error ? err.message : "Vui lòng thử lại",
        variant: "destructive",
      });
    } finally {
      setDeletingRole(false);
    }
  };

  // --------------------------------------------
  // TAB 2 HELPERS & ACTIONS (USER ROLE ASSIGNMENT)
  // --------------------------------------------

  const loadUsersWithRoles = async () => {
    try {
      const res = await permissionsService.getUsersWithRoles();
      setUsersWithRoles(res.data.users || []);
      if (res.data.users && res.data.users.length > 0 && !selectedUserId) {
        handleSelectUser(res.data.users[0].id);
      }
    } catch (err: unknown) {
      toast({
        title: "Lỗi tải danh sách người dùng",
        description: err instanceof Error ? err.message : "Vui lòng thử lại",
        variant: "destructive",
      });
    }
  };

  const handleSelectUser = async (userId: number) => {
    setSelectedUserId(userId);
    try {
      setLoadingUserRolesDetail(true);
      const res = await permissionsService.getUserRolesDetail(userId);
      setSelectedUserDetail(res.data.user);
      const roleIdSet = new Set(res.data.roles.map((r) => r.id));
      setUserAssignedRoleIds(roleIdSet);
      setOriginalUserAssignedRoleIds(new Set(roleIdSet));
      setUserRoleAssignReason("");
    } catch (err: unknown) {
      toast({
        title: "Lỗi nạp vai trò người dùng",
        description: err instanceof Error ? err.message : "Vui lòng thử lại",
        variant: "destructive",
      });
    } finally {
      setLoadingUserRolesDetail(false);
    }
  };

  // Determine user base role
  const selectedUserBaseRole = useMemo(() => {
    if (!selectedUserDetail) return "member";
    const primaryRole = roles.find((r) => r.id === selectedUserDetail.role_id);
    if (primaryRole) return primaryRole.base_role;
    if (selectedUserDetail.role_id === 5) return "admin";
    if (selectedUserDetail.role_id === 4) return "manager";
    if (selectedUserDetail.role_id === 3) return "staff";
    return "member";
  }, [selectedUserDetail, roles]);

  // Roles compatible with selected user's base_role
  const compatibleRoles = useMemo(() => {
    return roles.filter((r) => r.base_role === selectedUserBaseRole);
  }, [roles, selectedUserBaseRole]);

  // Compute union of permissions across all checked roles in real-time
  const previewEffectivePermissions = useMemo(() => {
    const permIdSet = new Set<number>();
    userAssignedRoleIds.forEach((rid) => {
      const r = roles.find((item) => item.id === rid);
      if (r && r.permission_ids) {
        r.permission_ids.forEach((pid) => permIdSet.add(pid));
      }
    });
    return allPermissions.filter((p) => permIdSet.has(p.id));
  }, [userAssignedRoleIds, roles, allPermissions]);

  // Group preview permissions by module
  const previewGroupedEffectivePerms = useMemo(() => {
    const grouped: Record<string, Permission[]> = {};
    previewEffectivePermissions.forEach((p) => {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push(p);
    });
    return grouped;
  }, [previewEffectivePermissions]);

  const hasUserRoleChanges = useMemo(() => {
    if (userAssignedRoleIds.size !== originalUserAssignedRoleIds.size) return true;
    for (const rid of userAssignedRoleIds) {
      if (!originalUserAssignedRoleIds.has(rid)) return true;
    }
    return false;
  }, [userAssignedRoleIds, originalUserAssignedRoleIds]);

  const handleToggleUserRole = (role: Role) => {
    if (!selectedUserDetail) return;

    // Protection: Root admin cannot have role 5 (SYSTEM_ADMIN) removed
    if (selectedUserDetail.is_root_admin && role.id === 5) {
      toast({
        title: "Tài khoản được bảo vệ",
        description: "Vai trò Quản trị viên tối cao của Super Admin là bắt buộc và không thể gỡ bỏ.",
        variant: "destructive",
      });
      return;
    }

    // Protection: Root admin cannot be altered by non-root
    if (selectedUserDetail.is_root_admin && currentUser?.id !== "1") {
      toast({
        title: "Tài khoản được bảo vệ",
        description: "Bạn không thể thay đổi vai trò của Quản Trị Viên Tối Cao (Super Admin).",
        variant: "destructive",
      });
      return;
    }

    const next = new Set(userAssignedRoleIds);
    if (next.has(role.id)) {
      if (next.size === 1) {
        toast({
          title: "Yêu cầu tối thiểu 1 vai trò",
          description: "Mỗi tài khoản phải có ít nhất 1 vai trò đang hoạt động.",
          variant: "destructive",
        });
        return;
      }
      next.delete(role.id);
    } else {
      next.add(role.id);
    }
    setUserAssignedRoleIds(next);
  };

  const handleSaveUserRoles = async () => {
    if (!selectedUserId || !selectedUserDetail) return;

    if (!userRoleAssignReason.trim()) {
      toast({
        title: "Thiếu lý do thay đổi",
        description: "Vui lòng nhập lý do thay đổi vai trò người dùng để lưu nhật ký kiểm toán bắt buộc.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSavingUserRoles(true);
      await permissionsService.assignUserRoles(selectedUserId, {
        role_ids: Array.from(userAssignedRoleIds),
        reason: userRoleAssignReason.trim(),
      });

      toast({
        title: "Phân vai trò thành công",
        description: `Đã cập nhật các vai trò cho người dùng '${selectedUserDetail.full_name || selectedUserDetail.email}'.`,
      });

      setOriginalUserAssignedRoleIds(new Set(userAssignedRoleIds));
      setUserRoleAssignReason("");

      // Refresh users list and user roles detail
      await loadUsersWithRoles();
      await handleSelectUser(selectedUserId);
    } catch (err: unknown) {
      toast({
        title: "Lỗi cập nhật vai trò người dùng",
        description: err instanceof Error ? err.message : "Vui lòng thử lại",
        variant: "destructive",
      });
    } finally {
      setSavingUserRoles(false);
    }
  };

  const handleResetUserRoles = () => {
    setUserAssignedRoleIds(new Set(originalUserAssignedRoleIds));
    setUserRoleAssignReason("");
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return usersWithRoles.filter((u) => {
      const matchSearch =
        u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        (u.full_name && u.full_name.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
        (u.phone && u.phone.includes(userSearchTerm));
      if (!matchSearch) return false;

      if (userBaseRoleFilter === "all") return true;
      const primary = roles.find((r) => r.id === u.role_id);
      const bRole = primary?.base_role || (u.role_id === 5 ? "admin" : u.role_id === 4 ? "manager" : u.role_id === 3 ? "staff" : "member");
      return bRole === userBaseRoleFilter;
    });
  }, [usersWithRoles, userSearchTerm, userBaseRoleFilter, roles]);

  // --------------------------------------------
  // TAB 3 HELPERS & ACTIONS (AUDIT LOGS)
  // --------------------------------------------

  const loadAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      const res = await permissionsService.getAuditLogs({
        action: auditActionFilter === "all" ? undefined : auditActionFilter,
        search: auditSearch || undefined,
        from_date: auditFromDate || undefined,
        to_date: auditToDate || undefined,
        page: auditPage,
        limit: auditLimit,
      });

      setAuditLogs(res.data.logs || []);
      setAuditTotal(res.data.total || 0);
    } catch (err: unknown) {
      toast({
        title: "Lỗi tải nhật ký kiểm toán",
        description: err instanceof Error ? err.message : "Vui lòng thử lại",
        variant: "destructive",
      });
    } finally {
      setLoadingAudit(false);
    }
  };

  // Load audit logs when tab is selected or filters change
  useEffect(() => {
    if (activeTab === "audit") {
      loadAuditLogs();
    } else if (activeTab === "users" && usersWithRoles.length === 0) {
      loadUsersWithRoles();
    }
  }, [activeTab, auditPage, auditActionFilter]);

  const handleSearchAudit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuditPage(1);
    loadAuditLogs();
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "ROLE_CREATE":
        return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Tạo vai trò</Badge>;
      case "ROLE_UPDATE":
        return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30">Cập nhật vai trò</Badge>;
      case "ROLE_DELETE":
        return <Badge className="bg-red-500/15 text-red-500 border-red-500/30">Xóa vai trò</Badge>;
      case "ROLE_PERMISSIONS_SYNC":
        return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">Cập nhật quyền</Badge>;
      case "USER_ROLES_ASSIGN":
        return <Badge className="bg-purple-500/15 text-purple-500 border-purple-500/30">Gán vai trò người dùng</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-medium">Đang tải kiến trúc phân quyền động...</p>
      </div>
    );
  }

  const isSuperAdmin =
    currentUser?.id === "1" ||
    (currentUser as any)?.id === 1 ||
    currentUser?.email === "admin@galaxy.vn" ||
    (currentUser as any)?.role_id === 5 ||
    (currentUser as any)?.roles?.some((r: any) => r.id === 5 || r.code === "SYSTEM_ADMIN");

  const hasRoleManagementPerm =
    isSuperAdmin ||
    (Array.isArray((currentUser as any)?.permissions) &&
      ((currentUser as any).permissions.includes("system.roles") ||
       (currentUser as any).permissions.includes("system.permissions") ||
       (currentUser as any).permissions.includes("users.change_role")));

  if (!hasRoleManagementPerm) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4 pt-20">
        <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Không có quyền truy cập</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Tài khoản <strong>{currentUser?.email}</strong> thuộc vai trò tùy chỉnh không có quyền quản lý phân quyền hệ thống (<code>system.roles</code>).
        </p>
        <Button onClick={() => window.history.back()} variant="outline" className="mt-2">
          Quay lại trang trước
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 w-full">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Shield className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Quản Trị Phân Quyền Động (Enterprise RBAC)
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Định nghĩa vai trò tùy chỉnh, quản lý ma trận quyền hạn, phân bổ đa vai trò và kiểm toán hệ thống
              </p>
            </div>
          </div>
        </div>

        {/* Global summary badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="px-3 py-1 text-xs">
            Tổng vai trò: <strong className="ml-1 text-primary">{roles.length}</strong>
          </Badge>
          <Badge variant="outline" className="px-3 py-1 text-xs">
            Quyền hạn: <strong className="ml-1 text-emerald-500">{allPermissions.length}</strong>
          </Badge>
          <Badge variant="outline" className="px-3 py-1 text-xs">
            Modules: <strong className="ml-1 text-purple-500">{Object.keys(groupedPermissions).length}</strong>
          </Badge>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "roles" | "users" | "audit")}
        className="w-full space-y-6"
      >
        <TabsList className="grid grid-cols-1 sm:grid-cols-3 w-full sm:w-auto sm:inline-flex h-auto p-1 bg-muted/60">
          <TabsTrigger
            value="roles"
            className="flex items-center gap-2 py-2.5 px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Key className="h-4 w-4" />
            <span className="font-semibold text-sm">1. Vai trò & Ma trận quyền</span>
          </TabsTrigger>
          <TabsTrigger
            value="users"
            className="flex items-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Users className="h-4 w-4" />
            <span className="font-semibold text-sm">2. Gán vai trò người dùng</span>
          </TabsTrigger>
          <TabsTrigger
            value="audit"
            className="flex items-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <History className="h-4 w-4" />
            <span className="font-semibold text-sm">3. Nhật ký kiểm toán</span>
          </TabsTrigger>
        </TabsList>

        {/* ========================================================= */}
        {/* TAB 1: VAI TRÒ & MA TRẬN QUYỀN                            */}
        {/* ========================================================= */}
        <TabsContent value="roles" className="space-y-6 m-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Pane: Role List (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        Danh Sách Vai Trò
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Hệ thống & Tùy chỉnh người dùng
                      </CardDescription>
                    </div>
                    <Button
                      size="sm"
                      className="gap-1.5 h-8 text-xs font-semibold"
                      onClick={() => setIsCreateRoleOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Tạo vai trò
                    </Button>
                  </div>

                  {/* Search role */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Tìm vai trò..."
                      value={roleSearchTerm}
                      onChange={(e) => setRoleSearchTerm(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>

                  {/* Filter role type */}
                  <div className="flex gap-1 p-0.5 bg-muted rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setRoleFilterType("all")}
                      className={`flex-1 py-1 rounded-md font-medium transition-all ${
                        roleFilterType === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Tất cả ({roles.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoleFilterType("system")}
                      className={`flex-1 py-1 rounded-md font-medium transition-all ${
                        roleFilterType === "system" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Hệ thống ({roles.filter((r) => r.is_system === 1).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoleFilterType("custom")}
                      className={`flex-1 py-1 rounded-md font-medium transition-all ${
                        roleFilterType === "custom" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Tùy chỉnh ({roles.filter((r) => r.is_system === 0).length})
                    </button>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-2 max-h-[640px] overflow-y-auto pr-1">
                  {filteredRoles.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      Không tìm thấy vai trò phù hợp
                    </div>
                  ) : (
                    filteredRoles.map((role) => {
                      const isSelected = role.id === selectedRoleId;
                      const baseMeta = BASE_ROLE_INFO[role.base_role] || BASE_ROLE_INFO.staff;
                      return (
                        <div
                          key={role.id}
                          onClick={() => handleSelectRole(role.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            isSelected
                              ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/30"
                              : "border-border/60 hover:bg-accent/50 hover:border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  role.is_active ? "bg-emerald-500" : "bg-gray-400"
                                }`}
                              />
                              <h4 className="font-semibold text-sm leading-tight text-foreground">
                                {role.display_name}
                              </h4>
                            </div>
                            {role.is_system === 1 ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted/80 gap-1 text-muted-foreground shrink-0">
                                <Lock className="h-2.5 w-2.5" />
                                Hệ thống
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                                Tùy chỉnh
                              </Badge>
                            )}
                          </div>

                          {role.code && (
                            <p className="text-[11px] font-mono text-muted-foreground mt-1">
                              {role.code}
                            </p>
                          )}

                          {role.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                              {role.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/40 text-[11px]">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${baseMeta.badgeClass}`}>
                              {baseMeta.label}
                            </Badge>
                            <span className="text-muted-foreground">
                              {role.user_count || 0} người dùng • {role.permission_ids?.length || 0} quyền
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Pane: Selected Role & Permission Matrix (8 cols) */}
            <div className="lg:col-span-8 space-y-4">
              {currentRole ? (
                <>
                  {/* Role Header Detail Card */}
                  <Card className="border-border shadow-sm">
                    <CardHeader className="pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <CardTitle className="text-xl font-bold">
                              {currentRole.display_name}
                            </CardTitle>
                            {currentRole.code && (
                              <Badge variant="outline" className="font-mono text-xs">
                                {currentRole.code}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={BASE_ROLE_INFO[currentRole.base_role]?.badgeClass}
                            >
                              Loại tài khoản: {BASE_ROLE_INFO[currentRole.base_role]?.label}
                            </Badge>
                            {currentRole.is_system === 1 ? (
                              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1">
                                <Lock className="h-3 w-3" />
                                Mặc định (Chỉ đọc)
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                Vai trò tùy chỉnh
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="text-xs">
                            {currentRole.description || "Chưa có mô tả chi tiết cho vai trò này."}
                          </CardDescription>
                        </div>

                        {/* Action buttons for Custom Roles */}
                        {currentRole.is_system === 0 && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              onClick={openEditRoleDialog}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              Sửa vai trò
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900"
                              onClick={() => setIsDeleteRoleOpen(true)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Xóa vai trò
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* System Role Protection Banner */}
                      {currentRole.is_system === 1 ? (
                        <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
                          <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                          <div>
                            <strong>Vai trò hệ thống mặc định (Chỉ đọc):</strong> Quyền của các vai trò hệ thống cốt lõi (Admin, Manager, Staff, Member) được thiết lập cố định để bảo vệ an toàn cấu trúc vận hành của rạp và không thể chỉnh sửa hay gỡ bỏ quyền.
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                          <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <strong>Phạm vi tài khoản ({currentRole.base_role.toUpperCase()}):</strong> Bạn có thể tùy chỉnh bật/tắt các quyền trong phạm vi được giao. Các quyền vượt thẩm quyền của nhóm tài khoản này đã được tự động khóa an toàn.
                          </div>
                        </div>
                      )}
                    </CardHeader>

                    {/* Permission Matrix Controls */}
                    <CardContent className="pt-0 pb-3">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t pt-3">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Tìm quyền hạn (tên, mã code)..."
                              value={permSearchTerm}
                              onChange={(e) => setPermSearchTerm(e.target.value)}
                              className="pl-8 h-8 text-xs"
                            />
                          </div>
                          <Select value={permModuleFilter} onValueChange={setPermModuleFilter}>
                            <SelectTrigger className="w-[150px] h-8 text-xs">
                              <SelectValue placeholder="Lọc module" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Tất cả modules</SelectItem>
                              {Object.keys(groupedPermissions).map((mod) => (
                                <SelectItem key={mod} value={mod}>
                                  {MODULE_META[mod]?.label || mod}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs px-2.5 text-muted-foreground hover:text-foreground shrink-0"
                            onClick={() => {
                              if (openAccordionModules.length > 0) {
                                setOpenAccordionModules([]);
                              } else {
                                setOpenAccordionModules(Object.keys(groupedPermissions));
                              }
                            }}
                          >
                            {openAccordionModules.length > 0 ? "Thu gọn tất cả" : "Mở tất cả"}
                          </Button>
                        </div>

                        {/* Batch Action Buttons */}
                        {currentRole.is_system === 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs px-2.5"
                              onClick={handleSelectAllPerms}
                            >
                              Chọn tất cả hợp lệ
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs px-2.5"
                              onClick={handleDeselectAllPerms}
                            >
                              Bỏ chọn tất cả
                            </Button>
                            {hasPermChanges && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground"
                                onClick={handleResetPerms}
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                Hoàn tác
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Summary indicator */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                        <span>
                          Đã chọn: <strong className="text-primary">{selectedPermissionIds.size}</strong> / {allPermissions.length} quyền hệ thống
                        </span>
                        {hasPermChanges && (
                          <span className="text-amber-500 font-medium flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Có thay đổi chưa lưu
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Modules Accordion / Matrix with Dedicated Scrollbar */}
                  <div className="max-h-[580px] overflow-y-auto pr-2 space-y-3 rounded-xl border border-border/50 p-2.5 bg-muted/10 shadow-xs">
                    <Accordion
                      type="multiple"
                      value={openAccordionModules}
                      onValueChange={setOpenAccordionModules}
                      className="space-y-3"
                    >
                      {Object.keys(groupedPermissions)
                        .filter((mod) => permModuleFilter === "all" || permModuleFilter === mod)
                        .map((moduleName) => {
                          const allModulePerms = groupedPermissions[moduleName] || [];
                          // Filter by search
                          const visiblePerms = allModulePerms.filter((p) => {
                            if (!permSearchTerm.trim()) return true;
                            const term = permSearchTerm.toLowerCase();
                            return (
                              p.name.toLowerCase().includes(term) ||
                              p.display_name.toLowerCase().includes(term) ||
                              (p.description && p.description.toLowerCase().includes(term))
                            );
                          });

                          if (visiblePerms.length === 0) return null;

                          const modMeta = MODULE_META[moduleName] || {
                            label: moduleName,
                            color: "bg-gray-500",
                            icon: Shield,
                          };
                          const IconComp = modMeta.icon;

                          // Count selected within module
                          const selectedCount = visiblePerms.filter((p) =>
                            selectedPermissionIds.has(p.id)
                          ).length;

                          const validPermsInModule = visiblePerms.filter(
                            (p) => !checkPermissionRestriction(p, currentRole.base_role).restricted
                          );
                          const allValidSelected =
                            validPermsInModule.length > 0 &&
                            validPermsInModule.every((p) => selectedPermissionIds.has(p.id));

                          return (
                            <Card key={moduleName} className="border-border overflow-hidden shadow-xs">
                              <AccordionItem value={moduleName} className="border-0">
                                <div className="flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors">
                                  <div className="flex items-center gap-3">
                                    {currentRole.is_system === 0 && validPermsInModule.length > 0 && (
                                      <Checkbox
                                        checked={allValidSelected}
                                        onCheckedChange={() => handleToggleModuleAll(moduleName)}
                                        aria-label={`Chọn tất cả quyền trong ${modMeta.label}`}
                                      />
                                    )}
                                    <div className="flex items-center gap-2">
                                      <div className={`p-1.5 rounded-md ${modMeta.color} text-white`}>
                                        <IconComp className="h-4 w-4" />
                                      </div>
                                      <div>
                                        <span className="font-semibold text-sm">
                                          {modMeta.label}
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                          ({moduleName})
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                      {selectedCount} / {visiblePerms.length} quyền
                                    </Badge>
                                    <AccordionTrigger className="py-0 px-1 hover:no-underline" />
                                  </div>
                                </div>

                                <AccordionContent className="p-4 pt-3">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    {visiblePerms.map((perm) => {
                                      const isChecked = selectedPermissionIds.has(perm.id);
                                      const restriction = checkPermissionRestriction(
                                        perm,
                                        currentRole.base_role
                                      );
                                      const isDisabled =
                                        currentRole.is_system === 1 || restriction.restricted;

                                      return (
                                        <div
                                          key={perm.id}
                                          onClick={() => {
                                            if (!isDisabled) handleTogglePermission(perm.id);
                                          }}
                                          className={`p-3 rounded-lg border transition-all text-xs flex items-start gap-3 ${
                                            isDisabled
                                              ? restriction.restricted
                                                ? "bg-muted/30 border-dashed border-red-500/20 opacity-60 cursor-not-allowed"
                                                : "bg-muted/20 border-border/40 cursor-default"
                                              : isChecked
                                              ? "bg-primary/5 border-primary/40 cursor-pointer shadow-2xs"
                                              : "bg-background border-border/70 hover:border-primary/50 cursor-pointer"
                                          }`}
                                        >
                                          <Checkbox
                                            checked={isChecked}
                                            disabled={isDisabled}
                                            onCheckedChange={() => {
                                              if (!isDisabled) handleTogglePermission(perm.id);
                                            }}
                                            className="mt-0.5"
                                          />
                                          <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex items-center justify-between gap-1 flex-wrap">
                                              <span className="font-semibold text-foreground">
                                                {perm.display_name}
                                              </span>
                                              {restriction.restricted ? (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[9px] px-1 py-0 bg-red-500/10 text-red-500 border-red-500/20 shrink-0 gap-0.5"
                                                >
                                                  <Lock className="h-2 w-2" />
                                                  Vượt thẩm quyền
                                                </Badge>
                                              ) : (
                                                <span className="font-mono text-[10px] text-muted-foreground">
                                                  {perm.name}
                                                </span>
                                              )}
                                            </div>

                                            {perm.description && (
                                              <p className="text-muted-foreground text-[11px] leading-relaxed">
                                                {perm.description}
                                              </p>
                                            )}

                                            {restriction.restricted && (
                                              <p className="text-[10px] text-red-500/80 italic mt-0.5">
                                                {restriction.reason}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Card>
                          );
                        })}
                    </Accordion>
                  </div>

                  {/* Fixed Floating Save Banner if changes exist */}
                  {currentRole.is_system === 0 && hasPermChanges && (
                    <div className="sticky bottom-4 z-40 bg-card border border-primary/40 rounded-xl p-3 shadow-xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">Có thay đổi ma trận quyền chưa lưu</div>
                          <div className="text-xs text-muted-foreground">
                            Đã thay đổi quyền hạn cho vai trò '{currentRole.display_name}'.
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleResetPerms}>
                          Hủy bỏ
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1.5 shadow-sm"
                          onClick={() => setSavePermsDialogOpen(true)}
                        >
                          <Save className="h-4 w-4" />
                          Lưu ma trận quyền
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 border rounded-xl bg-card text-muted-foreground">
                  Chọn một vai trò từ danh sách bên trái để cấu hình ma trận quyền
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ========================================================= */}
        {/* TAB 2: GÁN VAI TRÒ NGƯỜI DÙNG (MULTI-ROLE ASSIGNMENT)     */}
        {/* ========================================================= */}
        <TabsContent value="users" className="space-y-6 m-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Pane: User List (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        Danh Sách Người Dùng
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Chọn tài khoản để phân bổ đa vai trò
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {filteredUsers.length} tài khoản
                    </Badge>
                  </div>

                  {/* Search users */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Tìm theo tên, email, sđt..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>

                  {/* Filter base role */}
                  <Select value={userBaseRoleFilter} onValueChange={setUserBaseRoleFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Lọc nhóm tài khoản" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả nhóm tài khoản</SelectItem>
                      <SelectItem value="admin">Quản trị viên (Admin)</SelectItem>
                      <SelectItem value="manager">Quản lý rạp (Manager)</SelectItem>
                      <SelectItem value="staff">Nhân viên (Staff)</SelectItem>
                      <SelectItem value="member">Thành viên (Member)</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>

                <CardContent className="pt-0 space-y-2 max-h-[640px] overflow-y-auto pr-1">
                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      Không tìm thấy người dùng phù hợp
                    </div>
                  ) : (
                    filteredUsers.map((user) => {
                      const isSelected = user.id === selectedUserId;
                      const primary = roles.find((r) => r.id === user.role_id);
                      const baseRole = primary?.base_role || (user.role_id === 5 ? "admin" : user.role_id === 4 ? "manager" : user.role_id === 3 ? "staff" : "member");
                      const baseMeta = BASE_ROLE_INFO[baseRole] || BASE_ROLE_INFO.member;
                      const isSuperAdmin = user.id === 1 || user.email === "admin@galaxy.vn";
                      const isSelf = String(currentUser?.id) === String(user.id);

                      return (
                        <div
                          key={user.id}
                          onClick={() => handleSelectUser(user.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            isSelected
                              ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/30"
                              : "border-border/60 hover:bg-accent/50 hover:border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0 border border-primary/20">
                                {user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-semibold text-xs text-foreground truncate">
                                  {user.full_name || "Chưa đặt tên"}
                                </h4>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {user.email}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {isSuperAdmin && (
                                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[9px] px-1 py-0">
                                  👑 Super Admin
                                </Badge>
                              )}
                              {isSelf && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-500">
                                  👤 Chính bạn
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/40 text-[11px]">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${baseMeta.badgeClass}`}>
                              {baseMeta.label}
                            </Badge>
                            <span className="text-muted-foreground text-[10px]">
                              {user.roles?.length || 1} vai trò đang gán
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Pane: Selected User Roles Assignment & Effective Preview (8 cols) */}
            <div className="lg:col-span-8 space-y-4">
              {loadingUserRolesDetail ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] border rounded-xl bg-card">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground mt-2">Đang nạp thông tin phân vai trò...</p>
                </div>
              ) : selectedUserDetail ? (
                <>
                  {/* User Profile Summary Card */}
                  <Card className="border-border shadow-sm">
                    <CardHeader className="pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-lg flex items-center justify-center border border-primary/30">
                            {selectedUserDetail.full_name
                              ? selectedUserDetail.full_name.charAt(0).toUpperCase()
                              : selectedUserDetail.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <CardTitle className="text-lg font-bold">
                                {selectedUserDetail.full_name || "Chưa cập nhật họ tên"}
                              </CardTitle>
                              {selectedUserDetail.is_root_admin && (
                                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-xs">
                                  👑 Super Admin Tối Cao
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={BASE_ROLE_INFO[selectedUserBaseRole]?.badgeClass}
                              >
                                {BASE_ROLE_INFO[selectedUserBaseRole]?.label}
                              </Badge>
                            </div>
                            <CardDescription className="text-xs mt-0.5">
                              {selectedUserDetail.email} • {selectedUserDetail.phone || "Chưa có SĐT"} • Trạng thái:{" "}
                              <span className="font-semibold text-emerald-500">{selectedUserDetail.status}</span>
                            </CardDescription>
                          </div>
                        </div>

                        {/* Reset button */}
                        {hasUserRoleChanges && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs self-start sm:self-center"
                            onClick={handleResetUserRoles}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Đặt lại
                          </Button>
                        )}
                      </div>

                      {/* Security Banners */}
                      {selectedUserDetail.is_root_admin && (
                        <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-800 dark:text-red-300 flex items-start gap-2.5">
                          <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <strong>Bảo vệ Quản Trị Viên Tối Cao (Super Admin):</strong> Tài khoản này sở hữu quyền hạn gốc cao nhất của toàn hệ thống. Mọi tài khoản khác không được phép can thiệp, gỡ bỏ vai trò quản trị hoặc thay đổi thiết lập của Super Admin.
                          </div>
                        </div>
                      )}

                      {String(currentUser?.id) === String(selectedUserDetail.id) && (
                        <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <strong>Cảnh báo tự sửa đổi:</strong> Bạn đang phân vai trò cho chính tài khoản của mình. Mọi thay đổi quyền hạn sẽ có hiệu lực trực tiếp trên phiên làm việc hiện tại.
                          </div>
                        </div>
                      )}
                    </CardHeader>
                  </Card>

                  {/* Compatible Roles Checklist */}
                  <Card className="border-border shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base font-bold flex items-center gap-2">
                            <Key className="h-4 w-4 text-primary" />
                            Vai Trò Tương Thích Có Thể Gán
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Áp dụng nghiêm ngặt cho nhóm tài khoản:{" "}
                            <strong className="text-foreground uppercase">
                              {selectedUserBaseRole}
                            </strong>{" "}
                            (1 tài khoản có thể có nhiều vai trò đồng thời)
                          </CardDescription>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {userAssignedRoleIds.size} vai trò đã gán
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                        {compatibleRoles.map((role) => {
                          const isAssigned = userAssignedRoleIds.has(role.id);
                          const isSystemBase = role.is_system === 1;
                          const isLocked = (selectedUserDetail.is_root_admin && role.id === 5) || (selectedUserDetail.is_root_admin && currentUser?.id !== "1");

                          return (
                            <div
                              key={role.id}
                              onClick={() => {
                                if (!isLocked) handleToggleUserRole(role);
                              }}
                              className={`p-3.5 rounded-lg border transition-all flex items-start gap-3 ${
                                isLocked
                                  ? "bg-muted/40 border-border cursor-default"
                                  : isAssigned
                                  ? "bg-primary/5 border-primary/50 cursor-pointer shadow-2xs"
                                  : "bg-background border-border/80 hover:border-primary/40 cursor-pointer"
                              }`}
                            >
                              <Checkbox
                                checked={isAssigned}
                                disabled={isLocked}
                                onCheckedChange={() => {
                                  if (!isLocked) handleToggleUserRole(role);
                                }}
                                className="mt-0.5"
                              />

                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-1 flex-wrap">
                                  <span className="font-semibold text-xs text-foreground">
                                    {role.display_name}
                                  </span>
                                  {isSystemBase ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                    >
                                      Hệ thống mặc định
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                    >
                                      Tùy chỉnh
                                    </Badge>
                                  )}
                                </div>

                                {role.code && (
                                  <p className="text-[10px] font-mono text-muted-foreground">
                                    {role.code}
                                  </p>
                                )}

                                {role.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                                    {role.description}
                                  </p>
                                )}

                                <p className="text-[10px] text-muted-foreground font-medium pt-1">
                                  Bao gồm: {role.permission_ids?.length || 0} quyền hạn
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {compatibleRoles.length === 0 && (
                        <div className="text-center py-6 text-xs text-muted-foreground">
                          Không có vai trò tùy chỉnh nào tương thích với nhóm tài khoản này. Hãy tạo vai trò mới ở Tab 1.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Effective Permissions Preview Accordion */}
                  <Card className="border-border shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base font-bold flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                            Xem Trước Tổng Quyền Thực Thi (Effective Permissions)
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Hợp nhất toàn bộ quyền hạn từ tất cả các vai trò được chọn của người dùng
                          </CardDescription>
                        </div>
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs">
                          {previewEffectivePermissions.length} quyền thực thi
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0">
                      <Accordion type="multiple" className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                        {Object.keys(previewGroupedEffectivePerms).map((mod) => {
                          const permsInMod = previewGroupedEffectivePerms[mod] || [];
                          const modMeta = MODULE_META[mod] || {
                            label: mod,
                            color: "bg-gray-500",
                            icon: Shield,
                          };
                          const IconC = modMeta.icon;

                          return (
                            <AccordionItem key={mod} value={mod} className="border rounded-lg px-3">
                              <AccordionTrigger className="py-2.5 hover:no-underline text-xs font-semibold">
                                <div className="flex items-center gap-2">
                                  <div className={`p-1 rounded ${modMeta.color} text-white`}>
                                    <IconC className="h-3 w-3" />
                                  </div>
                                  <span>{modMeta.label}</span>
                                  <Badge variant="secondary" className="text-[10px] ml-1">
                                    {permsInMod.length} quyền
                                  </Badge>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="pt-1 pb-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {permsInMod.map((p) => (
                                    <div
                                      key={p.id}
                                      className="p-1.5 rounded bg-muted/40 border border-border/50 text-[11px] flex items-center justify-between"
                                    >
                                      <span className="font-medium text-foreground">{p.display_name}</span>
                                      <span className="font-mono text-[9px] text-muted-foreground">
                                        {p.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </CardContent>

                    {/* Action Form Footer */}
                    <CardFooter className="flex-col items-stretch gap-3 border-t pt-4 bg-muted/20">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                          Lý do thay đổi vai trò người dùng <span className="text-red-500">*</span>
                        </label>
                        <Input
                          placeholder="Ví dụ: Phân công thêm nhiệm vụ soát vé ca sáng / Bổ sung hỗ trợ quản lý bắp nước..."
                          value={userRoleAssignReason}
                          onChange={(e) => setUserRoleAssignReason(e.target.value)}
                          className="h-9 text-xs"
                          disabled={selectedUserDetail.is_root_admin && currentUser?.id !== "1"}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Bắt buộc phải nhập lý do thay đổi để lưu vào Nhật Ký Kiểm Toán (Audit Log) theo tiêu chuẩn bảo mật.
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleResetUserRoles}
                          disabled={!hasUserRoleChanges || savingUserRoles}
                        >
                          Hủy thay đổi
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveUserRoles}
                          disabled={
                            !hasUserRoleChanges ||
                            !userRoleAssignReason.trim() ||
                            savingUserRoles ||
                            (selectedUserDetail.is_root_admin && currentUser?.id !== "1")
                          }
                          className="gap-1.5 shadow-sm"
                        >
                          {savingUserRoles && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          <Save className="h-3.5 w-3.5" />
                          Lưu vai trò người dùng
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                </>
              ) : (
                <div className="text-center py-16 border rounded-xl bg-card text-muted-foreground">
                  Chọn một người dùng từ danh sách bên trái để phân bổ vai trò
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ========================================================= */}
        {/* TAB 3: NHẬT KÝ KIỂM TOÁN PHÂN QUYỀN (AUDIT LOGS)          */}
        {/* ========================================================= */}
        <TabsContent value="audit" className="space-y-6 m-0">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    Nhật Ký Kiểm Toán Phân Quyền (Append-Only Audit Trail)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Ghi vết toàn bộ hành vi tạo, sửa, xóa vai trò và gán quyền theo tiêu chuẩn an toàn
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs self-start sm:self-center"
                  onClick={loadAuditLogs}
                  disabled={loadingAudit}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingAudit ? "animate-spin" : ""}`} />
                  Làm mới
                </Button>
              </div>

              {/* Filters toolbar */}
              <form onSubmit={handleSearchAudit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t">
                {/* Action Filter */}
                <Select value={auditActionFilter} onValueChange={(val) => { setAuditActionFilter(val); setAuditPage(1); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Loại hành động" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả hành động</SelectItem>
                    <SelectItem value="ROLE_CREATE">Tạo vai trò</SelectItem>
                    <SelectItem value="ROLE_UPDATE">Cập nhật vai trò</SelectItem>
                    <SelectItem value="ROLE_DELETE">Xóa vai trò</SelectItem>
                    <SelectItem value="ROLE_PERMISSIONS_SYNC">Cập nhật ma trận quyền</SelectItem>
                    <SelectItem value="USER_ROLES_ASSIGN">Gán vai trò người dùng</SelectItem>
                  </SelectContent>
                </Select>

                {/* Search Text */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Tìm người thực hiện, đối tượng..."
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>

                {/* From Date */}
                <Input
                  type="date"
                  value={auditFromDate}
                  onChange={(e) => setAuditFromDate(e.target.value)}
                  className="h-8 text-xs"
                />

                {/* To Date & Submit */}
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={auditToDate}
                    onChange={(e) => setAuditToDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button type="submit" size="sm" className="h-8 text-xs px-3">
                    Lọc
                  </Button>
                </div>
              </form>
            </CardHeader>

            <CardContent className="p-0">
              <div className="border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[170px] text-xs">Thời gian</TableHead>
                      <TableHead className="w-[180px] text-xs">Người thực hiện</TableHead>
                      <TableHead className="w-[150px] text-xs">Hành động</TableHead>
                      <TableHead className="w-[200px] text-xs">Đối tượng tác động</TableHead>
                      <TableHead className="text-xs">Lý do thay đổi</TableHead>
                      <TableHead className="w-[100px] text-right text-xs">Chi tiết</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingAudit ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                          <p className="text-xs text-muted-foreground mt-2">Đang tải nhật ký kiểm toán...</p>
                        </TableCell>
                      </TableRow>
                    ) : auditLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-xs">
                          Chưa có bản ghi nhật ký kiểm toán nào phù hợp với bộ lọc
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditLogs.map((log) => (
                        <TableRow key={log.id} className="hover:bg-muted/30">
                          <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString("vi-VN")}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="font-semibold text-foreground truncate max-w-[170px]">
                              {log.actor_name || "Hệ thống"}
                            </div>
                            {log.ip_address && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                IP: {log.ip_address}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {getActionBadge(log.action)}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-[10px] font-medium mr-1.5">
                              {log.target_type}
                            </Badge>
                            <span className="font-semibold text-foreground">
                              {log.target_name || `#${log.target_id}`}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {log.reason || "Không ghi rõ"}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary"
                              onClick={() => {
                                setSelectedAuditLog(log);
                                setIsAuditDetailOpen(true);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Xem
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between p-4 border-t text-xs text-muted-foreground">
                <span>
                  Hiển thị{" "}
                  <strong>
                    {auditLogs.length > 0 ? (auditPage - 1) * auditLimit + 1 : 0} -{" "}
                    {Math.min(auditPage * auditLimit, auditTotal)}
                  </strong>{" "}
                  trong tổng số <strong>{auditTotal}</strong> bản ghi
                </span>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-2.5"
                    disabled={auditPage <= 1 || loadingAudit}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  >
                    Trang trước
                  </Button>
                  <span className="px-2 font-medium text-foreground">
                    Trang {auditPage} / {Math.max(1, Math.ceil(auditTotal / auditLimit))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-2.5"
                    disabled={auditPage >= Math.ceil(auditTotal / auditLimit) || loadingAudit}
                    onClick={() => setAuditPage((p) => p + 1)}
                  >
                    Trang sau
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ========================================================= */}
      {/* DIALOGS                                                   */}
      {/* ========================================================= */}

      {/* 1. Create Role Dialog */}
      <Dialog open={isCreateRoleOpen} onOpenChange={setIsCreateRoleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Tạo Vai Trò Mới (Custom Role)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Tự do đặt tên vai trò theo nhu cầu thực tế của rạp và liên kết với nhóm tài khoản tương thích.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold">
                Tên vai trò (Tự do đặt tên) <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="Ví dụ: Nhân viên soát vé ca tối, Admin phụ, Quản lý ca chiếu..."
                value={createRoleForm.name}
                onChange={(e) =>
                  setCreateRoleForm({
                    ...createRoleForm,
                    name: e.target.value,
                    display_name: createRoleForm.display_name || e.target.value,
                  })
                }
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Mã định danh (Code)</label>
                <Input
                  placeholder="Gợi ý: STAFF_TICKET"
                  value={createRoleForm.code}
                  onChange={(e) =>
                    setCreateRoleForm({ ...createRoleForm, code: e.target.value })
                  }
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">
                  Nhóm tài khoản áp dụng <span className="text-red-500">*</span>
                </label>
                <Select
                  value={createRoleForm.base_role}
                  onValueChange={(val) =>
                    setCreateRoleForm({
                      ...createRoleForm,
                      base_role: val as "admin" | "manager" | "staff" | "member",
                    })
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Chọn nhóm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Nhân viên (Staff)</SelectItem>
                    <SelectItem value="manager">Quản lý rạp (Manager)</SelectItem>
                    <SelectItem value="admin">Quản trị viên (Admin)</SelectItem>
                    <SelectItem value="member">Thành viên (Member)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300">
              <strong>Lưu ý quan trọng:</strong> Khi chọn nhóm tài khoản là{" "}
              <strong className="uppercase">'{createRoleForm.base_role}'</strong>, vai trò này sẽ{" "}
              <strong>CHỈ ĐƯỢC PHÉP</strong> gán cho các tài khoản thuộc nhóm '{createRoleForm.base_role}' (không thể gán nhầm cho nhóm khác).
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Mô tả trách nhiệm</label>
              <Textarea
                placeholder="Mô tả tóm tắt trách nhiệm, ca làm việc hoặc phạm vi quyền của vai trò..."
                value={createRoleForm.description}
                onChange={(e) =>
                  setCreateRoleForm({ ...createRoleForm, description: e.target.value })
                }
                className="text-xs min-h-[60px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Lý do tạo vai trò</label>
              <Input
                placeholder="Ghi chú để lưu nhật ký kiểm toán (tùy chọn)..."
                value={createRoleForm.reason}
                onChange={(e) =>
                  setCreateRoleForm({ ...createRoleForm, reason: e.target.value })
                }
                className="h-9 text-xs"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold">Kích hoạt vai trò</div>
                <div className="text-[11px] text-muted-foreground">
                  Cho phép gán vai trò này cho tài khoản ngay sau khi tạo
                </div>
              </div>
              <Switch
                checked={createRoleForm.is_active === 1}
                onCheckedChange={(checked) =>
                  setCreateRoleForm({ ...createRoleForm, is_active: checked ? 1 : 0 })
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCreateRoleOpen(false)} size="sm">
              Hủy
            </Button>
            <Button
              onClick={handleCreateRoleSubmit}
              disabled={creatingRole || !createRoleForm.name.trim()}
              size="sm"
            >
              {creatingRole && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Tạo vai trò
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Edit Role Dialog */}
      <Dialog open={isEditRoleOpen} onOpenChange={setIsEditRoleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              Sửa Thông Tin Vai Trò
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cập nhật tên hiển thị, mô tả và trạng thái hoạt động của vai trò.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Tên vai trò</label>
              <Input
                value={editRoleForm.display_name}
                onChange={(e) =>
                  setEditRoleForm({ ...editRoleForm, display_name: e.target.value })
                }
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Mô tả</label>
              <Textarea
                value={editRoleForm.description}
                onChange={(e) =>
                  setEditRoleForm({ ...editRoleForm, description: e.target.value })
                }
                className="text-xs min-h-[60px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Lý do cập nhật</label>
              <Input
                placeholder="Nhập lý do để ghi nhật ký kiểm toán..."
                value={editRoleForm.reason}
                onChange={(e) =>
                  setEditRoleForm({ ...editRoleForm, reason: e.target.value })
                }
                className="h-9 text-xs"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-semibold">Trạng thái kích hoạt</span>
              <Switch
                checked={Number(editRoleForm.is_active) === 1}
                onCheckedChange={(checked) =>
                  setEditRoleForm({ ...editRoleForm, is_active: checked ? 1 : 0 })
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsEditRoleOpen(false)} size="sm">
              Hủy
            </Button>
            <Button onClick={handleEditRoleSubmit} disabled={editingRole} size="sm">
              {editingRole && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Delete Role Dialog */}
      <Dialog open={isDeleteRoleOpen} onOpenChange={setIsDeleteRoleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Xác Nhận Xóa Vai Trò
            </DialogTitle>
            <DialogDescription className="text-xs">
              Hành động này sẽ xóa vai trò{" "}
              <strong className="text-foreground">'{currentRole?.display_name}'</strong> khỏi toàn bộ tài khoản đang được gán.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold">Lý do xóa vai trò (Bắt buộc cho Audit Log)</label>
            <Input
              placeholder="Ví dụ: Tái cơ cấu phòng ban / Hết nhu cầu phân công..."
              value={deleteRoleReason}
              onChange={(e) => setDeleteRoleReason(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDeleteRoleOpen(false)} size="sm">
              Hủy bỏ
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRoleSubmit}
              disabled={deletingRole || !deleteRoleReason.trim()}
              size="sm"
            >
              {deletingRole && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Save Permission Matrix Dialog */}
      <Dialog open={savePermsDialogOpen} onOpenChange={setSavePermsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5 text-primary" />
              Xác Nhận Lưu Ma Trận Quyền
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cập nhật quyền hạn cho vai trò{" "}
              <strong className="text-foreground">'{currentRole?.display_name}'</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold">
              Lý do thay đổi ma trận quyền <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Ví dụ: Bổ sung quyền kiểm tra vé vào phòng chiếu..."
              value={savePermsReason}
              onChange={(e) => setSavePermsReason(e.target.value)}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Thông tin này sẽ được lưu cố định vào Nhật Ký Kiểm Toán (Audit Log) để phục vụ thanh tra an toàn.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSavePermsDialogOpen(false)} size="sm">
              Hủy
            </Button>
            <Button
              onClick={handleSavePermsSubmit}
              disabled={savingPerms || !savePermsReason.trim()}
              size="sm"
            >
              {savingPerms && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Xác nhận lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Audit Log Detail Dialog */}
      <Dialog open={isAuditDetailOpen} onOpenChange={setIsAuditDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Chi Tiết Nhật Ký Kiểm Toán #{selectedAuditLog?.id}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Bản ghi kiểm toán bất biến (Immutable Audit Trail)
            </DialogDescription>
          </DialogHeader>

          {selectedAuditLog && (
            <div className="space-y-3.5 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40">
                <div>
                  <span className="text-muted-foreground">Thời gian:</span>{" "}
                  <strong>{new Date(selectedAuditLog.created_at).toLocaleString("vi-VN")}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Hành động:</span>{" "}
                  {getActionBadge(selectedAuditLog.action)}
                </div>
                <div>
                  <span className="text-muted-foreground">Người thực hiện:</span>{" "}
                  <strong>{selectedAuditLog.actor_name || "Hệ thống"}</strong> (ID: {selectedAuditLog.actor_id})
                </div>
                <div>
                  <span className="text-muted-foreground">Địa chỉ IP:</span>{" "}
                  <code className="font-mono">{selectedAuditLog.ip_address || "N/A"}</code>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Đối tượng:</span>{" "}
                  <Badge variant="outline" className="mr-1">{selectedAuditLog.target_type}</Badge>
                  <strong>{selectedAuditLog.target_name || `#${selectedAuditLog.target_id}`}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Lý do thay đổi:</span>{" "}
                  <strong className="text-foreground">{selectedAuditLog.reason || "Không ghi rõ"}</strong>
                </div>
              </div>

              {/* Old vs New Values */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <h5 className="font-semibold text-muted-foreground">Giá trị trước thay đổi (Old Value)</h5>
                  <pre className="p-3 rounded-lg bg-muted font-mono text-[11px] overflow-x-auto max-h-[220px]">
                    {selectedAuditLog.old_value
                      ? JSON.stringify(selectedAuditLog.old_value, null, 2)
                      : "null (Bản ghi mới)"}
                  </pre>
                </div>

                <div className="space-y-1">
                  <h5 className="font-semibold text-muted-foreground">Giá trị sau thay đổi (New Value)</h5>
                  <pre className="p-3 rounded-lg bg-muted font-mono text-[11px] overflow-x-auto max-h-[220px]">
                    {selectedAuditLog.new_value
                      ? JSON.stringify(selectedAuditLog.new_value, null, 2)
                      : "null (Đã xóa)"}
                  </pre>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAuditDetailOpen(false)} size="sm">
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
