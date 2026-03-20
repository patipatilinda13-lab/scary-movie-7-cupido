// Cupido: Signaling Server para WebRTC P2P - ScaryMovie7
// ✅ VERSÃO COM: join_accepted + host_disconnected + cleanup melhorado
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
                    
                    // 🔥 NOVO: Notificar CLIENT que foi aceito e conectado
                    console.log(`[CLIENT] Enviando confirmação ao CLIENT ${msg.id}`);
                    ws.send(JSON.stringify({ 
                        type: "join_accepted",
                        hostId: room.hostWs.peerId,
                        room: msg.room
                    }));
                    
                    // Notificar HOST sobre novo peer (HOST deve criar offer)
                    console.log(`[HOST] Notificando HOST ${room.hostWs.peerId} sobre novo peer ${msg.id}`);
                    room.hostWs.send(JSON.stringify({ 
                        type: "peer_joined", 
                        id: msg.id,
                        room: msg.room
                    }));
                } else {
                    console.log(`[ERROR] Sala ${msg.room} não encontrada ou sem host!`);
                    // Notificar CLIENT do erro
                    ws.send(JSON.stringify({
                        type: "join_error",
                        error: "Room not found or no host"
                    }));
                }
            }
            // ===== LÓGICA 3: SIGNALING (OFFER/ANSWER/CANDIDATE) =====
            else if (msg.type === "offer" || msg.type === "answer" || msg.type === "candidate") {
                // Usamos msg.id porque é o que o seu Godot envia como destino
                const targetId = msg.id; 
                console.log(`[SIGNALING] ${msg.type.toUpperCase()} para peer ${targetId}`);
                
                const targetWs = peers.get(targetId);
                if (targetWs) {
                    // O SEGREDO: Antes de enviar, trocamos o ID pelo de quem ENVIOU (ws.peerId)
                    // Assim, o destinatário sabe quem é o remetente para poder responder.
                    const msgParaEnviar = JSON.stringify({
                        ...msg,
                        id: ws.peerId // Sobrescrevemos com o ID de quem está a enviar agora
                    });
                    
                    // 👈 CORREÇÃO: Logs detalhados para debugging
                    const dataSize = msg.data ? msg.data.length : 0;
                    console.log(`[RELAY] ✅ Retransmitindo ${msg.type} na sala ${msg.room} do peer ${ws.peerId} para ${targetId} (${dataSize} bytes)`);
                    targetWs.send(msgParaEnviar);
                } else {
                    console.log(`[ERROR] ❌ Peer destino ${targetId} não encontrado! Peers disponíveis: ${Array.from(peers.keys()).join(", ")}`);
                }
            } else {
                console.log(`[CUPIDO] Mensagem desconhecida: ${msg.type}`);
            }
        } catch (error) {
            console.error(`[ERROR] Erro ao processar mensagem: ${error.message}`);
        }
    });

    ws.on('close', () => {
        console.log(`[CUPIDO] ❌ Conexão fechada. Total agora: ${wss.clients.size}`);
        
        // O SEGREDO: Só apaga o ID da lista se quem estiver morrendo for o dono ATUAL da conexão!
        if (ws.peerId && peers.get(ws.peerId) === ws) {
            peers.delete(ws.peerId);
            console.log(`[CUPIDO] ✓ Peer ${ws.peerId} removido do mapa global (era o dono)`);
        } else if (ws.peerId) {
            console.log(`[CUPIDO] ⚠️ Tentativa de apagar peer ${ws.peerId}, mas já foi substituído por outro (fantasma ignorado)`);
        }
        
        // Se era host, remover a sala também
        if (ws.isHost && ws.roomId) {
            const room = rooms.get(ws.roomId);
            const clientsEmSala = room ? room.peersMap.size : 0;
            console.log(`[CUPIDO] 🔥 HOST ${ws.peerId} desconectou. Clientes em sala: ${clientsEmSala}`);
            
            // Remover sala imediatamente
            rooms.delete(ws.roomId);
            console.log(`[CUPIDO] ✓ Sala ${ws.roomId} foi destruída (host saiu)`);
            
            // Notificar todos os clientes que sala foi encerrada
            if (room) {
                room.peersMap.forEach((clientWs, clientId) => {
                    if (clientWs.readyState === 1) { // WebSocket.OPEN
                        clientWs.send(JSON.stringify({
                            type: "host_disconnected",
                            room: ws.roomId
                        }));
                        console.log(`[CUPIDO] ✓ Cliente ${clientId} notificado: host desconectou`);
                    }
                });
            }
        } else if (ws.roomId) {
            // Se era cliente, notificar host que saiu
            const room = rooms.get(ws.roomId);
            if (room && room.hostWs && room.hostWs.readyState === 1) { // WebSocket.OPEN
                room.hostWs.send(JSON.stringify({
                    type: "peer_left",
                    id: ws.peerId
                }));
                console.log(`[CUPIDO] ✓ HOST notificado: cliente ${ws.peerId} saiu`);
            }
            room?.peersMap.delete(ws.peerId);
        }
    });
});

// 🔥 CRÍTICO: Fazer o servidor escutar na porta!
const PORT = process.env.PORT || 3000;
console.log(`[SERVIDOR] ✅ Cupido Signaling Server rodando na porta ${PORT}`);
console.log(`[SERVIDOR] ✅ Aguardando conexões WebSocket...`);