// A small in-memory stand-in for the Supabase client. It supports only the
// query methods the models use (select, insert, update, delete, eq, is, gte,
// lt, order, limit, maybeSingle, single), so tests can check what a model
// reads and writes without a real database.
function fakeSupabase(tables = {}) {
  const db = { tables: {}, nextId: 1, failWith: null };
  for (const [name, rows] of Object.entries(tables)) {
    db.tables[name] = rows.map((row) => ({ ...row }));
  }
  db.rows = (table) => (db.tables[table] ||= []);
  db.client = { from: (table) => new Query(db, table) };
  return db;
}

class Query {
  constructor(db, table) {
    Object.assign(this, { db, table, action: "select", filters: [], sort: null, max: null, countOnly: false });
  }
  select(_columns, options = {}) {
    if (this.action === "select") this.countOnly = options.head === true;
    return this;
  }
  insert(values) { this.action = "insert"; this.values = values; return this; }
  update(changes) { this.action = "update"; this.changes = changes; return this; }
  delete() { this.action = "delete"; return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  is(column, value) { this.filters.push((row) => (row[column] ?? null) === value); return this; }
  gte(column, value) { this.filters.push((row) => row[column] >= value); return this; }
  lt(column, value) { this.filters.push((row) => row[column] < value); return this; }
  order(column, { ascending = true } = {}) { this.sort = { column, ascending }; return this; }
  limit(count) { this.max = count; return this; }

  async maybeSingle() {
    const { data, error } = await this.run();
    return { data: data?.[0] ?? null, error };
  }
  async single() {
    const { data, error } = await this.run();
    return { data: data?.[0] ?? null, error };
  }
  then(resolve, reject) { return this.run().then(resolve, reject); }

  async run() {
    if (this.db.failWith) return { data: null, error: this.db.failWith, count: null };
    const rows = this.db.rows(this.table);
    const matches = () => rows.filter((row) => this.filters.every((test) => test(row)));

    if (this.action === "insert") {
      const row = {
        id: this.db.nextId, otp_id: this.db.nextId, created_at: new Date().toISOString(),
        attempts: 0, consumed_at: null, ...this.values,
      };
      this.db.nextId += 1;
      rows.push(row);
      return { data: [{ ...row }], error: null };
    }
    if (this.action === "update") {
      const changed = matches();
      changed.forEach((row) => Object.assign(row, this.changes));
      return { data: changed.map((row) => ({ ...row })), error: null };
    }
    if (this.action === "delete") {
      const removed = matches();
      this.db.tables[this.table] = rows.filter((row) => !removed.includes(row));
      return { data: removed, error: null };
    }

    let found = matches().map((row) => ({ ...row }));
    if (this.sort) {
      const { column, ascending } = this.sort;
      // Ties keep insertion order, newest last (or first when descending).
      found = found
        .map((row, index) => [row, index])
        .sort(([a, ai], [b, bi]) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : ai - bi) * (ascending ? 1 : -1))
        .map(([row]) => row);
    }
    if (this.max !== null) found = found.slice(0, this.max);
    return { data: this.countOnly ? null : found, error: null, count: found.length };
  }
}

module.exports = { fakeSupabase };
