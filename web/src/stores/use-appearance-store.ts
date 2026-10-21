import { create } from "zustand";

import type { PublicAppearance } from "@/services/api/appearance";
import { applySkinTheme, DEFAULT_CLASSIC_SKIN, normalizeSkinDefinition } from "@/lib/skin-themes";

export const DEFAULT_PUBLIC_APPEARANCE: PublicAppearance = {
    schemaVersion: 7,
    brandName: "波波 AI 画",
    brandSlug: "bobo-ai-canvas",
    authHeroTitle: "把创作目标，\n交给波波 Agent。",
    authHeroDescription: "从提示词、参考素材到图像与视频方案，Agent 与你一起完成每一步。",
    logoUrl: "/bobo-mark.svg",
    darkLogoUrl: "/bobo-mark.svg",
    logoFrameEnabled: false,
    authVideoUrl: "/bobo-hero.mp4",
    authVideoPosterUrl: "/bobo-hero-poster.jpg",
    authVideoAutoplay: true,
    skinId: "classic",
    activeSkin: DEFAULT_CLASSIC_SKIN,
    seoTitle: "波波 AI 画",
    seoDescription: "波波 AI 画，面向图像与视频创作的智能体工作台。",
    seoKeywords: "AI 画布,创作智能体,AI 生图,AI 生视频,提示词优化,提示词反推,Agent 技能",
    footerCopyright: `${new Date().getFullYear()} 波波 AI 画。保留所有权利。`,
    icpFilingEnabled: false,
    icpFilingNumber: "",
    logoConfigured: false,
    darkLogoConfigured: false,
    authVideoConfigured: false,
    authVideoPosterConfigured: false,
    configured: false,
    revision: "builtin",
};

type AppearanceStore = {
    appearance: PublicAppearance;
    resolved: boolean;
    setAppearance: (appearance: PublicAppearance) => void;
};

export const useAppearanceStore = create<AppearanceStore>((set) => ({
    appearance: DEFAULT_PUBLIC_APPEARANCE,
    resolved: false,
    setAppearance: (appearance) => set({ appearance, resolved: true }),
}));

export function normalizePublicAppearance(value?: Partial<PublicAppearance> | null): PublicAppearance {
    const brandName = String(value?.brandName || "").trim();
    const legacyDefaultBrand = brandName === "Huabu" && String(value?.brandSlug || "").trim().toLowerCase() === "huabu";
    const brandSlug = legacyDefaultBrand ? DEFAULT_PUBLIC_APPEARANCE.brandSlug : normalizeBrandSlug(value?.brandSlug);
    const isLegacyHero = legacyDefaultBrand && value?.authHeroTitle === "让一个故事，\n从文字走向银幕。";
    const authHeroTitle = normalizeAppearanceCopy(isLegacyHero ? DEFAULT_PUBLIC_APPEARANCE.authHeroTitle : value?.authHeroTitle, DEFAULT_PUBLIC_APPEARANCE.authHeroTitle);
    const authHeroDescription = normalizeAppearanceCopy(value?.authHeroDescription, DEFAULT_PUBLIC_APPEARANCE.authHeroDescription, true);
    const customVideo = Boolean(value?.authVideoConfigured);
    const customLogo = Boolean(value?.logoConfigured);
    const customDarkLogo = Boolean(value?.darkLogoConfigured);
    const logoUrl = customLogo ? safeAppearanceURL(value?.logoUrl, DEFAULT_PUBLIC_APPEARANCE.logoUrl) : DEFAULT_PUBLIC_APPEARANCE.logoUrl;
    const darkLogoUrl = customDarkLogo ? safeAppearanceURL(value?.darkLogoUrl, logoUrl) : customLogo ? logoUrl : DEFAULT_PUBLIC_APPEARANCE.darkLogoUrl;
    const resolvedBrandName = legacyDefaultBrand || !brandName ? DEFAULT_PUBLIC_APPEARANCE.brandName : brandName;
    const legacySeoTitle = legacyDefaultBrand && value?.seoTitle?.trim() === "Huabu";
    const legacySeoDescription = legacyDefaultBrand && value?.seoDescription === "Huabu，本地优先的开源 AI 视频创作工作台。";
    const legacyCopyright = legacyDefaultBrand && /^© \d{4} Huabu\. Open source video studio\.$/.test(value?.footerCopyright || "");
    const seoTitle = normalizeAppearanceCopy(legacySeoTitle ? DEFAULT_PUBLIC_APPEARANCE.seoTitle : value?.seoTitle, resolvedBrandName);
    const seoDescription = normalizeAppearanceCopy(legacySeoDescription ? DEFAULT_PUBLIC_APPEARANCE.seoDescription : value?.seoDescription, `${resolvedBrandName}，面向 AI 视觉创作的工作台。`, true);
    const seoKeywords = normalizeAppearanceCopy(value?.seoKeywords, "", true);
    const footerCopyright = normalizeAppearanceCopy(legacyCopyright ? DEFAULT_PUBLIC_APPEARANCE.footerCopyright : value?.footerCopyright, DEFAULT_PUBLIC_APPEARANCE.footerCopyright);
    const icpFilingNumber = normalizeAppearanceCopy(value?.icpFilingNumber, "", true);
    return {
        ...DEFAULT_PUBLIC_APPEARANCE,
        ...value,
        schemaVersion: 7,
        brandName: resolvedBrandName,
        brandSlug,
        authHeroTitle,
        authHeroDescription,
        logoUrl,
        darkLogoUrl,
        logoFrameEnabled: customLogo ? value?.logoFrameEnabled !== false : DEFAULT_PUBLIC_APPEARANCE.logoFrameEnabled,
        authVideoUrl: safeAppearanceURL(value?.authVideoUrl, DEFAULT_PUBLIC_APPEARANCE.authVideoUrl),
        authVideoPosterUrl: safeAppearanceURL(value?.authVideoPosterUrl, customVideo ? "" : DEFAULT_PUBLIC_APPEARANCE.authVideoPosterUrl),
        authVideoAutoplay: value?.authVideoAutoplay !== false,
        skinId: normalizeSkinDefinition(value?.activeSkin).id,
        activeSkin: normalizeSkinDefinition(value?.activeSkin),
        seoTitle,
        seoDescription,
        seoKeywords,
        footerCopyright,
        icpFilingEnabled: Boolean(value?.icpFilingEnabled && icpFilingNumber),
        icpFilingNumber,
        logoConfigured: Boolean(value?.logoConfigured),
        darkLogoConfigured: Boolean(value?.darkLogoConfigured),
        authVideoConfigured: customVideo,
        authVideoPosterConfigured: Boolean(value?.authVideoPosterConfigured),
        configured: Boolean(value?.configured),
        revision: String(value?.revision || DEFAULT_PUBLIC_APPEARANCE.revision),
    };
}

