import { blockingIssuesForLines, transcribeProject } from './braille';
import type {
  AppliedPackage,
  MigrationLessonState,
  MigrationSession,
  PackageLesson,
  PackageRule,
  ProjectState,
  ProofIssue,
  RuleChange,
  RuleKind,
  RuleSet,
  StandardPackage,
  TranscriptionRule,
  VersionSnapshot,
} from './types';

const RULE_KINDS: RuleKind[] = ['letter', 'number', 'punctuation', 'contraction', 'special'];
export const VERSION_LIMIT = 20;

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class PackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageValidationError';
  }
}

// ---------------------------------------------------------------------------
// 规范包校验
// ---------------------------------------------------------------------------

export function parsePackage(raw: string): StandardPackage {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new PackageValidationError('规范包不是合法的 JSON 文件，请确认包完整后重试。');
  }
  return validatePackage(data);
}

export function validatePackage(data: unknown): StandardPackage {
  const pkg = data as Partial<StandardPackage>;
  if (!pkg || typeof pkg !== 'object') throw new PackageValidationError('规范包内容为空或格式不正确。');
  if (!pkg.packageId || typeof pkg.packageId !== 'string') throw new PackageValidationError('规范包缺少 packageId。');
  if (!pkg.standardName || typeof pkg.standardName !== 'string') throw new PackageValidationError('规范包缺少 standardName。');
  if (!pkg.standardVersion || typeof pkg.standardVersion !== 'string') throw new PackageValidationError('规范包缺少 standardVersion。');
  if (!Array.isArray(pkg.rules)) throw new PackageValidationError('规范包缺少 rules 列表。');
  if (!Array.isArray(pkg.lessons) || pkg.lessons.length === 0) throw new PackageValidationError('规范包缺少 lessons 课次列表。');

  pkg.rules.forEach((rule, index) => {
    if (!rule || typeof rule !== 'object') throw new PackageValidationError(`第 ${index + 1} 条规则格式不正确。`);
    if (!RULE_KINDS.includes(rule.kind)) throw new PackageValidationError(`规则 ${rule.source ?? index + 1} 的类型无效。`);
    if (rule.retire) {
      if (!rule.source && !rule.id) throw new PackageValidationError(`第 ${index + 1} 条停用规则缺少 source 或 id。`);
    } else {
      if (!rule.source) throw new PackageValidationError(`第 ${index + 1} 条规则缺少原文 source。`);
      if (typeof rule.output !== 'string' || rule.output.length === 0) throw new PackageValidationError(`规则“${rule.source}”缺少盲文输出。`);
    }
  });

  const lessonIds = new Set<string>();
  pkg.lessons.forEach((lesson, index) => {
    if (!lesson.id) throw new PackageValidationError(`第 ${index + 1} 个课次缺少 id。`);
    if (lessonIds.has(lesson.id)) throw new PackageValidationError(`课次 ${lesson.id} 在包内重复。`);
    lessonIds.add(lesson.id);
    if (lesson.lineIds && !Array.isArray(lesson.lineIds)) throw new PackageValidationError(`课次 ${lesson.id} 的 lineIds 必须是数组。`);
  });

  return data as StandardPackage;
}

// ---------------------------------------------------------------------------
// 规则比对
// ---------------------------------------------------------------------------

function syntheticRuleId(rule: PackageRule, packageId: string, index: number): string {
  if (rule.id) return rule.id;
  const short = packageId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8) || 'pkg';
  return `pkg-${short}-${rule.kind}-${index}`;
}

function findRule(ruleSet: RuleSet, rule: PackageRule): TranscriptionRule | undefined {
  if (rule.id) {
    const byId = ruleSet.rules.find((item) => item.id === rule.id);
    if (byId) return byId;
  }
  return ruleSet.rules.find(
    (item) => item.kind === rule.kind && item.source.toLocaleLowerCase() === rule.source.toLocaleLowerCase(),
  );
}

/**
 * 把规范包的规则声明逐条对到目标规则集上，给出 新增 / 输出改过 / 停用 / 无变化 清单。
 * 不修改入参，便于在应用前预览。
 */
