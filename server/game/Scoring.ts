import { WordFound } from './Board';
import { PremiumType, getPremiumAt } from './Board';

export interface WordScore {
  word: string;
  score: number;
}

export function calculateTurnScore(wordsFormed: WordFound[], tilesPlayedCount: number): { words: WordScore[]; totalScore: number } {
  const wordScores: WordScore[] = [];
  let totalScore = 0;

  for (const wordFound of wordsFormed) {
    let wordBase = 0;
    let wordMultiplier = 1;

    for (const t of wordFound.tiles) {
      let tilePoints = t.tile.isBlank ? 0 : t.tile.points;

      if (t.isNew) {
        const premium = getPremiumAt(t.row, t.col);
        switch (premium) {
          case 'DL':
            tilePoints *= 2;
            break;
          case 'TL':
            tilePoints *= 3;
            break;
          case 'DW':
            wordMultiplier *= 2;
            break;
          case 'TW':
            wordMultiplier *= 3;
            break;
        }
      }

      wordBase += tilePoints;
    }

    const score = wordBase * wordMultiplier;
    wordScores.push({ word: wordFound.word, score });
    totalScore += score;
  }

  // Bingo bonus: +50 if player used all 7 tiles
  if (tilesPlayedCount === 7) {
    totalScore += 50;
  }

  return { words: wordScores, totalScore };
}

export function calculateEndGameDeductions(
  playerRacks: Map<string, { points: number }[]>
): Map<string, number> {
  const deductions = new Map<string, number>();
  let totalUnplayed = 0;
  let playerWhoFinished: string | null = null;

  for (const [playerId, rack] of playerRacks) {
    const rackValue = rack.reduce((sum, tile) => sum + tile.points, 0);
    if (rackValue === 0) {
      playerWhoFinished = playerId;
    } else {
      deductions.set(playerId, -rackValue);
      totalUnplayed += rackValue;
    }
  }

  if (playerWhoFinished) {
    deductions.set(playerWhoFinished, totalUnplayed);
  }

  return deductions;
}
