"use client";

import { forwardRef, useId, type SVGProps } from "react";
import { cn } from "@/lib/utils";

type MetalTabIconProps = SVGProps<SVGSVGElement>;

/**
 * Metal tabs: Gold (sparkle + ring hint), Silver (crescent moon), Diamond (faceted gem).
 * Gradients use currentColor so icons stay legible on amber (active) and slate (inactive).
 */
export const GoldJewelleryRingIcon = forwardRef<
  SVGSVGElement,
  MetalTabIconProps
>(function GoldJewelleryRingIcon({ className, ...props }, ref) {
  const id = useId().replace(/:/g, "");
  const gg = `${id}-gold`;

  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("overflow-visible", className)}
      aria-hidden
      {...props}
    >
      <defs>
        <linearGradient id={gg} x1="5" y1="3" x2="16" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.32" />
          <stop offset="0.45" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.58" />
        </linearGradient>
      </defs>
      <ellipse
        cx="12"
        cy="18.85"
        rx="5"
        ry="1.28"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity={0.36}
      />
      <path
        d="M12 3.2 13.72 8.42 19.05 10 13.72 11.58 12 16.8 10.28 11.58 4.95 10 10.28 8.42z"
        fill={`url(#${gg})`}
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.4 12.95 9.2 15.85 10 12.95 10.8 12 13.6 11.05 10.8 8.15 10 11.05 9.2z"
        fill="currentColor"
        opacity={0.22}
      />
      <path
        d="M19.2 5.4 19.5 6.35 20.45 6.65 19.5 6.95 19.2 7.9 18.9 6.95 17.95 6.65 18.9 6.35z"
        fill="currentColor"
        opacity={0.52}
      />
      <path
        d="M4.85 8.1 5.1 8.8 5.8 9.05 5.1 9.3 4.85 10 4.6 9.3 3.9 9.05 4.6 8.8z"
        fill="currentColor"
        opacity={0.42}
      />
    </svg>
  );
});

/** Crescent moon (Lucide moon silhouette), shaded for a gentle 3D read. */
export const SilverMoonMetalIcon = forwardRef<
  SVGSVGElement,
  MetalTabIconProps
>(function SilverMoonMetalIcon({ className, ...props }, ref) {
  const id = useId().replace(/:/g, "");
  const mg = `${id}-moon`;

  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("overflow-visible", className)}
      aria-hidden
      {...props}
    >
      <defs>
        <linearGradient id={mg} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="0.38" stopColor="currentColor" stopOpacity="0.92" />
          <stop offset="0.72" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <path
        d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
        fill={`url(#${mg})`}
        stroke="currentColor"
        strokeWidth="0.4"
        strokeLinejoin="round"
      />
      <path
        d="M12.85 4.1c2.9.55 5.35 2.65 6.35 5.55"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity={0.28}
        fill="none"
      />
    </svg>
  );
});

/** Faceted gem — Lucide Gem proportions with fill + inner facet strokes. */
export const DiamondJewelleryIcon = forwardRef<
  SVGSVGElement,
  MetalTabIconProps
>(function DiamondJewelleryIcon({ className, ...props }, ref) {
  const id = useId().replace(/:/g, "");
  const dg = `${id}-diamond`;

  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("overflow-visible", className)}
      aria-hidden
      {...props}
    >
      <defs>
        <linearGradient id={dg} x1="12" y1="3" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="0.42" stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.78" stopColor="currentColor" stopOpacity="0.72" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <path
        d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z"
        fill={`url(#${dg})`}
        stroke="currentColor"
        strokeWidth="0.55"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 3 8 9l4 13 4-13-2.5-6"
        stroke="currentColor"
        strokeWidth="0.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.4}
      />
      <path
        d="M2 9h20"
        stroke="currentColor"
        strokeWidth="0.35"
        strokeLinecap="round"
        opacity={0.32}
      />
    </svg>
  );
});
