import { useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { appearanceLogoURL, useAppearanceStore } from "@/stores/use-appearance-store";
import type { ThemeName } from "@/stores/use-theme-store";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";

type BrandLogoProps = {
    className?: string;
    fallback: ReactNode;
    alt?: string;
    theme?: ThemeName | "auto";
};

export function BoboMarkGlyph({ className }: { className?: string }) {
    return (
        <svg className={cn("bobo-mark-glyph", className)} viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="58" height="58" rx="19" fill="#F3F8F7" />
            <path d="M16 24.5C16 16.49 22.49 10 30.5 10c7.38 0 13.46 5.5 14.37 12.63A11.5 11.5 0 0 1 44.5 45.5H29.75l-7.1 7.1a2 2 0 0 1-3.42-1.42V44.5A15.43 15.43 0 0 1 16 34.5v-10Z" fill="#18786F" />
            <circle cx="26" cy="29" r="3" fill="#F3F8F7" />
            <circle cx="36" cy="29" r="3" fill="#F3F8F7" />
            <path d="M26 37.5c1.73 1.67 3.72 2.5 6 2.5s4.27-.83 6-2.5" stroke="#F3F8F7" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="49" cy="16" r="8" fill="#B4782D" />
            <circle cx="49" cy="16" r="3" fill="#F3F8F7" />
            <circle cx="49" cy="48" r="4" fill="#A45368" />
        </svg>
    );
}

export function BrandLogo({ className, fallback, alt = "", theme = "auto" }: BrandLogoProps) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const currentTheme = useActiveTheme();
    const source = appearanceLogoURL(appearance, theme === "auto" ? currentTheme : theme);
    const [failedSource, setFailedSource] = useState<string | null>(null);
    // A configured custom logo must never fall through to the built-in brand
    // when its file becomes unavailable. Keep its footprint neutral instead.
    if (failedSource === source) return appearance.logoConfigured ? <span className={cn("block", className)} aria-hidden="true" /> : <>{fallback}</>;
    return (
        <img
            src={source}
            alt={alt}
            className={cn("block object-contain", className)}
            draggable={false}
            onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
                setFailedSource(source);
            }}
        />
    );
}

export function BrandLogoFrame({ className, logoClassName, fallback, alt = "", theme = "auto" }: BrandLogoProps & { logoClassName?: string }) {
    const frameEnabled = useAppearanceStore((state) => state.appearance.logoFrameEnabled);
    const unframedStyle: CSSProperties | undefined = frameEnabled
        ? undefined
        : {
              background: "transparent",
              borderColor: "transparent",
              borderRadius: 0,
              boxShadow: "none",
              color: "inherit",
          };
    return (
        <span className={cn("brand-logo-frame", className)} data-logo-frame-enabled={frameEnabled} style={unframedStyle}>
            <BrandLogo className={logoClassName} fallback={fallback} alt={alt} theme={theme} />
        </span>
    );
}
