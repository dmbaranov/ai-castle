/**
 * AI Castle Game - MCP Server (HTTP Transport)
 *
 * Exposes the game engine as an MCP server over HTTP.
 * This allows tools like n8n to connect via HTTP and discover/execute tools.
 *
 * Usage:
 *   npm run dev:mcp
 *
 * The server will run on http://localhost:3001/mcp
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { GameEngine } from "./engine.js";
import { Logger } from "./logger.js";
import { Action } from "./types.js";

const PORT = process.env.MCP_PORT || 3001;
const logger = new Logger("MCP");

// Initialize game engine
const engine = new GameEngine(logger);
logger.logInfo(`Game engine initialized with state: ${JSON.stringify(engine.getState())}`);

// Create MCP server (reused across all requests)
const server = new McpServer({
  name: "ai-castle-mcp-server",
  version: "1.0.0",
});

logger.logInfo("MCP HTTP Server initializing");
logger.logInfo(`Initial state: ${JSON.stringify(engine.getState())}`);

/**
 * Tool: get_castle_state
 */
server.registerTool(
  "get_castle_state",
  {
    title: "Get Castle State",
    description: "Get the current game state including turn, resources, workers, and upgrade status",
    inputSchema: {},
    outputSchema: {
      state: z.object({
        turn: z.number(),
        gold: z.number(),
        food: z.number(),
        wood: z.number(),
        workers: z.number(),
        castleLevel: z.number(),
        jobs: z.object({
          miners: z.number(),
          farmers: z.number(),
          lumberjacks: z.number(),
          builders: z.number(),
        }),
        upgradeInProgress: z.object({
          active: z.boolean(),
          target: z.number().optional(),
          progress: z.number().optional(),
          woodRequired: z.number().optional(),
        }),
      }),
    },
  },
  async () => {
    const state = engine.getState();
    return {
      content: [{ type: "text", text: JSON.stringify(state, null, 2) }],
      structuredContent: { state },
    };
  }
);

/**
 * Tool: enqueue_hire
 */
