import { retranscribeLines } from './braille';
import type {
  MigrationBatch,
  MigrationState,
  ProjectState,
  RuleDiffEntry,
  RuleSet,
  StandardsPackage,
  TranscriptionRule,
  VersionSnapshot,
} from './types';

/** 教研室下发的新版《通用盲文规范》包（2026 修订版）。 */
export const NEW_STANDARD_PACKAGE: StandardsPackage = {
  id: 'common-braille-2026',
  name: '通用盲文规范 · 2026 修订版',
  version: '2026.1',
  issuedAt: '2026-09-01',
  summary: '停用低年级缩写 for/ing/ed；调整 the 与大写起始符输出；新增 ou/ow/ar 缩写及圆括号规则。',
  rules: [
    { source: 'the', output: '⠸⠮', kind: 'contraction', description: '定冠词缩写加前缀符' },
    { source: 'capital', output: '⠠⠠', kind: 'special', description: '大写起始符双点' },
    { source: 'ou', output: '⠳', kind: 'contraction', description: '新增字母组合缩写' },
    { source: 'ow', output: '⠪', kind: 'contraction', description: '新增字母组合缩写' },
    { source: 'ar', output: '⠜', kind: 'contraction', description: '新增字母组合缩写' },
    { source: '(', output: '⠐⠣', kind: 'punctuation', description: '新增圆括号' },
    { source: ')', output: '⠐⠜', kind: 'punctuation', description: '新增圆括号' },
  ],
  deprecations: ['for', 'ing', 'ed'],
};

export const packageKey = (pkg: StandardsPackage): string => `${pkg.id}@${pkg.version}`;

const ruleKey = (kind: TranscriptionRule['kind'], source: string): string => `${kind}:${source.toLowerCase()}`;

/** 逐条比对规范包与当前规则集，输出新增 / 改过 / 停用 / 未变。 */
export function diffRulesAgainstRuleSet(pkg: StandardsPackage, ruleSet: RuleSet): RuleDiffEntry[] {
  const pkgByKey = new Map<string, StandardsPackage['rules'][number]>();
  pkg.rules.forEach((rule) => pkgByKey.set(ruleKey(rule.kind, rule.source), rule));
  const deprecations = new Set(pkg.deprecations.map((source) => source.toLowerCase()));

  const diff: RuleDiffEntry[] = [];
  const seen = new Set<string>();

  for (const rule of ruleSet.rules) {
    const key = ruleKey(rule.kind, rule.source);
    seen.add(key);
    const pkgRule = pkgByKey.get(key);
    if (pkgRule) {
      diff.push({
        source: rule.source,
        kind: rule.kind,
        oldOutput: rule.output,
        newOutput: pkgRule.output,
        status: pkgRule.output === rule.output ? 'unchanged' : 'changed',
      });
    } else if (deprecations.has(rule.source.toLowerCase())) {
      diff.push({ source: rule.source, kind: rule.kind, oldOutput: rule.output, status: 'deprecated' });
    } else {
      diff.push({ source: rule.source, kind: rule.kind, oldOutput: rule.output, status: 'unchanged' });
    }
  }

  for (const pkgRule of pkg.rules) {
    const key = ruleKey(pkgRule.kind, pkgRule.source);
    if (!seen.has(key)) {
      diff.push({ source: pkgRule.source, kind: pkgRule.kind, newOutput: pkgRule.output, status: 'added' });
    }
  }

  return diff;
}

function applyPackageToRuleSet(ruleSet: RuleSet, pkg: StandardsPackage, diff: RuleDiffEntry[]): RuleSet {
  const rules = ruleSet.rules.map((rule) => ({ ...rule }));
  const indexByKey = new Map(rules.map((rule, index) => [ruleKey(rule.kind, rule.source), index]));

  for (const entry of diff) {
    const key = ruleKey(entry.kind, entry.source);
    const index = indexByKey.get(key);
    if (entry.status === 'added') {
      const pkgRule = pkg.rules.find((rule) => ruleKey(rule.kind, rule.source) === key);
      rules.push({
        id: `rule-${pkg.id}-${entry.source}-${Math.random().toString(36).slice(2, 6)}`,
        source: entry.source,
        output: entry.newOutput ?? '',
        kind: entry.kind,
        enabled: true,
        suspicious: false,
        description: pkgRule?.description ?? `新规范 ${pkg.version} 新增`,
      });
    } else if (index !== undefined && entry.status === 'changed') {
      rules[index] = { ...rules[index], output: entry.newOutput ?? '' };
    } else if (index !== undefined && entry.status === 'deprecated') {
      rules[index] = { ...rules[index], enabled: false, archived: true };
    }
  }

  return { ...ruleSet, rules };
}

