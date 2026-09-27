import React, { useEffect } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Film,
  Users,
  Building2,
  Armchair,
  Ticket,
  Coffee,
  Calendar,
  CreditCard,
  Star,
  Bell,
  Settings,
  Home,
  LogOut,
  Menu,
  ChevronLeft,
  Shield,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { useState } from "react";

const AdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Check authentication and redirect if not logged in or not admin
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    // Check if user is admin (role = 'admin')
    const currentRole = (user?.role || (user as any)?.base_role || "").toLowerCase();
    if (user && currentRole !== "admin") {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Don't render anything while checking authentication
  const currentRole = (user?.role || (user as any)?.base_role || "").toLowerCase();
  if (!isAuthenticated || !user || currentRole !== "admin") {
    return null;
  }

  // Check if user is Super Admin (Root Admin id=1, role_id=5, or SYSTEM_ADMIN)
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

  const allNavItems = [
    { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
    { label: "Quản lý Phim", path: "/admin/movies", icon: Film, perm: "movies.view" },
    { label: "Người Dùng", path: "/admin/users", icon: Users, perm: "users.view_all" },
    { label: "Quản lý Rạp", path: "/admin/cinemas", icon: Building2, perm: "cinemas.view" },
    { label: "Quản lý chỗ ngồi", path: "/admin/seats", icon: Armchair, perm: "halls.view" },
    { label: "Khuyến Mãi", path: "/admin/promotions", icon: Ticket, perm: "promotions.view" },
    { label: "Bắp Nước", path: "/admin/concessions", icon: Coffee, perm: "concessions.view" },
    { label: "Lịch Chiếu", path: "/admin/scheduler", icon: Calendar, perm: "showtimes.view" },
    { label: "Giao Dịch", path: "/admin/transactions", icon: CreditCard, perm: "transactions.view_all" },
    { label: "Đánh Giá", path: "/admin/reviews", icon: Star, perm: "reviews.view_all" },
    { label: "Thông Báo", path: "/admin/notifications", icon: Bell, perm: "promotions.view" },
    { label: "Phân Quyền", path: "/admin/role-permissions", icon: UserCog, perm: "system.roles" },
    { label: "Cấu Hình", path: "/admin/settings", icon: Settings, perm: "system.settings" },
  ];

  const navItems = allNavItems.filter((item) => hasPermission(item.perm));

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-secondary text-secondary-foreground flex flex-col transition-all duration-300",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          {!collapsed && (
            <Link to="/admin" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Film className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">Admin</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="text-secondary-foreground hover:bg-sidebar-accent"
          >
            {collapsed ? (
              <Menu className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          <ul className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-secondary-foreground/70 hover:bg-sidebar-accent hover:text-secondary-foreground",
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!collapsed && (
                      <span className="text-sm font-medium">{item.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User & Logout */}
        <div className="p-4 border-t border-sidebar-border">
          {!collapsed && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
                <span className="text-sm font-bold">
                  {user?.name?.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-secondary-foreground/60 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
          )}
          <Link to="/">
            <Button
              variant="ghost"
              className={cn(
                "w-full mb-1 text-secondary-foreground/70 hover:bg-sidebar-accent hover:text-secondary-foreground",
                collapsed ? "px-0 justify-center" : "justify-start",
              )}
            >
              <Home className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="ml-3">Giao diện khách hàng</span>}
            </Button>
          </Link>
          <Link to="/">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className={cn(
                "w-full text-secondary-foreground/70 hover:bg-sidebar-accent hover:text-secondary-foreground",
                collapsed ? "px-0 justify-center" : "justify-start",
              )}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="ml-3">Đăng xuất</span>}
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
