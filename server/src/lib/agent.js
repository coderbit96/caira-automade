import "dotenv/config";
import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";

const client = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const systemInstruction = `You are Caira Automade, a helpful AI agent inside a MERN web app.
You can help with task planning, project and file summaries, image prompts, image enhancement ideas,
and simple code generation. Be direct, useful, and adapt suggestions to the user's current situation.`;

export function detectIntent(prompt = "") {
  const text = prompt.toLowerCase();

  if (text.includes("code") || text.includes("component") || text.includes("api") || text.includes("function")) {
    return "code";
  }

  if (text.includes("summary") || text.includes("summarize") || text.includes("project") || text.includes("file")) {
    return "summary";
  }

  return "chat";
}

export async function generateAgentReply(prompt) {
  if (client) {
    const models = modelList(process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash", process.env.GEMINI_TEXT_FALLBACK_MODELS || "gemini-3.1-flash-lite,gemini-3.5-flash");
    const interaction = await runGeminiWithFallback(models, (model) =>
      client.interactions.create({
        model,
        input: `${systemInstruction}\n\nUser request:\n${prompt}`
      })
    );

    return interaction.output_text || "I completed the request, but Gemini returned no text output.";
  }

  return demoReply(prompt);
}

export async function generateImage({ prompt }) {
  if (client) {
    try {
      const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
      const response = await runGeminiRequest(
        () =>
          client.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseFormat: {
                image: {
                  aspectRatio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "1:1"
                }
              }
            }
          }),
        model
      );

      return geminiGenerateContentImageToDataUrl(response);
    } catch (error) {
      if (canUseRealImageFallback(error)) {
        return generatePollinationsImage(prompt);
      }

      throw error;
    }
  }

  return generatePollinationsImage(prompt);
}

export async function enhanceImage({ prompt, filePath, mimeType = "image/png" }) {
  if (client && filePath) {
    const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
    const imageBuffer = fs.readFileSync(filePath);
    const response = await runGeminiRequest(
      () =>
        client.models.generateContent({
          model,
          contents: [
            {
              text: prompt || "Enhance this image with cleaner detail, better lighting, and a polished final look."
            },
            {
              inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType
              }
            }
          ],
          config: {
            responseFormat: {
              image: {
                aspectRatio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "1:1"
              }
            }
          }
        }),
      model
    );

    return geminiGenerateContentImageToDataUrl(response);
  }

  throw new Error("Upload an image and configure GEMINI_API_KEY in server/.env to enhance real images.");
}

export async function processAttachment({ prompt, filePath, mimeType, originalName }) {
  if (!client || !filePath) {
    throw new Error("Gemini API key and an attached file are required.");
  }

  if (mimeType?.startsWith("image/") && shouldReturnEditedImage(prompt)) {
    const imageUrl = await enhanceImage({
      prompt: prompt || "Edit and improve this image while preserving the main subject.",
      filePath,
      mimeType
    });

    return {
      type: "image",
      reply: "Edited image ready.",
      imageUrl
    };
  }

  const models = modelList(process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash", process.env.GEMINI_TEXT_FALLBACK_MODELS || "gemini-3.1-flash-lite,gemini-3.5-flash");
  const fileBuffer = fs.readFileSync(filePath);
  const instruction = `${systemInstruction}

The user attached a file named "${originalName || "attachment"}" with MIME type "${mimeType || "unknown"}".
Use the file content to complete the user's editing request. For documents/PDFs, rewrite, summarize, improve, extract, or transform the content as requested. For videos, provide precise edit decisions, captions, cuts, scene notes, or improvement instructions based on what you can inspect.

User request:
${prompt || "Review this attachment and suggest useful edits."}`;

  const response = await runGeminiWithFallback(models, (model) =>
    client.models.generateContent({
      model,
      contents: [
        { text: instruction },
        {
          inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType: mimeType || "application/octet-stream"
          }
        }
      ]
    })
  );

  return {
    type: "text",
    reply: response.text || "I reviewed the attachment, but Gemini returned no text output."
  };
}

