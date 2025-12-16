import { useState, useEffect } from 'react';
import { onPlayerJoin, useMultiplayerState, usePlayersList, myPlayer, isHost, RPC } from 'playroomkit';
import type { GameState, Phase } from '../types';

export const useGameEngine = () => {
    // Global State (Synced)
    const [phase, setPhase] = useMultiplayerState<Phase>('phase', 'LOBBY');
    const [currentQuestion, setCurrentQuestion] = useMultiplayerState<string | null>('question', null);
    const [result, setResult] = useMultiplayerState<any>('result', null);

    // Players List (Synced by Playroom)
    const players = usePlayersList(true); // true = ensure sorted/stable? or just sync

    const myself = myPlayer();

    // Host Logic to manage game flow
    useEffect(() => {
        if (!isHost()) return;

        // Listen for connection usually handled auto, but we can do extra setup per player if needed
        onPlayerJoin((player) => {
            console.log("Player joined:", player.getProfile().name);
        });

    }, []);

    // Actions (RPC or State Updates)

    const startGame = () => {
        if (!isHost()) return;
        setPhase('QUESTION');
        setCurrentQuestion("今の気分を0〜100で表すと？"); // Mock question hook
        setResult(null);

        // Reset player answers
        RPC.call('resetAnswers', {}, RPC.Mode.ALL);
    };

    const submitAnswer = (val: number) => {
        myself.setState('answer', val);
    };

    const nextRound = () => {
        if (!isHost()) return;
        setPhase('QUESTION');
        setCurrentQuestion("次の質問: " + Math.random());
        setResult(null);
        RPC.call('resetAnswers', {}, RPC.Mode.ALL);
    };

    // Checking for all answers (Host Only)
    useEffect(() => {
        if (!isHost() || phase !== 'QUESTION') return;

        const allAnswered = players.every(p => p.getState('answer') !== undefined);
        if (allAnswered && players.length > 0) {
            // Transition to Reveal
            setPhase('REVEAL');

            // Calculate results
            const answerValues = players.map(p => ({
                id: p.id,
                val: p.getState('answer') as number
            })).sort((a, b) => a.val - b.val);

            const mid = Math.floor(answerValues.length / 2);
            const median = answerValues.length % 2 !== 0 ? answerValues[mid].val : (answerValues[mid - 1].val + answerValues[mid].val) / 2;

            setResult({ median });
        }
    }, [players, phase, setPhase, setResult]);

    // Define RPC for resetting answers (since we can't easily iterate and set state of others without authority, 
    // actually Host CAN set state of others in Playroom? No, usually safer to ask them or use global state for answers map.
    // Playroom pattern: Player owns their state.
    // Workaround: We use a new 'roundId' to invalidate old answers, or players listen to an event to unset.
    // Simplest: Host sets global `roundId`. App component checks roundId change and clears local input.

    return {
        phase,
        currentQuestion,
        result,
        players,
        myself,
        startGame,
        submitAnswer,
        nextRound,
        isHost: isHost()
    };
};

// RPC Registration needs to happen at top level or inside persistent effect
RPC.register('resetAnswers', () => {
    myPlayer().setState('answer', undefined);
});
