AI Castle — SPEC v0 (Final Plan)

Minimal, deterministic, turn-based CLI economy managed by agents (Accountant, Provisioner, Overseer) under an Orchestrator that issues one command at a time. Option A: No autonomous actions; agents act only when instructed. Engine is single-threaded and authoritative.

⸻

1) Scope & Non‑Goals (v0)

In scope
	•	Single castle; resources: gold, food, wood; population: workers; structure: castleLevel; at most one active upgrade.
	•	Jobs: miners, farmers, lumberjacks, builders (explicit assignment only; no auto-assign).
	•	Actions (all apply next tick): AssignJobs, Hire, Fire, BuyFood, StartUpgrade.
	•	Deterministic, single-threaded engine with FIFO action queue.

Out of scope (v0)
	•	No standing orders, no auto-buy, no events, markets, seasons, morale/skills, multi-projects, WebSockets/message bus, instant actions.

⸻

2) Starting State (defaults)

turn = 0
gold = 20
food = 12
wood = 0
workers = 4
castleLevel = 0
jobs = { miners: 2, farmers: 1, lumberjacks: 1, builders: 0 }
upgradeInProgress = { active: false }


⸻

3) Time Model & Tick Cadence
	•	Turn-based. The engine advances in discrete ticks.
	•	Dev mode: manual tick (CLI advance). Runtime (optional): 1s per tick after MVP.
	•	All actions take effect at the start of the next tick (T+1).

⸻

4) Action Queue & Apply Order (per tick)

Actions queued before tick T are applied at the start of tick T in this order:
	1.	AssignJobs
	2.	Hire / Fire
	3.	StartUpgrade
	4.	BuyFood

If validation fails at apply time (see §8), the action is rejected and not applied.

⸻

5) Turn Resolution (after actions apply)

Given state at start of tick T (after applying queued actions):
	1.	Production

	•	Gold += miners * 1
	•	Food += farmers * 2
	•	Wood += lumberjacks * 1

	2.	Construction

	•	If upgradeInProgress.active:
	•	For each builder up to builders times: if wood > 0 then wood -= 1; progress += 1.
	•	If progress >= woodRequired: complete upgrade → castleLevel += 1; upgradeInProgress.active = false; reset progress.

	3.	Upkeep

	•	food -= workers
	•	If food < 0: let shortage = -food; set food = 0; workers lost = ceil(shortage / 2); workers = max(0, workers - lost).

	4.	Taxes

	•	gold += (2 * castleLevel)

	5.	Clamp & Log

	•	Clamp gold/food/wood to ≥ 0 (should rarely matter if validation is correct).
	•	Append log entries (see §9).

⸻

6) Actions (definitions)

All numeric parameters are integers ≥ 0. All actions apply at the start of next tick.
	•	AssignJobs({miners, farmers, lumberjacks, builders})
	•	Must sum exactly to workers at apply time.
	•	No auto-assign for unallocated workers.
	•	Hire(n)
	•	Cost: n * 5 gold at apply time.
	•	Workers increase by n immediately for this tick’s production phase (since apply is start-of-tick).
	•	Fire(n)
	•	Workers decrease by n at apply time (affects production/upkeep this tick).
	•	BuyFood(n)
	•	Cost: n * 1 gold at apply time.
	•	Food increases by n at apply time (available for this tick’s upkeep).
	•	StartUpgrade()
	•	Only if upgradeInProgress.active == false.
	•	Immediate gold cost at apply: 10 * (castleLevel + 1).
	•	Sets upgradeInProgress = { active: true, target: castleLevel + 1, progress: 0, woodRequired: 20 * (castleLevel + 1) }.
	•	Exactly one upgrade can be active.

⸻

7) Production & Economy Constants (v0)
	•	Miner: +1 gold/turn
	•	Farmer: +2 food/turn
	•	Lumberjack: +1 wood/turn
	•	Builder: –1 wood ⇒ +1 progress/turn
	•	Upkeep: –1 food/worker/turn, worker loss on shortage: ceil(shortage / 2)
	•	Hire cost: 5 gold each
	•	Upgrade costs: gold = 10(L+1), wood = 20(L+1)
	•	Taxes: +2 gold × castleLevel/turn (after upkeep)
	•	All values are integers; no fractions.

