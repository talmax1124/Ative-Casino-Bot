/*
  Blackjack simulation harness
  - Validates rules outcomes vs. displayed stage text and messages
  - Scenarios: dealer bust, player blackjack, push, split mixed, win-but-no-profit
*/

const { BlackjackGame, Card } = require('../GAMES/blackjack');

const S = {
  S: '♠️', H: '♥️', D: '♦️', C: '♣️'
};

function card(rank, suit) { return new Card(rank, suit); }

function setDrawOrder(game, draws) {
  // draws: array of Card objects representing the exact sequence of future deals
  // dealCard() pops from the end, so push in reverse order
  game.deck.cards = []; // clear deck for deterministic draws
  for (let i = draws.length - 1; i >= 0; i--) game.deck.cards.push(draws[i]);
}

function stageTextFromResults(results) {
  if (results.length > 1) {
    const allPush = results.every(r => r.outcome === 'PUSH');
    const anyBlackjack = results.some(r => r.outcome === 'BLACKJACK');
    const wins = results.filter(r => r.won).length;
    if (anyBlackjack) return 'BLACKJACK';
    if (allPush) return 'PUSH';
    return wins > 0 ? 'SPLIT WIN' : 'SPLIT LOSS';
  } else {
    const r = results[0];
    if (r.outcome === 'BLACKJACK') return 'BLACKJACK';
    if (r.outcome === 'PUSH') return 'PUSH';
    return r.won ? 'WIN' : 'LOSS';
  }
}

function singleHandMessage(result, totalBetAmount, regulatedPayout, playForRecipient) {
  const netProfit = (regulatedPayout || 0) - totalBetAmount;
  if (result.outcome === 'PUSH' || (netProfit === 0 && regulatedPayout > 0)) {
    return `PUSH - Your bet of ${totalBetAmount.toLocaleString()} is returned.`;
  } else if (netProfit > 0) {
    if (result.outcome === 'BLACKJACK') {
      return playForRecipient ? `BLACKJACK! Won ${netProfit.toLocaleString()} for @${playForRecipient}`
                              : `BLACKJACK! Won ${netProfit.toLocaleString()}`;
    } else {
      return playForRecipient ? `YOU WIN! Won ${netProfit.toLocaleString()} for @${playForRecipient}`
                              : `YOU WIN! Won ${netProfit.toLocaleString()}`;
    }
  } else if (result.won) {
    // Rules-based win but no profit after adjustments
    if (result.outcome === 'BLACKJACK') return 'BLACKJACK! (No profit)';
    if (result.outcome === 'DEALER BUSTED') return 'YOU WIN! Dealer busted (No profit)';
    return 'YOU WIN! (No profit)';
  } else {
    return playForRecipient ? `YOU LOSE! @${playForRecipient} gets nothing.`
                            : `YOU LOSE! Lost ${totalBetAmount.toLocaleString()}.`;
  }
}

async function runScenario(name, config) {
  const { draws, actions, bet, insurance } = config;
  const game = new BlackjackGame('user', bet);
  setDrawOrder(game, draws);
  game.dealInitialCards();

  // Insurance decision
  if (insurance === 'yes' && game.canOfferInsurance()) game.takeInsurance();
  if (insurance === 'no' && game.canOfferInsurance()) game.declineInsurance();

  // Perform actions
  for (const act of actions) {
    if (act === 'stand') game.stand();
    else if (act === 'hit') game.hit();
    else if (act === 'split') game.split();
    else if (act === 'double') game.doubleDown();
  }

  // If game not ended, let dealer play
  if (!game.gameEnded && game.allHandsComplete()) {
    // dealerPlay will be invoked by nextHand() during actions, but ensure ended
    // If still not ended, force dealer play
    if (!game.gameEnded) game.dealerPlay();
  } else if (!game.gameEnded) {
    // If player stood on single hand, dealer needs to play
    game.dealerPlay();
  }

  const results = await game.getResults();
  const stage = stageTextFromResults(results);

  // Aggregate payouts and bet amounts
  let totalPayout = 0;
  let totalBetAmount = 0;
  for (const r of results) {
    totalPayout += r.payout || 0;
    totalBetAmount += r.betAmount || bet;
  }

  // Simulate regulated payout equal to original for normal cases
  let regulatedPayout = totalPayout;
  if (config.forceRegulatedPayout !== undefined) regulatedPayout = config.forceRegulatedPayout;

  let message;
  if (results.length === 1) {
    message = singleHandMessage(results[0], totalBetAmount, regulatedPayout);
  } else {
    // Per-hand breakdown with proportional regulated payout
    const lines = [];
    for (const r of results) {
      const proportion = totalPayout > 0 ? (r.payout || 0) / totalPayout : 0;
      const handRegulated = regulatedPayout * proportion;
      const line = singleHandMessage(r, r.betAmount || bet, handRegulated);
      lines.push(line);
    }
    const net = regulatedPayout - totalBetAmount;
    if (net > 0) lines.push(`Total Won: ${net.toLocaleString()}`);
    else if (net === 0 && regulatedPayout > 0) lines.push(`Total: Push - All bets returned`);
    else lines.push(`Total Lost: ${Math.abs(net).toLocaleString()}`);
    message = lines.join('\n');
  }

  console.log(`\n=== ${name} ===`);
  console.log(`Player: ${game.playerHand.toString()} (${game.playerHand.getValue()})`);
  console.log(`Dealer: ${game.dealerHand.toString()} (${game.dealerHand.getValue()})`);
  if (game.splitHands.length > 0) {
    console.log('Split hands:');
    game.splitHands.forEach((h, i) => console.log(`  Hand ${i + 1}: ${h.toString()} (${h.getValue()})`));
  }
  console.log('Stage:', stage);
  console.log('Message:', message);

  // Insurance summary (affects only first hand)
  const r0 = results[0] || {};
  if (r0.insuranceAmount) {
    if (r0.insuranceWon) {
      console.log(`Insurance: WON ${r0.insurancePayout.toLocaleString()} (cost ${r0.insuranceAmount.toLocaleString()})`);
    } else {
      console.log(`Insurance: LOST ${r0.insuranceAmount.toLocaleString()}`);
    }
  }
}

