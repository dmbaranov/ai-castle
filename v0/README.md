# AI Castle Game - v0

A deterministic, turn-based economy simulation game with REST API and CLI interfaces.

## Features

- **Turn-based gameplay**: Discrete tick-based time progression
- **Resource management**: Gold, Food, and Wood
- **Worker assignment**: Miners, Farmers, Lumberjacks, and Builders
- **Castle upgrades**: Progressive castle improvements requiring gold and wood
- **Deterministic engine**: Single-threaded with FIFO action queue
- **Dual interfaces**: REST API and interactive CLI
- **JSONL logging**: Full game state logging for replay

## Installation

```bash
cd v0
npm install
```

## Building

```bash
npm run build
```

## Running the Game

### Option 1: CLI Interface (Interactive)

```bash
# Development mode (with TypeScript)
npm run dev:cli

# Production mode (compiled)
npm run build
npm run cli
```

### Option 2: REST API Server

```bash
# Development mode (with TypeScript)
npm run dev:server

# Production mode (compiled)
npm run build
npm start
```

The server will start on `http://localhost:3000` by default.

### Option 3: MCP Server (For AI Agents)

The MCP (Model Context Protocol) server exposes the game engine as a set of tools that AI agents can use to control the game.

```bash
# Development mode (with TypeScript)
npm run dev:mcp

# Production mode (compiled)
npm run build
npm run mcp
```

**Available MCP Tools:**

- `get_castle_state` - Get current game state
- `enqueue_hire` - Queue hiring workers (Accountant agent)
- `enqueue_fire` - Queue firing workers (Accountant agent)
- `enqueue_buy_food` - Queue buying food (Provisioner agent)
- `enqueue_assign_jobs` - Queue job assignments (Overseer agent)
- `enqueue_start_upgrade` - Queue castle upgrade (Overseer agent)
- `advance_tick` - Manually advance one tick
- `start_auto_tick` - Start automatic tick progression
- `stop_auto_tick` - Stop automatic tick progression
- `get_auto_tick_status` - Check if auto-tick is enabled

**Agent Roles (from SPEC):**
- **Provisioner**: Manages food supply via `enqueue_buy_food`
- **Accountant**: Manages workforce via `enqueue_hire` and `enqueue_fire`
- **Overseer**: Manages job assignments and upgrades via `enqueue_assign_jobs` and `enqueue_start_upgrade`

The MCP server uses stdio transport and can be connected to by any MCP-compatible client.

## Game Rules

### Starting State

- **Turn**: 0
- **Gold**: 20
- **Food**: 12
- **Wood**: 0
- **Workers**: 4
- **Castle Level**: 0
- **Jobs**: 2 miners, 1 farmer, 1 lumberjack, 0 builders

### Production Rates

- **Miner**: +1 gold/turn
- **Farmer**: +2 food/turn
- **Lumberjack**: +1 wood/turn
- **Builder**: Consumes 1 wood → +1 upgrade progress/turn

### Costs

- **Hire worker**: 5 gold
- **Buy food**: 1 gold per food
- **Upgrade**: 10 × (castle level + 1) gold, 20 × (castle level + 1) wood

### Upkeep & Taxes

- **Food consumption**: 1 food per worker per turn
- **Food shortage**: Lose ceil(shortage / 2) workers if food < 0
- **Taxes**: +2 gold × castle level per turn

### Turn Resolution Order

Each tick executes in this order:

1. **Apply Queued Actions** (in priority order):
   - Hire/Fire
   - AssignJobs
   - StartUpgrade
   - BuyFood

2. **Production**: Resources generated based on job assignments

3. **Construction**: Builders consume wood to make upgrade progress

4. **Upkeep**: Food consumed, workers may be lost if food runs out

5. **Taxes**: Castle generates gold based on level

6. **Log**: State is recorded to JSONL file

## CLI Commands

### Information Commands

```bash
state                  # Show current game state
help                   # Show all available commands
```

### Action Commands (Apply Next Tick)

