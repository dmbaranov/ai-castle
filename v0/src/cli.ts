/**
 * AI Castle Game - CLI Interface
 */

import * as readline from 'readline';
import { GameEngine } from './engine';
import { Logger } from './logger';
import { Action } from './types';

class GameCLI {
  private engine: GameEngine;
  private rl: readline.Interface;

  constructor() {
    const logger = new Logger('game-cli.jsonl');
    this.engine = new GameEngine(logger);

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'castle> ',
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.rl.on('line', (line: string) => {
      this.handleCommand(line.trim());
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log('\nExiting AI Castle. Goodbye!');
      this.engine.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      this.rl.close();
    });
  }

  private handleCommand(input: string): void {
    if (!input) {
      return;
    }

    const parts = input.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (command) {
        case 'help':
          this.showHelp();
          break;

        case 'state':
          this.showState();
          break;

        case 'assign':
          this.handleAssign(args);
          break;

        case 'hire':
          this.handleHire(args);
          break;

        case 'fire':
          this.handleFire(args);
          break;

        case 'buy':
          this.handleBuy(args);
          break;

        case 'upgrade':
          this.handleUpgrade();
          break;

        case 'tick':
          this.handleTick();
          break;

        case 'autotick':
          this.handleAutoTick(args);
          break;

        case 'exit':
        case 'quit':
          this.rl.close();
          break;

        default:
          console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
    }
  }

  private showHelp(): void {
    console.log('\n=== AI Castle Commands ===\n');
    console.log('Game Information:');
    console.log('  state                              - Show current game state');
    console.log('  help                               - Show this help message');
    console.log('');
    console.log('Actions (applied next tick):');
    console.log('  assign <miners> <farmers> <lumberjacks> <builders>');
    console.log('                                     - Assign jobs to workers');
    console.log('  hire <count>                       - Hire workers (5 gold each)');
    console.log('  fire <count>                       - Fire workers');
    console.log('  buy <amount>                       - Buy food (1 gold each)');
    console.log('  upgrade                            - Start castle upgrade');
    console.log('');
    console.log('Time Control:');
    console.log('  tick                               - Advance one turn manually');
    console.log('  autotick start                     - Start auto-tick (1/sec)');
    console.log('  autotick stop                      - Stop auto-tick');
    console.log('  autotick status                    - Check auto-tick status');
    console.log('');
    console.log('Other:');
    console.log('  exit, quit                         - Exit the game');
    console.log('');
  }

  private showState(): void {
    const state = this.engine.getState();
    console.log('\n=== Current State ===');
    console.log(`Turn:         ${state.turn}`);
    console.log(`Gold:         ${state.gold}`);
    console.log(`Food:         ${state.food}`);
    console.log(`Wood:         ${state.wood}`);
    console.log(`Workers:      ${state.workers}`);
    console.log(`Castle Level: ${state.castleLevel}`);
    console.log('\nJobs:');
    console.log(`  Miners:       ${state.jobs.miners}`);
    console.log(`  Farmers:      ${state.jobs.farmers}`);
    console.log(`  Lumberjacks:  ${state.jobs.lumberjacks}`);
    console.log(`  Builders:     ${state.jobs.builders}`);

    if (state.upgradeInProgress.active) {
      console.log('\nUpgrade in Progress:');
      console.log(`  Target Level:   ${state.upgradeInProgress.target}`);
      console.log(`  Progress:       ${state.upgradeInProgress.progress}/${state.upgradeInProgress.woodRequired}`);
      const percent = ((state.upgradeInProgress.progress! / state.upgradeInProgress.woodRequired!) * 100).toFixed(1);
      console.log(`  Completion:     ${percent}%`);
    }
    console.log('');
  }

