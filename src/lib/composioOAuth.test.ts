import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { __setClientForTests, startRealOAuth } from './composioOAuth.js';

// Reproduces the live bug: connecting a toolkit through Vantage's own /voice
// route failed with Composio's real
//   400 {"error":{"message":"Alias \"vantage-voice-github\" is already in
//   use by another connection for this entity","code":600,
//   "slug":"ConnectedAccount_BadRequest"}}
// The alias is fixed per toolkit (vantage-voice-{slug}), so re-connecting
// reuses it on purpose -- the previous pre-emptive cleanup just didn't
// reliably find what it needed to delete first.

type FakeAccount = { id: string; alias: string; toolkit: { slug: string } };

function fakeComposio(opts: {
  accounts?: FakeAccount[];
  authorizeImpl?: (toolkitSlug: string, opts: { alias: string }) => any;
}) {
  const accounts = opts.accounts ? [...opts.accounts] : [];
  const listCalls: any[] = [];
  const deleteCalls: string[] = [];
  let authorizeCallCount = 0;

  const authorizeImpl =
    opts.authorizeImpl ??
    (() => ({ redirectUrl: 'https://composio.example/authorize', id: 'ca_new123' }));

  const client = {
    connectedAccounts: {
      list: async (query: any) => {
        listCalls.push(query);
        return { items: accounts.map((a) => ({ ...a })) };
      },
      delete: async (id: string) => {
        deleteCalls.push(id);
        const idx = accounts.findIndex((a) => a.id === id);
        if (idx >= 0) accounts.splice(idx, 1);
      },
    },
    create: async (_userId: string) => ({
      authorize: async (toolkitSlug: string, authOpts: { alias: string }) => {
        authorizeCallCount++;
        return authorizeImpl(toolkitSlug, authOpts);
      },
    }),
  };

  return {
    client: client as any,
    listCalls,
    deleteCalls,
    get authorizeCallCount() {
      return authorizeCallCount;
    },
    accounts,
  };
}

function aliasCollisionError() {
  const err: any = new Error(
    '400 {"error":{"message":"Alias \\"vantage-voice-github\\" is already in use by another connection for this entity","code":600,"slug":"ConnectedAccount_BadRequest","status":400}}'
  );
  err.status = 400;
  err.error = {
    error: {
      message: 'Alias "vantage-voice-github" is already in use by another connection for this entity',
      code: 600,
      slug: 'ConnectedAccount_BadRequest',
      status: 400,
    },
  };
  return err;
}

beforeEach(() => {
  __setClientForTests(null);
});

