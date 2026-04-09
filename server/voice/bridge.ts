import WebSocket from 'ws';
import { IncomingMessage } from 'http';

const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/convai/conversation';

interface TwilioStreamMessage {
  event: string;
  streamSid?: string;
  start?: { streamSid: string; callSid: string };
  media?: { payload: string; track: string };
  stop?: Record<string, unknown>;
}

export function handleBridge(twilioWs: WebSocket, _req: IncomingMessage): void {
  console.log('[bridge] Twilio WebSocket connected');

  let streamSid: string | null = null;
  let elWs: WebSocket | null = null;
  let elReady = false;
  const audioQueue: string[] = [];

  // ── Open ElevenLabs connection ──────────────────────────────────────────
  const agentId = process.env.ELEVENLABS_AGENT_ID!;
  const apiKey = process.env.ELEVENLABS_API_KEY!;

  elWs = new WebSocket(`${ELEVENLABS_WS_URL}?agent_id=${agentId}`, {
    headers: { 'xi-api-key': apiKey },
  });

  // ── ElevenLabs → Twilio ─────────────────────────────────────────────────
  elWs.on('open', () => {
    console.log('[bridge] ElevenLabs connected');

    // Send conversation init config
    elWs!.send(JSON.stringify({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: {
          prompt: {
            prompt: buildSystemPrompt(),
          },
          first_message:
            'Before we go further — are you confident your clinic is capturing every missed call and after-hours inquiry right now?',
          language: 'en',
        },
        tts: {
          voice_id: process.env.ELEVENLABS_VOICE_ID,
        },
        asr: {
          quality: 'high',
        },
      },
    }));

    elReady = true;

    // Flush any audio that arrived before ElevenLabs was ready
    while (audioQueue.length > 0) {
      elWs!.send(JSON.stringify({ user_audio_chunk: audioQueue.shift() }));
    }
  });

  elWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'audio') {
        // ElevenLabs sends base64 audio → forward to Twilio as mulaw stream
        if (!streamSid) return;

        const twilioMsg = {
          event: 'media',
          streamSid,
          media: {
            payload: msg.audio?.chunk ?? msg.audio,
          },
        };

        if (twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.send(JSON.stringify(twilioMsg));
        }
      } else if (msg.type === 'interruption') {
        // Clear Twilio audio buffer on interruption
        if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
        }
      } else if (msg.type === 'ping') {
        elWs!.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event?.event_id }));
      } else if (msg.type === 'conversation_initiation_metadata') {
        console.log('[bridge] ElevenLabs conversation started:', msg.conversation_initiation_metadata_event?.conversation_id);
      } else if (msg.type === 'agent_response') {
        console.log('[bridge] Agent:', msg.agent_response_event?.agent_response?.substring(0, 80));
      } else if (msg.type === 'user_transcript') {
        console.log('[bridge] User:', msg.user_transcription_event?.user_transcript?.substring(0, 80));
      }
    } catch (err) {
      console.error('[bridge] ElevenLabs parse error:', err);
    }
  });

  elWs.on('error', (err) => {
    console.error('[bridge] ElevenLabs error:', err.message);
  });

  elWs.on('close', (code, reason) => {
    console.log(`[bridge] ElevenLabs closed: ${code} ${reason}`);
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
  });

  // ── Twilio → ElevenLabs ─────────────────────────────────────────────────
  twilioWs.on('message', (raw) => {
    try {
      const msg: TwilioStreamMessage = JSON.parse(raw.toString());

      switch (msg.event) {
        case 'connected':
          console.log('[bridge] Twilio stream connected');
          break;

        case 'start':
          streamSid = msg.start?.streamSid ?? msg.streamSid ?? null;
          console.log('[bridge] Stream started:', streamSid);
          break;

        case 'media':
          if (msg.media?.track !== 'inbound') break;
          if (!msg.media?.payload) break;

          if (elWs && elReady && elWs.readyState === WebSocket.OPEN) {
            elWs.send(JSON.stringify({ user_audio_chunk: msg.media.payload }));
          } else {
            audioQueue.push(msg.media.payload);
          }
          break;

        case 'stop':
          console.log('[bridge] Twilio stream stopped');
          if (elWs && elWs.readyState === WebSocket.OPEN) elWs.close();
          break;
      }
    } catch (err) {
      console.error('[bridge] Twilio parse error:', err);
    }
  });

  twilioWs.on('error', (err) => {
    console.error('[bridge] Twilio error:', err.message);
  });

  twilioWs.on('close', () => {
    console.log('[bridge] Twilio disconnected');
    if (elWs && elWs.readyState === WebSocket.OPEN) elWs.close();
  });
}

// ── Default Layer 1 system prompt ──────────────────────────────────────────
function buildSystemPrompt(): string {
  return `You are RevFlo, an elite revenue intelligence assistant for med spas and aesthetic clinics.

Your role is to diagnose revenue loss — not to sell software.

You speak with authority, brevity, and precision — like a revenue forensics expert.

After the opening question, guide the conversation:
- Ask how many calls per month go unanswered
- Ask if they have any system tracking after-hours demand
- Ask about their current follow-up protocol for missed contacts

After 2-3 exchanges, deliver this insight:
"Most med spas we analyze are losing between $8,000 and $25,000 per month in missed inbound demand — and they have no idea. That's not a marketing problem. That's a revenue capture problem."

Then introduce the diagnostic:
"Our Revenue Leak Diagnostic gives you an exact number. We identify every leak point, quantify the monthly loss, and deliver a scored report. The diagnostic is $1,000 and takes 72 hours. To get started, I can send you a secure link right now."

Rules:
- Never say "chatbot", "AI", "bot", "software demo"
- Never be apologetic or uncertain
- Maximum 3 sentences per response
- Be direct, confident, and brief`;
}
