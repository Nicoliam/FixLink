import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MysqlBusinessStore } from '../src/modules/business/mysql-business.store';

describe('MysqlBusinessStore search SQL', () => {
  it('uses a valid MySQL LIKE escape for board search filters', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return [[{ total: 0 }], []];
      },
    } as never;
    const store = new MysqlBusinessStore(pool);

    await store.listInternalJobs('1', {
      board: null,
      status: 'REQUESTED',
      technicianId: null,
      priority: 'URGENT',
      from: null,
      to: null,
      search: 'UAT',
      assigned: null,
      sort: 'RECENT',
      page: 1,
      pageSize: 50,
    });

    assert.equal(queries.length, 1);
    assert.match(queries[0]!.sql, /ESCAPE '\\\\'/);
  });

  it('uses a valid MySQL LIKE escape for business customer search', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return [[{ total: 0 }], []];
      },
    } as never;
    const store = new MysqlBusinessStore(pool);

    await store.listBusinessCustomers('1', 1, 50, 'UAT');

    assert.equal(queries.length, 1);
    assert.match(queries[0]!.sql, /ESCAPE '\\\\'/);
  });
});
