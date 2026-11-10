/**
 * Seams for later, not used by the match itself.
 *
 * Voice: drop in a WebRTC/SFU bridge that maps a game code to a media room.
 * The game server would stay authoritative for turns, scores, and the pile.
 *
 * Matchmaking: a queue for people who are not in the same physical room.
 * Hosts still create private rooms today; nothing here is called.
 */
export interface VoiceBridge {
  ensureRoom(code: string): Promise<{ roomId: string }>;
}

export interface Matchmaker {
  enqueue(request: { playerId: string; cardLang: "pt-BR" | "en" }): Promise<{ code: string } | null>;
}
