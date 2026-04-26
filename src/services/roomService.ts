import { redis } from "../db/redis";

const ROOM_TTL_SECONDS = 86400;     // 24 hours
const AWAITING_BLUFF_TTL = 300;     // 5 minutes — clears stale bluff prompts
const ROOM_ID_LENGTH = 6;
const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/I/1

// ── Domain types ──────────────────────────────────────────────────────────────

export interface RoomPlayer {
  telegramId: string;
  firstName: string;
  username?: string;
  languageCode: string;
  secretCode?: string;
  hasBluffed?: boolean;
  eliminated?: boolean;
  consecutiveHonestCycles?: number; // defender told truth N times in a row
  swapPerkAvailable?: boolean;       // unlocked at every 4th honest cycle
}

export interface TurnEntry {
  attackerId: string;
  targetId: string;
}

export interface BluffRecord {
  blufferId: string;
  attackerId: string;   // who received the fake stats
  guess: string;
  realBulls: number;
  realCows: number;
  fakeBulls: number;
  fakeCows: number;
  committedOnTurn: number;
  penaltyOnTurn: number; // committedOnTurn + 3
  exposed: boolean;
}

export interface PendingGuess {
  roomId: string;
  attackerId: string;
  targetId: string;
  guess: string;
  realBulls: number;
  realCows: number;
}

export interface RoomData {
  roomId: string;
  hostId: string;
  status: "waiting" | "collecting_codes" | "playing" | "finished";
  players: RoomPlayer[];
  createdAt: number;
  turnOrder?: TurnEntry[];
  currentAttackerId?: string;
  turnNumber?: number;
  bluffQueue?: BluffRecord[];
}

// ── Result types ──────────────────────────────────────────────────────────────

export type JoinRoomError = "ROOM_NOT_FOUND" | "ROOM_NOT_WAITING" | "ALREADY_IN_ROOM";
export type JoinRoomResult =
  | { success: true; room: RoomData }
  | { success: false; reason: JoinRoomError };

export type SubmitCodeError =
  | "ROOM_NOT_FOUND"
  | "WRONG_STATE"
  | "PLAYER_NOT_IN_ROOM"
  | "CODE_ALREADY_SET";
export type SubmitCodeResult =
  | { success: true; allCollected: boolean; room: RoomData }
  | { success: false; reason: SubmitCodeError };

// ── Lua scripts ───────────────────────────────────────────────────────────────

// Atomically joins a player into a room.
// Returns: 1=ok  -1=not found  -2=not waiting  -3=already in room
const JOIN_ROOM_SCRIPT = `
local key   = KEYS[1]
local ttl   = tonumber(ARGV[1])
local pJson = ARGV[2]

local raw = redis.call('GET', key)
if not raw then return -1 end

local room = cjson.decode(raw)
if room.status ~= 'waiting' then return -2 end

local player = cjson.decode(pJson)
for _, p in ipairs(room.players) do
  if p.telegramId == player.telegramId then return -3 end
end

table.insert(room.players, player)
redis.call('SET', key, cjson.encode(room), 'EX', ttl)
return 1
`;

// Atomically stores a player's secret code.
// If all players have submitted, transitions to 'playing' and builds turn order.
// Returns: 1=accepted_waiting  2=all_collected
//          -1=not found  -2=wrong state  -3=not in room  -4=already set
const SUBMIT_CODE_SCRIPT = `
local key  = KEYS[1]
local tid  = ARGV[1]
local code = ARGV[2]

local raw = redis.call('GET', key)
if not raw then return -1 end

local room = cjson.decode(raw)
if room.status ~= 'collecting_codes' then return -2 end

local found = false
for i = 1, #room.players do
  if room.players[i].telegramId == tid then
    if room.players[i].secretCode then return -4 end
    room.players[i].secretCode = code
    found = true
    break
  end
end
if not found then return -3 end

local allReady = true
for _, p in ipairs(room.players) do
  if not p.secretCode then allReady = false; break end
end

if allReady then
  room.status = 'playing'
  local n = #room.players
  local order = {}
  for i = 1, n do
    local nextIdx = (i % n) + 1
    table.insert(order, {
      attackerId = room.players[i].telegramId,
      targetId   = room.players[nextIdx].telegramId
    })
  end
  room.turnOrder         = order
  room.currentAttackerId = room.players[1].telegramId
  room.turnNumber        = 0
end

redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
if allReady then return 2 else return 1 end
`;

