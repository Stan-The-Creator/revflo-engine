import { Router, Request, Response } from 'express';

const router = Router();
const PUBLIC_URL = process.env.PUBLIC_URL!;

/**
 * POST /api/voice
 * Twilio calls this when an inbound call arrives.
 * We respond with TwiML that:
 *  1. Says a brief greeting (prevents dead air — CRITICAL)
 *  2. Immediately connects the call to our WebSocket bridge
 */
router.post('/', (req: Request, res: Response) => {
  const wsUrl = PUBLIC_URL.replace(/^https?/, 'wss') + '/ws';

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">One moment while we connect you.</Say>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="caller" value="${req.body.From ?? 'unknown'}" />
      <Parameter name="callSid" value="${req.body.CallSid ?? ''}" />
    </Stream>
  </Connect>
</Response>`;

  res.set('Content-Type', 'text/xml');
  res.send(twiml);

  console.log(`[voice] Inbound call from ${req.body.From}, routing to WebSocket bridge`);
});

/**
 * POST /api/voice/status
 * Twilio calls this with call lifecycle events.
 */
router.post('/status', (req: Request, res: Response) => {
  const { CallSid, CallStatus, From } = req.body;
  console.log(`[voice] Status update — CallSid: ${CallSid}, Status: ${CallStatus}, From: ${From}`);
  res.sendStatus(204);
});

export default router;
