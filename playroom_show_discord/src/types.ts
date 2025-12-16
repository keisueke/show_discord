
export type Phase = 'LOBBY' | 'QUESTION' | 'ANSWERING' | 'REVEAL' | 'SCORING';

export interface GameState {
    phase: Phase;
    currentQuestion: string | null;
    // Answers are stored in Player state in Playroom usually, or global state
    // Let's store them in global state for easier median calculation by host
    // But Playroom style is often "player.setState('answer', 10)"
    // We'll use Playroom Player State for individual answers
    result?: {
        median: number;
    };
}
