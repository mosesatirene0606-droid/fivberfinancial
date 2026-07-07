import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  variant?: "icon" | "horizontal" | "stacked" | "mark";
  className?: string;
  alt?: string;
};

export function BrandLogo({
  variant = "horizontal",
  className,
  alt = BRAND.name,
}: BrandLogoProps) {
  const src =
    variant === "icon"
      ? BRAND.assets.icon
      : variant === "stacked"
        ? BRAND.assets.stacked
        : variant === "mark"
          ? BRAND.assets.mark
          : BRAND.assets.horizontal;

  return (
    <img
      src={src}
      alt={alt}
      className={cn("select-none object-contain", className)}
      draggable={false}
    />
  );
}