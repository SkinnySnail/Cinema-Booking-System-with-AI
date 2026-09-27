import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, Search, User, Menu, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AppContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import NotificationDropdown from "@/components/NotificationDropdown";
import ThemeToggle from "@/components/ThemeToggle";

const Header: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const navItems = [
    { label: "Lịch Chiếu", path: "/schedule" },
    { label: "Phim", path: "/movies" },
    { label: "Rạp", path: "/cinemas" },
    { label: "Khuyến Mãi", path: "/promotions" },
    { label: "Bắp Nước", path: "/concessions" },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  return (
    <header className="cinema-header sticky top-0 z-50 shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Film className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-secondary-foreground">
              Galaxy Cinema
            </span>
          </Link>

          {/* Navigation - Desktop */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location.pathname === item.path
                    ? "text-primary"
                    : "text-secondary-foreground/80"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <form
              onSubmit={handleSearch}
              className="hidden lg:flex items-center"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm phim..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 pl-9 bg-secondary-foreground/10 border-secondary-foreground/20 text-secondary-foreground placeholder:text-secondary-foreground/50 focus:bg-secondary-foreground/20"
                />
              </div>
            </form>

            {/* Notifications */}
            <NotificationDropdown />

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* User Menu */}
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 hover:bg-secondary-foreground/10"
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user?.avatar} />
                      <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline text-sm text-secondary-foreground">
                      {user?.name}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to="/profile">Tài khoản</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/bookings">Lịch sử đặt vé</Link>
                  </DropdownMenuItem>
                  {/* Admin Portal */}
                  {(user?.role === "admin" || user?.base_role === "admin") && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin">Admin Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  {/* Manager Portal */}
                  {(user?.role === "manager" || user?.base_role === "manager" || user?.role === "admin" || user?.base_role === "admin") && (
                    <DropdownMenuItem asChild>
                      <Link to="/manager">Quản Lý Rạp</Link>
                    </DropdownMenuItem>
                  )}
                  {/* Staff Portal */}
                  {(user?.role === "staff" ||
                    user?.base_role === "staff" ||
                    user?.role === "admin" ||
                    user?.base_role === "admin" ||
                    user?.permissions?.includes("tickets.scan") ||
                    user?.permissions?.includes("bookings.pos")) && (
                    <DropdownMenuItem asChild>
                      <Link to="/staff">Staff Portal</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-destructive"
                  >
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Đăng nhập
                </Button>
              </Link>
            )}

            {/* Mobile Menu */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-secondary-foreground"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
