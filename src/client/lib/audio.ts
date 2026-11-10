/**
 * All effects are synthesized in the browser with the Web Audio API.
 * There is no audio file and no third-party sample. The tones are original
 * to this project and can be reused without a license or attribution.
 *
 * playBonk: a short square-wave "clown horn" (two falling blasts a fourth
 * apart) plus a sine thud, meant to read as a cartoon bonk.
 */

import { readPrefs } from "./storage";

let ctx: AudioContext | null = null;
let unlocked = false;

function context(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function unlockAudio() {
  const audio = context();
  if (audio.state === "suspended") void audio.resume();
  unlocked = true;
}

function allowed(): boolean {
  return unlocked && readPrefs().sound && context().state === "running";
}

function tone(type: OscillatorType, freq: number, at: number, duration: number, gainValue: number, endFreq = freq) {
  const audio = context();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(gainValue, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

export function playBonk() {
  if (!readPrefs().sound) return;
  unlockAudio();
  if (!allowed()) return;
  const at = context().currentTime;
  tone("square", 311, at, 0.16, 0.16, 240);
  tone("square", 233, at + 0.13, 0.26, 0.18, 160);
  tone("sine", 170, at, 0.14, 0.35, 55);
}

export function playTimer() {
  if (!readPrefs().sound) return;
  unlockAudio();
  if (!allowed()) return;
  const at = context().currentTime;
  tone("sine", 523, at, 0.16, 0.12, 392);
  tone("sine", 330, at + 0.14, 0.28, 0.14, 220);
}

export function playScore() {
  if (!readPrefs().sound) return;
  unlockAudio();
  if (!allowed()) return;
  const at = context().currentTime;
  tone("triangle", 523, at, 0.1, 0.08);
  tone("triangle", 659, at + 0.08, 0.14, 0.08);
}

export function vibrate(pattern: number | number[]) {
  if (!readPrefs().vibrate) return;
  navigator.vibrate?.(pattern);
}
