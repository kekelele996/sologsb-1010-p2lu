import { analyzeProject } from './braille';
import type { Lesson, ProjectState, RuleSet, TranscriptionRule } from './types';

const letters = 'abcdefghijklmnopqrstuvwxyz'.split('').map<TranscriptionRule>((letter, index) => ({
  id: `letter-${letter}`,
  source: letter,
  output: '⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵'[index],
  kind: 'letter',
  enabled: true,
  suspicious: false,
  description: '拉丁字母基础表',
}));

const punctuation: TranscriptionRule[] = [
  [',', '⠂', '逗号'], ['.', '⠲', '句号'], ['?', '⠦', '问号'], ['!', '⠖', '叹号'], [';', '⠆', '分号'], [':', '⠒', '冒号'], ['-', '⠤', '连字符'],
].map(([source, output, description]) => ({
  id: `punctuation-${source}`,
  source,
  output,
  kind: 'punctuation',
  enabled: true,
  suspicious: false,
  description,
}));

const contractions: TranscriptionRule[] = [
  ['and', '⠯', false, '高频缩写'], ['the', '⠮', false, '高频缩写'], ['for', '⠿', true, '低年级教材可改为完整拼写'],
  ['of', '⠷', false, '高频缩写'], ['with', '⠾', false, '高频缩写'], ['ing', '⠬', true, '词尾缩写'],
  ['ed', '⠫', true, '词尾缩写'], ['er', '⠻', false, '词尾缩写'], ['ch', '⠡', false, '字母组合'], ['sh', '⠩', false, '字母组合'], ['th', '⠹', false, '字母组合'],
].map(([source, output, suspicious, description]) => ({
  id: `contraction-${source}`,
  source: String(source),
  output: String(output),
  kind: 'contraction',
  enabled: true,
  suspicious: Boolean(suspicious),
  description: String(description),
}));

const commonRules: TranscriptionRule[] = [
  { id: 'number-sign', source: '#', output: '⠼', kind: 'number', enabled: true, suspicious: false, description: '数字起始符' },
  { id: 'capital-sign', source: 'capital', output: '⠠', kind: 'special', enabled: true, suspicious: false, description: '大写起始符' },
  ...letters,
  ...punctuation,
];

const ruleSets: RuleSet[] = [
  {
    id: 'ueb-teaching',
    name: 'UEB 教学规则',
    description: '英美盲文教学规则，默认启用常用缩写并将低年级易混淆缩写标为可疑。',
    contractions: true,
    hyphenMode: 'cross-line',
    rules: [...commonRules, ...contractions],
  },
  {
    id: 'literary-standard',
    name: '通用文学盲文',
    description: '保留完整缩写表，适合课外读本和工作表。',
    contractions: true,
    hyphenMode: 'inline',
    rules: [...commonRules, ...contractions.filter((rule) => !rule.suspicious)],
  },
  {
    id: 'spelling-first',
    name: '逐字拼读（无缩写）',
    description: '低年级识字课使用，关闭缩写和跨行连字符压缩。',
    contractions: false,
    hyphenMode: 'inline',
    rules: commonRules,
  },
];

const lessons: Lesson[] = [
  { id: 'lesson-1', name: '第一课 · 种子与土壤' },
  { id: 'lesson-2', name: '第二课 · 星期五的芽' },
  { id: 'lesson-3', name: '第三课 · 园丁的话' },
  { id: 'lesson-4', name: '第四课 · 跨页断词' },
  { id: 'lesson-5', name: '第五课 · 测量长度' },
];

const base: ProjectState = {
  id: 'braille-course-1010',
  title: '春天观察课 · 盲文教材',
  author: '资源教师 / 林老师',
  activeRuleSetId: 'ueb-teaching',
  ruleSets,
  lessons,
  selectedLineId: 'line-1',
  lines: [
    { id: 'line-1', lessonId: 'lesson-1', source: 'The small seed is under the soil.', tokens: [], status: 'questionable', note: '“the”是否符合学生当前缩写进度？', continuesPrevious: false, continuesNext: false },
    { id: 'line-2', lessonId: 'lesson-1', source: 'It needs water, light and time.', tokens: [], status: 'unchecked', note: '', continuesPrevious: false, continuesNext: false },
    { id: 'line-3', lessonId: 'lesson-2', source: 'By Friday, a green shoot appears.', tokens: [], status: 'unchecked', note: '', continuesPrevious: false, continuesNext: false },
    { id: 'line-4', lessonId: 'lesson-3', source: 'The gardener said, “Welcome, little sprout!”', tokens: [], status: 'unchecked', note: '', continuesPrevious: false, continuesNext: false },
    { id: 'line-5', lessonId: 'lesson-4', source: 'Look-', tokens: [], status: 'unchecked', note: '下一行是同一单词，检查跨行断词。', continuesPrevious: false, continuesNext: false },
    { id: 'line-6', lessonId: 'lesson-4', source: 'ing is learning!', tokens: [], status: 'unchecked', note: '', continuesPrevious: false, continuesNext: false },
    { id: 'line-7', lessonId: 'lesson-5', source: 'Please measure 12 centimetres from the edge.', tokens: [], status: 'unchecked', note: '', continuesPrevious: false, continuesNext: false },
  ],
  issues: [],
  versions: [],
  appliedPackageIds: [],
  migration: undefined,
  lastCheckedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function createInitialProject(): ProjectState {
  return analyzeProject(base);
}

/** 归一化旧版本草稿，补齐课次、包应用记录等新字段。 */
export function normalizeProject(state: Partial<ProjectState>): ProjectState {
  const lessons = state.lessons?.length ? state.lessons : [{ id: 'lesson-default', name: '导入课文' }];
  const defaultLessonId = lessons[0].id;
  const lines = (state.lines ?? []).map((line) => ({
    ...line,
    lessonId: line.lessonId ?? defaultLessonId,
  }));
  return {
    ...state,
    lessons,
    lines,
    appliedPackageIds: state.appliedPackageIds ?? [],
    migration: state.migration,
  } as ProjectState;
}
