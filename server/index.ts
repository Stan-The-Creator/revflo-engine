import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { Socket } from 'net';

import voiceRouter from './routes/voice';
import { handleBridge } from './voice/bridge';

// ── Validate required env vars ─────────────────────────────────────────────
const REQUIRED_ENV = [
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_AGENT_ID',
  'ELEVENLABS_VOICE_ID',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'PUBLIC_URL',
];

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.warn(`[warn] Missing env vars: ${missing.join(', ')}`);
  console.warn('[warn] Server will start but voice features may not function.');
}

// ── Express setup ──────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Required for Twilio POST bodies

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'revflo',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'development',
  });
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/voice', voiceRouter);

// ── 404 fallback ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── HTTP + WebSocket server ────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const httpServer = createServer(app);

// WebSocket server shares the same HTTP server — required for Railway/WebSocket proxies
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
  const url = req.url ?? '';

  if (url === '/ws' || url.startsWith('/ws?')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  handleBridge(ws, req);
});

wss.on('error', (err) => {
  console.error('[wss] WebSocket server error:', err);
});

httpServer.listen(PORT, () => {
  console.log(`\n🚀 RevFlo server running on port ${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   Voice:     POST /api/voice`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Public:    ${process.env.PUBLIC_URL ?? 'not set'}\n`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
});

export default app;
