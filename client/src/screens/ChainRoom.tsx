import { useStore } from '../store';
import Timer from '../components/Timer';
import AnswerButton from '../components/AnswerButton';

export default function ChainRoom() {
  const { gameState, playerId, submitAnswer, chainTurn, chainResult } = useStore();
  if (!gameState || !playerId) return null;

  const me = gameState.players[playerId];
  const isMyTurn = chainTurn?.playerId === playerId;
  const currentPlayer = chainTurn ? gameState.players[chainTurn.playerId] : null;
  const question = chainTurn?.question;
  const remaining = gameState.chainQueue?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Chain header */}
      <div className="text-center py-2">
        <span className="text-3xl">🔗</span>
        <p className="text-indigo-300 font-bold text-lg mt-1">Цепочка!</p>
        <p className="text-xs text-gray-400">Осталось вопросов: {remaining + 1}</p>
      </div>

      {/* Chain result flash */}
      {chainResult && (
        <div className={`text-center py-2 animate-[fadeIn_0.3s_ease-out] ${chainResult.correct ? 'text-green-400' : 'text-red-400'}`}>
          <span className="text-2xl">{chainResult.correct ? '✅' : '❌'}</span>
          <span className="ml-2 font-bold">
            {gameState.players[chainResult.playerId]?.name ?? '?'} — {chainResult.correct ? 'Верно!' : 'Ошибка! −15 HP'}
          </span>
        </div>
      )}

      {/* Current turn */}
      {chainTurn && currentPlayer && (
        <div className={`border rounded-xl px-4 py-3 text-center ${
          isMyTurn
            ? 'bg-yellow-900/60 border-yellow-500/50 animate-pulse'
            : 'bg-gray-800/60 border-gray-600/50'
        }`}>
          <div className="font-bold text-sm">
            {isMyTurn ? '⚡ Ваш ход!' : `Отвечает: ${currentPlayer.name}`}
          </div>
        </div>
      )}

      {/* Timer */}
      {isMyTurn && (
        <Timer seconds={gameState.timer} maxSeconds={gameState.maxTimer} />
      )}

      {/* Question (only for current player) */}
      {isMyTurn && question && me?.currentAnswer === null && (
        <div className="px-2">
          <div className="text-xs text-gray-400 text-center mb-1">{question.category}</div>
          <p className="text-center text-white font-medium text-lg mb-4">{question.text}</p>
          <div className="flex flex-col gap-2">
            {question.options.map((opt, i) => (
              <AnswerButton
                key={i}
                index={i}
                text={opt}
                onClick={() => submitAnswer(i)}
                disabled={me?.currentAnswer !== null}
                selected={me?.currentAnswer === i}
                correct={null}
                showResult={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Waiting (not my turn) */}
      {!isMyTurn && chainTurn && (
        <div className="text-center text-gray-400 text-sm py-4">
          ⏳ Ждём ответа {currentPlayer?.name}...
        </div>
      )}

      {/* Streaks */}
      <div className="flex flex-wrap gap-2 justify-center mt-2">
        {Object.values(gameState.players).filter(p => p.isAlive).map(p => (
          <div key={p.id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800/60 text-xs">
            <span className={p.id === playerId ? 'text-[var(--color-dungeon-gold)]' : 'text-gray-300'}>
              {p.name}
            </span>
            <span className="text-orange-400 font-bold">🔥{p.streak}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
