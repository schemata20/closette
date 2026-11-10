import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function testDatabase(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0001_orders.sql',import.meta.url),'utf8'));
  const db={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const rows=[];for(const stmt of statements)rows.push(await stmt.run());sqlite.exec('COMMIT');return rows;}catch(error){sqlite.exec('ROLLBACK');throw error;}},close(){sqlite.close();}};
  return db;
}
