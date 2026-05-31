/**
 * AI Character Simulation
 * 
 * 4 players (Wisey, Smarty, Okie, Sloppy) share a board.
 * Turn order is shuffled each game to eliminate first-mover bias.
 * Runs 10 games and verifies average scores follow Wisey > Smarty > Okie > Sloppy.
 * 
 * Usage: npx ts-node server/simulate-ai.ts
 */

import { Validator } from './game/Validator';
import { AI, AICharacter } from './game/AI';
import { Board } from './game/Board';
import { TileBag, Tile } from './game/TileBag';
import { calculateTurnScore } from './game/Scoring';

interface SimPlayer {
  character: AICharacter;
  score: number;
  rack: Tile[];
  turnsTaken: number;
}

const NUM_GAMES = 10;
const MAX_ROUNDS = 50;
const SIM_CHARACTERS: AICharacter[] = ['wisey', 'smarty', 'okie', 'sloppy'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function simulateGame(
  ai: AI,
  gameIdx: number
): Promise<Record<AICharacter, { score: number; turns: number }>> {
  const board = new Board();
  const tileBag = new TileBag();

  const players: SimPlayer[] = shuffle(
    SIM_CHARACTERS.map(c => ({ character: c, score: 0, rack: [] as Tile[], turnsTaken: 0 }))
  );

  for (const p of players) p.rack = tileBag.draw(7);

  let consecutivePasses = 0;

  gameLoop:
  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const player of players) {
      if (player.rack.length === 0 && tileBag.isEmpty()) break gameLoop;

      const move = await ai.findMove(board, player.rack, player.character, true);

      if (!move) {
        consecutivePasses++;
        if (consecutivePasses >= 8) break gameLoop;
        continue;
      }

      consecutivePasses = 0;

      for (const p of move.placements) {
        board.placeTile(p.tile, p.row, p.col);
      }

      const wordsFormed = board.findWordsFormed(move.placements);
      if (wordsFormed.length === 0) {
        for (const p of move.placements) board.removeTile(p.row, p.col);
        consecutivePasses++;
        if (consecutivePasses >= 8) break gameLoop;
        continue;
      }

      const { totalScore } = calculateTurnScore(wordsFormed, move.placements.length);
      player.score += totalScore;
      player.turnsTaken++;

      const placedIds = new Set(move.placements.map(p => p.tile.id));
      player.rack = player.rack.filter(t => !placedIds.has(t.id));
      player.rack.push(...tileBag.draw(7 - player.rack.length));
    }
  }

  const result = {} as Record<AICharacter, { score: number; turns: number }>;
  for (const c of SIM_CHARACTERS) result[c] = { score: 0, turns: 0 };
  for (const p of players) {
    result[p.character] = { score: p.score, turns: p.turnsTaken };
  }

  const order = players.map(p => p.character[0].toUpperCase()).join('');
  console.log(
    `  Game ${String(gameIdx + 1).padStart(2)}: ` +
    `Wisey=${String(result.wisey.score).padStart(4)} | ` +
    `Smarty=${String(result.smarty.score).padStart(4)} | ` +
    `Okie=${String(result.okie.score).padStart(4)} | ` +
    `Sloppy=${String(result.sloppy.score).padStart(4)}  (order: ${order})`
  );
  return result;
}

async function main() {
  console.log('Loading dictionary...');
  const validator = new Validator();
  const ai = new AI(validator);

  console.log(`\nRunning ${NUM_GAMES} games (4 players, shuffled turn order)\n`);

  const totals = {} as Record<AICharacter, number>;
  const allScores = {} as Record<AICharacter, number[]>;
  const wins = {} as Record<AICharacter, number>;
  const totalTurns = {} as Record<AICharacter, number>;
  for (const c of SIM_CHARACTERS) { totals[c] = 0; allScores[c] = []; wins[c] = 0; totalTurns[c] = 0; }

  for (let i = 0; i < NUM_GAMES; i++) {
    const result = await simulateGame(ai, i);
    let maxScore = -1;
    let winner: AICharacter = 'wisey';
    for (const c of SIM_CHARACTERS) {
      totals[c] += result[c].score;
      allScores[c].push(result[c].score);
      totalTurns[c] += result[c].turns;
      if (result[c].score > maxScore) {
        maxScore = result[c].score;
        winner = c;
      }
    }
    wins[winner]++;
  }

  console.log('\n' + '='.repeat(80));
  console.log('RESULTS SUMMARY (4-player shared board, shuffled turn order)');
  console.log('='.repeat(80));

  const avgs = {} as Record<AICharacter, number>;

  for (const c of SIM_CHARACTERS) {
    const avg = totals[c] / NUM_GAMES;
    avgs[c] = avg;
    const min = Math.min(...allScores[c]);
    const max = Math.max(...allScores[c]);
    const avgT = (totalTurns[c] / NUM_GAMES).toFixed(1);
    const avgPT = totalTurns[c] > 0 ? (totals[c] / totalTurns[c]).toFixed(1) : '0';
    console.log(
      `  ${c.toUpperCase().padEnd(8)} | Avg: ${avg.toFixed(1).padStart(6)} | ` +
      `Min: ${String(min).padStart(4)} | Max: ${String(max).padStart(4)} | ` +
      `Wins: ${String(wins[c]).padStart(2)}/${NUM_GAMES} | ` +
      `Turns: ${avgT} | Avg/Turn: ${avgPT}`
    );
  }

  console.log('='.repeat(80));

  const ordered = avgs.wisey >= avgs.smarty && avgs.smarty >= avgs.okie && avgs.okie >= avgs.sloppy;

  if (ordered) {
    console.log('PASS: Wisey > Smarty > Okie > Sloppy');
  } else {
    console.log('FAIL: Order not as expected!');
    console.log(
      `   Wisey: ${avgs.wisey.toFixed(1)}, Smarty: ${avgs.smarty.toFixed(1)}, ` +
      `Okie: ${avgs.okie.toFixed(1)}, Sloppy: ${avgs.sloppy.toFixed(1)}`
    );
  }

  const gap = (a: number, b: number) => ((a - b) / a * 100).toFixed(1);
  console.log(`\nScore gaps:`);
  console.log(`  Wisey -> Smarty:  ${gap(avgs.wisey, avgs.smarty)}%`);
  console.log(`  Smarty -> Okie:   ${gap(avgs.smarty, avgs.okie)}%`);
  console.log(`  Okie -> Sloppy:   ${gap(avgs.okie, avgs.sloppy)}%`);

  if (!ordered) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Simulation error:', err);
  process.exit(1);
});
