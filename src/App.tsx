import { useEffect, useState, useRef, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useGameEngine } from './hooks/useGameEngine';
import { useSounds } from './hooks/useSounds';
import type { GameSettings, Question } from './types';
import { type PlayerState as PlayroomPlayer, myPlayer } from 'playroomkit';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import './App.css';

// UI Components adapted for Playroom Player objects

interface LobbyProps {
  onStart: () => void;
  players: PlayroomPlayer[];
  myself: PlayroomPlayer;
  adminId: string | null;
  settings: GameSettings;
  onUpdateSettings: (settings: GameSettings) => void;
  onTransferAdmin: (newAdminId: string) => void;
  onResetSession?: () => void;
  activeTab: 'participants' | 'settings' | 'howto';
  onTabChange: (tab: 'participants' | 'settings' | 'howto') => void;
}

// エラーバウンダリーコンポーネント（Discord環境でもエラーを捕捉）
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // エラーをDOMに直接書き込む（Discord内でも確認可能）
    try {
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:10000;font-family:monospace;font-size:12px;max-height:300px;overflow-y:auto;';
      
      const errorMessage = error.message || 'Unknown error';
      const errorStack = error.stack || 'No stack trace';
      const componentStack = errorInfo.componentStack || 'No component stack';
      
      errorDiv.innerHTML = `
        <div style="font-weight:bold;margin-bottom:10px;">[ERROR BOUNDARY] React Error #310 (Hooks Rules Violation)</div>
        <div style="margin-bottom:5px;"><strong>Message:</strong> ${errorMessage}</div>
        <div style="margin-bottom:5px;"><strong>Stack:</strong> ${errorStack.slice(0, 500)}</div>
        <div style="margin-bottom:5px;"><strong>Component Stack:</strong> ${componentStack.slice(0, 500)}</div>
        <div style="margin-top:10px;font-size:10px;opacity:0.8;">Visit https://react.dev/errors/310 for more info</div>
      `;
      
      if (document.body) {
        document.body.appendChild(errorDiv);
      } else if (document.documentElement) {
        document.documentElement.appendChild(errorDiv);
      }
    } catch (e) {
      console.error('[ERROR BOUNDARY] Failed to display error:', e);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'white', textAlign: 'center' }}>
          <h2>エラーが発生しました</h2>
          <p>{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const Lobby = ({ onStart, players, myself, adminId, settings, onUpdateSettings, onTransferAdmin, onResetSession, activeTab, onTabChange }: LobbyProps) => {
  const [logoLoaded, setLogoLoaded] = useState(false);
  
  // デバッグログ出力ヘルパー関数（Appコンポーネントと同じ実装）
  const addDebugLog = (message: string, isError = false) => {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          addDebugLog(message, isError);
        });
        return;
      }

      let debugDiv = document.getElementById('debug-log');
      if (!debugDiv) {
        if (!document.body) {
          const errorDiv = document.createElement('div');
          errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:10000;font-family:monospace;';
          errorDiv.textContent = `ERROR: document.body is null - ${message}`;
          if (document.documentElement) {
            document.documentElement.appendChild(errorDiv);
          }
          return;
        }
        
        debugDiv = document.createElement('div');
        debugDiv.id = 'debug-log';
        debugDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.9);color:#0f0;padding:10px;font-size:10px;max-height:200px;overflow-y:auto;z-index:9999;font-family:monospace;';
        document.body.appendChild(debugDiv);
      }
      
      const logEntry = document.createElement('div');
      const time = new Date().toLocaleTimeString();
      logEntry.style.color = isError ? 'red' : '#0f0';
      logEntry.textContent = `[${time}] ${message}`;
      debugDiv.appendChild(logEntry);
      debugDiv.scrollTop = debugDiv.scrollHeight;
    } catch (e) {
      try {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:10000;font-family:monospace;';
        errorDiv.textContent = `[LOBBY] addDebugLog ERROR: ${e instanceof Error ? e.message : String(e)} - ${message}`;
        if (document.body) {
          document.body.appendChild(errorDiv);
        } else if (document.documentElement) {
          document.documentElement.appendChild(errorDiv);
        }
      } catch (finalError) {
        console.error('[LOBBY] addDebugLog FATAL ERROR:', finalError);
      }
    }
  };
  
  addDebugLog(`[LOBBY] Component rendering - players: ${players.length}, adminId: ${adminId}, myselfId: ${myself.id}`);
  
  const isAdmin = myself.id === adminId;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onUpdateSettings({
      ...settings,
      [name]: parseInt(value) || 0
    });
  };

  return (
    <div className="screen lobby" style={{ position: 'relative', zIndex: 1 }}>
      <div className="logo-container">
        <img 
          src="/logo.png" 
          alt="クイズ！ど真ん中" 
          className="logo" 
          onLoad={() => setLogoLoaded(true)}
          onError={(e) => {
            // ロゴファイルが見つからない場合は非表示
            (e.target as HTMLImageElement).style.display = 'none';
            setLogoLoaded(false);
          }} 
        />
      </div>
      {!logoLoaded && <h1>クイズ！ど真ん中</h1>}

      {/* タブヘッダー */}
      <div className="lobby-tabs">
        <button
          className={`tab-button ${activeTab === 'participants' ? 'active' : ''}`}
          onClick={() => onTabChange('participants')}
        >
          参加者
        </button>
        <button
          className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          設定
        </button>
        <button
          className={`tab-button ${activeTab === 'howto' ? 'active' : ''}`}
          onClick={() => onTabChange('howto')}
        >
          遊び方
        </button>
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'participants' && (
        <div className="tab-content">
          <div className="players-list">
            <h3>参加者 ({players.length}人)</h3>
            {players.map((p) => {
              // PlayroomKitのプロファイルを取得
              const profile = p.getProfile();
              
              // player.setState('discordProfile', ...)で保存されたDiscordプロファイルを取得
              // これは他のプレイヤーにも同期される
              const syncedDiscordProfile = p.getState('discordProfile');
              
              // 自分自身の場合のみ、window.discordProfileをフォールバックとして使用
              const isMyself = p.id === myself.id;
              const windowDiscordProfile = isMyself && (window as any).discordProfile ? (window as any).discordProfile : null;
              
              // プロファイル情報を決定（同期されたDiscordプロファイルを最優先）
              const displayName = syncedDiscordProfile?.name || windowDiscordProfile?.name || profile.name || 'Player';
              const displayColor = syncedDiscordProfile?.color || windowDiscordProfile?.color || profile.color;
              const colorHex = displayColor?.hexString || displayColor?.hex || (displayColor as any)?.hex || '#ccc';
              
              // アバター画像を取得（同期されたDiscordプロファイルを最優先）
              const avatarUrl = syncedDiscordProfile?.photo || windowDiscordProfile?.photo || profile.photo || null;
              
              return (
                <div key={p.id} className="player-badge" style={{ backgroundColor: colorHex }}>
                  <span className="player-info">
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt={displayName}
                        className="player-avatar"
                        onError={(e) => {
                          // 画像読み込みエラー時は非表示
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="player-avatar-placeholder">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="player-details">
                      {p.id === adminId && <span className="admin-badge">👑</span>}
                      <span className="player-name-text">{displayName}</span>
                      {p.id === myself.id && <span className="you-badge">(You)</span>}
                    </span>
                  </span>
                  {isAdmin && p.id !== myself.id && (
                    <button
                      className="btn-small"
                      onClick={() => onTransferAdmin(p.id)}
                      title="管理者を譲渡"
                    >
                      譲渡
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="tab-content">
          <div className="settings-panel">
            <h3>ゲーム設定 {isAdmin ? '(編集可)' : '(閲覧のみ)'}</h3>
            <div className="setting-item">
              <label>最大ラウンド数 (周):</label>
              <input
                type="number"
                name="maxRounds"
                value={settings.maxRounds}
                onChange={handleChange}
                disabled={!isAdmin}
                min={1}
                max={5}
              />
            </div>
            <div className="setting-item">
              <label>制限時間 (秒):</label>
              <input
                type="number"
                name="timeLimit"
                value={settings.timeLimit}
                onChange={handleChange}
                disabled={!isAdmin}
                min={10}
                max={300}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'howto' && (
        <div className="tab-content">
          <div className="howto-panel">
            <h3>遊び方</h3>
            <div className="howto-section">
              <h4>📖 ゲームの概要</h4>
              <p>クイズの正解は、全員の回答の<strong>「真ん中」</strong>になります！</p>
              <p>誰も正解を知らないような問題が出題され、「いいセン行っているか？」が勝負の決め手です。</p>
            </div>
            
            <div className="howto-section">
              <h4>🎮 ゲームの流れ</h4>
              <ol>
                <li><strong>出題者</strong>が問題を選びます</li>
                <li>全員が<strong>数字で回答</strong>します（制限時間内）</li>
                <li>全員の回答を<strong>公開</strong>します</li>
                <li>数字を<strong>大きい順に並べ</strong>、<strong>真ん中</strong>が正解です</li>
                <li><strong>得点計算</strong>をして、次のラウンドへ</li>
              </ol>
            </div>

            <div className="howto-section">
              <h4>🎯 真ん中の決め方</h4>
              <ul>
                <li><strong>回答の種類が奇数の場合</strong>：ちょうど真ん中の順位の数字が正解</li>
                <li><strong>回答の種類が偶数の場合</strong>：真ん中の順位のうち、数字が大きい方が正解</li>
                <li><strong>全員が同じ数字の場合</strong>：全員正解！</li>
              </ul>
            </div>

            <div className="howto-section">
              <h4>⭐ 得点の計算</h4>
              <ul>
                <li><strong>正解した人</strong>：+100点</li>
                <li><strong>一番大きい数字を出した人</strong>：-50点</li>
                <li><strong>一番小さい数字を出した人</strong>：-50点</li>
                <li><strong>2倍ラウンド</strong>：正解時の得点が2倍になります！</li>
              </ul>
            </div>

            <div className="howto-section">
              <h4>💡 コツ</h4>
              <ul>
                <li>誰も正解を知らないような問題が面白い</li>
                <li>極端すぎる数字（0や天文学的数字）は避けよう</li>
                <li>みんなの回答を予測して、真ん中を狙おう！</li>
              </ul>
            </div>

            <div className="howto-section">
              <h4>🏆 ゲームの終了</h4>
              <p>設定したラウンド数が終わったら、<strong>最も得点が高いプレイヤー</strong>の勝ちです！</p>
            </div>
          </div>
        </div>
      )}

      {/* ゲーム開始ボタン（全タブ共通） */}
      {activeTab !== 'howto' && (
        <div className="game-start-container">
          {isAdmin ? (
            <div className="admin-buttons">
              <button onClick={onStart} className="btn-start">ゲーム開始</button>
              {onResetSession && (
                <button onClick={onResetSession} className="btn-reset" title="ゲーム状態をリセットしてロビーに戻ります">
                  🔄 リセット
                </button>
              )}
            </div>
          ) : (
            <div className="waiting-message">ホストがゲームを開始するのを待っています...</div>
          )}
        </div>
      )}
    </div>
  );
};

interface SelectionScreenProps {
  isQuestioner: boolean;
  questionerName: string;
  candidates: Question[];
  onSelect: (q: Question) => void;
}

const SelectionScreen = ({ isQuestioner, questionerName, candidates, onSelect }: SelectionScreenProps) => {
  if (!isQuestioner) {
    return (
      <div className="screen wait">
        <h2>{questionerName} さんが問題を選んでいます...</h2>
      </div>
    );
  }

  return (
    <div className="screen selection">
      <h2>問題を選んでください</h2>
      <div className="candidates-list">
        {candidates.map((q, idx) => (
          <button key={idx} className="candidate-btn" onClick={() => onSelect(q)}>
            <div className="candidate-category">[{q.category}]</div>
            <div className="candidate-text">{q.text}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

interface QuestionScreenProps {
  question: Question | null;
  questionerName: string;
  onAnswer: (val: number) => void;
  myAnswer: number | undefined;
  currentRound: number;
  maxRounds: number;
  isDoubleScore: boolean;
  timeLimit: number;
  isHost: boolean;
  waitingForSync: boolean;
  onForceStart: () => void;
  players: any[];
  questionSeq: number;
}

const QuestionScreen = ({ question, questionerName, onAnswer, myAnswer, currentRound, maxRounds, isDoubleScore, timeLimit, isHost, waitingForSync, onForceStart, players, questionSeq }: QuestionScreenProps) => {
  const [remainingTime, setRemainingTime] = useState(timeLimit);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const onAnswerRef = useRef(onAnswer);
  const questionTextRef = useRef<string | undefined>(undefined);
  const isInitializedRef = useRef(false);
  const [syncWaitTime, setSyncWaitTime] = useState(0);
  const FORCE_START_THRESHOLD = 10; // 10秒待ったら強制開始ボタンを表示

  // onAnswerを常に最新の値に更新
  useEffect(() => {
    onAnswerRef.current = onAnswer;
  }, [onAnswer]);

  // questionTextRefの初期化と問題変更の検出
  useEffect(() => {
    const currentQuestionText = question?.text;
    const hasQuestionChanged = questionTextRef.current !== currentQuestionText;
    
    if (hasQuestionChanged || !isInitializedRef.current) {
      questionTextRef.current = currentQuestionText;
      isInitializedRef.current = true;
      // 問題が変更されたときは状態をリセット
      setRemainingTime(timeLimit);
      setIsTimeUp(false);
    }
  }, [question?.text, timeLimit]);

  // myAnswerがundefinedに変わったときに状態をリセット（回答がリセットされたとき）
  useEffect(() => {
    if (myAnswer === undefined && isInitializedRef.current) {
      // 回答がリセットされたときは、タイマーと状態もリセット
      // ただし、問題が変更されたときのリセットと重複しないように注意
      const currentQuestionText = question?.text;
      if (questionTextRef.current === currentQuestionText) {
        // 同じ問題で回答がリセットされた場合のみリセット
        setRemainingTime(timeLimit);
        setIsTimeUp(false);
      }
    }
  }, [myAnswer, question?.text, timeLimit]);

  // タイマーの実装
  useEffect(() => {
    // myAnswerがundefinedでない場合はタイマーを開始しない
    if (myAnswer !== undefined) {
      return;
    }

    // 問題が初期化されていない場合はタイマーを開始しない
    if (!isInitializedRef.current || !question?.text) {
      return;
    }

    if (isTimeUp) {
      return; // 時間切れの場合はタイマーを停止
    }

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          setIsTimeUp(true);
          // 時間切れの場合は0を自動送信
          setTimeout(() => {
            onAnswerRef.current(0);
          }, 100);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [question?.text, myAnswer, isTimeUp, timeLimit]);

  // 同期待ちタイマー（ホスト用）
  useEffect(() => {
    if (!isHost || !waitingForSync) {
      setSyncWaitTime(0);
      return;
    }

    const interval = setInterval(() => {
      setSyncWaitTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isHost, waitingForSync]);

  // 同期状態の計算
  const getSyncStatus = () => {
    return players.map(p => ({
      id: p.id,
      name: p.getState('discordProfile')?.name || p.getProfile()?.name || 'Unknown',
      answerSeq: p.getState('answerSeq') as number | undefined,
      hasAnswer: p.getState('answer') !== undefined,
      isSynced: p.getState('answerSeq') === questionSeq
    }));
  };

  const syncStatus = getSyncStatus();
  const unsyncedPlayers = syncStatus.filter(p => !p.isSynced);
  const canForceStart = isHost && waitingForSync && syncWaitTime >= FORCE_START_THRESHOLD;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('answer') as HTMLInputElement;
    const val = parseInt(input.value);
    if (!isNaN(val)) onAnswer(val);
  };

  if (myAnswer !== undefined) {
    return (
      <div className="screen wait">
        <div className="question-summary">
          {question && (
            <>
              <div className="category-label">[{question.category}]</div>
              <div className="question-text-small">{question.text}</div>
            </>
          )}
        </div>
        <h2>回答完了！</h2>
        <p>他のプレイヤーを待っています...</p>
        
        {/* 同期待ち状態の表示（ホスト用） */}
        {isHost && waitingForSync && (
          <div className="sync-wait-info">
            <p className="sync-wait-text">⏳ 同期待ち中... ({syncWaitTime}秒)</p>
            {unsyncedPlayers.length > 0 && (
              <p className="unsynced-players">
                未同期: {unsyncedPlayers.map(p => p.name).join(', ')}
              </p>
            )}
            {canForceStart && (
              <button className="btn-force-start" onClick={onForceStart}>
                ⚡ 強制開始（同期待ちをスキップ）
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const progressPercentage = (remainingTime / timeLimit) * 100;
  const isWarning = remainingTime <= 10; // 残り10秒以下で警告表示

  return (
    <div className="screen question">
      <div className="round-info">Round {currentRound} / {maxRounds}</div>
      {isDoubleScore && <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        className="double-score-badge"
      >
        ★ CHANCE! 得点2倍 ★
      </motion.div>}
      <div className="questioner-info">出題者: {questionerName}</div>
      
      {/* タイマー表示 */}
      <div className="timer-container">
        <div className="timer-header">
          <span className={`timer-text ${isWarning ? 'warning' : ''}`}>
            残り時間: {remainingTime}秒
          </span>
          {isWarning && (
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="timer-warning-icon"
            >
              ⚠️
            </motion.span>
          )}
        </div>
        {/* プログレスバー */}
        <div className="progress-bar-container">
          <motion.div
            className={`progress-bar ${isWarning ? 'warning' : ''}`}
            initial={{ width: '100%' }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 0.5, ease: 'linear' }}
          />
          {remainingTime === 0 && (
            <motion.div
              className="time-up-message"
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              時間切れ！
            </motion.div>
          )}
        </div>
      </div>

      <h2>問題</h2>
      {question && (
        <>
          <div className="question-category">カテゴリ: {question.category}</div>
          <p className="question-text">{question.text}</p>
        </>
      )}
      <form onSubmit={handleSubmit}>
        <input 
          name="answer" 
          type="number" 
          placeholder="数字を入力" 
          disabled={isTimeUp}
          style={{ 
            opacity: isTimeUp ? 0.5 : 1,
            cursor: isTimeUp ? 'not-allowed' : 'text'
          }}
        />
        <button 
          type="submit" 
          disabled={isTimeUp}
          style={{ 
            opacity: isTimeUp ? 0.5 : 1,
            cursor: isTimeUp ? 'not-allowed' : 'pointer'
          }}
        >
          {isTimeUp ? '時間切れ' : '回答する'}
        </button>
      </form>
    </div>
  );
};

const WaitScreen = () => (
  <div className="screen wait">
    <h2>他のプレイヤーを待っています...</h2>
  </div>
);

interface ResultScreenProps {
  result: { median: number; scoreChanges?: Record<string, number> };
  players: PlayroomPlayer[];
  onNext: () => void;
  isAdmin: boolean;
  isDoubleScore: boolean;
  playSE: (name: any) => void;
}

const ResultScreen = ({ result, players, onNext, isAdmin, isDoubleScore, playSE }: ResultScreenProps) => {
  const sortedPlayers = [...players].sort((a, b) => (a.getState('answer') as number) - (b.getState('answer') as number));
  const myself = myPlayer();

  // 正解発表時に効果音を再生（中央値が表示されるタイミング）
  useEffect(() => {
    const myId = myPlayer().id;
    const myAnswer = myself.getState('answer') as number | undefined;
    const myScoreChange = result.scoreChanges?.[myId] || 0;
    
    // 中央値が表示されるタイミング（delay: 0.5秒後）に合わせて効果音を再生
    const soundTimeout = setTimeout(() => {
      if (myAnswer !== undefined && result.median !== undefined) {
        // 正解した場合（自分の回答が中央値と一致）
        if (myAnswer === result.median) {
          playSE('se_result_normal');
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
        // マイナス点数の場合
        else if (myScoreChange < 0) {
          playSE('se_buzzer');
        }
      }
    }, 500); // 中央値のアニメーション開始タイミングに合わせる

    return () => clearTimeout(soundTimeout);
  }, [result, myself, playSE]);

  return (
    <motion.div
      className="screen result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <h2>結果発表</h2>
      {isDoubleScore && <div className="double-score-label">★ 倍率2倍ラウンド ★</div>}

      <div className="good-line-container">
        <div className="good-line-label">いい線（中央値）</div>
        <motion.div
          className="good-line-value"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          transition={{ type: "spring", delay: 0.5 }}
        >
          {result.median}
        </motion.div>
      </div>

      <ul className="answers-list">
        {sortedPlayers.map((p, i) => {
          const val = p.getState('answer') as number;
          const scoreChange = result.scoreChanges?.[p.id] || 0;
          const isWinner = scoreChange > 0;
          
          // PlayroomKitのプロファイルを取得
          const profile = p.getProfile();
          
          // player.setState('discordProfile', ...)で保存されたDiscordプロファイルを取得
          const syncedDiscordProfile = p.getState('discordProfile');
          
          // 自分自身の場合のみ、window.discordProfileをフォールバックとして使用
          const isMyself = p.id === myself.id;
          const windowDiscordProfile = isMyself && (window as any).discordProfile ? (window as any).discordProfile : null;
          
          // プロファイル情報を決定（同期されたDiscordプロファイルを最優先）
          const displayName = syncedDiscordProfile?.name || windowDiscordProfile?.name || profile.name || 'Player';
          const displayColor = syncedDiscordProfile?.color || windowDiscordProfile?.color || profile.color;
          const colorHex = displayColor?.hexString || displayColor?.hex || (displayColor as any)?.hex || '#000';

          // 正解した人（+100pt以上の人）をハイライト（同期を確実にするため）
          const isCorrect = scoreChange > 0;

          return (
            <motion.li
              key={p.id}
              className={`result-item ${isCorrect ? 'highlight' : ''}`}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 1 + (i * 0.2) }}
            >
              <div className="player-info-result">
                {(() => {
                  const avatarUrl = syncedDiscordProfile?.photo || windowDiscordProfile?.photo || profile.photo || null;
                  return avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt={displayName}
                      className="player-avatar-result"
                      onError={(e) => {
                        // 画像読み込みエラー時はプレースホルダーに切り替え
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const placeholder = target.nextElementSibling as HTMLElement;
                        if (placeholder && placeholder.classList.contains('player-avatar-placeholder-result')) {
                          placeholder.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null;
                })()}
                <div 
                  className="player-avatar-placeholder-result"
                  style={{ display: (syncedDiscordProfile?.photo || windowDiscordProfile?.photo || profile.photo) ? 'none' : 'flex' }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="player-name" style={{ color: colorHex }}>
                  {displayName}
                </span>
                <span className="player-answer">{val}</span>
              </div>

              {scoreChange !== 0 && (
                <motion.div
                  className={`score-change ${isWinner ? 'plus' : 'minus'}`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 2 + (i * 0.1) }}
                >
                  {scoreChange > 0 ? '+' : ''}{scoreChange}pt
                </motion.div>
              )}
            </motion.li>
          );
        })}
      </ul>

      {isAdmin ? (
        <button onClick={onNext} className="btn-next">次の問題へ</button>
      ) : (
        <div className="waiting-next">ホストが次へ進むのを待っています...</div>
      )}
    </motion.div>
  );
};

interface RankingScreenProps {
  players: PlayroomPlayer[];
  scores: Record<string, number>;
  onBackToLobby: () => void;
  isAdmin: boolean;
  playSE: (name: any) => void;
}

const RankingScreen = ({ players, scores, onBackToLobby, isAdmin, playSE }: RankingScreenProps) => {
  const myself = myPlayer();
  const [showRanking, setShowRanking] = useState(false);

  // スコアでソート（降順）
  const rankedPlayers = [...players].sort((a, b) => {
    const scoreA = scores[a.id] || 0;
    const scoreB = scores[b.id] || 0;
    return scoreB - scoreA;
  });

  // ドラムロール効果音を再生し、終了後に画面を表示
  useEffect(() => {
    // ドラムロール効果音を再生
    playSE('se_drumroll');
    
    // 2秒後に画面を表示
    const showTimeout = setTimeout(() => {
      setShowRanking(true);
    }, 2000);

    return () => clearTimeout(showTimeout);
  }, [playSE]);

  // 1位のプレイヤーに紙吹雪エフェクト（画面表示後）
  useEffect(() => {
    if (!showRanking || rankedPlayers.length === 0) return;
    
    const winnerId = rankedPlayers[0].id;
    if (winnerId === myself.id) {
      // 画面表示後、少し遅延させて紙吹雪を表示
      setTimeout(() => {
        playSE('se_cheer');
        confetti({
          particleCount: 200,
          spread: 100,
          origin: { y: 0.3 }
        });
      }, 500);
    }
  }, [showRanking, rankedPlayers, myself, playSE]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return '🥇';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      default:
        return `${rank}位`;
    }
  };

  const getRankClass = (rank: number) => {
    switch (rank) {
      case 1:
        return 'rank-first';
      case 2:
        return 'rank-second';
      case 3:
        return 'rank-third';
      default:
        return '';
    }
  };

  // ドラムロール中は画面を非表示
  if (!showRanking) {
    return (
      <div className="screen ranking" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ fontSize: '2em', opacity: 0.7 }}>🎵</div>
      </div>
    );
  }

  return (
    <motion.div
      className="screen ranking"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.h2
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", delay: 0.2 }}
      >
        最終順位
      </motion.h2>

      <ul className="ranking-list">
        {rankedPlayers.map((p, index) => {
          const rank = index + 1;
          const finalScore = scores[p.id] || 0;
          
          // PlayroomKitのプロファイルを取得
          const profile = p.getProfile();
          
          // player.setState('discordProfile', ...)で保存されたDiscordプロファイルを取得
          const syncedDiscordProfile = p.getState('discordProfile');
          
          // 自分自身の場合のみ、window.discordProfileをフォールバックとして使用
          const isMyself = p.id === myself.id;
          const windowDiscordProfile = isMyself && (window as any).discordProfile ? (window as any).discordProfile : null;
          
          // プロファイル情報を決定（同期されたDiscordプロファイルを最優先）
          const displayName = syncedDiscordProfile?.name || windowDiscordProfile?.name || profile.name || 'Player';
          const displayColor = syncedDiscordProfile?.color || windowDiscordProfile?.color || profile.color;
          const colorHex = displayColor?.hexString || displayColor?.hex || (displayColor as any)?.hex || '#ccc';

          return (
            <motion.li
              key={p.id}
              className={`ranking-item ${getRankClass(rank)} ${isMyself ? 'myself' : ''}`}
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.5 + (index * 0.15) }}
            >
              <div className="rank-badge">{getRankIcon(rank)}</div>
              <div className="player-info-ranking">
                {(() => {
                  // アバター画像を取得（同期されたDiscordプロファイルを最優先）
                  const avatarUrl = syncedDiscordProfile?.photo || windowDiscordProfile?.photo || profile.photo || null;
                  return avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt={displayName}
                      className="player-avatar-ranking"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const placeholder = target.nextElementSibling as HTMLElement;
                        if (placeholder && placeholder.classList.contains('player-avatar-placeholder-ranking')) {
                          placeholder.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null;
                })()}
                <div 
                  className="player-avatar-placeholder-ranking"
                  style={{ display: (syncedDiscordProfile?.photo || windowDiscordProfile?.photo || profile.photo) ? 'none' : 'flex' }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="player-name-ranking" style={{ color: colorHex }}>
                  {displayName}
                  {isMyself && <span className="you-badge-ranking">(You)</span>}
                </span>
              </div>
              <div className="final-score">{finalScore}pt</div>
            </motion.li>
          );
        })}
      </ul>

      {isAdmin ? (
        <motion.button
          onClick={onBackToLobby}
          className="btn-back-to-lobby"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.5 }}
        >
          ロビーに戻る
        </motion.button>
      ) : (
        <div className="waiting-next">ホストがロビーに戻るのを待っています...</div>
      )}
    </motion.div>
  );
};

function App() {
  // デバッグログ出力ヘルパー関数（毎回debugDivを取得・作成）
  // エラーハンドリングを強化し、エラーが発生した場合に確実に捕捉する
  // Discordのiframe環境でも確実に動作するように、DOM操作のタイミングを調整
  const addDebugLog = (message: string, isError = false) => {
    try {
      // DOMが完全に読み込まれていることを確認
      if (document.readyState === 'loading') {
        // DOMが読み込まれるまで待つ
        document.addEventListener('DOMContentLoaded', () => {
          addDebugLog(message, isError);
        });
        return;
      }

      // debugDivを取得、存在しない場合は作成
      let debugDiv = document.getElementById('debug-log');
      if (!debugDiv) {
        // document.bodyが存在することを確認
        if (!document.body) {
          // document.bodyが存在しない場合は、エラーを表示
          const errorDiv = document.createElement('div');
          errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:10000;font-family:monospace;';
          errorDiv.textContent = `ERROR: document.body is null - ${message}`;
          // documentが存在する場合は、documentに直接追加
          if (document.documentElement) {
            document.documentElement.appendChild(errorDiv);
          }
          return;
        }
        
        debugDiv = document.createElement('div');
        debugDiv.id = 'debug-log';
        debugDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.9);color:#0f0;padding:10px;font-size:10px;max-height:200px;overflow-y:auto;z-index:9999;font-family:monospace;';
        
        try {
          document.body.appendChild(debugDiv);
        } catch (appendError) {
          // document.body.appendChildが失敗した場合は、エラーを表示
          const errorDiv = document.createElement('div');
          errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:10000;font-family:monospace;';
          errorDiv.textContent = `ERROR: Failed to append debugDiv - ${appendError} - ${message}`;
          if (document.documentElement) {
            document.documentElement.appendChild(errorDiv);
          }
          return;
        }
      }
      
      // innerHTMLの代わりに、createElementを使用（より安全）
      const logEntry = document.createElement('div');
      const time = new Date().toLocaleTimeString();
      logEntry.style.color = isError ? 'red' : '#0f0';
      logEntry.textContent = `[${time}] ${message}`;
      
      try {
        debugDiv.appendChild(logEntry);
        debugDiv.scrollTop = debugDiv.scrollHeight;
      } catch (appendError) {
        // appendChildが失敗した場合は、エラーを表示
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:10000;font-family:monospace;';
        errorDiv.textContent = `ERROR: Failed to append logEntry - ${appendError} - ${message}`;
        if (document.documentElement) {
          document.documentElement.appendChild(errorDiv);
        }
        return;
      }
      
      // コンソールにも出力（ローカル開発時のみ）
      if (import.meta.env.MODE === 'development') {
        if (isError) {
          console.error(message);
        } else {
          console.log(message);
        }
      }
    } catch (e) {
      // エラーが発生した場合は、直接DOMに書き込む（最後の手段）
      try {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:10000;font-family:monospace;';
        errorDiv.textContent = `[APP] addDebugLog ERROR: ${e instanceof Error ? e.message : String(e)} - Original: ${message}`;
        
        if (document.body) {
          document.body.appendChild(errorDiv);
        } else if (document.documentElement) {
          document.documentElement.appendChild(errorDiv);
        }
      } catch (finalError) {
        // すべてのDOM操作が失敗した場合は、コンソールに出力（Discord内では見えないが、ローカル開発時には有効）
        console.error('[APP] addDebugLog FATAL ERROR:', finalError, 'Original message:', message);
      }
    }
  };
  
  addDebugLog('[APP] Component rendering...');
  
  // デバッグモードの状態管理（フックは条件分岐の前に配置）
  const [debugMode, setDebugMode] = useState(false);
  const [showVolumeControl, setShowVolumeControl] = useState(false);
  const volumeControlRef = useRef<HTMLDivElement>(null);
  
  // ロビー画面の定期更新用のカウンター（画像・名前の反映を確実にするため）
  const [lobbyUpdateCounter, setLobbyUpdateCounter] = useState(0);
  
  // ロビー画面のタブ状態管理（更新時も保持されるようにAppで管理）
  const [lobbyActiveTab, setLobbyActiveTab] = useState<'participants' | 'settings' | 'howto'>('participants');
  
  // 手動更新用の関数
  const handleRefreshLobby = () => {
    setLobbyUpdateCounter(prev => prev + 1);
  };
  
  const { playSE, playBGM, toggleMute, muted, bgmVolume, setBgmVolume } = useSounds();
  addDebugLog('[APP] useSounds initialized');

  // Use new game engine
  let engine;
  try {
    engine = useGameEngine();
    addDebugLog('[APP] useGameEngine initialized');
  } catch (error) {
    addDebugLog(`[APP] useGameEngine ERROR: ${error instanceof Error ? error.message : String(error)}`, true);
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white' }}>
        <div>エラー: useGameEngineの初期化に失敗しました</div>
      </div>
    );
  }
  
  let phase, settings, adminId, players, myself, questionerId, questionCandidates, currentQuestion, result, currentRound, isDoubleScore, startGame, updateSettings, transferAdmin, selectQuestion, submitAnswer, nextRound, backToLobby, resetSession, scores;
  
  try {
    ({
      phase,
      settings,
      adminId,
      players,
      myself,
      questionerId,
      questionCandidates,
      currentQuestion,
      result,
      currentRound,
      isDoubleScore,
      scores,
      startGame,
      updateSettings,
      transferAdmin,
      selectQuestion,
      submitAnswer,
      nextRound,
      backToLobby,
      resetSession
    } = engine);
    
    addDebugLog(`[APP] Engine state extracted - phase: ${phase}, players: ${players.length}, myself: ${!!myself}`);
  } catch (error) {
    addDebugLog(`[APP] Engine destructuring ERROR: ${error instanceof Error ? error.message : String(error)}`, true);
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white' }}>
        <div>エラー: エンジン状態の取得に失敗しました</div>
      </div>
    );
  }

  // デバッグ: 現在の状態をログに出力
  useEffect(() => {
    console.log('[APP STATE]', {
      phase,
      playersCount: players.length,
      myselfId: myself?.id,
      adminId,
      skipLobby: import.meta.env.MODE === 'development',
      myselfExists: !!myself
    });
  }, [phase, players.length, myself?.id, adminId, myself]);

  // Sound Management - フックは条件分岐の前に呼び出す（React Hooks Rules）
  useEffect(() => {
    if (!myself) return; // myselfがnullの場合は何もしない
    addDebugLog(`[APP] Sound Management useEffect executed - phase: ${phase}`);
    if (phase === 'LOBBY') {
      playBGM('bgm_lobby');
    } else {
      playBGM('bgm_game');
    }

    if (phase === 'QUESTION_SELECTION') {
      // Maybe a specific sound?
    }
    if (phase === 'QUESTION') {
      playSE('se_question');
    }
    // REVEALフェーズでの効果音はResultScreenコンポーネントで個別に処理
  }, [phase, playBGM, playSE, myself, isDoubleScore]);

  // ロビー画面の定期更新（画像・名前の反映を確実にするため）
  // 5秒間隔で更新（目がチカチカしないように）
  useEffect(() => {
    if (phase !== 'LOBBY' || !myself) return;
    
    // 初回は即座に更新、その後は5秒ごとに更新
    const interval = setInterval(() => {
      setLobbyUpdateCounter(prev => prev + 1);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [phase, myself]);

  // デバッグ: phaseの値を確認（useEffectで実行して確実にログを出力）
  // レンダリング後に確実にログが表示されるようにする
  const shouldRenderLobby = phase === 'LOBBY';
  useEffect(() => {
    if (!myself) return; // myselfがnullの場合は何もしない
    addDebugLog(`[APP] Render complete (useEffect) - phase: "${phase}", shouldRenderLobby: ${shouldRenderLobby}`);
    addDebugLog(`[APP] Phase condition check - phase === 'LOBBY': ${phase === 'LOBBY'}`);
    addDebugLog(`[APP] DOM check - app-container exists: ${!!document.querySelector('.app-container')}`);
    addDebugLog(`[APP] DOM check - lobby exists: ${!!document.querySelector('.lobby')}`);
  }, [phase, shouldRenderLobby, myself]);

  // 画面外クリックで音量調節パネルを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumeControlRef.current && !volumeControlRef.current.contains(event.target as Node)) {
        setShowVolumeControl(false);
      }
    };

    if (showVolumeControl) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showVolumeControl]);

  // myselfがnullの場合はローディング表示（フックの後に配置）
  if (!myself) {
    addDebugLog(`[APP] myself is null, showing loading... - players: ${players.length}, phase: ${phase}`);
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white', flexDirection: 'column' }}>
        <div>PlayroomKit初期化中...</div>
        <div style={{ marginTop: '10px', fontSize: '12px', opacity: 0.7 }}>
          players: {players.length}, phase: {phase}
        </div>
      </div>
    );
  }
  
  addDebugLog(`[APP] Rendering main UI - phase: ${phase}, players: ${players.length}`);

  const isAdmin = myself.id === adminId;
  addDebugLog(`[APP] isAdmin calculated: ${isAdmin}`);
  
  const isQuestioner = myself.id === questionerId;
  addDebugLog(`[APP] isQuestioner calculated: ${isQuestioner}`);

  // Find questioner name
  const questionerPlayer = players.find(p => p.id === questionerId);
  // 質問者の名前を取得（同期されたDiscordプロファイルを最優先）
  const questionerName = questionerPlayer 
    ? (questionerPlayer.getState('discordProfile')?.name 
        || (questionerPlayer.id === myself.id && (window as any).discordProfile?.name)
        || questionerPlayer.getProfile().name)
    : 'Unknown';
  addDebugLog(`[APP] questionerName: ${questionerName}`);

  const myAnswer = myself.getState('answer') as number | undefined;
  addDebugLog(`[APP] myAnswer: ${myAnswer}`);
  
  // Lobbyコンポーネントを事前にログ出力してからレンダリング
  if (shouldRenderLobby) {
    addDebugLog(`[APP] Rendering Lobby component - phase: ${phase}`);
  } else {
    addDebugLog(`[APP] NOT rendering Lobby - phase: ${phase}`);
  }
  
  // デバッグ: return文の前に確実にログを出力
  addDebugLog(`[APP] Before return - phase: "${phase}", shouldRenderLobby: ${shouldRenderLobby}`);
  
  const handleToggleDebug = () => {
    const newState = !debugMode;
    setDebugMode(newState);
    if (window.toggleDebugLog) {
      window.toggleDebugLog();
    }
  };

  return (
    <div className="app-container">
      <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 1000, display: 'flex', gap: '10px' }}>
        {phase === 'LOBBY' && (
          <button
            className="btn-refresh"
            onClick={handleRefreshLobby}
            style={{ 
              background: 'rgba(100, 100, 100, 0.5)', 
              padding: '5px 10px', 
              color: 'white', 
              border: '1px solid rgba(255, 255, 255, 0.3)', 
              borderRadius: '4px', 
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
            title="参加者情報を更新"
          >
            🔄 更新
          </button>
        )}
        <button
          className="mute-btn"
          onClick={toggleMute}
          style={{ background: 'rgba(0,0,0,0.5)', padding: '5px 10px', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}
          title="音声のON/OFF"
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className="volume-btn"
            onClick={() => setShowVolumeControl(!showVolumeControl)}
            style={{ 
              background: 'rgba(0,0,0,0.5)', 
              padding: '5px 10px', 
              color: 'white', 
              border: '1px solid #555', 
              borderRadius: '4px', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="BGM音量調節"
          >
            🎵 {Math.round(bgmVolume * 100)}%
          </button>
          {showVolumeControl && (
            <div 
              ref={volumeControlRef}
              className="volume-control-panel"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '5px',
                background: 'rgba(0, 0, 0, 0.9)',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                minWidth: '200px',
                zIndex: 1001
              }}
            >
              <div style={{ marginBottom: '10px', color: 'white', fontSize: '14px', fontWeight: 'bold' }}>
                BGM音量
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={bgmVolume * 100}
                onChange={(e) => setBgmVolume(parseInt(e.target.value) / 100)}
                style={{
                  width: '100%',
                  marginBottom: '10px'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <button
                  onClick={() => setBgmVolume(0)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    background: bgmVolume === 0 ? 'rgba(255, 100, 100, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  0%
                </button>
                <button
                  onClick={() => setBgmVolume(0.25)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    background: Math.abs(bgmVolume - 0.25) < 0.01 ? 'rgba(100, 150, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  25%
                </button>
                <button
                  onClick={() => setBgmVolume(0.5)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    background: Math.abs(bgmVolume - 0.5) < 0.01 ? 'rgba(100, 150, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  50%
                </button>
                <button
                  onClick={() => setBgmVolume(0.75)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    background: Math.abs(bgmVolume - 0.75) < 0.01 ? 'rgba(100, 150, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  75%
                </button>
                <button
                  onClick={() => setBgmVolume(1.0)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    background: Math.abs(bgmVolume - 1.0) < 0.01 ? 'rgba(100, 150, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  100%
                </button>
              </div>
              <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px', textAlign: 'center' }}>
                現在: {Math.round(bgmVolume * 100)}%
              </div>
            </div>
          )}
        </div>
        <button
          className="debug-btn"
          onClick={handleToggleDebug}
          style={{ 
            background: debugMode ? 'rgba(0,150,0,0.7)' : 'rgba(0,0,0,0.5)', 
            padding: '5px 10px', 
            color: 'white', 
            border: '1px solid #555', 
            borderRadius: '4px', 
            cursor: 'pointer',
            fontSize: '12px'
          }}
          title="デバッグログの表示/非表示"
        >
          {debugMode ? '🐛 ON' : '🐛 OFF'}
        </button>
      </div>

      {shouldRenderLobby && (
        <Lobby
          key={lobbyUpdateCounter} // 定期更新をトリガーするためのkey
          players={players}
          myself={myself}
          adminId={adminId}
          settings={settings}
          onStart={startGame}
          onUpdateSettings={updateSettings}
          onTransferAdmin={transferAdmin}
          onResetSession={resetSession}
          activeTab={lobbyActiveTab}
          onTabChange={setLobbyActiveTab}
        />
      )}
      {phase === 'QUESTION_SELECTION' && (
        <SelectionScreen
          isQuestioner={isQuestioner}
          questionerName={questionerName}
          candidates={questionCandidates}
          onSelect={selectQuestion}
        />
      )}
      {phase === 'QUESTION' && (
        <QuestionScreen
          question={currentQuestion}
          questionerName={questionerName}
          onAnswer={submitAnswer}
          myAnswer={myAnswer}
          currentRound={currentRound}
          maxRounds={settings.maxRounds}
          isDoubleScore={isDoubleScore}
          timeLimit={settings.timeLimit}
          isHost={engine.isHost}
          waitingForSync={engine.waitingForSync}
          onForceStart={engine.forceStartReveal}
          players={players}
          questionSeq={engine.questionSeq}
        />
      )}
      {phase === 'ANSWERING' && (
        <WaitScreen />
      )}
      {phase === 'REVEAL' && result && (
        <ResultScreen
          result={result}
          players={players}
          onNext={nextRound}
          isAdmin={isAdmin}
          isDoubleScore={isDoubleScore}
          playSE={playSE}
        />
      )}
      {phase === 'RANKING' && (
        <RankingScreen
          players={players}
          scores={scores}
          onBackToLobby={backToLobby}
          isAdmin={isAdmin}
          playSE={playSE}
        />
      )}
    </div>
  );
}

// Appコンポーネントをエラーバウンダリーでラップ
const AppWithErrorBoundary = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithErrorBoundary;
