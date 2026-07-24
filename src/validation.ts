import { address, isAddress } from "@solana/kit";

const MAX_SAFE_PAYMENT = 1_000_000;

export function parseAddress(value: string, fieldName: string): ReturnType<typeof address> {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`${fieldName} must be a valid Solana address`);
  }
  return address(trimmed);
}

export function parseAmount(value: string | number): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive finite number");
  }
  if (amount > MAX_SAFE_PAYMENT) {
    throw new Error(`amount exceeds the ${MAX_SAFE_PAYMENT} safety ceiling`);
  }
  if (!Number.isSafeInteger(Math.round(amount * 1_000_000_000))) {
    throw new Error("amount has too many decimal places");
  }
  return amount;
}

export function sanitizeText(value: string | undefined, fallback: string, maxLength = 120): string {
  const normalized = (value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
}

export function normalizeOrderId(value: string | undefined): string {
  const normalized = sanitizeText(value, `order-${Date.now()}`, 64);
  if (!/^[a-zA-Z0-9._:-]+$/.test(normalized)) {
    throw new Error("order-id may contain only letters, numbers, dot, underscore, colon, and hyphen");
  }
  return normalized;
}
