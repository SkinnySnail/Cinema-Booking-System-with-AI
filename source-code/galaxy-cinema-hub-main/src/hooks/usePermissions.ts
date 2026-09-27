import { useAuth } from "@/contexts/AppContext";

export function usePermissions() {
  const { user } = useAuth();

  const isSuperAdmin =
    user?.id === "1" ||
    (user as any)?.id === 1 ||
    user?.email === "admin@galaxy.vn" ||
    (user as any)?.role_id === 5 ||
    (user as any)?.roles?.some((r: any) => r.id === 5 || r.code === "SYSTEM_ADMIN");

  const hasPermission = (permission?: string) => {
    if (isSuperAdmin) return true;
    if (!permission) return true;
    const perms = (user as any)?.permissions || [];
    return Array.isArray(perms) && perms.includes(permission);
  };

  const hasAnyPermission = (permissions?: string[]) => {
    if (isSuperAdmin) return true;
    if (!permissions || permissions.length === 0) return true;
    const perms = (user as any)?.permissions || [];
    return Array.isArray(perms) && permissions.some((p) => perms.includes(p));
  };

  return {
    isSuperAdmin,
    hasPermission,
    hasAnyPermission,
    permissions: (user as any)?.permissions || [],
  };
}