// Atomically advances to the next turn and increments turnNumber.
// Returns: 1=ok  -1=not found  -2=no turn order
const ADVANCE_TURN_SCRIPT = `
local key = KEYS[1]

local raw = redis.call('GET', key)
if not raw then return -1 end

local room = cjson.decode(raw)
if not room.turnOrder then return -2 end

local n       = #room.turnOrder
local nextIdx = 1
for i = 1, n do
  if room.turnOrder[i].attackerId == room.currentAttackerId then
    nextIdx = (i % n) + 1
    break
  end
end

room.currentAttackerId = room.turnOrder[nextIdx].attackerId
room.turnNumber        = (room.turnNumber or 0) + 1

redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
return 1
`;

// Atomically appends a bluff record and marks the bluffer as hasBluffed.
// Returns: 1=ok  -1=not found
const RECORD_BLUFF_SCRIPT = `
local key       = KEYS[1]
local bluffJson = ARGV[1]
local blufferId = ARGV[2]

local raw = redis.call('GET', key)
if not raw then return -1 end

local room  = cjson.decode(raw)
local bluff = cjson.decode(bluffJson)

if not room.bluffQueue then room.bluffQueue = {} end
table.insert(room.bluffQueue, bluff)

for i = 1, #room.players do
  if room.players[i].telegramId == blufferId then
    room.players[i].hasBluffed = true
    break
  end
end

redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
return 1
`;

// Atomically updates room status, preserving TTL.
// Returns: 1=ok  -1=not found
const SET_STATUS_SCRIPT = `
local key    = KEYS[1]
local status = ARGV[1]

local raw = redis.call('GET', key)
if not raw then return -1 end

local room = cjson.decode(raw)
room.status = status
redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
return 1
`;

// ── Key helpers ───────────────────────────────────────────────────────────────

function roomKey(roomId: string): string {
  return `room:${roomId}`;
}
function playerRoomKey(telegramId: string): string {
  return `player:${telegramId}:room`;
}
function pendingGuessKey(roomId: string): string {
  return `pending_guess:${roomId}`;
}
function awaitingBluffKey(telegramId: string): string {
  return `awaiting_bluff:${telegramId}`;
}

function generateRoomId(): string {
  let id = "";
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return id;
}

// ── Player↔Room index ─────────────────────────────────────────────────────────

export async function setPlayerRoom(telegramId: string, roomId: string): Promise<void> {
  await redis.set(playerRoomKey(telegramId), roomId, "EX", ROOM_TTL_SECONDS);
}

export async function getPlayerRoom(telegramId: string): Promise<string | null> {
  return redis.get(playerRoomKey(telegramId));
}

export async function clearPlayerRoom(telegramId: string): Promise<void> {
  await redis.del(playerRoomKey(telegramId));
}

// ── Pending guess ─────────────────────────────────────────────────────────────

export async function setPendingGuess(
  roomId: string,
  guess: PendingGuess
): Promise<void> {
  await redis.set(
    pendingGuessKey(roomId),
    JSON.stringify(guess),
    "EX",
    ROOM_TTL_SECONDS
  );
}

export async function getPendingGuess(
  roomId: string
): Promise<PendingGuess | null> {
  const raw = await redis.get(pendingGuessKey(roomId));
  return raw ? (JSON.parse(raw) as PendingGuess) : null;
}

export async function clearPendingGuess(roomId: string): Promise<void> {
  await redis.del(pendingGuessKey(roomId));
}

// ── Awaiting-bluff input ──────────────────────────────────────────────────────

export async function setAwaitingBluff(
  telegramId: string,
  roomId: string
): Promise<void> {
  await redis.set(awaitingBluffKey(telegramId), roomId, "EX", AWAITING_BLUFF_TTL);
}

export async function getAwaitingBluff(
  telegramId: string
): Promise<string | null> {
  return redis.get(awaitingBluffKey(telegramId));
}

export async function clearAwaitingBluff(telegramId: string): Promise<void> {
  await redis.del(awaitingBluffKey(telegramId));
}

// ── Awaiting-swap input ───────────────────────────────────────────────────────

function awaitingSwapKey(telegramId: string): string {
  return `awaiting_swap:${telegramId}`;
}

export async function setAwaitingSwap(telegramId: string, roomId: string): Promise<void> {
  await redis.set(awaitingSwapKey(telegramId), roomId, "EX", AWAITING_BLUFF_TTL);
}

export async function getAwaitingSwap(telegramId: string): Promise<string | null> {
  return redis.get(awaitingSwapKey(telegramId));
}

