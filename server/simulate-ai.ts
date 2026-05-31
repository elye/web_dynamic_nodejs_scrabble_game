/**
 * AI Difficulty Simulation
 * 
 * 4 players (Genius, Hard, Medium, Easy) share a board.
 * Turn order is shuffled each game to eliminate first-mover bias.
 * Runs 10 games and verifies average scores follow Genius > Hard > Medium > Easy.
 * 
 * Usage: npx ts-node server/simulate-ai.ts
 */

import { Validator } from './game/Validator';
import { AI } from './game/AI';
import { Board } from './game/Board';
import { TileBag, Tile } from './game/TileBag';
import { calculateTurnScore } from './game/Scoring';

type Difficulty = 'easy' | 'medium' | 'hard' | 'genius';

interface SimPlayer {
  difficulty: Difficulty;
  score: number;
  rack: Tile[];
  turnsTaken: number;
}

const NUM_GAMES = 10;
const MAX_ROUNDS = 50;

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
): Promise<Record<Difficulty, { score: number; turns: number }>> {
  const board = new Board();
  const tileBag = new TileBag();

  const players: SimPlayer[] = shuffle([
    { difficulty: 'genius' as Difficulty, score: 0, rack: [], turnsTaken: 0 },
    { difficulty: 'hard' as Difficulty, score: 0, rack: [], turnsTaken: 0 },
    { difficulty: 'medium' as Difficulty, score: 0, rack: [], turnsTaken: 0 },
    { difficulty: 'easy' as Difficulty, score: 0, rack: [], turnsTaken: 0 },
  ]);

  for (const p of players) p.rack = tileBag.draw(7);

  let consecutivePasses = 0;

  gameLoop:
  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const player of players) {
      if (player.rack.length === 0 && tileBag.isEmpty()) break gameLoop;

      const move = await ai.findMove(board, player.rack, player.difficulty, true);

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

  const result: Record<Difficulty, { score: number; turns: number }> = {
    genius: { score: 0, turns: 0 },
    hard: { score: 0, turns: 0 },
    medium: { score: 0, turns: 0 },
    easy: { score: 0, turns: 0 },
  };
  for (const p of players) {
    result[p.difficulty] = { score: p.score, turns: p.turnsTaken };
  }

  const order = players.map(p => p.difficulty[0].toUpperCase()).join('');
  console.log(
    `  Game ${String(gameIdx + 1).padStart(2)}: ` +
    `Genius=${String(result.genius.score).padStart(4)} | ` +
    `Hard=${String(result.hard.score).padStart(4)} | ` +
    `Medium=${String(result.medium.score).padStart(4)} | ` +
    `Easy=${String(result.easy.score).padStart(4)}  (order: ${order})`
  );
  return result;
}

async function main() {
  console.log('Loading dictionary...');
  const validator = new Validator();
  const ai = new AI(validator);

  console.log(`\nRunning ${NUM_GAMES} games (4 players, shuffled turn order)\n`);

  const totals: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, genius: 0 };
  const allScores: Record<Difficulty, number[]> = { easy: [], medium: [], hard: [], genius: [] };
  const wins: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, genius: 0 };
  const totalTurns: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, genius: 0 };

  for (let i = 0; i < NUM_GAMES; i++) {
    const result = await simulateGame(ai, i);
    let maxScore = -1;
    let winner: Difficulty = 'genius';
    for (const diff of ['genius', 'hard', 'medium', 'easy'] as Difficulty[]) {
      totals[diff] += result[diff].score;
      allScores[diff].push(result[diff].score);
      totalTurns[diff] += result[diff].turns;
      if (result[diff].score > maxScore) {
        maxScore = result[diff].score;
        winner = diff;
      }
    }
    wins[winner]++;
  }

  console.log('\n' + '='.repeat(80));
  console.log('RESULTS SUMMARY (4-player shared board, shuffled turn order)');
  console.log('='.repeat(80));

  const avgs: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, genius: 0 };

  for (const diff of ['genius', 'hard', 'medium', 'easy'] as Difficulty[]) {
    const avg = totals[diff] / NUM_GAMES;
    avgs[diff] = avg;
    const min = Math.min(...allScores[diff]);
    const max = Math.max(...allScores[diff]);
    const avgT = (totalTurns[diff] / NUM_GAMES).toFixed(1);
    const avgPT = totalTurns[diff] > 0 ? (totals[diff] / totalTurns[diff]).toFixed(1) : '0';
    console.log(
      `  ${diff.toUpperCase().padEnd(8)} | Avg: ${avg.toFixed(1).padStart(6)} | ` +
      `Min: ${String(min).padStart(4)} | Max: ${String(max).padStart(4)} | ` +
      `Wins: ${String(wins[diff]).padStart(2)}/${NUM_GAMES} | ` +
      `Turns: ${avgT} | Avg/Turn: ${avgPT}`
    );
  }

  console.log('='.repeat(80));

  const ordered = avgs.genius >= avgs.hard && avgs.hard >= avgs.medium && avgs.medium >= avgs.easy;

  if (ordered) {
    console.log('PASS: Genius > Hard > Medium > Easy');
  } else {
    console.log('FAIL: Order not as expected!');
    console.log(
      `   Genius: ${avgs.genius.toFixed(1)}, Hard: ${avgs.hard.toFixed(1)}, ` +
      `Medium: ${avgs.medium.toFixed(1)}, Easy: ${avgs.easy.toFixed(1)}`
    );
  }

  const gap = (a: number, b: number) => ((a - b) / a * 100).toFixed(1);
  console.log(`\nScore gaps:`);
  console.log(`  Genius -> Hard:   ${gap(avgs.genius, avgs.hard)}%`);
  console.log(`  Hard -> Medium:   ${gap(avgs.hard, avgs.medium)}%`);
  console.log(`  Medium -> Easy:   ${gap(avgs.medium, avgs.easy)}%`);

  if (!ordered) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Simulation error:', err);
  process.exit(1);
});
