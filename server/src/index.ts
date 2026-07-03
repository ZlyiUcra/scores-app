import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { tournamentsRouter } from './routes/tournaments.js';
import { matchesRouter } from './routes/matches.js';
import { bracketRouter } from './routes/bracket.js';
import { rosterRouter } from './routes/roster.js';
import { adminRouter } from './routes/admin/index.js';
import { AppError } from './errors.js';
import { initSocket } from './socket.js';

const app = express();

// Behind a TLS-terminating proxy (Render & co) the client IP arrives in
// X-Forwarded-For; rate limiting needs it to bucket per user, not per proxy.
app.set('trust proxy', 1);

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

// In production, restrict CORS to the known client origin with credentials.
// In development the Vite proxy makes everything same-origin, so no CORS needed.
if (config.isProd) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.clientOrigin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/bracket', bracketRouter);
app.use('/api/roster', rosterRouter);
app.use('/api/admin', adminRouter);

// Single-host deploy: in production serve the built client. Dev uses Vite
// instead, so the API stays API-only there even when a leftover client/dist
// exists (it would be stale anyway). The entry runs either from src/ (tsx)
// or from dist/server/src/ (tsc build), hence two candidates.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = [
  path.resolve(__dirname, '..', '..', 'client', 'dist'),
  path.resolve(__dirname, '..', '..', '..', '..', 'client', 'dist'),
].find((p) => fs.existsSync(p));
if (config.isProd && clientDist) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API GET renders the app shell (deep links like /ko/R8M0).
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log(`[server] serving client from ${clientDist}`);
}

// Single typed error contract: { error: { code, message } }.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
});

const server = http.createServer(app);
initSocket(server);

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port} (${config.nodeEnv})`);
});
