import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './database';
import { DomainError, stages, services, members, type Incident, type Event } from './model';
const event = (kind: string, body: string): Event => ({
  id: randomUUID(),
  kind,
  body,
  at: new Date().toISOString(),
  actor: 'Demo operator',
});
const createInput = z.object({
  title: z.string().trim().min(5).max(100),
  summary: z.string().trim().min(10).max(1000),
  severity: z.enum(['SEV1', 'SEV2', 'SEV3']),
  serviceIds: z.array(z.string()).min(1).max(5),
  commander: z.string(),
});
export class Service {
  constructor(public db: Database) {}
  async initialize(workspace: string) {
    await this.db.transaction(async (tx) => {
      if (
        !(
          await tx.query(
            'INSERT INTO workspaces(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',
            [workspace],
          )
        ).length
      )
        return;
      const seeds = [
        {
          id: 'INC-042',
          title: 'Payment requests timing out',
          summary:
            'Checkout requests are exceeding the upstream timeout. Investigate the connection pool before increasing retries.',
          severity: 'SEV1',
          status: 'INVESTIGATING',
          serviceIds: ['payments', 'database'],
          commander: 'Grant Maye',
          minutes: 32,
        },
        {
          id: 'INC-041',
          title: 'Delayed background jobs',
          summary:
            'The image processing queue is draining after a worker capacity increase. Monitor queue age for one full processing cycle.',
          severity: 'SEV2',
          status: 'MONITORING',
          serviceIds: ['workers'],
          commander: 'Alex Chen',
          minutes: 86,
        },
        {
          id: 'INC-040',
          title: 'Session refresh failures',
          summary:
            'A configuration mismatch interrupted session refresh. The previous configuration was restored.',
          severity: 'SEV3',
          status: 'RESOLVED',
          serviceIds: ['identity'],
          commander: 'Jordan Ellis',
          minutes: 180,
        },
      ];
      for (const s of seeds) {
        const at = new Date(Date.now() - s.minutes * 60000).toISOString();
        const incident: Incident = {
          ...s,
          severity: s.severity as Incident['severity'],
          status: s.status as Incident['status'],
          createdAt: at,
          updatedAt: at,
          resolvedAt:
            s.status === 'RESOLVED' ? new Date(Date.now() - 120 * 60000).toISOString() : null,
          version: 1,
          rootCause:
            s.status === 'RESOLVED' ? 'Configuration drift between identity replicas.' : '',
          followUp:
            s.status === 'RESOLVED'
              ? 'Add configuration parity validation to deployment checks.'
              : '',
          events: [{ ...event('DECLARED', s.summary), at }],
        };
        await tx.query('INSERT INTO incidents(workspace_id,id,data) VALUES($1,$2,$3::jsonb)', [
          workspace,
          s.id,
          JSON.stringify(incident),
        ]);
      }
    });
  }
  async dashboard(workspace: string) {
    const rows = await this.db.query<{ data: Incident }>(
      'SELECT data FROM incidents WHERE workspace_id=$1 ORDER BY id DESC',
      [workspace],
    );
    return { incidents: rows.map((r) => r.data), services, members, storageMode: this.db.mode };
  }
  async create(workspace: string, role: string, input: unknown) {
    if (role === 'VIEWER') throw new DomainError('Viewer mode is read only.', 'FORBIDDEN');
    const p = createInput.safeParse(input);
    if (!p.success)
      throw new DomainError('Provide a title, summary, severity, service and commander.');
    if (
      !members.includes(p.data.commander) ||
      p.data.serviceIds.some((id) => !services.some((s) => s.id === id))
    )
      throw new DomainError('Unknown commander or service.');
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspace]);
      const [{ count }] = await tx.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM incidents WHERE workspace_id=$1',
        [workspace],
      );
      if (count >= 100) throw new DomainError('This demo supports 100 incidents per workspace.');
      const id = `INC-${String(40 + count).padStart(3, '0')}`;
      const now = new Date().toISOString();
      const incident: Incident = {
        ...p.data,
        serviceIds: [...new Set(p.data.serviceIds)],
        id,
        status: 'INVESTIGATING',
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
        version: 1,
        rootCause: '',
        followUp: '',
        events: [event('DECLARED', p.data.summary)],
      };
      await tx.query('INSERT INTO incidents(workspace_id,id,data) VALUES($1,$2,$3::jsonb)', [
        workspace,
        id,
        JSON.stringify(incident),
      ]);
      return incident;
    });
  }
  async update(workspace: string, role: string, id: string, version: number, input: unknown) {
    if (role === 'VIEWER') throw new DomainError('Viewer mode is read only.', 'FORBIDDEN');
    const p = z
      .object({
        status: z.enum(stages),
        commander: z.string(),
        note: z.string().trim().min(3).max(1000),
        rootCause: z.string().trim().max(2000),
        followUp: z.string().trim().max(2000),
      })
      .safeParse(input);
    if (!p.success)
      throw new DomainError('A valid update and a note of at least three characters are required.');
    if (!members.includes(p.data.commander)) throw new DomainError('Unknown commander.');
    return this.db.transaction(async (tx) => {
      const [row] = await tx.query<{ data: Incident }>(
        'SELECT data FROM incidents WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
        [workspace, id],
      );
      if (!row) throw new DomainError('Incident not found.', 'NOT_FOUND');
      const old = row.data;
      if (old.version !== version)
        throw new DomainError(
          'This incident changed in another tab. Refresh it before saving. Your note is still in the form.',
          'CONFLICT',
        );
      if (old.status === 'RESOLVED')
        throw new DomainError(
          'Resolved incidents are immutable. Declare a new incident for a recurrence.',
        );
      const current = stages.indexOf(old.status),
        next = stages.indexOf(p.data.status);
      if (next !== current && next !== current + 1)
        throw new DomainError('Advance one response stage at a time.');
      if (p.data.status === 'RESOLVED' && (!p.data.rootCause || !p.data.followUp))
        throw new DomainError('Resolution requires a root cause and a follow-up action.');
      if (old.events.length >= 200)
        throw new DomainError('This demo supports 200 events per incident.');
      const incident: Incident = {
        ...old,
        status: p.data.status,
        commander: p.data.commander,
        rootCause: p.data.rootCause,
        followUp: p.data.followUp,
        version: old.version + 1,
        updatedAt: new Date().toISOString(),
        resolvedAt: p.data.status === 'RESOLVED' ? new Date().toISOString() : null,
        events: [
          ...old.events,
          event(
            old.status === p.data.status ? 'UPDATE' : 'STATUS_CHANGED',
            `${old.status === p.data.status ? '' : `${old.status} → ${p.data.status}. `}${p.data.note}${old.commander !== p.data.commander ? ` Commander: ${p.data.commander}.` : ''}`,
          ),
        ],
      };
      await tx.query('UPDATE incidents SET data=$3::jsonb WHERE workspace_id=$1 AND id=$2', [
        workspace,
        id,
        JSON.stringify(incident),
      ]);
      return incident;
    });
  }
}
