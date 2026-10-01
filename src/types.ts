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
  /** 被新规范停用并留档：规则保留可查，但不再参与转写。 */
  retired?: boolean;
  /** 来源规范包 ID，用于判断规则来自哪一版规范。 */
  fromPackageId?: string;
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

/** 规范包中一条规则的声明（新规范包格式）。 */
export interface PackageRule {
  id?: string;
  kind: RuleKind;
  source: string;
  output: string;
  suspicious?: boolean;
  description?: string;
  /** true 表示该规则在新版中停用；若草稿里存在则停用留档。 */
  retire?: boolean;
}

/** 规范包中的一个课次批次。 */
export interface PackageLesson {
  id: string;
  title: string;
  /** 该课次覆盖的课文行 ID；缺省时按 batchSize 自动分批。 */
  lineIds?: string[];
}

/** 教研室下发的规范包。 */
export interface StandardPackage {
  packageId: string;
  standardName: string;
  standardVersion: string;
  publishedAt?: string;
  description?: string;
  /** 上一份规范包 ID；用于续包接着迁。 */
  continuesFromPackageId?: string;
  /** 迁移目标规则集 ID；缺省时以当前激活的草稿规则集为底新建一套。 */
  targetRuleSetId?: string;
  /** 新规则集的命名与缩写/连字符设置（仅首包生效）。 */
  ruleSetName?: string;
  contractions?: boolean;
  hyphenMode?: 'cross-line' | 'inline';
  /** 未在课次中显式给出 lineIds 时的自动分批大小。 */
  batchSize?: number;
  rules: PackageRule[];
  lessons: PackageLesson[];
}

export type RuleChangeType = 'added' | 'changed' | 'retired' | 'unchanged';

/** 一条草稿规则与规范包规则的比对结果。 */
export interface RuleChange {
  type: RuleChangeType;
  ruleId: string;
  kind: RuleKind;
  source: string;
  oldOutput?: string;
  newOutput?: string;
  description: string;
  packageId: string;
}

export type LessonMigrationStatus = 'pending' | 'migrated' | 'failed';

/** 一个课次批次的迁移进度。 */
export interface MigrationLessonState {
  id: string;
  title: string;
  lineIds: string[];
  status: LessonMigrationStatus;
  migratedAt?: string;
  /** 失败原因（阻断问题信息），供重试前定位。 */
  error?: string;
  attempts: number;
  /** 由哪一份规范包带入。 */
  packageId: string;
}

/** 已应用过的规范包登记，用于幂等：同一份包交两次不重复改写。 */
export interface AppliedPackage {
  packageId: string;
  standardName: string;
  standardVersion: string;
  appliedAt: string;
  continuesFromPackageId?: string;
}

export type MigrationStatus = 'in-progress' | 'confirmed';

/** 一次规范迁移会话：首包开启，全部课次确认后结束；切回即回滚快照。 */
export interface MigrationSession {
  id: string;
  status: MigrationStatus;
  baseRuleSetId: string;
  targetRuleSetId: string;
  lessons: MigrationLessonState[];
  appliedPackages: AppliedPackage[];
  /** 本次会话累计的规则比对清单（按包追加，便于查看每包带来的变化）。 */
  changes: RuleChange[];
  startedAt: string;
  /** 迁移开始前自动保留的整册快照版本 ID，用于切回旧规范。 */
  preMigrationVersionId: string;
}

export interface ProjectState {
  id: string;
  title: string;
  author: string;
  activeRuleSetId: string;
  ruleSets: RuleSet[];
  lines: TextbookLine[];
  selectedLineId: string;
  issues: ProofIssue[];
  versions: VersionSnapshot[];
  /** 进行中的规范迁移会话；全部确认或切回后为 undefined。 */
  migration?: MigrationSession;
  lastCheckedAt: string;
  updatedAt: string;
}

export interface HistoryState {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
  lastAction: string;
}