```bash
assign <miners> <farmers> <lumberjacks> <builders>
                       # Assign jobs to workers
                       # Example: assign 3 2 1 1

hire <count>           # Hire workers (5 gold each)
                       # Example: hire 2

fire <count>           # Fire workers
                       # Example: fire 1

buy <amount>           # Buy food (1 gold each)
                       # Example: buy 10

upgrade                # Start castle upgrade
```

### Time Control Commands

```bash
tick                   # Advance one turn manually
autotick start         # Start auto-tick (1 tick/second)
autotick stop          # Stop auto-tick
autotick status        # Check if auto-tick is running
```

### Other Commands

```bash
exit                   # Exit the CLI
quit                   # Exit the CLI
```

## REST API Endpoints

### GET /state

Get the current game state.

**Response:**
```json
{
  "turn": 0,
  "gold": 20,
  "food": 12,
  "wood": 0,
  "workers": 4,
  "castleLevel": 0,
  "jobs": {
    "miners": 2,
    "farmers": 1,
    "lumberjacks": 1,
    "builders": 0
  },
  "upgradeInProgress": {
    "active": false
  }
}
```

### POST /actions

Enqueue an action for the next tick.

**Request body examples:**

1. **Assign Jobs:**
```json
{
  "type": "AssignJobs",
  "params": {
    "miners": 3,
    "farmers": 2,
    "lumberjacks": 1,
    "builders": 1
  },
  "requestedBy": "Agent-Overseer",
  "commandId": "cmd-123"
}
```

2. **Hire Workers:**
```json
{
  "type": "Hire",
  "params": {
    "count": 2
  },
  "requestedBy": "Agent-Accountant"
}
```

3. **Fire Workers:**
```json
{
  "type": "Fire",
  "params": {
    "count": 1
  },
  "requestedBy": "Agent-Accountant"
}
```

4. **Buy Food:**
```json
{
  "type": "BuyFood",
  "params": {
    "amount": 10
  },
  "requestedBy": "Agent-Provisioner"
}
```

5. **Start Upgrade:**
```json
{
  "type": "StartUpgrade",
  "params": {},
  "requestedBy": "Agent-Overseer"
}
```

**Success response:**
```json
{
  "queued": true,
  "applyAtTurn": 1
}
```

**Error response:**
```json
{
  "queued": false,
  "error": "Not enough gold to hire 2 workers (need 10, have 5)"
}
```

### POST /tick

Manually advance the game by one tick.

**Response:**
```json
{
  "success": true,
  "turn": 1,
  "message": "Tick advanced"
}
```

### POST /autotick/start

Start automatic tick progression (1 tick per second).

**Response:**
```json
{
  "success": true,
  "message": "Auto-tick started"
}
```

### POST /autotick/stop

Stop automatic tick progression.

**Response:**
```json
{
  "success": true,
  "message": "Auto-tick stopped"
}
```

### GET /autotick/status

Check if auto-tick is enabled.

**Response:**
```json
{
  "enabled": true
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "turn": 5
}
```

## Example Gameplay Session

### Using CLI

```bash
$ npm run dev:cli

castle> state
=== Current State ===
Turn:         0
Gold:         20
Food:         12
Wood:         0
Workers:      4
Castle Level: 0

Jobs:
  Miners:       2
  Farmers:      1
  Lumberjacks:  1
  Builders:     0

castle> buy 10
✓ Buy 10 food queued (will apply at turn 1)

castle> tick
✓ Tick advanced

castle> state
=== Current State ===
Turn:         1
Gold:         12
Food:         24
Wood:         1
Workers:      4
Castle Level: 0

castle> upgrade
✓ Upgrade queued (will apply at turn 2)

castle> assign 1 1 1 1
✓ Jobs assigned (will apply at turn 2)

castle> autotick start
✓ Auto-tick started (1 tick per second)

castle> autotick stop
✓ Auto-tick stopped
```

### Using REST API (curl examples)

