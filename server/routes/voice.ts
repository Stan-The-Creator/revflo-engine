import express from "express";

const router = express.Router();

router.post("/", (req, res) => {
  const publicUrl = process.env.PUBLIC_URL;

  if (!publicUrl) {
    return res.status(500).send("Missing PUBLIC_URL");
  }

  const twiml = `
<Response>
  <Connect>
    <Stream url="wss://${publicUrl.replace("https://", "")}/ws" />
  </Connect>
</Response>
  `;

  res.type("text/xml");
  res.send(twiml);
});

export default router;
