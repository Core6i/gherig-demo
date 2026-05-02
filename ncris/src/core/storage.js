/**
 * NCRIS · Core Storage
 * ────────────────────────────────────────────────────────────────────
 * Reference implementation uses JSON-file persistence behind a
 * collection-style API. In production this is replaced by Postgres
 * with an identical interface — every query method here maps cleanly
 * to a Postgres table and SQL query.
 *
 * Why JSON for the reference: zero external dependencies, runs on any
 * machine that has Node, easy to inspect during integration testing,
 * and keeps the architectural boundary clean — the caller never sees
 * persistence details.
 *
 * Why Postgres for production: ACID guarantees, foreign keys,
 * concurrent writes, replication, backup tooling, point-in-time
 * recovery. None of which matter for a reference implementation but
 * all of which matter for a national health system.
 *
 * The mapping is straightforward:
 *   collection.insert(record)           → INSERT INTO {collection} ...
 *   collection.findById(id)             → SELECT * FROM {collection} WHERE id = $1
 *   collection.findWhere(predicate, q)  → SELECT * FROM {collection} WHERE ...
 *   collection.update(id, patch)        → UPDATE {collection} SET ... WHERE id = $1
 *   collection.transaction(fn)          → BEGIN; ... COMMIT;
 */

import { promises as fs } from 'fs';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DEFAULT_DATA_DIR = process.env.NCRIS_DATA_DIR || '/home/claude/ncris/.data';

class Collection {
  constructor(name, dataDir) {
    this.name = name;
    this.file = path.join(dataDir, `${name}.json`);
    this.records = new Map();
    this.indexes = new Map();           // Optional secondary indexes
    this.txDepth = 0;
    this.txSnapshot = null;
    this.load();
  }

  load() {
    if (existsSync(this.file)) {
      const raw = readFileSync(this.file, 'utf-8');
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const r of arr) this.records.set(r.id, r);
        }
      } catch (err) {
        throw new Error(`Corrupt collection file ${this.file}: ${err.message}`);
      }
    }
  }

  persist() {
    if (this.txDepth > 0) return;       // Don't write mid-transaction
    const arr = Array.from(this.records.values());
    writeFileSync(this.file, JSON.stringify(arr, null, 2), 'utf-8');
  }

  // ─── CRUD ─────────────────────────────────────────────────────

  insert(record) {
    if (!record.id) record.id = randomUUID();
    if (this.records.has(record.id)) {
      throw new Error(`Duplicate id ${record.id} in ${this.name}`);
    }
    record.createdAt = record.createdAt || new Date().toISOString();
    record.updatedAt = record.updatedAt || record.createdAt;
    this.records.set(record.id, record);
    this.persist();
    return record;
  }

  upsert(record) {
    if (!record.id) record.id = randomUUID();
    record.updatedAt = new Date().toISOString();
    if (!this.records.has(record.id)) {
      record.createdAt = record.updatedAt;
    }
    this.records.set(record.id, record);
    this.persist();
    return record;
  }

  findById(id) {
    return this.records.get(id) || null;
  }

  findOne(predicate) {
    for (const r of this.records.values()) {
      if (predicate(r)) return r;
    }
    return null;
  }

  findWhere(predicate, opts = {}) {
    const out = [];
    for (const r of this.records.values()) {
      if (predicate(r)) out.push(r);
    }
    if (opts.sort) out.sort(opts.sort);
    if (opts.limit != null) return out.slice(0, opts.limit);
    return out;
  }

  all(opts = {}) {
    return this.findWhere(() => true, opts);
  }

  count(predicate) {
    if (!predicate) return this.records.size;
    let n = 0;
    for (const r of this.records.values()) if (predicate(r)) n++;
    return n;
  }

  update(id, patch) {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Not found: ${this.name}/${id}`);
    const updated = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    this.persist();
    return updated;
  }

  delete(id) {
    const removed = this.records.delete(id);
    if (removed) this.persist();
    return removed;
  }

  // ─── Transactions ─────────────────────────────────────────────

  transaction(fn) {
    if (this.txDepth === 0) {
      this.txSnapshot = new Map(this.records);
    }
    this.txDepth++;
    try {
      const result = fn();
      this.txDepth--;
      if (this.txDepth === 0) {
        this.txSnapshot = null;
        this.persist();
      }
      return result;
    } catch (err) {
      this.txDepth--;
      if (this.txDepth === 0) {
        this.records = this.txSnapshot;
        this.txSnapshot = null;
        this.persist();
      }
      throw err;
    }
  }

  clear() {
    this.records.clear();
    this.persist();
  }
}

export class Storage {
  constructor(dataDir = DEFAULT_DATA_DIR) {
    this.dataDir = dataDir;
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Collection(name, this.dataDir));
    }
    return this.collections.get(name);
  }

  /**
   * Cross-collection transaction. In the reference implementation this
   * snapshots all touched collections; in production it maps to a
   * single Postgres transaction.
   */
  transaction(collectionNames, fn) {
    const cols = collectionNames.map(n => this.collection(n));
    cols.forEach(c => c.txDepth++);
    cols.forEach(c => { if (c.txDepth === 1) c.txSnapshot = new Map(c.records); });
    try {
      const result = fn(...cols);
      cols.forEach(c => c.txDepth--);
      cols.forEach(c => { if (c.txDepth === 0) { c.txSnapshot = null; c.persist(); } });
      return result;
    } catch (err) {
      cols.forEach(c => c.txDepth--);
      cols.forEach(c => { if (c.txDepth === 0 && c.txSnapshot) { c.records = c.txSnapshot; c.txSnapshot = null; c.persist(); } });
      throw err;
    }
  }

  reset() {
    for (const c of this.collections.values()) c.clear();
  }
}

let _instance = null;
export function getStorage(dataDir) {
  if (!_instance) _instance = new Storage(dataDir);
  return _instance;
}
