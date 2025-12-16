
export type Phase = 'LOBBY' | 'QUESTION_SELECTION' | 'QUESTION' | 'ANSWERING' | 'REVEAL' | 'SCORING';

export interface Player {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  score: number;
}

export interface Question {
  text: string;
  category: string;
}

export interface GameSettings {
  maxRounds: number;
  timeLimit: number;
}

export interface GameState {
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[]; // IDs in order of turns
  questionerId: string | null;
  questionCandidates: Question[]; // Candidates for the questioner to choose from
  currentQuestion: Question | null;
  answers: Record<string, number>;
  result?: {
    median: number;
    winnerId?: string; // Winner of the round
  };
  adminId: string | null;
  settings: GameSettings;
  currentRound: number; // Current cycle number (1-based)
  questionsCount: number; // Total questions asked so far (0-based or 1-based internal counter)
}
