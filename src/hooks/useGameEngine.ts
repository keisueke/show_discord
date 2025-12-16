import { useEffect } from 'react';
import { onPlayerJoin, useMultiplayerState, usePlayersList, myPlayer, isHost, RPC } from 'playroomkit';
import type { Phase, Question, GameSettings } from '../types';
import { QUESTIONS } from '../game/questions';

export const useGameEngine = () => {
    // ----------------------
    // Global Synced State
    // ----------------------
    const [phase, setPhase] = useMultiplayerState<Phase>('phase', 'LOBBY');
    const [settings, setSettings] = useMultiplayerState<GameSettings>('settings', { maxRounds: 3, timeLimit: 30 });
    const [adminId, setAdminId] = useMultiplayerState<string | null>('adminId', null);

    // Game Flow State
    const [playerOrder, setPlayerOrder] = useMultiplayerState<string[]>('playerOrder', []);
    const [questionerId, setQuestionerId] = useMultiplayerState<string | null>('questionerId', null);
    const [questionCandidates, setQuestionCandidates] = useMultiplayerState<Question[]>('questionCandidates', []);
    const [currentQuestion, setCurrentQuestion] = useMultiplayerState<Question | null>('currentQuestion', null);

    // Result State
    const [result, setResult] = useMultiplayerState<any>('result', null);
    const [currentRound, setCurrentRound] = useMultiplayerState<number>('currentRound', 0);

    // ----------------------
    // Player List & Local
    // ----------------------
    const players = usePlayersList(true); // Auto-sorted
    const myself = myPlayer();

    // ----------------------
    // Host Logic (Authority)
    // ----------------------
    useEffect(() => {
        if (!isHost()) return;

        // Player Joining Management
        const unsubscribe = onPlayerJoin(() => {
            // We don't use the player object here directly for now since we depend on the list
        });

        return () => unsubscribe();
    }, []);

    // Sync player order with actual players list (Host authoritative)
    useEffect(() => {
        if (!isHost()) return;

        const currentIds = players.map(p => p.id);
        // If we have a stored order, we want to keep it but add new people at the end.
        // We also want to remove people who left? (Maybe keep them for history or handle dropouts)
        // Let's implemented simple "Add new" logic.

        let newOrder = [...playerOrder];
        let changed = false;

        // Add missing
        currentIds.forEach(id => {
            if (!newOrder.includes(id)) {
                newOrder.push(id);
                changed = true;
            }
        });

        // Set Admin if needed
        if (players.length > 0 && !adminId) {
            setAdminId(players[0].id);
        }

        if (changed) {
            setPlayerOrder(newOrder);
        }

    }, [players, isHost()]); // Re-run when players list changes

    // Check Answers Logic (Host Only)
    useEffect(() => {
        if (!isHost() || phase !== 'QUESTION') return;

        const allAnswered = players.length > 0 && players.every(p => p.getState('answer') !== undefined);
        if (allAnswered) {
            // Move to Reveal
            const answerValues = players.map(p => ({
                id: p.id,
                val: p.getState('answer') as number
            })).sort((a, b) => a.val - b.val);

            const mid = Math.floor(answerValues.length / 2);
            let median = 0;
            if (answerValues.length > 0) {
                median = answerValues.length % 2 !== 0 ? answerValues[mid].val : (answerValues[mid - 1].val + answerValues[mid].val) / 2;
            }

            setResult({ median });
            setPhase('REVEAL');
        }
    }, [players, phase]);

    // ----------------------
    // Actions (Exposed to UI)
    // ----------------------

    const startGame = () => {
        if (!isHost()) return;

        const firstQuestioner = playerOrder[0];
        setPhase('QUESTION_SELECTION');
        setQuestionerId(firstQuestioner);
        setQuestionCandidates(getRandomCandidates());
        setCurrentRound(1);
        RPC.call('resetAnswers', {}, RPC.Mode.ALL);
    };

    const updateSettings = (newSettings: GameSettings) => {
        setSettings(newSettings);
    };

    const transferAdmin = (newAdminId: string) => {
        setAdminId(newAdminId);
    };

    const selectQuestion = (q: Question) => {
        setPhase('QUESTION');
        setCurrentQuestion(q);
        setQuestionCandidates([]); // Clear candidates
    };

    const submitAnswer = (val: number) => {
        myself.setState('answer', val);
    };

    const nextRound = () => {
        // Calculate next turn
        const currentIndex = playerOrder.indexOf(questionerId || '');
        const nextIndex = (currentIndex + 1) % playerOrder.length;
        const nextQId = playerOrder[nextIndex];
        const isCycleComplete = nextIndex === 0;

        const nextR = isCycleComplete ? currentRound + 1 : currentRound;

        if (nextR > settings.maxRounds && isCycleComplete) {
            // Game Over -> Lobby
            setPhase('LOBBY');
            setCurrentRound(0);
            setQuestionerId(null);
            setResult(null);
        } else {
            // Next Question
            setPhase('QUESTION_SELECTION');
            setQuestionerId(nextQId);
            setQuestionCandidates(getRandomCandidates());
            setCurrentRound(nextR);
            setResult(null);
            setCurrentQuestion(null);
            RPC.call('resetAnswers', {}, RPC.Mode.ALL);
        }
    };

    // Helper
    const getRandomCandidates = (): Question[] => {
        const shuffled = [...QUESTIONS].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 4);
    };

    return {
        // State
        phase,
        settings,
        adminId,
        playerOrder,
        questionerId,
        questionCandidates,
        currentQuestion,
        result,
        currentRound,
        players,
        myself,

        // Actions
        startGame,
        updateSettings,
        transferAdmin,
        selectQuestion,
        submitAnswer,
        nextRound,

        // Utils
        isHost: isHost()
    };
};

// Registered RPCs
RPC.register('resetAnswers', async () => {
    myPlayer().setState('answer', undefined);
});
