import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert Rupees to Paise for Razorpay. API returns amount in Rupees; Razorpay expects integer paise. */
export function toPaise(rupees: number | string): number {
  return Math.round(Number(rupees) * 100)
}
