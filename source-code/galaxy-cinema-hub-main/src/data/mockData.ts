import {
  Movie,
  Cinema,
  Showtime,
  ConcessionItem,
  User,
  Booking,
  Transaction,
  Review,
  SystemConfig,
  LoyaltyHistory,
  UserVoucher,
  Promo,
} from "@/types/cinema";

export const demoUsers: User[] = [
  {
    id: "admin-1",
    name: "Admin User",
    email: "admin@cinema.com",
    role: "admin",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
  },
  {
    id: "staff-1",
    name: "Staff User",
    email: "staff@cinema.com",
    role: "staff",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=staff",
  },
  {
    id: "client-1",
    name: "Nguyễn Văn A",
    email: "client@gmail.com",
    role: "client",
    phone: "0901234567",
    dob: "1995-05-15",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=client",
    membershipTier: "gold",
    loyaltyPoints: 250,
    totalSpent: 2500000,
  },
];

export const movies: Movie[] = [
  {
    id: "movie-1",
    title: "MAI",
    titleVi: "Mai",
    poster:
      "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=600&fit=crop",
    backdrop:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920&h=1080&fit=crop",
    duration: 131,
    ageRating: "T18",
    origin: "VN",
    genre: ["Drama", "Romance"],
    director: "Trấn Thành",
    cast: ["Phương Anh Đào", "Tuấn Trần", "NSƯT Hồng Đào"],
    releaseDate: "2024-02-10",
    description:
      "Câu chuyện về Mai, một người phụ nữ với quá khứ đầy thương tổn nhưng vẫn giữ vững niềm tin vào tình yêu và cuộc sống.",
    trailerUrl: "https://www.youtube.com/watch?v=example",
    rating: 4.8,
    isNowShowing: true,
  },
  {
    id: "movie-2",
    title: "ĐÀO, PHỞ VÀ PIANO",
    titleVi: "Đào, Phở và Piano",
    poster:
      "https://images.unsplash.com/photo-1595769816263-9b910be24d5f?w=400&h=600&fit=crop",
    backdrop:
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=1920&h=1080&fit=crop",
    duration: 95,
    ageRating: "T13",
    origin: "VN",
    genre: ["Drama", "War"],
    director: "Phi Tiến Sơn",
    cast: ["Doãn Quốc Đam", "Cao Thị Thùy Linh"],
    releaseDate: "2024-02-16",
    description:
      "Bối cảnh Hà Nội những ngày cuối cùng của cuộc kháng chiến chống Pháp, câu chuyện tình yêu giữa chiến tranh.",
    rating: 4.5,
    isNowShowing: true,
  },
  {
    id: "movie-3",
    title: "KUNG FU PANDA 4",
    titleVi: "Kung Fu Panda 4",
    poster:
      "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=400&h=600&fit=crop",
    backdrop:
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1920&h=1080&fit=crop",
    duration: 94,
    ageRating: "P",
    origin: "INT",
    genre: ["Animation", "Action", "Comedy"],
    director: "Mike Mitchell",
    cast: ["Jack Black", "Awkwafina", "Viola Davis"],
    releaseDate: "2024-03-08",
    description:
      "Po tiếp tục hành trình trở thành bậc thầy võ thuật khi đối mặt với kẻ thù mới.",
    rating: 4.2,
    isNowShowing: true,
  },
  {
    id: "movie-4",
    title: "DUNE: PART TWO",
    titleVi: "Xứ Cát: Phần Hai",
    poster:
      "https://images.unsplash.com/photo-1534809027769-b00d750a6bac?w=400&h=600&fit=crop",
    backdrop:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop",
    duration: 166,
    ageRating: "T16",
    origin: "INT",
    genre: ["Sci-Fi", "Adventure"],
    director: "Denis Villeneuve",
    cast: ["Timothée Chalamet", "Zendaya", "Austin Butler"],
    releaseDate: "2024-03-01",
    description:
      "Paul Atreides hợp tác với Chani và người Fremen để trả thù cho sự sụp đổ của gia đình mình.",
    rating: 4.9,
    isNowShowing: true,
  },
  {
    id: "movie-5",
    title: "GODZILLA X KONG",
    titleVi: "Godzilla x Kong: Đế Chế Mới",
    poster:
      "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=400&h=600&fit=crop",
    backdrop:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1920&h=1080&fit=crop",
    duration: 115,
    ageRating: "T13",
    origin: "INT",
    genre: ["Action", "Sci-Fi"],
    director: "Adam Wingard",
    cast: ["Rebecca Hall", "Brian Tyree Henry", "Dan Stevens"],
    releaseDate: "2024-03-28",
    description:
      "Hai titan huyền thoại hợp sức chống lại mối đe dọa chưa từng có.",
    rating: 4.0,
    isNowShowing: false,
  },
  {
    id: "movie-6",
    title: "LẬT MẶT 7",
    titleVi: "Lật Mặt 7: Một Điều Ước",
    poster:
      "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400&h=600&fit=crop",
    backdrop:
      "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1920&h=1080&fit=crop",
    duration: 130,
    ageRating: "T13",
    origin: "VN",
    genre: ["Drama", "Family"],
    director: "Lý Hải",
    cast: ["Trấn Thành", "Lý Hải", "Minh Hà"],
    releaseDate: "2024-04-26",
    description:
      "Câu chuyện cảm động về tình cảm gia đình và những ước mơ giản dị.",
    rating: 4.6,
    isNowShowing: false,
  },
];

