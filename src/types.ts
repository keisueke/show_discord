
export type Phase = 'LOBBY' | 'QUESTION' | 'ANSWERING' | 'REVEAL' | 'SCORING';

export interface Player {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  score: number;
}

export interface GameState {
  phase: Phase;
  players: Record<string, Player>;
  currentQuestion: string | null;
  answers: Record<string, number>;
  result?: {
    median: number;
    winnerId?: string; // Winner of the round
  };
}
