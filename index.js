const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: process.env.PORT || 3000 });
const rooms = new Map(); // Salas: { roomId => { hostWs, peersMap } }
const peers = new Map(); // Mapeia cada peer (ID => WebSocket)

console.log("Cupido ScaryMovie7 online!");

wss.on('connection', (ws) => {
    console.log(`[CUPIDO] Nova conexão! Total: ${wss.clients.size}`);
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log(`[CUPIDO] Mensagem recebida: type=${msg.type}, id=${msg.id}, room=${msg.room}`);

            // ===== LÓGICA 1: HOST CRIANDO SALA =====
            if (msg.type === "host") {
                console.log(`[HOST] Sala ${msg.room} criada por Host ID ${msg.id}`);
                
                // Armazenar o host com seu ID
                peers.set(msg.id, ws);
                ws.peerId = msg.id;
                ws.isHost = true;
                ws.roomId = msg.room;
                
                // Criar mapa de peers para esta sala
                if (!rooms.has(msg.room)) {
                    rooms.set(msg.room, { hostWs: ws, peersMap: new Map() });
                }
                rooms.get(msg.room).peersMap.set(msg.id, ws);
                
                console.log(`[HOST] Host ${msg.id} aguardando clientes...`);
            } 
            // ===== LÓGICA 2: CLIENTE ENTRANDO =====
            else if (msg.type === "join") {
                console.log(`[CLIENT] Peer ${msg.id} quer entrar na sala ${msg.room}`);
                
                const room = rooms.get(msg.room);
                if (room && room.hostWs) {
                    // Armazenar o cliente com seu ID
                    peers.set(msg.id, ws);
                    ws.peerId = msg.id;
                    ws.isHost = false;
                    ws.roomId = msg.room;
                    room.peersMap.set(msg.id, ws);
                    
                    // Notificar HOST sobre novo peer
                    console.log(`[CLIENT] Notificando HOST sobre novo peer ${msg.id}`);
                    room.hostWs.send(JSON.stringify({ 
                        type: "peer_joined", 
                        id: msg.id 
                    }));
                } else {
                    console.log(`[ERROR] Sala ${msg.room} não encontrada ou sem host!`);
                }
            }
            // ===== LÓGICA 3: SIGNALING (OFFER/ANSWER/CANDIDATE) =====
            else if (msg.type === "offer" || msg.type === "answer" || msg.type === "candidate") {
                console.log(`[SIGNALING] ${msg.type.toUpperCase()} de peer ${msg.id} para peer ${msg.targetId}`);
                
                // Encontrar o peer de destino
                const targetWs = peers.get(msg.targetId);
                if (targetWs) {
                    console.log(`[SIGNALING] Enviando ${msg.type} para peer ${msg.targetId}`);
                    targetWs.send(JSON.stringify(msg));
                } else {
                    console.log(`[ERROR] Peer destino ${msg.targetId} não encontrado!`);
                }
            } else {
                console.log(`[CUPIDO] Mensagem desconhecida: ${msg.type}`);
            }
        } catch (error) {
            console.error(`[ERROR] Erro ao processar mensagem: ${error.message}`);
        }
    });

    ws.on('close', () => {
        console.log(`[CUPIDO] Conexão fechada. Total agora: ${wss.clients.size}`);
        
        // Remover peer do mapa global
        if (ws.peerId) {
            peers.delete(ws.peerId);
            console.log(`[CUPIDO] Peer ${ws.peerId} removido`);
        }
        
        // Se era host, remover a sala também
        if (ws.isHost && ws.roomId) {
            rooms.delete(ws.roomId);
            console.log(`[CUPIDO] Sala ${ws.roomId} destruída (host saiu)`);
        } else if (ws.roomId) {
            // Se era cliente, notificar host que saiu
            const room = rooms.get(ws.roomId);
            if (room && room.hostWs) {
                room.hostWs.send(JSON.stringify({
                    type: "peer_left",
                    id: ws.peerId
                }));
            }
            room?.peersMap.delete(ws.peerId);
        }
    });
});