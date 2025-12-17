
export type Phase = 'LOBBY' | 'QUESTION_SELECTION' | 'QUESTION' | 'ANSWERING' | 'REVEAL' | 'SCORING' | 'RANKING';

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
  playerOrder: string[]; // Order of players for turns
  questionerId: string | null; // ID of the current questioner
  questionCandidates: Question[]; // Two questions to choose from
  currentQuestion: Question | null; // Selected question
  scores: Record<string, number>; // Player scores
  isDoubleScore: boolean; // Chance round flag
  result?: {
    median: number;
    winnerId?: string; // Winner of the round
  };
  adminId: string | null;
  settings: GameSettings;
  currentRound: number; // Current cycle number (1-based)
  questionsCount: number; // Total questions asked so far (0-based or 1-based internal counter)
}
