/**
 * AI Castle Game - Logger
 * Handles JSONL logging to both console and file
 */

import * as fs from 'fs';
import * as path from 'path';
import { TurnAppliedLog, TurnStateLog } from './types';

export class Logger {
  private logFilePath: string;
  private logStream: fs.WriteStream;

  constructor(logFileName: string = 'game.jsonl') {
    const logsDir = path.join(__dirname, '../logs');

    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.logFilePath = path.join(logsDir, logFileName);

    // Create or truncate the log file
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'w' });
  }

  logAppliedActions(log: TurnAppliedLog): void {
    const jsonLine = JSON.stringify(log);

    // Write to console
    console.log(`[APPLIED] ${jsonLine}`);

    // Write to file
    this.logStream.write(jsonLine + '\n');
  }

  logState(log: TurnStateLog): void {
    const jsonLine = JSON.stringify(log);

    // Write to console
    console.log(`[STATE] ${jsonLine}`);

    // Write to file
    this.logStream.write(jsonLine + '\n');
  }

  logInfo(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  logError(message: string): void {
    console.error(`[ERROR] ${message}`);
  }

  close(): void {
    this.logStream.end();
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }
}
