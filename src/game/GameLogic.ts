import { useState, useCallback } from 'react';
import type { GameState } from '../types';

const INITIAL_STATE: GameState = {
    phase: 'LOBBY',
    players: {},
    currentQuestion: null,
    answers: {},
};

export const useGameLogic = () => {
    const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
    const [selfId, setSelfId] = useState<string | null>(null);

    const joinGame = useCallback((user: { id: string; username: string; discriminator: string; avatar?: string }) => {
        setGameState((prev) => ({
            ...prev,
            players: {
                ...prev.players,
                [user.id]: { ...user, score: 0 },
            },
        }));
        setSelfId(user.id);
    }, []);

    const startGame = useCallback(() => {
        setGameState((prev) => ({
            ...prev,
            phase: 'QUESTION',
            currentQuestion: "一週間のうち、家で食事をする回数は何回？", // Sample question
            answers: {},
            result: undefined,
        }));
    }, []);

    const submitAnswer = useCallback((playerId: string, answer: number) => {
        setGameState((prev) => {
            const newAnswers = { ...prev.answers, [playerId]: answer };
            // Check if all players answered
            // In this local mock, we might move to REVEAL manually or auto if all answered
            return {
                ...prev,
                answers: newAnswers,
            };
        });
    }, []);

    const revealResults = useCallback(() => {
        setGameState((prev) => {
            const answers = Object.values(prev.answers).sort((a, b) => a - b);
            if (answers.length === 0) return prev;

            // Calculate median
            const mid = Math.floor(answers.length / 2);
            const median = answers.length % 2 !== 0 ? answers[mid] : (answers[mid - 1] + answers[mid]) / 2;

            // Find winner (closest to median) - Simplification: exact match or closest
            // Or "Good Line" rules: usually median wins
            // Let's implement: Player closest to median gets points

            // Distribute points logic here if needed

            return {
                ...prev,
                phase: 'REVEAL',
                result: { median }
            };
        });
    }, []);

    const nextRound = useCallback(() => {
        setGameState(prev => ({
            ...prev,
            phase: 'QUESTION',
            currentQuestion: "次の質問...", // TODO: logic to pick random question
            answers: {},
            result: undefined
        }));
    }, []);

    const resetGame = useCallback(() => {
        setGameState({
            ...INITIAL_STATE,
            players: gameState.players // Keep players?
        });
    }, [gameState.players]);

    return {
        gameState,
        selfId,
        joinGame,
        startGame,
        submitAnswer,
        revealResults,
        nextRound,
        resetGame
    };
};
