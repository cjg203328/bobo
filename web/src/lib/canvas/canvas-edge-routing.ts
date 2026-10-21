/**
 * 画布连线路由：贝塞尔优先，被节点遮挡时退化为绕行正交折线。
 *
 * 为什么不干脆全用折线：本项目连线的视觉语言是柔和的水平贝塞尔（左出右入），
 * 全量折线会让画面变硬。这里沿用 VOZEB 的策略——只在"贝塞尔真的穿过其它节点"
 * 时才改走折线：
 *
 * 1. 先算贝塞尔，用控制点包围盒递归检测遮挡；
 * 2. 无遮挡 → 直接用贝塞尔，视觉与改动前完全一致；
 * 3. 有遮挡 → 生成上绕 / 下绕 / 中轴三个正交候选，挑第一条无碰撞且最短的；
 * 4. 所有候选都被挡 → 回退贝塞尔，保证任何情况下连线都不会消失。
 *
 * 候选折线只做水平/垂直线段，因此绕行距离可预测，不会出现贴近障碍的斜切。
 */

import { buildCanvasSpatialIndex, type CanvasSpatialBounds, type CanvasSpatialIndex } from "./canvas-spatial-index";

export type CanvasRoutingObstacle = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type CanvasEdgeRouteInput = {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    obstacles?: readonly CanvasRoutingObstacle[];
    /** 起点/终点自身节点，不参与遮挡判定。 */
    skipObstacleIds?: readonly string[];
    padding?: number;
};

export const EDGE_ROUTE_PADDING = 18;

/** 折线在起止点先水平推出/推入的长度，保证绕行段不和节点边框重合。 */
const LEAD = 22;

/**
 * 绕行上限：路径长度超过「直连曼哈顿距离 × 2 + 300」就宁可回退贝塞尔。
 *
 * 没有这个上限时，算法会一直向外扩绕行段直到躲开障碍——节点排得密时就会
 * 甩出一条绕到屏幕外的大圈，比细线压过节点还难看。VOZEB 的原策略同样强调
 * "选最短且无碰撞"，这里把这个语义补成显式阈值。
 */
const DETOUR_SLACK = 300;
const DETOUR_RATIO = 2;

const obstacleIndexes = new WeakMap<readonly CanvasRoutingObstacle[], { index: CanvasSpatialIndex<CanvasRoutingObstacle>; obstacles: CanvasRoutingObstacle[] }>();

/** Covers the Bezier hull and every detour that fits the length budget. */
export function canvasEdgeRoutingBounds(input: Pick<CanvasEdgeRouteInput, "startX" | "startY" | "endX" | "endY" | "padding">): CanvasSpatialBounds {
    const { startX, startY, endX, endY } = input;
    const padding = Math.max(0, input.padding ?? EDGE_ROUTE_PADDING);
    const distance = Math.abs(endX - startX) + Math.abs(endY - startY);
    const excursion = (distance * (DETOUR_RATIO - 1) + DETOUR_SLACK) / 2;
    const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
    return {
        left: Math.min(startX, endX, startX + LEAD, endX - LEAD, endX - curvature) - padding - 1,
        right: Math.max(startX, endX, startX + LEAD, endX - LEAD, startX + curvature) + padding + 1,
        top: Math.min(startY, endY) - excursion - padding - 1,
        bottom: Math.max(startY, endY) + excursion + padding + 1,
    };
}

/** Arrays are immutable snapshots; reuse one spatial index across all edges. */
export function queryCanvasRoutingObstacles(obstacles: readonly CanvasRoutingObstacle[], bounds: CanvasSpatialBounds): CanvasRoutingObstacle[] {
    let cached = obstacleIndexes.get(obstacles);
    if (!cached) {
        const valid = obstacles.filter((obstacle) => [obstacle.x, obstacle.y, obstacle.width, obstacle.height].every(Number.isFinite) && obstacle.width > 0 && obstacle.height > 0);
        cached = { obstacles: valid, index: buildCanvasSpatialIndex(valid.map((value) => ({ id: value.id, value, bounds: { left: value.x, top: value.y, right: value.x + value.width, bottom: value.y + value.height } })), 512) };
        obstacleIndexes.set(obstacles, cached);
    }
    // Long cross-canvas edges must not enumerate millions of empty grid cells.
    if ((bounds.right - bounds.left) * (bounds.bottom - bounds.top) > 512 * 512 * 4096) {
        return cached.obstacles.filter((obstacle) => obstacle.x < bounds.right && obstacle.x + obstacle.width > bounds.left && obstacle.y < bounds.bottom && obstacle.y + obstacle.height > bounds.top);
    }
    return cached.index.query(bounds);
}

type Point = { x: number; y: number };

type Rect = { left: number; top: number; right: number; bottom: number };

function toRect(obstacle: CanvasRoutingObstacle, padding: number): Rect {
    return {
        left: obstacle.x - padding,
        top: obstacle.y - padding,
        right: obstacle.x + obstacle.width + padding,
        bottom: obstacle.y + obstacle.height + padding,
    };
}

function activeRects(input: CanvasEdgeRouteInput, padding: number): Rect[] {
    const skip = new Set(input.skipObstacleIds || []);
    const rects: Rect[] = [];
    for (const obstacle of input.obstacles || []) {
        if (skip.has(obstacle.id)) continue;
        if (![obstacle.x, obstacle.y, obstacle.width, obstacle.height].every(Number.isFinite)) continue;
        if (obstacle.width <= 0 || obstacle.height <= 0) continue;
        rects.push(toRect(obstacle, padding));
    }
    return rects;
}

