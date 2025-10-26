# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Castle Game is a deterministic, turn-based economy simulation game with REST API, CLI, and MCP server interfaces. The game features resource management (gold, food, wood), worker assignment (miners, farmers, lumberjacks, builders), and castle upgrades.

## Build Commands

```bash
# Build both core game and MCP server
npm run build

# Build only core game (outputs to dist/)
npm run build:core

# Build only MCP server (outputs to dist-mcp/)
npm run build:mcp
```

**Note:** The project uses two separate TypeScript configurations:
- `tsconfig.json` - Core game (CommonJS, outputs to `dist/`)
- `tsconfig.mcp.json` - MCP server only (ES2020 modules, outputs to `dist-mcp/`)

## Running the Game

```bash
# Development mode (with ts-node/tsx)
npm run dev:cli      # Interactive CLI
npm run dev:server   # REST API server (port 3000)
npm run dev:mcp      # MCP server for AI agents (port 3001)

# Production mode (compiled)
npm run cli          # Interactive CLI
npm start            # REST API server
npm run mcp          # MCP server
```

## Core Architecture

### Game Engine (`src/engine.ts`)

The `GameEngine` class is the heart of the game:

- **Deterministic state machine**: All state changes happen through the tick cycle
- **Action queue with priority**: Actions are queued and applied in specific order (Hire/Fire → AssignJobs → StartUpgrade → BuyFood)
- **Two-phase validation**: Actions validated at queue time (basic params) and apply time (full state validation)
- **Singleton state**: One `GameEngine` instance per interface (CLI/server/MCP)

**Turn Resolution Order (critical to understand):**
1. Apply queued actions (in priority order)
2. Production (workers generate resources)
3. Construction (builders consume wood for upgrade progress)
4. Upkeep (food consumption, worker loss if negative food)
5. Taxes (castle generates gold based on level)
6. Resource clamping (ensure non-negative)
7. State logging (JSONL)

**Worker loss handling:** When workers are lost due to food shortage, jobs are reduced in priority order: Builders → Lumberjacks → Farmers → Miners

### MCP Server (`src/mcp-server-http.ts`)

Exposes the game engine via Model Context Protocol (MCP) over HTTP:

- **Stateless HTTP transport**: Each request creates a new transport, no session state
- **Tool-based interface**: 10 tools for game control (get_castle_state, enqueue_*, advance_tick, auto-tick controls)
- **Agent roles**: Tools are tagged for specific agent roles (Provisioner, Accountant, Overseer)
- **Single shared engine**: All MCP requests share one `GameEngine` instance

**Key difference from REST API:** MCP server uses stateless HTTP transport (`StreamableHTTPServerTransport`) with no session management. Each POST to `/mcp` is a standalone JSON-RPC request.

### Type System (`src/types.ts`)

All game types are defined here:
- `GameState`: Complete game state snapshot
- `Action`: Player/agent actions with type and params
- `QueuedAction`: Actions with queue metadata
- `ValidationResult`: Success or error response for validation

### Logging (`src/logger.ts`)

JSONL (JSON Lines) logging to files:
- `logs/game-cli.jsonl` - CLI mode
- `logs/game-server.jsonl` - REST API mode
- `logs/game-mcp-http.jsonl` - MCP server mode

Each tick produces two log entries:
1. Applied actions log (what actions were executed)
2. State log (complete game state after tick)

## Key Design Patterns

### Action Queue Priority System

Actions in the queue are sorted by priority before application:
1. Priority 1: Hire/Fire (affects worker count)
2. Priority 2: AssignJobs (depends on worker count)
3. Priority 3: StartUpgrade (needs to know job assignments)
4. Priority 4: BuyFood (happens last)

This ensures actions execute in logical order even if queued out of order.

### Validation Two-Phase Pattern

- **Queue time:** Basic parameter checks (non-negative, integers)
- **Apply time:** Full validation against current state (enough gold, correct worker count, etc.)

This allows actions to be queued optimistically but fail gracefully if state changes before application.

### Deterministic Game Loop

All randomness is explicitly avoided:
- No random events
- Fixed production rates
- Predictable upgrade costs
- Deterministic worker loss calculation

This makes the game suitable for AI agent training and replay from logs.

## Game Rules Quick Reference

**Starting state:** Turn 0, 20 gold, 12 food, 0 wood, 4 workers, castle level 0

**Production rates:**
- Miner: +1 gold/turn
- Farmer: +2 food/turn
- Lumberjack: +1 wood/turn
- Builder: Consumes 1 wood → +1 upgrade progress/turn

**Costs:**
- Hire: 5 gold per worker
- Food: 1 gold per food
- Upgrade: 10 × (level + 1) gold, 20 × (level + 1) wood

**Upkeep:**
- Each worker consumes 1 food/turn
- Negative food: Lose ceil(shortage / 2) workers

**Taxes:**
- +2 gold × castle level per turn

## Common Development Scenarios

### Adding a New Action Type

1. Add action type to `ActionType` union in `types.ts`
2. Define params interface in `types.ts`
3. Add validation in `validateActionParams()` in `engine.ts`
4. Add apply-time validation in `validateActionAtApplyTime()` in `engine.ts`
5. Add action handler in `applyAction()` in `engine.ts`
6. Update priority in `sortActionQueue()` if needed
7. Add REST endpoint in `server.ts`
8. Add CLI command in `cli.ts`
9. Add MCP tool in `mcp-server-http.ts`

### Modifying Turn Resolution

The turn resolution order is hardcoded in `GameEngine.tick()`. Changes here affect game balance significantly. Always update the README if you modify this.

### Testing Game Logic

The game is deterministic, so testing involves:
1. Create engine with known state
2. Queue specific actions
3. Call `tick()`
4. Assert expected state changes

Logs in `logs/` directory can be used to replay and verify game sessions.

## Important Conventions

- **No emoji in logs:** Only use emoji in user-facing messages (CLI output), never in JSONL logs
- **JSONL format:** All logs must be valid JSON on single lines (no pretty printing in log files)
- **Immutable state access:** `getState()` returns a deep copy to prevent external mutations
- **Action metadata:** `requestedBy` and `commandId` are optional tracking fields, not used in game logic