describe('startRealOAuth', () => {
  it('connects cleanly when nothing is in the way', async () => {
    const fake = fakeComposio({ accounts: [] });
    __setClientForTests(fake.client);

    const result = await startRealOAuth('github');

    assert.equal(result.redirectUrl, 'https://composio.example/authorize');
    assert.equal(fake.deleteCalls.length, 0, 'nothing to delete when no stale connection exists');
    assert.equal(fake.authorizeCallCount, 1);
  });

  it('deletes a stale connection found on the pre-emptive lookup before connecting', async () => {
    const fake = fakeComposio({
      accounts: [{ id: 'ca_old1', alias: 'vantage-voice-github', toolkit: { slug: 'github' } }],
    });
    __setClientForTests(fake.client);

    await startRealOAuth('github');

    assert.deepEqual(fake.deleteCalls, ['ca_old1']);
    assert.equal(fake.authorizeCallCount, 1, 'no retry needed -- cleanup worked the first time');
  });

  it('only touches connections matching this alias, not other toolkits or other aliases', async () => {
    const fake = fakeComposio({
      accounts: [
        { id: 'ca_gmail', alias: 'vantage-voice-gmail', toolkit: { slug: 'gmail' } },
        { id: 'ca_github_other', alias: 'some-other-alias', toolkit: { slug: 'github' } },
      ],
    });
    __setClientForTests(fake.client);

    await startRealOAuth('github');

    assert.equal(fake.deleteCalls.length, 0);
  });

  it('asks Composio for every connection status explicitly, not whatever the default is', async () => {
    // The bug this whole module exists to prevent: an OAuth attempt that was
    // started but never completed sits in INITIATED/INITIALIZING and still
    // holds the alias. If the list call didn't ask for those statuses by
    // name, it could silently stop finding them the moment Composio's
    // default scope changes.
    const fake = fakeComposio({ accounts: [] });
    __setClientForTests(fake.client);

    await startRealOAuth('github');

    assert.ok(fake.listCalls.length >= 1);
    const query = fake.listCalls[0];
    assert.deepEqual(query.toolkitSlugs, ['github']);
    assert.ok(Array.isArray(query.statuses) && query.statuses.length >= 6, 'expected an explicit multi-status filter');
    for (const s of ['INITIATED', 'INITIALIZING', 'ACTIVE', 'FAILED', 'EXPIRED', 'INACTIVE', 'REVOKED']) {
      assert.ok(query.statuses.includes(s), `expected statuses to include ${s}`);
    }
  });

  it('recovers when the pre-emptive lookup misses a connection that authorize() then collides with', async () => {
    // Simulates the live bug directly: the account exists on Composio's side
    // (e.g. stuck INITIATED from an abandoned attempt) but the FIRST list
    // call doesn't return it -- authorize() hits the real collision, and the
    // module must react to that rather than give up.
    let listCallCount = 0;
    const fake = fakeComposio({
      accounts: [{ id: 'ca_hidden', alias: 'vantage-voice-github', toolkit: { slug: 'github' } }],
      authorizeImpl: () => {
        throw aliasCollisionError();
      },
    });
    // Override list to hide the account on the first call only.
    const realList = fake.client.connectedAccounts.list;
    fake.client.connectedAccounts.list = async (query: any) => {
      listCallCount++;
      if (listCallCount === 1) {
        fake.listCalls.push(query);
        return { items: [] };
      }
      return realList(query);
    };
    // Second authorize() call (the retry) should succeed.
    let authorizeAttempt = 0;
    fake.client.create = async () => ({
      authorize: async (toolkitSlug: string, authOpts: { alias: string }) => {
        authorizeAttempt++;
        if (authorizeAttempt === 1) throw aliasCollisionError();
        return { redirectUrl: 'https://composio.example/authorize', id: 'ca_new456' };
      },
    });
    __setClientForTests(fake.client);

    const result = await startRealOAuth('github');

    assert.equal(result.redirectUrl, 'https://composio.example/authorize');
    assert.deepEqual(fake.deleteCalls, ['ca_hidden'], 'the reactive cleanup should have found and removed it');
    assert.equal(authorizeAttempt, 2, 'exactly one retry after the forced cleanup');
  });

  it('surfaces the real error rather than looping when cleanup finds nothing to remove', async () => {
    const fake = fakeComposio({
      accounts: [],
      authorizeImpl: () => {
        throw aliasCollisionError();
      },
    });
    __setClientForTests(fake.client);

    await assert.rejects(() => startRealOAuth('github'), /already in use/);
    assert.equal(fake.deleteCalls.length, 0);
    assert.equal(fake.authorizeCallCount, 1, 'must not retry when there was nothing to clean up');
  });

  it('does not treat an unrelated 400 as an alias collision', async () => {
    const fake = fakeComposio({
      accounts: [{ id: 'ca_old1', alias: 'vantage-voice-github', toolkit: { slug: 'github' } }],
      authorizeImpl: () => {
        const err: any = new Error('400 some unrelated validation failure');
        err.status = 400;
        err.error = { error: { message: 'some unrelated validation failure', code: 601, slug: 'SomeOtherError' } };
        throw err;
      },
    });
    __setClientForTests(fake.client);

    await assert.rejects(() => startRealOAuth('github'), /unrelated validation failure/);
    // The pre-emptive cleanup still ran (it always does), but no *reactive*
    // second cleanup/retry should have been attempted for an unrelated error.
    assert.equal(fake.authorizeCallCount, 1);
  });

  it('rejects a malformed toolkit slug before ever touching the client', async () => {
    const fake = fakeComposio({});
    __setClientForTests(fake.client);

    await assert.rejects(() => startRealOAuth('not a valid slug!'), /Invalid toolkit slug/);
    assert.equal(fake.listCalls.length, 0);
  });
});
