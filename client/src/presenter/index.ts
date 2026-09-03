// TV presenter registry. ScreenView picks PRESENTER_SCREENS[gameState.gameMode]
// while a game is running and falls back to DefaultPresenter when a mode has none.
// Every mode has its own file under presenter/<mode>/ — replace the placeholder
// there to give the mode a custom presenter.

import type { ComponentType } from 'react';
import type { GameMode } from '../types';

import ClassicPresenter from './classic/ClassicPresenter';
import MillionairePresenter from './millionaire/MillionairePresenter';
import TopicSplitPresenter from './topic-split/TopicSplitPresenter';
import JeopardyPresenter from './jeopardy/JeopardyPresenter';
import JeopardyCompPresenter from './jeopardy-comp/JeopardyCompPresenter';
import JeopardyCoopPresenter from './jeopardy-coop/JeopardyCoopPresenter';
import SpeedPresenter from './speed/SpeedPresenter';
import PetersburgPresenter from './petersburg/PetersburgPresenter';
import BucketsPresenter from './buckets/BucketsPresenter';
import RpgRewardsPresenter from './rpg-rewards/RpgRewardsPresenter';
import SpyPresenter from './spy/SpyPresenter';

export const PRESENTER_SCREENS: Partial<Record<GameMode, ComponentType>> = {
  'classic': ClassicPresenter,
  'millionaire': MillionairePresenter,
  'topic-split': TopicSplitPresenter,
  'jeopardy': JeopardyPresenter,
  'jeopardy-comp': JeopardyCompPresenter,
  'jeopardy-coop': JeopardyCoopPresenter,
  'speed': SpeedPresenter,
  'petersburg': PetersburgPresenter,
  'buckets': BucketsPresenter,
  'rpg-rewards': RpgRewardsPresenter,
  'spy': SpyPresenter,
};
