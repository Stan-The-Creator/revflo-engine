import { Router } from "express";

const router = Router();

// 🔥 IMPORTANT: NO /api/voice HERE
router.post("/", (req, res) => {
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
    Thanks for calling RevFlo. Your call is being processed.
  </Say>
</Response>
`;

    res.set("Content-Type", "text/xml");
    res.send(response);

  } catch (error) {
    console.error("❌ ERROR IN VOICE ROUTE:", error);

    res.set("Content-Type", "text/xml");
    res.send(`
<Response>
  <Say voice="alice">
    Sorry, something went wrong.
  </Say>
</Response>
`);
  }
});

export default router;
