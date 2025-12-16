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
    const [scores, setScores] = useMultiplayerState<Record<string, number>>('scores', {});
    const [isDoubleScore, setIsDoubleScore] = useMultiplayerState<boolean>('isDoubleScore', false);

    // ----------------------
    // Player List & Local
    // ----------------------
    const players = usePlayersList(true); // Auto-sorted
    const myself = myPlayer();
    
    // デバッグ: プレイヤー状態をログに出力
    useEffect(() => {
        console.log('[GAME ENGINE]', {
            playersCount: players.length,
            myselfExists: !!myself,
            myselfId: myself?.id,
            phase,
            adminId
        });
    }, [players.length, myself, phase, adminId]);

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

    // Update Scores Helper
    const updateScores = (changes: Record<string, number>) => {
        const newScores = { ...scores };
        Object.entries(changes).forEach(([pid, change]) => {
            newScores[pid] = (newScores[pid] || 0) + change;
        });
        setScores(newScores);
    };

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

            // Calculate Median
            const mid = Math.floor(answerValues.length / 2);
            let median = 0;
            if (answerValues.length > 0) {
                median = answerValues.length % 2 !== 0 ? answerValues[mid].val : (answerValues[mid - 1].val + answerValues[mid].val) / 2;
            }

            // Scoring Logic
            const scoreChanges: Record<string, number> = {};
            const multiplier = isDoubleScore ? 2 : 1;

            if (answerValues.length >= 2) {
                // 1. Calculate Distances
                const withDist = answerValues.map(a => ({ ...a, dist: Math.abs(a.val - median) }));
                const minDist = Math.min(...withDist.map(a => a.dist));

                // 2. Find Winners (Closest to median)
                // Bonus for exact match? Plan said +100 for closest.
                // Let's stick to: Closest (+100 * multiplier).
                withDist.filter(a => a.dist === minDist).forEach(winner => {
                    scoreChanges[winner.id] = 100 * multiplier;
                });

                // 3. Find Losers (Max/Min) - Only if 3+ players
                if (players.length >= 3) {
                    const maxVal = answerValues[answerValues.length - 1].val;
                    const minVal = answerValues[0].val;

                    // Exemption: If Max == Median or Min == Median (i.e., everyone voted same), or Max == Min
                    const isFlat = maxVal === minVal;

                    if (!isFlat) {
                        // Max Punishment
                        if (maxVal !== median) {
                            answerValues.filter(a => a.val === maxVal).forEach(p => {
                                // If they are also a winner (closest), skip penalty?
                                // Logic: If closest, they get +100. If they are also max (e.g. Median=50, Val=51 is closest & max),
                                // typically they still get penalty or not?
                                // "Good Line" usually penalizes pure max/min.
                                // If you are closest AND max/min, usually you are safe?
                                // Let's follow simple rule: Max/Min always penalty UNLESS it is the Median.
                                if (Math.abs(p.val - median) !== minDist) {
                                    scoreChanges[p.id] = (scoreChanges[p.id] || 0) - (50 * multiplier);
                                }
                            });
                        }
                        // Min Punishment
                        if (minVal !== median) {
                            answerValues.filter(a => a.val === minVal).forEach(p => {
                                if (Math.abs(p.val - median) !== minDist) {
                                    scoreChanges[p.id] = (scoreChanges[p.id] || 0) - (50 * multiplier);
                                }
                            });
                        }
                    }
                }
            }

            // Apply scores
            updateScores(scoreChanges);

            setResult({ median, scoreChanges });
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

        // Init scores
        const initialScores: Record<string, number> = {};
        playerOrder.forEach(id => initialScores[id] = 0);
        setScores(initialScores);
        setIsDoubleScore(Math.random() < 0.2); // 20% Initial chance? Or always normal first? Let's random.

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

            // Double Score Chance (20%)
            setIsDoubleScore(Math.random() < 0.2);

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
        scores,
        isDoubleScore,
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