(async () => {
  const bet = 1000;

  // 1) Dealer bust: Player stands 16; Dealer hits to bust
  await runScenario('Dealer Bust (Player Wins)', {
    bet,
    draws: [
      // Order: P1, D1, P2, D2, then dealer draw(s)
      card('10', S.C), // P1
      card('9', S.D),  // D1
      card('6', S.C),  // P2 -> Player 16
      card('6', S.H),  // D2 -> Dealer 15
      card('K', S.S)   // Dealer draws K -> 25 bust
    ],
    actions: ['stand']
  });

  // 2) Player blackjack
  await runScenario('Player Blackjack', {
    bet,
    draws: [
      card('A', S.S),  // P1
      card('9', S.H),  // D1
      card('K', S.D),  // P2 -> player 21
      card('7', S.C)   // D2 -> dealer not BJ
    ],
    actions: [] // immediate end
  });

  // 3) Push (17 vs 17)
  await runScenario('Push 17 vs 17', {
    bet,
    draws: [
      card('10', S.S), // P1
      card('10', S.H), // D1
      card('7', S.C),  // P2 -> player 17
      card('7', S.D)   // D2 -> dealer 17
    ],
    actions: ['stand']
  });

  // 4) Split mixed (Hand1 loses, Hand2 wins)
  // Player: 8,8; Split -> Hand1 gets 2 (10), Hand2 gets K (18); stand
  // Dealer: 10,7 = 17 stands -> Hand1 loses, Hand2 wins
  await runScenario('Split Mixed (One Win, One Loss)', {
    bet,
    draws: [
      card('8', S.S),  // P1 -> player 8
      card('10', S.H), // D1 -> dealer 10
      card('8', S.C),  // P2 -> player 8,8
      card('7', S.D),  // D2 -> dealer 17
      // After split(): deal one to Hand1, then one to Hand2 (pop order)
      card('2', S.H),  // to Hand1 -> 8+2=10 (will lose vs 17)
      card('K', S.S)   // to Hand2 -> 8+K=18 (will win vs 17)
    ],
    actions: ['split', 'stand', 'stand'] // stand both hands
  });

  // 5) Rules win but no profit (simulate regulatedPayout = 0)
  await runScenario('Win But No Profit (Adjusted Payout)', {
    bet,
    draws: [
      card('10', S.S), // P1 -> 10
      card('9', S.H),  // D1 -> dealer 9
      card('K', S.C),  // P2 -> player 20
      card('K', S.D)   // D2 -> dealer 19
    ],
    actions: ['stand'],
    forceRegulatedPayout: 0 // simulate adjustment to 0 payout
  });

  // 6) Double Down Win (11 vs 6)
  await runScenario('Double Down Win (11 vs 6)', {
    bet,
    draws: [
      card('5', S.S),   // P1 -> 5
      card('6', S.H),   // D1 -> 6 (dealer upcard)
      card('6', S.C),   // P2 -> 11
      card('9', S.D),   // D2 -> 15
      card('10', S.C),  // double card -> player 21
      card('2', S.H)    // dealer hits to 17
    ],
    actions: ['double']
  });

  // 7) Insurance Win (Dealer Blackjack)
  await runScenario('Insurance Win (Dealer Blackjack)', {
    bet,
    draws: [
      card('9', S.C),   // P1
      card('A', S.S),   // D1 (Ace up)
      card('9', S.D),   // P2 -> 18
      card('K', S.H)    // D2 -> blackjack
    ],
    actions: ['stand'],
    insurance: 'yes'
  });

  // 8) Insurance Lose (Dealer No Blackjack)
  await runScenario('Insurance Lose (Dealer No Blackjack)', {
    bet,
    draws: [
      card('9', S.C),   // P1
      card('A', S.S),   // D1 (Ace up)
      card('K', S.D),   // P2 -> 19
      card('9', S.H)    // D2 -> 20
    ],
    actions: ['stand'],
    insurance: 'yes'
  });
})();