server.registerTool(
  "enqueue_hire",
  {
    title: "Hire Workers",
    description: "Queue action to hire workers. Cost: 5 gold per worker. Accountant agent.",
    inputSchema: {
      count: z.number().int().positive().describe("Number of workers to hire"),
      requested_by: z.string().default("Accountant").describe("Agent requesting this action"),
      command_id: z.string().optional().describe("Optional command ID for tracking"),
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string(),
    },
  },
  async ({ count, requested_by, command_id }: any) => {
    const action: Action = {
      type: "Hire",
      params: { count: count as number },
      requestedBy: requested_by as string,
      commandId: command_id as string | undefined,
    };
    engine.enqueueAction(action);
    const output = {
      success: true,
      message: `Enqueued hire action: ${count} workers`,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: enqueue_fire
 */
server.registerTool(
  "enqueue_fire",
  {
    title: "Fire Workers",
    description: "Queue action to fire workers. Accountant agent.",
    inputSchema: {
      count: z.number().int().positive().describe("Number of workers to fire"),
      requested_by: z.string().default("Accountant").describe("Agent requesting this action"),
      command_id: z.string().optional().describe("Optional command ID for tracking"),
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string(),
    },
  },
  async ({ count, requested_by, command_id }: any) => {
    const action: Action = {
      type: "Fire",
      params: { count: count as number },
      requestedBy: requested_by as string,
      commandId: command_id as string | undefined,
    };
    engine.enqueueAction(action);
    const output = {
      success: true,
      message: `Enqueued fire action: ${count} workers`,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: enqueue_buy_food
 */
server.registerTool(
  "enqueue_buy_food",
  {
    title: "Buy Food",
    description: "Queue action to buy food. Cost: 1 gold per food. Provisioner agent.",
    inputSchema: {
      amount: z.number().int().positive().describe("Amount of food to buy"),
      requested_by: z.string().default("Provisioner").describe("Agent requesting this action"),
      command_id: z.string().optional().describe("Optional command ID for tracking"),
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string(),
    },
  },
  async ({ amount, requested_by, command_id }: any) => {
    const action: Action = {
      type: "BuyFood",
      params: { amount: amount as number },
      requestedBy: requested_by as string,
      commandId: command_id as string | undefined,
    };
    engine.enqueueAction(action);
    const output = {
      success: true,
      message: `Enqueued buy food action: ${amount} food`,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: enqueue_assign_jobs
 */
server.registerTool(
  "enqueue_assign_jobs",
  {
    title: "Assign Jobs",
    description: "Queue action to assign workers to jobs. Overseer agent.",
    inputSchema: {
      miners: z.number().int().nonnegative().describe("Number of miners"),
      farmers: z.number().int().nonnegative().describe("Number of farmers"),
      lumberjacks: z.number().int().nonnegative().describe("Number of lumberjacks"),
      builders: z.number().int().nonnegative().describe("Number of builders"),
      requested_by: z.string().default("Overseer").describe("Agent requesting this action"),
      command_id: z.string().optional().describe("Optional command ID for tracking"),
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string(),
    },
  },
  async ({ miners, farmers, lumberjacks, builders, requested_by, command_id }: any) => {
    const action: Action = {
      type: "AssignJobs",
      params: {
        miners: miners as number,
        farmers: farmers as number,
        lumberjacks: lumberjacks as number,
        builders: builders as number,
      },
      requestedBy: requested_by as string,
      commandId: command_id as string | undefined,
    };
    engine.enqueueAction(action);
    const output = {
      success: true,
      message: `Enqueued assign jobs action`,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: enqueue_start_upgrade
 */
server.registerTool(
  "enqueue_start_upgrade",
  {
    title: "Start Upgrade",
    description: "Queue action to start castle upgrade. Overseer agent.",
    inputSchema: {
      requested_by: z.string().default("Overseer").describe("Agent requesting this action"),
      command_id: z.string().optional().describe("Optional command ID for tracking"),
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string(),
    },
  },
  async ({ requested_by, command_id }: any) => {
    const action: Action = {
      type: "StartUpgrade",
      params: {},
      requestedBy: requested_by as string,
      commandId: command_id as string | undefined,
    };
    engine.enqueueAction(action);
    const output = {
      success: true,
      message: `Enqueued start upgrade action`,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: advance_tick
 */
server.registerTool(
  "advance_tick",
  {
    title: "Advance Tick",
    description: "Process all queued actions and advance the game by one turn",
    inputSchema: {},
    outputSchema: {
      success: z.boolean(),
      newTurn: z.number(),
      eventsProcessed: z.number(),
    },
  },
  async () => {
    engine.tick();
    const state = engine.getState();
    const output = {
      success: true,
      newTurn: state.turn,
      eventsProcessed: 0,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: start_auto_tick
 */
server.registerTool(
  "start_auto_tick",
  {
    title: "Start Auto Tick",
    description: "Start automatic game progression with specified interval in milliseconds",
    inputSchema: {
      interval_ms: z.number().int().positive().default(1000).describe("Interval in milliseconds"),
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string(),
    },
  },
  async ({ interval_ms }: any) => {
    engine.startAutoTick();
    const output = {
      success: true,
      message: `Auto-tick started (1 second interval)`,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: stop_auto_tick
 */
server.registerTool(
  "stop_auto_tick",
  {
    title: "Stop Auto Tick",
    description: "Stop automatic game progression",
    inputSchema: {},
    outputSchema: {
      success: z.boolean(),
      message: z.string(),
    },
  },
  async () => {
    engine.stopAutoTick();
    const output = {
      success: true,
      message: "Auto-tick stopped",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: get_auto_tick_status
 */
server.registerTool(
  "get_auto_tick_status",
  {
    title: "Get Auto Tick Status",
    description: "Check if auto-tick is currently running",
    inputSchema: {},
    outputSchema: {
      running: z.boolean(),
      interval_ms: z.number().optional(),
    },
  },
  async () => {
    const output = {
      running: false,
      interval_ms: 1000,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Setup Express server with simple stateless HTTP transport
 */
const app = express();
app.use(express.json());

// CORS headers for browser access
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", state: engine.getState() });
});

/**
 * MCP endpoint - simple stateless mode
 */
app.post("/mcp", async (req, res) => {
  try {
    // Create a new transport for each request (stateless mode)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless!
      enableJsonResponse: true,
    });

    // Clean up transport when request closes
    res.on("close", () => {
      transport.close();
    });

    // Connect and handle the request
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.logError(`Error handling MCP request: ${error}`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

/**
 * Start the HTTP server
 */
app.listen(PORT, () => {
  console.log(`✓ AI Castle MCP Server (HTTP) running on http://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`  Initial state: Turn ${engine.getState().turn}`);
  logger.logInfo(`MCP HTTP server started on port ${PORT}`);
});