export const cinemas: Cinema[] = [
  {
    id: "cinema-1",
    name: "Galaxy Nguyễn Du",
    address: "116 Nguyễn Du, Quận 1, TP.HCM",
    hotline: "1900 2224",
    features: ["IMAX", "4DX", "Standard"],
    rooms: [],
  },
  {
    id: "cinema-2",
    name: "Galaxy Tân Bình",
    address: "246 Nguyễn Hồng Đào, Tân Bình, TP.HCM",
    hotline: "1900 2224",
    features: ["Standard"],
    rooms: [],
  },
  {
    id: "cinema-3",
    name: "Galaxy Quang Trung",
    address: "304A Quang Trung, Gò Vấp, TP.HCM",
    hotline: "1900 2224",
    features: ["IMAX", "Standard"],
    rooms: [],
  },
];

export const generateShowtimes = (
  movieId: string,
  cinemaId: string,
): Showtime[] => {
  const times = ["09:30", "11:45", "14:00", "16:15", "18:30", "20:45", "23:00"];
  const today = new Date();
  const showtimes: Showtime[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().split("T")[0];

    times.forEach((time, index) => {
      const availableSeats = Math.floor(Math.random() * 50) + 20;
      showtimes.push({
        id: `showtime-${movieId}-${cinemaId}-${dateStr}-${index}`,
        movieId,
        cinemaId,
        roomId: `room-${(index % 3) + 1}`,
        date: dateStr,
        time,
        price: {
          standard: 90000,
          vip: 120000,
          couple: 200000,
        },
        availableSeats,
        totalSeats: 120,
      });
    });
  }

  return showtimes;
};

export const concessions: ConcessionItem[] = [
  {
    id: "combo-1",
    name: "Combo Solo",
    nameVi: "Combo 1 Người",
    price: 79000,
    quantity: 0,
    image:
      "https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=200&h=200&fit=crop",
  },
  {
    id: "combo-2",
    name: "Combo Couple",
    nameVi: "Combo Đôi",
    price: 139000,
    quantity: 0,
    image:
      "https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=200&h=200&fit=crop",
  },
  {
    id: "combo-3",
    name: "Combo Family",
    nameVi: "Combo Gia Đình",
    price: 199000,
    quantity: 0,
    image:
      "https://images.unsplash.com/photo-1512149177596-f817c7ef5d4c?w=200&h=200&fit=crop",
  },
  {
    id: "drink-1",
    name: "Coca-Cola Large",
    nameVi: "Coca-Cola Lớn",
    price: 35000,
    quantity: 0,
    image:
      "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=200&h=200&fit=crop",
  },
  {
    id: "popcorn-1",
    name: "Caramel Popcorn",
    nameVi: "Bắp Rang Caramel",
    price: 49000,
    quantity: 0,
    image:
      "https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=200&h=200&fit=crop",
  },
];