export async function clearAwaitingSwap(telegramId: string): Promise<void> {
  await redis.del(awaitingSwapKey(telegramId));
}

// ── Room operations ───────────────────────────────────────────────────────────

export async function createRoom(host: RoomPlayer): Promise<string> {
  let roomId = "";
  let attempts = 0;

  do {
    if (attempts++ > 10)
      throw new Error("Failed to generate a unique room ID after 10 attempts");
    roomId = generateRoomId();
  } while (await redis.exists(roomKey(roomId)));

  const room: RoomData = {
    roomId,
    hostId: host.telegramId,
    status: "waiting",
    players: [host],
    createdAt: Date.now(),
  };

  await redis.set(roomKey(roomId), JSON.stringify(room), "EX", ROOM_TTL_SECONDS);
  await setPlayerRoom(host.telegramId, roomId);
  return roomId;
}

export async function joinRoom(
  roomId: string,
  player: RoomPlayer
): Promise<JoinRoomResult> {
  const code = (await redis.eval(
    JOIN_ROOM_SCRIPT,
    1,
    roomKey(roomId),
    String(ROOM_TTL_SECONDS),
    JSON.stringify(player)
  )) as number;

  if (code === -1) return { success: false, reason: "ROOM_NOT_FOUND" };
  if (code === -2) return { success: false, reason: "ROOM_NOT_WAITING" };
  if (code === -3) return { success: false, reason: "ALREADY_IN_ROOM" };

  await setPlayerRoom(player.telegramId, roomId);
  const room = await getRoom(roomId);
  return { success: true, room: room! };
}

export async function getRoom(roomId: string): Promise<RoomData | null> {
  const raw = await redis.get(roomKey(roomId));
  return raw ? (JSON.parse(raw) as RoomData) : null;
}

export async function setRoomStatus(
  roomId: string,
  status: RoomData["status"]
): Promise<boolean> {
  const code = (await redis.eval(
    SET_STATUS_SCRIPT,
    1,
    roomKey(roomId),
    status
  )) as number;
  return code === 1;
}

export async function submitSecretCode(
  roomId: string,
  telegramId: string,
  code: string
): Promise<SubmitCodeResult> {
  const result = (await redis.eval(
    SUBMIT_CODE_SCRIPT,
    1,
    roomKey(roomId),
    telegramId,
    code
  )) as number;

  if (result === -1) return { success: false, reason: "ROOM_NOT_FOUND" };
  if (result === -2) return { success: false, reason: "WRONG_STATE" };
  if (result === -3) return { success: false, reason: "PLAYER_NOT_IN_ROOM" };
  if (result === -4) return { success: false, reason: "CODE_ALREADY_SET" };

  const room = await getRoom(roomId);
  return { success: true, allCollected: result === 2, room: room! };
}

export async function advanceTurn(roomId: string): Promise<RoomData | null> {
  const code = (await redis.eval(
    ADVANCE_TURN_SCRIPT,
    1,
    roomKey(roomId)
  )) as number;
  if (code < 0) return null;
  return getRoom(roomId);
}

export async function recordBluff(
  roomId: string,
  bluff: BluffRecord
): Promise<void> {
  await redis.eval(
    RECORD_BLUFF_SCRIPT,
    1,
    roomKey(roomId),
    JSON.stringify(bluff),
    bluff.blufferId
  );
}

// ── Phase 6 Lua scripts ───────────────────────────────────────────────────────

// Eliminates a player: updates attacker's target to inherit the eliminated
// player's target, removes eliminated from turnOrder, marks eliminated=true,
// advances the turn, increments turnNumber.
// Returns: activeCount>=0  -1=not found  -2=no turn order  -3=eliminated not in order
const ELIMINATE_PLAYER_SCRIPT = `
local key          = KEYS[1]
local eliminatedId = ARGV[1]
local attackerId   = ARGV[2]

local raw = redis.call('GET', key)
if not raw then return -1 end

local room = cjson.decode(raw)
if not room.turnOrder then return -2 end

local eliminatedTarget = nil
for _, entry in ipairs(room.turnOrder) do
  if entry.attackerId == eliminatedId then
    eliminatedTarget = entry.targetId
    break
  end
end
if eliminatedTarget == nil then return -3 end

for i = 1, #room.turnOrder do
  if room.turnOrder[i].attackerId == attackerId then
    room.turnOrder[i].targetId = eliminatedTarget
    break
  end
end

local newOrder = {}
for _, entry in ipairs(room.turnOrder) do
  if entry.attackerId ~= eliminatedId then
    table.insert(newOrder, entry)
  end
end
room.turnOrder = newOrder

for i = 1, #room.players do
  if room.players[i].telegramId == eliminatedId then
    room.players[i].eliminated = true
    break
  end
end

local n = #room.turnOrder
if n > 0 then
  local nextIdx = 1
  for i = 1, n do
    if room.turnOrder[i].attackerId == room.currentAttackerId then
      nextIdx = (i % n) + 1
      break
    end
  end
  room.currentAttackerId = room.turnOrder[nextIdx].attackerId
end
room.turnNumber = (room.turnNumber or 0) + 1

redis.call('SET', key, cjson.encode(room), 'KEEPTTL')

local activeCount = 0
for _, p in ipairs(room.players) do
  if not p.eliminated then activeCount = activeCount + 1 end
end
return activeCount
`;

