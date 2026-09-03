// Mode screen registry. Each mode owns its own self-contained screen component.
// Modes register here so the ModeRouter can pick the right one based on gameState.gameMode.

import type { ComponentType } from 'react';
import type { GameMode } from '../types';

import MillionaireScreen from './millionaire/MillionaireScreen';
import BucketsScreen from './buckets/BucketsScreen';
import SpyScreen from './spy/SpyScreen';
import JeopardyCompScreen from './jeopardy-comp/JeopardyCompScreen';
import JeopardyCoopScreen from './jeopardy-coop/JeopardyCoopScreen';
import SpeedScreen from './speed/SpeedScreen';
import PetersburgScreen from './petersburg/PetersburgScreen';
import TopicSplitScreen from './topic-split/TopicSplitScreen';

export const MODE_SCREENS: Partial<Record<GameMode, ComponentType>> = {
  millionaire:   MillionaireScreen,
  buckets:       BucketsScreen,
  spy:           SpyScreen,
  'jeopardy-comp': JeopardyCompScreen,
  'jeopardy-coop': JeopardyCoopScreen,
  speed:         SpeedScreen,
  petersburg:    PetersburgScreen,
  'topic-split': TopicSplitScreen,
  // 'classic' and 'rpg-rewards' both use the original GameScreen — rpg-rewards
  // adds a reward-phase overlay between floors instead of a class-select.
};
