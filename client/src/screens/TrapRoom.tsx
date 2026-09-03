import { useStore } from '../store';
import Timer from '../components/Timer';
import AnswerButton from '../components/AnswerButton';

export default function TrapRoom() {
  const { gameState, playerId, submitAnswer, personalQuestion, personalResult } = useStore();

  if (!gameState || !playerId) return null;

  const me = gameState.players[playerId];
  const question = personalQuestion ?? gameState.currentQuestion;
  const phase = gameState.phase;
  const showResult = personalResult !== null;

  return (
    <div className="flex flex-col gap-4">
      {/* Warning */}
      <div className="text-center py-3">
        <span className="text-3xl">⚠️</span>
        <p className="text-red-400 font-bold text-lg mt-1">
          Ловушка! Каждый отвечает сам!
        </p>
      </div>

      {/* Timer */}
      {phase === 'answering' && !showResult && (
        <Timer seconds={gameState.timer} maxSeconds={gameState.maxTimer} />
      )}

      {/* Question */}
      {question && !showResult && (
        <div className="px-2">
          <div className="text-xs text-gray-400 text-center mb-1">
            {question.category}
          </div>
          <p className="text-center text-white font-medium text-lg mb-4">
            {question.text}
          </p>
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

      {/* Personal result */}
      {showResult && personalResult && (
        <div className="flex flex-col items-center gap-3 py-8">
          {personalResult.correct ? (
            <>
              <span className="text-5xl">✅</span>
              <p className="text-green-400 font-bold text-xl">Ты прошёл ловушку!</p>
            </>
          ) : (
            <>
              <span className="text-5xl">💥</span>
              <p className="text-red-400 font-bold text-xl">
                Ловушка сработала! -{personalResult.hpLost} HP
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
