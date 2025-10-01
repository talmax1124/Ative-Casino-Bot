// Generate a sample Texas Hold'em table image using the renderer
const fs = require('fs');
const path = require('path');
const TexasHoldemRenderer = require('../UTILS/texasHoldemRenderer');
const { TexasHoldemGame, PokerCard } = require('../GAMES/texasholdem');

function c(rank, suit) { return new PokerCard(rank, suit); }

async function main() {
  const game = new TexasHoldemGame('demo', 'creator', 1000);

  // Add 5 players with seats 0..4 (others unused)
  const players = [
    game.addPlayer('u1', 'Ava', 4500),
    game.addPlayer('u2', 'Ben', 3200),
    game.addPlayer('u3', 'Cara', 5100),
    game.addPlayer('u4', 'Dee', 2800),
    game.addPlayer('u5', 'Eli', 6100)
  ];

  // Make them active with face-down hole cards
  players.forEach((p, i) => {
    p.isActive = true;
    p.holeCards = [c('A', '♠️'), c('K', '♥️')]; // will render back-side in public view
    p.currentBet = (i === 1 ? 200 : 0);
  });

  // Set a dealer position and current player
  game.dealerPosition = players[0].seatNumber; // seat 0
  game.currentPlayerIndex = game.seatOrder.indexOf(players[2].userId); // Cara's turn

  // Community cards at river
  game.communityCards = [c('10', '♣️'), c('J', '♦️'), c('Q', '♣️'), c('K', '♦️'), c('A', '♣️')];
  game.phase = 'river';
  game.currentBet = 200;
  game.minRaise = 200;

  // Generate image
  const renderer = new TexasHoldemRenderer();
  // Allow renderer to init; small delay for font/image attempts
  await new Promise(r => setTimeout(r, 50));
  const buffer = await renderer.createTableImage(game.getGameState(), null);
  const outPath = path.join(__dirname, 'poker-table-sample.png');
  fs.writeFileSync(outPath, buffer);
  console.log('Sample table image written to:', outPath);
}

main().catch(err => {
  console.error('Failed to generate table image:', err);
  process.exit(1);
});