export function buildRuleChanges(ruleSet: RuleSet, pkg: StandardPackage): { changes: RuleChange[]; rules: TranscriptionRule[] } {
  const changes: RuleChange[] = [];
  const rules = ruleSet.rules.map((rule) => ({ ...rule }));

  pkg.rules.forEach((decl, index) => {
    const ruleId = syntheticRuleId(decl, pkg.packageId, index);
    const existing = findRule(ruleSet, decl);

    if (decl.retire) {
      if (!existing) {
        throw new PackageValidationError(`停用项“${decl.source ?? decl.id}”在草稿规则集中不存在，无法停用。`);
      }
      const target = rules.find((item) => item.id === existing.id)!;
      if (!target.retired) {
        changes.push({
          type: 'retired', ruleId: target.id, kind: target.kind, source: target.source,
          oldOutput: target.output, description: `停用“${target.source}”：${decl.description ?? '新规范已停用此转写，留档不再参与转写'}`,
          packageId: pkg.packageId,
        });
      } else {
        changes.push({
          type: 'unchanged', ruleId: target.id, kind: target.kind, source: target.source,
          oldOutput: target.output, newOutput: target.output, description: `“${target.source}”此前已停用留档。`,
          packageId: pkg.packageId,
        });
      }
      target.enabled = false;
      target.retired = true;
      return;
    }

    if (!existing) {
      rules.push({
        id: ruleId,
        source: decl.source,
        output: decl.output,
        kind: decl.kind,
        enabled: true,
        suspicious: Boolean(decl.suspicious),
        description: decl.description ?? `${pkg.standardName} 新增规则`,
        retired: false,
        fromPackageId: pkg.packageId,
      });
      changes.push({
        type: 'added', ruleId, kind: decl.kind, source: decl.source,
        newOutput: decl.output, description: `新增“${decl.source}”：${decl.description ?? '新规范新增转写'}`,
        packageId: pkg.packageId,
      });
      return;
    }

    const target = rules.find((item) => item.id === existing.id)!;
    if (target.output !== decl.output || Boolean(target.suspicious) !== Boolean(decl.suspicious)) {
      changes.push({
        type: 'changed', ruleId: target.id, kind: target.kind, source: target.source,
        oldOutput: target.output, newOutput: decl.output,
        description: `输出改过：${target.output} → ${decl.output}${Boolean(target.suspicious) !== Boolean(decl.suspicious) ? '（可疑标记同步调整）' : ''}`,
        packageId: pkg.packageId,
      });
    } else {
      changes.push({
        type: 'unchanged', ruleId: target.id, kind: target.kind, source: target.source,
        oldOutput: target.output, newOutput: decl.output, description: `“${target.source}”输出一致，无需修改。`,
        packageId: pkg.packageId,
      });
    }
    target.output = decl.output;
    target.suspicious = Boolean(decl.suspicious);
    if (decl.description) target.description = decl.description;
    target.enabled = true;
    target.retired = false;
    target.fromPackageId = pkg.packageId;
  });

  return { changes, rules };
}

// ---------------------------------------------------------------------------
// 课次分批
// ---------------------------------------------------------------------------

/** 解析规范包的课次：显式 lineIds 直接采用，否则按 batchSize 自动分批。 */
export function resolvePackageLessons(pkg: StandardPackage, state: ProjectState): PackageLesson[] {
  const allLineIds = state.lines.map((line) => line.id);
  const explicit = pkg.lessons.filter((lesson) => lesson.lineIds);
  const covered = new Set(explicit.flatMap((lesson) => lesson.lineIds ?? []));

  for (const lineId of covered) {
    if (!allLineIds.includes(lineId)) {
      throw new PackageValidationError(`课次引用了课文中不存在的行：${lineId}。`);
    }
  }
  const seen = new Set<string>();
  for (const lesson of explicit) {
    for (const lineId of lesson.lineIds ?? []) {
      if (seen.has(lineId)) throw new PackageValidationError(`行 ${lineId} 在多个课次中重复出现。`);
      seen.add(lineId);
    }
  }

  const remainder = allLineIds.filter((id) => !covered.has(id));
  const batchSize = pkg.batchSize && pkg.batchSize > 0 ? pkg.batchSize : 2;
  const implicit: PackageLesson[] = [];
  if (remainder.length > 0) {
    for (let start = 0; start < remainder.length; start += batchSize) {
      implicit.push({
        id: `auto-${pkg.packageId}-${implicit.length + 1}`,
        title: `自动批次 ${implicit.length + 1}`,
        lineIds: remainder.slice(start, start + batchSize),
      });
    }
  }
  return [...pkg.lessons, ...implicit];
}

// ---------------------------------------------------------------------------
// 快照
// ---------------------------------------------------------------------------

export function createSnapshot(state: ProjectState, action: string): VersionSnapshot {
  const { versions: _versions, ...snapshot } = structuredClone(state);
  return {
    id: uid('version'),
    name: `${action} · ${state.lines.filter((line) => line.status === 'approved').length}/${state.lines.length} 行完成`,
    createdAt: new Date().toISOString(),
    action,
    snapshot,
  };
}

