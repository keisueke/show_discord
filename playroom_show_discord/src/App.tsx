import { useGameEngine } from './hooks/useGameEngine';
import './index.css';

// Components
const Lobby = ({ isHost, onStart, players, myself }: any) => (
  <div className="screen lobby">
    <h1>クイズいい線いきましょう！(Playroom版)</h1>
    <div className="players-list">
      {players.map((p: any) => (
        <div key={p.id} className="player-badge" style={{ backgroundColor: p.getProfile().color }}>
          {p.getProfile().name} {p.id === myself.id && '(You)'}
        </div>
      ))}
    </div>
    {isHost ? (
      <button onClick={onStart}>ゲーム開始</button>
    ) : (
      <p>ホストがゲームを開始するのを待っています...</p>
    )}
  </div>
);

const QuestionScreen = ({ question, onAnswer, myAnswer }: any) => {
  const handleSubmit = (e: any) => {
    e.preventDefault();
    const val = parseInt(e.target.answer.value);
    if (!isNaN(val)) onAnswer(val);
  };

  if (myAnswer !== undefined) {
    return <div className="screen wait"><h2>回答完了！他のプレイヤーを待っています...</h2></div>;
  }

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

const ResultScreen = ({ result, players, onNext, isHost }: any) => {
  return (
    <div className="screen result">
      <h2>結果発表</h2>
      <div className="good-line">いい線（中央値）: {result.median}</div>
      <ul className="answers-list">
        {players
          .map((p: any) => ({ p, val: p.getState('answer') }))
          .sort((a: any, b: any) => a.val - b.val)
          .map(({ p, val }: any) => (
            <li key={p.id} className={val === result.median ? 'highlight' : ''}>
              <span style={{ color: p.getProfile().color }}>{p.getProfile().name}</span>: {val}
            </li>
          ))}
      </ul>
      {isHost && <button onClick={onNext}>次の問題へ</button>}
    </div>
  );
};

function App() {
  const {
    phase,
    currentQuestion,
    result,
    players,
    myself,
    startGame,
    submitAnswer,
    nextRound,
    isHost
  } = useGameEngine();

  // Determine current screen based on phase
  return (
    <div className="app-container">
      {phase === 'LOBBY' && (
        <Lobby
          isHost={isHost}
          onStart={startGame}
          players={players}
          myself={myself}
        />
      )}
      {phase === 'QUESTION' && (
        <QuestionScreen
          question={currentQuestion}
          onAnswer={submitAnswer}
          myAnswer={myself.getState('answer')}
        />
      )}
      {/* Assuming REVEAL phase handles result display */}
      {phase === 'REVEAL' && result && (
        <ResultScreen
          result={result}
          players={players}
          onNext={nextRound}
          isHost={isHost}
        />
      )}
    </div>
  );
}

export default App;
