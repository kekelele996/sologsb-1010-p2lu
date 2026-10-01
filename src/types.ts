export type RuleKind = 'letter' | 'number' | 'punctuation' | 'contraction' | 'special';
export type LineStatus = 'unchecked' | 'reviewed' | 'questionable' | 'approved';
export type IssueSeverity = 'error' | 'warning' | 'info';

export interface TranscriptionRule {
  id: string;
  source: string;
  output: string;
  kind: RuleKind;
  enabled: boolean;
  suspicious: boolean;
  description: string;
  /** 被新规范停用后留档，不再参与转写。 */
  archived?: boolean;
}

export interface RuleSet {
  id: string;
  name: string;
  description: string;
  contractions: boolean;
  hyphenMode: 'cross-line' | 'inline';
  rules: TranscriptionRule[];
}

export interface BrailleToken {
  id: string;
  text: string;
  braille: string;
  kind: RuleKind;
  ruleId?: string;
  suspicious: boolean;
  offset: number;
}

export interface TextbookLine {
  id: string;
  source: string;
  tokens: BrailleToken[];
  status: LineStatus;
  note: string;
  continuesPrevious: boolean;
  continuesNext: boolean;
  /** 课次归属，迁移按课次分批。 */
  lessonId: string;
}

export interface Lesson {
  id: string;
  name: string;
}

/** 规范包中的规则条目。 */
export interface PackageRule {
  source: string;
  output: string;
  kind: RuleKind;
  description?: string;
}

/** 教研室下发的新版通用盲文规范包。 */
export interface StandardsPackage {
  id: string;
  name: string;
  version: string;
  issuedAt: string;
  summary?: string;
  rules: PackageRule[];
  /** 停用的原文（小写匹配），停用后规则留档不再转写。 */
  deprecations: string[];
}

export type DiffStatus = 'added' | 'changed' | 'deprecated' | 'unchanged';

export interface RuleDiffEntry {
  source: string;
  kind: RuleKind;
  oldOutput?: string;
  newOutput?: string;
  status: DiffStatus;
}

export type BatchStatus = 'pending' | 'done' | 'failed';

export interface MigrationBatch {
  id: string;
  lessonId: string;
  lessonName: string;
  lineIds: string[];
  status: BatchStatus;
  appliedAt?: string;
  error?: string;
}

export interface MigrationState {
  packageId: string;
  packageName: string;
  packageVersion: string;
  status: 'in-progress' | 'completed' | 'aborted';
  startedAt: string;
  completedAt?: string;
  /** 迁移前整册快照 id，用于确认前切回旧规范。 */
  preSnapshotId: string;
  diff: RuleDiffEntry[];
  batches: MigrationBatch[];
  confirmed: boolean;
}

export interface ProofIssue {
  id: string;
  lineId: string;
  tokenId?: string;
  ruleId?: string;
  severity: IssueSeverity;
  code: string;
  message: string;
  resolved: boolean;
}

export interface VersionSnapshot {
  id: string;
  name: string;
  createdAt: string;
  action: string;
  snapshot: Omit<ProjectState, 'versions'>;
}

export interface ProjectState {
  id: string;
  title: string;
  author: string;
  activeRuleSetId: string;
  ruleSets: RuleSet[];
  lessons: Lesson[];
  lines: TextbookLine[];
  selectedLineId: string;
  issues: ProofIssue[];
  versions: VersionSnapshot[];
  /** 已应用的规范包（id@version），用于幂等：同一份包交两次不改写。 */
  appliedPackageIds: string[];
  /** 当前进行中的规范迁移；确认或中止后清空。 */
  migration?: MigrationState;
  lastCheckedAt: string;
  updatedAt: string;
}

export interface HistoryState {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
  lastAction: string;
}
