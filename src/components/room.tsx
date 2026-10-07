'use client';
import { useCallback, useEffect, useState } from 'react';
import { useDialog } from './use-dialog';
import { ArrowUpRight, Plus, Radio, RefreshCw, Search, Terminal, X } from 'lucide-react';
import { request } from '@/lib/client';
import { stages, type Incident, type services as serviceType } from '@/lib/model';
type Data = {
  incidents: Incident[];
  services: typeof serviceType;
  members: string[];
  storageMode: string;
};
const query = `{ dashboard { incidents { id title summary severity status serviceIds commander createdAt updatedAt resolvedAt version rootCause followUp events { id kind body at actor } } services { id name region dependsOn } members storageMode } }`;
const names = {
  INVESTIGATING: 'Investigating',
  IDENTIFIED: 'Identified',
  MONITORING: 'Monitoring',
  RESOLVED: 'Resolved',
};
export default function Room() {
  const [data, setData] = useState<Data | null>(null),
    [id, setId] = useState('INC-042'),
    [filter, setFilter] = useState('active'),
    [search, setSearch] = useState(''),
    [note, setNote] = useState(''),
    [root, setRoot] = useState(''),
    [follow, setFollow] = useState(''),
    [owner, setOwner] = useState('Grant Maye'),
    [role, setRole] = useState('OWNER'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false);
  const closeDialog = useCallback(() => setAdding(false), []);
  useDialog(adding, closeDialog);
  async function refresh() {
    const r = await request<{ dashboard: Data }>(query);
    setData(r.dashboard);
    return r.dashboard;
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  const incident = data?.incidents.find((i) => i.id === id);
  const active = data?.incidents.filter((i) => i.status !== 'RESOLVED') ?? [];
  function select(i: Incident) {
    setId(i.id);
    setNote('');
    setRoot(i.rootCause);
    setFollow(i.followUp);
    setOwner(i.commander);
    setError('');
  }
  async function update(status: string) {
    if (!incident) return;
    setBusy(true);
    setError('');
    try {
      await request(
        'mutation Update($id:ID!,$version:Int!,$input:UpdateInput!){updateIncident(id:$id,version:$version,input:$input){id}}',
        {
          id,
          version: incident.version,
          input: { status, commander: owner, note, rootCause: root, followUp: follow },
        },
        role,
      );
      await refresh();
      setNote('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered =
    data?.incidents.filter(
      (i) =>
        (filter === 'all' ||
          (filter === 'active' ? i.status !== 'RESOLVED' : i.status === 'RESOLVED')) &&
        `${i.id} ${i.title}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="app">
      <header>
        <a className="wordmark" href="/">
          <Radio /> SIGNAL<span>INCIDENT ROOM</span>
        </a>
        <div className="header-tools">
          <span className="demo-label">LOCAL DEMO / FICTIONAL SERVICES</span>
          <select aria-label="Demo role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="OWNER">Operator</option>
            <option value="VIEWER">Observer</option>
          </select>
          <button className="declare" disabled={role === 'VIEWER'} onClick={() => setAdding(true)}>
            <Plus size={16} /> Declare incident
          </button>
        </div>
      </header>
      <div className="ticker">
        <span>
          <i /> RESPONSE DESK ONLINE
        </span>
        <span>{active.length.toString().padStart(2, '0')} ACTIVE INCIDENTS</span>
        <span>MANUAL STATUS / NO LIVE TELEMETRY</span>
      </div>
      <section className="intro">
        <div>
          <h1>
            When things break,
            <br />
            <em>find your signal.</em>
          </h1>
        </div>
        <div className="intro-note">
          <p>
            A shared record of what happened,
            <br />
            what changed, and what comes next.
          </p>
          <button onClick={() => refresh().catch((e) => setError(e.message))}>
            <RefreshCw size={14} /> Refresh workspace
          </button>
        </div>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <section className="service-strip" aria-label="Service status">
        {data?.services.map((s) => {
          const affected = active.filter((i) => i.serviceIds.includes(s.id));
          return (
            <div key={s.id} className={affected.length ? 'affected' : ''}>
              <span>
                <i />
                {s.name}
              </span>
              <small>{s.region}</small>
              <strong>
                {affected.length
                  ? `${affected.length} active incident${affected.length > 1 ? 's' : ''}`
                  : 'No reported incident'}
              </strong>
              <small>
                {s.dependsOn.length
                  ? `Depends on ${s.dependsOn.join(', ')}`
                  : 'Independent service'}
              </small>
            </div>
          );
        })}
      </section>
      {!data ? (
        <p className="loading">Opening incident room…</p>
      ) : (
        <div className="workspace">
          <aside className="incident-list">
            <div className="list-top">
              <h2>Response queue</h2>
              <span>{filtered.length}</span>
            </div>
            <div className="tabs">
              {['active', 'resolved', 'all'].map((f) => (
                <button
                  key={f}
                  className={filter === f ? 'selected' : ''}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <label className="search">
              <Search size={14} />
              <input
                aria-label="Search incidents"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find an incident"
              />
            </label>
            {filtered.map((i) => (
              <button
                className={`incident-item ${i.id === id ? 'current' : ''}`}
                key={i.id}
                onClick={() => select(i)}
              >
                <span>
                  <b className={i.severity}>{i.severity}</b>
                  <code>{i.id}</code>
                  <ArrowUpRight size={15} />
                </span>
                <h3>{i.title}</h3>
                <small>
                  {names[i.status]} <i>·</i> {i.commander.split(' ')[0]}
                </small>
              </button>
            ))}
            {!filtered.length && <p className="empty">No matching incidents.</p>}
            <div className="queue-note">
              <Terminal size={18} />
              <p>
                Clarity beats noise.
                <br />
                Keep every update actionable.
              </p>
            </div>
          </aside>
          {incident && (
            <section className="incident-detail">
              <div className="incident-heading">
                <div>
                  <span className={`severity ${incident.severity}`}>{incident.severity}</span>
                  <code>
                    {incident.id} / REV {incident.version}
                  </code>
                </div>
                <span className="status">{names[incident.status]}</span>
              </div>
              <h2>{incident.title}</h2>
              <p className="summary">{incident.summary}</p>
              <div className="meta">
                <span>
                  COMMANDER<strong>{incident.commander}</strong>
                </span>
                <span>
                  DECLARED
                  <strong>
                    {new Date(incident.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </strong>
                </span>
                <span>
                  AFFECTED<strong>{incident.serviceIds.join(' / ')}</strong>
                </span>
              </div>
              <div className="stages">
                {stages.map((s, n) => (
                  <div className={n <= stages.indexOf(incident.status) ? 'done' : ''} key={s}>
                    <b>0{n + 1}</b>
                    <span>{names[s]}</span>
                  </div>
                ))}
              </div>
              <div className="timeline-heading">
                <h3>Incident log</h3>
                <span>APPEND-ONLY THROUGH THE API</span>
              </div>
              <ol className="timeline">
                {incident.events.map((e) => (
                  <li key={e.id}>
                    <time>
                      {new Date(e.at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    <div>
                      <span>
                        {e.kind.replaceAll('_', ' ')} <small>{e.actor}</small>
                      </span>
                      <p>{e.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {incident.status === 'RESOLVED' ? (
                <div className="postmortem">
                  <h3>Resolution record</h3>
                  <p>
                    <strong>Root cause</strong>
                    {incident.rootCause}
                  </p>
                  <p>
                    <strong>Follow-up</strong>
                    {incident.followUp}
                  </p>
                </div>
              ) : (
                <form
                  className="update-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    update(incident.status);
                  }}
                >
                  <label htmlFor="update-note">Leave the next responder a useful update.</label>
                  <textarea
                    id="update-note"
                    rows={3}
                    value={note}
                    maxLength={1000}
                    minLength={3}
                    required
                    placeholder="What did you observe? What did you change?"
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="owner-row">
                    <label>
                      Commander
                      <select
                        aria-label="Commander"
                        value={owner}
                        onChange={(e) => setOwner(e.target.value)}
                      >
                        {data.members.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <button disabled={busy || role === 'VIEWER'}>
                      Post update <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {incident.status === 'MONITORING' && (
                    <div className="resolution-fields">
                      <label>
                        Root cause
                        <textarea
                          aria-label="Root cause"
                          value={root}
                          onChange={(e) => setRoot(e.target.value)}
                          maxLength={2000}
                        />
                      </label>
                      <label>
                        Follow-up action
                        <textarea
                          aria-label="Follow-up action"
                          value={follow}
                          onChange={(e) => setFollow(e.target.value)}
                          maxLength={2000}
                        />
                      </label>
                    </div>
                  )}
                  <button
                    type="button"
                    className="advance"
                    disabled={busy || role === 'VIEWER' || note.trim().length < 3}
                    onClick={() => update(stages[stages.indexOf(incident.status) + 1])}
                  >
                    Move to {names[stages[stages.indexOf(incident.status) + 1]]}{' '}
                    <ArrowUpRight size={16} />
                  </button>
                </form>
              )}
            </section>
          )}
          <aside className="runbook">
            <h2>
              Steady hands.
              <br />
              Clear decisions.
            </h2>
            {[
              [
                '01',
                'Scope the impact',
                'Identify affected services and the customer-facing symptom.',
              ],
              ['02', 'Name the owner', 'Keep one commander accountable for the next decision.'],
              [
                '03',
                'Record the change',
                'Write what you tried and what you observed, even when it did not work.',
              ],
              ['04', 'Close the loop', 'Document the cause and follow-up before resolving.'],
            ].map(([n, title, body]) => (
              <div key={n}>
                <b>{n}</b>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
            <p className="role-note">
              Operator and Observer simulate permissions. This demo does not authenticate users or
              page an on-call engineer.
            </p>
          </aside>
        </div>
      )}
      <footer>
        <span>{data?.storageMode ?? 'Connecting'} · Cookie-scoped demo</span>
      </footer>
      {adding && (
        <div className="overlay">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Declare incident">
            <button
              className="close"
              aria-label="Close declaration"
              onClick={() => setAdding(false)}
            >
              <X />
            </button>

            <h2>Declare an incident.</h2>
            {error && <p className="error">{error}</p>}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                const f = new FormData(e.currentTarget);
                try {
                  const result = await request<{ declareIncident: Incident }>(
                    'mutation Declare($input:CreateInput!){declareIncident(input:$input){id}}',
                    {
                      input: {
                        title: f.get('title'),
                        summary: f.get('summary'),
                        severity: f.get('severity'),
                        serviceIds: [f.get('service')],
                        commander: f.get('commander'),
                      },
                    },
                    role,
                  );
                  const next = await refresh();
                  select(next.incidents.find((i) => i.id === result.declareIncident.id)!);
                  setFilter('active');
                  setAdding(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Title
                <input name="title" required minLength={5} maxLength={100} />
              </label>
              <label>
                Impact summary
                <textarea name="summary" required minLength={10} maxLength={1000} />
              </label>
              <div className="form-grid">
                <label>
                  Severity
                  <select name="severity">
                    <option>SEV1</option>
                    <option>SEV2</option>
                    <option>SEV3</option>
                  </select>
                </label>
                <label>
                  Affected service
                  <select name="service">
                    {data?.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Commander
                <select name="commander">
                  {data?.members.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <button className="declare" disabled={busy}>
                Create incident
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
