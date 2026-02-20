# Proofwell Agent

**Autonomous treasury agent that profits from human weakness — and puts that capital to work.**

Proofwell is a screen time accountability app where users stake crypto on their goals. Fail your goal? 40% of your stake gets slashed to the treasury. The Proofwell Agent IS that treasury — an autonomous onchain agent on Base that collects forfeiture revenue, deploys idle capital to Aave for yield, sells behavioral attestation data via x402, and pays its own compute costs. Zero human intervention.

## The Problem Proofwell Agent Solves

DeFi agents today are demos — they read prices and tweet about it. None of them have a real revenue model. None are actually self-sustaining.

Meanwhile, the accountability/habit market is $10B+ but runs on honor systems. Users set screen time limits, break them, and nothing happens.

Proofwell Agent solves both:
- **For users**: Real skin in the game. Stake crypto on your screen time goal, verified by Apple's DeviceActivity framework. Win → get your stake back + bonus from losers' pool. Fail → lose 40%.
- **For the agent**: A sustainable revenue source that scales with human behavior. More users failing their goals = more treasury revenue = more capital to deploy.

## How It Works

```
Every 5 minutes, the agent:

1. READS chain state — wallet balances, Aave position, contract treasury, active stakes
2. DETERMINISTIC RULES (no LLM needed):
   → Treasury has funds? Withdraw to agent wallet
   → Idle USDC > $10? Deposit to Aave V3 for yield
   → Expired stakes resolvable? Call resolveExpired() to claim leftover pool
   → Low ETH? Alert for gas top-up
3. AMBIGUOUS DECISIONS (LLM, ~1x/hour):
   → Portfolio rebalance — what % in Aave vs liquid?
   → Strategy adjustment based on current yield rates
4. EXECUTES with ERC-8021 builder code on every transaction
5. LOGS action + revenue/cost to SQLite
```

Most cycles are pure reads with no LLM call. Target: <$1/day in compute costs.

## Revenue Model (3 Streams)

| Stream | Mechanism | At Scale |
|--------|-----------|----------|
| **Treasury fees** | 40% of every forfeited stake flows to agent wallet | 100 users × $50 avg × 30% fail = $600/day |
| **Aave V3 yield** | Idle USDC earns 3-8% APY | Passive income on all holdings |
| **x402 attestation** | Other protocols pay 0.01 USDC/query for behavioral data | Novel DeFi primitive for credit scoring |

The x402 endpoint answers: **"Is this wallet holder disciplined?"** — a new onchain signal for undercollateralized lending, insurance pricing, and reputation systems.

## Architecture

```
proofwell-agent/
├── src/
│   ├── agent/
│   │   ├── index.ts              # Entry point + 5-min timer loop
│   │   ├── wallet.ts             # Viem wallet + builder code wrapper
│   │   ├── decision-engine.ts    # Deterministic rules + LLM fallback
│   │   └── state.ts              # SQLite state tracking
│   ├── actions/
│   │   ├── proofwell.ts          # Read/write ProofwellStakingV2
│   │   ├── aave.ts               # Supply/withdraw USDC on Aave V3
│   │   └── builder-codes.ts      # ERC-8021 calldata suffix
│   ├── api/
│   │   ├── server.ts             # Dashboard API + x402 endpoints
│   │   └── x402-attestation.ts   # Paid behavioral attestation
│   └── config.ts                 # Addresses, thresholds, env vars
├── dashboard/                    # Next.js dashboard → Vercel
└── Dockerfile                    # Agent → Railway
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Chain**: Base mainnet (viem)
- **DeFi**: Aave V3 (supply/withdraw USDC), ProofwellStakingV2 (custom staking contract)
- **LLM**: OpenAI gpt-4o-mini (rebalancing decisions, ~1 call/hour)
- **Data**: SQLite (actions, revenue, costs)
- **API**: Express (dashboard endpoints + x402 attestation)
- **Dashboard**: Next.js + Tailwind CSS
- **Builder Codes**: ERC-8021 suffix on every transaction
- **Payments**: x402 protocol for paid attestation queries
- **Deploy**: Docker → Railway (agent), Vercel (dashboard)

## Bounty Integration: Base

Every transaction the agent sends includes an **ERC-8021 builder code suffix** registered as "proofwell" at base.dev. This is verifiable on BaseScan for every tx the agent makes.

The agent is a self-sustaining autonomous actor on Base mainnet:
- Collects revenue from three independent streams
- Pays its own gas and compute costs
- Makes autonomous DeFi decisions (deposit, withdraw, resolve)
- Public dashboard proves revenue vs costs in real-time

## Running Locally

```bash
# Clone
git clone https://github.com/0xrafi/proofwell-agent.git
cd proofwell-agent

# Install
npm install
cd dashboard && npm install && cd ..

# Configure
cp .env.example .env
# Edit .env with your private key, RPC URL, etc.

# Run agent (includes API server)
npm run dev

# Run dashboard (separate terminal)
npm run dashboard
```

## Contract Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Aave V3 Pool | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| aBasUSDC | `0x4e65fE4DBa92790696d040ac24Aa414708F5c0Ab` |
| ProofwellStakingV2 | TBD (deploying during hackathon) |

## What Makes This Different

Most hackathon agents are chatbots with a wallet. This agent has a **real business model**:

1. **Revenue from human behavior** — not artificial token emissions or grants
2. **Behavioral attestation as a DeFi primitive** — no one else sells "is this wallet disciplined?" as an onchain signal
3. **Provably self-sustaining** — the dashboard shows exact revenue vs costs in real-time
4. **Minimal LLM usage** — deterministic rules handle 95% of decisions; LLM is a fallback, not a crutch

## Links

- **Dashboard**: (deployed URL TBD)
- **Agent wallet**: (address TBD — will be visible on BaseScan)
- **Proofwell iOS app**: [App Store](https://apps.apple.com/app/proofwell) (sister project — the user-facing side)
- **Staking contract**: [proofwell-contracts](https://github.com/0xrafi/proofwell-contracts)

## Team

Solo builder — [@0xrafi](https://github.com/0xrafi)

## License

MIT