// Marks the first unexposed bluff entry for a given bluffer as exposed.
// Returns: 1=ok  -1=not found
const MARK_BLUFF_EXPOSED_SCRIPT = `
local key       = KEYS[1]
local blufferId = ARGV[1]

local raw = redis.call('GET', key)
if not raw then return -1 end

local room = cjson.decode(raw)
if not room.bluffQueue then return 0 end

for i = 1, #room.bluffQueue do
  if room.bluffQueue[i].blufferId == blufferId and not room.bluffQueue[i].exposed then
    room.bluffQueue[i].exposed = true
    break
  end
end

redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
return 1
`;

// ── Phase 6 functions ─────────────────────────────────────────────────────────

export async function eliminatePlayer(
  roomId: string,
  eliminatedId: string,
  attackerId: string
): Promise<number | null> {
  const result = (await redis.eval(
    ELIMINATE_PLAYER_SCRIPT,
    1,
    roomKey(roomId),
    eliminatedId,
    attackerId
  )) as number;
  if (result < 0) return null;
  return result;
}

export async function markBluffExposed(
  roomId: string,
  blufferId: string
): Promise<void> {
  await redis.eval(MARK_BLUFF_EXPOSED_SCRIPT, 1, roomKey(roomId), blufferId);
}

// ── Per-player lobby message IDs (separate keys, not in room JSON) ────────────
// Each player in a waiting room has their own lobby message that we edit live.

function lobbyMsgKey(roomId: string, telegramId: string): string {
  return `lobby_msg:${roomId}:${telegramId}`;
}

export async function setLobbyMessage(
  roomId: string,
  telegramId: string,
  messageId: number
): Promise<void> {
  await redis.set(lobbyMsgKey(roomId, telegramId), String(messageId), "EX", ROOM_TTL_SECONDS);
}

export async function getPlayerLobbyMessages(
  roomId: string,
  players: RoomPlayer[]
): Promise<Record<string, number>> {
  if (players.length === 0) return {};
  const pipeline = redis.pipeline();
  for (const p of players) pipeline.get(lobbyMsgKey(roomId, p.telegramId));
  const results = await pipeline.exec();
  const map: Record<string, number> = {};
  results?.forEach((res, i) => {
    const val = res[1] as string | null;
    if (val) map[players[i].telegramId] = Number(val);
  });
  return map;
}

export async function deleteLobbyMessage(
  roomId: string,
  telegramId: string
): Promise<void> {
  await redis.del(lobbyMsgKey(roomId, telegramId));
}

// ── Remove player from room ───────────────────────────────────────────────────
// Atomically removes a player from a waiting room.
// Host leaving dissolves the room (DEL).
// Returns: -1=not found  -2=wrong state  -3=not in room
//          0=dissolved (host left)  >=1=remaining player count
const REMOVE_PLAYER_SCRIPT = `
local key = KEYS[1]
local tid = ARGV[1]

local raw = redis.call('GET', key)
if not raw then return -1 end

local room = cjson.decode(raw)
if room.status ~= 'waiting' then return -2 end

local found = false
for _, p in ipairs(room.players) do
  if p.telegramId == tid then found = true; break end
end
if not found then return -3 end

if room.hostId == tid then
  redis.call('DEL', key)
  return 0
end

local newPlayers = {}
for _, p in ipairs(room.players) do
  if p.telegramId ~= tid then
    table.insert(newPlayers, p)
  end
end
room.players = newPlayers
redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
return #room.players
`;