function pointInRect(point: Point, rect: Rect): boolean {
    return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

/** 正交线段与矩形内部精确相交，避免长线段采样跨过窄障碍。 */
function polylineCollides(points: readonly Point[], rects: readonly Rect[]): boolean {
    return rects.some((rect) => points.some((point, index) => {
        if (pointInRect(point, rect)) return true;
        if (!index) return false;
        const from = points[index - 1];
        if (from.y === point.y) return point.y > rect.top && point.y < rect.bottom && Math.max(from.x, point.x) > rect.left && Math.min(from.x, point.x) < rect.right;
        return point.x > rect.left && point.x < rect.right && Math.max(from.y, point.y) > rect.top && Math.min(from.y, point.y) < rect.bottom;
    }));
}

export function bezierEdgePath(startX: number, startY: number, endX: number, endY: number) {
    const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
    return `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** De Casteljau 细分保留曲线的安全包围盒；深度上限处保守判碰撞。 */
function bezierCollides(points: readonly Point[], rect: Rect, depth = 0): boolean {
    const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
    if (Math.max(...xs) <= rect.left || Math.min(...xs) >= rect.right || Math.max(...ys) <= rect.top || Math.min(...ys) >= rect.bottom) return false;
    if (pointInRect(points[0], rect) || pointInRect(points[3], rect) || depth === 12) return true;
    const a = midpoint(points[0], points[1]), b = midpoint(points[1], points[2]), c = midpoint(points[2], points[3]);
    const d = midpoint(a, b), e = midpoint(b, c), f = midpoint(d, e);
    return bezierCollides([points[0], a, d, f], rect, depth + 1) || bezierCollides([f, e, c, points[3]], rect, depth + 1);
}

function polylinePath(points: readonly Point[]): string {
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

/** 折线长度：候选排序用。避免用 Math.hypot 逐点开方带来的额外开销。 */
function polylineLength(points: readonly Point[]): number {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += Math.abs(points[index].x - points[index - 1].x) + Math.abs(points[index].y - points[index - 1].y);
    }
    return total;
}

/**
 * 三个正交候选。
 *
 * - `mid`：经典 Z 型，走起止点水平中点，最短，但在两节点正对且有障碍时容易穿；
 * - `top` / `bottom`：在水平跨度内所有障碍的上/下沿外再让出一个 padding，
 *   保证绕行段真正越过障碍，而不是贴着边框擦过去。
 */
function orthogonalCandidates(startX: number, startY: number, endX: number, endY: number, rects: readonly Rect[], padding: number): Point[][] {
    const exitX = startX + LEAD;
    const entryX = endX - LEAD;
    const midX = (exitX + entryX) / 2;
    const spanLeft = Math.min(startX, endX, exitX, entryX);
    const spanRight = Math.max(startX, endX, exitX, entryX);
    let detourTop = Math.min(startY, endY) - padding * 2;
    let detourBottom = Math.max(startY, endY) + padding * 2;
    for (const rect of rects) {
        if (rect.right < spanLeft || rect.left > spanRight) continue;
        detourTop = Math.min(detourTop, rect.top - padding);
        detourBottom = Math.max(detourBottom, rect.bottom + padding);
    }
    const candidates: Point[][] = [
        [{ x: startX, y: startY }, { x: exitX, y: startY }, { x: exitX, y: detourTop }, { x: entryX, y: detourTop }, { x: entryX, y: endY }, { x: endX, y: endY }],
        [{ x: startX, y: startY }, { x: exitX, y: startY }, { x: exitX, y: detourBottom }, { x: entryX, y: detourBottom }, { x: entryX, y: endY }, { x: endX, y: endY }],
    ];
    if (entryX > exitX) candidates.push([{ x: startX, y: startY }, { x: exitX, y: startY }, { x: midX, y: startY }, { x: midX, y: endY }, { x: entryX, y: endY }, { x: endX, y: endY }]);
    return candidates;
}

export function routeCanvasEdgePath(input: CanvasEdgeRouteInput): string {
    const { startX, startY, endX, endY } = input;
    const padding = Math.max(0, input.padding ?? EDGE_ROUTE_PADDING);
    // Distant nodes cannot influence a route whose accepted length is bounded.
    input = { ...input, obstacles: queryCanvasRoutingObstacles(input.obstacles || [], canvasEdgeRoutingBounds(input)) };
    const rects = activeRects(input, padding);
    const bezier = bezierEdgePath(startX, startY, endX, endY);
    if (!rects.length) return bezier;
    const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
    const controls = [{ x: startX, y: startY }, { x: startX + curvature, y: startY }, { x: endX - curvature, y: endY }, { x: endX, y: endY }];
    if (!rects.some((rect) => bezierCollides(controls, rect))) return bezier;
    // 绕行时也保护起止节点内部；端口恰在边界上，不给自身节点加 padding。
    const endpointRects = activeRects({ ...input, obstacles: input.obstacles?.filter((obstacle) => input.skipObstacleIds?.includes(obstacle.id)), skipObstacleIds: [] }, 0);
    const candidateRects = [...rects, ...endpointRects];
    const candidates = orthogonalCandidates(startX, startY, endX, endY, candidateRects, Math.max(padding, 1));
    const budget = (Math.abs(endX - startX) + Math.abs(endY - startY)) * DETOUR_RATIO + DETOUR_SLACK;
    let best: { path: string; length: number } | null = null;
    for (const candidate of candidates) {
        if (polylineCollides(candidate, candidateRects)) continue;
        const length = polylineLength(candidate);
        if (length > budget) continue;
        if (!best || length < best.length) best = { path: polylinePath(candidate), length };
    }
    // 没有可采纳的候选（间距过小、绕行过远、或全被挡）时回退贝塞尔：
    // 宁可视觉上压过节点，也不能让连线绕出屏幕或直接消失。
    return best ? best.path : bezier;
}
