import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  Approval,
  CommandEnvelope,
  Device,
  ImprovementCandidate,
  MemoryItem,
  ToolName,
} from '@continuum/protocol';
import { api } from './api';
import { authConfigured, authenticated, login, logout } from './auth';
import {
  getExecutorStatus,
  startLocalExecutor,
  subscribeExecutorStatus,
  type ExecutorConnectionState,
} from './executor';
import {
  apiBaseUrl,
  createServerConnection,
  isTauriRuntime,
  loadServerConnection,
  needsServerConnection,
  saveServerConnection,
  type ServerConnection,
} from './server-config';

type Tab = 'overview' | 'commands' | 'memory' | 'improvements' | 'settings';

interface DashboardData {
  devices: Device[];
  commands: CommandEnvelope[];
  approvals: Approval[];
  memories: MemoryItem[];
  candidates: ImprovementCandidate[];
}

const EMPTY: DashboardData = {
  devices: [],
  commands: [],
  approvals: [],
  memories: [],
  candidates: [],
};

const TOOLS: ToolName[] = [
  'file.list',
  'file.read',
  'file.write',
  'file.trash',
  'app.launch',
  'screen.snapshot',
  'screen.control',
];

function relativeTime(value: string | null): string {
  if (!value) return '연결 기록 없음';
  const seconds = Math.floor((Date.now() - Date.parse(value)) / 1_000);
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}분 전`;
  return `${Math.floor(seconds / 3_600)}시간 전`;
}

function statusLabel(status: CommandEnvelope['status']): string {
  return {
    queued: '대기 중',
    awaiting_approval: '승인 필요',
    dispatched: '전달됨',
    running: '실행 중',
    succeeded: '완료',
    failed: '실패',
    expired: '만료',
    cancelled: '취소',
  }[status];
}

export function App() {
  if (needsServerConnection()) return <ServerSetup />;
  return <Dashboard />;
}

function ServerSetup() {
  return (
    <main className="setup-shell">
      <section className="setup-card">
        <div className="brand setup-brand">
          <span className="brand-mark">C</span>
          <div><strong>Continuum</strong><small>Personal agent mesh</small></div>
        </div>
        <p className="eyebrow">첫 연결 설정</p>
        <h1>연결할 서버를 선택하세요.</h1>
        <p className="setup-copy">플랫폼 도메인 하나로 API와 로그인 서버 주소를 구성하고, 저장하기 전에 연결 상태를 확인합니다.</p>
        <ServerConnectionForm />
      </section>
    </main>
  );
}

function ServerConnectionForm() {
  const saved = loadServerConnection();
  const [domain, setDomain] = useState(saved?.appUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const preview = useMemo<{ connection: ServerConnection | null; error: string | null }>(() => {
    if (!domain.trim()) return { connection: null, error: null };
    try {
      return { connection: createServerConnection(domain), error: null };
    } catch (reason) {
      return { connection: null, error: reason instanceof Error ? reason.message : String(reason) };
    }
  }, [domain]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setConnectionError(null);
    if (!preview.connection) {
      setConnectionError(preview.error ?? '서버 도메인을 입력하세요.');
      return;
    }

    setBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${preview.connection.apiUrl}/health`, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as { status?: string; message?: string } | null;
      if (!response.ok || payload?.status !== 'ok') {
        throw new Error(payload?.message ?? `API health check failed (${response.status})`);
      }
      saveServerConnection(preview.connection);
      window.location.reload();
    } catch (reason) {
      const detail = reason instanceof Error && reason.name === 'AbortError'
        ? '연결 시간이 초과되었습니다.'
        : reason instanceof Error ? reason.message : String(reason);
      setConnectionError(`서버에 연결하지 못했습니다. ${detail}`);
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  return (
    <form className="server-form" onSubmit={(event) => void connect(event)}>
      <label>플랫폼 도메인
        <input
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="continuum.localtest.me"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </label>
      {preview.connection && (
        <div className="connection-preview">
          <span>API <code>{preview.connection.apiUrl}</code></span>
          <span>로그인 <code>{preview.connection.oidcIssuer}</code></span>
        </div>
      )}
      {(preview.error || connectionError) && <p className="form-error">{connectionError ?? preview.error}</p>}
      <button className="primary" disabled={busy || !preview.connection}>
        {busy ? '연결 확인 중…' : saved ? '연결 확인 후 변경' : '연결 확인 후 시작'}
      </button>
    </form>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [devices, commands, approvals, memories, candidates] = await Promise.all([
        api.devices(),
        api.commands(),
        api.approvals(),
        api.memories(),
        api.candidates(),
      ]);
      setData({ devices, commands, approvals, memories, candidates });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const onlineCount = data.devices.filter((device) => device.online).length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">C</span>
          <div><strong>Continuum</strong><small>Personal agent mesh</small></div>
        </div>
        <nav>
          <NavButton tab="overview" active={tab} onClick={setTab}>개요</NavButton>
          <NavButton tab="commands" active={tab} onClick={setTab}>명령</NavButton>
          <NavButton tab="memory" active={tab} onClick={setTab}>메모리</NavButton>
          <NavButton tab="improvements" active={tab} onClick={setTab}>개선 실험</NavButton>
          <NavButton tab="settings" active={tab} onClick={setTab}>설정</NavButton>
        </nav>
        <div className="connection-state">
          <span className={onlineCount ? 'dot online' : 'dot'} />
          {onlineCount}개 기기 온라인
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">통합 작업 환경</p>
            <h1>{({ overview: '개요', commands: '원격 명령', memory: '개인 메모리', improvements: '개선 실험', settings: '로컬 설정' } as const)[tab]}</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost" onClick={() => void refresh()} disabled={loading}>새로고침</button>
            {authConfigured() && (authenticated()
              ? <button className="ghost" onClick={logout}>로그아웃</button>
              : <button className="primary" onClick={() => void login()}>로그인</button>)}
          </div>
        </header>

        {error && <div className="error-banner">서버 연결 오류: {error}</div>}
        {tab === 'overview' && <Overview data={data} setTab={setTab} />}
        {tab === 'commands' && <Commands data={data} refresh={refresh} />}
        {tab === 'memory' && <Memories items={data.memories} refresh={refresh} />}
        {tab === 'improvements' && <Improvements items={data.candidates} refresh={refresh} />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

function NavButton({ tab, active, onClick, children }: { tab: Tab; active: Tab; onClick: (tab: Tab) => void; children: string }) {
  return <button className={active === tab ? 'nav-active' : ''} onClick={() => onClick(tab)}>{children}</button>;
}

function Overview({ data, setTab }: { data: DashboardData; setTab: (tab: Tab) => void }) {
  return (
    <div className="content-grid">
      <section className="hero-card">
        <div>
          <span className="pill">AGENT ONLINE</span>
          <h2>어느 기기에서든<br />작업을 이어가세요.</h2>
          <p>명령과 기억은 서버에 남고, 실제 작업은 선택한 PC에서 안전하게 실행됩니다.</p>
        </div>
        <button className="primary" onClick={() => setTab('commands')}>새 명령 만들기</button>
      </section>
      <section className="stats">
        <article><span>등록 기기</span><strong>{data.devices.length}</strong></article>
        <article><span>승인 대기</span><strong>{data.approvals.length}</strong></article>
        <article><span>활성 메모리</span><strong>{data.memories.length}</strong></article>
      </section>
      <section className="panel devices-panel">
        <div className="section-heading"><h3>내 기기</h3><span>{data.devices.length} devices</span></div>
        <div className="device-list">
          {data.devices.length === 0 && <Empty text="아직 등록된 기기가 없습니다." />}
          {data.devices.map((device) => (
            <article className="device" key={device.id}>
              <div className="device-icon">{device.kind === 'executor' ? 'PC' : 'M'}</div>
              <div><strong>{device.name}</strong><span>{device.platform} · {device.kind}</span></div>
              <div className="device-presence"><span className={device.online ? 'dot online' : 'dot'} />{device.online ? '온라인' : relativeTime(device.lastSeenAt)}</div>
            </article>
          ))}
        </div>
      </section>
      <section className="panel activity-panel">
        <div className="section-heading"><h3>최근 작업</h3><span>감사 가능한 실행 기록</span></div>
        {data.commands.slice(0, 6).map((command) => (
          <div className="activity" key={command.id}>
            <span className={`risk risk-${command.risk}`}>{command.risk}</span>
            <div><strong>{command.tool}</strong><small>{new Date(command.createdAt).toLocaleString()}</small></div>
            <span className={`status status-${command.status}`}>{statusLabel(command.status)}</span>
          </div>
        ))}
        {data.commands.length === 0 && <Empty text="실행 기록이 없습니다." />}
      </section>
    </div>
  );
}

function Commands({ data, refresh }: { data: DashboardData; refresh: () => Promise<void> }) {
  const executors = data.devices.filter((device) => device.kind === 'executor');
  const [targetDeviceId, setTarget] = useState(executors[0]?.id ?? '');
  const [tool, setTool] = useState<ToolName>('file.list');
  const [args, setArgs] = useState('{\n  "rootId": "workspace",\n  "relativePath": "."\n}');
  const [busy, setBusy] = useState(false);
  const [screenBusy, setScreenBusy] = useState(false);
  const [screenData, setScreenData] = useState<string | null>(null);
  const commandsById = useMemo(() => new Map(data.commands.map((command) => [command.id, command])), [data.commands]);

  useEffect(() => {
    if (!targetDeviceId && executors[0]) setTarget(executors[0].id);
  }, [executors, targetDeviceId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.sendCommand({
        targetDeviceId,
        tool,
        args: JSON.parse(args) as Record<string, unknown>,
        idempotencyKey: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function decide(commandId: string, decision: 'approve' | 'deny', biometricRequired: boolean) {
    if (decision === 'approve' && biometricRequired) {
      throw new Error('이 빌드에는 검증 가능한 생체 인증 어댑터가 없어 특권 작업 승인이 비활성화되어 있습니다.');
    }
    await api.decide(commandId, { decision, biometricVerified: false });
    await refresh();
  }

  async function snapshot() {
    if (!targetDeviceId) return;
    setScreenBusy(true);
    try {
      const command = await api.sendCommand({
        targetDeviceId,
        tool: 'screen.snapshot',
        args: {},
        idempotencyKey: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 2 * 60_000).toISOString(),
      });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const result = await api.commandResult(command.id);
        const png = result?.output?.pngBase64;
        if (typeof png === 'string') {
          setScreenData(`data:image/png;base64,${png}`);
          break;
        }
        if (result?.status === 'failed') throw new Error(result.error ?? 'Screen capture failed');
      }
      await refresh();
    } finally {
      setScreenBusy(false);
    }
  }

  return (
    <div className="two-column">
      <section className="panel command-compose">
        <div className="section-heading"><h3>구조화 명령</h3><span>최대 유효시간 10분</span></div>
        <form onSubmit={(event) => void submit(event)}>
          <label>대상 PC<select value={targetDeviceId} onChange={(event) => setTarget(event.target.value)} required><option value="">기기 선택</option>{executors.map((device) => <option key={device.id} value={device.id}>{device.name}{device.online ? ' · online' : ' · offline'}</option>)}</select></label>
          <label>도구<select value={tool} onChange={(event) => setTool(event.target.value as ToolName)}>{TOOLS.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>인자 (JSON)<textarea value={args} onChange={(event) => setArgs(event.target.value)} rows={9} spellCheck={false} /></label>
          <button className="primary" disabled={busy || !targetDeviceId}>{busy ? '전송 중…' : '명령 전송'}</button>
        </form>
      </section>
      <section className="panel approvals-panel">
        <div className="section-heading"><h3>승인 대기</h3><span>{data.approvals.length}</span></div>
        {data.approvals.map((approval) => {
          const command = commandsById.get(approval.commandId);
          return <article className="approval" key={approval.id}>
            <span className="risk risk-privileged">{command?.risk ?? 'approval'}</span>
            <h4>{command?.tool ?? approval.commandId}</h4>
            <pre>{JSON.stringify(command?.args ?? {}, null, 2)}</pre>
            {approval.biometricRequired && <p className="warning">이 작업은 생체 인증이 필요합니다.</p>}
            <div><button className="primary" disabled={approval.biometricRequired} title={approval.biometricRequired ? '네이티브 생체 인증 어댑터가 필요합니다.' : undefined} onClick={() => void decide(approval.commandId, 'approve', approval.biometricRequired)}>승인</button><button className="danger" onClick={() => void decide(approval.commandId, 'deny', false)}>거부</button></div>
          </article>;
        })}
        {data.approvals.length === 0 && <Empty text="대기 중인 승인이 없습니다." />}
      </section>
      <section className="panel full-span">
        <div className="section-heading"><h3>필요할 때 화면 확인</h3><button className="ghost" onClick={() => void snapshot()} disabled={screenBusy || !targetDeviceId}>{screenBusy ? '캡처 요청 중…' : '현재 화면 요청'}</button></div>
        <div className="screen-preview">{screenData ? <img src={screenData} alt="원격 PC 화면 캡처" /> : <Empty text="에이전트 작업을 확인할 때만 화면 캡처를 요청합니다." />}</div>
      </section>
      <section className="panel full-span">
        <div className="section-heading"><h3>명령 기록</h3><span>{data.commands.length}</span></div>
        <div className="table-list">
          {data.commands.map((command) => <div className="table-row" key={command.id}><span className={`risk risk-${command.risk}`}>{command.risk}</span><strong>{command.tool}</strong><span>{data.devices.find((device) => device.id === command.targetDeviceId)?.name ?? '알 수 없는 기기'}</span><span className={`status status-${command.status}`}>{statusLabel(command.status)}</span></div>)}
        </div>
      </section>
    </div>
  );
}

function Memories({ items, refresh }: { items: MemoryItem[]; refresh: () => Promise<void> }) {
  const [content, setContent] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    await api.createMemory({ kind: 'preference', content, source: 'explicit:user', confidence: 1 });
    setContent('');
    await refresh();
  }
  return <div className="two-column"><section className="panel"><div className="section-heading"><h3>명시적 메모리 추가</h3><span>항상 출처 보존</span></div><form onSubmit={(event) => void submit(event)}><label>기억할 내용<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} required /></label><button className="primary">저장</button></form></section><section className="panel"><div className="section-heading"><h3>저장된 메모리</h3><span>{items.length}</span></div>{items.map((item) => <article className="memory-card" key={item.id}><span className="pill">{item.kind}</span><p>{item.content}</p><small>{item.source} · 신뢰도 {Math.round(item.confidence * 100)}%</small></article>)}{items.length === 0 && <Empty text="저장된 메모리가 없습니다." />}</section></div>;
}

function Improvements({ items, refresh }: { items: ImprovementCandidate[]; refresh: () => Promise<void> }) {
  const [after, setAfter] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    await api.createCandidate({ kind: 'prompt', title: '사용자 제안', before: '', after, rationale: '사용자가 명시적으로 제안한 개선안' });
    setAfter('');
    await refresh();
  }
  async function action(id: string, name: 'evaluate' | 'activate' | 'rollback') { await api.candidateAction(id, name); await refresh(); }
  return <div className="two-column"><section className="panel"><div className="section-heading"><h3>개선 후보 만들기</h3><span>자동 적용되지 않음</span></div><form onSubmit={(event) => void submit(event)}><label>변경 후 프롬프트/정책<textarea value={after} onChange={(event) => setAfter(event.target.value)} rows={8} required /></label><button className="primary">초안 저장</button></form></section><section className="panel"><div className="section-heading"><h3>버전 파이프라인</h3><span>{items.length}</span></div>{items.map((item) => <article className="candidate" key={item.id}><div><span className={`status status-${item.status}`}>{item.status}</span><span className="pill">{item.kind}</span></div><h4>{item.title}</h4><p>{item.rationale}</p><small>평가 {item.evaluationScore ?? '미실행'} · 안전성 {item.safetyPassed === null ? '미검증' : item.safetyPassed ? '통과' : '실패'}</small><div>{['draft', 'failed'].includes(item.status) && <button className="ghost" onClick={() => void action(item.id, 'evaluate')}>평가</button>}{item.status === 'ready' && <button className="primary" onClick={() => void action(item.id, 'activate')}>승인 및 적용</button>}{item.status === 'active' && <button className="danger" onClick={() => void action(item.id, 'rollback')}>롤백</button>}</div></article>)}{items.length === 0 && <Empty text="개선 후보가 없습니다." />}</section></div>;
}

function Settings() {
  const tauri = isTauriRuntime();
  const [savedDeviceId, setSavedDeviceId] = useState(localStorage.getItem('continuum.deviceId') ?? '');
  const [deviceId, setDeviceId] = useState(savedDeviceId);
  const [credential, setCredential] = useState('');
  const [credentialStored, setCredentialStored] = useState<boolean | null>(tauri ? null : false);
  const [savingCredential, setSavingCredential] = useState(false);
  const [credentialNotice, setCredentialNotice] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [executorStatus, setExecutorStatus] = useState(getExecutorStatus);
  const [rootId, setRootId] = useState('workspace');
  const [rootPath, setRootPath] = useState('');
  const [rootBusy, setRootBusy] = useState(false);
  const [rootNotice, setRootNotice] = useState<string | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);

  useEffect(() => subscribeExecutorStatus(setExecutorStatus), []);

  useEffect(() => {
    if (!tauri || !savedDeviceId) {
      setCredentialStored(false);
      return;
    }
    let cancelled = false;
    setCredentialStored(null);
    void import('@tauri-apps/api/core').then(async ({ invoke }) => {
      try {
        const stored = await invoke<string>('load_device_credential', { deviceId: savedDeviceId });
        if (!cancelled) setCredentialStored(stored.length >= 32);
      } catch {
        if (!cancelled) setCredentialStored(false);
      }
    });
    return () => { cancelled = true; };
  }, [savedDeviceId, tauri]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setCredentialNotice(null);
    setCredentialError(null);
    if (!tauri) {
      setCredentialError('웹에서는 OS 보안 저장소를 사용할 수 없습니다. Tauri 데스크톱 앱에서 등록하세요.');
      return;
    }

    const normalizedDeviceId = deviceId.trim();
    const normalizedCredential = credential.trim();
    if (!normalizedDeviceId || !normalizedCredential) return;
    setSavingCredential(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('store_device_credential', {
        deviceId: normalizedDeviceId,
        credential: normalizedCredential,
      });
      const verified = await invoke<string>('load_device_credential', { deviceId: normalizedDeviceId });
      if (verified !== normalizedCredential) throw new Error('저장된 credential 검증에 실패했습니다.');

      localStorage.setItem('continuum.deviceId', normalizedDeviceId);
      setSavedDeviceId(normalizedDeviceId);
      setDeviceId(normalizedDeviceId);
      setCredential('');
      setCredentialStored(true);
      setCredentialNotice('OS 보안 저장소에 저장했습니다. 서버에서 자격 증명을 확인하는 중입니다.');
      startLocalExecutor(normalizedDeviceId, verified);
    } catch (reason) {
      setCredentialStored(false);
      setCredentialError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavingCredential(false);
    }
  }
  async function approveRoot(event: FormEvent) {
    event.preventDefault();
    setRootNotice(null);
    setRootError(null);
    if (!tauri || !rootId.trim() || !rootPath) return;
    setRootBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('approve_local_root', { rootId: rootId.trim(), path: rootPath });
      setRootNotice(`“${rootPath}” 폴더를 ${rootId.trim()} 루트로 허용했습니다.`);
    } catch (reason) {
      setRootError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRootBusy(false);
    }
  }

  async function chooseRoot() {
    setRootNotice(null);
    setRootError(null);
    if (!tauri) {
      setRootError('폴더 선택은 Tauri 데스크톱 앱에서만 사용할 수 있습니다.');
      return;
    }
    setRootBusy(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Continuum에서 허용할 폴더 선택',
      });
      if (typeof selected === 'string') setRootPath(selected);
    } catch (reason) {
      setRootError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRootBusy(false);
    }
  }
  const stateLabel: Record<ExecutorConnectionState, string> = {
    idle: '대기',
    connecting: '서버 연결 중',
    authenticating: '자격 증명 확인 중',
    connected: '온라인',
    disconnected: '연결 종료',
    error: '연결 실패',
  };

  return (
    <div className="two-column">
      {tauri && (
        <section className="panel full-span">
          <div className="section-heading"><h3>제어 서버</h3><span>이 PC에 저장됨</span></div>
          <p>플랫폼 도메인을 변경하면 기존 로그인 토큰을 지우고 새 서버로 다시 연결합니다.</p>
          <ServerConnectionForm />
        </section>
      )}
      <section className="panel">
        <div className="section-heading"><h3>PC 실행기 자격 증명</h3><span>OS 보안 저장소</span></div>
        <p>기기 등록 응답으로 받은 자격 증명은 macOS Keychain 또는 Windows Credential Manager에 저장됩니다.</p>
        {!tauri && <p className="info-message">웹 브라우저에서는 OS 보안 저장소와 로컬 실행기를 사용할 수 없습니다. 이 설정은 Tauri 데스크톱 앱에서 완료하세요.</p>}
        <div className="credential-status">
          <div><span>보안 저장소</span><strong>{credentialStored === null ? '확인 중' : credentialStored ? '저장됨' : '저장 안 됨'}</strong></div>
          <div><span>실행기 서버</span><strong className={`executor-${executorStatus.state}`}>{stateLabel[executorStatus.state]}</strong></div>
          <small>연결 대상: {apiBaseUrl()}</small>
          {tauri && <small>{executorStatus.message}</small>}
        </div>
        {credentialNotice && <p className="success-message">{credentialNotice}</p>}
        {credentialError && <p className="form-error">{credentialError}</p>}
        <form onSubmit={(event) => void save(event)}>
          <label>Device ID<input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} /></label>
          <label>Device credential<input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} /></label>
          <button className="primary" disabled={!tauri || savingCredential || !deviceId.trim() || !credential.trim()}>
            {savingCredential ? '저장 확인 중…' : '안전하게 저장하고 연결 확인'}
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="section-heading"><h3>허용 폴더</h3><span>원격 변경 불가</span></div>
        <p>네이티브 선택 창에서 직접 고른 폴더만 원격 파일 도구가 접근할 수 있습니다.</p>
        {!tauri && <p className="info-message">웹 브라우저에서는 로컬 폴더를 허용할 수 없습니다. Tauri 데스크톱 앱에서 폴더를 선택하세요.</p>}
        {rootNotice && <p className="success-message">{rootNotice}</p>}
        {rootError && <p className="form-error">{rootError}</p>}
        <form onSubmit={(event) => void approveRoot(event)}>
          <label>Root ID<input value={rootId} onChange={(event) => setRootId(event.target.value)} /></label>
          <label>선택한 폴더
            <div className="path-picker">
              <input value={rootPath} readOnly placeholder="아직 선택한 폴더가 없습니다." />
              <button type="button" className="ghost" onClick={() => void chooseRoot()} disabled={!tauri || rootBusy}>
                폴더 선택
              </button>
            </div>
          </label>
          <button className="primary" disabled={!tauri || rootBusy || !rootId.trim() || !rootPath}>
            {rootBusy ? '처리 중…' : '선택한 폴더 허용'}
          </button>
        </form>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
