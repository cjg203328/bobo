import { StickyNote } from "lucide-react";

import type { NoteTonePalette, NoteSurface } from "@/lib/canvas/canvas-note-geometry";

/**
 * 空笔记的占位。
 *
 * 刻意不用通用 Empty 组件：笔记的空态要传达"这里可以写"，而不是"这里没有数据"，
 * 所以用铅笔感的图标 + 动作文案，且整体降低不透明度，避免抢画布注意力。
 */
export function EmptyNoteNodeContent({ palette, surface }: { palette: NoteTonePalette; surface: NoteSurface }) {
    return (
        <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-1.5 px-3" style={{ color: surface.muted }} aria-hidden>
            <StickyNote className="size-4 opacity-60" style={{ color: palette.accent }} />
            <span style={{ fontSize: "var(--fs-micro)" }}>双击写笔记</span>
        </div>
    );
}
