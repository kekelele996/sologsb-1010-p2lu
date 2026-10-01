import type { StandardPackage } from './types';

/**
 * 教研室下发的「国家通用盲文规范」示例首包。
 * 与草稿（UEB 教学规则）逐条比对后：
 *  - 新增 ea、ou 字母组合与左单引号；
 *  - for / ing / ed / ch 的输出按新版改过；
 *  - of、sh 两版并存沿用（无变化）；
 *  - with、er 停用留档，不再参与转写。
 * 课次只带前三课；第 4 行含弯引号，新规范本包尚未收录会阻断，
 * 留给第二批规范包（续包）补齐后重试。
 */
export const SAMPLE_PACKAGE_V2: StandardPackage = {
  packageId: 'tongyong-mandu-v2-2026',
  standardName: '国家通用盲文规范（试行）',
  standardVersion: '2026 修订版',
  publishedAt: '2026-09-01',
  description: '教育部新版通用盲文规范首批下发内容，含高频缩写调整与停用留档清单。',
  ruleSetName: '通用盲文 2026 修订版',
  contractions: true,
  hyphenMode: 'cross-line',
  batchSize: 2,
  rules: [
    { kind: 'contraction', source: 'for', output: '⠿⠋', suspicious: false, description: '新版拆分：不再使用单格缩写' },
    { kind: 'contraction', source: 'ing', output: '⠬⠛', suspicious: false, description: '新版词尾双格输出' },
    { kind: 'contraction', source: 'ed', output: '⠫⠙', suspicious: false, description: '新版词尾双格输出' },
    { kind: 'contraction', source: 'ch', output: '⠡⠓', suspicious: false, description: '字母组合双格输出' },
    { kind: 'contraction', source: 'with', output: '⠾', retire: true, description: '新版取消该缩写，完整拼写' },
    { kind: 'contraction', source: 'er', output: '⠻', retire: true, description: '新版取消词尾 er 缩写' },
    { kind: 'contraction', source: 'ea', output: '⠂⠡', suspicious: false, description: '新增元音组合' },
    { kind: 'contraction', source: 'ou', output: '⠳⠬', suspicious: false, description: '新增元音组合' },
    { kind: 'punctuation', source: '‘', output: '⠠⠦', suspicious: false, description: '新增左单引号' },
  ],
  lessons: [
    { id: 'lesson-1', title: '第 1 课 · 种子与土壤', lineIds: ['line-1', 'line-2'] },
    { id: 'lesson-2', title: '第 2 课 · 发芽', lineIds: ['line-3'] },
    { id: 'lesson-3', title: '第 3 课 · 园丁的话', lineIds: ['line-4'] },
  ],
};

/**
 * 续包：补齐弯引号与问号调整，并带完剩下的课次。
 * 通过 continuesFromPackageId 声明接着首包迁；之前失败的第 3 课可重试通过。
 */
export const SAMPLE_PACKAGE_V2_PART2: StandardPackage = {
  packageId: 'tongyong-mandu-v2-2026-part2',
  standardName: '国家通用盲文规范（试行）',
  standardVersion: '2026 修订版 · 补遗',
  publishedAt: '2026-09-15',
  description: '补遗：弯引号、右单引号与问号输出调整；带完剩余课次。',
  continuesFromPackageId: 'tongyong-mandu-v2-2026',
  batchSize: 2,
  rules: [
    { kind: 'punctuation', source: '“', output: '⠦⠠', suspicious: false, description: '新增左双引号' },
    { kind: 'punctuation', source: '”', output: '⠠⠴', suspicious: false, description: '新增右双引号' },
    { kind: 'punctuation', source: '’', output: '⠴⠄', suspicious: false, description: '新增右单引号' },
    { kind: 'punctuation', source: '?', output: '⠦⠕', suspicious: false, description: '问号新版双格输出' },
  ],
  lessons: [
    { id: 'lesson-4', title: '第 4 课 · 跨行断词', lineIds: ['line-5', 'line-6'] },
    { id: 'lesson-5', title: '第 5 课 · 测量', lineIds: ['line-7'] },
  ],
};
