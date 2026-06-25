import express from "express";
import multer from "multer";
import { detectIntent, enhanceImage, generateAgentReply, generateImage, processAttachment } from "../lib/agent.js";

const router = express.Router();
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

router.post("/chat", async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "Prompt is required" });

    const reply = await generateAgentReply(prompt);
    const type = detectIntent(prompt);

    res.json({ reply, type });
  } catch (error) {
    next(error);
  }
});

router.post("/image", upload.single("image"), async (req, res, next) => {
  try {
    const { prompt = "", mode = "generate" } = req.body;

    if (mode === "generate" && !prompt) {
      return res.status(400).json({ message: "Prompt is required for image generation" });
    }

    const imageUrl =
      mode === "enhance"
        ? await enhanceImage({ prompt, filePath: req.file?.path, mimeType: req.file?.mimetype })
        : await generateImage({ prompt });

    res.json({ imageUrl, mode });
  } catch (error) {
    next(error);
  }
});

router.post("/attachment", upload.single("file"), async (req, res, next) => {
  try {
    const { prompt = "" } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Attach a document, image, PDF, or video file." });
    }

    const result = await processAttachment({
      prompt,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
