import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { matchesRouter } from './routes/matches.js';
import { bracketRouter } from './routes/bracket.js';
import { rosterRouter } from './routes/roster.js';
import { adminRouter } from './routes/admin.js';
import { AppError } from './errors.js';
import { initSocket } from './socket.js';

const app = express();

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
app.use('/api/matches', matchesRouter);
app.use('/api/bracket', bracketRouter);
app.use('/api/roster', rosterRouter);
app.use('/api/admin', adminRouter);

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
