export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface NineRouterClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

export class NineRouterClient {
  private apiKey: string;
  private baseUrl: string;
  private totalTokensUsed: number = 0;

  constructor(options?: NineRouterClientOptions) {
    this.baseUrl = (options?.baseUrl && options.baseUrl.trim().length > 0)
      ? options.baseUrl
      : (process.env.NINE_ROUTER_BASE_URL || "http://localhost:20128/v1");
    this.apiKey = (options?.apiKey && options.apiKey.trim().length > 0)
      ? options.apiKey
      : (process.env.NINE_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "free");
  }

  public async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { "Authorization": `Bearer ${this.apiKey}` }
      });
      if (res.ok) {
        const data = await res.json() as { data: Array<{ id: string }> };
        if (Array.isArray(data?.data)) {
          return data.data.map(m => m.id);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch models from 9router daemon: ${err instanceof Error ? err.message : String(err)}`);
    }
    return [];
  }

  public async createChatCompletion(request: ChatCompletionRequest, retryCount: number = 0): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
    };

    const isStreaming = request.stream === true;
    
    // Dynamic fallback model if not provided
    if (!request.model || request.model.trim().length === 0) {
      const available = await this.listModels();
      request.model = available[0] || "ag/gemini-3-flash";
    }

    // Clean model name for 9Router daemon (strip 9router/ prefix if present)
    if (request.model.startsWith("9router/")) {
      request.model = request.model.slice(8);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

    try {
      if (isStreaming) {
        let response: Response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
            signal: controller.signal
          });
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }

        if (!response.ok) {
          clearTimeout(timeoutId);
          const errorText = await response.text();
          // Fallback to alternative model if 404, 429, or 5xx occurs
          if (([404, 429, 500, 502, 503, 504].includes(response.status)) && retryCount < 3) {
            let models: string[] = [];
            try {
              models = await this.listModels();
            } catch {
              models = ["ag/gemini-3-flash", "ag/gemini-3.1-pro-low", "ag/claude-sonnet-4-6"];
            }
            const nextModel = models.find(m => m !== request.model && !m.includes(request.model)) || models[0];
            if (nextModel && nextModel !== request.model) {
              console.error(`[NineRouterClient] Model '${request.model}' returned HTTP ${response.status}. Retrying with fallback '${nextModel}' (attempt ${retryCount + 1}/3)...`);
              await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
              return this.createChatCompletion({ ...request, model: nextModel }, retryCount + 1);
            }
          }
          throw new Error(`9Router API error (${response.status}): ${errorText}`);
        }

        if (!response.body) {
          clearTimeout(timeoutId);
          throw new Error("Response body is null, cannot stream");
        }
        const result = await this.handleStream(response.body);
        clearTimeout(timeoutId);
        return result;
      } else {
        let response: Response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
            signal: controller.signal
          });
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          if (([404, 429, 500, 502, 503, 504].includes(response.status)) && retryCount < 3) {
            let models: string[] = [];
            try {
              models = await this.listModels();
            } catch {
              models = ["ag/gemini-3-flash", "ag/gemini-3.1-pro-low", "ag/claude-sonnet-4-6"];
            }
            const nextModel = models.find(m => m !== request.model && !m.includes(request.model)) || models[0];
            if (nextModel && nextModel !== request.model) {
              console.error(`[NineRouterClient] Model '${request.model}' returned HTTP ${response.status}. Retrying with fallback '${nextModel}' (attempt ${retryCount + 1}/3)...`);
              await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
              return this.createChatCompletion({ ...request, model: nextModel }, retryCount + 1);
            }
          }
          throw new Error(`9Router API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as { 
          choices: Array<{ message: { content: string } }>;
          usage?: { total_tokens: number };
        };
        
        if (data.usage?.total_tokens) {
          this.totalTokensUsed += data.usage.total_tokens;
        } else {
          const estimated = JSON.stringify(request.messages).length / 4 + (data.choices[0]?.message?.content?.length || 0) / 4;
          this.totalTokensUsed += Math.ceil(estimated);
        }
        
        return data.choices[0]?.message?.content || "";
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`9Router API request timed out after 120s for model '${request.model}'`);
      }
      throw err;
    }
  }

  private async handleStream(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullContent = "";
    let buffer = "";
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // retain incomplete line chunk for next read
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (!trimmed.startsWith("data: ")) {
            // Fallback: Check if this is a complete JSON completion object (non-SSE or malformed stream)
            try {
              const obj = JSON.parse(trimmed);
              const content = obj.choices?.[0]?.message?.content || obj.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                process.stderr.write(content);
              }
              if (obj.usage?.total_tokens) {
                this.totalTokensUsed += obj.usage.total_tokens;
              }
            } catch (e) {
              // Ignore parse errors
            }
            continue;
          }

          const dataStr = trimmed.replace("data: ", "").trim();
          if (dataStr === "[DONE]") continue;
          
          try {
            const chunk = JSON.parse(dataStr) as ChatCompletionChunk;
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              fullContent += content;
              process.stderr.write(content);
            }
            if (chunk.usage?.total_tokens) {
               this.totalTokensUsed += chunk.usage.total_tokens;
            }
          } catch (e) {
            // Ignore parse errors on partial JSON chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    // Print newline after stream completes
    process.stderr.write("\n");
    
    // Estimate tokens if usage was not provided in stream
    if (this.totalTokensUsed === 0 && fullContent.length > 0) {
        this.totalTokensUsed += Math.ceil(fullContent.length / 4);
    }

    return fullContent;
  }
}