function buildSnapshot(state: ProjectState, action: string): VersionSnapshot {
  const { versions: _versions, migration: _migration, ...snapshot } = structuredClone(state);
  return {
    id: `version-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: action,
    createdAt: new Date().toISOString(),
    action,
    snapshot: { ...snapshot, migration: undefined },
  };
}

function buildBatches(state: ProjectState, previous?: MigrationState): MigrationBatch[] {
  return state.lessons
    .map((lesson) => {
      const lineIds = state.lines.filter((line) => line.lessonId === lesson.id).map((line) => line.id);
      const prev = previous?.batches.find((batch) => batch.lessonId === lesson.id);
      return {
        id: prev?.id ?? `batch-${lesson.id}`,
        lessonId: lesson.id,
        lessonName: lesson.name,
        lineIds,
        status: prev?.status ?? 'pending',
        appliedAt: prev?.appliedAt,
        error: prev?.error,
      } satisfies MigrationBatch;
    })
    .filter((batch) => batch.lineIds.length > 0);
}

/**
 * 启动规范迁移：先留整册快照，再逐条应用规则（新增/改过/停用留档），
 * 并按课次建立分批。同一份包已应用过则不再重复改写规则。
 */
export function startMigration(state: ProjectState, pkg: StandardsPackage): ProjectState {
  const activeSet = state.ruleSets.find((set) => set.id === state.activeRuleSetId) ?? state.ruleSets[0];
  const alreadyApplied = state.appliedPackageIds.includes(packageKey(pkg));
  const previous = state.migration?.status === 'in-progress' ? state.migration : undefined;

  // 同一份包已应用且没有进行中的迁移：不重复改写。
  if (alreadyApplied && !previous) return state;

  const diff = diffRulesAgainstRuleSet(pkg, activeSet);

  let ruleSets = state.ruleSets;
  if (!alreadyApplied) {
    const updatedSet = applyPackageToRuleSet(activeSet, pkg, diff);
    ruleSets = state.ruleSets.map((set) => (set.id === activeSet.id ? updatedSet : set));
  }

  const batches = buildBatches(state, previous);
  const allDone = batches.length > 0 && batches.every((batch) => batch.status === 'done');

  const snapshot = previous ? undefined : buildSnapshot(state, `迁移前整册快照 · ${pkg.name} ${pkg.version}`);

  const migration: MigrationState = {
    packageId: pkg.id,
    packageName: pkg.name,
    packageVersion: pkg.version,
    status: allDone ? 'completed' : 'in-progress',
    startedAt: previous?.startedAt ?? new Date().toISOString(),
    completedAt: allDone ? new Date().toISOString() : undefined,
    preSnapshotId: previous?.preSnapshotId ?? snapshot?.id ?? '',
    diff,
    batches,
    confirmed: false,
  };

  return {
    ...state,
    ruleSets,
    migration,
    appliedPackageIds: alreadyApplied ? state.appliedPackageIds : [...state.appliedPackageIds, packageKey(pkg)],
    versions: snapshot ? [snapshot, ...state.versions].slice(0, 20) : state.versions,
    updatedAt: new Date().toISOString(),
  };
}

/** 处理下一个待迁移课次；失败则标记 failed，可重试。 */
export function processNextBatch(state: ProjectState): ProjectState {
  const migration = state.migration;
  if (!migration || migration.status !== 'in-progress') return state;
  const next = migration.batches.find((batch) => batch.status === 'pending');
  if (!next) return state;

  try {
    const retranscribed = retranscribeLines(state, new Set(next.lineIds));
    const batches = migration.batches.map((batch) =>
      batch.id === next.id ? { ...batch, status: 'done' as const, appliedAt: new Date().toISOString(), error: undefined } : batch,
    );
    const allDone = batches.every((batch) => batch.status === 'done');
    return {
      ...retranscribed,
      migration: {
        ...migration,
        batches,
        status: allDone ? 'completed' : 'in-progress',
        completedAt: allDone ? new Date().toISOString() : undefined,
      },
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    const batches = migration.batches.map((batch) =>
      batch.id === next.id
        ? { ...batch, status: 'failed' as const, error: err instanceof Error ? err.message : String(err) }
        : batch,
    );
    return { ...state, migration: { ...migration, batches }, updatedAt: new Date().toISOString() };
  }
}

/** 重试所有失败的课次。 */
export function retryFailedBatches(state: ProjectState): ProjectState {
  const migration = state.migration;
  if (!migration) return state;
  const failed = migration.batches.filter((batch) => batch.status === 'failed');
  if (failed.length === 0) return state;

  let current = state;
  for (const batch of failed) {
    try {
      const retranscribed = retranscribeLines(current, new Set(batch.lineIds));
      current = {
        ...retranscribed,
        migration: {
          ...current.migration!,
          batches: current.migration!.batches.map((item) =>
            item.id === batch.id ? { ...item, status: 'done' as const, appliedAt: new Date().toISOString(), error: undefined } : item,
          ),
        },
      };
    } catch (err) {
      current = {
        ...current,
        migration: {
          ...current.migration!,
          batches: current.migration!.batches.map((item) =>
            item.id === batch.id ? { ...item, error: err instanceof Error ? err.message : String(err) } : item,
          ),
        },
      };
    }
  }

  const allDone = current.migration!.batches.every((batch) => batch.status === 'done');
  return {
    ...current,
    migration: {
      ...current.migration!,
      status: allDone ? 'completed' : 'in-progress',
      completedAt: allDone ? new Date().toISOString() : undefined,
    },
    updatedAt: new Date().toISOString(),
  };
}

/** 确认切换到新规范。 */
export function confirmMigration(state: ProjectState): ProjectState {
  if (!state.migration) return state;
  return {
    ...state,
    migration: {
      ...state.migration,
      status: 'completed',
      confirmed: true,
      completedAt: state.migration.completedAt ?? new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
}

/** 迁移进度统计。 */
export function migrationProgress(migration: MigrationState | undefined): { done: number; total: number; failed: number } {
  if (!migration) return { done: 0, total: 0, failed: 0 };
  return {
    done: migration.batches.filter((batch) => batch.status === 'done').length,
    total: migration.batches.length,
    failed: migration.batches.filter((batch) => batch.status === 'failed').length,
  };
}
