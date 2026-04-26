import { redis } from "../db/redis";

const ROOM_TTL_SECONDS = 86400; // 24 hours
const ROOM_ID_LENGTH = 6;
// Omit ambiguous characters: 0, O, I, 1
const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface RoomPlayer {
  telegramId: string; // stored as string — BigInt is not JSON-serializable
  firstName: string;
  username?: string;
  languageCode: string;
  secretCode?: string; // set during collecting_codes phase
}

export interface TurnEntry {
  attackerId: string;
  targetId: string;
}

export interface RoomData {
  roomId: string;
  hostId: string;
  status: "waiting" | "collecting_codes" | "playing" | "finished";
  players: RoomPlayer[];
  createdAt: number;
  // Populated once all codes are submitted
  turnOrder?: TurnEntry[];
  currentAttackerId?: string;
}

// ── Result types ─────────────────────────────────────────────────────────────

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
//          -1=not found  -2=wrong state  -3=player not in room  -4=already set
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
  if not p.secretCode then
    allReady = false
    break
  end
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
  room.turnOrder          = order
  room.currentAttackerId  = room.players[1].telegramId
end

redis.call('SET', key, cjson.encode(room), 'KEEPTTL')
if allReady then return 2 else return 1 end
`;

// Atomically updates room status, preserving the existing TTL.
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

// ── Room operations ───────────────────────────────────────────────────────────

export async function createRoom(host: RoomPlayer): Promise<string> {
  let roomId = "";
  let attempts = 0;

  do {
    if (attempts++ > 10) throw new Error("Failed to generate a unique room ID after 10 attempts");
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
  if (!raw) return null;
  return JSON.parse(raw) as RoomData;
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
