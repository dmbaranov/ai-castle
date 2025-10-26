/**
 * AI Castle Game - Core Engine
 * Implements the deterministic, turn-based game logic
 */

import {
  GameState,
  Action,
  QueuedAction,
  ActionResult,
  ValidationResult,
  AssignJobsParams,
  HireParams,
  FireParams,
  BuyFoodParams,
  TurnAppliedLog,
  TurnStateLog,
  AppliedActionLog,
} from './types';
import { Logger } from './logger';

export class GameEngine {
  private state: GameState;
  private actionQueue: QueuedAction[] = [];
  private logger: Logger;
  private tickInterval: NodeJS.Timeout | null = null;
  private autoTickEnabled: boolean = false;

  constructor(logger: Logger, initialState?: Partial<GameState>) {
    this.logger = logger;

    // Initialize with default starting state
    this.state = {
      turn: 0,
      gold: 25,
      food: 18,
      wood: 0,
      workers: 5,
      castleLevel: 0,
      jobs: {
        miners: 2,
        farmers: 1,
        lumberjacks: 1,
        builders: 0,
      },
      upgradeInProgress: {
        active: false,
      },
      ...initialState,
    };

    this.logger.logInfo(`Game engine initialized with state: ${JSON.stringify(this.state)}`);
  }

  /**
   * Get current game state (read-only copy)
   */
  getState(): GameState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Enqueue an action for the next tick
   */
  enqueueAction(action: Action): ActionResult {
    // Basic parameter validation
    const validationResult = this.validateActionParams(action);
    if (!validationResult.valid) {
      return {
        queued: false,
        error: validationResult.error,
      };
    }

    const queuedAction: QueuedAction = {
      ...action,
      queuedAtTurn: this.state.turn,
    };

    this.actionQueue.push(queuedAction);

    return {
      queued: true,
      applyAtTurn: this.state.turn + 1,
    };
  }

  /**
   * Validate action parameters (basic checks)
   */
  private validateActionParams(action: Action): ValidationResult {
    switch (action.type) {
      case 'AssignJobs': {
        const params = action.params as AssignJobsParams;
        if (
          params.miners < 0 ||
          params.farmers < 0 ||
          params.lumberjacks < 0 ||
          params.builders < 0
        ) {
          return { valid: false, error: 'Job counts must be non-negative integers' };
        }
        if (!Number.isInteger(params.miners) || !Number.isInteger(params.farmers) ||
            !Number.isInteger(params.lumberjacks) || !Number.isInteger(params.builders)) {
          return { valid: false, error: 'Job counts must be integers' };
        }
        break;
      }
      case 'Hire': {
        const params = action.params as HireParams;
        if (params.count < 0 || !Number.isInteger(params.count)) {
          return { valid: false, error: 'Hire count must be a non-negative integer' };
        }
        break;
      }
      case 'Fire': {
        const params = action.params as FireParams;
        if (params.count < 0 || !Number.isInteger(params.count)) {
          return { valid: false, error: 'Fire count must be a non-negative integer' };
        }
        break;
      }
      case 'BuyFood': {
        const params = action.params as BuyFoodParams;
        if (params.amount < 0 || !Number.isInteger(params.amount)) {
          return { valid: false, error: 'Buy food amount must be a non-negative integer' };
        }
        break;
      }
      case 'StartUpgrade':
        // No parameters to validate
        break;
      default:
        return { valid: false, error: `Unknown action type: ${(action as any).type}` };
    }

    return { valid: true };
  }

  /**
   * Advance the game by one tick
   */
  tick(): void {
    const nextTurn = this.state.turn + 1;
    this.logger.logInfo(`\n=== TICK ${nextTurn} ===`);

    // 1. Apply queued actions in order
    const appliedActions = this.applyQueuedActions();

    // Log applied actions
    const appliedLog: TurnAppliedLog = {
      turn: nextTurn,
      applied: appliedActions,
    };
    this.logger.logAppliedActions(appliedLog);

    // 2. Increment turn
    this.state.turn = nextTurn;

    // 3. Production
    this.applyProduction();

    // 4. Construction
    this.applyConstruction();

    // 5. Upkeep
    this.applyUpkeep();

    // 6. Taxes
    this.applyTaxes();

    // 7. Clamp resources
    this.clampResources();

    // 8. Log state
    this.logCurrentState();
  }

  /**
   * Apply all queued actions in the correct order
   */
  private applyQueuedActions(): AppliedActionLog[] {
    const applied: AppliedActionLog[] = [];

    // Sort actions by type priority:
    // 1. Hire/Fire
    // 2. AssignJobs
    // 3. StartUpgrade
    // 4. BuyFood
    const sortedQueue = this.sortActionQueue();

    for (const queuedAction of sortedQueue) {
      const validationResult = this.validateActionAtApplyTime(queuedAction);

      if (!validationResult.valid) {
        this.logger.logError(
          `Action ${queuedAction.type} rejected: ${validationResult.error}`
        );
        continue;
      }

      this.applyAction(queuedAction);

      applied.push({
        type: queuedAction.type,
        params: queuedAction.params,
        requested_by: queuedAction.requestedBy,
        command_id: queuedAction.commandId,
      });
    }

    // Clear the queue
    this.actionQueue = [];

    return applied;
  }