export type RemovePlayerResult =
  | { type: "dissolved"; players: RoomPlayer[] }
  | { type: "removed"; room: RoomData }
  | { type: "error" };

export async function removePlayer(
  roomId: string,
  telegramId: string
): Promise<RemovePlayerResult> {
  const roomBefore = await getRoom(roomId);

  const code = (await redis.eval(
    REMOVE_PLAYER_SCRIPT,
    1,
    roomKey(roomId),
    telegramId
  )) as number;

  if (code < 0) return { type: "error" };
  if (code === 0) return { type: "dissolved", players: roomBefore?.players ?? [] };

  const updatedRoom = await getRoom(roomId);
  return updatedRoom ? { type: "removed", room: updatedRoom } : { type: "error" };
}

// ── Honest-perk Lua scripts ───────────────────────────────────────────────────

// Increments consecutiveHonestCycles for a player; sets swapPerkAvailable at
// every 4th honest cycle (4, 8, 12, …).  Returns the new count or -1/-2.
const INCREMENT_HONEST_CYCLES_SCRIPT = `
local key = KEYS[1]
local tid = ARGV[1]
local raw = redis.call('GET', key)
if not raw then return -1 end
local room = cjson.decode(raw)
for i = 1, #room.players do
  if room.players[i].telegramId == tid then
    local c = (room.players[i].consecutiveHonestCycles or 0) + 1
    room.players[i].consecutiveHonestCycles = c
    if c % 4 == 0 then room.players[i].swapPerkAvailable = true end
    redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
    return c
  end
end
return -2
`;

// Resets consecutiveHonestCycles and clears swapPerkAvailable (called on bluff).
const RESET_HONEST_CYCLES_SCRIPT = `
local key = KEYS[1]
local tid = ARGV[1]
local raw = redis.call('GET', key)
if not raw then return -1 end
local room = cjson.decode(raw)
for i = 1, #room.players do
  if room.players[i].telegramId == tid then
    room.players[i].consecutiveHonestCycles = 0
    room.players[i].swapPerkAvailable = false
    redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
    return 1
  end
end
return -2
`;

// Swaps two digit positions (1-based) in secretCode; clears swapPerkAvailable.
// Returns the new 4-char code, or empty string on error.
const SWAP_CODE_DIGITS_SCRIPT = `
local key  = KEYS[1]
local tid  = ARGV[1]
local p1   = tonumber(ARGV[2])
local p2   = tonumber(ARGV[3])
local raw  = redis.call('GET', key)
if not raw then return '' end
local room = cjson.decode(raw)
for i = 1, #room.players do
  if room.players[i].telegramId == tid then
    local code = room.players[i].secretCode
    if not code or #code ~= 4 then return '' end
    local chars = {}
    for j = 1, 4 do chars[j] = code:sub(j, j) end
    local tmp = chars[p1]; chars[p1] = chars[p2]; chars[p2] = tmp
    local newCode = table.concat(chars)
    room.players[i].secretCode      = newCode
    room.players[i].swapPerkAvailable = false
    redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
    return newCode
  end
end
return ''
`;

export async function incrementHonestCycles(
  roomId: string,
  telegramId: string
): Promise<number> {
  const result = (await redis.eval(
    INCREMENT_HONEST_CYCLES_SCRIPT, 1, roomKey(roomId), telegramId
  )) as number;
  return result > 0 ? result : 0;
}

export async function resetHonestCycles(
  roomId: string,
  telegramId: string
): Promise<void> {
  await redis.eval(RESET_HONEST_CYCLES_SCRIPT, 1, roomKey(roomId), telegramId);
}

export async function swapCodeDigits(
  roomId: string,
  telegramId: string,
  pos1: number,
  pos2: number
): Promise<string | null> {
  const result = (await redis.eval(
    SWAP_CODE_DIGITS_SCRIPT, 1, roomKey(roomId),
    telegramId, String(pos1), String(pos2)
  )) as string;
  return result.length === 4 ? result : null;
}

export async function cleanupRoom(
  roomId: string,
  players: RoomPlayer[]
): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.del(roomKey(roomId));
  pipeline.del(pendingGuessKey(roomId));
  for (const player of players) {
    pipeline.del(playerRoomKey(player.telegramId));
    pipeline.del(awaitingBluffKey(player.telegramId));
    pipeline.del(awaitingSwapKey(player.telegramId));
    pipeline.del(lobbyMsgKey(roomId, player.telegramId));
  }
  await pipeline.exec();
}
