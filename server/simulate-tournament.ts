/**
 * AI Round-Robin Tournament
 * 
 * All 7 AI characters play 1v1 against each other.
 * Each matchup plays 10 games with randomized starting turn.
 * Results displayed in a 2D win/loss table.
 * 
 * Usage: npx ts-node server/simulate-tournament.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Validator } from './game/Validator';
import { AI, AICharacter, ALL_AI_CHARACTERS, AI_CHARACTER_INFO } from './game/AI';
import { Board } from './game/Board';
import { TileBag, Tile } from './game/TileBag';
import { calculateTurnScore } from './game/Scoring';

const OUTPUT_DIR = path.join(__dirname, '..', '_output_');

function boardToText(board: Board, players: { character: AICharacter; score: number; turnsTaken: number }[]): string {
  const lines: string[] = [];

  // Header with player scores
  for (const p of players) {
    const info = AI_CHARACTER_INFO[p.character];
    lines.push(`${info.emoji} ${info.name}: ${p.score} pts (${p.turnsTaken} turns)`);
  }
  lines.push('');

  // Column numbers
  lines.push('    ' + Array.from({ length: 15 }, (_, i) => String(i).padStart(2)).join(' '));
  lines.push('   +' + '--'.repeat(15) + '-+');

  const premiumLabels: Record<string, string> = { TW: '≡', DW: '=', TL: '"', DL: '\'' };

  for (let r = 0; r < 15; r++) {
    let row = String(r).padStart(2) + ' |';
    for (let c = 0; c < 15; c++) {
      const cell = board.cells[r][c];
      if (cell.tile) {
        const letter = cell.tile.isBlank ? (cell.tile.chosenLetter || '_').toLowerCase() : cell.tile.letter;
        row += ' ' + letter;
      } else if (cell.premium) {
        row += ' ' + premiumLabels[cell.premium];
      } else {
        row += ' .';
      }
    }
    row += ' |';
    lines.push(row);
  }

  lines.push('   +' + '--'.repeat(15) + '-+');
  lines.push('');
  lines.push('Legend: ≡=TW  ==DW  "=TL  \'=DL  .=empty  lowercase=blank tile');

  return lines.join('\n');
}

interface SimPlayer {
  character: AICharacter;
  score: number;
  rack: Tile[];
  turnsTaken: number;
}

const GAMES_PER_MATCHUP = 10;
const MAX_ROUNDS = 50;

async function simulate1v1(
  ai: AI,
  char1: AICharacter,
  char2: AICharacter
): Promise<{ winner: AICharacter | 'draw'; scores: [number, number]; board: Board; players: { character: AICharacter; score: number; turnsTaken: number }[] }> {
  const board = new Board();
  const tileBag = new TileBag();

  // Randomize who goes first
  const players: SimPlayer[] = Math.random() < 0.5
    ? [
        { character: char1, score: 0, rack: [], turnsTaken: 0 },
        { character: char2, score: 0, rack: [], turnsTaken: 0 },
      ]
    : [
        { character: char2, score: 0, rack: [], turnsTaken: 0 },
        { character: char1, score: 0, rack: [], turnsTaken: 0 },
      ];

  for (const p of players) p.rack = tileBag.draw(7);

  let consecutivePasses = 0;

  gameLoop:
  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const player of players) {
      if (player.rack.length === 0 && tileBag.isEmpty()) break gameLoop;

      const move = await ai.findMove(board, player.rack, player.character, true);

      if (!move) {
        consecutivePasses++;
        if (consecutivePasses >= 4) break gameLoop;
        continue;
      }

      consecutivePasses = 0;

      const wordsFormed = board.findWordsFormed(move.placements);
      if (wordsFormed.length === 0) {
        consecutivePasses++;
        if (consecutivePasses >= 4) break gameLoop;
        continue;
      }

      // Commit tiles to the board after validation
      for (const p of move.placements) {
        board.placeTile(p.tile, p.row, p.col);
      }

      const { totalScore } = calculateTurnScore(wordsFormed, move.placements.length);
      player.score += totalScore;
      player.turnsTaken++;

      const placedIds = new Set(move.placements.map(p => p.tile.id));
      player.rack = player.rack.filter(t => !placedIds.has(t.id));
      player.rack.push(...tileBag.draw(7 - player.rack.length));
    }
  }

  const p1 = players.find(p => p.character === char1)!;
  const p2 = players.find(p => p.character === char2)!;

  let winner: AICharacter | 'draw';
  if (p1.score > p2.score) winner = char1;
  else if (p2.score > p1.score) winner = char2;
  else winner = 'draw';

  return {
    winner,
    scores: [p1.score, p2.score],
    board,
    players: players.map(p => ({ character: p.character, score: p.score, turnsTaken: p.turnsTaken })),
  };
}

async function main() {
  console.log('Loading dictionary...');
  const validator = new Validator();
  const ai = new AI(validator);

  const characters = ALL_AI_CHARACTERS;
  const totalMatchups = (characters.length * (characters.length - 1)) / 2;
  const totalGames = totalMatchups * GAMES_PER_MATCHUP;

  // Create output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`\nRound-Robin Tournament: ${characters.length} AI characters`);
  console.log(`${totalMatchups} matchups × ${GAMES_PER_MATCHUP} games = ${totalGames} total games`);
  console.log(`Board dumps: ${OUTPUT_DIR}\n`);

  // Initialize results: wins[a][b] = number of times a beat b
  const wins: Record<AICharacter, Record<AICharacter, number>> = {} as any;
  const draws: Record<string, number> = {};
  const totalScores: Record<AICharacter, number> = {} as any;
  const totalGamesPlayed: Record<AICharacter, number> = {} as any;

  for (const c of characters) {
    wins[c] = {} as Record<AICharacter, number>;
    totalScores[c] = 0;
    totalGamesPlayed[c] = 0;
    for (const c2 of characters) {
      wins[c][c2] = 0;
    }
  }

  let gamesPlayed = 0;

  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const c1 = characters[i];
      const c2 = characters[j];
      const key = `${c1}-${c2}`;
      draws[key] = 0;

      const info1 = AI_CHARACTER_INFO[c1];
      const info2 = AI_CHARACTER_INFO[c2];
      process.stdout.write(`  ${info1.emoji} ${info1.name} vs ${info2.emoji} ${info2.name}: `);

      for (let g = 0; g < GAMES_PER_MATCHUP; g++) {
        const result = await simulate1v1(ai, c1, c2);
        if (result.winner === c1) {
          wins[c1][c2]++;
          process.stdout.write(info1.name[0]);
        } else if (result.winner === c2) {
          wins[c2][c1]++;
          process.stdout.write(info2.name[0]);
        } else {
          draws[key]++;
          process.stdout.write('D');
        }
        gamesPlayed++;

        // Accumulate scores for average tracking
        for (const p of result.players) {
          totalScores[p.character] += p.score;
          totalGamesPlayed[p.character]++;
        }

        // Dump board to file
        const filename = `${info1.name}x${info2.name}x${g + 1}.txt`;
        const boardText = boardToText(result.board, result.players);
        const winnerLabel = result.winner === 'draw' ? 'DRAW' : `Winner: ${AI_CHARACTER_INFO[result.winner].name}`;
        const content = `${info1.name} vs ${info2.name} — Game ${g + 1}\n${winnerLabel}\n\n${boardText}\n`;
        fs.writeFileSync(path.join(OUTPUT_DIR, filename), content);
      }

      const d = draws[key];
      console.log(
        `  → ${info1.name} ${wins[c1][c2]}W` +
        ` | ${info2.name} ${wins[c2][c1]}W` +
        (d > 0 ? ` | ${d} draws` : '')
      );
    }
  }

  // Compute total wins/losses per character
  const totalWins: Record<AICharacter, number> = {} as any;
  const totalLosses: Record<AICharacter, number> = {} as any;
  for (const c of characters) {
    totalWins[c] = 0;
    totalLosses[c] = 0;
    for (const c2 of characters) {
      if (c !== c2) {
        totalWins[c] += wins[c][c2];
        totalLosses[c] += wins[c2][c];
      }
    }
  }

  // Sort by total wins descending
  const sorted = [...characters].sort((a, b) => totalWins[b] - totalWins[a]);

  // Print 2D WINS table (row = winner, col = opponent, cell = wins by row over col)
  const colW = 8;
  const nameW = 10;

  console.log('\n' + '='.repeat(90));
  console.log('WINS TABLE — each cell = how many times ROW beat COLUMN (out of ' + GAMES_PER_MATCHUP + ')');
  console.log('='.repeat(90));

  let header = ''.padEnd(nameW) + ' |';
  for (const c of sorted) {
    header += ` ${AI_CHARACTER_INFO[c].name.padStart(colW)} |`;
  }
  header += '   W |  L |  W%';
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const row of sorted) {
    let line = `${(AI_CHARACTER_INFO[row].emoji + ' ' + AI_CHARACTER_INFO[row].name).padEnd(nameW)} |`;
    for (const col of sorted) {
      if (row === col) {
        line += ` ${'·'.padStart(colW)} |`;
      } else {
        line += ` ${String(wins[row][col]).padStart(colW)} |`;
      }
    }
    const w = totalWins[row];
    const l = totalLosses[row];
    const pct = ((w / (w + l)) * 100).toFixed(0);
    line += ` ${String(w).padStart(3)} | ${String(l).padStart(2)} | ${pct.padStart(3)}%`;
    console.log(line);
  }

  console.log('-'.repeat(header.length));

  // Leaderboard
  console.log('\nLEADERBOARD:');
  sorted.forEach((c, idx) => {
    const info = AI_CHARACTER_INFO[c];
    const w = totalWins[c];
    const l = totalLosses[c];
    const pct = ((w / (w + l)) * 100).toFixed(1);
    console.log(`  ${idx + 1}. ${info.emoji} ${info.name.padEnd(8)} ${w}W-${l}L (${pct}%)`);
  });

  // Average scores
  console.log('\nAVERAGE SCORES:');
  const sortedByAvg = [...characters].sort((a, b) => {
    const avgA = totalGamesPlayed[a] > 0 ? totalScores[a] / totalGamesPlayed[a] : 0;
    const avgB = totalGamesPlayed[b] > 0 ? totalScores[b] / totalGamesPlayed[b] : 0;
    return avgB - avgA;
  });
  for (const c of sortedByAvg) {
    const info = AI_CHARACTER_INFO[c];
    const avg = totalGamesPlayed[c] > 0 ? (totalScores[c] / totalGamesPlayed[c]).toFixed(1) : '0.0';
    console.log(`  ${info.emoji} ${info.name.padEnd(8)} avg ${avg} pts (${totalGamesPlayed[c]} games, ${totalScores[c]} total)`);
  }

  console.log('\n' + '='.repeat(100));
}

main().catch(err => {
  console.error('Tournament error:', err);
  process.exit(1);
});
