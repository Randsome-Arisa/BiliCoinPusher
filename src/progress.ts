import * as fs from "fs";
import { CONFIG } from "./config";

interface ProgressData {
  coinedBvids: string[];
  lastUpdated: string;
  totalCoined: number;
}

let _data: ProgressData | null = null;

function load(): ProgressData {
  if (_data) return _data;
  try {
    if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
      const raw = fs.readFileSync(CONFIG.PROGRESS_FILE, "utf-8");
      _data = JSON.parse(raw);
      return _data!;
    }
  } catch { /* file missing or corrupt, start fresh */ }
  _data = { coinedBvids: [], lastUpdated: new Date().toISOString(), totalCoined: 0 };
  return _data;
}

function save(): void {
  if (!_data) return;
  _data.lastUpdated = new Date().toISOString();
  _data.totalCoined = _data.coinedBvids.length;
  fs.writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(_data, null, 2), "utf-8");
}

export function isCoined(bvid: string): boolean {
  return load().coinedBvids.includes(bvid);
}

export function markCoined(bvid: string): void {
  const d = load();
  if (!d.coinedBvids.includes(bvid)) {
    d.coinedBvids.push(bvid);
    save();
  }
}

export function getCoinedCount(): number {
  return load().totalCoined;
}