  /**
   * Sort action queue by priority
   */
  private sortActionQueue(): QueuedAction[] {
    const priorityMap: Record<string, number> = {
      Hire: 1,
      Fire: 1,
      AssignJobs: 2,
      StartUpgrade: 3,
      BuyFood: 4,
    };

    return [...this.actionQueue].sort((a, b) => {
      const priorityA = priorityMap[a.type] || 999;
      const priorityB = priorityMap[b.type] || 999;
      return priorityA - priorityB;
    });
  }

  /**
   * Validate action at apply time (with current state)
   */
  private validateActionAtApplyTime(action: QueuedAction): ValidationResult {
    switch (action.type) {
      case 'AssignJobs': {
        const params = action.params as AssignJobsParams;
        const sum = params.miners + params.farmers + params.lumberjacks + params.builders;
        if (sum !== this.state.workers) {
          return {
            valid: false,
            error: `AssignJobs sum (${sum}) does not match current workers (${this.state.workers})`,
          };
        }
        break;
      }
      case 'Hire': {
        const params = action.params as HireParams;
        const cost = params.count * 5;
        if (this.state.gold < cost) {
          return {
            valid: false,
            error: `Not enough gold to hire ${params.count} workers (need ${cost}, have ${this.state.gold})`,
          };
        }
        break;
      }
      case 'Fire': {
        const params = action.params as FireParams;
        if (this.state.workers < params.count) {
          return {
            valid: false,
            error: `Cannot fire ${params.count} workers (only have ${this.state.workers})`,
          };
        }
        break;
      }
      case 'BuyFood': {
        const params = action.params as BuyFoodParams;
        const cost = params.amount;
        if (this.state.gold < cost) {
          return {
            valid: false,
            error: `Not enough gold to buy ${params.amount} food (need ${cost}, have ${this.state.gold})`,
          };
        }
        break;
      }
      case 'StartUpgrade': {
        if (this.state.upgradeInProgress.active) {
          return {
            valid: false,
            error: 'An upgrade is already in progress',
          };
        }
        const cost = 10 * (this.state.castleLevel + 1);
        if (this.state.gold < cost) {
          return {
            valid: false,
            error: `Not enough gold to start upgrade (need ${cost}, have ${this.state.gold})`,
          };
        }
        break;
      }
    }

    return { valid: true };
  }

  /**
   * Apply a single action to the game state
   */
  private applyAction(action: QueuedAction): void {
    switch (action.type) {
      case 'AssignJobs': {
        const params = action.params as AssignJobsParams;
        this.state.jobs = {
          miners: params.miners,
          farmers: params.farmers,
          lumberjacks: params.lumberjacks,
          builders: params.builders,
        };
        this.logger.logInfo(`Jobs assigned: ${JSON.stringify(params)}`);
        break;
      }
      case 'Hire': {
        const params = action.params as HireParams;
        const cost = params.count * 5;
        this.state.gold -= cost;
        this.state.workers += params.count;
        this.logger.logInfo(`Hired ${params.count} workers for ${cost} gold`);
        break;
      }
      case 'Fire': {
        const params = action.params as FireParams;
        this.state.workers -= params.count;
        this.logger.logInfo(`Fired ${params.count} workers`);
        break;
      }
      case 'BuyFood': {
        const params = action.params as BuyFoodParams;
        const cost = params.amount;
        this.state.gold -= cost;
        this.state.food += params.amount;
        this.logger.logInfo(`Bought ${params.amount} food for ${cost} gold`);
        break;
      }
      case 'StartUpgrade': {
        const cost = 10 * (this.state.castleLevel + 1);
        const woodRequired = 12 * (this.state.castleLevel + 1);
        this.state.gold -= cost;
        this.state.upgradeInProgress = {
          active: true,
          target: this.state.castleLevel + 1,
          progress: 0,
          woodRequired,
        };
        this.logger.logInfo(
          `Started upgrade to level ${this.state.castleLevel + 1} (cost: ${cost} gold, wood required: ${woodRequired})`
        );
        break;
      }
    }
  }

  /**
   * Apply production phase
   */
  private applyProduction(): void {
    const goldProduced = this.state.jobs.miners * 2;
    const foodProduced = this.state.jobs.farmers * 3;
    const woodProduced = this.state.jobs.lumberjacks * 1;

    this.state.gold += goldProduced;
    this.state.food += foodProduced;
    this.state.wood += woodProduced;

    this.logger.logInfo(
      `Production: +${goldProduced} gold, +${foodProduced} food, +${woodProduced} wood`
    );
  }

