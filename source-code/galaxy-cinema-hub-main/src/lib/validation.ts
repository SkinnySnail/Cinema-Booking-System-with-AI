import {
  AgeRating,
  AgeValidation,
  CurfewValidation,
  MembershipTier,
  Movie,
  ScheduleConflict,
  Showtime,
  QuotaCheck,
  SystemConfig,
} from "@/types/cinema";

// Tính tuổi từ ngày sinh
export function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

export const T18_RESTRICTED_MESSAGE =
  "Phim phân loại T18 không khả dụng cho khán giả dưới 18 tuổi.";

export function isT18Rating(rating: string | undefined | null): boolean {
  return String(rating ?? "").trim().toUpperCase() === "T18";
}

/**
 * Ẩn phim T18 đối với khách hàng (role === "client") đã có ngày sinh < 18 tuổi.
 * Admin / Manager / Staff luôn được xem để quản trị và bán vé tại quầy.
 */
export function shouldHideT18ForUser(
  user: { role?: string; dob?: string } | null | undefined,
): boolean {
  if (!user || user.role !== "client" || !user.dob) {
    return false;
  }
  const birthDate = new Date(user.dob);
  if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
    return false;
  }
  return calculateAge(user.dob) < 18;
}

export function isMovieVisibleToUser(
  ageRating: string | undefined | null,
  user: { role?: string; dob?: string } | null | undefined,
): boolean {
  return !(isT18Rating(ageRating) && shouldHideT18ForUser(user));
}

// Kiểm tra độ tuổi phù hợp với phim
export function validateAge(
  userDOB: string | undefined,
  movieRating: AgeRating,
): AgeValidation {
  if (!userDOB) {
    return {
      isValid: false,
      userAge: 0,
      requiredAge: 0,
      message: "Vui lòng cập nhật ngày sinh trong hồ sơ để đặt vé",
    };
  }

  const age = calculateAge(userDOB);
  const ageRequirements: Record<AgeRating, number> = {
    P: 0, // Phổ biến - mọi lứa tuổi
    K: 0, // Trẻ em dưới 13 tuổi và có người giám hộ
    T13: 13,
    T16: 16,
    T18: 18,
    C: 18, // Cấm - phim dành cho chuyên gia
  };

  const requiredAge = ageRequirements[movieRating];
  const isValid = age >= requiredAge;

  return {
    isValid,
    userAge: age,
    requiredAge,
    message: !isValid
      ? `Phim này yêu cầu độ tuổi tối thiểu ${requiredAge}+. Bạn hiện tại ${age} tuổi.`
      : undefined,
  };
}

// Kiểm tra giờ giới nghiêm
export function validateCurfew(
  userDOB: string | undefined,
  showtimeEnd: string,
  config: SystemConfig,
): CurfewValidation {
  if (!userDOB) {
    return {
      isValid: true,
      userAge: 0,
      showtimeEnd,
      curfewTime: "",
    };
  }

  const age = calculateAge(userDOB);
  const endTime = new Date(showtimeEnd);
  const endHour = endTime.getHours();
  const endMinute = endTime.getMinutes();
  const endTimeStr = `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`;

  let curfewTime = "";
  let isValid = true;
  let message = "";

  if (age < 13) {
    curfewTime = config.curfewTimeU13;
    const [curfewHour, curfewMin] = curfewTime.split(":").map(Number);
    if (
      endHour > curfewHour ||
      (endHour === curfewHour && endMinute > curfewMin)
    ) {
      isValid = false;
      message = `Khách hàng dưới 13 tuổi không được xem phim kết thúc sau ${curfewTime}. Suất chiếu này kết thúc lúc ${endTimeStr}.`;
    }
  } else if (age < 16) {
    curfewTime = config.curfewTimeU16;
    const [curfewHour, curfewMin] = curfewTime.split(":").map(Number);
    if (
      endHour > curfewHour ||
      (endHour === curfewHour && endMinute > curfewMin)
    ) {
      isValid = false;
      message = `Khách hàng dưới 16 tuổi không được xem phim kết thúc sau ${curfewTime}. Suất chiếu này kết thúc lúc ${endTimeStr}.`;
    }
  }

  return {
    isValid,
    userAge: age,
    showtimeEnd: endTimeStr,
    curfewTime,
    message: message || undefined,
  };
}

// Tính thời gian kết thúc suất chiếu
export function calculateShowtimeEnd(
  date: string,
  time: string,
  duration: number,
  cleanupDuration: number = 15,
): string {
  const [hours, minutes] = time.split(":").map(Number);
  const startTime = new Date(date);
  startTime.setHours(hours, minutes, 0, 0);

  const endTime = new Date(
    startTime.getTime() + (duration + cleanupDuration) * 60000,
  );
  return endTime.toISOString();
}

