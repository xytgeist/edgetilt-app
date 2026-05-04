# Phoenix Link — advantage play notes

Phoenix Link is an **Aristocrat-style must-hit-by (MHB)** family game: a **visible counter** advances toward a **mandatory award** window. The commercial problem is not “will it hit” — it is **whether the dollars you spend to move the counter** buy enough **probability mass** in the right part of the cycle at **your** denom and line configuration.

## The +EV picture (counter-first)

1. **Counter vs trigger model** — You need a coherent story for **average spins (or dollars) to trigger** the must-hit feature from the current reading, and for **increment cost** (bet-driven) per unit of counter movement.
2. **Bonus pay distribution** — The **average bonus pay** assumption dominates tail risk. If your assumption is stale vs the cabinet’s current marketing / denom mix, your edge estimate is decoration.
3. **Walk-away discipline** — Even when the state is +EV, **volatility** can erase you before the math converges. The in-app tool encodes **recommended walk-away** logic as a function of counter position—use it as a structured default, not a superstition.

## How the game plays (floor-facing)

- **Base game:** Standard video slot pays while the **must-hit meter** or **counter display** advances with qualifying bets.
- **Feature:** When the must-hit condition is met, the machine awards from the **configured must-hit prize pool** for that bank / link / theme revision.
- **Denoms:** Always confirm **max bet / denom eligibility** for the progressive or must-hit tier you think you are buying.

## Bankroll and scouting

Treat scouting cost (partial cycles, wrong denom probes, “just checking”) as **real dilution** of edge. If you cannot articulate **fee per unit of counter progress** vs **implied value**, you are not ready to size up.

## Using the Las Vegas Slot Pro calculator

Open **Phoenix Link EV Calc** from the card. Plug **counter, denom, bet, increment model, average trigger, bonus pay**, and optional **full-run fee** switches to match how you scout. Compare **EV and exposure** columns before you commit bankroll.

---

*Replace or extend by syncing from this file with `npm run slots:sync` or editing Supabase.*
