const socket = io();

let myColor = null, roomCode = null, board = Array(25).fill(null);
let phase = "placing", turn = null, selectedIndex = null;
let possibleMoves = [], gameEnded = false;

// --- SOLO MODE VARIABLES ---
let isSoloMode = false;
let soloTurn = "red"; 
let redPiecesPlaced = 0, bluePiecesPlaced = 0;

// --- INITIAL LOAD ---
window.onload = () => {
    const savedRoom = localStorage.getItem("shaxRoom");
    const savedName = localStorage.getItem("shaxName");
    if (savedRoom && savedName) {
        socket.emit("joinRoom", { roomCode: savedRoom, playerName: savedName });
    }
};

// --- NAVIGATION & UI ---

function showGameScreen() { 
    const setup = document.getElementById("setup-area");
    const gui = document.getElementById("game-ui");
    if (setup) setup.style.display = "none"; 
    if (gui) gui.style.display = "block"; 
}

function updateUI(state) {
    const turnText = document.getElementById("turnText");
    if (!turnText) return;

    if (state.winner) {
        turnText.innerText = state.winner === "draw" ? "🤝 WAAB (BARBARO)!" : `🏆 GUUL!`;
        turnText.style.color = "#f1c40f";
    } else if (myColor !== "spectator") {
        const isMyTurn = (turn === socket.id);
        turnText.innerText = isMyTurn ? 
            (phase === "placing" ? "Turn-kaaga: Dhig" : "Turn-kaaga: Dhaqaaq") : "Sug qofka kale...";
        turnText.style.color = isMyTurn ? "#2ecc71" : "#bdc3c7";
    }
}

function updateSoloUI() {
    const turnText = document.getElementById("turnText");
    if (!turnText) return;
    const isMyTurn = (soloTurn === "red");
    turnText.innerText = isMyTurn ? "Turn-kaaga (Red)" : "Robot-ka ayaa fakaraya...";
    turnText.style.color = isMyTurn ? "#2ecc71" : "#f39c12";
}

// --- CORE GAMEPLAY ---

function renderBoard() {
    const boardDiv = document.getElementById("board");
    if (!boardDiv) return;
    boardDiv.innerHTML = "";
    board.forEach((cell, i) => {
        const div = document.createElement("div");
        div.className = `cell ${cell || ''}`;
        if (selectedIndex === i) div.classList.add("selected");
        if (possibleMoves.includes(i)) div.classList.add("highlight-move");
        div.onclick = () => handleCellClick(i);
        boardDiv.appendChild(div);
    });
}

function handleCellClick(index) {
    if (gameEnded || myColor === "spectator") return;

    if (isSoloMode) {
        handleSoloGameplay(index);
        return;
    }

    // Online Mode Logic
    if (turn !== socket.id) return;
    const rCode = roomCode || localStorage.getItem("shaxRoom");

    if (phase === "placing") {
        if (board[index] === null) {
            socket.emit("move", { roomCode: rCode, move: { type: "place", index } });
        }
    } else {
        if (board[index] === myColor) {
            selectedIndex = index;
            possibleMoves = getMoves(index);
        } else if (selectedIndex !== null && possibleMoves.includes(index)) {
            socket.emit("move", { roomCode: rCode, move: { type: "move", from: selectedIndex, to: index } });
            resetSelection();
        }
    }
    renderBoard();
}

function getMoves(pos) {
    let list = [], r = Math.floor(pos/5), c = pos%5, dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    dirs.forEach(([dr, dc]) => {
        let nr = r+dr, nc = c+dc;
        if (nr>=0 && nr<5 && nc>=0 && nc<5 && board[nr*5+nc] === null) list.push(nr*5+nc);
    });
    return list;
}

function resetSelection() { selectedIndex = null; possibleMoves = []; }

// --- XEERARKA (GOYNTA, GO'DOONKA, WAABKA) ---

function checkAndRemoveSandwich(index, color) {
    const opponent = (color === "red") ? "blue" : "red";
    const r = Math.floor(index / 5);
    const checks = [
        { m: index + 1, e: index + 2, isRow: true }, 
        { m: index - 1, e: index - 2, isRow: true }, 
        { m: index + 5, e: index + 10, isRow: false },
        { m: index - 5, e: index - 10, isRow: false }
    ];

    checks.forEach(ch => {
        if (ch.m >= 0 && ch.m < 25 && ch.e >= 0 && ch.e < 25) {
            if (ch.isRow && Math.floor(ch.m / 5) !== r) return;
            if (ch.isRow && Math.floor(ch.e / 5) !== r) return;
            if (board[ch.m] === opponent && board[ch.e] === color) board[ch.m] = null;
        }
    });
}