// Kiểm tra xung đột lịch chiếu
export function detectScheduleConflict(
  roomId: string,
  startDate: string,
  startTime: string,
  duration: number,
  cleanupDuration: number,
  existingShowtimes: Showtime[],
  excludeShowtimeId?: string,
): ScheduleConflict {
  const newStart = new Date(`${startDate}T${startTime}`);
  const newEnd = new Date(
    newStart.getTime() + (duration + cleanupDuration) * 60000,
  );

  for (const showtime of existingShowtimes) {
    if (showtime.id === excludeShowtimeId) continue;
    if (showtime.roomId !== roomId) continue;
    if (showtime.date !== startDate) continue;

    const existingStart = new Date(`${showtime.date}T${showtime.time}`);
    const existingEnd = showtime.endTime
      ? new Date(showtime.endTime)
      : new Date(existingStart.getTime() + 150 * 60000); // Assume 2.5h if not set

    // Check overlap
    if (
      (newStart >= existingStart && newStart < existingEnd) ||
      (newEnd > existingStart && newEnd <= existingEnd) ||
      (newStart <= existingStart && newEnd >= existingEnd)
    ) {
      return {
        hasConflict: true,
        conflictingShowtime: {
          id: showtime.id,
          movieTitle: "Phim đang chiếu",
          startTime: showtime.time,
          endTime: existingEnd.toTimeString().slice(0, 5),
        },
      };
    }
  }

  return { hasConflict: false };
}

// Kiểm tra tỷ lệ phim Việt
export function checkVietnameseQuota(
  date: string,
  showtimes: Showtime[],
  movies: Movie[],
  config: SystemConfig,
): QuotaCheck {
  const dateShowtimes = showtimes.filter((s) => s.date === date);

  if (dateShowtimes.length === 0) {
    return {
      isValid: true,
      currentPercent: 0,
      requiredPercent: config.minVietnameseQuota,
    };
  }

  const vietnameseShowtimes = dateShowtimes.filter((s) => {
    const movie = movies.find((m) => m.id === s.movieId);
    return movie?.origin === "VN";
  });

  const currentPercent =
    (vietnameseShowtimes.length / dateShowtimes.length) * 100;
  const isValid = currentPercent >= config.minVietnameseQuota;

  return {
    isValid,
    currentPercent: Math.round(currentPercent * 10) / 10,
    requiredPercent: config.minVietnameseQuota,
    warning: !isValid
      ? `Cảnh báo: Tỷ lệ suất chiếu phim Việt Nam hiện tại (${Math.round(currentPercent)}%) thấp hơn quy định (${config.minVietnameseQuota}%)`
      : undefined,
  };
}

// Tính điểm tích lũy
export function calculateLoyaltyPoints(
  amount: number,
  config: SystemConfig,
): number {
  return Math.floor(amount / config.loyaltyPointsRate);
}

// Xác định hạng thành viên
export function determineMembershipTier(
  totalSpent: number,
  config: SystemConfig,
): MembershipTier {
  if (totalSpent >= config.membershipTiers.platinum.minSpent) return "platinum";
  if (totalSpent >= config.membershipTiers.gold.minSpent) return "gold";
  if (totalSpent >= config.membershipTiers.silver.minSpent) return "silver";
  return "bronze";
}

// Lấy discount rate theo hạng thành viên
export function getMembershipDiscount(
  tier: MembershipTier,
  config: SystemConfig,
): number {
  return config.membershipTiers[tier].discount;
}

// Format age rating cho hiển thị
export function formatAgeRating(rating: AgeRating): string {
  const labels: Record<AgeRating, string> = {
    P: "P - Phổ biến",
    K: "K - Dành cho trẻ em có người giám hộ",
    T13: "T13 - Từ 13 tuổi trở lên",
    T16: "T16 - Từ 16 tuổi trở lên",
    T18: "T18 - Từ 18 tuổi trở lên",
    C: "C - Cấm (chỉ dành cho chuyên gia)",
  };
  return labels[rating];
}

// Get age rating color
export function getAgeRatingColor(rating: AgeRating): string {
  const colors: Record<AgeRating, string> = {
    P: "bg-green-500",
    K: "bg-blue-500",
    T13: "bg-yellow-500",
    T16: "bg-orange-500",
    T18: "bg-red-500",
    C: "bg-purple-500",
  };
  return colors[rating];
}
