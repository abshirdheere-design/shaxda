const express = require('express');
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Tani waa xariiqda muhiimka ah ee dadka tusaysa index.html
app.use(express.static(path.join(__dirname, "public")));

let rooms = {};
let onlineUsers = 0;
let waitingPlayer = null;

io.on("connection", (socket) => {
    onlineUsers++;
    io.emit("userCountUpdate", onlineUsers);

    // --- 1. DAAWASHO (SPECTATOR MODE) ---
    socket.on("requestSpectate", (name) => {
        let roomToWatch = null;
        for (const code in rooms) {
            if (rooms[code].players.length === 2 && !rooms[code].winner) {
                roomToWatch = code;
                break;
            }
        }

        if (roomToWatch) {
            socket.join(roomToWatch);
            socket.emit("spectateGame", { 
                roomCode: roomToWatch, 
                players: `${rooms[roomToWatch].players[0].name} vs ${rooms[roomToWatch].players[1].name}`
            });
            socket.emit("assignedColor", "spectator");
            socket.emit("gameState", rooms[roomToWatch]);
        } else {
            socket.emit("noGamesToWatch");
        }
    });

    // --- 2. RAADI CIYAAR (MATCHMAKING) ---
    socket.on("findMatch", (name) => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const roomCode = "Match_" + Math.floor(Math.random() * 10000);
            rooms[roomCode] = createRoomObject(roomCode);
            
            const p1 = waitingPlayer;
            const p2 = { id: socket.id, name: name };

            rooms[roomCode].players.push({ id: p1.id, name: p1.name, color: "red" });
            rooms[roomCode].players.push({ id: p2.id, name: p2.name, color: "blue" });

            socket.join(roomCode);
            const s1 = io.sockets.sockets.get(p1.id);
            if (s1) s1.join(roomCode);

            io.to(p1.id).emit("assignedColor", "red");
            io.to(p2.id).emit("assignedColor", "blue");

            rooms[roomCode].turn = p1.id;
            io.to(roomCode).emit("matchFound", { roomCode, players: rooms[roomCode].players });
            sendState(roomCode);
            waitingPlayer = null;
        } else {
            waitingPlayer = { id: socket.id, name: name };
            socket.emit("waiting", "Raadinaya ciyaaryahan kale...");
        }
    });

    socket.on("joinRoom", ({ roomCode, playerName }) => {
        if (!rooms[roomCode]) rooms[roomCode] = createRoomObject(roomCode);
        const room = rooms[roomCode];
        
        if (room.players.length >= 2) {
            socket.join(roomCode);
            socket.emit("assignedColor", "spectator");
            socket.emit("gameState", room);
            return;
        }

        if (!room.players.find(p => p.id === socket.id)) {
            const color = room.players.length === 0 ? "red" : "blue";
            room.players.push({ id: socket.id, name: playerName, color: color });
            socket.join(roomCode);
            socket.emit("assignedColor", color);
            if (room.players.length === 1) room.turn = socket.id;
        }
        sendState(roomCode);
    });

    socket.on("move", ({ roomCode, move }) => {
        const room = rooms[roomCode];
        if (!room || room.winner || room.turn !== socket.id) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (room.phase === "placing") handlePlacing(room, player, move);
        else handleMoving(room, player, move);
        sendState(roomCode);
    });

    socket.on("disconnect", () => {
        onlineUsers = Math.max(0, onlineUsers - 1);
        io.emit("userCountUpdate", onlineUsers);

        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }

        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const isPlayer = room.players.some(p => p.id === socket.id);
            if (isPlayer) {
                socket.to(roomCode).emit("opponentLeft");
                delete rooms[roomCode];
                break; 
            }
        }
    });
});

// --- GAME LOGIC FUNCTIONS ---
function createRoomObject(roomCode) {
    return {
        id: roomCode, players: [], board: Array(25).fill(null),
        turn: null, phase: "placing", redPlaced: 0, bluePlaced: 0,
        redPieces: 12, bluePieces: 12, placeStreak: 0, winner: null, 
        activePiece: null, moveCount: 0, lastCaptureMove: 0
    };
}