function checkGameOverByTrap(color) {
    if (phase === "placing") return false; 
    const pieces = board.map((v, i) => v === color ? i : null).filter(v => v !== null);
    const canMove = pieces.some(p => getMoves(p).length > 0);

    if (!canMove && pieces.length > 0) {
        gameEnded = true;
        alert(color === "red" ? "WAAD GO'DOONTAY!" : "ROBOT-KII AYAA GO'DOOMAY!");
        return true;
    }
    return false;
}

// --- SOLO MODE LOGIC ---

window.startSoloGame = function() {
    isSoloMode = true; gameEnded = false; board = Array(25).fill(null);
    phase = "placing"; soloTurn = "red"; myColor = "red";
    redPiecesPlaced = 0; bluePiecesPlaced = 0;
    showGameScreen(); renderBoard(); updateSoloUI();
};

function handleSoloGameplay(index) {
    if (soloTurn !== "red" || gameEnded) return;

    if (phase === "placing") {
        if (board[index] === null && redPiecesPlaced < 12) {
            board[index] = "red"; redPiecesPlaced++;
            checkAndRemoveSandwich(index, "red");
            if (redPiecesPlaced % 2 === 0 || redPiecesPlaced === 12) {
                soloTurn = "blue"; setTimeout(botMove, 800);
            }
        }
    } else {
        if (board[index] === "red") {
            selectedIndex = index; possibleMoves = getMoves(index);
        } else if (selectedIndex !== null && possibleMoves.includes(index)) {
            board[selectedIndex] = null; board[index] = "red";
            checkAndRemoveSandwich(index, "red");
            if (!checkGameOverByTrap("blue")) {
                soloTurn = "blue"; setTimeout(botMove, 800);
            }
            resetSelection();
        }
    }
    if (redPiecesPlaced === 12 && bluePiecesPlaced === 12) phase = "moving";
    updateSoloUI(); renderBoard();
}

function botMove() {
    if (!isSoloMode || gameEnded) return;
    if (phase === "placing") {
        let empty = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (empty.length > 0) {
            let idx = empty[Math.floor(Math.random() * empty.length)];
            board[idx] = "blue"; bluePiecesPlaced++;
            checkAndRemoveSandwich(idx, "blue");
            if (bluePiecesPlaced % 2 !== 0 && bluePiecesPlaced < 12) setTimeout(botMove, 600);
            else soloTurn = "red";
        }
    } else {
        let botPieces = board.map((v, i) => v === "blue" ? i : null).filter(v => v !== null);
        let moved = botPieces.some(p => {
            let moves = getMoves(p);
            if (moves.length > 0) {
                let to = moves[Math.floor(Math.random() * moves.length)];
                board[p] = null; board[to] = "blue";
                checkAndRemoveSandwich(to, "blue");
                return true;
            }
            return false;
        });
        checkGameOverByTrap("red");
        soloTurn = "red";
    }
    if (redPiecesPlaced === 12 && bluePiecesPlaced === 12) phase = "moving";
    updateSoloUI(); renderBoard();
}

// --- SOCKET EVENTS ---

socket.on("gameState", (state) => {
    if (isSoloMode) return;
    board = state.board; phase = state.phase; turn = state.turn;
    gameEnded = !!state.winner;
    showGameScreen(); updateUI(state); renderBoard();
});

socket.on("matchFound", (data) => {
    roomCode = data.roomCode; isSoloMode = false;
    localStorage.setItem("shaxRoom", roomCode);
    showGameScreen();
});

socket.on("spectateGame", (data) => {
    myColor = "spectator"; isSoloMode = false;
    showGameScreen();
    const txt = document.getElementById("turnText");
    if (txt) { txt.innerText = "👀 Daawade"; txt.style.color = "#ffd60a"; }
});

// --- HELPER START FUNCTIONS ---
function startRandomMatch() {
    const n = document.getElementById("nameInput").value.trim();
    if (n) { isSoloMode = false; socket.emit("findMatch", n); }
}

function watchLiveMatch() { socket.emit("requestSpectate", "Daawade"); }
