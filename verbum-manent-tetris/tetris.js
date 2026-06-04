let tetrisRAF = null;
let tetrisGameOver = false;
let tetrisPlayfield = [];
let tetrisSequence = [];
let currentTetromino = null;
let tetrisCount = 0;
let tetrisScore = 0;
const tetrisGrid = 32;

// --- GESTIONE AUDIO 8-BIT ---
let audioCtx = null;
function playBeep(freq, duration) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth'; 
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

const tetrominos = {
  'I': [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
  'J': [[1,0,0], [1,1,1], [0,0,0]],
  'L': [[0,1,1], [1,1,1], [0,0,0]],
  'O': [[1,1], [1,1]],
  'S': [[0,1,1], [1,1,0], [0,0,0]],
  'Z': [[1,1,0], [0,1,1], [0,0,0]],
  'T': [[0,1,0], [1,1,1], [0,0,0]]
};

window.openTetris = function() {
    const win = document.getElementById('window-tetris');
    if(win) {
        win.style.display = "flex";
        if(typeof bringToFront === 'function') bringToFront('window-tetris');
    }
    initTetris();
};

window.closeTetris = function() {
    const win = document.getElementById('window-tetris');
    if(win) win.style.display = "none";
    cancelAnimationFrame(tetrisRAF);
};

window.handleTetrisKeyboard = function(e) {
    if (tetrisGameOver) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            initTetris();
        }
        return;
    }
    
    e.preventDefault();
    let moved = false;

    if (e.key === "ArrowLeft") { const c = currentTetromino.col - 1; if (isValidTetrisMove(currentTetromino.matrix, currentTetromino.row, c)) { currentTetromino.col = c; moved = true; } }
    if (e.key === "ArrowRight") { const c = currentTetromino.col + 1; if (isValidTetrisMove(currentTetromino.matrix, currentTetromino.row, c)) { currentTetromino.col = c; moved = true; } }
    if (e.key === "ArrowUp") { const m = rotateTetrisMatrix(currentTetromino.matrix); if (isValidTetrisMove(m, currentTetromino.row, currentTetromino.col)) { currentTetromino.matrix = m; moved = true; } }
    if (e.key === "ArrowDown") {
        const r = currentTetromino.row + 1;
        if (!isValidTetrisMove(currentTetromino.matrix, r, currentTetromino.col)) {
            currentTetromino.row = r - 1; placeTetromino();
        } else { currentTetromino.row = r; moved = true; }
    }

    // Il suono parte solo se non è una pressione prolungata (e.repeat)
    if (moved && !e.repeat) playBeep(110, 0.05); 
};

function getNextTetromino() {
  if (tetrisSequence.length === 0) {
    const seq = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    while (seq.length) {
      const rand = Math.floor(Math.random() * seq.length);
      tetrisSequence.push(seq.splice(rand, 1)[0]);
    }
  }
  const name = tetrisSequence.pop();
  const matrix = tetrominos[name];
  const col = tetrisPlayfield.length ? (tetrisPlayfield[0].length / 2 - Math.ceil(matrix[0].length / 2)) : 3;
  const row = name === 'I' ? -1 : -2;
  return { name, matrix, row, col };
}

function rotateTetrisMatrix(matrix) {
  const N = matrix.length - 1;
  return matrix.map((row, i) => row.map((val, j) => matrix[N - j][i]));
}

function isValidTetrisMove(matrix, cellRow, cellCol) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] && (
          cellCol + c < 0 || 
          cellCol + c >= tetrisPlayfield[0].length || 
          cellRow + r >= tetrisPlayfield.length || 
          tetrisPlayfield[cellRow + r][cellCol + c])
        ) {
        return false;
      }
    }
  }
  return true;
}

function placeTetromino() {
  for (let r = 0; r < currentTetromino.matrix.length; r++) {
    for (let c = 0; c < currentTetromino.matrix[r].length; c++) {
      if (currentTetromino.matrix[r][c]) {
        if (currentTetromino.row + r < 0) return showTetrisGameOver();
        tetrisPlayfield[currentTetromino.row + r][currentTetromino.col + c] = currentTetromino.name;
      }
    }
  }

  let linesCleared = false;
  for (let r = tetrisPlayfield.length - 1; r >= 0; ) {
    if (tetrisPlayfield[r].every(cell => !!cell)) {
      tetrisScore++; 
      linesCleared = true;
      for (let y = r; y >= 0; y--) {
        for (let c = 0; c < tetrisPlayfield[y].length; c++) {
          tetrisPlayfield[y][c] = y === 0 ? 0 : tetrisPlayfield[y-1][c];
        }
      }
    } else {
      r--;
    }
  }

  if (linesCleared) {
      playBeep(330, 0.15); 
  } else {
      playBeep(65, 0.1);   
  }

  currentTetromino = getNextTetromino();
}

function showTetrisGameOver() {
  cancelAnimationFrame(tetrisRAF);
  tetrisGameOver = true;
  
  const canvas = document.getElementById('tetris-game');
  const context = canvas.getContext('2d');
  
  context.fillStyle = 'rgba(255, 255, 255, 0.54)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  context.fillStyle = '#0000FF';
  context.font = '22px FT88, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('game over', canvas.width / 2, canvas.height / 2 - 15);
  context.fillText('v', canvas.width / 2, canvas.height / 2 + 15);
}

function tetrisLoop() {
  tetrisRAF = requestAnimationFrame(tetrisLoop);
  const canvas = document.getElementById('tetris-game');
  if(!canvas) return;
  const context = canvas.getContext('2d');
  context.clearRect(0,0,canvas.width,canvas.height);

  context.fillStyle = '#FFFFFF';
  context.font = '22px FT88, monospace';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillText(String(tetrisScore).padStart(4, '0'), 12, 12);

  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 10; c++) {
      if (tetrisPlayfield[r][c]) {
        context.fillStyle = '#FFFFFF';
        context.fillRect(c * tetrisGrid, r * tetrisGrid, tetrisGrid-1, tetrisGrid-1);
      }
    }
  }

  if (currentTetromino) {
    let limite = Math.max(10, 62 - tetrisScore);
    if (++tetrisCount > limite) {
      currentTetromino.row++;
      tetrisCount = 0;
      if (!isValidTetrisMove(currentTetromino.matrix, currentTetromino.row, currentTetromino.col)) {
        currentTetromino.row--;
        placeTetromino();
      }
    }
    context.fillStyle = '#FFFFFF';
    for (let r = 0; r < currentTetromino.matrix.length; r++) {
      for (let c = 0; c < currentTetromino.matrix[r].length; c++) {
        if (currentTetromino.matrix[r][c]) {
          context.fillRect((currentTetromino.col + c) * tetrisGrid, (currentTetromino.row + r) * tetrisGrid, tetrisGrid-1, tetrisGrid-1);
        }
      }
    }
  }
}

function initTetris() {
  tetrisPlayfield = [];
  for (let r = -2; r < 20; r++) {
    tetrisPlayfield[r] = [];
    for (let c = 0; c < 10; c++) {
      tetrisPlayfield[r][c] = 0;
    }
  }
  tetrisSequence = [];
  tetrisScore = 0; 
  
  currentTetromino = getNextTetromino();
  tetrisGameOver = false;
  tetrisCount = 0;
  if(tetrisRAF) cancelAnimationFrame(tetrisRAF);
  tetrisRAF = requestAnimationFrame(tetrisLoop);
}