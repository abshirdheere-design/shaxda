const socket = io();

let myColor = null, roomCode = null, board = Array(25).fill(null);
let phase = "placing", turn = null, selectedIndex = null;
let possibleMoves = [], gameEnded = false, activePiece = null;

// --- INITIAL LOAD ---
window.onload = () => {
    const savedRoom = localStorage.getItem("shaxRoom");
    const savedName = localStorage.getItem("shaxName");
    if (savedRoom && savedName) {
        socket.emit("joinRoom", { roomCode: savedRoom, playerName: savedName });
    }
};

// --- SOCKET EVENTS ---

socket.on("assignedColor", (color) => { 
    myColor = color; 
    const boardElement = document.getElementById("board");
    const turnText = document.getElementById("turnText");

    if (color === "spectator") {
        if (turnText) {
            turnText.innerText = "👀 Waxaad tahay Daawade (Spectator)";
            turnText.style.color = "#ffd60a";
        }
        if (boardElement) {
            boardElement.style.pointerEvents = "none"; 
            boardElement.style.opacity = "0.8"; 
        }
    } else {
        if (boardElement) {
            boardElement.style.pointerEvents = "auto";
            boardElement.style.opacity = "1";
        }
    }
});

socket.on("userCountUpdate", (count) => { 
    const el = document.getElementById("user-count");
    if (el) el.innerText = count; 
});

socket.on("waiting", (msg) => {
    showGameScreen();
    const txt = document.getElementById("turnText");
    if (txt) { 
        txt.innerText = "⏳ " + msg; 
        txt.style.color = "#f39c12"; 
    }
});

socket.on("matchFound", (data) => {
    roomCode = data.roomCode;
    localStorage.setItem("shaxRoom", roomCode);
    showGameScreen();
});

socket.on("gameState", (state) => {
    if (!state) return;
    board = state.board;
    phase = state.phase;
    turn = state.turn;
    activePiece = state.activePiece;
    gameEnded = !!state.winner;

    showGameScreen();
    updateUI(state);
    renderBoard();
});

socket.on("opponentLeft", () => {
    gameEnded = true;
    const turnText = document.getElementById("turnText");
    if (turnText) {
        turnText.innerText = "⚠️ Qofkii kale waa uu baxay!";
        turnText.style.color = "#e74c3c";
    }

    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const gameModal = document.getElementById("gameModal");

    if (modalTitle) modalTitle.innerText = "Ciyaartu way dhammaatay";
    if (modalBody) modalBody.innerText = "Saaxiibkaadii kale waa uu ka baxay ciyaarta. Waxaad u guulaysatay si Technical ah!";
    if (gameModal) gameModal.style.display = "flex";
});

// --- UI FUNCTIONS ---

function updateUI(state) {
    const turnText = document.getElementById("turnText");
    if (!turnText) return;

    if (state.winner) {
        if (state.winner === "draw") {
            turnText.innerText = "🤝 WAAB (BARBARO)!";
            turnText.style.color = "#3498db";
        } else {
            const winP = state.players.find(p => p.id === state.winner || p.color === state.winner);
            turnText.innerText = `🏆 GUUL! ${winP ? winP.name : "Ciyaaryahanka"} ayaa badiyay!`;
            turnText.style.color = "#f1c40f";
        }
    } else if (myColor !== "spectator") {
        const isMyTurn = (turn === socket.id);
        turnText.innerText = isMyTurn ? 
            (phase === "placing" ? "Turn-kaaga: Dhig" : "Turn-kaaga: Dhaqaaq") : 
            "Sug qofka kale...";
        turnText.style.color = isMyTurn ? "#2ecc71" : "#bdc3c7";
    }

    // Captured pieces
    const redLost = 12 - state.redPieces;
    const blueLost = 12 - state.bluePieces;
    const redCapDiv = document.getElementById("captured-red");
    const blueCapDiv = document.getElementById("captured-blue");
    if (redCapDiv) redCapDiv.innerHTML = "🔴".repeat(redLost);
    if (blueCapDiv) blueCapDiv.innerHTML = "🔵".repeat(blueLost);

    // Player displays
    state.players.forEach(p => {
        const el = document.getElementById(p.color === "red" ? "p1-display" : "p2-display");
        if (el) {
            el.innerText = `${p.color === "red" ? "🔴" : "🔵"} ${p.name} ${p.id === socket.id ? "(Adiga)" : ""}`;
            el.classList.toggle("active-turn", !state.winner && turn === p.id);
        }
    });
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
        if (activePiece === i) div.classList.add("active-piece-jump");
        div.onclick = () => handleCellClick(i);
        boardDiv.appendChild(div);
    });
}

// --- GAMEPLAY LOGIC ---

function handleCellClick(index) {
    if (gameEnded || myColor === "spectator" || turn !== socket.id) return;
    const rCode = roomCode || localStorage.getItem("shaxRoom");

    if (phase === "placing") {
        if (board[index] === null) {
            socket.emit("move", { roomCode: rCode, move: { type: "place", index } });
        }
    } else {
        if (activePiece !== null) {
            if (index === activePiece) {
                selectedIndex = index;
                possibleMoves = getMoves(index);
            } else if (selectedIndex === activePiece && possibleMoves.includes(index)) {
                sendMove(rCode, selectedIndex, index);
            }
        } else {
            if (board[index] === myColor) {
                selectedIndex = index;
                possibleMoves = getMoves(index);
            } else if (selectedIndex !== null && possibleMoves.includes(index)) {
                sendMove(rCode, selectedIndex, index);
            } else {
                resetSelection();
            }
        }
    }
    renderBoard();
}

function sendMove(room, from, to) {
    socket.emit("move", { roomCode: room, move: { type: "move", from, to } });
    resetSelection();
}

function resetSelection() { 
    selectedIndex = null; 
    possibleMoves = []; 
}

function getMoves(pos) {
    let list = [], r = Math.floor(pos/5), c = pos%5, dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    dirs.forEach(([dr, dc]) => {
        let nr = r+dr, nc = c+dc;
        if (nr>=0 && nr<5 && nc>=0 && nc<5 && board[nr*5+nc] === null) {
            list.push(nr*5+nc);
        }
    });
    return list;
}

// --- NAVIGATION & MODES ---

function showGameScreen() {
    const setup = document.getElementById("setup-area");
    const gui = document.getElementById("game-ui");
    if (setup) setup.style.display = "none";
    if (gui) gui.style.display = "block";
}

function startRandomMatch() {
    const nameInput = document.getElementById("nameInput");
    const name = nameInput ? nameInput.value.trim() : "";
    if (!name) return alert("Geli magaca");
    localStorage.setItem("shaxName", name);
    socket.emit("findMatch", name);
}

function joinRoom() {
    const nameInput = document.getElementById("nameInput");
    const roomInput = document.getElementById("roomInput");
    const name = nameInput ? nameInput.value.trim() : "";
    const r = roomInput ? roomInput.value.trim() : "";
    if (!name || !r) return alert("Geli macluumaadka");
    localStorage.setItem("shaxName", name);
    localStorage.setItem("shaxRoom", r);
    socket.emit("joinRoom", { roomCode: r, playerName: name });
}

// --- SPECTATOR FUNCTIONS ---

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