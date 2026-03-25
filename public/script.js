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

// --- SOLO MODE START ---
window.startSoloGame = function() {
    isSoloMode = true;
    gameEnded = false;
    board = Array(25).fill(null);
    phase = "placing";
    soloTurn = "red";
    myColor = "red";
    redPiecesPlaced = 0;
    bluePiecesPlaced = 0;

    showGameScreen();
    document.getElementById("p1-display").innerText = "🔴 Adiga";
    document.getElementById("p2-display").innerText = "🔵 Robot (Bot)";
    updateSoloUI();
    renderBoard();
};

// --- XEERKA GOYNTA (SANDWICH LOGIC) ---
function checkAndRemoveSandwich(index, color) {
    const opponent = (color === "red") ? "blue" : "red";
    const r = Math.floor(index / 5);
    const checks = [
        { m: index + 1, e: index + 2, isRow: true },  // Midig
        { m: index - 1, e: index - 2, isRow: true },  // Bidix
        { m: index + 5, e: index + 10, isRow: false }, // Hoose
        { m: index - 5, e: index - 10, isRow: false }  // Sare
    ];

    checks.forEach(ch => {
        if (ch.m >= 0 && ch.m < 25 && ch.e >= 0 && ch.e < 25) {
            if (ch.isRow && Math.floor(ch.m / 5) !== r) return;
            if (ch.isRow && Math.floor(ch.e / 5) !== r) return;

            if (board[ch.m] === opponent && board[ch.e] === color) {
                board[ch.m] = null; 
            }
        }
    });
}

// --- XEERKA GO'DOONKA (TRAP = LOSS) ---
function checkGameOverByTrap(color) {
    if (phase === "placing") return false; 
    const pieces = board.map((v, i) => v === color ? i : null).filter(v => v !== null);
    const canMove = pieces.some(p => getMoves(p).length > 0);

    if (!canMove && pieces.length > 0) {
        gameEnded = true;
        const msg = (color === "red") ? "WAAD GO'DOONTAY! Robot-ka ayaa badiyay." : "ROBOT-KII AYAA GO'DOOMAY! Waad guulaysatay.";
        alert(msg);
        return true;
    }
    return false;
}

// --- XEERKA WAABKA ---
function checkWaab() {
    if (phase !== "moving") return;
    const redCount = board.filter(v => v === "red").length;
    const blueCount = board.filter(v => v === "blue").length;
    if (redCount <= 3 && blueCount <= 3) {
        gameEnded = true;
        alert("WAAB! Ciyaartu waa barbaro.");
    }
}

// --- SOLO GAMEPLAY LOGIC ---
function handleSoloGameplay(index) {
    if (soloTurn !== "red" || gameEnded) return;

    if (phase === "placing") {
        if (board[index] === null && redPiecesPlaced < 12) {
            board[index] = "red";
            redPiecesPlaced++;
            checkAndRemoveSandwich(index, "red");

            if (redPiecesPlaced % 2 === 0 || redPiecesPlaced === 12) {
                soloTurn = "blue";
                setTimeout(botMove, 800);
            }
        }
    } else {
        if (board[index] === "red") {
            selectedIndex = index;
            possibleMoves = getMoves(index);
        } else if (selectedIndex !== null && possibleMoves.includes(index)) {
            board[selectedIndex] = null;
            board[index] = "red";
            checkAndRemoveSandwich(index, "red");

            if (!checkGameOverByTrap("blue")) {
                soloTurn = "blue";
                setTimeout(botMove, 800);
            }
            checkWaab();
            resetSelection();
        }
    }
    if (redPiecesPlaced === 12 && bluePiecesPlaced === 12) phase = "moving";
    updateSoloUI();
    renderBoard();
}

function botMove() {
    if (!isSoloMode || gameEnded) return;

    if (phase === "placing") {
        let empty = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (empty.length > 0) {
            let idx = empty[Math.floor(Math.random() * empty.length)];
            board[idx] = "blue";
            bluePiecesPlaced++;
            checkAndRemoveSandwich(idx, "blue");
            if (bluePiecesPlaced % 2 !== 0 && bluePiecesPlaced < 12) {
                setTimeout(botMove, 600);
            } else {
                soloTurn = "red";
            }
        }
    } else {
        let botPieces = board.map((v, i) => v === "blue" ? i : null).filter(v => v !== null);
        let moved = false;
        for (let p of botPieces) {
            let moves = getMoves(p);
            if (moves.length > 0) {
                let to = moves[Math.floor(Math.random() * moves.length)];
                board[p] = null;
                board[to] = "blue";
                checkAndRemoveSandwich(to, "blue");
                moved = true;
                break;
            }
        }
        checkGameOverByTrap("red");
        if (moved) soloTurn = "red";
    }
    checkWaab();
    if (redPiecesPlaced === 12 && bluePiecesPlaced === 12) phase = "moving";
    updateSoloUI();
    renderBoard();
}

