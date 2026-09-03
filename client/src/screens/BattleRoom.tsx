import { useEffect, useState } from 'react';
import { useStore } from '../store';
import Timer from '../components/Timer';
import AnswerButton from '../components/AnswerButton';

type ResultStep = 'correct-answer' | 'player-results' | 'damage-dealt' | 'damage-taken' | 'summary';

export default function BattleRoom() {
  const { gameState, playerId, submitAnswer, captainId, sacrificePlayerId } = useStore();
  const [resultStep, setResultStep] = useState<ResultStep | null>(null);
  const [prevPhase, setPrevPhase] = useState<string | null>(null);

  const phase = gameState?.phase ?? '';
  const results = gameState?.lastResults;

  // Step through results with delays
  useEffect(() => {
    if (phase === 'results' && prevPhase !== 'results' && results) {
      setResultStep('correct-answer');
      const t1 = setTimeout(() => setResultStep('player-results'), 1800);
      const t2 = setTimeout(() => setResultStep('damage-dealt'), 3500);
      const t3 = setTimeout(() => setResultStep('damage-taken'), 5000);
      const t4 = setTimeout(() => setResultStep('summary'), 6500);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    }
    if (phase !== 'results') {
      setResultStep(null);
    }
    setPrevPhase(phase);
  }, [phase]);

  if (!gameState || !playerId) return null;

  const question = gameState.currentQuestion;
  const me = gameState.players[playerId];
  const floor = gameState.floors[gameState.currentFloor - 1];
  const params = floor?.params;
  const showResult = phase === 'results';

  const isCaptainMode = params?.whoAnswers === 'captain';
  const iAmCaptain = isCaptainMode && captainId === playerId;
  const isSpectatorCaptain = isCaptainMode && !iAmCaptain;

  const isSacrificeMode = params?.whoAnswers === 'sacrifice';
  const iAmSacrifice = isSacrificeMode && sacrificePlayerId === playerId;
  const isSpectatorSacrifice = isSacrificeMode && !iAmSacrifice;

  const isSpectator = isSpectatorCaptain || isSpectatorSacrifice;
  const canAnswer = !showResult && !isSpectator && me?.currentAnswer === null;

  const stepIdx = resultStep ? ['correct-answer', 'player-results', 'damage-dealt', 'damage-taken', 'summary'].indexOf(resultStep) : -1;

  return (
    <div className="flex flex-col gap-3">
      {/* Timer */}
      {phase === 'answering' && (
        <Timer seconds={gameState.timer} maxSeconds={gameState.maxTimer} />
      )}

      {/* Question */}
      {question && (
        <div className="px-1">
          <div className="text-xs text-gray-500 text-center mb-1">{question.category}</div>
          <p className="text-center text-white font-medium text-lg mb-3 leading-snug">{question.text}</p>

          {/* Answers */}
          <div className="flex flex-col gap-2">
            {question.options.map((opt, i) => {
              const relevantAnswer = isCaptainMode && captainId
                ? gameState.players[captainId]?.currentAnswer
                : isSacrificeMode && sacrificePlayerId
                  ? gameState.players[sacrificePlayerId]?.currentAnswer
                  : me?.currentAnswer;
              return (
                <AnswerButton
                  key={i}
                  index={i}
                  text={opt}
                  onClick={() => submitAnswer(i)}
                  disabled={!canAnswer}
                  selected={relevantAnswer === i}
                  correct={showResult && stepIdx >= 0 ? i === results?.correctIndex : null}
                  showResult={showResult && stepIdx >= 0}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Phased results */}
      {showResult && results && (
        <div className="flex flex-col items-center gap-3 py-3">

          {/* Step 1: Correct answer reveal */}
          {stepIdx >= 0 && (
            <div className="text-center animate-[fadeIn_0.4s_ease-out]">
              <div className="text-sm text-gray-400 mb-1">Правильный ответ</div>
              <div className="text-lg font-bold text-green-400">
                ✅ {question?.options[results.correctIndex]}
              </div>
            </div>
          )}

          {/* Step 2: Who answered what */}
          {stepIdx >= 1 && (
            <div className="w-full glass-panel rounded-2xl p-3 animate-[fadeIn_0.4s_ease-out]">
              <div className="text-xs text-gray-500 text-center mb-2 font-bold uppercase">Ответы команды</div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(results.playerAnswers).map(([pid, ans]) => {
                  const player = gameState?.players[pid];
                  const isCorrect = ans === results.correctIndex;
                  const dmg = results.playerDamage?.[pid];
                  return (
                    <div key={pid} className={`flex items-center justify-between text-sm px-2 py-1.5 rounded-lg ${isCorrect ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-base">{isCorrect ? '✅' : ans === null ? '⏰' : '❌'}</span>
                        <span className={isCorrect ? 'text-green-300' : 'text-red-300'}>{player?.name ?? '?'}</span>
                      </div>
                      {stepIdx >= 2 && dmg !== undefined && (
                        <span className={`font-bold text-xs animate-[fadeIn_0.3s_ease-out] ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                          {isCorrect ? `+${dmg} ⚔️` : '−HP 💔'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Damage dealt to monster */}
          {stepIdx >= 2 && results.damageDealt > 0 && (
            <div className="flex items-center gap-3 animate-[fadeIn_0.4s_ease-out] glass-panel rounded-2xl px-4 py-3 w-full justify-center">
              <span className="text-3xl">⚔️</span>
              <div>
                <span className="text-green-400 font-black text-2xl">−{results.damageDealt}</span>
                <span className="text-green-400/60 text-sm ml-2">урон монстру</span>
              </div>
            </div>
          )}

          {/* Step 4: Damage taken by party */}
          {stepIdx >= 3 && results.damageTaken > 0 && (
            <div className="flex items-center gap-3 animate-[fadeIn_0.4s_ease-out] bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 w-full justify-center">
              <span className="text-3xl">💔</span>
              <div>
                <span className="text-red-400 font-black text-2xl">−{results.damageTaken}</span>
                <span className="text-red-400/60 text-sm ml-2">урон каждому</span>
              </div>
            </div>
          )}

          {/* Step 5: Monster defeated? */}
          {stepIdx >= 4 && results.monsterDefeated && (
            <div className="text-center animate-[fadeIn_0.5s_ease-out] py-2">
              <span className="text-[var(--color-dungeon-gold)] font-black text-2xl drop-shadow-[0_0_12px_rgba(245,197,24,0.4)] animate-bounce">
                🎉 Монстр повержен!
              </span>
            </div>
          )}

          {stepIdx >= 4 && !results.monsterDefeated && results.damageTaken > 0 && (
            <div className="text-center animate-[fadeIn_0.5s_ease-out] text-sm text-gray-400">
              Монстр выжил — бьём снова...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