⸻

8) Validation & Invariants (engine)

Validate at apply time; reject with error if any fail:
	•	AssignJobs: provided counts sum exactly to current workers (after Hire/Fire application order is considered within same tick).
	•	Hire(n): gold >= 5*n at apply.
	•	BuyFood(n): gold >= n at apply.
	•	StartUpgrade: upgradeInProgress.active == false and gold >= 10*(castleLevel+1) at apply.
	•	All params must be integers ≥ 0 and within reasonable bounds.
	•	Engine maintains single-threaded execution; actions are handled FIFO within their category order.

Post-resolution invariants: clamp gold, food, wood ≥ 0 (safety net, not a normal path).

⸻

9) Logging & Replay (minimal, sufficient)

Append two JSONL records per tick:
	1.	{"turn":T, "applied":[ {"type":"AssignJobs", "params":{...}, "requested_by":"Overseer", "command_id":"..." }, ... ]}
	2.	{"turn":T, "state": { "gold":..., "food":..., "wood":..., "workers":..., "castleLevel":..., "jobs":{...}, "upgrade":{ "active":..., "progress":..., "woodRequired":... } } }

Replay tool re-applies logs deterministically to reproduce states.

⸻

10) Roles & Protocol (agents execute; orchestrator instructs)

Orchestrator
	•	Observes state sometimes (manual/interval/adaptive), issues one command at a time, waits for reply, may resend with force:true.
	•	Never writes to engine.

Agents
	•	Provisioner: executes BuyFood.
	•	Accountant: executes Hire and Fire.
	•	Overseer: executes AssignJobs and StartUpgrade.
	•	Each command allows one-shot refusal with short, structured reason; on force:true, execute unless engine would reject.
	•	Assume agents are always available in v0 (no retry logic).

Engine API (v0, minimal)
	•	GET /state → current state snapshot
	•	POST /actions → enqueue one action for next tick; returns { queued:true, applyAtTurn:T+1 } or { queued:false, error }

Orchestrator ⇄ Agent contract (conceptual)
	•	Request: { command_id, action, force:false, reason? }
	•	Response: EXECUTED | REFUSED(reason) | REFUSED_SAFETY(invariant)

⸻

11) Orchestrator Policy (baseline heuristics for stability)
	•	Food buffer target: maintain food ≥ 3 * workers.
	•	When buffer < 2 turns → command Provisioner to BuyFood up to 3 turns.
	•	Upgrades: when buffer ≥ 2 turns and gold ≥ 10*(L+1), command Overseer StartUpgrade and set job mix to ensure progress (builders use wood; lumberjacks replenish to finish in ~H turns; e.g., H=5).
	•	Jobs: prefer miners for gold when not upgrading; during upgrade, keep builders ≈ workers/3 bounded by wood; adjust lumberjacks/farmers to maintain wood flow and food buffer.
	•	Hiring/Firing: hire in small batches when buffer ≥ 3 turns and gold surplus; avoid firing in v0 unless crisis.

⸻

12) Testing Checklist (engine)
	•	Apply-order correctness across mixed actions.
	•	Shortage edges: food == workers, food == workers - 1.
	•	Builders with wood == 0 (stall, no penalties).
	•	Taxes timing after upkeep.
	•	AssignJobs rejection when counts mismatch after a Hire/Fire in same tick.
	•	Replay reproduces exact states.

⸻

13) Observability (lightweight)
	•	Per-tick deltas printed in CLI for: Δgold, Δfood, Δwood, Δworkers, progress%.
	•	Optional CSV export per turn for quick charts later.

⸻

14) Future Toggles (post‑MVP, non-breaking)
	•	Standing orders (bounded) for food top-ups.
	•	/simulate endpoint for one-turn what‑if.
	•	Variable tick duration; WebSocket push for UI.
	•	Additional resources (stone), events, markets.

⸻

15) Final Guarantees (v0)
	•	Deterministic: single-threaded, ordered applies, integer math.
	•	Explicit control: no auto-actions; world coasts on last configuration.
	•	One upgrade at a time; builders consume wood 1:1.
	•	Agents execute; orchestrator instructs one command at a time with one-shot disagreement.
	•	Reproducible: logs are sufficient to replay the exact run.
