#!/usr/bin/env node

/**
 * AI Castle Game - MCP Server
 *
 * Exposes the game engine as an MCP server that custom agents can connect to.
 * Agents can observe state, queue actions, and control tick advancement.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { GameEngine } from "./engine.js";
import { Logger } from "./logger.js";
import { Action } from "./types.js";

/**
 * Tool Definitions
 * These tools are exposed to agents connecting via MCP
 */
const TOOLS: Tool[] = [
  {
    name: "get_castle_state",
    description: "Get the current game state including turn, resources (gold, food, wood), workers, castle level, job assignments, and upgrade status",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "enqueue_hire",
    description: "Queue action to hire workers. Cost: 5 gold per worker. Should be requested by Accountant agent.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of workers to hire (must be positive integer)",
        },
        requested_by: {
          type: "string",
          description: "Which agent is requesting this action (e.g., 'Accountant')",
          default: "Accountant",
        },
        command_id: {
          type: "string",
          description: "Optional command ID for tracking",
        },
      },
      required: ["count"],
    },
  },
  {
    name: "enqueue_fire",
    description: "Queue action to fire workers. Should be requested by Accountant agent.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of workers to fire (must be positive integer)",
        },
        requested_by: {
          type: "string",
          description: "Which agent is requesting this action (e.g., 'Accountant')",
          default: "Accountant",
        },
        command_id: {
          type: "string",
          description: "Optional command ID for tracking",
        },
      },
      required: ["count"],
    },
  },
  {
    name: "enqueue_buy_food",
    description: "Queue action to buy food. Cost: 1 gold per food. Should be requested by Provisioner agent.",
    inputSchema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Amount of food to buy (must be positive integer)",
        },
        requested_by: {
          type: "string",
          description: "Which agent is requesting this action (e.g., 'Provisioner')",
          default: "Provisioner",
        },
        command_id: {
          type: "string",
          description: "Optional command ID for tracking",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "enqueue_assign_jobs",
    description: "Queue action to assign workers to jobs (miners, farmers, lumberjacks, builders). The sum must equal total workers. Should be requested by Overseer agent.",
    inputSchema: {
      type: "object",
      properties: {
        miners: {
          type: "number",
          description: "Number of miners (produce +1 gold/turn)",
        },
        farmers: {
          type: "number",
          description: "Number of farmers (produce +2 food/turn)",
        },
        lumberjacks: {
          type: "number",
          description: "Number of lumberjacks (produce +1 wood/turn)",
        },
        builders: {
          type: "number",
          description: "Number of builders (consume 1 wood -> +1 upgrade progress/turn)",
        },
        requested_by: {
          type: "string",
          description: "Which agent is requesting this action (e.g., 'Overseer')",
          default: "Overseer",
        },
        command_id: {
          type: "string",
          description: "Optional command ID for tracking",
        },
      },
      required: ["miners", "farmers", "lumberjacks", "builders"],
    },
  },
  {
    name: "enqueue_start_upgrade",
    description: "Queue action to start castle upgrade. Cost: 10*(level+1) gold, requires 20*(level+1) wood to complete. Only one upgrade can be active. Should be requested by Overseer agent.",
    inputSchema: {
      type: "object",
      properties: {
        requested_by: {
          type: "string",
          description: "Which agent is requesting this action (e.g., 'Overseer')",
          default: "Overseer",
        },
        command_id: {
          type: "string",
          description: "Optional command ID for tracking",
        },
      },
      required: [],
    },
  },
  {
    name: "advance_tick",
    description: "Manually advance the game by one tick. This applies all queued actions, runs production, construction, upkeep, and taxes.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "start_auto_tick",
    description: "Start automatic tick progression (1 tick per second)",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "stop_auto_tick",
    description: "Stop automatic tick progression",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_auto_tick_status",
    description: "Check if auto-tick is currently enabled",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

/**
 * Initialize MCP Server
 */
const server = new Server(
  {
    name: "ai-castle-game",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize game engine
const logger = new Logger("game-mcp.jsonl");
const engine = new GameEngine(logger);

logger.logInfo("MCP Server started");
logger.logInfo(`Initial state: ${JSON.stringify(engine.getState())}`);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_castle_state": {
        const state = engine.getState();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(state, null, 2),
            },
          ],
        };
      }

      case "enqueue_hire": {
        if (!args) {
          throw new Error("Missing arguments for enqueue_hire");
        }
        const action: Action = {
          type: "Hire",
          params: { count: args.count as number },
          requestedBy: (args.requested_by as string) || "Accountant",
          commandId: args.command_id as string,
        };
        const result = engine.enqueueAction(action);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "enqueue_fire": {
        if (!args) {
          throw new Error("Missing arguments for enqueue_fire");
        }
        const action: Action = {
          type: "Fire",
          params: { count: args.count as number },
          requestedBy: (args.requested_by as string) || "Accountant",
          commandId: args.command_id as string,
        };
        const result = engine.enqueueAction(action);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "enqueue_buy_food": {
        if (!args) {
          throw new Error("Missing arguments for enqueue_buy_food");
        }
        const action: Action = {
          type: "BuyFood",
          params: { amount: args.amount as number },
          requestedBy: (args.requested_by as string) || "Provisioner",
          commandId: args.command_id as string,
        };
        const result = engine.enqueueAction(action);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "enqueue_assign_jobs": {
        if (!args) {
          throw new Error("Missing arguments for enqueue_assign_jobs");
        }
        const action: Action = {
          type: "AssignJobs",
          params: {
            miners: args.miners as number,
            farmers: args.farmers as number,
            lumberjacks: args.lumberjacks as number,
            builders: args.builders as number,
          },
          requestedBy: (args.requested_by as string) || "Overseer",
          commandId: args.command_id as string,
        };
        const result = engine.enqueueAction(action);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "enqueue_start_upgrade": {
        const action: Action = {
          type: "StartUpgrade",
          params: {},
          requestedBy: (args?.requested_by as string) || "Overseer",
          commandId: args?.command_id as string,
        };
        const result = engine.enqueueAction(action);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "advance_tick": {
        engine.tick();
        const state = engine.getState();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  turn: state.turn,
                  message: "Tick advanced successfully",
                  state,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "start_auto_tick": {
        const wasEnabled = engine.isAutoTickEnabled();
        engine.startAutoTick();
        const isEnabled = engine.isAutoTickEnabled();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: !wasEnabled && isEnabled,
                message: wasEnabled
                  ? "Auto-tick is already running"
                  : "Auto-tick started (1 tick/second)",
              }),
            },
          ],
        };
      }

      case "stop_auto_tick": {
        const wasEnabled = engine.isAutoTickEnabled();
        engine.stopAutoTick();
        const isEnabled = engine.isAutoTickEnabled();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: wasEnabled && !isEnabled,
                message: wasEnabled
                  ? "Auto-tick stopped"
                  : "Auto-tick was not running",
              }),
            },
          ],
        };
      }

      case "get_auto_tick_status": {
        const enabled = engine.isAutoTickEnabled();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ enabled }),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Unknown tool: ${name}` }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    logger.logError(`Tool call error: ${error}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: String(error),
          }),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error("AI Castle MCP Server running on stdio");
}

main().catch((error) => {
  logger.logError(`Server error: ${error}`);
  console.error("Fatal error:", error);
  process.exit(1);
});
