import { useGameEngine } from './hooks/useGameEngine';
import type { GameSettings, Question } from './types';
import type { PlayerState as PlayroomPlayer } from 'playroomkit';
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
}

const Lobby = ({ onStart, players, myself, adminId, settings, onUpdateSettings, onTransferAdmin }: LobbyProps) => {
  const isAdmin = myself.id === adminId;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onUpdateSettings({
      ...settings,
      [name]: parseInt(value) || 0
    });
  };

  return (
    <div className="screen lobby">
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

const QuestionScreen = ({ question, questionerName, onAnswer, myAnswer, currentRound, maxRounds }: QuestionScreenProps) => {
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
          <div className="category-label">[{question?.category}]</div>
          <div className="question-text-small">{question?.text}</div>
        </div>
        <h2>回答完了！</h2>
        <p>他のプレイヤーを待っています...</p>
      </div>
    );
  }

  return (
    <div className="screen question">
      <div className="round-info">Round {currentRound} / {maxRounds}</div>
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
  result: { median: number };
  players: PlayroomPlayer[];
  onNext: () => void;
  isAdmin: boolean;
}

const ResultScreen = ({ result, players, onNext, isAdmin }: ResultScreenProps) => {
  const sortedPlayers = [...players].sort((a, b) => (a.getState('answer') as number) - (b.getState('answer') as number));

  return (
    <div className="screen result">
      <h2>結果発表</h2>
      <div className="good-line">いい線（中央値）: {result.median}</div>
      <ul className="answers-list">
        {sortedPlayers.map((p) => {
          const val = p.getState('answer') as number;
          return (
            <li key={p.id} className={val === result.median ? 'highlight' : ''}>
              <span style={{ color: (p.getProfile().color as any).hex || '#000' }}>{p.getProfile().name}</span>: {val}
            </li>
          );
        })}
      </ul>
      {isAdmin ? (
        <button onClick={onNext}>次の問題へ</button>
      ) : (
        <div>ホストが次へ進むのを待っています...</div>
      )}
    </div>
  );
};

function App() {
  // Use new game engine
  const engine = useGameEngine();
  const {
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
    startGame,
    updateSettings,
    transferAdmin,
    selectQuestion,
    submitAnswer,
    nextRound
  } = engine;

  const isAdmin = myself.id === adminId;
  const isQuestioner = myself.id === questionerId;

  // Find questioner name
  const questionerPlayer = players.find(p => p.id === questionerId);
  const questionerName = questionerPlayer ? questionerPlayer.getProfile().name : 'Unknown';

  const myAnswer = myself.getState('answer') as number | undefined;

  return (
    <div className="app-container">
      {phase === 'LOBBY' && (
        <Lobby
          players={players}
          myself={myself}
          adminId={adminId}
          settings={settings}
          onStart={startGame}
          onUpdateSettings={updateSettings}
          onTransferAdmin={transferAdmin}
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
        />
      )}
    </div>
  );
}

export default App;
