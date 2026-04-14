import { Router } from "express";

const router = Router();

router.post("/api/voice", (req, res) => {
  try {
    console.log("📞 Incoming Twilio webhook");
    console.log("BODY:", req.body);

    const from = req.body?.From || "unknown";
    const to = req.body?.To || "unknown";

    console.log("CALL FROM:", from);
    console.log("CALL TO:", to);

    const response = `
<Response>
  <Say voice="alice">
    Thanks for calling RevFlo. Please hold while we connect you.
  </Say>
</Response>
`;

    res.set("Content-Type", "text/xml");
    res.send(response);

  } catch (error) {
    console.error("❌ ERROR IN /api/voice:", error);

    res.set("Content-Type", "text/xml");
    res.send(`
<Response>
  <Say voice="alice">
    Sorry, we are experiencing technical difficulties.
  </Say>
</Response>
`);
  }
});

export default router;
