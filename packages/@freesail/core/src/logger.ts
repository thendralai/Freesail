
/**
 * A standard Logger interface compatible with common logging libraries like Pino.
 */
export interface Logger {
  /**
   * Log at 'fatal' level.
   */
  fatal: LogFn;
  /**
    * Log at 'error' level.
    */
  error: LogFn;
  /**
    * Log at 'warn' level.
    */
  warn: LogFn;
  /**
    * Log at 'info' level.
    */
  info: LogFn;
  /**
    * Log at 'debug' level.
    */
  debug: LogFn;
  /**
    * Create a child logger with the given bindings.
    */
  child(bindings: Record<string, any>): Logger;
}

/**
 * Valid function signatures for logging methods.
 */
export interface LogFn {
  (msg: string, ...args: any[]): void;
  (obj: object, msg?: string, ...args: any[]): void;
}
