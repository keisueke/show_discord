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
    
    // 問題世代ID: 問題が変わるたびにインクリメントし、前回回答を無効化する
    const [questionSeq, setQuestionSeq] = useMultiplayerState<number>('questionSeq', 0);
    
    // 同期待ち状態: ホストが強制開始できるかどうか
    const [waitingForSync, setWaitingForSync] = useMultiplayerState<boolean>('waitingForSync', false);
    
    // 個人問題のプレイヤー選択用: 一時保存された問題
    const [pendingQuestion, setPendingQuestion] = useMultiplayerState<Question | null>('pendingQuestion', null);

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

        if (changed) {
            setPlayerOrder(newOrder);
        }

    }, [players, isHost()]); // Re-run when players list changes

    // Handle admin initialization and transfer (誰でも実行可能)
    useEffect(() => {
        if (players.length === 0) return;

        const currentIds = players.map(p => p.id);
        
        // adminIdがnullまたは無効な場合、最初のプレイヤーをadminにする
        if (!adminId || !currentIds.includes(adminId)) {
            console.log('[ADMIN INIT] Setting admin to first player', { 
                currentAdminId: adminId, 
                firstPlayerId: players[0].id,
                currentPlayerIds: currentIds 
            });
            const newAdminId = players[0].id;
            setAdminId(newAdminId);
        }
    }, [players, adminId]);

    // Update Scores Helper
    const updateScores = (changes: Record<string, number>) => {
        const newScores = { ...scores };
        Object.entries(changes).forEach(([pid, change]) => {
            newScores[pid] = (newScores[pid] || 0) + change;
        });
        setScores(newScores);
    };

    // Check Answers Logic (Host Only)
    // 問題世代ID (questionSeq) を使って、前回の回答を構造的に無効化
    useEffect(() => {
        if (!isHost() || phase !== 'QUESTION' || !currentQuestion) return;

        // 各プレイヤーの回答状態を取得（answerSeqも含む）
        const getAnswerStates = () => players.map(p => ({
            id: p.id,
            answer: p.getState('answer') as number | undefined,
            answerSeq: p.getState('answerSeq') as number | undefined
        }));

        // 同期済みかどうかを確認（answerSeq === questionSeq）
        const checkSyncStatus = () => {
            const states = getAnswerStates();
            return states.every(a => a.answerSeq === questionSeq);
        };

        // 全員が現在の問題世代で回答済みかどうかを確認
        const checkAllAnswered = () => {
            const states = getAnswerStates();
            return states.length > 0 && states.every(a => 
                a.answerSeq === questionSeq && a.answer !== undefined
            );
        };

        const answerStates = getAnswerStates();
        const allSynced = checkSyncStatus();
        
        console.log('[ANSWER CHECK] Status', {
            questionText: currentQuestion.text,
            questionSeq,
            playersCount: players.length,
            answerStates: answerStates.map(a => ({ 
                id: a.id, 
                answerSeq: a.answerSeq, 
                hasAnswer: a.answer !== undefined 
            })),
            allSynced
        });

        // 同期待ち状態の更新
        if (!allSynced && !waitingForSync) {
            setWaitingForSync(true);
        } else if (allSynced && waitingForSync) {
            setWaitingForSync(false);
        }

        // 全員が現在の問題世代で回答済みの場合のみ結果発表へ
        if (checkAllAnswered()) {
            // 少し遅延させて状態の同期を確実に
            const checkTimeout = setTimeout(() => {
                // 再度確認
                if (!checkAllAnswered()) return;

                const states = getAnswerStates();
                const answerValues = states
                    .filter(a => a.answerSeq === questionSeq && a.answer !== undefined)
                    .map(a => ({
                        id: a.id,
                        val: a.answer as number
                    }))
                    .sort((a, b) => a.val - b.val);

                console.log('[ANSWER CHECK] All answered, calculating result', {
                    questionText: currentQuestion.text,
                    questionSeq,
                    answerValues
                });

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
                    withDist.filter(a => a.dist === minDist).forEach(winner => {
                        scoreChanges[winner.id] = 100 * multiplier;
                    });

                    // 3. Find Losers (Max/Min) - Only if 3+ players
                    if (players.length >= 3) {
                        const maxVal = answerValues[answerValues.length - 1].val;
                        const minVal = answerValues[0].val;

                        const isFlat = maxVal === minVal;

                        if (!isFlat) {
                            // Max Punishment
                            if (maxVal !== median) {
                                answerValues.filter(a => a.val === maxVal).forEach(p => {
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
            }, 200);

            return () => clearTimeout(checkTimeout);
        }

        // 同期待ちの場合は何もせず待機（タイムアウトで自動的に進めない）
        // ホストが強制開始できるようにUIで導線を提供
    }, [players, phase, currentQuestion, isDoubleScore, updateScores, setResult, setPhase, questionSeq, waitingForSync, setWaitingForSync]);

    // 強制開始機能: 同期が取れていないプレイヤーを未回答として扱い、回答済みのプレイヤーだけで結果発表
    const forceStartReveal = () => {
        if (!isHost() || phase !== 'QUESTION' || !currentQuestion) return;

        const answerStates = players.map(p => ({
            id: p.id,
            answer: p.getState('answer') as number | undefined,
            answerSeq: p.getState('answerSeq') as number | undefined
        }));

        // 現在の問題世代で回答済みのプレイヤーのみを対象
        const validAnswers = answerStates
            .filter(a => a.answerSeq === questionSeq && a.answer !== undefined)
            .map(a => ({
                id: a.id,
                val: a.answer as number
            }))
            .sort((a, b) => a.val - b.val);

        console.log('[FORCE START] Starting reveal with available answers', {
            questionText: currentQuestion.text,
            questionSeq,
            validAnswers,
            skippedPlayers: answerStates.filter(a => a.answerSeq !== questionSeq || a.answer === undefined).map(a => a.id)
        });

        if (validAnswers.length === 0) {
            // 誰も回答していない場合はスキップ
            console.warn('[FORCE START] No valid answers, skipping to next round');
            setResult({ median: 0, scoreChanges: {} });
            setPhase('REVEAL');
            return;
        }

        // Calculate Median
        const mid = Math.floor(validAnswers.length / 2);
        let median = 0;
        if (validAnswers.length > 0) {
            median = validAnswers.length % 2 !== 0 ? validAnswers[mid].val : (validAnswers[mid - 1].val + validAnswers[mid].val) / 2;
        }

        // Scoring Logic
        const scoreChanges: Record<string, number> = {};
        const multiplier = isDoubleScore ? 2 : 1;

        if (validAnswers.length >= 2) {
            const withDist = validAnswers.map(a => ({ ...a, dist: Math.abs(a.val - median) }));
            const minDist = Math.min(...withDist.map(a => a.dist));

            withDist.filter(a => a.dist === minDist).forEach(winner => {
                scoreChanges[winner.id] = 100 * multiplier;
            });

            if (validAnswers.length >= 3) {
                const maxVal = validAnswers[validAnswers.length - 1].val;
                const minVal = validAnswers[0].val;
                const isFlat = maxVal === minVal;

                if (!isFlat) {
                    if (maxVal !== median) {
                        validAnswers.filter(a => a.val === maxVal).forEach(p => {
                            if (Math.abs(p.val - median) !== minDist) {
                                scoreChanges[p.id] = (scoreChanges[p.id] || 0) - (50 * multiplier);
                            }
                        });
                    }
                    if (minVal !== median) {
                        validAnswers.filter(a => a.val === minVal).forEach(p => {
                            if (Math.abs(p.val - median) !== minDist) {
                                scoreChanges[p.id] = (scoreChanges[p.id] || 0) - (50 * multiplier);
                            }
                        });
                    }
                }
            }
        }

        updateScores(scoreChanges);
        setResult({ median, scoreChanges });
        setPhase('REVEAL');
        setWaitingForSync(false);
    };

    // ----------------------
    // Actions (Exposed to UI)
    // ----------------------

    const startGame = () => {
        // adminIdベースのチェックに変更（権限移動後も動作するように）
        if (!myself || myself.id !== adminId) {
            console.log('[START GAME] Permission denied', { 
                myselfId: myself?.id, 
                adminId 
            });
            return;
        }

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

        // 問題世代IDをインクリメントし、回答をリセット
        const newSeq = questionSeq + 1;
        setQuestionSeq(newSeq);
        setWaitingForSync(false);
        RPC.call('resetAnswers', { questionSeq: newSeq }, RPC.Mode.ALL);
    };

    const updateSettings = (newSettings: GameSettings) => {
        // adminIdベースのチェックに変更（権限移動後も動作するように）
        if (!myself || myself.id !== adminId) return;
        setSettings(newSettings);
    };

    const transferAdmin = (newAdminId: string) => {
        // adminIdベースのチェックに変更（権限移動後も動作するように）
        if (!myself || myself.id !== adminId) return;
        setAdminId(newAdminId);
    };

    const selectQuestion = (q: Question) => {
        // 「個人」カテゴリーの問題の場合は、プレイヤー選択画面に遷移
        if (q.category === '個人') {
            setPendingQuestion(q);
            setPhase('PLAYER_SELECTION');
            setQuestionCandidates([]); // Clear candidates
            return;
        }
        
        // 問題世代IDをインクリメントし、回答をリセット
        const newSeq = questionSeq + 1;
        setQuestionSeq(newSeq);
        setWaitingForSync(true); // 同期待ち状態を開始
        
        setPhase('QUESTION');
        setCurrentQuestion(q);
        setQuestionCandidates([]); // Clear candidates
        RPC.call('resetAnswers', { questionSeq: newSeq }, RPC.Mode.ALL);
    };

    const submitAnswer = (val: number) => {
        myself.setState('answer', val);
        myself.setState('answerSeq', questionSeq); // この回答がどの問題世代のものか記録
    };

    // プレイヤー選択後に問題文の「○○」を置き換えてQUESTIONフェーズに遷移
    const selectPlayerForQuestion = (playerName: string) => {
        if (!pendingQuestion) return;
        
        // 問題文の「○○」を選択されたプレイヤー名に置き換え
        const modifiedQuestion: Question = {
            ...pendingQuestion,
            text: pendingQuestion.text.replace(/○○/g, playerName)
        };
        
        // 問題世代IDをインクリメントし、回答をリセット
        const newSeq = questionSeq + 1;
        setQuestionSeq(newSeq);
        setWaitingForSync(true); // 同期待ち状態を開始
        
        setPhase('QUESTION');
        setCurrentQuestion(modifiedQuestion);
        setPendingQuestion(null); // 一時保存をクリア
        RPC.call('resetAnswers', { questionSeq: newSeq }, RPC.Mode.ALL);
    };

    const nextRound = () => {
        // adminIdベースのチェックに変更（権限移動後も動作するように）
        if (!myself || myself.id !== adminId) return;
        
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
            // 問題世代IDをインクリメントし、回答をリセット
            const newSeq = questionSeq + 1;
            setQuestionSeq(newSeq);
            setWaitingForSync(false);
            
            // Next Question
            setPhase('QUESTION_SELECTION');
            setQuestionerId(nextQId);
            setQuestionCandidates(getRandomCandidates());
            setCurrentRound(nextR);
            setResult(null);
            setCurrentQuestion(null);

            // Double Score Chance (20%)
            setIsDoubleScore(Math.random() < 0.2);

            RPC.call('resetAnswers', { questionSeq: newSeq }, RPC.Mode.ALL);
        }
    };

    const backToLobby = () => {
        // adminIdベースのチェックに変更（権限移動後も動作するように）
        if (!myself || myself.id !== adminId) return;
        setPhase('LOBBY');
        setCurrentRound(0);
        setQuestionerId(null);
        setResult(null);
        setCurrentQuestion(null);
        setQuestionCandidates([]);
    };

    // セッションリセット: ゲーム状態を完全に初期化してロビーに戻す
    const resetSession = () => {
        // adminIdベースのチェックに変更（権限移動後も動作するように）
        if (!myself || myself.id !== adminId) return;
        
        console.log('[GAME ENGINE] Resetting session...');
        
        // 問題世代IDをインクリメント
        const newSeq = questionSeq + 1;
        setQuestionSeq(newSeq);
        setWaitingForSync(false);
        
        // ゲーム状態をすべてリセット
        setPhase('LOBBY');
        setCurrentRound(0);
        setQuestionerId(null);
        setResult(null);
        setCurrentQuestion(null);
        setQuestionCandidates([]);
        setIsDoubleScore(false);
        
        // スコアを初期化
        const initialScores: Record<string, number> = {};
        playerOrder.forEach(id => initialScores[id] = 0);
        setScores(initialScores);
        
        // すべてのプレイヤーの回答をリセット
        RPC.call('resetAnswers', { questionSeq: newSeq }, RPC.Mode.ALL);
        
        console.log('[GAME ENGINE] Session reset complete');
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
        pendingQuestion,

        // Actions
        startGame,
        updateSettings,
        transferAdmin,
        selectQuestion,
        selectPlayerForQuestion,
        submitAnswer,
        nextRound,
        backToLobby,
        resetSession,
        forceStartReveal,

        // Sync State
        questionSeq,
        waitingForSync,

        // Utils
        isHost: isHost()
    };
};

// Registered RPCs
RPC.register('resetAnswers', async (data: { questionSeq?: number }) => {
    const player = myPlayer();
    player.setState('answer', undefined);
    // この世代のリセットを受領した印として answerSeq を設定
    if (data?.questionSeq !== undefined) {
        player.setState('answerSeq', data.questionSeq);
    }
    console.log('[RPC] resetAnswers received', { questionSeq: data?.questionSeq });
});