function handlePlacing(room, player, move) {
    if (move.type !== "place" || room.board[move.index] !== null) return;
    room.board[move.index] = player.color;
    if (player.color === "red") room.redPlaced++; else room.bluePlaced++;
    room.placeStreak++;
    
    if (room.redPlaced === 12 && room.bluePlaced === 12) {
        room.phase = "moving";
        room.placeStreak = 0;
        switchTurn(room);
    } else if (room.placeStreak >= 2) {
        room.placeStreak = 0;
        switchTurn(room);
    }
}

function handleMoving(room, player, move) {
    if (move.type !== "move") return;
    const { from, to } = move;
    if (room.activePiece !== null && room.activePiece !== from) return;
    if (room.board[from] !== player.color || room.board[to] !== null) return;

    const r1 = Math.floor(from / 5), c1 = from % 5;
    const r2 = Math.floor(to / 5), c2 = to % 5;
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return;

    room.board[from] = null;
    room.board[to] = player.color;
    const captured = captureAround(room, to, player.color);

    room.moveCount++;
    if (captured) room.lastCaptureMove = room.moveCount;

    if (room.moveCount - room.lastCaptureMove >= 40) {
        room.winner = "draw";
        return;
    }

    if (captured && canStillCapture(room, to, player.color)) {
        room.activePiece = to;
    } else {
        room.activePiece = null;
        if (checkWin(room, player.color)) return;
        switchTurn(room);
    }
}

function captureAround(room, pos, color) {
    const enemy = color === "red" ? "blue" : "red";
    const r = Math.floor(pos/5), c = pos%5;
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    let captured = false;
    for (let [dr, dc] of dirs) {
        const mIdx = (r+dr)*5 + (c+dc), eIdx = (r+2*dr)*5 + (c+2*dc);
        if (r+2*dr>=0 && r+2*dr<5 && c+2*dc>=0 && c+2*dc<5) {
            if (room.board[mIdx] === enemy && room.board[eIdx] === color) {
                room.board[mIdx] = null;
                if (enemy === "red") room.redPieces--; else room.bluePieces--;
                captured = true;
            }
        }
    }
    return captured;
}

function canStillCapture(room, pos, color) {
    const r = Math.floor(pos/5), c = pos%5, dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (let [dr, dc] of dirs) {
        const tIdx = (r+dr)*5 + (c+dc);
        if (r+dr>=0 && r+dr<5 && c+dc>=0 && c+dc<5 && room.board[tIdx] === null) {
            if (wouldCapture(room, tIdx, color)) return true;
        }
    }
    return false;
}

function wouldCapture(room, targetIdx, color) {
    const enemy = color === "red" ? "blue" : "red";
    const r = Math.floor(targetIdx/5), c = targetIdx%5, dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (let [dr, dc] of dirs) {
        const mIdx = (r+dr)*5 + (c+dc), eIdx = (r+2*dr)*5 + (c+2*dc);
        if (r+2*dr>=0 && r+2*dr<5 && c+2*dc>=0 && c+2*dc<5) {
            if (room.board[mIdx] === enemy && room.board[eIdx] === color) return true;
        }
    }
    return false;
}

function checkWin(room, color) {
    const enemy = color === "red" ? "blue" : "red";
    const count = enemy === "red" ? room.redPieces : room.bluePieces;
    if (count <= 1) {
        room.winner = room.players.find(p => p.color === color).id;
        return true;
    }
    return false;
}

function switchTurn(room) {
    if (room.players.length < 2) return;
    const currIdx = room.players.findIndex(p => p.id === room.turn);
    const nextPlayer = room.players[(currIdx + 1) % 2];
    if (room.phase === "moving" && !hasAvailableMoves(room, nextPlayer.color)) {
        room.winner = room.turn;
        return;
    }
    room.turn = nextPlayer.id;
}

function hasAvailableMoves(room, color) {
    for (let i = 0; i < 25; i++) {
        if (room.board[i] === color) {
            const r = Math.floor(i/5), c = i%5, dirs = [[0,1],[0,-1],[1,0],[-1,0]];
            for (let [dr, dc] of dirs) {
                const nr = r+dr, nc = c+dc;
                if (nr>=0 && nr<5 && nc>=0 && nc<5 && room.board[nr*5+nc] === null) return true;
            }
        }
    }
    return false;
}

function sendState(roomCode) {
    const room = rooms[roomCode];
    if (room) io.to(roomCode).emit("gameState", room);
}

// Render wuxuu u baahan yahay process.env.PORT si uu u shaqeeyo
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server-ku wuxuu ka shaqaynayaa Port: ${PORT}`);
});