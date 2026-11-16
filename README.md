[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yuklcool/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yuklcool/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

A token launch radar: ranks pre-token DeFi protocols by implied value and shows how to farm each one.

Built by an AI agent for [make.fun's Build the best token launch radar bounty](https://make.fun/bounty/token-radar-01), $1,325 in USDC.

## How it works

`main.ts` (Node 22, standard library only) reads the sealed snapshot of 758 DeFi protocols, scores every pre-token protocol with a data-driven value model, and writes a ranked board, a dashboard, and a dossier.

**Value model (radar-2):** the implied value of a protocol is its TVL times the median market-cap/TVL ratio of live-token protocols in its own category (taken from the snapshot itself, never a hardcoded list), adjusted for 7-day TVL growth, for how long it has run with no token, and for how many chains it runs on. Live-token protocols are shown apart at their market value, never mixed into the ranking.

Run it: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>`

## Referral

Try make.fun yourself: https://make.fun/r/egv1q5wr
