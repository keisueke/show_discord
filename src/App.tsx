import { useEffect } from 'react';
import { useDiscord } from './hooks/useDiscord';
import { useGameLogic } from './game/GameLogic';
import type { Player, GameState } from './types';
import './App.css';

interface LobbyProps {
  onStart: () => void;
  players: Record<string, Player>;
  selfId: string | null;
}

const Lobby = ({ onStart, players, selfId }: LobbyProps) => (
  <div className="screen lobby">
    <h1>クイズいい線いきましょう！</h1>
    <div className="players-list">
      {Object.values(players).map((p) => (
        <div key={p.id} className="player-badge">
          {p.username} {p.id === selfId && '(You)'}
        </div>
      ))}
    </div>
    <button onClick={onStart}>ゲーム開始</button>
  </div>
);

interface QuestionScreenProps {
  question: string | null;
  onAnswer: (val: number) => void;
}

const QuestionScreen = ({ question, onAnswer }: QuestionScreenProps) => {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('answer') as HTMLInputElement;
    const val = parseInt(input.value);
    if (!isNaN(val)) onAnswer(val);
  };
  return (
    <div className="screen question">
      <h2>問題</h2>
      <p className="question-text">{question}</p>
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
  result: NonNullable<GameState['result']>;
  answers: Record<string, number>;
  players: Record<string, Player>;
  onNext: () => void;
}

const ResultScreen = ({ result, answers, players, onNext }: ResultScreenProps) => {
  return (
    <div className="screen result">
      <h2>結果発表</h2>
      <div className="good-line">いい線（中央値）: {result.median}</div>
      <ul className="answers-list">
        {Object.entries(answers).sort(([, a], [, b]) => a - b).map(([pid, val]) => (
          <li key={pid} className={val === result.median ? 'highlight' : ''}>
            {players[pid]?.username ?? 'Unknown'}: {val}
          </li>
        ))}
      </ul>
      <button onClick={onNext}>次の問題へ</button>
    </div>
  );
};

function App() {
  const { user, ready } = useDiscord();
  const {
    gameState,
    selfId,
    joinGame,
    startGame,
    submitAnswer,
    revealResults,
    nextRound
  } = useGameLogic();

  useEffect(() => {
    if (user && !gameState.players[user.id]) {
      joinGame(user);
    }
  }, [user, joinGame, gameState.players]);

  if (!ready) return <div className="loading">Loading...</div>;

  const handleAnswer = (val: number) => {
    if (selfId) {
      submitAnswer(selfId, val);
      setTimeout(revealResults, 1000);
    }
  };

  return (
    <div className="app-container">
      {gameState.phase === 'LOBBY' && (
        <Lobby players={gameState.players} selfId={selfId} onStart={startGame} />
      )}
      {gameState.phase === 'QUESTION' && (
        <QuestionScreen
          question={gameState.currentQuestion}
          onAnswer={handleAnswer}
        />
      )}
      {gameState.phase === 'ANSWERING' && (
        <WaitScreen />
      )}
      {gameState.phase === 'REVEAL' && gameState.result && (
        <ResultScreen
          result={gameState.result}
          answers={gameState.answers}
          players={gameState.players}
          onNext={nextRound}
        />
      )}
    </div>
  );
}

export default App;
