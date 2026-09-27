import React, { useEffect, useState, useCallback } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Film,
  Users,
  Armchair,
  BarChart3,
  Calendar,
  LogOut,
  Menu,
  ChevronLeft,
  Building2,
  RefreshCw,
  Package,
  Home,
  MessageSquare,
  Receipt,
} from "lucide-react";
import { useAuth } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { apiCall, API_ENDPOINTS } from "@/lib/api";
import { useTheme } from "@/hooks/use-theme";
import ThemeToggle from "@/components/ThemeToggle";
import { usePermissions } from "@/hooks/usePermissions";

interface CinemaInfo {
  id: number;
  name: string;
  address: string;
  hall_count: number;
}

const ManagerLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const { setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cinemaInfo, setCinemaInfo] = useState<CinemaInfo | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }
    const currentRole = (user?.role || (user as any)?.base_role || "").toLowerCase();
    if (user && currentRole !== "manager" && currentRole !== "admin") {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Load cinema info for header
  const loadCinema = useCallback(async () => {
    try {
      const res = await apiCall<{
        success: boolean;
        data: { cinema: CinemaInfo };
      }>(API_ENDPOINTS.MANAGER_CINEMA_INFO);
      if (res.success) setCinemaInfo(res.data.cinema);
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) void loadCinema();
  }, [isAuthenticated, user, loadCinema]);


  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated || !user) return null;

  const allNavItems = [
    {
      label: "Dashboard",
      path: "/manager",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: "Cập Nhật Rạp",
      path: "/manager/cinema",
      icon: Building2,
      exact: false,
      perm: "cinemas.update",
    },
    {
      label: "Quản Lý Phim",
      path: "/manager/movies",
      icon: Film,
      exact: false,
      perm: "movies.view",
    },
    {
      label: "Lịch Chiếu",
      path: "/manager/showtimes",
      icon: Calendar,
      exact: false,
      perm: "showtimes.view",
    },
    {
      label: "Chỗ Ngồi",
      path: "/manager/seats",
      icon: Armchair,
      exact: false,
      perm: "halls.view",
    },
    {
      label: "Nhân Viên",
      path: "/manager/staff",
      icon: Users,
      exact: false,
      perm: "users.view_all",
    },
    {
      label: "Bắp Nước",
      path: "/manager/concessions",
      icon: Package,
      exact: false,
      perm: [
        "concessions.update",
        "concessions.create",
        "concessions.import",
      ],
    },
    {
      label: "Đánh Giá",
      path: "/manager/reviews",
      icon: MessageSquare,
      exact: false,
      perm: "reviews.view_all",
    },
    {
      label: "Giao Dịch",
      path: "/manager/transactions",
      icon: Receipt,
      exact: false,
      perm: "transactions.view_all",
    },
    {
      label: "Báo Cáo",
      path: "/manager/reports",
      icon: BarChart3,
      exact: false,
      perm: [
        "reports.dashboard",
        "reports.revenue",
        "reports.occupancy",
        "reports.export",
      ],
    },
  ];

  const navItems = allNavItems.filter((item) => {
    if (!item.perm) return true;
    if (Array.isArray(item.perm)) {
      return hasAnyPermission(item.perm);
    }
    return hasPermission(item.perm);
  });

  const isActive = (item: (typeof navItems)[0]) =>
    item.exact
      ? location.pathname === item.path
      : location.pathname.startsWith(item.path);

  const handleLogout = () => {
    logout();
  };

  // Sidebar content
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
        {!collapsed && (
          <Link to="/manager" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center shadow-md shadow-orange-500/20">
              <Film className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-800 dark:text-white text-sm">Galaxy</span>
              <span className="font-light text-orange-500 text-sm ml-1">
                Manager
              </span>
            </div>
          </Link>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center mx-auto shadow-md shadow-orange-500/20">
            <Film className="w-4 h-4 text-white" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex w-7 h-7 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all cursor-pointer"
        >
          <ChevronLeft
            className={cn(
              "w-4 h-4 transition-transform duration-300",
              collapsed && "rotate-180",
            )}
          />
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Cinema name badge */}
      {!collapsed && cinemaInfo && (
        <div className="mx-3 mt-4 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200/70 dark:border-orange-800/40">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 truncate">
              {cinemaInfo.name}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate pl-5">
            {cinemaInfo.address}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative font-medium",
                    active
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20 font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/90 dark:hover:bg-slate-800/60",
                  )}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white/70 rounded-r-full" />
                  )}
                  <item.icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-all",
                      active
                        ? "text-white"
                        : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200",
                    )}
                  />
                  {!collapsed && (
                    <span className="text-sm">{item.label}</span>
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2.5 py-1 bg-slate-900 dark:bg-slate-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-slate-700/60">
                      {item.label}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User + Logout section */}
      <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/80 mb-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0 text-white font-bold text-sm shadow-sm">
              {(user.name || user.email || "M").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                {user.name || "Manager"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <Link to="/">
          <button
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-all duration-200 mb-1 cursor-pointer",
              collapsed && "justify-center",
            )}
          >
            <Home className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <span className="text-xs font-semibold">Giao diện khách hàng</span>
            )}
          </button>
        </Link>
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-200 cursor-pointer",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="text-xs font-semibold">Đăng xuất</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-slate-50/70 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar – Desktop */}
      <aside
        className={cn(
          "hidden lg:flex flex-col transition-all duration-300 ease-in-out shrink-0",
          "bg-white dark:bg-[#0f172a] border-r border-slate-200/80 dark:border-slate-800 shadow-xs dark:shadow-none",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <SidebarContent />
      </aside>

      {/* Sidebar – Mobile Drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-full flex flex-col w-72 lg:hidden",
          "bg-white dark:bg-[#0f172a] border-r border-slate-200/80 dark:border-slate-800 shadow-xl",
          "transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarContent />
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-6 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md shadow-xs shrink-0 transition-colors duration-200">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Cinema badge in header */}
            {cinemaInfo ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200/80 dark:border-orange-800/40">
                <Building2 className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                  {cinemaInfo.name}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 hidden md:block">·</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 hidden md:block font-medium">
                  {cinemaInfo.hall_count} phòng chiếu
                </span>
              </div>
            ) : (
              <div className="h-8 w-40 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle className="w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors" />
            <button
              onClick={() => void loadCinema()}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              title="Làm mới"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50/70 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 transition-colors duration-200">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default ManagerLayout;
