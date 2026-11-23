/**
 * D'Lat Coffee - Daily Shift Checklist Templates & Validation
 * Maps the physical "CHECK CÔNG VIỆC CA D'LAT COFFEE" sheet into 4 configurable shift checklists
 * with day-of-week periodic tasks (T2-4-6, T2-5, T4, T6) and mandatory reason notes for incomplete tasks.
 */

export type DlatShiftCode = "CA_1" | "CA_2" | "CA_3" | "CA_4";

export interface DailyChecklistTemplateItem {
  stt: number;
  title: string;
  description: string;
  /** UTC day-of-week numbers (0=CN, 1=T2, 2=T3, 3=T4, 4=T5, 5=T6, 6=T7). Omit if daily. */
  daysOfWeek?: number[];
  scheduleLabel?: string;
}

export interface DailyChecklistEntry {
  stt: number;
  title: string;
  description: string;
  isDueToday: boolean;
  scheduleLabel?: string;
  done: boolean;
  note: string;
}

export const DLAT_DAILY_CHECKLIST_SETTING_KEY = "dlat_daily_checklist_templates";

export const DLAT_DAILY_CHECKLIST_TEMPLATES: Record<
  DlatShiftCode,
  DailyChecklistTemplateItem[]
> = {
  CA_1: [
    {
      stt: 1,
      title: "Mở cửa, bật đèn, máy lạnh",
      description:
        "Cất tấm che cửa dưới bàn quầy, bật công tắc đèn theo mô tả; lưu ý khu vực bàn góc trong cùng nvs buổi sáng không bật cho đến khi các khu vực khác kín khách mới bật",
    },
    {
      stt: 2,
      title: "Lau miệng thùng đựng đá",
      description: "Trước khi fill đá lau sạch miệng thùng",
    },
    {
      stt: 3,
      title: "Lau bàn đá",
      description:
        "Lau khu vực mặt ngoài bàn đá (khu khách pha nước), mặt trong bàn đá (dãy ngang phía sau thùng đá) và bàn đá trong khu rửa chén và nấu ăn",
    },
    {
      stt: 4,
      title: "Pha trà và làm trà đá",
      description: "Pha trà sâm dứa, rót ra bình trà đá",
    },
    {
      stt: 5,
      title: "Lót thảm bar",
      description:
        "Lau mặt dưới thảm bar, lót 2 thảm ở bàn trà đá, 2 thảm ở khu vực khách pha nước",
    },
    {
      stt: 6,
      title: "Mở máy tính, kiểm tiền, mở nhạc",
      description:
        "Mở máy, đăng nhập kiot nhân viên, kiểm tiền, mở ca, mở nhạc không lời hoặc nhạc trẻ có lời nhẹ nhàng phù hợp không gian quán",
    },
    {
      stt: 7,
      title: "Lau dọn nvs",
      description: "Lau nhà vệ sinh, cọ toilet, lau lavabo",
    },
    {
      stt: 8,
      title: "Lau kính",
      description:
        "Lau cửa chính, cửa sổ, gương trên tường, gương đứng (tất cả kính và gương lau hàng ngày)",
    },
    {
      stt: 9,
      title: "Lau lá cây",
      description: "Thứ 2-4-6 lau lá cây cảnh giả decor",
      daysOfWeek: [1, 3, 5],
      scheduleLabel: "Thứ 2, 4, 6",
    },
    {
      stt: 10,
      title: "Rửa khay inox xúc đá",
      description: "Rửa sạch khay inox xúc đá",
    },
    {
      stt: 11,
      title: "Tưới cây",
      description:
        "Tưới cây cảnh ngay góc cửa sổ ngày 1 lần vào buổi sáng, lau lá hàng ngày",
    },
    {
      stt: 12,
      title: "Fill các gói nước",
      description: "Fill mỗi ca, kiểm tra báo sl nước thiếu đầu ngày",
    },
    {
      stt: 13,
      title: "Bọc túi rác",
      description: "Chuẩn bị thùng rác đầu ca",
    },
    {
      stt: 14,
      title: "Nấu và fill nước sôi",
      description: "Fill nước sôi liên tục trong ca",
    },
    {
      stt: 15,
      title: "Fill nguyên vật liệu khác (nếu hết)",
      description: "Fill rau, xúc xích, cá viên,...",
    },
    {
      stt: 16,
      title: "Nhập phiếu chi theo ngày",
      description: "Tất cả hóa đơn trong ngày",
    },
    {
      stt: 17,
      title: "Dọn dẹp sạch sẽ, bàn giao ca",
      description:
        "Dọn dẹp bàn đá, khu vực nấu ăn, nvs sạch sẽ bàn giao ca sau, rửa toàn bộ ly, tô chén trong ca",
    },
    {
      stt: 18,
      title: "Đếm tiền, kết ca",
      description: "Đếm đủ tiền, note thu chi, ký tên bàn giao ca",
    },
    {
      stt: 19,
      title: "Bàn giao Tiền mặt",
      description: "Kiểm khớp số tiền mặt bàn giao sang Ca 2",
    },
  ],
  CA_2: [
    {
      stt: 1,
      title: "Nhận ca, kiểm tiền",
      description: "Nhận tiền mặt đầu ca khớp với số tiền Ca 1 bàn giao",
    },
    {
      stt: 2,
      title: "Lau dọn nvs",
      description: "Lau nhà vệ sinh, cọ toilet, lau lavabo",
    },
    {
      stt: 3,
      title: "Lau kính",
      description:
        "Lau cửa chính, cửa sổ, gương trên tường, gương đứng (tất cả kính và gương lau hàng ngày)",
    },
    {
      stt: 4,
      title: "Fill các gói nước",
      description: "Fill mỗi ca, kiểm tra báo sl nước thiếu đầu ngày",
    },
    {
      stt: 5,
      title: "Bọc túi rác",
      description: "Chuẩn bị thùng rác đầu ca",
    },
    {
      stt: 6,
      title: "Nấu và fill nước sôi",
      description: "Fill nước sôi liên tục trong ca",
    },
    {
      stt: 7,
      title: "Fill nguyên vật liệu khác (nếu hết)",
      description: "Fill rau, xúc xích, cá viên,...",
    },
    {
      stt: 8,
      title: "Rửa khay inox xúc đá",
      description: "Rửa sạch khay inox xúc đá",
    },
    {
      stt: 9,
      title: "Nhập phiếu chi theo ngày",
      description: "Tất cả hóa đơn trong ngày",
    },
    {
      stt: 10,
      title: "Dọn dẹp sạch sẽ, bàn giao ca",
      description:
        "Dọn dẹp bàn đá, khu vực nấu ăn, nvs sạch sẽ bàn giao ca sau, rửa toàn bộ ly, tô chén trong ca",
    },
    {
      stt: 11,
      title: "Đếm tiền, kết ca",
      description: "Đếm đủ tiền, note thu chi, ký tên bàn giao ca",
    },
    {
      stt: 12,
      title: "Bàn giao Tiền mặt",
      description: "Kiểm khớp số tiền mặt bàn giao sang Ca 3",
    },
  ],
  CA_3: [
    {
      stt: 1,
      title: "Nhận ca, kiểm tiền",
      description: "Nhận tiền mặt đầu ca khớp với số tiền Ca 2 bàn giao",
    },
    {
      stt: 2,
      title: "Lau dọn nvs",
      description: "Lau nhà vệ sinh, cọ toilet, lau lavabo",
    },
    {
      stt: 3,
      title: "Lau kính",
      description:
        "Lau cửa chính, cửa sổ, gương trên tường, gương đứng (tất cả kính và gương lau hàng ngày)",
    },
    {
      stt: 4,
      title: "Fill các gói nước",
      description: "Fill mỗi ca, kiểm tra báo sl nước thiếu đầu ngày",
    },
    {
      stt: 5,
      title: "Bọc túi rác",
      description: "Chuẩn bị thùng rác đầu ca",
    },
    {
      stt: 6,
      title: "Nấu và fill nước sôi",
      description: "Fill nước sôi liên tục trong ca",
    },
    {
      stt: 7,
      title: "Fill nguyên vật liệu khác (nếu hết)",
      description: "Fill rau, xúc xích, cá viên,...",
    },
    {
      stt: 8,
      title: "Nhập phiếu chi theo ngày",
      description: "Tất cả hóa đơn trong ngày",
    },
    {
      stt: 9,
      title: "Rửa khay inox xúc đá",
      description: "Rửa sạch khay inox xúc đá",
    },
    {
      stt: 10,
      title: "Dọn dẹp sạch sẽ, bàn giao ca",
      description:
        "Dọn dẹp bàn đá, khu vực nấu ăn, nvs sạch sẽ bàn giao ca sau, rửa toàn bộ ly, tô chén trong ca",
    },
    {
      stt: 11,
      title: "Đếm tiền, kết ca",
      description: "Đếm đủ tiền, note thu chi, ký tên bàn giao ca",
    },
    {
      stt: 12,
      title: "Bàn giao Tiền mặt",
      description: "Kiểm khớp số tiền mặt bàn giao sang Ca 4",
    },
  ],
  CA_4: [
    {
      stt: 1,
      title: "Nhận ca, kiểm tiền",
      description: "Nhận tiền mặt đầu ca khớp với số tiền Ca 3 bàn giao",
    },
    {
      stt: 2,
      title: "Lau dọn nvs",
      description: "Lau nhà vệ sinh, cọ toilet, lau lavabo",
    },
    {
      stt: 3,
      title: "Lau kính",
      description:
        "Lau cửa chính, cửa sổ, gương trên tường, gương đứng (tất cả kính và gương lau hàng ngày)",
    },
    {
      stt: 4,
      title: "Fill các gói nước",
      description: "Fill mỗi ca, kiểm tra báo sl nước thiếu đầu ngày",
    },
    {
      stt: 5,
      title: "Bọc túi rác",
      description: "Chuẩn bị thùng rác đầu ca",
    },
    {
      stt: 6,
      title: "Nấu và fill nước sôi",
      description: "Fill nước sôi liên tục trong ca",
    },
    {
      stt: 7,
      title: "Kiểm kho hàng, nguyên vật liệu quán",
      description: "Lưu ý kiểm vào thứ 2 và thứ 5 (ghi chú Đã kiểm hoặc báo thiếu)",
      daysOfWeek: [1, 4],
      scheduleLabel: "Thứ 2, 5",
    },
    {
      stt: 8,
      title: "Fill nguyên vật liệu khác (nếu hết)",
      description: "Fill rau, xúc xích, cá viên,...",
    },
    {
      stt: 9,
      title: "Rửa khay inox xúc đá",
      description: "Rửa sạch khay inox xúc đá",
    },
    {
      stt: 10,
      title: "Dọn dẹp sạch sẽ, bàn giao ca sáng mai",
      description:
        "Dọn dẹp thảm bar, trùm đậy các rổ đựng đồ ăn và gói nước, cất các hũ đựng đường vào lò vi sóng, kéo rèm, tắt công tắc điện, tắt máy lạnh,...",
    },
    {
      stt: 11,
      title: "Quét nhà, lau nhà",
      description: "Lau nhà từ trong ra ngoài",
    },
    {
      stt: 12,
      title: "Lau kệ sách",
      description: "Lau bụi kệ sách thứ 4 hàng tuần",
      daysOfWeek: [3],
      scheduleLabel: "Thứ 4 hàng tuần",
    },
    {
      stt: 13,
      title: "Giặt khăn kết ca",
      description: "Giặt sạch và trải ra phơi trên bàn đá",
    },
    {
      stt: 14,
      title: "Lau dọn bồn rửa chén",
      description:
        "Rửa chén, ly xong các bạn nhớ đổ hết nước đọng lại trong các hũ đựng muỗng, đũa,... lau dọn bồn lavabo",
    },
    {
      stt: 15,
      title: "Nhập phiếu chi theo ngày",
      description: "Tất cả hóa đơn trong ngày",
    },
    {
      stt: 16,
      title: "Đếm tiền, kết ca",
      description: "Đếm đủ tiền mặt cuối ngày, note thu chi",
    },
    {
      stt: 17,
      title: "Xịt sàn quầy nước",
      description:
        "Sau khi xả nước lau nhà. Xịt sàn hết bụi đất cát để sàn thông thoáng",
    },
    {
      stt: 18,
      title: "Chà sàn quầy nước (tối thứ 6 hàng tuần)",
      description: "Dùng miếng cước chà sàn sạch",
      daysOfWeek: [5],
      scheduleLabel: "Tối Thứ 6",
    },
    {
      stt: 19,
      title: "Bàn giao Tiền mặt",
      description: "Chốt số tiền mặt bàn giao để Ca 1 sáng hôm sau nhận đầu ca",
    },
  ],
};

