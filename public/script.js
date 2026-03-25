const socket = io();

// --- VARIABLES ---
let myColor = null, roomCode = null, board = Array(25).fill(null);
let phase = "placing", turn = null, selectedIndex = null;
let possibleMoves = [], gameEnded = false;

// Solo Mode States
let isSoloMode = false;
let soloTurn = "red"; // 'red' waa adiga, 'blue' waa Bot-ka
let redPiecesPlaced = 0, bluePiecesPlaced = 0;
let isCaptureState = false;

// --- INITIAL LOAD ---
window.onload = () => {
    const savedRoom = localStorage.getItem("shaxRoom");
    const savedName = localStorage.getItem("shaxName");
    if (savedRoom && savedName && !isSoloMode) {
        socket.emit("joinRoom", { roomCode: savedRoom, playerName: savedName });
    }
};

// --- KAN AAWAD U BAAHNAYD: START SOLO GAME ---
// Function-kan ayaa badhanka HTML-ka u yeerayaa
window.startSoloGame = function() {
    const nameInput = document.getElementById("nameInput");
    const name = nameInput ? nameInput.value.trim() : "Adiga";
    
    isSoloMode = true;
    gameEnded = false;
    board = Array(25).fill(null);
    phase = "placing";
    soloTurn = "red";
    myColor = "red";
    redPiecesPlaced = 0;
    bluePiecesPlaced = 0;
    isCaptureState = false;
    
    // Qari setup-ka, tus ciyaarta
    document.getElementById("setup-area").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    
    document.getElementById("p1-display").innerText = "🔴 " + name;
    document.getElementById("p2-display").innerText = "🔵 Robot (Bot)";
    
    updateSoloUI();
    renderBoard();
};

// --- UI UPDATES ---
function updateSoloUI() {
    const turnText = document.getElementById("turnText");
    if (gameEnded) return;

    if (isCaptureState) {
        turnText.innerText = soloTurn === "red" ? "🎯 DOORO DHIBIC AAD KA QAADDO!" : "🤖 Robot-ka ayaa dhibic kaa qaaday!";
        turnText.style.color = "#f1c40f";
    } else {
        if (soloTurn === "red") {
            turnText.innerText = phase === "placing" ? "Turn-kaaga: Dhig" : "Turn-kaaga: Dhaqaaq";
            turnText.style.color = "#2ecc71";
        } else {
            turnText.innerText = "Robot-ka ayaa fakaraya...";
            turnText.style.color = "#f39c12";
        }
    }
}

// --- CORE GAMEPLAY ---
function handleCellClick(index) {
    if (gameEnded || myColor === "spectator") return;

    if (isSoloMode) {
        if (isCaptureState) {
            if (soloTurn === "red" && board[index] === "blue") {
                board[index] = null;
                isCaptureState = false;
                playSound("capture");
                soloTurn = "blue";
                updateSoloUI();
                renderBoard();
                setTimeout(botMove, 800);
            }
            return;
        }

        if (soloTurn !== "red") return;

        if (phase === "placing") {
            if (board[index] === null && redPiecesPlaced < 12) {
                board[index] = "red";
                redPiecesPlaced++;
                playSound("move");
                if (checkCapture(index, "red")) {
                    isCaptureState = true;
                } else {
                    soloTurn = "blue";
                    setTimeout(botMove, 1000);
                }
                checkSoloPhaseTransition();
            }
        } else {
            if (board[index] === "red") {
                selectedIndex = index;
                possibleMoves = getMoves(index);
            } else if (selectedIndex !== null && possibleMoves.includes(index)) {
                board[selectedIndex] = null;
                board[index] = "red";
                playSound("move");
                if (checkCapture(index, "red")) {
                    isCaptureState = true;
                } else {
                    soloTurn = "blue";
                    setTimeout(botMove, 1000);
                }
                selectedIndex = null;
                possibleMoves = [];
            }
        }
        updateSoloUI();
        renderBoard();
        return;
    }

    // MULTIPLAYER LOGIC
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
            selectedIndex = null;
            possibleMoves = [];
        }
    }
    renderBoard();
}

// --- BOT AI ---
function botMove() {
    if (!isSoloMode || gameEnded || isCaptureState) return;

    let moveMade = false;
    let moveIndex = -1;

    if (phase === "placing") {
        let available = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (available.length > 0) {
            moveIndex = available[Math.floor(Math.random() * available.length)];
            board[moveIndex] = "blue";
            bluePiecesPlaced++;
            moveMade = true;
        }
    } else {
        let botPieces = board.map((v, i) => v === "blue" ? i : null).filter(v => v !== null);
        for (let p of botPieces) {
            let moves = getMoves(p);
            if (moves.length > 0) {
                moveIndex = moves[Math.floor(Math.random() * moves.length)];
                board[p] = null;
                board[moveIndex] = "blue";
                moveMade = true;
                break;
            }
        }
    }

    if (moveMade) {
        playSound("move");
        if (checkCapture(moveIndex, "blue")) {
            let playerPieces = board.map((v, i) => v === "red" ? i : null).filter(v => v !== null);
            if (playerPieces.length > 0) {
                let toRemove = playerPieces[Math.floor(Math.random() * playerPieces.length)];
                board[toRemove] = null;
                playSound("capture");
            }
        }
        checkSoloPhaseTransition();
        soloTurn = "red";
        updateSoloUI();
        renderBoard();
    }
}

// --- UTILS ---
function checkCapture(index, color) {
    const row = Math.floor(index / 5);
    const col = index % 5;
    
    let rowMatch = 0;
    for (let i = row * 5; i < (row * 5) + 5; i++) {
        if (board[i] === color) { rowMatch++; if (rowMatch === 3) return true; }
        else rowMatch = 0;
    }

    let colMatch = 0;
    for (let i = col; i < 25; i += 5) {
        if (board[i] === color) { colMatch++; if (colMatch === 3) return true; }
        else colMatch = 0;
    }
    return false;
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

function checkSoloPhaseTransition() {
    if (redPiecesPlaced === 12 && bluePiecesPlaced === 12) phase = "moving";
}

function playSound(type) {
    const id = (type === "move") ? "moveSound" : "captureSound";
    const s = document.getElementById(id);
    if (s) s.play().catch(() => {});
}

// --- MULTIPLAYER NAV ---
window.startRandomMatch = function() {
    isSoloMode = false;
    const name = document.getElementById("nameInput").value.trim();
    if (!name) return alert("Geli magaca");
    localStorage.setItem("shaxName", name);
    socket.emit("findMatch", name);
};

window.leaveGame = function() {
    if(confirm("Ma hubtaa inaad ka baxayso?")) {
        localStorage.removeItem("shaxRoom");
        location.reload();
    }
};
