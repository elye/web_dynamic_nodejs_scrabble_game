# WebSocket Scrabble

A full-stack, real-time multiplayer Scrabble board game for 1–4 players built with WebSockets. Features a dark-themed UI, AI opponents with three difficulty levels, word validation against the SOWPODS dictionary (267k+ words), and complete Scrabble rule enforcement.

## Features

- **Real-time multiplayer** — 1–4 players via WebSockets with session persistence and reconnection support
- **AI opponents** — Easy, Medium, and Hard difficulty using trie-based move generation
- **Server-authoritative** — All game logic validated server-side; clients are renderers
- **Complete Scrabble rules** — Premium squares, bingo bonus, cross-word scoring, end-game rack deductions
- **SOWPODS dictionary** — 267,751 words for validation
- **Drag & drop** — Place tiles by dragging from rack to board, or click-to-select
- **Tentative placement** — Plan your next move by placing tiles during your opponent's turn with live score preview
- **Score preview** — Real-time score hints as you place tiles, with word validity feedback
- **Round summary** — End-game stats, highlight boxes, and a score progression graph with bingo/pass markers
- **Timer modes** — Sudden death or -10 pts/min penalty overtime, with configurable time limits (15/20/30/45 min or unlimited)
- **Chat & turn history** — Real-time messaging and detailed move log with word definitions from the Free Dictionary API
- **Dark-themed UI** — Clean, responsive design for desktop and mobile

## Requirements

- **Node.js** v16 or higher
- **npm** v7 or higher
- **TypeScript** v5.3+ (installed as a dev dependency)

No database or external services required. The dictionary file is bundled in the repository.

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd web-socket-scrabble

# Install dependencies
npm install

# Build the TypeScript server
npm run build

# Start the server
npm start
```

Open **http://localhost:3000** in your browser. The port can be changed via the `PORT` environment variable:

```bash
PORT=8080 npm start
```

### Development Mode

```bash
npm run dev
```

Runs TypeScript in watch mode (`tsc --watch`) and auto-restarts the server with `nodemon` on file changes.

### npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `tsc` | Compiles TypeScript from `server/` to `dist/` |
| `start` | `node dist/server/index.js` | Runs the compiled server |
| `dev` | `tsc --watch & nodemon dist/server/index.js` | Watch mode + auto-restart |

## How to Play

1. Enter your username on the lobby screen
2. Choose a game mode:
   - **Solo** — Play against an AI bot (Easy, Medium, or Hard)
   - **Create Game** — Host a multiplayer room for 2–4 players
   - **Join Game** — Enter a room code or pick from the room list
3. In the waiting room, the host can add/remove AI bots and configure settings
4. Click **Start Game** when ready
5. Drag tiles from your rack to the board, then click **Submit**
6. While waiting for your opponent, you can plan your next move by placing tiles on the board — you'll see a live score preview

## Architecture

### Overview

The application follows a **client-server** architecture with WebSocket-based real-time communication. The server is the single source of truth for all game state — clients send actions and render the state they receive.

```
┌─────────────────────┐         WebSocket (JSON)         ┌──────────────────────┐
│       Client        │ ◄──────────────────────────────► │       Server         │
│  Vanilla HTML/JS    │                                  │  Node.js + TypeScript│
│                     │   PLACE_TILE, SUBMIT_WORD,       │                      │
│  board.js           │   PASS_TURN, CHAT_MESSAGE ...    │  GameManager         │
│  rack.js            │ ──────────────────────────────►  │    ├─ GameState      │
│  scoreboard.js      │                                  │    ├─ Board          │
│  chat.js            │   GAME_STATE, WORD_ACCEPTED,     │    ├─ Scoring        │
│  lobby.js           │   TIMER_UPDATE, GAME_OVER ...    │    ├─ TileBag        │
│  app.js             │ ◄──────────────────────────────  │    ├─ Validator      │
│                     │                                  │    ├─ AI             │
└─────────────────────┘                                  │    └─ Timer          │
                                                         └──────────────────────┘