function normalizeAppearanceCopy(value: unknown, fallback: string, allowEmpty = false) {
    if (typeof value !== "string") return fallback;
    const normalized = value.replace(/\r\n?/g, "\n").trim();
    return normalized || (allowEmpty ? "" : fallback);
}

export function commitPublicAppearance(value?: Partial<PublicAppearance> | null) {
    const appearance = normalizePublicAppearance(value);
    useAppearanceStore.getState().setAppearance(appearance);
    applySkinTheme(appearance.activeSkin, "dark");
    applyAppearanceMetadata(appearance);
    return appearance;
}

export function applyAppearanceMetadata(appearance: PublicAppearance, targetDocument: Document | undefined = typeof document === "undefined" ? undefined : document) {
    if (!targetDocument) return;
    targetDocument.title = appearance.seoTitle || appearance.brandName;
    setMeta(targetDocument, "name", "description", appearance.seoDescription);
    setMeta(targetDocument, "name", "keywords", appearance.seoKeywords);
    setMeta(targetDocument, "property", "og:title", appearance.seoTitle || appearance.brandName);
    setMeta(targetDocument, "property", "og:description", appearance.seoDescription);
    setMeta(targetDocument, "property", "og:site_name", appearance.brandName);
    setMeta(targetDocument, "property", "og:type", "website");
    setMeta(targetDocument, "name", "twitter:card", "summary");
    setMeta(targetDocument, "name", "twitter:title", appearance.seoTitle || appearance.brandName);
    setMeta(targetDocument, "name", "twitter:description", appearance.seoDescription);
    const mode = "dark";
    setMeta(targetDocument, "name", "theme-color", appearance.activeSkin.tokens[mode].canvas);
    let favicon = targetDocument.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!favicon) {
        favicon = targetDocument.createElement("link");
        favicon.rel = "icon";
        targetDocument.head.appendChild(favicon);
    }
    favicon.href = appearanceLogoURL(appearance, "dark");
    favicon.removeAttribute("type");

    const location = targetDocument.defaultView?.location;
    if (location && (location.protocol === "http:" || location.protocol === "https:")) {
        let canonical = targetDocument.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        if (!canonical) {
            canonical = targetDocument.createElement("link");
            canonical.rel = "canonical";
            targetDocument.head.appendChild(canonical);
        }
        canonical.href = `${location.origin}${location.pathname}`;
    }
}

function setMeta(targetDocument: Document, attribute: "name" | "property", key: string, content: string) {
    let element = targetDocument.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!content) {
        element?.remove();
        return;
    }
    if (!element) {
        element = targetDocument.createElement("meta");
        element.setAttribute(attribute, key);
        targetDocument.head.appendChild(element);
    }
    element.content = content;
}

export function appearanceLogoURL(appearance: PublicAppearance, theme: "light" | "dark") {
    return theme === "dark" ? appearance.darkLogoUrl || appearance.logoUrl : appearance.logoUrl || appearance.darkLogoUrl;
}

export function brandStudioLabel(appearance: PublicAppearance) {
    if (appearance.brandName === DEFAULT_PUBLIC_APPEARANCE.brandName && appearance.brandSlug === DEFAULT_PUBLIC_APPEARANCE.brandSlug) return "BOBO AI CANVAS";
    if (appearance.brandSlug === "huabu") return appearance.brandName.toLocaleUpperCase();
    return appearance.brandSlug.replace(/-+/g, " ").toLocaleUpperCase();
}

function normalizeBrandSlug(value: unknown) {
    const candidate = String(value || "")
        .trim()
        .toLocaleLowerCase();
    return /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(candidate) ? candidate : DEFAULT_PUBLIC_APPEARANCE.brandSlug;
}

function safeAppearanceURL(value: unknown, fallback: string) {
    const candidate = String(value || "").trim();
    if (!candidate) return fallback;
    if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol === "https:") return parsed.toString();
    } catch {
        // Invalid or unsafe asset locations fall back to the bundled appearance.
    }
    return fallback;
}
