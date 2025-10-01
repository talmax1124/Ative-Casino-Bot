/* Simple tests for Texas Hold'em logic: straights, royal flush, ties, and pot splitting */
const { TexasHoldemGame, PokerCard, PokerHand } = require('../GAMES/texasholdem');

function makeCard(rank, suit) {
  return new PokerCard(rank, suit);
}
const c = makeCard;

async function runTests() {
  const channelId = 'test-channel';
  const creatorId = 'creator-1';
  const buyIn = 1000;
  const game = new TexasHoldemGame(channelId, creatorId, buyIn);

  // Add two players
  const p1 = game.addPlayer('p1', 'Alice', 5000);
  const p2 = game.addPlayer('p2', 'Bob', 5000);
  p1.isActive = true; p2.isActive = true;

  function resetState() {
    game.communityCards = [];
    game.pots = [];
    for (const pl of game.players.values()) {
      pl.hasFolded = false;
      pl.isActive = true;
      pl.isAllIn = false;
      pl.currentBet = 0;
      pl.totalBetThisRound = 0;
      pl.bestHand = null;
    }
  }

  function setPot(amount) {
    game.pots = [{ amount, eligiblePlayers: new Set(['p1', 'p2']), type: 'main' }];
  }

  function evalHands() {
    const players = [game.players.get('p1'), game.players.get('p2')];
    for (const pl of players) {
      pl.bestHand = PokerHand.evaluateHand(pl.holeCards, game.communityCards);
    }
  }

  // Test 1: A-2-3-4-5 (wheel) vs 6-high straight
  resetState();
  game.communityCards = [
    makeCard('2', '♣️'), makeCard('3', '♦️'), makeCard('4', '♥️'), makeCard('5', '♠️'), makeCard('K', '♣️')
  ];
  game.players.get('p1').holeCards = [makeCard('A', '♦️'), makeCard('9', '♠️')]; // 5-high straight
  game.players.get('p2').holeCards = [makeCard('6', '♦️'), makeCard('7', '♠️')]; // 7-high straight
  setPot(1000);
  evalHands();
  let res1 = await game.distributePots();
  console.log('Test 1 (wheel vs higher straight) results:', res1);

  // Expect p2 to win full pot
  if (!(res1.length === 1 && res1[0].userId === 'p2' && res1[0].amount === 1000)) {
    console.error('Test 1 FAILED');
  } else {
    console.log('Test 1 PASSED');
  }

  // Test 2: Royal Flush vs Straight Flush
  resetState();
  game.communityCards = [
    makeCard('10', '♠️'), makeCard('J', '♠️'), makeCard('Q', '♠️'), makeCard('K', '♠️'), makeCard('2', '♦️')
  ];
  game.players.get('p1').holeCards = [makeCard('A', '♠️'), makeCard('3', '♣️')]; // Royal flush
  game.players.get('p2').holeCards = [makeCard('9', '♠️'), makeCard('8', '♠️')]; // Straight flush to K
  setPot(2000);
  evalHands();
  let res2 = await game.distributePots();
  console.log('Test 2 (royal vs straight flush) results:', res2);

  if (!(res2.length === 1 && res2[0].userId === 'p1' && res2[0].amount === 2000)) {
    console.error('Test 2 FAILED');
  } else {
    console.log('Test 2 PASSED');
  }

  // Test 3: Exact tie straight (split pot)
  resetState();
  game.communityCards = [
    makeCard('5', '♣️'), makeCard('6', '♦️'), makeCard('7', '♥️'), makeCard('8', '♠️'), makeCard('9', '♣️')
  ];
  game.players.get('p1').holeCards = [makeCard('A', '♦️'), makeCard('2', '♣️')];
  game.players.get('p2').holeCards = [makeCard('K', '♦️'), makeCard('Q', '♣️')];
  setPot(1001); // odd split to test remainder distribution
  evalHands();
  let res3 = await game.distributePots();
  console.log('Test 3 (tie straight split) results:', res3);

  // Should split 1001 as 501 and 500 to some order
  const amounts = res3.map(r => r.amount).sort((a,b)=>a-b);
  if (!(res3.length === 2 && amounts[0] === 500 && amounts[1] === 501)) {
    console.error('Test 3 FAILED');
  } else {
    console.log('Test 3 PASSED');
  }

  // Test 4: Two Pair ordering (9,5) vs (8,7) with higher kicker should NOT win
  resetState();
  game.communityCards = [c('9', '♣️'), c('9', '♦️'), c('7', '♥️'), c('5', '♠️'), c('2', '♣️')];
  game.players.get('p1').holeCards = [c('5', '♦️'), c('K', '♣️')]; // Two pair 9s and 5s, K kicker
  game.players.get('p2').holeCards = [c('7', '♦️'), c('A', '♣️')]; // Two pair 9s and 7s, A kicker
  setPot(1000);
  evalHands();
  let res4 = await game.distributePots();
  console.log('Test 4 (two pair ordering) results:', res4);
  // p2 should win due to higher second pair (7s vs 5s), not kicker
  if (!(res4.length === 1 && res4[0].userId === 'p2' && res4[0].amount === 1000)) {
    console.error('Test 4 FAILED');
  } else {
    console.log('Test 4 PASSED');
  }

  // Test 5: Full House comparison by trips first
  resetState();
  game.communityCards = [c('K', '♣️'), c('K', '♦️'), c('K', '♥️'), c('A', '♠️'), c('Q', '♣️')];
  game.players.get('p1').holeCards = [c('A', '♦️'), c('2', '♣️')]; // Full house K-K-K-A-A
  game.players.get('p2').holeCards = [c('Q', '♦️'), c('Q', '♠️')]; // Full house K-K-K-Q-Q
  setPot(1000);
  evalHands();
  let res5 = await game.distributePots();
  console.log('Test 5 (full house compare by trips then pair) results:', res5);
  // p1 should win since both have K trips; p1 has A pair vs Q pair
  if (!(res5.length === 1 && res5[0].userId === 'p1' && res5[0].amount === 1000)) {
    console.error('Test 5 FAILED');
  } else {
    console.log('Test 5 PASSED');
  }

  // Test 6: Four of a kind comparison by quad rank
  resetState();
  game.communityCards = [c('Q', '♣️'), c('Q', '♦️'), c('Q', '♥️'), c('Q', '♠️'), c('2', '♣️')];
  game.players.get('p1').holeCards = [c('A', '♦️'), c('3', '♣️')]; // Quads Queens, A kicker
  game.players.get('p2').holeCards = [c('K', '♦️'), c('4', '♣️')]; // Quads Queens, K kicker
  setPot(1000);
  evalHands();
  let res6 = await game.distributePots();
  console.log('Test 6 (quads kicker) results:', res6);
  // p1 should win due to A kicker
  if (!(res6.length === 1 && res6[0].userId === 'p1' && res6[0].amount === 1000)) {
    console.error('Test 6 FAILED');
  } else {
  console.log('Test 6 PASSED');

  // Test 7: Multiway all-in with side pots
  const game2 = new TexasHoldemGame('chan2', 'creator', 1000);
  const a = game2.addPlayer('a', 'Ann', 1000);
  const b = game2.addPlayer('b', 'Ben', 1000);
  const c = game2.addPlayer('c', 'Cam', 1000);
  a.isActive = b.isActive = c.isActive = true;
  game2.communityCards = [c_('9','♣️'), c_('4','♦️'), c_('J','♥️'), c_('2','♠️'), c_('7','♣️')];
  // Hole cards set so Cam > Ben > Ann
  game2.players.get('a').holeCards = [c_('5','♦️'), c_('3','♣️')]; // high card 7-5
  game2.players.get('b').holeCards = [c_('J','♦️'), c_('3','♠️')]; // pair of Jacks
  game2.players.get('c').holeCards = [c_('A','♦️'), c_('A','♣️')]; // pair of Aces
  // Build pots manually: Ann all-in covers 100 from each (main 300), Ben adds 200 more (side1=400 among b,c), Cam adds 100 more (side2=100 only c)
  game2.pots = [
    { amount: 300, eligiblePlayers: new Set(['a','b','c']), type: 'main' },
    { amount: 400, eligiblePlayers: new Set(['b','c']), type: 'side' },
    { amount: 100, eligiblePlayers: new Set(['c']), type: 'side' }
  ];
  // Evaluate and distribute
  const players2 = [game2.players.get('a'), game2.players.get('b'), game2.players.get('c')];
  for (const pl of players2) {
    pl.bestHand = PokerHand.evaluateHand(pl.holeCards, game2.communityCards);
  }
  const res7 = await game2.distributePots();
  console.log('Test 7 (multiway side pots) results:', res7);
  const totalWinC = res7.filter(r => r.userId === 'c').reduce((s,r)=>s+r.amount,0);
  if (!(res7.length === 3 && totalWinC === 800)) {
    console.error('Test 7 FAILED');
  } else {
    console.log('Test 7 PASSED');
  }

  function c_(rank, suit) { return new PokerCard(rank, suit); }
}
}

runTests().catch(err => {
  console.error('Error running tests:', err);
  process.exit(1);
});
