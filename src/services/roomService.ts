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
}

export interface RoomData {
  roomId: string;
  hostId: string;
  status: "waiting" | "playing" | "finished";
  players: RoomPlayer[];
  createdAt: number;
}

export type JoinRoomError = "ROOM_NOT_FOUND" | "ROOM_NOT_WAITING" | "ALREADY_IN_ROOM";
export type JoinRoomResult =
  | { success: true; room: RoomData }
  | { success: false; reason: JoinRoomError };

// Atomically joins a player into a room.
// Returns:  1 = success, -1 = not found, -2 = not waiting, -3 = already in room
const JOIN_ROOM_SCRIPT = `
local key    = KEYS[1]
local ttl    = tonumber(ARGV[1])
local pJson  = ARGV[2]

local raw = redis.call('GET', key)
if not raw then return -1 end

local room   = cjson.decode(raw)
if room.status ~= 'waiting' then return -2 end

local player = cjson.decode(pJson)
for _, p in ipairs(room.players) do
  if p.telegramId == player.telegramId then return -3 end
end

table.insert(room.players, player)
redis.call('SET', key, cjson.encode(room), 'EX', ttl)
return 1
`;

// Atomically updates status, preserving the existing TTL.
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

function roomKey(roomId: string): string {
  return `room:${roomId}`;
}

function generateRoomId(): string {
  let id = "";
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return id;
}

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
  return roomId;
}

export async function joinRoom(roomId: string, player: RoomPlayer): Promise<JoinRoomResult> {
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

  // Re-fetch after write so we return the authoritative state
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
