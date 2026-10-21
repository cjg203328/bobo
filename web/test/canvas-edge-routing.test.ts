import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { bezierEdgePath, canvasEdgeRoutingBounds, queryCanvasRoutingObstacles, routeCanvasEdgePath, type CanvasRoutingObstacle } from "../src/lib/canvas/canvas-edge-routing";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function obstacle(id: string, x: number, y: number, width: number, height: number): CanvasRoutingObstacle {
    return { id, x, y, width, height };
}

/** 从 "M x y L x y ..." 折线里还原顶点，用于几何断言。 */
function parsePolyline(path: string) {
    return path
        .split(/(?=[ML])/)
        .filter(Boolean)
        .map((segment) => {
            const [x, y] = segment.slice(1).trim().split(/\s+/).map(Number);
            return { x, y };
        });
}

/** 独立的正交线段区间断言，不用采样掩盖窄障碍。 */
function polylineHitsRect(path: string, rect: { x: number; y: number; width: number; height: number }) {
    const points = parsePolyline(path);
    for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        const horizontal = from.y === to.y && from.y > rect.y && from.y < rect.y + rect.height;
        const vertical = from.x === to.x && from.x > rect.x && from.x < rect.x + rect.width;
        if (horizontal && Math.min(from.x, to.x) < rect.x + rect.width && Math.max(from.x, to.x) > rect.x) return true;
        if (vertical && Math.min(from.y, to.y) < rect.y + rect.height && Math.max(from.y, to.y) > rect.y) return true;
    }
    return false;
}

