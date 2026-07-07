import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type AppLoaderProps = {
  fullscreen?: boolean;
  label?: string;
  size?: number;
  className?: string;
};

export function AppLoader({
  fullscreen = false,
  label = "Loading fivberfinancial...",
  size = 160,
  className,
}: AppLoaderProps) {
  return (
    <div
      className={cn(
        "ff-loader",
        fullscreen && "ff-loader--fullscreen",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className="ff-loader__frame"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <div className="ff-loader__ring ff-loader__ring--outer" />
        <div className="ff-loader__ring ff-loader__ring--inner" />
        <div className="ff-loader__core">
          <img
            src={BRAND.assets.icon}
            alt={BRAND.name}
            className="ff-loader__icon"
            draggable={false}
          />
        </div>
      </div>

      {label ? <p className="ff-loader__label">{label}</p> : null}
    </div>
  );
}