  private handleAssign(args: string[]): void {
    if (args.length !== 4) {
      console.log('Usage: assign <miners> <farmers> <lumberjacks> <builders>');
      return;
    }

    const [miners, farmers, lumberjacks, builders] = args.map(Number);

    if (args.some(arg => isNaN(Number(arg)))) {
      console.log('Error: All arguments must be numbers');
      return;
    }

    const action: Action = {
      type: 'AssignJobs',
      params: { miners, farmers, lumberjacks, builders },
      requestedBy: 'CLI',
    };

    const result = this.engine.enqueueAction(action);
    if (result.queued) {
      console.log(`✓ Jobs assigned (will apply at turn ${result.applyAtTurn})`);
    } else {
      console.log(`✗ Failed to assign jobs: ${result.error}`);
    }
  }

  private handleHire(args: string[]): void {
    if (args.length !== 1) {
      console.log('Usage: hire <count>');
      return;
    }

    const count = Number(args[0]);
    if (isNaN(count)) {
      console.log('Error: Count must be a number');
      return;
    }

    const action: Action = {
      type: 'Hire',
      params: { count },
      requestedBy: 'CLI',
    };

    const result = this.engine.enqueueAction(action);
    if (result.queued) {
      console.log(`✓ Hire ${count} workers queued (will apply at turn ${result.applyAtTurn})`);
    } else {
      console.log(`✗ Failed to hire: ${result.error}`);
    }
  }

  private handleFire(args: string[]): void {
    if (args.length !== 1) {
      console.log('Usage: fire <count>');
      return;
    }

    const count = Number(args[0]);
    if (isNaN(count)) {
      console.log('Error: Count must be a number');
      return;
    }

    const action: Action = {
      type: 'Fire',
      params: { count },
      requestedBy: 'CLI',
    };

    const result = this.engine.enqueueAction(action);
    if (result.queued) {
      console.log(`✓ Fire ${count} workers queued (will apply at turn ${result.applyAtTurn})`);
    } else {
      console.log(`✗ Failed to fire: ${result.error}`);
    }
  }

  private handleBuy(args: string[]): void {
    if (args.length !== 1) {
      console.log('Usage: buy <amount>');
      return;
    }

    const amount = Number(args[0]);
    if (isNaN(amount)) {
      console.log('Error: Amount must be a number');
      return;
    }

    const action: Action = {
      type: 'BuyFood',
      params: { amount },
      requestedBy: 'CLI',
    };

    const result = this.engine.enqueueAction(action);
    if (result.queued) {
      console.log(`✓ Buy ${amount} food queued (will apply at turn ${result.applyAtTurn})`);
    } else {
      console.log(`✗ Failed to buy food: ${result.error}`);
    }
  }

  private handleUpgrade(): void {
    const action: Action = {
      type: 'StartUpgrade',
      params: {},
      requestedBy: 'CLI',
    };

    const result = this.engine.enqueueAction(action);
    if (result.queued) {
      console.log(`✓ Upgrade queued (will apply at turn ${result.applyAtTurn})`);
    } else {
      console.log(`✗ Failed to start upgrade: ${result.error}`);
    }
  }

  private handleTick(): void {
    this.engine.tick();
    console.log('✓ Tick advanced');
  }

  private handleAutoTick(args: string[]): void {
    if (args.length !== 1) {
      console.log('Usage: autotick <start|stop|status>');
      return;
    }

    const subcommand = args[0].toLowerCase();

    switch (subcommand) {
      case 'start':
        this.engine.startAutoTick();
        console.log('✓ Auto-tick started (1 tick per second)');
        break;

      case 'stop':
        this.engine.stopAutoTick();
        console.log('✓ Auto-tick stopped');
        break;

      case 'status':
        const enabled = this.engine.isAutoTickEnabled();
        console.log(`Auto-tick is ${enabled ? 'enabled' : 'disabled'}`);
        break;

      default:
        console.log('Usage: autotick <start|stop|status>');
    }
  }

  start(): void {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║       Welcome to AI Castle Game!          ║');
    console.log('╚════════════════════════════════════════════╝\n');
    console.log('Type "help" for available commands.');
    console.log('Type "state" to see the current game state.\n');

    this.showState();
    this.rl.prompt();
  }
}

// Start CLI
const cli = new GameCLI();
cli.start();
