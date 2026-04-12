import type { Metadata } from "next";
import WholesaleOrderClient from "./wholesale-order-client";

export const metadata: Metadata = {
  title: "Wholesale quick order",
  description:
    "Dense spreadsheet-style ordering for B2B wholesale buyers — KC Jewellers.",
};

export default function WholesaleOrderPage() {
  return <WholesaleOrderClient />;
}