export function prependSnapshot(state: ProjectState, snapshot: VersionSnapshot): ProjectState {
  return { ...state, versions: [snapshot, ...state.versions].slice(0, VERSION_LIMIT) };
}

// ---------------------------------------------------------------------------
// 规范包应用（开启迁移 / 续包接着迁；幂等）
// ---------------------------------------------------------------------------

export interface ApplyPackageResult {
  state: ProjectState;
  /** 这次提交实际处理了什么，用于界面提示。 */
  outcome: 'started' | 'continued' | 'idempotent';
}

export function applyPackage(input: ProjectState, pkg: StandardPackage): ApplyPackageResult {
  const state = structuredClone(input);
  const appliedRecord: AppliedPackage = {
    packageId: pkg.packageId,
    standardName: pkg.standardName,
    standardVersion: pkg.standardVersion,
    appliedAt: new Date().toISOString(),
    continuesFromPackageId: pkg.continuesFromPackageId,
  };

  // 情况一：迁移进行中 —— 可能是同包重交（幂等）或续包。
  if (state.migration && state.migration.status === 'in-progress') {
    const session = state.migration;
    const alreadyApplied = session.appliedPackages.some((item) => item.packageId === pkg.packageId);
    const target = state.ruleSets.find((set) => set.id === session.targetRuleSetId);
    if (!target) throw new PackageValidationError('迁移目标规则集缺失，无法继续。');

    if (alreadyApplied) {
      // 同一份包再交一次：规则不重复改写，只补齐还没迁的课次状态（课次迁移本身也幂等）。
      const knownLessonIds = new Set(session.lessons.map((lesson) => lesson.id));
      const resolved = resolvePackageLessons(pkg, state);
      resolved
        .filter((lesson) => !knownLessonIds.has(lesson.id))
        .forEach((lesson) => session.lessons.push(toLessonState(lesson, pkg.packageId)));
      return { state, outcome: 'idempotent' };
    }

    // 新包：作为续包，追加规则变化与课次。
    const { changes, rules } = buildRuleChanges(target, pkg);
    const nextTarget: RuleSet = { ...target, rules };
    state.ruleSets = state.ruleSets.map((set) => (set.id === target.id ? nextTarget : set));
    session.appliedPackages.push(appliedRecord);
    session.changes.push(...changes);
    mergeLessons(session, pkg, state);

    const retranscribed = transcribeProject({ ...state });
    return { state: { ...retranscribed }, outcome: 'continued' };
  }

  // 情况二：没有进行中的迁移 —— 开一个新会话。
  if (state.migration) throw new PackageValidationError('上一轮规范迁移已确认，请先开始新的迁移流程。');

  const baseId = state.activeRuleSetId;
  const base = state.ruleSets.find((set) => set.id === baseId) ?? state.ruleSets[0];
  const targetId = pkg.targetRuleSetId && pkg.targetRuleSetId !== base.id
    ? (state.ruleSets.some((set) => set.id === pkg.targetRuleSetId) ? pkg.targetRuleSetId! : uid('ruleset'))
    : uid('ruleset');

  const targetExisting = pkg.targetRuleSetId
    ? state.ruleSets.find((set) => set.id === pkg.targetRuleSetId)
    : undefined;

  // 先留一份整册快照（旧规范），确认前随时可切回。
  const snapshot = createSnapshot(state, `规范迁移前整册快照 · ${pkg.standardName}`);
  let next = prependSnapshot(state, snapshot);

  const targetSeed: RuleSet = targetExisting ?? {
    ...structuredClone(base),
    id: targetId,
    name: pkg.ruleSetName ?? `${pkg.standardName} ${pkg.standardVersion}`,
    description: `${pkg.standardName}（${pkg.standardVersion}）迁移目标规则集，由“${base.name}”迁入。`,
    contractions: pkg.contractions ?? base.contractions,
    hyphenMode: pkg.hyphenMode ?? base.hyphenMode,
  };

  const { changes, rules } = buildRuleChanges(targetSeed, pkg);
  const target: RuleSet = { ...targetSeed, rules };
  next = {
    ...next,
    ruleSets: targetExisting
      ? next.ruleSets.map((set) => (set.id === target.id ? target : set))
      : [...next.ruleSets, target],
  };

  const resolved = resolvePackageLessons(pkg, next);
  const session: MigrationSession = {
    id: uid('migration'),
    status: 'in-progress',
    baseRuleSetId: base.id,
    targetRuleSetId: target.id,
    lessons: resolved.map((lesson) => toLessonState(lesson, pkg.packageId)),
    appliedPackages: [appliedRecord],
    changes,
    startedAt: new Date().toISOString(),
    preMigrationVersionId: snapshot.id,
  };

  next = transcribeProject({ ...next, migration: session });
  return { state: next, outcome: 'started' };
}

