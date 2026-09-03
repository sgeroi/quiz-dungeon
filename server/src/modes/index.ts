import type { GameMode } from '../../../shared/types.ts';
import type { ModeHandler } from './types.ts';

import millionaire from './millionaire/handler.ts';
import buckets from './buckets/handler.ts';
import spy from './spy/handler.ts';
import jeopardyComp from './jeopardy-comp/handler.ts';
import jeopardyCoop from './jeopardy-coop/handler.ts';
import speed from './speed/handler.ts';
import petersburg from './petersburg/handler.ts';
import topicSplit from './topic-split/handler.ts';

export const MODE_HANDLERS: Partial<Record<GameMode, ModeHandler>> = {
  millionaire,
  buckets,
  spy,
  'jeopardy-comp': jeopardyComp,
  'jeopardy-coop': jeopardyCoop,
  speed,
  petersburg,
  'topic-split': topicSplit,
  // 'classic' and 'rpg-rewards' both use the legacy GameLoop. rpg-rewards
  // adds a reward-pick phase between floors instead of needing a class.
};

export type { ModeHandler };