export const mockBookings: Booking[] = [
  {
    id: "booking-1",
    ticketCode: "GXY-2024-001234",
    userId: "client-1",
    movieId: "movie-1",
    showtimeId: "showtime-1",
    seats: [
      {
        id: "F5",
        row: "F",
        number: 5,
        type: "vip",
        status: "sold",
        price: 120000,
      },
      {
        id: "F6",
        row: "F",
        number: 6,
        type: "vip",
        status: "sold",
        price: 120000,
      },
    ],
    concessions: [{ ...concessions[0], quantity: 1 }],
    totalAmount: 319000,
    discount: 20000,
    finalAmount: 299000,
    promoCode: "SUMMER20",
    paymentMethod: "atm",
    status: "success",
    createdAt: "2024-02-10T14:30:00Z",
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: "TRX-12345",
    bookingId: "booking-1",
    customerId: "client-1",
    customerName: "Nguyễn Văn A",
    customerPhone: "0901234567",
    paymentMethod: "atm",
    amount: 299000,
    status: "success",
    promoCode: "SUMMER20",
    discountAmount: 20000,
    createdAt: "2024-02-10T14:30:00Z",
  },
  {
    id: "TRX-12346",
    bookingId: "booking-2",
    customerId: "client-2",
    customerName: "Trần Thị B",
    customerPhone: "0912345678",
    paymentMethod: "visa",
    amount: 450000,
    status: "pending",
    createdAt: "2024-02-11T10:15:00Z",
  },
  {
    id: "TRX-12347",
    bookingId: "booking-3",
    customerId: "client-3",
    customerName: "Lê Văn C",
    customerPhone: "0923456789",
    paymentMethod: "atm",
    amount: 180000,
    status: "failed",
    createdAt: "2024-02-11T11:00:00Z",
  },
];

export const mockReviews: Review[] = [
  {
    id: "review-1",
    userId: "client-1",
    userName: "Nguyễn Văn A",
    userAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=client",
    movieId: "movie-1",
    movieTitle: "MAI",
    rating: 5,
    content: "Phim rất hay và cảm động. Phương Anh Đào diễn xuất tuyệt vời!",
    isVerified: true,
    isVisible: true,
    createdAt: "2024-02-12T09:00:00Z",
  },
  {
    id: "review-2",
    userId: "client-2",
    userName: "Trần Thị B",
    userAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user2",
    movieId: "movie-1",
    movieTitle: "MAI",
    rating: 4,
    content: "Nội dung sâu sắc, kết phim hơi buồn nhưng rất ý nghĩa.",
    isVerified: true,
    isVisible: true,
    createdAt: "2024-02-12T10:30:00Z",
  },
];

export const generateSeatMap = (rows: number = 8, seatsPerRow: number = 12) => {
  const rowLabels = "ABCDEFGHIJKL".split("");
  const seatMap: any[][] = [];

  for (let i = 0; i < rows; i++) {
    const row: any[] = [];
    for (let j = 1; j <= seatsPerRow; j++) {
      const isVip = i >= 3 && i <= 5;
      const isCouple = i === rows - 1;
      const soldChance = Math.random();

      row.push({
        id: `${rowLabels[i]}${j}`,
        row: rowLabels[i],
        number: j,
        type: isCouple ? "couple" : isVip ? "vip" : "standard",
        status:
          soldChance > 0.7 ? "sold" : soldChance > 0.6 ? "held" : "available",
        price: isCouple ? 200000 : isVip ? 120000 : 90000,
      });
    }
    seatMap.push(row);
  }

  return seatMap;
};