/**
 * Resolves D'Lat shift code (CA_1..CA_4) from template code, shift name, or start time.
 */
export function resolveShiftCodeFromShift(
  shiftName: string,
  templateCode?: string | null,
  startTime?: string | null,
): DlatShiftCode {
  if (
    templateCode === "CA_1" ||
    templateCode === "CA_2" ||
    templateCode === "CA_3" ||
    templateCode === "CA_4"
  ) {
    return templateCode;
  }

  const lower = shiftName.toLowerCase();
  if (lower.includes("ca 1") || lower.includes("sáng")) return "CA_1";
  if (lower.includes("ca 2") || lower.includes("trưa")) return "CA_2";
  if (lower.includes("ca 3") || lower.includes("chiều")) return "CA_3";
  if (lower.includes("ca 4") || lower.includes("tối")) return "CA_4";

  if (startTime) {
    if (startTime < "11:00") return "CA_1";
    if (startTime < "15:00") return "CA_2";
    if (startTime < "19:00") return "CA_3";
    return "CA_4";
  }

  return "CA_1";
}

/**
 * Builds checklist entries for a specific shift and workDate (YYYY-MM-DD).
 * All items remain visible (Rule 1), with `isDueToday` indicating whether the item
 * applies on that day of week.
 */
export function getChecklistForShift(
  shiftCode: DlatShiftCode,
  workDate: string,
  customTemplates?: Partial<Record<DlatShiftCode, DailyChecklistTemplateItem[]>> | null,
): DailyChecklistEntry[] {
  const templates =
    customTemplates?.[shiftCode] ?? DLAT_DAILY_CHECKLIST_TEMPLATES[shiftCode];
  const dayOfWeek = new Date(`${workDate}T00:00:00.000Z`).getUTCDay();

  return templates.map((item) => {
    const isDueToday =
      !item.daysOfWeek ||
      item.daysOfWeek.length === 0 ||
      item.daysOfWeek.includes(dayOfWeek);

    return {
      stt: item.stt,
      title: item.title,
      description: item.description,
      isDueToday,
      scheduleLabel: item.scheduleLabel,
      done: false,
      note: "",
    };
  });
}

/**
 * Validates that every item due today is either ticked `done` or has a reason note (>= 3 chars).
 */
export function validateDailyChecklistCompletion(
  entries: DailyChecklistEntry[],
): { isValid: boolean; missingItems: DailyChecklistEntry[] } {
  const missingItems = entries.filter(
    (item) => item.isDueToday && !item.done && item.note.trim().length < 3,
  );

  return {
    isValid: missingItems.length === 0,
    missingItems,
  };
}

