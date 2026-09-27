// Types for Permission Management & Dynamic RBAC

export interface Permission {
  id: number;
  name: string;
  display_name: string;
  description: string;
  module: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type BaseRoleType = "admin" | "manager" | "staff" | "member" | "guest";

export interface Role {
  id: number;
  name: string;
  code: string | null;
  display_name: string;
  description: string | null;
  base_role: BaseRoleType;
  is_system: number;
  is_active: number;
  created_at: string;
  updated_at?: string;
  user_count?: number;
  permission_count?: number;
  permission_ids?: number[];
  is_primary?: number;
  assigned_at?: string;
  reason?: string;
}

export interface PermissionsResponse {
  success: boolean;
  data: {
    permissions: Permission[];
    grouped: Record<string, Permission[]>;
    modules: string[];
  };
}

export interface RolesResponse {
  success: boolean;
  data: {
    roles: Role[];
    total: number;
  };
}

export interface RolePermissionsResponse {
  success: boolean;
  data: {
    role: Role;
    permissions: Permission[];
    grouped?: Record<string, Permission[]>;
    total: number;
  };
}

export interface CreatePermissionData {
  name: string;
  display_name: string;
  description?: string;
  module: string;
}

export interface UpdatePermissionData {
  display_name?: string;
  description?: string;
  module?: string;
}

export interface AssignPermissionData {
  permission_id: number;
}

export interface SyncPermissionsData {
  permission_ids: number[];
}

export interface CreateRoleData {
  name: string;
  code?: string;
  display_name: string;
  description?: string;
  base_role: "admin" | "manager" | "staff" | "member";
  is_active?: number;
  permission_ids?: number[];
  reason?: string;
}

export interface UpdateRoleData {
  name?: string;
  code?: string;
  display_name?: string;
  description?: string;
  base_role?: "admin" | "manager" | "staff" | "member";
  is_active?: number;
  permission_ids?: number[];
  reason?: string;
}

export interface UserWithRoles {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  role_id: number;
  created_at: string;
  is_root_admin: boolean;
  roles: Role[];
  effective_permissions?: Permission[];
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: number | null;
  target_name: string | null;
  reason: string | null;
  old_value: any;
  new_value: any;
  ip_address: string | null;
  created_at: string;
}
