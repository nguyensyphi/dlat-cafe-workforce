export function formatVnd(amount: bigint | number | string): string {
  const numericValue =
    typeof amount === "bigint"
      ? amount
      : typeof amount === "string"
        ? BigInt(amount)
        : BigInt(Math.trunc(amount));

  const isNegative = numericValue < 0n;
  const absStr = (isNegative ? -numericValue : numericValue).toString();
  const grouped = absStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${isNegative ? "-" : ""}${grouped} ₫`;
}

export function parseVndToBigInt(input: string | number | bigint): bigint {
  if (typeof input === "bigint") {
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input) || !Number.isInteger(input)) {
      throw new Error("Số tiền VND phải là số nguyên hợp lệ");
    }
    return BigInt(input);
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Số tiền VND không được để trống");
  }

  const isNegative = trimmed.startsWith("-");
  const cleaned = trimmed
    .replace(/^-/, "")
    .replace(/[₫đ\s.,_vVnNdD]/g, "");

  if (!/^\d+$/.test(cleaned)) {
    throw new Error("Số tiền VND không hợp lệ");
  }

  const val = BigInt(cleaned);
  return isNegative ? -val : val;
}

