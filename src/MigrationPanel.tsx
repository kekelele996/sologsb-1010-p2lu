import { useMemo, useState } from 'preact/hooks';
import { migrationProgress } from './migration';
import { SAMPLE_PACKAGE_V2, SAMPLE_PACKAGE_V2_PART2 } from './samplePackages';
import type { MigrationSession, ProjectState, RuleChange, StandardPackage } from './types';

const TYPE_LABEL: Record<RuleChange['type'], string> = {
  added: '新增',
  changed: '输出改过',
  retired: '停用留档',
  unchanged: '无变化',
};

const LESSON_LABEL: Record<string, string> = {
  migrated: '已迁移',
  failed: '失败待重试',
  pending: '待迁移',
};

function changeCount(changes: RuleChange[], type: RuleChange['type']): number {
  return changes.filter((change) => change.type === type).length;
}

function downloadJson(pkg: StandardPackage): void {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${pkg.packageId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function lineNumberMap(lines: ProjectState['lines']): Map<string, number> {
  return new Map(lines.map((line, index) => [line.id, index + 1]));
}

export default function MigrationPanel({
  state,
  onApplyPackage,
  onMigrateLesson,
  onMigrateRemaining,
  onRollback,
  onDismiss,
  onJump,
}: {
  state: ProjectState;
  onApplyPackage: (pkg: StandardPackage) => { ok: boolean; message: string };
  onMigrateLesson: (lessonId: string) => void;
  onMigrateRemaining: () => void;
  onRollback: () => void;
  onDismiss: () => void;
  onJump: (lineId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const session = state.migration;
  const lineNumbers = useMemo(() => lineNumberMap(state.lines), [state.lines]);

  const submit = (pkg: StandardPackage) => {
    const result = onApplyPackage(pkg);
    setError(result.ok ? '' : result.message);
    setNotice(result.ok ? result.message : '');
    if (result.ok) setDraft('');
  };

  const submitText = () => {
    // 解析在提交时由 applyPackage 之前的 parsePackage 完成；这里先解析以在面板内显示错误。
    try {
      const parsed = JSON.parse(draft) as StandardPackage;
      submit(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '规范包解析失败。');
      setNotice('');
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      setDraft(text);
      const parsed = JSON.parse(text) as StandardPackage;
      submit(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '规范包读取失败。');
      setNotice('');
    }
  };

  // ----- 无迁移会话：提交规范包入口 -----
  if (!session) {
    return (
      <div class="inspector-body migration-panel">
        <div class="migration-intro">
          <strong>规范包迁移</strong>
          <p>
            提交教研室下发的新版通用盲文规范包，系统会把包内规则与当前草稿规则集逐条比对，
            列出<strong>新增、输出改过、停用</strong>三类变化；停用规则留档，不再参与转写。
            迁移按课次分批进行，中途失败可重试，支持续包接着迁。
          </p>
        </div>

        <div class="migration-drop">
          <label class="migration-file-button">
            选择规范包文件（.json）
            <input type="file" accept="application/json,.json" hidden onChange={(event: any) => onPickFile(event.currentTarget.files?.[0])} />
          </label>
          <md-outlined-text-field
            type="textarea"
            rows={6}
            value={draft}
            label="或粘贴规范包 JSON"
            onInput={(event: any) => setDraft(event.currentTarget.value)}
          />
          <md-filled-button disabled={!draft.trim()} onClick={submitText}>校验并开始迁移</md-filled-button>
        </div>

        {error && <div class="migration-error">✕ {error}</div>}
        {notice && <div class="migration-notice">✓ {notice}</div>}

        <div class="migration-samples">
          <strong>没有规范包？先用示例包体验完整流程</strong>
          <p>首包会带来规则变化与一个因弯引号缺失而失败的课次；续包补齐规则后可重试通过。</p>
          <div class="migration-sample-actions">
            <md-filled-tonal-button onClick={() => submit(SAMPLE_PACKAGE_V2)}>载入示例首包开始迁移</md-filled-tonal-button>
            <md-text-button onClick={() => downloadJson(SAMPLE_PACKAGE_V2)}>下载首包 JSON</md-text-button>
            <md-text-button onClick={() => downloadJson(SAMPLE_PACKAGE_V2_PART2)}>下载续包 JSON</md-text-button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ActiveMigration
      state={state}
      session={session}
      lineNumbers={lineNumbers}
      error={error}
      notice={notice}
      draft={draft}
      setDraft={setDraft}
      setError={setError}
      setNotice={setNotice}
      submit={submit}
      onPickFile={onPickFile}
      onMigrateLesson={onMigrateLesson}
      onMigrateRemaining={onMigrateRemaining}
      onRollback={onRollback}
      onDismiss={onDismiss}
      onJump={onJump}
    />
  );
}

function ActiveMigration({
  state,
  session,
  lineNumbers,
  error,
  notice,
  draft,
  setDraft,
  setError,
  setNotice,
  submit,
  onPickFile,
  onMigrateLesson,
  onMigrateRemaining,
  onRollback,
  onDismiss,
  onJump,
}: {
  state: ProjectState;
  session: MigrationSession;
  lineNumbers: Map<string, number>;
  error: string;
  notice: string;
  draft: string;
  setDraft: (value: string) => void;
  setError: (value: string) => void;
  setNotice: (value: string) => void;
  submit: (pkg: StandardPackage) => void;
  onPickFile: (file: File | undefined) => void;
  onMigrateLesson: (lessonId: string) => void;
  onMigrateRemaining: () => void;
  onRollback: () => void;
  onDismiss: () => void;
  onJump: (lineId: string) => void;
}) {
  const progress = migrationProgress(session);
  const percent = Math.round((progress.migrated / progress.total) * 100);
  const base = state.ruleSets.find((set) => set.id === session.baseRuleSetId);
  const target = state.ruleSets.find((set) => set.id === session.targetRuleSetId);
  const allDone = progress.migrated === progress.total;

  const submitText = () => {
    try {
      submit(JSON.parse(draft) as StandardPackage);
    } catch (err) {
      setError(err instanceof Error ? err.message : '规范包解析失败。');
      setNotice('');
    }
  };

  const grouped = (['added', 'changed', 'retired', 'unchanged'] as const)
    .map((type) => ({ type, items: session.changes.filter((change) => change.type === type) }))
    .filter((group) => group.items.length > 0);

  return (
    <div class="inspector-body migration-panel">
      <div class={`migration-banner ${session.status === 'confirmed' ? 'done' : allDone ? 'ready' : 'active'}`}>
        {session.status === 'confirmed' ? (
          <>
            <strong>迁移完成 · 已切到新规范</strong>
            <p>全部 {progress.total} 个课次已按「{target?.name}」重新转录，旧规则集仍保留可对照。</p>
            <md-filled-tonal-button onClick={onDismiss}>结束并归档本次迁移</md-filled-tonal-button>
          </>
        ) : (
          <>
            <strong>规范迁移进行中</strong>
            <p>{base?.name} → {target?.name}</p>
            <md-linear-progress value={percent / 100} />
            <div class="metric-row">
              <span>{progress.migrated} 课已迁</span>
              <span class="danger-text">{progress.failed} 课失败</span>
              <span>{progress.pending} 课待迁</span>
            </div>
          </>
        )}
      </div>

      {error && <div class="migration-error">✕ {error}</div>}
      {notice && <div class="migration-notice">✓ {notice}</div>}

      {session.status === 'in-progress' && (
        <div class="migration-actions">
          <md-filled-button disabled={allDone} onClick={onMigrateRemaining}>
            {progress.failed > 0 ? '重试失败并迁完剩余课次' : '按课次顺序迁完全部'}
          </md-filled-button>
          <md-text-button onClick={onRollback}>切回旧规范（回滚整册快照）</md-text-button>
        </div>
      )}

      <div class="migration-section">
        <strong>课次批次</strong>
        <div class="lesson-list">
          {session.lessons.map((lesson) => (
            <div class={`lesson-row ${lesson.status}`} key={lesson.id}>
              <span class={`lesson-dot ${lesson.status}`} />
              <div class="lesson-main">
                <strong>{lesson.title}</strong>
                <p>
                  课文行 {lesson.lineIds.map((id) => lineNumbers.get(id) ?? '?').join('、')} · {LESSON_LABEL[lesson.status]}
                  {lesson.attempts > 0 && ` · 已尝试 ${lesson.attempts} 次`}
                </p>
                {lesson.error && <p class="lesson-error">阻断：{lesson.error}</p>}
                <div class="lesson-row-actions">
                  {lesson.status !== 'migrated' && session.status === 'in-progress' && (
                    <md-filled-tonal-button onClick={() => onMigrateLesson(lesson.id)}>
                      {lesson.status === 'failed' ? '重试此课次' : '迁移此课次'}
                    </md-filled-tonal-button>
                  )}
                  {lesson.lineIds[0] && <md-text-button onClick={() => onJump(lesson.lineIds[0])}>定位课文</md-text-button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {session.status === 'in-progress' && (
        <div class="migration-drop compact">
          <strong>交下一份包（续包接着迁）</strong>
          <p>同一份包交两次不会重复改写；未迁完的课次会由新包继续。</p>
          <label class="migration-file-button">
            选择续包文件
            <input type="file" accept="application/json,.json" hidden onChange={(event: any) => onPickFile(event.currentTarget.files?.[0])} />
          </label>
          <md-outlined-text-field
            type="textarea"
            rows={3}
            value={draft}
            label="或粘贴续包 JSON"
            onInput={(event: any) => setDraft(event.currentTarget.value)}
          />
          <div class="migration-sample-actions">
            <md-filled-button disabled={!draft.trim()} onClick={submitText}>提交续包</md-filled-button>
            <md-text-button onClick={() => submit(SAMPLE_PACKAGE_V2_PART2)}>载入示例续包</md-text-button>
          </div>
        </div>
      )}

      <div class="migration-section">
        <strong>规则比对清单</strong>
        <div class="metric-row">
          <span class="added-text">{changeCount(session.changes, 'added')} 新增</span>
          <span class="changed-text">{changeCount(session.changes, 'changed')} 输出改过</span>
          <span class="retired-text">{changeCount(session.changes, 'retired')} 停用留档</span>
        </div>
        {grouped.map((group) => (
          <div class="change-group" key={group.type}>
            <p class="change-group-title">{TYPE_LABEL[group.type]}</p>
            {group.items.map((change) => (
              <div class="change-row" key={`${change.packageId}-${change.ruleId}`}>
                <span class="change-source">{change.source}</span>
                <span class="change-output">
                  {change.type === 'added' && <em>{change.newOutput}</em>}
                  {change.type === 'changed' && <><s>{change.oldOutput}</s> → <em>{change.newOutput}</em></>}
                  {change.type === 'retired' && <s>{change.oldOutput}</s>}
                  {change.type === 'unchanged' && <em>{change.newOutput}</em>}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div class="migration-section">
        <strong>已接收规范包（{session.appliedPackages.length}）</strong>
        {session.appliedPackages.map((pkg) => (
          <div class="applied-package" key={pkg.packageId}>
            <strong>{pkg.standardName} · {pkg.standardVersion}</strong>
            <p>{pkg.packageId}{pkg.continuesFromPackageId ? ` · 续接 ${pkg.continuesFromPackageId}` : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
