/**
 * @fileoverview A2UI Message Parser
 *
 * Handles parsing of incoming JSON streams, including partial chunks
 * that may arrive during SSE streaming.
 */

import type { A2UIMessage, DownstreamMessage } from './protocol.js';

/**
 * Result of a parse operation.
 */
export interface ParseResult<T = A2UIMessage> {
  /** Successfully parsed messages */
  messages: T[];
  /** Any remaining unparsed buffer (incomplete JSON) */
  remainder: string;
  /** Parse errors encountered */
  errors: ParseError[];
}

/**
 * Error encountered during parsing.
 */
export interface ParseError {
  /** The raw input that failed to parse */
  input: string;
  /** Error message */
  message: string;
  /** Position in the stream where the error occurred */
  position?: number;
}

/**
 * Parser configuration options.
 */
export interface ParserOptions {
  /** Maximum buffer size before forcing a flush (default: 1MB) */
  maxBufferSize?: number;
  /** Whether to throw on parse errors (default: false, collects errors) */
  throwOnError?: boolean;
}

const DEFAULT_OPTIONS: Required<ParserOptions> = {
  maxBufferSize: 1024 * 1024, // 1MB
  throwOnError: false,
};

/**
 * Streaming JSON parser for A2UI messages.
 *
 * Handles incomplete JSON chunks that arrive during SSE streaming
 * and buffers partial data until complete messages can be parsed.
 */
export class A2UIParser {
  private buffer = '';
  private options: Required<ParserOptions>;

  constructor(options: ParserOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Parse a chunk of data, potentially containing multiple messages
   * or partial JSON.
   */
  parse(chunk: string): ParseResult<DownstreamMessage> {
    this.buffer += chunk;

    // Check buffer size limit
    if (this.buffer.length > this.options.maxBufferSize) {
      const error: ParseError = {
        input: this.buffer.substring(0, 100) + '...',
        message: `Buffer size exceeded maximum of ${this.options.maxBufferSize} bytes`,
      };
      this.buffer = '';
      if (this.options.throwOnError) {
        throw new Error(error.message);
      }
      return { messages: [], remainder: '', errors: [error] };
    }

    const messages: DownstreamMessage[] = [];
    const errors: ParseError[] = [];

    // Try to extract complete JSON objects
    let searchStart = 0;

    while (searchStart < this.buffer.length) {
      // Find the start of a JSON object
      const objStart = this.buffer.indexOf('{', searchStart);
      if (objStart === -1) {
        // No more objects, keep remainder
        this.buffer = '';
        break;
      }

      // Try to find the matching closing brace
      const result = this.findMatchingBrace(this.buffer, objStart);

      if (result.complete) {
        const jsonStr = this.buffer.substring(objStart, result.endIndex + 1);

        try {
          const parsed = JSON.parse(jsonStr) as DownstreamMessage;
          messages.push(parsed);
        } catch (e) {
          const error: ParseError = {
            input: jsonStr.substring(0, 100),
            message: e instanceof Error ? e.message : 'Unknown parse error',
            position: objStart,
          };
          if (this.options.throwOnError) {
            throw new Error(error.message);
          }
          errors.push(error);
        }

        searchStart = result.endIndex + 1;
        // Update buffer to remove processed content
        this.buffer = this.buffer.substring(result.endIndex + 1);
        searchStart = 0; // Reset since we modified the buffer
      } else {
        // Incomplete JSON, keep in buffer
        this.buffer = this.buffer.substring(objStart);
        break;
      }
    }

    return {
      messages,
      remainder: this.buffer,
      errors,
    };
  }

  /**
   * Find the matching closing brace for a JSON object.
   */
  private findMatchingBrace(
    str: string,
    start: number
  ): { complete: boolean; endIndex: number } {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < str.length; i++) {
      const char = str[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          return { complete: true, endIndex: i };
        }
      }
    }

    return { complete: false, endIndex: -1 };
  }

  /**
   * Reset the parser buffer.
   */
  reset(): void {
    this.buffer = '';
  }

  /**
   * Get the current buffer content.
   */
  getBuffer(): string {
    return this.buffer;
  }
}

/**
 * Parse a single complete JSON message.
 * Use this for non-streaming scenarios.
 */
export function parseMessage(json: string): A2UIMessage {
  return JSON.parse(json) as A2UIMessage;
}

/**
 * Serialize a message to JSON string.
 */
export function serializeMessage(message: A2UIMessage): string {
  return JSON.stringify(message);
}