function geminiGenerateContentImageToDataUrl(response) {
  const inlinePart = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
  const data = response.data || inlinePart?.inlineData?.data;
  const mimeType = inlinePart?.inlineData?.mimeType || inlinePart?.inlineData?.mime_type || "image/png";

  if (!data) {
    throw new Error("Gemini returned no image output. Try a more specific image prompt.");
  }

  return `data:${mimeType};base64,${data}`;
}

async function runGeminiWithFallback(models, requestForModel) {
  let lastError;

  for (const model of models) {
    try {
      return await runGeminiRequest(() => requestForModel(model), model);
    } catch (error) {
      lastError = error;
      if (!isTemporaryGeminiError(error.message)) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function runGeminiRequest(request, model = "Gemini") {
  try {
    return await request();
  } catch (error) {
    const message = error?.message || "Gemini request failed.";

    if (message.includes("429") || message.toLowerCase().includes("quota")) {
      throw new Error("Gemini quota is exhausted for this API key. Add billing/quota in Google AI Studio or use another Gemini key.");
    }

    if (message.includes("401") || message.includes("403") || message.toLowerCase().includes("api key")) {
      throw new Error("Gemini API key was rejected. Check server/.env and make sure the key is active.");
    }

    if (isTemporaryGeminiError(message)) {
      throw new Error(`${model} is temporarily overloaded. Caira tried fallback models where available. Please try again in a moment.`);
    }

    throw new Error(`Gemini request failed: ${message}`);
  }
}

function modelList(primary, fallbackCsv) {
  return [primary, ...fallbackCsv.split(",")]
    .map((model) => model.trim())
    .filter(Boolean)
    .filter((model, index, models) => models.indexOf(model) === index);
}

function isTemporaryGeminiError(message = "") {
  const text = message.toLowerCase();
  return text.includes("500") || text.includes("503") || text.includes("overloaded") || text.includes("high demand") || text.includes("try again later");
}

function canUseRealImageFallback(error) {
  if (process.env.REAL_IMAGE_FALLBACK_PROVIDER !== "pollinations") {
    return false;
  }

  const message = error?.message || "";
  return message.toLowerCase().includes("quota") || isTemporaryGeminiError(message);
}

function shouldReturnEditedImage(prompt = "") {
  const text = prompt.toLowerCase();
  return (
    text.includes("edit") ||
    text.includes("enhance") ||
    text.includes("improve") ||
    text.includes("change") ||
    text.includes("remove") ||
    text.includes("replace") ||
    text.includes("background") ||
    text.includes("color")
  );
}

async function generatePollinationsImage(prompt) {
  const safePrompt = encodeURIComponent(`${prompt}, high quality, detailed`);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const url = `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=1024&model=flux&seed=${seed}&enhance=true`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Real image fallback failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function demoReply(prompt) {
  const intent = detectIntent(prompt);
  const cleanPrompt = prompt.trim() || "your task";

  if (intent === "code") {
    return `Here is a simple starter for: "${cleanPrompt}"\n\n\`\`\`js\nfunction runTask(input) {\n  const result = String(input).trim();\n  return {\n    ok: true,\n    message: \`Completed: \${result}\`\n  };\n}\n\nconsole.log(runTask("Caira Automade"));\n\`\`\`\n\nSuggestion: describe your target language, framework, and expected output for a sharper code draft.`;
  }

  if (intent === "summary") {
    return `Summary mode is ready. For "${cleanPrompt}", I would scan the main files, identify purpose, dependencies, routes/components, risks, and next steps.\n\nCurrent suggestion: paste a file, folder tree, or project notes and I will summarize it in a clean developer-friendly format.`;
  }

  return `I can help complete this task: "${cleanPrompt}".\n\nSuggested next move: break it into goal, input, action, and output. If you want, send the exact files, text, or image idea and I will shape the result accordingly.`;
}