```bash
# Start the server
npm run dev:server

# Get current state
curl http://localhost:3000/state

# Buy 10 food
curl -X POST http://localhost:3000/actions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "BuyFood",
    "params": {"amount": 10},
    "requestedBy": "Player"
  }'

# Advance one tick
curl -X POST http://localhost:3000/tick

# Hire 2 workers
curl -X POST http://localhost:3000/actions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Hire",
    "params": {"count": 2}
  }'

# Assign jobs
curl -X POST http://localhost:3000/actions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "AssignJobs",
    "params": {
      "miners": 4,
      "farmers": 1,
      "lumberjacks": 1,
      "builders": 0
    }
  }'

# Start castle upgrade
curl -X POST http://localhost:3000/actions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "StartUpgrade",
    "params": {}
  }'

# Start auto-tick
curl -X POST http://localhost:3000/autotick/start

# Stop auto-tick
curl -X POST http://localhost:3000/autotick/stop

# Check auto-tick status
curl http://localhost:3000/autotick/status
```

## Logging

Game logs are written in JSONL format to:
- CLI mode: `v0/logs/game-cli.jsonl`
- Server mode: `v0/logs/game-server.jsonl`

Each tick produces two log entries:

1. **Applied actions log:**
```json
{"turn":1,"applied":[{"type":"BuyFood","params":{"amount":10},"requested_by":"CLI"}]}
```

2. **State log:**
```json
{"turn":1,"state":{"gold":10,"food":24,"wood":1,"workers":4,"castleLevel":0,"jobs":{"miners":2,"farmers":1,"lumberjacks":1,"builders":0},"upgrade":{"active":false}}}
```

## Action Validation

Actions are validated at two points:

1. **Queue time**: Basic parameter checks (non-negative, integers)
2. **Apply time**: Full validation against current state

Common validation errors:
- AssignJobs: Sum doesn't match current workers
- Hire: Not enough gold (need 5 per worker)
- Fire: Not enough workers
- BuyFood: Not enough gold
- StartUpgrade: Upgrade already in progress or not enough gold

## Tips for Playing

1. **Maintain food buffer**: Keep at least 3 × workers food to avoid starvation
2. **Balance production**: Adjust job assignments based on needs
3. **Plan upgrades**: Save gold and assign builders before starting upgrade
4. **Watch for starvation**: Negative food causes worker loss!
5. **Use taxes wisely**: Higher castle level = more passive gold income

## Architecture

- `src/types.ts`: TypeScript type definitions
- `src/logger.ts`: JSONL logging to file and console
- `src/engine.ts`: Core game engine (state, actions, tick resolution)
- `src/server.ts`: REST API server with Express
- `src/cli.ts`: Interactive CLI interface
- `src/mcp-server.ts`: MCP server for AI agent control

## Using MCP Server with Custom Agents

To connect custom AI agents to the game via MCP:

1. **Start the MCP server**:
   ```bash
   npm run dev:mcp
   ```

2. **Configure your MCP client** to connect to the server via stdio

3. **Example: Simple agent loop** (pseudo-code):
   ```
   loop:
     state = call_tool("get_castle_state")

     # Provisioner logic
     if state.food < state.workers * 3:
       call_tool("enqueue_buy_food", {amount: 10, requested_by: "Provisioner"})

     # Accountant logic
     if state.gold > 30:
       call_tool("enqueue_hire", {count: 2, requested_by: "Accountant"})

     # Overseer logic
     call_tool("enqueue_assign_jobs", {
       miners: calculate_miners(state),
       farmers: calculate_farmers(state),
       lumberjacks: calculate_lumberjacks(state),
       builders: calculate_builders(state),
       requested_by: "Overseer"
     })

     # Advance the game
     call_tool("advance_tick")

     sleep(1s)
   ```

4. **Logs**: MCP server logs are written to `v0/logs/game-mcp.jsonl`

For more details on the MCP protocol, see: https://modelcontextprotocol.io

## Future Enhancements (Post-v0)

- Standing orders for automatic food purchases
- `/simulate` endpoint for what-if analysis
- Variable tick duration
- WebSocket support for real-time updates
- Additional resources (stone)
- Random events and markets
- Seasons and morale systems

## License

MIT
