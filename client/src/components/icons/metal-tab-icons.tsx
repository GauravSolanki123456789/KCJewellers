import type { SVGProps } from "react";

export type MetalTabSvgProps = SVGProps<SVGSVGElement>;

/**
 * Jewellery-forward metal tab glyphs (stroke icons, `currentColor`).
 * Replaces generic Lucide shapes (sparkles / layout grid / gem) on catalog surfaces.
 */

export function GoldJewelleryRingIcon(props: MetalTabSvgProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="5.35"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SilverMoonMetalIcon(props: MetalTabSvgProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DiamondJewelleryIcon(props: MetalTabSvgProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M12 2.75 19.25 9.25 12 20.25 4.75 9.25 12 2.75z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      <path
        d="M12 2.75v7.25M4.75 9.25h14.5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  );
}