function toLessonState(lesson: PackageLesson, packageId: string): MigrationLessonState {
  return {
    id: lesson.id,
    title: lesson.title,
    lineIds: [...(lesson.lineIds ?? [])],
    status: 'pending',
    attempts: 0,
    packageId,
  };
}

function mergeLessons(session: MigrationSession, pkg: StandardPackage, state: ProjectState): void {
  const resolved = resolvePackageLessons(pkg, state);
  const known = new Map(session.lessons.map((lesson) => [lesson.id, lesson]));
  resolved.forEach((lesson) => {
    if (!known.has(lesson.id)) {
      session.lessons.push(toLessonState(lesson, pkg.packageId));
    }
  });
}

// ---------------------------------------------------------------------------
// 课次迁移（按课次分批；失败可重试；已迁课次保留不动）
// ---------------------------------------------------------------------------

export function migrateLesson(input: ProjectState, lessonId: string): ProjectState {
  const state = structuredClone(input);
  const session = state.migration;
  if (!session || session.status !== 'in-progress') return state;
  const lesson = session.lessons.find((item) => item.id === lessonId);
  if (!lesson || lesson.status === 'migrated') return state;

  // 迁前用新规范试转该课次，阻断级问题则记为失败，保留旧规范转写结果。
  const blocking = blockingIssuesForLines(state, session.targetRuleSetId, lesson.lineIds);
  lesson.attempts += 1;
  if (blocking.length > 0) {
    lesson.status = 'failed';
    lesson.error = summarizeErrors(blocking);
    return touch(state);
  }

  lesson.status = 'migrated';
  lesson.error = undefined;
  lesson.migratedAt = new Date().toISOString();

  const retranscribed = transcribeProject({ ...state });
  return maybeComplete(retranscribed);
}

/** 迁移全部未完成课次（待迁与失败的逐课重试）；中途失败不影响其他课次，稍后可再跑。 */
export function migrateRemainingLessons(input: ProjectState): ProjectState {
  let state = structuredClone(input);
  if (!state.migration || state.migration.status !== 'in-progress') return state;
  for (const lesson of state.migration.lessons) {
    if (lesson.status !== 'migrated') {
      state = migrateLesson(state, lesson.id);
    }
  }
  return state;
}

function summarizeErrors(issues: ProofIssue[]): string {
  const messages = issues.map((issue) => issue.message);
  const unique = [...new Set(messages)];
  return unique.slice(0, 2).join('；') + (unique.length > 2 ? ` 等 ${unique.length} 处` : '');
}

function maybeComplete(state: ProjectState): ProjectState {
  const session = state.migration;
  if (!session) return state;
  if (session.status === 'in-progress' && session.lessons.every((lesson) => lesson.status === 'migrated')) {
    // 全部课次迁完：会话标记完成、激活新规范，并按新规范统一重转全文。
    session.status = 'confirmed';
    const snapshot = createSnapshot(state, '规范迁移完成快照');
    let next = prependSnapshot(state, snapshot);
    next = { ...next, activeRuleSetId: session.targetRuleSetId };
    return transcribeProject(next);
  }
  return state;
}

function touch(state: ProjectState): ProjectState {
  return { ...state, updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// 切回旧规范（确认前回滚到迁移前整册快照）
// ---------------------------------------------------------------------------

export function rollbackMigration(input: ProjectState): ProjectState {
  const state = structuredClone(input);
  const session = state.migration;
  if (!session) return state;

  const snapshot = state.versions.find((version) => version.id === session.preMigrationVersionId);
  if (!snapshot) throw new PackageValidationError('迁移前整册快照已不存在，无法切回。');

  // 整册快照是迁移前的完整状态（含当时的版本列表），恢复后保留之后的版本记录。
  const restored: ProjectState = structuredClone({
    ...snapshot.snapshot,
    versions: state.versions,
  });
  return { ...restored, updatedAt: new Date().toISOString() };
}

export function dismissMigration(input: ProjectState): ProjectState {
  const state = structuredClone(input);
  if (!state.migration || state.migration.status === 'in-progress') return state;
  return { ...state, migration: undefined, updatedAt: new Date().toISOString() };
}

export function migrationProgress(session: MigrationSession): { migrated: number; failed: number; pending: number; total: number } {
  const migrated = session.lessons.filter((lesson) => lesson.status === 'migrated').length;
  const failed = session.lessons.filter((lesson) => lesson.status === 'failed').length;
  const pending = session.lessons.filter((lesson) => lesson.status === 'pending').length;
  return { migrated, failed, pending, total: session.lessons.length };
}
