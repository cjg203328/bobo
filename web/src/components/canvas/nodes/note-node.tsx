import { useMemo, type CSSProperties } from "react";

import { EmptyNoteNodeContent } from "@/components/canvas/nodes/note-node-empty";
import { noteTonePalette, resolveNoteSurface, type NoteTone } from "@/lib/canvas/canvas-note-geometry";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

type NoteNodeContentProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    onContentChange: (nodeId: string, content: string) => void;
    onStopEditing: () => void;
};

/**
 * 笔记节点渲染。
 *
 * 与文本节点的分工：文本节点是"内容载体"，方块大小、等宽字体、可以很长；
 * 笔记是"画布上的便签"，追求一眼可读的短摘要，所以这里用：
 *
 * - 独立色调（amber/sky/rose/violet/slate），不跟随全局主题色；
 * - 标题在内容区上方、字号更小，正文用正文字体而不是等宽；
 * - 固定 `whitespace-pre-wrap`，保留用户换行但不要横向滚动条；
 * - 铅笔入口或双击进入编辑，Esc / 失焦退出。
 */
export function NoteNodeContent({ node, theme, isEditingContent, textareaRef, onContentChange, onStopEditing }: NoteNodeContentProps) {
    const content = node.metadata?.content || "";
    const tone: NoteTone = node.metadata?.note?.tone || "amber";
    const palette = noteTonePalette(tone);
    const surface = resolveNoteSurface(palette, theme.node.panel);
    const textStyle = useMemo<CSSProperties>(() => ({
        color: surface.text,
        fontSize: "var(--fs-caption)",
        lineHeight: 1.6,
        boxSizing: "border-box",
    }), [surface.text]);

    return (
        <div className="canvas-note-glass-surface flex h-full w-full flex-col overflow-hidden" style={{ "--canvas-note-accent": palette.accent, background: surface.background, color: surface.text } as CSSProperties}>
            {/* 便签色条：给笔记一个不依赖内容也能识别的色调标识，同时充当拖动时的视觉抓手。 */}
            <div className="h-1 w-full shrink-0" style={{ background: palette.accent }} aria-hidden />
            {isEditingContent ? (
                <textarea
                    ref={textareaRef}
                    className="thin-scrollbar m-0 block h-full w-full resize-none appearance-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent px-3 pb-3 pt-10 outline-none select-text"
                    aria-label="笔记正文"
                    data-canvas-no-zoom
                    data-canvas-wheel-scroll
                    style={textStyle}
                    value={content}
                    placeholder="写点什么…"
                    onChange={(event) => onContentChange(node.id, event.target.value)}
                    onBlur={onStopEditing}
                    onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Escape" && !event.nativeEvent.isComposing && event.keyCode !== 229) onStopEditing();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
            ) : content ? (
                <div
                    className="thin-scrollbar h-full w-full overflow-y-auto whitespace-pre-wrap break-words px-3 pb-3 pt-10 select-text"
                    style={textStyle}
                    onWheel={(event) => event.stopPropagation()}
                >
                    {content}
                </div>
            ) : (
                <EmptyNoteNodeContent palette={palette} surface={surface} />
            )}
        </div>
    );
}