describe("canvas edge routing", () => {
    test("障碍顺序以及远处同列节点不改变局部走线", () => {
        const blockers = [obstacle("block", 150, 60, 120, 180), obstacle("other", 310, 350, 40, 50)];
        const input = { startX: 0, startY: 150, endX: 400, endY: 150 };
        const expected = routeCanvasEdgePath({ ...input, obstacles: blockers });
        expect(expected).toContain(" L ");
        expect(routeCanvasEdgePath({ ...input, obstacles: [...blockers].reverse() })).toBe(expected);
        expect(routeCanvasEdgePath({ ...input, obstacles: [...blockers, obstacle("remote", 150, -5000, 200, 200)] })).toBe(expected);
    });

    test("空间查询保留局部窄障碍、跨区大障碍和起止节点", () => {
        const obstacles = [obstacle("from", -100, 100, 100, 100), obstacle("thin", 111, 90, 0.01, 20), obstacle("wall", 500, -100000, 1, 200000), obstacle("remote", 0, 9000, 200, 200)];
        const input = { startX: 0, startY: 100, endX: 1000, endY: 100 };
        const nearby = queryCanvasRoutingObstacles(obstacles, canvasEdgeRoutingBounds(input));
        expect(nearby.map((item) => item.id)).toEqual(["from", "thin", "wall"]);
        expect(routeCanvasEdgePath({ ...input, obstacles: nearby, skipObstacleIds: ["from"] })).toBe(routeCanvasEdgePath({ ...input, obstacles, skipObstacleIds: ["from"] }));
    });

    test("超长连线查询使用有界扫描并保留障碍", () => {
        const obstacles = [obstacle("block", 400, 80, 10, 40)];
        const input = { startX: 0, startY: 100, endX: 100000000, endY: 100 };
        expect(queryCanvasRoutingObstacles(obstacles, canvasEdgeRoutingBounds(input))).toEqual(obstacles);
    });

    test("极窄障碍位于旧采样点之间时仍会绕行", () => {
        const blocker = obstacle("thin", 111, 90, 0.01, 20);
        const path = routeCanvasEdgePath({ startX: 0, startY: 100, endX: 1000, endY: 100, obstacles: [blocker], padding: 0 });
        expect(path).toContain(" L ");
        expect(polylineHitsRect(path, blocker)).toBe(false);
    });

    test("反向连线绕开障碍，也不从起止节点内部穿过", () => {
        const from = obstacle("from", 300, 100, 100, 100);
        const to = obstacle("to", 0, 100, 100, 100);
        const blocker = obstacle("block", 180, 120, 40, 60);
        const path = routeCanvasEdgePath({ startX: 400, startY: 150, endX: 0, endY: 150, obstacles: [from, to, blocker], skipObstacleIds: ["from", "to"] });
        expect(path).toContain(" L ");
        for (const rect of [from, to, blocker]) expect(polylineHitsRect(path, rect)).toBe(false);
    });

    test("窄障碍不会被长绕行线段的采样漏过", () => {
        const blockers = [obstacle("main", 400, 80, 100, 40), obstacle("upper-pin", 111, 43, 0.01, 3)];
        const path = routeCanvasEdgePath({ startX: 0, startY: 100, endX: 1000, endY: 100, obstacles: blockers, padding: 18 });
        expect(path).toContain(" L ");
        for (const rect of blockers) expect(polylineHitsRect(path, rect)).toBe(false);
    });
    test("没有障碍时保持原有贝塞尔曲线", () => {
        const path = routeCanvasEdgePath({ startX: 0, startY: 100, endX: 400, endY: 300 });
        expect(path).toBe(bezierEdgePath(0, 100, 400, 300));
        expect(path).toContain(" C ");
    });

    test("障碍为空数组时同样走贝塞尔", () => {
        const path = routeCanvasEdgePath({ startX: 0, startY: 100, endX: 400, endY: 300, obstacles: [] });
        expect(path).toBe(bezierEdgePath(0, 100, 400, 300));
    });

    test("障碍不挡路时仍是贝塞尔，不产生无谓折线", () => {
        const obstacles = [obstacle("far", 100, 900, 200, 200)];
        const path = routeCanvasEdgePath({ startX: 0, startY: 100, endX: 400, endY: 120, obstacles });
        expect(path).toBe(bezierEdgePath(0, 100, 400, 120));
    });

    test("障碍挡在通道中间时改走正交折线，并真正绕开障碍", () => {
        const blocker = obstacle("blocker", 150, 60, 120, 180);
        const path = routeCanvasEdgePath({ startX: 0, startY: 150, endX: 400, endY: 150, obstacles: [blocker] });
        expect(path).not.toBe(bezierEdgePath(0, 150, 400, 150));
        expect(path).toContain(" L ");
        expect(polylineHitsRect(path, blocker)).toBe(false);
    });

    test("起止点自身节点不参与遮挡判定", () => {
        const from = obstacle("from", 0, 100, 100, 100);
        const to = obstacle("to", 300, 100, 100, 100);
        const path = routeCanvasEdgePath({ startX: 100, startY: 150, endX: 300, endY: 150, obstacles: [from, to], skipObstacleIds: ["from", "to"] });
        expect(path).toBe(bezierEdgePath(100, 150, 300, 150));
    });

    test("绕行折线的端点是起止点、且上绕段位于障碍上方", () => {
        const blocker = obstacle("blocker", 150, 60, 120, 180);
        const path = routeCanvasEdgePath({ startX: 0, startY: 150, endX: 400, endY: 150, obstacles: [blocker] });
        const points = parsePolyline(path);
        expect(points[0]).toEqual({ x: 0, y: 150 });
        expect(points[points.length - 1]).toEqual({ x: 400, y: 150 });
        const detourY = Math.min(...points.map((point) => point.y));
        expect(detourY).toBeLessThan(blocker.y);
    });

    test("绕行距离超出预算时回退贝塞尔，避免甩出屏幕外的大圈", () => {
        // 一堵贯穿上下、超出所有合理绕行范围的高墙：正交绕行会一直外扩，
        // 正确行为是放弃折线而不是绕到几千像素之外。
        const wall = obstacle("wall", 150, -4000, 120, 8000);
        const path = routeCanvasEdgePath({ startX: 0, startY: 150, endX: 400, endY: 150, obstacles: [wall] });
        expect(path).toBe(bezierEdgePath(0, 150, 400, 150));
    });

    test("紧凑布局下宁可压线也不绕大圈", () => {
        // 起止点很近而障碍很高：绕行长度相对直连距离过大，应回退贝塞尔。
        const tall = obstacle("tall", 30, -2000, 40, 4000);
        const path = routeCanvasEdgePath({ startX: 0, startY: 150, endX: 120, endY: 150, obstacles: [tall] });
        expect(path).toBe(bezierEdgePath(0, 150, 120, 150));
    });

    test("退化情形：起止点水平间距过小时不产出非法折线", () => {
        const blocker = obstacle("blocker", 10, 10, 5, 5);
        const path = routeCanvasEdgePath({ startX: 0, startY: 100, endX: 20, endY: 100, obstacles: [blocker] });
        expect(path.startsWith("M ")).toBe(true);
    });

    test("零尺寸障碍被忽略，不触发绕行", () => {
        const degenerate = obstacle("degenerate", 200, 150, 0, 0);
        const path = routeCanvasEdgePath({ startX: 0, startY: 150, endX: 400, endY: 150, obstacles: [degenerate] });
        expect(path).toBe(bezierEdgePath(0, 150, 400, 150));
    });

    test("多障碍时绕行段越过所有障碍的上/下沿", () => {
        const upper = obstacle("upper", 150, 40, 100, 80);
        const lower = obstacle("lower", 150, 200, 100, 80);
        const path = routeCanvasEdgePath({ startX: 0, startY: 160, endX: 400, endY: 160, obstacles: [upper, lower] });
        expect(polylineHitsRect(path, upper)).toBe(false);
        expect(polylineHitsRect(path, lower)).toBe(false);
    });
});

describe("canvas edge routing wiring", () => {
    test("连线组件只在拿到障碍时才启用绕行，只读预览保持纯贝塞尔", () => {
        const component = source("../src/components/canvas/canvas-connections.tsx");
        expect(component).toContain("obstacles?.length");
        expect(component).toContain("skipObstacleIds: [from.id, to.id]");
    });

    test("画布图层使用不受视口裁剪影响的障碍，拖拽预览同步位移", () => {
        const layers = source("../src/pages/canvas/canvas-project-world-layers.tsx");
        expect(layers).toContain("props.routingNodes.map");
        expect(layers).not.toContain("props.visibleNodes.map");
        expect(layers).toContain("routingObstacles");
        expect(layers).toContain("obstacles={routingObstacles}");
        expect(layers).toContain("shiftedObstacles");
    });

    test("障碍集合的引用稳定性被 memo 比较纳入，避免连线全量重渲染", () => {
        const component = source("../src/components/canvas/canvas-connections.tsx");
        expect(component).toContain("previous.obstacles === next.obstacles");
    });
});
