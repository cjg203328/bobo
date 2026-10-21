import { describe, expect, test } from "bun:test";

import { brandStudioLabel, DEFAULT_PUBLIC_APPEARANCE, normalizePublicAppearance } from "@/stores/use-appearance-store";

describe("波波 AI 画布默认品牌", () => {
    test("内置外观使用新产品品牌和图标", () => {
        expect(DEFAULT_PUBLIC_APPEARANCE.brandName).toBe("波波 AI 画布");
        expect(DEFAULT_PUBLIC_APPEARANCE.brandSlug).toBe("bobo-ai-canvas");
        expect(DEFAULT_PUBLIC_APPEARANCE.logoUrl).toBe("/bobo-mark.svg");
        expect(DEFAULT_PUBLIC_APPEARANCE.authVideoUrl).toBe("/bobo-hero.mp4");
        expect(DEFAULT_PUBLIC_APPEARANCE.authVideoPosterUrl).toBe("/bobo-hero-poster.jpg");
        expect(DEFAULT_PUBLIC_APPEARANCE.seoTitle).toBe("波波 AI 画布");
        expect(brandStudioLabel(DEFAULT_PUBLIC_APPEARANCE)).toBe("BOBO AI CANVAS");
    });

    test("迁移完全匹配旧内置默认项的品牌文案", () => {
        const appearance = normalizePublicAppearance({
            brandName: "Huabu",
            brandSlug: "huabu",
            authHeroTitle: "让一个故事，\n从文字走向银幕。",
            seoTitle: "Huabu",
            seoDescription: "Huabu，本地优先的开源 AI 视频创作工作台。",
            footerCopyright: "© 2025 Huabu. Open source video studio.",
        });

        expect(appearance.brandName).toBe("波波 AI 画布");
        expect(appearance.brandSlug).toBe("bobo-ai-canvas");
        expect(appearance.authHeroTitle).toBe(DEFAULT_PUBLIC_APPEARANCE.authHeroTitle);
        expect(appearance.seoTitle).toBe("波波 AI 画布");
        expect(appearance.seoDescription).toBe(DEFAULT_PUBLIC_APPEARANCE.seoDescription);
        expect(appearance.footerCopyright).toBe(DEFAULT_PUBLIC_APPEARANCE.footerCopyright);
        expect(appearance.logoUrl).toBe("/bobo-mark.svg");
    });

    test("保留自定义品牌名、站点标题和已配置图标", () => {
        const appearance = normalizePublicAppearance({
            brandName: "光屿 Studio",
            brandSlug: "huabu",
            seoTitle: "光屿 Studio 创作台",
            logoConfigured: true,
            logoUrl: "https://assets.example.com/brand.png",
        });

        expect(appearance.brandName).toBe("光屿 Studio");
        expect(appearance.seoTitle).toBe("光屿 Studio 创作台");
        expect(appearance.logoUrl).toBe("https://assets.example.com/brand.png");
        expect(brandStudioLabel(appearance)).toBe("光屿 STUDIO");
    });
});
