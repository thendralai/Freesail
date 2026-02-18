import * as fs from 'fs';
import * as path from 'path';

// Types
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug';

export interface LogRecord {
  category: string[];
  level: LogLevel;
  message: string[];
  timestamp: number;
  properties: Record<string, any>;
}

export type Sink = (record: LogRecord) => void;
export type Formatter = (record: LogRecord) => string;

// Configuration
interface LoggerConfig {
  sinks: Record<string, Sink>;
  loggers: Array<{
    category: string[];
    sinks?: string[];
    level?: LogLevel;
  }>;
}

let globalConfig: LoggerConfig = {
  sinks: {},
  loggers: [],
};

/**
 * Configure the logger.
 */
export async function configure(config: LoggerConfig & { reset?: boolean }): Promise<void> {
  if (config.reset) {
    globalConfig = { sinks: {}, loggers: [] };
  }
  globalConfig.sinks = { ...globalConfig.sinks, ...config.sinks };
  globalConfig.loggers = [...globalConfig.loggers, ...config.loggers];
}

// Log Level Priority
const LEVELS: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/**
 * Get sinks for a category.
 */
function getSinks(category: string[], level: LogLevel): Sink[] {
  // Find matching logger config
  // For simplicity, we match the most specific category first (longest match)
  const sortedLoggers = [...globalConfig.loggers].sort((a, b) => b.category.length - a.category.length);
  
  const sinks: Sink[] = [];

  for (const loggerCfg of sortedLoggers) {
    // Check if category matches (prefix match)
    const isMatch = loggerCfg.category.length === 0 || 
      (loggerCfg.category.length <= category.length && 
       loggerCfg.category.every((part, i) => part === category[i]));

    if (isMatch) {
      if (loggerCfg.level && LEVELS[level] > LEVELS[loggerCfg.level]) {
        continue;
      }
      
      if (loggerCfg.sinks) {
        for (const sinkName of loggerCfg.sinks) {
            const sink = globalConfig.sinks[sinkName];
            if (sink) sinks.push(sink);
        }
      }
    }
  }

  return sinks;
}

/**
 * Standard Logger interface.
 */
export interface LogFn {
  (msg: string, ...args: any[]): void;
  (obj: object, msg?: string, ...args: any[]): void;
}

export interface Logger {
  fatal: LogFn;
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  child(bindings: Record<string, any>): Logger;
  category: string[];
}

export class NativeLogger implements Logger {
  readonly category: string[];
  readonly context: Record<string, any>;

  constructor(category: string | readonly string[], context: Record<string, any> = {}) {
    this.category = Array.isArray(category) ? [...category] : [category];
    this.context = context;
  }

  private log(level: LogLevel, args: any[]) {
    let msg: string | undefined;
    let obj: Record<string, any> = {};
    let rest: any[] = [];

    if (typeof args[0] === 'string') {
      msg = args[0];
      rest = args.slice(1);
    } else if (typeof args[0] === 'object' && args[0] !== null) {
      obj = args[0];
      if (typeof args[1] === 'string') {
        msg = args[1];
        rest = args.slice(2);
      } else {
        rest = args.slice(1);
      }
    }

    const finalObj = { ...this.context, ...obj };
    const sinks = getSinks(this.category, level);
    
    if (sinks.length > 0) {
      const record: LogRecord = {
        category: this.category,
        level,
        message: [msg || '', ...rest],
        timestamp: Date.now(),
        properties: finalObj,
      };

      for (const sink of sinks) {
        try {
          sink(record);
        } catch (err) {
          console.error('Error in log sink:', err);
        }
      }
    }
  }

  fatal(msgOrObj: string | object, ...args: any[]) { this.log('fatal', [msgOrObj, ...args]); }
  error(msgOrObj: string | object, ...args: any[]) { this.log('error', [msgOrObj, ...args]); }
  warn(msgOrObj: string | object, ...args: any[]) { this.log('warn', [msgOrObj, ...args]); }
  info(msgOrObj: string | object, ...args: any[]) { this.log('info', [msgOrObj, ...args]); }
  debug(msgOrObj: string | object, ...args: any[]) { this.log('debug', [msgOrObj, ...args]); }

  child(bindings: Record<string, any>): Logger {
    return new NativeLogger(this.category, { ...this.context, ...bindings });
  }
}

/**
 * Text formatter.
 */
export function getTextFormatter(options: { colors?: boolean } = { colors: true }): Formatter {
  return (record: LogRecord) => {
    const timestamp = new Date(record.timestamp).toISOString();
    let msg = record.message.map(m => 
      typeof m === 'string' ? m : JSON.stringify(m)
    ).join(' ');
    
    if (Object.keys(record.properties).length > 0) {
      msg += ' ' + JSON.stringify(record.properties);
    }

    const levelStr =  `[${record.level.toUpperCase().slice(0, 3)}]`;
    const catStr = record.category.join('·');

    if (!options.colors) {
      return `${timestamp} ${levelStr} ${catStr}: ${msg}`;
    }

    // ANSI colors equivalent to LogTape default
    const levelColors: Record<LogLevel, string> = {
      fatal: '\x1b[31m', // Red
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[32m',  // Green
      debug: '\x1b[34m', // Blue
    };
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';

    return `${dim}${timestamp}${reset} ${levelColors[record.level]}${levelStr}${reset} ${dim}${catStr}:${reset} ${msg}`;
  };
}

/**
 * Console sink.
 */
export function getConsoleSink(): Sink {
  const formatter = getTextFormatter({ colors: true });
  return (record: LogRecord) => {
    const msg = formatter(record);
    if (record.level === 'error' || record.level === 'fatal') {
      process.stderr.write(msg + '\n');
    } else {
      process.stdout.write(msg + '\n');
    }
  };
}

/**
 * Stream sink.
 */
export function getStreamSink(stream: NodeJS.WritableStream): Sink {
  const formatter = getTextFormatter({ colors: false });
  return (record: LogRecord) => {
    stream.write(formatter(record) + '\n');
  };
}

/**
 * File sink.
 */
export function getFileSink(filePath: string): Sink {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stream = fs.createWriteStream(filePath, { flags: 'a' });
  return getStreamSink(stream);
}

/**
 * Create a logger instance.
 */
export function createLogger(name: string, level: string = 'info'): Logger {
  return new NativeLogger(name);
}

/**
 * Default logger instance.
 */
export const logger = createLogger('freesail');
