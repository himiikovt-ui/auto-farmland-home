const OpenAI = require("openai").default;

// Vision critique service for the "critique rejects → improve" loop.
//
// This does NOT fine-tune the image model (that isn't possible here). It uses a
// vision-capable chat model to LOOK at rejected images + the prompt + your
// reason, then proposes a better prompt, negative-prompt additions, and durable
// "style learnings" that compound on the crop across rounds.
//
// Honest by design: if the model isn't reachable/available, the error (with
// OpenAI's message) is surfaced — never a faked critique.

const SYSTEM_PROMPT = `You are a meticulous art director for print-on-demand and Etsy product design (stickers, wall art, printables).
You are shown AI-generated images that a human REJECTED, plus the prompt that made them and the human's reason.
Diagnose concretely why they fall short as sellable product art (composition, subject clarity, unwanted text/watermarks, background, palette, style consistency, print-readiness), then propose fixes.

Respond with ONLY a JSON object, no prose outside it, with exactly these keys:
{
  "critique": "2-4 sentence diagnosis of the shared problems in the rejected images",
  "improvedPrompt": "a full rewritten generation prompt that keeps the intent but fixes the problems",
  "negativePromptAdditions": ["short", "things", "to", "avoid"],
  "styleLearnings": ["3-6 short imperative guidance rules that should hold for FUTURE images in this product line"]
}
Keep styleLearnings general and reusable (not about one specific image). Keep each string short.`;

function extractJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Tolerate code fences or leading prose: grab the first {...} block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("The critique model did not return valid JSON.");
  }
}

function toStringArray(value, cap) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .slice(0, cap);
}

class ImageCritic {
  constructor(options = {}) {
    this.apiKey = options.apiKey || "";
    this.model = options.model || "gpt-4.1-mini";
    this.client = this.apiKey ? new OpenAI({ apiKey: this.apiKey }) : null;
  }

  isConfigured() {
    return Boolean(this.client);
  }

  // rejected: [{ fileName, dataUrl }] — raster images only. May be empty, in
  // which case the critique is text-only (prompt + reason), still useful.
  async critique({ rejected = [], prompt = "", negativePrompt = "", reason = "", existingLearnings = [] }) {
    if (!this.client) {
      throw new Error("OpenAI is not configured. Add OPENAI_API_KEY to .env.local to enable critique.");
    }

    const images = rejected.slice(0, 4);
    const contextLines = [
      `Original prompt: ${prompt || "(none provided)"}`,
      negativePrompt ? `Original negative prompt: ${negativePrompt}` : null,
      reason ? `Human's rejection reason: ${reason}` : "Human rejected these without a written reason; infer the likely problems.",
      existingLearnings.length
        ? `Style rules already learned for this product line (respect and refine, don't contradict):\n- ${existingLearnings.join("\n- ")}`
        : null,
      images.length
        ? `There are ${images.length} rejected image(s) attached.`
        : "No image files are available (they may be vector/mock); critique from the prompt and reason alone and say so briefly in the critique.",
    ].filter(Boolean);

    const userContent = [{ type: "text", text: contextLines.join("\n\n") }];
    images.forEach((image) => {
      userContent.push({ type: "image_url", image_url: { url: image.dataUrl } });
    });

    let response;
    try {
      // Minimal params for broad model compatibility (gpt-4.1 + gpt-5 families).
      response = await this.client.chat.completions.create({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      });
    } catch (error) {
      const detail = error?.message || "unknown error";
      const hint = /model|not found|does not exist|unsupported/i.test(detail)
        ? ` The critique model "${this.model}" may be unavailable — set OPENAI_CRITIQUE_MODEL in .env.local to a vision model you have (e.g. gpt-4.1-mini, gpt-4o, gpt-5-mini).`
        : "";
      const wrapped = new Error(`Critique failed: ${detail}.${hint}`);
      wrapped.status = error?.status;
      throw wrapped;
    }

    const content = response.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);

    return {
      model: this.model,
      usedImages: images.length,
      critique: String(parsed.critique || "").trim() || "No critique text returned.",
      improvedPrompt: String(parsed.improvedPrompt || "").trim(),
      negativePromptAdditions: toStringArray(parsed.negativePromptAdditions, 12),
      styleLearnings: toStringArray(parsed.styleLearnings, 8),
      usage: response.usage || null,
    };
  }
}

function createImageCritic(options = {}) {
  return new ImageCritic(options);
}

module.exports = { createImageCritic, ImageCritic };
