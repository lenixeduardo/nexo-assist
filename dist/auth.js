import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DomainError } from './types.js';
if (process.env.NODE_ENV === 'production' && (!process.env.APP_SESSION_SECRET || process.env.APP_SESSION_SECRET.length < 32)) {
    throw new Error('APP_SESSION_SECRET must be configured in production (minimum 32 chars)');
}
const secret = process.env.APP_SESSION_SECRET || 'development-session-secret-change-in-production';
export function signToken(userId) { const payload = Buffer.from(JSON.stringify({ id: userId, exp: Date.now() + 7 * 86400000, nonce: randomBytes(8).toString('hex') })).toString('base64url'); const mac = createHmac('sha256', secret).update(payload).digest('base64url'); return `${payload}.${mac}`; }
export function verifyToken(token) { if (!token)
    throw new DomainError('UNAUTHORIZED', 'Faça login para continuar', 401); const [payload, signature] = token.split('.'); if (!payload || !signature)
    throw new DomainError('UNAUTHORIZED', 'Sessão inválida', 401); const correct = createHmac('sha256', secret).update(payload).digest('base64url'); if (!safeEqual(correct, signature))
    throw new DomainError('UNAUTHORIZED', 'Sessão inválida', 401); try {
    const v = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > v.exp)
        throw Error('expired');
    return v.id;
}
catch {
    throw new DomainError('UNAUTHORIZED', 'Sessão expirada', 401);
} }
function safeEqual(a, b) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export function cookieFor(token, production) { return `nexo_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${production ? '; Secure' : ''}`; }
