import { useStore } from '../store';
import FloorIndicator from '../components/FloorIndicator';
import AbilityButton from '../components/AbilityButton';
import BattleScene from '../components/BattleScene';
import BattleRoom from './BattleRoom';
import TrapRoom from './TrapRoom';
import ChainRoom from './ChainRoom';
import BetPhase from './BetPhase';
import CheatMenu from '../components/CheatMenu';
import FloorIntroPopup from '../components/FloorIntroPopup';
import RecordButton from '../components/RecordButton';
import RewardOverlay from '../components/RewardOverlay';
import PerkButtons from '../components/PerkButtons';

export default function GameScreen() {
  const { gameState, playerId, captainId, sacrificePlayerId, betPhase } = useStore();
  if (!gameState || !playerId) return null;

  const me = gameState.players[playerId];
  const floor = gameState.floors[gameState.currentFloor - 1];
  const phase = gameState.phase;
  const players = Object.values(gameState.players);
  const results = gameState.lastResults;

  const params = floor?.params;
  const isCaptainMode = params?.whoAnswers === 'captain';
  const iAmCaptain = isCaptainMode && captainId === playerId;
  const captainPlayer = captainId ? gameState.players[captainId] : null;
  const isSacrifice = params?.whoAnswers === 'sacrifice';
  const iAmSacrifice = isSacrifice && sacrificePlayerId === playerId;
  const sacrificePlayer = sacrificePlayerId ? gameState.players[sacrificePlayerId] : null;

  return (
    <div className="h-full flex flex-col p-3 max-w-xl mx-auto">
      {/* Floor path */}
      <FloorIndicator current={gameState.currentFloor} total={gameState.totalFloors} floors={gameState.floors} />

      {/* Mode badge */}
      {floor && params && (
        <div className="flex gap-2 justify-center mb-2">
          <span className="px-4 py-1.5 rounded-full text-sm font-bold glass-panel border-glow text-white">
            {params.emoji} {params.name}
          </span>
          {floor.isBoss && (
            <span className="px-3 py-1.5 rounded-full bg-red-900/40 border border-red-500/30 text-red-400 text-sm font-bold glow-red">💀 Босс</span>
          )}
        </div>
      )}

      {/* Isolation overlay */}
      {params?.commsBlocked && phase === 'answering' && (
        <div className="fixed inset-y-0 left-0 right-0 md:right-72 pointer-events-none z-30 flex items-start justify-center pt-20">
          <div className="glass-panel rounded-2xl px-6 py-3 border border-purple-500/30 animate-pulse glow-blue">
            <span className="text-purple-200 font-bold text-sm">🔇 Связь заблокирована — думай сам!</span>
          </div>
        </div>
      )}

      {/* Captain/sacrifice notices */}
      {isCaptainMode && !iAmCaptain && phase === 'answering' && (
        <div className="glass-panel-gold rounded-2xl px-4 py-3 mb-3 text-center">
          <div className="text-amber-300 font-bold text-sm">👑 Отвечает капитан: {captainPlayer?.name}</div>
        </div>
      )}
      {iAmCaptain && phase === 'answering' && !betPhase && (
        <div className="glass-panel-gold rounded-2xl px-4 py-3 mb-3 text-center glow-gold">
          <div className="text-amber-200 font-bold text-sm">👑 Вы — капитан!</div>
        </div>
      )}
      {isSacrifice && sacrificePlayer && phase === 'answering' && (
        <div className={`glass-panel rounded-2xl px-4 py-3 mb-3 text-center ${iAmSacrifice ? 'border border-red-500/40 glow-red' : 'border border-red-600/20'}`}>
          <div className="text-red-300 font-bold text-sm">
            💀 {iAmSacrifice ? 'Вы — жертва! Ошибка = смерть!' : `Жертва: ${sacrificePlayer.name}`}
          </div>
        </div>
      )}

      {/* Floor intro popup */}
      {phase === 'floor-intro' && floor && params && (
        <FloorIntroPopup
          floor={floor}
          playerId={playerId}
          captainPlayer={captainPlayer}
          sacrificePlayer={sacrificePlayer}
          isCaptainMode={isCaptainMode}
          isSacrifice={isSacrifice}
        />
      )}

      {/* Battle scene */}
      {(phase === 'answering' || phase === 'results' || phase === 'chain-turn') && floor && floor.monster && (
        <BattleScene
          players={players}
          monster={floor.monster}
          damageToMonster={phase === 'results' ? results?.damageDealt : undefined}
          damageToPlayers={phase === 'results' ? results?.damageTaken : undefined}
          monsterDefeated={phase === 'results' ? results?.monsterDefeated : undefined}
          playersHit={phase === 'results' ? results?.playersHit : undefined}
        />
      )}

      {/* Bet phase (shows alongside question) */}
      {betPhase && isCaptainMode && phase === 'answering' && (
        <BetPhase iAmCaptain={iAmCaptain} captainName={captainPlayer?.name ?? '?'} />
      )}

      {/* Room content */}
      {(phase === 'question' || phase === 'answering' || phase === 'results') && floor && params && (
        <div className="flex-1">
          {params.questionScope === 'personal' && params.whoAnswers !== 'chain' ? (
            <TrapRoom />
          ) : (
            <BattleRoom />
          )}
        </div>
      )}

      {/* Chain mode */}
      {phase === 'chain-turn' && floor && (
        <div className="flex-1">
          <ChainRoom />
        </div>
      )}

      {/* Ability button (classic mode only — class-based abilities) */}
      {phase === 'answering' && me && me.isAlive && me.playerClass && (
        !isCaptainMode || iAmCaptain
      ) && (
        !isSacrifice || iAmSacrifice
      ) && (
        <div className="mt-3 mb-2">
          <AbilityButton player={me} />
        </div>
      )}

      {/* Perk buttons (rpg-rewards mode — replaces class abilities) */}
      {gameState.gameMode === 'rpg-rewards' && me?.perks && me.perks.length > 0 && (
        <div className="mt-3 mb-2">
          <PerkButtons perks={me.perks} />
        </div>
      )}

      {/* Reward overlay (rpg-rewards between-floor pick) */}
      {phase === 'reward' && <RewardOverlay />}

      {/* Host cheat menu */}
      {gameState.hostId === playerId && <CheatMenu />}

      {/* Record button */}
      <RecordButton />

    </div>
  );
}
