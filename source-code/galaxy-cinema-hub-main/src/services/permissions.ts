import { apiCall, API_BASE_URL } from "@/lib/api";
import type {
  Permission,
  PermissionsResponse,
  RolePermissionsResponse,
  CreatePermissionData,
  UpdatePermissionData,
  AssignPermissionData,
  SyncPermissionsData,
  Role,
  RolesResponse,
  CreateRoleData,
  UpdateRoleData,
  UserWithRoles,
  AuditLog,
} from "@/types/permission";

const PERMISSIONS_BASE = `${API_BASE_URL}/api/permissions`;
const ROLES_BASE = `${API_BASE_URL}/api/roles`;

export const permissionsService = {
  // ============================================
  // PERMISSIONS
  // ============================================

  // Get all permissions
  getAllPermissions: async (filters?: { module?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.module) params.append("module", filters.module);
    if (filters?.search) params.append("search", filters.search);

    const query = params.toString();
    const url = query ? `${PERMISSIONS_BASE}?${query}` : PERMISSIONS_BASE;

    return await apiCall<PermissionsResponse>(url);
  },

  // Create permission
  createPermission: async (data: CreatePermissionData) => {
    return await apiCall<{
      success: boolean;
      data: { permission: Permission };
    }>(PERMISSIONS_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  // Update permission
  updatePermission: async (id: number, data: UpdatePermissionData) => {
    return await apiCall<{
      success: boolean;
      data: { permission: Permission };
    }>(`${PERMISSIONS_BASE}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  // Delete permission
  deletePermission: async (id: number) => {
    return await apiCall<{ success: boolean }>(`${PERMISSIONS_BASE}/${id}`, {
      method: "DELETE",
    });
  },

  // Toggle permission active/inactive (khóa/mở khóa)
  togglePermissionActive: async (id: number) => {
    return await apiCall<{
      success: boolean;
      data: { permission: Permission; message: string };
    }>(`${PERMISSIONS_BASE}/${id}/toggle-active`, {
      method: "PUT",
    });
  },

  // ============================================
  // ROLES MANAGEMENT (DYNAMIC RBAC)
  // ============================================

  // Get all roles
  getAllRoles: async (filters?: {
    base_role?: string;
    search?: string;
    is_active?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.base_role) params.append("base_role", filters.base_role);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.is_active !== undefined)
      params.append("is_active", String(filters.is_active));

    const query = params.toString();
    const url = query ? `${ROLES_BASE}?${query}` : ROLES_BASE;

    return await apiCall<RolesResponse>(url);
  },

  // Get role detail
  getRoleDetail: async (id: number) => {
    return await apiCall<{
      success: boolean;
      data: {
        role: Role;
        permissions: Permission[];
        users: any[];
      };
    }>(`${ROLES_BASE}/${id}`);
  },

  // Create custom role
  createRole: async (data: CreateRoleData) => {
    return await apiCall<{
      success: boolean;
      data: { role: Role; message: string };
    }>(ROLES_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  // Update role
  updateRole: async (id: number, data: UpdateRoleData) => {
    return await apiCall<{
      success: boolean;
      data: { role: Role; message: string };
    }>(`${ROLES_BASE}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  // Delete role
  deleteRole: async (id: number, reason?: string) => {
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return await apiCall<{ success: boolean; data: { message: string } }>(
      `${ROLES_BASE}/${id}${query}`,
      {
        method: "DELETE",
      },
    );
  },

  // Get role permissions
  getRolePermissions: async (roleId: number) => {
    return await apiCall<RolePermissionsResponse>(
      `${ROLES_BASE}/${roleId}/permissions`,
    );
  },

  // Assign permission to role
  assignPermission: async (roleId: number, data: AssignPermissionData) => {
    return await apiCall<{ success: boolean; data: { message: string } }>(
      `${ROLES_BASE}/${roleId}/permissions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  },

  // Revoke permission from role
  revokePermission: async (roleId: number, permissionId: number) => {
    return await apiCall<{ success: boolean; data: { message: string } }>(
      `${ROLES_BASE}/${roleId}/permissions/${permissionId}`,
      {
        method: "DELETE",
      },
    );
  },

  // Sync all permissions for role
  syncPermissions: async (roleId: number, data: SyncPermissionsData) => {
    return await apiCall<RolePermissionsResponse>(
      `${ROLES_BASE}/${roleId}/permissions/sync`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  },

  // ============================================
  // USER ROLES ASSIGNMENT (MULTI-ROLE)
  // ============================================

  // Get all users with roles
  getUsersWithRoles: async () => {
    return await apiCall<{
      success: boolean;
      data: { users: UserWithRoles[]; total: number };
    }>(`${API_BASE_URL}/api/users-with-roles`);
  },

  // Get single user roles detail & effective permissions
  getUserRolesDetail: async (userId: number) => {
    return await apiCall<{
      success: boolean;
      data: {
        user: UserWithRoles;
        roles: Role[];
        effective_permissions: Permission[];
        total_permissions: number;
      };
    }>(`${API_BASE_URL}/api/users/${userId}/roles`);
  },

  // Assign multiple roles to user
  assignUserRoles: async (
    userId: number,
    data: { role_ids: number[]; reason: string },
  ) => {
    return await apiCall<{
      success: boolean;
      data: {
        roles: Role[];
        effective_permissions: Permission[];
        message: string;
      };
    }>(`${API_BASE_URL}/api/users/${userId}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  // ============================================
  // AUDIT LOGS
  // ============================================

  getAuditLogs: async (filters?: {
    action?: string;
    search?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.action) params.append("action", filters.action);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.from_date) params.append("from_date", filters.from_date);
    if (filters?.to_date) params.append("to_date", filters.to_date);
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.limit) params.append("limit", String(filters.limit));

    const query = params.toString();
    const url = query
      ? `${API_BASE_URL}/api/audit-logs/permissions?${query}`
      : `${API_BASE_URL}/api/audit-logs/permissions`;

    return await apiCall<{
      success: boolean;
      data: {
        logs: AuditLog[];
        total: number;
        page: number;
        limit: number;
      };
    }>(url);
  },
};
