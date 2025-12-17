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

    // Handle host disconnection and transfer admin to remaining players
    useEffect(() => {
        // ホストが切断された場合、新しいホストが自動的に選ばれる
        // 新しいホストがadminIdを更新する必要がある
        if (!isHost()) return;

        const currentIds = players.map(p => p.id);
        
        // adminIdが現在のプレイヤーリストに存在しない場合、新しいホストを選ぶ
        if (adminId && !currentIds.includes(adminId)) {
            console.log('[HOST TRANSFER] Previous admin disconnected, transferring to new host');
            if (players.length > 0) {
                // 残っているプレイヤーの最初の人を新しいadminにする
                const newAdminId = players[0].id;
                setAdminId(newAdminId);
                console.log('[HOST TRANSFER] New admin set:', newAdminId);
            } else {
                // プレイヤーがいない場合はnullに設定
                setAdminId(null);
            }
        }
    }, [players, adminId, isHost()]);

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
        if (!isHost() || phase !== 'QUESTION' || !currentQuestion) return;

        // 回答状態の変更を監視するために、各プレイヤーの回答状態を取得
        const answerStates = players.map(p => ({
            id: p.id,
            answer: p.getState('answer') as number | undefined
        }));

        // 問題が変わった直後は、すべてのプレイヤーが回答をリセットしているか確認
        // 同期が確実に取れるまでポーリングで待つ
        const checkResetStatus = () => {
            const currentAnswerStates = players.map(p => ({
                id: p.id,
                answer: p.getState('answer') as number | undefined
            }));
            return currentAnswerStates.every(a => a.answer === undefined);
        };
        
        const allReset = checkResetStatus();
        
        // 回答チェックロジックを関数として定義
        const performAnswerCheck = () => {
            // デバッグログ: 回答状態を確認
            const currentAnswerStates = players.map(p => ({
                id: p.id,
                answer: p.getState('answer') as number | undefined
            }));

            console.log('[ANSWER CHECK]', {
                questionText: currentQuestion.text,
                playersCount: players.length,
                answerStates: currentAnswerStates.map(a => ({ id: a.id, hasAnswer: a.answer !== undefined })),
                allAnswered: currentAnswerStates.every(a => a.answer !== undefined)
            });

            // 回答チェックの実行を遅延させ、状態の同期を待つ
            const checkTimeout = setTimeout(() => {
                // 再度回答状態を確認（状態の同期を待った後）
                const delayedAnswerStates = players.map(p => ({
                    id: p.id,
                    answer: p.getState('answer') as number | undefined
                }));

                // すべてのプレイヤーが実際に回答したことを確認
                const allAnswered = delayedAnswerStates.length > 0 && 
                                   delayedAnswerStates.every(a => a.answer !== undefined);

                console.log('[ANSWER CHECK DELAYED]', {
                    questionText: currentQuestion.text,
                    playersCount: delayedAnswerStates.length,
                    answerStates: delayedAnswerStates.map(a => ({ id: a.id, hasAnswer: a.answer !== undefined, answer: a.answer })),
                    allAnswered
                });

                if (allAnswered) {
                    // Move to Reveal
                    const answerValues = delayedAnswerStates
                        .filter(a => a.answer !== undefined)
                        .map(a => ({
                            id: a.id,
                            val: a.answer as number
                        }))
                        .sort((a, b) => a.val - b.val);

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
            }, 200); // 200ms遅延させて状態の同期を待つ

            return checkTimeout;
        };

        // まだリセットされていない場合は、リセットされるまでポーリングで待つ
        if (!allReset) {
            console.log('[ANSWER CHECK] Waiting for answers to reset...', {
                questionText: currentQuestion.text,
                answerStates: answerStates.map(a => ({ id: a.id, hasAnswer: a.answer !== undefined }))
            });
            
            // ポーリング間隔（100msごとにチェック）
            const pollInterval = 100;
            // 最大待機時間（5秒、必要に応じて調整可能）
            const maxWaitTime = 5000;
            let elapsedTime = 0;
            let answerCheckTimeout: NodeJS.Timeout | null = null;
            
            const resetCheckInterval = setInterval(() => {
                elapsedTime += pollInterval;
                
                if (checkResetStatus()) {
                    // すべてリセットされたら、回答チェックを開始
                    console.log('[ANSWER CHECK] All answers reset, proceeding with answer check', {
                        elapsedTime,
                        questionText: currentQuestion.text
                    });
                    clearInterval(resetCheckInterval);
                    
                    // 回答チェックロジックを実行
                    answerCheckTimeout = performAnswerCheck();
                } else if (elapsedTime >= maxWaitTime) {
                    // タイムアウトした場合は警告を出して続行
                    console.warn('[ANSWER CHECK] Timeout waiting for answers to reset, proceeding anyway', {
                        elapsedTime,
                        questionText: currentQuestion.text,
                        answerStates: players.map(p => ({
                            id: p.id,
                            answer: p.getState('answer') as number | undefined
                        }))
                    });
                    clearInterval(resetCheckInterval);
                    
                    // タイムアウト後も回答チェックを実行
                    answerCheckTimeout = performAnswerCheck();
                }
            }, pollInterval);
            
            return () => {
                clearInterval(resetCheckInterval);
                if (answerCheckTimeout) {
                    clearTimeout(answerCheckTimeout);
                }
            };
        }

        // リセットが完了している場合は、すぐに回答チェックを開始
        const checkTimeout = performAnswerCheck();
        return () => clearTimeout(checkTimeout);
    }, [players, phase, currentQuestion, isDoubleScore, updateScores, setResult, setPhase]);

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
        RPC.call('resetAnswers', {}, RPC.Mode.ALL);
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
            // Game Over -> Ranking
            setPhase('RANKING');
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

    const backToLobby = () => {
        if (!isHost()) return;
        setPhase('LOBBY');
        setCurrentRound(0);
        setQuestionerId(null);
        setResult(null);
        setCurrentQuestion(null);
        setQuestionCandidates([]);
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
        backToLobby,

        // Utils
        isHost: isHost()
    };
};

// Registered RPCs
RPC.register('resetAnswers', async () => {
    myPlayer().setState('answer', undefined);
});
