# 🎯 WebSocket Scrabble

A full-stack, real-time multiplayer Scrabble board game supporting 1–4 players using WebSockets. Features a dark-themed UI, AI opponents, word validation against the SOWPODS dictionary (267k+ words), and complete Scrabble rule enforcement.

## Features

- **Real-time multiplayer** — Play with 1–4 players via WebSockets
- **AI opponents** — Three difficulty levels (Easy, Medium, Hard) using trie-based move generation
- **Server-authoritative** — All game logic validated server-side; clients are dumb renderers
- **Complete Scrabble rules** — Premium squares, bingo bonus, cross-word scoring, end-game deductions
- **SOWPODS dictionary** — 267,751 words for validation
- **Dark-themed UI** — Matching the design specification
- **Drag & drop** — Place tiles by dragging from rack or click-to-select
- **Chat & turn history** — Real-time messaging and move log
- **Player timers** — Configurable time limits per player
- **Responsive** — Works on desktop and mobile

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server
npm start
```

Then open **http://localhost:3000** in your browser.

## How to Play

1. Enter your username on the lobby screen
2. Click **Create Game** to start a new room
   - Choose number of players (1 = vs AI)
   - Select AI difficulty, time limit, and game type
3. Share the room code with friends, or play solo against AI
4. Click **Start Game** when ready
5. Drag tiles from your rack to the board, then click **Submit**

## Tech Stack

- **Backend**: Node.js + TypeScript, `ws` WebSocket library
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Dictionary**: SOWPODS (267,751 words)
- **Protocol**: JSON over WebSocket

## Project Structure

```
├── server/
│   ├── index.ts              # HTTP + WebSocket server
│   ├── game/
│   │   ├── GameManager.ts    # Room management, game lifecycle
│   │   ├── GameState.ts      # Core game state + mutations
│   │   ├── Board.ts          # 15×15 board, premium squares, word extraction
│   │   ├── Scoring.ts        # Score calculation with premiums
│   │   ├── TileBag.ts        # 100-tile distribution + drawing
│   │   ├── Validator.ts      # Dictionary loading + word validation
│   │   ├── AI.ts             # AI opponent (trie-based)
│   │   └── Timer.ts          # Per-player countdown timers
│   ├── dictionary/
│   │   └── sowpods.txt       # SOWPODS word list
│   └── ws/
│       └── handlers.ts       # WebSocket message routing
├── client/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js            # WebSocket connection + state management
│       ├── board.js          # Board rendering + drag/drop
│       ├── rack.js           # Tile rack management
│       ├── scoreboard.js     # Player scores + timers
│       ├── chat.js           # Chat + turn history
│       └── lobby.js          # Room creation/joining
├── package.json
└── tsconfig.json
```

## Game Rules

- Standard 15×15 Scrabble board with premium squares (TW, DW, TL, DL)
- 100 tiles with standard English distribution
- Premium squares only apply on the turn a tile is placed
- +50 bingo bonus for using all 7 tiles in one turn
- Game ends when: tile bag empty and a player uses all tiles, all players pass consecutively, or a timer runs out

## License

MIT
