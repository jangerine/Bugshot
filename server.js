const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};
const ITEMS = ['cigarette', 'beer', 'magnifier', 'saw', 'handcuffs', 'medicine', 'inverter', 'phone', 'adrenaline'];

function getRandomItems(count = 2) {
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(ITEMS[Math.floor(Math.random() * ITEMS.length)]);
  }
  return result;
}

function generateBullets() {
  const live = Math.floor(Math.random() * 3) + 2; // 2~4발
  const blank = Math.floor(Math.random() * 3) + 1; // 1~3발
  const bullets = [];
  for (let i = 0; i < live; i++) bullets.push('live');
  for (let i = 0; i < blank; i++) bullets.push('blank');
  
  for (let i = bullets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bullets[i], bullets[j]] = [bullets[j], bullets[i]];
  }
  
  return { bullets, liveCount: live, blankCount: blank };
}

function checkGameOver(roomId) {
  const game = rooms[roomId];
  if (!game) return false;

  let deadPlayerId = null;

  for (const id in game.players) {
    if (game.players[id].hp <= 0) {
      deadPlayerId = id;
      break;
    }
  }

  if (deadPlayerId) {
    if (game.isAI) {
      if (deadPlayerId === 'ai_dealer') {
        io.to(game.humanSocketId).emit('itemResult', { 
          title: '🏆 승리!', 
          message: '딜러를 쓰러뜨리고 생존했습니다!' 
        });
      } else {
        io.to(game.humanSocketId).emit('itemResult', { 
          title: '💀 패배', 
          message: '딜러의 총에 맞아 사망했습니다...' 
        });
      }
    } else {
      game.playerOrder.forEach((id) => {
        if (id === deadPlayerId) {
          io.to(id).emit('itemResult', { title: '💀 패배', message: '목숨을 잃었습니다...' });
        } else {
          io.to(id).emit('itemResult', { title: '🏆 승리!', message: '최종 생존자가 되었습니다!' });
        }
      });
    }

    delete rooms[roomId];
    return true;
  }

  return false;
}

