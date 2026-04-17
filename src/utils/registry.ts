import { EventEmitter } from "events";

const registry = new Map<string, EventEmitter>();

export function register(mapId: string): EventEmitter {
  const emitter = new EventEmitter();
  registry.set(mapId, emitter);
  return emitter;
}

export function get(mapId: string): EventEmitter | undefined {
  return registry.get(mapId);
}

export function remove(mapId: string): void {
  registry.delete(mapId);
}
