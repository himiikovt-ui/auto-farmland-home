const fs = require("fs");
const path = require("path");
const OpenAI = require("openai").default;
const { toFile } = require("openai");

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function composePrompt(prompt, negativePrompt) {
  const avoidance = String(negativePrompt || "").trim();
  if (!avoidance) return String(prompt || "").trim();
  return `${String(prompt || "").trim()}\n\nAvoid: ${avoidance}.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error) {
  return error?.status === 429 || /rate limit/i.test(String(error?.message || ""));
}

// Read how long to wait from a 429 — prefer the Retry-After header, then the
// "Please try again in 24s" / "in 900ms" hint OpenAI puts in the message.
function parseRetryDelayMs(error) {
  const header =
    error?.headers?.["retry-after"] ||
    (typeof error?.response?.headers?.get === "function" && error.response.headers.get("retry-after"));
  if (header && !Number.isNaN(Number(header))) {
    return Number(header) * 1000;
  }
  const match = String(error?.message || "").match(/try again in\s+([\d.]+)\s*(ms|s)?/i);
  if (match) {
    const value = Number(match[1]);
    return match[2] === "ms" ? value : value * 1000;
  }
  return 0;
}

class ImageProvider {
  constructor(name, assetsDirectory) {
    this.name = name;
    this.assetsDirectory = assetsDirectory;
  }

  isConfigured() {
    return true;
  }

  estimateCost() {
    return null;
  }

  normalizeResult(providerResponse) {
    return providerResponse;
  }

  saveProviderRun(metadata) {
    return metadata;
  }

  async editImage(input) {
    return this.generateImageBatch({ ...input, batchSize: 1 });
  }
}

class OpenAIImageProvider extends ImageProvider {
  constructor(assetsDirectory, options = {}) {
    super("openai", assetsDirectory);
    this.apiKey = options.apiKey || "";
    this.defaultModel = options.model || "gpt-image-2";
    this.client = this.apiKey ? new OpenAI({ apiKey: this.apiKey }) : null;
  }

  isConfigured() {
    return Boolean(this.client);
  }

  async checkConnection() {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is missing from .env.local.");
    }
    const model = await this.client.models.retrieve(this.defaultModel);
    return { ok: true, model: model.id };
  }

  // Run an OpenAI call, riding out short rate limits automatically. Waits the
  // delay OpenAI suggests (capped), retries a bounded number of times, then
  // surfaces a clear, actionable message instead of the raw 429 dump.
  async callWithRateLimitRetry(run, { maxRetries = 2, maxWaitMs = 30000 } = {}) {
    let attempt = 0;
    for (;;) {
      try {
        return await run();
      } catch (error) {
        if (!isRateLimitError(error) || attempt >= maxRetries) {
          if (isRateLimitError(error)) {
            const seconds = Math.max(1, Math.ceil((parseRetryDelayMs(error) || 20000) / 1000));
            const friendly = new Error(
              `OpenAI rate limit reached for ${this.defaultModel}. Your plan allows only a few reference (input) images per minute — this batch asked for more than the per-minute allowance. Wait ~${seconds}s and try again, or use fewer reference images / a smaller batch size. Raising your OpenAI usage tier lifts this limit.`
            );
            friendly.status = 429;
            friendly.retryAfterSeconds = seconds;
            throw friendly;
          }
          throw error;
        }
        attempt += 1;
        const waitMs = Math.min(parseRetryDelayMs(error) || 5000, maxWaitMs);
        await sleep(waitMs);
      }
    }
  }

  async generateImageBatch(input) {
    if (!this.client) {
      throw new Error(
        "OpenAI is not configured. Add OPENAI_API_KEY to .env.local and restart the backend."
      );
    }

    const count = Math.max(1, Math.min(Number(input.batchSize || 1), 10));
    const targetDirectory = path.join(this.assetsDirectory, input.cropId, input.batchId);
    fs.mkdirSync(targetDirectory, { recursive: true });

    const model = input.model && !String(input.model).startsWith("mock")
      ? input.model
      : this.defaultModel;
    const request = {
      model,
      prompt: composePrompt(input.prompt, input.negativePrompt),
      n: count,
      size: input.dimensions || "1024x1536",
      quality: input.quality || "medium",
      output_format: "png",
    };
    const referenceFilePaths = (input.referenceFilePaths || []).filter(
      (filePath) => filePath && fs.existsSync(filePath)
    );

    // Reference files are re-materialized inside the closure so a retry after a
    // rate-limit doesn't reuse an already-consumed stream.
    const runCall = async () => {
      if (referenceFilePaths.length) {
        const imageFiles = await Promise.all(
          referenceFilePaths.map((filePath) =>
            toFile(fs.createReadStream(filePath), path.basename(filePath), {
              type: imageMimeType(filePath),
            })
          )
        );
        return this.client.images.edit({ ...request, image: imageFiles });
      }
      return this.client.images.generate(request);
    };

    const response = await this.callWithRateLimitRetry(runCall);

    if (!response.data?.length) {
      throw new Error("OpenAI completed the request without returning image data.");
    }

    return response.data.map((item, index) => {
      if (!item.b64_json) {
        throw new Error("OpenAI returned an image result without base64 image data.");
      }
      const fileName = `openai-${Date.now()}-${index + 1}.png`;
      const filePath = path.join(targetDirectory, fileName);
      fs.writeFileSync(filePath, Buffer.from(item.b64_json, "base64"));
      return {
        fileName,
        filePath,
        publicUrl: `/assets/${input.cropId}/${input.batchId}/${fileName}`,
        seed: null,
        status: "review",
        providerRequestId: response._request_id || "",
        revisedPrompt: item.revised_prompt || "",
        usage: response.usage || null,
        referenceCount: referenceFilePaths.length,
      };
    });
  }
}

class MockImageProvider extends ImageProvider {
  estimateCost(input) {
    return Number((0.01 * Number(input.batchSize || 1)).toFixed(2));
  }

  async generateImageBatch(input) {
    const count = Math.max(1, Math.min(Number(input.batchSize || 1), 12));
    const targetDirectory = path.join(this.assetsDirectory, input.cropId, input.batchId);
    fs.mkdirSync(targetDirectory, { recursive: true });
    const palette = [
      ["#dfe8cf", "#6d8750"],
      ["#f2dfc0", "#b66f45"],
      ["#dce9e8", "#487b78"],
      ["#eadde4", "#986577"],
    ];

    return Array.from({ length: count }, (_, index) => {
      const [background, accent] = palette[index % palette.length];
      const fileName = `mock-${index + 1}.svg`;
      const filePath = path.join(targetDirectory, fileName);
      const promptLabel = escapeXml(String(input.prompt || "Untitled crop").slice(0, 62));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" rx="48" fill="${background}"/>
  <circle cx="600" cy="460" r="260" fill="${accent}" opacity=".16"/>
  <path d="M600 680V370M600 500c-90-120-210-126-270-118 20 142 112 218 270 198M600 455c80-112 190-126 260-112-28 132-116 194-260 176" fill="none" stroke="${accent}" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="600" y="850" text-anchor="middle" font-family="Georgia,serif" font-size="44" fill="#34402c">${promptLabel}</text>
  <text x="600" y="915" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" fill="#5e6856">Local mock · seed ${index + 1}</text>
</svg>`;
      fs.writeFileSync(filePath, svg);
      return {
        fileName,
        filePath,
        publicUrl: `/assets/${input.cropId}/${input.batchId}/${fileName}`,
        seed: index + 1,
        status: "review",
        providerRequestId: "local-mock",
        referenceCount: (input.referenceFilePaths || []).length,
      };
    });
  }
}

class ManualImageProvider extends ImageProvider {
  async generateImageBatch() {
    return [];
  }
}

function createImageProviderRegistry(assetsDirectory, options = {}) {
  return {
    openai: new OpenAIImageProvider(assetsDirectory, options.openai),
    mock: new MockImageProvider("mock", assetsDirectory),
    gemini: new MockImageProvider("gemini", assetsDirectory),
    manual: new ManualImageProvider("manual", assetsDirectory),
  };
}

module.exports = {
  ImageProvider,
  createImageProviderRegistry,
};
