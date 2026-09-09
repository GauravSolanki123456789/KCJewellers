import type { Metadata } from "next";
import { LOGIN_PATH } from "@/lib/routes";
import { staffRouteMetadata } from "@/lib/staff-metadata";
import LoginPageClient from "./login-page-client";

export async function generateMetadata(): Promise<Metadata> {
  return staffRouteMetadata("Sign in", LOGIN_PATH);
}

export default function LoginPage() {
  return <LoginPageClient />;
}
