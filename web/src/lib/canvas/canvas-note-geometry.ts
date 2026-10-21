/**
 * 笔记节点的几何与视觉参数。
 *
 * 单独成文件的原因（对齐 AI-Canvas 的 `canvasNoteGeometry` 做法）：笔记的
 * 「色调 → 背景/文字/强调色」「尺寸 → 内容可用高度」这类换算是纯函数，
 * 渲染层和测试都要用，放进 React 组件里就没法单测，也容易在两处写出不一致的数值。
 */

export type NoteTone = "amber" | "sky" | "rose" | "violet" | "slate";

export type NoteTonePalette = {
    /** 便签顶部色条与图标色。 */
    accent: string;
    /** 同色系的浅底，用于 hover / 选中态。 */
    wash: string;
};

export type NoteSurface = {
    background: string;
    text: string;
    muted: string;
    border: string;
};

export const NOTE_TONES: readonly NoteTone[] = ["amber", "sky", "rose", "violet", "slate"];

/**
 * 五套便签色调。
 *
 * 用固定 hex 而不是主题 token：笔记的语义就是"在画布上贴一张有颜色的纸"，
 * 若跟随明暗主题变化，同一条笔记在浅色/深色下会变成两种颜色，用户就无法
 * 靠颜色做记忆锚点。深色主题下通过降低背景不透明度来保证可读（见 resolveNoteSurface）。
 */
const NOTE_PALETTES: Record<NoteTone, NoteTonePalette> = {
    amber: { accent: "#f59e0b", wash: "rgba(245,158,11,.14)" },
    sky: { accent: "#0ea5e9", wash: "rgba(14,165,233,.14)" },
    rose: { accent: "#f43f5e", wash: "rgba(244,63,94,.14)" },
    violet: { accent: "#8b5cf6", wash: "rgba(139,92,246,.14)" },
    slate: { accent: "#64748b", wash: "rgba(100,116,139,.14)" },
};

export function noteTonePalette(tone: NoteTone): NoteTonePalette {
    return NOTE_PALETTES[tone] || NOTE_PALETTES.amber;
}

/** 无法判断主题明暗时按深色画布处理：深色是当前默认工作区外观。 */
function isDarkSurface(panelColor: string) {
    const match = /^#([0-9a-f]{6})$/i.exec(panelColor.trim());
    if (!match) return true;
    const value = parseInt(match[1], 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    // 感知亮度：绿通道权重最高，与画布其余部分用同一套判断口径。
    return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

/**
 * 把色调折算成实际可用的表面色。
 *
 * 深色画布上用半透明 wash 叠在节点面板色上，浅色画布上直接用 wash：
 * 这样"黄色便签"在两种主题下都能看出来，又不会在深色下亮得刺眼。
 */
export function resolveNoteSurface(palette: NoteTonePalette, panelColor: string): NoteSurface {
    const dark = isDarkSurface(panelColor);
    return {
        background: dark ? `color-mix(in srgb, ${palette.accent} 12%, ${panelColor})` : palette.wash,
        text: dark ? "rgba(255,255,255,.92)" : "#1f2937",
        muted: dark ? "rgba(255,255,255,.45)" : "rgba(31,41,55,.45)",
        border: dark ? `color-mix(in srgb, ${palette.accent} 34%, transparent)` : `color-mix(in srgb, ${palette.accent} 26%, transparent)`,
    };
}

/** 便签正文最多显示的行数上限：超出交给滚动，避免笔记长得像文本节点。 */
export const NOTE_MAX_VISIBLE_LINES = 12;

/**
 * 内容区可用高度。
 *
 * 扣掉顶部色条（4px）、上下内边距和标题行高度——列表/缩略图渲染需要这个值来
 * 决定要不要截断，因此和渲染层共用同一计算，不各自估算。
 */
export function noteContentHeight(nodeHeight: number) {
    const CHROME = 4 + 8 + 12;
    return Math.max(nodeHeight - CHROME, 0);
}

/**
 * 笔记默认尺寸下的"一行文字高度"，用于估算截断阈值。
 * 与 note-node.tsx 里的 lineHeight: 1.6 保持一致。
 */
export function noteLineHeight(fontSizePx: number) {
    return fontSizePx * 1.6;
}
