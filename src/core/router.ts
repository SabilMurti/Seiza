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
    this.apiKey = options?.apiKey || process.env.NINE_ROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
    this.baseUrl = options?.baseUrl || "https://api.9router.com/v1";

    if (!this.apiKey) {
      console.warn("NineRouterClient: API key is not set. Requests may fail.");
    }
  }

  public getTotalTokensUsed(): number {
    return this.totalTokensUsed;
  }

  public async createChatCompletion(request: ChatCompletionRequest): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
    };

    const isStreaming = request.stream === true;
    
    // Fallback model if not provided
    if (!request.model) {
      request.model = "9router/ag/gemini-3.1-flash-lite";
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`9Router API error (${response.status}): ${errorText}`);
    }

    if (isStreaming) {
      if (!response.body) {
         throw new Error("Response body is null, cannot stream");
      }
      return this.handleStream(response.body);
    } else {
      const data = await response.json() as { 
        choices: Array<{ message: { content: string } }>;
        usage?: { total_tokens: number };
      };
      
      if (data.usage?.total_tokens) {
        this.totalTokensUsed += data.usage.total_tokens;
      } else {
        // Estimate tokens
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
