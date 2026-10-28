/** Persisted, ordered and access-controlled evidence of agent executions.
 * Trace payloads are bounded and redacted before storage. Never record credentials.
 */
import { createHash, randomUUID } from 'node:crypto';
import { db, findAll, findOne } from './db.js';
export const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sensitive = /password|senha|secret|authorization|cookie|api.?key|token|credential|chave|session/i;
function clean(value, depth = 0) {
    if (depth > 5)
        return '[depth-limit]';
    if (typeof value === 'string')
        return value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-key]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 1500);
    if (typeof value === 'number' || typeof value === 'boolean' || value === null)
        return value;
    if (Array.isArray(value))
        return value.slice(0, 15).map(v => clean(v, depth + 1));
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).slice(0, 30).map(([k, v]) => [k, sensitive.test(k) ? '[redacted]' : clean(v, depth + 1)]));
    return undefined;
}
export function safeJson(v) { return JSON.stringify(clean(v)).slice(0, 12000); }
db.exec(`CREATE TABLE IF NOT EXISTS agent_runs (
 trace_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),user_id TEXT NOT NULL REFERENCES users(id),
 mode TEXT NOT NULL,model TEXT,status TEXT NOT NULL,decision TEXT,started_at TEXT NOT NULL,finished_at TEXT,
 error_code TEXT,input_digest TEXT NOT NULL,response_digest TEXT
);
CREATE TABLE IF NOT EXISTS agent_audit_events (
 id TEXT PRIMARY KEY,trace_id TEXT NOT NULL REFERENCES agent_runs(trace_id),seq INTEGER NOT NULL,kind TEXT NOT NULL,
 name TEXT NOT NULL,started_at TEXT NOT NULL,duration_ms INTEGER, outcome TEXT NOT NULL,
 input_json TEXT,output_json TEXT,input_digest TEXT,output_digest TEXT, resource_ids_json TEXT,
 UNIQUE(trace_id,seq)
);
CREATE INDEX IF NOT EXISTS idx_audit_run_conversation ON agent_runs(conversation_id,started_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_run ON agent_audit_events(trace_id,seq);`);
export function startRun(conversationId, userId, mode, input, traceId = randomUUID()) {
    db.prepare('INSERT INTO agent_runs(trace_id,conversation_id,user_id,mode,status,started_at,input_digest) VALUES(?,?,?,?,?,?,?)')
        .run(traceId, conversationId, userId, mode, 'RUNNING', new Date().toISOString(), sha(input));
    return traceId;
}
export function setRunModel(traceId, model) { db.prepare('UPDATE agent_runs SET model=? WHERE trace_id=?').run(model, traceId); }
export function recordEvent(traceId, kind, name, details = {}) {
    const input = details.input === undefined ? null : safeJson(details.input), output = details.output === undefined ? null : safeJson(details.output);
    db.prepare(`INSERT INTO agent_audit_events(id,trace_id,seq,kind,name,started_at,duration_ms,outcome,input_json,output_json,input_digest,output_digest,resource_ids_json)
 VALUES(?, ?,(SELECT COALESCE(MAX(seq),0)+1 FROM agent_audit_events WHERE trace_id=?),?,?,?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), traceId, traceId, kind, name, new Date().toISOString(), details.durationMs ?? null, details.outcome ?? 'OK', input, output, input ? sha(input) : null, output ? sha(output) : null, details.resourceIds ? JSON.stringify(details.resourceIds.slice(0, 25)) : null);
}
export function completeRun(traceId, status, decision, response, errorCode) {
    db.prepare('UPDATE agent_runs SET status=?,decision=?,finished_at=?,response_digest=?,error_code=? WHERE trace_id=?')
        .run(status, decision ?? null, new Date().toISOString(), response === undefined ? null : sha(response), errorCode ?? null, traceId);
}
export function auditForConversation(conversationId) {
    const runs = findAll('SELECT * FROM agent_runs WHERE conversation_id=? ORDER BY started_at, rowid', conversationId);
    return runs.map(run => ({ run, events: findAll('SELECT seq,kind,name,started_at,duration_ms,outcome,input_json,output_json,input_digest,output_digest,resource_ids_json FROM agent_audit_events WHERE trace_id=? ORDER BY seq', run.trace_id)
            .map(ev => ({ ...ev, input: ev.input_json ? JSON.parse(ev.input_json) : null, output: ev.output_json ? JSON.parse(ev.output_json) : null, resources: ev.resource_ids_json ? JSON.parse(ev.resource_ids_json) : [], input_json: undefined, output_json: undefined, resource_ids_json: undefined })) }));
}
export function auditRunExists(traceId) { return !!findOne('SELECT trace_id FROM agent_runs WHERE trace_id=?', traceId); }
;
