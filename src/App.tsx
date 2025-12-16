import { useEffect, useState, Component } from 'react';
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
  scores: Record<string, number>;
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

const Lobby = ({ onStart, players, myself, adminId, settings, onUpdateSettings, onTransferAdmin, scores }: LobbyProps) => {
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
      <h1>クイズいい線いきましょう！</h1>

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

      <div className="players-list">
        <h3>参加者</h3>
        {players.map((p) => {
          // Discord情報がある場合は優先的に使用（自分自身の場合のみ）
          const isMyself = p.id === myself.id;
          const discordProfile = isMyself && (window as any).discordProfile ? (window as any).discordProfile : null;
          const profile = p.getProfile();
          const displayName = discordProfile?.name || profile.name;
          const displayColor = discordProfile?.color || profile.color;
          const colorHex = displayColor?.hexString || displayColor?.hex || (displayColor as any)?.hex || '#ccc';
          
          return (
            <div key={p.id} className="player-badge" style={{ backgroundColor: colorHex }}>
              <span className="player-info">
                {p.id === adminId && <span className="admin-badge">👑</span>}
                {displayName} {p.id === myself.id && '(You)'}
                <span className="score-badge">Pts: {scores[p.id] || 0}</span>
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

      {isAdmin ? (
        <button onClick={onStart} className="btn-start">ゲーム開始</button>
      ) : (
        <div className="waiting-message">ホストがゲームを開始するのを待っています...</div>
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
}

interface QuestionScreenProps {
  question: Question | null;
  questionerName: string;
  onAnswer: (val: number) => void;
  myAnswer: number | undefined;
  currentRound: number;
  maxRounds: number;
  isDoubleScore: boolean;
  timeLimit: number;
}

const QuestionScreen = ({ question, questionerName, onAnswer, myAnswer, currentRound, maxRounds, isDoubleScore, timeLimit }: QuestionScreenProps) => {
  const [remainingTime, setRemainingTime] = useState(timeLimit);
  const [isTimeUp, setIsTimeUp] = useState(false);

  // タイマーの実装
  useEffect(() => {
    if (myAnswer !== undefined || isTimeUp) {
      return; // 既に回答済みまたは時間切れの場合はタイマーを停止
    }

    setRemainingTime(timeLimit); // タイマーをリセット

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          setIsTimeUp(true);
          // 時間切れの場合は0を自動送信
          setTimeout(() => {
            onAnswer(0);
          }, 100);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [question, myAnswer, isTimeUp, timeLimit, onAnswer]);

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
      <div className="timer-container" style={{ 
        marginBottom: '20px',
        width: '100%',
        maxWidth: '600px',
        margin: '0 auto 20px'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '8px'
        }}>
          <span style={{ 
            fontSize: '18px', 
            fontWeight: 'bold',
            color: isWarning ? '#ff4444' : '#fff'
          }}>
            残り時間: {remainingTime}秒
          </span>
          {isWarning && (
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              style={{ color: '#ff4444', fontSize: '16px' }}
            >
              ⚠️
            </motion.span>
          )}
        </div>
        {/* プログレスバー */}
        <div style={{
          width: '100%',
          height: '8px',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 1, ease: 'linear' }}
            style={{
              height: '100%',
              backgroundColor: isWarning ? '#ff4444' : '#4CAF50',
              borderRadius: '4px',
              boxShadow: isWarning ? '0 0 10px rgba(255, 68, 68, 0.5)' : 'none'
            }}
          />
          {remainingTime === 0 && (
            <motion.div
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '12px'
              }}
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

  // Trigger confetti and sound if I got points
  useEffect(() => {
    const myId = myPlayer().id;
    const myScoreChange = result.scoreChanges?.[myId] || 0;
    if (myScoreChange > 0) {
      playSE('se_cheer');
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [result, playSE]);

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
          
          // Discord情報がある場合は優先的に使用（自分自身の場合のみ）
          const isMyself = p.id === myself.id;
          const discordProfile = isMyself && (window as any).discordProfile ? (window as any).discordProfile : null;
          const profile = p.getProfile();
          const displayName = discordProfile?.name || profile.name;
          const displayColor = discordProfile?.color || profile.color;
          const colorHex = displayColor?.hexString || displayColor?.hex || (displayColor as any)?.hex || '#000';

          return (
            <motion.li
              key={p.id}
              className={`result-item ${val === result.median ? 'highlight' : ''}`}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 1 + (i * 0.2) }}
            >
              <div className="player-info-result">
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
  
  const { playSE, playBGM, toggleMute, muted } = useSounds();
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
  
  let phase, settings, adminId, players, myself, questionerId, questionCandidates, currentQuestion, result, currentRound, scores, isDoubleScore, startGame, updateSettings, transferAdmin, selectQuestion, submitAnswer, nextRound;
  
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
      scores,
      isDoubleScore,
      startGame,
      updateSettings,
      transferAdmin,
      selectQuestion,
      submitAnswer,
      nextRound
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
    if (phase === 'REVEAL') {
      playSE('se_result');
    }
  }, [phase, playBGM, playSE, myself]);

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
  // 質問者の名前を取得（自分自身の場合はDiscord情報を優先）
  const questionerName = questionerPlayer 
    ? (questionerPlayer.id === myself.id && (window as any).discordProfile?.name
        ? (window as any).discordProfile.name
        : questionerPlayer.getProfile().name)
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
        <button
          className="mute-btn"
          onClick={toggleMute}
          style={{ background: 'rgba(0,0,0,0.5)', padding: '5px 10px', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}
          title="音声のON/OFF"
        >
          {muted ? '🔇' : '🔊'}
        </button>
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
          players={players}
          myself={myself}
          adminId={adminId}
          settings={settings}
          onStart={startGame}
          onUpdateSettings={updateSettings}
          onTransferAdmin={transferAdmin}
          scores={scores}
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
