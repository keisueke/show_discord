import { useEffect } from 'react';
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

const Lobby = ({ onStart, players, myself, adminId, settings, onUpdateSettings, onTransferAdmin, scores }: LobbyProps) => {
  // デバッグログ
  const debugDiv = document.getElementById('debug-log');
  if (debugDiv) {
    const time = new Date().toLocaleTimeString();
    debugDiv.innerHTML += `<div>[${time}] [LOBBY] Component rendering - players: ${players.length}, adminId: ${adminId}, myselfId: ${myself.id}</div>`;
    debugDiv.scrollTop = debugDiv.scrollHeight;
  }
  console.log('[LOBBY] Component rendering', { players: players.length, adminId, myselfId: myself.id });
  
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
        {players.map((p) => (
          <div key={p.id} className="player-badge" style={{ backgroundColor: (p.getProfile().color as any).hex || '#ccc' }}>
            <span className="player-info">
              {p.id === adminId && <span className="admin-badge">👑</span>}
              {p.getProfile().name} {p.id === myself.id && '(You)'}
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
        ))}
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
}

const QuestionScreen = ({ question, questionerName, onAnswer, myAnswer, currentRound, maxRounds, isDoubleScore }: QuestionScreenProps) => {
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
      <h2>問題</h2>
      {question && (
        <>
          <div className="question-category">カテゴリ: {question.category}</div>
          <p className="question-text">{question.text}</p>
        </>
      )}
      <form onSubmit={handleSubmit}>
        <input name="answer" type="number" placeholder="数字を入力" />
        <button type="submit">回答する</button>
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

          return (
            <motion.li
              key={p.id}
              className={`result-item ${val === result.median ? 'highlight' : ''}`}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 1 + (i * 0.2) }}
            >
              <div className="player-info-result">
                <span className="player-name" style={{ color: (p.getProfile().color as any).hex || '#000' }}>
                  {p.getProfile().name}
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
  // デバッグログに直接出力（DOMに表示される）
  const debugDiv = document.getElementById('debug-log');
  
  // デバッグログ出力ヘルパー関数
  const addDebugLog = (message: string, isError = false) => {
    if (debugDiv) {
      const time = new Date().toLocaleTimeString();
      const color = isError ? 'color:red;' : '';
      debugDiv.innerHTML += `<div style="${color}">[${time}] ${message}</div>`;
      debugDiv.scrollTop = debugDiv.scrollHeight;
    }
    if (isError) {
      console.error(message);
    } else {
      console.log(message);
    }
  };
  
  addDebugLog('[APP] Component rendering...');
  
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

  // myselfがnullの場合はローディング表示
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
  const isQuestioner = myself.id === questionerId;

  // Find questioner name
  const questionerPlayer = players.find(p => p.id === questionerId);
  const questionerName = questionerPlayer ? questionerPlayer.getProfile().name : 'Unknown';

  const myAnswer = myself.getState('answer') as number | undefined;

  // Sound Management
  useEffect(() => {
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
  }, [phase, playBGM, playSE]);


  // デバッグ: phaseの値を確認（useEffectで実行して確実にログを出力）
  useEffect(() => {
    addDebugLog(`[APP] About to render (useEffect) - phase: "${phase}", type: ${typeof phase}, === 'LOBBY': ${phase === 'LOBBY'}`);
    addDebugLog(`[APP] Phase condition check - phase === 'LOBBY': ${phase === 'LOBBY'}`);
  }, [phase]);
  
  // デバッグ: phaseの値を確認
  addDebugLog(`[APP] About to render - phase: "${phase}", type: ${typeof phase}, === 'LOBBY': ${phase === 'LOBBY'}`);
  
  // Lobbyコンポーネントをレンダリングするかどうかを決定
  const shouldRenderLobby = phase === 'LOBBY';
  addDebugLog(`[APP] shouldRenderLobby: ${shouldRenderLobby}`);
  
  return (
    <div className="app-container">
      <button
        className="mute-btn"
        onClick={toggleMute}
        style={{ position: 'fixed', top: 10, right: 10, zIndex: 1000, background: 'rgba(0,0,0,0.5)', padding: '5px 10px' }}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {shouldRenderLobby && (() => {
        addDebugLog(`[APP] Rendering Lobby component now`);
        return (
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
        );
      })()}
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

export default App;
