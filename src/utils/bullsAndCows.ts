/**
 * Calculates Bulls and Cows for a 4-digit guess against a secret.
 * Handles repeated digits correctly using frequency counting.
 *
 * Bull  = correct digit, correct position
 * Cow   = correct digit, wrong position
 */
export function calculateBullsAndCows(
  guess: string,
  secret: string
): { bulls: number; cows: number } {
  let bulls = 0;
  const secretFreq: Record<string, number> = {};
  const guessFreq: Record<string, number> = {};

  for (let i = 0; i < 4; i++) {
    if (guess[i] === secret[i]) {
      bulls++;
    } else {
      secretFreq[secret[i]] = (secretFreq[secret[i]] ?? 0) + 1;
      guessFreq[guess[i]] = (guessFreq[guess[i]] ?? 0) + 1;
    }
  }

  let cows = 0;
  for (const digit in guessFreq) {
    if (secretFreq[digit]) {
      cows += Math.min(guessFreq[digit], secretFreq[digit]);
    }
  }

  return { bulls, cows };
}