io.on('connection', (socket) => {
  console.log(`플레이어 접속: ${socket.id}`);

  socket.on('startVsAI', ({ name }) => {
    const roomId = `ai_${socket.id}`;
    const bulletData = generateBullets();

    rooms[roomId] = {
      isAI: true,
      humanSocketId: socket.id,
      players: {
        [socket.id]: { name: name || '플레이어', hp: 4, items: getRandomItems(2) },
        'ai_dealer': { name: '딜러 (AI)', hp: 4, items: getRandomItems(2) }
      },
      turn: socket.id,
      bullets: bulletData.bullets,
      liveCount: bulletData.liveCount,
      blankCount: bulletData.blankCount,
      isSawActive: false,
      isOpponentHandcuffed: false
    };

    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('gameStart', { roomId });
    sendGameState(roomId);
  });

  socket.on('joinRoom', ({ name, room }) => {
    const roomId = room || 'default';
    socket.join(roomId);
    socket.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        isAI: false,
        players: {},
        playerOrder: [],
        turn: null,
        bullets: [],
        liveCount: 0,
        blankCount: 0,
        isSawActive: false,
        isOpponentHandcuffed: false
      };
    }

    const roomData = rooms[roomId];
    roomData.players[socket.id] = { name: name || '플레이어', hp: 4, items: getRandomItems(2) };
    if (!roomData.playerOrder.includes(socket.id)) {
      roomData.playerOrder.push(socket.id);
    }

    if (roomData.playerOrder.length === 2) {
      const bulletData = generateBullets();
      roomData.bullets = bulletData.bullets;
      roomData.liveCount = bulletData.liveCount;
      roomData.blankCount = bulletData.blankCount;
      roomData.turn = roomData.playerOrder[0];

      io.to(roomId).emit('gameStart', { roomId });
      sendGameState(roomId);
    } else {
      socket.emit('itemResult', { title: '대기 중', message: '다른 플레이어의 입장을 기다리고 있습니다...' });
    }
  });

  function sendGameState(roomId) {
    const gameState = rooms[roomId];
    if (!gameState) return;

    if (gameState.isAI) {
      const player = gameState.players[socket.id];
      const ai = gameState.players['ai_dealer'];

      socket.emit('updateGameState', {
        turn: gameState.turn,
        isOpponentHandcuffed: gameState.isOpponentHandcuffed,
        myName: player.name,
        myHp: player.hp,
        myItems: player.items,
        oppName: ai.name,
        oppHp: ai.hp,
        oppItems: ai.items,
        liveBullets: gameState.liveCount,
        blankBullets: gameState.blankCount
      });
    } else {
      gameState.playerOrder.forEach((id) => {
        const oppId = gameState.playerOrder.find(pId => pId !== id);
        const me = gameState.players[id];
        const opp = gameState.players[oppId] || { name: '대기 중', hp: 0, items: [] };

        io.to(id).emit('updateGameState', {
          turn: gameState.turn,
          isOpponentHandcuffed: gameState.isOpponentHandcuffed,
          myName: me.name,
          myHp: me.hp,
          myItems: me.items,
          oppName: opp.name,
          oppHp: opp.hp,
          oppItems: opp.items,
          liveBullets: gameState.liveCount,
          blankBullets: gameState.blankCount
        });
      });
    }
  }

  socket.on('shoot', ({ target }) => {
    const roomId = socket.roomId;
    const game = rooms[roomId];
    if (!game || game.turn !== socket.id) return;

    const bullet = game.bullets.shift();
    const isLive = bullet === 'live';
    const damage = game.isSawActive && isLive ? 2 : 1;
    game.isSawActive = false;

    if (isLive) game.liveCount--;
    else game.blankCount--;

    let targetId = target === 'opponent' ? (game.isAI ? 'ai_dealer' : game.playerOrder.find(id => id !== socket.id)) : socket.id;

    if (isLive) {
      game.players[targetId].hp = Math.max(0, game.players[targetId].hp - damage);
    }

    io.to(socket.id).emit('shotResult', { isLive, target });

    if (checkGameOver(roomId)) return;

    if (!(target === 'self' && !isLive)) {
      if (game.isOpponentHandcuffed) {
        game.isOpponentHandcuffed = false;
      } else {
        game.turn = game.isAI ? (game.turn === socket.id ? 'ai_dealer' : socket.id) : game.playerOrder.find(id => id !== socket.id);
      }
    }

    if (game.bullets.length === 0) {
      const newBullets = generateBullets();
      game.bullets = newBullets.bullets;
      game.liveCount = newBullets.liveCount;
      game.blankCount = newBullets.blankCount;
    }

    sendGameState(roomId);

    if (game.isAI && game.turn === 'ai_dealer') {
      setTimeout(() => processAITurn(roomId), 1200);
    }
  });

  function processAITurn(roomId) {
    const game = rooms[roomId];
    if (!game || game.turn !== 'ai_dealer') return;

    const bullet = game.bullets.shift();
    const isLive = bullet === 'live';
    const damage = game.isSawActive && isLive ? 2 : 1;
    game.isSawActive = false;

    if (isLive) {
      game.liveCount--;
      game.players[socket.id].hp = Math.max(0, game.players[socket.id].hp - damage);
    } else {
      game.blankCount--;
    }

    io.to(socket.id).emit('shotResult', { isLive, target: 'opponent' });

    if (checkGameOver(roomId)) return;

    if (game.isOpponentHandcuffed) {
      game.isOpponentHandcuffed = false;
    } else {
      game.turn = socket.id;
    }

    if (game.bullets.length === 0) {
      const newBullets = generateBullets();
      game.bullets = newBullets.bullets;
      game.liveCount = newBullets.liveCount;
      game.blankCount = newBullets.blankCount;
    }

    sendGameState(roomId);
  }

  socket.on('useItem', ({ itemKey, index }) => {
    const roomId = socket.roomId;
    const game = rooms[roomId];
    if (!game || game.turn !== socket.id) return;

    const user = game.players[socket.id];
    user.items.splice(index, 1);

    if (itemKey === 'cigarette') {
      user.hp = Math.min(4, user.hp + 1);
      socket.emit('itemResult', { title: '🚬 담배', message: '체력을 1 회복했습니다.', effect: 'heal' });
    } 
    else if (itemKey === 'saw') {
      game.isSawActive = true;
      socket.emit('itemResult', { title: '🪚 톱', message: '다음 실탄의 데미지가 2배가 됩니다!', effect: 'saw' });
    } 
    else if (itemKey === 'handcuffs') {
      if (!game.isOpponentHandcuffed) {
        game.isOpponentHandcuffed = true;
        socket.emit('itemResult', { title: '⛓️ 수갑', message: '상대의 다음 턴을 묶었습니다.' });
      }
    } 
    else if (itemKey === 'magnifier') {
      const nextBullet = game.bullets[0] === 'live' ? '실탄' : '공포탄';
      socket.emit('itemResult', { title: '🔍 돋보기', message: `현재 약실의 총알은 [ ${nextBullet} ] 입니다.` });
    } 
    else if (itemKey === 'beer') {
      const ejected = game.bullets.shift();
      if (ejected === 'live') game.liveCount--;
      else game.blankCount--;

      socket.emit('itemResult', { 
        title: '🍺 맥주', 
        message: `약실에서 [ ${ejected === 'live' ? '실탄' : '공포탄'} ]을(를) 배출했습니다.` 
      });
    } 
    else if (itemKey === 'inverter') {
      if (game.bullets.length > 0) {
        const current = game.bullets[0];
        if (current === 'live') {
          game.bullets[0] = 'blank';
          game.liveCount--;
          game.blankCount++;
        } else {
          game.bullets[0] = 'live';
          game.blankCount--;
          game.liveCount++;
        }
        socket.emit('itemResult', { title: '🔄 반전기', message: '현재 약실 총알의 성질을 반전시켰습니다!' });
      }
    } 
    else if (itemKey === 'phone') {
      if (game.bullets.length <= 1) {
        socket.emit('itemResult', { title: '📞 대포폰', message: '미래를 확인할 총알이 충분하지 않습니다.' });
      } else {
        const targetIndex = Math.floor(Math.random() * (game.bullets.length - 1)) + 1;
        const bulletType = game.bullets[targetIndex] === 'live' ? '실탄' : '공포탄';
        socket.emit('itemResult', { 
          title: '📞 대포폰', 
          message: `[ ${targetIndex + 1}번째 ] 총알은 [ ${bulletType} ] 입니다.` 
        });
      }
    } 
    else if (itemKey === 'medicine') {
      if (Math.random() < 0.4) {
        user.hp = Math.min(4, user.hp + 2);
        socket.emit('itemResult', { title: '💊 만료된 약', message: '약 효과 발동! 체력 +2 회복', effect: 'heal' });
      } else {
        user.hp = Math.max(0, user.hp - 1);
        socket.emit('itemResult', { title: '💊 만료된 약', message: '부작용 발생! 체력 -1 손실', effect: 'poison' });
        if (checkGameOver(roomId)) return;
      }
    }

    sendGameState(roomId);
  });

  socket.on('disconnect', () => {
    if (socket.roomId && rooms[socket.roomId]) {
      delete rooms[socket.roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
