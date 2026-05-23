"use client";

import { forwardRef, useId, type ReactNode, type SVGProps } from "react";
import { cn } from "@/lib/utils";

type MetalTabIconProps = SVGProps<SVGSVGElement> & {
  /** Active metal tab — favicon uses a lighter glyph on the amber pill. */
  active?: boolean;
};

function MetalTabFavicon({
  active,
  gradientClass,
  children,
  className,
}: {
  active?: boolean;
  gradientClass: string;
  children: ReactNode;
  className?: string;
}) {
  if (active) {
    return (
      <span
        className={cn(
          "inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-[5px] bg-white/20 ring-1 ring-white/25",
          className,
        )}
        aria-hidden
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br shadow-sm ring-1 ring-white/10",
        gradientClass,
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** Gold — warm favicon badge with sparkle mark. */
export const GoldJewelleryRingIcon = forwardRef<SVGSVGElement, MetalTabIconProps>(
  function GoldJewelleryRingIcon({ className, active, ...props }, ref) {
    const id = useId().replace(/:/g, "");
    const gg = `${id}-gold`;

    return (
      <MetalTabFavicon active={active} gradientClass="from-amber-300 via-amber-500 to-yellow-700">
        <svg
          ref={ref}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("size-3 text-white", className)}
          aria-hidden
          {...props}
        >
          <defs>
            <linearGradient id={gg} x1="3" y1="2" x2="13" y2="14" gradientUnits="userSpaceOnUse">
              <stop stopColor="currentColor" stopOpacity="0.85" />
              <stop offset="1" stopColor="currentColor" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d="M8 1.5 9.15 5.6 13.2 6.75 9.15 7.9 8 12 6.85 7.9 2.8 6.75 6.85 5.6z"
            fill={`url(#${gg})`}
          />
          <circle cx="12.5" cy="3.2" r="0.65" fill="currentColor" opacity={0.9} />
        </svg>
      </MetalTabFavicon>
    );
  },
);

/** Silver — cool moon favicon. */
export const SilverMoonMetalIcon = forwardRef<SVGSVGElement, MetalTabIconProps>(
  function SilverMoonMetalIcon({ className, active, ...props }, ref) {
    return (
      <MetalTabFavicon active={active} gradientClass="from-slate-200 via-slate-400 to-slate-600">
        <svg
          ref={ref}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("size-3 text-white", className)}
          aria-hidden
          {...props}
        >
          <path
            d="M13.2 8.3a5.5 5.5 0 1 1-5.8-5.8c.25-.01.38.28.25.49a3.7 3.7 0 0 0 5.1 5.1c.27-.17.65-.02.45.21Z"
            fill="currentColor"
            opacity={0.95}
          />
        </svg>
      </MetalTabFavicon>
    );
  },
);

/** Diamond — faceted gem favicon. */
export const DiamondJewelleryIcon = forwardRef<SVGSVGElement, MetalTabIconProps>(
  function DiamondJewelleryIcon({ className, active, ...props }, ref) {
    return (
      <MetalTabFavicon active={active} gradientClass="from-sky-300 via-cyan-400 to-indigo-600">
        <svg
          ref={ref}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("size-3 text-white", className)}
          aria-hidden
          {...props}
        >
          <path
            d="M11.4 2.2a1.2 1.2 0 0 1 .96.48l1.8 2.4a1.2 1.2 0 0 1 .01 1.43l-4.8 6.6a1.2 1.2 0 0 1-1.95 0l-4.8-6.6a1.2 1.2 0 0 1 .01-1.43l1.8-2.4a1.2 1.2 0 0 1 .96-.48h5.01Z"
            fill="currentColor"
            opacity={0.92}
          />
          <path d="M7 2.2 5.3 6.2 8 13.5 10.7 6.2 9 2.2" stroke="currentColor" strokeWidth="0.35" opacity={0.45} />
        </svg>
      </MetalTabFavicon>
    );
  },
);

/** Gifting — gift box favicon. */
export const GiftingJewelleryIcon = forwardRef<SVGSVGElement, MetalTabIconProps>(
  function GiftingJewelleryIcon({ className, active, ...props }, ref) {
    return (
      <MetalTabFavicon active={active} gradientClass="from-rose-400 via-pink-500 to-rose-700">
        <svg
          ref={ref}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("size-3 text-white", className)}
          aria-hidden
          {...props}
        >
          <rect x="3" y="7.2" width="10" height="6.3" rx="0.8" fill="currentColor" opacity={0.92} />
          <path d="M8 7.2v6.3" stroke="currentColor" strokeWidth="0.55" opacity={0.55} />
          <path
            d="M8 7.2c-1.45-1.85-3.2-2.1-4.1-.95-.75 1-.15 2.15 2.05 1.55 1.55-.45 2.05-1.05 2.05-1.05s.5.6 2.05 1.05c2.2.6 2.8-.55 2.05-1.55-.9-1.15-2.65-.9-4.1.95Z"
            fill="currentColor"
            opacity={0.75}
          />
          <path
            d="M6.8 3.8c.4-.75 1.05-1.15 1.65-1 .45.1.75.45 1 1 .25-.55.55-.9 1-1 .6-.15 1.25.25 1.65 1 .55 1-.05 2.15-2.05 2.55-2-.4-2.6-1.55-2.05-2.55Z"
            fill="currentColor"
          />
        </svg>
      </MetalTabFavicon>
    );
  },
);
