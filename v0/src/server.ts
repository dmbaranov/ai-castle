/**
 * AI Castle Game - REST API Server
 */

import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { GameEngine } from './engine';
import { Logger } from './logger';
import { Action } from './types';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Initialize game engine
const logger = new Logger('game-server.jsonl');
const engine = new GameEngine(logger);

// Log initial state
console.log('=== AI Castle Game Server ===');
console.log('Initial state:', JSON.stringify(engine.getState(), null, 2));

/**
 * GET /state
 * Returns the current game state
 */
app.get('/state', (req: Request, res: Response) => {
  res.json(engine.getState());
});

/**
 * POST /actions
 * Enqueue an action for the next tick
 *
 * Body: {
 *   type: 'AssignJobs' | 'Hire' | 'Fire' | 'BuyFood' | 'StartUpgrade',
 *   params: { ... },
 *   requestedBy?: string,
 *   commandId?: string
 * }
 */
app.post('/actions', (req: Request, res: Response) => {
  try {
    const action: Action = req.body;

    if (!action.type) {
      return res.status(400).json({ error: 'Action type is required' });
    }

    if (!action.params) {
      return res.status(400).json({ error: 'Action params are required' });
    }

    const result = engine.enqueueAction(action);

    if (result.queued) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /tick
 * Manually advance the game by one tick
 */
app.post('/tick', (req: Request, res: Response) => {
  try {
    engine.tick();
    res.json({
      success: true,
      turn: engine.getState().turn,
      message: 'Tick advanced',
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /autotick/start
 * Start automatic tick progression (1 tick per second)
 */
app.post('/autotick/start', (req: Request, res: Response) => {
  engine.startAutoTick();
  res.json({ success: true, message: 'Auto-tick started' });
});

/**
 * POST /autotick/stop
 * Stop automatic tick progression
 */
app.post('/autotick/stop', (req: Request, res: Response) => {
  engine.stopAutoTick();
  res.json({ success: true, message: 'Auto-tick stopped' });
});

/**
 * GET /autotick/status
 * Check if auto-tick is enabled
 */
app.get('/autotick/status', (req: Request, res: Response) => {
  res.json({ enabled: engine.isAutoTickEnabled() });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', turn: engine.getState().turn });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log('  GET  /state              - Get current game state');
  console.log('  POST /actions            - Enqueue an action');
  console.log('  POST /tick               - Manually advance one tick');
  console.log('  POST /autotick/start     - Start auto-tick (1/sec)');
  console.log('  POST /autotick/stop      - Stop auto-tick');
  console.log('  GET  /autotick/status    - Check auto-tick status');
  console.log('  GET  /health             - Health check');
  console.log('\nGame ready! Use POST /autotick/start to begin.\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  engine.shutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  engine.shutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
