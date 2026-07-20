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

  public async createChatCompletion(request: ChatCompletionRequest): Promise<string> {
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

    if (isStreaming) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`9Router API error (${response.status}): ${errorText}`);
        }

        if (!response.body) {
          throw new Error("Response body is null, cannot stream");
        }
        return await this.handleStream(response.body);
      } catch (err) {
        console.error(`Streaming failed, falling back to non-streaming: ${err instanceof Error ? err.message : String(err)}`);
        
        // Retry with stream: false
        const fallbackRequest = { ...request, stream: false };
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(fallbackRequest),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`9Router API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as { 
          choices: Array<{ message: { content: string } }>;
          usage?: { total_tokens: number };
        };
        
        if (data.usage?.total_tokens) {
          this.totalTokensUsed += data.usage.total_tokens;
        } else {
          const estimated = JSON.stringify(fallbackRequest.messages).length / 4 + (data.choices[0]?.message?.content?.length || 0) / 4;
          this.totalTokensUsed += Math.ceil(estimated);
        }
        
        return data.choices[0]?.message?.content || "";
      }
    } else {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
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
  }

  private async handleStream(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullContent = "";
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split("\n").filter(line => line.trim().startsWith("data: "));
        
        for (const line of lines) {
          const dataStr = line.replace("data: ", "").trim();
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
            // Ignore parse errors on partial chunks
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
