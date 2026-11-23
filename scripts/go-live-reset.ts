import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  executeGoLiveReset,
  parseGoLiveResetArgs,
} from "../src/modules/ops/go-live-reset.service";

function printUsage(): void {
  console.log(`
================================================================
  D'Lat Cafe Workforce — Công cụ Dọn Dữ liệu Demo (go-live-reset)
================================================================

Cách dùng:
  1. Xem trước an toàn (KHÔNG xóa dữ liệu):
     npx tsx scripts/go-live-reset.ts --dry-run

  2. Thực thi xóa dữ liệu demo & khởi tạo tài khoản Chủ quán thật:
     npx tsx scripts/go-live-reset.ts --confirm \\
       --owner-email "chuquan@dlatcafe.vn" \\
       --owner-password "MatKhauManh@2026" \\
       --owner-name "Nguyễn Văn Chủ" \\
       --owner-phone "0901234567"

Tùy chọn:
  --dry-run           Chỉ thống kê dữ liệu sẽ xóa & giữ nguyên (mặc định an toàn)
  --confirm           Xác nhận bắt buộc để thực thi xóa dữ liệu demo
  --skip-backup       Bỏ qua bước tạo file JSON backup tự động (không khuyến nghị)
  --backup-dir <dir>  Thư mục lưu file backup trước khi xóa (mặc định: ./backups)
  --owner-email       Email tài khoản Chủ quán thật cần tạo sau khi dọn
  --owner-password    Mật khẩu mạnh (>=8 ký tự, có chữ hoa, thường, số)
  --owner-name        Họ tên Chủ quán
  --owner-phone       Số điện thoại Chủ quán
  --owner-code        Mã nhân viên Chủ quán (mặc định: NV001)

Lưu ý an toàn:
  - Trước khi chạy --confirm trên môi trường thật, nên chạy thêm:
    powershell -File scripts/backup-db.ps1
  - Script LUÔN GIỮ NGUYÊN: SystemSetting, khung ca (CA_1..CA_4) và danh mục Vị trí.
`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const options = parseGoLiveResetArgs(argv);
  if (!options.dryRun && !options.confirm) {
    printUsage();
    console.error(
      "❌ BỊ CHẶN AN TOÀN: Vui lòng truyền --dry-run để xem trước, hoặc --confirm để xác nhận thực thi.",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const report = await executeGoLiveReset(prisma, options);

    if (report.mode === "DRY_RUN") {
      console.log("\n🔍 [DRY-RUN] XEM TRƯỚC — KHÔNG CÓ DỮ LIỆU NÀO BỊ XÓA\n");
    } else {
      console.log("\n✅ [EXECUTED] ĐÃ DỌN DỮ LIỆU DEMO THÀNH CÔNG\n");
      if (report.backupFilePath) {
        console.log(`💾 File backup trước khi xóa: ${report.backupFilePath}\n`);
      }
    }

    console.log("📦 Dữ liệu nghiệp vụ/demo (sẽ xóa / đã xóa):");
    for (const [table, count] of Object.entries(report.wouldDeleteOrDeleted)) {
      if (count > 0) {
        console.log(`   - ${table}: ${count} bản ghi`);
      }
    }

    console.log("\n🛡️ Cấu hình hệ thống ĐƯỢC GIỮ NGUYÊN 100%:");
    console.log(
      `   - SystemSetting (${report.preserved.systemSettingKeys.length}): ${report.preserved.systemSettingKeys.join(", ") || "(trống)"}`,
    );
    console.log(
      `   - Khung ca hoạt động (${report.preserved.shiftTemplateCodes.length}): ${report.preserved.shiftTemplateCodes.join(", ") || "(trống)"}`,
    );
    console.log(
      `   - Danh mục vị trí (${report.preserved.positionCodes.length}): ${report.preserved.positionCodes.join(", ") || "(trống)"}`,
    );

    if (report.bootstrappedOwner) {
      console.log("\n👤 Tài khoản Chủ quán thật:");
      console.log(
        `   - ${report.bootstrappedOwner.fullName} (${report.bootstrappedOwner.employeeCode}) — ${report.bootstrappedOwner.email}`,
      );
    }

    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ Lỗi go-live-reset: ${message}\n`);
  process.exit(1);
});