```

### Server (`server/`)

| File | Responsibility |
|------|---------------|
| `index.ts` | HTTP server for static files + WebSocket server setup. Serves the `client/` directory with proper MIME types. Prevents directory traversal. |
| `ws/handlers.ts` | WebSocket message router. Dispatches incoming messages by type to `GameManager` methods. Manages session resolution on connect. |
| `game/GameManager.ts` | Room and player orchestration. Manages rooms, sessions, player sockets, disconnect/reconnect timers, and AI turn execution. |
| `game/GameState.ts` | Core game logic. Handles tile placement, word submission, turn advancement, score tracking, turn history, and end-game statistics. |
| `game/Board.ts` | 15×15 board representation. Premium square layout, placement validation (geometry, adjacency, center square), and word extraction from placed tiles. |
| `game/Scoring.ts` | Score calculation. Applies letter/word multipliers from premium squares, adds bingo bonus for 7-tile plays. |
| `game/TileBag.ts` | Standard 100-tile English distribution. Handles drawing, returning, and tracking remaining tiles. |
| `game/Validator.ts` | Dictionary loading and word validation against SOWPODS. |
| `game/AI.ts` | AI opponent. Trie-based word search with anchor square detection. Three difficulty levels control move selection strategy. |
| `game/Timer.ts` | Per-player countdown timers with 1-second tick intervals. Supports sudden death and penalty overtime modes. |
| `dictionary/sowpods.txt` | SOWPODS word list (267,751 words). |

### Client (`client/`)

| File | Responsibility |
|------|---------------|
| `index.html` | Single-page HTML with lobby modals, game board, rack, scoreboard, chat panel, and round summary overlay. |
| `css/styles.css` | Dark-themed styles. Board grid, tile rendering, premium square colors, animations (shake, flash), modals, responsive layout. |
| `js/app.js` | WebSocket connection and message dispatcher. Routes incoming messages to UI handlers. Manages game state variables, round summary rendering with canvas-based score graph. |
| `js/board.js` | Board rendering and interaction. Drag-and-drop tile placement, click-to-place, board-to-board moves, score preview requests, tentative placement during opponent's turn. |
| `js/rack.js` | Tile rack management. Drag-and-drop reordering, shuffle, sort, add/remove tiles. |
| `js/scoreboard.js` | Player cards with scores, timers, avatars, AI badges, and active-turn highlighting. |
| `js/chat.js` | Real-time chat and turn history panel. Displays move details with word definitions fetched from the Free Dictionary API. |
| `js/lobby.js` | Lobby UI. Solo/multiplayer/join modals, waiting room management, AI bot controls, game settings configuration. |

### AI Difficulty Levels

| Level | Strategy |
|-------|----------|
| **Easy** | Picks from the bottom 30% of scoring moves; favors short words (≤3 tiles) |
| **Medium** | Picks randomly from the top 5 moves in the upper 50% by score |
| **Hard** | Always plays the highest-scoring move available |

The AI uses a trie built from the SOWPODS dictionary to efficiently generate valid moves. It finds anchor squares (empty cells adjacent to existing tiles), then recursively extends words through them while validating cross-words.

### Timer Modes

| Mode | Behavior |
|------|----------|
| **Sudden Death** | When time expires, the player's score is set to 0 and the game ends immediately |
| **Penalty Overtime** | When time expires, the player loses 10 points per minute of overtime. The game ends if their score reaches 0 |

### Session & Reconnection

- Each browser tab gets a unique `sessionId` stored in `sessionStorage`
- If a player disconnects during a game, the server holds their spot for 120 seconds
- The player's timer is paused while disconnected
- On reconnection, full game state is restored and play resumes
- In the waiting room, disconnected players are removed after 30 seconds

## Project Structure

```
├── server/
│   ├── index.ts              # HTTP + WebSocket server entry point
│   ├── game/
│   │   ├── GameManager.ts    # Room management, game lifecycle, AI coordination
│   │   ├── GameState.ts      # Core game state, rules, scoring, turn history
│   │   ├── Board.ts          # 15×15 board, premium squares, word extraction
│   │   ├── Scoring.ts        # Score calculation with premium multipliers
│   │   ├── TileBag.ts        # 100-tile bag with standard distribution
│   │   ├── Validator.ts      # SOWPODS dictionary word validation
│   │   ├── AI.ts             # Trie-based AI with 3 difficulty levels
│   │   └── Timer.ts          # Per-player timers (sudden death / penalty)
│   ├── dictionary/
│   │   └── sowpods.txt       # SOWPODS word list (267,751 words)
│   └── ws/
│       └── handlers.ts       # WebSocket message routing
├── client/
│   ├── index.html            # Single-page application
│   ├── css/
│   │   └── styles.css        # Dark theme styles
│   ├── js/
│   │   ├── app.js            # WebSocket connection + state management
│   │   ├── board.js          # Board rendering + drag-and-drop
│   │   ├── rack.js           # Tile rack management
│   │   ├── scoreboard.js     # Player scores + timers
│   │   ├── chat.js           # Chat + turn history with word definitions
│   │   └── lobby.js          # Room creation, joining, waiting room
│   └── assets/
│       └── sounds/           # Sound effects
├── package.json
└── tsconfig.json
```

## WebSocket Protocol

All messages are JSON objects with a `type` field. Key message flows:

**Lobby & Rooms**: `JOIN_LOBBY` → `LOBBY_STATE`, `CREATE_ROOM` → `ROOM_CREATED`, `JOIN_ROOM` → `ROOM_JOINED`, `START_GAME` → `GAME_START`

**Gameplay**: `PLACE_TILE` → `PLACE_TILE_RESULT`, `SUBMIT_WORD` → `WORD_ACCEPTED` / `WORD_REJECTED`, `PASS_TURN` → `TURN_PASSED`, `EXCHANGE_TILES` → `TILES_EXCHANGED`

**Updates**: `GAME_STATE` (full state sync after each action), `TIMER_UPDATE` (every second), `SCORE_PREVIEW` (live score hints), `GAME_OVER` (final stats + progression data)

**Chat**: `CHAT_MESSAGE` → `CHAT`

## Game Rules

- Standard 15×15 Scrabble board with premium squares (TW, DW, TL, DL)
- 100 tiles with standard English letter distribution (including 2 blanks)
- First word must cross the center square (7,7)
- All subsequent words must connect to existing tiles
- Premium squares only apply on the turn a tile is placed on them
- +50 bingo bonus for using all 7 tiles in one turn
- Blank tiles score 0 points but can represent any letter
- All formed words (including cross-words) must be valid SOWPODS words
- End-game rack deductions: unplayed tile points subtracted from each player's score
- Game ends when: tile bag is empty and a player uses all tiles, all players pass consecutively, a timer runs out, or a player resigns

## License

MIT