// System Configuration
export const systemConfig: SystemConfig = {
  id: "config-1",
  curfewTimeU13: "22:00", // Trẻ dưới 13 tuổi không xem phim kết thúc sau 22h
  curfewTimeU16: "23:00", // Trẻ dưới 16 tuổi không xem phim kết thúc sau 23h
  minVietnameseQuota: 15, // Tối thiểu 15% suất chiếu phim Việt
  seatHoldDuration: 5, // Giữ ghế 5 phút
  maxSeatsPerBooking: 8, // Tối đa 8 ghế / đơn
  defaultCleanupDuration: 15, // 15 phút dọn phòng
  loyaltyPointsRate: 10000, // 10.000đ = 1 điểm
  membershipTiers: {
    bronze: {
      minSpent: 0,
      discount: 0, // 0% discount
    },
    silver: {
      minSpent: 2000000, // 2 triệu
      discount: 5, // 5% discount
    },
    gold: {
      minSpent: 5000000, // 5 triệu
      discount: 10, // 10% discount
    },
    platinum: {
      minSpent: 10000000, // 10 triệu
      discount: 15, // 15% discount
    },
  },
};

// Loyalty History - Lịch sử tích điểm
export const loyaltyHistory: LoyaltyHistory[] = [
  {
    id: "lh-1",
    userId: "client-1",
    pointsChange: 25,
    type: "PURCHASE",
    description: "Mua vé xem phim MAI - 250.000đ",
    bookingId: "booking-1",
    createdAt: "2026-01-20T19:30:00",
  },
  {
    id: "lh-2",
    userId: "client-1",
    pointsChange: 50,
    type: "BIRTHDAY",
    description: "Quà tặng sinh nhật - 50 điểm",
    createdAt: "2026-01-15T00:00:00",
  },
  {
    id: "lh-3",
    userId: "client-1",
    pointsChange: -20,
    type: "REDEEM",
    description: "Đổi voucher giảm giá 20%",
    createdAt: "2026-01-10T14:20:00",
  },
  {
    id: "lh-4",
    userId: "client-1",
    pointsChange: 30,
    type: "PURCHASE",
    description: "Mua vé xem phim Kung Fu Panda 4 - 300.000đ",
    bookingId: "booking-2",
    createdAt: "2026-01-05T16:45:00",
  },
  {
    id: "lh-5",
    userId: "client-1",
    pointsChange: 100,
    type: "EVENT",
    description: "Sự kiện khuyến mại Tết 2026",
    createdAt: "2026-01-01T00:00:00",
  },
];

// Promotions - Khuyến mãi
export const promotions: Promo[] = [
  {
    id: "promo-1",
    code: "WELCOME2026",
    discount: 20,
    type: "percent",
    minAmount: 100000,
    maxDiscount: 50000,
    validUntil: "2026-12-31",
    description: "Giảm 20% cho đơn hàng đầu tiên",
    startDate: "2026-01-01",
    isAutoApply: false,
  },
  {
    id: "promo-2",
    code: "BIRTHDAY",
    discount: 30,
    type: "percent",
    minAmount: 0,
    maxDiscount: 100000,
    validUntil: "2026-12-31",
    description: "Giảm 30% cho khách hàng sinh nhật",
    startDate: "2026-01-01",
    isAutoApply: true, // Tự động áp dụng cho khách sinh nhật
  },
  {
    id: "promo-3",
    code: "MEMBER50K",
    discount: 50000,
    type: "fixed",
    minAmount: 200000,
    validUntil: "2026-06-30",
    description: "Giảm 50k cho thành viên VIP",
    startDate: "2026-01-01",
    isAutoApply: false,
  },
];

// User Vouchers - Kho voucher cá nhân
export const userVouchers: UserVoucher[] = [
  {
    id: "uv-1",
    userId: "client-1",
    promotionId: "promo-2",
    code: "BIRTHDAY-CLIENT1-2026",
    status: "ACTIVE",
    assignedAt: "2026-01-15T00:00:00",
    expiresAt: "2026-02-15T23:59:59",
  },
  {
    id: "uv-2",
    userId: "client-1",
    promotionId: "promo-1",
    code: "WELCOME2026-CLIENT1",
    status: "USED",
    assignedAt: "2026-01-01T00:00:00",
    usedAt: "2026-01-10T14:20:00",
    expiresAt: "2026-12-31T23:59:59",
  },
  {
    id: "uv-3",
    userId: "client-1",
    promotionId: "promo-3",
    status: "ACTIVE",
    assignedAt: "2026-01-20T00:00:00",
    expiresAt: "2026-06-30T23:59:59",
  },
];
