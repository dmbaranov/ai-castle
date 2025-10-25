/**
 * AI Castle Game - MCP Server (HTTP/SSE Transport)
 *
 * Exposes the game engine as an MCP server over HTTP using Server-Sent Events.
 * This allows tools like n8n to connect via HTTP and discover/execute tools.
 *
 * Usage:
 *   npm run mcp:http
 *
 * The server will run on http://localhost:3001 by default.
 */

import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { GameEngine } from "./engine.js";
import { Logger } from "./logger.js";
import { Action } from "./types.js";

const PORT = process.env.MCP_PORT || 3001;

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

// Initialize game engine
const logger = new Logger("game-mcp-http.jsonl");
const engine = new GameEngine(logger);

logger.logInfo("MCP HTTP Server initializing");
logger.logInfo(`Initial state: ${JSON.stringify(engine.getState())}`);

/**
 * Create Express app
 */
const app = express();
app.use(express.json());

// CORS headers for cross-origin requests (e.g., from n8n)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "ai-castle-mcp-http",
    turn: engine.getState().turn,
  });
});

/**
 * Create MCP server and setup tool handlers
 */
function createMCPServer() {
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

  return server;
}

/**
 * Store active transports by session
 */
const transports = new Map<string, SSEServerTransport>();

/**
 * SSE endpoint for MCP
 */
app.get("/sse", async (req, res) => {
  logger.logInfo("New SSE connection established");

  // Generate session ID
  const sessionId = Math.random().toString(36).substring(7);

  const server = createMCPServer();
  const transport = new SSEServerTransport(`/message?sessionId=${sessionId}`, res);

  // Store transport for this session
  transports.set(sessionId, transport);

  await server.connect(transport);

  req.on("close", () => {
    logger.logInfo(`SSE connection closed for session ${sessionId}`);
    transports.delete(sessionId);
  });
});

/**
 * Message endpoint for MCP client requests
 */
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    logger.logError("Message received without session ID");
    return res.status(400).json({ error: "Missing session ID" });
  }

  const transport = transports.get(sessionId);

  if (!transport) {
    logger.logError(`No transport found for session ${sessionId}`);
    return res.status(404).json({ error: "Session not found" });
  }

  // Let the transport handle the message
  await transport.handlePostMessage(req, res);
});

/**
 * Start the HTTP server
 */
app.listen(PORT, () => {
  console.log(`✓ AI Castle MCP Server (HTTP/SSE) running on http://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  MCP endpoint: http://localhost:${PORT}/sse`);
  console.log(`  Initial state: Turn ${engine.getState().turn}`);
  logger.logInfo(`MCP HTTP server started on port ${PORT}`);
});
