import { ArraySchema, Schema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  @type('string') sessionId = '';
  @type('string') nickname = '';
  @type('string') color = '';
  @type('boolean') isBot = false;
  @type('boolean') connected = true;
  @type('int8') finishedRank = 0;
  @type(['int8']) tokens = new ArraySchema<number>(-1, -1, -1, -1);
  @type('int32') coinBalance = 100;
  @type('boolean') acceptedBet = false;
  /** Put coins in when the match started. Bots (and seats added later) never do. */
  @type('boolean') staked = false;
  /** Staked, then left mid-match — pays into the pot but cannot win it. */
  @type('boolean') forfeitedBet = false;
  /** Equipped character skin id, or '' when the player is on the free default. */
  @type('string') equippedCharacter = '';
}

export class LudoState extends Schema {
  @type('string') roomPhase: 'waiting' | 'playing' | 'ended' = 'waiting';
  @type('string') joinCode = '';
  @type('string') hostSessionId = '';
  @type([PlayerSchema]) players = new ArraySchema<PlayerSchema>();
  @type('int8') currentPlayer = -1;
  @type('string') turnPhase: 'awaitRoll' | 'awaitMove' | 'animating' = 'awaitRoll';
  @type('int8') dice = 0;
  @type('uint8') consecutiveSixes = 0;
  @type('uint8') turnSeconds = 20;
  @type('number') turnDeadline = 0;
  @type('string') diceMode: 'fair' | 'dynamic' = 'dynamic';
  @type('int32') betAmount = 0;
  @type('string') bettingStatus: 'not_started' | 'in_progress' | 'accepted' = 'not_started';
}
