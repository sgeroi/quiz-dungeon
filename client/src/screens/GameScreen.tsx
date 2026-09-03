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
import ScoreStrip from '../components/ScoreStrip';
import TeamBadge from '../components/TeamBadge';
import { classicView } from '../components/classicTeams';

export default function GameScreen() {
  const { gameState, playerId, captainId: storeCaptainId, sacrificePlayerId: storeSacrificeId } = useStore();
  if (!gameState || !playerId) return null;

  const me = gameState.players[playerId];
  const floor = gameState.floors[gameState.currentFloor - 1];
  const phase = gameState.phase;
  const results = gameState.lastResults;

  // Team-format view: own team's monster/captain/sacrifice in teams-mode, party otherwise.
  const cv = classicView(gameState, playerId, storeCaptainId, storeSacrificeId);
  const { captainId, sacrificeId } = cv;

  const params = floor?.params;
  const isCaptainMode = params?.whoAnswers === 'captain';
  const iAmCaptain = isCaptainMode && captainId === playerId;
  const captainPlayer = captainId ? gameState.players[captainId] : null;
  const isSacrifice = params?.whoAnswers === 'sacrifice';
  const iAmSacrifice = isSacrifice && sacrificeId === playerId;
  const sacrificePlayer = sacrificeId ? gameState.players[sacrificeId] : null;
  // Server truth for the bet overlay (stays up until every captain has bet in teams-mode).
  const betPhase = !!gameState.betPhase;

  // Round numbers to animate: own team's in teams-mode, party's otherwise.
  const tb = cv.myBattle;
  const dmgToMonster = cv.isTeams ? tb?.lastDamageDealt : results?.damageDealt;
  const dmgToPlayers = cv.isTeams ? tb?.lastDamageTaken : results?.damageTaken;
  const defeated = cv.isTeams ? tb?.lastDefeated : results?.monsterDefeated;
  const partyIds = new Set(cv.party.map((p) => p.id));
  const playersHit = results?.playersHit.filter((id) => partyIds.has(id));

  return (
    <div className="h-full flex flex-col p-3 max-w-xl mx-auto">
      {/* Floor path */}
      <FloorIndicator current={gameState.currentFloor} total={gameState.totalFloors} floors={gameState.floors} />

      {/* Mode badge */}
      {floor && params && (
        <div className="flex gap-2 justify-center mb-2 flex-wrap">
          <span className="px-4 py-1.5 rounded-full text-sm font-bold glass-panel border-glow text-white">
            {params.emoji} {params.name}
          </span>
          {floor.isBoss && (
            <span className="px-3 py-1.5 rounded-full bg-red-900/40 border border-red-500/30 text-red-400 text-sm font-bold glow-red">💀 Босс</span>
          )}
          {cv.myTeam && <TeamBadge team={cv.myTeam} size="sm" className="self-center" />}
        </div>
      )}

      {/* Standings: team monsters + scores (teams) or personal score + top-3 (ffa) */}
      <ScoreStrip gameState={gameState} playerId={playerId} />

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
          <div className="text-amber-300 font-bold text-sm">
            👑 Отвечает капитан{cv.isTeams ? ' команды' : ''}: {captainPlayer?.name ?? '—'}
          </div>
        </div>
      )}
      {iAmCaptain && phase === 'answering' && !betPhase && (
        <div className="glass-panel-gold rounded-2xl px-4 py-3 mb-3 text-center glow-gold">
          <div className="text-amber-200 font-bold text-sm">👑 Вы — капитан{cv.myTeam ? ` команды «${cv.myTeam.name}»` : ''}!</div>
        </div>
      )}
      {isSacrifice && sacrificePlayer && phase === 'answering' && (
        <div className={`glass-panel rounded-2xl px-4 py-3 mb-3 text-center ${iAmSacrifice ? 'border border-red-500/40 glow-red' : 'border border-red-600/20'}`}>
          <div className="text-red-300 font-bold text-sm">
            💀 {iAmSacrifice ? 'Вы — жертва! Ошибка = смерть!' : `Жертва${cv.isTeams ? ' вашей команды' : ''}: ${sacrificePlayer.name}`}
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
      {(phase === 'answering' || phase === 'results' || phase === 'chain-turn') && floor && cv.monster && (
        <BattleScene
          players={cv.party}
          monster={cv.monster}
          damageToMonster={phase === 'results' ? dmgToMonster : undefined}
          damageToPlayers={phase === 'results' ? dmgToPlayers : undefined}
          monsterDefeated={phase === 'results' ? defeated : undefined}
          playersHit={phase === 'results' ? playersHit : undefined}
        />
      )}

      {/* Bet phase (shows alongside question) */}
      {betPhase && isCaptainMode && phase === 'answering' && (
        <BetPhase
          iAmCaptain={iAmCaptain}
          captainName={captainPlayer?.name ?? '?'}
          alreadyBet={me?.betAmount !== undefined}
        />
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
