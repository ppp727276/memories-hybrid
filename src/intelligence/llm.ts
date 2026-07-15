import type { CapricornConfig } from "../types.ts";

export interface LLMMessage {
  role: "system" | "user";
  content: string;
}

export interface LLMRunner {
  complete(prompt: string, system?: string): Promise<string>;
  enabled(): boolean;
}

export class OpenAILLMRunner implements LLMRunner {
  private baseUrl: string;
  private apiKey: string | undefined;
  private model: string;
  private timeout: number;

  constructor(config: CapricornConfig) {
    this.baseUrl = process.env.CAPRICORN_LLM_BASE_URL ?? "http://localhost:20128/v1";
    this.apiKey = process.env.CAPRICORN_LLM_API_KEY ?? "capricorn";
    this.model = config.intelligence.forge.llm_model;
    this.timeout = 120_000;
  }

  enabled(): boolean {
    return true;
  }

  async complete(prompt: string, system?: string): Promise<string> {
    const messages: LLMMessage[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      throw new Error(`LLM API error: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content?.trim() ?? "";
  }
}

export class StubLLMRunner implements LLMRunner {
  enabled(): boolean {
    return false;
  }

  async complete(): Promise<string> {
    throw new Error("LLM runner disabled; set CAPRICORN_LLM_BASE_URL or configure intelligence.forge.llm_provider");
  }
}

export function createLLMRunner(config: CapricornConfig): LLMRunner {
  if (process.env.CAPRICORN_LLM_BASE_URL || config.intelligence.forge.llm_provider !== "none") {
    return new OpenAILLMRunner(config);
  }
  return new StubLLMRunner();
}