// --- CORE FUNCTIONS (ONLINE & UI) ---

function handleCellClick(index) {
    if (gameEnded || myColor === "spectator") return;
    if (isSoloMode) {
        handleSoloGameplay(index);
        return;
    }
    if (turn !== socket.id) return;

    const rCode = roomCode || localStorage.getItem("shaxRoom");
    if (phase === "placing") {
        if (board[index] === null) socket.emit("move", { roomCode: rCode, move: { type: "place", index } });
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

function getMoves(pos) {
    let list = [], r = Math.floor(pos/5), c = pos%5, dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    dirs.forEach(([dr, dc]) => {
        let nr = r+dr, nc = c+dc;
        if (nr>=0 && nr<5 && nc>=0 && nc<5 && board[nr*5+nc] === null) list.push(nr*5+nc);
    });
    return list;
}

function updateSoloUI() {
    const turnText = document.getElementById("turnText");
    if (!turnText) return;
    const isMyTurn = (soloTurn === "red");
    turnText.innerText = isMyTurn ? "Turn-kaaga: Dhaqaaq" : "Robot-ka ayaa fakaraya...";
    turnText.style.color = isMyTurn ? "#2ecc71" : "#bdc3c7";
}

function resetSelection() { selectedIndex = null; possibleMoves = []; }

function showGameScreen() { 
    document.getElementById("setup-area").style.display = "none"; 
    document.getElementById("game-ui").style.display = "block"; 
}

// --- SOCKET RECEIVERS & MATCHMAKING ---

socket.on("matchFound", (data) => {
    roomCode = data.roomCode;
    localStorage.setItem("shaxRoom", roomCode);
    showGameScreen();
});

socket.on("gameState", (state) => {
    if (isSoloMode) return;
    board = state.board; 
    phase = state.phase; 
    turn = state.turn;
    gameEnded = !!state.winner;
    showGameScreen(); 
    renderBoard();
});

socket.on("opponentLeft", () => {
    gameEnded = true;
    alert("Qofkii kale waa uu baxay! Waxaad u guulaysatay si Technical ah.");
});

function startRandomMatch() {
    const nameInput = document.getElementById("nameInput");
    const name = nameInput ? nameInput.value.trim() : "";
    if (!name) return alert("Fadlan geli magacaaga");
    localStorage.setItem("shaxName", name);
    isSoloMode = false;
    socket.emit("findMatch", name);
}

function joinRoom() {
    const nameInput = document.getElementById("nameInput");
    const roomInput = document.getElementById("roomInput");
    const name = nameInput ? nameInput.value.trim() : "";
    const r = roomInput ? roomInput.value.trim() : "";
    if (!name || !r) return alert("Geli magaca iyo code-ka qolka");
    localStorage.setItem("shaxName", name);
    localStorage.setItem("shaxRoom", r);
    isSoloMode = false;
    socket.emit("joinRoom", { roomCode: r, playerName: name });
}
/ --- SPECTATOR FUNCTIONS ---

function watchLiveMatch() {
    const nameInput = document.getElementById("nameInput");
    const name = nameInput.value.trim() || "Daawade " + Math.floor(Math.random() * 1000);
    
    if (!socket || !socket.connected) {
        alert("Server-ka laguma xirna. Fadlan dib u cusboonaysii bogga.");
        return;
    }

    socket.emit("requestSpectate", name);
}

socket.on("spectateGame", (data) => {
    myColor = "spectator";
    roomCode = data.roomCode;
    
    showGameScreen();
    
    const turnText = document.getElementById("turnText");
    if (turnText) {
        turnText.innerText = `👀 Waxaad daawanaysaa: ${data.players}`;
        turnText.style.color = "#ffd60a";
    }
    
    const boardDiv = document.getElementById("board");
    if (boardDiv) {
        boardDiv.style.pointerEvents = "none"; 
        boardDiv.style.opacity = "0.9"; 
    }
});

socket.on("noGamesToWatch", () => {
    alert("Xilligan ma jiraan ciyaaro socda oo aad daawan karto.");
});