  /**
   * Apply construction phase
   */
  private applyConstruction(): void {
    if (!this.state.upgradeInProgress.active) {
      return;
    }

    const upgrade = this.state.upgradeInProgress;
    let progressMade = 0;

    // Each builder consumes 1 wood and adds 1 progress
    for (let i = 0; i < this.state.jobs.builders; i++) {
      if (this.state.wood > 0) {
        this.state.wood -= 1;
        upgrade.progress! += 1;
        progressMade += 1;
      }
    }

    this.logger.logInfo(
      `Construction: ${progressMade} progress (${upgrade.progress}/${upgrade.woodRequired})`
    );

    // Check if upgrade is complete
    if (upgrade.progress! >= upgrade.woodRequired!) {
      this.state.castleLevel += 1;
      this.state.gold += 5; // Completion bonus
      this.state.upgradeInProgress = { active: false };
      this.logger.logInfo(`🏰 Upgrade complete! Castle is now level ${this.state.castleLevel} (+5 gold bonus)`);
    }
  }

  /**
   * Reduce job assignments when workers are lost
   * Priority order: Builders → Lumberjacks → Farmers → Miners
   */
  private reduceJobsByPriority(workersToRemove: number): void {
    let remaining = workersToRemove;

    // Remove builders first
    const buildersToRemove = Math.min(remaining, this.state.jobs.builders);
    this.state.jobs.builders -= buildersToRemove;
    remaining -= buildersToRemove;

    // Remove lumberjacks next
    if (remaining > 0) {
      const lumberjacksToRemove = Math.min(remaining, this.state.jobs.lumberjacks);
      this.state.jobs.lumberjacks -= lumberjacksToRemove;
      remaining -= lumberjacksToRemove;
    }

    // Remove farmers next
    if (remaining > 0) {
      const farmersToRemove = Math.min(remaining, this.state.jobs.farmers);
      this.state.jobs.farmers -= farmersToRemove;
      remaining -= farmersToRemove;
    }

    // Remove miners last
    if (remaining > 0) {
      const minersToRemove = Math.min(remaining, this.state.jobs.miners);
      this.state.jobs.miners -= minersToRemove;
      remaining -= minersToRemove;
    }

    this.logger.logInfo(
      `Jobs reduced: miners=${this.state.jobs.miners}, farmers=${this.state.jobs.farmers}, ` +
      `lumberjacks=${this.state.jobs.lumberjacks}, builders=${this.state.jobs.builders}`
    );
  }

  /**
   * Apply upkeep phase
   */
  private applyUpkeep(): void {
    const foodNeeded = this.state.workers;
    this.state.food -= foodNeeded;

    if (this.state.food < 0) {
      const shortage = -this.state.food;
      this.state.food = 0;
      const workersLost = Math.ceil(shortage / 2);
      this.state.workers = Math.max(0, this.state.workers - workersLost);

      this.logger.logError(
        `⚠️  Food shortage! Lost ${workersLost} workers (shortage: ${shortage})`
      );

      // Reduce job assignments by priority when workers are lost
      if (workersLost > 0) {
        this.reduceJobsByPriority(workersLost);
      }
    } else {
      this.logger.logInfo(`Upkeep: -${foodNeeded} food`);
    }
  }

  /**
   * Apply taxes phase
   */
  private applyTaxes(): void {
    const taxIncome = 1 * this.state.castleLevel;
    if (taxIncome > 0) {
      this.state.gold += taxIncome;
      this.logger.logInfo(`Taxes: +${taxIncome} gold`);
    }
  }

  /**
   * Clamp resources to non-negative values
   */
  private clampResources(): void {
    this.state.gold = Math.max(0, this.state.gold);
    this.state.food = Math.max(0, this.state.food);
    this.state.wood = Math.max(0, this.state.wood);
  }

  /**
   * Log current state
   */
  private logCurrentState(): void {
    const stateLog: TurnStateLog = {
      turn: this.state.turn,
      state: {
        gold: this.state.gold,
        food: this.state.food,
        wood: this.state.wood,
        workers: this.state.workers,
        castleLevel: this.state.castleLevel,
        jobs: { ...this.state.jobs },
        upgrade: {
          active: this.state.upgradeInProgress.active,
          progress: this.state.upgradeInProgress.progress,
          woodRequired: this.state.upgradeInProgress.woodRequired,
        },
      },
    };

    this.logger.logState(stateLog);
  }

  /**
   * Start auto-tick (1 second interval)
   */
  startAutoTick(): void {
    if (this.autoTickEnabled) {
      this.logger.logInfo('Auto-tick is already running');
      return;
    }

    this.autoTickEnabled = true;
    this.tickInterval = setInterval(() => {
      this.tick();
    }, 1000);

    this.logger.logInfo('Auto-tick started (1 tick per second)');
  }

  /**
   * Stop auto-tick
   */
  stopAutoTick(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      this.autoTickEnabled = false;
      this.logger.logInfo('Auto-tick stopped');
    }
  }

  /**
   * Check if auto-tick is enabled
   */
  isAutoTickEnabled(): boolean {
    return this.autoTickEnabled;
  }

  /**
   * Cleanup
   */
  shutdown(): void {
    this.stopAutoTick();
    this.logger.close();
  }
}
