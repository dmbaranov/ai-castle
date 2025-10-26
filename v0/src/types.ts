/**
 * AI Castle Game - Type Definitions
 */

export interface JobCounts {
  miners: number;
  farmers: number;
  lumberjacks: number;
  builders: number;
}

export interface UpgradeState {
  active: boolean;
  target?: number;
  progress?: number;
  woodRequired?: number;
}

export interface GameState {
  turn: number;
  gold: number;
  food: number;
  wood: number;
  workers: number;
  castleLevel: number;
  jobs: JobCounts;
  upgradeInProgress: UpgradeState;
}

export type ActionType = 'AssignJobs' | 'Hire' | 'Fire' | 'BuyFood' | 'StartUpgrade';

export interface AssignJobsParams {
  miners: number;
  farmers: number;
  lumberjacks: number;
  builders: number;
}

export interface HireParams {
  count: number;
}

export interface FireParams {
  count: number;
}

export interface BuyFoodParams {
  amount: number;
}

export interface StartUpgradeParams {
  // No parameters needed
}

export type ActionParams = AssignJobsParams | HireParams | FireParams | BuyFoodParams | StartUpgradeParams;

export interface Action {
  type: ActionType;
  params: ActionParams;
  requestedBy?: string;
  commandId?: string;
}

export interface QueuedAction extends Action {
  queuedAtTurn: number;
}

export interface ActionResult {
  queued: boolean;
  applyAtTurn?: number;
  error?: string;
}

export interface AppliedActionLog {
  type: ActionType;
  params: ActionParams;
  requested_by?: string;
  command_id?: string;
}

export interface TurnAppliedLog {
  turn: number;
  applied: AppliedActionLog[];
}

export interface TurnStateLog {
  turn: number;
  state: {
    gold: number;
    food: number;
    wood: number;
    workers: number;
    castleLevel: number;
    jobs: JobCounts;
    upgrade: {
      active: boolean;
      progress?: number;
      woodRequired?: number;
    };
  };
}

export interface ValidationError {
  valid: false;
  error: string;
}

export interface ValidationSuccess {
  valid: true;
}

export type ValidationResult = ValidationSuccess | ValidationError;
