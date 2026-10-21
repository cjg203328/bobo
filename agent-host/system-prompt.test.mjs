import { expect, test } from 'bun:test';
import { SYSTEM_PROMPT } from './system-prompt.mjs';

test('media policy chooses minimum evidence and never presents frames as watched or heard media', () => {
  for (const instruction of ['最低必要', 'mode=frames', 'mode=video', 'mode=audio', '静态截图', '不能据此声称', '15 秒', '分段', '实际读取的区间']) {
    expect(SYSTEM_PROMPT).toContain(instruction);
  }
  expect(SYSTEM_PROMPT).toContain('不必读取原生视频或音频');
  expect(SYSTEM_PROMPT).toContain('用户明确要求看视频并听音频');
});

test('skills are followed step by step across turns and loaded before acting when they match', () => {
  for (const instruction of ['之后每一轮都按它的步骤顺序执行', '每次只做当前这一步或这一批', '等用户确认后再做下一步', '数量、画幅、类别', '先用 skill_load 读取该技能', '没做的步骤不能说成已完成']) {
    expect(SYSTEM_PROMPT).toContain(instruction);
  }
  expect(SYSTEM_PROMPT).toContain('当前工作区可用技能');
});

test('visual content agent starts from user outcomes and scopes the work before execution', () => {
  for (const instruction of ['以用户要完成的任务为入口', '交付物、受众、用途、风格', '每轮最多合并提出 3 个问题', '产物清单和创作步骤', '组织到当前画布', '不声称已经发布到社交平台']) {
    expect(SYSTEM_PROMPT).toContain(instruction);
  }
});

test('direct image and video requests connect reference inputs before asking for paid-generation confirmation', () => {
  for (const instruction of ['canvas_nodes_create', '创建对应的图片或视频生成节点', '最终提示词', 'canvas_node_bind_asset', 'assetId 与 resourceId', 'canvas_edge_create', '再调用 canvas_generation_propose']) {
    expect(SYSTEM_PROMPT).toContain(instruction);
  }
  expect(SYSTEM_PROMPT).toContain('不能直接开始付费图片或视频生成');
});
