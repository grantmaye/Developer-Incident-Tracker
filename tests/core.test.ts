import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/lib/database';
import { migrate } from '../src/lib/schema';
import { Service } from '../src/lib/service';
import { createApi, contextFor } from '../src/lib/graphql';
test('incident lifecycle, stale write rejection, immutable closure and workspace permissions', async () => {
  const db = await createDatabase(process.env.TEST_DATABASE_URL);
  await migrate(db);
  const s = new Service(db),
    w = crypto.randomUUID(),
    other = crypto.randomUUID();
  const api = createApi();
  try {
    await s.initialize(w);
    await s.initialize(other);
    const a = (await s.dashboard(w)).incidents[0];
    const input = {
      status: 'IDENTIFIED',
      commander: 'Grant Maye',
      note: 'Found a connection pool limit.',
      rootCause: 'Pool exhausted',
      followUp: 'Add pool saturation alert',
    };
    const [one, two] = await Promise.allSettled([
      s.update(w, 'OWNER', a.id, 1, input),
      s.update(w, 'OWNER', a.id, 1, input),
    ]);
    assert.equal([one, two].filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await s.dashboard(w)).incidents[0].events.length, 2);
    await assert.rejects(s.update(w, 'VIEWER', a.id, 2, input));
    await assert.rejects(s.update(w, 'OWNER', a.id, 2, { ...input, status: 'RESOLVED' }));
    let updated = await s.update(w, 'OWNER', a.id, 2, { ...input, status: 'MONITORING' });
    await assert.rejects(
      s.update(w, 'OWNER', a.id, updated.version, { ...input, status: 'RESOLVED', rootCause: '' }),
    );
    updated = await s.update(w, 'OWNER', a.id, updated.version, { ...input, status: 'RESOLVED' });
    assert.ok(updated.resolvedAt);
    await assert.rejects(s.update(w, 'OWNER', a.id, updated.version, input));
    assert.equal((await s.dashboard(other)).incidents[0].version, 1);
    const created = await s.create(w, 'OWNER', {
      title: 'New outage',
      summary: 'An isolated test incident',
      severity: 'SEV2',
      serviceIds: ['gateway'],
      commander: 'Alex Chen',
    });
    await assert.rejects(s.update(other, 'OWNER', created.id, 1, input));
    const result = await api.executeOperation(
      { query: '{dashboard{incidents{id events{id}}}}' },
      { contextValue: contextFor(s, w, 'OWNER') },
    );
    if (result.body.kind === 'single') assert.equal(result.body.singleResult.errors, undefined);
  } finally {
    await api.stop();
    await db.close();
  }
});
